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
var trail: Array[Vector2] = []
var run_casts: Array[Dictionary] = []
var pred_route: Array = []
var _alert_start: int = -1
var _exit_pos: Vector2 = Vector2.ZERO
## Listener numbers for this run: a profile (&"suspense" is the approved rule set, &"forgiving" a proposal) plus optional overrides.
var profile: StringName = &"suspense"
var listener_params: Dictionary = {}


func _init(level_data: Dictionary, geometry_data: Dictionary, opts: Dictionary = {}) -> void:
    level = level_data
    geometry = geometry_data
    profile = StringName(opts.get("profile", &"suspense"))
    listener_params = ListenerParams.profile(profile, opts.get("overrides", {}))
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
    trail.clear()
    trail.append(motion.position)
    run_casts.clear()
    pred_route.clear()
    _alert_start = -1
    var exit_xy: Array = level["goal"]["exit_xy"]
    _exit_pos = Vector2(exit_xy[0], exit_xy[1])
    predators.clear()
    for p in level.get("predators", []):
        var agent := PredatorAgent.new()
        agent.id = StringName(p["id"])
        agent.position = Vector2(p["spawn_xy"][0], p["spawn_xy"][1])
        for w in p["patrol_waypoints"]:
            agent.waypoints.append(Vector2(w[0], w[1]))
        agent.params = listener_params
        agent.hearing_limit = float(p.get("hearing_cost_limit_m", AcousticFieldSolver.HEARING_LIMIT)) * float(listener_params["hearing_scale"])
        predators.append(agent)
        pred_route.append([[agent.position.x, agent.position.y, 0]])
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
    if motion.position.distance_to(trail[trail.size() - 1]) >= 0.75:
        trail.append(motion.position)
        if trail.size() > 600:
            trail.pop_front()
    if _scheduled.has(t):
        for fn in _scheduled[t]:
            fn.call()
        _scheduled.erase(t)
    knowledge.prune(t)
    _footsteps(t)
    _active_casts = _active_casts.filter(func(c: Dictionary) -> bool: return t - int(c["tick"]) <= 50)
    for pr in predators:
        pr.step(t, grid, motion.position, _path_field, bus)
        if pr.captured and state == &"RUNNING":
            state = &"CAPTURED"
    var chasing := false
    for i in range(predators.size()):
        if predators[i].state == &"CHASE":
            chasing = true
        if t % 15 == 0 or state != &"RUNNING":
            (pred_route[i] as Array).append([predators[i].position.x, predators[i].position.y, t])
    if chasing and _alert_start < 0:
        _alert_start = t
    elif not chasing:
        _alert_start = -1
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
    snap.trail = trail.duplicate()
    if _alert_start >= 0 and state == &"RUNNING":
        snap.alert = {"age_ticks": tick - _alert_start}
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
    run_casts.append({"cast_id": cast_id, "origin": origin, "tick": t})
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
    var cast_event := bus.last_id
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
            _schedule(arrive, func() -> void: _on_heard(pr, cast_id, origin, pc, arrive, cast_event))


func _check_exit(t: int) -> void:
    if motion.position.distance_to(_exit_pos) <= EXIT_RADIUS:
        _exit_ticks += 1
    else:
        _exit_ticks = 0
    if _exit_ticks >= EXIT_TICKS:
        state = &"WON"
        knowledge.mark_exit_known()
        bus.emit_event(SemanticEvents.EXIT_REACHED, t, {"casts": cast_count, "ticks": t})


## Footsteps: a walking player is heard through connected floor within footstep_m. Quiet step is 70 percent fainter.
## Standing still makes no sound. Sampled at 6 Hz, and a listener acts on a step at most once a second.
func _footsteps(t: int) -> void:
    if t % int(listener_params["step_interval_ticks"]) != 0:
        return
    if motion.velocity.length() < 0.3:
        return
    var reach := float(listener_params["footstep_m"]) * (float(listener_params["quiet_noise_factor"]) if motion.quiet else 1.0)
    var field := PackedFloat64Array()
    for pr in predators:
        if pr.state == &"CHASE" or t - pr.last_step_tick < int(listener_params["step_repeat_ticks"]):
            continue
        if pr.position.distance_to(motion.position) > reach:
            continue
        if field.is_empty():
            field = AcousticFieldSolver.solve(grid, motion.position, reach)
        var c: float = field[grid.cell_index(pr.position)]
        if is_inf(c) or c > reach:
            continue
        pr.hear_step(t, motion.position, c, reach, motion.quiet, bus)


