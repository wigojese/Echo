# Replay format, version 1

Seed plus tick-indexed inputs. Replaying must reproduce contours, heard events, capture and result.

```json
{
  "format_version": 1,
  "level_id": "EC-L01",
  "seed": 2083,
  "ruleset": "EC-RULESET-01",
  "dt_hz": 30,
  "inputs": [
    {"tick": 12, "type": "ping", "x": 3.0, "y": 8.1},
    {"tick": 40, "type": "move", "x": 3.0, "y": 9.6}
  ]
}
```

- `tick` is the 30 Hz simulation tick, never a frame number.
- `x`, `y` are world metres at cast or target time. A ping uses the cast position, not the later player position.
- Unknown `format_version` is rejected (`ReplayRecorder.from_json` returns null).
- Verified so far: parses in `gdparse`. The round trip test in `tests/run_tests.gd` has **not** been run in Godot.
