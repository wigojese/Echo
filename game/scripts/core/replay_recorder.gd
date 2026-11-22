class_name ReplayRecorder
extends RefCounted
## seed + tick-indexed inputs. Replaying this must reproduce contours, heard events,
## capture and result. See docs/REPLAY_FORMAT.md.

const FORMAT_VERSION := 1

var level_id: String = ""
var seed_value: int = 0
var ruleset: String = "EC-RULESET-01"
var inputs: Array[Dictionary] = []  # {tick, type, x, y}


func record(tick: int, type: StringName, position: Vector2 = Vector2.ZERO) -> void:
    inputs.append({"tick": tick, "type": String(type), "x": position.x, "y": position.y})


func to_json() -> String:
    return JSON.stringify(
        {
            "format_version": FORMAT_VERSION,
            "level_id": level_id,
            "seed": seed_value,
            "ruleset": ruleset,
            "dt_hz": SimClock.HZ,
            "inputs": inputs,
        }
    )


static func from_json(text: String) -> ReplayRecorder:
    var data: Variant = JSON.parse_string(text)
    if typeof(data) != TYPE_DICTIONARY or int(data.get("format_version", 0)) != FORMAT_VERSION:
        return null
    var r := ReplayRecorder.new()
    r.level_id = data["level_id"]
    r.seed_value = int(data["seed"])
    r.ruleset = data["ruleset"]
    for i in data["inputs"]:
        r.inputs.append(i)
    return r
