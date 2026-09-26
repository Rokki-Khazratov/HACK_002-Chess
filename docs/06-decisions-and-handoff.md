# Decisions, open questions, and handoff

This page separates agreed product direction from choices the hackathon team still needs to make. It is **not** a task tracker, schedule, or large technical specification. Start with the [README](../README.md) and [demo flow](02-demo-flow.md).

## Direction already established

- The audience is a FIDE-rated professional/serious OTB player and coach, not primarily an online-account prep user.
- The core differentiation is a source-backed opponent view plus a board-synchronized AI coach that understands named variations.
- The web app follows a landing → auth → payment → dashboard → analysis journey over time. A demo may use clearly labeled test/simulated commerce.
- Player identity, historical moves, engine scores, and AI explanation have separate sources of truth.
- The long-term corpus can include a billion online games, but OTB data quality and rights are a separate problem.
- The ChessScope repository is the [long-form source of truth at this pinned revision](https://github.com/Rokki-Khazratov/ChessScope/tree/3a990511f91aad55285270953179285a61df7b69); this repo stays a short hackathon context layer.

## Decisions before implementation

| Question | Why it matters | Owner/answer |
|---|---|
| Which real player, tournament, and permissioned PGNs form the demo? | Determines whether the report can be truthful | Open |
| Which parts of landing/auth/payment are real, test-mode, or mocked? | Prevents misleading demo claims | Open |
| What minimum board/variation persistence is realistic in hackathon time? | Chat must reference a stable branch, not only text | Open |
| Where will Stockfish run for the demo, and what analysis budget? | Controls latency and compute cost | Open |
| Which AI provider/model and cost ceiling? | Affects typed-tool integration and demo reliability | Open |
| What corpus coverage warning and identity-confidence wording will be shown? | Professional credibility | Open |
| Who reviews licensing/attribution before public display? | Prevents accidental reuse of restricted PGNs/assets | Open |

The [ChessScope professional release slices](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/delivery/03-professional-release-slices.md) are the broader roadmap, not a demand to implement phases P0–P4 during the event. The [full backend plan](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/backend/PHASED_IMPLEMENTATION_PLAN.md) remains available when engineering starts.

## Handoff convention

When code or a decision is added here later, update the narrowest relevant page and mark whether a claim is **implemented**, **demo-only**, **planned**, or **unresolved**. Link to original data/provider terms and the relevant ChessScope design. Do not present a prototype's limited source sample, engine capacity, or payment flow as production-scale evidence.
