class_name CameraDirector
extends RefCounted
## Composes the shot from a VisibleWorldSnapshot only. Port of reference/camera/camera_director.js.
## States implemented: INTRO_DROP, LISTENER_FOLLOW, MANUAL_REFRAME, KNOWN_PATH_SCROLL.
## The rest (WAVE_SURF, THREAT_EVASION, EXIT_RESOLVE, RESULT_RECONSTRUCT) belong to Stage 12.
## NOT YET RUN IN GODOT.

const Z_MIN := 0.60
const Z_MAX := 1.75
const CLOSE_ENTER := 1.42
const CLOSE_LEAVE := 1.28
const MEM_ENTER := 0.78
const MEM_LEAVE := 0.90
const BASE_PX := 20.0
const SCREEN := Vector2(390, 844)
const RAIL_LEN := 560.0
const T_INTRO := 450.0
const T_PULLBACK := 350.0
const T_RELEASE := 220.0
const T_RECENTER := 350.0
const T_FADE := 120.0

var state: StringName = &"LISTENER_FOLLOW"
var zoom: float = 1.0
var band: StringName = &"active"
var offset: Vector2 = Vector2.ZERO
var trace_offset: Vector2 = Vector2.ZERO
var steering: bool = false
var zoom_mul: float = 1.0  # transient view effect, never changes the real zoom or band
var nudge: Vector2 = Vector2.ZERO  # transient known-contact drift, world metres
var fade: float = 0.0
var reduced_motion: bool = false
var trace: Dictionary = {}
var _anim: Dictionary = {}
var _release: Dictionary = {}
var _snap: VisibleWorldSnapshot


func _init(with_intro: bool = false, reduced: bool = false) -> void:
    reduced_motion = reduced
    if with_intro:
        zoom = 1.25
        state = &"INTRO_DROP"
        _begin({"zoom": 1.0}, T_INTRO, &"intro")


func start_intro() -> void:
    if reduced_motion:
        zoom = 1.0
        state = &"LISTENER_FOLLOW"
        fade = 1.0
        _anim = {"t": 0.0, "dur": T_FADE, "kind": &"fade"}
        return
    zoom = 1.25
    state = &"INTRO_DROP"
    _begin({"zoom": 1.0}, T_INTRO, &"intro")


func set_transient(zmul: float, n: Vector2) -> void:
    zoom_mul = zmul
    nudge = n


func px_per_m() -> float:
    return BASE_PX * zoom * zoom_mul


static func next_band(b: StringName, z: float) -> StringName:
    if b == &"close":
        if z > CLOSE_LEAVE:
            return &"close"
        return &"memory" if z <= MEM_ENTER else &"active"
    if b == &"memory":
        if z < MEM_LEAVE:
            return &"memory"
        return &"close" if z >= CLOSE_ENTER else &"active"
    if z >= CLOSE_ENTER:
        return &"close"
    return &"memory" if z <= MEM_ENTER else &"active"


static func world_to_screen(w: Vector2, center: Vector2, k: float) -> Vector2:
    return Vector2(SCREEN.x / 2.0 + (w.x - center.x) * k, SCREEN.y / 2.0 - (w.y - center.y) * k)


static func screen_to_world(p: Vector2, center: Vector2, k: float) -> Vector2:
    return Vector2(center.x + (p.x - SCREEN.x / 2.0) / k, center.y - (p.y - SCREEN.y / 2.0) / k)


static func simplify(pts: Array, tol: float) -> Array:
    if pts.size() < 3:
        return pts.duplicate()
    var worst := 0.0
    var mi := -1
    var a: Vector2 = pts[0]
    var b: Vector2 = pts[pts.size() - 1]
    for i in range(1, pts.size() - 1):
        var p: Vector2 = pts[i]
        var ab := b - a
        var l2 := ab.length_squared()
        var t := 0.0 if l2 == 0.0 else clampf((p - a).dot(ab) / l2, 0.0, 1.0)
        var d := p.distance_to(a + ab * t)
        if d > worst:
            worst = d
            mi = i
    if worst <= tol:
        return [a, b]
    var left := simplify(pts.slice(0, mi + 1), tol)
    var right := simplify(pts.slice(mi), tol)
    left.pop_back()
    return left + right


