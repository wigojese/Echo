class_name InputRouter
extends RefCounted
## Gesture ownership for both candidate control schemes. Port of reference/input/input_router.js.
## Pure logic: feed it pointer events in logical pixels at the 390x844 reference.
## A pointer owns its gesture from touch-down to release or cancel.

const ECHO_CENTER := Vector2(318, 740)
const ECHO_HIT := 52.0
const QUIET_RECT := Rect2(72, 718, 118, 46)
const PAUSE_CENTER := Vector2(340, 54)
const PAUSE_HIT := 30.0
const STICK_RADIUS := 48.0
const TAP_MOVE_PX := 8.0
const TAP_MS := 220.0
const MAX_POINTERS := 2
const REF_WIDTH := 390.0

var mode: StringName = &"waypoint"
var mirrored: bool = false
var owners: Dictionary = {}
var out: Array[Dictionary] = []
var history: Array[Dictionary] = []


func echo_center() -> Vector2:
    return Vector2(REF_WIDTH - ECHO_CENTER.x, ECHO_CENTER.y) if mirrored else ECHO_CENTER


func quiet_rect() -> Rect2:
    if mirrored:
        return Rect2(REF_WIDTH - QUIET_RECT.position.x - QUIET_RECT.size.x, QUIET_RECT.position.y, QUIET_RECT.size.x, QUIET_RECT.size.y)
    return QUIET_RECT


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
    if p.distance_to(echo_center()) <= ECHO_HIT:
        owners[id] = {"kind": "echo"}
        _emit({"type": "ping"}, "echo")
        return
    if quiet_rect().has_point(p):
        owners[id] = {"kind": "quiet"}
        _emit({"type": "quiet_toggle"}, "quiet")
        return
    if p.distance_to(PAUSE_CENTER) <= PAUSE_HIT:
        owners[id] = {"kind": "pause"}
        _emit({"type": "pause_toggle"}, "pause")
        return
    if mode == &"joystick" and stick_zone().has_point(p) and not _has_kind("stick"):
        owners[id] = {"kind": "stick", "origin": p}
        _emit({"type": "joystick", "dx": 0.0, "dy": 0.0}, "stick")
        return
    var o := {"kind": "world", "start": p, "t": t_ms, "moved": 0.0, "cancelled": false}
    for other in owners.values():
        if other["kind"] == "world":
            other["cancelled"] = true
            o["cancelled"] = true
            history.append({"kind": "pinch", "region": "world"})
    owners[id] = o


func pointer_move(id: int, p: Vector2) -> void:
    if not owners.has(id):
        return
    var o: Dictionary = owners[id]
    if o["kind"] == "stick":
        var v: Vector2 = (p - o["origin"]) / STICK_RADIUS
        if v.length() > 1.0:
            v = v.normalized()
        _emit({"type": "joystick", "dx": v.x, "dy": -v.y}, "stick")
    elif o["kind"] == "world":
        o["moved"] = maxf(o["moved"], p.distance_to(o["start"]))


func pointer_up(id: int, p: Vector2, t_ms: float) -> void:
    if not owners.has(id):
        return
    var o: Dictionary = owners[id]
    owners.erase(id)
    if o["kind"] == "stick":
        _emit({"type": "joystick_end"}, "stick")
    elif o["kind"] == "world":
        var tap: bool = not o["cancelled"] and o["moved"] < TAP_MOVE_PX and (t_ms - o["t"]) <= TAP_MS
        if tap and mode == &"waypoint":
            _emit({"type": "waypoint", "x": o["start"].x, "y": o["start"].y}, "world")
        else:
            history.append({"kind": "world_ignored", "region": "gesture was not a tap"})


## OS gesture, interruption or lock screen. Nothing may sound and movement stops.
func pointer_cancel(id: int) -> void:
    if owners.has(id):
        cancel_all("pointer cancel")


func cancel_all(reason: String = "cancel") -> void:
    owners.clear()
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
