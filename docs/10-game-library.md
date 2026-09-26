# Local game library

This small, read-only browser is an inspection tool for the **existing** imported corpus. It does not acquire more games. It displays all imported records after conservative deduplication and keeps the ingestion classification visible on every row.

## Launch

From the repository root, with the ingestion environment installed and `data/corpus.sqlite` present:

```bash
.venv/bin/python -m pip install -r requirements-ingestion.txt
.venv/bin/python -m library build
cd frontend && npm ci && npm run build && cd ..
.venv/bin/python -m library serve
```

Open <http://127.0.0.1:8765>. The first build creates `data/library.sqlite`, a local derived index. Rebuild it after changing the corpus. The server binds to `127.0.0.1` and opens the corpus read-only. Neither large database is committed to Git.

The build also reads `data/raw/standard_sep26frl.zip`, the September 2026 FIDE Standard rating list already acquired during this phase. The ZIP is a snapshot for **current federation labels**, not proof of historical nationality, game identity, classical time control, or OTB status. Federation values from PGN tags are labeled as such; unresolved federations have no flag.

## What can be inspected

- Search a player by name or FIDE ID; select white, black, or either color.
- Filter by event name, year, exact date range, federation, result, minimum Elo for both players, ECO, opening and source type; sort by date, event, rating or game length.
- Browse a separate tournament index, filtered by name, player, location, years, average Elo, player count, source and verified classical status, and sorted by games, date, average Elo, players or name.
- Open an event for its location, dates, time control, rounds, average Elo and FIDE category, and a participant table: place, points, W/D/L, Buchholz, rating at the event, the latest imported official FIDE rating, a live rating (event rating plus the FIDE rating change over these games) and performance. Standings are computed from the imported games and can differ from official ones when games are missing.
- Prize funds, venues and organizers are not in PGNs or FIDE reports. Add them by hand to `sources/event-details.json`, always with a public `source_url`; without an entry the page says the prize fund is not listed.
- In development, `npm run dev` proxies `/api` to the library server on port 8765.
- Open a game in a new browser tab on the analysis board from the `board` branch. Its source PGN is loaded into the move tree; the board keeps engine, variations and navigation.

The catalog uses conservative `game_key` deduplication. Counts therefore represent catalog games, not raw imported occurrences. Many broadcast records are not proven official OTB classical games. **Classification stays in the database for audit, but is hidden in the browsing UI.** Do not interpret every visible game as FIDE-approved. A generic event name can be enriched from an available broadcast or study name, but that display name is not treated as official event evidence. Search counts and flag labels are for review, not a claim of global completeness.

The interface is the React board application merged from the `board` branch, with the archive and tournaments sharing its visual system. The Python standard-library HTTP server serves its production build and the SQLite read-only API. It binds to loopback only. This remains a local review surface, not a deployed service.
