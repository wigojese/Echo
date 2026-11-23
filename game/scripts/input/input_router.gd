class_name InputRouter
extends RefCounted
## Gesture ownership for both control schemes, TRACE review, pan and pinch.
## Port of reference/input/input_router.js. Pure logic: feed it pointer events in logical pixels
## at the 390x844 reference. A pointer owns its gesture from touch-down to release or cancel.
## NOT YET RUN IN GODOT.

const ECHO_CENTER := Vector2(318, 740)
const ECHO_HIT := 52.0
const QUIET_RECT := Rect2(72, 718, 118, 46)
const TRACE_RECT := Rect2(198, 718, 62, 46)
const RECENTER_RECT := Rect2(145, 44, 100, 44)
const RETURN_RECT := Rect2(85, 760, 220, 56)
const RAIL_RECT := Rect2(332, 140, 58, 560)
const MENU_RESUME := Rect2(95, 450, 200, 52)
const MENU_TRACE := Rect2(95, 514, 200, 52)
const PAUSE_CENTER := Vector2(340, 54)
const PAUSE_HIT := 30.0
const STICK_RADIUS := 48.0
const TAP_MOVE_PX := 8.0
const TAP_MS := 220.0
const PAN_PX := 12.0
const PINCH_RATIO := 1.06
const MAX_POINTERS := 2
const REF_WIDTH := 390.0

var mode: StringName = &"waypoint"
var mirrored: bool = false
var trace_mode: bool = false
var trace_enabled: bool = false
var allow_pan: bool = false
var paused_menu: bool = false
var recenter: bool = false
var chip_hidden: bool = false
var owners: Dictionary = {}
var out: Array[Dictionary] = []
var history: Array[Dictionary] = []
var _pinch: Dictionary = {}


func _mirror_rect(r: Rect2) -> Rect2:
    return Rect2(REF_WIDTH - r.position.x - r.size.x, r.position.y, r.size.x, r.size.y) if mirrored else r


func echo_center() -> Vector2:
    return Vector2(REF_WIDTH - ECHO_CENTER.x, ECHO_CENTER.y) if mirrored else ECHO_CENTER


func quiet_rect() -> Rect2:
    return _mirror_rect(QUIET_RECT)


func trace_rect() -> Rect2:
    return _mirror_rect(TRACE_RECT)


func stick_zone() -> Rect2:
    return Rect2(195, 300, 195, 544) if mirrored else Rect2(0, 300, 195, 544)


func set_mode(m: StringName) -> void:
    mode = m
    cancel_all("mode change")


func drain() -> Array[Dictionary]:
    var o := out
    out = []
    return o


func pointer_down(id: int, p: Vector2, t_ms: float) -> void:
    if owners.has(id):
        return
    if owners.size() >= MAX_POINTERS:
        history.append({"kind": "ignored", "region": "third pointer"})
        return
    if paused_menu:
        if MENU_RESUME.has_point(p):
            owners[id] = {"kind": "menu"}
            _emit({"type": "resume"}, "menu")
        elif trace_enabled and MENU_TRACE.has_point(p):
            owners[id] = {"kind": "menu"}
            _emit({"type": "trace_enter"}, "menu")
        elif p.distance_to(PAUSE_CENTER) <= PAUSE_HIT:
            owners[id] = {"kind": "pause"}
            _emit({"type": "pause_toggle"}, "pause")
        return
    if trace_mode:
        if RETURN_RECT.has_point(p):
            owners[id] = {"kind": "return"}
            _emit({"type": "return"}, "return")
            return
        if RAIL_RECT.has_point(p):
            owners[id] = {"kind": "rail", "last": p.y, "last_t": t_ms}
            return
        if p.distance_to(echo_center()) <= ECHO_HIT or quiet_rect().has_point(p) or p.distance_to(PAUSE_CENTER) <= PAUSE_HIT:
            history.append({"kind": "blocked", "region": "paused"})
            return
        _start_world(id, p, t_ms)
        return
    if recenter and RECENTER_RECT.has_point(p):
        owners[id] = {"kind": "return"}
        _emit({"type": "return"}, "recenter")
        return
    if p.distance_to(echo_center()) <= ECHO_HIT:
        owners[id] = {"kind": "echo"}
        _emit({"type": "ping"}, "echo")
        return
    if quiet_rect().has_point(p):
        owners[id] = {"kind": "quiet"}
        _emit({"type": "quiet_toggle"}, "quiet")
        return
    if not chip_hidden and trace_rect().has_point(p):
        owners[id] = {"kind": "trace"}
        if trace_enabled:
            _emit({"type": "trace_enter"}, "trace")
        else:
            history.append({"kind": "trace_unavailable", "region": "trace"})
        return
    if p.distance_to(PAUSE_CENTER) <= PAUSE_HIT:
        owners[id] = {"kind": "pause"}
        _emit({"type": "pause_toggle"}, "pause")
        return
    if mode == &"joystick" and stick_zone().has_point(p) and not _has_kind("stick"):
        owners[id] = {"kind": "stick", "origin": p}
        _emit({"type": "joystick", "dx": 0.0, "dy": 0.0}, "stick")
        return
    _start_world(id, p, t_ms)


