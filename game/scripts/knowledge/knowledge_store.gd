class_name KnowledgeStore
extends RefCounted
## PLAYER_MEMORY. Holds only what the player has legitimately sensed or done.
## Static surfaces expire after 8.0 s. A moving threat is never stored as a current
## position, only as a short-lived ghost of where it was last sensed.

const MEMORY_TICKS := 240  # 8.0 s at 30 Hz
const GHOST_TICKS := 37  # at most 1.25 s at 30 Hz
const CAST_ORIGIN_TICKS := 240

var segments: Dictionary = {}  # segment_id -> {a, b, contact_tick, cast_id}
var ghosts: Dictionary = {}  # entity_id -> {position, seen_tick, direct}
var cast_origins: Array[Dictionary] = []  # {origin, tick, cast_id}
var cells: Dictionary = {}  # cell id -> contact tick, known open floor
var exit_known: bool = false


func record_cast(cast_id: int, origin: Vector2, tick: int) -> void:
    cast_origins.append({"origin": origin, "tick": tick, "cast_id": cast_id, "heard_tick": -1})


func mark_heard(cast_id: int, tick: int) -> void:
    for c in cast_origins:
        if c["cast_id"] == cast_id and int(c["heard_tick"]) < 0:
            c["heard_tick"] = tick


func record_contact(segment_id: int, a: Vector2, b: Vector2, tick: int, cast_id: int, n: Vector2 = Vector2.ZERO) -> void:
    segments[segment_id] = {"a": a, "b": b, "contact_tick": tick, "cast_id": cast_id, "n": n}


func record_sighting(entity_id: StringName, position: Vector2, tick: int, direct: bool) -> void:
    ghosts[entity_id] = {"position": position, "seen_tick": tick, "direct": direct}


func record_cell(cell_id: int, tick: int) -> void:
    cells[cell_id] = tick


func mark_exit_known() -> void:
    exit_known = true


func prune(tick: int) -> void:
    for id in segments.keys():
        if tick - int(segments[id]["contact_tick"]) > MEMORY_TICKS:
            segments.erase(id)
    for id in cells.keys():
        if tick - int(cells[id]) > MEMORY_TICKS:
            cells.erase(id)
    for id in ghosts.keys():
        if tick - int(ghosts[id]["seen_tick"]) > GHOST_TICKS:
            ghosts.erase(id)
    cast_origins = cast_origins.filter(func(c: Dictionary) -> bool: return tick - int(c["tick"]) <= CAST_ORIGIN_TICKS)


func reset() -> void:
    segments.clear()
    ghosts.clear()
    cells.clear()
    cast_origins.clear()
    exit_known = false
