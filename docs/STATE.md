# ECHO project state

Updated: 2026-11-22. Branch: `claude/keen-volta-mjk5nm`.

## Approval record (what the repository can actually prove)

- This repository was empty before this branch. It holds **no** Stage 00 to 04 documents (`BRIEF.md`, `RISKS.md`, `SENSORY_RULES.md` and so on were never committed here).
  The master prompt says contradicting records must be reconciled. Whether Stages 00 to 04 were approved elsewhere is **UNVERIFIED** from this repo. Ask the user to confirm or supply them.
- **Stage 05, visual identity exploration:** delivered in two rounds (see `design/stage05/`). **Closed.** The user selected **D, The Listening Plate** (EC-D-002). No features from other directions were named as permitted.
- **Stage 06, engine and acoustic feasibility spike:** **Approved as delivered** by the user on 2026-11-22 (EC-D-005). The engine comparison stays **BLOCKED**, the solver reference is **tested**. See `docs/STAGE06_SPIKE.md`.

## Pending stage

Stage 07, production architecture. It cannot start in an engine until the engine is chosen (EC-D-004).

## Pinned versions

None yet. No engine is installed and none has been chosen.

## Active blockers

1. Godot 4.7 and Unity 6.3 cannot be downloaded from the build sandbox (`godotengine.org`, `unity.com` unreachable).
2. No Android SDK, `adb`, or physical phone is available.
3. No engine has been chosen. Stage 07 needs an engine pinned.
