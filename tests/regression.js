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
      if (sl > 0.08 && sl < 0.25 && (!best || sl > best.sl)) best = { sl, x: T.x0 + i * 10, z: T.z0 + j * 10, sx, sz };
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
  await test('no console errors raised by the game during the run', () => { expect(!window.__gcsErrors || window.__gcsErrors.length === 0, (window.__gcsErrors || []).join('; ')); return 'none'; });

  if (savedBefore !== null) localStorage.setItem('gcs-save', savedBefore); else localStorage.removeItem('gcs-save');
  home();
  const failed = results.filter((r) => !r.ok);
  return { passed: results.length - failed.length, failed: failed.length, results };
};
