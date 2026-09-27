"""Engine-owned variations and a bounded, model-owned explanation contract."""
import json
import re

import chess

from .contracts import CoachError

KINDS = {"white_plan", "black_plan", "advantages", "risks", "next_steps", "answer"}


def engine_lines(context):
    selected = context.get("board", {})
    result = []
    for index, line in enumerate(selected.get("engine", {}).get("lines", [])[:5]):
        try:
            board = chess.Board(selected["fen"])
            pv = line["pv"]
            if not pv or line["depth"] < 1:
                continue
            notation = []
            for token in pv:
                move = chess.Move.from_uci(token)
                if move not in board.legal_moves:
                    raise ValueError("Illegal PV")
                prefix = f"{board.fullmove_number}." if board.turn else (f"{board.fullmove_number}..." if not notation else "")
                notation.append(prefix + board.san(move))
                board.push(move)
            result.append({"id": f"pv{index + 1}", "rank": index + 1, "fen": selected["fen"],
                           "source": "Stockfish 19", "depth": line["depth"], "score": line["score"],
                           "scorePerspective": "white", "uci": pv, "notation": " ".join(notation)})
        except (ValueError, KeyError, TypeError):
            continue
    return result


def position_facts(context):
    if not context.get("board"):
        return None
    board = chess.Board(context["board"]["fen"])
    return {"turn": "white" if board.turn else "black", "check": board.is_check(),
            "checkmate": board.is_checkmate(), "stalemate": board.is_stalemate(),
            "material": {name: {chess.piece_name(piece): len(board.pieces(piece, color))
                         for piece in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)}
                         for name, color in (("white", chess.WHITE), ("black", chess.BLACK))}}


def clean_text(value, maximum=900):
    if not isinstance(value, str) or len(value) > maximum:
        raise ValueError("Invalid explanation text")
    return re.sub(r"[\u00a0\u202f\u2009]", " ", value).replace("\u200b", "").strip()


def parse_explanation(raw, lines):
    try:
        data = json.loads(raw)
        summary = clean_text(data["summary"])
        if not summary:
            raise ValueError("Empty summary")
        sections = data["sections"]
        descriptions = data["lineExplanations"]
        if not isinstance(sections, list) or len(sections) > 6 or not isinstance(descriptions, list) or len(descriptions) > 5:
            raise ValueError("Invalid sections")
        clean_sections = []
        for section in sections:
            kind, items = section["kind"], section["items"]
            if kind not in KINDS or not isinstance(items, list) or not 1 <= len(items) <= 4:
                raise ValueError("Invalid section")
            clean_sections.append({"kind": kind, "title": clean_text(section["title"], 100),
                                   "items": [clean_text(item, 600) for item in items]})
        allowed = {line["id"] for line in lines}
        explanations = {}
        for item in descriptions:
            if item["lineId"] not in allowed or item["lineId"] in explanations:
                raise ValueError("Unknown or duplicate engine reference")
            explanations[item["lineId"]] = clean_text(item["text"], 700)
        return {"summary": summary, "sections": clean_sections, "lineExplanations": explanations}
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise CoachError("The coach returned an invalid explanation. Please retry; engine lines have not been changed.", 502) from exc


def explanation_markdown(analysis, lines):
    parts = [analysis["summary"]]
    for section in analysis["sections"]:
        parts.append("### " + section["title"] + "\n\n" + "\n".join(f"{i + 1}. {item}" for i, item in enumerate(section["items"])))
    for line in lines:
        parts.append(f"### Stockfish · {line['id']} · depth {line['depth']}\n\n{line['notation']}\n\n" + analysis["lineExplanations"].get(line["id"], ""))
    return "\n\n".join(parts)


def present_turn(turn):
    # Preserve the complete engine snapshot for interactive exploration.
    analysis = turn.get("analysis")
    cited = {line["id"] for line in engine_lines(turn["context"])} if analysis else set()
    if not analysis and re.search(r"\b(?:\d+\.(?:\.\.)?\s*[KQRBNa-hO]|Stockfish|pv\s*=)", turn.get("reply", ""), re.I):
        cited = {line["id"] for line in engine_lines(turn["context"])}
    return {**turn, "engineLines": [line for line in engine_lines(turn["context"]) if line["id"] in cited],
            "positionFacts": turn.get("positionFacts", position_facts(turn["context"]))}
