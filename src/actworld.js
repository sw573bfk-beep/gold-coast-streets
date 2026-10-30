// ============================================================================
// Gold Coast Streets — activities out in the world: checkpoint courses (running, cycling, swimming, kayaking,
// paddleboarding, jet-ski racing, boat tours, hikes, go-karts), the camera (landmarks, wildlife and birds), hidden
// things to find (beach treasure, geocaches, scavenger hunts), the jobs done out on the streets (taxi, tour guide,
// lifeguard, photographer), and the list of every activity with its real place.
// ============================================================================
// ---------------------------------------------------------------- the checkpoint ring
let COURSE_RING = null;
function courseRing() {
  if (COURSE_RING) return COURSE_RING;
  const m = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.3, 8, 28), new THREE.MeshBasicMaterial({ color: col('#f6c445'), transparent: true, opacity: 0.85, toneMapped: false }));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 40, 6).translate(0, 20, 0), new THREE.MeshBasicMaterial({ color: col('#f6c445'), transparent: true, opacity: 0.35, toneMapped: false }));
  const g = new THREE.Group(); g.add(m, beam); g.visible = false; scene.add(g); return (COURSE_RING = g);
}
const isWater = (x, z) => !isLand(x, z);
function clearWater(ax, az, bx, bz) { const L = Math.hypot(bx - ax, bz - az); for (let s = 0; s <= L; s += 6) { const t = s / L; if (isLand(ax + (bx - ax) * t, az + (bz - az) * t)) return false; } return true; }
function nearWater(x, z, maxR = 300) { // the nearest open water to a point (boats start and stop there)
  for (let r = 0; r <= maxR; r += 10) for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (isWater(px, pz) && isWater(px + 8, pz) && isWater(px - 8, pz) && isWater(px, pz + 8) && isWater(px, pz - 8)) return [px, pz]; }
  return null;
}
function waterPath(start, n, step) { // a paddle route that keeps to open water
  const pts = [start]; let h = null;
  for (let k = 0; k < n; k++) {
    const [x, z] = pts[pts.length - 1]; let best = null, bs = -1;
    for (let q = 0; q < 24; q++) {
      const a = q / 24 * TAU; if (h !== null && Math.abs(angDiff(a, h)) > 1.8) continue;
      const bx = x + Math.sin(a) * step, bz = z + Math.cos(a) * step; if (!clearWater(x, z, bx, bz)) continue;
      const far = Math.min(...pts.map((p) => Math.hypot(p[0] - bx, p[1] - bz))); if (far > bs) { bs = far; best = [bx, bz, a]; }
    }
    if (!best) break; pts.push([best[0], best[1]]); h = best[2];
  }
  return pts.slice(1);
}
function shorePath(x, z, n, step, off) { // along the beach: off < 0 is up on the sand/promenade, > 0 out in the surf
  const pts = []; let S = nearestShore(x, z); if (!S) return pts; let tx = S.tx, tz = S.tz, cx = S.px, cz = S.pz;
  for (let k = 0; k < n; k++) {
    cx += tx * step; cz += tz * step; const S2 = nearestShore(cx, cz); if (!S2) break;
    if (S2.tx * tx + S2.tz * tz < 0) { tx = -S2.tx; tz = -S2.tz; } else { tx = S2.tx; tz = S2.tz; }
    cx = S2.px; cz = S2.pz; pts.push([cx + S2.nx * off, cz + S2.nz * off]);
  }
  return pts;
}
function roadPath(x, z, len) { // a ride along the streets
  const ne = nearestEdge(x, z); if (ne.e < 0 || !EDGES[ne.e]) return [];
  let e = ne.e, dir = 1, s = ne.s, run = 0; const pts = [], P = {};
  for (let guard = 0; guard < 80 && run < len; guard++) {
    const E = EDGES[e]; if (!E) break;
    while (s < E.len && run < len) { s += 30; run += 30; if (Math.floor(run / 350) > pts.length - 1 || !pts.length) { edgePoint(E, dir, Math.min(s, E.len), P); pts.push([P.x, P.z]); } }
    const nx = chooseNext(e, dir); if (!nx) break; e = nx.e; dir = nx.dir; s = 0;
  }
  return pts.slice(1);
}
const loopPts = (cx, cz, r, n) => Array.from({ length: n }, (_, k) => [cx + Math.cos(k / n * TAU) * r, cz + Math.sin(k / n * TAU) * r]);
// ---------------------------------------------------------------- running a course
const MODE_OK = {
  foot: () => player.state === 'foot', bike: () => player.state === 'car' && player.car && player.car.spec.bike, boat: (C) => player.state === 'boat' && (!C.boat || player.boat === C.boat),
  car: (C) => player.state === 'car' && (!C.car || player.car === C.car), any: () => true,
};
const MODE_HINT = { foot: 'on foot', bike: 'on a bike', boat: 'in your boat', car: 'in your kart', any: '' };
function startCourse(cur, o) {
  if (!o.pts || o.pts.length < 2) { actFail(cur.id, 'No route from here — try again in a moment'); return; }
  cur.C = Object.assign({ i: 0, lap: 1, laps: 1, t: 0, off: 0, r: 9, wob: 0, lapT: 0, laps_: [] }, o);
  const C = cur.C;
  if (o.boatType) { const [sx, sz] = o.start || o.pts[0], h = Math.atan2(o.pts[0][0] - sx, o.pts[0][1] - sz); C.boat = new Boat(o.boatType, sx, sz, h); C.boat.story = true; player.x = sx; player.z = sz; boardBoat(C.boat); }
  if (o.carType) { const P = o.start ? { x: o.start[0], z: o.start[1], h: Math.atan2(o.pts[0][0] - o.start[0], o.pts[0][1] - o.start[1]) } : curbNear(player.x, player.z); C.car = new Car(o.carType, o.color || null, P.x, P.z, P.h); C.car.kind = 'abandoned'; C.car.story = true; cars.push(C.car); player.x = P.x + 2; player.z = P.z; startEnter(C.car); }
  courseRing().visible = true; goal(`${ACT_BY[cur.id].name}: checkpoint 1`, C.pts[0][0], C.pts[0][1]);
  toast(o.intro || `${ACT_BY[cur.id].name}: go through each ring${MODE_HINT[o.mode] ? ' ' + MODE_HINT[o.mode] : ''}!`); sfxTone([440, 440, 880], 0.4, 0.07);
}
function courseTick(cur, dt) {
  const C = cur.C; if (!C) return; const a = ACT_BY[cur.id];
  C.t += dt; C.lapT += dt;
  const ok = MODE_OK[C.mode](C); C.off = ok ? 0 : C.off + dt;
  if (C.off > 10) return endCourse(cur, false, `You need to stay ${MODE_HINT[C.mode]} — ${a.name} over`);
  if (C.sup && player.boat) { // paddleboard balance: hard turns at speed wobble you off
    C.wob = Math.max(0, C.wob + (Math.abs(player.boat.steer) * Math.abs(player.boat.v) * 0.09 - 0.25) * dt);
    if (C.wob > 1) { C.wob = 0; player.boat.v = 0; C.t += 5; toast('Splash! You fell in (+5 s) — gentler turns'); sfxNoise(0.4, 700, 0.4); }
  }
  const [px, pz] = C.pts[C.i], R = courseRing(), gy = C.water ? WATER_Y + 0.4 : standAt(px, pz);
  R.position.set(px, gy + 3.2, pz); R.rotation.y = elapsed;
  $('jobhud').hidden = false; $('jobhud').textContent = `${a.icon} ${a.name} · ${C.laps > 1 ? `lap ${C.lap}/${C.laps} · ` : ''}checkpoint ${C.i + 1}/${C.pts.length} · ${fmtTime(C.t)}${C.sup ? ` · balance ${'▮'.repeat(Math.round((1 - C.wob) * 5))}` : ''}${ok ? '' : ` · get back ${MODE_HINT[C.mode]}!`}`;
  if (Math.hypot(px - player.x, pz - player.z) < C.r && ok) {
    C.i++; sfxTone([660 + C.i * 30], 0.08, 0.05); if (C.narrate && C.narrate[C.i - 1]) toast(C.narrate[C.i - 1]);
    if (C.i >= C.pts.length) {
      if (C.lap < C.laps) { C.laps_.push(C.lapT); C.lapT = 0; C.lap++; C.i = 0; toast(`Lap ${C.lap}/${C.laps}`); }
      else { if (C.laps > 1) C.laps_.push(C.lapT); return endCourse(cur, true); }
    }
    goal(`${a.name}: checkpoint ${C.i + 1}`, C.pts[C.i][0], C.pts[C.i][1]);
  }
}
function endCourse(cur, won, msg) {
  const C = cur.C, a = ACT_BY[cur.id]; courseRing().visible = false; WAYPOINT = null; clearGPS(); $('jobhud').hidden = true;
  if (C.boat) { const b = C.boat; if (player.boat === b) leaveBoat(); b.story = false; b.remove(); }
  if (C.car) { const c = C.car; if (player.car === c) bailOut(); c.story = false; c.remove(); }
  if (!won) return actFail(cur.id, msg);
  stat('courses'); const t = Math.round(C.t * 10) / 10, par = C.par || 1e9, fast = t <= par;
  let extra = ''; if (C.rivals) { const lap = Math.min(...C.laps_), beat = C.rivals.filter((r) => lap < r).length; extra = ` · best lap ${fmtTime(lap)}, beat ${beat}/${C.rivals.length} rivals`; if (beat === C.rivals.length) stat('sportWins'); }
  actComplete(cur.id, { score: t, money: fast ? C.reward : Math.round(C.reward / 2), msg: `${a.name}: ${fmtTime(t)}${fast ? '' : ` (par ${fmtTime(par)} for the full reward)`}${extra}` });
}
function courseQuit(cur) { if (cur.C) { const C = cur.C; courseRing().visible = false; if (C.boat) { if (player.boat === C.boat) leaveBoat(); C.boat.remove(); } if (C.car) { if (player.car === C.car) bailOut(); C.car.remove(); } } }
// ---------------------------------------------------------------- the camera: landmarks, wildlife and birds
const LANDMARKS = [
  ['Q1', /^Skypoint Observ/i, 606, 753], ['The Soul octopus', /^Soul$/i, 727, 290], ['Surfers Paradise Surf Life Saving Club', /^Surfers Paradise Surf Life/i, 742, 403], ['Kurrawa Surf Club', /^Kurrawa Surf Club/i, 1115, 3340],
  ['The Star', /^The Star Event Centre/i, 498, 3640], ['Pacific Fair', /^Pacific Fair$/i, 440, 4067], ['Sea World', /^Sea World$/i, 50, -4294], ['Marina Mirage', /^Marina Mirage/i, 129, -3489],
  ['Burleigh Heads', /^Burleigh Head National Park/i, 3361, 10507], ['Currumbin Wildlife Sanctuary', /^Currumbin Wildlife Sanctuary/i, 6159, 15188], ['Purling Brook Falls lookout', /^Purling Brook Falls Lookout/i, -14996, 21040], ['Gold Coast Airport', /^Gold Coast Airport$/i, 11000, 20000],
];
const landmarkAt = (L) => venue(L[0], L[1], L[2], L[3]);
const WILDLIFE = [
  { id: 'dragon', name: 'Eastern water dragon', hab: 'shore', col: ['#6b7a3a', '#3f4a22'], size: 0.5 }, { id: 'turkey', name: 'Australian brush-turkey', hab: 'park', col: ['#1d1d1d', '#d6302a'], size: 0.6 },
  { id: 'koala', name: 'Koala', hab: 'sanctuary', col: ['#9a9a96', '#5a5a58'], size: 0.6, tree: true }, { id: 'roo', name: 'Eastern grey kangaroo', hab: 'golf', col: ['#8a7a68', '#5a4a3c'], size: 1.3 },
  { id: 'dolphin', name: 'Bottlenose dolphin', hab: 'water', col: ['#6f7f8c', '#4a5660'], size: 1.2, swim: true }, { id: 'whale', name: 'Humpback whale', hab: 'ocean', col: ['#2f3a44', '#d8d8d8'], size: 5, swim: true, rare: 0.3 },
  { id: 'possum', name: 'Common brushtail possum', hab: 'night', col: ['#5a5a58', '#2a2a2a'], size: 0.45 },
  { id: 'pelican', name: 'Australian pelican', bird: true, hab: 'water', col: ['#f4f4f2', '#1d1d1d'], size: 0.8, swim: true }, { id: 'ibis', name: 'Australian white ibis', bird: true, hab: 'park', col: ['#e8e8e4', '#111111'], size: 0.6 },
  { id: 'lorikeet', name: 'Rainbow lorikeet', bird: true, hab: 'park', col: ['#2fae3a', '#2a5de2'], size: 0.25, perch: true }, { id: 'kookaburra', name: 'Laughing kookaburra', bird: true, hab: 'park', col: ['#c8b48a', '#6b4a2b'], size: 0.35, perch: true },
  { id: 'gull', name: 'Silver gull', bird: true, hab: 'beach', col: ['#f4f4f2', '#9aa0a6'], size: 0.35 }, { id: 'cockatoo', name: 'Sulphur-crested cockatoo', bird: true, hab: 'park', col: ['#f8f8f4', '#f2d230'], size: 0.4, perch: true },
  { id: 'lapwing', name: 'Masked lapwing', bird: true, hab: 'park', col: ['#e8e2d0', '#f2d230'], size: 0.35 }, { id: 'osprey', name: 'Eastern osprey', bird: true, hab: 'water', col: ['#5a4a3c', '#f4f4f2'], size: 0.6, fly: true, rare: 0.4 },
];
const ANIMALS = [];
function habitatOk(W, x, z) {
  const land = isLand(x, z);
  switch (W.hab) {
    case 'water': return !land && nearWater(x, z, 0) !== null;
    case 'ocean': return !land && [400, 900].every((d) => !isLand(x - 0, z) && !isLand(x + d * 0.3, z));
    case 'shore': return land && [8, 16].some((d) => !isLand(x + d, z) || !isLand(x - d, z) || !isLand(x, z + d) || !isLand(x, z - d));
    case 'beach': return land && onBeachSand(x, z);
    case 'park': return land && !resolveCircle(x, z, 1) && !onBeachSand(x, z);
    case 'sanctuary': { const V = venue('Currumbin Wildlife Sanctuary', /^Currumbin Wildlife Sanctuary/i, 6159, 15188); return land && Math.hypot(V.x - x, V.z - z) < 350; }
    case 'golf': return land && REGION.search.some((q) => /golf (club|course)/i.test(q[0]) && Math.hypot(q[2] - x, q[3] - z) < 450);
    case 'night': return land && nightLevel > 0.5 && !resolveCircle(x, z, 1);
  }
  return false;
}
function makeAnimal(W) {
  const s = W.size, g = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(s * (W.swim ? 0.5 : 0.6), s * 0.5, s * (W.swim ? 1.6 : 1)), new THREE.MeshStandardMaterial({ color: col(W.col[0]), roughness: 0.8 }));
  const head = new THREE.Mesh(new THREE.BoxGeometry(s * 0.35, s * 0.35, s * 0.4), new THREE.MeshStandardMaterial({ color: col(W.col[1]), roughness: 0.8 }));
  body.position.y = s * 0.35; head.position.set(0, s * 0.6, s * 0.55); body.castShadow = true; g.add(body, head); scene.add(g); return g;
}
let animalT = 0;
function updateWildlife(dt) {
  for (const A of ANIMALS.slice()) { const d = Math.hypot(A.x - player.x, A.z - player.z); if (d > 230) { scene.remove(A.g); A.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); ANIMALS.splice(ANIMALS.indexOf(A), 1); continue; }
    A.t += dt; const W = A.W; let y = W.swim ? WATER_Y + Math.sin(A.t * 1.5) * 0.25 : W.perch ? standAt(A.x, A.z) + 3.2 : W.fly ? standAt(A.x, A.z) + 18 : standAt(A.x, A.z);
    if (W.fly) { A.x += Math.cos(A.t * 0.4) * dt * 6; A.z += Math.sin(A.t * 0.4) * dt * 6; }
    if (d < 6 && !W.swim && !W.perch) { A.x += (A.x - player.x) / d * dt * 4; A.z += (A.z - player.z) / d * dt * 4; } // it shies away
    A.g.position.set(A.x, y, A.z); A.g.rotation.y = A.h + (W.fly ? A.t * 0.4 : Math.sin(A.t) * 0.2);
  }
  animalT -= dt; if (animalT > 0 || !REGION) return; animalT = 2;
  if (ANIMALS.length >= 7) return;
  const a = rand() * TAU, r = 25 + rand() * 120, x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
  const opts = WILDLIFE.filter((W) => (!W.rare || rand() < W.rare) && habitatOk(W, x, z)); if (!opts.length) return;
  const W = pick(opts); ANIMALS.push({ W, x, z, h: rand() * TAU, t: rand() * 10, g: makeAnimal(W) });
}
function cameraDir() { const v = new THREE.Vector3(); camera.getWorldDirection(v); return v; }
function inShot(x, y, z, maxD, deg) { // in front of the lens, near enough, and not behind a wall
  const v = cameraDir(), dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z, d = Math.hypot(dx, dy, dz);
  if (d > maxD || d < 1) return false; const cos = (dx * v.x + dy * v.y + dz * v.z) / d; return cos > Math.cos(deg * Math.PI / 180);
}
function snapPhoto() {
  stat('photos'); sfxNoise(0.08, 4000, 0.3); const fl = document.createElement('div'); fl.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99;pointer-events:none;transition:opacity .4s'; document.body.appendChild(fl); setTimeout(() => { fl.style.opacity = 0; setTimeout(() => fl.remove(), 450); }, 40);
  const got = [];
  for (const L of LANDMARKS) { const P = landmarkAt(L); if (inShot(P.x, standAt(P.x, P.z) + 20, P.z, 700, 14)) { got.push(L[0]); if (collect('photos', L[0], L[0])) actHook('photo', { msg: `Landmark photographed: ${L[0]} (${collCount('photos')}/${LANDMARKS.length})`, money: 30 }); photoJobCheck(L[0]); } }
  for (const A of ANIMALS) { if (!inShot(A.x, A.g.position.y + A.W.size * 0.4, A.z, A.W.size > 3 ? 160 : 45, 16)) continue; got.push(A.W.name); const set = A.W.bird ? 'birds' : 'wildlife';
    if (collect(set, A.W.id, A.W.name)) actHook(A.W.bird ? 'birds' : 'wildlife', { msg: `${A.W.bird ? 'Bird' : 'Wildlife'} photographed: ${A.W.name} (${collCount(set)}/${WILDLIFE.filter((w) => !!w.bird === !!A.W.bird).length})`, money: A.W.rare ? 120 : 40 }); }
  toast(got.length ? `📸 ${got.join(', ')}` : '📸 Nice shot — nothing on your checklists in frame');
}
function cameraMode() { closePhone(); document.body.classList.add('photo'); if (hasGear('prophone')) camera.fov = 35; toast('📷 Aim, then Space (or click) to take a photo · P or Esc to put the camera away'); }
// ---------------------------------------------------------------- things to find: beach treasure, geocaches, scavenger hunts
const BEACHES = [['Surfers Paradise Beach', 848, 306], ['Kurrawa Beach', 1180, 3340], ['Mermaid Beach', 1512, 5105], ['Miami Beach', 2048, 7432], ['Burleigh Beach', 2729, 9435], ['The Spit Beach', 583, -5040]];
const TREASURE = ['Old coin', 'Message in a bottle', 'Lost gold ring', 'Pirate doubloon (replica)', 'Sand dollar', 'Vintage sunnies', 'Shark tooth', 'Ship’s bell (tiny)'];
function treasureSpots(B) { // three spots on the sand, new each day
  const S = nearestShore(B[1], B[2]); if (!S) return []; const seed = Math.floor(Date.now() / 86400000) * 31 + B[1]; const out = [];
  for (let k = 0; out.length < 3 && k < 40; k++) { const r1 = ((seed * (k + 3) * 9301 + 49297) % 233280) / 233280, r2 = ((seed * (k + 7) * 4871 + 13) % 233280) / 233280; const along = (r1 - 0.5) * 320, inl = 12 + r2 * 30; const x = S.px + S.tx * along - S.nx * inl, z = S.pz + S.tz * along - S.nz * inl; if (isLand(x, z)) out.push([x, z]); }
  return out;
}
function detector(cur, targets, label) { // hot / cold beeps towards the nearest one
  const d = Math.min(...targets.map((p) => Math.hypot(p[0] - player.x, p[1] - player.z)));
  cur.beepT = (cur.beepT || 0) - 1 / 60; if (cur.beepT <= 0) { cur.beepT = clamp(d / 25, 0.12, 2); sfxTone([d < 4 ? 1600 : d < 15 ? 1100 : 700], 0.04, 0.03, 'square'); }
  return `${label} · ${d < 4 ? '🔥 right here — press E to dig' : d < 15 ? 'very warm' : d < 40 ? 'warm' : d < 90 ? 'cool' : 'cold'}`;
}
const CACHES = () => { // twelve caches in real parks, the same for everyone
  if (CACHES.list) return CACHES.list;
  const parks = REGION.search.filter((q) => q[1] === 2 && /park|gardens|reserve/i.test(q[0]) && !/national|conservation|habitat|car park/i.test(q[0]));
  const out = []; for (let k = 0; out.length < 12 && k < parks.length; k++) { const p = parks[(k * 7919) % parks.length]; if (out.some((o) => o.name === p[0])) continue; const a = (k * 2.39996) % TAU, r = 12 + (k * 13) % 30; out.push({ id: 'gc' + k, name: p[0], x: p[2] + Math.cos(a) * r, z: p[3] + Math.sin(a) * r, cx: p[2], cz: p[3], dir: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((Math.atan2(Math.cos(a), -Math.sin(a)) / TAU + 1) % 1) * 8) % 8] }); }
  return (CACHES.list = out);
};
const HUNTS = [
  { name: 'Surfers icons', clues: [['The tallest tower on the coast — go to its foot', 'Q1'], ['Where Surfers’ red-and-yellow lifesavers keep watch', 'Surfers Paradise Surf Life Saving Club'], ['Broadbeach’s surf club, by the big park', 'Kurrawa Surf Club'], ['Lights, cards and a big hotel by the river', 'The Star']] },
  { name: 'Broadwater', clues: [['Yachts and shops at the top of Main Beach', 'Marina Mirage'], ['Dolphins, rides and the Spit', 'Sea World'], ['Southport’s big shopping centre', 'Australia Fair'], ['The oldest yacht club on the Broadwater', 'Southport Yacht Club']] },
  { name: 'Burleigh', clues: [['The headland’s cultural centre, by the creek', 'Jellurgal'], ['A lookout named for the headland’s old name', 'Tumgun Lookout'], ['The point break everyone photographs', 'Burleigh Beach'], ['Courts by the creek where the club plays', 'Burleigh Heads Tennis Club']] },
];
const HUNT_PLACES = { Q1: [/^Skypoint Observ/i, 606, 753], 'Surfers Paradise Surf Life Saving Club': [/^Surfers Paradise Surf Life/i, 742, 403], 'Kurrawa Surf Club': [/^Kurrawa Surf Club/i, 1115, 3340], 'The Star': [/^The Star Event Centre/i, 498, 3640], 'Marina Mirage': [/^Marina Mirage/i, 129, -3489], 'Sea World': [/^Sea World$/i, 50, -4294], 'Australia Fair': [/^Australia Fair Shopping Centre/i, -735, -3470], 'Southport Yacht Club': [/^Southport Yacht Club/i, 285, -2925], Jellurgal: [/^Jellurgal/i, 3114, 10735], 'Tumgun Lookout': [/^Tumgun Lookout/i, 3515, 10226], 'Burleigh Beach': [/^Burleigh Beach$/i, 2729, 9435], 'Burleigh Heads Tennis Club': [/^Burleigh Heads Tennis Club/i, 1949, 10978] };
const huntPlace = (n) => venue(n, HUNT_PLACES[n][0], HUNT_PLACES[n][1], HUNT_PLACES[n][2]);
function actUseKey() { // E for an activity: dig for treasure, log a cache, or start the one you're standing at
  const cur = ACT_CUR;
  if (cur && cur.dig && player.state === 'foot') { const i = cur.dig.findIndex((p) => Math.hypot(p[0] - player.x, p[1] - player.z) < 4); if (i >= 0) { cur.dig.splice(i, 1); const item = pick(TREASURE), cash = Math.round(rr(20, 150)); player.money += cash; collect('treasure', item, item); toast(`⛏️ Found: ${item}! +$${cash}`); sfxTone([523, 784], 0.2, 0.05); if (!cur.dig.length) actComplete(cur.id, { money: 50, msg: `All the treasure on ${cur.beach} found` }); return true; } }
  if (cur && cur.cache && player.state === 'foot' && Math.hypot(cur.cache.x - player.x, cur.cache.z - player.z) < 4) { const c = cur.cache; collect('caches', c.id, `Cache in ${c.name}`); WAYPOINT = null; clearGPS(); actComplete(cur.id, { money: 60, msg: `Geocache logged in ${c.name} (${collCount('caches')}/12)` }); return true; }
  return actUse();
}
// ---------------------------------------------------------------- jobs out on the streets (they use the existing shift system: ECON.shift, jobRate, endShift)
const WORLD_JOBS = ['taxi', 'guide', 'lifeguard', 'photographer'];
let paxModel = null;
function dropPax() { if (paxModel) { disposePerson(paxModel); paxModel = null; } }
function startWorldJob(k, V) {
  ECON.shift = { job: k, shop: V || { name: JOBS[k].name }, done: 0, good: 0, earned: 0, phase: 'new' }; jobState(k).hired = true;
  toast(`${JOBS[k].name}: shift started — ${JOBS[k].desc}`); worldJobNext();
}
function worldJobNext() {
  const S = ECON.shift; if (!S) return; const k = S.job, n = { taxi: 3, guide: 3, lifeguard: 3, photographer: 3 }[k];
  if (S.done >= n) return endShift(`Shift over: ${S.good}/${n} done well.`);
  dropPax(); S.t = 0;
  if (k === 'taxi') { const a = rand() * TAU, s = sidewalkNear(player.x + Math.cos(a) * rr(250, 600), player.z + Math.sin(a) * rr(250, 600)); S.pax = { x: s.x, z: s.z }; S.phase = 'pickup'; paxModel = makePerson({}); scene.add(paxModel.root); paxModel.root.position.set(s.x, standAt(s.x, s.z), s.z); paxModel.armR.rotation.x = -2.6; goal('Taxi passenger', s.x, s.z); }
  if (k === 'guide') { const L = LANDMARKS.map(landmarkAt).filter((P) => Math.hypot(P.x - player.x, P.z - player.z) < 4000 && Math.hypot(P.x - player.x, P.z - player.z) > 200); const P = L.length ? pick(L) : landmarkAt(LANDMARKS[0]); S.dest = P; S.limit = Math.round(Math.hypot(P.x - player.x, P.z - player.z) / 9 + 60); goal('Tour stop: ' + P.name, P.x, P.z); toast(`Take the tour group to ${P.name} (${S.limit}s)`); }
  if (k === 'lifeguard') { const Sh = nearestShore(player.x, player.z); const off = rr(40, 80), al = rr(-80, 80); S.victim = { x: Sh.px + Sh.tx * al + Sh.nx * off, z: Sh.pz + Sh.tz * al + Sh.nz * off }; S.phase = 'swim'; S.limit = 75; paxModel = makePerson({ shirt: '#d6302a' }); scene.add(paxModel.root); paxModel.armL.rotation.x = paxModel.armR.rotation.x = -2.8; goal('Swimmer in trouble!', S.victim.x, S.victim.z); toast('🚨 A swimmer is in trouble — get out there!'); sfxTone([880, 660, 880, 660], 0.6, 0.06, 'square'); }
  if (k === 'photographer') { const L = LANDMARKS.filter((q) => { const P = landmarkAt(q); return Math.hypot(P.x - player.x, P.z - player.z) < 5000; }); const q = L.length ? pick(L) : LANDMARKS[0]; S.want = q[0]; const P = landmarkAt(q); goal('Photo: ' + q[0], P.x, P.z); toast(`Commission: a photo of ${q[0]} (phone → Camera, aim, Space)`); }
}
function photoJobCheck(name) { const S = ECON.shift; if (S && S.job === 'photographer' && S.want === name) { S.done++; S.good++; S.earned += jobRate('photographer'); player.money += jobRate('photographer'); toast(`Commission done: ${name} · +$${jobRate('photographer')}`); worldJobNext(); } }
function updateWorldJobs(dt) {
  const S = ECON.shift; if (!S || !WORLD_JOBS.includes(S.job)) return; S.t += dt; const hud = $('jobhud'); hud.hidden = false;
  if (S.job === 'taxi') {
    const inCar = player.state === 'car' && player.car && !player.car.spec.bike, slow = inCar && player.car.speed < 2;
    if (S.phase === 'pickup') { const d = Math.hypot(S.pax.x - player.x, S.pax.z - player.z); hud.textContent = `🚕 Fare ${S.done + 1}/3 · pick up the passenger ${Math.round(d)} m${inCar ? '' : ' · you need a car'}`; if (d < 10 && slow) { dropPax(); const e = pick(REGION.search.filter((q) => q[1] === 0 && Math.hypot(q[2] - player.x, q[3] - player.z) > 800 && Math.hypot(q[2] - player.x, q[3] - player.z) < 2500)); S.dest = { x: e[2], z: e[3], name: e[0] }; S.dist = Math.hypot(e[2] - player.x, e[3] - player.z); S.phase = 'drop'; S.t = 0; goal('Drop-off: ' + e[0], e[2], e[3]); toast(`“${e[0]}, please.”`); } }
    else { const d = Math.hypot(S.dest.x - player.x, S.dest.z - player.z); hud.textContent = `🚕 To ${S.dest.name} · ${Math.round(d)} m · meter $${Math.round(4 + S.t * 0.3 + (S.dist - d) / 1000 * 2.2)}`; if (d < 20 && slow) { const fare = Math.round(4 + S.dist / 1000 * 2.2 * 6 + jobRate('taxi')), tip = S.t < S.dist / 12 ? 8 : 0; S.done++; S.good += tip ? 1 : 0; S.earned += fare + tip; player.money += fare + tip; toast(`Fare paid $${fare}${tip ? ` + $${tip} tip for a quick trip` : ''}`); worldJobNext(); } }
  } else if (S.job === 'guide') {
    const d = Math.hypot(S.dest.x - player.x, S.dest.z - player.z), left = S.limit - S.t; hud.textContent = `🧭 Tour stop ${S.done + 1}/3: ${S.dest.name} · ${Math.round(d)} m · ${Math.max(0, Math.ceil(left))}s`;
    if (d < 45) { S.done++; const onTime = left > 0; if (onTime) S.good++; const pay = onTime ? jobRate('guide') : Math.round(jobRate('guide') / 3); S.earned += pay; player.money += pay; toast(onTime ? `The group loved ${S.dest.name}! +$${pay}` : `Late, but they got their photos. +$${pay}`); worldJobNext(); }
  } else if (S.job === 'lifeguard') {
    if (paxModel && S.phase === 'swim') { paxModel.root.position.set(S.victim.x, WATER_Y - 0.9 + Math.sin(S.t * 4) * 0.15, S.victim.z); }
    const left = S.limit - S.t;
    if (S.phase === 'swim') { const d = Math.hypot(S.victim.x - player.x, S.victim.z - player.z); hud.textContent = `🛟 Rescue ${S.done + 1}/3 · swimmer ${Math.round(d)} m out · ${Math.max(0, Math.ceil(left))}s`; if (d < 5) { S.phase = 'shore'; dropPax(); toast('Got them! Bring them back to the sand'); goal('The beach', player.x - (S.victim.x - player.x), player.z - (S.victim.z - player.z)); } else if (left <= 0) { S.done++; toast('Another lifeguard got there first — be quicker'); worldJobNext(); } }
    else { hud.textContent = `🛟 Bring the swimmer to shore`; if (isLand(player.x, player.z)) { S.done++; S.good++; S.earned += jobRate('lifeguard'); player.money += jobRate('lifeguard'); stat('rescues'); toast(`Rescue complete! +$${jobRate('lifeguard')}`); worldJobNext(); } }
  } else if (S.job === 'photographer') hud.textContent = `📸 Commission ${S.done + 1}/3: photograph ${S.want} (phone → Camera)`;
}
// ---------------------------------------------------------------- special events
const FESTIVALS = [
  { name: 'Surfers Beachfront Night Markets', at: ['Surfers Paradise beachfront', /^Surfers Paradise Surf Life/i, 742, 403], cap: '#e85a9a' },
  { name: 'Broadwater Lantern Festival', at: ['Broadwater Parklands', /^Broadwater Parklands/i, -460, -3800], cap: '#f2c230' },
  { name: 'Kurrawa Beach Sports Carnival', at: ['Kurrawa Park', /^Kurrawa Park/i, 1080, 3420], cap: '#2a7de2' },
  { name: 'Burleigh Food & Music Weekend', at: ['Justins Park', /^Justins Park/i, 2806, 9743], cap: '#33d17a' },
];
function festivalToday() { const F = FESTIVALS[Math.floor(Date.now() / 86400000) % FESTIVALS.length]; return Object.assign({ w: venue(F.at[0], F.at[1], F.at[2], F.at[3]) }, F); }
// a busker on Cavill Mall
let busker = null;
function updateBusker() {
  const V = venue('Cavill Mall', /^Cavill Mall$/i, 727, 305), d = Math.hypot(V.x - player.x, V.z - player.z);
  if (d < 140 && !busker) { busker = makePerson({ shirt: '#5a3d8a', hairStyle: 'long', beard: true }); scene.add(busker.root); busker.root.position.set(V.x + 6, standAt(V.x + 6, V.z), V.z); }
  else if (d > 180 && busker) { disposePerson(busker); busker = null; }
  if (busker) { busker.armR.rotation.x = -1 + Math.sin(elapsed * 9) * 0.3; busker.armL.rotation.x = -0.8; }
}
// ---------------------------------------------------------------- hooks from existing systems (they count whether or not you started them from the phone)
function actHook(id, r) { if (ACT_BY[id]) actComplete(id, r || {}); }
const JOB_ACT = { delivery: 'job_delivery', barista: 'job_barista', retail: 'job_retail', grocer: 'job_grocer', taxi: 'job_taxi', guide: 'job_guide', reception: 'job_reception', mechanic: 'job_mechanic', lifeguard: 'job_lifeguard', photographer: 'job_photographer' };
function jobGo(k) { // the Activities/Jobs "start": walk-in jobs at the nearest workplace, world jobs where you are (or at the venue)
  const J = JOBS[k];
  if (ECON.shift) { toast('You’re already on a shift'); return; }
  if (J.needs && J.needs()) { toast(J.needs()); return; }
  if (WORLD_JOBS.includes(k) || J.venue) {
    if (J.venue) { const V = jobVenue(k); if (Math.hypot(V.x - player.x, V.z - player.z) > 60) { directions(V.name, V.x, V.z); toast(`Head to ${V.name} to start your shift`); return; } if (k === 'mechanic') { ECON.shift = { job: k, shop: V, done: 0, good: 0, earned: 0 }; jobState(k).hired = true; closePhone(); return nextTask(); } closePhone(); return startWorldJob(k, V); }
    closePhone(); return startWorldJob(k, null);
  }
  const at = jobWorkplace(k); if (!at) { toast('No workplace nearby — try somewhere busier'); return; }
  if (Math.hypot(at.x - player.x, at.z - player.z) > 25) { directions(at.name, at.x, at.z); toast(`Walk in to ${at.name} and press E at the counter to start`); return; }
  closePhone(); jobState(k).hired = true; startShift(k, at);
}
function jobVenue(k) { const J = JOBS[k]; const c = REGION.search.filter((q) => J.venue.test(q[0])).sort((a, b) => Math.hypot(a[2] - player.x, a[3] - player.z) - Math.hypot(b[2] - player.x, b[3] - player.z))[0]; return c ? { name: c[0], x: c[2], z: c[3] } : { name: J.name, x: player.x, z: player.z }; }
function jobWorkplace(k) { const J = JOBS[k]; return nearest(SHOPS.filter((q) => (J.at.includes(q.kind) || (J.style && shopStyle(q) === J.style)) && (k !== 'stocker' || shopStyle(q) !== 'supermarket'))); }
// ---------------------------------------------------------------- every activity, with its real place
(function defineActivities() {
  const V = (n, re, x, z) => () => venue(n, re, x, z);
  const timeFmt = (v) => fmtTime(v), course = { tick: courseTick, quit: courseQuit, unit: 's', low: true, fmt: timeFmt };
  // A · beach and water
  defAct({ id: 'surf', name: 'Surf contest', icon: '🏄', cat: 'water', diff: 2, at: V('Surfers Paradise Beach', /^Surfers Paradise Beach$/i, 848, 306), desc: 'Hire a board and ride 3 waves; your total is judged against 1,500 points. Every ride you take anywhere counts toward your surfing.', reward: '$150 for a winning total', unit: 'pts', fmt: (v) => v + ' pts', stat: 'contests',
    start: (cur) => { cur.waves = []; toast('Surf contest: hire a board (E on the sand), paddle out and ride 3 waves'); surfUse(); }, tick: (cur) => { $('jobhud').hidden = !!SURF.on; if (!SURF.on) $('jobhud').textContent = `🏄 Surf contest · waves ${cur.waves.length}/3 · hire a board: E on the sand`; } });
  defAct({ id: 'fishing', name: 'Fishing', icon: '🎣', cat: 'water', diff: 1, anywhere: true, where: 'any beach, the Broadwater, rivers and canals', needs: 'a fishing rod ($60 at a servo)', desc: 'Cast from the water’s edge and land a fish. Different fish on the surf beaches and in the Broadwater; rare catches fill your collection; the fish market pays by weight. Your water level makes the strike window longer.', reward: 'the market price', unit: 'kg', fmt: (v) => v.toFixed(2) + ' kg', progress: () => `${collCount('fish')} species caught`,
    req: () => (player.items.rod > 0 ? null : 'You need a fishing rod — servos and convenience stores sell them ($60)'), start: (cur) => { ACT_CUR = null; toast('Face the water at the edge and press E to cast'); } });
  defAct(Object.assign({ id: 'kayak', name: 'Kayak the Nerang River', icon: '🛶', cat: 'water', diff: 2, at: V('Isle of Capri boat ramp', /^Isle of Capri Public Boat Ramp/i, 177, 1099), desc: 'Paddle a marked course along the river from the Isle of Capri boat ramp. Beat par for the full reward.', reward: '$70 (par 3:30)',
    start: (cur) => { const w = actWhere(ACT_BY.kayak), s = nearWater(w.x, w.z, 200); startCourse(cur, { mode: 'boat', water: true, boatType: 'kayak', start: s, pts: s ? waterPath(s, 6, 110) : [], par: 210, reward: 70 }); } }, course));
  defAct(Object.assign({ id: 'sup', name: 'Paddleboard Tallebudgera Creek', icon: '🏄‍♂️', cat: 'water', diff: 2, at: V('Tallebudgera Creek', /^Tallebudgera Creek Park/i, 3404, 10952), desc: 'Stand-up paddleboard a marked route on the creek. Turn too hard at speed and you’ll fall in (+5 s).', reward: '$60 (par 3:00)',
    start: (cur) => { const w = actWhere(ACT_BY.sup), s = nearWater(w.x, w.z, 250); startCourse(cur, { mode: 'boat', water: true, sup: true, boatType: 'sup', start: s, pts: s ? waterPath(s, 4, 80) : [], par: 180, reward: 60 }); } }, course));
  defAct({ id: 'volley', name: 'Beach volleyball', icon: '🏐', cat: 'water', diff: 2, at: V('Surfers Paradise beach courts', /^Surfers Paradise Surf Life/i, 742, 403), note: 'on the sand by the surf club', desc: 'A match to 7 against a local pair on the sand.', reward: '$60 a win', unit: 'pts', start: () => playVolleyball('volley') });
  defAct(Object.assign({ id: 'swim', name: 'Ocean swim', icon: '🏊', cat: 'water', diff: 2, at: V('Surfers Paradise Beach', /^Surfers Paradise Beach$/i, 848, 306), desc: 'Swim the buoys just past the break, parallel to the beach.', reward: '$50 (par 2:30)',
    start: (cur) => { const w = actWhere(ACT_BY.swim); startCourse(cur, { mode: 'foot', water: true, pts: shorePath(w.x, w.z, 4, 55, 32), par: 150, reward: 50, r: 7 }); } }, course));
  defAct(Object.assign({ id: 'jetrace', name: 'Jet-ski race', icon: '🚤', cat: 'water', diff: 3, at: V('Southport Yacht Club Marina', /^Southport Yacht Club Marina/i, 285, -2925), desc: 'Three laps of a buoy course on the Broadwater. Your best lap goes in your records.', reward: '$120 (par 2:40)',
    start: (cur) => { const w = actWhere(ACT_BY.jetrace), c = openWater(w.x, w.z, 150, 700, 600); const s = c && nearWater(c.x - 120, c.z, 120); startCourse(cur, { mode: 'boat', water: true, boatType: 'jetski', start: s || (c && [c.x, c.z]), pts: c ? loopPts(c.x, c.z, 110, 5) : [], laps: 3, par: 160, reward: 120, r: 12 }); } }, course));
  defAct(Object.assign({ id: 'boattour', name: 'Broadwater boat tour', icon: '⛴️', cat: 'water', diff: 1, at: V('Marina Mirage', /^Marina Mirage/i, 129, -3489), desc: 'Skipper a speedboat past Sea World and up the Broadwater, with a guide’s commentary at each stop.', reward: '$80',
    start: (cur) => { const stops = [[50, -4294], [430, -5100], [-300, -3900], [77, -3225]].map(([x, z]) => nearWater(x, z, 400)).filter(Boolean); const s = nearWater(129, -3489, 300);
      startCourse(cur, { mode: 'boat', water: true, boatType: 'speedboat', start: s, pts: stops, reward: 80, r: 25, narrate: ['🐬 Sea World — the dolphins are showing off today.', '🏖️ The Spit: surfers to the east, calm water to the west.', '🌳 Broadwater Parklands and Southport’s skyline.', '⛵ Mariners Cove — home stretch!'] }); } }, course, { unit: null }));
  defAct({ id: 'treasure', name: 'Beach treasure hunt', icon: '🪙', cat: 'water', diff: 1, at: () => { const B = BEACHES.slice().sort((a, b) => Math.hypot(a[1] - player.x, a[2] - player.z) - Math.hypot(b[1] - player.x, b[2] - player.z))[0]; return { name: B[0], x: B[1], z: B[2] }; }, desc: 'Three things buried on the nearest beach (new every day). Follow the detector — warmer, warmer — and press E to dig.', reward: '$20–150 each + $50', progress: () => `${collCount('treasure')} treasures found`,
    start: (cur) => { const w = actWhere(ACT_BY.treasure), B = BEACHES.find((b) => b[0] === w.name); cur.dig = treasureSpots(B); cur.beach = B[0]; if (!cur.dig.length) actFail(cur.id, 'Nothing to find here today'); else toast(`Metal detector on: three things are buried along ${B[0]}`); },
    tick: (cur) => { if (cur.dig && cur.dig.length) { $('jobhud').hidden = false; $('jobhud').textContent = '🪙 ' + detector(cur, cur.dig, `${3 - cur.dig.length}/3 found`); } } });
  defAct({ id: 'sandcastle', name: 'Sandcastle competition', icon: '🏰', cat: 'water', diff: 1, at: V('Mermaid Beach', /^Mermaid Beach Beach$/i, 1512, 5105), desc: 'Build against the tide: design, pack, carve, dig the moat and decorate for the judges.', reward: 'up to $120', unit: 'pts', start: () => playSandcastle('sandcastle') });
  // B · sports and fitness
  defAct({ id: 'soccer', name: 'Soccer', icon: '⚽', cat: 'sport', diff: 2, at: V('Pizzey Park', /^Pizzey Park$/i, 420, 7250), desc: 'Penalty shootouts, free kicks over the wall, or a three-round tournament.', reward: '$70 a win, $300 for the tournament', unit: 'goals', start: () => playSoccer('soccer'), progress: () => `${actData().stats.goals || 0} goals scored` });
  defAct({ id: 'basketball', name: 'Basketball', icon: '🏀', cat: 'sport', diff: 2, at: V('Miami basketball courts', /^Basketball Courts$/i, 1450, 7063), desc: 'A 45-second shooting challenge, or 1 on 1 to 11.', reward: '$3 a point (16+), $90 a 1-on-1 win', unit: 'pts', start: () => playBasketball('basketball') });
  defAct({ id: 'skate', name: 'Skateboarding', icon: '🛹', cat: 'sport', diff: 2, at: V('Pizzey skatepark', /^Pizzey skatepark/i, 500, 7146), desc: 'A 60-second session: land trick combos for points and multipliers.', reward: 'up to $150', unit: 'pts', fmt: (v) => v.toLocaleString() + ' pts', start: () => playSkate('skate') });
  defAct(Object.assign({ id: 'run', name: 'Beachfront run', icon: '🏃', cat: 'sport', diff: 1, at: V('Surfers Paradise beachfront', /^Surfers Paradise Surf Life/i, 742, 403), desc: 'Run the promenade south along the beach from Surfers. Sprint (Shift) to beat par.', reward: '$60 (par 4:00)',
    start: (cur) => { const w = actWhere(ACT_BY.run); startCourse(cur, { mode: 'foot', pts: shorePath(w.x, w.z, 6, 280, -55).filter(([x, z]) => isLand(x, z)), par: 240, reward: 60, r: 10 }); } }, course));
  defAct(Object.assign({ id: 'cycle', name: 'Road cycling time trial', icon: '🚴', cat: 'sport', diff: 2, at: V('Broadbeach', /^Kurrawa Park/i, 1080, 3420), desc: 'A 4 km time trial on the streets from Broadbeach — a bike is waiting for you.', reward: '$80 (par 6:00)',
    start: (cur) => { startCourse(cur, { mode: 'bike', carType: 'ebike', color: '#2a7de2', pts: roadPath(player.x, player.z, 4000), par: 360, reward: 80, r: 12 }); } }, course));
  defAct(Object.assign({ id: 'mtb', name: 'Mountain bike Nerang State Forest', icon: '🚵', cat: 'sport', diff: 3, at: V('Nerang State Forest', /^Nerang State Forest Walk/i, -13063, -3277), desc: 'Ride the forest checkpoints out in the hinterland. Rough ground, steep bits.', reward: '$120 (par 5:00)',
    start: (cur) => { const a = actWhere(ACT_BY.mtb), e = REGION.search.filter((q) => /^Nerang State Forest Walk/i.test(q[0]))[1] || { 2: a.x - 900, 3: a.z + 800 }; const pts = []; for (let k = 1; k <= 6; k++) { const t = k / 6, x = a.x + (e[2] - a.x) * t + Math.sin(k * 2.1) * 90, z = a.z + (e[3] - a.z) * t + Math.cos(k * 1.7) * 90; pts.push([x, z]); } startCourse(cur, { mode: 'bike', carType: 'ebike', color: '#33d17a', pts, par: 300, reward: 120, r: 14 }); } }, course));
  defAct({ id: 'tennis', name: 'Tennis', icon: '🎾', cat: 'sport', diff: 2, at: V('Tennis Central Miami', /^Tennis Central Miami/i, 1648, 7237), desc: 'A set against a club player: time your swings and outlast them in the rallies.', reward: '$110 a set', unit: 'games', start: () => playTennis('tennis') });
  defAct({ id: 'golf', name: 'Golf', icon: '⛳', cat: 'sport', diff: 2, at: V('Gold Coast Burleigh Golf Club', /^Gold Coast Burleigh Golf Club/i, 593, 7535), desc: 'The driving range (club face, power, wind) and three putts on the practice green.', reward: 'up to ~$100', unit: 'pts', start: () => playGolf('golf') });
  defAct({ id: 'gym', name: 'Gym training', icon: '🏋️', cat: 'sport', diff: 1, at: V('World Gym Burleigh', /^World Gym$/i, 1542, 11116), desc: 'A timed lifting set that builds your fitness (sprint speed). Uses the gym system you already know.', reward: 'fitness (+1 per session)', progress: () => `fitness ${ECON.fitness}/10`,
    start: () => { ACT_CUR = null; openGym({ name: actWhere(ACT_BY.gym).name, kind: 'gym' }); } }); // the gym's own menu: day pass, workout, shakes
  defAct({ id: 'boxing', name: 'Boxing fitness', icon: '🥊', cat: 'sport', diff: 1, at: V('World Gym Burleigh', /^World Gym$/i, 1542, 11116), range: 70, desc: 'Pad work: hit the lit pad fast for 30 seconds. Big sessions can lift your fitness.', reward: 'fitness', unit: 'pts', start: () => playBoxing('boxing') });
  // C · adventure and exploration
  defAct(Object.assign({ id: 'hike', name: 'Burleigh Heads headland walk', icon: '🥾', cat: 'explore', diff: 1, at: V('Jellurgal Cultural Centre', /^Jellurgal/i, 3114, 10735), desc: 'Walk the national park headland: from Jellurgal past the lookouts.', reward: '$50',
    start: (cur) => { const P = ['Burleigh Head National Park', 'Tumgun Lookout', 'Jebbribillum Lookout'].map((n) => { const e = REGION.search.find((q) => q[0].startsWith(n)); return e ? [e[2], e[3]] : null; }).filter(Boolean); startCourse(cur, { mode: 'foot', pts: P, reward: 50, r: 25, narrate: ['🌿 Into the national park.', '🌊 Tumgun Lookout — whales pass here in winter.', '🏄 Jebbribillum Lookout over the point break.'] }); } }, course, { unit: null }));
  defAct({ id: 'wildlife', name: 'Wildlife photography', icon: '🦘', cat: 'explore', diff: 2, at: V('Currumbin Wildlife Sanctuary', /^Currumbin Wildlife Sanctuary/i, 6159, 15188), desc: 'Photograph animals in the wild: water dragons by the water, brush-turkeys in parks, kangaroos on golf courses, dolphins and (rarely) whales, koalas at the sanctuary, possums at night.', reward: '$40 a new species, $120 rare', progress: () => `${collCount('wildlife')}/${WILDLIFE.filter((w) => !w.bird).length} species`, start: () => { ACT_CUR = null; cameraMode(); } });
  defAct({ id: 'photo', name: 'Landmark photography', icon: '📸', cat: 'explore', diff: 1, anywhere: true, where: 'famous places all over the coast', desc: 'Photograph the Gold Coast’s landmarks: Q1, the Soul octopus, the surf clubs, The Star, Sea World, Burleigh Heads, Purling Brook Falls and more. Get them in frame and take the shot.', reward: '$30 a new landmark', progress: () => `${collCount('photos')}/${LANDMARKS.length} landmarks`, start: () => { ACT_CUR = null; cameraMode(); } });
  defAct({ id: 'camping', name: 'Camping', icon: '⛺', cat: 'explore', diff: 1, at: V('Tallebudgera Creek Tourist Park', /^Kiosk - Tallebudgera Creek Tourist Park/i, 3497, 11106), desc: 'Pitch a tent, keep the campfire going, and sleep till morning (full health).', reward: 'a night’s rest', start: () => playCamping('camping') });
  defAct({ id: 'hunt', name: 'Scavenger hunt', icon: '🧩', cat: 'explore', diff: 2, anywhere: true, where: 'three themed hunts around the coast', desc: 'Solve the clues in order — no GPS, just the riddle (a hint costs 60 seconds).', reward: '$150 a hunt', unit: 's', low: true, fmt: timeFmt, progress: () => `${(actData().coll.hunts || []).length}/3 hunts done`,
    start: (cur) => { const done = actData().coll.hunts || [], H = HUNTS.find((h) => !done.includes(h.name)) || pick(HUNTS); cur.hunt = H; cur.k = 0; toast(`🧩 ${H.name}: ${H.clues[0][0]}`); },
    tick: (cur) => { const H = cur.hunt, [clue, place] = H.clues[cur.k], P = huntPlace(place); $('jobhud').hidden = false; $('jobhud').textContent = `🧩 ${H.name} ${cur.k + 1}/4: ${clue}${cur.hint ? ` (${place})` : ' · phone: hint'}`;
      if (Math.hypot(P.x - player.x, P.z - player.z) < 45) { cur.k++; cur.hint = false; WAYPOINT = null; clearGPS(); sfxTone([660, 880], 0.15, 0.05); if (cur.k >= 4) { collect('hunts', H.name); actComplete(cur.id, { score: Math.round(cur.t), money: 150, msg: `${H.name} hunt solved in ${fmtTime(cur.t)}` }); } else toast(`✔ ${place}! Next: ${H.clues[cur.k][0]}`); } } });
  defAct({ id: 'geocache', name: 'Geocaching', icon: '📦', cat: 'explore', diff: 1, anywhere: true, where: 'twelve real parks', desc: 'Your GPS gets you to the park; the clue and the hot/cold reading get you to the cache. E to sign the logbook.', reward: '$60 a cache', progress: () => `${collCount('caches')}/12 found`,
    start: (cur) => { const have = actData().coll.caches || [], C = CACHES().filter((c) => !have.includes(c.id)).sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0]; if (!C) return actFail(cur.id, 'You’ve found every cache!'); cur.cache = C; goal(C.name, C.cx, C.cz); toast(`📦 Cache: in ${C.name}, on the ${C.dir} side — look near the trees`); },
    tick: (cur) => { if (cur.cache) { $('jobhud').hidden = false; $('jobhud').textContent = `📦 ${cur.cache.name} (${cur.cache.dir} side) · ` + detector(cur, [[cur.cache.x, cur.cache.z]], 'cache').replace('dig', 'log it'); } } });
  defAct({ id: 'sightsee', name: 'Sightseeing tour', icon: '🗺️', cat: 'explore', diff: 1, anywhere: true, where: 'three sights near you', desc: 'The landmark tour from your phone: visit three sights within 10 minutes.', reward: '$600', start: () => { ACT_CUR = null; startTour(); } });
  defAct(Object.assign({ id: 'waterfall', name: 'Springbrook falls lookouts', icon: '💧', cat: 'explore', diff: 2, at: V('Purling Brook Falls lookout', /^Purling Brook Falls Lookout/i, -14996, 21040), desc: 'Up in the hinterland at Springbrook: visit the lookouts over the falls and gorges (any way you like). The lookouts are real; the waterfalls themselves aren’t drawn yet.', reward: '$90',
    start: (cur) => { const w = actWhere(ACT_BY.waterfall), L = REGION.search.filter((q) => q[1] === 10 && /lookout/i.test(q[0]) && Math.hypot(q[2] - w.x, q[3] - w.z) < 6000).slice(0, 4).map((q) => [q[2], q[3]]); startCourse(cur, { mode: 'any', pts: L.length >= 2 ? L : [[w.x, w.z], [w.x + 300, w.z]], reward: 90, r: 30 }); } }, course, { unit: null }));
  defAct({ id: 'birds', name: 'Birdwatching', icon: '🦜', cat: 'explore', diff: 1, at: V('Broadwater Parklands', /^Broadwater Parklands/i, -460, -3800), desc: 'Photograph the coast’s birds: pelicans on the water, ibis and lapwings in parks, lorikeets, kookaburras and cockatoos up in the trees, gulls on the beach — and the odd osprey overhead.', reward: '$40 a new species', progress: () => `${collCount('birds')}/${WILDLIFE.filter((w) => w.bird).length} species`, start: () => { ACT_CUR = null; cameraMode(); } });
  defAct({ id: 'bikeexplore', name: 'Cycling exploration', icon: '🚲', cat: 'explore', diff: 1, anywhere: true, where: 'suburbs you haven’t been to', desc: 'Ride a bike into 3 suburbs you’ve never visited.', reward: '$90', progress: () => `${(actData().found || []).length} places discovered`,
    start: (cur) => { cur.base = actData().stats.bikePlaces || 0; toast('Grab a bike (or e-bike) and ride somewhere new'); },
    tick: (cur) => { const n = (actData().stats.bikePlaces || 0) - cur.base; $('jobhud').hidden = false; $('jobhud').textContent = `🚲 New suburbs by bike ${n}/3`; if (n >= 3) actComplete(cur.id, { money: 90, msg: 'Three new suburbs explored by bike' }); } });
  // D · entertainment
  defAct(Object.assign({ id: 'karts', name: 'Go-karting at Slideways', icon: '🏎️', cat: 'fun', diff: 2, at: V('Slideways Go Karting', /^Slideways Go Karting/i, -8147, -180), desc: 'Three laps against the clock — beat the lap times of the three regulars. (The kart is a small race car for now.)', reward: '$80 (par 1:30)',
    start: (cur) => { if (!pay(25, 'a kart session')) return actFail(cur.id, 'Karts are $25'); const w = actWhere(ACT_BY.karts), c = curbNear(w.x, w.z) || { x: w.x, z: w.z }; const pts = loopPts(c.x, c.z, 40, 6).filter(([x, z]) => isLand(x, z)); startCourse(cur, { mode: 'car', carType: 'coupe', color: '#ff6f00', start: [c.x, c.z], pts, laps: 3, par: 90, reward: 80, r: 10, rivals: [24, 28, 33] }); } }, course));
  defAct({ id: 'bowls', name: 'Lawn bowls', icon: '🎳', cat: 'fun', diff: 1, at: V('Burleigh Heads Bowls Club', /^Burleigh Heads Bowls Club/i, 2831, 10008), note: 'there’s no ten-pin alley in the map data — it’s lawn bowls at the club', desc: 'Four ends against a club member. Bowls curve with their bias: get closest to the jack.', reward: '$70 a win', start: () => playBowls('bowls') });
  defAct({ id: 'minigolf', name: 'Mini-golf', icon: '⛳', cat: 'fun', diff: 1, at: () => { const t = SHOPS.find((s) => /^timezone/i.test(s.name)); return t ? { name: t.name, x: t.x, z: t.z } : { name: 'Timezone Surfers Paradise', x: 720, z: 300 }; }, note: 'no mini-golf venue is in the map data, so it’s set at the arcade for now', desc: 'Six holes, par 2 each: drag back and let go.', reward: '$60 on par', unit: 'strokes', low: true, start: () => playMinigolf('minigolf') });
  defAct({ id: 'arcade', name: 'Arcade games', icon: '🕹️', cat: 'fun', diff: 1, at: () => ACT_BY.minigolf.at(), desc: 'The Timezone machines (Croc Whack, Wave Rider, Stacker): win prize tickets and swap them at the counter. Walk in and press E at the counter.', reward: 'prize tickets', start: () => { ACT_CUR = null; const t = SHOPS.find((s) => /^timezone/i.test(s.name)); if (t) openShop(t); } });
  defAct({ id: 'cinema', name: 'Cinema', icon: '🎬', cat: 'fun', diff: 1, at: V('Event Cinemas Australia Fair', /^Event Cinemas$/i, -843, -3377), desc: 'Buy a ticket and watch one of three (made-up) short films.', reward: '+15 health, a film checklist', progress: () => `${collCount('films')}/${FILMS.length} films`, start: () => playCinema('cinema') });
  defAct({ id: 'escape', name: 'Escape room', icon: '🔐', cat: 'fun', diff: 2, at: () => { const e = SHOPS.find((s) => s.kind === 'escape'); return e ? { name: e.name, x: e.x, z: e.z } : { name: 'Escape room, Surfers', x: 720, z: 300 }; }, desc: 'Five minutes to find the clues and get out. Walk in and press E at the counter.', reward: 'a trophy', start: () => { ACT_CUR = null; const e = SHOPS.find((s) => s.kind === 'escape'); if (e) openShop(e); } });
  defAct({ id: 'lasertag', name: 'Laser tag', icon: '🔫', cat: 'fun', diff: 2, at: () => ACT_BY.minigolf.at(), note: 'no laser tag venue is in the map data, so it’s set at the arcade for now', desc: 'Blue team vs red: tag them as they pop out of cover before they tag you. 60 seconds.', reward: '$50 a win', unit: 'pts', start: () => playLaserTag('lasertag') });
  defAct({ id: 'ride', name: 'Sea World rides', icon: '🎢', cat: 'fun', diff: 1, at: V('Sea World', /^Sea World$/i, 50, -4294), desc: 'Ride the Storm Coaster, Jet Rescue, the Vikings Revenge flume, Leviathan and Sea Viper — hold on through every twist. Collect all five ride badges.', reward: 'ride badges', progress: () => `${collCount('rides')}/${RIDES.length} badges`, unit: 'pts', start: () => playRide('ride') });
  defAct({ id: 'busk', name: 'Street performance', icon: '🎸', cat: 'fun', diff: 1, at: V('Cavill Mall', /^Cavill Mall$/i, 727, 305), desc: 'Join the busker on Cavill Mall for a song: hit the notes, earn the crowd’s tips.', reward: 'tips (up to $80)', unit: '%', start: () => playBusk('busk') });
  defAct({ id: 'festival', name: 'Festival event', icon: '🎪', cat: 'fun', diff: 1, at: () => festivalToday().w, desc: 'Today’s event (it moves around the coast each day): play the three stalls for the event cap.', reward: '$80 + the event cap', start: () => playFestival('festival') });
  // E · jobs (the existing job system: shifts, raises, pay into your wallet)
  const jobAct = (id, k, icon, desc) => defAct({ id, name: JOBS[k].name, icon, cat: 'job', diff: 1, anywhere: true, where: JOBS[k].where || 'see Jobs', desc: desc || JOBS[k].desc, reward: `$${JOBS[k].pay} base per task (raises every 5 shifts)`, start: () => { ACT_CUR = null; jobGo(k); }, progress: () => `${jobState(k).shifts} shifts · $${jobState(k).earned} earned` });
  jobAct('job_delivery', 'delivery', '🛵'); jobAct('job_barista', 'barista', '☕'); jobAct('job_retail', 'retail', '👕'); jobAct('job_grocer', 'grocer', '🛒');
  jobAct('job_taxi', 'taxi', '🚕'); jobAct('job_guide', 'guide', '🧭'); jobAct('job_reception', 'reception', '🛎️'); jobAct('job_mechanic', 'mechanic', '🔧'); jobAct('job_lifeguard', 'lifeguard', '🛟'); jobAct('job_photographer', 'photographer', '📸');
})();
function surfContest(pts) {
  const cur = ACT_CUR; if (!cur || cur.id !== 'surf') return; cur.waves.push(pts); const tot = cur.waves.reduce((a, b) => a + b, 0);
  toast(`Contest wave ${cur.waves.length}/3: ${pts} pts (total ${tot})`);
  if (cur.waves.length >= 3) { const win = tot >= 1500; if (win) stat('sportWins'); actComplete('surf', { score: tot, money: win ? 150 : 30, msg: `Contest total ${tot} pts${win ? ' — you won!' : ' — 1,500 to win'}` }); }
}
// ---------------------------------------------------------------- the Jobs app (the existing job system, all in one place)
function jobsApp(btn, head) {
  const S = ECON.shift;
  if (S) { head('On shift now'); btn(`${JOBS[S.job].name} · ${S.shop.name}`, `${S.done} done · $${S.earned} earned so far`, () => {}, false); btn('Finish shift', 'clock off and keep what you’ve earned', () => { endShift('You clocked off early.'); phoneApp('jobs'); }); }
  head('Jobs around the coast');
  for (const [k, J] of Object.entries(JOBS)) { const st = jobState(k), need = J.needs && J.needs(); btn(`${st.hired ? '✔ ' : ''}${J.name} · $${jobRate(k)}${k === 'taxi' ? ' + fares' : ' a task'}`, `${J.where || ''}${need ? ' · needs ' + need : ''} · ${st.shifts} shifts, $${st.earned} earned`, () => { PHONE.job = k; phoneApp('job'); }); }
  const log = actData().jobLog; head(log.length ? 'Job history' : 'No shifts worked yet');
  for (const L of log.slice(0, 8)) btn(`${JOBS[L.job] ? JOBS[L.job].name : L.job} · $${L.earned}`, `${L.good}/${L.done} done well · ${new Date(L.t).toLocaleDateString()}`, () => {}, false);
}
function jobApp(btn, head) {
  const k = PHONE.job, J = JOBS[k], st = jobState(k), need = J.needs && J.needs(), rate = jobRate(k), raise = Math.min(4, Math.floor(st.shifts / 5));
  head(J.name); btn(J.desc, `Where: ${J.where || 'see the map'}`, () => {}, false);
  btn(`Pay: $${rate}${k === 'taxi' ? ' per fare + distance' : ' per task'}`, `raise level ${raise}/4 (a raise every 5 shifts) · ${st.shifts} shifts · $${st.earned} earned`, () => {}, false);
  if (need) btn('Requirement', need, () => {}, false);
  if (!st.hired) btn('📝 Apply', need ? 'you don’t meet the requirement yet' : 'you’ll hear back straight away', () => { st.hired = true; actNote(`💼 You got the job: ${J.name}!`); saveGame(); phoneApp('job'); }, !need).classList.add('go');
  else btn(ECON.shift ? 'You’re on a shift' : '▶ Start a shift', WORLD_JOBS.includes(k) ? 'starts right where you are' : J.venue ? 'at the workplace (you’ll get directions)' : 'walk in to the nearest workplace and press E at the counter', () => jobGo(k), !ECON.shift).classList.add('go');
  btn('← All jobs', '', () => phoneApp('jobs'));
}
