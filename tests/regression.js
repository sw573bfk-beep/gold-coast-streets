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
  // ---------------------------------------------------------------- the streamed region
  const ll = (lat, lon) => [(lon - 153.4235) * Math.cos(-27.9995 * Math.PI / 180) * 111320, (-27.9995 - lat) * 110574];
  const goTo = async (lat, lon, need = 4) => {
    home(); [player.x, player.z] = ll(lat, lon);
    for (let k = 0; k < 600; k++) { stepWorld(1 / 60); await new Promise((r) => setTimeout(r, 10)); if (k > 30 && !tileBusy && TILES.size >= need) break; }
  };
  // teleport and wait until the tile under the point itself has streamed in
  const goToTile = async (lat, lon) => {
    home(); [player.x, player.z] = ll(lat, lon);
    const key = Math.floor(player.x / REGION.tile) + ',' + Math.floor(player.z / REGION.tile);
    const ready = () => TILES.has(key) && TILES.get(key).mask && !tileBusy; // a tile is listed while it is still fetching
    for (let k = 0; k < 600 && !ready(); k++) { stepWorld(1 / 60); await new Promise((r) => setTimeout(r, 10)); }
    expect(ready(), 'tile ' + key + ' never loaded');
  };
  await test('region index loaded and the world spans Southport to Burleigh', () => {
    expect(REGION && REGION.tiles.length > 150, 'no region'); expect(WORLD.z1 - WORLD.z0 > 18000 && WORLD.x1 - WORLD.x0 > 10000, 'world too small');
    return `${REGION.tiles.length} tiles, ${((WORLD.x1 - WORLD.x0) / 1000).toFixed(1)} x ${((WORLD.z1 - WORLD.z0) / 1000).toFixed(1)} km`;
  });
  await test('Robina streams in with houses, streets and a suburb name', async () => {
    await goTo(-28.0745, 153.3925);
    const n = [...TILES.values()].length; expect(n >= 4, 'tiles ' + n);
    expect(suburbAt(player.x, player.z) === 'Robina', 'suburb ' + suburbAt(player.x, player.z));
    expect(EDGES.some((e) => e && e.tile), 'no tile roads'); return `${n} tiles loaded, street: ${nearestStreet(player.x, player.z)}`;
  });
  await test('walls in streamed tiles are solid', () => {
    let hit = 0; for (const T of TILES.values()) if (T.grid && T.grid.segs.length) { const o = 0, S = T.grid.segs; if (resolveCircle((S[o] + S[o + 2]) / 2, (S[o + 1] + S[o + 3]) / 2, 0.4)) hit++; }
    expect(hit > 0, 'no wall collisions'); return `${hit} tiles checked`;
  });
  await test('leaving an area unloads its tiles and their roads', async () => {
    const before = [...TILES.keys()]; await goTo(-27.9985, 153.428, 1);
    for (let k = 0; k < 40; k++) { stepWorld(1 / 60); await new Promise((r) => setTimeout(r, 10)); }
    const still = before.filter((k) => TILES.has(k)); expect(still.length === 0, 'still loaded: ' + still.join(' '));
    expect(!EDGES.some((e) => e && before.includes(e.tile)), 'roads left behind'); return `${before.length} tiles unloaded`;
  });
  await test('ocean is water, suburbs are land', async () => {
    await goTo(-28.0, 153.385, 2); expect(isLand(player.x, player.z), 'Benowa should be land');
    await goToTile(-28.06, 153.466); const [sx, sz] = ll(-28.06, 153.466); expect(!isLand(sx, sz), 'the sea off Broadbeach should be water');
    await goToTile(-27.965, 153.422); expect(!isLand(player.x, player.z), 'the Broadwater off Southport should be water'); return 'ok';
  });
  await test('petrol station repairs your car', async () => {
    const f = SHOPS.find((s) => s.kind === 'fuel') || (await goTo(-27.975, 153.405, 3), SHOPS.find((s) => s.kind === 'fuel'));
    expect(f, 'no petrol station loaded'); player.x = f.cx; player.z = f.cz;
    const c = new Car('sedan', null, f.cx + 3, f.cz, 0); c.kind = 'abandoned'; c.health = 20; cars.push(c); player.money = 200;
    const spot = serviceSpot(); expect(spot && spot.kind === 'fuel', 'no counter'); openShop(spot);
    [...document.querySelectorAll('#shop-body .srow')].find((r) => /repair/i.test(r.textContent)).querySelector('button').click(); closeShop();
    expect(c.health === 100 && player.money === 140, `health ${c.health} money ${player.money}`); c.remove(); return `${f.name}: $200 → $140, car fixed`;
  });
  // ---------------------------------------------------------------- Version 6: hills, houses, towers
  await test('hills: the Burleigh hinterland stands well above the beach', async () => {
    await goToTile(-28.0911, 153.4487); let peak = 0;
    for (const T of TILES.values()) if (T.hgt) for (const v of T.hgt) peak = Math.max(peak, v);
    expect(peak > 30, 'highest ground only ' + peak.toFixed(1) + ' m'); return `peak ${peak.toFixed(0)} m`;
  });
  await test('a car left on a slope rolls downhill and tilts with the road', async () => {
    let best = null;
    for (const T of TILES.values()) if (T.hgt) for (let j = 1; j < 99; j += 2) for (let i = 1; i < 99; i += 2) {
      const k = j * 101 + i, sx = (T.hgt[k + 1] - T.hgt[k - 1]) / 20, sz = (T.hgt[k + 101] - T.hgt[k - 101]) / 20, sl = Math.hypot(sx, sz);
      if (sl > 0.08 && sl < 0.25 && (!best || sl > best.sl) && isLand(T.x0 + i * 10, T.z0 + j * 10) && !resolveCircle(T.x0 + i * 10, T.z0 + j * 10, 6)) best = { sl, x: T.x0 + i * 10, z: T.z0 + j * 10, sx, sz }; // clear of walls
    }
    expect(best, 'no slope found');
    const c = new Car('sedan', null, best.x, best.z, Math.atan2(-best.sx, -best.sz)); cars.push(c); c.setDriver('test'); c.input = { t: 0, b: 0, s: 0, hb: 0 };
    const g0 = groundAt(c.x, c.z); for (let k = 0; k < 120; k++) { c.step(1 / 60); c.sync(1 / 60); }
    const ok = c.speed > 0.8 && c.alt < g0 && Math.abs(c.tp) > 0.03; const msg = `speed ${c.speed.toFixed(1)}, dropped ${(g0 - c.alt).toFixed(1)} m, pitch ${c.tp.toFixed(2)}`; c.remove();
    expect(ok, msg); return msg;
  });
  let testHouse = null;
  await test('houses: kicking in a front door calls the cops and the rooms are built', async () => {
    await goToTile(-28.075, 153.392); const T = tileAt(player.x, player.z);
    testHouse = T.houses.find((h) => h.doors.length === 2 && (h.x1 - h.x0) * (h.z1 - h.z0) > 150); expect(testHouse, 'no house with two doors');
    const fd = testHouse.doors.find((d) => d.type === 'front'); player.stars = 0;
    player.x = fd.x + fd.nx; player.z = fd.z + fd.nz; for (let k = 0; k < 10; k++) stepWorld(1 / 60);
    expect(testHouse.inside, 'interior not built'); houseUse(); for (let k = 0; k < 40; k++) stepWorld(1 / 60);
    expect(fd.open > 0.9, 'door did not open'); expect(player.stars >= 2, 'no police'); const n = testHouse.inside.loot.length; player.stars = 0;
    return `door open, ${n} things to steal`;
  });
  await test('houses: loot adds money and stays taken', async () => {
    const L = testHouse.inside.loot.find((q) => !q.taken); expect(L, 'nothing to take');
    player.x = L.x; player.z = L.z; const m0 = player.money; houseUse(); expect(player.money === m0 + L.value, 'money unchanged'); return `+$${L.value}`;
  });
  await test('houses: jumping a side fence puts you on the other side quietly', async () => {
    const T = tileAt(player.x, player.z); const F = T.fences[0]; expect(F, 'no fences');
    const mx = (F[0] + F[2]) / 2, mz = (F[1] + F[3]) / 2, L = Math.hypot(F[2] - F[0], F[3] - F[1]), nx = -(F[3] - F[1]) / L, nz = (F[2] - F[0]) / L;
    player.x = mx + nx * 0.6; player.z = mz + nz * 0.6; player.h = Math.atan2(-nx, -nz);
    expect(tryVault(), 'no vault'); for (let k = 0; k < 50; k++) stepWorld(1 / 60);
    expect((player.x - mx) * nx + (player.z - mz) * nz < 0, 'still on the same side'); return 'over';
  });
  await test('towers: Q1 lobby, lift to level 70 and back down, then out', async () => {
    home(); const bn = MAP.details.bnames, qi = Object.keys(bn).find((k) => /^Q1/.test(bn[k])), f = MAP.buildings[qi].slice(3);
    let e = null; for (let q = 0; q < f.length / 2; q++) { const L = Math.hypot(f[(2 * q + 2) % f.length] - f[2 * q], f[(2 * q + 3) % f.length] - f[2 * q + 1]); if (!e || L > e.L) e = { q, L }; }
    const ax = f[2 * e.q], az = f[2 * e.q + 1], bx = f[(2 * e.q + 2) % f.length], bz = f[(2 * e.q + 3) % f.length];
    let nx = (bz - az) / e.L, nz = -(bx - ax) / e.L; if (inRing((ax + bx) / 2 + nx * 0.5, (az + bz) / 2 + nz * 0.5, f)) { nx = -nx; nz = -nz; }
    player.x = (ax + bx) / 2 + nx; player.z = (az + bz) / 2 + nz; for (let k = 0; k < 5; k++) stepWorld(1 / 60);
    expect(towerUse() && TOWER && inTower(player.x, player.z), 'could not go in'); expect(TOWER.floors === 77, 'floors ' + TOWER.floors);
    rideLift(70); expect(Math.abs(standAt(player.x, player.z) - TOWER.y) < 0.01 && TOWER.y > 200, 'not up high');
    rideLift(0); player.x = TOWER.exit.ix; player.z = TOWER.exit.iz; expect(towerUse() && !TOWER, 'could not leave'); return 'level 70 at 218 m';
  });
  await test('towers: a shopping centre has shops you can buy from', async () => {
    await goToTile(-27.9995 - 4067 / 110574, 153.4235 + 440 / (Math.cos(-27.9995 * Math.PI / 180) * 111320)); let E = null; // Pacific Fair
    for (const B of bigBuildingsNear(player.x, player.z, 400)) if (B.kind === 'mall' && (!E || B.area > E.area)) E = B;
    expect(E, 'no shopping centre found'); const f = E.f; let e = null;
    for (let q = 0; q < f.length / 2; q++) { const L = Math.hypot(f[(2 * q + 2) % f.length] - f[2 * q], f[(2 * q + 3) % f.length] - f[2 * q + 1]); if (!e || L > e.L) e = { q, L }; }
    const ax = f[2 * e.q], az = f[2 * e.q + 1], bx = f[(2 * e.q + 2) % f.length], bz = f[(2 * e.q + 3) % f.length], L = e.L;
    let nx = (bz - az) / L, nz = -(bx - ax) / L; if (inRing((ax + bx) / 2 + nx * 0.5, (az + bz) / 2 + nz * 0.5, f)) { nx = -nx; nz = -nz; }
    player.x = (ax + bx) / 2 + nx; player.z = (az + bz) / 2 + nz; expect(towerUse() && TOWER && TOWER.kind === 'mall', 'not inside');
    const n = TOWER.shops.length, name = TOWER.name; leaveTower(); expect(n >= 4, 'only ' + n + ' shops'); return `${name}: ${n} shops`;
  });
  await test('map search finds schools and streets and sets a waypoint', () => {
    const schools = REGION.search.filter((e) => REGION.searchKinds[e[1]] === 'school').length;
    expect(schools > 50, 'only ' + schools + ' schools');
    const r = searchPlaces('cavill avenue'); expect(r.length && /cavill/i.test(r[0][0]), 'no Cavill Avenue');
    const s2 = searchPlaces('robina state high'); expect(s2.length, 'no Robina State High'); goToPlace(s2[0]);
    expect(WAYPOINT && WAYPOINT.name === s2[0][0], 'no waypoint'); WAYPOINT = null; return `${schools} schools; ${REGION.search.length} places`;
  });
  await test('start screen: skin tone picker and start places by suburb', () => {
    const sw = document.querySelectorAll('#pick-skin button'); expect(sw.length >= 8, 'no skin swatches');
    const before = player.look.skin; sw[sw.length - 1].click(); expect(player.look.skin !== before || sw.length === 1, 'skin unchanged'); sw[3].click();
    const n = SPAWN_PLACES.length, north = SPAWN_PLACES.filter((p) => / — north$/.test(p[0])).length;
    expect(n > 40 && north >= 15, `${n} places, ${north} north`); return `${sw.length} skin tones, ${n} start places`;
  });
  await test('registry: verified schools on the map and terrain readout in inspection mode', () => {
    const em = REGION.search.find((e) => e[0] === 'Emmanuel College'); expect(em, 'Emmanuel College missing from the map');
    expect(typeof devTerrainText === 'function' && /TERRAIN/.test(devTerrainText()), 'no terrain readout'); return 'Emmanuel College found; terrain readout ok';
  });
  // ---------------------------------------------------------------- the economy: jobs, cars, bank, hotels, safe purchases
  const fakeShop = (name, kind, cat) => ({ id: 'test-' + name, name, kind, cat, x: player.x, z: player.z, cx: player.x, cz: player.z, dx: player.x, dz: player.z });
  await test('economy: buying a café item takes money once and heals; two food shops have different menus', () => {
    closeShop(); player.money = 100; player.health = 50; ECON.lastBuy = 0;
    const a = fakeShop('Bakers Delight', 'cafe', 1), b = fakeShop('Zarraffas Coffee', 'cafe', 1), c = fakeShop('Grill\'d', 'food', 0);
    const ma = menuFor(a), mb = menuFor(b), mc = menuFor(c); expect(ma.join() !== mb.join() && mb.join() !== mc.join(), 'menus identical');
    openShop(a); buy(ma[0]); buy(ma[0]); // second click within 250 ms is ignored
    const spent = 100 - player.money; expect(spent === ITEMS[ma[0]].price, 'charged ' + spent); expect(player.health > 50, 'no heal'); closeShop();
    return `${a.name}: ${ma.map((i) => ITEMS[i].name).join(', ')} | ${b.name}: ${mb.slice(0, 3).map((i) => ITEMS[i].name).join(', ')}…`;
  });
  await test('economy: not enough money means no charge and nothing given', () => {
    player.money = 3; ECON.lastBuy = 0; const before = JSON.stringify(player.items); buy('brekky');
    expect(player.money === 3 && JSON.stringify(player.items) === before, 'charged or given'); return 'refused cleanly';
  });
  await test('jobs: a barista shift — make 5 orders and get paid', async () => {
    ECON.shift = null; ECON.jobs = {}; player.money = 0; const sh = fakeShop('Test Café', 'cafe', 1);
    startShift('barista', sh);
    for (let n = 0; n < 5; n++) {
      const want = $('shop-sub').textContent.split(':')[1].split('·')[0].split('+').map((t) => t.trim());
      for (const w of want) { const row = [...document.querySelectorAll('#shop-body .srow')].find((r) => r.firstChild.textContent === w); ECON.lastBuy = 0; row.querySelector('button').click(); }
      ECON.lastBuy = 0; [...document.querySelectorAll('#shop-body .srow')].pop().querySelector('button').click();
    }
    expect(!ECON.shift && jobState('barista').shifts === 1, 'shift not finished'); expect(player.money === 5 * 16, 'paid $' + player.money);
    return `5/5 orders, paid $${player.money}`;
  });
  await test('jobs: a delivery shift — reach 3 addresses and get paid', async () => {
    home(); ECON.shift = null; player.money = 0; startShift('delivery', fakeShop('Test Pizza', 'food', 0));
    for (let n = 0; n < 3 && ECON.shift; n++) { const t = ECON.shift.target; expect(t, 'no address'); player.x = t.x; player.z = t.z; updateEconomy(0.016); }
    expect(!ECON.shift && player.money > 3 * 22, 'paid $' + player.money); return `3 deliveries, paid $${player.money}`;
  });
  await test('cars: buy a car, it is parked outside, and you still own it after reloading', () => {
    home(); ECON.garage = []; player.money = 20000; const sh = fakeShop('Southport Toyota', 'cars', 3);
    openDealer(sh); ECON.lastBuy = 0; buyCar(sh, 'hatch');
    expect(player.money === 20000 - CAR_PRICES.hatch && ECON.garage.length === 1, 'not bought'); expect(ECON.called && cars.includes(ECON.called), 'not delivered');
    ECON.garage = []; loadGame(); expect(ECON.garage.length === 1 && ECON.garage[0].type === 'hatch', 'lost on reload');
    ECON.called.remove(); ECON.called = null; return `hatchback for $${CAR_PRICES.hatch}, kept after reload`;
  });
  await test('clothes and money survive a reload', () => {
    player.look.shirt = '#5a3d8a'; player.money = 4321; saveGame(); player.look.shirt = '#ffffff'; player.money = 0; loadGame();
    expect(player.look.shirt === '#5a3d8a' && player.money === 4321, 'not restored'); return 'shirt and $4321 restored';
  });
  await test('hotels: booking a room heals you and makes it your home; the bank keeps savings', () => {
    player.money = 500; player.health = 30; ECON.lastBuy = 0; const sh = fakeShop('Test Hotel', 'hotel', 4);
    openShop(sh); buy('room'); expect(player.health === 100 && ECON.home && ECON.home.name === 'Test Hotel' && player.money === 420, 'room not booked');
    openBank(fakeShop('Gold Coast Savings Bank', 'bank', 8)); [...document.querySelectorAll('#shop-body .srow')][1].querySelector('button').click();
    expect(player.money === 0 && ECON.bank >= 420, 'deposit failed'); closeShop();
    ECON.home = null; ECON.bank = 0; player.money = 100; saveGame(); return 'room booked, $420 deposited';
  });
  // ---------------------------------------------------------------- police: witnesses, no stacking, search area, fines
  const quiet = () => { home(); player.stars = 0; crimeCool = {}; for (const r of reports) scene.remove(r.icon); reports.length = 0; searchArea = null;
    for (const p of peds.slice()) if (Math.hypot(p.x - player.x, p.z - player.z) < 80) p.remove(); for (const c of cars.slice()) if (c.kind === 'police') c.remove(); };
  await test('police: a crime nobody sees brings no stars', () => { quiet(); addCrime(1, 'ped'); expect(player.stars === 0 && !reports.length, 'stars ' + player.stars); return 'no witness, no stars'; });
  await test('police: a witness phones it in after a few seconds', () => {
    quiet(); const w = new Ped(player.x + 6, player.z, 0, 1, 0, 1); peds.push(w); addCrime(1, 'punch');
    expect(reports.length === 1 && player.stars === 0, 'no report'); for (let k = 0; k < 300; k++) updateWanted(1 / 60);
    expect(player.stars === 1, 'stars ' + player.stars); return 'witness called: 1 star';
  });
  await test('police: getting away before the call finishes means no stars', () => {
    quiet(); const w = new Ped(player.x + 6, player.z, 0, 1, 0, 1); peds.push(w); addCrime(1, 'punch'); expect(reports.length === 1, 'no report');
    player.x += 120; for (let k = 0; k < 300; k++) updateWanted(1 / 60); expect(player.stars === 0 && !reports.length, 'stars ' + player.stars); return 'call dropped';
  });
  await test('police: small crimes don\'t stack in a chase; serious ones do; five stars only for fighting the police', () => {
    quiet(); player.stars = 2; addCrime(1, 'jack', true); expect(player.stars === 2, 'jack stacked');
    addCrime(3, 'shootPed', true); expect(player.stars === 3, 'shooting should make 3, got ' + player.stars);
    crimeCool = {}; player.stars = 4; addCrime(3, 'shootPed', true); expect(player.stars === 4, 'went past 4 without fighting police');
    addCrime(3, 'shootCop', true); expect(player.stars === 5, 'fighting police at 4 should make 5'); player.stars = 0; return '2→2 (car), →3 (shooting), 4→5 only for shooting at police';
  });
  await test('police: leave the search circle and stay hidden to lose them; one star gives up', () => {
    quiet(); player.stars = 2; lastSeen = { x: player.x, z: player.z }; updateWanted(1 / 60); expect(searchArea, 'no search area');
    player.x += searchArea.r + 30; for (let k = 0; k < 60 * 9; k++) updateWanted(1 / 60); expect(player.stars === 0, 'still wanted: ' + player.stars);
    quiet(); player.stars = 1; lastSeen = { x: player.x, z: player.z }; wantedT = 0; for (let k = 0; k < 60 * 31; k++) { player.starCool = 0; updateWanted(1 / 60); }
    expect(player.stars === 0, 'one star did not give up'); return 'lost them after leaving the circle; 1 star gave up after 30 s';
  });
  await test('police: hands up at two stars pays a fine', () => {
    quiet(); player.stars = 2; player.money = 500; const c = new Car('police', null, player.x + 20, player.z, 0); c.kind = 'police'; cars.push(c);
    surrender(); const ok = player.stars === 0 && player.money === 350; c.remove(); expect(ok, `stars ${player.stars} money ${player.money}`); player.money = 100; return '$150 fine, stars cleared';
  });
  // ---------------------------------------------------------------- V8: GPS, phone, casino, missions, planes
  await test('GPS: the yellow route follows the roads to the destination', async () => {
    quiet(); for (let k = 0; k < 400; k++) { stepWorld(1 / 60); if (k > 120 && !tileBusy && TILES.size >= 6) break; await new Promise((r) => setTimeout(r, 2)); }
    const e = searchPlaces('surfers paradise state school')[0]; goToPlace(e); GPS.t = 0; updateGPS(0.016); const P = GPS.path;
    let len = 0; for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const last = Math.hypot(P[P.length - 1][0] - P[P.length - 2][0], P[P.length - 1][1] - P[P.length - 2][1]);
    expect(P.length > 20 && last < 200 && GPS.mesh, `${P.length} points, last leg ${last | 0} m`); cancelDestination(); expect(!WAYPOINT && !GPS.mesh, 'cancel failed');
    return `${P.length} points, ${(len / 1000).toFixed(1)} km by road; X cancels`;
  });
  await test('phone: a taxi takes you to the destination for a fare', async () => {
    quiet(); player.money = 200; const st = REGION.search.find((e) => e[1] === 0 && Math.hypot(e[2] - player.x, e[3] - player.z) > 500 && Math.hypot(e[2] - player.x, e[3] - player.z) < 900);
    WAYPOINT = { name: st[0], x: st[2], z: st[3] }; const fare = taxiFare(); ECON.lastBuy = 0;
    await taxi(); expect(Math.hypot(player.x - (WAYPOINT ? WAYPOINT.x : 0), player.z - (WAYPOINT ? WAYPOINT.z : 0)) < 120 && player.money === 200 - fare, `money ${player.money}`);
    WAYPOINT = null; clearGPS(); return `fare $${fare}`;
  });
  await test('casino: blackjack pays 1:1 and 3:2, poker ranks hands right, slots charge the bet', () => {
    player.money = 1000; CAS.bet = 100; const C = (r, s) => ({ r, s });
    CAS.bj = { d: [C(0, '♠')], you: [C(9, '♠'), C(8, '♥')], dealer: [C(9, '♦'), C(5, '♣')], bet: 100, done: false }; bjStand(); // 19 vs dealer 15 + 2 = 17
    expect(player.money === 1200, 'win paid ' + player.money);
    CAS.bj = { d: [], you: [C(12, '♠'), C(11, '♥')], dealer: [C(9, '♦'), C(5, '♣')], bet: 100, done: false }; bjFinish(); expect(player.money === 1450, 'blackjack paid ' + player.money);
    const royal = [C(12, '♠'), C(11, '♠'), C(10, '♠'), C(9, '♠'), C(8, '♠')], quads = [C(3, '♠'), C(3, '♥'), C(3, '♦'), C(3, '♣'), C(12, '♠')], two = [C(3, '♠'), C(3, '♥'), C(5, '♦'), C(5, '♣'), C(12, '♠')];
    expect(rank5(royal) > rank5(quads) && rank5(quads) > rank5(two), 'hand ranking wrong');
    player.money = 100; CAS.slotSpin = false; slotSpin(); expect(player.money === 0, 'slot bet not taken'); return 'blackjack 1:1 and 3:2 correct; royal flush > quads > two pair';
  });
  await test('missions: a bank heist with a hacker and driver pays your share at the safehouse', () => {
    quiet(); player.money = 3000; HEIST.stage = 0; const bank = SHOPS.find((s) => s.kind === 'bank'); expect(bank, 'no bank loaded');
    HEIST.stage = 1; HEIST.bank = bank; HEIST.crew = { hacker: true, driver: true }; HEIST.stage = 2;
    expect(heistNeed(bank) === 5, 'hacker should halve the vault time'); const paidNow = heistRobDone(bank, 4000);
    expect(paidNow === 0 && HEIST.stage === 3 && HEIST.take === 10000, 'take ' + HEIST.take); player.stars = 0; player.x = HEIST.safe.x; player.z = HEIST.safe.z; updateHeist();
    expect(HEIST.stage === 0 && player.money === 3000 + 7000, 'paid ' + player.money); return '$10,000 take, $7,000 your share after a 30% crew cut';
  });
  await test('missions: a street race is won by reaching the finish in time', () => {
    quiet(); player.money = 0; const e = searchPlaces('cavill')[0]; MISSION = { kind: 'race', title: 'Street race', t: 60, targets: [e], reward: 400 };
    player.x = e[2]; player.z = e[3]; updateMissions(0.016); expect(!MISSION && player.money === 400, 'not won'); return 'race won, +$400';
  });
  await test('planes: a Cessna takes off from a straight road and climbs', async () => {
    quiet(); const m1 = REGION.roads.find((r) => r[0] === RT.motorway && r.length > 12); expect(m1, 'no motorway on the map'); // the M1: long and straight
    const mi = 1 + 2 * Math.floor((m1.length - 1) / 4); await goToTile(-27.9995 - m1[mi + 1] / 110574, 153.4235 + m1[mi] / (Math.cos(-27.9995 * Math.PI / 180) * 111320));
    const ne = nearestEdge(player.x, player.z, (E) => E.type === RT.motorway && E.len > 300); expect(ne.e >= 0, 'no motorway loaded');
    const E = EDGES[ne.e], P0 = edgePoint(E, 1, 5, {}); const p = new Plane('cessna', P0.x, P0.z, Math.atan2(P0.tx, P0.tz));
    boardPlane(p); player.stars = 0; for (let k = 0; k < 60 * 20; k++) { p.input.t = 1; p.input.p = p.v > p.sp.vr ? 1 : 0; p.input.r = 0; p.input.brake = 0; p.step(1 / 60); if (p.dead) break; }
    const ok = !p.dead && !p.ground && p.alt > 50, msg = `alt ${p.alt | 0} m at ${Math.round(p.v * 3.6)} km/h`; leavePlane(true); p.remove(); expect(ok, msg); return msg;
  });
  // ---------------------------------------------------------------- V9: Coolangatta, the airport and the hinterland
  const toLL = (x, z) => [-27.9995 - z / 110574, 153.4235 + x / (Math.cos(-27.9995 * Math.PI / 180) * 111320)];
  await test('terrain: the airport sits near sea level and the hinterland ranges are high', async () => {
    quiet(); const R = REGION.airport.runways[0], ax = (R[0] + R[2]) / 2, az = (R[1] + R[3]) / 2; await goToTile(...toLL(ax, az));
    const ga = groundAt(ax, az); expect(ga < 8, `airport ground ${ga.toFixed(1)} m`);
    await goToTile(-28.15, 153.28); const T = tileAt(player.x, player.z), hi = Math.max(...T.hgt); expect(hi > 150, `hinterland only ${hi.toFixed(0)} m`);
    return `airport ${ga.toFixed(1)} m, hinterland ${hi.toFixed(0)} m`;
  });
  await test('airport: parked planes wait by the runway, a Cessna takes off from it and an airliner departs', async () => {
    quiet(); const R = AIRPORT.rw; await goToTile(...toLL((R.x1 + R.x2) / 2, (R.z1 + R.z2) / 2));
    updatePlanes(0.016); const parked = PLANES.filter((p) => !p.ai && !p.dead); expect(parked.length >= 3, `${parked.length} parked planes`);
    const p = new Plane('cessna', R.x1 + R.ex * 30, R.z1 + R.ez * 30, R.h); boardPlane(p); player.stars = 0;
    for (let k = 0; k < 60 * 20; k++) { p.input.t = 1; p.input.p = p.v > p.sp.vr ? 1 : 0; p.input.r = 0; p.input.brake = 0; p.step(1 / 60); if (p.dead) break; }
    const ok = !p.dead && !p.ground && p.alt > 50, msg = `alt ${p.alt | 0} m`; leavePlane(true); p.remove(); expect(ok, 'Cessna from the runway: ' + msg + (p.dead ? ' (crashed)' : ''));
    AIRPORT.nextAI = 0; updatePlanes(0.016); expect(PLANES.some((q) => q.ai), 'no airliner');
    return `${parked.length} parked, Cessna ${msg}, airliner rolling`;
  });
  // ---------------------------------------------------------------- V9.1: water, pause menu, trees
  await test('water: a car wades through the shallows and backs out, but deep water swamps it', async () => {
    quiet(); await goToTile(-27.9663, 153.4176); // Broadwater Parklands: a park running straight into the water
    let x = player.x - 200; const z = player.z; while (isLand(x, z) && x < player.x + 600) x += 1; expect(!isLand(x, z), 'no shore found');
    const c = new Car('sedan', null, x + 3, z, Math.PI / 2); cars.push(c); c.setDriver('player'); player.car = c; player.state = 'car';
    for (let k = 0; k < 60 * 4; k++) { c.input = { t: 0, b: 1, s: 0, hb: 0 }; c.step(1 / 60); c.sync(1 / 60); }
    const backed = !c.dead && c.sink === 0 && c.x < x; c.remove();
    const d = new Car('sedan', null, x - 15, z, Math.PI / 2); cars.push(d); d.setDriver('player'); player.car = d; player.state = 'car'; let maxIn = 0;
    for (let k = 0; k < 60 * 8 && !d.dead; k++) { d.input = { t: 1, b: 0, s: 0, hb: 0 }; d.step(1 / 60); d.sync(1 / 60); if (d.sink === 0) maxIn = Math.max(maxIn, d.x - x); }
    const lost = d.sink > 0, out = player.state === 'foot'; d.remove(); home();
    expect(backed, 'stuck in the shallows'); expect(maxIn > 3, `swamped at the water's edge (${maxIn.toFixed(1)} m)`); expect(lost && out, 'deep water did not take the car');
    return `drove ${maxIn.toFixed(1)} m in before it got too deep`;
  });
  await test('the pause menu can resume after choosing a start spot', async () => {
    const sel = $('pick-spawn'), i = SPAWN_PLACES.findIndex((q) => /Coolangatta/.test(q[0])); await goToSpawn(String(i));
    const ok = !$('play').disabled; home(); expect(ok, 'Resume button left disabled'); return 'Resume clickable';
  });
  await test('no trees stand in the water', () => {
    let wet = 0, n = 0;
    for (const T of TILES.values()) for (const m of T.meshes) if (m.isInstancedMesh && m.material === TREE_MATS.leaf) { const e = m.instanceMatrix.array; for (let k = 0; k < m.count; k++) { n++; if (!isLand(e[k * 16 + 12], e[k * 16 + 14])) wet++; } }
    expect(n > 0, 'no trees loaded'); expect(wet <= n * 0.01, `${wet} of ${n} trees in water`); return `${n} trees, ${wet} in water`;
  });
  // ---------------------------------------------------------------- V9.2: lamps, trees, residents, knock-overs
  await test('no lamp post stands on a road', async () => {
    let n = 0, bad = 0;
    for (const T of TILES.values()) { const d = await (await fetch(`tiles/t_${T.i}_${T.j}.json`)).json(); for (const b of BREAKABLES) if (b.tile === T.k && b.kind === 'lamp') { n++; if (onCarriageway(d.roads, b.x, b.z, 0)) bad++; } }
    for (const [x, z] of MAP.details.props.lamp) { n++; if (onCarriageway(MAP.roads, x, z, 0)) bad++; }
    expect(n > 20, 'too few lamps'); expect(bad === 0, `${bad} of ${n} lamps on a road`); return `${n} lamps, none on a road`;
  });
  await test('suburbs get extra trees in a spread of sizes', async () => {
    quiet(); await goToTile(-28.077, 153.392); const T = tileAt(player.x, player.z);
    const lc = T.meshes.find((m) => m.isInstancedMesh && m.material === TREE_MATS.leaf); expect(lc, 'no trees');
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), rs = [];
    for (let k = 0; k < lc.count; k++) { lc.getMatrixAt(k, m4); m4.decompose(v, q, sc); rs.push(sc.x); }
    rs.sort((a, b) => a - b); const lo = rs[Math.floor(rs.length * 0.1)], hi = rs[Math.floor(rs.length * 0.9)];
    expect(lc.count > 300, `${lc.count} trees`); expect(hi / lo > 2.5, `sizes ${lo.toFixed(1)}-${hi.toFixed(1)} m`);
    return `${lc.count} leafy trees, crowns ${lo.toFixed(1)}-${hi.toFixed(1)} m`;
  });
  await test('houses have people home who phone the police on an intruder', async () => {
    quiet(); await goToTile(-28.077, 153.392); const T = tileAt(player.x, player.z);
    let H = null; for (let k = 0; k < 30 && !(H && H.inside && H.inside.residents.length); k++) {
      if (H && H.inside) disposeHouseInterior(H); H = T.houses[k]; H.called = false; buildHouseInterior(H); HOUSE_ACTIVE.push(H);
    }
    expect(H.inside.residents.length, 'nobody home in 30 houses');
    const p = H.inside.residents[0]; p.brave = false; player.x = p.x + 1; player.z = p.z; player.state = 'foot';
    for (let k = 0; k < 60 * 5; k++) stepWorld(1 / 60);
    const ok = H.called && player.stars >= 1; disposeHouseInterior(H); expect(ok, 'no call to the police'); quiet(); return `${H.doors.length} doors, residents called it in`;
  });
  await test('a fast car snaps a lamp post off and drives on', async () => {
    quiet(); await goToTile(-28.077, 153.392);
    const b = BREAKABLES.filter((q) => q.tile && !q.broken && q.kind === 'lamp').sort((a, c) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(c.x - player.x, c.z - player.z))[0];
    let h = null; for (let a = 0; a < 16 && h === null; a++) { const t = a * Math.PI / 8, sx = b.x - Math.sin(t) * 8, sz = b.z - Math.cos(t) * 8; if (isLand(sx, sz) && rayWalls(sx, sz, b.x - Math.sin(t) * 0.8, b.z - Math.cos(t) * 0.8, 1) >= 1) h = t; }
    expect(h !== null, 'no clear run-up');
    const c = new Car('sedan', null, b.x - Math.sin(h) * 8, b.z - Math.cos(h) * 8, h); c.vx = Math.sin(h) * 15; c.vz = Math.cos(h) * 15; cars.push(c); c.setDriver('player'); player.car = c; player.state = 'car';
    for (let k = 0; k < 60 * 2; k++) { c.input = { t: 1, b: 0, s: 0, hb: 0 }; c.step(1 / 60); c.sync(1 / 60); updateLoose(1 / 60); }
    const past = Math.hypot(c.x - b.x, c.z - b.z) > 6, L = LOOSE[LOOSE.length - 1]; c.remove(); home();
    expect(b.broken, 'post still standing'); expect(past, 'car stopped dead'); expect(L && L.ang > 1.2, 'post did not fall');
    return 'post down, car through';
  });
  // ---------------------------------------------------------------- V9.3: click-to-go map, organised phone
  await test('map: click drops a pin and Go sets the route', async () => {
    quiet(); WAYPOINT = null; toggleMap(); const px = innerWidth * 0.3, py = innerHeight * 0.6; dropPin(px, py);
    const pin = MAPV.pin; expect(pin && !$('mappin').hidden, 'no pin card'); pinGo();
    const ok = WAYPOINT && Math.hypot(WAYPOINT.x - pin.x, WAYPOINT.z - pin.z) < 1 && !bigMapOpen; const nm = WAYPOINT && WAYPOINT.name; cancelDestination();
    expect(ok, 'Go did not set the destination'); return `pin “${nm}”`;
  });
  await test('phone: home screen is organised and the heist planner walks through bank, crew, start', async () => {
    quiet(); openPhone(); const tiles = [...document.querySelectorAll('.ptile b')].map((b) => b.textContent);
    expect(['Map', 'Taxi', 'Bank heist', 'Hold-ups', 'Jobs', 'TikTak'].every((t) => tiles.includes(t)), 'missing apps: ' + tiles.join(','));
    player.money = 5000; HEIST.stage = 0; HEIST.crew = {}; phoneApp('heist');
    const pickBank = [...document.querySelectorAll('#phone-body .papp')].find((b) => b.textContent.startsWith('🏦')); expect(pickBank, 'no banks listed'); pickBank.click();
    const hire = [...document.querySelectorAll('#phone-body .papp')].find((b) => /Hacker/.test(b.textContent)); hire.click();
    expect(HEIST.stage === 1 && HEIST.crew.hacker && player.money === 4100, 'hiring failed');
    phoneApp('home'); expect(document.querySelector('.pcard'), 'no active job card');
    HEIST.stage = 0; HEIST.crew = {}; closePhone(); return `${tiles.length} apps, heist planned`;
  });
  // ---------------------------------------------------------------- V9.4: flying that makes sense, faster cars, hold-ups
  await test('planes: A turns left, letting go levels out and holds height, power off glides in to land', async () => {
    quiet(); const R = AIRPORT.rw; await goToTile(...toLL((R.x1 + R.x2) / 2, (R.z1 + R.z2) / 2));
    const p = new Plane('cessna', R.x1 + R.ex * 30, R.z1 + R.ez * 30, R.h); boardPlane(p); player.stars = 0;
    const run = (sec, inp) => { for (let k = 0; k < sec * 60 && !p.dead; k++) { Object.assign(p.input, inp); p.step(1 / 60); } };
    run(12, { t: 1, p: 0, r: 0, brake: 0 }); run(10, { t: 1, p: 1, r: 0 }); run(4, { t: 0, p: 0, r: 0 });
    const a0 = p.alt, h0 = p.h; run(4, { t: 0, p: 0, r: 1 }); const left = p.h > h0; run(5, { t: 0, p: 0, r: 0 });
    const level = Math.abs(p.roll) < 0.1 && Math.abs(p.pitch) < 0.1 && Math.abs(p.alt - a0) < 30;
    p.x = R.x1 + R.ex * 100; p.z = R.z1 + R.ez * 100; p.h = R.h; p.y = groundAt(p.x, p.z) + p.sp.gear + p.sp.fus / 2 + 50; p.v = 40; p.throttle = 0.15;
    for (let k = 0; k < 60 * 40 && !p.dead && !(p.ground && p.v < 1); k++) { Object.assign(p.input, { t: 0, p: 0, r: 0, brake: p.ground ? 1 : 0 }); p.step(1 / 60); }
    const landed = !p.dead && p.ground; leavePlane(true); p.remove();
    expect(left, 'A did not turn left'); expect(level, 'did not level out'); expect(landed, 'glide landing failed'); return 'turns, levels, lands';
  });
  await test('cars: a sports car reaches about 200 km/h on a long straight', async () => {
    quiet(); const c = new Car('sports', null, 0, 0, 0); c.setDriver('player'); let top = 0;
    for (let k = 0; k < 60 * 25; k++) { c.input = { t: 1, b: 0, s: 0, hb: 0 }; c.stepTyres(1 / 60); c.x = 0; c.z = 0; top = Math.max(top, c.speed); }
    c.remove(); expect(top * 3.6 > 190, `top ${Math.round(top * 3.6)} km/h`); return `${Math.round(top * 3.6)} km/h`;
  });
  await test('hold-ups: pull out a weapon at any shop counter and the till is yours', async () => {
    quiet(); await goToTile(-28.0868, 153.4545);
    for (let k = 0; k < 4; k++) { keeperT = 0; updateShops(0.1); }
    let sh = SHOPS.filter((q) => q.cx !== undefined && q.kind !== 'bank').sort((a, b) => Math.hypot(a.cx - player.x, a.cz - player.z) - Math.hypot(b.cx - player.x, b.cz - player.z))[0];
    player.x = sh.cx + 1; player.z = sh.cz + 1; keeperT = 0; updateShops(0.1); expect(sh.keeper, 'nobody behind the counter');
    let px = null, pz = null; for (const d of [2.5, 3.5, 4.5]) for (let a = 0; a < 24 && px === null; a++) { const t = a * Math.PI / 12, x = sh.kx + Math.sin(t) * d, z = sh.kz + Math.cos(t) * d; if (!resolveCircle(x, z, 0.4) && rayWalls(x, z, sh.kx, sh.kz, 1.5) >= 0.98) { px = x; pz = z; } }
    expect(px !== null, 'no clear spot at the counter'); player.x = px; player.z = pz; sh.robbedAt = -1e9;
    const w0 = player.weapon; player.weapon = 'fist'; updateRobbery(0.1); const hinted = robHint === sh;
    player.weapon = Object.keys(WEAPONS).find((w) => w !== 'fist'); const m0 = player.money;
    for (let k = 0; k < 60 * 6; k++) { player.h = Math.atan2(sh.kx - player.x, sh.kz - player.z); updateRobbery(1 / 60); }
    const got = player.money - m0; player.weapon = w0; quiet();
    expect(hinted, 'no prompt to pull a weapon'); expect(got > 0, 'no cash'); return `${sh.name}: +$${got}`;
  });
  // ---------------------------------------------------------------- V9.5: never spawn or stay stuck inside a building
  await test('Robina Town Centre spawn starts outside the centre, free to walk off', async () => {
    quiet(); const i = SPAWN_PLACES.findIndex((q) => /Robina Town Centre/.test(q[0])); await goToSpawn(String(i));
    const inside = insideSolid(player.x, player.z, solidBuildingsNear(player.x, player.z, 2));
    let open = 0; for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; if (rayWalls(player.x, player.z, player.x + Math.sin(t) * 15, player.z + Math.cos(t) * 15, 1) >= 1) open++; }
    const st = nearestStreet(player.x, player.z); home(); expect(!inside, 'spawned inside a building'); expect(open >= 2, 'boxed in'); return `on ${st}, ${open}/8 directions open`;
  });
  await test('every spawn spot is on the map', () => {
    const B = REGION.bounds, off = SPAWN_PLACES.filter((q) => q[1] < B[0] || q[1] > B[2] || q[2] < B[1] || q[2] > B[3]);
    expect(off.length === 0, off.map((q) => q[0]).join(', ')); return `${SPAWN_PLACES.length} spots`;
  });
  await test('stuck inside a solid building (the Blue Carpark): moved outside within a second or two', async () => {
    quiet(); await goToTile(-28.0752, 153.3863); player.x = -3610; player.z = 8410; player.state = 'foot';
    expect(insideSolid(player.x, player.z, solidBuildingsNear(player.x, player.z, 2)), 'test spot is not inside the car park');
    for (let k = 0; k < 60 * 2; k++) updateUnstuck(1 / 60);
    const out = !insideSolid(player.x, player.z, solidBuildingsNear(player.x, player.z, 2)); home(); expect(out, 'still inside'); return 'moved out';
  });
  // ---------------------------------------------------------------- V9.6: graphics levels, post-processing, grass
  await test('graphics: Low draws direct, High and Ultra post-process and grow grass on lawns', async () => {
    quiet(); const before = GFX.level; await goToTile(-28.077, 153.392);
    applyGfx('low'); for (let k = 0; k < 5; k++) stepWorld(1 / 60); renderFrame(); const low = !POST.rt && !(GRASS.meshes || []).some((m) => m.visible);
    applyGfx('high'); for (let k = 0; k < 60; k++) stepWorld(1 / 60); renderFrame(); const n = GRASS.mesh ? GRASS.mesh.count : 0;
    let onRoad = 0; const m4 = new THREE.Matrix4(), v = new THREE.Vector3(); const T = tileAt(player.x, player.z);
    for (let k = 0; k < Math.min(n, 2000); k++) { GRASS.mesh.getMatrixAt(k, m4); v.setFromMatrixPosition(m4); if (onCarriageway(T.roads, v.x, v.z, -1)) onRoad++; }
    applyGfx(before); expect(low, 'Low still post-processing or growing grass'); expect(POST.ok ? n > 1000 : true, `${n} clumps`); expect(onRoad < 20, `${onRoad} clumps on the road`);
    return `${n} grass clumps, ${onRoad} on roads, post ${POST.ok ? 'on' : 'unsupported'}`;
  });
  // ---------------------------------------------------------------- V9.7: shops fitted out like the real thing
  await test('shops: each kind is fitted out its own way, with solid shelves and shoppers inside', async () => {
    quiet(); const styles = new Set(SHOPS.filter((q) => q.walkIn).map(shopStyle)); expect(styles.size >= 12, `${styles.size} kinds of fit-out`);
    const sh = SHOPS.filter((q) => q.walkIn && shopStyle(q) === 'supermarket').sort((a, b) => b.depth * (b.t1 - b.t0) - a.depth * (a.t1 - a.t0))[0]; expect(sh, 'no supermarket');
    const P = roomFrame(sh), [x, , z] = P((sh.t0 + sh.t1) / 2, 1.5, 0); player.x = x; player.z = z; keeperT = 0; for (let k = 0; k < 10; k++) stepWorld(1 / 60);
    let solid = 0; for (let u = sh.t0 + 0.3; u < sh.t1 - 0.3; u += 0.25) { const [qx, , qz] = P(u, sh.counterV - 2, 0); if (resolveCircle(qx, qz, 0.1)) solid++; }
    const n = (sh.shoppers || []).length; home(); expect(solid > 0, 'walked through the shelves'); return `${styles.size} kinds; ${sh.name}: ${n} shoppers, shelves solid`;
  });
  // ---------------------------------------------------------------- V9.8: brakes, smart search, bikes, planes, surfing
  await test('brakes: S stops from 100 km/h in about 40 m, Space (hard brake) shorter, Space + A/D slides', () => {
    const stop = (inp) => { const c = new Car('sedan', null, 0, 0, 0); c.setDriver('player'); c.vz = 27.8; let d = 0; for (let k = 0; k < 900 && c.speed > 0.3; k++) { c.input = Object.assign({ t: 0, b: 0, s: 0, hb: 0 }, inp); c.stepTyres(1 / 60); d += c.speed / 60; } const h = c.h; c.remove(); return [d, h]; };
    const [dS] = stop({ b: 1 }), [dH] = stop({ hb: 1 }), [, hSlide] = stop({ hb: 1, s: 1 });
    expect(dS < 48, `S took ${dS.toFixed(0)} m`); expect(dH < dS - 5, `Space ${dH.toFixed(0)} m vs S ${dS.toFixed(0)} m`); expect(Math.abs(hSlide) > 0.8, 'no slide');
    return `S ${dS.toFixed(0)} m, Space ${dH.toFixed(0)} m`;
  });
  await test('search: "movies" finds cinemas, "casino" finds The Star, "petrol" finds servos', () => {
    const m = topicResults('movies'), c = topicResults('casino'), p = topicResults('petrol');
    expect(m && m.list.length >= 3, 'cinemas'); expect(c && c.list.some((e) => /star/i.test(e[0])), 'no Star'); expect(p && p.list.length >= 5, 'servos');
    return `${m.list.length} cinemas, ${c.list[0][0]}, ${p.list.length} servos`;
  });
  await test('bikes: a motorbike is quick and leans into corners, an e-bike stays at bike speed', () => {
    const run = (t, s) => { const c = new Car(t, null, 0, 0, 0); c.setDriver('player', player.look); let top = 0; for (let k = 0; k < 60 * 25; k++) { c.input = { t: 1, b: 0, s, hb: 0 }; c.stepTyres(1 / 60); c.sync(1 / 60); c.x = 0; c.z = 0; top = Math.max(top, c.speed); } const l = c.lean, rider = c.model.driver.visible; c.remove(); return [top * 3.6, l, rider]; };
    const [mb, , rider] = run('motorbike', 0), [eb] = run('ebike', 0), [, lean] = run('motorbike', 1);
    expect(mb > 170, `motorbike ${mb.toFixed(0)} km/h`); expect(eb < 50 && eb > 25, `e-bike ${eb.toFixed(0)} km/h`); expect(lean < -0.2, 'no lean'); expect(rider, 'no rider');
    return `motorbike ${mb.toFixed(0)} km/h, e-bike ${eb.toFixed(0)} km/h`;
  });
  await test('airport: a private jet, a fighter and a twin-prop park beside the runway', async () => {
    quiet(); const R = AIRPORT.rw; await goToTile(...toLL((R.x1 + R.x2) / 2, (R.z1 + R.z2) / 2));
    for (const p of PLANES.slice()) p.remove(); AIRPORT.spawned = false; updatePlanes(0.016); const names = PLANES.map((p) => p.type);
    expect(['bizjet', 'fighter', 'twin'].every((t) => names.includes(t)), names.join(',')); return names.join(', ');
  });
  await test('surfing: hire a board, paddle to the line-up, catch a wave and ride it in', async () => {
    quiet(); const e = REGION.search.find((q) => q[0] === 'Surfers Paradise Beach'); player.x = e[2]; player.z = e[3]; player.money = 500;
    expect(surfUse() && player.state === 'surf', 'no board');
    SURF.h = Math.atan2(SURF.frame.nx, SURF.frame.nz);
    for (let k = 0; k < 60 * 50 && toLocal(SURF.x, SURF.z)[1] < 85; k++) { keys.KeyW = true; const [s2, d2] = toLocal(SURF.x, SURF.z); if (waveAt(s2, d2)[1] > 0.2 && SURF.duck <= 0) keys.Space = true; stepWorld(1 / 60); }
    SURF.h = Math.atan2(-SURF.frame.nx, -SURF.frame.nz); let rode = false;
    for (let k = 0; k < 60 * 80 && !rode; k++) { keys.KeyW = SURF.waves.some((w) => { const dd = toLocal(SURF.x, SURF.z)[1] - w.d; return dd > -2 && dd < 6; }); stepWorld(1 / 60); rode = SURF.mode === 'ride'; }
    let t = 0; for (let k = 0; k < 60 * 30 && SURF.mode === 'ride'; k++) { const W = SURF.ride.W, a = W.peel === null ? 1 : W.dir; keys.KeyA = a > 0; keys.KeyD = a < 0; stepWorld(1 / 60); if (SURF.ride) t = SURF.ride.t; }
    for (const k of ['KeyW', 'KeyA', 'KeyD', 'Space']) keys[k] = false; endSurf(); home();
    expect(rode, 'never caught a wave'); expect(t > 3, `ride only ${t.toFixed(1)} s`); return `rode ${t.toFixed(1)} s`;
  });
  // ---------------------------------------------------------------- V9.9: bikes you can ride, houses you can walk into, schools, clean buildings
  await test('bikes: walk up, press E, ride off and get off again (e-bike and motorbike)', () => {
    quiet(); const out = [];
    for (const type of ['ebike', 'motorbike']) {
      const c = new Car(type, '#2ac28a', player.x + 2.2, player.z, Math.PI / 2); c.kind = 'parked'; cars.push(c);
      useKey(); for (let k = 0; k < 60 * 4 && player.state !== 'car'; k++) stepWorld(1 / 60);
      const on = player.state === 'car'; let moved = 0;
      if (on) { const x0 = c.x, z0 = c.z; for (let k = 0; k < 60 * 3; k++) { keys.KeyW = true; stepWorld(1 / 60); } keys.KeyW = false; moved = Math.hypot(c.x - x0, c.z - z0); c.vx = c.vz = 0; useKey(); for (let k = 0; k < 60 * 3 && player.state !== 'foot'; k++) stepWorld(1 / 60); }
      out.push([type, on, moved, player.state]); c.remove(); home();
    }
    for (const [t, on, moved, st] of out) { expect(on, `${t}: could not get on`); expect(moved > 10, `${t}: moved ${moved.toFixed(1)} m`); expect(st === 'foot', `${t}: could not get off`); }
    return out.map(([t, , m]) => `${t} ${m.toFixed(0)} m`).join(', ');
  });
  await test('houses: furniture and inside walls leave every door clear to walk in', async () => {
    quiet(); await goToTile(-28.077, 153.392); let doors = 0, blocked = 0, houses = 0;
    for (const T of TILES.values()) for (const H of T.houses || []) {
      if (houses >= 120) break; houses++; if (H.inside) disposeHouseInterior(H); buildHouseInterior(H); HOUSE_ACTIVE.push(H);
      for (const d of H.doors) { doors++; let ok = true; for (let k = 0.3; k <= 1.8; k += 0.25) { const GI = GRIDS.slice(); GRIDS.length = 0; GRIDS.push(H.inside.grid); const hit = resolveCircle(d.x - d.nx * k, d.z - d.nz * k, 0.3); GRIDS.length = 0; GRIDS.push(...GI); if (hit) { ok = false; break; } } if (!ok) blocked++; }
      disposeHouseInterior(H);
    }
    expect(blocked === 0, `${blocked} of ${doors} doors blocked by furniture or inside walls`); return `${houses} houses, ${doors} doors, all clear inside`;
  });
  await test('schools: pitched roofs and verandahs, not flat boxes', async () => {
    quiet(); const e = REGION.search.find((q) => /Burleigh Heads State School/.test(q[0])); await goToTile(-27.9995 - e[3] / 110574, 153.4235 + e[2] / (Math.cos(-27.9995 * Math.PI / 180) * 111320));
    let schools = 0, pitched = 0; const R = { pos: [], nor: [], col: [] }, segs = [];
    for (const T of TILES.values()) for (const b of T.blds || []) if (b[2] === 6 && !b.skip && b[0] < 16) { schools++; if (schoolRoof(R, segs, b.slice(3), 0, b[0], col('#2f4a62'), col('#e2cfa5'), schools)) pitched++; }
    expect(schools > 3, 'no school buildings'); expect(pitched >= schools * 0.5, `${pitched}/${schools} pitched`); return `${pitched} of ${schools} school blocks pitched, ${segs.length / 5} verandah posts`;
  });
  await test('buildings: doubled-up, hidden and road-blocking footprints are cleaned up', () => {
    const d = { buildings: [[6, 0, 0, 0, 0, 10, 0, 10, 10, 0, 10], [7, 0, 0, 0.5, 0.5, 10.5, 0.5, 10.5, 10.5, 0.5, 10.5], [4, 0, 0, 3, 3, 5, 3, 5, 5, 3, 5], [30, 0, 2, 50, 50, 60, 50, 60, 60, 50, 60], [5, 0, 0, 100, 95, 130, 95, 130, 105, 100, 105]], roads: [[4, 6, 0, 0, 90, 100, 140, 100]], bnames: {} };
    markBrokenBuildings(d); const sk = d.buildings.map((b) => !!b.skip);
    expect(sk[0] && !sk[1], 'duplicate pair not resolved to the taller'); expect(sk[2], 'hidden block kept'); expect(!sk[3], 'a normal building was removed'); expect(sk[4], 'building across the road kept');
    return 'duplicates, hidden blocks and road blockers removed';
  });
  // ---------------------------------------------------------------- V10: crowds on the streets and inside the shopping centres
  await test('crowds: Cavill Mall fills with people strolling the pedestrian street', async () => {
    quiet(); player.x = 727; player.z = 305; // the middle of Cavill Mall
    for (const p of peds.slice()) if (!p.cop) p.remove();
    for (let k = 0; k < 60 * 12; k++) stepWorld(1 / 60);
    const civ = peds.filter((p) => !p.cop), strollers = civ.filter((p) => p.path), near = civ.filter((p) => Math.hypot(p.x - player.x, p.z - player.z) < 80).length;
    const r = `${civ.length} people, ${strollers.length} strolling, ${near} within 80 m`; home();
    expect(civ.length >= 80, r); expect(strollers.length >= 30, r); expect(near >= 25, r); return r;
  });
  await test('Pacific Fair: the main centre opens up with shops, shoppers walking about and a food court', async () => {
    quiet(); const i = SPAWN_PLACES.findIndex((q) => q[0].startsWith('Pacific Fair')); await goToSpawn(String(i));
    const E = towerEntrance(60); expect(E && E.B.kind === 'mall' && E.B.area > 20000, `entrance is ${E && E.B.name} (${E && Math.round(E.B.area)} m²)`);
    player.x = E.px - E.nx * 3; player.z = E.pz - E.nz * 3; enterTower(E); for (let k = 0; k < 60 * 2; k++) stepWorld(1 / 60);
    const sh = TOWER.shoppers || [], b = sh.map((q) => [q.x, q.z]); for (let k = 0; k < 60 * 5; k++) stepWorld(1 / 60);
    const moving = sh.filter((q, j) => Math.hypot(q.x - b[j][0], q.z - b[j][1]) > 1).length; let poke = 0;
    for (let n = 0; n < 200; n++) { const x = E.B.x0 + rand() * (E.B.x1 - E.B.x0), z = E.B.z0 + rand() * (E.B.z1 - E.B.z0); if (inRing(x, z, E.B.f) && groundAt(x, z) > TOWER.y + 0.05) poke++; }
    const r = `${TOWER.shops.length} shops, ${sh.length} shoppers (${moving} walking), ${TOWER.people.length - TOWER.shops.length} sitting`;
    disposeTowerLevel(); TOWER = null; home();
    expect(sh.length >= 40, r); expect(moving >= sh.length * 0.4, r); expect(poke === 0, `ground pokes through the floor at ${poke} spots`); return r;
  });
  await test('no console errors raised by the game during the run', () => { expect(!window.__gcsErrors || window.__gcsErrors.length === 0, (window.__gcsErrors || []).join('; ')); return 'none'; });

  if (savedBefore !== null) localStorage.setItem('gcs-save', savedBefore); else localStorage.removeItem('gcs-save');
  home();
  const failed = results.filter((r) => !r.ok);
  return { passed: results.length - failed.length, failed: failed.length, results };
};
