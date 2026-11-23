extends SceneTree
## Headless runner. Intended command (UNVERIFIED until run in Godot 4.7):
##   godot --headless --path . -s tests/run_tests.gd
## Every method named test_* is run. Exit code 1 if any check fails.

var _passed: int = 0
var _failed: int = 0


func _init() -> void:
    for m in get_method_list():
        if String(m["name"]).begins_with("test_"):
            call(m["name"])
    print("RESULT %d passed, %d failed" % [_passed, _failed])
    quit(1 if _failed > 0 else 0)


func _check(label: String, ok: bool, detail: String = "") -> void:
    if ok:
        _passed += 1
        print("PASS  ", label, "  ", detail)
    else:
        _failed += 1
        print("FAIL  ", label, "  ", detail)


func _two_corridors() -> SoundGrid:
    return SoundGrid.from_strips([[4, 6, 4, 14], [7.2, 6, 7.2, 14]], 1.2, 24.0, 36.0, 0.25)


func test_sealed_wall() -> void:
    var g := _two_corridors()
    var f := AcousticFieldSolver.solve(g, Vector2(4, 10))
    _check("sealed wall: cell behind the wall is unreached", is_inf(f[g.cell_index(Vector2(7.2, 10))]))


func test_diagonal_leak() -> void:
    var g := SoundGrid.from_ascii([".#", "#."], 1.0)
    var f := AcousticFieldSolver.solve(g, Vector2(0.5, 0.5))
    _check("diagonal corner: no leak between diagonal wall cells", is_inf(f[3]))


func test_event_bus_rejects_non_semantic() -> void:
    var bus := EventBus.new()
    var ok := bus.emit_event(&"frame_tick", 1)
    _check("event bus rejects a non-semantic event", not ok and bus.history().is_empty())
    _check("event bus accepts ping_cast", bus.emit_event(SemanticEvents.PING_CAST, 5, {"cast_id": 1}))


func test_sim_clock_caps_catch_up() -> void:
    var c := SimClock.new()
    var steps := c.advance(1.0)
    _check("sim clock runs at most 4 catch-up ticks", steps == SimClock.MAX_CATCHUP_TICKS and c.degraded)


func test_knowledge_expiry() -> void:
    var k := KnowledgeStore.new()
    k.record_contact(1, Vector2.ZERO, Vector2.ONE, 0, 1)
    k.record_sighting(&"listener-01", Vector2(5, 5), 0, true)
    k.prune(KnowledgeStore.GHOST_TICKS + 1)
    _check("ghost expires within 1.25 s", k.ghosts.is_empty())
    _check("static memory still held at 1.25 s", k.segments.size() == 1)
    k.prune(KnowledgeStore.MEMORY_TICKS + 1)
    _check("static memory expires after 8 s", k.segments.is_empty())


func test_camera_independent_of_hidden_predator() -> void:
    var store := KnowledgeStore.new()
    store.record_contact(1, Vector2(0, 0), Vector2(0, 5), 0, 1)
    var player := Vector2(3, 8)
    var director := CameraDirector.new()
    # Two worlds that differ only in where a hidden predator stands. KnowledgeGate never
    # receives WorldTruth, so the framing must be identical.
    var truth_a := WorldTruth.new()
    truth_a.predators = [{"id": &"l", "position": Vector2(13, 24), "state": &"PATROL"}]
    var truth_b := WorldTruth.new()
    truth_b.predators = [{"id": &"l", "position": Vector2(2, 20), "state": &"CHASE"}]
    var shot_a := director.frame(KnowledgeGate.build(player, store, truth_a.exit_position, 10))
    var shot_b := director.frame(KnowledgeGate.build(player, store, truth_b.exit_position, 10))
    _check("camera framing identical for different hidden predator states", shot_a == shot_b)
    var snap := KnowledgeGate.build(player, store, Vector2(20, 32), 10)
    _check("unknown exit stays hidden in the snapshot", snap.known_exit == null)
    store.mark_exit_known()
    snap = KnowledgeGate.build(player, store, Vector2(20, 32), 10)
    _check("exit appears only once it is known", snap.known_exit == Vector2(20, 32))


