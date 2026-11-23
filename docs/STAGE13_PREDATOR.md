# Stage 13: predator intelligence, fairness and causal replay

Status: delivered, awaiting your approval. Everything here ran in Node or headless Chromium. **Nothing ran in Godot and no phone was used.** Generated companions: `docs/PREDATOR.md` (diagram, numbers, scenarios), `docs/FAILURE_SAMPLES.md`, `docs/STRATEGIES.md`.

## What changed in the simulation

1. **The listener's state machine is a declared table** (`LISTENER_EDGES`, 11 edges). `setState` throws on any other change. The diagram in `reference/evidence/predator/transitions.svg` is drawn from that table.
2. **Every event has an id and a cause.** A heard ping is caused by its cast. A state change is caused by the sound or state that produced it. A sighting names the earlier state only while the listener is still investigating (from patrol or recover it "walked into view", so it has no cause). A capture names its chase. The reset marker takes no id, so a retry logs exactly what the first run logged.
3. **The explanation walks the cause chain.** `explain()` gives one sentence and one lesson for the player straight after a round. `explainDetail()` gives the full chain with distances, and only after the round. Both read only the event log.
4. **Footstep noise exists** (EC-D-028). Walking is heard within 2.5 m of connected floor, quiet step within 0.75 m, standing still not at all. A ping is as loud under quiet step as without it.
5. **Two profiles** (EC-D-031). `suspense` is the approved EC-RULESET-01 and changes nothing (test S13-01). `forgiving` is a proposal. Both keep the prompt minimums of a 0.60 s warning and 0.18 s of sight (S13-02).

## What is proven, and how

| Claim | Test | Result |
|---|---|---|
| Hearing an old origin: it walks to where the echo was cast while you are elsewhere | S13-04 | at the origin within 0.49 m, you 9.6 m away, no chase |
| Seeing the current player needs sight within 4 m for 6 ticks, no echo | S13-05, 05b, 05c | chase on tick 5; flicker never chases |
| No through-wall perception | S13-06, 06b, 06c, 06d | 24 echoes and 30 s next to a listener 3.2 m away through a wall: nothing. Negative control: add a doorway and the same inputs are heard. Hairpin: 41 positions within 4 m through a wall never chase, 28 in sight always do |
| Captures are telegraphed | S13-07, 07d, 07e, 07f | standing inside capture range, the capture still waits the full 18 ticks. The alert is in the snapshot on every chase tick, carries only an age. Shortest warning in any sampled capture is 20 ticks |
| Lost sight, search, recover | S13-08 | search starts after exactly 51 ticks without sight, lasts exactly 75, then recovers |
| A new sound resets the investigation | S13-09 | origin and timer both move, no second CURIOUS change |
| Listener memory does not leak | S13-10 | after it recovers it never returns to an old origin (closest return 8.9 m) |
| Quiet step | S13-11 | walking heard at 6 m, quiet not; ping equally loud; standing still silent |
| Explanation uses only the log | S13-12, 13 | every cause is an earlier event; sentence and lesson identical when the hidden route is tampered with; nothing returned while the round runs |
| Five lesson rules, each fired by a real run | S13-14 | three from EC-L01 sweeps, two from a fixture corridor |
| Failure samples are verified traces | S13-15 | 5 of 5 replay to a byte-identical log |
| Eight strategies, seven of them win and the eighth (echo then stand still) never does | S13-16 | wins with 0, 1, 3 and 6 echoes |
| Every declared edge is exercised, no undeclared one occurs | S13-17 | 11 of 11 |

## Strategies (EC-L01, 61 start phases each, suspense)

Navigator 100 percent, Bait and run 100, Blind dash 87, Patient listener 87, Echo at the junction 80, Six echoes 74, Quiet creep 44, Echo then stand still 0. Forgiving: 100, 100, 100, 100, 100, 80, 67, 0. These are authored open-loop scripts; none reads the listener. The only variation is the wait at the spawn. They show how much timing luck each plan needs. They say nothing about people.

## Findings you should know about

1. **Quiet step is a trap on EC-L01.** Sight (4 m) shadows footsteps (2.5 m), and quiet is slower. Quiet creep wins 44 percent of phases, the same route walking wins 87. Raising footstep reach to 6 m makes footsteps matter: walking falls from 87 to 61 percent. Quiet creep still wins 44, so quiet is no better even then on this route (the sweep table in `docs/STRATEGIES.md`). The prompt's level list puts "quiet step becomes meaningful" at L07, so I left L01 alone. Decision EC-D-028.
2. **A sound heard from 10.2 to 11 m is investigated for 7 s and the listener stops short.** At 1.45 m/s, 7 s covers 10.15 m, so the listener searches about 0.8 m before the origin (S13-10d). A designed edge, kept.
3. **Informed play is not tense.** In Navigator and Bait the listener's closest approach is about 8 m at the median. The suspense in these runs comes from the plans that walk in blind or stand still. Whether that is right for L01 is a feel question I cannot answer without a person playing.
4. **A listener that saw you before it reached an echo's origin now says "was on its way".** The earlier sentence always said it walked there, which was sometimes false.

## Not done, and why

- **Godot.** The GDScript port (event ids and causes, `heard_step`, `ListenerParams`, edge table, footsteps, causal explanation) parses and has four new tests in `tests/run_tests.gd`. None has run. Manual test: `godot --headless --path . -s tests/run_tests.gd` on a machine with Godot 4.7.
- **People.** No test measures whether a player finds the lesson useful or fair. That is Stage 17. Manual test: show the failure sheet to five people after a capture and ask what they would change.
- **Visual cue for footsteps.** There is none. A listener that turns toward where it heard you walk gives the player no sign until the chase warning. The explanation names it afterwards. This is a fairness risk if EC-D-028 stays on.
- **The Reveal map with six echoes is crowded.** Labels stay on screen now, but "listener starts here" and a nearby echo label can still touch (`reference/evidence/predator/failure_FOUND_ON_ROUTE_after.png`).
- `everCells` in the Node sim is evaluation-only and not ported.

## How to run

```bash
npm run check             # everything, includes the 55 Stage 13 tests and the generated-docs check
npm run docs:predator     # rewrite the generated docs, diagram and sample replays
npm run evidence:predator # failure-sheet screenshots before and after Reveal
```

Try the forgiving profile in the graybox: `reference/graybox/index.html?profile=forgiving`.
