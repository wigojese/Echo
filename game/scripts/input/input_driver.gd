class_name InputDriver
extends RefCounted
## Turns router intents into simulation inputs. Reads only the VisibleWorldSnapshot.
## Port of reference/input/driver.js.

const SCREEN_W := 390.0
const SCREEN_H := 844.0
const PX_PER_M := 20.0
const STUCK_TICKS := 45

var path: Array[Vector2] = []
var has_path: bool = false
var last_plan: Dictionary = {}
var stick: Variant = null
var quiet: bool = false
var stuck_count: int = 0
var cancelled_count: int = 0
var _last_dir: Vector2 = Vector2(NAN, NAN)
var _stuck_at: Variant = null
var _stuck_ticks: int = 0


static func screen_to_world(p: Vector2, player: Vector2) -> Vector2:
    return Vector2(player.x + (p.x - SCREEN_W / 2.0) / PX_PER_M, player.y - (p.y - SCREEN_H / 2.0) / PX_PER_M)


## Routes only through floor the player has sensed, keeping body clearance from anything unknown.
static func plan(snap: VisibleWorldSnapshot, target: Vector2) -> Dictionary:
    var nx := snap.grid_nx
    var ny := snap.grid_ny
    var cell := snap.grid_cell
    var known: Dictionary = {}
    for c in snap.known_cells:
        known[int(c[0])] = true
    var start := floori(snap.player_position.y / cell) * nx + floori(snap.player_position.x / cell)
    known[start] = true
    var prev := _search(_usable(known, nx, ny, start, 2), nx, ny, start)
    if prev.size() == 1:
        prev = _search(_usable(known, nx, ny, start, 1), nx, ny, start)
    var t_idx := floori(target.y / cell) * nx + floori(target.x / cell)
    var goal := start
    if prev.has(t_idx):
        goal = t_idx
    else:
        var best := INF
        for k in prev.keys():
            var d := Vector2((k % nx + 0.5) * cell, (k / nx + 0.5) * cell).distance_to(target)
            if d < best:
                best = d
                goal = k
    var cells: Array[int] = []
    var k2: int = goal
    while k2 != -1 and k2 != start:
        cells.append(k2)
        k2 = prev[k2]
    cells.reverse()
    var pts: Array[Vector2] = []
    for c in cells:
        pts.append(Vector2((c % nx + 0.5) * cell, (c / nx + 0.5) * cell))
    return {"path": pts, "cells": cells, "truncated": not known.has(t_idx)}


static func _usable(known: Dictionary, nx: int, ny: int, start: int, r: int) -> Dictionary:
    var u: Dictionary = {}
    for k in known.keys():
        var i: int = k % nx
        var j: int = k / nx
        var ok := true
        for dj in range(-r, r + 1):
            for di in range(-r, r + 1):
                var a := i + di
                var b := j + dj
                if a < 0 or b < 0 or a >= nx or b >= ny or not known.has(b * nx + a):
                    ok = false
        if ok:
            u[k] = true
    u[start] = true
    return u


static func _search(core: Dictionary, nx: int, ny: int, start: int) -> Dictionary:
    var prev: Dictionary = {start: -1}
    var queue: Array[int] = [start]
    var head := 0
    while head < queue.size():
        var k: int = queue[head]
        head += 1
        var i: int = k % nx
        var j: int = k / nx
        for dj in range(-1, 2):
            for di in range(-1, 2):
                if di == 0 and dj == 0:
                    continue
                var a := i + di
                var b := j + dj
                if a < 0 or b < 0 or a >= nx or b >= ny:
                    continue
                var nk := b * nx + a
                if not core.has(nk) or prev.has(nk):
                    continue
                if di != 0 and dj != 0 and (not core.has(j * nx + a) or not core.has(b * nx + i)):
                    continue
                prev[nk] = k
                queue.append(nk)
    return prev


## One call per simulation tick. snapshot_fn builds the snapshot, and is called only when a route is planned.
func inputs_for(player_pos: Vector2, snapshot_fn: Callable, intents: Array) -> Array[Dictionary]:
    var ins: Array[Dictionary] = []
    for it in intents:
        match String(it["type"]):
            "ping":
                ins.append({"type": "ping"})
            "quiet_toggle":
                quiet = not quiet
                ins.append({"type": "quiet", "on": quiet})
            "joystick":
                stick = Vector2(it["dx"], it["dy"])
                has_path = false
                last_plan = {}
            "joystick_end":
                stick = null
                _set_dir(Vector2.ZERO, ins)
            "waypoint":
                stick = null
                var snap: VisibleWorldSnapshot = snapshot_fn.call()
                last_plan = plan(snap, screen_to_world(Vector2(it["x"], it["y"]), snap.player_position))
                path.clear()
                for p in last_plan["path"]:
                    path.append(p)
                has_path = not path.is_empty()
                if not has_path:
                    _set_dir(Vector2.ZERO, ins)
            "cancel_all":
                cancelled_count += 1
                stick = null
                has_path = false
                last_plan = {}
                path.clear()
                _set_dir(Vector2.ZERO, ins)
    _guard_stuck(player_pos, ins)
    if stick != null:
        _set_dir(stick, ins)
    elif has_path:
        while not path.is_empty() and path[0].distance_to(player_pos) < (0.45 if path.size() > 1 else 0.18):
            path.pop_front()
        if path.is_empty():
            has_path = false
            _set_dir(Vector2.ZERO, ins)
        else:
            _set_dir((path[0] - player_pos).normalized(), ins)
    return ins


func _guard_stuck(pos: Vector2, ins: Array[Dictionary]) -> void:
    if not has_path:
        _stuck_at = null
        _stuck_ticks = 0
        return
    if _stuck_at == null or pos.distance_to(_stuck_at) > 0.05:
        _stuck_at = pos
        _stuck_ticks = 0
    else:
        _stuck_ticks += 1
        if _stuck_ticks >= STUCK_TICKS:
            stuck_count += 1
            has_path = false
            path.clear()
            _stuck_at = null
            _stuck_ticks = 0
            _set_dir(Vector2.ZERO, ins)


func _set_dir(d: Vector2, ins: Array[Dictionary]) -> void:
    var q := Vector2(snappedf(d.x, 0.01), snappedf(d.y, 0.01))
    if not is_nan(_last_dir.x) and q == _last_dir:
        return
    _last_dir = q
    ins.append({"type": "move", "dx": q.x, "dy": q.y})
