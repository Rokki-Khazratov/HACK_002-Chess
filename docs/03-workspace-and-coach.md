# Analysis workspace and board-aware coach

**Status:** interaction contract at context level. The detailed state model is [ChessScope's coach/variation design](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/architecture/10-coach-chat-variation-state.md); the visual reference is [Chess.com Analysis](https://www.chess.com/analysis).

## One workspace, not three disconnected tools

The desktop layout places the board alongside a move tree, engine/database evidence, and a right-hand coaching chat. The user can drag a piece, navigate backward, create a branch, compare branches, and keep talking. Every chat turn refers to an **active variation node** and exact legal position.

```text
board + highlights  |  notation / named branches / evidence  |  coach chat
selected node ID ────────────────────────────────────────────────┘
```

The saved source of truth is a tree: study → chapter/root position → legal move nodes. Each node has a stable ID, parent, move, resulting position, and optional branch name, comments, arrows, and evidence links. Two routes can reach the same position via transposition but remain different study paths. The AI's context is assembled from the selected node, named branch directory, relevant chat history, and retrieved evidence; it is **not** preserved only inside an LLM context window.

## What the coach can do

| Request | Deterministic source | Chat output |
|---|---|---|
| “What did this player play here?” | Player identity + exact-position game index | Counts, games, next moves, coverage, links |
| “What is the best line?” | Stockfish job with position, budget, version | Evaluation and legal principal variation, explained |
| “Can I reach this ending?” | Candidate lines + explicit material/position goal checker | Example or robust candidate; “forced” only with defensible proof |
| “Why is this file important?” | Board geometry + engine + relevant games | Coordinate-aware plan, counterplay, highlights |

The engine does not know who played a move historically; the games do. The LLM does not decide move legality or official ratings. See [VPS engine execution](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/architecture/08-engine-on-vps.md).

## Safety of board interaction

- Chat can stream text, source-game cards, engine updates, and ephemeral board previews.
- A proposed line becomes a saved variation **only after the user accepts it**. It must be checked for legal moves and applied to the node/revision it was proposed for.
- If the user navigates or moves a piece while the reply streams, old events remain attached to the old node. They must not overwrite the newly selected position.
- If the source data is thin, the coach says so. If the player match is ambiguous, it asks for a FIDE ID or choice.
- Imported PGN comments and web pages are evidence/data, not instructions to the AI.

For the hackathon, implement only enough of this model to prove the [demo story](02-demo-flow.md). Do not replace durable branch IDs with chat-only prose even if the corpus is tiny.
