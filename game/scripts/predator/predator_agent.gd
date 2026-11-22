class_name PredatorAgent
extends RefCounted
## LISTENER. Hears a cast through the connected-space field, walks to where it was cast,
## searches, recovers. Chases only with real line of sight. Port of reference/sim/sim.js.

const PATROL_SPEED := 1.1
const CURIOUS_SPEED := 1.45
const CHASE_SPEED := 1.85
const CURIOUS_MAX_TICKS := 210
const SEARCH_TICKS := 75
const CHASE_LOSE_TICKS := 51
const CONTACT_RADIUS := 4.0
const CONTACT_TICKS := 6
const ALERT_TICKS := 18
const CAPTURE_RADIUS := 0.5
const CAPTURE_LOS_TICKS := 6

var id: StringName = &"listener-01"
var position: Vector2 = Vector2.ZERO
var waypoints: Array[Vector2] = []
var wp_index: int = 1
var state: StringName = &"PATROL"
var dest: Vector2 = Vector2.ZERO
var last_heard_origin: Vector2 = Vector2.ZERO
var has_heard: bool = false
var last_heard_tick: int = -1
var last_seen_player_tick: int = -1
var investigation_count: int = 0
var heard_cast_ids: Array[int] = []
var hearing_limit: float = 11.0
var captured: bool = false
var _curious_start: int = -1
var _search_start: int = -1
var _contact_ticks: int = 0
var _alert_start: int = -1
var _lost_ticks: int = 0
var _cap_ticks: int = 0
var _last_seen_pos: Vector2 = Vector2.ZERO


func hear(cast_id: int, origin: Vector2, cost: float, arrival_tick: int, bus: EventBus) -> void:
    last_heard_origin = origin
    has_heard = true
    last_heard_tick = arrival_tick
    investigation_count += 1
    heard_cast_ids.append(cast_id)
    bus.emit_event(
        SemanticEvents.HEARD_PING,
        arrival_tick,
        {"predator": id, "cast_id": cast_id, "arrival_tick": arrival_tick, "weighted_cost": cost, "origin": origin}
    )
    if state != &"CHASE":
        dest = origin
        _curious_start = arrival_tick
        _set_state(&"CURIOUS", "heard ping %d" % cast_id, arrival_tick, bus)


func step(tick: int, grid: SoundGrid, player_pos: Vector2, path_field: Callable, bus: EventBus) -> void:
    var seen := position.distance_to(player_pos) <= CONTACT_RADIUS and grid.has_los(position, player_pos)
    if seen:
        _contact_ticks += 1
        last_seen_player_tick = tick
        _last_seen_pos = player_pos
    else:
        _contact_ticks = 0
    if state != &"CHASE" and _contact_ticks >= CONTACT_TICKS:
        _alert_start = tick
        _lost_ticks = 0
        _cap_ticks = 0
        _set_state(&"CHASE", "line of sight within 4 m", tick, bus)
    match state:
        &"PATROL":
            var w := waypoints[wp_index]
            if _walk_toward(grid, path_field.call(w), w, PATROL_SPEED) or position.distance_to(w) < 0.15:
                wp_index = (wp_index + 1) % waypoints.size()
        &"CURIOUS":
            var arrived := _walk_toward(grid, path_field.call(dest), dest, CURIOUS_SPEED)
            if arrived or tick - _curious_start > CURIOUS_MAX_TICKS:
                _search_start = tick
                _set_state(&"SEARCH", "reached last heard origin" if arrived else "investigation timed out", tick, bus)
        &"SEARCH":
            if tick - _search_start >= SEARCH_TICKS:
                dest = _nearest_waypoint()
                _set_state(&"RECOVER", "search finished", tick, bus)
        &"RECOVER":
            if _walk_toward(grid, path_field.call(dest), dest, PATROL_SPEED):
                wp_index = maxi(0, waypoints.find(dest))
                _set_state(&"PATROL", "back on route", tick, bus)
        &"CHASE":
            _lost_ticks = 0 if seen else _lost_ticks + 1
            var target := player_pos if seen else _last_seen_pos
            _walk_toward(grid, path_field.call(target), target, CHASE_SPEED)
            _cap_ticks = _cap_ticks + 1 if (seen and position.distance_to(player_pos) <= CAPTURE_RADIUS) else 0
            if _cap_ticks >= CAPTURE_LOS_TICKS and tick - _alert_start >= ALERT_TICKS:
                captured = true
                bus.emit_event(
                    SemanticEvents.PLAYER_CAPTURED,
                    tick,
                    {
                        "predator": id,
                        "alert_start": _alert_start,
                        "alert_ticks": tick - _alert_start,
                        "last_heard_origin": last_heard_origin,
                        "last_heard_tick": last_heard_tick,
                        "heard_cast_ids": heard_cast_ids,
                    }
                )
            elif _lost_ticks >= CHASE_LOSE_TICKS:
                _search_start = tick
                _set_state(&"SEARCH", "no contact for 1.7 s", tick, bus)


func _set_state(to: StringName, reason: String, tick: int, bus: EventBus) -> void:
    if state == to:
        return
    var from := state
    state = to
    bus.emit_event(SemanticEvents.PREDATOR_STATE_CHANGED, tick, {"predator": id, "from": from, "to": to, "reason": reason})


func _nearest_waypoint() -> Vector2:
    var best := waypoints[0]
    for w in waypoints:
        if w.distance_to(position) < best.distance_to(position):
            best = w
    return best


## Follows the cost field of the destination downhill. Returns true once within 0.5 m.
func _walk_toward(grid: SoundGrid, field: PackedFloat64Array, target: Vector2, speed: float) -> bool:
    if position.distance_to(target) < 0.05:
        return true
    var i := floori(position.x / grid.cell)
    var j := floori(position.y / grid.cell)
    var best: float = field[j * grid.nx + i]
    var bi := i
    var bj := j
    for dj in range(-1, 2):
        for di in range(-1, 2):
            if di == 0 and dj == 0:
                continue
            var a := i + di
            var b := j + dj
            if not grid.is_walkable(a, b):
                continue
            if di != 0 and dj != 0 and (not grid.is_walkable(a, j) or not grid.is_walkable(i, b)):
                continue
            var c: float = field[b * grid.nx + a]
            if c < best:
                best = c
                bi = a
                bj = b
    var goal := target
    if bi != i or bj != j:
        goal = Vector2((bi + 0.5) * grid.cell, (bj + 0.5) * grid.cell)
    var d := position.distance_to(goal)
    var step := minf(d, speed * SimClock.DT)
    if d > 0.000000001:
        position += (goal - position) / d * step
    return position.distance_to(target) < 0.5
