// Gold Coast Streets — contracts (phone → Contracts). Tash (made up) runs a fixer agency and always has a job lined up
// for you: accept it, do it, get paid, and the next one is assigned straight away, so the work never runs out. Each one
// is made up on the spot around wherever you are, from a dozen kinds (parcels, car drop-offs, rush runs, base jumps,
// losing the cops, catching a bag snatcher, stunts, fly-overs, boat runs, fishing, surfing, scouting), says in one line
// what to do, and pays more as your contractor level goes up (a level every 4 contracts done).

const CON = { offer: null, cur: null, beacon: null, last: '', hudT: 0 };
function conData() { const A = actData(); return A.con || (A.con = { done: 0, earned: 0, failed: 0, best: 0 }); }
const conLevel = () => 1 + Math.floor(conData().done / 4);
const conPay = (base) => Math.round(base * (1 + (conLevel() - 1) * 0.2) / 10) * 10;
const conDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const here = () => ({ x: player.x, z: player.z });
function conPlaces(kinds, minD, maxD, from) { const o = from || here(); return (REGION && REGION.search ? REGION.search : []).filter((e) => kinds.includes(e[1]) && isLand(e[2], e[3]) && Math.hypot(e[2] - o.x, e[3] - o.z) > minD && Math.hypot(e[2] - o.x, e[3] - o.z) < maxD).map((e) => ({ name: e[0], x: e[2], z: e[3] })); }

