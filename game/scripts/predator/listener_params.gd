class_name ListenerParams
extends RefCounted
## Listener numbers per profile. "suspense" is the approved EC-RULESET-01 and changes nothing.
## "forgiving" is a Stage 13 proposal. Port of PROFILES in reference/sim/sim.js.

const SUSPENSE := {
    "patrol_speed": 1.1, "curious_speed": 1.45, "chase_speed": 1.85,
    "hearing_scale": 1.0, "curious_max_ticks": 210, "search_ticks": 75, "chase_lose_ticks": 51,
    "contact_radius": 4.0, "contact_ticks": 6, "alert_ticks": 18,
    "capture_radius": 0.5, "capture_los_ticks": 6,
    "footstep_m": 2.5, "quiet_noise_factor": 0.3, "step_interval_ticks": 5, "step_repeat_ticks": 30,
}
const FORGIVING_DELTA := {
    "chase_speed": 1.60, "hearing_scale": 0.82, "curious_max_ticks": 150, "search_ticks": 60,
    "alert_ticks": 27, "contact_radius": 3.2, "footstep_m": 1.8,
}


static func profile(name: StringName, overrides: Dictionary = {}) -> Dictionary:
    var p: Dictionary = SUSPENSE.duplicate()
    if name == &"forgiving":
        p.merge(FORGIVING_DELTA, true)
    elif name != &"suspense":
        push_error("unknown listener profile %s" % name)
    p.merge(overrides, true)
    return p