func _start_world(id: int, p: Vector2, t_ms: float) -> void:
    var o := {"kind": "world", "start": p, "pos": p, "t": t_ms, "moved": 0.0, "cancelled": false, "panning": false}
    for oid in owners.keys():
        var other: Dictionary = owners[oid]
        if other["kind"] == "world":
            if other["panning"]:
                _emit({"type": "pan_end"}, "world")
            other["cancelled"] = true
            other["panning"] = false
            o["cancelled"] = true
            _pinch = {"a": oid, "b": id, "d": 0.0, "start": 0.0, "begun": false}
            history.append({"kind": "pinch", "region": "world"})
    owners[id] = o


func pointer_move(id: int, p: Vector2, t_ms: float = -1.0) -> void:
    if not owners.has(id):
        return
    var o: Dictionary = owners[id]
    match String(o["kind"]):
        "stick":
            var v: Vector2 = (p - o["origin"]) / STICK_RADIUS
            if v.length() > 1.0:
                v = v.normalized()
            _emit({"type": "joystick", "dx": v.x, "dy": -v.y}, "stick")
        "rail":
            var dt := 16.7 if t_ms < 0.0 else maxf(1.0, t_ms - float(o["last_t"]))
            _emit({"type": "scrub", "dy": p.y - float(o["last"]), "dt": dt}, "rail")
            o["last"] = p.y
            o["last_t"] = t_ms
        "world":
            var prev: Vector2 = o["pos"]
            o["pos"] = p
            o["moved"] = maxf(o["moved"], p.distance_to(o["start"]))
            var in_pinch := not _pinch.is_empty() and (_pinch["a"] == id or _pinch["b"] == id) and owners.has(_pinch["a"]) and owners.has(_pinch["b"])
            if in_pinch:
                var pa: Dictionary = owners[_pinch["a"]]
                var pb: Dictionary = owners[_pinch["b"]]
                var d: float = (pa["pos"] as Vector2).distance_to(pb["pos"])
                if float(_pinch["d"]) == 0.0:
                    _pinch["d"] = d
                else:
                    if float(_pinch["start"]) == 0.0:
                        _pinch["start"] = _pinch["d"]
                    if not _pinch["begun"]:
                        var r0: float = d / float(_pinch["start"])
                        if r0 > PINCH_RATIO or r0 < 1.0 / PINCH_RATIO:
                            _pinch["begun"] = true
                    if _pinch["begun"]:
                        var ratio: float = d / float(_pinch["d"])
                        if absf(ratio - 1.0) > 0.000001:
                            var mid: Vector2 = ((pa["pos"] as Vector2) + (pb["pos"] as Vector2)) / 2.0
                            _emit({"type": "pinch", "x": mid.x, "y": mid.y, "ratio": ratio}, "world")
                        _pinch["d"] = d
            elif not o["cancelled"] and (allow_pan or trace_mode):
                if not o["panning"] and o["moved"] >= PAN_PX:
                    o["panning"] = true
                if o["panning"]:
                    _emit({"type": "pan", "dx": p.x - prev.x, "dy": p.y - prev.y}, "world")


func pointer_up(id: int, p: Vector2, t_ms: float) -> void:
    if not owners.has(id):
        return
    var o: Dictionary = owners[id]
    owners.erase(id)
    match String(o["kind"]):
        "stick":
            _emit({"type": "joystick_end"}, "stick")
        "rail":
            _emit({"type": "scrub_end"}, "rail")
        "world":
            if not _pinch.is_empty() and (_pinch["a"] == id or _pinch["b"] == id):
                _pinch = {}
                for other in owners.values():
                    if other["kind"] == "world":
                        other["cancelled"] = true
                        other["panning"] = false
                history.append({"kind": "pinch_end", "region": "world"})
                return
            if o["panning"]:
                _emit({"type": "pan_end"}, "world")
                return
            var tap: bool = not o["cancelled"] and o["moved"] < TAP_MOVE_PX and (t_ms - o["t"]) <= TAP_MS
            if tap and mode == &"waypoint" and not trace_mode:
                _emit({"type": "waypoint", "x": o["start"].x, "y": o["start"].y}, "world")
            else:
                history.append({"kind": "world_ignored", "region": "gesture was not a tap"})


## OS gesture, interruption or lock screen. Nothing may sound and movement stops.
func pointer_cancel(id: int) -> void:
    if owners.has(id):
        cancel_all("pointer cancel")


func cancel_all(reason: String = "cancel") -> void:
    owners.clear()
    _pinch = {}
    out.append({"type": "cancel_all"})
    history.append({"kind": "cancel_all", "region": reason})


func _has_kind(kind: String) -> bool:
    for o in owners.values():
        if o["kind"] == kind:
            return true
    return false


func _emit(intent: Dictionary, region: String) -> void:
    out.append(intent)
    history.append({"kind": intent["type"], "region": region})  # never stores a coordinate
