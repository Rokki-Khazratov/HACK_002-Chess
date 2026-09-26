"""Local read-only JSON and static server. Binds to loopback only."""
import json
import mimetypes
import re
import sqlite3
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import chess

from ingestion.pgn import export_pgn
from .build import country, fold

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
RATINGS = Path(__file__).resolve().parent.parent / "frontend" / "public" / "ratings-sep26.json"
STATUS = {"all", "accepted", "quarantine", "rejected"}
SORT = {"newest": "g.played_on DESC,g.id DESC", "oldest": "g.played_on ASC,g.id ASC",
        "tournament": "ev.name_fold ASC,g.played_on DESC,g.id DESC",
        "rating": "COALESCE(g.white_rating,0)+COALESCE(g.black_rating,0) DESC,g.played_on DESC",
        "longest": "g.ply_count DESC,g.played_on DESC"}


@lru_cache(maxsize=1)
def ranked_players():
    if not RATINGS.is_file():
        return {}
    return {row["fideId"]: row for row in json.loads(RATINGS.read_text())}


def connect_readonly(path):
    db = sqlite3.connect(f"file:{Path(path).resolve()}?mode=ro", uri=True, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    return db


def fts_query(value):
    tokens = re.findall(r"\w+", fold(value))[:8]
    return " ".join('"' + token.replace('"', '') + '"*' for token in tokens if token)


def safe_int(value, default, low, high):
    try:
        result = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, result))