func test_replay_round_trip() -> void:
    var r := ReplayRecorder.new()
    r.level_id = "EC-L01"
    r.seed_value = 2083
    r.record(12, &"ping", Vector2(3, 8.1))
    var back := ReplayRecorder.from_json(r.to_json())
    _check("replay round trip keeps level, seed and inputs", back != null and back.level_id == "EC-L01" and back.seed_value == 2083 and back.inputs.size() == 1)
    _check("replay rejects an unknown format version", ReplayRecorder.from_json('{"format_version": 99}') == null)


func test_validator_rejects_sealed_exit() -> void:
    var level := {
        "world_bounds_metres": [0, 0, 24, 36],
        "rules": {"acoustic_cell_m": 0.25},
        "player": {"spawn_xy": [4, 8]},
        "goal": {"exit_xy": [7.2, 12]},
        "predators": [],
    }
    var geometry := {"half_width_m": 1.2, "walkable_strips": [[4, 6, 4, 14], [7.2, 6, 7.2, 14]]}
    var problems := LevelValidator.validate(level, geometry)
    _check("validator rejects a sealed exit with a readable message", problems.size() == 1 and "sealed" in problems[0], str(problems))


# ---- Stage 08: simulation, mirrors tests/js/stage08.test.js. Never run in Godot yet. ----

func _json(path: String) -> Dictionary:
    return JSON.parse_string(FileAccess.get_file_as_string(path))


func _l01() -> Simulation:
    return Simulation.new(
        _json("res://game/resources/levels/EC-L01.json"), _json("res://game/resources/levels/EC-L01-geometry.json")
    )


func _sealed() -> Simulation:
    return Simulation.new(
        _json("res://tests/fixtures/sealed_level.json"), _json("res://tests/fixtures/sealed_geometry.json")
    )


func _count(sim: Simulation, kind: StringName) -> int:
    var n := 0
    for e in sim.bus.history():
        if e["kind"] == kind:
            n += 1
    return n


func test_sim_cooldown_and_origin() -> void:
    var sim := _l01()
    sim.step([{"type": "ping"}])
    for _i in range(4):
        sim.step([])
    sim.step([{"type": "ping"}])
    _check("sim: second tap inside the cooldown is rejected visibly", _count(sim, SemanticEvents.PING_CAST) == 1 and _count(sim, SemanticEvents.PING_REJECTED) == 1)


func test_sim_sealed_wall_not_heard() -> void:
    var sim := _sealed()
    var by_tick := {3: [{"type": "ping"}]}
    sim.run_inputs(by_tick, 150)
    _check("sim sealed wall: hidden predator not heard, no ghost", _count(sim, SemanticEvents.HEARD_PING) == 0 and sim.knowledge.ghosts.is_empty() and sim.predators[0].state == &"PATROL")


func test_sim_replays_match_reference() -> void:
    var a := _l01()
    a.run_inputs(Simulation.group_replay(_json("res://reference/replays/A_heard_and_caught.json")))
    var b := _l01()
    b.run_inputs(Simulation.group_replay(_json("res://reference/replays/B_heard_and_escaped.json")))
    _check("replay A is captured and replay B wins, as in the Node reference", a.state == &"CAPTURED" and b.state == &"WON", "%s / %s" % [a.state, b.state])
    _check("replay A captured at tick 700 like the reference", a.tick == 701, str(a.tick))


func test_sim_retry_resets_everything() -> void:
    var sim := _l01()
    sim.run_inputs(Simulation.group_replay(_json("res://reference/replays/A_heard_and_caught.json")))
    sim.reset()
    _check("retry: tick, state, memory and ghosts are reset", sim.tick == 0 and sim.state == &"RUNNING" and sim.knowledge.segments.is_empty() and sim.knowledge.ghosts.is_empty() and sim.predators[0].state == &"PATROL" and sim.bus.history().size() == 1)


