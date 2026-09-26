# Local game library

This small, read-only browser is an inspection tool for the **existing** imported corpus. It does not acquire more games. It displays all imported records after conservative deduplication and keeps the ingestion classification visible on every row.

## Launch

From the repository root, with the ingestion environment installed and `data/corpus.sqlite` present:

```bash
.venv/bin/python -m pip install -r requirements-ingestion.txt
.venv/bin/python -m library build
.venv/bin/python -m library serve
```

Open <http://127.0.0.1:8765>. The first build creates `data/library.sqlite`, a local derived index. Rebuild it after changing the corpus. The server binds to `127.0.0.1` and opens the corpus read-only. Neither large database is committed to Git.

The build also reads `data/raw/standard_sep26frl.zip`, the September 2026 FIDE Standard rating list already acquired during this phase. The ZIP is a snapshot for **current federation labels**, not proof of historical nationality, game identity, classical time control, or OTB status. Federation values from PGN tags are labeled as such; unresolved federations have no flag.

## What can be inspected

- Search a player by name or FIDE ID; select white, black, or either color.
- Search tournaments by name, filter by year range and federation, and sort by date or tournament.
- Switch between all records, accepted, quarantine, and rejected. The accepted group is the strict FIDE/official/OTB/classical/above-1800 subset as defined by the ingestion policy.
- Open a game to step through its legal moves, inspect ratings, IDs, source link, classification reasons, and download its PGN.

The catalog uses conservative `game_key` deduplication. Counts therefore represent catalog games, not raw imported occurrences. Many broadcast records are not proven official OTB classical games. A generic event name can be enriched from an available broadcast or study name, but that display name is not treated as official event evidence. Search counts and flag labels are for review, not a claim of global completeness.

The interface is intentionally standalone HTML/CSS/JavaScript with a Python standard-library HTTP server and SQLite read-only queries. It is a temporary review surface, not the future production frontend or API.
