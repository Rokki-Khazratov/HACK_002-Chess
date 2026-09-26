# Data, identity, and source rights

**Status:** sourcing guidance, not legal advice. Read the detailed [ChessScope corpus feasibility](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/research/05-billion-game-corpus-feasibility.md) and [data licensing policy](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/research/03-data-sources-and-licensing.md) before importing anything at scale.

## The two-corpus rule

1. **Professional OTB/broadcast corpus:** permissioned tournament games, attributable source, event/date/time control, and reliable player identity. This is what opponent preparation needs.
2. **Online corpus:** open or otherwise authorized account games, separately labeled. It is useful for broad position statistics and a long-term billion-game index, but a username is not a verified FIDE player and blitz usage is not classical OTB repertoire.

Never combine these into one unlabeled “all player games” number. Every displayed statistic needs its corpus, filters, sample size, source, and freshness. PGN is a file format, not permission to redistribute a commercial database.

## Candidate sources

| Source | What it can provide | Important boundary |
|---|---|---|
| [FIDE rating-list downloads](https://ratings.fide.com/download_lists.phtml) | Official IDs, title/federation/rating observations | Not a bulk PGN archive; review downstream usage |
| [Lichess broadcasts](https://database.lichess.org/#broadcasts) | Event/broadcast PGNs, possible OTB sample | Separate CC BY-SA class; audit IDs, event type, attribution |
| [Lichess standard database](https://database.lichess.org/) | Massive CC0 online-game corpus | Not automatic FIDE identity or tournament coverage |
| [Chess.com PubAPI](https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it) | Public on-demand account/game data | Not a blanket bulk redistribution license |
| [The Week in Chess](https://theweekinchess.com/twic) | Weekly PGN/event reference | Personal-use terms: get permission before shared commercial ingestion |
| [ChessBase Mega Database](https://shop.chessbase.com/en/products/mega_database_2026) | Commercial benchmark | Retail access does not grant SaaS corpus rights |

The Lichess database page listed over eight billion standard rated online games in the [2026-09-26 research snapshot](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/research/05-billion-game-corpus-feasibility.md). That is a dated online-game count, **not** eight billion FIDE-linked OTB games or an already-built ChessScope index. Refresh public counts before pitching them as current.

## Demo-source checklist

For each game shown, keep: original source URL or file; retrieval date; license/permission class; event/date/time control; white/black identity evidence; original PGN; and any correction/uncertainty flag. If the PGN only has a player name, do not assert a verified FIDE match. Use a small permitted sample and show `N eligible games in this demo corpus` rather than “complete opponent history.”

External product/API candidates and their source-specific questions are collected in [ChessScope's integration catalog](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/integrations/INTEGRATION_OSINT_CATALOG.md). [References](08-references.md) gives the compact link map.
