class_name VisibleWorldSnapshot
extends RefCounted
## The only world view that camera, rendering, input hints and audio may read.
## Instances are produced by KnowledgeGate and by nothing else.

var tick: int = 0
var player_position: Vector2 = Vector2.ZERO
var memory_segments: Array[Dictionary] = []  # {a, b, age_ticks, cast_id}
var cast_origins: Array[Dictionary] = []  # {origin, age_ticks, cast_id}
var threat_ghosts: Array[Dictionary] = []  # {position, age_ticks, direct}
var known_exit: Variant = null  # Vector2 once legitimately sensed, otherwise null
var known_cells: Array = []  # [cell_id, age_ticks] open floor the player has sensed
var grid_nx: int = 0
var grid_ny: int = 0
var grid_cell: float = 0.25