func test_sim_camera_independent_of_hidden_predator() -> void:
    var level_b := _json("res://tests/fixtures/sealed_level.json")
    level_b["predators"][0]["spawn_xy"] = [7.2, 13]
    level_b["predators"][0]["patrol_waypoints"] = [[7.2, 13], [7.2, 7]]
    var a := _sealed()
    var b := Simulation.new(level_b, _json("res://tests/fixtures/sealed_geometry.json"))
    var plan := {10: [{"type": "ping"}], 11: [{"type": "move", "dx": 0, "dy": -1}], 60: [{"type": "ping"}], 61: [{"type": "stop"}]}
    var same := true
    var director := CameraDirector.new()
    for _k in range(300):
        a.step(plan.get(a.tick, []))
        b.step(plan.get(b.tick, []))
        if director.frame(a.snapshot()) != director.frame(b.snapshot()) or a.snapshot().memory_segments != b.snapshot().memory_segments:
            same = false
    _check("sim camera firewall: different hidden predator positions, identical framing for 300 ticks", same)


# ---- Stage 09: input router and planner, mirrors tests/js/stage09.test.js. Never run in Godot yet. ----

func _kinds(r: InputRouter) -> Array:
    var names: Array = []
    for i in r.drain():
        names.append(String(i["type"]))
    return names


func test_input_echo_tap_pings_only() -> void:
    var r := InputRouter.new()
    r.pointer_down(1, Vector2(318, 740), 0.0)
    r.pointer_up(1, Vector2(318, 740), 60.0)
    _check("input: tapping Echo sends one ping and no waypoint", _kinds(r) == ["ping"])


func test_input_world_to_echo_drag_never_pings() -> void:
    var r := InputRouter.new()
    r.pointer_down(1, Vector2(150, 300), 0.0)
    r.pointer_move(1, Vector2(318, 740))
    r.pointer_up(1, Vector2(318, 740), 90.0)
    _check("input: a drag that starts in the world and ends on Echo does not ping", _kinds(r).is_empty())


func test_input_third_finger_and_cancel() -> void:
    var r := InputRouter.new()
    r.set_mode(&"joystick")
    r.pointer_down(1, Vector2(80, 600), 0.0)
    r.pointer_down(2, Vector2(318, 740), 10.0)
    r.drain()
    r.pointer_down(3, Vector2(150, 400), 20.0)
    _check("input: a third finger is ignored", r.owners.size() == 2 and _kinds(r).is_empty())
    r.pointer_cancel(2)
    _check("input: an interruption cancels everything and never pings", _kinds(r) == ["cancel_all"])


func test_input_long_press_is_not_a_waypoint() -> void:
    var r := InputRouter.new()
    r.pointer_down(1, Vector2(150, 300), 0.0)
    r.pointer_up(1, Vector2(150, 300), 400.0)
    _check("input: a 400 ms press in the world sets no waypoint", _kinds(r).is_empty())


func test_input_planner_truncates_at_known_boundary() -> void:
    var sim := _l01()
    var snap := sim.snapshot()
    var far := InputDriver.screen_to_world(Vector2(195, 120), snap.player_position)
    var result := InputDriver.plan(snap, far)
    var known: Dictionary = {}
    for c in snap.known_cells:
        known[int(c[0])] = true
    var inside := true
    for c in result["cells"]:
        if not known.has(c):
            inside = false
    _check("input: tapping unlit floor routes only through known cells and is marked truncated", result["truncated"] and inside)


# ---- Stage 11: camera director and gestures, mirrors tests/js/stage11*.test.js. Never run in Godot yet. ----

func test_camera_band_hysteresis() -> void:
    var b: StringName = &"active"
    var got: Array = []
    for z in [1.41, 1.42, 1.30, 1.28, 0.79, 0.78, 0.89, 0.90]:
        b = CameraDirector.next_band(b, z)
        got.append(b)
    _check("camera: bands switch at 1.42 / 1.28 and 0.78 / 0.90 with hysteresis", got == [&"active", &"close", &"close", &"active", &"active", &"memory", &"memory", &"active"], str(got))


