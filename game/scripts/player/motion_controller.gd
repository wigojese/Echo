class_name MotionController
extends RefCounted
## Player movement on the fixed tick. Port of the reference simulation in reference/sim/sim.js.

const NORMAL_SPEED := 1.75
const QUIET_SPEED := 1.10
const RADIUS := 0.28
const SMOOTHING_S := 0.10
const DEADZONE := 0.18

var position: Vector2 = Vector2.ZERO
var velocity: Vector2 = Vector2.ZERO
var direction: Vector2 = Vector2.ZERO
var quiet: bool = false
var path_length: float = 0.0


func set_direction(d: Vector2) -> void:
    if d.length() > 1.0:
        d = d.normalized()
    direction = Vector2.ZERO if d.length() < DEADZONE else d


func step(grid: SoundGrid) -> void:
    var speed := QUIET_SPEED if quiet else NORMAL_SPEED
    var k := minf(1.0, SimClock.DT / SMOOTHING_S)
    velocity += (direction * speed - velocity) * k
    var motion := velocity * SimClock.DT
    var n := maxi(1, ceili(motion.length() / 0.05))
    var d := motion / float(n)
    for _s in range(n):
        var next := position
        if grid.is_clear_circle(position + d, RADIUS):
            next = position + d
        elif grid.is_clear_circle(position + Vector2(d.x, 0.0), RADIUS):
            next = position + Vector2(d.x, 0.0)
        elif grid.is_clear_circle(position + Vector2(0.0, d.y), RADIUS):
            next = position + Vector2(0.0, d.y)
        path_length += position.distance_to(next)
        position = next
