// ============================================================================
// Gold Coast Streets — outside the game: how many are playing online (on the start screen), time played, money the
// admin sends, and the admin panel. The panel opens only for the accounts the server lists as admins (ADMINS in
// server/wrangler.toml); the server checks every admin request itself, so the button here is only a shortcut.
// ============================================================================
const ADMIN = { tab: 'overview', sort: 'seen', q: '', countT: null };
const fmtDur = (ms) => { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const fmtAgo = (t) => { if (!t) return 'never'; const s = (Date.now() - t) / 1000; return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; };
const fmtMoney = (v) => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v || 0)).toLocaleString();
function el(tag, cls, text, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
// ---------------------------------------------------------------- the start screen: players online now, and the admin button
function initHomeExtras(box) {
  const line = el('div', 'online-now', '🌐 Checking who’s online…'), h2 = document.querySelector('#menu h2'); if (h2) h2.after(line); else box.prepend(line); // right under the title
  const count = () => { if ($('menu').hidden) return; fetch(ONLINE_URL + '/online').then((r) => r.json()).then((d) => { line.textContent = `🌐 ${d.players} player${d.players === 1 ? '' : 's'} online now${d.worlds ? ` · ${d.worlds} world${d.worlds === 1 ? '' : 's'}` : ''}`; line.classList.toggle('live', d.players > 0); }).catch(() => { line.textContent = '🌐 Online server unreachable'; }); };
  count(); clearInterval(ADMIN.countT); ADMIN.countT = setInterval(count, 30000);
  if (!ACCT.token) return;
  api('/me').then((d) => { if (!d.admin) return; const b = el('button', 'admin-btn', '🛠 Admin'); b.type = 'button'; b.addEventListener('click', openAdmin); box.appendChild(b); }).catch(() => {});
}
// ---------------------------------------------------------------- time played and gifts from the admin
setInterval(() => {
  if (!ACCT.token || typeof started === 'undefined' || !started || paused || document.hidden) return;
  api('/ping', { claim: MODE === 'multi' && ACCT.loaded }).then((d) => applyGifts(d.gifts)).catch(() => {});
}, 60000);
function claimGifts() { if (MODE === 'multi' && ACCT.loaded) api('/gifts').then((d) => applyGifts(d.gifts)).catch(() => {}); }
function applyGifts(list) {
  if (!list || !list.length || MODE !== 'multi') return;
  for (const g of list) {
    const a = Math.round(Number(g.amount) || 0); if (!a) continue;
    if (a > 0) { player.money += a; toast(`🎁 The admin sent you ${fmtMoney(a)}${g.note ? ` — “${g.note}”` : ''}`); sfxTone([660, 880, 1175], 0.4, 0.06, 'triangle'); }
    else { const take = -a, w = Math.min(player.money, take); player.money -= w; ECON.bank = Math.max(0, ECON.bank - (take - w)); toast(`The admin took ${fmtMoney(take)}${g.note ? ` — “${g.note}”` : ''}`); }
  }
  saveGame();
}
function showAnnouncement(text) {
  const b = $('announce') || el('div', '', null, document.body); b.id = 'announce'; b.textContent = '📢 ' + String(text).slice(0, 140); b.hidden = false;
  sfxTone([523, 784, 1046], 0.5, 0.06, 'triangle'); clearTimeout(b.t); b.t = setTimeout(() => { b.hidden = true; }, 9000);
}
// ---------------------------------------------------------------- the admin panel
function openAdmin() {
  let P = $('admin'); if (!P) { P = el('div', '', null, document.body); P.id = 'admin'; }
  P.hidden = false; P.innerHTML = '';
  const top = el('div', 'adm-top', null, P); el('b', '', '🛠 Admin · Gold Coast Streets', top);
  const close = el('button', 'adm-x', '✕', top); close.type = 'button'; close.addEventListener('click', () => { P.hidden = true; });
  const tabs = el('div', 'adm-tabs', null, P);
  for (const [k, label] of [['overview', 'Overview'], ['users', 'Accounts'], ['records', 'Records'], ['crews', 'Crews'], ['log', 'Log']]) {
    const b = el('button', ADMIN.tab === k ? 'on' : '', label, tabs); b.type = 'button'; b.addEventListener('click', () => { ADMIN.tab = k; openAdmin(); });
  }
  const body = el('div', 'adm-body', 'Loading…', P);
  const fail = (e) => { body.textContent = e.message === 'not allowed' ? 'This account isn’t an admin.' : `Couldn’t load: ${e.message}`; };
  ({ overview: adminOverview, users: adminUsers, records: adminRecords, crews: adminCrews, log: adminLog })[ADMIN.tab](body).catch(fail);
}
function admBtn(parent, label, fn, cls) { const b = el('button', 'adm-b' + (cls ? ' ' + cls : ''), label, parent); b.type = 'button'; b.addEventListener('click', fn); return b; }
async function adminOverview(body) {
  const d = await api('/admin/overview'); body.textContent = '';
  const tiles = el('div', 'adm-tiles', null, body);
  for (const [n, label] of [[d.online, 'online now'], [d.accounts, 'accounts'], [d.newWeek, 'new this week'], [d.activeDay, 'played today'], [d.playHours + ' h', 'played in all'], [d.crews, 'crews'], [d.banned, 'banned']]) { const t = el('div', 'adm-tile', null, tiles); el('b', '', String(n), t); el('span', '', label, t); }
  el('h3', '', `Live worlds (${d.worlds.length})`, body);
  if (!d.worlds.length) el('p', 'adm-dim', 'Nobody is in a world right now.', body);
  for (const w of d.worlds) {
    const c = el('div', 'adm-card', null, body); el('b', '', `World ${w.code} · ${w.players} player${w.players === 1 ? '' : 's'} · ${w.public ? 'public' : 'friends only'}`, c);
    for (const p of w.people) { const r = el('div', 'adm-row click', null, c); el('span', '', `${p.crew ? `[${p.crew}] ` : ''}${p.name}`, r); el('em', '', `on for ${fmtDur(Date.now() - p.since)}`, r); r.addEventListener('click', () => adminUser(body, p.uid)); }
  }
  el('h3', '', 'Announcement', body);
  const ta = el('textarea', 'adm-in', null, body); ta.maxLength = 140; ta.placeholder = 'A message on everyone’s screen in every world (140 letters)';
  admBtn(body, '📢 Send to everyone online', async () => { try { const r = await api('/admin/announce', { text: ta.value }); toast(`Sent to ${r.n} player${r.n === 1 ? '' : 's'}`); ta.value = ''; } catch (e) { toast(e.message); } }, 'go');
}
async function adminUsers(body) {
  const d = await api('/admin/users?sort=' + ADMIN.sort); body.textContent = '';
  const bar = el('div', 'adm-bar', null, body);
  const q = el('input', 'adm-in', null, bar); q.placeholder = 'Search accounts'; q.value = ADMIN.q;
  const sel = el('select', 'adm-in', null, bar); for (const [k, l] of [['seen', 'Last seen'], ['time', 'Most played'], ['new', 'Newest'], ['name', 'Name']]) { const o = el('option', '', l, sel); o.value = k; o.selected = ADMIN.sort === k; }
  sel.addEventListener('change', () => { ADMIN.sort = sel.value; adminUsers(body).catch((e) => { body.textContent = e.message; }); });
  const list = el('div', '', null, body);
  const draw = () => {
    list.textContent = ''; const f = q.value.trim().toLowerCase(); ADMIN.q = q.value;
    const rows = d.users.filter((u) => !f || u.name.toLowerCase().includes(f) || (u.tag || '').toLowerCase() === f);
    el('p', 'adm-dim', `${rows.length} of ${d.users.length} accounts · tap one to manage it`, list);
    for (const u of rows) {
      const r = el('div', 'adm-row click', null, list);
      const n = el('span', '', `${u.tag ? `[${u.tag}] ` : ''}${u.name}`, r); if (u.admin) el('i', 'adm-tag gold', 'admin', n); if (u.banned) el('i', 'adm-tag red', 'banned', n);
      el('em', '', `${fmtDur(u.play_ms)} played · seen ${fmtAgo(u.last_seen)} · ${fmtMoney(u.money)} + ${fmtMoney(u.bank)} saved${u.pending ? ` · ${fmtMoney(u.pending)} waiting` : ''} · ${u.records} record${u.records === 1 ? '' : 's'}`, r);
      r.addEventListener('click', () => adminUser(body, u.id));
    }
  };
  q.addEventListener('input', draw); draw();
}
const BOARD_NAMES = { money: '💰 Richest', fish: '🎣 Biggest fish', wave: '🏄 Best wave' };
const boardName = (b) => BOARD_NAMES[b] || (b.startsWith('trial:') ? '⏱ ' + ((typeof TRIALS !== 'undefined' && TRIALS.find((t) => 'trial:' + t.id === b)) || { name: b.slice(6) }).name : b);
const boardValue = (b, v) => (b === 'money' ? fmtMoney(v) : b === 'fish' ? v.toFixed(2) + ' kg' : b === 'wave' ? Math.round(v).toLocaleString() + ' pts' : fmtTime(v));
async function adminUser(body, id) {
  const d = await api('/admin/user?id=' + id), u = d.user; body.textContent = '';
  admBtn(body, '← All accounts', () => { ADMIN.tab = 'users'; openAdmin(); });
  el('h3', '', `${u.crew ? `[${u.crew.tag}] ` : ''}${u.name}${u.admin ? ' · admin' : ''}${u.banned ? ' · BANNED' : ''}`, body);
  const g = el('div', 'adm-grid', null, body);
  for (const [k, v] of [['Played', fmtDur(u.play_ms)], ['Last seen', fmtAgo(u.last_seen)], ['Joined', new Date(u.created).toLocaleDateString()], ['Wallet', fmtMoney(u.money)], ['Savings', fmtMoney(u.bank)], ['Cars', u.cars], ['Houses', u.houses], ['Businesses', u.biz], ['Pet', u.pet || '—'], ['Crew', u.crew ? u.crew.name : '—'], ['Last save', fmtAgo(u.updated)]]) { el('span', '', k, g); el('b', '', String(v), g); }
  el('h3', '', 'Money', body);
  const mr = el('div', 'adm-bar', null, body);
  const amt = el('input', 'adm-in', null, mr); amt.type = 'number'; amt.min = '1'; amt.placeholder = 'Amount, e.g. 5000';
  const note = el('input', 'adm-in', null, mr); note.maxLength = 80; note.placeholder = 'Note they’ll see (optional)';
  const send = async (sign) => {
    const a = Math.round(Math.abs(Number(amt.value) || 0)); if (!a) { toast('Type an amount first'); return; }
    try { const r = await api('/admin/money', { id: u.id, amount: sign * a, note: note.value }); toast(`${sign > 0 ? 'Gave' : 'Took'} ${fmtMoney(a)} ${sign > 0 ? 'to' : 'from'} ${u.name}${r.live ? ' — they’re online, it lands now' : ' — it lands next time they play online'}`); setTimeout(() => adminUser(body, u.id), r.live ? 1500 : 0); } catch (e) { toast(e.message); }
  };
  const mb = el('div', 'adm-bar', null, body); admBtn(mb, '＋ Give', () => send(1), 'go'); admBtn(mb, '－ Take', () => send(-1), 'warn');
  if (d.pending.length) el('p', 'adm-dim', 'Waiting for their next online session: ' + d.pending.map((p) => `${fmtMoney(p.amount)}${p.note ? ` (“${p.note}”)` : ''}`).join(', '), body);
  el('h3', '', `Records (${d.records.length})`, body);
  if (!d.records.length) el('p', 'adm-dim', 'No records yet.', body);
  for (const r of d.records) {
    const row = el('div', 'adm-row', null, body); el('span', '', boardName(r.board), row); el('em', '', `${boardValue(r.board, r.value)}${r.detail ? ' · ' + r.detail : ''} · ${fmtAgo(r.at)}`, row);
    admBtn(row, 'Delete', async () => { if (!confirm(`Delete ${u.name}’s ${boardName(r.board)} record?`)) return; await api('/admin/record-delete', { id: u.id, board: r.board }).catch((e) => toast(e.message)); adminUser(body, u.id); }, 'warn');
  }
  if (!u.admin) {
    el('h3', '', 'Account', body); const ab = el('div', 'adm-bar', null, body);
    admBtn(ab, '👢 Kick from their world', async () => { const r = await api('/admin/kick', { id: u.id }).catch((e) => toast(e.message)); if (r) toast(r.n ? `Kicked ${u.name}` : `${u.name} isn’t in a world`); });
    admBtn(ab, u.banned ? '✅ Unban' : '⛔ Ban', async () => { if (!u.banned && !confirm(`Ban ${u.name}? They’re signed out everywhere and can’t log in.`)) return; await api('/admin/ban', { id: u.id, banned: !u.banned }).catch((e) => toast(e.message)); adminUser(body, u.id); }, u.banned ? 'go' : 'warn');
  }
}
async function adminRecords(body) {
  const d = await api('/admin/boards'); body.textContent = '';
  const by = {}; for (const r of d.records) (by[r.board] = by[r.board] || []).push(r);
  if (!d.records.length) el('p', 'adm-dim', 'No records on any board yet.', body);
  for (const [b, rows] of Object.entries(by)) {
    if (b.startsWith('trial:')) rows.reverse(); // time trials: fastest first
    el('h3', '', boardName(b), body);
    rows.slice(0, 20).forEach((r, i) => { const row = el('div', 'adm-row', null, body); el('span', '', `${i + 1}. ${r.name}`, row); el('em', '', `${boardValue(b, r.value)}${r.detail ? ' · ' + r.detail : ''}`, row); admBtn(row, 'Delete', async () => { if (!confirm(`Delete ${r.name}’s record?`)) return; await api('/admin/record-delete', { id: r.id, board: b }).catch((e) => toast(e.message)); adminRecords(body); }, 'warn'); });
  }
}
async function adminCrews(body) {
  const d = await api('/admin/crews'); body.textContent = '';
  if (!d.crews.length) el('p', 'adm-dim', 'No crews yet.', body);
  for (const c of d.crews) { const row = el('div', 'adm-row', null, body); el('span', '', `[${c.tag}] ${c.name}`, row); el('em', '', `${c.members} member${c.members === 1 ? '' : 's'} · boss ${c.boss} · started ${fmtAgo(c.created)}`, row); admBtn(row, 'Delete', async () => { if (!confirm(`Delete the crew [${c.tag}] ${c.name}?`)) return; await api('/admin/crew-delete', { id: c.id }).catch((e) => toast(e.message)); adminCrews(body); }, 'warn'); }
}
async function adminLog(body) {
  const d = await api('/admin/log'); body.textContent = '';
  if (!d.log.length) el('p', 'adm-dim', 'Nothing yet — gifts, bans, kicks and announcements show up here.', body);
  for (const L of d.log) { const row = el('div', 'adm-row', null, body); el('span', '', `${L.action}${L.target ? ' · ' + L.target : ''}`, row); el('em', '', `${L.detail ? L.detail + ' · ' : ''}${new Date(L.at).toLocaleString()}`, row); }
}
