// ============================================================================
// Gold Coast Streets — single player or multiplayer. Single player saves on this device, like always. Multiplayer
// needs an account (a name and a password, nothing else): your multiplayer money, cars, houses and look are saved
// to the account so you can carry on anywhere, and kept apart from single player (no bringing offline money online).
// Records set in public worlds go on the leaderboards: the richest, the fastest time trials, the biggest fish and the
// best wave (phone → Records).
// ============================================================================
const MODE = (() => { try { return sessionStorage.getItem('gcs-mode') === 'multi' ? 'multi' : 'single'; } catch (e) { return 'single'; } })();
const ACCT = { token: null, name: null, loaded: false, saveT: 0, dirty: false, lastSave: 0 };
try { ACCT.token = localStorage.getItem('gcs-token'); ACCT.name = localStorage.getItem('gcs-acct'); } catch (e) { /* storage blocked */ }
function api(path, body, method) {
  const headers = { 'Content-Type': 'application/json' }; if (ACCT.token) headers.Authorization = 'Bearer ' + ACCT.token;
  return fetch(ONLINE_URL + path, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Server error'); return d; });
}
function setMode(m) { try { if (m === 'multi') sessionStorage.setItem('gcs-mode', 'multi'); else sessionStorage.removeItem('gcs-mode'); } catch (e) { /* storage blocked */ } location.reload(); }
function signedIn(d) { ACCT.token = d.token; ACCT.name = d.name; try { localStorage.setItem('gcs-token', d.token); localStorage.setItem('gcs-acct', d.name); } catch (e) { /* storage blocked */ } }
function signOut() {
  if (ACCT.token) api('/logout', {}).catch(() => {});
  try { localStorage.removeItem('gcs-token'); localStorage.removeItem('gcs-acct'); } catch (e) { /* storage blocked */ }
  setMode('single');
}
// ---------------------------------------------------------------- the start screen
function initModeMenu() {
  const play = $('play'), box = document.createElement('div'); box.id = 'modes';
  play.parentNode.insertBefore(box, play);
  if (MODE === 'single') {
    play.dataset.label = '▶ Single player';
    const mp = document.createElement('button'); mp.type = 'button'; mp.id = 'play-mp'; mp.textContent = '🌐 Multiplayer';
    mp.addEventListener('click', () => { if (ACCT.token) api('/me').then(() => setMode('multi')).catch(() => accountForm(box)); else accountForm(box); });
    play.after(mp);
  } else {
    play.dataset.label = '▶ Play online';
    box.innerHTML = '<div class="acct-who"></div>'; box.firstChild.textContent = `🌐 Multiplayer · signed in as ${ACCT.name || '…'}`;
    const row = document.createElement('div'); row.className = 'acct-row';
    const sp = document.createElement('button'); sp.type = 'button'; sp.textContent = 'Back to single player'; sp.addEventListener('click', () => setMode('single'));
    const out = document.createElement('button'); out.type = 'button'; out.textContent = 'Log out'; out.addEventListener('click', signOut);
    row.append(sp, out); box.appendChild(row);
  }
}
function accountForm(box) {
  box.innerHTML = `<div class="acct"><div class="acct-tabs"><button type="button" data-t="login" class="on">Log in</button><button type="button" data-t="signup">Create account</button></div>
    <input id="acct-name" maxlength="16" placeholder="Name (3–16 letters or numbers)" autocomplete="username">
    <input id="acct-pass" type="password" maxlength="64" placeholder="Password (6+ characters)" autocomplete="current-password">
    <button type="button" id="acct-go">Log in</button><div id="acct-msg"></div>
    <div class="acct-note">No email needed. Write your password down — without an email it can’t be reset.</div></div>`;
  let tab = 'login';
  box.querySelectorAll('.acct-tabs button').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.t; box.querySelectorAll('.acct-tabs button').forEach((o) => o.classList.toggle('on', o === b));
    $('acct-go').textContent = tab === 'login' ? 'Log in' : 'Create account'; $('acct-pass').autocomplete = tab === 'login' ? 'current-password' : 'new-password';
  }));
  const go = () => {
    const name = $('acct-name').value.trim(), password = $('acct-pass').value; $('acct-msg').textContent = '…';
    api(tab === 'login' ? '/login' : '/signup', { name, password }).then((d) => { signedIn(d); setMode('multi'); }).catch((e) => { $('acct-msg').textContent = e.message; });
  };
  $('acct-go').addEventListener('click', go); $('acct-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('acct-name').focus();
}
// multiplayer progress comes from the account, not this device
function loadAccount() {
  if (MODE !== 'multi') return;
  $('play').disabled = true; $('play').textContent = 'Loading your account…';
  api('/save').then((d) => {
    if (d.data) applySave(d.data);
    rebuildPlayer(); ACCT.loaded = true; $('play').disabled = false; $('play').textContent = $('play').dataset.label;
  }).catch((e) => { $('play').textContent = e.message === 'log in first' ? 'Signed out — log in again' : 'Couldn’t reach the server'; if (e.message === 'log in first') signOut(); });
}
function cloudSave(obj) { // called by saveGame in multiplayer: sent at most every 15 s
  ACCT.pending = obj; if (ACCT.saveT > 0) return;
  const wait = Math.max(0, 15000 - (Date.now() - ACCT.lastSave)); ACCT.saveT = 1;
  setTimeout(() => {
    ACCT.saveT = 0; ACCT.lastSave = Date.now(); const data = ACCT.pending; ACCT.pending = null; if (!data || !ACCT.loaded) return;
    api('/save', { data, world: NET.world && NET.world.public ? NET.world.code : null }).catch(() => {});
  }, wait);
}
// ---------------------------------------------------------------- records (public worlds only)
const BOARDS = [['money', '💰 Richest', (v) => '$' + Math.round(v).toLocaleString()], ['fish', '🎣 Biggest fish', (v) => v.toFixed(2) + ' kg'], ['wave', '🏄 Best wave', (v) => Math.round(v).toLocaleString() + ' pts']];
function recordable() { return MODE === 'multi' && NET.status === 'on' && NET.world && NET.world.public; }
function submitRecord(board, value, detail) {
  if (!recordable()) return;
  api('/record', { board, value, detail, world: NET.world.code }).then((d) => { if (d.best) { toast('🏆 New personal best on the leaderboard!'); sfxTone([784, 1046, 1318], 0.4, 0.06, 'triangle'); } }).catch(() => {});
}
function recordsApp(btn, head) {
  head(recordable() ? 'Records count in this public world' : MODE === 'multi' ? 'Join a public world to set records' : 'Records are set in public multiplayer worlds');
  for (const [b, label] of BOARDS) btn(label, 'top 20', () => { PHONE.board = b; phoneApp('board'); });
  head('Time trials (fastest)');
  for (const R of TRIALS) btn(`⏱ ${R.name}`, 'top 20', () => { PHONE.board = 'trial:' + R.id; phoneApp('board'); });
}
function boardApp(btn, head) {
  const b = PHONE.board, B = BOARDS.find((q) => q[0] === b), R = b.startsWith('trial:') && TRIALS.find((q) => 'trial:' + q.id === b);
  const fmt = B ? B[2] : (v) => fmtTime(v);
  head(B ? B[1] : '⏱ ' + R.name);
  const list = document.createElement('div'); list.textContent = 'Loading…'; $('phone-body').appendChild(list);
  api('/leaders?board=' + encodeURIComponent(b)).then((d) => {
    if (PHONE.app !== 'board') return; list.textContent = '';
    if (!d.leaders.length) list.textContent = 'No records yet — be the first!';
    d.leaders.forEach((L, i) => { const r = document.createElement('div'); r.className = 'lrow' + (L.name === ACCT.name ? ' me' : ''); r.innerHTML = '<b></b><span></span><em></em>'; r.children[0].textContent = `${i + 1}. ${L.name}`; r.children[1].textContent = L.detail || ''; r.children[2].textContent = fmt(L.value); list.appendChild(r); });
    if (d.me && d.me.rank > 20) { const r = document.createElement('div'); r.className = 'lrow me'; r.innerHTML = '<b></b><span></span><em></em>'; r.children[0].textContent = `${d.me.rank}. you`; r.children[1].textContent = d.me.detail || ''; r.children[2].textContent = fmt(d.me.value); list.appendChild(r); }
  }).catch(() => { list.textContent = 'Couldn’t reach the server.'; });
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
// ---------------------------------------------------------------- time trials: drive between real places against the clock
const TRIALS = [
  { id: 'cavill-pacificfair', name: 'Cavill Mall → Pacific Fair', a: [727, 305], b: [440, 4067] },
  { id: 'star-southport', name: 'The Star → Australia Fair', a: [498, 3640], b: [-735, -3470] },
  { id: 'robina-surfers', name: 'Robina Town Centre → Cavill Mall', a: [-3704, 8614], b: [727, 305] },
  { id: 'southport-burleigh', name: 'Australia Fair → Burleigh Heads', a: [-735, -3470], b: [1580, 11349] },
];
let TRIAL = null; // { R, phase: 'go' (to the start) | 'run', t }
function trialsApp(btn, head) {
  head('Drive it as fast as you can');
  if (TRIAL) btn('Cancel the time trial', TRIAL.R.name, () => { endTrial('Time trial cancelled'); phoneApp('trials'); });
  for (const R of TRIALS) btn(`⏱ ${R.name}`, `${(Math.hypot(R.a[0] - R.b[0], R.a[1] - R.b[1]) / 1000).toFixed(1)} km as the crow flies · start ${km(R.a[0], R.a[1])} away`, () => {
    if (STORY.M || MISSION || HEIST.stage) { toast('Finish what you’re doing first'); return; }
    TRIAL = { R, phase: 'go', t: 0 }; WAYPOINT = { name: 'Time trial start', x: R.a[0], z: R.a[1] }; GPS.t = 0; closePhone();
    toast(`Get to the start in any car — the clock starts when you drive off`);
  });
}
function endTrial(msg) { TRIAL = null; WAYPOINT = null; clearGPS(); $('jobhud').hidden = true; if (msg) toast(msg); }
function updateTrial(dt) {
  const T = TRIAL; if (!T) return;
  const R = T.R, dA = Math.hypot(R.a[0] - player.x, R.a[1] - player.z), dB = Math.hypot(R.b[0] - player.x, R.b[1] - player.z), inCar = player.state === 'car';
  if (player.deadT > 0) return endTrial('Time trial over');
  $('jobhud').hidden = false;
  if (T.phase === 'go') {
    $('jobhud').textContent = `⏱ ${R.name} · get to the start (${Math.round(dA)} m)${inCar ? '' : ' · you need a car'}`;
    if (dA < 25 && inCar) { T.phase = 'ready'; toast('On your marks… drive off to start the clock'); sfxTone([440], 0.2, 0.06); }
  } else if (T.phase === 'ready') {
    $('jobhud').textContent = `⏱ ${R.name} · drive off to start`;
    if (dA > 25) { if (!inCar) return endTrial('You need to drive it'); T.phase = 'run'; T.t = 0; WAYPOINT = { name: 'Finish: ' + R.name.split('→ ')[1], x: R.b[0], z: R.b[1] }; GPS.t = 0; sfxTone([880], 0.3, 0.07); }
  } else {
    T.t += dt; $('jobhud').textContent = `⏱ ${fmtTime(T.t)} · ${Math.round(dB)} m to go${recordable() ? '' : ' · (records only count in public worlds)'}`;
    if (!inCar && player.state !== 'exit' && player.state !== 'enter') return endTrial('You left the car — time trial over');
    if (dB < 25) { const t = Math.round(T.t * 100) / 100; endTrial(`🏁 ${R.name}: ${fmtTime(t)}`); sfxTone([523, 659, 784, 1046], 0.5, 0.07, 'triangle'); submitRecord('trial:' + R.id, t, CAR_LABEL[player.car && player.car.type] || (player.car && player.car.type) || ''); }
  }
}
