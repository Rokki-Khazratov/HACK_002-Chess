"""Tournament index, standings and rating maths for the local library.

Everything here is derived from imported game records. Standings, rating changes and
performances are computed from the games the library holds, which may be incomplete,
so every response carries the basis it was computed from.
"""
import json
import math
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

from .build import country, fold

ROOT = Path(__file__).resolve().parent.parent
VERIFIED_EVENTS = ROOT / "sources" / "verified-events.json"
EVENT_DETAILS = ROOT / "sources" / "event-details.json"
TOP_RATINGS = ROOT / "frontend" / "public" / "ratings-sep26.json"
TOP_RATINGS_MONTH = "2026-09"
LIST_SORT = {
    "games": lambda e: (-e["games"], e["name_fold"]),
    "name": lambda e: (e["name_fold"], e["id"]),
    "newest": lambda e: (-(date_key(e["last_date"])), -e["games"]),
    "oldest": lambda e: (date_key(e["first_date"]) or 99999999, -e["games"]),
    "avg_elo": lambda e: (-(e["avg_elo"] or 0), -e["games"]),
    "players": lambda e: (-e["players"], -e["games"]),
}
SCORES = {"1-0": (1.0, 0.0), "0-1": (0.0, 1.0), "1/2-1/2": (0.5, 0.5)}


def date_key(value):
    return int(value.replace("-", "")) if value else 0


def load_json(path, key):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8")).get(key, [])
    except (OSError, ValueError):
        return []


# ---------- rating maths (FIDE Handbook B.02, standard rating) ----------

def expected_score(rating, opponent):
    """Expected score with the rating difference capped at 400 points."""
    diff = max(-400, min(400, opponent - rating))
    return 1 / (1 + 10 ** (diff / 400))


def k_factor(rating):
    # K=40 (juniors, new players) needs age and game history the library does not have.
    return 10 if rating >= 2400 else 20


def rating_change(rating, results):
    """Sum of K·(score − expected) over (opponent rating, score) pairs."""
    k = k_factor(rating)
    return sum(k * (score - expected_score(rating, opponent)) for opponent, score in results)


def performance(opponents, score):
    """Average opponent rating plus the logistic rating difference for the score share."""
    if not opponents:
        return None
    share = score / len(opponents)
    if share >= 1:
        dp = 800
    elif share <= 0:
        dp = -800
    else:
        dp = max(-800, min(800, -400 * math.log10(1 / share - 1)))
    return round(sum(opponents) / len(opponents) + dp)