// each kind makes a contract here and now (or null when there's nothing suitable nearby)
// a contract: { kind, icon, title, how, pay, t (seconds, 0 = no limit), steps: [{ name, x, z, r, need }], ... }
const CON_KINDS = {
  parcel: () => {
    const shops = SHOPS.filter((s) => !s.mall && s.name && conDist(s, here()) > 150 && conDist(s, here()) < 1300); if (!shops.length) return null;
    const A = pick(shops), B = pick(conPlaces([1, 6, 8, 12, 13, 10], 600, 2600, A)); if (!B) return null;
    const d = conDist(here(), A) + conDist(A, B);
    return { icon: '📦', title: `Parcel for ${B.name}`, how: `Pick up a parcel at ${A.name}, then drop it at ${B.name} before the timer runs out. Walk, drive, anything.`, pay: conPay(120 + d / 12), t: Math.round(d / 8 + 60),
      steps: [{ name: 'Pick up: ' + A.name, x: A.x, z: A.z, r: 8, done: 'Got the parcel' }, { name: 'Drop off: ' + B.name, x: B.x, z: B.z, r: 14 }] };
  },
  car: () => {
    const near = cars.filter((c) => CAR_LABEL[c.type] && !c.dead && c.kind !== 'police' && !c.owned && conDist(c, here()) < 200), type = near.length ? pick(near).type : null;
    const B = pick(conPlaces([9, 13], 700, 2600)); if (!B) return null;
    const label = type ? CAR_LABEL[type] : 'car';
    return { icon: '🚗', title: `Bring a ${label}`, how: `Get any ${label.toLowerCase()} (borrow one off the street) and drive it to ${B.name}. It has to arrive in one piece.`, pay: conPay(type ? 320 : 220), t: Math.round(conDist(here(), B) / 8 + 150), type,
      steps: [{ name: 'Drop-off: ' + B.name, x: B.x, z: B.z, r: 14, need: () => player.state === 'car' && player.car && (!type || player.car.type === type) && player.car.health >= 40, needText: type ? `you need to be driving a ${label} that isn't wrecked` : 'you need to arrive in a car that isn’t wrecked' }] };
  },
  rush: () => {
    const pts = []; let at = here();
    for (let k = 0; k < 4; k++) { const c = conPlaces([0, 3, 5, 9, 10, 11], 300, 900, at).filter((p) => !pts.some((q) => q.name === p.name)); if (!c.length) break; at = pick(c); pts.push(at); }
    if (pts.length < 3) return null;
    let d = conDist(here(), pts[0]); for (let k = 1; k < pts.length; k++) d += conDist(pts[k - 1], pts[k]);
    return { icon: '⏱', title: `Rush run · ${pts.length} stops`, how: `Hit ${pts.length} checkpoints in a row before the clock runs out. A fast car helps.`, pay: conPay(180 + d / 10), t: Math.round(d / 13 + 25),
      steps: pts.map((p, k) => ({ name: `Checkpoint ${k + 1}: ${p.name}`, x: p.x, z: p.z, r: 20, done: 'Checkpoint!' })) };
  },
  jump: () => {
    const towers = bigBuildingsNear(player.x, player.z, 2500).filter((B) => ['hotel', 'apartments', 'offices'].includes(B.kind) && B.b[0] >= 45);
    if (!towers.length) return null;
    const B = pick(towers), cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    let T = null; for (let k = 0; k < 20 && !T; k++) { const a = rand() * TAU, d = 120 + rand() * 220, s = sidewalkNear(cx + Math.sin(a) * d, cz + Math.cos(a) * d); if (s && isLand(s.x, s.z) && !roofUnder(s.x, s.z)) T = s; }
    if (!T) return null;
    const name = B.name || 'the tower';
    return { icon: '🪂', title: `Base jump off ${name}`, how: `Go inside ${name}, take the lift to the Roof, jump off the edge (Space) and open your parachute (Space). Land on the yellow marker.`, pay: conPay(450 + B.b[0] * 2), t: 600, tower: { name, x: cx, z: cz }, target: { x: T.x, z: T.z, r: 35 }, steps: [] };
  },
  heat: () => {
    const n = conLevel() >= 4 ? 3 : 2;
    return { icon: '🚨', title: `Lose the cops · ${'★'.repeat(n)}`, how: `Tash tips the cops off about you. Get out of sight and lose all ${n} stars within 3 minutes. Don't get busted!`, pay: conPay(260 * n), t: 180, stars: n, steps: [] };
  },
  thief: () => {
    const p = peds.filter((q) => !q.cop && q.state === 'walk' && conDist(q, here()) > 20 && conDist(q, here()) < 70).sort(() => rand() - 0.5)[0]; if (!p) return null;
    return { icon: '👜', title: 'Catch the bag snatcher', how: 'Someone just snatched a bag. Chase the runner with the red marker and knock them down (punch them or tackle them) to get it back.', pay: conPay(220), t: 90, ped: p, steps: [] };
  },
  stunt: () => {
    const air = rand() < 0.5, kmh = 130 + Math.min(60, conLevel() * 8);
    return air ? { icon: '🛞', title: 'Big air', how: 'Get a car or bike airborne for 1.5 seconds. Ramps at The Spit stunt park and on the beaches, or a fast crest.', pay: conPay(260), t: 300, air: 1.5, steps: [] }
      : { icon: '💨', title: `Hit ${kmh} km/h`, how: `Get any car up to ${kmh} km/h. Find a long straight road (the M1 is good) and floor it.`, pay: conPay(200), t: 240, kmh, steps: [] };
  },
  flight: () => {
    const L = (REGION ? REGION.landmarks : []).filter((l) => { const d = Math.hypot(l[0] - player.x, l[1] - player.z); return d > 1200 && d < 7000; });
    if (!L.length) return null; const l = pick(L);
    return { icon: '🚁', title: `Fly over ${l[2]}`, how: `Fly a helicopter or plane over ${l[2]}, at least 60 m up. Helicopters wait at Sea World, the university hospital and the airport.`, pay: conPay(420), t: 900,
      steps: [{ name: 'Fly over ' + l[2], x: l[0], z: l[1], r: 140, need: () => (player.state === 'heli' && player.chopper && player.chopper.alt > 60) || (player.state === 'plane' && player.plane && player.plane.y - groundAt(player.x, player.z) > 60), needText: 'be up in a helicopter or plane, at least 60 m high' }] };
  },
  boat: () => {
    const B = pick(conPlaces([3], 800, 4000)); if (!B) return null;
    return { icon: '🚤', title: `Boat run to ${B.name}`, how: `Grab a jet ski or speedboat (they're tied up along the canals and beaches, E to board) and take it to ${B.name}.`, pay: conPay(320), t: 900,
      steps: [{ name: 'By boat: ' + B.name, x: B.x, z: B.z, r: 140, need: () => player.state === 'boat', needText: 'arrive in a boat' }] };
  },
  fish: () => ({ icon: '🎣', title: 'Catch 2 fish', how: 'Buy a rod at any servo, stand at the water facing it and press E to cast. Catch 2 fish.', pay: conPay(180), t: 0, stat: 'fish', n: 2, steps: [] }),
  surf: () => ({ icon: '🏄', title: 'Ride 2 waves', how: 'On any beach press E to hire a board, paddle out (W) and catch 2 waves.', pay: conPay(180), t: 0, stat: 'waves', n: 2, steps: [] }),
  scout: () => {
    const P = pick(conPlaces([2, 5, 8, 10, 11, 14], 400, 2500)); if (!P) return null;
    return { icon: '🔭', title: `Scout ${P.name}`, how: `Go to ${P.name} and hang around for 10 seconds without the cops after you.`, pay: conPay(110 + conDist(here(), P) / 15), t: Math.round(conDist(here(), P) / 6 + 90),
      steps: [{ name: 'Scout: ' + P.name, x: P.x, z: P.z, r: 40, stay: 10 }] };
  },
};
function conGenerate() {
  const kinds = Object.keys(CON_KINDS).filter((k) => k !== CON.last);
  for (let tries = 0; tries < 12; tries++) {
    const k = pick(kinds), C = CON_KINDS[k](); if (!C) continue;
    C.kind = k; C.pay = Math.max(50, C.pay); return C;
  }
  return CON_KINDS.fish();
}
function conBusy() { return CON.cur || MISSION || STORY.M || MICK.M || ACT_CUR || ECON.shift || HEIST.stage > 1 || TRIAL; }
function conOffer() { if (!CON.offer) { CON.offer = conGenerate(); CON.offer.kind = CON.offer.kind || 'fish'; } return CON.offer; }
function conAccept() {
  if (conBusy()) { toast('Finish (or give up) what you’re doing first'); return; }
  const C = CON.cur = conOffer(); CON.offer = null; C.start = elapsed; C.left = C.t; C.base = C.stat ? actData().stats[C.stat] || 0 : 0; C.stayed = 0;
  if (C.kind === 'heat') { CRIME_TEXT.tipoff = 'Tash tipped off the cops'; raiseWanted(C.stars, 'tipoff'); }
  if (C.kind === 'thief') { C.ped.thief = true; C.ped.scare(player.x, player.z, 99); toast('There they go — after them!'); }
  conTarget(); closePhone(); toast(`${C.icon} ${C.title} — ${C.how}`);
}
function conTarget() { // the GPS and the beacon follow the current step
  const C = CON.cur, S = C && C.steps[0];
  if (S) { WAYPOINT = { name: S.name, x: S.x, z: S.z }; GPS.t = 0; conBeacon(S.x, S.z, S.r); }
  else if (C && C.kind === 'jump') { WAYPOINT = { name: C.tower.name, x: C.tower.x, z: C.tower.z }; GPS.t = 0; conBeacon(C.target.x, C.target.z, C.target.r); } // the tower on the GPS, the landing marker on the ground
  else conBeacon(null);
}
function conBeacon(x, z, r) {
  if (!CON.beacon) { CON.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })); scene.add(CON.beacon); }
  const B = CON.beacon; B.visible = x !== null && x !== undefined; if (!B.visible) return;
  const rad = Math.min(r || 10, 40), h = 70; B.scale.set(rad, h, rad); B.position.set(x, (isLand(x, z) ? groundAt(x, z) : WATER_Y) + h / 2, z);
}
function conEnd(won, msg) {
  const C = CON.cur; if (!C) return; CON.cur = null; CON.last = C.kind; conBeacon(null); $('jobhud').hidden = true;
  if (WAYPOINT && (C.steps.some((s) => WAYPOINT.name === s.name) || (C.tower && WAYPOINT.name === C.tower.name))) { WAYPOINT = null; clearGPS(); }
  if (C.ped) C.ped.thief = false;
  const D = conData();
  if (won) { player.money += C.pay; D.done++; D.earned += C.pay; D.best = Math.max(D.best, C.pay); stat('contracts'); stat('earned', C.pay); sfxTone([523, 659, 784, 1046], 0.5, 0.07, 'triangle'); toast(`${msg} +$${C.pay.toLocaleString()} · next contract is on your phone`); if (D.done % 4 === 0) actNote(`📋 Contractor level ${conLevel()}! Tash pays you more now.`); }
  else { D.failed++; toast(`${msg} Contract failed — Tash has another one on your phone`); }
  CON.offer = conGenerate(); actNote(`📋 Tash: ${won ? 'Nice work. ' : ''}New contract — ${CON.offer.title} ($${CON.offer.pay})`, true);
  saveGame();
}
function conJumpLanded(L) { // any jump counts: off the tower, another roof, or out of a helicopter
  const C = CON.cur; if (!C || C.kind !== 'jump' || !L.ok) return; // wasted: the contract ends with the life
  const d = Math.round(Math.hypot(L.x - C.target.x, L.z - C.target.z));
  if (d <= C.target.r) conEnd(true, `Bang on the marker (${d} m)!`);
  else { C.missed = d; toast(`Missed the marker by ${d} m — go back up and jump again`); }
}
function updateContracts(dt) {
  const C = CON.cur; if (!C) return;
  if (player.deadT > 0) return conEnd(false, player.endKind === 'busted' ? 'Busted!' : 'Wasted!');
  if (C.t) { C.left -= dt; if (C.left <= 0) return conEnd(false, 'Out of time.'); }
  let status = '';
  if (C.kind === 'heat') { status = player.stars ? `${'★'.repeat(player.stars)} — get out of sight` : ''; if (!player.stars && elapsed - C.start > 2) return conEnd(true, 'You lost them!'); }
  else if (C.kind === 'thief') {
    const p = C.ped, d = conDist(p, here());
    if (peds.indexOf(p) < 0 || d > 230) return conEnd(false, 'The snatcher got away.');
    if (p.state === 'down') return conEnd(true, 'Got the bag back!');
    if (p.state === 'walk' || (p.state === 'flee' && p.flee < 2)) p.scare(player.x, player.z, 99);
    if (d < 4) crimeCool.punch = crimeCool.ped = elapsed + 3; // stopping a thief isn't a crime
    conBeacon(p.x, p.z, 0.7); CON.beacon.scale.y = 3; CON.beacon.position.y = groundAt(p.x, p.z) + 3.4;
    status = `${Math.round(d)} m away`;
  } else if (C.kind === 'stunt') {
    const c = player.state === 'car' && player.car;
    if (C.air) { const a = c && c.air ? c.air : 0; status = c ? `air ${a.toFixed(1)} s` : 'get in a car or on a bike'; if (a >= C.air) return conEnd(true, 'Huge air!'); }
    else { const v = c ? Math.round(c.speed * 3.6) : 0; status = c ? `${v} / ${C.kmh} km/h` : 'get in a car'; if (v >= C.kmh) return conEnd(true, 'Flat out!'); }
  } else if (C.stat) { const got = (actData().stats[C.stat] || 0) - C.base; status = `${got} / ${C.n}`; if (got >= C.n) return conEnd(true, 'Done!'); }
  else if (C.kind === 'jump') status = player.state === 'sky' ? `marker ${Math.round(Math.hypot(C.target.x - player.x, C.target.z - player.z))} m` : C.missed ? `missed by ${C.missed} m — try again` : TOWER && TOWER.level > TOWER.floors ? 'jump off the edge (Space)' : 'lift to the Roof, then jump';
  else if (C.steps.length) {
    const S = C.steps[0];
    {
      const d = Math.hypot(S.x - player.x, S.z - player.z); status = `${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}`;
      if (d < S.r) {
        if (S.need && !S.need()) { CON.hudT -= dt; if (CON.hudT <= 0) { toast(`Almost — ${S.needText}`); CON.hudT = 4; } }
        else if (S.stay) { if (player.stars) status = 'lose the cops first'; else { C.stayed += dt; status = `scouting… ${Math.ceil(S.stay - C.stayed)}s`; if (C.stayed >= S.stay) return conEnd(true, 'Scouted!'); } }
        else { C.steps.shift(); if (!C.steps.length) return conEnd(true, C.kind === 'parcel' ? 'Parcel delivered!' : C.kind === 'rush' ? 'Rush run done!' : 'Done!'); sfxTone([660, 880], 0.15, 0.05); toast(`${S.done || 'Done'} — next: ${C.steps[0].name}`); conTarget(); }
      }
    }
  }
  $('jobhud').hidden = false; $('jobhud').textContent = `${C.icon} ${C.title}${status ? ' · ' + status : ''}${C.t ? ' · ' + Math.max(0, Math.ceil(C.left)) + 's' : ''}`;
}
// phone → Contracts
function contractsApp(btn, head) {
  const D = conData(), C = CON.cur;
  head(`Contractor level ${conLevel()} · ${D.done} done · $${D.earned.toLocaleString()} earned`);
  if (C) {
    btn(`${C.icon} ${C.title} · $${C.pay.toLocaleString()}`, C.how, () => {}, false);
    if (WAYPOINT) btn('Directions', `${WAYPOINT.name} · ${km(WAYPOINT.x, WAYPOINT.z)}`, () => directions(WAYPOINT.name, WAYPOINT.x, WAYPOINT.z)).classList.add('go');
    btn('Give up', 'no pay, and Tash gives you the next one', () => { conEnd(false, 'You gave up.'); phoneApp('contracts'); });
    return;
  }
  const O = conOffer();
  head('Assigned to you by Tash');
  btn(`${O.icon} ${O.title} · $${O.pay.toLocaleString()}`, O.how + (O.t ? ` (${Math.round(O.t / 60) || 1} min)` : ''), () => {}, false);
  btn('✅ Accept', conBusy() ? 'finish what you’re doing first' : 'starts now', conAccept, !conBusy()).classList.add('go');
  btn('🔄 Ask for a different one', 'free, as often as you like', () => { CON.last = O.kind; CON.offer = conGenerate(); phoneApp('contracts'); });
  head('How it works');
  btn('One job at a time, forever', 'When you finish (or fail) a contract, Tash assigns the next one. Every 4 done is a level up, and higher levels pay more.', () => {}, false);
}
