# Decision log

Columns: ID | stage | date | proposal | selected parameters | status | reasoning | alternatives | files touched | supersedes

| ID | Stage | Date | Proposal | Selected parameters | Status | Reasoning | Alternatives | Files | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| EC-D-001 | 05 | 2026-11-22 | Three art directions A oscilloscope, B oceanic cartography, C photochemical negative-print | cyan on navy across all three | **NOT APPROVED** (round 1 only) | An external critique found all three were skins with the same layout, a cyan monopoly, no movement teaching and no result or failure screens. | none | `design/stage05/round1-ABC/*` | none |
| EC-D-002 | 05 | 2026-11-22 | D The Listening Plate, with E The Cut as an independent counter-proposal | D: no blue, role palette in `round2-D-E/D0-system-board.png`, age grammar fresh 0 to 0.35 s, afterglow to 1.4 s, memory to 5 s, residue to 8 s. E: filled light, memory erodes to a centre thread | **PROPOSED, NOT SELECTED** | Chosen by the user instruction "commit and move to the next stage" only as closing the exploration. No system was named. Needs an explicit choice. | A, B, C kept as rejected baselines | `design/stage05/round2-D-E/*` | EC-D-001 |
| EC-D-003 | 06 | 2026-11-22 | Reference acoustic cell size | 0.25 m (EC-RULESET-01). Round 1 and 2 art prototypes used 0.20 m, a known deviation, art only | PROPOSED | The spec value is 0.25 m. The finer grid was used only to make stills smoother. | 0.20 m costs about 30 percent more solver time in the Node benchmark | `spike/stage06/solver.js` | none |
| EC-D-004 | 06 | 2026-11-22 | Engine choice | none | **UNRESOLVED** | Godot 4.7 is the prompt's candidate, Unity 6.3 LTS the comparison. Neither could be installed here. Nothing was measured in an engine. | Godot, Unity | `docs/STAGE06_SPIKE.md` | none |
