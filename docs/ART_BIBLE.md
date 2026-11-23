# Art bible: D, The Listening Plate (as implemented in Stage 10)

The world is a nearly black plate. A wave develops only the wall faces it touches. Everything on screen is a record of something the player did, and it ages.

## The age grammar

| Stage | Age | Colour | Line | Extras |
|---|---|---|---|---|
| Fresh contact | 0 to 0.35 s | `#CDE9BB` | solid, 2.3 px | halo on the floor side, dashed fringe, a few motes |
| Afterglow | 0.35 to 1.4 s | fresh to `#9FC19B` | solid, 1.9 to 1.6 px | halo and fringe fade out by the midpoint |
| Verified memory | 1.4 to 5 s | `#9FC19B` to `#718B70` | dashed 7 and 2.2, eroding | gaps appear in roughly 0.9 m chunks |
| Residue | 5 to 8 s | to `#4E624F` | dashed 3.2 and 3.6, mostly gone | never carries required information |
| Unknown | after 8 s | none | nothing drawn | honest black |

Contrast against the plate, measured on the canvas: fresh 13.8:1, afterglow 11.4:1, memory 5.0:1, residue 1.8:1.

## The rules that keep it honest

1. **Nothing is drawn that the snapshot does not hold.** The renderer receives a `VisibleWorldSnapshot` and nothing else.
2. **Bloom lives on the known side.** Halo and fringe are offset toward known floor. A wall face never glows backward, so no bloom value can light a room behind it. A naive halo centred on the wall does leak at high bloom, and the test proves it.
3. **The front is the solver's front.** The pressure seam is drawn at the cells the wave is touching, with the local direction of travel taken from the cost field. It bends around corners because the field does.
4. **Your old echo stays where you cast it.** The scar is fixed in the world. When a listener has heard that cast, the scar gains an amber ring and four chevrons.
5. **A creature is never drawn at a live position.** Sensed now: a solid broken line for 0.33 s. After that: a dotted ghost that dissolves within 1.25 s, with its age in seconds.
6. **The player glyph is drawn last,** with a dark under-stroke so no halo can bury it.
7. **Grain is world-anchored.** One 256 px tile at 7 percent alpha moves with the world. It never swims under camera motion.

## Budgets (measured over a full run of replay B and a cooldown-rate ping spam)

At most 30 particles (cap 200), 451 contour segments (cap 1,500), 2 overlapping waves.
