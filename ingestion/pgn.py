"""Streaming PGN validation. Comments and variations remain in the raw archive."""
import bz2
import gzip
import io
import json
import lzma
import re
import unicodedata
import zipfile
from contextlib import contextmanager
from datetime import date
from pathlib import Path

import chess
import chess.pgn
import zstandard


def normalize_name(value):
    value = unicodedata.normalize("NFKD", value).casefold()
    return " ".join(re.findall(r"[^\W_]+", "".join(c for c in value if not unicodedata.combining(c))))


def game_date(headers):
    # A partial Date must not shadow an exact UTCDate.
    for field in ("Date", "UTCDate"):
        try:
            return date.fromisoformat(headers.get(field, "").replace(".", "-")).isoformat()
        except ValueError:
            pass
    return None


def fide_id(value):
    return int(value) if re.fullmatch(r"[1-9][0-9]{0,11}", value or "") else None


@contextmanager
def text_streams(path, encoding="utf-8-sig"):
    """Yield members in stable order. ZIP files are never extracted to disk."""
    path = Path(path)
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            names = sorted(n for n in archive.namelist() if n.lower().endswith(".pgn"))
            if not names:
                raise ValueError(f"No PGN members in {path}")
            def members():
                for name in names:
                    with archive.open(name) as raw, io.TextIOWrapper(raw, encoding=encoding) as stream:
                        yield name, stream
            yield members()
    else:
        if path.suffix == ".zst":
            raw = zstandard.ZstdDecompressor().stream_reader(path.open("rb"), read_across_frames=True, closefd=True)
        elif path.suffix == ".gz":
            raw = gzip.open(path, "rb")
        elif path.suffix == ".bz2":
            raw = bz2.open(path, "rb")
        elif path.suffix == ".xz":
            raw = lzma.open(path, "rb")
        elif path.suffix.lower() == ".pgn":
            raw = path.open("rb")
        else:
            raise ValueError(f"Unsupported format {path.suffix}; convert Scid/CBH/SQLite/7z to PGN first")
        with raw, io.TextIOWrapper(raw, encoding=encoding) as stream:
            yield iter([(path.name, stream)])


class MainlineVisitor(chess.pgn.BaseVisitor):
    """Avoid building an object tree or storing engine comments for each move."""
    def begin_game(self):
        self.headers = {}
        self.moves = []
        self.errors = []
        self.start_fen = None
        self.end_result = None
        self.terminal_result = None

    def visit_header(self, tagname, tagvalue):
        if tagname in self.headers:
            self.errors.append("duplicate_header:" + tagname)
        self.headers[tagname] = tagvalue

    def begin_variation(self):
        return chess.pgn.SKIP

    def visit_board(self, board):
        if self.start_fen is None:
            self.start_fen = board.fen()
            if type(board) is not chess.Board or board.chess960 or board.fen() != chess.STARTING_FEN:
                self.errors.append("not_standard_initial_position")

    def visit_move(self, board, move):
        if not move:
            self.errors.append("null_move")
        self.moves.append(move.uci())

    def visit_result(self, result):
        self.end_result = result

    def handle_error(self, error):
        self.errors.append(str(error))

    def result(self):
        declared = self.headers.get("Result", "*")
        if self.end_result != declared:
            self.errors.append("missing_or_conflicting_result_token")
        if not self.moves:
            self.errors.append("no_moves")
        return {"headers": self.headers, "moves": " ".join(self.moves),
                "start_fen": self.start_fen, "result": declared, "errors": self.errors}


def read_records(path, encoding="utf-8-sig"):
    with text_streams(path, encoding) as streams:
        for member, stream in streams:
            ordinal = 0
            while True:
                record = chess.pgn.read_game(stream, Visitor=MainlineVisitor)
                if record is None:
                    break
                ordinal += 1
                yield member, ordinal, record


def export_pgn(record):
    headers = json.loads(record["headers_json"])
    game = chess.pgn.Game()
    game.headers.update(headers)
    node = game
    for uci in record["moves_uci"].split():
        node = node.add_variation(chess.Move.from_uci(uci))
    return game.accept(chess.pgn.StringExporter(headers=True, variations=False, comments=False))
