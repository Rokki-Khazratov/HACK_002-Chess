# Phase DB-1: FIDE-linked official OTB classical corpus

Branch: `parsing-DB` (Git ref names cannot contain spaces).

The requested outcome is the most complete obtainable database of official,
over-the-board classical games by FIDE-rated players above 1800. This is a
separate data phase; it does not implement the analysis app, Stockfish or coach.

## Acceptance contract

The default threshold is **strictly greater than 1800 for both players**. The
`--rating-scope either` option changes the threshold rule to either player.
This default is an implementation assumption pending user clarification.

A strict accepted record needs all of:

1. A completed, nonempty standard-chess mainline from the normal starting position,
   parsed without reported errors or null moves. Variations are skipped; original
   comments, variations and clocks remain available in the retained raw archive.
2. An exact game date within a verified event's date interval.
3. Official FIDE event details showing Standard time control and Hybrid NO, plus
   a completed Standard rating report. Names such as "Masters" or "OTB" alone
   establish nothing. The source-bound FIDE download or an exact event/site/date
   match must identify the event, without ambiguity.
4. Both FIDE IDs present in the official event roster and both exact normalized
   names matching the corresponding historical standard rating list. No fuzzy
   name matching or present-day rating substitution.
5. Ratings from the FIDE list for the month of the game satisfying the configured
   threshold. PGN `WhiteElo` / `BlackElo` values are retained as source claims,
   not used as proof of an official standard rating.

These rules operationalize "official" as a FIDE-rated Standard event. The PGN
may come directly from FIDE or from an attributed archive once the event is
verified. A future FIDE-only source restriction can be applied independently.

Unknown evidence goes into `quarantine`. Known invalid/uncompleted scoresheets
or failed rating thresholds go into `rejected`. Neither is exported by the
strict exporter. These are occurrence-level decisions; repeated copies remain
traceable to their original source/member/ordinal.

## Sources selected and limits discovered

