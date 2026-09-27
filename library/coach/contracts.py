"""Validate and whitelist client context before it reaches prompts or storage."""
import re

import chess

from .blueprints import ACTIONS


class CoachError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def object_value(value):
    if not isinstance(value, dict):
        raise CoachError("Expected a JSON object")
    return value


def text(value, limit=500):
    if not isinstance(value, str) or len(value) > limit:
        raise CoachError(f"Expected text of at most {limit} characters")
    return value.strip()


def identifier(value):
    value = text(value, 180)
    if not re.fullmatch(r"[a-zA-Z0-9_.:-]{1,180}", value):
        raise CoachError("Invalid conversation or request ID")
    return value


def positive_id(value):
    if type(value) is not int or value <= 0 or value > 2**53 - 1:
        raise CoachError("Invalid library ID")
    return value


def person(value):
    value = object_value(value)
    result = {"name": text(value.get("name", ""), 200)}
    if value.get("fideId") is not None:
        result["fideId"] = positive_id(value["fideId"])
    return result


def validate(payload):
    payload = object_value(payload)
    if payload.get("version") != 1:
        raise CoachError("Unsupported coach request version")
    action = payload.get("action")
    if not isinstance(action, str) or action not in ACTIONS:
        raise CoachError("Unknown coach action")
    result = {"version": 1, "conversationId": identifier(payload.get("conversationId")),
              "requestId": identifier(payload.get("requestId")), "action": action,
              "message": text(payload.get("message", ""), 4000)}
    if action == "ask" and not result["message"]:
        raise CoachError("Message is required")
    raw = object_value(payload.get("context"))
    context = {"sources": {"preparation": "user input", "board": "browser line, legality checked on server"}}
    if raw.get("preparation") is not None:
        p = object_value(raw["preparation"])
        prep = {"id": identifier(p.get("id")), "project": text(p.get("project", ""), 200),
                "opening": text(p.get("opening", ""), 200), "notes": text(p.get("notes", ""), 2000)}
        if p.get("color") not in (None, "white", "black", "unknown"):
            raise CoachError("Invalid preparation color")
        prep["color"] = p.get("color") or "unknown"
        for field in ("player", "opponent"):
            if p.get(field) is not None:
                prep[field] = person(p[field])
        if p.get("plan") is not None:
            plan = object_value(p["plan"])
            if plan.get("status") not in ("draft", "agreed"):
                raise CoachError("Invalid preparation plan status")
            recommendations = plan.get("recommendations", [])
            references = plan.get("sourceReferences", [])
            if not isinstance(recommendations, list) or len(recommendations) > 12 or not isinstance(references, list) or len(references) > 20:
                raise CoachError("Invalid preparation plan")
            clean_plan = {"status": plan["status"], "summary": text(plan.get("summary", ""), 4000),
                          "recommendations": [text(item, 500) for item in recommendations],
                          "sourceReferences": [text(item, 300) for item in references],
                          "updatedAt": text(plan.get("updatedAt", ""), 80)}
            if plan.get("sourceGameId") is not None:
                clean_plan["sourceGameId"] = positive_id(plan["sourceGameId"])
            prep["plan"] = clean_plan
        context["preparation"] = prep
    if raw.get("board") is not None:
        b = object_value(raw["board"])
        moves = b.get("line", [])
        if not isinstance(moves, list) or len(moves) > 600:
            raise CoachError("Selected line is too long")
        try:
            board = chess.Board(text(b.get("rootFen"), 100))
            selected = chess.Board(text(b.get("fen"), 100))
            if not board.is_valid() or not selected.is_valid():
                raise ValueError("Invalid position")
            sans = []
            for token in moves:
                move = chess.Move.from_uci(text(token, 5))
                if move not in board.legal_moves:
                    raise ValueError("Illegal move")
                sans.append(board.san(move))
                board.push(move)
            if board.fen() != selected.fen():
                raise ValueError("Selected line does not reach the supplied FEN")
        except ValueError as exc:
            raise CoachError(f"Invalid board context: {exc}") from exc
        context["board"] = {"nodeId": identifier(b.get("nodeId")), "fen": board.fen(),
                            "rootFen": b["rootFen"], "line": moves, "san": sans,
                            "turn": "white" if board.turn else "black"}
        if b.get("opening"):
            opening = object_value(b["opening"])
            context["board"]["opening"] = {"name": text(opening.get("name", ""), 200),
                "eco": text(opening.get("eco", ""), 8), "source": "browser opening lookup on selected ancestry"}
        engine = b.get("engine")
        # Discard stale analysis. Never attach it to a different position.
        if isinstance(engine, dict) and engine.get("fen") == b["fen"]:
            lines = engine.get("lines", [])
            if not isinstance(lines, list):
                raise CoachError("Invalid engine lines")
            clean = []
            for line in lines[:5]:
                line = object_value(line)
                score = object_value(line.get("score"))
                depth, score_value = line.get("depth"), score.get("value")
                if type(depth) is not int or not 0 <= depth <= 100 or type(score_value) is not int or abs(score_value) > 100000:
                    raise CoachError("Invalid engine score or depth")
                if score.get("kind") not in ("cp", "mate"):
                    raise CoachError("Invalid engine score kind")
                pv = line.get("pv", [])
                if not isinstance(pv, list) or len(pv) > 30:
                    raise CoachError("Invalid engine variation")
                replay = board.copy()
                try:
                    for token in pv:
                        replay.push_uci(text(token, 5))
                except ValueError as exc:
                    raise CoachError("Illegal engine variation") from exc
                clean.append({"depth": depth, "score": {"kind": score["kind"], "value": score_value}, "pv": pv})
            context["board"]["engine"] = {"source": "browser Stockfish, not rerun on server", "scorePerspective": "white", "lines": clean}
    if raw.get("gameId") is not None:
        context["gameId"] = positive_id(raw["gameId"])
    if raw.get("boardSource") is not None:
        source = raw["boardSource"]
        if source not in ("library", "analysis", "import", "demo"):
            raise CoachError("Invalid board source")
        context["boardSource"] = source
        if source != "library":
            context.pop("gameId", None)
    required = ACTIONS[action]["requires"]
    for requirement in required:
        present = context.get(requirement) if requirement != "opponent" else context.get("preparation", {}).get("opponent")
        if not present or (requirement == "opponent" and not (present.get("name") or present.get("fideId"))):
            raise CoachError(f"Select {requirement} before using this action")
    result["context"] = context
    return result