## Polyline through the waypoints with rounded corners (quadratic Bezier), sampled at even arc length.
static func build_path(wps: Array, round_r: float = 0.6, step: float = 0.25) -> Dictionary:
    var out: Array[Vector2] = [wps[0]]
    for i in range(1, wps.size() - 1):
        var a: Vector2 = wps[i - 1]
        var b: Vector2 = wps[i]
        var c: Vector2 = wps[i + 1]
        var rr := minf(round_r, minf(a.distance_to(b), b.distance_to(c)) / 2.0)
        var p0 := b + (a - b).normalized() * rr
        var p2 := b + (c - b).normalized() * rr
        var n := maxi(2, ceili(rr * 2.0 / step))
        for k in range(n + 1):
            var t := float(k) / float(n)
            var u := 1.0 - t
            out.append(u * u * p0 + 2.0 * u * t * b + t * t * p2)
    out.append(wps[wps.size() - 1])
    var cum: Array[float] = [0.0]
    for i in range(1, out.size()):
        cum.append(cum[i - 1] + out[i].distance_to(out[i - 1]))
    var total: float = cum[cum.size() - 1]
    var count := maxi(1, roundi(total / step))
    var pts: Array[Vector3] = []
    for k in range(count + 1):
        var s := total * float(k) / float(count)
        var j := 1
        while j < cum.size() - 1 and cum[j] < s:
            j += 1
        var span := maxf(cum[j] - cum[j - 1], 0.000001)
        var q := out[j - 1].lerp(out[j], (s - cum[j - 1]) / span)
        pts.append(Vector3(q.x, q.y, s))
    return {"pts": pts, "length": total}


func trace_available(snap: VisibleWorldSnapshot) -> bool:
    var raw: Array = snap.trail.duplicate()
    raw.append(snap.player_position)
    return simplify(raw, 0.4).size() >= 3 and not snap.memory_segments.is_empty()


func steer(active: bool) -> void:
    steering = active
    if active and state == &"INTRO_DROP":
        _anim = {}
        state = &"LISTENER_FOLLOW"
        zoom = 1.0
    if active and state == &"MANUAL_REFRAME":
        return_to_listener()


func pinch(anchor: Vector2, ratio: float, snap: VisibleWorldSnapshot) -> void:
    _snap = snap
    if state == &"INTRO_DROP":
        _anim = {}
        state = &"LISTENER_FOLLOW"
        zoom = 1.0
    if not _anim.is_empty() and _anim.get("kind") == &"return":
        return
    var before := zoom
    var nz := clampf(before * ratio, Z_MIN, Z_MAX)
    if is_equal_approx(nz, before):
        return
    var a := anchor
    if steering and state != &"KNOWN_PATH_SCROLL":
        a = SCREEN / 2.0
    var c := _center()
    var w := screen_to_world(a, c, BASE_PX * before * zoom_mul)
    zoom = nz
    band = next_band(band, nz)
    var nc := w - Vector2((a.x - SCREEN.x / 2.0) / (BASE_PX * nz * zoom_mul), -(a.y - SCREEN.y / 2.0) / (BASE_PX * nz * zoom_mul))
    if state == &"KNOWN_PATH_SCROLL":
        trace_offset = nc - _path_point()
    else:
        offset = nc - snap.player_position
        if state == &"LISTENER_FOLLOW" and not steering:
            state = &"MANUAL_REFRAME"


func pan(dx: float, dy: float) -> bool:
    if steering or (not _anim.is_empty() and _anim.get("kind") != &"fade"):
        return false
    var k := px_per_m()
    if state == &"KNOWN_PATH_SCROLL":
        trace_offset += Vector2(-dx / k, dy / k)
        return true
    if state == &"LISTENER_FOLLOW" or state == &"MANUAL_REFRAME":
        offset += Vector2(-dx / k, dy / k)
        state = &"MANUAL_REFRAME"
        return true
    return false


func enter_trace(snap: VisibleWorldSnapshot) -> bool:
    _snap = snap
    if state == &"KNOWN_PATH_SCROLL" or not trace_available(snap):
        return false
    var raw: Array = snap.trail.duplicate()
    raw.append(snap.player_position)
    var wps := simplify(raw, 0.4)
    var built := build_path(wps)
    trace = {"pts": built["pts"], "length": built["length"], "s": built["length"], "vel": 0.0, "wps": wps}
    trace_offset = Vector2.ZERO
    offset = Vector2.ZERO
    state = &"KNOWN_PATH_SCROLL"
    _begin({"zoom": 0.72}, T_PULLBACK, &"pullback")
    return true


## Speed capped at one screen width per second. Returns the speed in metres per second.
func scrub(dy_px: float, dt_ms: float) -> float:
    if trace.is_empty():
        return 0.0
    var dt := maxf(dt_ms, 1.0) / 1000.0
    var vmax := SCREEN.x / px_per_m()
    var ds := clampf(dy_px / RAIL_LEN * float(trace["length"]), -vmax * dt, vmax * dt)
    trace["s"] = clampf(float(trace["s"]) + ds, 0.0, float(trace["length"]))
    trace["vel"] = ds / dt
    _release = {}
    return ds / dt


func release() -> void:
    if not trace.is_empty():
        _release = {"t": 0.0, "v": float(trace["vel"])}


