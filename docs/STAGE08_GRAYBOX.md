# Stage 08: EC-L01 graybox

Labels: IMPLEMENTED/TESTED (ran here), PORTED/UNVERIFIED (GDScript, parse-checked only), UNRESOLVED, BLOCKED.

## What exists

| Piece | Where | Label |
|---|---|---|
| Deterministic reference simulation: movement and collision, ping with cooldown, wave contacts, memory and ghosts, listener AI (PATROL, CURIOUS, SEARCH, RECOVER, CHASE), capture, exit, pause, timeout, instant retry, replays | `reference/sim/sim.js` | IMPLEMENTED/TESTED |
| 31 automated checks | `tests/js/stage08.test.js` | IMPLEMENTED/TESTED, 31 passed |
| Playable browser graybox of the same simulation (keyboard or pointer, developer overlay with `G`) | `reference/graybox/index.html` | IMPLEMENTED, played by script only, not by a person |
| Two scripted replays and their event logs | `reference/replays/` | IMPLEMENTED/TESTED |
| Evidence images (sealed wall, field debug, replays) | `reference/evidence/` | IMPLEMENTED |
| GDScript port | `game/scripts/{core/simulation,player/motion_controller,predator/predator_agent}.gd` | PORTED/UNVERIFIED |
| GDScript tests mirroring the reference, including both replays | `tests/run_tests.gd` | **BLOCKED**, never run in Godot |
| Playable Godot build | none | **BLOCKED**, no Godot here |

Open the graybox: `reference/graybox/index.html` in a browser. Arrow keys or WASD move, Space echo, Q quiet, P pause, R retry, G developer view.

## Parameters as implemented (all DESIGN PROPOSAL until you approve them)

Player 1.75 m/s, quiet 1.10 m/s, radius 0.28 m, 100 ms velocity smoothing. Cooldown 38 ticks (1.27 s). Pulse 9 m/s, cap 13.5 m. Memory 240 ticks, ghost 37 ticks. Listener speeds 1.1, 1.45, 1.85 m/s, hearing limit 11 m, curious timeout 7 s, search 2.5 s, chase lost after 1.7 s, contact 4 m for 6 ticks, warning 18 ticks, capture within 0.5 m for 6 ticks. Exit radius 0.8 m for 5 ticks. Timeout 90 s.

## Replays (see `reference/replays/*.log.txt`)

- **A, heard and caught:** one echo at the fork at tick 507. The listener heard it at tick 537 (cost 8.79 m), walked to the origin, saw the standing player, and captured them at tick 700 after a 1.90 s warning. `last_heard_origin` equals the cast origin.
- **B, heard and escaped:** an echo at the start (not heard), then an echo at the fork (heard at tick 537). The player walked away east and reached the exit at tick 893 (29.8 s) with 2 echoes. The listener searched the origin for exactly 75 ticks, then recovered.

## Known gaps and judgement calls

1. **Movement noise is not modelled.** Quiet step only slows the player. The ruleset's "70 percent less movement noise" has nothing to act on yet. UNRESOLVED.
2. **Hearing uses the predator's cell at the moment of the cast**, not where it stands when the sound arrives. A proposal that favours the player slightly.
3. **The 4 m contact radius also keeps a chase alive.** The ruleset only gives it for starting one. A proposal.
4. **Collision is an 8-point circle test against 0.25 m cells.** It is an approximation of the real polygons the prompt asks for. Stage 08 still uses the A1a strip union as geometry.
5. **No score.** `par_pulses` is unauthored, so the A6 formula is not implemented.
6. **Controls are keyboard or hold-to-steer only.** The control scheme is a Stage 09 decision.
7. **The replay bots read ground truth to choose when to ping.** That is a test fixture. Real players cannot.
8. **Nobody has played the graybox.** Whether the tension is too punishing or too easy is exactly the Stage 08 question for you.
9. **The test fixes:** two thresholds were adjusted during this stage because the premise was wrong, not the simulation (the Stage 07 sealed-exit fixture and the Stage 08 "player is 3 m away" check moved from tick 560 to 600). Both are in `docs/CHANGELOG.md`.