func test_camera_pinch_keeps_anchor_and_clamps() -> void:
    var sim := _l01()
    var snap := sim.snapshot()
    var cam := CameraDirector.new()
    var anchor := Vector2(120, 300)
    var c0: Dictionary = cam.frame(snap)
    var w := CameraDirector.screen_to_world(anchor, c0["center"], CameraDirector.BASE_PX * float(c0["zoom"]))
    cam.pinch(anchor, 1.3, snap)
    var c1: Dictionary = cam.frame(snap)
    var back := CameraDirector.world_to_screen(w, c1["center"], CameraDirector.BASE_PX * float(c1["zoom"]))
    _check("camera: pinch keeps the world point under the fingers within 2 px", back.distance_to(anchor) <= 2.0, str(back.distance_to(anchor)))
    for _i in range(40):
        cam.pinch(anchor, 1.5, snap)
    _check("camera: zoom never exceeds 1.75", cam.zoom <= CameraDirector.Z_MAX)


func test_camera_trace_path_stays_on_the_walked_trail() -> void:
    var sim := _l01()
    sim.run_inputs(Simulation.group_replay(_json("res://reference/replays/B_heard_and_escaped.json")), 600)
    var snap := sim.snapshot()
    var cam := CameraDirector.new()
    _check("camera: TRACE is available after a walked bend with something remembered", cam.enter_trace(snap))
    var raw: Array = snap.trail.duplicate()
    raw.append(snap.player_position)
    var worst := 0.0
    for q in cam.trace["pts"]:
        var best := INF
        for i in range(1, raw.size()):
            var a: Vector2 = raw[i - 1]
            var b: Vector2 = raw[i]
            var ab := b - a
            var l2 := ab.length_squared()
            var t := 0.0 if l2 == 0.0 else clampf((Vector2(q.x, q.y) - a).dot(ab) / l2, 0.0, 1.0)
            best = minf(best, Vector2(q.x, q.y).distance_to(a + ab * t))
        worst = maxf(worst, best)
    _check("camera: the TRACE path stays within 0.9 m of where the player walked", worst < 0.9, str(worst))
    _check("camera: the world pauses in TRACE", cam.frame(snap)["pause_sim"])


func test_camera_independent_of_hidden_exit_and_listener() -> void:
    var level_b := _json("res://game/resources/levels/EC-L01.json")
    level_b["goal"]["exit_xy"] = [22, 17]
    level_b["predators"][0]["spawn_xy"] = [17, 24]
    level_b["predators"][0]["patrol_waypoints"] = [[17, 24], [13, 24]]
    var a := _l01()
    var b := Simulation.new(level_b, _json("res://game/resources/levels/EC-L01-geometry.json"))
    var plan := {0: [{"type": "move", "dx": 0, "dy": 1}], 20: [{"type": "ping"}], 70: [{"type": "move", "dx": 1, "dy": 0}], 90: [{"type": "stop"}]}
    var ca := CameraDirector.new()
    var cb := CameraDirector.new()
    var same := true
    for _k in range(150):
        a.step(plan.get(a.tick, []))
        b.step(plan.get(b.tick, []))
        ca.tick(33.3)
        cb.tick(33.3)
        if ca.frame(a.snapshot()) != cb.frame(b.snapshot()):
            same = false
    _check("camera: different hidden exit and listener positions give identical framing", same)


