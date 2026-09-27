"""Build a compact, searchable UI index from the provenance-preserving corpus."""
import json
import re
import sqlite3
import unicodedata
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pycountry

from ingestion.acquire import sha256

FIDE_ALIASES = {"NED": "NLD", "GER": "DEU", "SUI": "CHE", "KOS": "XKX",
                "IRI": "IRN", "VIE": "VNM", "BUL": "BGR", "SLO": "SVN", "GRE": "GRC"}
GENERIC_EVENTS = {"?", "", "new tournament description", "playzone game", "open", "tournament", "game", "rated rapid game", "rated blitz game"}
SCHEMA = """
PRAGMA journal_mode=OFF;
CREATE TABLE games (
 id INTEGER PRIMARY KEY, game_key TEXT NOT NULL UNIQUE, event_id INTEGER NOT NULL,
 raw_event TEXT, played_on TEXT, year INTEGER, round TEXT,
 white_name TEXT, black_name TEXT, white_id INTEGER, black_id INTEGER,
 white_fed TEXT, black_fed TEXT, white_fed_basis TEXT, black_fed_basis TEXT,
 white_rating INTEGER, black_rating INTEGER, result TEXT, status TEXT NOT NULL,
 reasons_json TEXT NOT NULL, opening TEXT, eco TEXT, ply_count INTEGER,
 source_id TEXT NOT NULL, member TEXT NOT NULL, ordinal INTEGER NOT NULL,
 game_url TEXT, source_url TEXT, source_kind TEXT
);
CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, name_fold TEXT NOT NULL, games INTEGER NOT NULL);
CREATE TABLE players (id INTEGER PRIMARY KEY, fide_id INTEGER, name TEXT NOT NULL,
 name_fold TEXT NOT NULL, federation TEXT, federation_basis TEXT, games INTEGER NOT NULL);
CREATE TABLE federations (code TEXT PRIMARY KEY, games INTEGER NOT NULL, flag TEXT);
CREATE TABLE metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
"""


def fold(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", value).casefold()
                              if not unicodedata.combining(c)).split())


def country(code):
    if not code or not re.fullmatch(r"[A-Z]{3}", code):
        return None, None
    if code == "RUS":
        return code, "🏳️"
    if code == "FID":
        return code, "🏳️"
    if code == "ENG":
        return code, "🏴"
    record = pycountry.countries.get(alpha_3=FIDE_ALIASES.get(code, code))
    if record:
        return code, record.flag
    # Chess federations without an ISO country are retained as codes, not given a wrong flag.
    return code, None


def fide_federations(archive):
    archive = Path(archive)
    result = {}
    with zipfile.ZipFile(archive) as z:
        names = [n for n in z.namelist() if n.endswith(".txt")]
        if len(names) != 1:
            raise ValueError("Expected one FIDE Standard TXT member")
        with z.open(names[0]) as raw:
            header = raw.readline().decode("utf-8-sig")
            if "Name" not in header or "Fed" not in header or "SEP26" not in header:
                raise ValueError("Unexpected federation list format or month")
            name_pos, fed_pos, sex_pos = header.index("Name"), header.index("Fed"), header.index("Sex")
            for line in raw:
                try:
                    fid = int(line[:name_pos].strip())
                except ValueError:
                    continue
                fed = line[fed_pos:sex_pos].decode("ascii", errors="ignore").strip()
                if fed:
                    result[fid] = fed
    return result, sha256(archive)


def chosen_federation(headers, side, player_id, fide_map):
    if player_id in fide_map:
        return fide_map[player_id], "FIDE Sep 2026"
    for tag in (side + "Fed", side + "Federation", side + "Country", side + "Team"):
        value = headers.get(tag, "").strip().upper()
        code, flag = country(value)
        if code and flag:
            return code, "PGN tag " + tag
    return None, None


def display_event(headers, source, verified_events):
    fide_event = source.get("fide_event_id")
    if fide_event in verified_events:
        return verified_events[fide_event]
    raw = (headers.get("Event") or "").strip()
    if fold(raw) in GENERIC_EVENTS:
        return (headers.get("BroadcastName") or headers.get("StudyName") or raw or "Не указан").strip()
    return raw


