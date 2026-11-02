// ============================================================================
// Gold Coast Streets — the global chat (phone → Chat): everyone with an account, in any world or none.
// Only letters, numbers, spaces and . , ! ? ' can be typed. The server checks every message (server/src/filter.js):
// swearing comes back starred out, and slurs, sexual stuff, threats, phone numbers and links are blocked.
// ============================================================================
const CHAT = { msgs: [], last: 0, unread: 0, seen: 0, t: 0, busy: false, el: null };
const CHAT_OK = /[^A-Za-z0-9 .,!?']/g;
function chatFetch() {
  if (!ACCT.token || CHAT.busy) return Promise.resolve();
  CHAT.busy = true;
  return api('/chat' + (CHAT.last ? '?after=' + CHAT.last : '')).then((d) => {
    for (const m of d.messages || []) if (!CHAT.msgs.some((q) => q.id === m.id)) { CHAT.msgs.push(m); if (m.name !== ACCT.name && m.id > CHAT.seen) CHAT.unread++; }
    if (d.removed && d.removed.length) CHAT.msgs = CHAT.msgs.filter((m) => !d.removed.includes(m.id));
    CHAT.msgs = CHAT.msgs.slice(-120); if (CHAT.msgs.length) CHAT.last = CHAT.msgs[CHAT.msgs.length - 1].id;
    if (PHONE.open && PHONE.app === 'chat') { CHAT.unread = 0; CHAT.seen = CHAT.last; drawChat(); }
  }).catch(() => {}).finally(() => { CHAT.busy = false; });
}
// every 3 s while the chat is open, every 25 s otherwise (for the badge)
function updateChat(dt) {
  if (!ACCT.token) return;
  CHAT.t -= dt; if (CHAT.t > 0) return;
  CHAT.t = PHONE.open && PHONE.app === 'chat' ? 3 : 25; chatFetch();
}
function chatApp(btn, head) {
  const body = $('phone-body');
  if (!ACCT.token) { head('Chat with everyone'); btn('You need an account to chat', 'pick Multiplayer on the main menu and sign in (it’s free, no email)', () => {}, false); return; }
  const list = document.createElement('div'); list.className = 'chat-list'; body.appendChild(list); CHAT.el = list;
  const row = document.createElement('div'); row.className = 'chat-row';
  const inp = document.createElement('input'); inp.className = 'pinput chat-in'; inp.maxLength = 120; inp.placeholder = 'Say something nice…'; inp.autocomplete = 'off';
  const send = document.createElement('button'); send.type = 'button'; send.className = 'chat-send'; send.textContent = 'Send';
  const count = document.createElement('div'); count.className = 'chat-count';
  inp.addEventListener('input', () => { const v = inp.value.replace(/[’‘]/g, "'"), c = v.replace(CHAT_OK, ''); if (c !== inp.value) inp.value = c; count.textContent = `${inp.value.length}/120`; }); // letters, numbers and . , ! ? ' only
  const go = () => {
    const text = inp.value.trim(); if (!text) return;
    send.disabled = true;
    api('/chat', { text }).then((r) => { inp.value = ''; count.textContent = ''; if (r.starred) toast('Some of that was starred out — keep it friendly'); CHAT.t = 0; return chatFetch(); })
      .catch((e) => toast(e.message)).finally(() => { send.disabled = false; inp.focus(); });
  };
  send.addEventListener('click', go); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  row.append(inp, send); body.appendChild(row); body.appendChild(count);
  const note = document.createElement('div'); note.className = 'pfoot'; note.textContent = 'Everyone online can see this. Swearing is starred out; slurs, rude stuff, phone numbers and links are blocked. Be kind!'; body.appendChild(note);
  CHAT.unread = 0; drawChat(); CHAT.t = 0; chatFetch().then(() => { CHAT.seen = CHAT.last; });
  setTimeout(() => inp.focus(), 50);
}
function drawChat() {
  const list = CHAT.el; if (!list || !list.isConnected) return;
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.textContent = '';
  if (!CHAT.msgs.length) { const e = document.createElement('div'); e.className = 'chat-empty'; e.textContent = 'No messages yet — say g’day!'; list.appendChild(e); }
  for (const m of CHAT.msgs) {
    const d = document.createElement('div'); d.className = 'chat-msg' + (m.name === ACCT.name ? ' me' : '');
    const who = document.createElement('b'); who.textContent = (m.crew ? `[${m.crew}] ` : '') + m.name;
    const t = document.createElement('span'); t.textContent = m.text; // text only, never HTML
    const when = document.createElement('em'); when.textContent = fmtAgo(m.at);
    d.append(who, t, when); list.appendChild(d);
  }
  if (atBottom || list.dataset.first !== '1') { list.scrollTop = list.scrollHeight; list.dataset.first = '1'; }
}
