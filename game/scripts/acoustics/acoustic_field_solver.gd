class_name AcousticFieldSolver
extends RefCounted
## Bounded weighted Dijkstra. Port of spike/stage06/solver.js (the tested reference).
## Costs are 64-bit floats on purpose: a 32-bit store compared against a 64-bit
## heap value silently drops nodes and truncates the wave.

const PULSE_SPEED := 9.0
const PULSE_MAX_COST := 13.5
const HEARING_LIMIT := 11.0


static func solve(grid: SoundGrid, origin: Vector2, max_cost: float = PULSE_MAX_COST) -> PackedFloat64Array:
    var cost := PackedFloat64Array()
    cost.resize(grid.nx * grid.ny)
    cost.fill(INF)
    var si := floori(origin.x / grid.cell)
    var sj := floori(origin.y / grid.cell)
    if not grid.is_walkable(si, sj):
        return cost
    var start := sj * grid.nx + si
    cost[start] = 0.0
    var heap: Array = [[0.0, start]]
    while not heap.is_empty():
        var top: Array = _pop(heap)
        var c: float = top[0]
        var k: int = top[1]
        if c > cost[k]:
            continue
        var i := k % grid.nx
        var j := k / grid.nx
        for dj in range(-1, 2):
            for di in range(-1, 2):
                if di == 0 and dj == 0:
                    continue
                var a := i + di
                var b := j + dj
                if not grid.is_walkable(a, b):
                    continue
                if di != 0 and dj != 0:
                    if not grid.is_walkable(i + di, j) or not grid.is_walkable(i, j + dj):
                        continue  # no sound leaking between two diagonal wall cells
                var step := grid.cell * (sqrt(2.0) if (di != 0 and dj != 0) else 1.0)
                var nc := c + step
                if nc > max_cost:
                    continue
                var nk := b * grid.nx + a
                if nc < cost[nk]:
                    cost[nk] = nc
                    _push(heap, [nc, nk])
    return cost


static func arrival_seconds(weighted_cost: float) -> float:
    return weighted_cost / PULSE_SPEED


static func _less(x: Array, y: Array) -> bool:
    return x[0] < y[0] or (x[0] == y[0] and x[1] < y[1])  # deterministic tie-break by cell id


static func _push(heap: Array, item: Array) -> void:
    heap.append(item)
    var n := heap.size() - 1
    while n > 0:
        var p := (n - 1) >> 1
        if not _less(heap[n], heap[p]):
            break
        var tmp = heap[n]
        heap[n] = heap[p]
        heap[p] = tmp
        n = p


static func _pop(heap: Array) -> Array:
    var top: Array = heap[0]
    var last: Array = heap.pop_back()
    if not heap.is_empty():
        heap[0] = last
        var n := 0
        while true:
            var a := 2 * n + 1
            var b := a + 1
            var m := n
            if a < heap.size() and _less(heap[a], heap[m]):
                m = a
            if b < heap.size() and _less(heap[b], heap[m]):
                m = b
            if m == n:
                break
            var tmp = heap[m]
            heap[m] = heap[n]
            heap[n] = tmp
            n = m
    return top
