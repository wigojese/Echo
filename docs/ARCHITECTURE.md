# Architecture and the information firewall (Stage 07)

Engine target: Godot 4.7, GDScript. Not yet opened or run in Godot (see `docs/TEST_REPORT.md`).

## Layers

```
WorldTruth  (GROUND_TRUTH)           simulation only
   |  sensing: AcousticFieldSolver + predator perception (Stage 08)
   v
KnowledgeStore  (ECHO_FRAME contacts become PLAYER_MEMORY)
   |  KnowledgeGate.build(player_position, store, exit_if_known, tick)
   v
VisibleWorldSnapshot                 the ONLY thing the view layer may read
   |
   v
CameraDirector, PulseRenderer, input hints, AudioDirector
```

`KnowledgeGate.build` never receives `WorldTruth`. Hidden predators and the hidden exit cannot reach the view by construction. The exit position is passed in only as a value the caller already decided is legitimately known, and the snapshot exposes it only when `store.exit_known` is true.

## Module boundaries

| Module | Folder | May read | Must not read |
|---|---|---|---|
| WorldTruth, LevelValidator | `core` | level data | view layer |
| AcousticFieldSolver, SoundGrid | `acoustics` | grid | knowledge, view |
| KnowledgeStore, KnowledgeGate, VisibleWorldSnapshot | `knowledge` | sensing results | WorldTruth internals beyond player position |
| CameraDirector | `camera` | VisibleWorldSnapshot | WorldTruth, solver, predators |
| StyleTokens | `rendering` | token JSON | WorldTruth |
| EventBus, SemanticEvents, SimClock, ReplayRecorder | `core` | semantic events, ticks | pixel or per-frame data |

Planned for Stage 08 and later: `player`, `predator`, `input`, `audio`, `save` (empty folders hold a `.gitkeep`).

## Enforcement

- `tools/check_firewall.js` scans `camera`, `rendering`, `input`, `audio` for `WorldTruth`, `ground_truth`, `predators`, `exit_position`, `sound_grid`, `AcousticFieldSolver`. Comments are ignored. It exits 1 on any hit. A negative test proves it catches a leak.
- `tests/run_tests.gd` has a camera framing test: two worlds that differ only in hidden predator state must give an identical shot.

## Event bus

Only the names in `SemanticEvents.ALL` are accepted: `ping_cast`, `wave_contact`, `heard_ping`, `predator_state_changed`, `player_captured`, `exit_reached`, `level_reset`. Anything else is rejected and logged.

## Known gap

A static scan cannot prove that a future script does not reach `WorldTruth` through an autoload or a node path lookup. Stage 08 must add a runtime test.
