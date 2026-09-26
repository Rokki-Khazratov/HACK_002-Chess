"""Build a classical top-300 snapshot from FIDE's September 2026 list.

Run `python3 scripts/build_ratings.py` from the repository root. Photo fetching is
opt-in (`--photos`); images come from public FIDE profiles and are resized.
"""

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import io
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import zipfile

from PIL import Image
try:
    import pycountry
except ImportError:
    pycountry = None


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "frontend/public"
PHOTO_DIR = PUBLIC / "player-photos"


def read_archive(month, flags):
    archive_path = ROOT / f"data/raw/standard_{month}26frl.zip"
    with zipfile.ZipFile(archive_path) as archive, archive.open(archive.namelist()[0]) as source:
        header = source.readline().decode("utf-8-sig")
        starts = [(name, header.index(name)) for name in
                  ("ID Number", "Name", "Fed", "Sex", "Tit", "WTit", "OTit", "FOA", month.upper() + "26", "Gms", "K", "B-day", "Flag")]
        rows = []
        for raw in source:
            line = raw.decode("latin1")
            fields = {name: line[start:starts[i + 1][1] if i + 1 < len(starts) else None].strip()
                      for i, (name, start) in enumerate(starts)}
            if not fields[month.upper() + "26"].isdigit():
                continue
            rating = int(fields[month.upper() + "26"])
            if rating < 1800:
                continue
            rows.append({"fideId": int(fields["ID Number"]), "name": fields["Name"],
                         "federation": fields["Fed"], "flag": flags.get(fields["Fed"]), "rating": rating,
                         "birthYear": int(fields["B-day"]) if fields["B-day"].isdigit() else None,
                         "title": fields["Tit"] or fields["WTit"] or None,
                         "games": int(fields["Gms"]) if fields["Gms"].isdigit() else 0,
                         "inactive": "i" in fields["Flag"].lower()})
    rows.sort(key=lambda row: (-row["rating"], row["name"]))
    active = [row for row in rows if not row["inactive"]]
    for rank, row in enumerate(active, 1):
        row["rank"] = rank
    return active


def rankings():
    with sqlite3.connect(ROOT / "data/library.sqlite") as db:
        flags = dict(db.execute("SELECT code,flag FROM federations"))
    if pycountry:
        flags.update({country.alpha_3: country.flag for country in pycountry.countries
                      if hasattr(country, "alpha_3") and hasattr(country, "flag")})
        for fide, iso in {"NED": "NLD", "GER": "DEU", "SUI": "CHE", "IRI": "IRN",
                          "VIE": "VNM", "BUL": "BGR", "SLO": "SVN", "GRE": "GRC"}.items():
            record = pycountry.countries.get(alpha_3=iso)
            if record:
                flags[fide] = record.flag
    flags.update({"ENG": "🏴", "SCO": "🏴", "WLS": "🏴", "FID": "🏳️"})
    flags["RUS"] = "🏳️"
    january = {row["fideId"]: row for row in read_archive("jan", flags)}
    february = {row["fideId"]: row for row in read_archive("feb", flags)}
    # FIDE's headline ranking uses active players; exclude flagged inactive records.
    active = read_archive("sep", flags)[:300]
    for row in active:
        first = january.get(row["fideId"])
        second = february.get(row["fideId"])
        row["ytdChange"] = row["rating"] - first["rating"] if first else None
        row["rankChange"] = first["rank"] - row["rank"] if first else None
        row["trend"] = [first["rating"] if first else None,
                        second["rating"] if second else None, row["rating"]]
    return active


def fetch_photo(fide_id):
    path = PHOTO_DIR / f"{fide_id}.webp"
    if path.exists():
        return True
    try:
        html = subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                               "--max-time", "25", f"https://ratings.fide.com/profile/{fide_id}"],
                              check=True, capture_output=True).stdout.decode("utf-8", errors="replace")
        match = re.search(r'<img[^>]*class="profile-top__photo"[^>]*src="data:image/[^;]+;base64,([^\"]+)', html)
        if not match:
            return False
        image = Image.open(io.BytesIO(base64.b64decode(match.group(1))))
        image.thumbnail((160, 160))
        portrait = io.BytesIO()
        image.convert("RGB").save(portrait, "WEBP", quality=78)
        if len(portrait.getvalue()) < 400:  # FIDE's empty white placeholder
            return False
        path.write_bytes(portrait.getvalue())
        return True
    except Exception as exc:
        print(f"Photo {fide_id}: {exc}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--photos", action="store_true")
    args = parser.parse_args()
    rows = rankings()
    PUBLIC.mkdir(exist_ok=True)
    (PUBLIC / "ratings-sep26.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {len(rows)} active players")
    if args.photos:
        PHOTO_DIR.mkdir(exist_ok=True)
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(fetch_photo, row["fideId"]) for row in rows]
            success = sum(f.result() for f in as_completed(futures))
        print(f"Downloaded {success}/{len(rows)} portraits")


if __name__ == "__main__":
    main()
