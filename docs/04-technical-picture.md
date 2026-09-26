# Technical picture, without a full implementation spec

**Status:** target direction. This is intentionally smaller than [ChessScope's system design](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/backend/SYSTEM_DESIGN.md) and [database design](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/backend/DATABASE_DESIGN.md).

## Main components

```text
React/TypeScript web app
   ├─ board, notation, named branches, chat, opponent card
   └─ API calls / progress stream
Python + Django REST Framework API
   ├─ auth, entitlement, player/game/study/search endpoints
   ├─ coach orchestration with typed tools and evidence checks
   └─ background-job submission
PostgreSQL ── users, FIDE identities, games/metadata, studies, jobs, provenance
Object storage ── raw PGNs, snapshots, large artifacts
Workers ── PGN import/indexing; Stockfish via UCI on CPU VPS; report generation
Cache/queue ── disposable hot results and durable async work
```

This is a modular monolith plus isolated workers, not a requirement to create many microservices during a hackathon. The detailed production direction mentions Celery, RabbitMQ, Redis, and S3-compatible storage; whether all appear in the prototype is an open scope choice. [Source architecture](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/architecture/01-system-overview.md).

## Two different position questions

**Historical lookup:** validate the selected position, derive an exact position key, intersect indexed occurrences with a FIDE player, color, time control, date, and eligible corpus, then return bounded game references and counts. Never scan every PGN for each prompt. A popular opening position needs precomputed aggregates or bounded postings. [Position-search design](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/architecture/09-position-search-at-billion-scale.md).

**Engine analysis:** create/cache a bounded job for the exact position. A dedicated VPS worker runs Stockfish as a supervised UCI child process, reads score and legal principal variations, and publishes progress. The API/UI remain responsive. Cache identity includes engine version, settings, and budget. Capacity depends on simultaneous searches, not total registered users. [Engine design](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/architecture/08-engine-on-vps.md), [official UCI commands](https://github.com/official-stockfish/Stockfish/wiki/UCI-Protocol-and-Stockfish-Commands).

## Scale path, not a hackathon promise

PostgreSQL can support canonical entities and an initial small position index. At very large scale, use benchmark results to decide whether a separate compact/sharded position store is needed. Raw PGNs and their source rights stay distinct from derived indexes. Do **not** deeply run Stockfish on every move of a billion-game archive; parse/index games, then analyze selected critical positions. [Billion-game feasibility](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/research/05-billion-game-corpus-feasibility.md).

The intended commercial route uses a verified payment event to grant access; a return URL alone is not entitlement. Pricing/provider are not selected. See [professional first release](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/product/05-professional-coach-release.md). For what to show now, use the [demo flow](02-demo-flow.md).
