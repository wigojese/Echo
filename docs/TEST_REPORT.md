# Test report

Updated 2026-11-22. Host: v22.23.5, Intel(R) Xeon(R) Processor @ 2.10GHz, linux/x64. Godot: **not installed, GDScript never executed**.

## Status labels

| Item | Label |
|---|---|
| Acoustic solver reference (Node), 13 tests | IMPLEMENTED/TESTED |
| Reference simulation (Node), 31 tests | IMPLEMENTED/TESTED |
| Level validator, firewall scanner, style tokens (17 checks) | IMPLEMENTED/TESTED |
| Two scripted replays reproduce their live runs exactly | IMPLEMENTED/TESTED |
| GDScript syntax, 18 files, gdtoolkit 4.5.0 | IMPLEMENTED/TESTED, **syntax only**, a Godot 4.7 parser may differ |
| GDScript unit tests in `tests/run_tests.gd` including both replays | **BLOCKED/UNVERIFIED**, written, never run |
| Playable Godot build, boot scene, clean-clone boot | **BLOCKED/UNVERIFIED** |
| Browser graybox played by a person | **UNVERIFIED**, only driven by script |
| Phone performance, frame pacing, thermals | **BLOCKED/UNVERIFIED**, no device |
| `project.godot` 4.7 feature string, GitHub Actions workflow | **UNVERIFIED** |

Manual test to close the gaps, on a machine with Godot 4.7:

```bash
godot --headless --path . -s tests/run_tests.gd
```

Expected: all checks PASS, and replay A ends CAPTURED at tick 701 while replay B ends WON.

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
BENCH L01 at 0.25 m cells: p50=0.630 ms  p95=1.110 ms  max=2.027 ms  (n=300, cells=13824)
BENCH L01 at 0.20 m cells: p50=1.043 ms  p95=1.687 ms  max=6.803 ms  (n=300, cells=21600)

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

### `node tests/js/stage08.test.js`
```
PASS  01 EC-L01 starts RUNNING at the spawn point
PASS  02 normal speed is about 1.75 m/s (3 s covers 5.0 to 5.3 m)  distance=5.133 m
PASS  03 quiet step is about 1.10 m/s (3 s covers 3.1 to 3.35 m)  distance=3.227 m
PASS  04 pushing into a wall for 6.7 s never leaves the walkable area  x=2.037
PASS  05 driving diagonally into corners never passes through a wall  final=(11.95,15.68)
PASS  06 cooldown: tap at 5 is rejected visibly, tap at 38 (1.27 s) is accepted
PASS  07 a ping starts at the cast position, not where the player is later  origin y=3, player y now=4.63
PASS  08 no wall face is known before the front reaches it, and every reached face is known on time  early=0
PASS  09 sealed wall: near face known, far corridor edges unknown  known=104, far=0
PASS  09b sealed wall: hidden predator is not heard, not sensed, not alerted
PASS  10 one ping from spawn does not reveal the exit
PASS  11 static memory fully expires within 8 s of the last contact
PASS  12 a creature is remembered only as a ghost that is gone within 1.25 s
PASS  12b the ghost stays where the creature was, never at its current position
PASS  13 the snapshot exposes no predator field  tick,player,segments,castOrigins,ghosts,knownExit
PASS  14 a ping at the fork is heard at the computed weighted cost and delay  cost=8.786, delay=30 ticks
PASS  15 a ping at spawn is never heard
PASS  16 moving after the ping: the listener goes to the old origin, not to the player  player is 5.2 m from the origin
PASS  17 CURIOUS reaches the origin, SEARCH lasts exactly 2.5 s, then RECOVER  search ticks=75
PASS  18 capture is impossible before the 0.60 s warning, even when the creature starts touching distance away  alert=18 ticks
PASS  19 winning needs 0.15 s inside the 0.8 m exit zone  entered at 889, won at 893
PASS  20 instant retry resets memory, ghosts, queued events, cooldown, AI and counters
PASS  20b the same inputs after a retry reach the same result
PASS  21 replay determinism: identical event logs on two runs
PASS  22 frame independence: 30, 60, 120 and 50 Hz renders give identical state at tick 300  ticks=300
PASS  23 pause freezes the world and resuming matches an unpaused run
PASS  24 the 90 s soft timeout ends the level with a retry-friendly result  ended at tick 2700
PASS  25 only semantic events are ever logged, and an unknown event is rejected
PASS  26 camera firewall: different hidden predator positions give identical snapshots and framing for 300 ticks
PASS  27 the failure explanation quotes the logged echo id and tick, nothing else  The listener heard echo 1 at tick 537, walked to where it was cast, and found you after a 1.90 s warning.
PASS  28 one scripted run is caught and the other wins on the same level  CAPTURED / WON
RESULT 31 passed, 0 failed
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

### `cat reference/replays/A_heard_and_caught.log.txt`
```
REPLAY A_heard_and_caught: 50 inputs, ended CAPTURED at tick 701 (23.4 s), 1 echoes, path 21.4 m
  replay reproduces the live run exactly: true
  tick  507  ping_cast  {"castId":1,"origin":[10.99728138029907,16.820839099648836],"edges":451,"cooldownUntil":545}
  tick  537  heard_ping  {"predator":"listener-01","castId":1,"arrivalTick":537,"weightedCost":8.786,"origin":[10.99728138029907,16.820839099648836]}
  tick  537  predator_state_changed  {"predator":"listener-01","from":"PATROL","to":"CURIOUS","reason":"heard ping 1"}
  tick  643  predator_state_changed  {"predator":"listener-01","from":"CURIOUS","to":"CHASE","reason":"line of sight within 4 m for 6 ticks"}
  tick  700  player_captured  {"predator":"listener-01","alertStart":643,"alertTicks":57,"lastHeardOrigin":[10.99728138029907,16.820839099648836],"lastHeardTick":537,"heardCastIds":[1]}
  EXPLANATION: The listener heard echo 1 at tick 537, walked to where it was cast, and found you after a 1.90 s warning.
  predator last_heard_origin=[10.99728138029907,16.820839099648836] last_heard_tick=537 last_seen_player_tick=700 investigations=1
