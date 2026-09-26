# Product context: who this is for

**Status:** direction for the hackathon, not a feature-complete specification. Start at the [repository README](../README.md); the detailed product decision is in [ChessScope's professional release document](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/product/05-professional-coach-release.md).

## Product thesis

ChessScope is a professional, AI-native chess research workspace in the ChessBase class. The first reference user is a titled or near-GM **over-the-board** player preparing for an unfamiliar opponent between rounds. A FIDE ID and attributable tournament games matter more than a scraped online username. A coach should also be able to use the same workspace with a student.

The player needs one workflow for: confirming identity; seeing ratings and a sourced game sample; finding opening and position tendencies by color, date, and time control; exploring lines with an engine; and asking a context-aware coach about the current position. The coach should explain plans and show legal moves on the board, not just produce prose.

## First-release shape versus hackathon slice

| Area | Intended professional release | Hackathon proof |
|---|---|---|
| Journey | Landing → account → paid entitlement → dashboard → app | Show the journey; clearly label test-mode or simulated parts |
| Identity | FIDE-first search and player card with match confidence | One or a few real FIDE IDs and clear source links |
| Games | Curated, permissioned OTB corpus with visible coverage | Small, permitted, attributable PGN sample |
| Board | Persistent studies, legal moves, named nested variations | One saved board with at least two branches |
| Intelligence | Exact historical search + bounded engine + evidence-backed coach | One example of each, with limits shown |
| Opponent report | Progressive, source-linked briefing targeted within ten minutes | Credible sample briefing; do not claim complete coverage |

The demonstration should not be marketed as “all games for any FIDE player,” a billion-game index, an exhaustive strategic solver, or a finished paid SaaS. The long-term data and engine assumptions are documented in [ChessScope's release slices](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/delivery/03-professional-release-slices.md).

## Three user questions that define the experience

1. “How did Magnus Carlsen (or this opponent) respond in this exact position as Black?” — answer from indexed games, with dates/opponents and a `no exact match` state. A transposition or similar structure is separately labeled.
2. “Can I exchange the knights and reach an opposite-colored-bishop ending?” — engine-backed candidate lines plus a deterministic board-state check. One possible line is **not** a forced plan.
3. “How do I use the open d-file and defend the c-file?” — coordinate-aware explanation, arrows or highlights, concrete legal lines, and optionally relevant model games.

These examples and their evidence rules come from the [board-synchronized coach design](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/architecture/10-coach-chat-variation-state.md). The visual-function benchmark is [Chess.com Analysis](https://www.chess.com/analysis), not a license to clone its assets or styling.
