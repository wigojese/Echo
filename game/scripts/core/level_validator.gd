class_name LevelValidator
extends RefCounted
## Rejects unplayable levels with human-readable diagnostics. tools/map_validator
## is the CI authority. This is the in-engine mirror used at boot.

const PLAYER_RADIUS := 0.28


static func validate(level: Dictionary, geometry: Dictionary) -> Array[String]:
    var problems: Array[String] = []
    var half_width := float(geometry.get("half_width_m", 0.0))
    if half_width * 2.0 < 0.65:
        problems.append("Corridor width %.2f m is below the 0.65 m minimum." % (half_width * 2.0))
    var truth := WorldTruth.from_level(level, geometry)
    var grid := truth.sound_grid
    if not _clear(grid, truth.player_position):
        problems.append("Spawn %s is inside a wall or lacks %.2f m clearance." % [truth.player_position, PLAYER_RADIUS])
    if not _clear(grid, truth.exit_position):
        problems.append("Exit %s is inside a wall." % truth.exit_position)
    else:
        var reach := AcousticFieldSolver.solve(grid, truth.player_position, INF)
        if is_inf(reach[grid.cell_index(truth.exit_position)]):
            problems.append("Exit %s is sealed: no connected walkable route from spawn." % truth.exit_position)
    for p in truth.predators:
        if not _clear(grid, p["position"]):
            problems.append("Predator %s spawns inside a wall." % p["id"])
    return problems


static func _clear(grid: SoundGrid, point: Vector2) -> bool:
    var r := PLAYER_RADIUS
    for off in [Vector2.ZERO, Vector2(r, 0), Vector2(-r, 0), Vector2(0, r), Vector2(0, -r)]:
        var q: Vector2 = point + off
        if not grid.is_walkable(floori(q.x / grid.cell), floori(q.y / grid.cell)):
            return false
    return true
