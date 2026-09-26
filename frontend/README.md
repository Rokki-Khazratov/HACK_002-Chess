# ChessScope web — analysis board

React + TypeScript (Vite) analysis workspace modelled on [Chess.com Analysis](https://www.chess.com/analysis): board with eval bar, engine lines, opening name, move tree with variations, navigation, and a slot for the board-aware coach chat.

## Run

```bash
cd frontend
npm install
npm run dev      # copies the Stockfish WASM build into public/stockfish, then starts Vite
npm test         # move tree, PGN import/export, openings, UCI parsing
npm run build
```

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
