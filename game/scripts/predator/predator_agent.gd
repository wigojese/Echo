class_name PredatorAgent
extends RefCounted
## LISTENER. Hears a cast through the connected-space field, walks to where it was cast,
## searches, recovers. Chases only with real line of sight. Port of reference/sim/sim.js (Stage 13).
## Every state change must be an edge in EDGES, and every event it logs names the event that caused it.

const EDGES := [
    "PATROL>CURIOUS", "RECOVER>CURIOUS", "SEARCH>CURIOUS",
    "CURIOUS>SEARCH", "SEARCH>RECOVER", "RECOVER>PATROL",
    "PATROL>CHASE", "CURIOUS>CHASE", "SEARCH>CHASE", "RECOVER>CHASE",
    "CHASE>SEARCH",
]

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
var params: Dictionary = ListenerParams.profile(&"suspense")
## Id of this listener's latest predator_state_changed event. The next change names it as its cause.
var last_state_event: int = -1
var last_step_tick: int = -1000000000
var _curious_start: int = -1
var _search_start: int = -1
var _contact_ticks: int = 0
var _first_contact_tick: int = -1
var _alert_start: int = -1
var _lost_ticks: int = 0
var _cap_ticks: int = 0
var _last_seen_pos: Vector2 = Vector2.ZERO


## A ping reached this listener. `cause_id` is the ping_cast event.
func hear(cast_id: int, origin: Vector2, cost: float, arrival_tick: int, cause_id: int, bus: EventBus) -> void:
    last_heard_origin = origin
    has_heard = true
    last_heard_tick = arrival_tick
    investigation_count += 1
    heard_cast_ids.append(cast_id)
    bus.emit_event(
        SemanticEvents.HEARD_PING,
        arrival_tick,
        {"predator": id, "cast_id": cast_id, "arrival_tick": arrival_tick, "weighted_cost": cost, "origin": origin},
        cause_id
    )
    var heard_event := bus.last_id
    if state != &"CHASE":
        dest = origin
        _curious_start = arrival_tick
        _set_state(&"CURIOUS", "heard ping %d" % cast_id, arrival_tick, bus, heard_event, {"heard_event": heard_event})


## A walking player was heard through connected floor. Standing still makes no sound.
func hear_step(tick: int, origin: Vector2, cost: float, reach: float, quiet: bool, bus: EventBus) -> void:
    last_step_tick = tick
    last_heard_origin = origin
    has_heard = true
    last_heard_tick = tick
    investigation_count += 1
    bus.emit_event(
        SemanticEvents.HEARD_STEP,
        tick,
        {"predator": id, "weighted_cost": cost, "reach": reach, "quiet": quiet, "origin": origin}
    )
    var heard_event := bus.last_id
    dest = origin
    _curious_start = tick
    _set_state(&"CURIOUS", "heard footsteps", tick, bus, heard_event, {"heard_event": heard_event})


func step(tick: int, grid: SoundGrid, player_pos: Vector2, path_field: Callable, bus: EventBus) -> void:
    var seen := position.distance_to(player_pos) <= float(params["contact_radius"]) and grid.has_los(position, player_pos)
    if seen:
        if _contact_ticks == 0:
            _first_contact_tick = tick
        _contact_ticks += 1
        last_seen_player_tick = tick
        _last_seen_pos = player_pos
    else:
        _contact_ticks = 0
    if state != &"CHASE" and _contact_ticks >= int(params["contact_ticks"]):
        # A sighting is caused by an earlier sound only while the listener is still acting on it.
        # From PATROL or RECOVER it walked into view.
        var investigating := state == &"CURIOUS" or state == &"SEARCH"
        _alert_start = tick
        _lost_ticks = 0
        _cap_ticks = 0
        _set_state(
            &"CHASE", "line of sight within %s m" % str(params["contact_radius"]), tick, bus,
            last_state_event if investigating else -1,
            {"sight": {"first_contact_tick": _first_contact_tick, "distance": position.distance_to(player_pos), "player_pos": player_pos, "predator_pos": position}}
        )
    match state:
        &"PATROL":
            var w := waypoints[wp_index]
            if _walk_toward(grid, path_field.call(w), w, float(params["patrol_speed"])) or position.distance_to(w) < 0.15:
                wp_index = (wp_index + 1) % waypoints.size()
        &"CURIOUS":
            var arrived := _walk_toward(grid, path_field.call(dest), dest, float(params["curious_speed"]))
            if arrived or tick - _curious_start > int(params["curious_max_ticks"]):
                _search_start = tick
                _set_state(&"SEARCH", "reached last heard origin" if arrived else "investigation timed out", tick, bus, last_state_event, {"arrived": arrived})
        &"SEARCH":
            if tick - _search_start >= int(params["search_ticks"]):
                dest = _nearest_waypoint()
                _set_state(&"RECOVER", "search finished", tick, bus, last_state_event)
        &"RECOVER":
            if _walk_toward(grid, path_field.call(dest), dest, float(params["patrol_speed"])):
                wp_index = maxi(0, waypoints.find(dest))
                _set_state(&"PATROL", "back on route", tick, bus, last_state_event)
        &"CHASE":
            _lost_ticks = 0 if seen else _lost_ticks + 1
            var target := player_pos if seen else _last_seen_pos
            _walk_toward(grid, path_field.call(target), target, float(params["chase_speed"]))
            _cap_ticks = _cap_ticks + 1 if (seen and position.distance_to(player_pos) <= float(params["capture_radius"])) else 0
            if _cap_ticks >= int(params["capture_los_ticks"]) and tick - _alert_start >= int(params["alert_ticks"]):
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
                        "player_pos": player_pos,
                        "predator_pos": position,
                    },
                    last_state_event
                )
            elif _lost_ticks >= int(params["chase_lose_ticks"]):
                _search_start = tick
                _set_state(&"SEARCH", "no contact for 1.7 s", tick, bus, last_state_event, {"lost_ticks": _lost_ticks, "last_seen_pos": _last_seen_pos})


func _set_state(to: StringName, reason: String, tick: int, bus: EventBus, cause: int = -1, facts: Dictionary = {}) -> void:
    if state == to:
        return
    var from := state
    var key := "%s>%s" % [from, to]
    if not EDGES.has(key):
        push_error("undeclared listener transition %s" % key)
        assert(false, "undeclared listener transition %s" % key)
        return
    state = to
    var payload := {"predator": id, "from": from, "to": to, "reason": reason}
    payload.merge(facts, true)
    bus.emit_event(SemanticEvents.PREDATOR_STATE_CHANGED, tick, payload, cause)
    last_state_event = bus.last_id


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
