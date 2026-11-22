# Comfort and finger-feel test script (real phones)

Everything in Stage 09 so far was emulated. This script closes the gap. Run it on at least one compact and one tall Android phone, and one iPhone if available.

Setup: open `reference/graybox/index.html` on the phone (or the Godot build once it exists). Brightness at a normal indoor level. Sound off.

For each of the two modes (`?mode=waypoint`, `?mode=joystick`), and then again with `&hand=left` for a left-handed player:

1. Hold the phone the way you normally would. Do not coach the player.
2. Ask the player to reach the exit of EC-L01. Time the run with a watch.
3. Count, without telling the player: accidental pings (an echo they did not mean to send), missed pings (they tapped Echo and nothing sounded), accidental waypoints, times they stopped to reposition a hand.
4. Ask: which hand did you use for what? Did your thumb cover anything you needed to see?
5. Ask for a 1 to 5 rating: easy to start, easy to stop, comfortable for two minutes, tense or just fiddly.
6. Repeat once with the left hand only.
7. Note the device, screen size, case, and whether the system gesture bar interfered at the bottom edge.

Record in a table: mode, hand, device, time to exit, accidental pings, missed pings, accidental waypoints, comfort rating, notes. Never record raw touch traces.

Pass criteria to decide the primary scheme (proposed, not statistical): accidental pings at most 1 per run, every player finishes one-handed in the waypoint mode, and no player needs a third finger.
