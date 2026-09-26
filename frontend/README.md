# ChessScope web — archive and analysis board

React + TypeScript (Vite) workspace: searchable game archive, tournament pages and the analysis board with engine lines, move tree, variations and navigation.

## Run

```bash
cd frontend
npm install
npm run dev      # copies the Stockfish WASM build into public/stockfish, then starts Vite
npm test         # move tree, PGN import/export, openings, UCI parsing
npm run build
```

The archive needs the local Python server and its SQLite corpus. From the repository root, run `.venv/bin/python -m library build` (once), `npm run build` in this directory, then `.venv/bin/python -m library serve`. Open <http://127.0.0.1:8765>. Game rows open a new tab with the source PGN loaded into the board. See [library documentation](../docs/10-game-library.md).

## What is here

| Area | File | Notes |
|---|---|---|
| Move tree | `src/chess/tree.ts` | Stable node IDs, `children[0]` = main line; add / promote / delete variations; PGN export with nested variations |
| PGN import | `src/chess/pgn.ts` | Keeps nested variations (chess.js `loadPgn` drops them); also accepts a bare FEN |
| Openings | `src/chess/openings.ts`, `src/data/openings.json` | 3,815 named positions from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0), matched by EPD so transpositions resolve. Rebuild with `npm run openings` |
| Engine | `src/engine/stockfish.ts` | Stockfish 19 lite single-thread WASM in a Web Worker (no COOP/COEP headers needed), MultiPV 3, depth 22. Scores converted to White's point of view |
| Board | `src/components/AnalysisBoard.tsx` | [react-chessboard](https://github.com/Clariity/react-chessboard) v5: drag or click-click, legal-move dots, last move, check, best-move arrow, promotion picker |
| Tree graph | `src/components/TreeView.tsx`, `src/chess/layout.ts` | Pan (drag), zoom (wheel, +/−, Fit), click a node to jump; lines get lanes, letters and colours shared with the move list |
| Move list | `src/components/MoveList.tsx` | Figurine notation, collapsible coloured side lines, nested forks in place |
| Coach slot | `src/components/ChatPanel.tsx` | Placeholder; receives the current FEN |

### Keyboard

| Keys | Action |
|---|---|
| ← / → | Previous / next move; → at a fork opens the line chooser (↑/↓ pick, → or Enter follow, Esc close) |
| Ctrl + ↑ / ↓ | Neighbouring line at the closest fork, same depth |
| Ctrl + ← / → | Back to the fork this line came from / forward to the next fork |
| Home / End | Start / end of current line |
| T | Moves ↔ Tree |
| F | Flip board |
| ? | Shortcut help |

Right-click a move (list or graph) to name the line, make it the main continuation, or delete it. Clicking an engine line plays it into the tree.

## Licences

App code: MIT (repo licence). Stockfish (`node_modules/stockfish`, copied to `public/stockfish` with its `Copying.txt`) is GPL-3.0 and runs as a separate worker program. Opening names: CC0.
