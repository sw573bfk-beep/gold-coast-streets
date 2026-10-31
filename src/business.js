// ============================================================================
// Gold Coast Streets — run your own business. Buy a café or a car yard near you (phone → Business), hire staff,
// fit it out, and the takings come in every five minutes (more in busy places, at busy times, with better staff and
// upgrades). Wages come out of the till. Walk in to your own business to see the books and collect the cash.
// ============================================================================
const BIZ_KINDS = {
  cafe: { label: 'Café', price: 45000, base: 140, staff: { barista: ['Barista', 60, 0.35], manager: ['Manager', 110, 0.25] }, upg: { machine: ['Espresso machine upgrade', 6000, 0.2], fitout: ['New fit-out', 12000, 0.25], signs: ['Signage', 3000, 0.1], socials: ['Social media marketing', 4000, 0.15] } },
  cars: { label: 'Car yard', price: 120000, base: 420, staff: { sales: ['Salesperson', 150, 0.3], mechanic: ['Mechanic', 180, 0.25] }, upg: { lot: ['Bigger lot', 25000, 0.25], showroom: ['Showroom', 40000, 0.3], finance: ['Finance deals', 15000, 0.2], ads: ['TV ads', 20000, 0.15] } },
};
const BIZ = { t: 0, sel: null };
const myBiz = () => (ECON.biz = ECON.biz || []);
function bizFor(sh) { return myBiz().find((b) => b.id === sh.id); }
function bizIncome(b) { // per five minutes, before wages
  const K = BIZ_KINDS[b.kind], busy = clamp((b.busy || 30) / 60, 0.5, 2), h = gameHour, timeF = b.kind === 'cafe' ? (h > 6 && h < 15 ? 1.3 : h > 18 || h < 6 ? 0.3 : 0.8) : (h > 9 && h < 18 ? 1.2 : 0.2);
  let mult = 1; for (const k in b.staff || {}) mult += K.staff[k][2]; for (const k in b.upg || {}) mult += K.upg[k][2];
  return Math.round(K.base * busy * timeF * mult * (weekend() ? 1.2 : 1));
}
const bizWages = (b) => Object.keys(b.staff || {}).reduce((a, k) => a + BIZ_KINDS[b.kind].staff[k][1], 0);
function buyBiz(sh, kind) {
  const K = BIZ_KINDS[kind]; if (myBiz().some((b) => b.id === sh.id)) return;
  if (player.money + ECON.bank < K.price) { toast(`You need $${K.price.toLocaleString()} (wallet plus savings)`); return; }
  const w = Math.min(player.money, K.price); player.money -= w; ECON.bank -= K.price - w;
  myBiz().push({ id: sh.id, kind, name: sh.name, x: sh.x, z: sh.z, staff: {}, upg: {}, till: 0, total: 0, busy: busyAt(sh.x, sh.z), log: [] });
  saveGame(); sfxTone([523, 659, 784, 1046], 0.5, 0.07, 'triangle'); actNote(`💼 You own ${sh.name} now! Hire staff and fit it out (phone → Business)`);
}
function updateBusiness(dt) {
  if (!myBiz().length) return; BIZ.t += dt; if (BIZ.t < 300) return; BIZ.t = 0;
  for (const b of myBiz()) {
    let net = bizIncome(b) - bizWages(b), note = null; const r = rand();
    if (r < 0.06) { net += 400; note = '⭐ A glowing review went viral'; } else if (r < 0.09 && !b.upg.signs && !b.staff.manager) { net -= Math.min(b.till, 600); note = '🔓 Broken into overnight — the till was raided'; } else if (r < 0.12) { net -= 250; note = '🧾 A surprise bill (repairs)'; }
    b.till = Math.max(0, b.till + net); b.total += net; b.log.unshift(`${note ? note + ' · ' : ''}${net >= 0 ? '+$' + net : '−$' + -net}`); b.log.length = Math.min(b.log.length, 6);
    if (note) actNote(`${b.name}: ${note}`, true);
  }
  saveGame();
}
function collectBiz(b) { if (!b.till) return; player.money += b.till; stat('earned', b.till); toast(`💵 Collected $${b.till.toLocaleString()} from ${b.name}`); b.till = 0; saveGame(); }
function bizPanel(b) { // walking into your own place: the books
  const K = BIZ_KINDS[b.kind], rows = [[`Takings ${bizIncome(b) >= bizWages(b) ? 'about' : '⚠'} $${bizIncome(b)} per 5 min · wages $${bizWages(b)} · in the till $${b.till.toLocaleString()} · all-time $${Math.round(b.total).toLocaleString()}`, 'Collect', b.till > 0, () => { collectBiz(b); bizPanel(b); }]];
  for (const [k, [label, wage, boost]] of Object.entries(K.staff)) rows.push([`${b.staff[k] ? '✔ ' : ''}${label}: $${wage} per 5 min, +${Math.round(boost * 100)}% takings`, b.staff[k] ? 'Let go' : 'Hire', true, () => { if (b.staff[k]) delete b.staff[k]; else b.staff[k] = true; saveGame(); bizPanel(b); }]);
  for (const [k, [label, cost, boost]] of Object.entries(K.upg)) rows.push([`${b.upg[k] ? '✔ ' : ''}${label}: +${Math.round(boost * 100)}% takings`, b.upg[k] ? 'Done' : `$${cost.toLocaleString()}`, !b.upg[k] && player.money >= cost, () => { if (!pay(cost, label)) return; b.upg[k] = true; saveGame(); bizPanel(b); }]);
  for (const line of b.log || []) rows.push([line, null, false, null]);
  econPanel(`${b.name} (yours)`, `${K.label} · busy area ${Math.round(b.busy || 30)}/100 · ${DAYS[dow()]} ${String(Math.floor(gameHour)).padStart(2, '0')}:00`, rows);
}
function businessApp(btn, head) {
  if (myBiz().length) { head('Your businesses'); for (const b of myBiz()) btn(`💼 ${b.name} · $${b.till.toLocaleString()} in the till`, `${BIZ_KINDS[b.kind].label} · ~$${bizIncome(b) - bizWages(b)} profit per 5 min · tap to collect (or walk in to manage)`, () => { collectBiz(b); phoneApp('business'); }); }
  head('For sale near you');
  const forSale = SHOPS.filter((s) => (s.kind === 'cafe' || s.kind === 'cars') && !bizFor(s) && Math.hypot(s.x - player.x, s.z - player.z) < 1500).sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z)).slice(0, 6);
  if (!forSale.length) btn('Nothing for sale nearby', 'cafés and car yards come up all over — try somewhere busier', () => {}, false);
  for (const s of forSale) { const K = BIZ_KINDS[s.kind]; btn(`${s.kind === 'cafe' ? '☕' : '🚗'} ${s.name} · $${K.price.toLocaleString()}`, `${K.label} · ${km(s.x, s.z)} · busy area ${Math.round(busyAt(s.x, s.z))}/100 · tap to buy`, () => { buyBiz(s, s.kind); phoneApp('business'); }, player.money + ECON.bank >= K.price); }
}
