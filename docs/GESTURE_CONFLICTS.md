# Gesture conflict report (Stage 11)

Run: `npm run test:gestures` (20 checks, all passed) and `npm run test:stage09`. A pointer owns its gesture from touch-down. Only two fingers are ever tracked.

| First gesture | Second gesture | What happens | Test |
|---|---|---|---|
| Tap Echo | any world touch | Echo pings once. The world touch is never a pinch | G12 |
| Drag from the world | ends on Echo | no ping | stage 9 R3 |
| Press Echo | slide off | pings once, nothing else | stage 9 R4 |
| Blank-world drag | steering or walking a route | no pan | G6 |
| Blank-world drag | idle | pan after 12 px, never a waypoint | G7 |
| Drag of 8 to 12 px | none | dead zone: no tap, no pan | G8 |
| Pan | second finger lands | pan ends, pinch begins, first finger stops panning | G13 |
| Pinch | third finger | ignored | G14 |
| Pinch under 6 percent | none | ignored | G10 |
| Stick | one world finger | not a pinch | G11 |
| Anything | OS interruption | everything cancels, no ping | G15 |
| TRACE rail swipe | finger drifts onto Echo | the rail keeps the gesture | G4 |
| Tap in TRACE | Echo, Quiet, Pause | inert while reviewing | G2 |
| Tap in TRACE | world | no waypoint | G17 |
| Paused menu | world, Echo | ignored. Only Resume, Trace, Pause answer | G16 |
| Tap TRACE | nothing to review | nothing happens | G1 |
| Tap Recenter | camera on you | inert | G5b |

Hit areas: Echo, Quiet step, TRACE, Recenter and Pause never overlap in either layout, and each is at least 44 px (G18, both layouts).

## Not a conflict, but a limit

While you steer with the stick you cannot pinch, because the stick is one finger and a pinch needs two. A third finger is ignored by design. Walking a tap-to-move route frees both hands for a pinch.
