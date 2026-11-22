class_name SoundGrid
extends RefCounted
## Acoustic cells derived from the same strip union as physical collision.

var nx: int
var ny: int
var cell: float
var walk: PackedByteArray


static func from_strips(
    strips: Array, half_width: float, world_w: float, world_h: float, cell_size: float
) -> SoundGrid:
    var g := SoundGrid.new()
    g.cell = cell_size
    g.nx = roundi(world_w / cell_size)
    g.ny = roundi(world_h / cell_size)
    g.walk = PackedByteArray()
    g.walk.resize(g.nx * g.ny)
    for j in range(g.ny):
        for i in range(g.nx):
            var p := Vector2((i + 0.5) * cell_size, (j + 0.5) * cell_size)
            for s in strips:
                var a := Vector2(s[0], s[1])
                var b := Vector2(s[2], s[3])
                if _dist_to_segment(p, a, b) <= half_width:
                    g.walk[j * g.nx + i] = 1
                    break
    return g


static func from_ascii(rows: Array, cell_size: float = 1.0) -> SoundGrid:
    var g := SoundGrid.new()
    g.cell = cell_size
    g.ny = rows.size()
    g.nx = String(rows[0]).length()
    g.walk = PackedByteArray()
    g.walk.resize(g.nx * g.ny)
    for j in range(g.ny):
        for i in range(g.nx):
            g.walk[j * g.nx + i] = 1 if String(rows[j])[i] == "." else 0
    return g


func is_walkable(i: int, j: int) -> bool:
    return i >= 0 and j >= 0 and i < nx and j < ny and walk[j * nx + i] == 1


func cell_index(p: Vector2) -> int:
    return floori(p.y / cell) * nx + floori(p.x / cell)


static func _dist_to_segment(p: Vector2, a: Vector2, b: Vector2) -> float:
    var ab := b - a
    var l2 := ab.length_squared()
    var t := 0.0 if l2 == 0.0 else clampf((p - a).dot(ab) / l2, 0.0, 1.0)
    return p.distance_to(a + ab * t)