## The cause chain of an event, oldest first, found by following each event's cause back to its root.
func cause_chain(terminal: Dictionary) -> Array:
    var by_id := {}
    for e in bus.history():
        by_id[e["id"]] = e
    var chain: Array = []
    var e: Dictionary = terminal
    var guard := 0
    while not e.is_empty() and guard < 64:
        chain.push_front(e)
        var cause: int = e["cause"]
        e = by_id[cause] if (cause >= 0 and by_id.has(cause)) else {}
        guard += 1
    return chain


## Built only from the event log. What the player may be told straight after a round: echo numbers the player cast,
## the warning length the player saw, and the player's OWN position against their OWN cast origin.
## No listener position, route or timing of sight.
func explain() -> Dictionary:
    if state == &"WON":
        var heard: Array = bus.history().filter(func(e: Dictionary) -> bool: return e["kind"] == SemanticEvents.HEARD_PING)
        var s := "You reached the exit after %d echo%s." % [cast_count, "" if cast_count == 1 else "es"]
        if not heard.is_empty():
            s += " Echo %d drew the listener toward where you cast it." % int(heard[0]["payload"]["cast_id"])
        return {"outcome": "won", "echoes": cast_count, "sentence": s}
    if state == &"TIMEOUT":
        return {"outcome": "timeout", "sentence": "Time ran out. Retry starts from the same seed."}
    if state != &"CAPTURED":
        return {}
    var cap := {}
    for e in bus.history():
        if e["kind"] == SemanticEvents.PLAYER_CAPTURED:
            cap = e
            break
    var chain := cause_chain(cap)
    var f: Dictionary = cap["payload"]
    var warn := "%.2f" % (float(f["alert_ticks"]) / float(SimClock.HZ))
    var root := {}
    var chase := {}
    var arrived := false
    for e in chain:
        if root.is_empty() and (e["kind"] == SemanticEvents.HEARD_PING or e["kind"] == SemanticEvents.HEARD_STEP):
            root = e
        if chase.is_empty() and e["kind"] == SemanticEvents.PREDATOR_STATE_CHANGED and e["payload"]["to"] == &"CHASE":
            chase = e
        if e["kind"] == SemanticEvents.PREDATOR_STATE_CHANGED and e["payload"]["to"] == &"SEARCH" and e["payload"].get("arrived", false):
            arrived = true
    var sentence := ""
    var lesson := ""
    var rule := "NONE"
    if root.is_empty():
        var doing := "returning to its route" if (not chase.is_empty() and chase["payload"]["from"] == &"RECOVER") else "patrolling"
        sentence = "The listener saw you while it was %s and caught you after a %s s warning." % [doing, warn]
        rule = "WALKED_INTO_VIEW"
        lesson = "No sound drew it: you walked into its sight. An echo shows a listener for a moment, but it also hears the echo, so choose where you cast."
    elif root["kind"] == SemanticEvents.HEARD_STEP:
        sentence = "The listener heard your footsteps, walked to the spot, and found you after a %s s warning." % warn
        rule = "HEARD_STEPS"
        var quiet_heard := false
        for e in bus.history():
            if e["kind"] == SemanticEvents.HEARD_STEP and e["payload"]["quiet"]:
                quiet_heard = true
        lesson = "It heard you even on quiet step. Stand still to make no sound." if quiet_heard else "It heard you walk. Quiet step makes footsteps 70 percent fainter, and standing still makes none."
    else:
        var k: int = root["payload"]["cast_id"]
        var near: float = (f["player_pos"] as Vector2).distance_to(root["payload"]["origin"])
        if arrived:
            sentence = "The listener heard echo %d, walked to where you cast it, and found you after a %s s warning." % [k, warn]
        else:
            sentence = "The listener heard echo %d, was on its way to where you cast it, and found you after a %s s warning." % [k, warn]
        var since: int = int(chase["tick"]) - 12 * SimClock.HZ if not chase.is_empty() else int(cap["tick"]) - 12 * SimClock.HZ
        var recent := 0
        for e in bus.history():
            if e["kind"] == SemanticEvents.HEARD_PING and int(e["tick"]) <= int(cap["tick"]) and int(e["tick"]) >= since:
                recent += 1
        if recent >= 3:
            rule = "REPEATED_ECHOES"
            lesson = "%d echoes in a row kept pulling it back. Each one tells a listener where to go." % recent
        elif near <= 3.0:
            rule = "STAYED_NEAR_ORIGIN"
            lesson = "You were still %.1f m from where you cast echo %d. After an echo, move away from it: the listener walks to the origin." % [near, k]
        else:
            rule = "FOUND_ON_ROUTE"
            lesson = "You were %.1f m from where you cast echo %d, but its search reached you. Echoes pull a listener toward the route you take next." % [near, k]
    return {"outcome": "captured", "facts": f, "sentence": sentence, "lesson": lesson, "rule": rule}


