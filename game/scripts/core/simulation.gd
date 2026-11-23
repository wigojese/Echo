class_name Simulation
extends RefCounted
## One level run on the fixed 30 Hz tick. Port of reference/sim/sim.js.
## Orchestrates player motion, pings, knowledge, predators, exit, timeout and retry.

const COOLDOWN_TICKS := 38  # ceil(1.25 s * 30 Hz)
const EXIT_RADIUS := 0.8
const EXIT_TICKS := 5
const TIMEOUT_TICKS := 2700  # 90 s soft timeout

var level: Dictionary
var geometry: Dictionary
var grid: SoundGrid
var edges: Array[Dictionary] = []
var bus: EventBus = EventBus.new()
var knowledge: KnowledgeStore = KnowledgeStore.new()
var motion: MotionController = MotionController.new()
var predators: Array[PredatorAgent] = []
var tick: int = 0
var state: StringName = &"RUNNING"
var paused: bool = false
var cast_count: int = 0
var next_ping_tick: int = 0
var last_field: PackedFloat64Array = PackedFloat64Array()
var _scheduled: Dictionary = {}
var _active_casts: Array[Dictionary] = []
var _path_cache: Dictionary = {}
var _exit_ticks: int = 0
var _exit_pos: Vector2 = Vector2.ZERO


func _init(level_data: Dictionary, geometry_data: Dictionary) -> void:
    level = level_data
    geometry = geometry_data
    var b: Array = level["world_bounds_metres"]
    grid = SoundGrid.from_strips(
        geometry["walkable_strips"],
        float(geometry["half_width_m"]),
        float(b[2]) - float(b[0]),
        float(b[3]) - float(b[1]),
        float(level["rules"].get("acoustic_cell_m", 0.25))
    )
    edges = grid.wall_edges()
    reset(true)


func reset(first: bool = false) -> void:
    tick = 0
    state = &"RUNNING"
    paused = false
    cast_count = 0
    next_ping_tick = 0
    _exit_ticks = 0
    _scheduled.clear()
    _active_casts.clear()
    last_field = PackedFloat64Array()
    bus.clear()
    knowledge.reset()
    motion = MotionController.new()
    var spawn: Array = level["player"]["spawn_xy"]
    motion.position = Vector2(spawn[0], spawn[1])
    var exit_xy: Array = level["goal"]["exit_xy"]
    _exit_pos = Vector2(exit_xy[0], exit_xy[1])
    predators.clear()
    for p in level.get("predators", []):
        var agent := PredatorAgent.new()
        agent.id = StringName(p["id"])
        agent.position = Vector2(p["spawn_xy"][0], p["spawn_xy"][1])
        for w in p["patrol_waypoints"]:
            agent.waypoints.append(Vector2(w[0], w[1]))
        agent.hearing_limit = float(p.get("hearing_cost_limit_m", AcousticFieldSolver.HEARING_LIMIT))
        predators.append(agent)
    var opening: float = float(level["rules"].get("opening_breath_m", 0.0))
    if opening > 0.0:
        var f := AcousticFieldSolver.solve(grid, motion.position, opening)
        for e in edges:
            if not is_inf(f[e["cell"]]):
                knowledge.record_contact(e["id"], e["a"], e["b"], 0, 0, e["n"])
        for c in range(f.size()):
            if not is_inf(f[c]):
                knowledge.record_cell(c, 0)
    if not first:
        bus.emit_event(SemanticEvents.LEVEL_RESET, 0, {})


func step(inputs: Array = []) -> void:
    if state != &"RUNNING" or paused:
        return
    var t := tick
    for inp in inputs:
        match String(inp["type"]):
            "move":
                motion.set_direction(Vector2(float(inp["dx"]), float(inp["dy"])))
            "stop":
                motion.set_direction(Vector2.ZERO)
            "quiet":
                motion.quiet = bool(inp["on"])
            "ping":
                _ping(t)
    motion.step(grid)
    if _scheduled.has(t):
        for fn in _scheduled[t]:
            fn.call()
        _scheduled.erase(t)
    knowledge.prune(t)
    _active_casts = _active_casts.filter(func(c: Dictionary) -> bool: return t - int(c["tick"]) <= 50)
    for pr in predators:
        pr.step(t, grid, motion.position, _path_field, bus)
        if pr.captured and state == &"RUNNING":
            state = &"CAPTURED"
    if state == &"RUNNING":
        _check_exit(t)
    if state == &"RUNNING" and t + 1 >= TIMEOUT_TICKS:
        state = &"TIMEOUT"
        bus.emit_event(SemanticEvents.LEVEL_TIMEOUT, t, {})
    tick += 1


## Runs inputs grouped by tick: {tick: [input, ...]}.
func run_inputs(by_tick: Dictionary, until_tick: int = 1000000) -> void:
    var guard := 0
    while state == &"RUNNING" and tick < until_tick and guard < 1000000:
        step(by_tick.get(tick, []))
        guard += 1


static func group_replay(replay: Dictionary) -> Dictionary:
    var by_tick: Dictionary = {}
    for inp in replay["inputs"]:
        var t := int(inp["tick"])
        if not by_tick.has(t):
            by_tick[t] = []
        by_tick[t].append(inp)
    return by_tick


func snapshot() -> VisibleWorldSnapshot:
    var snap := KnowledgeGate.build(motion.position, knowledge, _exit_pos, tick, {"nx": grid.nx, "ny": grid.ny, "cell": grid.cell})
    snap.waves = _waves(tick)
    return snap


