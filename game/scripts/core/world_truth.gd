class_name WorldTruth
extends RefCounted
## GROUND_TRUTH. Walls, hazards, exit and predator positions.
## Only the simulation may read this class. Camera, rendering, input and audio
## scripts must never reference it. tools/check_firewall.js enforces that in CI.

var sound_grid: SoundGrid
var player_position: Vector2 = Vector2.ZERO
var exit_position: Vector2 = Vector2.ZERO
var predators: Array[Dictionary] = []  # {id, position, state}


static func from_level(level: Dictionary, geometry: Dictionary) -> WorldTruth:
    var truth := WorldTruth.new()
    var bounds: Array = level["world_bounds_metres"]
    truth.sound_grid = SoundGrid.from_strips(
        geometry["walkable_strips"],
        float(geometry["half_width_m"]),
        float(bounds[2]) - float(bounds[0]),
        float(bounds[3]) - float(bounds[1]),
        float(level["rules"].get("acoustic_cell_m", 0.25))
    )
    var spawn: Array = level["player"]["spawn_xy"]
    truth.player_position = Vector2(spawn[0], spawn[1])
    var exit_xy: Array = level["goal"]["exit_xy"]
    truth.exit_position = Vector2(exit_xy[0], exit_xy[1])
    for p in level.get("predators", []):
        truth.predators.append(
            {"id": p["id"], "position": Vector2(p["spawn_xy"][0], p["spawn_xy"][1]), "state": &"PATROL"}
        )
    return truth
