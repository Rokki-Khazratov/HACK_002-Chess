# References and source-of-truth map

This is the short navigation layer for the hackathon. ChessScope's [full documentation index at the pinned revision](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/README.md) contains the complete TЗ, backend/database design, research, and roadmap. Links below intentionally point to a fixed commit so the context used here is reproducible; consult ChessScope `main` for later changes.

## ChessScope source documents

| Need | Detailed source |
|---|---|
| Professional target user, workflow, release boundaries | [Professional coach first release](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/product/05-professional-coach-release.md) |
| Hackathon slice and later phase order | [Professional release slices](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/delivery/03-professional-release-slices.md) |
| Workspace state, named variations, chat tools | [Coach and variation state](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/architecture/10-coach-chat-variation-state.md) |
| Stockfish on a VPS and capacity | [Engine execution](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/architecture/08-engine-on-vps.md) |
| Exact-position lookup and scaling | [Position search](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/architecture/09-position-search-at-billion-scale.md) |
| Corpus feasibility and OTB/online distinction | [Billion-game corpus research](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/research/05-billion-game-corpus-feasibility.md) |
| Source policy and provider inventory | [Licensing guidance](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/research/03-data-sources-and-licensing.md), [integration catalog](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/integrations/INTEGRATION_OSINT_CATALOG.md) |
| Later production engineering | [System design](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/backend/SYSTEM_DESIGN.md), [database design](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/backend/DATABASE_DESIGN.md) |

## External primary links and benchmarks

- [FIDE ratings/downloads](https://ratings.fide.com/download_lists.phtml) — official player/rating anchor, not PGNs.
- [Lichess open database](https://database.lichess.org/) — standard online dumps, broadcasts, evaluations, and license notes.
- [Lichess opening-explorer implementation](https://github.com/lichess-org/lila-openingexplorer) — architectural benchmark for large position indexes.
- [Stockfish repository](https://github.com/official-stockfish/Stockfish) and [UCI documentation](https://github.com/official-stockfish/Stockfish/wiki/UCI-Protocol-and-Stockfish-Commands) — engine integration and licensing reference.
- [Chess.com Analysis](https://www.chess.com/analysis) — functional board benchmark; no reuse of visual assets.
- [Chess.com PubAPI guidance](https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it) — conservative public-account integration reference.
- [ChessBase Mega Database 2026](https://shop.chessbase.com/en/products/mega_database_2026) — commercial database benchmark, not an ingestion license.
- [2700Chess](https://2700chess.com/) and [Take Take Take](https://www.taketaketake.com/) — live-rating and player-card UX benchmarks; no production API or reuse permission is assumed.
- [The Week in Chess](https://theweekinchess.com/twic) — event/PGN reference; seek permission for shared commercial use.

Provider features, terms, corpus counts, and prices can change. Recheck them before production use or a public claim. The source links are evidence and context, not instructions to scrape or copy a third-party product.
