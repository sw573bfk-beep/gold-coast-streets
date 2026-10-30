// ============================================================================
// Gold Coast Streets — activities: one list of everything there is to do (phone → Activities), each with a real
// place, an objective, a finish and a reward. They share a few engines (actgames.js: mini-games in the shop panel;
// actworld.js: checkpoint courses, photography, wildlife, collectibles and the jobs out in the world), and one record
// of progress kept in the existing save (ECON.act): times done, personal bests, category levels, collections, stats,
// daily and weekly challenges and phone notifications. Money goes through the same wallet as everything else.
// ============================================================================
const ACTS = [], ACT_BY = {};
const ACT_CATS = { water: '🌊 Beach & water', sport: '⚽ Sports & fitness', explore: '🧭 Adventure', fun: '🎟️ Entertainment', job: '💼 Jobs' };
let ACT_CUR = null; // the activity running now: { id, t, ... }
function actData() {
  const A = ECON.act || (ECON.act = {});
  for (const k of ['done', 'best', 'xp', 'coll', 'stats']) A[k] = A[k] || {};
  A.notes = A.notes || []; A.jobLog = A.jobLog || []; A.found = A.found || [];
  return A;
}
function defAct(o) { o.diff = o.diff || 1; ACTS.push(o); ACT_BY[o.id] = o; }
// a real place from the map data (by name), or the fallback position
const VENUES = {};
function venue(name, re, x, z) {
  if (VENUES[name]) return VENUES[name];
  const e = REGION && REGION.search && REGION.search.find((q) => re.test(q[0]));
  return (VENUES[name] = e ? { name: e[0], x: e[2], z: e[3] } : { name, x, z });
}
function actWhere(a) { return typeof a.at === 'function' ? a.at() : a.at; }
// ---------------------------------------------------------------- progress, rewards, levels
const catLevel = (cat) => Math.floor(Math.sqrt((actData().xp[cat] || 0) / 60)) + 1;
function stat(key, n = 1) { const S = actData().stats; S[key] = (S[key] || 0) + n; checkChallenges(); }
function actBest(id, v) { // returns true for a new personal best
  const a = ACT_BY[id], B = actData().best; if (!a || !a.unit || !Number.isFinite(v)) return false;
  const better = B[id] === undefined || (a.low ? v < B[id] : v > B[id]); if (better) B[id] = v; return better;
}
function actComplete(id, r = {}) {
  const a = ACT_BY[id], A = actData(); if (!a) return;
  if (ACT_CUR && ACT_CUR.id === id) ACT_CUR = null;
  A.done[id] = (A.done[id] || 0) + 1; A.xp[a.cat] = (A.xp[a.cat] || 0) + 10 * a.diff + (r.xp || 0);
  const money = Math.round(r.money || 0); if (money > 0) { player.money += money; stat('earned', money); }
  const pb = r.score !== undefined && actBest(id, r.score);
  stat('activities'); if (a.stat) stat(a.stat);
  if (A.done[id] === 1) actNote(`✅ First time: ${a.name}`, true);
  toast(`${a.icon || '✅'} ${r.msg || a.name + ' complete'}${money ? ` · +$${money}` : ''}${pb ? ' · new personal best!' : ''}`);
  sfxTone([523, 659, 784], 0.35, 0.06, 'triangle'); saveGame();
}
function actFail(id, msg) { if (ACT_CUR && ACT_CUR.id === id) ACT_CUR = null; toast(msg || 'Activity over'); }
function collect(set, key, label) { // collections: fish, photos, wildlife, birds, caches, treasure
  const C = actData().coll; C[set] = C[set] || []; if (C[set].includes(key)) return false;
  C[set].push(key); stat('collectibles'); actNote(`📒 New in your ${set} collection: ${label || key}`); saveGame(); return true;
}
const collCount = (set) => (actData().coll[set] || []).length;
// ---------------------------------------------------------------- notifications (kept quiet: only things worth knowing)
function actNote(text, quiet) {
  const A = actData(); A.notes.unshift({ text, t: Date.now(), read: false }); A.notes.length = Math.min(A.notes.length, 30);
  if (!quiet) toast(text);
}
const unreadNotes = () => actData().notes.filter((n) => !n.read).length;
// ---------------------------------------------------------------- daily and weekly challenges (the same for everyone on a day)
const CHALLENGES = [
  ['activities', 3, 'Do any 3 activities', 150], ['fish', 3, 'Catch 3 fish', 120], ['waves', 3, 'Ride 3 waves', 120], ['courses', 2, 'Finish 2 timed courses', 160],
  ['shifts', 1, 'Work a job shift', 120], ['photos', 2, 'Take 2 activity photos', 100], ['sportWins', 2, 'Win 2 sports games', 160], ['collectibles', 2, 'Find 2 collectibles', 140],
  ['km', 5, 'Travel 5 km', 100], ['minigames', 3, 'Play 3 mini-games', 100],
];
const WEEKLY = [['activities', 20, 'Do 20 activities', 1200], ['shifts', 6, 'Work 6 shifts', 900], ['collectibles', 10, 'Find 10 collectibles', 1000], ['sportWins', 10, 'Win 10 sports games', 1000], ['km', 40, 'Travel 40 km', 800]];
function seededPick(list, n, seed) { const out = [], L = list.slice(); let s = seed; while (out.length < n && L.length) { s = (s * 9301 + 49297) % 233280; out.push(L.splice(s % L.length, 1)[0]); } return out; }
function challengeSet(kind) {
  const A = actData(), day = Math.floor(Date.now() / 86400000), week = Math.floor((day + 3) / 7), key = kind === 'daily' ? day : week;
  let C = A[kind];
  if (!C || C.key !== key) { // a new day (or week): fresh challenges, counted from now
    const pool = kind === 'daily' ? CHALLENGES : WEEKLY, picks = seededPick(pool, 3, key * (kind === 'daily' ? 7 : 13));
    C = A[kind] = { key, base: {}, done: [], list: picks.map((p) => p[0]) };
    for (const p of picks) C.base[p[0]] = A.stats[p[0]] || 0;
    if (kind === 'daily' && ACTS.length) actNote('🗓️ New daily challenges are up (phone → Missions)', true);
  }
  return C;
}
function challengeRows(kind) {
  const C = challengeSet(kind), A = actData(), pool = kind === 'daily' ? CHALLENGES : WEEKLY;
  return C.list.map((k) => { const p = pool.find((q) => q[0] === k), have = (A.stats[k] || 0) - (C.base[k] || 0); return { k, text: p[2], n: p[1], have: Math.min(p[1], have), reward: p[3], done: C.done.includes(k) }; });
}
function checkChallenges() {
  if (!ECON.act) return;
  for (const kind of ['daily', 'weekly']) for (const r of challengeRows(kind)) if (!r.done && r.have >= r.n) {
    challengeSet(kind).done.push(r.k); player.money += r.reward; actData().stats.earned = (actData().stats.earned || 0) + r.reward;
    actNote(`🏅 ${kind === 'daily' ? 'Daily' : 'Weekly'} challenge done: ${r.text} · +$${r.reward}`); sfxTone([784, 1046], 0.3, 0.05);
  }
}
// ---------------------------------------------------------------- distance and places discovered
let actDistT = 0, actLast = null;
function updateActStats(dt) {
  if (!started || !ECON.act) actData();
  const p = { x: player.x, z: player.z };
  if (actLast) { const d = Math.hypot(p.x - actLast.x, p.z - actLast.z); if (d < 60) { ECON.act.stats.m = (ECON.act.stats.m || 0) + d; if (ECON.act.stats.m - (ECON.act.stats.km || 0) * 1000 >= 1000) stat('km'); } } // teleports (taxi) don't count
  actLast = p;
  actDistT -= dt; if (actDistT > 0) return; actDistT = 3;
  const place = district(player.x, player.z);
  if (place && !actData().found.includes(place)) { actData().found.push(place); stat('places'); if (player.state === 'car' && player.car && player.car.spec.bike) stat('bikePlaces'); }
}
// ---------------------------------------------------------------- the activity markers out in the world (E to start)
const ACT_SPRITES = new Map();
function actIcon(a) {
  if (ACT_SPRITES.has(a.id)) return ACT_SPRITES.get(a.id);
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,14,18,.8)'; g.beginPath(); g.arc(48, 48, 44, 0, TAU); g.fill(); g.strokeStyle = '#f6c445'; g.lineWidth = 5; g.stroke();
  g.font = '50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(a.icon || '⭐', 48, 52);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true, toneMapped: false })); s.scale.set(2.2, 2.2, 1); s.visible = false; scene.add(s);
  ACT_SPRITES.set(a.id, s); return s;
}
let actMarkT = 0;
function updateActMarkers(dt) {
  actMarkT -= dt; if (actMarkT > 0) return; actMarkT = 0.5;
  for (const a of ACTS) {
    if (a.anywhere || a.cat === 'job') continue;
    const w = actWhere(a); if (!w) continue; const d = Math.hypot(w.x - player.x, w.z - player.z);
    if (d < 260) { const s = actIcon(a); s.visible = !ACT_CUR; s.position.set(w.x, standAt(w.x, w.z) + 3.2 + Math.sin(elapsed * 2) * 0.15, w.z); }
    else if (ACT_SPRITES.has(a.id)) ACT_SPRITES.get(a.id).visible = false;
  }
}
function actNear(r = 12) { if (ACT_CUR || player.state !== 'foot') return null; let best = null, bd = r; for (const a of ACTS) { if (a.anywhere || a.cat === 'job') continue; const w = actWhere(a); if (!w) continue; const d = Math.hypot(w.x - player.x, w.z - player.z); if (d < bd) { bd = d; best = a; } } return best; }
function actUse() { const a = actNear(8); if (!a) return false; startAct(a.id); return true; }
// ---------------------------------------------------------------- starting one
function actReady(a) { // null when it can start here, otherwise why not
  if (a.req) { const why = a.req(); if (why) return why; }
  if (ACT_CUR) return `You’re in the middle of ${ACT_BY[ACT_CUR.id].name}`;
  if (STORY.M || MISSION || HEIST.stage || TRIAL || ECON.shift) return 'Finish what you’re doing first';
  if (a.anywhere) return null;
  const w = actWhere(a); if (w && Math.hypot(w.x - player.x, w.z - player.z) > (a.range || 60)) return `Head to ${w.name} first`;
  return null;
}
function startAct(id) {
  const a = ACT_BY[id], why = actReady(a);
  if (why) { toast(why); if (/^Head to/.test(why)) { const w = actWhere(a); directions(w.name, w.x, w.z); } return false; }
  if (PHONE.open) closePhone();
  ACT_CUR = { id, t: 0 }; stat('started');
  a.start(ACT_CUR); return true;
}
function quitAct() { if (!ACT_CUR) return; const a = ACT_BY[ACT_CUR.id]; if (a.quit) a.quit(ACT_CUR); ACT_CUR = null; WAYPOINT = null; clearGPS(); $('jobhud').hidden = true; toast(`${a.name}: stopped`); }
function updateActivities(dt) {
  updateActStats(dt); updateActMarkers(dt);
  if (ACT_CUR) { ACT_CUR.t += dt; const a = ACT_BY[ACT_CUR.id]; if (a.tick) a.tick(ACT_CUR, dt); if (player.deadT > 0 && ACT_CUR) actFail(ACT_CUR.id, `${a.name}: over`); }
}
// ---------------------------------------------------------------- phone apps: Activities, Missions, Statistics, Notifications
function actsApp(btn, head) {
  const body = $('phone-body'), A = actData();
  const q = document.createElement('input'); q.className = 'pinput'; q.placeholder = '🔍 Search activities'; q.value = PHONE.actQ || ''; body.appendChild(q);
  const chips = document.createElement('div'); chips.className = 'psays';
  for (const [k, label] of [['all', 'All'], ...Object.entries(ACT_CATS), ['done', '✅ Done']]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if ((PHONE.actCat || 'all') === k) b.style.background = '#f6c445', b.style.color = '#111'; b.addEventListener('click', () => { PHONE.actCat = k; phoneApp('acts'); }); chips.appendChild(b); }
  body.appendChild(chips);
  const listEl = document.createElement('div'); body.appendChild(listEl);
  const render = () => {
    listEl.innerHTML = ''; const term = q.value.trim().toLowerCase(), cat = PHONE.actCat || 'all';
    const rows = ACTS.filter((a) => (cat === 'all' || (cat === 'done' ? A.done[a.id] : a.cat === cat)) && (!term || (a.name + ' ' + a.desc + ' ' + (actWhere(a) || {}).name).toLowerCase().includes(term)));
    const sorted = rows.map((a) => { const w = a.anywhere ? null : actWhere(a); return { a, w, d: w ? Math.hypot(w.x - player.x, w.z - player.z) : 0 }; }).sort((x, y) => x.d - y.d);
    for (const { a, w } of sorted) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'papp'; b.innerHTML = '<b></b><span></span>';
      b.firstChild.textContent = `${a.icon || '⭐'} ${a.name}${A.done[a.id] ? '  ✅' : ''}`;
      b.lastChild.textContent = `${'★'.repeat(a.diff)} · ${a.anywhere ? 'anywhere' : `${w.name} · ${km(w.x, w.z)}`}`;
      b.addEventListener('click', () => { PHONE.act = a.id; PHONE.actQ = q.value; phoneApp('act'); }); listEl.appendChild(b);
    }
    if (!sorted.length) listEl.textContent = 'Nothing matches.';
  };
  q.addEventListener('input', render); render();
  head(`${Object.keys(A.done).length} of ${ACTS.length} activities tried`);
}
function actApp(btn, head) {
  const a = ACT_BY[PHONE.act]; if (!a) return; const A = actData(), w = a.anywhere ? null : actWhere(a), why = actReady(a);
  head(`${a.icon || ''} ${a.name}`);
  btn(ACT_CATS[a.cat], a.desc, () => {}, false);
  btn(a.anywhere ? 'Where: anywhere' : `Where: ${w.name}`, a.anywhere ? (a.where || '') : `${km(w.x, w.z)} away${a.note ? ' · ' + a.note : ''}`, () => {}, false);
  btn(`Difficulty ${'★'.repeat(a.diff)}${'☆'.repeat(3 - a.diff)} · Reward: ${a.reward}`, a.needs ? 'Needs: ' + a.needs : 'No requirements', () => {}, false);
  btn(`Done ${A.done[a.id] || 0}×${A.best[a.id] !== undefined ? ` · best ${a.fmt ? a.fmt(A.best[a.id]) : A.best[a.id]}` : ''}`, `${ACT_CATS[a.cat].slice(2)} level ${catLevel(a.cat)}${a.progress ? ' · ' + a.progress() : ''}`, () => {}, false);
  if (ACT_CUR && ACT_CUR.id === a.id) btn('Stop this activity', '', () => { quitAct(); phoneApp('act'); });
  else {
    btn(why ? (/^Head to/.test(why) ? '📍 Take me there' : why) : '▶ Start', why && /^Head to/.test(why) ? 'sets your GPS; press E at the marker or Start here when you arrive' : '', () => startAct(a.id), !why || /^Head to/.test(why)).classList.add('go');
  }
  btn('← All activities', '', () => phoneApp('acts'));
}
function missionsApp(btn, head) {
  head('Right now');
  const cur = [];
  if (ACT_CUR) cur.push([`${ACT_BY[ACT_CUR.id].icon} ${ACT_BY[ACT_CUR.id].name}`, () => { PHONE.act = ACT_CUR.id; phoneApp('act'); }]);
  if (STORY.M) cur.push([`😎 ${CHAPTERS[STORY.M.i].title}`, () => phoneApp('rocco')]);
  if (ECON.shift) cur.push([`💼 ${JOBS[ECON.shift.job].name} shift`, () => phoneApp('jobs')]);
  if (TRIAL) cur.push([`⏱ ${TRIAL.R.name}`, () => phoneApp('trials')]);
  if (MISSION) cur.push([`🏁 ${MISSION.title}`, () => phoneApp('home')]);
  if (!cur.length) btn('Nothing on right now', 'pick something from Activities', () => phoneApp('acts'));
  for (const [t, fn] of cur) btn(t, 'tap to see it', fn);
  for (const [kind, label] of [['daily', 'Daily challenges'], ['weekly', 'Weekly challenges']]) {
    head(label);
    for (const r of challengeRows(kind)) btn(`${r.done ? '✅' : '◻️'} ${r.text}`, `${r.have}/${r.n} · reward $${r.reward}`, () => {}, false);
  }
  head('Special events');
  const F = festivalToday(); btn(`🎪 ${F.name}`, `today at ${F.w.name} · ${km(F.w.x, F.w.z)}`, () => { PHONE.act = 'festival'; phoneApp('act'); });
  head(`Completed: ${Object.values(actData().done).reduce((a, b) => a + b, 0)} activities · ${(STORY.done || 0)} story jobs`);
}
function statsApp(btn, head) {
  const S = actData().stats, A = actData();
  head('Your Gold Coast');
  const rows = [
    ['Activities completed', S.activities || 0], ['Distance travelled', ((S.m || 0) / 1000).toFixed(1) + ' km'], ['Places discovered', (A.found || []).length],
    ['Money earned from activities and jobs', '$' + Math.round(S.earned || 0).toLocaleString()], ['Job shifts worked', Object.values(ECON.jobs).reduce((a, j) => a + (j.shifts || 0), 0)],
    ['Fish caught', S.fish || 0], ['Fish species', collCount('fish') + ' / ' + (FISH_OCEAN.length + FISH_INSHORE.length - 3)], ['Waves ridden', S.waves || 0], ['Best wave', (SURF.best || 0) + ' pts'],
    ['Sports wins', S.sportWins || 0], ['Timed courses finished', S.courses || 0], ['Photos taken', S.photos || 0], ['Landmarks photographed', collCount('photos') + ' / ' + LANDMARKS.length],
    ['Wildlife spotted', collCount('wildlife') + ' / ' + WILDLIFE.filter((w) => !w.bird).length], ['Birds spotted', collCount('birds') + ' / ' + WILDLIFE.filter((w) => w.bird).length],
    ['Geocaches found', collCount('caches') + ' / ' + CACHES().length], ['Treasure found', collCount('treasure')], ['Collectibles', S.collectibles || 0],
  ];
  for (const [k, v] of rows) btn(k, String(v), () => {}, false);
  head('Levels');
  for (const [c, label] of Object.entries(ACT_CATS)) btn(`${label}: level ${catLevel(c)}`, `${actData().xp[c] || 0} xp`, () => {}, false);
  head('Personal records');
  const recs = ACTS.filter((a) => A.best[a.id] !== undefined);
  if (!recs.length) btn('No records yet', 'timed and scored activities keep your best', () => {}, false);
  for (const a of recs) btn(`${a.icon} ${a.name}`, a.fmt ? a.fmt(A.best[a.id]) : String(A.best[a.id]), () => {}, false);
}
function notesApp(btn, head) {
  const N = actData().notes; head(N.length ? 'Latest first' : 'No notifications');
  for (const n of N) { btn(n.text, new Date(n.t).toLocaleString(), () => {}, false); n.read = true; }
}
