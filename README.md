# ECHO

Portrait mobile stealth-navigation game. A finger-launched sonic pulse reveals space and also tells hunters where you were.

- `docs/` project state, decision log, spike notes
- `design/stage05/` visual identity exploration, source HTML and rendered sheets
- `game/` Godot project modules, `tests/` runners, `tools/` validator and firewall scanner
- `reference/` Node reference simulation, playable browser graybox (`reference/graybox/index.html`), replays, evidence images
- `reference/graybox/plate_world.js` the D renderer, `tools/render_contracts/` pixel contracts and captures
- `reference/transitions/` the eight signature transitions, `tools/transitions/` filmstrips, recordings and the generated `docs/TRANSITIONS.md`
- `reference/camera/` camera director: follow, manual reframe, TRACE path scroll, zoom bands
- `reference/input/` touch router and waypoint planner for both control schemes
- `spike/stage06/` engine-neutral acoustic solver reference and tests (`node spike/stage06/tests.js`)

Engine target: Godot 4.7, GDScript (not yet run in Godot). Checks that run without an engine: `npm run check`. See `docs/STATE.md` and `docs/TEST_REPORT.md`.
