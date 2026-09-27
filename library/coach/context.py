"""Read-only local evidence with an explicit analysis-eligibility policy."""
from collections import Counter
from contextlib import closing
import json
from pathlib import Path
import sqlite3


BLOCKING_REASONS = {"invalid_pgn", "white_identity_name_mismatch", "black_identity_name_mismatch",
                    "white_missing_fide_id", "black_missing_fide_id"}


def _reasons(row):
    try:
        return set(json.loads(row["reasons_json"] or "[]"))
    except (TypeError, ValueError):
        return {"invalid_eligibility_metadata"}


def enrich(context, library_path):
    with closing(sqlite3.connect(f"file:{Path(library_path).resolve()}?mode=ro", uri=True)) as db:
        db.row_factory = sqlite3.Row
        if context.get("gameId"):
            row = db.execute("""SELECT id,white_name,black_name,white_id,black_id,played_on,
                result,opening,eco,raw_event,status FROM games WHERE id=?""", (context["gameId"],)).fetchone()
            if row:
                context["game"] = {**dict(row), "source": "local library game headers", "reference": f"/games/{row['id']}",
                                   "note": "Historical game metadata; the selected board may be a user variation."}
            else:
                context["game"] = {"unavailable": True, "source": "local library"}
        opponent = context.get("preparation", {}).get("opponent", {})
        if opponent.get("fideId"):
            fide_id = opponent["fideId"]
            profile = db.execute("SELECT fide_id,name,federation,games FROM players WHERE fide_id=? ORDER BY games DESC LIMIT 1", (fide_id,)).fetchone()
            evidence = {"source": "local library; accepted plus analysis-eligible quarantine games", "fideId": fide_id,
                        "profile": dict(profile) if profile else None,
                        "limitation": "Quarantine games may have unverified event or rating metadata. Moves are used only when the PGN is valid and the FIDE identity link is not disputed. Counts are a bounded sample, not a complete repertoire.",
                        "colors": {}}
            for color in ("white", "black"):
                all_rows = list(db.execute(f"""SELECT id,played_on,opening,eco,white_name,black_name,result,status,reasons_json
                    FROM games WHERE {color}_id=? ORDER BY played_on DESC,id DESC""", (fide_id,)))
                usable, excluded, reasons = [], [], Counter()
                for row in all_rows:
                    row_reasons = _reasons(row)
                    if row["status"] == "rejected" or row_reasons & BLOCKING_REASONS:
                        excluded.append(row)
                        reasons.update(row_reasons & BLOCKING_REASONS or {"rejected"})
                    else:
                        usable.append(row)
                rows = usable[:200]
                if len(usable) > len(rows):
                    reasons["outside_recent_sample_limit"] += len(usable) - len(rows)
                groups = Counter((row["eco"] or "unknown", row["opening"] or "Unlabelled") for row in rows)
                dates = [r["played_on"] for r in rows if r["played_on"]]
                evidence["colors"][color] = {"found": len(all_rows), "sampleSize": len(rows), "excluded": len(all_rows) - len(rows),
                    "sampleLimit": 200, "statuses": dict(Counter(r["status"] for r in all_rows)),
                    "exclusionReasons": dict(reasons.most_common()), "dateRange": [min(dates), max(dates)] if dates else None,
                    "openings": [{"eco": eco, "name": name, "games": count,
                        "examples": [{"id": r["id"], "reference": f"/games/{r['id']}", "date": r["played_on"],
                            "white": r["white_name"], "black": r["black_name"], "result": r["result"]}
                            for r in rows if (r["eco"] or "unknown", r["opening"] or "Unlabelled") == (eco, name)][:2]}
                        for (eco, name), count in groups.most_common(8)]}
            context["opponentEvidence"] = evidence
    return context
