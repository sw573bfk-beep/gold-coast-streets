// ============================================================================
// Gold Coast Streets — Brisbane: the Story Bridge (its steel cantilever truss over the deck, built along the bridge's
// real line from the map), Brisbane landmarks for the photography activity, and Brisbane activities: the Story Bridge
// Climb, the Wheel of Brisbane, Lone Pine, a CityCat cruise and the train up from the Gold Coast.
// ============================================================================
const SBRIDGE = { pts: [], mesh: null, w: 12 };
// the bridge's road, gathered from whichever tiles hold it; once the whole span has turned up, the truss goes on top
function storyBridgeTile(T, data) {
  const idx = (data.names || []).indexOf('Story Bridge'); if (idx < 0) return;
  for (const r of data.roads) if (r[2] === idx && r[3]) { SBRIDGE.w = Math.max(SBRIDGE.w, r[1]); for (let q = 4; q < r.length; q += 2) if (!SBRIDGE.pts.some((p) => Math.abs(p[0] - r[q]) < 1 && Math.abs(p[1] - r[q + 1]) < 1)) SBRIDGE.pts.push([r[q], r[q + 1]]); }
  buildStoryBridge();
}
function buildStoryBridge() {
  if (SBRIDGE.mesh || SBRIDGE.pts.length < 2) return;
  // order the points along the bridge (its long axis) and measure it
  let ax = 0, az = 0; for (const p of SBRIDGE.pts) { ax += p[0]; az += p[1]; } ax /= SBRIDGE.pts.length; az /= SBRIDGE.pts.length;
  let best = 0, ux = 1, uz = 0; for (const p of SBRIDGE.pts) for (const q of SBRIDGE.pts) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > best) { best = d; ux = (q[0] - p[0]) / d; uz = (q[1] - p[1]) / d; } }
  if (best < 600) return; // not all of it loaded yet
  const pts = SBRIDGE.pts.slice().sort((p, q) => ((p[0] - ax) * ux + (p[1] - az) * uz) - ((q[0] - ax) * ux + (q[1] - az) * uz));
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const L = cum[cum.length - 1];
  const at = (s) => { let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++; const t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1); const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) || 1; return { x, z, tx: (pts[i + 1][0] - pts[i][0]) / l, tz: (pts[i + 1][1] - pts[i][1]) / l }; };
  const deck = (x, z) => { const d = typeof deckAt === 'function' ? deckAt(x, z) : null; return d === null ? groundAt(x, z) : d; };
  // the top chord: low at the ends, up to ~48 m over the two river piers, dipping to ~14 m at mid-span (282 m of 777)
  const t1 = 0.318, t2 = 0.682, hTop = (t) => { const e = Math.min(t, 1 - t); return e < t1 ? 8 + 40 * Math.pow(e / t1, 1.6) : 48 - 34 * Math.sin(Math.min(1, (e - t1) / (0.5 - t1)) * Math.PI / 2); };
  const B = newBuf(), steel = col('#5f6b74'), stone = col('#b8ae9e'), off = SBRIDGE.w / 2 + 1.2;
  const beam = (a, b, th) => { // a thin box between two points
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz); if (len < 0.1) return;
    const g = new THREE.BoxGeometry(th, th, len); const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(0, 1, 0)); m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); g.applyMatrix4(m);
    const p = g.toNonIndexed().attributes.position.array, n = g.toNonIndexed().attributes.normal.array; for (let k = 0; k < p.length; k++) { B.pos.push(p[k]); B.nor.push(n[k]); } for (let k = 0; k < p.length / 3; k++) B.col.push(steel.r, steel.g, steel.b); g.dispose();
  };
  const STEP = 12, n = Math.max(8, Math.round(L / STEP));
  for (const side of [-1, 1]) {
    let prevTop = null, prevBot = null;
    for (let k = 0; k <= n; k++) {
      const s = L * k / n, P = at(s), y = deck(P.x, P.z), px = P.x - P.tz * off * side, pz = P.z + P.tx * off * side;
      const top = [px, y + hTop(s / L), pz], bot = [px, y - 1.2, pz];
      beam(bot, top, 0.7); // the verticals
      if (prevTop) { beam(prevTop, top, 1.1); beam(prevBot, bot, 1.1); beam(k % 2 ? prevBot : prevTop, k % 2 ? top : bot, 0.5); } // chords and the diagonals
      prevTop = top; prevBot = bot;
    }
  }
  for (let k = 0; k <= n; k += 3) { const s = L * k / n, P = at(s), y = deck(P.x, P.z), h = hTop(s / L); if (h < 10) continue; beam([P.x - P.tz * off, y + h, P.z + P.tx * off], [P.x + P.tz * off, y + h, P.z - P.tx * off], 0.6); } // cross bracing overhead
  for (const t of [t1, t2]) { // the two river piers, stone, from the riverbed up to the deck
    const P = at(L * t), y = deck(P.x, P.z);
    for (const side of [-1, 1]) boxInto(B, P.x - P.tz * off * side, WATER_Y - 3, P.z + P.tx * off * side, 5, y - WATER_Y + 1.5, 9, stone);
  }
  const mesh = new THREE.Mesh(toGeometry(B), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 }));
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); SBRIDGE.mesh = mesh; SBRIDGE.at = at; SBRIDGE.L = L;
}
function updateBrisbane() { // let the bridge go when you're far away (its tiles go too)
  if (SBRIDGE.mesh && SBRIDGE.pts.length && Math.hypot(SBRIDGE.pts[0][0] - player.x, SBRIDGE.pts[0][1] - player.z) > 5000) { scene.remove(SBRIDGE.mesh); SBRIDGE.mesh.geometry.dispose(); SBRIDGE.mesh = null; SBRIDGE.pts.length = 0; }
}
// ---------------------------------------------------------------- landmarks for the photography activity
LANDMARKS.push(['Story Bridge', /^Story Bridge$/i, -38137, -59257], ['Brisbane City Hall', /^Brisbane City Hall$/i, -39316, -58670], ['Wheel of Brisbane', /^Wheel of Brisbane/i, -39591, -57974],
  ['Kangaroo Point Cliffs', /^Kangaroo Point Cliffs/i, -38323, -57476], ['Suncorp Stadium', /^Suncorp Stadium/i, -40692, -59124], ['The Gabba', /^The Gabba|^Brisbane Cricket Ground/i, -37881, -56802]);
