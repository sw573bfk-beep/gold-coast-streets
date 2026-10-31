// ============================================================================
// Gold Coast Streets — a day in the life, and the big events.
// The week runs on: weekday rush hours fill the roads, beaches pack out on sunny weekend days, the streets go quiet
// in the small hours, and Surfers comes alive on Friday and Saturday nights (queues outside the clubs).
// Events: a cyclone (warning first, then howling wind and rain), king tides (the lowest canal streets flood), and
// Schoolies (late November, or when it comes round in the game): a party zone on the Surfers beachfront.
// ============================================================================
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LIFE = { day: 0, last: 0, dow0: new Date().getDay(), beach: [], queue: [], party: [], ev: null, flood: [], floodLv: 0, gust: 0, wind: 0, evT: 60 };
const dow = () => (LIFE.dow0 + LIFE.day) % 7, weekend = () => dow() === 0 || dow() === 6;
const partyNight = () => (dow() === 5 || dow() === 6) && (gameHour >= 20 || gameHour < 3) || (dow() === 6 || dow() === 0) && gameHour < 3;
function crowdFactor() { // people on the streets by hour and day
  const h = gameHour; let f = h < 5 ? 0.25 : h < 7 ? 0.5 : h < 9 ? 1.1 : h < 16 ? 1 : h < 19 ? 1.15 : h < 22 ? 0.85 : 0.45;
  if (partyNight() && inCore(player.x, player.z)) f = 1.5; // Surfers on a Friday or Saturday night
  if (weekend() && h > 9 && h < 17) f *= 1.15;
  if (LIFE.ev && LIFE.ev.kind === 'cyclone' && LIFE.ev.phase === 'on') f *= 0.25; // everyone's indoors
  return f;
}
function trafficTarget() { const h = gameHour, rush = !weekend() && ((h > 7 && h < 9.5) || (h > 15.5 && h < 18.5)); return Math.round(40 * (h < 5 ? 0.35 : h < 6.5 ? 0.6 : rush ? 1.3 : h > 21 ? 0.6 : 1) * (LIFE.ev && LIFE.ev.kind === 'cyclone' && LIFE.ev.phase === 'on' ? 0.3 : 1)); }
function lifeClock() { return `${DAYS[dow()]} `; }
// ---------------------------------------------------------------- beachgoers, swimmers, club queues
function clearStatics(list) { for (const p of list) { scene.remove(p.root); if (p.towel) { scene.remove(p.towel); p.towel.geometry.dispose(); p.towel.material.dispose(); } disposePerson(p); } list.length = 0; }
let lifeT = 0;
function updateLifeCrowds() {
  const sunny = WEATHER.rain < 0.3 && gameHour > 8 && gameHour < 17.5, B = BEACHES.find((b) => Math.hypot(b[1] - player.x, b[2] - player.z) < 400);
  const want = !B || !sunny ? 0 : (weekend() ? 26 : 12);
  if (LIFE.beach.length && (!B || LIFE.beach.b !== B[0] || want === 0)) clearStatics(LIFE.beach);
  if (B && want && LIFE.beach.length < want) {
    LIFE.beach.b = B[0]; const S = nearestShore(B[1], B[2]);
    for (let k = 0; k < 30 && LIFE.beach.length < want; k++) {
      const along = rr(-180, 180), out = rr(-45, 30), x = S.px + S.tx * along + S.nx * out, z = S.pz + S.tz * along + S.nz * out, swim = out > 4;
      if (!swim && !onBeachSand(x, z) && !onBeach(x, z)) continue;
      const p = makePerson({ shirt: pick(['#ff6f4f', '#35c6cf', '#f2c542', '#e85a9a', '#ffffff']), singlet: true }); scene.add(p.root);
      if (swim) { p.root.position.set(x, WATER_Y - 1.1, z); p.swim = true; }
      else if (rand() < 0.6) { p.root.rotation.set(-Math.PI / 2, rand() * TAU, 0, 'YXZ'); p.root.position.set(x, standAt(x, z) + 0.12, z); const tg = new THREE.PlaneGeometry(0.9, 1.9); tg.rotateX(-Math.PI / 2); p.towel = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: col(pick(['#ff2d55', '#00b3c6', '#ffd400', '#7cff00', '#b84dff'])), roughness: 0.9 })); p.towel.position.set(x, standAt(x, z) + 0.02, z); p.towel.rotation.y = p.root.rotation.y; scene.add(p.towel); }
      else { p.root.position.set(x, standAt(x, z), z); p.root.rotation.y = rand() * TAU; }
      p.x = x; p.z = z; p.ph = rand() * 10; LIFE.beach.push(p);
    }
  }
  // queues outside the clubs on party nights
  const clubs = partyNight() ? SHOPS.filter((s) => s.kind === 'club' && Math.hypot(s.x - player.x, s.z - player.z) < 220).slice(0, 3) : [];
  if (!clubs.length && LIFE.queue.length) clearStatics(LIFE.queue);
  if (clubs.length && !LIFE.queue.length) for (const s of clubs) { const nx = s.nx || 1, nz = s.nz || 0; for (let k = 0; k < 7; k++) { const p = makePerson(k === 0 ? { shirt: '#111111' } : {}); const x = s.x + nx * 2 - nz * (k * 0.8 + 1.5), z = s.z + nz * 2 + nx * (k * 0.8 + 1.5); p.root.position.set(x, standAt(x, z), z); p.root.rotation.y = Math.atan2(nz, nx) + Math.PI / 2; scene.add(p.root); p.x = x; p.z = z; p.ph = k; LIFE.queue.push(p); } }
}
// ---------------------------------------------------------------- events
function startEvent(kind) {
  if (LIFE.ev) endEvent();
  if (kind === 'cyclone') { LIFE.ev = { kind, phase: 'warning', t: 90 }; actNote('🌀 CYCLONE WARNING: a tropical cyclone is crossing the coast — get somewhere safe'); sfxTone([880, 660, 880, 660, 880], 1.2, 0.07, 'square'); }
  if (kind === 'kingtide') { LIFE.ev = { kind, phase: 'rising', t: 300 }; actNote('🌊 King tide: low-lying streets near the canals will flood over the next few minutes'); }
  if (kind === 'schoolies') { LIFE.ev = { kind, phase: 'on', t: 900 }; actNote('🎉 Schoolies is on! The Surfers beachfront party zone is open (Activities → Schoolies beach concert)'); }
}
function endEvent() {
  const E = LIFE.ev; if (!E) return; LIFE.ev = null;
  if (E.kind === 'cyclone') { setWeather('cloudy', false); actNote('The cyclone has passed. Clean-up crews are out.', true); }
  if (E.kind === 'kingtide') { LIFE.floodLv = 0; buildFlood(); }
  if (E.kind === 'schoolies') clearStatics(LIFE.party), LIFE.stage && (scene.remove(LIFE.stage), LIFE.stage = null);
}
const schooliesSeason = () => { const d = new Date(); return d.getMonth() === 10 && d.getDate() >= 20 || d.getMonth() === 11 && d.getDate() <= 1; };
// the flood: water sitting over every patch of ground lower than the tide, tile by tile (never over the Surfers core)
function buildFlood() {
  for (const m of LIFE.flood) { scene.remove(m); m.geometry.dispose(); } LIFE.flood.length = 0;
  const lv = LIFE.floodLv; if (lv <= 0.02) return;
  for (const T of TILES.values()) {
    if (!T.hgt || Math.hypot(T.x0 + 500 - player.x, T.z0 + 500 - player.z) > 1600) continue;
    const N = T.hn, st = T.hs, pos = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const k = j * N + i; if (Math.min(T.hgt[k], T.hgt[k + 1], T.hgt[k + N], T.hgt[k + N + 1]) >= lv) continue;
      const x = T.x0 + i * st, z = T.z0 + j * st; if (inCore(x, z) || !isLand(x + st / 2, z + st / 2)) continue;
      pos.push(x, lv, z, x, lv, z + st, x + st, lv, z, x + st, lv, z, x, lv, z + st, x + st, lv, z + st);
    }
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, FLOOD_MAT); scene.add(m); LIFE.flood.push(m);
  }
}
const FLOOD_MAT = new THREE.MeshStandardMaterial({ color: col('#5e6447'), transparent: true, opacity: 0.86, roughness: 0.15, metalness: 0.2, depthWrite: false });
function flooded(x, z) { return LIFE.floodLv > 0.02 && !inCore(x, z) && groundBase(x, z) < LIFE.floodLv - 0.04; }
function buildStage() { // the Schoolies stage on the sand by Cavill Avenue
  const S = nearestShore(848, 306), x = S.px - S.nx * 30, z = S.pz - S.nz * 30, g = new THREE.Group();
  const add = (w, h, d, px, py, pz, c, e) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: col(c), emissive: col(e || '#000'), emissiveIntensity: e ? 1 : 0 })); o.position.set(px, py, pz); g.add(o); return o; };
  add(14, 1.2, 8, 0, 0.6, 0, '#1d1d1d'); add(14, 0.4, 0.6, 0, 7, -3.6, '#333'); for (const s of [-1, 1]) add(0.4, 7, 0.4, s * 6.8, 3.5, -3.6, '#333'); add(10, 3, 0.2, 0, 4.2, -3.8, '#111', '#b84dff');
  g.position.set(x, standAt(x, z), z); g.rotation.y = Math.atan2(-S.nx, -S.nz); scene.add(g); LIFE.stage = g; LIFE.stageAt = { x, z };
}
function updateLife(dt) {
  if (gameHour < LIFE.last - 12) { LIFE.day++; if (dow() === 1) actNote(`📅 A new week — ${DAYS[dow()]}`, true); } LIFE.last = gameHour;
  lifeT -= dt; if (lifeT <= 0) { lifeT = 2; updateLifeCrowds(); }
  for (const p of LIFE.beach) if (p.swim) { p.ph += dt; p.root.position.y = WATER_Y - 1.1 + Math.sin(p.ph * 2) * 0.1; p.armL.rotation.x = -2 + Math.sin(p.ph * 3) * 0.8; p.armR.rotation.x = -2 - Math.sin(p.ph * 3) * 0.8; }
  for (const p of LIFE.queue) { p.ph += dt; p.root.rotation.z = Math.sin(p.ph * 1.3) * 0.03; }
  // events: one now and then (single player picks them on the phone too)
  LIFE.evT -= dt;
  if (!LIFE.ev && LIFE.evT <= 0) { LIFE.evT = 600 + rand() * 900; const r = rand(); if (schooliesSeason() && r < 0.5) startEvent('schoolies'); else if (r < 0.12) startEvent('cyclone'); else if (r < 0.3) startEvent('kingtide'); else if (r < 0.36) startEvent('schoolies'); }
  const E = LIFE.ev; if (!E) return; E.t -= dt;
  if (E.kind === 'cyclone') {
    if (E.phase === 'warning') { if (E.t <= 0) { E.phase = 'on'; E.t = 240; setWeather('storm', true); WEATHER.nextT = 999; LIFE.wind = rand() * TAU; actNote('🌀 The cyclone has hit — destructive winds!'); } }
    else {
      LIFE.gust = Math.max(0, Math.sin(elapsed * 0.7) * 0.6 + Math.sin(elapsed * 2.3) * 0.4) * 9; const wx = Math.cos(LIFE.wind), wz = Math.sin(LIFE.wind);
      const c = player.state === 'car' && player.car; if (c && !c.air) { c.vx += wx * LIFE.gust * 0.35 * dt; c.vz += wz * LIFE.gust * 0.35 * dt; }
      if (player.state === 'foot' && !indoorAt(player.x, player.z)) { player.x += wx * LIFE.gust * 0.08 * dt; player.z += wz * LIFE.gust * 0.08 * dt; }
      if (rand() < dt * 25) emit(player.x - wx * 30 + rr(-20, 20), rr(0.5, 8), player.z - wz * 30 + rr(-20, 20), wx * 18, rr(0, 2), wz * 18, 0.2, 0.15, 0.08, pick(['#6b4a2b', '#3d6b2e', '#9a9a96']), 1); // leaves and junk on the wind
      TREE_WIND.value = elapsed * 3.5;
      if (E.t <= 0) endEvent();
    }
  } else if (E.kind === 'kingtide') {
    const target = E.phase === 'rising' ? 0.26 : 0; if (E.t <= 150 && E.phase === 'rising') E.phase = 'falling';
    const lv = clamp(target === 0.26 ? (300 - E.t) / 150 * 0.26 : E.t / 150 * 0.26, 0, 0.26);
    if (Math.abs(lv - LIFE.floodLv) > 0.03 || (lifeT > 1.9 && LIFE.flood.length === 0 && lv > 0.05)) { LIFE.floodLv = lv; buildFlood(); }
    const c = player.state === 'car' && player.car; if (c && flooded(c.x, c.z)) { const k = Math.exp(-0.9 * dt); c.vx *= k; c.vz *= k; if (c.speed > 4 && rand() < dt * 30) emit(c.x + rr(-1, 1), 0.3, c.z + rr(-1, 1), rr(-2, 2), rr(2, 4), rr(-2, 2), 0.4, 0.25, 0.1, '#cfe3ee', 1); }
    if (E.t <= 0) endEvent();
  } else if (E.kind === 'schoolies') {
    const near = Math.hypot(848 - player.x, 306 - player.z) < 500;
    if (near && !LIFE.stage) buildStage();
    if (near && LIFE.party.length < 30) { const S = LIFE.stageAt; for (let k = 0; k < 30; k++) { const p = makePerson({ shirt: pick(['#ff6f4f', '#35c6cf', '#f2c542', '#e85a9a', '#7fd36b']), singlet: rand() < 0.6, cap: rand() < 0.3 ? '#111' : undefined }); const x = S.x + rr(-14, 14), z = S.z + rr(-6, 18); p.root.position.set(x, standAt(x, z), z); p.root.rotation.y = rand() * TAU; scene.add(p.root); p.ph = rand() * 10; LIFE.party.push(p); } }
    for (const p of LIFE.party) { p.ph += dt * (nightLevel > 0.4 ? 5 : 1.5); p.root.position.y = standAt(p.root.position.x, p.root.position.z) + Math.abs(Math.sin(p.ph)) * (nightLevel > 0.4 ? 0.25 : 0.05); p.armL.rotation.x = p.armR.rotation.x = nightLevel > 0.4 ? -2.6 + Math.sin(p.ph) * 0.4 : 0; } // jumping at the gig after dark
    if (E.t <= 0 && !schooliesSeason()) endEvent(); else if (E.t <= 0) E.t = 900;
  }
}
function eventsApp(btn, head) {
  const E = LIFE.ev; head(E ? { cyclone: '🌀 Cyclone', kingtide: '🌊 King tide', schoolies: '🎉 Schoolies' }[E.kind] + (E.phase === 'warning' ? ' — warning' : ' — happening now') : 'No events right now');
  head(`${DAYS[dow()]} · ${weekend() ? 'the weekend' : 'a weekday'}${partyNight() ? ' · party night in Surfers' : ''}`);
  if (MODE === 'multi') { btn('Events come and go on their own online', '', () => {}, false); return; }
  btn('🌀 Start a cyclone', 'a warning, then destructive winds for four minutes', () => { startEvent('cyclone'); closePhone(); });
  btn('🌊 Start a king tide', 'the lowest canal streets flood, then drain', () => { startEvent('kingtide'); closePhone(); });
  btn('🎉 Start Schoolies', 'the Surfers beachfront party (it also runs in late November)', () => { startEvent('schoolies'); closePhone(); });
  if (E) btn('End the current event', '', () => { endEvent(); phoneApp('events'); });
}
defAct({ id: 'schoolies', name: 'Schoolies beach concert', icon: '🎉', cat: 'fun', diff: 1, at: () => (LIFE.stageAt ? { name: 'Schoolies stage, Surfers beachfront', x: LIFE.stageAt.x, z: LIFE.stageAt.z } : { name: 'Surfers Paradise beachfront', x: 820, z: 306 }), range: 80, desc: 'During Schoolies (late November, or when the event comes round) the stage on the Surfers sand runs gigs: get up and play the set.', reward: 'tips from the crowd', req: () => (LIFE.ev && LIFE.ev.kind === 'schoolies' ? null : 'Schoolies isn’t on right now (phone → Events)'), start: () => playBusk('schoolies', 'Schoolies beach concert') });
