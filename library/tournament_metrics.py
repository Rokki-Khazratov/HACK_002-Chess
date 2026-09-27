"""Cached event strength from distinct participants and their recorded PGN Elo."""
from datetime import date, timedelta
from functools import lru_cache
import json
import os
from pathlib import Path
import sqlite3


def _bucket():
    return {"games": 0, "lastDate": None, "players": {}}


def recent_cutoff():
    return (date.today() - timedelta(days=730)).isoformat()


def _record(bucket, row):
    bucket["games"] += 1
    if row["played_on"] and (not bucket["lastDate"] or row["played_on"] > bucket["lastDate"]):
        bucket["lastDate"] = row["played_on"]
    for color in ("white", "black"):
        player_id, name, rating = row[f"{color}_id"], row[f"{color}_name"], row[f"{color}_rating"]
        if player_id is None and not name:
            continue
        key = str(player_id) if player_id is not None else name.casefold().strip()
        value = bucket["players"].setdefault(key, [0, 0])
        if isinstance(rating, int) and 1000 <= rating <= 3000:
            value[0] += rating
            value[1] += 1


def _finish(bucket):
    rated = [total / count for total, count in bucket["players"].values() if count]
    return {"games": bucket["games"], "lastDate": bucket["lastDate"],
            "players": len(bucket["players"]), "ratedPlayers": len(rated),
            "avgElo": round(sum(rated) / len(rated)) if rated else None}


@lru_cache(maxsize=4)
def load_metrics(library_path, recent_from=None):
    """Build once per library version, then serve filtered pages from the small cache."""
    library_path = Path(library_path)
    recent_from = recent_from or recent_cutoff()
    stamp = library_path.stat().st_mtime_ns
    cache = library_path.with_name(f"{library_path.stem}-tournaments-{recent_from}.json")
    if cache.is_file():
        try:
            saved = json.loads(cache.read_text())
            if saved.get("libraryMtime") == stamp and saved.get("recentFrom") == recent_from:
                return saved["events"]
        except (OSError, ValueError, KeyError):
            pass

    events = {}
    db = sqlite3.connect(f"file:{library_path.resolve()}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    try:
        rows = db.execute("""SELECT event_id,played_on,white_id,black_id,
            white_name,black_name,white_rating,black_rating FROM games ORDER BY event_id""")
        event_id, all_games, recent_games = None, _bucket(), _bucket()
        for row in rows:
            if event_id is not None and row["event_id"] != event_id:
                if all_games["games"] >= 2:
                    events[str(event_id)] = {"all": _finish(all_games), "recent": _finish(recent_games)}
                all_games, recent_games = _bucket(), _bucket()
            event_id = row["event_id"]
            _record(all_games, row)
            if row["played_on"] and row["played_on"] >= recent_from:
                _record(recent_games, row)
        if event_id is not None and all_games["games"] >= 2:
            events[str(event_id)] = {"all": _finish(all_games), "recent": _finish(recent_games)}
    finally:
        db.close()
    payload = {"libraryMtime": stamp, "recentFrom": recent_from, "events": events}
    temporary = cache.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(payload, separators=(",", ":")))
        os.replace(temporary, cache)
    except OSError:
        pass  # Read-only library directories still work for this process.
    return events
