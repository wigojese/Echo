extends Node
## Boot scene. Loads EC-L01, validates it, runs one pulse and prints a one-line
## verdict. Exit code 1 if the level is rejected.

const LEVEL_PATH := "res://game/resources/levels/EC-L01.json"


func _ready() -> void:
    var level: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(LEVEL_PATH))
    var geometry: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(level["geometry_file"]))
    var problems := LevelValidator.validate(level, geometry)
    if not problems.is_empty():
        for p in problems:
            printerr("LEVEL REJECTED: ", p)
        get_tree().quit(1)
        return
    var truth := WorldTruth.from_level(level, geometry)
    var cost := AcousticFieldSolver.solve(truth.sound_grid, truth.player_position)
    var reached := 0
    for c in cost:
        if not is_inf(c):
            reached += 1
    print("ECHO boot ok: %s, %d cells reached by a pulse from spawn" % [level["id"], reached])
    get_tree().quit(0)
