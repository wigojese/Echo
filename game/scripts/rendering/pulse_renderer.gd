class_name PulseRenderer
extends Node2D
## D, The Listening Plate. Draws a VisibleWorldSnapshot and nothing else. Port of
## reference/graybox/plate_world.js. Halos are drawn on the known-floor side of a wall face
## only, so no bloom value can light anything behind a wall.
##
## NOT YET RUN IN GODOT. Missing on purpose: stable world-anchored grain and the contour fringe
## need shaders (see docs/STAGE10_VISUAL.md). This script draws the line art, front, scars and ghosts.

const PX_PER_M := 20.0
const MAX_PARTICLES := 200
const HALO_CAP_PX := 26.0

var snapshot: VisibleWorldSnapshot
var bloom: float = 1.0
var _c: Dictionary = {}


func _ready() -> void:
    var t := StyleTokens.load_tokens()
    var p: Dictionary = t.get("palette", {})
    for k in p.keys():
        _c[k] = Color.html(p[k])


func set_snapshot(s: VisibleWorldSnapshot) -> void:
    snapshot = s
    queue_redraw()


func _to_screen(w: Vector2) -> Vector2:
    return Vector2((w.x - snapshot.player_position.x) * PX_PER_M, -(w.y - snapshot.player_position.y) * PX_PER_M)


static func _hash(a: int, b: int) -> float:
    var h: int = (a * 73856093) ^ (b * 19349663)
    h = (h ^ (h >> 13)) * 1274126177
    return float((h ^ (h >> 16)) & 0xFFFFFF) / float(0x1000000)


func _draw() -> void:
    if snapshot == null or _c.is_empty():
        return
    var halo_w := minf(HALO_CAP_PX, 5.0 * bloom)
    for s in snapshot.memory_segments:
        var t: float = float(s["age_ticks"]) / float(SimClock.HZ)
        var a := _to_screen(s["a"])
        var b := _to_screen(s["b"])
        var n: Vector2 = Vector2(s["n"].x, -s["n"].y)
        if t < 0.35:
            draw_line(a + n * halo_w * 0.5, b + n * halo_w * 0.5, Color(_c["fresh_contact"], 0.22 * bloom), halo_w)
            draw_line(a, b, _c["fresh_contact"], 2.3)
        elif t < 1.4:
            var u := (t - 0.35) / 1.05
            draw_line(a, b, _c["fresh_contact"].lerp(_c["active_afterglow"], u), 1.9 - 0.3 * u)
        elif t < 8.0:
            var u2 := (t - 1.4) / 6.6
            var mid: Vector2 = (s["a"] + s["b"]) * 0.5
            var h := _hash(floori(mid.x / 0.9) + int(s["n"].x) * 7, floori(mid.y / 0.9) + int(s["n"].y) * 5)
            if h > 1.0 - 0.92 * pow(u2, 1.15):
                continue
            var col: Color = _c["active_afterglow"].lerp(_c["verified_memory"], u2 * 2.0) if u2 < 0.5 else _c["verified_memory"].lerp(_c["near_expired_residue"], (u2 - 0.5) * 2.0)
            draw_line(a, b, col, 1.45 - 0.5 * u2)
    for w in snapshot.waves:
        for q in w["points"]:
            var p0 := _to_screen(Vector2(q[0], q[1]))
            var tangent := Vector2(q[2], -q[3])
            draw_line(p0 - tangent * 3.6, p0 + tangent * 3.6, Color(_c["fresh_contact"], 0.55 + 0.4 * float(q[4])), 2.6)
    for o in snapshot.cast_origins:
        var heard: bool = int(o["heard_age_ticks"]) >= 0
        var col2: Color = _c["caution_amber"] if heard else (_c["fresh_contact"] if o["age_ticks"] < 42 else _c["verified_memory"])
        var c0 := _to_screen(o["origin"])
        draw_circle(c0, 2.2, col2)
        if heard:
            draw_arc(c0, 17.0, 0.0, TAU, 32, _c["confirmed_danger"], 1.3)
    for g in snapshot.threat_ghosts:
        var gp := _to_screen(g["position"])
        var sensed: bool = int(g["age_ticks"]) < 10
        draw_arc(gp, 24.0, 0.0, TAU, 32, _c["confirmed_danger"] if sensed else Color(_c["caution_amber"], 0.7), 1.5 if sensed else 1.2)
    if snapshot.known_exit != null:
        var ep := _to_screen(snapshot.known_exit)
        draw_arc(ep + Vector2(0, -4), 12.0, PI, TAU, 16, _c["exit"], 2.6)
        draw_line(ep + Vector2(-12, -4), ep + Vector2(-12, 12), _c["exit"], 2.6)
        draw_line(ep + Vector2(12, -4), ep + Vector2(12, 12), _c["exit"], 2.6)
    # you, always last
    draw_arc(Vector2(0, -3), 24.0, 0.0, TAU, 32, Color(_c["paper_chalk"], 0.22), 1.0)
    draw_line(Vector2(-6, -13), Vector2(-6, -3), _c["paper_chalk"], 2.4)
    draw_line(Vector2(6, -9), Vector2(6, -3), _c["paper_chalk"], 2.4)
    draw_line(Vector2(0, 3), Vector2(0, 12), _c["paper_chalk"], 2.4)