```

### `cat reference/replays/B_heard_and_escaped.log.txt`
```
REPLAY B_heard_and_escaped: 157 inputs, ended WON at tick 894 (29.8 s), 2 echoes, path 43.7 m
  replay reproduces the live run exactly: true
  tick   50  ping_cast  {"castId":1,"origin":[3,5.780555555738523],"edges":172,"cooldownUntil":88}
  tick  507  ping_cast  {"castId":2,"origin":[10.99728138029907,16.82083909964883],"edges":451,"cooldownUntil":545}
  tick  537  heard_ping  {"predator":"listener-01","castId":2,"arrivalTick":537,"weightedCost":8.786,"origin":[10.99728138029907,16.82083909964883]}
  tick  537  predator_state_changed  {"predator":"listener-01","from":"PATROL","to":"CURIOUS","reason":"heard ping 2"}
  tick  710  predator_state_changed  {"predator":"listener-01","from":"CURIOUS","to":"SEARCH","reason":"reached last heard origin"}
  tick  785  predator_state_changed  {"predator":"listener-01","from":"SEARCH","to":"RECOVER","reason":"search finished"}
  tick  893  exit_reached  {"casts":2,"ticks":893}
  EXPLANATION: You reached the exit after 2 echoes. Echo 2 drew the listener toward where you cast it.
  predator last_heard_origin=[10.99728138029907,16.82083909964883] last_heard_tick=537 last_seen_player_tick=-1 investigations=1
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
parsed ok  game/scripts/core/simulation.gd
parsed ok  game/scripts/core/world_truth.gd
parsed ok  game/scripts/knowledge/knowledge_gate.gd
parsed ok  game/scripts/knowledge/knowledge_store.gd
parsed ok  game/scripts/knowledge/visible_world_snapshot.gd
parsed ok  game/scripts/player/motion_controller.gd
parsed ok  game/scripts/predator/predator_agent.gd
parsed ok  game/scripts/rendering/style_tokens.gd
parsed ok  tests/run_tests.gd
```
