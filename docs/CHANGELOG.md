# Changelog

## 2026-11-22
- Stage 05 closed. Art system D selected.
- Stage 06 approved as delivered. Engine unresolved.
- Added acoustic solver reference and 13 tests (`spike/stage06/`).

- Engine chosen by the user: Godot 4.7, GDScript.
- Stage 07 skeleton: modules, information firewall, event bus, replay format, style tokens, level validator, boot scene, test runner, CI file.
- Corrected two tests during the run: the corner margin in Stage 06, and the sealed-exit fixture in Stage 07 (the side connector still reached the exit).

- Stage 07 approved.
- Stage 08 graybox: reference simulation (31 tests), browser graybox, two replays, evidence images, GDScript port (parse-checked only).
- Adjusted one test threshold (tick 560 to 600) because the player had not yet walked 3 m, not because the simulation was wrong.
- Added events `ping_rejected` and `level_timeout`.

- Stage 08 approved.
- Stage 09: input router and driver (30 checks), both control modes in the graybox, emulated touch audit, GDScript port, input spec and comfort test script.
- Added the opening breath (3.0 m known at spawn) and known-floor cells to the snapshot.
- Test changes caused by new features or test mistakes, not by sim changes: stage 08 test 20 now compares memory with a fresh start instead of expecting zero, and test 08 uses a level without the opening breath; stage 09 tap points, bot release timing and two loose assertions were corrected.
- Found by test and fixed: waypoint routes jammed at inner corners until body clearance and a stuck guard were added.
- Left-handed layout keeps Pause at the top right.

## 2026-11-23
- Stage 09 approved.
- Stage 10: D renderer, snapshot additions (wall coordinates and normals, wave front, heard flag), 13 render contracts, captures, recording, GDScript `PulseRenderer`, material tokens, art bible.
- Fixed during the stage: the sealed-wall bloom test first passed vacuously (captured after the halo faded). It now captures in the fresh phase and has a negative control. A contrast sample that included the player glyph and a render timing that skipped rasterisation were also corrected.
- Renamed the replay B decayed frame to `plate-07-decayed-no-echo`. Added `plate-05-exit-known` with a real ping near the exit.

- Stage 10 approved.
- Stage 11: camera director (4 states, zoom bands with hysteresis, anchored pinch, TRACE path), router additions (TRACE chip, rail, Return, Recenter, pan, pinch, paused menu), player trail in the snapshot, graybox rewrite around the camera, 5 new render contracts, recording and stills, GDScript port.
- Stage 8 test 13 now expects the `trail` key. No other earlier test changed.
- Found and fixed: input latency regression from a double snapshot per frame (61.7 ms back to 36.4 ms), a global name clash, and a title overlap in the TRACE view.

- Stage 11 approved. The TRACE entry control question stays open.
- Stage 12: transition specs and director, trigger wiring in the graybox (title, Begin, aperture, nudge, threat edge, failure dim and Reveal, success reconstruction), alert and post-round gate in the simulation, camera transient effects and pullback anticipation, 22 tests, 12 frame contracts, filmstrips, two recordings, generated timing table, GDScript port.
- Stage 8 test 13 now expects the `alert` key.
- Fixed during the stage: global name clash, cancel not finalising, a negative opacity from rounding, a reduced-motion veil hiding the title, and several layout faults found from the filmstrips.

- Correction: the Stage 11 note about a latency regression and fix was an artefact of a phase-locked audit. The latency audit now jitters its timing and reports three runs. No build-to-build latency difference is established (run-to-run spread about 15 ms).
- Trigger watcher uses a cheap view (`watchSnapshot`) instead of a full snapshot each frame.

## 2026-11-23, Stage 13
- Stage 12 approved ("approve and continue"). No signature transitions were named.
- Reference simulation: every event has an id and a cause, the listener state machine is a declared table that throws on an undeclared change, listener numbers move into two profiles, footstep noise is modelled, and the explanation is built by walking the cause chain.
- `explain()` changed wording. It no longer prints a raw tick, and it says "was on its way" when the listener saw you before it reached the origin. Test 27 in the Stage 08 suite was updated to check the echo id and warning length in the sentence and the logged tick in the detail chain.
- New: `tests/js/stage13.test.js` (55 tests), `tools/strategies/`, `tools/predator/` (diagram, failure samples, strategy tables, screenshots), `docs/PREDATOR.md`, `docs/FAILURE_SAMPLES.md`, `docs/STRATEGIES.md`, `docs/STAGE13_PREDATOR.md`.
- Graybox: failure sheet shows a lesson; the Reveal view lists the cause chain, veils the world behind the map and keeps labels on screen; `?profile=forgiving`.
- Wrong test premises found and fixed while writing the new tests, never by relaxing a rule: the chase fixture put the listener 6.5 m away; the hairpin fixture had no near-but-walled positions; two fixtures left the player standing where the listener was heading; the 7 s investigation limit stops a listener 0.8 m short of an origin heard from 11 m (a designed edge, now tested and documented).
- Found that quiet step is a pure speed penalty on EC-L01 with the prompt's numbers (EC-D-028).
- GDScript port: event ids and causes, `heard_step`, `ListenerParams`, edge table, footsteps, causal `explain()` and `explain_detail()`. 23 files parse. Nothing ran in Godot.
- `docs/TEST_REPORT.md` is now rebuilt by `node tools/test_report.js`.