class Handler(BaseHTTPRequestHandler):
    library_path = None
    corpus_path = None

    def json_response(self, value, status=200):
        content = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def text_response(self, value, content_type="text/plain; charset=utf-8", download=None):
        content = value.encode()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        if download:
            self.send_header("Content-Disposition", f'attachment; filename="{download}"')
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path.startswith("/api/"):
                params = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
                with connect_readonly(self.library_path) as lib:
                    self.api(lib, parsed.path, params)
            else:
                self.static(parsed.path)
        except (ValueError, sqlite3.Error) as exc:
            self.json_response({"error": str(exc)}, 400)
        except Exception as exc:
            self.log_error("request failed: %s", exc)
            self.json_response({"error": "Could not open the data. Check the local server log."}, 500)

    def static(self, path):
        if path in {"/", "/analysis", "/tournaments", "/ratings"} or re.fullmatch(r"/(games|tournaments|players)/\d+/?", path):
            file = DIST / "index.html"
        else:
            file = (DIST / path.lstrip("/")).resolve()
            if not file.is_relative_to(DIST.resolve()) or not file.is_file():
                self.send_error(404)
                return
        body = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(file.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache" if file.name in {"index.html", "ratings-sep26.json"} else "public, max-age=3600")
        self.end_headers()
        self.wfile.write(body)

    def api(self, db, path, p):
        if path == "/api/overview":
            overview = json.loads(db.execute("SELECT value_json FROM metadata WHERE key='overview'").fetchone()[0])
            overview["years"] = [dict(r) for r in db.execute("""SELECT year,count(*) AS games FROM games
                            WHERE year BETWEEN 1800 AND 2100 GROUP BY year ORDER BY year DESC""")]
            self.json_response(overview)
            return
        if path == "/api/events":
            q = p.get("q", "").strip()[:80]
            if q:
                query = fts_query(q)
                rows = db.execute("""SELECT ev.id,ev.name,ev.games FROM events_fts f
                        JOIN events ev ON ev.id=f.rowid WHERE events_fts MATCH ?
                        ORDER BY ev.games DESC,ev.name LIMIT 18""", (query,)) if query else []
            else:
                rows = db.execute("SELECT id,name,games FROM events ORDER BY games DESC LIMIT 18")
            self.json_response([dict(r) for r in rows]); return
        if path == "/api/players":
            q = p.get("q", "").strip()[:80]
            if q.isdigit():
                rows = db.execute("""SELECT fide_id,name,federation,federation_basis,games FROM players
                                      WHERE fide_id=? ORDER BY games DESC LIMIT 18""", (int(q),))
            elif q:
                term = fold(q).replace("%", "\\%").replace("_", "\\_")
                rows = db.execute("""SELECT fide_id,name,federation,federation_basis,games FROM players
                                      WHERE name_fold LIKE ? ESCAPE '\\' ORDER BY games DESC LIMIT 18""", (term + "%",))
                found = list(rows)
                if not found:
                    rows = db.execute("""SELECT fide_id,name,federation,federation_basis,games FROM players
                                          WHERE name_fold LIKE ? ESCAPE '\\' ORDER BY games DESC LIMIT 18""", ("%" + term + "%",))
                else:
                    rows = found
            else:
                rows = db.execute("""SELECT fide_id,name,federation,federation_basis,games FROM players
                                   ORDER BY games DESC LIMIT 18""")
            self.json_response([dict(r) | {"flag": country(r["federation"])[1]} for r in rows]); return
        player = re.fullmatch(r"/api/players/(\d+)", path)
        if player:
            fide_id = int(player.group(1))
            row = db.execute("""SELECT fide_id,name,federation,federation_basis FROM players
                                WHERE fide_id=? ORDER BY games DESC LIMIT 1""", (fide_id,)).fetchone()
            ranked = ranked_players().get(fide_id)
            if not row and not ranked:
                self.json_response({"error": "Player not found"}, 404); return
            games = db.execute("""SELECT count(*) FROM games WHERE white_id=? OR black_id=?""",
                               (fide_id, fide_id)).fetchone()[0]
            profile = dict(row) if row else {"fide_id": fide_id, "name": ranked["name"],
                                              "federation": ranked["federation"], "federation_basis": "fide-rating-list"}
            profile.update({"games": games, "flag": country(profile["federation"])[1],
                            "official_rating": ranked["rating"] if ranked else None,
                            "rating_month": "September 2026" if ranked else None})
            self.json_response(profile); return
        if path == "/api/federations":
            q = p.get("q", "").upper()[:3]
            rows = db.execute("SELECT code,games,flag FROM federations WHERE code LIKE ? ORDER BY games DESC LIMIT 30", (q + "%",))
            self.json_response([dict(r) | {"flag": country(r["code"])[1]} for r in rows]); return
        if path == "/api/games":
            self.list_games(db, p); return
        if path == "/api/tournaments":
            self.list_tournaments(db, p); return
        tournament = re.fullmatch(r"/api/tournaments/(\d+)", path)
        if tournament:
            self.tournament_detail(db, int(tournament.group(1))); return
        match = re.fullmatch(r"/api/games/(\d+)(/pgn)?", path)
        if match:
            self.game_detail(db, int(match.group(1)), bool(match.group(2))); return
        self.json_response({"error": "Unknown endpoint"}, 404)

    def list_games(self, db, p):
        where, args = [], []
        status = p.get("status", "all")
        if status not in STATUS:
            raise ValueError("Invalid status")
        if status != "all":
            where.append("g.status=?"); args.append(status)
        first = safe_int(p.get("from"), 0, 0, 2100)
        last = safe_int(p.get("to"), 2100, 0, 2100)
        if first > last:
            raise ValueError("Start year is later than end year")
        if first:
            where.append("g.year>=?"); args.append(first)
        if last < 2100:
            where.append("g.year<=?"); args.append(last)
        for key, operator in (("date_from", ">="), ("date_to", "<=")):
            value = p.get(key, "")
            if value:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                    raise ValueError("Date must be in YYYY-MM-DD format")
                where.append(f"g.played_on{operator}?"); args.append(value)
        event_id = p.get("event_id", "")
        if event_id.isdigit():
            where.append("g.event_id=?"); args.append(int(event_id))
        elif p.get("event", "").strip():
            query = fts_query(p["event"][:80])
            if query:
                where.append("g.event_id IN (SELECT rowid FROM events_fts WHERE events_fts MATCH ?)")
                args.append(query)
        player = p.get("player_id", "")
        color = p.get("color", "both")
        if color not in {"both", "white", "black"}:
            raise ValueError("Invalid color")
        if player.isdigit():
            field = {"white": "white_id", "black": "black_id"}.get(color)
            if field:
                where.append(f"g.id IN (SELECT id FROM games WHERE {field}=?)")
                args.append(int(player))
            else:
                where.append("g.id IN (SELECT id FROM games WHERE white_id=? UNION SELECT id FROM games WHERE black_id=?)")
                args.extend([int(player)] * 2)
        elif p.get("player", "").strip():
            term = "%" + p["player"][:80].lower().strip().replace("%", "\\%").replace("_", "\\_") + "%"
            if color == "white":
                where.append("lower(g.white_name) LIKE ? ESCAPE '\\'"); args.append(term)
            elif color == "black":
                where.append("lower(g.black_name) LIKE ? ESCAPE '\\'"); args.append(term)
            else:
                where.append("(lower(g.white_name) LIKE ? ESCAPE '\\' OR lower(g.black_name) LIKE ? ESCAPE '\\')")
                args.extend([term, term])
        federation = p.get("federation", "").upper()
        if federation:
            if not re.fullmatch(r"[A-Z]{3}", federation):
                raise ValueError("Federation must be a three-letter code")
            field = {"white": "white_fed", "black": "black_fed"}.get(color)
            def federation_branch(column):
                parts, values = [f"{column}=?"], [federation]
                if status != "all":
                    parts.append("status=?"); values.append(status)
                if first:
                    parts.append("year>=?"); values.append(first)
                if last < 2100:
                    parts.append("year<=?"); values.append(last)
                return "SELECT id FROM games WHERE " + " AND ".join(parts), values
            if field:
                branch, values = federation_branch(field)
                where.append(f"g.id IN ({branch})")
                args.extend(values)
            else:
                white, white_args = federation_branch("white_fed")
                black, black_args = federation_branch("black_fed")
                where.append(f"g.id IN ({white} UNION {black})")
                args.extend(white_args + black_args)
        result = p.get("result", "")
        if result:
            if result not in {"1-0", "0-1", "1/2-1/2", "*"}:
                raise ValueError("Invalid result")
            where.append("g.result=?"); args.append(result)
        source_kind = p.get("source", "")
        if source_kind:
            if source_kind not in {"fide-official", "broadcast"}:
                raise ValueError("Invalid source")
            where.append("g.source_kind=?"); args.append(source_kind)
        minimum_rating = safe_int(p.get("min_rating"), 0, 0, 3500)
        if minimum_rating:
            where.append("g.white_rating>=? AND g.black_rating>=?")
            args.extend([minimum_rating, minimum_rating])
        eco = p.get("eco", "").strip().upper()[:3]
        if eco:
            if not re.fullmatch(r"[A-E][0-9]{0,2}", eco):
                raise ValueError("ECO must be A–E followed by up to two digits")
            upper = eco[:-1] + chr(ord(eco[-1]) + 1)
            where.append("g.id IN (SELECT id FROM games INDEXED BY games_eco WHERE eco>=? AND eco<?)")
            args.extend([eco, upper])
        opening = p.get("opening", "").strip()[:80]
        if opening:
            term = "%" + opening.lower().replace("%", "\\%").replace("_", "\\_") + "%"
            where.append("lower(g.opening) LIKE ? ESCAPE '\\'"); args.append(term)
        clause = " WHERE " + " AND ".join(where) if where else ""
        sort = SORT.get(p.get("sort", "newest"), SORT["newest"])
        limit = safe_int(p.get("limit"), 24, 1, 60)
        page = safe_int(p.get("page"), 1, 1, 100000)
        count = db.execute("SELECT count(*) FROM games g" + clause, args).fetchone()[0]
        query = """SELECT g.id,g.played_on,g.year,g.round,g.white_name,g.black_name,g.white_id,g.black_id,
                   g.white_fed,g.black_fed,g.white_rating,g.black_rating,g.result,g.status,g.opening,g.eco,
                   g.ply_count,g.source_kind,ev.name AS tournament FROM games g
                   JOIN events ev ON ev.id=g.event_id""" + clause + " ORDER BY " + sort + " LIMIT ? OFFSET ?"
        rows = [dict(r) for r in db.execute(query, args + [limit, (page - 1) * limit])]
        for row in rows:
            row["white_flag"] = country(row["white_fed"])[1]
            row["black_flag"] = country(row["black_fed"])[1]
        self.json_response({"total": count, "page": page, "limit": limit, "games": rows})

    def list_tournaments(self, db, p):
        q = p.get("q", "").strip()[:80]
        page = safe_int(p.get("page"), 1, 1, 100000)
        limit = safe_int(p.get("limit"), 30, 1, 60)
        sort = p.get("sort", "games")
        order = "ev.games DESC,ev.name" if sort != "name" else "ev.name_fold,ev.id"
        where, args = "", []
        if q:
            match = fts_query(q)
            if match:
                where = " WHERE ev.id IN (SELECT rowid FROM events_fts WHERE events_fts MATCH ?)"
                args.append(match)
        total = db.execute("SELECT count(*) FROM events ev" + where, args).fetchone()[0]
        rows = db.execute("SELECT ev.id,ev.name,ev.games FROM events ev" + where +
                          " ORDER BY " + order + " LIMIT ? OFFSET ?", args + [limit, (page - 1) * limit])
        self.json_response({"total": total, "page": page, "limit": limit, "tournaments": [dict(r) for r in rows]})

    def tournament_detail(self, db, event_id):
        item = db.execute("SELECT id,name,games FROM events WHERE id=?", (event_id,)).fetchone()
        if not item:
            self.json_response({"error": "Tournament not found"}, 404); return
        summary = db.execute("""SELECT min(played_on) AS first_date,max(played_on) AS last_date,
                    count(DISTINCT year) AS years,count(DISTINCT source_id) AS sources,
                    sum(result='1-0') AS white_wins,sum(result='0-1') AS black_wins,
                    sum(result='1/2-1/2') AS draws FROM games WHERE event_id=?""", (event_id,)).fetchone()
        years = [dict(r) for r in db.execute("""SELECT year,count(*) AS games FROM games
                    WHERE event_id=? AND year IS NOT NULL GROUP BY year ORDER BY year DESC LIMIT 30""", (event_id,))]
        self.json_response(dict(item) | dict(summary) | {"years": years})

    def game_detail(self, db, game_id, pgn):
        item = db.execute("""SELECT g.*,ev.name AS tournament FROM games g
                             JOIN events ev ON ev.id=g.event_id WHERE g.id=?""", (game_id,)).fetchone()
        if not item:
            self.json_response({"error": "Game not found"}, 404); return
        with connect_readonly(self.corpus_path) as corpus:
            record = corpus.execute("SELECT * FROM games WHERE source_id=? AND member=? AND ordinal=?",
                                    (item["source_id"], item["member"], item["ordinal"])).fetchone()
            if not record:
                self.json_response({"error": "Source record not found"}, 404); return
            source = json.loads(corpus.execute("SELECT metadata_json FROM sources WHERE id=?",
                                               (item["source_id"],)).fetchone()[0])
            if pgn:
                headers = json.loads(record["headers_json"])
                headers["Source"] = source["url"]
                exported = dict(record) | {"headers_json": json.dumps(headers)}
                self.text_response(export_pgn(exported) + "\n", "application/x-chess-pgn; charset=utf-8", f"chessscope-{game_id}.pgn")
                return
            headers = json.loads(record["headers_json"])
            try:
                board = chess.Board(record["start_fen"] or chess.STARTING_FEN)
            except ValueError:
                board = chess.Board()
            moves = []
            states = [board.fen()]
            for index, token in enumerate(record["moves_uci"].split()):
                move = chess.Move.from_uci(token)
                if move not in board.legal_moves:
                    break
                san = board.san(move)
                board.push(move)
                moves.append({"san": san, "uci": token, "ply": index + 1,
                              "label": f"{index // 2 + 1}." + (".." if index % 2 else ""),
                              "fen": board.fen()})
                states.append(board.fen())
            result = dict(item)
            result.update({"headers": headers, "moves": moves, "initial_fen": states[0],
                           "reasons": json.loads(item["reasons_json"]),
                           "source_url": source.get("url"), "license": source.get("license"),
                           "source_sha256": source.get("sha256"),
                           "white_flag": country(item["white_fed"])[1],
                           "black_flag": country(item["black_fed"])[1]})
            self.json_response(result)


def serve(library, corpus, port=8765):
    if not Path(library).is_file() or not Path(corpus).is_file():
        raise FileNotFoundError("Build data/library.sqlite first; data/corpus.sqlite is also required")
    if not (DIST / "index.html").is_file():
        raise FileNotFoundError("Build frontend first: cd frontend && npm ci && npm run build")
    Handler.library_path, Handler.corpus_path = library, corpus
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"ChessScope library: http://127.0.0.1:{port}", flush=True)
    httpd.serve_forever()
