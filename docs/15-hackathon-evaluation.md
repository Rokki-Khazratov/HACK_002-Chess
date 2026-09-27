# Hackathon demo evaluation

This is the repeatable evidence sheet for the short demo path. Results below were recorded on 27 September 2026 against the bundled local library. Build, unit tests, and direct evidence queries verify individual components; they do not establish that the full task succeeds in a browser. Human clarity ratings must be added after independent users complete the script; no ratings are invented here.

| # | Fixed task | Expected result | Actual result | Evidence | Status |
| ---: | --- | --- | --- | --- | --- |
| 1 | Find Magnus Carlsen and open a source game | Live search resolves FIDE 1503014 and the selected example opens its game page | Search and source handoff are implemented; the local evidence query found 434 games as White and 417 as Black | Preparation evidence card and `/games/<id>` source links | Components verified; browser task pending |
| 2 | Show how the opponent played in a selected position | The source PGN opens as a legal move tree and the preparation stays attached | Preparation hands off the selected game and `prep:<study id>` conversation to the game board | Production build plus existing PGN/tree tests | Components verified; browser task pending |
| 3 | Get a legal Stockfish line and inspect it | The engine shows evaluation, depth, and a clickable legal variation | The coach answer labels Stockfish separately and preserves the existing verified line application flow | 26 frontend tests passed, including chess tree and shape behavior | Components verified; browser task pending |
| 4 | Ask for a plan tied to the selected position | The response contains the board snapshot, preparation, evidence provenance, and coach interpretation | The shared preparation conversation continues on the board; each response shows Games, Stockfish, and Coach provenance labels | Type check and production build passed | Components verified; live coach task pending |
| 5 | Save a branch, switch, and return | The named branch survives navigation and the preparation can be reopened | Existing saved analysis and tree persistence remain in the demo route; the selected preparation and structured plan are persisted locally and on the coach server | Production build passed; manual navigation check required before judging | Ready for manual check |

## Independent user scorecard

Ask at least three chess players or coaches to run the five tasks without spoken guidance. Record one row per participant.

| Participant | Chess experience | Completed tasks / 5 | Clarity (1–5) | Practical value (1–5) | Main confusion |
| --- | --- | ---: | ---: | ---: | --- |
| _Pending_ |  |  |  |  |  |

The current verification establishes functional readiness, not usability with judges. A small convenience sample will not establish general product effectiveness; report the participant count and recruitment method with any scores.
