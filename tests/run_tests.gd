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
