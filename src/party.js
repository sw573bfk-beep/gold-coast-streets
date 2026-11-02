// ============================================================================
// Gold Coast Streets — playing together online: heist crews, crews and visiting friends' houses.
// Heists: invite players in your world (phone → Online), everyone picks a role (driver, hacker, muscle), the leader
// picks the bank (phone → Bank heist) and the job starts for the whole crew. More of you at the vault cracks it faster,
// one safehouse for all, and the take is split evenly.
// Crews (phone → Crew): a lasting crew with a tag, kept on the server. The tag shows on name tags as [TAG].
// Houses: crewmates (or anyone, with open house on) can walk into the houses you own.
// The server (server/) only passes these messages between the players named; each game checks what it's told.
// ============================================================================
const PARTY = { leader: null, members: [], roles: {}, invites: new Map(), pending: null, role: 'hacker', drill: {}, sendT: 0, propKey: '' };
const ROLES = { driver: '🚗 Driver (getaway car)', hacker: '💻 Hacker (vault twice as fast)', muscle: '💪 Muscle (wanted stops at 3 stars)' };
const roleOk = (r) => (ROLES[r] ? r : 'hacker');
const inParty = () => PARTY.members.length > 1 && NET.status === 'on';
const partyLead = () => PARTY.leader === NET.id;
const partyOthers = () => PARTY.members.filter((id) => id !== NET.id);
function partySend(d, to = partyOthers()) { if (to.length) netSend({ t: 'party', to, d }); }
function partyRoster() { if (partyLead()) partySend({ a: 'roster', members: PARTY.members, roles: PARTY.roles }); }
function partyReset() { PARTY.leader = null; PARTY.members = []; PARTY.roles = {}; PARTY.pending = null; PARTY.drill = {}; if (HEIST.party) { HEIST.stage = 0; HEIST.party = false; HEIST.crew = {}; $('jobhud').hidden = true; } }
function partyInvite(P) {
  if (!PARTY.leader) { PARTY.leader = NET.id; PARTY.members = [NET.id]; PARTY.roles = { [NET.id]: PARTY.role }; }
  if (!partyLead()) { toast('Only the crew leader can invite'); return; }
  if (PARTY.members.length >= 4) { toast('A heist crew is 4 at most'); return; }
  partySend({ a: 'invite' }, [P.id]); toast(`Invited ${P.name} to your heist crew`);
}
function partyJoin(id) { const P = NET.peers.get(id); if (!P) return; PARTY.invites.delete(id); PARTY.pending = id; partySend({ a: 'accept', role: PARTY.role }, [id]); toast(`Asked to join ${P.name}’s crew…`); }
function partyLeave() { partySend({ a: 'quit' }); partyReset(); toast('You left the heist crew'); }
function partyRole(r) { PARTY.role = roleOk(r); if (PARTY.leader) { PARTY.roles[NET.id] = PARTY.role; if (partyLead()) partyRoster(); else partySend({ a: 'role', role: PARTY.role }, [PARTY.leader]); } }
function partyCrewPerks() { const c = {}; for (const id of PARTY.members) c[PARTY.roles[id] || 'hacker'] = true; return c; }
function sameBank(a, b) { return a && b && Math.hypot(a.x - b.x, a.z - b.z) < 30; }
// the leader starts it: everyone gets the same bank (their own copy of the shop, found by where it is)
function partyStart(bank) {
  partySend({ a: 'start', bank: { name: bank.name, x: Math.round(bank.x), z: Math.round(bank.z) } });
  partyStartLocal(bank);
}
function partyStartLocal(b) {
  const mine = SHOPS.find((q) => q.kind === 'bank' && sameBank(q, b)) || { name: String(b.name).slice(0, 40), x: b.x, z: b.z, kind: 'bank' };
  HEIST.stage = 2; HEIST.bank = mine; HEIST.party = true; HEIST.n = PARTY.members.length; HEIST.crew = partyCrewPerks(); HEIST.take = 0;
  WAYPOINT = { name: mine.name, x: mine.x, z: mine.z }; GPS.t = 0; closePhone();
  if ((PARTY.roles[NET.id] || PARTY.role) === 'driver') { const P = curbNear(mine.x, mine.z); if (P) { const c = new Car('sports', '#111111', P.x, P.z, P.h); c.kind = 'abandoned'; c.getaway = true; cars.push(c); HEIST.car = c; } }
  actNote(`💰 Crew job on: ${mine.name}. Meet at the bank — the more of you holding up the teller, the faster the vault opens`);
}
function partyVault(take, safe) { // someone cracked the vault: everyone heads for the same safehouse
  if (!HEIST.party || HEIST.stage !== 2) return;
  HEIST.take = Math.round(take); HEIST.safe = { x: safe.x, z: safe.z }; HEIST.stage = 3; WAYPOINT = { name: 'Safehouse', x: safe.x, z: safe.z }; GPS.t = 0;
  player.stars = Math.max(player.stars, 3); toast(`The vault’s open — $${HEIST.take.toLocaleString()} for the crew! Get to the safehouse and lose the cops.`);
}
const DRILLERS = () => Object.entries(PARTY.drill).filter(([id, t]) => elapsed - t < 1.5 && PARTY.members.includes(id)).length;
function partyMessage(from, d) {
  const P = NET.peers.get(from); if (!P || !d || typeof d.a !== 'string') return;
  if (d.a === 'invite') { if (PARTY.members.includes(from)) return; PARTY.invites.set(from, elapsed); actNote(`💰 ${P.name} wants you on their heist crew — phone → Online to join`); sfxTone([660, 880], 0.2, 0.05); }
  else if (d.a === 'accept') {
    if (!partyLead() || PARTY.members.includes(from)) return;
    if (PARTY.members.length >= 4 || HEIST.party && HEIST.stage > 1) { partySend({ a: 'full' }, [from]); return; }
    PARTY.members.push(from); PARTY.roles[from] = roleOk(d.role); partyRoster(); toast(`${P.name} joined your heist crew`);
  } else if (d.a === 'full') { if (PARTY.pending === from) { PARTY.pending = null; toast(`${P.name}’s crew is full or already on a job`); } }
  else if (d.a === 'roster') {
    if (from !== PARTY.pending && from !== PARTY.leader) return; // only the crew you asked to join
    if (!Array.isArray(d.members) || !d.members.includes(NET.id)) { if (from === PARTY.leader) partyReset(); return; }
    PARTY.leader = from; PARTY.pending = null; PARTY.members = d.members.filter((id) => typeof id === 'string' && (id === NET.id || NET.peers.has(id))).slice(0, 4);
    PARTY.roles = {}; for (const id of PARTY.members) PARTY.roles[id] = roleOk(d.roles && d.roles[id]);
  } else if (d.a === 'role') { if (partyLead() && PARTY.members.includes(from)) { PARTY.roles[from] = roleOk(d.role); partyRoster(); } }
  else if (d.a === 'quit') {
    if (from === PARTY.leader) { partyReset(); toast(`${P.name} broke up the heist crew`); return; }
    const i = PARTY.members.indexOf(from); if (i < 0) return; PARTY.members.splice(i, 1); delete PARTY.roles[from]; partyRoster(); toast(`${P.name} left the heist crew`);
    if (PARTY.members.length < 2 && partyLead()) partyReset();
  } else if (d.a === 'start') { if (from === PARTY.leader && d.bank && Number.isFinite(d.bank.x) && Number.isFinite(d.bank.z)) partyStartLocal(d.bank); }
  else if (d.a === 'drill') { if (PARTY.members.includes(from)) PARTY.drill[from] = elapsed; }
  else if (d.a === 'vault') { if (PARTY.members.includes(from) && Number.isFinite(d.take) && d.take > 0 && d.take <= 200000 && d.safe && Number.isFinite(d.safe.x) && Number.isFinite(d.safe.z)) partyVault(d.take, d.safe); }
  else if (d.a === 'home') { if (PARTY.members.includes(from)) toast(`${P.name} made it to the safehouse 💰`); }
}
function partyPeerLeft(id) {
  PARTY.invites.delete(id); if (!PARTY.members.includes(id)) return;
  if (id === PARTY.leader) { partyReset(); toast('Your heist crew leader left the world'); return; }
  PARTY.members.splice(PARTY.members.indexOf(id), 1); delete PARTY.roles[id]; partyRoster(); if (PARTY.members.length < 2 && partyLead()) partyReset();
}
function updateParty(dt) {
  if (NET.status !== 'on') { if (PARTY.leader) partyReset(); return; }
  PARTY.sendT -= dt;
  if (HEIST.party && HEIST.stage === 2 && typeof robbing !== 'undefined' && robbing && robbing.kind === 'bank' && sameBank(robbing, HEIST.bank) && PARTY.sendT <= 0) { PARTY.sendT = 0.5; partySend({ a: 'drill' }); }
  // the houses you own, for friends to visit (sent when they change)
  const key = ECON.props.filter((P) => P.kind === 'house').map((P) => P.id).join('|') + (NET.open ? '+' : '');
  if (key !== PARTY.propKey) { PARTY.propKey = key; netProps(); }
}
// ---------------------------------------------------------------- houses
function netProps() { netSend({ t: 'props', props: ECON.props.filter((P) => P.kind === 'house').slice(0, 12).map((P) => ({ id: P.id, x: P.x, z: P.z, name: P.name })), open: !!NET.open }); }
function canVisit(P) { return P.open || (NET.crew && P.crew === NET.crew); }
function netHostOf(houseId) { // the friend whose house this is, if you're welcome
  if (NET.status !== 'on') return null;
  for (const P of NET.peers.values()) if (canVisit(P) && (P.props || []).some((h) => h.id === houseId)) return P.name;
  return null;
}
// ---------------------------------------------------------------- the Online app's crew section
function partyOnlineRows(btn, head) {
  head('💰 Heist crew');
  if (inParty()) {
    for (const id of PARTY.members) btn(`${id === PARTY.leader ? '⭐ ' : ''}${id === NET.id ? (ACCT.name || 'You') + ' (you)' : (NET.peers.get(id) || {}).name || '…'}`, ROLES[PARTY.roles[id]] || '', () => {}, false);
    btn(`Your role: ${ROLES[PARTY.roles[NET.id] || PARTY.role]}`, 'tap to switch', () => { const ks = Object.keys(ROLES); partyRole(ks[(ks.indexOf(PARTY.roles[NET.id] || PARTY.role) + 1) % ks.length]); phoneApp('online'); }, !HEIST.party || HEIST.stage < 2);
    if (partyLead()) btn('🏦 Plan the job', HEIST.party && HEIST.stage > 1 ? 'the job is on' : 'pick the bank: the whole crew goes', () => phoneApp('heist'), !(HEIST.party && HEIST.stage > 1)).classList.add('go');
    else btn(`Waiting for ${(NET.peers.get(PARTY.leader) || {}).name || 'the leader'} to pick the bank`, '', () => {}, false);
    btn('Leave the heist crew', '', () => { partyLeave(); phoneApp('online'); });
  } else {
    for (const [id] of PARTY.invites) { const P = NET.peers.get(id); if (P) btn(`✋ Join ${P.name}’s heist crew`, `as ${ROLES[PARTY.role]}`, () => { partyJoin(id); phoneApp('online'); }).classList.add('go'); }
    if (PARTY.pending) btn('Waiting to hear back…', '', () => {}, false);
    btn(`Your role: ${ROLES[PARTY.role]}`, 'tap to switch before you join or invite', () => { const ks = Object.keys(ROLES); partyRole(ks[(ks.indexOf(PARTY.role) + 1) % ks.length]); phoneApp('online'); });
  }
  const others = [...NET.peers.values()].filter((P) => !PARTY.members.includes(P.id));
  if ((!PARTY.leader || partyLead()) && PARTY.members.length < 4) {
    const mates = others.filter((P) => NET.crew && P.crew === NET.crew);
    if (mates.length > 1) btn(`💰 Invite my crew [${NET.crew}]`, mates.map((P) => P.name).join(', '), () => { mates.slice(0, 4 - Math.max(1, PARTY.members.length)).forEach(partyInvite); phoneApp('online'); });
    for (const P of others.slice(0, 8)) btn(`💰 Invite ${P.crew ? `[${P.crew}] ` : ''}${P.name}`, 'to your heist crew (up to 4)', () => { partyInvite(P); phoneApp('online'); });
  }
  head('🏠 Houses');
  btn(NET.open ? '🔓 Open house: on' : '🔒 Open house: off', NET.open ? 'anyone in this world can walk into your houses' : 'only your crew can come in · tap to let everyone visit', () => { NET.open = !NET.open; try { localStorage.setItem('gcs-open', NET.open ? '1' : ''); } catch (e) { /* storage blocked */ } phoneApp('online'); });
  for (const P of NET.peers.values()) for (const h of (P.props || []).slice(0, 3)) btn(`🏠 ${P.name}’s place`, `${h.name} · ${km(h.x, h.z)}${canVisit(P) ? ' · the door’s open for you' : ' · locked (crew only)'}`, () => directions(`${P.name}’s place`, h.x, h.z));
}
// ---------------------------------------------------------------- the Crew app (a lasting crew, saved on the server)
function crewApp(btn, head) {
  const body = $('phone-body');
  if (MODE !== 'multi' || !ACCT.token) { btn('Crews are for online play', 'pick Multiplayer on the main menu and sign in', () => {}, false); return; }
  const box = document.createElement('div'); box.textContent = 'Loading your crew…'; body.appendChild(box);
  api('/crew').then((d) => {
    if (PHONE.app !== 'crew') return; box.remove();
    if (d.crew) {
      NET.crewInfo = d.crew; head(`[${d.crew.tag}] ${d.crew.name}`);
      btn(`${d.crew.members.length} member${d.crew.members.length === 1 ? '' : 's'}${d.crew.boss ? ' · you’re the boss' : ''}`, d.crew.members.join(', '), () => {}, false);
      btn('Your tag shows on your name tag', NET.status === 'on' && NET.crew !== d.crew.tag ? 'rejoin the world to show it' : 'crewmates can walk into your houses, and “Invite my crew” fills a heist in one tap', () => {}, false);
      btn('Leave the crew', d.crew.boss ? 'the longest-serving member becomes the boss' : '', () => { if (!confirm(`Leave ${d.crew.name}?`)) return; api('/crew/leave', {}).then(() => { NET.crewInfo = null; toast('You left the crew'); phoneApp('crew'); }).catch((e) => toast(e.message)); });
    } else {
      head('You’re not in a crew');
      btn('➕ Start a crew', 'pick a name and a 2–4 letter tag', () => {
        const name = (prompt('Crew name (3–24 letters or numbers):') || '').trim(); if (!name) return;
        const tag = (prompt('Tag, 2–4 letters (shows as [TAG]):') || '').trim().toUpperCase(); if (!tag) return;
        api('/crew/create', { name, tag }).then((r) => { toast(`Crew [${r.crew.tag}] ${r.crew.name} started — tell your friends the tag`); phoneApp('crew'); }).catch((e) => toast(e.message));
      }).classList.add('go');
      btn('🤝 Join a crew', 'you need its tag', () => { const tag = (prompt('The crew’s tag:') || '').trim(); if (!tag) return; api('/crew/join', { tag }).then((r) => { toast(`You’re in [${r.crew.tag}] ${r.crew.name}!`); phoneApp('crew'); }).catch((e) => toast(e.message)); });
    }
    head('Top crews');
    const list = document.createElement('div'); list.textContent = 'Loading…'; body.appendChild(list);
    fetch(ONLINE_URL + '/crews').then((r) => r.json()).then((c) => {
      if (PHONE.app !== 'crew') return; list.textContent = '';
      if (!c.crews || !c.crews.length) { list.textContent = 'No crews yet — start the first one.'; return; }
      c.crews.forEach((q, i) => { const b = document.createElement('div'); b.className = 'papp'; b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = `${i + 1}. [${q.tag}] ${q.name}`; b.lastChild.textContent = `${q.members} member${q.members === 1 ? '' : 's'} · worth $${Math.round(q.worth).toLocaleString()}`; list.appendChild(b); });
    }).catch(() => { list.textContent = 'Couldn’t reach the server.'; });
  }).catch((e) => { box.textContent = e.message; });
}
// ---------------------------------------------------------------- riding along: hop in a friend's car (E beside it while they drive)
const SEATS = [null, [-0.22, 0.1], [0.22, -0.95], [-0.22, -0.95]]; // [across (share of the car's width, + is right), along] for seats 1-3; the driver sits front right
function friendCarNear(maxD) {
  if (NET.status !== 'on' || player.state !== 'foot') return null;
  let best = null, bd = maxD;
  for (const P of NET.peers.values()) { if (!P.s || P.s.m !== 'c' || !P.veh || P.veh.kind !== 'car') continue; const d = Math.hypot(P.x - player.x, P.z - player.z); if (d < bd) { bd = d; best = P; } }
  return best;
}
function rideFriend() {
  const P = friendCarNear(5.5); if (!P) return false;
  const bike = /bike/.test(P.s.ty || ''), taken = new Set([...NET.peers.values()].filter((q) => q.s && q.s.m === 'q' && q.s.in === P.id).map((q) => q.s.seat));
  let seat = 1; while (taken.has(seat)) seat++;
  if (seat > (bike ? 1 : 3)) { toast(`${P.name}’s ${bike ? 'bike' : 'car'} is full`); return true; }
  RIDE.v = { x: P.x, z: P.z, h: P.h, y: 0, speed: 0, spec: P.veh.sp, peer: P.id, name: P.name }; RIDE.kind = 'friend'; RIDE.seat = seat;
  player.state = 'ride'; player.mode = 'car'; player.model.root.visible = false;
  toast(`Riding with ${P.name} — E to hop out`); sfxTone([660, 880], 0.15, 0.05); return true;
}
function updateFriendRide() { // called by updateRide while you're a passenger
  const V = RIDE.v, P = NET.status === 'on' && NET.peers.get(V.peer);
  if (!P || !P.s || P.s.m !== 'c') { toast(P ? `${V.name} got out — so do you` : `${V.name} left`); hopOut(true); return; }
  V.speed = Math.hypot(P.vx, P.vz); V.x = P.x; V.z = P.z; V.h = P.h; V.y = P.y || 0;
  const [sx, sz] = SEATS[RIDE.seat], w = (V.spec && V.spec.W) || 1.9, rx = Math.cos(V.h), rz = -Math.sin(V.h), fx = Math.sin(V.h), fz = Math.cos(V.h);
  player.x = V.x + rx * sx * w + fx * sz; player.z = V.z + rz * sx * w + fz * sz; player.h = V.h;
  $('jobhud').hidden = false; $('jobhud').textContent = `Riding with ${V.name} · E to hop out`;
}
function hopOut(force) {
  const V = RIDE.v; if (!V) return;
  if (!force && V.speed > 4) { toast(`Wait till ${V.name} slows down`); return; }
  const w = (V.spec && V.spec.W) || 1.9, side = (SEATS[RIDE.seat][0] < 0 ? -1 : 1) * (w / 2 + 1.2), rx = Math.cos(V.h), rz = -Math.sin(V.h);
  let px = V.x + rx * side, pz = V.z + rz * side; const out = freeSpotNear(px, pz, 20); if (out) { px = out[0]; pz = out[1]; }
  player.x = px; player.z = pz; player.y = 0; player.state = 'foot'; player.mode = 'foot'; player.model.root.visible = true; RIDE.v = null; RIDE.kind = null; $('jobhud').hidden = true;
}
// where a passenger sits, in whichever car they're in (yours, or another player's)
function passengerSpot(P) {
  const s = P.s; let host = null;
  if (s.in === NET.id) { if (player.state === 'car' && player.car) host = { x: player.car.x, z: player.car.z, h: player.car.h, y: surfaceAt(player.car.x, player.car.z, player.car.alt) + (player.car.y || 0), W: player.car.spec.W }; }
  else { const D = NET.peers.get(s.in); if (D && D.s && D.s.m === 'c') host = { x: D.x, z: D.z, h: D.h, y: standAt(D.x, D.z) + Math.max(0, D.y), W: (D.veh && D.veh.sp && D.veh.sp.W) || 1.9 }; }
  if (!host) return null;
  const seat = SEATS[s.seat] || SEATS[1], rx = Math.cos(host.h), rz = -Math.sin(host.h), fx = Math.sin(host.h), fz = Math.cos(host.h);
  return { x: host.x + rx * seat[0] * host.W + fx * seat[1], z: host.z + rz * seat[0] * host.W + fz * seat[1], y: host.y + 0.25, h: host.h };
}
