# Hackathon demo flow

**Goal:** make the professional loop understandable in a few minutes. This is a storytelling and scope guide, not a test script or full TЗ. See [product context](01-product-context.md) and [ChessScope's hackathon slice](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/delivery/03-professional-release-slices.md#hackathon-demonstration-within-this-strategy).

## Setup

The presenter is a FIDE-rated player about to face an unfamiliar opponent at an open tournament. Use one real example opponent only after confirming that the available PGNs may be used in the demo. Prepare a small source-attributed corpus and know in advance what percentage of the opponent's known games it covers. The opponent name, FIDE ID, event, and game references must be verifiable.

## Story beats

1. **Entry.** Landing states the professional promise. Login and payment can be provider test mode or explicitly simulated. Never imply a test checkout is production billing.
2. **Identify.** Search by FIDE ID, show title/federation/rating observations and the exact source. If a name maps to several people, choose rather than silently merge.
3. **Brief.** Open a compact opponent card: eligible recent OTB games, filters, opening distribution, 2–3 representative games, and a visible coverage warning. Any “weakness” claim links to supporting games and sample size.
4. **Investigate.** Open a game or candidate line on the board. Move pieces manually; show notation and two named variation branches.
5. **Ask history.** At the active position ask how the opponent or a known grandmaster played as Black. Show exact matches and sources, or explicitly show zero exact matches. Do not substitute Stockfish's top move for a historical answer.
6. **Ask the coach.** Ask why a candidate move works or how to reach a strategic goal. Show a Stockfish line with engine version/budget, then explain in plain language with squares and a board preview.
7. **Save intent.** Accept the coach's suggested legal line into a named branch. Return to the other branch and ask about it by name; the chat must bind to that branch's node, not generic conversation memory.
8. **Close.** Show which parts are real, limited, simulated, and next in the roadmap.

## Demo integrity rules

- All displayed player facts and game moves must be traceable to their source. The [source-and-rights page](05-data-and-rights.md) lists candidate sources.
- Keep FIDE ratings, online ratings, OTB games, broadcast games, and online games visibly separate.
- AI text may explain a retrieved result; it may not invent a game, assert an unverified player match, or call one engine line “forced.”
- A visual board preview may animate, but only an explicit user action saves a variation. See [workspace and coach](03-workspace-and-coach.md).
- If a step is prerecorded or mocked, label it in the demo. The [full product release contract](https://github.com/Rokki-Khazratov/ChessScope/blob/3a990511f91aad55285270953179285a61df7b69/docs/product/05-professional-coach-release.md) remains a future target, not an achieved claim.

## Minimal artifact list for the team

A chosen opponent and source manifest; one source-linked player card; a small imported game set; a board with named branches; one exact historical lookup; one bounded Stockfish result; one cited coaching answer; and a short explanation of coverage and missing pieces. Ownership and implementation schedule are intentionally left open in [decisions and handoff](06-decisions-and-handoff.md).
