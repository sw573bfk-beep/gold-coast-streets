// ============================================================================
// Gold Coast Streets — public transport. Two G:link trams run the real light-rail route (Burleigh to Southport
// and on to Parkwood), stopping at every station; buses run the main roads and pull in every few hundred metres.
// When one is stopped beside you, press E to get on ($5); E again at a stop to get off.
// ============================================================================
const RIDE = { v: null, kind: null, fare: 5 };
// the trams themselves (model, stops, shoving cars aside) live in details.js; this names their stops
function tramStopName(t, ahead) {
  const L = t.L; if (!L.names) return ahead ? 'the next stop' : 'the platform';
  let best = null, bd = ahead ? Infinity : 40;
  L.stops.forEach((s, i) => { const d = (s - t.s) * t.dir; if (ahead ? d > 0.5 && d < bd : Math.abs(d) < bd) { bd = ahead ? d : Math.abs(d); best = L.names[i]; } });
  return best || (ahead ? 'end of the line' : 'the platform');
}
const tramNear = (t, r) => t.mods.some((md) => Math.hypot(md.x - player.x, md.z - player.z) < r);
// buses: ordinary traffic that pulls in every few hundred metres (driveAI asks busStop)
function busStop(car, dt) {
  const a = car.ai; a.busDist = (a.busDist || 0) + car.speed * dt;
  if (a.dwell > 0) { a.dwell -= dt; return true; }
  if (a.busDist > 380 + rand() * 200) { a.busDist = 0; a.dwell = 9; }
  return false;
}
function spawnBuses() {
  const n = cars.filter((c) => c.bus).length; if (n >= 2) return;
  const c = spawnTraffic(120, 300, 'traffic', 'bus'); if (c) { c.bus = true; }
}
// getting on and off
function boardRide() {
  if (player.state !== 'foot') return false;
  let best = null, bd = 7;
  for (const t of trams) if (t.dwell > 1.5) for (const md of t.mods) { const d = Math.hypot(md.x - player.x, md.z - player.z); if (d < bd) { bd = d; best = t; } }
  for (const c of cars) if (c.bus && c.speed < 1 && c.driver === 'ai') { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
  if (!best) return false;
  if (!pay(RIDE.fare, 'the fare')) return true;
  RIDE.v = best; RIDE.kind = best instanceof Tram ? 'tram' : 'bus'; player.state = 'ride'; player.mode = 'car'; player.model.root.visible = false;
  toast(RIDE.kind === 'tram' ? 'On the G:link — E at a stop to get off' : 'On the bus — E when it pulls in to get off'); sfxTone([660, 880], 0.15, 0.05);
  return true;
}
function leaveRide() {
  const V = RIDE.v; if (!V) return;
  const stopped = RIDE.kind === 'tram' ? V.dwell > 0.5 : V.speed < 1.5;
  if (!stopped) { toast(RIDE.kind === 'tram' ? 'Wait for the next stop' : 'Wait for the bus to pull in'); return; }
  const P = RIDE.kind === 'tram' ? V.mods[2] : V, h = RIDE.kind === 'tram' ? Math.atan2(P.tx, P.tz) : V.h; // trams: out of the middle doors
  const side = RIDE.kind === 'tram' ? 3.2 : V.spec.W / 2 + 1.4, sh = Math.sin(h), ch = Math.cos(h);
  let px = P.x - ch * side, pz = P.z + sh * side; // the kerb side (left, in Australia)
  if (!isLand(px, pz) || resolveCircle(px, pz, 0.4)) { px = P.x + ch * side; pz = P.z - sh * side; }
  const out = freeSpotNear(px, pz, 20); if (out) { px = out[0]; pz = out[1]; }
  player.x = px; player.z = pz; player.y = 0; player.state = 'foot'; player.mode = 'foot'; player.model.root.visible = true; RIDE.v = null; $('jobhud').hidden = true;
}
function updateRide(dt) {
  const V = RIDE.v;
  if (!V || (RIDE.kind === 'bus' && !cars.includes(V))) { RIDE.v = null; player.state = 'foot'; player.mode = 'foot'; player.model.root.visible = true; return; }
  player.x = V.x; player.z = V.z; player.h = V.h;
  $('jobhud').hidden = false;
  if (RIDE.kind === 'tram') $('jobhud').textContent = V.dwell > 0.5 ? `G:link · stopped at ${tramStopName(V, false)} · E to get off` : `G:link · next stop: ${tramStopName(V, true)}`;
  else $('jobhud').textContent = V.speed < 1.5 ? 'Bus · pulled in · E to get off' : 'Bus · E when it next pulls in';
}
let transitT = 0;
function updateTransit(dt) {
  transitT -= dt; if (transitT <= 0) { transitT = 3; spawnBuses(); }
  // a hint when a tram or bus is waiting beside you
  if (player.state === 'foot' && (houseHintT || 0) <= 0) {
    for (const t of trams) if (t.dwell > 2 && tramNear(t, 10)) { toast(`E: get on the G:link ($${RIDE.fare}) — next: ${tramStopName(t, true)}`); houseHintT = 8; break; }
  }
}
