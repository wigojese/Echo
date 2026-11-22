class_name SemanticEvents
extends RefCounted
## Closed list of semantic event names. The EventBus rejects anything else, so
## per-frame or per-pixel data can never be smuggled through it.

const PING_CAST := &"ping_cast"
const WAVE_CONTACT := &"wave_contact"
const HEARD_PING := &"heard_ping"
const PREDATOR_STATE_CHANGED := &"predator_state_changed"
const PLAYER_CAPTURED := &"player_captured"
const EXIT_REACHED := &"exit_reached"
const LEVEL_RESET := &"level_reset"

const ALL: Array[StringName] = [
    PING_CAST,
    WAVE_CONTACT,
    HEARD_PING,
    PREDATOR_STATE_CHANGED,
    PLAYER_CAPTURED,
    EXIT_REACHED,
    LEVEL_RESET,
]