def category(average):
    """FIDE round-robin category: 1 starts at 2251, one category per 25 points."""
    if average is None or average < 2251:
        return None
    return int((average - 2251) // 25) + 1


# ---------- event index for the list page ----------

_index_cache = {}


def event_index(library_path, corpus_path):
    """Per-event aggregates, computed once per library file and kept in memory."""
    stamp = (str(library_path), Path(library_path).stat().st_mtime)
    if _index_cache.get("stamp") == stamp:
        return _index_cache["events"]
    lib = sqlite3.connect(f"file:{Path(library_path).resolve()}?mode=ro", uri=True)
    lib.row_factory = sqlite3.Row
    try:
        events = {r["id"]: dict(r) | {"first_date": None, "last_date": None, "players": 0, "avg_elo": None,
                                        "top_rating": None, "site": None, "source_kinds": [], "accepted_games": 0}
                  for r in lib.execute("SELECT id,name,name_fold,games FROM events")}
        for r in lib.execute("""SELECT event_id,min(played_on) AS first_date,max(played_on) AS last_date,
                    sum(status='accepted') AS accepted_games,group_concat(DISTINCT source_kind) AS kinds,
                    min(id) AS sample FROM games GROUP BY event_id"""):
            event = events.get(r["event_id"])
            if event:
                event.update(first_date=r["first_date"], last_date=r["last_date"],
                             accepted_games=r["accepted_games"] or 0, sample=r["sample"],
                             source_kinds=sorted(k for k in (r["kinds"] or "").split(",") if k))
        # One rating per participant (their highest in the event), then the event average.
        for r in lib.execute("""WITH sides AS (
                    SELECT event_id,white_id AS pid,lower(white_name) AS nm,white_rating AS r FROM games
                    UNION ALL SELECT event_id,black_id,lower(black_name),black_rating FROM games),
                  per AS (SELECT event_id,max(r) AS r FROM sides
                          GROUP BY event_id,COALESCE(CAST(pid AS TEXT),nm))
                  SELECT event_id,count(*) AS players,avg(r) AS avg_elo,max(r) AS top FROM per GROUP BY event_id"""):
            event = events.get(r["event_id"])
            if event:
                event.update(players=r["players"], top_rating=r["top"],
                             avg_elo=round(r["avg_elo"]) if r["avg_elo"] is not None else None)
        samples = {e.pop("sample"): e for e in events.values() if "sample" in e}
        rows = lib.execute(f"""SELECT id,source_id,member,ordinal FROM games
                              WHERE id IN ({",".join("?" * len(samples))})""", list(samples)) if samples else []
        rows = [tuple(r) for r in rows]
    finally:
        lib.close()
    if rows and corpus_path and Path(corpus_path).is_file():
        corpus = sqlite3.connect(f"file:{Path(corpus_path).resolve()}?mode=ro", uri=True)
        try:
            for game_id, source_id, member, ordinal in rows:
                found = corpus.execute("SELECT headers_json FROM games WHERE source_id=? AND member=? AND ordinal=?",
                                       (source_id, member, ordinal)).fetchone()
                site = json.loads(found[0]).get("Site", "").strip() if found else ""
                if site and site != "?" and not site.startswith("http"):
                    samples[game_id]["site"] = site
        finally:
            corpus.close()
    for official in load_json(VERIFIED_EVENTS, "events"):
        for event in events.values():
            if event["name"] == official["name"]:
                event["site"] = event["site"] or ", ".join(official.get("pgn_sites", [])) or None
                event["first_date"] = official.get("start_date") or event["first_date"]
                event["last_date"] = official.get("end_date") or event["last_date"]
    ordered = sorted(events.values(), key=lambda e: e["id"])
    _index_cache.update(stamp=stamp, events=ordered)
    return ordered


def list_events(db, library_path, corpus_path, p, fts_query, safe_int):
    events = event_index(library_path, corpus_path)
    keep = None

    def narrow(ids):
        nonlocal keep
        keep = set(ids) if keep is None else keep & set(ids)

    q = p.get("q", "").strip()[:80]
    if q:
        match = fts_query(q)
        narrow(r[0] for r in db.execute("SELECT rowid FROM events_fts WHERE events_fts MATCH ?", (match,))) if match else narrow([])
    who = p.get("player", "").strip()[:80]
    if who.isdigit():
        narrow(r[0] for r in db.execute("""SELECT event_id FROM games WHERE white_id=?
                                          UNION SELECT event_id FROM games WHERE black_id=?""", (int(who),) * 2))
    elif who:
        term = "%" + fold(who).replace("%", "\\%").replace("_", "\\_") + "%"
        narrow(r[0] for r in db.execute("""SELECT DISTINCT event_id FROM games
                    WHERE lower(white_name) LIKE ? ESCAPE '\\' OR lower(black_name) LIKE ? ESCAPE '\\'""", (term, term)))
    first = safe_int(p.get("year_from"), 0, 0, 2100)
    last = safe_int(p.get("year_to"), 2100, 0, 2100)
    if first > last:
        raise ValueError("Start year is later than end year")
    site = fold(p.get("site", "").strip()[:80])
    min_avg = safe_int(p.get("min_avg_elo"), 0, 0, 3500)
    min_players = safe_int(p.get("min_players"), 0, 0, 100000)
    source = p.get("source", "")
    if source and source not in {"fide-official", "broadcast"}:
        raise ValueError("Invalid source")
    status = p.get("status", "")
    if status and status != "accepted":
        raise ValueError("Invalid status")
    sort = p.get("sort", "games")
    if sort not in LIST_SORT:
        raise ValueError("Invalid sort")

    def fits(e):
        if keep is not None and e["id"] not in keep:
            return False
        start = int(e["first_date"][:4]) if e["first_date"] else None
        end = int(e["last_date"][:4]) if e["last_date"] else start
        if first and (end is None or end < first):
            return False
        if last < 2100 and (start is None or start > last):
            return False
        return ((not site or site in fold(e["site"] or ""))
                and (not min_avg or (e["avg_elo"] or 0) >= min_avg)
                and e["players"] >= min_players
                and (not source or source in e["source_kinds"])
                and (not status or e["accepted_games"] > 0))

    found = sorted(filter(fits, events), key=LIST_SORT[sort])
    page = safe_int(p.get("page"), 1, 1, 100000)
    limit = safe_int(p.get("limit"), 30, 1, 60)
    rows = [{k: v for k, v in e.items() if k != "name_fold"} for e in found[(page - 1) * limit:page * limit]]
    return {"total": len(found), "page": page, "limit": limit, "tournaments": rows}


# ---------- detail page ----------

def official_ratings(corpus, ids):
    """Latest imported FIDE standard rating per player: corpus lists and the top-300 snapshot."""
    best = {}
    if ids and corpus is not None:
        try:
            for fid, rating, month in corpus.execute(
                    f"SELECT fide_id,standard_rating,month FROM ratings WHERE fide_id IN ({','.join('?' * len(ids))})",
                    list(ids)):
                if rating and (fid not in best or month > best[fid][1]):
                    best[fid] = (rating, month)
        except sqlite3.OperationalError:
            pass  # A corpus without imported rating lists.
    top = {}
    try:
        top = {row["fideId"]: row for row in json.loads(TOP_RATINGS.read_text(encoding="utf-8"))}
    except (OSError, ValueError):
        pass
    for fid in ids:
        row = top.get(fid)
        if row and row.get("rating") and (fid not in best or TOP_RATINGS_MONTH > best[fid][1]):
            best[fid] = (row["rating"], TOP_RATINGS_MONTH)
    return best, {fid: row.get("title") for fid, row in top.items() if fid in ids}


def standings(games, titles):
    """Participants with points, W/D/L, Buchholz, rating change and performance."""
    people = {}

    def person(fid, name, fed, rating, played_on):
        key = fid or ("name", fold(name or "?"))
        entry = people.setdefault(key, {"fide_id": fid, "name": name or "?", "federation": fed,
                                        "event_rating": None, "_first": None, "points": 0.0, "games": 0,
                                        "wins": 0, "draws": 0, "losses": 0, "_results": [], "_opponents": []})
        entry["federation"] = entry["federation"] or fed
        # The rating from the earliest game is the pre-event rating.
        if rating and (entry["_first"] is None or (played_on or "") < entry["_first"]):
            entry["event_rating"], entry["_first"] = rating, played_on or ""
        return key

    for g in games:
        white = person(g["white_id"], g["white_name"], g["white_fed"], g["white_rating"], g["played_on"])
        black = person(g["black_id"], g["black_name"], g["black_fed"], g["black_rating"], g["played_on"])
        g["_keys"] = (white, black)
    for g in games:
        if g["result"] not in SCORES:
            continue
        for side, (me, them) in enumerate((g["_keys"], g["_keys"][::-1])):
            score = SCORES[g["result"]][side]
            entry = people[me]
            entry["points"] += score
            entry["games"] += 1
            entry["wins" if score == 1 else "draws" if score == 0.5 else "losses"] += 1
            entry["_opponents"].append(them)
            entry["_results"].append((them, score))

    for entry in people.values():
        entry["buchholz"] = sum(people[o]["points"] for o in entry["_opponents"]) if entry["_opponents"] else None
        rated = [(people[o]["event_rating"], s) for o, s in entry["_results"] if people[o]["event_rating"]]
        own = entry["event_rating"]
        if own and rated:
            change = rating_change(own, rated)
            entry["rating_change"] = round(change, 1)
            entry["live_rating"] = round(own + change)
        else:
            entry["rating_change"] = entry["live_rating"] = None
        entry["performance"] = performance([r for r, _ in rated], sum(s for _, s in rated)) if rated else None
        entry["title"] = titles.get(entry["fide_id"]) or titles.get(("name", fold(entry["name"])))
        code, flag = country(entry["federation"])
        entry["flag"] = flag

    ordered = sorted(people.values(), key=lambda e: (-e["points"], -(e["buchholz"] or 0),
                                                     -(e["event_rating"] or 0), fold(e["name"])))
    rank, previous = 0, None
    for index, entry in enumerate(ordered, 1):
        tie = (entry["points"], entry["buchholz"])
        rank = rank if tie == previous else index
        entry["rank"], previous = rank, tie
        for key in [k for k in entry if k.startswith("_")]:
            del entry[key]
    return ordered


def most_common(values):
    values = [v for v in values if v and v != "?" and v != "-"]
    return Counter(values).most_common(1)[0][0] if values else None


def round_number(value):
    match = re.match(r"\s*(\d+)", value or "")
    return int(match.group(1)) if match else None


def event_detail(db, corpus_path, event_id):
    item = db.execute("SELECT id,name,games FROM events WHERE id=?", (event_id,)).fetchone()
    if not item:
        return None
    summary = db.execute("""SELECT min(played_on) AS first_date,max(played_on) AS last_date,
                count(DISTINCT year) AS years,count(DISTINCT source_id) AS sources,
                sum(result='1-0') AS white_wins,sum(result='0-1') AS black_wins,
                sum(result='1/2-1/2') AS draws FROM games WHERE event_id=?""", (event_id,)).fetchone()
    years = [dict(r) for r in db.execute("""SELECT year,count(*) AS games FROM games
                WHERE event_id=? AND year IS NOT NULL GROUP BY year ORDER BY year DESC LIMIT 30""", (event_id,))]
    games = [dict(r) for r in db.execute("""SELECT white_id,black_id,white_name,black_name,white_fed,black_fed,
                white_rating,black_rating,result,round,played_on,source_id,member,ordinal FROM games
                WHERE event_id=? ORDER BY played_on,id LIMIT 5000""", (event_id,))]

    corpus = None
    if corpus_path and Path(corpus_path).is_file():
        corpus = sqlite3.connect(f"file:{Path(corpus_path).resolve()}?mode=ro", uri=True)
    try:
        headers = []
        if corpus is not None:
            for g in games:
                found = corpus.execute("SELECT headers_json FROM games WHERE source_id=? AND member=? AND ordinal=?",
                                       (g["source_id"], g["member"], g["ordinal"])).fetchone()
                if found:
                    headers.append(json.loads(found[0]))
        ids = {fid for g in games for fid in (g["white_id"], g["black_id"]) if fid}
        official, top_titles = official_ratings(corpus, ids)
    finally:
        if corpus is not None:
            corpus.close()

    titles = dict(top_titles)
    for h in headers:
        for side in ("White", "Black"):
            title = (h.get(side + "Title") or "").strip()
            if title and title != "-":
                fid = h.get(side + "FideId", "")
                titles[int(fid) if fid.isdigit() else ("name", fold(h.get(side, "")))] = title

    people = standings(games, titles)
    for entry in people:
        rating, month = official.get(entry["fide_id"], (None, None))
        entry["official_rating"], entry["official_month"] = rating, month

    name = item["name"]
    verified = next((e for e in load_json(VERIFIED_EVENTS, "events") if e["name"] == name), None)
    extra = next((e for e in load_json(EVENT_DETAILS, "events")
                  if name in e.get("names", []) or (verified and e.get("fide_event_id") == verified["fide_event_id"])), {})
    rated = [e["event_rating"] for e in people if e["event_rating"]]
    live = [e["live_rating"] for e in people if e["live_rating"]]
    average = round(sum(rated) / len(rated)) if rated else None
    counted = sum(1 for g in games if g["result"] in SCORES)
    rounds = [round_number(g["round"]) for g in games]
    rounds = [r for r in rounds if r]

    detail = dict(item) | dict(summary) | {"years": years}
    detail.update({
        "site": extra.get("venue") or most_common(h.get("Site") for h in headers)
                or (", ".join(verified["pgn_sites"]) if verified and verified.get("pgn_sites") else None),
        "time_control": (verified or {}).get("time_control_text") or most_common(h.get("TimeControl") for h in headers),
        "rounds": max(rounds) if rounds else None,
        "broadcast_url": most_common(h.get("BroadcastURL") for h in headers),
        "official": {k: verified[k] for k in ("fide_event_id", "name", "start_date", "end_date", "time_control_text",
                                               "fide_details_url", "fide_report_url")} if verified else None,
        "prize_fund": extra.get("prize_fund"),
        "organizer": extra.get("organizer"),
        "avg_elo": average,
        "avg_live": round(sum(live) / len(live)) if live else None,
        "top_rating": max(rated) if rated else None,
        "category": category(average),
        "participants": people,
        "standings_basis": (f"Computed from {counted} imported game{'s' if counted != 1 else ''} with a result; "
                            "may differ from the official standings if games are missing. "
                            "Live = rating at the event + FIDE rating change from these games (K 10 at 2400+, else 20)."),
    })
    return detail