## Post-round only: the full cause chain with numbers. The view may show it only after the player asks.
func explain_detail() -> Dictionary:
    if state == &"RUNNING":
        return {}
    var terminal := {}
    for kind in [SemanticEvents.PLAYER_CAPTURED, SemanticEvents.EXIT_REACHED, SemanticEvents.LEVEL_TIMEOUT]:
        for e in bus.history():
            if e["kind"] == kind:
                terminal = e
                break
        if not terminal.is_empty():
            break
    if terminal.is_empty():
        return {}
    var out: Array = []
    for e in cause_chain(terminal):
        out.append({"id": e["id"], "tick": e["tick"], "kind": e["kind"], "cause": e["cause"], "text": _describe(e)})
    return {"terminal": terminal["kind"], "chain": out}


func _describe(e: Dictionary) -> String:
    var p: Dictionary = e["payload"]
    var secs := func(ticks: int) -> String: return "%.2f s" % (float(ticks) / float(SimClock.HZ))
    match e["kind"]:
        SemanticEvents.PING_CAST:
            var o: Vector2 = p["origin"]
            return "You cast echo %d at (%.1f, %.1f)." % [p["cast_id"], o.x, o.y]
        SemanticEvents.HEARD_PING:
            return "The listener heard echo %d, %.1f m of floor away, %s into the run." % [p["cast_id"], p["weighted_cost"], secs.call(e["tick"])]
        SemanticEvents.HEARD_STEP:
            return "The listener heard your %sfootsteps %.1f m away." % ["quiet " if p["quiet"] else "", p["weighted_cost"]]
        SemanticEvents.PREDATOR_STATE_CHANGED:
            match p["to"]:
                &"CHASE":
                    return "It saw you %.1f m away. The warning began, and a capture needs at least %s of it." % [p["sight"]["distance"], secs.call(int(listener_params["alert_ticks"]))]
                &"CURIOUS":
                    return "It turned toward the spot where it heard you walk." if p["reason"] == "heard footsteps" else "It turned toward where echo %s was cast." % String(p["reason"]).replace("heard ping ", "")
                &"SEARCH":
                    if p["from"] == &"CHASE":
                        return "It lost sight of you for %.1f s and began to search." % (float(p["lost_ticks"]) / float(SimClock.HZ))
                    return "It reached the spot and looked around." if p.get("arrived", false) else "It gave up walking after 7 s and looked around."
                &"RECOVER":
                    return "It finished searching and started back to its route."
                _:
                    return "It was back on its route."
        SemanticEvents.PLAYER_CAPTURED:
            return "It reached you %s into the warning." % secs.call(int(p["alert_ticks"]))
    return String(e["kind"])


func _on_heard(pr: PredatorAgent, cast_id: int, origin: Vector2, cost: float, arrive: int, cause_id: int) -> void:
    pr.hear(cast_id, origin, cost, arrive, cause_id, bus)
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


## Post-round only. While the round is running this returns an empty dictionary, so the view layer
## cannot ask for hidden truth.
func reveal_truth() -> Dictionary:
    if state == &"RUNNING" or predators.is_empty():
        return {}
    var pr: PredatorAgent = predators[0]
    return {
        "route": pred_route[0].duplicate(),
        "last_heard_origin": pr.last_heard_origin if pr.has_heard else null,
        "last_heard_tick": pr.last_heard_tick,
        "heard_cast_ids": pr.heard_cast_ids.duplicate(),
        "predator_final": pr.position,
        "player_final": motion.position,
    }


## Post-round only: every echo you cast and the full route you walked.
func summary() -> Dictionary:
    if state == &"RUNNING":
        return {}
    return {"casts": run_casts.duplicate(), "trail": trail.duplicate(), "end": motion.position, "exit": _exit_pos, "outcome": state}
