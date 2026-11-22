class_name CameraDirector
extends RefCounted
## Composes the shot from a VisibleWorldSnapshot only. Never imports WorldTruth.
## Stage 07 implements the LISTENER_FOLLOW state. The other states arrive in Stage 11.

const ACTIVE_ZOOM := 1.0


func frame(snapshot: VisibleWorldSnapshot) -> Dictionary:
    return {"state": &"LISTENER_FOLLOW", "center": snapshot.player_position, "zoom": ACTIVE_ZOOM}