func _schedule(at: int, fn: Callable) -> void:
    if not _scheduled.has(at):
        _scheduled[at] = []
    _scheduled[at].append(fn)


func _path_field(dest: Vector2) -> PackedFloat64Array:
    var k := grid.cell_index(dest)
    if not _path_cache.has(k):
        _path_cache[k] = AcousticFieldSolver.solve(grid, dest, INF)
    return _path_cache[k]


func _ping(t: int) -> void:
    if t < next_ping_tick:
        bus.emit_event(SemanticEvents.PING_REJECTED, t, {"remaining_ticks": next_ping_tick - t})
        return
    cast_count += 1
    var cast_id := cast_count
    var origin := motion.position
    next_ping_tick = t + COOLDOWN_TICKS
    var field := AcousticFieldSolver.solve(grid, origin, AcousticFieldSolver.PULSE_MAX_COST)
    last_field = field
    _active_casts.append({"cast_id": cast_id, "tick": t, "field": field})
    knowledge.record_cast(cast_id, origin, t)
    var count := 0
    var first := 1 << 30
    var last := -1
    for e in edges:
        var c: float = field[e["cell"]]
        if is_inf(c):
            continue
        var at := t + ceili(c / AcousticFieldSolver.PULSE_SPEED / SimClock.DT)
        count += 1
        first = mini(first, at)
        last = maxi(last, at)
        var id: int = e["id"]
        var a: Vector2 = e["a"]
        var b: Vector2 = e["b"]
        var n: Vector2 = e["n"]
        _schedule(at, func() -> void: knowledge.record_contact(id, a, b, at, cast_id, n))
    for c in range(field.size()):
        if is_inf(field[c]):
            continue
        var cell_at := t + ceili(field[c] / AcousticFieldSolver.PULSE_SPEED / SimClock.DT)
        var cell_id := c
        _schedule(cell_at, func() -> void: knowledge.record_cell(cell_id, cell_at))
    bus.emit_event(
        SemanticEvents.PING_CAST,
        t,
        {"cast_id": cast_id, "origin": origin, "edges": count, "cooldown_until": next_ping_tick}
    )
    if count > 0:
        _schedule(first, func() -> void: bus.emit_event(SemanticEvents.WAVE_CONTACT, first, {"cast_id": cast_id, "edges": count, "first_tick": first, "last_tick": last}))
    var exit_cost: float = field[grid.cell_index(_exit_pos)]
    if not is_inf(exit_cost):
        _schedule(t + ceili(exit_cost / AcousticFieldSolver.PULSE_SPEED / SimClock.DT), func() -> void: knowledge.mark_exit_known())
    for pr in predators:
        var pc: float = field[grid.cell_index(pr.position)]
        if is_inf(pc):
            continue
        var arrive := t + ceili(pc / AcousticFieldSolver.PULSE_SPEED / SimClock.DT)
        _schedule(arrive, func() -> void: knowledge.record_sighting(pr.id, pr.position, arrive, true))
        if pc <= pr.hearing_limit:
            _schedule(arrive, func() -> void: _on_heard(pr, cast_id, origin, pc, arrive))


func _check_exit(t: int) -> void:
    if motion.position.distance_to(_exit_pos) <= EXIT_RADIUS:
        _exit_ticks += 1
    else:
        _exit_ticks = 0
    if _exit_ticks >= EXIT_TICKS:
        state = &"WON"
        knowledge.mark_exit_known()
        bus.emit_event(SemanticEvents.EXIT_REACHED, t, {"casts": cast_count, "ticks": t})


## Built only from the event log.
func explain() -> Dictionary:
    var hist := bus.history()
    if state == &"CAPTURED":
        for e in hist:
            if e["kind"] == SemanticEvents.PLAYER_CAPTURED:
                var c: Dictionary = e["payload"]
                return {"outcome": "captured", "facts": c}
    if state == &"WON":
        return {"outcome": "won", "echoes": cast_count}
    if state == &"TIMEOUT":
        return {"outcome": "timeout"}
    return {}


func _on_heard(pr: PredatorAgent, cast_id: int, origin: Vector2, cost: float, arrive: int) -> void:
    pr.hear(cast_id, origin, cost, arrive, bus)
    knowledge.mark_heard(cast_id, arrive)


## Incident front samples for the renderer: only cells the wave is touching right now.
func _waves(t: int) -> Array:
    var out: Array = []
    for c in _active_casts:
        var age: int = t - int(c["tick"])
        var front: float = float(age) / float(SimClock.HZ) * AcousticFieldSolver.PULSE_SPEED
        var f: PackedFloat64Array = c["field"]
        var pts: Array = []
        for j in range(1, grid.ny - 1):
            for i in range(1, grid.nx - 1):
                var k := j * grid.nx + i
                var v: float = f[k]
                if is_inf(v) or absf(v - front) > 0.1 or ((i >> 1) + (j >> 1)) % 3 == 0:
                    continue
                var gx := 0.0
                var gy := 0.0
                if not is_inf(f[k + 1]) and not is_inf(f[k - 1]):
                    gx = f[k + 1] - f[k - 1]
                if not is_inf(f[k + grid.nx]) and not is_inf(f[k - grid.nx]):
                    gy = f[k + grid.nx] - f[k - grid.nx]
                var m := maxf(sqrt(gx * gx + gy * gy), 0.000001)
                pts.append([(i + 0.5) * grid.cell, (j + 0.5) * grid.cell, -gy / m, gx / m, maxf(0.0, 1.0 - v / AcousticFieldSolver.PULSE_MAX_COST)])
        out.append({"cast_id": c["cast_id"], "age_ticks": age, "points": pts})
    return out
