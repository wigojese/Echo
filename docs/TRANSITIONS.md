# The eight signature transitions

Generated from `reference/transitions/transitions.js` by `node tools/transitions/gen_docs.js --write`. A test fails if this file and the code disagree.

## Timing and curve table

| ID | Transition | Duration | Curve | Clock | Cancel | Skip |
|---|---|---|---|---|---|---|
| T1 | Wordmark to listener | 480 ms | inOutCubic | render time | snap-end | any tap finishes it within one frame |
| T2 | Opening breath | 450 ms | inOutCubic | render time | snap-end | steering or a pinch ends it at once |
| T3 | Cast to incident front | 70 ms | outCubic | press: render time. Front: simulation ticks | snap-end | not skippable and never blocks input: 70 ms |
| T4 | Known-contact camera nudge | 180 ms then 250 ms settle | outCubic | render time | snap-rest | steering cancels it in one frame |
| T5 | Memory pullback | 350 ms | inOutCubic | render time (the world is paused) | snap-rest | Return cancels it and glides back |
| T6 | Threat encounter | 120 ms then 400 ms settle | outCubic | onset: simulation tick. Look: render time | snap-rest | never blocks input. Ends by itself |
| T7 | Failure explanation | 500 ms | inOutCubic | the world is frozen. Reveal: render time | snap-end | any tap finishes it |
| T8 | Success reconstruction | 650 ms | inOutCubic | the world is frozen. Look: render time | snap-end | any tap finishes it within 150 ms. Retry and Next are live from the first frame |

## One block per transition

### T1. Wordmark to listener

- **Trigger:** Begin tapped, first time only
- **Start transform:** ECHO wordmark at full size, centred, opacity 1
- **End transform:** wordmark gone, listener glyph at the player
- **Keyframes (fraction of duration):** 0: scale 1, alpha 1; 0.5: scale 0.55, alpha 1; 0.7: scale 0.3, alpha 1; 1: scale 0.1, alpha 0
- **Midpoint visual:** the wordmark at about half size, its strokes drawing in toward the player
- **Pairing:** haptic `none`, sound `ui_begin`
- **Skip:** any tap finishes it within one frame
- **Cancel policy:** jump to the end state
- **Reduced motion:** opacity swap over 120 ms, no movement
- **Failure fallback:** if the wordmark cannot draw, show the glyph at once
- **Driven by:** render time
- **Runs once per session**\n
### T2. Opening breath

- **Trigger:** level start
- **Start transform:** camera zoom 1.25, starting chamber contour at opacity 0
- **End transform:** camera zoom 1.0, contour at its normal age colour
- **Keyframes (fraction of duration):** 0: zoom 1.25, contour 0; 0.33: zoom 1.17, contour 1; 1: zoom 1, contour 1
- **Midpoint visual:** the starting chamber outlined, camera still settling
- **Pairing:** haptic `none`, sound `ambient_in`
- **Skip:** steering or a pinch ends it at once
- **Cancel policy:** jump to the end state
- **Reduced motion:** zoom 1.0 at once with a 120 ms fade
- **Failure fallback:** start at zoom 1.0
- **Driven by:** render time

### T3. Cast to incident front

- **Trigger:** Echo pressed and accepted by the simulation
- **Start transform:** Echo aperture at full size
- **End transform:** Echo aperture back at full size, front already travelling
- **Keyframes (fraction of duration):** 0: aperture 1; 0.5: aperture 0.82; 1: aperture 1
- **Midpoint visual:** the aperture compressed by 18 percent while the origin scar is already on the plate
- **Pairing:** haptic `tick`, sound `cast`
- **Skip:** not skippable and never blocks input: 70 ms
- **Cancel policy:** jump to the end state
- **Reduced motion:** no compression, the scar appears at once
- **Failure fallback:** draw the scar without the aperture animation
- **Driven by:** press: render time. Front: simulation ticks

### T4. Known-contact camera nudge

- **Trigger:** a creature or heard cue newly appears on screen, while you are not steering
- **Start transform:** camera on the player
- **End transform:** camera back on the player after drifting at most 0.2 of the viewport toward the revealed shape
- **Keyframes (fraction of duration):** 0: offset 0; 1: offset 1; 1.8: offset 1; 3.2: offset 0
- **Midpoint visual:** the camera part-way toward a shape that is already drawn
- **Pairing:** haptic `none`, sound `none`
- **Skip:** steering cancels it in one frame
- **Cancel policy:** return to rest
- **Reduced motion:** disabled: no camera drift
- **Failure fallback:** no nudge
- **Driven by:** render time
- **Rate limit:** at most once every 500 ms\n
### T5. Memory pullback

- **Trigger:** Trace tapped
- **Start transform:** camera zoom 1.0 on the player
- **End transform:** zoom 0.72 on the route, labels visible
- **Keyframes (fraction of duration):** 0: zoom 1; 0.15: zoom 1.05; 1: zoom 0.72
- **Midpoint visual:** strokes thinning, halo and fringe fading as the zoom crosses 0.9 to 0.78
- **Pairing:** haptic `none`, sound `trace_in`
- **Skip:** Return cancels it and glides back
- **Cancel policy:** return to rest
- **Reduced motion:** jump to zoom 0.72 with a 120 ms fade
- **Failure fallback:** jump to the final view
- **Driven by:** render time (the world is paused)

### T6. Threat encounter

- **Trigger:** a listener starts a chase (the alert). Not positional
- **Start transform:** camera zoom 1.0, no amber
- **End transform:** zoom back at 1.0, a steady amber edge while the alert lasts
- **Keyframes (fraction of duration):** 0: zoom 1, flicker 0; 1: zoom 1.08, flicker 0.35; 4.3: zoom 1, flicker 0
- **Midpoint visual:** a single soft amber rise, the view 4 percent closer
- **Pairing:** haptic `pulse`, sound `threat_alert`
- **Skip:** never blocks input. Ends by itself
- **Cancel policy:** return to rest
- **Reduced motion:** no zoom and no flicker: a static amber edge only
- **Failure fallback:** static amber edge
- **Driven by:** onset: simulation tick. Look: render time
- **Rate limit:** at most once every 1000 ms\n
### T7. Failure explanation

- **Trigger:** capture, then the player taps Reveal
- **Start transform:** scene dimmed 45 percent, nothing hidden drawn
- **End transform:** the listener's real route and your echoes drawn, labelled as an explanation view
- **Keyframes (fraction of duration):** 0: reveal 0; 0.5: reveal 0.5; 1: reveal 1
- **Midpoint visual:** half of the real route drawn from the old echo origin
- **Pairing:** haptic `none`, sound `explain`
- **Skip:** any tap finishes it
- **Cancel policy:** jump to the end state
- **Reduced motion:** route appears at once with a 120 ms fade
- **Failure fallback:** show the sentence without the route
- **Driven by:** the world is frozen. Reveal: render time

### T8. Success reconstruction

- **Trigger:** exit reached
- **Start transform:** scene dimmed to 80 percent, your echoes as rings where you cast them
- **End transform:** one inked line from entry to exit, then a small glyph
- **Keyframes (fraction of duration):** 0: ink 0; 0.25: ink 0; 0.85: ink 1; 1: ink 1
- **Midpoint visual:** the line drawn about halfway from the entry
- **Pairing:** haptic `tick`, sound `success`
- **Skip:** any tap finishes it within 150 ms. Retry and Next are live from the first frame
- **Cancel policy:** jump to the end state
- **Reduced motion:** finished line at once with a 120 ms fade
- **Failure fallback:** show the result without the line
- **Driven by:** the world is frozen. Look: render time
