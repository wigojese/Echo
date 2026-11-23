class_name KnowledgeGate
extends RefCounted
## Builds a VisibleWorldSnapshot. Deliberately takes the player position and the
## KnowledgeStore, never WorldTruth, so hidden predators and the hidden exit cannot
## reach the view layer by construction.


static func build(player_position: Vector2, store: KnowledgeStore, exit_position_if_known: Vector2, tick: int, grid_info: Dictionary = {}) -> VisibleWorldSnapshot:
    var s := VisibleWorldSnapshot.new()
    s.tick = tick
    s.player_position = player_position
    for id in store.segments.keys():
        var seg: Dictionary = store.segments[id]
        s.memory_segments.append(
            {"a": seg["a"], "b": seg["b"], "n": seg["n"], "age_ticks": tick - int(seg["contact_tick"]), "cast_id": seg["cast_id"]}
        )
    for c in store.cast_origins:
        var heard_age: int = -1 if int(c["heard_tick"]) < 0 else tick - int(c["heard_tick"])
        s.cast_origins.append({"origin": c["origin"], "age_ticks": tick - int(c["tick"]), "cast_id": c["cast_id"], "heard_age_ticks": heard_age})
    for id in store.ghosts.keys():
        var g: Dictionary = store.ghosts[id]
        s.threat_ghosts.append({"position": g["position"], "age_ticks": tick - int(g["seen_tick"]), "direct": g["direct"]})
    for id in store.cells.keys():
        s.known_cells.append([id, tick - int(store.cells[id])])
    s.known_cells.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0])
    s.grid_nx = int(grid_info.get("nx", 0))
    s.grid_ny = int(grid_info.get("ny", 0))
    s.grid_cell = float(grid_info.get("cell", 0.25))
    if store.exit_known:
        s.known_exit = exit_position_if_known
    return s
