class_name EventBus
extends RefCounted
## Semantic events only. Every event carries the simulation tick it happened on.

signal event_emitted(event: Dictionary)

var _history: Array[Dictionary] = []
var _next_id: int = 0
## Id of the event most recently accepted. A later event names it as its cause.
var last_id: int = -1


## `cause` is the id of the event that made this one happen, or -1 for none.
## A level_reset marker takes no id, so a retried run logs exactly what the first run logged.
func emit_event(kind: StringName, tick: int, payload: Dictionary = {}, cause: int = -1) -> bool:
    if not SemanticEvents.ALL.has(kind):
        push_error("EventBus rejected non-semantic event: %s" % kind)
        return false
    var id := -1
    if kind != SemanticEvents.LEVEL_RESET:
        id = _next_id
        _next_id += 1
    last_id = id
    var event := {"id": id, "kind": kind, "tick": tick, "cause": cause, "payload": payload}
    _history.append(event)
    event_emitted.emit(event)
    return true


func history() -> Array[Dictionary]:
    return _history


func clear() -> void:
    _history.clear()
    _next_id = 0
    last_id = -1
