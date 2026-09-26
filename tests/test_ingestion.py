import bz2
import gzip
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

import chess.pgn
import zstandard

from ingestion.acquire import atomic_json, sha256
from ingestion.fide import extract_fide_pgn, import_ratings
from ingestion.pgn import MainlineVisitor, read_records
from ingestion.qualify import classify, export, qualify, report
from ingestion.store import connect, ingest, parse_source, record_key

PGN = '''[Event "Synthetic Test"]
[Site "Vienna"]
[Date "2026.01.17"]
[Round "1"]
[White "Alpha, One"]
[Black "Beta, Two"]
[WhiteFideId "101"]
[BlackFideId "202"]
[WhiteElo "9999"]
[BlackElo "9999"]
[Result "1/2-1/2"]

1. e4 {a comment} e5 (1... c5) 2. Nf3 Nc6 1/2-1/2
'''


def record(pgn=PGN):
    return chess.pgn.read_game(io.StringIO(pgn), Visitor=MainlineVisitor)


class ParsingTests(unittest.TestCase):
    def test_mainline_only(self):
        parsed = record()
        self.assertEqual(parsed["moves"], "e2e4 e7e5 g1f3 b8c6")
        self.assertEqual(parsed["errors"], [])

    def test_illegal_move_is_not_silently_accepted(self):
        self.assertTrue(record(PGN.replace("Nc6 1/2", "Qh5 1/2"))["errors"])

    def test_null_move_rejected(self):
        self.assertIn("null_move", record(PGN.replace("Nc6 1/2", "-- 1/2"))["errors"])

    def test_unterminated_scoresheet(self):
        self.assertIn("missing_or_conflicting_result_token", record(PGN.rstrip().removesuffix("1/2-1/2"))["errors"])

    def test_empty_scoresheet(self):
        self.assertIn("no_moves", record(PGN.split("1. e4")[0] + "1/2-1/2")["errors"])

    def test_partial_date_uses_exact_utcdate(self):
        from ingestion.pgn import game_date
        self.assertEqual(game_date({"Date": "2026.??.??", "UTCDate": "2026.01.17"}), "2026-01-17")
        self.assertIsNone(game_date({"Date": "2026.02.30"}))

    def test_nonstandard_start_is_rejected(self):
        pgn = PGN.replace('[Result "1/2-1/2"]', '[Result "1/2-1/2"]\n[SetUp "1"]\n[FEN "8/8/8/8/8/8/4K3/7k w - - 0 1"]')
        self.assertIn("not_standard_initial_position", record(pgn)["errors"])

    def test_compressed_formats_and_concatenated_zstd_frames(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for suffix, payload in [
                (".pgn", PGN.encode()), (".pgn.gz", gzip.compress(PGN.encode())),
                (".pgn.bz2", bz2.compress(PGN.encode())),
                (".pgn.zst", zstandard.ZstdCompressor().compress(PGN.encode())),
            ]:
                path = root / ("test" + suffix)
                path.write_bytes(payload)
                self.assertEqual(len(list(read_records(path))), 1)
            path = root / "concat.pgn.zst"
            path.write_bytes(zstandard.ZstdCompressor().compress((PGN + "\n").encode()) * 2)
            self.assertEqual(len(list(read_records(path))), 2)
            path = root / "members.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("nested/b.pgn", PGN)
                archive.writestr("a.pgn", PGN)
            rows = list(read_records(path))
            self.assertEqual([(x[0], x[1]) for x in rows], [("a.pgn", 1), ("nested/b.pgn", 1)])

    def test_dedup_does_not_collapse_different_games_or_incomplete_identity(self):
        a = record()
        key = record_key(a, "s1", "a.pgn", 1)
        self.assertEqual(key, record_key(a, "s2", "b.pgn", 9))
        b = record(PGN.replace('2026.01.17', '2026.01.18'))
        self.assertNotEqual(key, record_key(b, "s1", "a.pgn", 2))
        b = record(PGN.replace('[WhiteFideId "101"]', ''))
        self.assertNotEqual(record_key(b, "s1", "a.pgn", 1), record_key(b, "s2", "a.pgn", 1))

    def test_fide_html_trailer_is_explicit_transformation(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, out = Path(directory)/"raw.pgn", Path(directory)/"clean.pgn"
            raw.write_text(PGN + '\n<!DOCTYPE html>\n<html>not a game</html>')
            meta = extract_fide_pgn(raw, out)
            self.assertGreater(meta["removed_bytes"], 0)
            self.assertNotEqual(meta["original_sha256"], meta["sha256"])
            self.assertEqual(len(list(read_records(out))), 1)
            self.assertIn('<html>', raw.read_text())


class EligibilityTests(unittest.TestCase):
    def setUp(self):
        self.row = {"headers_json": json.dumps(record()["headers"]), "errors_json": "[]",
                    "played_on": "2026-01-17", "white_id": 101, "black_id": 202,
                    "result": "1/2-1/2"}
        self.event = {"fide_event_id": "9", "start_date": "2026-01-01", "end_date": "2026-01-31",
                      "pgn_event_names": ["Synthetic Test"], "pgn_sites": ["Vienna"],
                      "rating_type": "standard", "otb": True, "hybrid": False,
                      "player_ids": [101, 202], "fide_report_url": "https://ratings.fide.com/report.phtml?event=9",
                      "evidence_sha256": {"report": "fixture"}}
        self.ratings = {101: {"name": "Alpha, One", "standard_rating": 1801},
                        202: {"name": "Beta, Two", "standard_rating": 2200}}

    def check(self, **options):
        return classify(self.row, {}, [self.event], lambda m, p: self.ratings.get(p), **options)

    def test_official_evidence_accepts_even_without_pgn_time_control(self):
        self.assertEqual(self.check()[0], "accepted")

    def test_1800_is_excluded_and_pgn_elo_is_not_authority(self):
        self.ratings[101]["standard_rating"] = 1800
        self.assertEqual(self.check()[0], "rejected")
        self.assertEqual(self.check(rating_scope="either")[0], "accepted")

    def test_unknown_rating_is_not_a_current_rating_fallback(self):
        del self.ratings[101]
        self.assertEqual(self.check()[0], "quarantine")

    def test_name_id_mismatch(self):
        self.ratings[101]["name"] = "Different Person"
        self.assertIn("white_identity_name_mismatch", self.check()[1])

    def test_unregistered_broadcast_is_not_official(self):
        self.event["pgn_event_names"] = ["Other event"]
        self.assertIn("unverified_official_event", self.check()[1])

    def test_same_named_event_elsewhere(self):
        self.event["pgn_sites"] = ["Elsewhere"]
        self.assertEqual(self.check()[0], "quarantine")

    def test_hybrid_and_rapid(self):
        self.event["hybrid"] = True
        self.assertEqual(self.check()[0], "quarantine")
        self.event["rating_type"] = "rapid"
        self.assertEqual(self.check()[0], "rejected")

    def test_roster_is_required(self):
        self.event["player_ids"] = [101]
        self.assertIn("players_not_verified_in_event_roster", self.check()[1])

    def test_corrupt_or_unfinished_game(self):
        self.row["errors_json"] = '["illegal SAN"]'
        self.assertEqual(self.check()[0], "rejected")
        self.row["errors_json"] = '[]'
        self.row["result"] = '*'
        self.assertEqual(self.check()[0], "rejected")


class PersistenceTests(unittest.TestCase):
    def test_incomplete_manifest_cannot_look_like_full_ingestion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atomic_json(root/'manifest.json', {"complete": False, "sources": []})
            with self.assertRaisesRegex(ValueError, 'incomplete'):
                ingest(root/'manifest.json', root/'db.sqlite', 1)

    def test_changed_source_atomically_replaces_old_occurrences(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root/'game.pgn'; path.write_text(PGN)
            source = {"id": "test", "path": str(path), "sha256": sha256(path)}
            manifest = root/'manifest.json'; atomic_json(manifest, {"sources": [source]})
            ingest(manifest, root/'db.sqlite', 1)
            path.write_text(PGN.replace('2026.01.17', '2026.01.18'))
            source['sha256'] = sha256(path)
            atomic_json(manifest, {"sources": [source]})
            ingest(manifest, root/'db.sqlite', 1)
            with connect(root/'db.sqlite') as db:
                self.assertEqual(db.execute('select count(*) from games').fetchone()[0], 1)
                self.assertEqual(db.execute('select played_on from games').fetchone()[0], '2026-01-18')

    def test_ingestion_resume_export_and_checksum_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pgn = root / "source.pgn"
            pgn.write_text(PGN + "\n" + PGN)
            source = {"id": "test", "path": str(pgn), "sha256": sha256(pgn),
                      "url": "https://example.org/synthetic.pgn", "license": "CC0"}
            manifest = root / "manifest.json"
            atomic_json(manifest, {"sources": [source]})
            db_path = root / "corpus.sqlite"
            ingest(manifest, db_path, 1)
            ingest(manifest, db_path, 1)
            with connect(db_path) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM games').fetchone()[0], 2)
                self.assertEqual(db.execute('SELECT count(DISTINCT game_key) FROM games').fetchone()[0], 1)
            source["sha256"] = "0" * 64
            with self.assertRaises(ValueError):
                parse_source(source, root / "shards")
            events = root / "events.json"
            fixture = EligibilityTests(); fixture.setUp()
            atomic_json(events, {"events": [fixture.event]})
            with connect(db_path) as db:
                for player, rating in fixture.ratings.items():
                    db.execute("INSERT INTO ratings VALUES (?,?,?,?,?,?)", ('2026-01', player, rating['name'], rating['standard_rating'], 'fixture', 'fixture'))
            self.assertEqual(qualify(db_path, events)["accepted"], 2)
            self.assertEqual(export(db_path, root / "out.pgn"), 1)
            self.assertEqual(report(db_path, root / "report.json")["accepted_unique_games"], 1)
            exported = list(read_records(root / "out.pgn"))
            self.assertEqual(exported[0][2]["errors"], [])
            self.assertEqual(exported[0][2]["headers"]["WhiteElo"], "1801")
            self.assertEqual(exported[0][2]["headers"]["SourceWhiteElo"], "9999")

    def test_fide_fixed_width_and_wrong_month(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            header = 'ID Number      Name                                                         Fed Sex Tit  WTit OTit           FOA JAN26 Gms K  B-day Flag\n'
            row = f'{101:<15}{"Alpha, One":<61}{"AUT":<4}{"M":<33}{1801:<6}{1:<4}{20:<3}{1990:<6}\n'
            archive = root / 'ratings.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('standard_jan26frl.txt', header + row)
            url = 'https://ratings.fide.com/download/standard_jan26frl.zip'
            self.assertEqual(import_ratings(root/'db.sqlite', archive, '2026-01', url), 1)
            with self.assertRaisesRegex(ValueError, 'period mismatch'):
                import_ratings(root/'db.sqlite', archive, '2026-02', url)


if __name__ == '__main__':
    unittest.main()