// ---------------------------------------------------------------- activities
PARKS.storybridge = ['Story Bridge Climb', [['The climb to the top', 9], ['Across the arch at sunset', 7]], 'Clip on and climb. Press the arrow shown at each step to keep your footing — the faster, the better the view.'];
PARKS.wheel = ['Wheel of Brisbane', [['A turn on the Wheel', 5]], 'Ride the Wheel over South Bank. Press the arrow shown to spot each landmark as the city turns below you.'];
PARKS.lonepine = ['Lone Pine Koala Sanctuary', [['Meet the koalas', 6], ['Feed the kangaroos', 6], ['The platypus house', 5]], 'Gently does it. Press the arrow shown at each moment to keep the animals happy.'];
function brisbaneActivities() {
  const V = (n, re, x, z) => () => venue(n, re, x, z);
  defAct({ id: 'storyclimb', name: 'Story Bridge Climb', icon: '🌉', cat: 'fun', diff: 2, at: V('Story Bridge', /^Story Bridge Adventure Climb|^Story Bridge$/i, -38137, -59257), range: 160, desc: 'Brisbane’s Story Bridge: clip on and climb the steel arch above the river, 80 m up.', reward: 'climb badges', progress: () => `${PARKS.storybridge[1].filter((q) => (actData().coll.rides || []).includes(q[0])).length}/2 climbs`, unit: 'pts', start: () => playRide('storyclimb', 'storybridge') });
  defAct({ id: 'wheel', name: 'Wheel of Brisbane', icon: '🎡', cat: 'fun', diff: 1, at: V('Wheel of Brisbane', /^Wheel of Brisbane/i, -39591, -57974), range: 120, desc: 'A turn on the big wheel at South Bank, with the CBD and the river below.', reward: 'a ride badge', unit: 'pts', start: () => playRide('wheel', 'wheel') });
  defAct({ id: 'lonepine', name: 'Lone Pine Koala Sanctuary', icon: '🐨', cat: 'explore', diff: 1, at: V('Lone Pine Koala Sanctuary', /^Lone Pine Koala Sanctuary/i, -44712, -51494), range: 250, desc: 'The world’s first koala sanctuary, out at Fig Tree Pocket: meet the koalas, feed the kangaroos, see the platypus.', reward: 'animal badges', progress: () => `${PARKS.lonepine[1].filter((q) => (actData().coll.rides || []).includes(q[0])).length}/3`, unit: 'pts', start: () => playRide('lonepine', 'lonepine') });
  defAct({ id: 'citycat', name: 'CityCat cruise', icon: '⛴', cat: 'explore', diff: 1, anywhere: true, where: 'any CityCat terminal on the Brisbane River', desc: 'Ride a CityCat at least three stops along the Brisbane River (E at a terminal when one’s in).', reward: '$40', start: (cur) => { cur.ride = 'ferry'; cur.stops = 0; toast('⛴ Find a CityCat terminal (phone → Transit) and ride three stops'); } });
  defAct({ id: 'trainup', name: 'The train to Brisbane', icon: '🚆', cat: 'explore', diff: 1, anywhere: true, where: 'any Gold Coast station (Varsity Lakes, Robina, Nerang, Helensvale, Coomera)', desc: 'Catch the Gold Coast line from the coast and ride it all the way up to Brisbane (South Brisbane or Roma Street).', reward: '$120', start: (cur) => { cur.ride = 'train'; toast('🚆 Get to a Gold Coast station (phone → Transit) and ride up to Brisbane'); } });
}
// the ride-along activities: count stops on the CityCat, notice arriving in Brisbane on the train
const BRIS_RIDE = { last: null, from: null };
function updateBrisbaneRides() {
  const cur = typeof ACT_CUR !== 'undefined' && ACT_CUR; if (!cur || !cur.ride) return;
  if (player.state !== 'ride' || RIDE.kind !== cur.ride || !RIDE.v) { BRIS_RIDE.last = null; return; }
  const V = RIDE.v, at = V.dwell > 0.5 ? V.stopName(false) : null;
  if (!at || at === BRIS_RIDE.last) return;
  if (!BRIS_RIDE.last) BRIS_RIDE.from = at; BRIS_RIDE.last = at;
  if (cur.ride === 'ferry') { cur.stops = (cur.stops || 0) + 1; if (cur.stops > 3) actComplete('citycat', { msg: `⛴ CityCat cruise done — ${BRIS_RIDE.from} to ${at}`, money: 40 }); }
  if (cur.ride === 'train' && /South Brisbane|Roma Street/.test(at) && /Varsity|Robina|Nerang|Helensvale|Coomera|Hope Island|Pimpama/.test(BRIS_RIDE.from)) actComplete('trainup', { msg: `🚆 From ${BRIS_RIDE.from} all the way to ${at}!`, money: 120 });
}
brisbaneActivities();
