# Camera spec (Stage 11, as implemented)

Code: `reference/camera/camera_director.js` (tested). GDScript port: `game/scripts/camera/camera_director.gd` (parse-checked only).
The director reads a `VisibleWorldSnapshot` and nothing else. It never sees a hidden creature or a hidden exit.

## States

| State | Implemented | Notes |
|---|---|---|
| INTRO_DROP | yes | zoom 1.25 to 1.0 over 450 ms |
| LISTENER_FOLLOW | yes | centred on the player, zoom 1.0 |
| MANUAL_REFRAME | yes | after a pan or pinch. Steering, or Recenter, returns you in 350 ms |
| KNOWN_PATH_SCROLL | yes | TRACE. Pauses the world |
| WAVE_SURF, ZOOM_TO_EVIDENCE, THREAT_EVASION, EXIT_RESOLVE, RESULT_RECONSTRUCT | **no** | Stage 12 transitions |
| REDUCED_MOTION | as a mode | a 120 ms fade replaces every move or zoom animation |

Priority when inputs collide: steering beats everything, then Recenter or Return, then manual pan or pinch.

## Zoom

Pixels per metre is 20 times the zoom. Range 0.60 to 1.75. Bands switch with hysteresis, so jitter near a threshold never flips them.

| Band | Zoom | Entered at | Left at | What changes (never what is known) |
|---|---|---|---|---|
| Close | 1.35 to 1.75 | 1.42 and up | 1.28 and down | strokes 20 percent heavier, bigger player glyph |
| Active | 0.85 to 1.35 | | | normal |
| Memory | 0.60 to 0.85 | 0.78 and down | 0.90 and up | thinner lines, no halo, fringe, motes or front |

Pinch keeps the world point under your fingers fixed. While you are steering, a pinch zooms about the player instead.

## TRACE

- **Available** when the route you walked has at least one bend (three simplified waypoints) and something is still remembered.
- **The path** is the route you actually walked, simplified (Douglas-Peucker, 0.4 m) and drawn as a polyline with each corner rounded by a quadratic Bezier (0.6 m), sampled at 0.25 m of arc length. It never leaves 0.9 m of your real trail, so the camera can never travel through a place you have not been.
- **Entry** pulls back from 1.0 to 0.72 in 350 ms and pauses the world. **Return** glides back to you in 350 ms and resumes it.
- **Scrub** on the right-hand rail: drag up goes back in time. The camera moves at most one screen width per second. On release it stops within 220 ms with no fling.
- **Labels** show each echo and its logged age. Walls shown are only those still remembered, frozen in time.
- **Off-screen**: if you are not in view, an arrow at the screen edge points to you with your distance.

## Non-spoiler rules, with the test that holds each

| Rule | Test |
|---|---|
| Framing is identical whatever hidden creature or exit exists | camera test 13: 3 worlds, 300 frames, through TRACE, pinch and return |
| The TRACE path never leaves where you walked | camera test 08 |
| Zoom views add nothing the player does not know | render contracts C8, C8b, C8c (with a negative control) |
| Touch maps to the world exactly on every frame | camera tests 01 and 02 |
| You can always get back | camera tests 11 and 11b |
