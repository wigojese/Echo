# Stage 12: the eight signature transitions

Labels: IMPLEMENTED/TESTED (ran here), PORTED/UNVERIFIED (GDScript, parse-checked), BLOCKED, UNRESOLVED.
Nothing here ran in Godot, and none of it has been seen on a phone.

The full timing and curve table, plus one block per transition (trigger, start and end transform, keyframes, midpoint, pairing, skip, cancel policy, reduced-motion replacement, fallback), is in **`docs/TRANSITIONS.md`**. It is generated from the code, and a test fails if the two disagree.

## What exists

| Piece | Where | Label |
|---|---|---|
| Spec table and director for all 8 | `reference/transitions/transitions.js` | IMPLEMENTED/TESTED |
| 22 tests: specs, cancellation at 0 / 25 / 50 / 75 / 100 percent, skip, reduced motion, strobe limit, hidden-state independence, failure gating, front sync, cost | `tests/js/stage12.test.js` | passed |
| 12 rendered-frame contracts: luminance of every transition, white pop, tamper tests, reduced motion, input during a transition | `tools/render_contracts/transitions.js` | passed |
| Storyboard vs real capture: 8 filmstrips at 0, 25, 50, 75, 100 percent | `reference/evidence/transitions/` | real renders |
| Two recordings: failure flow and success flow | `reference/evidence/tr-flow-failure.webm`, `tr-flow-success.webm` | recorded |
| Browser graybox with the title, Begin, the amber edge, Reveal, the reconstruction | `reference/graybox/graybox.js` | IMPLEMENTED |
| GDScript director, camera transient effects, alert and post-round gate | `game/scripts/rendering/transitions.gd`, `camera_director.gd`, `simulation.gd` | PORTED/UNVERIFIED |

## Which clock drives what

| Thing | Clock | Why |
|---|---|---|
| The incident front, wall contacts, memory ages | **simulation tick** | contact truth. The picture can lag a frame but never lead the rules |
| The alert onset (when T6 starts) | **simulation tick** | the listener's state change |
| The capture freeze, the exit reached | **simulation tick** | the end of the round |
| T3 Echo aperture press | render time, started by the accepted cast | the press never delays or blocks the cast |
| T1, T2, T4, T5, T6 look, T7 reveal, T8 line | **render time** (real elapsed ms) | pure presentation. Never fed back into the simulation |
| What a transition may read | the visible snapshot only, plus post-round data after the round ends | the firewall |

Proof that the view cannot touch the rules: the simulation's event log is identical with and without the transitions running (test 15).

## Acceptance checks from the prompt

- **Never leaks hidden knowledge.**
  - Before anything is drawn, the camera nudge has no target, whatever the hidden listener is doing (test 08).
  - The alert holds only its age, never a position (test 10), and moving the listener 3 m in the simulation changes no pixel of the threat edge (X3).
  - The real listener route is refused for every tick of the round (test 12). The failure screen is byte-identical before Reveal even when the hidden route is tampered with, and differs after Reveal, so the test can fail (X1, X2).
  - The success replay uses only your own echoes and your own route (test 14).
- **Never blocks life-saving input.** An Echo press in the middle of the threat transition casts on the next tick (I1). The threat zoom never moves the touch mapping (tests 07 and 21). Steering cancels the nudge and the opening breath at once (tests 15 and 19).
- **No abrupt strobe.**
  - Repeated alerts are limited to one per second, at most 35 percent amplitude (test 06).
  - Measured on rendered frames: the worst luminance swing in any second is 2.69 percent of white, against a general-flash threshold of 10 percent (F1). The biggest single-frame step is 2.32 percent (F3).
  - No transition ever draws a pixel brighter than palette chalk (225 of 255) (F2).
- **No desync between hearing and the visible echo.** The origin scar is on the plate in the first snapshot after the cast, and 291 front samples all sat within 0.1 m of the solver front (test 16).
- **Skip and cancel.** Begin and the result replay skip within one frame (limit 150 ms) (test 04). Every transition cancels to a clean, stable state at five progress values (test 03).

## Performance profile

Headless Chromium, software rendering on a server CPU, render plus raster flush per frame. **Not a phone.** The plain Stage 10 frame was 3.3 ms at p50.

| Transition | p50 | p95 |
|---|---:|---:|
| T1 and T2 together | 3.40 ms | 5.00 ms |
| T3 cast | 2.70 ms | 5.00 ms |
| T4 nudge | 4.80 ms | 7.20 ms |
| T5 pullback | 3.80 ms | 14.30 ms |
| T6 threat | 4.40 ms | 6.70 ms |
| T7 failure and reveal | 4.10 ms | 6.00 ms |
| T8 success | 3.30 ms | 3.90 ms |

The director itself costs 0.42 microseconds per frame in Node. The T5 p95 of 14.3 ms is a single slow frame in 30 and is worth watching on a phone, because the 16.7 ms budget leaves little room.

## Decisions for you

1. **Which 2 or 3 transitions are the signature ones?** My recommendation: **T3 (cast to front), T7 (failure explanation) and T8 (success reconstruction).** Together they say the game's one idea, that sight is bought with noise and your own history is the proof.
2. **Which feel showy or sickening?** My suspects: **T4 the camera nudge**, because any camera moving by itself risks disorienting, and **T6's 8 percent zoom**, which may be more than a warning needs. T4 is optional and off under reduced motion. I would ship T4 off by default.

## Known gaps and judgement calls

1. **The alert is a disclosure.** A steady amber edge tells you a listener has seen you, even when it is not lit. It never says where. Without it a capture would have no warning, which the rules forbid. This is EC-D-024.
2. **Sound and haptics are names only.** Each start logs its pairing (`tick`, `pulse`, `cast`, `threat_alert`). Real audio is Stage 15, and `navigator.vibrate` is a guarded no-op that cannot be exercised here.
3. **The flash check uses whole-screen mean luminance,** stricter than the formal area test, but I did not implement the formal general-flash algorithm. A real screen at real brightness behaves differently.
4. **"First time only" is per session.** Nothing is saved between launches yet.
5. **The explanation route is sampled every 0.5 s,** so it is a faithful but approximate line, drawn from stored positions, not an exact path.
6. **Under reduced motion the camera's fade veil sits under the title.** I fixed an early version that hid the wordmark.
7. **T5 anticipation (the 1.05 push-in) is small.** I have not looked at whether it reads as a tic or as polish.
8. **Not built:** WAVE_SURF and THREAT_EVASION as separate camera states. T4 and T6 cover their purpose as transient effects.

## Found and fixed while building

- A global name clash again (`lerp`, `clamp01`) across scripts that share one browser scope.
- Cancelling a transition left it "active" for one more tick. It now finalises at once.
- A float rounding bug produced an opacity of minus 2e-16. It is clamped.
- The reduced-motion veil hid the wordmark, and the reduced-motion test passed because it found no pixels in either frame. The draw order is fixed and the test now requires pixels.
- The failure sheet's Reveal button sat on the explanation sentence. The reconstruction showed a second player glyph. The opening chamber glowed at t=0. The footer line was clipped. All fixed from the filmstrips.
- My first sealed claim that the origin scar has age 0 in the cast snapshot was wrong: the snapshot is already one tick on.
