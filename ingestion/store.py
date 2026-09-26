import concurrent.futures
import hashlib
import json
import sqlite3
from pathlib import Path

from .acquire import sha256
from .pgn import fide_id, game_date, normalize_name, read_records

PARSER_VERSION = "1"


def parser_fingerprint(source):
    encoding = source.get("encoding", "utf-8-sig")
    return PARSER_VERSION if encoding == "utf-8-sig" else PARSER_VERSION + "-" + hashlib.sha256(encoding.encode()).hexdigest()[:12]


SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, metadata_json TEXT NOT NULL,
 parser_version TEXT NOT NULL, records INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
 source_id TEXT NOT NULL REFERENCES sources(id), member TEXT NOT NULL, ordinal INTEGER NOT NULL,
 game_key TEXT NOT NULL, event TEXT, played_on TEXT, white_id INTEGER, black_id INTEGER,
 headers_json TEXT NOT NULL, moves_uci TEXT NOT NULL, start_fen TEXT,
 result TEXT NOT NULL, errors_json TEXT NOT NULL,
 PRIMARY KEY(source_id, member, ordinal)
);
CREATE TABLE IF NOT EXISTS ratings (
 month TEXT NOT NULL, fide_id INTEGER NOT NULL, name TEXT NOT NULL, standard_rating INTEGER NOT NULL,
 source_url TEXT NOT NULL, source_sha256 TEXT NOT NULL, PRIMARY KEY(month, fide_id)
);
CREATE TABLE IF NOT EXISTS eligibility (
 source_id TEXT NOT NULL, member TEXT NOT NULL, ordinal INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('accepted','rejected','quarantine')),
 reasons_json TEXT NOT NULL, event_id TEXT, white_rating INTEGER, black_rating INTEGER,
 policy_json TEXT NOT NULL,
 PRIMARY KEY(source_id, member, ordinal),
 FOREIGN KEY(source_id,member,ordinal) REFERENCES games(source_id,member,ordinal)
);
"""


def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=60)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db


def record_key(record, source, member, ordinal):
    h = record["headers"]
    day = game_date(h)
    white, black = fide_id(h.get("WhiteFideId")), fide_id(h.get("BlackFideId"))
    # Conservative deduplication: same moves alone are NEVER enough.
    # Missing identity/date/event/round or invalid scoresheets stay separate.
    if (not day or not white or not black or not h.get("Event") or h.get("Event") == "?"
            or not h.get("Round") or h.get("Round") == "?" or record["errors"]):
        identity = [source, member, ordinal]
    else:
        identity = [day, white, black, normalize_name(h["Event"]), h["Round"],
                    record["start_fen"], record["result"], record["moves"]]
    return hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()


def parse_source(source, shard_dir):
    digest = sha256(source["path"])
    if digest != source["sha256"]:
        raise ValueError(f"Source checksum mismatch: {source['id']}")
    safe_id = hashlib.sha256(source["id"].encode()).hexdigest()[:20]
    fingerprint = parser_fingerprint(source)
    path = Path(shard_dir) / f"{safe_id}-{digest[:16]}-v{fingerprint}.sqlite"
    if path.exists():
        with sqlite3.connect(path) as db:
            saved = db.execute("SELECT records FROM sources WHERE id=? AND parser_version=?",
                               (source["id"], fingerprint)).fetchone()
            if saved:
                return str(path), saved[0]
    temporary = path.with_suffix(".partial")
    if temporary.exists():
        temporary.unlink()  # Only our incomplete shard, never a completed source/database.
    db = connect(temporary)
    count = 0
    try:
        with db:
            db.execute("INSERT INTO sources VALUES (?,?,?,?,0)",
                       (source["id"], digest, json.dumps(source), fingerprint))
            for member, ordinal, record in read_records(source["path"], source.get("encoding", "utf-8-sig")):
                h = record["headers"]
                db.execute("INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                    source["id"], member, ordinal, record_key(record, source["id"], member, ordinal),
                    h.get("Event"), game_date(h), fide_id(h.get("WhiteFideId")), fide_id(h.get("BlackFideId")),
                    json.dumps(h, ensure_ascii=False), record["moves"], record["start_fen"],
                    record["result"], json.dumps(record["errors"])))
                count += 1
            db.execute("UPDATE sources SET records=? WHERE id=?", (count, source["id"]))
    finally:
        db.close()
    temporary.replace(path)
    return str(path), count


def ingest(manifest_path, database, workers=4):
    manifest = json.loads(Path(manifest_path).read_text())
    if manifest.get("complete") is False or manifest.get("failures"):
        raise ValueError("Source manifest is incomplete; finish/retry acquisition before ingestion")
    sources = manifest["sources"]
    if len({s["id"] for s in sources}) != len(sources):
        raise ValueError("Duplicate source IDs in manifest")
    shard_dir = Path(database).parent / "shards"
    shard_dir.mkdir(parents=True, exist_ok=True)
    db = connect(database)
    failures = []
    try:
        with concurrent.futures.ProcessPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(parse_source, s, shard_dir): s for s in sources}
            for future in concurrent.futures.as_completed(futures):
                source = futures[future]
                try:
                    shard, count = future.result()
                    existing = db.execute("SELECT sha256,parser_version,metadata_json FROM sources WHERE id=?", (source["id"],)).fetchone()
                    if existing and tuple(existing)[:2] == (source["sha256"], parser_fingerprint(source)):
                        if json.loads(existing["metadata_json"]) != source:
                            with db:
                                db.execute("UPDATE sources SET metadata_json=? WHERE id=?", (json.dumps(source), source["id"]))
                                db.execute("DELETE FROM eligibility WHERE source_id=?", (source["id"],))
                        print(f"already imported {source['id']} {count}", flush=True)
                        continue
                    db.execute("ATTACH DATABASE ? AS shard", (shard,))
                    with db:
                        db.execute("DELETE FROM eligibility WHERE source_id=?", (source["id"],))
                        db.execute("DELETE FROM games WHERE source_id=?", (source["id"],))
                        db.execute("DELETE FROM sources WHERE id=?", (source["id"],))
                        db.execute("INSERT INTO sources SELECT * FROM shard.sources")
                        db.execute("UPDATE sources SET metadata_json=? WHERE id=?", (json.dumps(source), source["id"]))
                        db.execute("INSERT INTO games SELECT * FROM shard.games")
                    db.execute("DETACH DATABASE shard")
                    print(f"imported {source['id']} {count}", flush=True)
                except Exception as exc:
                    failures.append(f"{source['id']}: {exc}")
                    print(f"FAILED {failures[-1]}", flush=True)
        db.executescript("""
          CREATE INDEX IF NOT EXISTS games_key ON games(game_key);
          CREATE INDEX IF NOT EXISTS games_white ON games(white_id, played_on);
          CREATE INDEX IF NOT EXISTS games_black ON games(black_id, played_on);
        """)
    finally:
        db.close()
    if failures:
        raise RuntimeError("\n".join(failures))
