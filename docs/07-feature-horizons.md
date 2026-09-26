# Feature horizons: demo, release, platform

This is a map of intent, not a commitment that every feature will be built at HACK_002. Use [product context](01-product-context.md) for the user story and the [detailed ChessScope roadmap](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/delivery/03-professional-release-slices.md) for dependencies.

| Surface | Hackathon demonstration | First professional release | Later ChessBase-class platform |
|---|---|---|---|
| Entry | Landing, demo sign-in/checkout if feasible and labeled | Real auth, paid entitlement, dashboard, billing | Teams, coaching organizations, richer plans |
| Player card | One sourced FIDE identity, ratings, limited games | FIDE search, aliases, title/federation/rating history, coverage, achievements, representative OTB games | More feeds, verified portraits, richer live/event data where licensed |
| Opponent prep | One credible sample report | Ten-minute progressive briefing, color/time-control/opening filters, source games, gaps | New round feeds, repertoire-change detection, batch/team reports |
| Board | Legal moves, notation, 2+ named branches | Persistent chapters/PGN, comments, nested tree, arrows, position explorer | Collaborative studies, local/private data workflows, publishing tools |
| Engine | One bounded Stockfish result | VPS worker pool, queue, cache, profiles, progress, cancel | Multi-host fleet, advanced tablebases, local engine option |
| Coach chat | One historical query and one board-bound explanation | Typed tools, source citations, node memory, line previews and user-approved branch proposals | More specialized planning/teaching workflows and evaluations |
| Game corpus | Small permitted OTB/broadcast sample | Curated FIDE-linked OTB index; online cohort kept separate | Larger licensed OTB portfolio and staged 100M–1B+ online corpus |

The player card should feel like a modern sports profile—not a loose search result. But every field (rating, photo, achievement, recent game, tendency) needs a source and a freshness/coverage policy. [ChessScope's integration and OSINT catalog](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/integrations/INTEGRATION_OSINT_CATALOG.md) includes [2700Chess](https://2700chess.com/) and [Take Take Take](https://www.taketaketake.com/) as benchmarks, not presumed data providers.

The first professional release is still a significant product. The hackathon should demonstrate its highest-risk loop, then make missing parts obvious instead of presenting a small dataset as complete. See [demo flow](02-demo-flow.md), [data rights](05-data-and-rights.md), and [open decisions](06-decisions-and-handoff.md).
