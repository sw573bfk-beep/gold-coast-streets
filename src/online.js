// ============================================================================
// Gold Coast Streets — the online world (phone → Online). Join a public world anyone can drop into, or start a
// friends-only one and share its code. You see everyone else walking, driving, flying, boating and surfing with
// their own outfits and cars, can punch, shoot and run each other over, send quick messages and call a race.
// Each player's game still runs its own traffic, pedestrians and police; the server (server/) only relays players.
// ============================================================================
const ONLINE_URL = (() => { try { return localStorage.getItem('gcs-server') || ''; } catch (e) { return ''; } })() || 'https://gold-coast-streets-online.sw573bfk.workers.dev'; // gcs-server: a local test server
const NET = { ws: null, id: null, world: null, peers: new Map(), sendT: 0, status: 'off', lastHitBy: null, race: null, list: null };
const SAYINGS = ['👋 G’day!', 'Follow me', 'Race?', 'Help!', 'Nice one!', 'Get in', 'Over here', 'Watch this', '😂', 'Bye!', '🏁 Finished!'];
const NET_RATE = 1 / 8; // state updates a second: smooth enough, and kind to the free server plan
const HEX = /^#[0-9a-f]{6}$/i;
function safeLook(L) { // other players' looks are data: only known keys and plain colours get through
  if (!L || typeof L !== 'object') L = {};
  const o = { skin: '#e0ac85', hair: '#3b2a1e', shirt: '#ffffff', shorts: '#2b2b2b', shoe: '#e8e8e8', singlet: false }; // until their look arrives
  for (const k of ['skin', 'hair', 'shirt', 'shorts', 'shoe', 'cap']) if (HEX.test(L[k])) o[k] = L[k];
  if (typeof L.singlet === 'boolean') o.singlet = L.singlet; if (L.sunnies === true) o.sunnies = true; if (L.beard === true) o.beard = true;
  if (typeof L.hairStyle === 'string' && CUTS.some((c) => c[0] === L.hairStyle)) o.hairStyle = L.hairStyle;
  if (L.tats && typeof L.tats === 'object') o.tats = { sleeves: L.tats.sleeves === true, neck: L.tats.neck === true, legs: L.tats.legs === true };
  return o;
}
// ---------------------------------------------------------------- connecting
// quick join: the busiest public world with room (they fill to 16), or a brand new one
function netQuick() {
  if (NET.status !== 'off') return;
  NET.status = 'connecting'; netHud(); toast('Finding a world…');
  fetch(ONLINE_URL + '/match').then((r) => r.json()).then((d) => { NET.status = 'off'; netJoin(d.code, { public: true, title: 'Gold Coast ' + d.code }); })
    .catch(() => { NET.status = 'off'; netHud(); toast('Couldn’t reach the online server — check your internet'); });
}
function netFriends() { // a world only people with the code can join
  NET.status = 'connecting'; netHud();
  fetch(ONLINE_URL + '/newcode').then((r) => r.json()).then((d) => { NET.status = 'off'; netJoin(d.code, { public: false, title: ACCT.name + '’s world' }); })
    .catch(() => { NET.status = 'off'; netHud(); toast('Couldn’t reach the online server'); });
}
function netHud() { // the world's code and how many are in it, in the corner
  const hud = $('net'); hud.hidden = NET.status === 'off';
  if (NET.status === 'connecting') hud.textContent = '🌐 Joining…';
  else if (NET.status === 'on') hud.textContent = `🌐 World ${NET.world.code} · ${NET.peers.size + 1}/${NET.max || 16}${NET.world.public ? '' : ' · friends only'}`;
}
function netJoin(code, opts = {}) {
  netLeave(true);
  if (MODE !== 'multi' || !ACCT.token) { toast('Pick Multiplayer on the main menu first'); return; }
  const q = new URLSearchParams({ world: code, token: ACCT.token, public: opts.public ? '1' : '0', title: opts.title || ACCT.name + '’s world' });
  let ws; try { ws = new WebSocket(ONLINE_URL.replace(/^http/, 'ws') + '/ws?' + q); } catch (e) { toast('Couldn’t reach the online server'); return; }
  NET.ws = ws; NET.status = 'connecting'; netHud();
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } netMessage(m); };
  ws.onclose = () => { if (NET.ws !== ws) return; const was = NET.status === 'on'; netLeave(true); toast(was ? 'Disconnected from the online world' : 'Couldn’t join — check the code (the world may be full)'); };
  ws.onerror = () => {};
}
function netLeave(quiet) {
  const ws = NET.ws; NET.ws = null; NET.status = 'off'; NET.id = null; NET.world = null; NET.race = null;
  if (ws) try { ws.close(); } catch (e) { /* already closed */ }
  for (const P of NET.peers.values()) dropPeer(P); NET.peers.clear();
  netHud(); if (!quiet) toast('You left the online world');
}
function netSend(m) { if (NET.ws && NET.ws.readyState === 1) NET.ws.send(JSON.stringify(m)); }
function netLook() { if (NET.status === 'on') netSend({ t: 'look', look: player.look }); }
function netMessage(m) {
  if (m.t === 'hello') {
    NET.id = m.id; NET.world = m.world; NET.max = m.max || 16; NET.status = 'on'; netLook(); netHud();
    for (const p of m.players || []) { const P = addPeer(p.id, p.name, p.look); if (p.s) peerState(P, p.s); }
    toast(`You’re in world ${m.world.code} · ${NET.peers.size + 1}/${NET.max} players${m.world.public ? '' : ' · give your friends the code'}`); sfxTone([523, 784], 0.2, 0.05);
  } else if (m.t === 'join') { addPeer(m.id, m.name, null); toast(`${m.name} joined`); }
  else if (m.t === 'leave') { const P = NET.peers.get(m.id); if (P) { toast(`${P.name} left`); dropPeer(P); NET.peers.delete(m.id); } }
  else if (m.t === 's') { const P = NET.peers.get(m.id); if (P) peerState(P, m.s); }
  else if (m.t === 'look') { const P = NET.peers.get(m.id); if (P) { P.look = safeLook(m.look); rebuildPeer(P); } }
  else if (m.t === 'hit') {
    if (player.deadT > 0) return; NET.lastHitBy = m.from;
    damagePlayer(m.dmg); shake = Math.min(1, shake + 0.3);
    if ((m.kx || m.kz) && m.dmg >= 15 && player.state === 'foot') knockPlayer(clamp(m.kx, -9, 9), clamp(m.kz, -9, 9));
    if (player.deadT > 0) netSend({ t: 'down', by: m.from });
  } else if (m.t === 'down') {
    const who = m.id === NET.id ? 'You' : (NET.peers.get(m.id) || {}).name || 'Someone', by = m.by === NET.id ? 'you' : (NET.peers.get(m.by) || {}).name;
    toast(by ? `${by[0].toUpperCase() + by.slice(1)} wasted ${who === 'You' ? 'you' : who}` : `${who} got wasted`);
  } else if (m.t === 'say') { const P = NET.peers.get(m.id); if (P && SAYINGS[m.k]) { toast(`${P.name}: ${SAYINGS[m.k]}`); P.say = SAYINGS[m.k]; P.sayT = 5; drawTag(P); } }
  else if (m.t === 'race') { const P = NET.peers.get(m.id); if (P && Number.isFinite(m.x)) { NET.race = { x: m.x, z: m.z, name: m.name }; WAYPOINT = { name: '🏁 ' + m.name, x: m.x, z: m.z }; GPS.t = 0; toast(`${P.name} called a race to ${m.name} — GO!`); sfxTone([440, 440, 880], 0.5, 0.08); } }
}
// ---------------------------------------------------------------- other players
function addPeer(id, name, look) {
  if (NET.peers.has(id)) return NET.peers.get(id);
  const P = { id, name: String(name || 'Player').slice(0, 16), look: safeLook(look), s: null, x: 0, z: 0, y: 0, h: 0, vx: 0, vz: 0, t: 0, person: null, veh: null, vkey: '', tag: null, say: '', sayT: 0, phase: 0, hitT: 0 };
  P.canvas = document.createElement('canvas'); P.canvas.width = 256; P.canvas.height = 96;
  P.tex = new THREE.CanvasTexture(P.canvas); P.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: P.tex, depthTest: false, transparent: true, toneMapped: false }));
  P.tag.scale.set(2.6, 0.98, 1); P.tag.renderOrder = 10; scene.add(P.tag); drawTag(P); rebuildPeer(P);
  NET.peers.set(id, P); return P;
}
function drawTag(P) {
  const c = P.canvas.getContext('2d'); c.clearRect(0, 0, 256, 96);
  if (P.say) { c.font = '600 26px sans-serif'; const w = Math.min(250, c.measureText(P.say).width + 20); c.fillStyle = 'rgba(255,255,255,.92)'; c.fillRect(128 - w / 2, 2, w, 38); c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(P.say, 128, 22, 240); }
  c.font = '700 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(P.name, 128, 68); c.fillStyle = '#5ee0c8'; c.fillText(P.name, 128, 68);
  P.tex.needsUpdate = true;
}
function rebuildPeer(P) { if (P.person) disposePerson(P.person); P.person = makePerson(P.look); scene.add(P.person.root); P.vkey = ''; peerVehicle(P); }
function dropPeer(P) {
  if (P.person) disposePerson(P.person); if (P.veh) dropVehicle(P.veh); P.veh = null;
  scene.remove(P.tag); P.tag.material.dispose(); P.tex.dispose();
}
function dropVehicle(V) {
  if (V.kind === 'car') disposeCarModel(V.M);
  else if (V.kind === 'plane') { scene.remove(V.M); for (const g of V.M.userData.geos || []) g.dispose(); }
  else if (V.kind === 'boat') { scene.remove(V.M.g); V.M.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
const MODES = { f: 'foot', c: 'car', p: 'plane', b: 'boat', s: 'surf', r: 'ride', d: 'dead' };
function peerState(P, s) {
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return;
  const now = performance.now() / 1000;
  if (P.s && now - P.t > 0.02) { const dt = Math.min(1, now - P.t); P.vx = (s.x - P.s.x) / dt; P.vz = (s.z - P.s.z) / dt; }
  if (!P.s) { P.x = s.x; P.z = s.z; P.y = s.y || 0; P.h = s.h || 0; }
  P.s = s; P.t = now; peerVehicle(P);
}
// the car, plane or boat they're in (made to match theirs)
function peerVehicle(P) {
  const s = P.s; if (!s) return;
  const key = s.m + ':' + (s.ty || '') + ':' + (s.co || ''); if (key === P.vkey) return; P.vkey = key;
  if (P.veh) dropVehicle(P.veh); P.veh = null;
  if (s.m === 'c' && CAR_TYPES[s.ty]) { const M = makeCarModel(s.ty, HEX.test(s.co) ? s.co : '#c0c4c8'); scene.add(M.root); setDriverLook(M, P.look); P.veh = { kind: 'car', M, sp: CAR_TYPES[s.ty] }; }
  else if (s.m === 'p' && PLANE_TYPES[s.ty]) { const M = makePlaneModel(PLANE_TYPES[s.ty]); scene.add(M); P.veh = { kind: 'plane', M }; }
  else if (s.m === 'b' && BOAT_TYPES[s.ty]) { const M = makeBoatModel(BOAT_TYPES[s.ty], HEX.test(s.co) ? s.co : '#f4f4f2'); P.veh = { kind: 'boat', M }; }
}
function updatePeers(dt) {
  const now = performance.now() / 1000;
  for (const P of NET.peers.values()) {
    const s = P.s; if (!s) { P.person.root.visible = false; P.tag.visible = false; continue; }
    const lead = Math.min(0.25, now - P.t), tx = s.x + P.vx * lead, tz = s.z + P.vz * lead, k = Math.min(1, dt * 10);
    P.x += (tx - P.x) * k; P.z += (tz - P.z) * k; P.y += ((s.y || 0) - P.y) * k; P.h += angDiff(P.h, s.h || 0) * k;
    const mode = MODES[s.m] || 'foot', V = P.veh, far = Math.hypot(P.x - player.x, P.z - player.z) > 600;
    P.person.root.visible = !far && (mode === 'foot' || mode === 'surf' || mode === 'dead');
    if (P.person.root.visible) {
      const gy = mode === 'surf' ? 0.35 : standAt(P.x, P.z) + Math.max(0, P.y);
      P.person.root.position.set(P.x, gy, P.z); P.person.root.rotation.set(mode === 'dead' ? -Math.PI / 2 : 0, P.h, 0);
      const sp = Math.hypot(P.vx, P.vz); P.phase += dt * sp * 2.6; animatePerson(P.person, P.phase, mode === 'foot' ? Math.min(1.25, sp / 4.4) : 0, sp > 6 && mode === 'foot' ? 'sprint' : undefined);
    }
    if (V) {
      const R = V.kind === 'car' ? V.M.root : V.kind === 'plane' ? V.M : V.M.g; R.visible = !far;
      if (V.kind === 'car') { R.position.set(P.x, standAt(P.x, P.z) + Math.max(0, P.y), P.z); R.rotation.set(0, P.h, 0); }
      else if (V.kind === 'plane') { R.position.set(P.x, P.y, P.z); R.rotation.set(-(s.pi || 0), P.h, -(s.ro || 0), 'YXZ'); }
      else { R.position.set(P.x, WATER_Y + Math.sin(elapsed * 2 + P.x * 0.3) * 0.06, P.z); R.rotation.set(0, P.h, 0); }
    }
    const top = mode === 'plane' ? P.y + 4 : mode === 'car' ? standAt(P.x, P.z) + (V && V.sp ? V.sp.roof || 1.7 : 1.7) + 1 : (mode === 'boat' ? WATER_Y + 2.4 : standAt(P.x, P.z) + 2.5);
    P.tag.position.set(P.x, top, P.z); P.tag.visible = !far && mode !== 'ride';
    if (P.sayT > 0) { P.sayT -= dt; if (P.sayT <= 0) { P.say = ''; drawTag(P); } }
    P.hitT -= dt;
    // run them over
    if (player.state === 'car' && player.car && mode === 'foot' && player.car.speed > 6 && P.hitT <= 0 && Math.hypot(P.x - player.car.x, P.z - player.car.z) < 2.2) {
      P.hitT = 1.2; netHit(P, Math.min(40, player.car.speed * 2), player.car.vx * 0.5, player.car.vz * 0.5); sfxNoise(0.2, 600, 0.4);
    }
  }
}
// ---------------------------------------------------------------- hitting each other (the one hit applies it)
function netHit(P, dmg, kx = 0, kz = 0) { netSend({ t: 'hit', to: P.id, dmg: Math.round(dmg), kx: +kx.toFixed(1), kz: +kz.toFixed(1) }); }
function peerTargets() { return [...NET.peers.values()].filter((P) => P.s && ['f', 's', 'c', 'b'].includes(P.s.m)); }
function punchPeers(hx, hz) {
  for (const P of peerTargets()) { const dx = P.x - player.x, dz = P.z - player.z; if (P.s.m === 'f' && Math.hypot(dx, dz) < 1.5 && dx * hx + dz * hz > 0.2) { netHit(P, 9, hx * 4, hz * 4); return true; } }
  return false;
}
// ---------------------------------------------------------------- sending your own state
function myState() {
  const st = player.deadT > 0 ? 'd' : { car: 'c', plane: 'p', boat: 'b', surf: 's', ride: 'r' }[player.state] || 'f';
  const r2 = (v) => Math.round(v * 100) / 100, s = { m: st, x: r2(player.x), z: r2(player.z), y: r2(player.y || 0), h: r2(player.h || 0) };
  if (st === 'c' && player.car) { s.ty = player.car.type; s.co = player.car.color; s.y = r2(player.car.y || 0); }
  else if (st === 'p' && player.plane) { const p = player.plane; s.ty = p.type; s.x = r2(p.x); s.z = r2(p.z); s.y = r2(p.y); s.h = r2(p.h); s.pi = r2(p.pitch); s.ro = r2(p.roll); }
  else if (st === 'b' && player.boat) { s.ty = player.boat.type; }
  else if (st === 's') { s.x = r2(SURF.x); s.z = r2(SURF.z); s.h = r2(SURF.h); }
  return s;
}
function updateNet(dt) {
  if (NET.status !== 'on') return;
  NET.sendT -= dt; if (NET.sendT <= 0) { NET.sendT = NET_RATE; netSend({ t: 's', s: myState() }); }
  updatePeers(dt);
  if (NET.race && Math.hypot(NET.race.x - player.x, NET.race.z - player.z) < 25) { NET.race = null; netSend({ t: 'say', k: 10 }); toast('🏁 You finished!'); sfxTone([523, 659, 784, 1046], 0.5, 0.07, 'triangle'); }
  netHud();
}
// ---------------------------------------------------------------- the Online app
function onlineApp(btn, head) {
  const body = $('phone-body');
  if (NET.status === 'on') {
    head(`World ${NET.world.code}`);
    btn(NET.world.public ? `Public world · code ${NET.world.code}` : `Friends-only world · code ${NET.world.code}`, 'friends can join with this code, even when it shows 16/16', () => {}, false);
    head(`Here now (${NET.peers.size + 1}/${NET.max || 16})`);
    btn(`🙂 ${ACCT.name || 'You'} (you)`, '', () => {}, false);
    for (const P of NET.peers.values()) btn(`🧍 ${P.name}`, P.s ? km(P.x, P.z) + ' away · tap for directions' : 'just arrived', () => P.s && directions(P.name, P.x, P.z));
    head('Quick messages');
    const row = document.createElement('div'); row.className = 'psays';
    SAYINGS.slice(0, 10).forEach((t, k) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.addEventListener('click', () => { netSend({ t: 'say', k }); toast(`You: ${t}`); }); row.appendChild(b); });
    body.appendChild(row);
    btn('🏁 Race everyone to my destination', WAYPOINT ? WAYPOINT.name : 'set a destination on the map first', () => { NET.race = { x: WAYPOINT.x, z: WAYPOINT.z, name: WAYPOINT.name }; netSend({ t: 'race', x: WAYPOINT.x, z: WAYPOINT.z, name: WAYPOINT.name }); closePhone(); toast('Race on — GO!'); }, !!WAYPOINT);
    btn('Leave this world', 'back to playing on your own', () => { netLeave(); phoneApp('online'); });
    return;
  }
  if (NET.status === 'connecting') { btn('Connecting…', '', () => {}, false); return; }
  if (MODE !== 'multi') { btn('🌐 Switch to multiplayer', 'online play needs an account: you’ll go back to the main menu (single player is saved)', () => { saveGame(); location.reload(); }); return; }
  head(`Signed in as ${ACCT.name}`);
  btn('⚡ Quick join', 'drops you into a public world with room (up to 16 players)', () => { closePhone(); netQuick(); }).classList.add('go');
  head('Public worlds');
  const list = document.createElement('div'); body.appendChild(list); list.textContent = 'Looking for worlds…';
  fetch(ONLINE_URL + '/worlds').then((r) => r.json()).then((d) => {
    if (PHONE.app !== 'online') return; list.textContent = '';
    if (!d.worlds || !d.worlds.length) { list.textContent = 'None running right now — Quick join starts one.'; return; }
    for (const w of d.worlds) { const b = document.createElement('button'); b.type = 'button'; b.className = 'papp'; b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = `🌏 World ${w.code}`; b.lastChild.textContent = `${w.players}/${w.max} players${w.players >= w.max ? ' · full (friends can still join with the code)' : ''}`; b.disabled = w.players >= w.max; b.addEventListener('click', () => { netJoin(w.code); closePhone(); }); list.appendChild(b); }
  }).catch(() => { list.textContent = 'Couldn’t reach the online server.'; });
  head('With friends');
  btn('🔒 Start a friends-only world', 'not listed: you get a 4-digit code to give your friends', () => { closePhone(); netFriends(); });
  const code = document.createElement('input'); code.className = 'pinput'; code.maxLength = 8; code.placeholder = 'World code, e.g. 4821'; code.inputMode = 'numeric'; body.appendChild(code);
  btn('Join with the code', 'works even when the world shows 16/16 (up to 20)', () => { const c = code.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); if (c.length < 4) { toast('Type the 4-digit code first'); return; } netJoin(c); closePhone(); });
  const note = document.createElement('div'); note.className = 'pfoot'; note.textContent = 'Only quick messages, no typed chat. Be kind!'; body.appendChild(note);
}
