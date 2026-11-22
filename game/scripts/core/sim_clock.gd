class_name SimClock
extends RefCounted
## Authoritative fixed 30 Hz tick. Render frame rate can never change world outcome.

const HZ := 30
const DT := 1.0 / 30.0
const MAX_CATCHUP_TICKS := 4

var tick: int = 0
var degraded: bool = false
var _accumulator: float = 0.0


## Returns how many simulation ticks to run for this render frame.
func advance(frame_dt: float) -> int:
    _accumulator += frame_dt
    var steps := 0
    while _accumulator >= DT and steps < MAX_CATCHUP_TICKS:
        _accumulator -= DT
        steps += 1
    if _accumulator >= DT:
        degraded = true
        _accumulator = 0.0
    tick += steps
    return steps


func reset() -> void:
    tick = 0
    degraded = false
    _accumulator = 0.0
