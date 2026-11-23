# Input spec (Stage 09)

Labels: IMPLEMENTED/TESTED (ran here), EMULATED (real touch events in headless Chromium, not a phone), UNVERIFIED (needs a phone), DESIGN PROPOSAL.
Code: `reference/input/input_router.js` and `driver.js` (tested). GDScript port in `game/scripts/input/` (parse-checked only).

## Two candidate schemes, one toggle

| | Tap to waypoint (default hypothesis) | Floating joystick |
|---|---|---|
| Move | tap a lit path, you walk the route | hold the left thumb, drag to steer |
| Echo | tap the big Echo button, right thumb | same |
| Fingers needed | 1 at a time. You keep walking while you tap Echo | 2, one to steer and one for Echo |
| Into the dark | not possible, routes stop at what you know | possible, you can walk blind |
| Left-handed | mirrors Echo, Quiet step and the stick zone | same |

Switch in the graybox with `M`, mirror with `H`, or `?mode=joystick&hand=left` in the URL.

## Gesture ownership (as implemented)

A pointer owns its gesture from touch-down to release or cancel. Where it starts decides what it is.

| Starts on | Action | Result |
|---|---|---|
| Echo (104 px across) | touch-down | one ping now, if the cooldown allows. Sliding off afterwards changes nothing |
| Quiet step (118 x 46) | touch-down | toggles once. Holding does not repeat |
| Pause (60 px across) | touch-down | toggles pause |
| Left half, below y 300 (joystick mode) | drag | steering, 48 px radius, dead zone 0.18 |
| World (waypoint mode) | tap under 8 px and 220 ms | waypoint |
| World | drag over 8 px, or press over 220 ms | ignored. There is no manual camera drag yet (Stage 11) |
| World, second finger | any | pinch: both fingers cancelled, no waypoint |
| Any, third finger | any | ignored. No function needs three |
| OS gesture, lock screen, app switch | cancel | everything cancels, movement stops, the world pauses, no ping |

## Waypoints

- The route runs only through floor the player has sensed: the opening-breath chamber (3.0 m around spawn) and any floor a wave has reached in the last 8 s.
- The route keeps 0.5 m of clearance from anything not known to be open floor. The first version used cell centres and jammed at an inner corner, so the player never arrived. Found by test, fixed in the planner.
- Tapping past the known edge walks to the nearest known point and stops. The game draws the remainder as a dotted amber line. It never walks into the dark.
- A route that makes no progress for 1.5 s is dropped and the player stops (stuck guard).
- Pinging does not cancel or change the route.

## Cooldown and echo rules

- Echo fires on touch-down. The simulation applies it on the next 30 Hz tick, so the cast starts where you stood at that tick.
- The cooldown is 38 ticks (1.27 s). A tap inside it is refused with a visible "Echo is recharging" and a `ping_rejected` event. It is never queued and never sounds later.
- The Echo rim shows the remaining cooldown.

## Privacy

The input log stores only a kind and a region. No coordinates, no touch traces. The in-page `__lat` timing array holds milliseconds only and exists for developer testing.

## Measured (EMULATED, headless Chromium 157, server CPU, not a phone)

From `reference/evidence/input-audit.txt`:

- 50 deliberate Echo taps with 20 px jitter: 50 of 50 pinged, in both modes.
- 50 drags from the world onto Echo: 0 pinged. 50 stray taps 58 to 78 px from Echo: 0 pinged. 20 interrupted presses: 0 pinged.
- Joystick mode with two fingers: 0.70 m moved while 1 echo was sent.
- Touch-down to the render frame with the cast: roughly 35 to 55 ms at p50 and 45 to 67 ms at p95, depending on the run. **Run-to-run spread is about 15 ms,** so no build-to-build difference in this stage is established. Most of the delay is the 30 Hz tick (up to 33 ms) plus a frame. The first version of this audit used fixed sleeps that phase-locked to the tick and reported a misleadingly tight 30.7 ms.
- Page frame interval: 16.7 ms at p50, p95 and p99. Software rendering of a trivial scene, so it says nothing about a phone.

## Known gaps

1. **The default scheme is not decided.** Nobody has used either on a phone.
2. **The 8 px and 220 ms tap limits, the 0.18 dead zone and the 48 px stick radius** are the prompt's values, never tuned on a finger.
3. **A cast can land up to 33 ms after the touch** because of tick quantisation. The visual press acknowledgement is not delayed.
4. **Press acknowledgement on the first displayed frame** is only true in the browser graybox. The Godot UI is not built.
5. **Camera drag, pinch zoom and the Trace rail** do not exist yet, so "no accidental ping from camera drag" is tested only against world drags.
6. **Haptics** are not implemented.
7. **Left-handed mode** mirrors three controls. Pause stays top right in both layouts.


## Stage 11 additions

| Starts on | Action | Result |
|---|---|---|
| TRACE chip (62 x 46, bottom centre) | touch-down | enters TRACE if something is remembered. Inert otherwise |
| Recenter chip (100 x 44, top centre, shown only while the camera is off you) | touch-down | one-tap return |
| Rail (right edge, in TRACE) | drag | scrub, speed capped at one screen width per second |
| Return button (220 x 56, bottom, in TRACE) | touch-down | return to the player and resume |
| Blank world, not steering | drag over 12 px | pan. Between 8 and 12 px nothing happens |
| Two fingers on the world | spread or pinch over 6 percent | anchored zoom about the midpoint |
| Paused menu variant | Resume, Trace | only these answer |

See `docs/GESTURE_CONFLICTS.md` for every pair that could collide.