func test_input_trace_and_pinch_gestures() -> void:
    var r := InputRouter.new()
    r.trace_enabled = true
    r.pointer_down(1, Vector2(229, 740), 0.0)
    r.pointer_up(1, Vector2(229, 740), 40.0)
    _check("input: tapping TRACE enters TRACE", _kinds(r) == ["trace_enter"])
    r.trace_mode = true
    r.pointer_down(1, Vector2(318, 740), 0.0)
    r.pointer_up(1, Vector2(318, 740), 40.0)
    _check("input: Echo does nothing while reviewing", _kinds(r).is_empty())
    var p := InputRouter.new()
    p.pointer_down(1, Vector2(150, 400), 0.0)
    p.pointer_down(2, Vector2(250, 400), 10.0)
    p.pointer_move(1, Vector2(140, 400), 20.0)
    p.pointer_move(2, Vector2(260, 400), 30.0)
    p.pointer_move(1, Vector2(120, 400), 40.0)
    p.pointer_move(2, Vector2(280, 400), 50.0)
    p.pointer_up(1, Vector2(120, 400), 60.0)
    p.pointer_up(2, Vector2(280, 400), 70.0)
    var k := _kinds(p)
    _check("input: a pinch emits zoom and never a waypoint", k.has("pinch") and not k.has("waypoint"))


# ---- Stage 12: transitions, alert and the post-round gate, mirrors tests/js/stage12.test.js. Never run in Godot yet. ----

func test_transitions_rate_limit_and_once() -> void:
    var t := Transitions.new()
    var accepted := 0
    for ms in range(0, 5000, 10):
        if ms % 100 == 0 and t.start(&"T6"):
            accepted += 1
        t.tick(10.0)
    _check("transitions: repeated threat alerts every 100 ms are accepted at most once a second", accepted <= 5, str(accepted))
    var first := Transitions.new()
    _check("transitions: the wordmark runs only the first time", first.start(&"T1") and not first.start(&"T1"))


func test_transitions_reduced_motion() -> void:
    var t := Transitions.new(true)
    _check("transitions: the camera nudge is off under reduced motion", not t.start(&"T4"))
    t.start(&"T6")
    t.tick(30.0)
    var p := t.threat_params(true)
    _check("transitions: reduced motion has no zoom and no flicker, only a steady edge", p["zoom_mul"] == 1.0 and p["flicker"] == 0.0 and p["edge"] > 0.0)


func test_transitions_cancel_is_final() -> void:
    var bad := 0
    for id in Transitions.SPECS.keys():
        for frac in [0.0, 0.25, 0.5, 0.75, 1.0]:
            var t := Transitions.new()
            t.start(id)
            t.tick(t.duration(id) * frac + 0.001)
            t.cancel(id)
            var before := t.progress(id)
            t.tick(500.0)
            if absf(t.progress(id) - before) > 0.000001 and not Transitions.PERSISTENT.has(id):
                bad += 1
    _check("transitions: every transition cancels to a final state at 0, 25, 50, 75 and 100 percent", bad == 0, str(bad))


func test_sim_alert_is_not_positional_and_truth_is_gated() -> void:
    var sim := _l01()
    var by_tick := Simulation.group_replay(_json("res://reference/replays/A_heard_and_caught.json"))
    var alert_keys := {}
    var refused_while_running := true
    while sim.state == &"RUNNING" and sim.tick < 1000:
        sim.step(by_tick.get(sim.tick, []))
        var a: Variant = sim.snapshot().alert
        if a != null:
            for k in (a as Dictionary).keys():
                alert_keys[k] = true
        if sim.state == &"RUNNING" and not sim.reveal_truth().is_empty():
            refused_while_running = false
    _check("sim: the alert carries only its age", alert_keys.keys() == ["age_ticks"])
    _check("sim: the real listener route is refused while the round runs and given after it ends", refused_while_running and not sim.reveal_truth().is_empty() and not sim.summary().is_empty())


func test_camera_mapping_with_transient_effects() -> void:
    var sim := _l01()
    var snap := sim.snapshot()
    var cam := CameraDirector.new()
    cam.set_transient(1.08, Vector2(0.5, -0.3))
    var f: Dictionary = cam.frame(snap)
    var w := Vector2(7.0, 11.0)
    var s := CameraDirector.world_to_screen(w, f["center"], cam.px_per_m())
    var back := CameraDirector.screen_to_world(s, f["center"], cam.px_per_m())
    _check("camera: with the threat zoom and a nudge on, touch still maps to the world exactly", back.distance_to(w) < 0.000001)