def build(corpus, target, fide_archive, events_path):
    corpus, target = Path(corpus), Path(target)
    if not corpus.is_file():
        raise FileNotFoundError(corpus)
    fide_map, fide_sha = fide_federations(fide_archive)
    verified_events = {x["fide_event_id"]: x["name"]
                       for x in json.loads(Path(events_path).read_text())["events"]}
    target.parent.mkdir(parents=True, exist_ok=True)
    pending = target.with_suffix(".building.sqlite")
    if pending.exists():
        pending.unlink()
    source_db = sqlite3.connect(f"file:{corpus}?mode=ro", uri=True)
    source_db.row_factory = sqlite3.Row
    sources = {r["id"]: json.loads(r["metadata_json"])
               for r in source_db.execute("SELECT id,metadata_json FROM sources")}
    out = sqlite3.connect(pending)
    out.executescript(SCHEMA)
    event_ids, event_counts, players, federation_counts = {}, Counter(), {}, Counter()
    counts = Counter()
    batch = []
    insert = """INSERT INTO games VALUES
      (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""

    def add(record):
        headers = json.loads(record["headers_json"])
        source = sources[record["source_id"]]
        event = display_event(headers, source, verified_events)
        event_id = event_ids.setdefault(event, len(event_ids) + 1)
        event_counts[event] += 1
        played_on = record["played_on"]
        year = int(played_on[:4]) if played_on else None
        white_id, black_id = record["white_id"], record["black_id"]
        white_fed, white_basis = chosen_federation(headers, "White", white_id, fide_map)
        black_fed, black_basis = chosen_federation(headers, "Black", black_id, fide_map)
        if white_fed:
            federation_counts[white_fed] += 1
        if black_fed:
            federation_counts[black_fed] += 1
        status = record["status"] or "unclassified"
        counts[status] += 1
        for fid, name, fed, basis in ((white_id, headers.get("White", "?"), white_fed, white_basis),
                                      (black_id, headers.get("Black", "?"), black_fed, black_basis)):
            key = ("id", fid) if fid else ("name", fold(name))
            prior = players.get(key)
            if prior:
                prior[0] += 1
            else:
                players[key] = [1, fid, name, fold(name), fed, basis]
        def pgn_rating(tag):
            value = headers.get(tag, "")
            return int(value) if value.isdigit() else None
        batch.append((record["game_key"], event_id, record["event"], played_on, year,
                      headers.get("Round"), headers.get("White"), headers.get("Black"),
                      white_id, black_id, white_fed, black_fed, white_basis, black_basis,
                      record["verified_white_rating"] or pgn_rating("WhiteElo"),
                      record["verified_black_rating"] or pgn_rating("BlackElo"),
                      record["result"], status, record["reasons_json"] or "[]",
                      headers.get("Opening"), headers.get("ECO"), len(record["moves_uci"].split()),
                      record["source_id"], record["member"], record["ordinal"],
                      headers.get("GameURL"), source.get("url"), source.get("source_kind")))
        if len(batch) >= 5000:
            out.executemany(insert, batch)
            batch.clear()

    try:
        cursor = source_db.execute("""SELECT g.*,e.status,e.reasons_json,e.white_rating AS verified_white_rating,
                         e.black_rating AS verified_black_rating
                         FROM games g LEFT JOIN eligibility e USING(source_id,member,ordinal)
                         ORDER BY g.game_key,g.source_id,g.member,g.ordinal""")
        current_key, preferred = None, None
        rank = {"accepted": 0, "quarantine": 1, "rejected": 2, None: 3}
        for record in cursor:
            if record["game_key"] != current_key:
                if preferred is not None:
                    add(preferred)
                preferred, current_key = record, record["game_key"]
            elif rank[record["status"]] < rank[preferred["status"]]:
                preferred = record
        if preferred is not None:
            add(preferred)
        if batch:
            out.executemany(insert, batch)
        out.executemany("INSERT INTO events VALUES (?,?,?,?)",
                        ((event_ids[name], name, fold(name), count) for name, count in event_counts.items()))
        out.executemany("INSERT INTO players VALUES (NULL,?,?,?,?,?,?)",
                        ((p[1], p[2], p[3], p[4], p[5], p[0]) for p in players.values()))
        out.executemany("INSERT INTO federations VALUES (?,?,?)",
                        ((code, count, country(code)[1]) for code, count in federation_counts.items()))
        overview = {"games": sum(counts.values()), "status": dict(counts),
                    "tournaments": len(event_ids), "players": len(players),
                    "source_files": len(sources), "built_at": datetime.now(timezone.utc).isoformat(),
                    "federation_snapshot": "FIDE Standard September 2026",
                    "federation_sha256": fide_sha,
                    "scope": "All imported records. Only 'accepted' satisfies the strict official classical filter."}
        out.execute("INSERT INTO metadata VALUES (?,?)", ("overview", json.dumps(overview)))
        out.executescript("""
          CREATE INDEX games_date ON games(played_on DESC,id);
          CREATE INDEX games_status_date ON games(status,played_on DESC,id);
          CREATE INDEX games_event_date ON games(event_id,played_on DESC,id);
          CREATE INDEX games_white_date ON games(white_id,played_on DESC,id);
          CREATE INDEX games_black_date ON games(black_id,played_on DESC,id);
          CREATE INDEX games_year ON games(year);
          CREATE INDEX games_eco ON games(eco,year);
          CREATE INDEX games_white_fed ON games(white_fed,status,year);
          CREATE INDEX games_black_fed ON games(black_fed,status,year);
          CREATE INDEX events_games ON events(games DESC);
          CREATE INDEX players_name ON players(name_fold);
          CREATE INDEX players_games ON players(games DESC);
          CREATE INDEX players_fide ON players(fide_id);
          CREATE INDEX federations_games ON federations(games DESC);
          CREATE VIRTUAL TABLE events_fts USING fts5(name_fold,content='events',content_rowid='id',prefix='2 3 4');
          INSERT INTO events_fts(events_fts) VALUES ('rebuild');
          ANALYZE;
        """)
        out.commit()
        check = out.execute("PRAGMA quick_check").fetchone()[0]
        if check != "ok":
            raise RuntimeError("Library index integrity check failed: " + check)
        out.close()
        source_db.close()
        pending.replace(target)
        # Keep tournament strength ready for the first catalog visit.
        from .tournament_metrics import load_metrics
        load_metrics(str(target))
        return overview
    except Exception:
        out.close()
        source_db.close()
        raise
