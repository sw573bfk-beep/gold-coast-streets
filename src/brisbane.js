// ============================================================================
// Gold Coast Streets — Brisbane: the Story Bridge (its steel cantilever truss over the deck, built along the bridge's
// real line from the map), Brisbane landmarks for the photography activity, and Brisbane activities: the Story Bridge
// Climb, the Wheel of Brisbane, Lone Pine, a CityCat cruise and the train up from the Gold Coast.
// ============================================================================
const SBRIDGE = { pts: [], mesh: null, w: 22 };
// the truss's line comes with the map (region.json storyBridge: its two ends, centred where the bridge crosses the river);
// it goes up once every tile along it has loaded, so the deck heights under it are known
function storyBridgeTile() {
  const sb = REGION.storyBridge; if (!sb || SBRIDGE.mesh) return;
  for (let t = 0; t <= 1; t += 0.1) { const T = tileAt(sb[0] + (sb[2] - sb[0]) * t, sb[1] + (sb[3] - sb[1]) * t); if (!T || !T.mask) return; }
  SBRIDGE.pts = [[sb[0], sb[1]], [sb[2], sb[3]]]; buildStoryBridge();
}
function buildStoryBridge() {
  if (SBRIDGE.mesh || SBRIDGE.pts.length < 2) return;
  const [A, Bp] = SBRIDGE.pts, L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]); if (L < 600) return;
  const tx = (Bp[0] - A[0]) / L, tz = (Bp[1] - A[1]) / L, at = (s) => ({ x: A[0] + tx * s, z: A[1] + tz * s, tx, tz });
  const STEP = 12, n = Math.max(8, Math.round(L / STEP));
  // the road deck under each step: the highest deck within a lane or two of the line; where none is found (between deck
  // pieces), the heights either side are joined up, and without any at all the real deck's 30 m over the river is used
  const ys = []; for (let k = 0; k <= n; k++) { const P = at(L * k / n); let y = null; for (let o = -12; o <= 12; o += 3) { const d = deckAt(P.x - tz * o, P.z + tx * o); if (d !== null && (y === null || d > y)) y = d; } ys.push(y); }
  const known = ys.map((y, k) => (y === null ? -1 : k)).filter((k) => k >= 0);
  for (let k = 0; k <= n; k++) if (ys[k] === null) { const a = known.filter((q) => q < k).pop(), b = known.find((q) => q > k); ys[k] = a === undefined && b === undefined ? WATER_Y + 30 : a === undefined ? ys[b] : b === undefined ? ys[a] : ys[a] + (ys[b] - ys[a]) * (k - a) / (b - a); }
  const deck = (s) => ys[clamp(Math.round(s / L * n), 0, n)];
  // the top chord: low at the ends, up to ~48 m over the two river piers, dipping to ~14 m at mid-span (282 m of 777)
  const t1 = 0.318, t2 = 0.682, hTop = (t) => { const e = Math.min(t, 1 - t); return e < t1 ? 8 + 40 * Math.pow(e / t1, 1.6) : 48 - 34 * Math.sin(Math.min(1, (e - t1) / (0.5 - t1)) * Math.PI / 2); };
  const B = newBuf(), steel = col('#5f6b74'), stone = col('#b8ae9e'), off = SBRIDGE.w / 2 + 1.2;
  const beam = (a, b, th) => { // a thin box between two points
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz); if (len < 0.1) return;
    const g = new THREE.BoxGeometry(th, th, len); const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(0, 1, 0)); m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); g.applyMatrix4(m);
    const p = g.toNonIndexed().attributes.position.array, n = g.toNonIndexed().attributes.normal.array; for (let k = 0; k < p.length; k++) { B.pos.push(p[k]); B.nor.push(n[k]); } for (let k = 0; k < p.length / 3; k++) B.col.push(steel.r, steel.g, steel.b); g.dispose();
  };
  for (const side of [-1, 1]) {
    let prevTop = null, prevBot = null;
    for (let k = 0; k <= n; k++) {
      const s = L * k / n, P = at(s), y = deck(s), px = P.x - P.tz * off * side, pz = P.z + P.tx * off * side;
      const top = [px, y + hTop(s / L), pz], bot = [px, y - 1.2, pz];
      beam(bot, top, 0.7); // the verticals
      if (prevTop) { beam(prevTop, top, 1.1); beam(prevBot, bot, 1.1); beam(k % 2 ? prevBot : prevTop, k % 2 ? top : bot, 0.5); } // chords and the diagonals
      prevTop = top; prevBot = bot;
    }
  }
  for (let k = 0; k <= n; k += 3) { const s = L * k / n, P = at(s), y = deck(s), h = hTop(s / L); if (h < 10) continue; beam([P.x - P.tz * off, y + h, P.z + P.tx * off], [P.x + P.tz * off, y + h, P.z - P.tx * off], 0.6); } // cross bracing overhead
  for (const t of [t1, t2]) { // the two river piers, stone, from the riverbed up to the deck
    const P = at(L * t), y = deck(L * t);
    for (const side of [-1, 1]) boxInto(B, P.x - P.tz * off * side, WATER_Y - 3, P.z + P.tx * off * side, 5, y - WATER_Y + 1.5, 9, stone);
  }
  const mesh = new THREE.Mesh(toGeometry(B), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 }));
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); SBRIDGE.mesh = mesh; SBRIDGE.at = at; SBRIDGE.L = L;
}
function updateBrisbane() { // let the bridge go when you're far away (its tiles go too)
  if (SBRIDGE.mesh && Math.hypot(SBRIDGE.pts[0][0] - player.x, SBRIDGE.pts[0][1] - player.z) > 5000) { scene.remove(SBRIDGE.mesh); SBRIDGE.mesh.geometry.dispose(); SBRIDGE.mesh = null; }
}
// ---------------------------------------------------------------- landmarks for the photography activity
LANDMARKS.push(['Story Bridge', /^Story Bridge$/i, -38137, -59257], ['Brisbane City Hall', /^Brisbane City Hall/i, -39316, -58670], ['Wheel of Brisbane', /Wheel of Brisbane/i, -39591, -57974],
  ['Kangaroo Point Cliffs', /^Kangaroo Point Cliffs/i, -38323, -57476], ['Suncorp Stadium', /^Suncorp Stadium/i, -40692, -59124], ['The Gabba', /^The Gabba|^Brisbane Cricket Ground/i, -37881, -56802]);
