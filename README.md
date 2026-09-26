# HACK_002 Chess — ChessScope professional-coach prototype

This repository is the HACK_002 Vienna hackathon workspace for a focused ChessScope demonstration. The idea is **not** a lightweight helper for Chess.com or Lichess accounts: it is a first, honest slice of an AI-native research and analysis workspace for FIDE-rated over-the-board players and coaches.

The long-term product is a modern, ChessBase-class platform. The hackathon goal is much narrower: demonstrate the loop from a real FIDE player and attributable games to a chessboard, a historical position query, a bounded engine line, and a board-aware coaching conversation. The `parsing-DB` branch adds an executable, tested [database ingestion phase](docs/09-database-parsing.md) and a [local game library](docs/10-game-library.md) for examining the imported corpus. The production web application and payment integration remain unimplemented.

## The problem in one minute

A ~2500 FIDE player learns the next opponent after a round at a Swiss tournament. They have little time to identify the right player, inspect recent over-the-board games and opening choices, prepare a concrete line, and understand *why* it works. Existing tools split player records, game databases, engines, move trees, and explanations across several workflows.

ChessScope should connect those pieces. A user opens an opponent by **FIDE ID**, sees the actual games and coverage behind the report, explores a position on the board, and asks a coach in the right-hand chat: “How did this player respond here as Black?” or “What happens if I trade the knights?” The answer is attached to the selected node and may preview a line; it must not silently overwrite the user's saved analysis.

## What the hackathon should prove

```text
FIDE ID → sourced player card → eligible game sample → analysis board
        → exact-position lookup → Stockfish line → evidence-backed coach
        → user-approved, named variation
```

Use a small **real and permitted** game sample. Label missing games, uncertain identity matches, simulated steps, and any provider test-mode checkout. A convincing demo does not require a billion-game index or a production-quality ten-minute report. It does require a believable professional workflow and a clear distinction between historical facts, engine suggestions, and AI explanation.

The intended product journey is `landing → auth → payment → dashboard → web app`; pricing, payment provider, and what is truly implemented for the hackathon remain open. The target stack direction is React/TypeScript, Python/Django REST Framework, PostgreSQL, background workers, and Stockfish on a VPS—but this repository does not yet commit to implementation details.

## Read the context

1. [Product and user](docs/01-product-context.md) — target player, value, first-release boundaries.
2. [Hackathon demo flow](docs/02-demo-flow.md) — the small end-to-end story and honesty rules.
3. [Workspace and coach](docs/03-workspace-and-coach.md) — board, variation tree, chat, evidence.
4. [Technical picture](docs/04-technical-picture.md) — components and data paths, without a full TЗ.
5. [Data and source rights](docs/05-data-and-rights.md) — FIDE, OTB games, online games, licensing.
6. [Decisions and handoff](docs/06-decisions-and-handoff.md) — what is fixed, what is still open.
7. [Feature horizons](docs/07-feature-horizons.md) — demo, professional release, and later platform.
8. [References](docs/08-references.md) — pinned ChessScope source documents and external links.
9. [Database parsing phase](docs/09-database-parsing.md) — acquisition, validation, official evidence, strict filtering and measured coverage.
10. [Local game library](docs/10-game-library.md) — browse tournaments, players, years, federations, verification status and PGNs.

The detailed product, architecture, backend, database, and phased specifications live in [ChessScope at the source revision used for this summary](https://github.com/Rokki-Khazratov/ChessScope/tree/3a990511f91aad55285270953179285a61df7b69). This repo deliberately links to that context instead of copying a large TЗ that would go stale.

## Non-negotiable distinctions

- **FIDE identity is not a game database.** Official FIDE records anchor the player card; separately sourced PGNs supply moves.
- **Online games are not OTB games.** Lichess's open corpus can support scale later, but it cannot by itself prove an opponent's tournament repertoire.
- **Stockfish is not history.** The engine evaluates candidate lines; indexed games answer what a player actually played.
- **The LLM is not the source of truth.** Legal moves, counts, ratings, and citations come from typed services and are checked.
- **Coverage is visible.** Never imply “all games” if the corpus only contains a sample.

The functional board reference is [Chess.com Analysis](https://www.chess.com/analysis); the implementation must use its own UI and assets. See the [professional first-release vision in ChessScope](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/product/05-professional-coach-release.md) for the full concept.
