// ============================================================================
// Gold Coast Streets — the racing league and night car meets.
// League: three street circuits laid out on the real roads (Surfers Paradise, Southport, Robina), three laps each
// against five AI rivals who drive the circuit at their own pace (they follow the road, and you can bump them).
// Points 25-18-15-12-10-8; win the season for the trophy and $5,000. Prize money every race.
// Car meets: after dark in Bundall, the street machine crowd parks up with neon on. Show off your car (mods count),
// or line up a 400 m drag race against one of them.
// ============================================================================
const LEAGUE = [
  { name: 'Surfers Paradise Street Circuit', at: ['Surfers Paradise', /^Surfers Paradise Surf Life/i, 742, 403], r: 420, pace: 21 },
  { name: 'Southport Circuit', at: ['Southport', /^Australia Fair Shopping Centre/i, -735, -3470], r: 480, pace: 23 },
  { name: 'Robina Night Sprint', at: ['Robina', /^Robina Town Centre$/i, -3704, 8614], r: 520, pace: 25 },
];
const RIVALS = [['Jayden “Sideways” Cole', 'tuner'], ['Mia Tran', 'sports'], ['Big Kev', 'muscle'], ['Ash Patel', 'widebody'], ['Sienna Ruiz', 'coupe']];
const POINTS = [25, 18, 15, 12, 10, 8];
// shortest road route between two points, as a polyline (Dijkstra over the loaded street network)
function roadRoute(ax, az, bx, bz) {
  const s = nearestEdge(ax, az), t = nearestEdge(bx, bz); if (s.e < 0 || t.e < 0) return null;
  const from = EDGES[s.e].a, to = EDGES[t.e].b, dist = new Map([[from, 0]]), prev = new Map(), open = [[0, from]];
  while (open.length) {
    open.sort((p, q) => p[0] - q[0]); const [d, u] = open.shift(); if (u === to) break; if (d > (dist.get(u) ?? 1e18) || d > 6000) continue;
    for (const o of PADJ.get(u) || []) { const E = EDGES[o.e]; if (!E || E.gps) continue; const v = o.dir > 0 ? E.b : E.a, nd = d + E.len; if (nd < (dist.get(v) ?? 1e18)) { dist.set(v, nd); prev.set(v, o); open.push([nd, v]); } }
  }
  if (!prev.has(to)) return null;
  const legs = []; for (let v = to; v !== from;) { const o = prev.get(v); legs.unshift(o); const E = EDGES[o.e]; v = o.dir > 0 ? E.a : E.b; }
  const pts = []; for (const o of legs) { const p = EDGES[o.e].p, n = p.length / 2; for (let k = 0; k < n; k++) { const i = o.dir > 0 ? k : n - 1 - k; pts.push([p[2 * i], p[2 * i + 1]]); } }
  return pts;
}
function polyLen(P) { const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return cum; }
function polyAt(P, cum, s) { const L = cum[cum.length - 1]; s = ((s % L) + L) % L; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), a = P[i - 1], b = P[i]; return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, h: Math.atan2(b[0] - a[0], b[1] - a[1]) }; }
// a closed circuit: four points round the centre joined up along the roads
function buildCircuit(cx, cz, r) {
  const W = [0, 1, 2, 3].map((k) => { const a = k / 4 * TAU + 0.4, ne = nearestEdge(cx + Math.cos(a) * r, cz + Math.sin(a) * r, (E) => E.type <= RT.tertiary); if (ne.e < 0) return null; const P = {}; edgePoint(EDGES[ne.e], 1, ne.s, P); return [P.x, P.z]; });
  if (W.some((w) => !w)) return null;
  let P = []; for (let k = 0; k < 4; k++) { const leg = roadRoute(W[k][0], W[k][1], W[(k + 1) % 4][0], W[(k + 1) % 4][1]); if (!leg) return null; P = P.concat(leg); }
  const D = [P[0]]; for (const q of P) if (Math.hypot(q[0] - D[D.length - 1][0], q[1] - D[D.length - 1][1]) > 3) D.push(q); // drop doubled points
  return D.length > 10 ? D : null;
}
let RACE = null;
function startLeagueRace(cur, ev) {
  const E = LEAGUE[ev], V = venue(E.at[0], E.at[1], E.at[2], E.at[3]);
  const P = buildCircuit(V.x, V.z, E.r); if (!P) return actFail(cur.id, 'Couldn’t lay out the circuit from here — head to the start and try again');
  const cum = polyLen(P), L = cum[cum.length - 1]; if (L < 1200 || L > 7000) return actFail(cur.id, 'That circuit came out odd — try again');
  // your car on the grid (yours if you're in one, otherwise a loaner)
  const start = polyAt(P, cum, 0);
  if (!(player.state === 'car' && player.car && !player.car.spec.bike)) { const c = new Car('sports', '#f6c445', start.x, start.z, start.h); c.kind = 'abandoned'; cars.push(c); player.x = c.x; player.z = c.z; player.car = c; player.state = 'car'; player.mode = 'car'; c.setDriver('player', player.look); player.model.root.visible = false; RACE_LOANER.c = c; }
  const me = player.car; me.x = start.x; me.z = start.z; me.h = start.h; me.vx = me.vz = 0;
  const rivals = RIVALS.map(([name, type], k) => { const M = makeCarModel(type, pick(CAR_COLORS)); scene.add(M.root); if (CAR_TYPES[type].livery) addLivery(M, CAR_TYPES[type], k * 977 + ev); const lap = L / (E.pace * (0.9 + k * 0.035 + rand() * 0.04)); return { name, M, s: -12 - k * 9, lapT: lap, v: 0, laps: 0, done: false, finish: 0 }; });
  RACE = { cur, ev, E, P, cum, L, laps: 3, cp: Math.max(8, Math.round(L / 140)), next: 1, lap: 1, t: -3, rivals, place: 0, done: false };
  RACE.checkpoints = Array.from({ length: RACE.cp }, (_, k) => polyAt(P, cum, (k / RACE.cp) * L));
  courseRing().visible = true; toast(`${E.name}: 3 laps, ${(L / 1000).toFixed(1)} km a lap · 3…`); sfxTone([440], 0.2, 0.06);
}
const RACE_LOANER = { c: null };
function raceProgress() { return RACE.lap * 1000 + RACE.next; }
function updateRace(dt) {
  const R = RACE; if (!R) return; const me = player.car;
  if (!me || player.state !== 'car' || player.deadT > 0) return endRace(false, 'You left the car — race over');
  const before = R.t; R.t += dt;
  if (before < 0) { if (Math.ceil(before) !== Math.ceil(R.t)) { toast(R.t >= 0 ? 'GO!' : `${-Math.floor(R.t)}…`); sfxTone([R.t >= 0 ? 880 : 440], 0.2, 0.06); } me.vx *= 0.5; me.vz *= 0.5; }
  // rivals: follow the road, slow for corners, a little faster as the laps go on
  for (const r of R.rivals) {
    if (r.done) continue;
    const ahead = polyAt(R.P, R.cum, r.s + 25), here = polyAt(R.P, R.cum, r.s), bend = Math.abs(angDiff(ahead.h, here.h));
    const vt = R.t < 0 ? 0 : (R.L / r.lapT) * clamp(1.25 - bend * 0.9, 0.45, 1.3);
    r.v += clamp(vt - r.v, -9 * dt, 4 * dt); r.s += r.v * dt;
    if (Math.hypot(here.x - me.x, here.z - me.z) < 3) { const k = 0.6; me.vx *= k; me.vz *= k; r.v *= 0.8; } // a bump
    const q = polyAt(R.P, R.cum, r.s); r.M.root.position.set(q.x, standAt(q.x, q.z), q.z); r.M.root.rotation.set(0, q.h, 0); for (const w of r.M.wheels) w.m.rotation.x += r.v * dt / 0.33;
    if (r.s >= R.L * R.laps && !r.done) { r.done = true; r.finish = R.t; }
  }
  // you: through each checkpoint in order
  const C = R.checkpoints[R.next % R.cp], ring = courseRing(); ring.position.set(C.x, standAt(C.x, C.z) + 3.2, C.z); ring.rotation.y = C.h;
  goal(`${R.E.name} · checkpoint`, C.x, C.z);
  if (Math.hypot(C.x - me.x, C.z - me.z) < 14 && R.t > 0) {
    R.next++; sfxTone([700], 0.05, 0.04);
    if (R.next % R.cp === 1 && R.next > 1) { R.lap++; if (R.lap > R.laps) return endRace(true); toast(`Lap ${R.lap}/${R.laps}`); }
  }
  const myS = ((R.lap - 1) * R.cp + (R.next - 1)) / R.cp * R.L, place = 1 + R.rivals.filter((r) => (r.done ? R.L * R.laps + 1 : r.s) > myS).length; R.place = place;
  $('jobhud').hidden = false; $('jobhud').textContent = `🏁 ${R.E.name} · lap ${Math.min(R.lap, R.laps)}/${R.laps} · P${place} of 6 · ${fmtTime(Math.max(0, R.t))}`;
}
function endRace(finished, msg) {
  const R = RACE; if (!R) return; RACE = null; courseRing().visible = false; WAYPOINT = null; clearGPS(); $('jobhud').hidden = true;
  for (const r of R.rivals) { scene.remove(r.M.root); disposeCarModel(r.M); }
  if (RACE_LOANER.c && player.car !== RACE_LOANER.c) { RACE_LOANER.c.remove(); RACE_LOANER.c = null; }
  if (!finished) return actFail(R.cur.id, msg);
  const place = 1 + R.rivals.filter((r) => r.done && r.finish < R.t).length, pts = POINTS[place - 1] || 0, prize = [1500, 800, 400, 200, 100, 50][place - 1];
  const L = actData(); L.league = L.league || { round: 0, pts: 0, results: [] }; L.league.results[R.ev] = place; L.league.pts += pts; L.league.round = Math.max(L.league.round, R.ev + 1);
  let extra = ''; if (L.league.round >= LEAGUE.length && !L.league.champ) { const champ = L.league.results.every((p) => p <= 2) || L.league.pts >= 60; if (champ) { L.league.champ = true; player.money += 5000; collect('trophies', 'League champion'); extra = ' · 🏆 LEAGUE CHAMPION! +$5,000'; } else extra = ` · season over: ${L.league.pts} points`; }
  if (place === 1) { stat('sportWins'); collect('trophies', R.E.name + ' winner'); }
  actComplete(R.cur.id, { score: Math.round(R.t * 10) / 10, money: prize, msg: `${R.E.name}: P${place} in ${fmtTime(R.t)} · ${pts} points${extra}` });
}
// ---------------------------------------------------------------- car meets (after dark, Bundall)
const MEET = { cars: [], people: [], on: false };
function meetSpot() { const V = venue('Bundall car meet', /^Bundall$/i, -1200, 300); return V; }
function updateMeet(dt) {
  const night = gameHour >= 19 || gameHour < 3, V = meetSpot(), d = Math.hypot(V.x - player.x, V.z - player.z);
  if (night && d < 350 && !MEET.on) {
    MEET.on = true; const S = freeSpotNear(V.x, V.z, 80) || [V.x, V.z];
    for (let k = 0; k < 7; k++) { const x = S[0] + (k % 4) * 5.5 - 8, z = S[1] + Math.floor(k / 4) * 9; if (resolveCircle(x, z, 2)) continue; const t = pick(['tuner', 'widebody', 'dragster', 'sports', 'muscle']); const c = new Car(t, pick(MOD_PAINT), x, z, Math.PI / 2 * (k % 2 ? 1 : -1)); c.kind = 'parked'; c.story = true; c.mods = { neon: pick(['Cyan', 'Pink', 'Green', 'Purple']), lower: 0.05, wheels: pick(['Chrome', 'Black', 'Gold']) }; applyMods(c); cars.push(c); MEET.cars.push(c); }
    for (let k = 0; k < 8; k++) { const p = makePerson({}); const x = S[0] + rr(-10, 12), z = S[1] + rr(-4, 12); p.root.position.set(x, standAt(x, z), z); p.root.rotation.y = rand() * TAU; scene.add(p.root); MEET.people.push(p); }
    MEET.x = S[0]; MEET.z = S[1];
  } else if ((!night || d > 500) && MEET.on) { MEET.on = false; for (const c of MEET.cars) if (player.car !== c) { c.story = false; c.remove(); } for (const p of MEET.people) disposePerson(p); MEET.cars = []; MEET.people = []; }
  if (MEET.on) for (const [k, p] of MEET.people.entries()) p.armR.rotation.x = Math.sin(elapsed * 3 + k) * 0.3 - 0.3; // chatting, pointing at engines
}
function openMeet(cur) {
  const body = agOpen('Car meet — Bundall', MEET.on ? 'The street machine crowd. Show off your ride, or line up a drag race.' : 'Nobody’s here yet — meets start after 7 pm.'); const gen = AG.gen;
  if (!MEET.on) { agBtn(body, 'OK', closeShop); return actFail(cur.id, 'Come back after dark'); }
  const c = player.car && Math.hypot(player.car.x - player.x, player.car.z - player.z) < 40 ? player.car : modShopCar();
  agBtn(body, '😎 Show off your car', () => {
    if (!c) { toast('Bring a car'); return; } const m = carMods(c); let score = Math.round(c.spec.max * 1.2 + (m.tune ? 25 : 0) + (m.neon ? 20 : 0) + (m.livery || c.spec.livery ? 20 : 0) + (m.wheels ? 12 : 0) + (m.lower ? 10 : 0) + rr(-8, 8));
    const crowd = Math.round(rr(70, 120)); const win = score > crowd; agResult(cur.id, { complete: true, win, score, money: win ? 150 + score : 30, msg: `Your ${CAR_LABEL[c.type] || c.type} scored ${score} with the crowd (the best of the rest: ${crowd})${win ? ' — car of the night!' : ''}` });
  }, true);
  agBtn(body, '🏁 Drag race (400 m, $200 on it)', () => { if (!c || player.state !== 'car') { toast('Get in your car first'); return; } if (!pay(200, 'the bet')) return; closeShop(); startDrag(cur, gen); }, true);
}
let DRAG = null;
function startDrag(cur) {
  const E0 = LIVE_EDGES.map((i) => EDGES[i]).filter((E) => E && !E.gps && E.len > 430 && Math.hypot(E.p[0] - E.p[E.p.length - 2], E.p[1] - E.p[E.p.length - 1]) > E.len * 0.97).sort((a, b) => Math.hypot(a.p[0] - player.x, a.p[1] - player.z) - Math.hypot(b.p[0] - player.x, b.p[1] - player.z))[0];
  if (!E0) { player.money += 200; return actFail(cur.id, 'No straight road long enough nearby — bet refunded'); }
  const A = {}, B = {}; edgePoint(E0, 1, 10, A); edgePoint(E0, 1, 410, B); const me = player.car, h = Math.atan2(A.tx, A.tz), ox = A.tz * 2.2, oz = -A.tx * 2.2;
  me.x = A.x - ox; me.z = A.z - oz; me.h = h; me.vx = me.vz = 0;
  const type = pick(['tuner', 'widebody', 'dragster', 'muscle']), sp = CAR_TYPES[type], M = makeCarModel(type, pick(MOD_PAINT)); scene.add(M.root); if (sp.livery) addLivery(M, sp, 4242);
  DRAG = { cur, E: A, B, h, ox, oz, s: 0, v: 0, sp, M, t: -3, react: 0.18 + rand() * 0.25, done: false, start: { x: me.x, z: me.z } };
  goal('Finish line', B.x, B.z); courseRing().visible = true; toast(`Drag race vs a ${CAR_LABEL[type]} · 3…`);
}
function updateDrag(dt) {
  const D = DRAG; if (!D) return; const me = player.car; const before = D.t; D.t += dt;
  if (!me || player.state !== 'car') { DRAG = null; scene.remove(D.M.root); disposeCarModel(D.M); courseRing().visible = false; return actFail(D.cur.id, 'You got out — race forfeited'); }
  if (before < 0) { if (Math.ceil(before) !== Math.ceil(D.t)) { toast(D.t >= 0 ? 'GO!' : `${-Math.floor(D.t)}…`); sfxTone([D.t >= 0 ? 880 : 440], 0.2, 0.06); } me.vx = me.vz = 0; }
  if (D.t > D.react) { D.v += D.sp.accel * 1.05 * Math.max(0.08, 1 - D.v / D.sp.max) * dt; D.s += D.v * dt; }
  const fx = Math.sin(D.h), fz = Math.cos(D.h); D.M.root.position.set(D.E.x + D.ox + fx * D.s, standAt(D.E.x, D.E.z), D.E.z + D.oz + fz * D.s); D.M.root.rotation.set(0, D.h, 0);
  courseRing().position.set(D.B.x, standAt(D.B.x, D.B.z) + 3.2, D.B.z); courseRing().rotation.y = D.h;
  const mine = (me.x - D.start.x) * fx + (me.z - D.start.z) * fz;
  $('jobhud').hidden = false; $('jobhud').textContent = `🏁 Drag race · you ${Math.max(0, Math.round(mine))} m · them ${Math.round(D.s)} m of 400 · ${Math.max(0, D.t).toFixed(2)} s`;
  if (mine >= 400 || D.s >= 400) {
    const win = mine >= 400 && (D.s < 400 || mine - 400 > D.s - 400); DRAG = null; scene.remove(D.M.root); disposeCarModel(D.M); courseRing().visible = false; WAYPOINT = null; clearGPS(); $('jobhud').hidden = true;
    if (win) { stat('sportWins'); actComplete(D.cur.id, { score: Math.round(D.t * 100) / 100, money: 400, msg: `You won the drag race in ${D.t.toFixed(2)} s · +$400` }); } else actFail(D.cur.id, `Beaten to the line (${D.t.toFixed(2)} s) — they keep your $200`);
  }
}
// ---------------------------------------------------------------- the new activities (they join the list on the phone)
(function moreActivities() {
  const V = (n, re, x, z) => () => venue(n, re, x, z), course = { tick: courseTick, quit: courseQuit, unit: 's', low: true, fmt: (v) => fmtTime(v) };
  const dealer = () => { const d = nearest(SHOPS.filter((q) => q.kind === 'cars')); return d ? { name: d.name, x: d.x, z: d.z } : { name: 'a car dealership', x: player.x, z: player.z }; };
  defAct({ id: 'modshop', name: 'Mod shop', icon: '🔧', cat: 'fun', diff: 1, at: dealer, desc: 'Paint, decals, chrome or gold wheels, lowered suspension, neon underglow and an engine tune — at any car dealership.', reward: 'a car that turns heads (counts at car meets)', start: () => { ACT_CUR = null; openModShop(); } });
  defAct({ id: 'pet', name: 'Play fetch with your dog', icon: '🐶', cat: 'explore', diff: 1, anywhere: true, where: 'adopt a dog at any pet shop first', needs: 'a dog (pet shops, $350)', desc: 'Throw the ball and your dog brings it back. Adopt one at a pet shop; phone → Pet for sit, come and fetch.', reward: 'a happy dog', req: () => (ECON.pet ? null : 'Adopt a dog at a pet shop first'), start: () => { ACT_CUR = null; petCommand('fetch'); } });
  defAct(Object.assign({ id: 'heliflight', name: 'Helicopter joy flight', icon: '🚁', cat: 'explore', diff: 2, at: V('Sea World Helicopters', /^Sea World$/i, 50, -4294), range: 120, desc: 'Take the chopper from the Sea World pad up the coast: through the rings over Main Beach, past Q1 and along Surfers, then back to land on the pad.', reward: '$150',
    start: (cur) => { const pad = CHOPPERS.find((c) => c.pad === 'Sea World Helicopters') || (() => { const w = actWhere(ACT_BY.heliflight), s = freeSpotNear(w.x + 60, w.z + 40, 60) || [w.x, w.z]; const c = new Chopper(s[0], s[1], 0, 'Sea World Helicopters'); c.pad = 'Sea World Helicopters'; return c; })(); boardChopper(pad);
      startCourse(cur, { mode: 'heli', alt: 70, pts: [[300, -3200], [650, -1500], [606, 753], [900, 1800], [500, 3640], [pad.x, pad.z]], reward: 150, r: 22, intro: 'Joy flight: Space to lift off, then through the rings — 70 m up', narrate: ['🏖️ Main Beach below', '🏙️ Surfers Paradise', '🗼 Q1 — 322 m to the spire', '🌊 Broadbeach', '🎰 The Star — head back to the pad'] }); } }, course));
  defAct({ id: 'helirescue', name: 'Rescue helicopter', icon: '🆘', cat: 'explore', diff: 3, at: V('Gold Coast University Hospital helipad', /^Gold Coast University Hospital$/i, -2600, -2400), range: 150, desc: 'A swimmer’s in trouble off the beach. Fly out, hover low over them for 3 seconds to winch them up, and bring them back to the hospital helipad.', reward: '$400',
    start: (cur) => { const pad = CHOPPERS.find((c) => c.pad === 'Gold Coast University Hospital helipad'); if (!pad) return actFail(cur.id, 'The chopper’s not on the pad yet — walk closer'); boardChopper(pad); const B = pick(BEACHES), Sh = nearestShore(B[1], B[2]); cur.victim = { x: Sh.px + Sh.nx * 90, z: Sh.pz + Sh.nz * 90, name: B[0] }; cur.home = { x: pad.x, z: pad.z }; cur.hold = 0; cur.phase = 'out'; goal('Swimmer in trouble', cur.victim.x, cur.victim.z); toast(`🆘 Swimmer in trouble off ${B[0]} — go!`); },
    tick: (cur, dt) => { const H = player.chopper; if (!H) return actFail(cur.id, 'You left the chopper — the rescue’s off'); const T = cur.phase === 'out' ? cur.victim : cur.home, d = Math.hypot(T.x - H.x, T.z - H.z); $('jobhud').hidden = false;
      if (cur.phase === 'out') { $('jobhud').textContent = `🆘 ${Math.round(d)} m to the swimmer · hover below 15 m to winch (${cur.hold.toFixed(1)}/3 s)`; if (d < 14 && H.y - WATER_Y < 15) { cur.hold += dt; if (cur.hold >= 3) { cur.phase = 'back'; goal('Hospital helipad', cur.home.x, cur.home.z); toast('Winched aboard! Fly them to the hospital'); sfxTone([660, 880], 0.2, 0.05); } } else cur.hold = Math.max(0, cur.hold - dt); }
      else { $('jobhud').textContent = `🆘 Back to the hospital pad · ${Math.round(d)} m`; if (d < 25 && H.ground) { WAYPOINT = null; clearGPS(); actComplete(cur.id, { score: Math.round(cur.t), money: 400, msg: `Patient delivered in ${fmtTime(cur.t)}` }); } } } });
  defAct({ id: 'stunts', name: 'Stunt park', icon: '🤸', cat: 'sport', diff: 2, at: () => (STUNT.park ? { name: 'The Spit stunt park', x: STUNT.park.x, z: STUNT.park.z } : venue('The Spit stunt park', /^The Spit Beach/i, 583, -5040)), range: 120, desc: '90 seconds on the kickers at The Spit: air time, spins and wheelies (hold Shift on a bike) all score. A motorbike is waiting if you came on foot.', reward: '$1 per 10 points', unit: 'pts',
    start: (cur) => { if (player.state !== 'car') { const P = curbNear(player.x, player.z) || { x: player.x, z: player.z, h: 0 }; const c = new Car('motorbike', '#ff2d55', P.x, P.z, P.h); c.kind = 'abandoned'; cars.push(c); startEnter(c); } cur.base = STUNT.total; toast('Stunt session: 90 seconds — hit the ramps!'); },
    tick: (cur) => { const left = 90 - cur.t, pts = STUNT.total - cur.base; $('jobhud').hidden = false; $('jobhud').textContent = `🤸 Stunt park · ${pts} pts · ${Math.max(0, Math.ceil(left))}s`; if (left <= 0) actComplete(cur.id, { score: pts, money: Math.round(pts / 10), msg: `Stunt session: ${pts} points` }); } });
  defAct({ id: 'deepsea', name: 'Deep-sea fishing charter', icon: '🐟', cat: 'water', diff: 3, at: V('Mariner’s Cove Marina', /^Mariner's Cove Marina/i, 125, -3308), range: 120, desc: 'Charter a sport-fishing boat ($120, rod included), head out through the Seaway into the ocean, stop well off the beach and press E to fish for marlin, tuna, mahi-mahi and sharks.', reward: 'the market price (big fish, big money)', unit: 'kg', fmt: (v) => v.toFixed(1) + ' kg',
    start: (cur) => { if (!pay(120, 'the charter')) return actFail(cur.id, 'The charter is $120'); player.items.rod = Math.max(1, player.items.rod || 0); const w = actWhere(ACT_BY.deepsea), s = nearWater(w.x, w.z, 300); if (!s) return actFail(cur.id, 'No boat ramp water here'); const b = new Boat('fisher', s[0], s[1], 0); player.x = s[0]; player.z = s[1]; boardBoat(b); ACT_CUR = null; goal('The Seaway (out to the ocean)', 650, -5900); toast('Out through the Seaway at the north end of The Spit, then stop 300 m+ off the beach and press E to fish'); } });
  defAct({ id: 'league', name: 'Racing league', icon: '🏆', cat: 'sport', diff: 3, at: () => { const r = ((actData().league || {}).round || 0) % LEAGUE.length, E = LEAGUE[r]; return venue(E.at[0], E.at[1], E.at[2], E.at[3]); }, range: 200, desc: 'Three street circuits on the real roads — Surfers Paradise, Southport and Robina — three laps each against five AI rivals. Points every race, a trophy for the champion.', reward: 'up to $1,500 a race, $5,000 for the title', progress: () => { const L = actData().league; return L ? `${L.round}/3 rounds · ${L.pts} pts${L.champ ? ' · champion' : ''}` : 'season not started'; },
    start: (cur) => startLeagueRace(cur, ((actData().league || {}).round || 0) % LEAGUE.length), tick: () => {}, quit: () => endRace(false, 'Race abandoned') });
  defAct({ id: 'carmeet', name: 'Night car meet', icon: '🌃', cat: 'fun', diff: 1, at: () => (MEET.on ? { name: 'Bundall car meet', x: MEET.x, z: MEET.z } : meetSpot()), range: 80, desc: 'After 7 pm the street machine crowd parks up in Bundall with the neon on. Show off your car (mods count) or put $200 on a 400 m drag race.', reward: 'up to $400', req: () => (gameHour >= 19 || gameHour < 3 ? null : 'Car meets start after 7 pm (phone → Weather to skip ahead)'), start: (cur) => openMeet(cur) });
})();
