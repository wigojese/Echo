class_name StyleTokens
extends RefCounted
## D, The Listening Plate. Tokens live in JSON so tools and tests can read them
## without the engine.

const PATH := "res://game/resources/style_tokens/plate_tokens.json"


static func load_tokens() -> Dictionary:
    var text := FileAccess.get_file_as_string(PATH)
    var data: Variant = JSON.parse_string(text)
    return data if typeof(data) == TYPE_DICTIONARY else {}
