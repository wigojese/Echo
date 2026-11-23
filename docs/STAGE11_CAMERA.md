# Stage 11: known-path scrolling and semantic zoom

Labels: IMPLEMENTED/TESTED (ran here), PORTED/UNVERIFIED (GDScript, parse-checked), BLOCKED, UNRESOLVED.
Nothing here ran in Godot, and nothing was tried on a phone.

## What exists

| Piece | Where | Label |
|---|---|---|
| Camera director: four states, zoom bands with hysteresis, anchored pinch, TRACE path | `reference/camera/camera_director.js` | IMPLEMENTED/TESTED |
| 20 camera tests | `tests/js/stage11.test.js` | passed |
| Gesture changes: TRACE chip, rail, Return, Recenter, pan, pinch, paused menu | `reference/input/input_router.js` | IMPLEMENTED/TESTED |
| 20 gesture-conflict tests | `tests/js/stage11_gestures.test.js` | passed |
| Zoom representation contracts C8 to C8c (18 render contracts in all) | `tools/render_contracts/run.js` | passed |
| Browser graybox with TRACE, zoom, off-screen arrow, menu variant (`?trace=menu`) | `reference/graybox/graybox.js` | IMPLEMENTED |
| Recording: first echo, tap-to-move, TRACE scroll, return | `reference/evidence/cam-trace-demo.webm` | recorded with a real mouse |
| Three zoom views at the same tick, TRACE stills, reduced-motion fade frames | `reference/evidence/cam-*.png` | IMPLEMENTED |
| GDScript camera, router and trail | `game/scripts/camera`, `game/scripts/input`, `game/scripts/core/simulation.gd` | PORTED/UNVERIFIED |
| Specs | `docs/CAMERA_SPEC.md`, `docs/GESTURE_CONFLICTS.md`, `docs/INPUT_SPEC.md` | written |

## Acceptance checks from the prompt

- **Different hidden enemy state gives identical framing.** Three worlds with different hidden listener positions and different hidden exits gave 300 identical camera frames and snapshots, through TRACE, a pinch and a return.
- **No map joins gaps to reveal an unopened corridor.** The TRACE path stays within 0.9 m of the route walked (worst 0.26 m). In all three zoom views every lit pixel sits next to something the snapshot says is known, and a negative control that draws one extra line is caught.
- **Player position always recoverable.** From far along the trace, and from a manual pan, one Return puts the camera exactly on the player. If the player is out of view an arrow shows the way and the distance.
- **Inverse transforms.** Exact to 1e-14 m across 5,000 random cameras and on every frame of the pullback, scrub and return. Pinch anchor drift under 2 px in 1,000 random pinches.

## Decisions for you

1. **Where does TRACE live?** Two entries are built. A small chip at the bottom centre, between Quiet step and Echo (default). Or inside the pause menu (`?trace=menu`). The chip is faster and easy to find; the menu cannot be hit by accident. Recommendation: the chip, because TRACE pauses the world and so can never cost the player anything. This is the gate question.
2. **What does TRACE show after 8 seconds?** Walls are only the ones still remembered, so a long wait leaves only the dotted route and the echo labels. The route itself is kept for the whole level. That keeps the tension of fading memory, but makes TRACE a map of your steps, not of the rooms. Say if you want walls to be kept for review.

## Known gaps

1. **The route is your own trail,** not the discovered corridors. It is always legitimate knowledge and can never reach an unopened corridor, but it is not a map of side branches you saw and did not enter.
2. **Stage 12 states are not built:** wave surf, threat evasion, exit resolve, result reconstruction.
3. **The scrub speed cap rarely bites at the zoomed-out view.** One screen width per second is 27 m per second at zoom 0.72, longer than most routes.
4. **Pinch while steering with the stick** is impossible by design (two fingers only).
5. **The browser recording is mouse-driven, not touch,** so it shows no pinch.
6. **Reduced motion** is tested as a director behaviour and shown as three fade frames. No person has judged whether the fade is comfortable.
7. **Godot, phone, and real finger feel** are all unmeasured.

## Found and fixed while building

- My first graybox rewrite built the full snapshot twice per frame, and the audit seemed to show touch-to-cast latency doubling and then recovering after I lightened it. **That story is not reliable.** I later found the audit's fixed sleeps phase-locked to the 30 Hz tick, and with jittered timing the same build measures anywhere from about 37 to 53 ms at p50 between runs. The lighter per-frame snapshot is still a sensible change, but I cannot claim it fixed a measured regression.
- Both the camera module and the driver declared a global `SCREEN`, which broke the page until I renamed one.
- Frame-capture script errors (stale input state, a chip drawn over the level title) were fixed.
