class_name Transitions
extends RefCounted
## The eight signature transitions. View layer only: nothing here is read by the simulation.
## Port of reference/transitions/transitions.js. The specs and timings live in docs/TRANSITIONS.md.
## Render-time transitions run on real elapsed milliseconds. Contact truth (the incident front, memory ages,
## the alert onset, the capture freeze) is driven by simulation ticks and only starts these.
## NOT YET RUN IN GODOT.

const REDUCED_MS := 120.0

# id -> {dur, settle, cancel ("end" or "rest"), min_gap, once, haptic, sound}
const SPECS := {
    &"T1": {"dur": 480.0, "settle": 0.0, "cancel": "end", "min_gap": 0.0, "once": true, "haptic": "none", "sound": "ui_begin"},
    &"T2": {"dur": 450.0, "settle": 0.0, "cancel": "end", "min_gap": 0.0, "once": false, "haptic": "none", "sound": "ambient_in"},
    &"T3": {"dur": 70.0, "settle": 0.0, "cancel": "end", "min_gap": 0.0, "once": false, "haptic": "tick", "sound": "cast"},
    &"T4": {"dur": 180.0, "settle": 250.0, "cancel": "rest", "min_gap": 500.0, "once": false, "haptic": "none", "sound": "none"},
    &"T5": {"dur": 350.0, "settle": 0.0, "cancel": "rest", "min_gap": 0.0, "once": false, "haptic": "none", "sound": "trace_in"},
    &"T6": {"dur": 120.0, "settle": 400.0, "cancel": "rest", "min_gap": 1000.0, "once": false, "haptic": "pulse", "sound": "threat_alert"},
    &"T7": {"dur": 500.0, "settle": 0.0, "cancel": "end", "min_gap": 0.0, "once": false, "haptic": "none", "sound": "explain"},
    &"T8": {"dur": 650.0, "settle": 0.0, "cancel": "end", "min_gap": 0.0, "once": false, "haptic": "tick", "sound": "success"},
}
const PERSISTENT: Array[StringName] = [&"T6", &"T7", &"T8"]

var reduced: bool = false
var cues: Array[Dictionary] = []
var revealed: bool = false
var _st: Dictionary = {}
var _now: float = 0.0
var _last: Dictionary = {}
var _used: Dictionary = {}
var _dim7: float = 0.0


func _init(reduced_motion: bool = false) -> void:
    reduced = reduced_motion
    for id in SPECS.keys():
        _st[id] = {"active": false, "t": 0.0, "done": false}


func duration(id: StringName) -> float:
    if reduced:
        return REDUCED_MS
    return float(SPECS[id]["dur"]) + float(SPECS[id]["settle"])


func start(id: StringName) -> bool:
    var s: Dictionary = SPECS[id]
    if reduced and id == &"T4":
        return false  # the optional drift is off under reduced motion
    if s["once"] and _used.has(id):
        return false
    if float(s["min_gap"]) > 0.0 and _last.has(id) and _now - float(_last[id]) < float(s["min_gap"]):
        return false  # a repeated alert can never become a strobe
    _used[id] = true
    _last[id] = _now
    _st[id] = {"active": true, "t": 0.0, "done": false}
    cues.append({"at": _now, "id": id, "haptic": s["haptic"], "sound": s["sound"]})
    if id == &"T7":
        revealed = false
        _dim7 = 0.0
    return true


func reveal() -> void:
    if not _st[&"T7"]["active"]:
        start(&"T7")
    revealed = true
    _st[&"T7"]["t"] = 0.0


func cancel(id: StringName) -> void:
    var st: Dictionary = _st[id]
    if not st["active"]:
        return
    if SPECS[id]["cancel"] == "end":
        st["t"] = duration(id)
        st["done"] = true
        if not (id == &"T7" or id == &"T8"):
            st["active"] = false
    else:
        st["active"] = false
        st["t"] = 0.0
        st["done"] = false


func skip(id: StringName) -> void:
    var st: Dictionary = _st[id]
    if not st["active"]:
        return
    st["t"] = duration(id)
    st["done"] = true
    if id == &"T7":
        revealed = true


func tick(dt_ms: float) -> void:
    _now += dt_ms
    for id in SPECS.keys():
        var st: Dictionary = _st[id]
        if not st["active"]:
            continue
        if id == &"T7" and not revealed:
            st["t"] = minf(float(st["t"]) + dt_ms, 200.0)
            _dim7 = clampf(float(st["t"]) / 200.0, 0.0, 1.0)
            continue
        st["t"] += dt_ms
        if st["t"] >= duration(id):
            st["t"] = duration(id)
            st["done"] = true
            if not PERSISTENT.has(id):
                st["active"] = false


func progress(id: StringName) -> float:
    var st: Dictionary = _st[id]
    if st["active"] or st["done"]:
        return clampf(float(st["t"]) / duration(id), 0.0, 1.0)
    return 0.0


## The threat transition's look. Zoom never exceeds 1.08, flicker never exceeds 0.35 and fires once per second at most.
func threat_params(alert_active: bool) -> Dictionary:
    var st: Dictionary = _st[&"T6"]
    var zoom_mul := 1.0
    var flicker := 0.0
    var t: float = st["t"]
    if st["active"] and not reduced:
        if t < 120.0:
            var e := 1.0 - pow(1.0 - t / 120.0, 3.0)
            zoom_mul = 1.0 + 0.08 * e
            flicker = 0.35 * sin(PI * (t / 120.0))
        elif t < 520.0:
            var e2 := 1.0 - pow(1.0 - (t - 120.0) / 400.0, 3.0)
            zoom_mul = 1.08 - 0.08 * e2
    return {"zoom_mul": zoom_mul, "flicker": flicker, "edge": 0.55 if alert_active else 0.0}
