# Test report

Updated 2026-11-22. Host: v22.23.5, Intel(R) Xeon(R) Processor @ 2.10GHz, linux/x64. Godot: **not installed, GDScript never executed**.

## Status labels

| Item | Label |
|---|---|
| Acoustic solver reference (Node), 13 tests | IMPLEMENTED/TESTED |
| Level validator (Node), 6 rejection and acceptance cases | IMPLEMENTED/TESTED |
| Firewall scanner, including a negative case | IMPLEMENTED/TESTED |
| Style token checks (no blue, contrast) | IMPLEMENTED/TESTED |
| GDScript syntax, 15 files, gdtoolkit 4.5.0 | IMPLEMENTED/TESTED, **syntax only**, a Godot 4.7 parser may differ |
| GDScript unit tests in `tests/run_tests.gd` | **BLOCKED/UNVERIFIED**, written, never run |
| Boot scene boots in Godot, clean-clone boot | **BLOCKED/UNVERIFIED** |
| `project.godot` feature string for 4.7 | **UNVERIFIED** |
| GitHub Actions workflow | **UNVERIFIED**, never run |

Manual test to close the gaps, on a machine with Godot 4.7:

```bash
godot --headless --path . -s tests/run_tests.gd
godot --headless --path . --quit-after 5
```

## Captured output

### `node spike/stage06/tests.js`
```
PASS  sealed wall: predator cell behind wall is unreached  cost=Infinity
PASS  sealed wall: zero cells reached in the far corridor  leaked=0
PASS  sealed wall: near corridor is reached  cells=396
PASS  diagonal corner: sound does not leak between two diagonal wall cells  cost=Infinity
PASS  corner: the straight line to the target crosses solid wall
PASS  corner: connected-path cost is strictly longer than the straight line  cost=5.83 m, straight=5.35 m
PASS  corner: arrival is later than a straight-line shader would claim  t=0.648 s vs 0.594 s
PASS  cap: no cell exceeds 13.5 effective m  max=13.493
PASS  cap: one pulse from spawn does not reach the exit
PASS  determinism: two runs give bit-identical cost fields
PASS  hearing: ping at the fork is heard by the listener  cost=7.93 m, arrives 0.88 s after cast
PASS  hearing: ping at spawn is not heard  cost=Infinity
PASS  origin: field is rooted at the cast position (cost 0 there, 3.5 m to where the player went)  cost to later position=3.50
BENCH L01 at 0.25 m cells: p50=0.564 ms  p95=0.815 ms  max=1.037 ms  (n=300, cells=13824)
BENCH L01 at 0.20 m cells: p50=0.960 ms  p95=1.298 ms  max=1.462 ms  (n=300, cells=21600)

HOST node v22.23.5, Intel(R) Xeon(R) Processor @ 2.10GHz, 4 logical CPUs, linux/x64
RESULT 13 passed, 0 failed
```

### `node tests/js/stage07.test.js`
```
PASS  validator accepts EC-L01  []
PASS  validator rejects a self-intersecting polygon  Polygon 'bowtie' self-intersects: edge 0 crosses edge 2.
PASS  validator rejects clockwise winding  Polygon 'cw' winds clockwise. Counter-clockwise is required.
PASS  validator rejects an exit inside a wall  Exit (8,3) is inside a wall.
PASS  validator rejects a sealed exit  Exit (20,32) is sealed: no connected walkable route from spawn.
PASS  validator rejects a spawn inside a wall  Spawn (8,3) is inside a wall or lacks 0.28 m clearance.
PASS  validator rejects corridors narrower than 0.65 m  Corridor width 0.60 m is below the 0.65 m minimum.
PASS  firewall passes on the real repository  FIREWALL scanned 2 view-layer script(s) in game/scripts/camera, game/scripts/rendering, game/scripts/input, game/scripts/audio
PASS  firewall catches a camera script that reads WorldTruth and predators  exit=1
PASS  tokens: no blue, teal or cyan hue in the palette
PASS  tokens: paper_chalk has at least 4.5:1 text contrast on plate black  14.8:1
PASS  tokens: fresh_contact has at least 4.5:1 text contrast on plate black  14.8:1
PASS  tokens: secondary_ui has at least 4.5:1 text contrast on plate black  9.6:1
PASS  tokens: caution_amber has at least 4.5:1 text contrast on plate black  11.6:1
PASS  tokens: confirmed_danger has at least 4.5:1 text contrast on plate black  7.2:1
PASS  tokens: near_expired_residue is below 4.5:1, so it can never carry required information  3.0:1
PASS  tokens: age thresholds are strictly increasing and end at the 8 s memory limit
RESULT 17 passed, 0 failed
```

### `node tools/check_firewall.js`
```
FIREWALL scanned 2 view-layer script(s) in game/scripts/camera, game/scripts/rendering, game/scripts/input, game/scripts/audio
FIREWALL OK: no view-layer script references ground truth
```

### `node tools/map_validator/validate.js`
```
LEVEL OK: EC-L01
```

### GDScript parse
```
parsed ok  game/scenes/bootstrap/boot.gd
parsed ok  game/scripts/acoustics/acoustic_field_solver.gd
parsed ok  game/scripts/acoustics/sound_grid.gd
parsed ok  game/scripts/camera/camera_director.gd
parsed ok  game/scripts/core/event_bus.gd
parsed ok  game/scripts/core/level_validator.gd
parsed ok  game/scripts/core/replay_recorder.gd
parsed ok  game/scripts/core/semantic_events.gd
parsed ok  game/scripts/core/sim_clock.gd
parsed ok  game/scripts/core/world_truth.gd
parsed ok  game/scripts/knowledge/knowledge_gate.gd
parsed ok  game/scripts/knowledge/knowledge_store.gd
parsed ok  game/scripts/knowledge/visible_world_snapshot.gd
parsed ok  game/scripts/rendering/style_tokens.gd
parsed ok  tests/run_tests.gd
```
