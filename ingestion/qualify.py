import hashlib
import json
from pathlib import Path

from .acquire import atomic_json
from .pgn import normalize_name, export_pgn
from .store import connect


def classify(row, source, events, rating_lookup, threshold=1800, rating_scope="both"):
    h = json.loads(row["headers_json"])
    invalid = json.loads(row["errors_json"])
    reasons, rejected = [], []
    if invalid:
        rejected.append("invalid_pgn")
    if row["result"] not in ("1-0", "0-1", "1/2-1/2"):
        rejected.append("unfinished_game")
    if row["white_id"] and row["white_id"] == row["black_id"]:
        rejected.append("same_player_both_colors")
    day = row["played_on"]
    if not day:
        reasons.append("unknown_game_date")
    matches = []
    for event in events:
        # Source-bound FIDE PGNs are a stronger match than a name shared by many events.
        source_match = source.get("fide_event_id") == event["fide_event_id"]
        alias_match = (h.get("Event") in event.get("pgn_event_names", [])
                       and h.get("Site") in event.get("pgn_sites", []))
        if day and (source_match or alias_match) and event["start_date"] <= day <= event["end_date"]:
            matches.append(event)
    event = matches[0] if len(matches) == 1 else None
    if not event:
        reasons.append("unverified_official_event" if not matches else "ambiguous_official_event")
    else:
        if event.get("rating_type") != "standard":
            rejected.append("not_classical_event")
        if event.get("otb") is not True or event.get("hybrid") is not False:
            reasons.append("unverified_otb_event")
        if not event.get("fide_report_url") or not event.get("evidence_sha256"):
            reasons.append("missing_event_evidence")
        roster = set(event.get("player_ids", []))
        if not roster or row["white_id"] not in roster or row["black_id"] not in roster:
            reasons.append("players_not_verified_in_event_roster")
    ratings = []
    for side in ("white", "black"):
        player_id = row[side + "_id"]
        observation = rating_lookup(day[:7], player_id) if day and player_id else None
        if not player_id:
            reasons.append(side + "_missing_fide_id")
        if not observation:
            reasons.append(side + "_missing_historical_fide_rating")
            ratings.append(None)
        else:
            ratings.append(observation["standard_rating"])
            if normalize_name(h.get(side.capitalize(), "")) != normalize_name(observation["name"]):
                reasons.append(side + "_identity_name_mismatch")
    if rating_scope == "both":
        if any(r is not None and r <= threshold for r in ratings):
            rejected.append("rating_not_above_threshold")
    elif all(r is not None and r <= threshold for r in ratings):
        rejected.append("rating_not_above_threshold")
    status = "rejected" if rejected else ("quarantine" if reasons else "accepted")
    return status, sorted(set(rejected + reasons)), event["fide_event_id"] if event else None, ratings


def qualify(database, events_path, threshold=1800, rating_scope="both"):
    from functools import lru_cache
    payload = Path(events_path).read_bytes()
    events = json.loads(payload)["events"]
    if rating_scope not in ("both", "either"):
        raise ValueError("Invalid rating scope")
    policy = json.dumps({"version": 1, "rating_threshold_exclusive": threshold,
                         "rating_scope": rating_scope, "events_sha256": hashlib.sha256(payload).hexdigest()})
    db = connect(database)
    sources = {r["id"]: json.loads(r["metadata_json"]) for r in db.execute("SELECT * FROM sources")}
    @lru_cache(maxsize=100000)
    def lookup(month, player_id):
        return db.execute("SELECT * FROM ratings WHERE month=? AND fide_id=?", (month, player_id)).fetchone()
    counts = {"accepted": 0, "rejected": 0, "quarantine": 0}
    try:
        with db:
            db.execute("DELETE FROM eligibility")
            for row in db.execute("SELECT * FROM games"):
                status, reasons, event, ratings = classify(row, sources[row["source_id"]], events, lookup, threshold, rating_scope)
                db.execute("INSERT INTO eligibility VALUES (?,?,?,?,?,?,?,?,?)", (
                    row["source_id"], row["member"], row["ordinal"], status, json.dumps(reasons), event,
                    ratings[0], ratings[1], policy))
                counts[status] += 1
        return counts
    finally:
        db.close()


def report(database, output):
    from collections import Counter
    db = connect(database)
    try:
        counts = dict(db.execute("SELECT status,count(*) FROM eligibility GROUP BY status"))
        total = db.execute("SELECT count(*) FROM games").fetchone()[0]
        unique = db.execute("SELECT count(DISTINCT game_key) FROM games").fetchone()[0]
        accepted = db.execute("""SELECT count(DISTINCT game_key) FROM games JOIN eligibility USING(source_id,member,ordinal)
                              WHERE status='accepted'""").fetchone()[0]
        reasons = Counter()
        for row in db.execute("SELECT reasons_json,count(*) FROM eligibility GROUP BY reasons_json"):
            for reason in json.loads(row[0]):
                reasons[reason] += row[1]
        result = {"source_files": db.execute("SELECT count(*) FROM sources").fetchone()[0],
                  "parsed_records": total, "conservative_unique_records": unique,
                  "exact_duplicate_occurrences": total - unique, "classification": counts,
                  "unclassified": total - sum(counts.values()), "accepted_unique_games": accepted,
                  "reason_counts": dict(reasons.most_common()),
                  "rating_observations": db.execute("SELECT count(*) FROM ratings").fetchone()[0],
                  "rating_sources": [dict(r) for r in db.execute("""SELECT month,source_url,source_sha256,count(*) AS observations
                     FROM ratings GROUP BY month,source_url,source_sha256 ORDER BY month""")],
                  "coverage": "Only the listed source snapshots. Global FIDE/OTB completeness is not established.",
                  "sources": [dict(r) for r in db.execute("SELECT id,sha256,records FROM sources ORDER BY id")]}
        atomic_json(output, result)
        return result
    finally:
        db.close()


def export(database, output):
    """Strict accepted games only; every exported game carries source attribution."""
    db = connect(database)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    try:
        sql = """WITH selected AS (
                   SELECT g.*,s.metadata_json,e.white_rating AS verified_white_rating,
                     e.black_rating AS verified_black_rating,e.event_id AS verified_event_id,
                     row_number() OVER (PARTITION BY g.game_key ORDER BY g.source_id,g.member,g.ordinal) AS rn
                   FROM games g JOIN eligibility e USING(source_id,member,ordinal)
                   JOIN sources s ON s.id=g.source_id WHERE e.status='accepted')
                 SELECT * FROM selected WHERE rn=1 ORDER BY played_on,game_key"""
        with output.open("w", encoding="utf-8") as handle:
            for row in db.execute(sql):
                record = dict(row)
                source = json.loads(row["metadata_json"])
                headers = json.loads(record["headers_json"])
                headers["Source"] = source["url"]
                headers["SourceLicense"] = source["license"]
                headers["SourceSHA256"] = source["sha256"]
                headers["FideEventId"] = record["verified_event_id"]
                headers["FideRatingMonth"] = record["played_on"][:7]
                for side in ("White", "Black"):
                    tag = side + "Elo"
                    rating = str(record["verified_" + side.lower() + "_rating"])
                    if tag in headers and headers[tag] != rating:
                        headers["Source" + tag] = headers[tag]
                    headers[tag] = rating
                record["headers_json"] = json.dumps(headers)
                handle.write(export_pgn(record) + "\n\n")
                count += 1
        return count
    finally:
        db.close()