// ---------------------------------------------------------------- activities
PARKS.storybridge = ['Story Bridge Climb', [['The climb to the top', 9], ['Across the arch at sunset', 7]], 'Clip on and climb. Press the arrow shown at each step to keep your footing — the faster, the better the view.'];
PARKS.wheel = ['Wheel of Brisbane', [['A turn on the Wheel', 5]], 'Ride the Wheel over South Bank. Press the arrow shown to spot each landmark as the city turns below you.'];
PARKS.lonepine = ['Lone Pine Koala Sanctuary', [['Meet the koalas', 6], ['Feed the kangaroos', 6], ['The platypus house', 5]], 'Gently does it. Press the arrow shown at each moment to keep the animals happy.'];
function brisbaneActivities() {
  const V = (n, re, x, z) => () => venue(n, re, x, z);
  defAct({ id: 'storyclimb', name: 'Story Bridge Climb', icon: '🌉', cat: 'fun', diff: 2, at: V('Story Bridge', /^Story Bridge Adventure Climb|^Story Bridge$/i, -38137, -59257), range: 160, desc: 'Brisbane’s Story Bridge: clip on and climb the steel arch above the river, 80 m up.', reward: 'climb badges', progress: () => `${PARKS.storybridge[1].filter((q) => (actData().coll.rides || []).includes(q[0])).length}/2 climbs`, unit: 'pts', start: () => playRide('storyclimb', 'storybridge') });
  defAct({ id: 'wheel', name: 'Wheel of Brisbane', icon: '🎡', cat: 'fun', diff: 1, at: V('Wheel of Brisbane', /Wheel of Brisbane/i, -39591, -57974), range: 120, desc: 'A turn on the big wheel at South Bank, with the CBD and the river below.', reward: 'a ride badge', unit: 'pts', start: () => playRide('wheel', 'wheel') });
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
