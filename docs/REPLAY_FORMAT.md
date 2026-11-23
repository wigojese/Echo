# Replay format, version 1

Seed plus tick-indexed inputs. Replaying must reproduce contours, heard events, capture and result. Verified in the Node reference: two scripted runs reproduce their live event logs exactly (`reference/replays/*.log.txt`).

```json
{
  "format_version": 1,
  "level_id": "EC-L01",
  "seed": 2083,
  "ruleset": "EC-RULESET-01",
  "dt_hz": 30,
  "inputs": [
    {"tick": 12, "type": "move", "dx": 0.0, "dy": 1.0},
    {"tick": 40, "type": "ping"},
    {"tick": 41, "type": "quiet", "on": true},
    {"tick": 90, "type": "stop"}
  ]
}
```

- Optional `profile` (`"forgiving"`; absent means `suspense`) and `overrides` (listener numbers, tests and tools only) are read by `runReplay`. A replay must run with the profile it was recorded under.
- Stage 13 sample replays may carry a `fixture` object with their own `level` and `geo`.
- Event log (Stage 13): every event has `id` (sequential from 0, the `level_reset` marker is `-1`) and `cause` (an earlier event id or null). The log is deterministic, so a replay's event log is byte-identical to the live run.
- `tick` is the 30 Hz simulation tick, never a frame number. Inputs for a tick are applied at the start of that tick.
- `move` sets a steering vector (magnitude is clamped to 1, below 0.18 it is ignored) until the next `move` or `stop`.
- `ping` carries no coordinates. The origin is the player position on that tick, and the event log records it. This changed from the Stage 07 draft, which had `x` and `y`.
- `quiet` toggles quiet step. Pause is not recorded, because a paused world does not advance.
- Unknown `format_version` is rejected (`ReplayRecorder.from_json` returns null).
- The GDScript `ReplayRecorder` still writes the Stage 07 draft shape. It must be updated before it is used to record real play (Stage 09).
