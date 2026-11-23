# ECHO project state

Updated: 2026-11-22. Branch: `claude/keen-volta-mjk5nm`.

## Approval record (what the repository can actually prove)

- This repository was empty before this branch. It holds **no** Stage 00 to 04 documents (`BRIEF.md`, `RISKS.md`, `SENSORY_RULES.md` and so on were never committed here).
  The master prompt says contradicting records must be reconciled. Whether Stages 00 to 04 were approved elsewhere is **UNVERIFIED** from this repo. Ask the user to confirm or supply them.
- **Stage 05, visual identity exploration:** delivered in two rounds (see `design/stage05/`). **Closed.** The user selected **D, The Listening Plate** (EC-D-002). No features from other directions were named as permitted.
- **Stage 07, production architecture:** **Approved** by the user on 2026-11-22 (EC-D-009).
- **Stage 08, EC-L01 graybox:** **Approved** by the user on 2026-11-22 (EC-D-012). See `docs/STAGE08_GRAYBOX.md`.
- **Stage 09, input feel:** **Approved** as delivered (EC-D-016). No real phone was used and the primary scheme is still undecided (EC-D-013). See `docs/INPUT_SPEC.md`.
- **Stage 10, phosphor visual system:** **Approved** as delivered (EC-D-019). Nothing engine-rendered. See `docs/STAGE10_VISUAL.md`.
- **Stage 11, camera:** **Approved** as delivered (EC-D-023). The TRACE entry control is still open (EC-D-021). See `docs/STAGE11_CAMERA.md`.
- **Stage 12, transitions:** delivered in the browser with 22 tests and 12 frame contracts, **no Godot, no phone**. See `docs/STAGE12_TRANSITIONS.md` and `docs/TRANSITIONS.md`.
- **Stage 06, engine and acoustic feasibility spike:** **Approved as delivered** by the user on 2026-11-22 (EC-D-005). The engine comparison stays **BLOCKED**, the solver reference is **tested**. See `docs/STAGE06_SPIKE.md`.

## Pending stage

Stage 12, the eight signature transitions. Delivered in the browser, **awaiting your approval**. Stages 05 to 11 are approved.

## Pinned versions

Engine target **Godot 4.7, GDScript** (chosen by the user, EC-D-006). Not installed here, so the exact patch version is **not pinned**. Pin it when the project is first opened in Godot. `project.godot` was written by hand and is unverified.

## Active blockers

1. Godot 4.7 and Unity 6.3 cannot be downloaded from the build sandbox (`godotengine.org`, `unity.com` unreachable).
2. No Android SDK, `adb`, or physical phone is available.
3. The engine patch version is not pinned and GDScript has never been executed (see `docs/TEST_REPORT.md`).
