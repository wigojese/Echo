'use strict';
// CI authority for level validation. Returns human-readable diagnostics.
const S = require('../../spike/stage06/solver');
const PLAYER_RADIUS = 0.28;

function segIntersect(p1, p2, p3, p4) { // proper intersection only
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function checkPolygon(poly) {
  const out = [], pts = poly.points, n = pts.length;
  if (n < 3) return [`Polygon '${poly.id}' has fewer than 3 points.`];
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]))
      out.push(`Polygon '${poly.id}' self-intersects: edge ${i} crosses edge ${j}.`);
  }
  if (!out.length && area < 0) out.push(`Polygon '${poly.id}' winds clockwise. Counter-clockwise is required.`);
  return out;
}

function validate(level, geometry) {
  const problems = [];
  const b = level.world_bounds_metres, cell = (level.rules && level.rules.acoustic_cell_m) || 0.25;
  if (geometry.half_width_m * 2 < 0.65) problems.push(`Corridor width ${(geometry.half_width_m * 2).toFixed(2)} m is below the 0.65 m minimum.`);
  for (const poly of geometry.polygons || []) problems.push(...checkPolygon(poly));
  const g = S.gridFromStrips(geometry.walkable_strips, geometry.half_width_m, b[2] - b[0], b[3] - b[1], cell);
  const clear = (p) => [[0, 0], [PLAYER_RADIUS, 0], [-PLAYER_RADIUS, 0], [0, PLAYER_RADIUS], [0, -PLAYER_RADIUS]]
    .every(([dx, dy]) => g.walk[S.cellIndex(g, p[0] + dx, p[1] + dy)] === 1);
  const spawn = level.player.spawn_xy, exit = level.goal.exit_xy;
  if (!clear(spawn)) problems.push(`Spawn (${spawn}) is inside a wall or lacks ${PLAYER_RADIUS} m clearance.`);
  if (!clear(exit)) problems.push(`Exit (${exit}) is inside a wall.`);
  else if (clear(spawn)) {
    const reach = S.field(g, spawn[0], spawn[1], Infinity);
    if (reach[S.cellIndex(g, exit[0], exit[1])] === Infinity) problems.push(`Exit (${exit}) is sealed: no connected walkable route from spawn.`);
  }
  for (const p of level.predators || []) {
    if (!clear(p.spawn_xy)) problems.push(`Predator ${p.id} spawns inside a wall.`);
    for (const w of p.patrol_waypoints || []) if (!clear(w)) problems.push(`Predator ${p.id} patrol point (${w}) is inside a wall.`);
  }
  return problems;
}
module.exports = { validate };

if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const lp = process.argv[2] || 'game/resources/levels/EC-L01.json';
  const level = JSON.parse(fs.readFileSync(lp, 'utf8'));
  const gp = level.geometry_file.replace('res://', '');
  const problems = validate(level, JSON.parse(fs.readFileSync(path.resolve(gp), 'utf8')));
  if (problems.length) { problems.forEach((p) => console.log('LEVEL REJECTED: ' + p)); process.exit(1); }
  console.log(`LEVEL OK: ${level.id}`);
}