func return_to_listener() -> void:
    if state == &"LISTENER_FOLLOW" or state == &"INTRO_DROP":
        return
    if state == &"KNOWN_PATH_SCROLL":
        var c := _center()
        offset = c - _snap.player_position
        trace_offset = Vector2.ZERO
        state = &"MANUAL_REFRAME"
    _release = {}
    _begin({"zoom": 1.0, "offset": Vector2.ZERO}, T_RECENTER, &"return")


func tick(dt_ms: float) -> void:
    if not _release.is_empty() and not trace.is_empty():
        _release["t"] += dt_ms
        var k := maxf(0.0, 1.0 - float(_release["t"]) / T_RELEASE)
        trace["s"] = clampf(float(trace["s"]) + float(_release["v"]) * (dt_ms / 1000.0) * k, 0.0, float(trace["length"]))
        if _release["t"] >= T_RELEASE:
            _release = {}
            trace["vel"] = 0.0
    if _anim.is_empty():
        return
    _anim["t"] += dt_ms
    if _anim["kind"] == &"fade":
        fade = maxf(0.0, 1.0 - float(_anim["t"]) / float(_anim["dur"]))
        if _anim["t"] >= _anim["dur"]:
            fade = 0.0
            _anim = {}
        return
    var raw := clampf(float(_anim["t"]) / float(_anim["dur"]), 0.0, 1.0)
    _apply(_anim["to"], _ease(raw), raw)
    if _anim["t"] >= _anim["dur"]:
        var kind: StringName = _anim["kind"]
        _anim = {}
        _finish(kind)


func frame(snap: VisibleWorldSnapshot) -> Dictionary:
    _snap = snap
    var c := _center()
    var k := px_per_m()
    var ps := world_to_screen(snap.player_position, c, k)
    var inside := ps.x >= 24.0 and ps.x <= SCREEN.x - 24.0 and ps.y >= 24.0 and ps.y <= SCREEN.y - 24.0
    return {
        "state": state,
        "center": c,
        "zoom": zoom,
        "band": band,
        "fade": fade,
        "pause_sim": state == &"KNOWN_PATH_SCROLL",
        "player_visible": inside,
        "trace_s": float(trace.get("s", 0.0)),
    }


func _begin(to: Dictionary, dur: float, kind: StringName) -> void:
    var from := {"zoom": zoom, "offset": offset, "toff": trace_offset, "s": float(trace.get("s", 0.0))}
    if reduced_motion:
        _anim = {"t": 0.0, "dur": T_FADE, "kind": &"fade"}
        _anim["from"] = from
        _apply_direct(to)
        fade = 1.0
        _finish(kind)
        return
    _anim = {"t": 0.0, "dur": dur, "kind": kind, "from": from, "to": to}


func _apply_direct(to: Dictionary) -> void:
    zoom = float(to.get("zoom", zoom))
    if to.has("offset"):
        offset = to["offset"]
    band = next_band(band, zoom)


func _apply(to: Dictionary, e: float, raw: float = -1.0) -> void:
    var from: Dictionary = _anim["from"]
    if _anim["kind"] == &"pullback" and raw >= 0.0:
        # a small push-in to 1.05, then the pullback
        if raw < 0.15:
            zoom = lerpf(float(from["zoom"]), 1.05, _ease(raw / 0.15))
        else:
            zoom = lerpf(1.05, float(to["zoom"]), _ease((raw - 0.15) / 0.85))
    else:
        zoom = lerpf(float(from["zoom"]), float(to.get("zoom", from["zoom"])), e)
    if to.has("offset"):
        offset = (from["offset"] as Vector2).lerp(to["offset"], e)
    band = next_band(band, zoom)


func _finish(kind: StringName) -> void:
    if kind == &"intro":
        state = &"LISTENER_FOLLOW"
    elif kind == &"return":
        state = &"LISTENER_FOLLOW"
        trace = {}
        offset = Vector2.ZERO
        trace_offset = Vector2.ZERO


func _path_point() -> Vector2:
    var pts: Array = trace["pts"]
    var s := clampf(float(trace["s"]), 0.0, float(trace["length"]))
    var lo := 0
    var hi := pts.size() - 1
    while hi - lo > 1:
        var m := (lo + hi) >> 1
        if (pts[m] as Vector3).z < s:
            lo = m
        else:
            hi = m
    var a: Vector3 = pts[lo]
    var b: Vector3 = pts[hi]
    var u := (s - a.z) / maxf(b.z - a.z, 0.000001)
    return Vector2(lerpf(a.x, b.x, u), lerpf(a.y, b.y, u))


func _center() -> Vector2:
    if state == &"KNOWN_PATH_SCROLL" and not trace.is_empty():
        return _path_point() + trace_offset
    var n := nudge if state == &"LISTENER_FOLLOW" else Vector2.ZERO
    return _snap.player_position + offset + n


static func _ease(t: float) -> float:
    return 4.0 * t * t * t if t < 0.5 else 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0
