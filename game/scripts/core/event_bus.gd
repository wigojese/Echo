class_name EventBus
extends RefCounted
## Semantic events only. Every event carries the simulation tick it happened on.

signal event_emitted(event: Dictionary)

var _history: Array[Dictionary] = []


func emit_event(kind: StringName, tick: int, payload: Dictionary = {}) -> bool:
    if not SemanticEvents.ALL.has(kind):
        push_error("EventBus rejected non-semantic event: %s" % kind)
        return false
    var event := {"kind": kind, "tick": tick, "payload": payload}
    _history.append(event)
    event_emitted.emit(event)
    return true


func history() -> Array[Dictionary]:
    return _history


func clear() -> void:
    _history.clear()
