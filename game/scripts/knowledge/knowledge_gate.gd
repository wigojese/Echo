class_name KnowledgeGate
extends RefCounted
## Builds a VisibleWorldSnapshot. Deliberately takes the player position and the
## KnowledgeStore, never WorldTruth, so hidden predators and the hidden exit cannot
## reach the view layer by construction.


static func build(player_position: Vector2, store: KnowledgeStore, exit_position_if_known: Vector2, tick: int) -> VisibleWorldSnapshot:
    var s := VisibleWorldSnapshot.new()
    s.tick = tick
    s.player_position = player_position
    for id in store.segments.keys():
        var seg: Dictionary = store.segments[id]
        s.memory_segments.append(
            {"a": seg["a"], "b": seg["b"], "age_ticks": tick - int(seg["contact_tick"]), "cast_id": seg["cast_id"]}
        )
    for c in store.cast_origins:
        s.cast_origins.append({"origin": c["origin"], "age_ticks": tick - int(c["tick"]), "cast_id": c["cast_id"]})
    for id in store.ghosts.keys():
        var g: Dictionary = store.ghosts[id]
        s.threat_ghosts.append({"position": g["position"], "age_ticks": tick - int(g["seen_tick"]), "direct": g["direct"]})
    if store.exit_known:
        s.known_exit = exit_position_if_known
    return s
