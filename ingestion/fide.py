"""Official monthly standard ratings, never inferred from a PGN Elo tag."""
import io
import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

from .acquire import atomic_json, download, sha256
from .pgn import read_records
from .store import connect


def import_ratings(database, archive_path, month, source_url):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise ValueError("Month must be YYYY-MM")
    if not source_url.startswith("https://ratings.fide.com/download/standard_"):
        raise ValueError("Expected an official FIDE standard rating source URL")
    digest = sha256(archive_path)
    db = connect(database)
    count = 0
    try:
        with zipfile.ZipFile(archive_path) as archive:
            names = [n for n in archive.namelist() if n.endswith(".txt")]
            if len(names) != 1:
                raise ValueError("Expected one standard rating TXT member")
            with archive.open(names[0]) as raw, io.TextIOWrapper(raw, encoding="utf-8-sig") as stream:
                header = stream.readline()
                match = re.search(r"\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}\b|\bRtg\b|\bRating\b", header, re.I)
                if not match or "Name" not in header or "Fed" not in header:
                    raise ValueError("Unrecognized FIDE fixed-width header; do not guess column offsets")
                months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
                token = match.group().upper()
                if re.fullmatch(r"[A-Z]{3}\d{2}", token):
                    observed = f"20{token[-2:]}-{months.index(token[:3])+1:02d}"
                    if observed != month:
                        raise ValueError(f"Rating period mismatch: requested {month}, file says {observed}")
                start, end = match.start(), header.index("Gms")
                name_start, name_end = header.index("Name"), header.index("Fed")
                with db:
                    db.execute("DELETE FROM ratings WHERE month=?", (month,))
                    for line in stream:
                        if not line.strip():
                            continue
                        player = int(line[:name_start].strip())
                        rating = int(line[start:end].strip() or "0")
                        db.execute("INSERT INTO ratings VALUES (?,?,?,?,?,?)", (
                            month, player, line[name_start:name_end].strip(), rating, source_url, digest))
                        count += 1
                    db.execute("""DELETE FROM eligibility WHERE (source_id,member,ordinal) IN
                               (SELECT source_id,member,ordinal FROM games WHERE substr(played_on,1,7)=?)""", (month,))
    finally:
        db.close()
    return count


def extract_fide_pgn(raw_path, output_path):
    """FIDE's PGN download endpoint can append its HTML page after the scoresheets.

    Preserve the original separately; strip only a standalone HTML document trailer.
    This is an explicit source adapter, not silent repair in the generic PGN parser.
    """
    raw = Path(raw_path).read_bytes()
    marker = re.search(br"(?im)^<!DOCTYPE html>\s*$", raw)
    pgn = raw[:marker.start()] if marker else raw
    if not pgn.lstrip().startswith(b"[Event "):
        raise ValueError("FIDE response does not start with PGN")
    Path(output_path).write_bytes(pgn)
    return {"original_sha256": sha256(raw_path), "sha256": sha256(output_path),
            "transformation": "strip standalone HTML trailer" if marker else "none",
            "removed_bytes": len(raw) - len(pgn)}


class FideTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.links, self.text = [], [], []
        self.row, self.cell = None, None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = []
        elif tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_data(self, data):
        self.text.append(data)
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def fetch_fide_event(event_id, directory, manifest_path, events_path):
    if not re.fullmatch(r"[1-9][0-9]*", event_id):
        raise ValueError("FIDE event ID must be numeric")
    root = Path(directory)
    details_url = f"https://ratings.fide.com/tournament_information.phtml?event={event_id}"
    report_url = f"https://ratings.fide.com/report.phtml?event={event_id}"
    details_path = root / "evidence" / f"fide-event-{event_id}.html"
    report_path = root / "evidence" / f"fide-report-{event_id}.html"
    details_meta = download(details_url, details_path)
    report_meta = download(report_url, report_path)
    details, report = FideTable(), FideTable()
    details.feed(details_path.read_text(encoding="utf-8-sig"))
    report.feed(report_path.read_text(encoding="utf-8-sig"))
    fields = {r[0]: r[1] for r in details.rows if len(r) == 2}
    if fields.get("Event code") != event_id:
        raise ValueError("FIDE event identity mismatch or unexpected page")
    if not fields.get("Time Control", "").startswith("Standard:"):
        raise ValueError("Event is not documented as standard/classical")
    if fields.get("Hybrid") != "NO":
        raise ValueError("Event is hybrid or OTB status is unconfirmed")
    if not re.search(r"Rated for .+ as Standard", " ".join(details.text)):
        raise ValueError("No completed Standard rating report on event page")
    links = [urljoin(details_url, link) for link in details.links if link.startswith("view_pgn.php?") and "download=1" in link]
    if len(set(links)) != 1:
        raise ValueError("No unique downloadable PGN on official FIDE event page")
    roster = sorted({int(r[0]) for r in report.rows if len(r) >= 8 and r[0].isdigit()})
    if not roster:
        raise ValueError("FIDE event report has no parsed participant roster")
    raw_path = root / "raw" / f"fide-{event_id}.pgn"
    raw_meta = download(links[0], raw_path)
    clean_path = root / "raw" / f"fide-{event_id}.clean.pgn"
    transformation = extract_fide_pgn(raw_path, clean_path)
    names, sites = set(), set()
    count = 0
    for _, _, record in read_records(clean_path):
        names.add(record["headers"].get("Event", ""))
        sites.add(record["headers"].get("Site", ""))
        count += 1
    if not count:
        raise ValueError("Empty FIDE PGN")
    source = {"id": f"fide-{event_id}", "path": str(clean_path.resolve()), **raw_meta,
              **transformation, "bytes": clean_path.stat().st_size,
              "original_path": str(raw_path.resolve()), "fide_event_id": event_id,
              "publisher": "FIDE", "source_kind": "fide-official",
              "license": "FIDE-public-download; redistribution-unconfirmed",
              "terms_url": "https://ratings.fide.com/"}
    event = {"fide_event_id": event_id, "name": fields["Tournament Name"],
             "pgn_event_names": sorted(names), "pgn_sites": sorted(sites),
             "start_date": fields["Start Date"], "end_date": fields["End Date"],
             "rating_type": "standard", "otb": True, "hybrid": False,
             "player_ids": roster, "fide_report_url": report_url, "fide_details_url": details_url,
             "time_control_text": fields["Time Control"],
             "evidence_sha256": {"details": details_meta["sha256"], "report": report_meta["sha256"]}}
    for path, key, entry, id_field in [(manifest_path, "sources", source, "id"),
                                      (events_path, "events", event, "fide_event_id")]:
        payload = json.loads(Path(path).read_text()) if Path(path).exists() else {"schema_version": 1, key: []}
        payload[key] = [x for x in payload[key] if x[id_field] != entry[id_field]] + [entry]
        atomic_json(path, payload)
    return {"event": event_id, "pgn_records": count, "roster_players": len(roster), **transformation}
