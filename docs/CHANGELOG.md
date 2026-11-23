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
