# Stage 10: phosphor visual system in the real field

Labels: IMPLEMENTED/TESTED (ran here), PORTED/UNVERIFIED (GDScript, parse-checked), BLOCKED (needs Godot or a phone), UNRESOLVED.

## Read this first: nothing here is engine-rendered

The prompt asks for engine-rendered screenshots and a recording. There is no Godot here, so every image and the recording come from the **browser renderer** (`reference/graybox/plate_world.js`) running the same simulation. They show the look and prove the rules. They do not prove Godot integration, Godot frame cost or phone visibility.

## What exists

| Piece | Where | Label |
|---|---|---|
| D world renderer for the browser graybox | `reference/graybox/plate_world.js` | IMPLEMENTED/TESTED |
| Snapshot additions the renderer needs: wall coordinates and inward normals, wave front samples, heard flag on cast origins | `reference/sim/sim.js` | IMPLEMENTED/TESTED |
| 13 pixel-level render contracts | `tools/render_contracts/run.js`, output in `reference/evidence/render-contracts.txt` | IMPLEMENTED/TESTED, 13 passed |
| Seven captures, a brightness pair and a 30 s recording of replay B | `reference/evidence/plate-*.png`, `plate-L01-replayB-30s.webm` | IMPLEMENTED |
| GDScript `PulseRenderer` and snapshot parity | `game/scripts/rendering/pulse_renderer.gd`, `game/scripts/core/simulation.gd` | PORTED/UNVERIFIED |
| Material token file | `game/resources/materials/plate_materials.json` | IMPLEMENTED |
| Godot shaders (stable grain, contour fringe, front) | none | **BLOCKED**, not authored. Requirements are in the material file and `docs/ART_BIBLE.md` |

## Acceptance checks from the prompt

- **A sealed wall stays opaque at maximum bloom.** Tested at bloom 16, nearly three times the cap, 9 ticks after a cast: 0 bright pixels in the far corridor against 4,865 on the near side. A deliberately naive halo lit 2,280 far pixels, so the test can fail.
- **Bright fronts legible, text clear.** Fresh edges 13.8:1 on the plate, Echo label 14.9:1.
- **Identity survives with sound off.** The renderer has no audio input at all. The ghost, the heard scar and the front are all visual. This is a design fact, not a user test.
- **Different hidden creature positions draw the same frame.** 16 frames compared byte for byte across two worlds.

## Performance against the graybox style

Same state, headless Chromium with software rendering on a server CPU, render plus raster flush: graybox p50 0.40 ms, p95 0.50 ms. Plate p50 3.30 ms, p95 4.00 ms. **About 2.9 ms more.** This is not a phone and not Godot. The likely costs are the full-screen grain fill and the halo strokes. A phone figure is UNVERIFIED.

## Known gaps and judgement calls

1. **The heard cue is a disclosure.** The amber ring on a cast origin tells the player that a listener within hearing range heard that echo. It never says where. Its arrival time also equals the weighted distance divided by 9 m/s, so a careful player can infer roughly how far the listener is. EC-D-017 asks you to accept or reject that.
2. **The brightness comparison is simulated** with a CSS brightness filter at 0.45. A real screen at low brightness in daylight behaves differently.
3. **Absorbent and reflective materials are not rendered differently yet.** They arrive with L02 and L06.
4. **The `.gdshader` files are not written.** I would be writing shader code I cannot compile.
5. **Zoom is not implemented,** so the grain's behaviour under zoom is only specified, not tested. Pan is tested.
6. **The recording is the replay, not a person playing.**
7. **The memory layer uses a hash for erosion.** It is deterministic, but I have not looked at it for visible repetition over a long corridor.
8. **One bug found while writing the tests:** my first sealed-wall capture was taken after the halo had faded, so it passed for the wrong reason. It now captures during the fresh phase and has a negative control. Two other measurements were also wrong at first (a contrast sample that included the player glyph, and a render timing that skipped rasterisation) and were fixed.
