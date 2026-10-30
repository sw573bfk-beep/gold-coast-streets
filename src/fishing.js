// ============================================================================
// Gold Coast Streets — fishing. Buy a rod at a servo or convenience store, stand at the water's edge facing the
// water (a beach, the Broadwater, a canal) and press E to cast. Wait for a bite, strike, then reel it in: hold REEL
// to keep the line tension in the green while the fish fights. The fish market buys whatever you land; in a public
// multiplayer world your biggest fish goes on the leaderboard.
// ============================================================================
// [name, min kg, max kg, $ per kg, chance]
const FISH_OCEAN = [['Sand whiting', 0.2, 0.9, 18, 30], ['Dusky flathead', 0.5, 3.5, 16, 18], ['Tailor', 0.5, 3, 10, 14], ['Snapper', 1, 9, 22, 10], ['Spanish mackerel', 5, 28, 14, 6], ['Longtail tuna', 8, 35, 12, 4], ['Bronze whaler shark', 30, 160, 3, 2], ['Old boot', 0, 0, 0, 4], ['Seaweed', 0, 0, 0, 4]];
const FISH_INSHORE = [['Bream', 0.3, 1.6, 16, 30], ['Sand whiting', 0.2, 0.8, 18, 18], ['Dusky flathead', 0.5, 4.5, 16, 20], ['Mangrove jack', 1, 5, 24, 9], ['Mud crab', 0.5, 2.2, 40, 7], ['Giant trevally', 1, 9, 9, 5], ['Bull shark', 40, 200, 3, 2], ['Shopping trolley', 0, 0, 0, 4], ['Old boot', 0, 0, 0, 5]];
const FISH = { on: false };
// the water just ahead of you, from dry land
const openSea = (x, z) => onBeach(x, z) || onBeachSand(x, z); // standing on the surf beach: the Pacific, not the Broadwater
function fishSpot(which) { // which: also work out whether it's the ocean (only when casting)
  if (player.state !== 'foot' || player.deadT > 0 || !REGION || !isLand(player.x, player.z)) return null;
  const fx = Math.sin(player.h), fz = Math.cos(player.h);
  for (const d of [2, 3.5, 5, 7]) { const x = player.x + fx * d, z = player.z + fz * d; if (!isLand(x, z)) return { x, z, ocean: !!which && openSea(player.x, player.z) }; }
  return null;
}
function pickFish(ocean) {
  const T = ocean ? FISH_OCEAN : FISH_INSHORE, sum = T.reduce((a, f) => a + f[4], 0); let r = rand() * sum;
  for (const f of T) { r -= f[4]; if (r <= 0) { const k = Math.pow(rand(), 2.2); return { name: f[0], kg: f[1] + (f[2] - f[1]) * k, price: f[3], fight: f[2] > 20 ? 1.8 : f[2] > 6 ? 1.35 : 1 }; } } // big ones are rare even within a kind
  return { name: T[0][0], kg: T[0][1], price: T[0][3], fight: 1 };
}
function fishUse() { // E at the water's edge with a rod
  if (!(player.items.rod > 0)) return false;
  const S = fishSpot(true); if (!S) return false;
  startFishing(S); return true;
}
function startFishing(S) {
  uiOpen = true; if (document.pointerLockElement) document.exitPointerLock(); FISH.on = true;
  $('shop').hidden = false; $('shop-title').textContent = S.ocean ? 'Fishing off the beach' : 'Fishing the Broadwater'; $('shop-money').textContent = '$' + player.money.toLocaleString();
  const body = $('shop-body'); body.innerHTML = '';
  const info = document.createElement('p'), bar = document.createElement('div'), zone = document.createElement('div'), mark = document.createElement('div'), prog = document.createElement('div'), btn = document.createElement('button');
  bar.style.cssText = 'position:relative;height:30px;background:#2b3238;border-radius:6px;margin:10px 0;overflow:hidden';
  zone.style.cssText = 'position:absolute;left:40%;width:30%;top:0;bottom:0;background:#33d17a'; mark.style.cssText = 'position:absolute;width:6px;top:0;bottom:0;background:#fff;left:20%';
  prog.style.cssText = 'height:8px;border-radius:4px;background:#f6c445;width:0'; bar.append(zone, mark); bar.hidden = true; prog.hidden = true;
  btn.type = 'button'; btn.textContent = 'Waiting…'; btn.disabled = true; btn.style.cssText = 'width:100%;padding:14px;font-size:20px;touch-action:manipulation';
  body.append(info, bar, prog, btn);
  $('shop-sub').textContent = 'Line’s in the water…'; info.textContent = '🎣 Watch the float. Strike when it goes under!';
  const fish = pickFish(S.ocean); let phase = 'wait', t = 0, tension = 30, progress = 0, slack = 0, hold = false, raf = 0, last = performance.now();
  const biteAt = 2 + rand() * 6;
  const done = (msg) => { cancelAnimationFrame(raf); FISH.on = false; phase = 'done'; btn.disabled = false; btn.textContent = 'Cast again'; bar.hidden = true; prog.hidden = true; info.textContent = msg; $('shop-money').textContent = '$' + player.money.toLocaleString(); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (phase === 'bite') { phase = 'reel'; bar.hidden = false; prog.hidden = false; btn.textContent = 'HOLD TO REEL'; $('shop-sub').textContent = 'Keep the tension in the green until it’s landed. Too much and the line snaps!'; sfxTone([660], 0.08, 0.05); }
    else if (phase === 'reel') hold = true;
    else if (phase === 'done') startFishing(S);
  });
  const up = () => { hold = false; }; btn.addEventListener('pointerup', up); btn.addEventListener('pointerleave', up); btn.addEventListener('pointercancel', up);
  const tick = (now) => {
    if ($('shop').hidden) { FISH.on = false; return; } // walked away (closed the panel)
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (phase === 'wait') { info.textContent = '🎣 ' + '~'.repeat(1 + Math.floor(t * 2) % 4) + ' the float bobs…'; if (t > biteAt) { phase = 'bite'; t = 0; btn.disabled = false; btn.textContent = 'STRIKE!'; info.textContent = '❗ Something’s on — strike now!'; sfxTone([880, 1100], 0.15, 0.06, 'square'); } }
    else if (phase === 'bite') { if (t > 1.1 + (catLevel('water') - 1) * 0.1) return done('Too slow — it spat the hook. Cast again?'); } // your water level buys a little time
    else if (phase === 'reel') {
      const pull = (Math.sin(t * 2.3) * 0.5 + Math.sin(t * 5.1) * 0.5 + 0.6) * 38 * fish.fight; // the fish runs and rests
      tension += ((hold ? 70 : -55) + pull - 25) * dt; tension = clamp(tension, 0, 100);
      mark.style.left = tension + '%';
      const inZone = tension > 40 && tension < 70;
      progress += (inZone ? 16 / fish.fight : -4) * dt; progress = clamp(progress, 0, 100); prog.style.width = progress + '%';
      slack = tension < 12 ? slack + dt : 0;
      info.textContent = inZone ? 'Good — keep it there' : tension > 70 ? 'Too tight! Ease off' : 'Line’s slack — reel!';
      if (tension >= 99) return done('SNAP! The line broke. Cast again?');
      if (slack > 2) return done('It got off the hook. Cast again?');
      if (progress >= 100) {
        if (!fish.kg) { sfxNoise(0.2, 500, 0.2); return done(`You reeled in… a ${fish.name.toLowerCase()}. Classic.`); }
        const kg = Math.round(fish.kg * 100) / 100, cash = Math.max(1, Math.round(kg * fish.price)); player.money += cash; saveGame();
        sfxTone([523, 659, 784], 0.35, 0.06, 'triangle'); submitRecord('fish', kg, fish.name); stat('fish'); collect('fish', fish.name); actHook('fishing', { score: kg, msg: `${fish.name}, ${kg.toFixed(2)} kg` });
        return done(`🐟 ${fish.name}, ${kg.toFixed(2)} kg! The fish market paid $${cash}.`);
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