## Stage 13. UNVERIFIED until run in Godot 4.7: mirrors tests/js/stage13.test.js for the rules a port can break silently.
func _fixture_sim(strips: Array, spawn: Array, pred_pos: Array, opts: Dictionary = {}) -> Simulation:
    var level := {
        "id": "EC-T-S13", "seed": 13, "world_bounds_metres": [0, 0, 24, 36],
        "player": {"spawn_xy": spawn}, "goal": {"exit_xy": [23, 35]}, "rules": {"acoustic_cell_m": 0.25},
        "predators": [{"id": "listener-01", "spawn_xy": pred_pos, "patrol_waypoints": [pred_pos, [pred_pos[0] + 0.01, pred_pos[1]]], "hearing_cost_limit_m": 14.0}],
    }
    return Simulation.new(level, {"half_width_m": 1.2, "walkable_strips": strips}, opts)


func test_stage13_event_ids_and_causes() -> void:
    var sim := _fixture_sim([[2, 5, 22, 5]], [4, 5], [14, 5])
    sim.step([{"type": "ping"}])
    for i in range(400):
        sim.step()
    var ids_ok := true
    var by_id := {}
    for e in sim.bus.history():
        if e["kind"] == SemanticEvents.LEVEL_RESET:
            continue
        by_id[e["id"]] = e
    for e in by_id.values():
        if e["cause"] >= 0 and not (by_id.has(e["cause"]) and int(by_id[e["cause"]]["tick"]) <= int(e["tick"])):
            ids_ok = false
    var heard: Array = sim.bus.history().filter(func(e: Dictionary) -> bool: return e["kind"] == SemanticEvents.HEARD_PING)
    _check("stage13: every cause names an earlier logged event, and a heard ping is caused by its cast", ids_ok and not heard.is_empty() and by_id[heard[0]["cause"]]["kind"] == SemanticEvents.PING_CAST)


func test_stage13_capture_waits_for_the_warning() -> void:
    var sim := _fixture_sim([[2, 5, 22, 5]], [9.7, 5], [10, 5])
    for i in range(200):
        sim.step()
    var chase_tick := -1
    var cap_tick := -1
    for e in sim.bus.history():
        if e["kind"] == SemanticEvents.PREDATOR_STATE_CHANGED and e["payload"]["to"] == &"CHASE":
            chase_tick = int(e["tick"])
        if e["kind"] == SemanticEvents.PLAYER_CAPTURED:
            cap_tick = int(e["tick"])
    _check("stage13: point blank, the capture still waits the full 18 tick warning", chase_tick >= 0 and cap_tick - chase_tick == 18)


func test_stage13_profiles_keep_the_minimums() -> void:
    for name in [&"suspense", &"forgiving"]:
        var p := ListenerParams.profile(name)
        _check("stage13: %s keeps at least a 0.60 s warning and 0.18 s of sight" % name, int(p["alert_ticks"]) >= 18 and int(p["contact_ticks"]) >= 6)
    _check("stage13: suspense is the approved set", ListenerParams.profile(&"suspense")["chase_speed"] == 1.85)


func test_stage13_explanation_comes_from_the_log() -> void:
    var sim := _fixture_sim([[2, 5, 22, 5]], [4, 5], [14, 5])
    sim.step([{"type": "ping"}])
    for i in range(1500):
        sim.step()
    var ex := sim.explain()
    _check("stage13: a capture after an echo is explained from that echo, with a rule id", ex.get("outcome", "") == "captured" and String(ex["sentence"]).contains("echo 1") and ex["rule"] == "STAYED_NEAR_ORIGIN")
    _check("stage13: the detail is empty while a round is running", _fixture_sim([[2, 5, 22, 5]], [4, 5], [14, 5]).explain_detail().is_empty())