- **Official FIDE PGNs do exist at individual event pages.** Event
  [410577](https://ratings.fide.com/tournament_information.phtml?event=410577)
  includes a PGN download, OTB evidence and a Standard rating report. This is not
  evidence that FIDE provides scoresheets for every rated game in one archive.
- [FIDE rating archives](https://ratings.fide.com/download_lists.phtml) supply
  historical identities and Standard ratings. A monthly list is not a game database.
- [Lichess Broadcasts](https://database.lichess.org/#broadcasts) provide an
  enumerable bulk PGN corpus with publisher checksums and CC BY-SA 4.0 terms.
  The 2026-09-26 snapshot has 80 files, January 2020–August 2026, and advertises
  1,235,275 games. Broadcast status does not establish OTB, classical, or FIDE rating.
- [Lumbra's FAQ](https://lumbrasgigabase.com/en/faq-en/) explicitly says
  correspondence games are included and historical time-control data are often
  missing. The [download page](https://lumbrasgigabase.com/en/download-in-pgn-format-en/)
  advertises CC BY-NC-SA 4.0 and a separate licensing contact. Its OTB file cannot
  be treated as the requested validated commercial corpus without further work.
- Other candidates from the supplied research document are retained in
  [the source catalog](../sources/catalog.json). They have not been silently
  treated as official, complete, or approved for redistribution.

## Implemented pipeline

```text
official downloads / attributed PGN archives
  -> checksum-verified local files + source manifest
  -> streaming mainline parser and legal move validation
  -> per-source SQLite shards (completed files reused on restart)
  -> corpus.sqlite: all occurrences, headers, UCI moves, errors, provenance
  -> official event evidence + monthly FIDE ratings
  -> accepted / rejected / quarantine
  -> strict deduplicated PGN export + coverage report
```

Supported input formats: `.pgn`, `.pgn.gz`, `.pgn.bz2`, `.pgn.xz`, `.pgn.zst`,
and ZIP archives with one or more PGN members. Concatenated zstd frames work.
Scid, CBH, En Croissant SQLite binary moves and 7z are explicitly unsupported
until converted to PGN; no binary file is misinterpreted as PGN.

The canonical key is deliberately conservative: date, FIDE IDs, normalized event,
round, initial position, result and complete mainline. Missing identity/date/event
or round, and parse errors, prevent cross-source deduplication. Same openings,
short move prefixes and similar names never cause automatic merging. Different
event aliases or conflicting results can leave duplicate candidates for later review.

Downloads use temporary files and SHA-256 verification. Imports commit completed
source shards atomically. Changed source hashes replace that source's records and
invalidate its eligibility; reimporting a rating month invalidates its decisions.
Run one writer workflow per corpus database. Rating/classification changes require
rerunning qualification and export. Keep dated raw/source-manifest snapshots before
refreshing a source: the cache is not a general historical version store.

FIDE's tested PGN endpoint appends an HTML document after the scoresheets. Its
adapter keeps the original file and records an explicit `strip standalone HTML
trailer` transformation and both checksums. The generic parser never silently
performs this source-specific cleanup.

## Run locally

Requires Python 3.11+. From the repository directory:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-ingestion.txt
.venv/bin/python -m unittest discover -s tests -v

# Download every currently published broadcast month, verifying publisher hashes.
.venv/bin/python -m ingestion fetch-broadcasts
.venv/bin/python -m ingestion ingest --manifest data/broadcast-manifest.json --workers 4

# Reproduce an official FIDE source, evidence and event registry entry.
.venv/bin/python -m ingestion fetch-fide-event --event-id 410577
.venv/bin/python -m ingestion ingest --manifest data/fide-manifest.json
```

To reproduce the precise audited broadcast snapshot instead of the latest list:

```sh
.venv/bin/python -m ingestion fetch-manifest --manifest sources/snapshots/broadcasts-2026-09-26.json
.venv/bin/python -m ingestion ingest --manifest sources/snapshots/broadcasts-2026-09-26.json
```

On a macOS Python installation without configured CA roots, use the system trust
store, for example `SSL_CERT_FILE=/etc/ssl/cert.pem`, for network commands. Do not
disable TLS certificate validation.

Download the historical Standard TXT ZIPs linked from FIDE's archive selector
to `data/raw/`, then import their exact published months:

```sh
.venv/bin/python -m ingestion import-ratings \
  --archive data/raw/standard_jan26frl.zip --month 2026-01 \
  --source-url https://ratings.fide.com/download/standard_jan26frl.zip
.venv/bin/python -m ingestion import-ratings \
  --archive data/raw/standard_feb26frl.zip --month 2026-02 \
  --source-url https://ratings.fide.com/download/standard_feb26frl.zip
.venv/bin/python -m ingestion qualify --events sources/verified-events.json
.venv/bin/python -m ingestion report
.venv/bin/python -m ingestion export
```

Default outputs are `data/corpus.sqlite`, `data/report.json`, `data/accepted.pgn`.
Large datasets, raw downloads, SQLite shards and virtual environments are ignored
by Git. Code, the event registry, source catalog and the compact measured run report
are committed to the branch. The source files remain available locally.

For another permitted PGN archive, write a manifest with `schema_version: 1` and
`sources: [{id, path, url, sha256, license, publisher, retrieved_at}]`, then run
`ingest`. `path` is a local file; optional `encoding` defaults to `utf-8-sig`.
Do not reuse one source ID for unrelated archives. Register verified event evidence
before qualification. All source headers are untrusted data.

## Scope of completeness and remaining work

An import can be complete **relative to a named source snapshot**. It cannot
establish that every eligible game ever played worldwide has a published PGN.
The current run processes the full published broadcast snapshot and a complete
official event PGN. It does not establish complete historical FIDE coverage.

To finish the broad requested corpus phase:

- Enumerate official events across the intended historical range and acquire
  published scoresheets; record events with no downloadable PGN as coverage gaps.
- Expand the event registry and import the relevant historical rating months.
  The initial registry and January/February 2026 ratings cover one reference event.
- Reconcile event/player aliases using attributable evidence; audit conflicting
  metadata, missing dates, partial games and transcriptions. Exact name checks are
  intentionally conservative and can quarantine legitimate spelling variants.
- Resolve use/redistribution conditions for additional bulk collections before
  promoting their data into the product corpus. Public download availability is
  tracked separately from redistribution permission.
- Validate event coverage against official round/pairing results. A result token
  and legal moves alone cannot prove that an entire real game was transcribed.

The phase remains **in progress** until these coverage and evidence gaps are
addressed. See [the measured run](../reports/db-phase-2026-09-26.json) for actual
counts; candidate source marketing totals must not be added together.

## Dependencies and data attribution

The repository's code license does not relicense third-party datasets or libraries.
`chess` 1.11.2 (python-chess) is GPL-3.0-or-later; `zstandard` 0.25.0 has its own
license. Distribution of the combined ingestion program must account for those
terms. Lichess Broadcast-derived data retain CC BY-SA 4.0 attribution/share-alike
requirements. FIDE downloads in this run remain local; redistribution is not
claimed. Exported PGNs include source URL, source license and source checksum.
Exported Elo tags use the verified historical Standard ratings; conflicting
original values are retained as `SourceWhiteElo` / `SourceBlackElo`. The event ID
and rating month are included as well.
