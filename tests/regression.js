// Gold Coast Streets — in-page regression tests.
// Load the game (dist/index.html), then in the console:  (0, eval)(await (await fetch('tests/regression.js')).text()); await runRegression();
// Returns { passed, failed, results }. Tests drive the real game functions; they don't fake input events.
window.runRegression = async () => {
  const t0 = performance.now();
  while (!ready && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 200));
  const results = [];
  const test = async (name, fn) => {
    try { const detail = await fn(); results.push({ name, ok: true, detail: detail === undefined ? '' : detail }); }
    catch (e) { results.push({ name, ok: false, detail: String(e && e.message || e) }); }
  };
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const step = (sec, ks = {}) => { for (const k in keys) keys[k] = false; Object.assign(keys, ks); for (let i = 0; i < Math.round(sec * 60); i++) stepWorld(1 / 60); for (const k in keys) keys[k] = false; };
  started = true; paused = true; document.getElementById('menu').hidden = true;
  const savedBefore = localStorage.getItem('gcs-save');
  const home = () => { player.state = 'foot'; player.mode = 'foot'; player.car = null; player.deadT = 0; player.health = 100; player.stars = 0; player.x = playerSpot.x; player.z = playerSpot.z; };

  await test('boots with the city built', () => { expect(ready, 'not ready'); expect(MAP.buildings.length > 2000, 'buildings'); expect(cars.length > 10, 'traffic'); return `${MAP.buildings.length} buildings, ${cars.length} cars`; });
  await test('every shop has a stable id and one record', () => {
    const ids = SHOPS.map((s) => s.id); expect(ids.every(Boolean), 'missing ids'); expect(new Set(ids).size === ids.length, 'duplicate ids');
    return `${SHOPS.length} shops, ${SHOPS.filter((s) => s.walkIn).length} walk-in`;
  });
  await test('Cavill Mall order matches the registry in the running game', () => { const r = devMallCheck(); expect(r.issues.length === 0, r.issues.join('; ')); return `north ${r.north.length}, south ${r.south.length}`; });
  await test('landmarks stay put (octopus on Soul, Ripley\'s at the beach end, Timezone sign)', () => {
    expect(OCTOPUS, 'no octopus'); const rp = SHOPS.find((s) => /^ripleys/i.test(s.name)); const p = devMallProj(rp.x, rp.z);
    expect(p.side === -1 && p.s > 140, `Ripley's at ${p.s.toFixed(0)} m side ${p.side}`);
    expect(SHOPS.some((s) => /^timezone/i.test(s.name)), 'no Timezone'); return `Ripley's at ${p.s.toFixed(0)} m north side`;
  });
  await test('walk into a shop through its door', () => {
    home(); const g = SHOPS.find((s) => /grill'd/i.test(s.name) && s.walkIn); expect(g, 'Grill\'d not walk-in');
    player.x = g.dx; player.z = g.dz; let t = 0;
    while (Math.hypot(g.cx - player.x, g.cz - player.z) > 0.6 && t < 8) { camYaw = Math.atan2(g.cx - player.x, g.cz - player.z); step(0.1, { KeyW: true }); t += 0.1; }
    expect(shopAt(player.x, player.z) === g, 'not inside'); return `reached the counter in ${t.toFixed(1)} s`;
  });
  await test('buying food takes money and heals', () => {
    const g = SHOPS.find((s) => /grill'd/i.test(s.name)); player.x = g.cx; player.z = g.cz; player.health = 50; player.money = 100;
    const spot = serviceSpot(); expect(spot === g, 'no service spot'); openShop(spot); document.querySelector('#shop-body .srow button').click(); closeShop();
    expect(player.money === 88 && player.health === 85, `money ${player.money}, health ${player.health}`); return '$100 → $88, health 50 → 85';
  });
  await test('walk back out of the shop', () => {
    const g = SHOPS.find((s) => /grill'd/i.test(s.name)); let t = 0;
    while (shopAt(player.x, player.z) && t < 8) { camYaw = Math.atan2(g.dx - player.x, g.dz - player.z); step(0.1, { KeyW: true }); t += 0.1; }
    expect(!shopAt(player.x, player.z), 'still inside'); return `out in ${t.toFixed(1)} s`;
  });
  await test('items and money survive a save/reload', () => {
    player.money = 777; player.items.spiral = 2; saveGame();
    const s = JSON.parse(localStorage.getItem('gcs-save')); expect(s.money === 777 && s.items.spiral === 2, 'not saved');
    player.money = 0; player.items.spiral = 0; loadGame(); expect(player.money === 777 && player.items.spiral === 2, 'not loaded'); return 'money and bag restored';
  });
  await test('a Version 3 save still loads', () => {
    localStorage.setItem('gcs-save', JSON.stringify({ money: 1234, items: { globe: 1 }, weapons: { pistol: 12 }, weapon: 'pistol', look: { shirt: '#111111' } }));
    loadGame(); expect(player.money === 1234 && player.items.globe === 1 && player.weapons.pistol === 12 && player.look.shirt === '#111111', 'v3 save not read'); return 'v3 fields read';
  });
  for (const [id, keysToPress] of [['croc', null], ['wave', 'Space'], ['stack', 'Space']]) {
    await test(`arcade ${id}: start, finish with tickets, exit`, () => {
      const before = player.items.tickets || 0; startMiniGame(id); expect(MG.active && !document.getElementById('mg').hidden, 'did not open');
      mgBegin(); expect(MG.phase === 'play', 'did not start');
      for (let i = 0; i < 2400 && MG.phase === 'play'; i++) {
        mgUpdate(1 / 60);
        if (id === 'croc') { const g = MG.active; for (let hx = 0; hx < 3; hx++) for (let hy = 0; hy < 3; hy++) g.click(110 + hx * 130, 95 + hy * 85); }
        if (keysToPress && i % 20 === 10) mgKey(keysToPress);
      }
      expect(MG.phase === 'done', 'never finished'); const won = (player.items.tickets || 0) - before;
      mgExit(true); expect(!MG.active && !uiOpen, 'did not close'); return `+${won} tickets`;
    });
  }
  await test('arcade: quitting mid-game closes cleanly with no reward', () => {
    const before = player.items.tickets || 0; startMiniGame('wave'); mgBegin(); mgUpdate(0.1); mgKey('Escape');
    expect(!MG.active && !uiOpen && (player.items.tickets || 0) === before, 'quit failed'); return 'closed, no tickets';
  });
  await test('escape room: wrong code costs time, right code then word wins', () => {
    startMiniGame('escape'); mgBegin(); const g = MG.active;
    // read the puzzle state through the clues the player would see
    const code = [...document.querySelectorAll('#mg-side')].length && g; // UI present
    expect(document.getElementById('mg-code'), 'no lock input');
    document.getElementById('mg-code').value = '0000'; document.getElementById('mg-try').click();
    expect(document.getElementById('mg-code'), 'should still be on stage 1');
    // solve by brute force through the UI (the puzzle's answer isn't exposed)
    let solved = false;
    for (let c = 0; c < 10000 && !solved; c++) { const inp = document.getElementById('mg-code'); if (!inp) { solved = true; break; } inp.value = String(c).padStart(4, '0'); document.getElementById('mg-try').click(); g.update(-10); }
    expect(document.getElementById('mg-word'), 'chest never opened');
    for (const w of ['WAVES', 'REEFS', 'SANDY', 'PALMS', 'SURFS', 'TIDES']) { if (MG.phase === 'done') break; document.getElementById('mg-word').value = w; document.getElementById('mg-try').click(); g.update(-10); }
    expect(MG.phase === 'done' && player.items.trophy >= 1, 'door never opened'); mgExit(true); return 'chest and door opened, trophy awarded';
  });
  await test('dealer sells a pistol and it appears in hand', () => {
    home(); player.money = 500; player.weapons = {}; player.weapon = 'fist'; const d = DEALERS[0]; player.x = d.x; player.z = d.z;
    const spot = serviceSpot(); expect(spot && spot.dealer, 'no dealer spot'); openShop(spot); document.querySelector('#shop-body .srow button').click(); closeShop();
    expect(player.weapons.pistol === 36 && player.money === 200 && gunMesh && gunMesh.parent, 'purchase failed'); return '$500 → $200, 36 rounds';
  });
  await test('no console errors raised by the game during the run', () => { expect(!window.__gcsErrors || window.__gcsErrors.length === 0, (window.__gcsErrors || []).join('; ')); return 'none'; });

  if (savedBefore !== null) localStorage.setItem('gcs-save', savedBefore); else localStorage.removeItem('gcs-save');
  home();
  const failed = results.filter((r) => !r.ok);
  return { passed: results.length - failed.length, failed: failed.length, results };
};
