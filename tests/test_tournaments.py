import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from library import tournaments
from library.build import SCHEMA
from library.tournaments import (category, event_detail, expected_score, list_events, performance,
                                 rating_change, standings)
from library.server import fts_query, safe_int


def game(white, black, result, white_rating=2500, black_rating=2500, played_on="2026-01-01", round_="1"):
    return {"white_id": white, "black_id": black, "white_name": f"P{white}", "black_name": f"P{black}",
            "white_fed": "AUT", "black_fed": "GER", "white_rating": white_rating, "black_rating": black_rating,
            "result": result, "round": round_, "played_on": played_on}


class RatingMathTests(unittest.TestCase):
    def test_expected_score_caps_the_difference_at_400(self):
        self.assertAlmostEqual(expected_score(2500, 2500), 0.5)
        self.assertAlmostEqual(expected_score(2000, 2700), expected_score(2000, 2400))

    def test_rating_change_uses_fide_k_factors(self):
        self.assertAlmostEqual(rating_change(2500, [(2500, 1)]), 5.0)
        self.assertAlmostEqual(rating_change(2300, [(2300, 0)]), -10.0)

    def test_performance_and_category(self):
        self.assertEqual(performance([2600, 2600], 1), 2600)
        self.assertEqual(performance([2600], 1), 3400)
        self.assertIsNone(performance([], 0))
        self.assertIsNone(category(2250))
        self.assertEqual(category(2251), 1)
        self.assertEqual(category(2675), 17)
        self.assertEqual(category(2676), 18)


class StandingsTests(unittest.TestCase):
    def test_points_ties_and_rating_change_balance(self):
        games = [game(1, 2, "1-0"), game(3, 4, "1/2-1/2"), game(2, 3, "0-1", round_="2"), game(4, 1, "1/2-1/2", round_="2"),
                 game(5, 6, "*")]
        people = {p["fide_id"]: p for p in standings(games, {1: "GM"})}
        self.assertEqual((people[1]["points"], people[1]["wins"], people[1]["draws"]), (1.5, 1, 1))
        self.assertEqual(people[1]["title"], "GM")
        self.assertEqual(people[1]["rank"], 1)
        self.assertEqual(people[3]["rank"], 1)  # Same points and Buchholz share the place.
        self.assertEqual(people[5]["games"], 0)  # An unfinished game counts for nothing.
        self.assertAlmostEqual(sum(p["rating_change"] or 0 for p in people.values()), 0, places=6)
        self.assertEqual(people[1]["live_rating"], 2505)

    def test_pre_event_rating_is_the_earliest_game(self):
        games = [game(1, 2, "1-0", white_rating=2410, played_on="2026-01-02"),
                 game(2, 1, "0-1", black_rating=2400, played_on="2026-01-01")]
        people = {p["fide_id"]: p for p in standings(games, {})}
        self.assertEqual(people[1]["event_rating"], 2400)


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        root = Path(self.tmp.name)
        self.library = root / "library.sqlite"
        db = sqlite3.connect(self.library)
        db.executescript(SCHEMA)
        rows = [(1, "Alpha Open", 2, "broadcast", "quarantine", "2025-05-01"), (2, "Beta Masters", 1, "fide-official", "accepted", "2026-02-01")]
        for event_id, name, games, kind, status, day in rows:
            db.execute("INSERT INTO events VALUES (?,?,?,?)", (event_id, name, name.lower(), games))
            for n in range(games):
                db.execute("""INSERT INTO games (game_key,event_id,played_on,year,round,white_name,black_name,white_id,black_id,
                              white_rating,black_rating,result,status,reasons_json,ply_count,source_id,member,ordinal,source_kind)
                              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'[]',40,'s','m',?,?)""",
                           (f"{event_id}-{n}", event_id, day, int(day[:4]), str(n + 1), f"Player {n}", f"Rival {n}",
                            100 + n, 200 + event_id, 2300 + 200 * event_id, 2400, "1-0", status, n, kind))
        db.executescript("""CREATE VIRTUAL TABLE events_fts USING fts5(name_fold,content='events',content_rowid='id');
                            INSERT INTO events_fts(events_fts) VALUES ('rebuild');""")
        db.commit()
        db.close()
        self.db = sqlite3.connect(self.library)
        self.db.row_factory = sqlite3.Row
        details = root / "details.json"
        details.write_text(json.dumps({"events": [{"names": ["Beta Masters"], "prize_fund": {
            "amount": 10000, "currency": "EUR", "note": None, "source_url": "https://example.org"}}]}))
        self.patches = [(tournaments, "EVENT_DETAILS", details), (tournaments, "VERIFIED_EVENTS", root / "none.json")]
        self.saved = [(module, name, getattr(module, name)) for module, name, _ in self.patches]
        for module, name, value in self.patches:
            setattr(module, name, value)
        tournaments._index_cache.clear()

    def tearDown(self):
        for module, name, value in self.saved:
            setattr(module, name, value)
        self.db.close()
        self.tmp.cleanup()

    def names(self, **params):
        result = list_events(self.db, self.library, None, params, fts_query, safe_int)
        return [t["name"] for t in result["tournaments"]]

    def test_list_filters_and_sorts(self):
        self.assertEqual(self.names(), ["Alpha Open", "Beta Masters"])
        self.assertEqual(self.names(sort="avg_elo"), ["Beta Masters", "Alpha Open"])
        self.assertEqual(self.names(q="beta"), ["Beta Masters"])
        self.assertEqual(self.names(player="101"), ["Alpha Open"])
        self.assertEqual(self.names(player="rival"), ["Alpha Open", "Beta Masters"])
        self.assertEqual(self.names(year_from="2026"), ["Beta Masters"])
        self.assertEqual(self.names(min_players="3"), ["Alpha Open"])
        self.assertEqual(self.names(source="fide-official"), ["Beta Masters"])
        self.assertEqual(self.names(status="accepted"), ["Beta Masters"])
        with self.assertRaises(ValueError):
            self.names(sort="bogus")

    def test_detail_has_standings_average_and_curated_prize(self):
        detail = event_detail(self.db, None, 2)
        self.assertEqual(detail["prize_fund"]["amount"], 10000)
        self.assertEqual([p["name"] for p in detail["participants"]], ["Player 0", "Rival 0"])
        self.assertEqual(detail["avg_elo"], 2550)
        self.assertEqual(detail["participants"][0]["points"], 1.0)
        self.assertIsNone(event_detail(self.db, None, 99))


if __name__ == "__main__":
    unittest.main()
