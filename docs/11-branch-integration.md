# Branch integration — 2026-09-26

All branch tips below are included in the integrated history. The implementation combines their features instead of replacing the workspace with one branch's entire version.

| Source | Tip | Features preserved |
| --- | --- | --- |
| `board` | `dcf48b6` | Legal moves, click/drag board, promotion, Stockfish analysis, PGN/FEN import and export, variation editing, line chooser, shortcuts, mock game |
| `parsing-DB` | `e0fbcc3` | FIDE/PGN ingestion, source qualification, SQLite corpus and search library, games/tournaments/player profiles, rankings, 136-move study |
| `ilia-frontend` | `3908411` | Board settings, 14 piece choices including glass, 12 board themes and custom colours, coordinates, animation, highlights, optional evaluation bar, Git graph and pill tree styles, drag/keyboard fixes |
| `ilia-board-ui` | `4cab319` | Per-position coloured squares and arrows, modifier colours, PGN `[%csl]` / `[%cal]` round trips; includes all of `ilia-frontend` |
| `ui-variants` | `a748f1b` | Classic, Obsidian, Paper, Timeline and Pro layouts; layout persistence and `?ui=` selection |
| Existing `main` | `579c5ce` | Resizable/hideable coach panel, move-quality estimates, improved navigation and player strips |

Local work present during integration is also preserved: compact graph rows, readable Focus, the Prepare screen, and the Cerebras chat endpoint. Credentials and local databases remain outside Git.

## How overlapping features are combined

- **Workspace** remains the default layout with resizable panels. The **Layout** selector exposes the other five layouts in production; the original floating selector is retained in development.
- Every layout uses the same move tree, current position, Stockfish instance, board settings, drawn shapes and move-quality estimates. Changing the layout does not reset the game.
- Both tree styles use compact rows, quality glyphs, Focus, 1:1, Fit, pan and zoom. Named lines retain their original labels and colours.
- Obsidian and Timeline show a separate tree dock alongside the move list. Keyboard line navigation also works in those modes.
- The settings dialog controls the board in all layouts. Palette CSS does not overwrite the chosen board and pieces.
- Global shortcuts yield to text fields, selects, resize handles, settings and promotion dialogs. This preserves keyboard resizing after adopting capture-phase board shortcuts.

## Validation

- Production TypeScript/Vite build and Oxlint pass.
- Frontend suite: 26 tests, including tree editing, compact lanes, move quality, settings and annotation import/export.
- Python ingestion suite: 23 tests.
- Browser checks: all six layouts retain the 575-position / 56-variation study; Stockfish produces lines; piece settings and evaluation-bar visibility apply; right-click marks toggle; no console errors observed during those checks.

## Existing limitations

- Coach requests use `CEREBRAS_API_KEY` and optional `CEREBRAS_MODEL` (default `gpt-oss-120b`). The chat passes the current FEN but does not perform database or engine tool calls. Live provider responses were not exercised during integration.
- Prepare provides saved local conversations and library search; its analytical report is still a placeholder.
- Ratings are the September 2026 snapshot. Corpus databases and generated portraits are local assets.
- The production build reports a bundle-size warning for the analysis module; it does not prevent the build.
