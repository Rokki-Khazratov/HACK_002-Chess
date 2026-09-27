"""Completed turns and immutable context snapshots in a separate local database."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3


class ConversationStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS coach_turns (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL, request_id TEXT NOT NULL,
                    request_hash TEXT NOT NULL, turn_json TEXT NOT NULL,
                    UNIQUE(conversation_id,request_id)
                );
                CREATE INDEX IF NOT EXISTS coach_history ON coach_turns(conversation_id,sequence);
                CREATE TABLE IF NOT EXISTS coach_preparations (
                    id TEXT PRIMARY KEY, updated REAL NOT NULL, draft_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS coach_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def find(self, conversation_id, request_id):
        with self.connect() as db:
            row = db.execute("SELECT request_hash,turn_json FROM coach_turns WHERE conversation_id=? AND request_id=?",
                             (conversation_id, request_id)).fetchone()
        return (row[0], json.loads(row[1])) if row else None

    def preparations(self):
        with self.connect() as db:
            rows = db.execute("SELECT draft_json FROM coach_preparations ORDER BY updated DESC").fetchall()
        return [json.loads(row[0]) for row in rows]

    def save_preparations(self, drafts):
        with self.connect() as db:
            for draft in drafts:
                db.execute("""INSERT INTO coach_preparations(id,updated,draft_json) VALUES (?,?,?)
                    ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,draft_json=excluded.draft_json
                    WHERE excluded.updated >= coach_preparations.updated""",
                    (draft["id"], draft["updated"], json.dumps(draft, ensure_ascii=False)))

    def active_preparation(self):
        with self.connect() as db:
            row = db.execute("SELECT value_json FROM coach_settings WHERE key='active_preparation'").fetchone()
        return json.loads(row[0]) if row else None

    def select_preparation(self, preparation):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO coach_settings(key,value_json) VALUES ('active_preparation',?)",
                       (json.dumps(preparation, ensure_ascii=False),))

    def history(self, conversation_id, limit=100):
        with self.connect() as db:
            rows = db.execute("SELECT turn_json FROM coach_turns WHERE conversation_id=? ORDER BY sequence DESC LIMIT ?",
                              (conversation_id, limit)).fetchall()
        return [json.loads(row[0]) for row in reversed(rows)]

    def conversations(self):
        with self.connect() as db:
            rows = db.execute("""SELECT t.conversation_id,t.turn_json FROM coach_turns t
                JOIN (SELECT conversation_id,MAX(sequence) AS latest FROM coach_turns GROUP BY conversation_id) latest
                ON latest.latest=t.sequence ORDER BY t.sequence DESC""").fetchall()
        result = []
        for row in rows:
            turn = json.loads(row[1])
            context = turn.get("context") or {}
            game_id = context.get("gameId") or (row[0].split(":")[1] if row[0].startswith("game:") else None)
            board_source = context.get("boardSource")
            title = f"Game #{game_id}" if game_id else ("Board analysis" if board_source == "analysis" else "Chess chat")
            result.append({"id": row[0], "title": title, "createdAt": turn.get("createdAt", "")})
        return result

    def clone(self, source_id, target_id, context):
        history = self.history(source_id)
        with self.connect() as db:
            for index, turn in enumerate(history, start=1):
                turn["id"] = f"clone:{target_id}:{index}"
                turn["conversationId"] = target_id
                turn["createdAt"] = datetime.now(timezone.utc).isoformat()
                db.execute("INSERT INTO coach_turns(conversation_id,request_id,request_hash,turn_json) VALUES (?,?,?,?)",
                           (target_id, turn["id"], "cloned", json.dumps(turn, ensure_ascii=False)))

    def seed_demo(self, conversation_id, turn):
        """Persist a clearly labeled synthetic showcase turn for the local demo."""
        turn = {**turn, "conversationId": conversation_id, "demo": True}
        request_id = str(turn.get("id", "demo"))
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO coach_turns(conversation_id,request_id,request_hash,turn_json) VALUES (?,?,?,?)",
                       (conversation_id, request_id, "local-demo", json.dumps(turn, ensure_ascii=False)))

    def save(self, request, fingerprint, result, version):
        turn = {"id": request["requestId"], "conversationId": request["conversationId"],
                "action": request["action"], "blueprintVersion": version,
                "message": request["message"], "context": request["context"],
                "createdAt": datetime.now(timezone.utc).isoformat(), **result}
        with self.connect() as db:
            db.execute("INSERT INTO coach_turns(conversation_id,request_id,request_hash,turn_json) VALUES (?,?,?,?)",
                       (request["conversationId"], request["requestId"], fingerprint, json.dumps(turn, ensure_ascii=False)))
        return turn
