// ============================================================================
// Gold Coast Streets — the keys you can press right now, in a strip along the top of the screen. It changes with what
// you're doing: on foot, driving, flying, in a boat, surfing, riding along, in a menu, and wanted by the cops (give up).
// Hidden on touch screens (they have their own buttons) and in photo mode.
// ============================================================================
const KEYHINT = { t: 0, last: '' };
function keyHintList() {
  const L = [], add = (k, label, warn) => L.push([k, label, warn]);
  if (player.deadT > 0) return L;
  if (MG && MG.active) { add('Esc', 'Quit the game'); return L; }
  if (PHONE.open) { if (PHONE.app === 'chat') { add('Enter', 'Send'); add('Esc', 'Close'); return L; } add('P', 'Put the phone away'); add('Esc', 'Close'); return L; }
  if (!$('shop').hidden || !$('bag').hidden) { add('Esc', 'Close'); return L; }
  if (!$('casino').hidden) { add('Esc', 'Leave the table'); return L; }
  if (bigMapOpen) { add('M', 'Close the map'); add('Click', 'Set a destination'); add('X', 'Clear the route'); return L; }
  if (player.stars > 2) add('★'.repeat(player.stars), 'Lose the cops (too wanted to give up)', true);
  else if (player.stars > 0) add('G', 'Give up to a cop nearby (pay a fine)', true);
  const st = player.state;
  if (st === 'car' && player.car) {
    const bike = player.car.spec && (player.car.spec.bike || /bike/.test(player.car.type));
    add('W', 'Gas'); add('S', 'Brake / reverse'); add('A D', 'Steer'); add('Space', bike ? 'Brake hard' : 'Handbrake'); if (bike) add('Shift', 'Wheelie');
    add('E', 'Get out'); add('R', 'Radio'); add('C', 'Camera'); add('H', 'Horn');
  } else if (st === 'plane') { add('Space', 'More power'); add('Shift', 'Less power'); add('S W', 'Nose up / down'); add('A D', 'Bank'); add('Q E', 'Rudder'); add('F', 'Get out (on the ground)'); }
  else if (st === 'heli') { add('Space', 'Up'); add('Shift', 'Down'); add('W S', 'Forward / back'); add('A D', 'Lean'); add('Q E', 'Turn'); add('F', 'Get out (landed)'); }
  else if (st === 'boat') { add('W', 'Throttle'); add('S', 'Slow / reverse'); add('A D', 'Steer'); add('E', player.items && player.items.rod ? 'Fish / hop off' : 'Hop off'); }
  else if (st === 'surf') { add('W', 'Paddle'); add('A D', 'Turn'); add('Space', 'Duck-dive'); add('E', 'Get off the board'); }
  else if (st === 'ride') { add('E', RIDE.kind === 'friend' ? 'Hop out' : 'Get off at the next stop'); }
  else if (st === 'foot') {
    add('W A S D', 'Move'); add('Shift', 'Sprint'); add('Space', 'Jump');
    const car = typeof nearestEnterableCar === 'function' && nearestEnterableCar();
    const friend = typeof friendCarNear === 'function' && friendCarNear(5.5);
    if (friend) add('E', `Ride with ${friend.name}`); else if (car) add('E', 'Get in'); else add('E', 'Use / enter');
    if (player.weapon && WEAPONS[player.weapon] && !WEAPONS[player.weapon].melee && player.weapon !== 'fists' && player.weapon !== 'fist') { add('Right-click', 'Aim'); add('Click', 'Shoot'); } else add('Q', 'Punch');
    add('1–4', 'Weapons'); add('M', 'Map'); add('P', 'Phone');
  }
  if (WAYPOINT && st !== 'plane' && st !== 'heli') add('X', 'Clear the route');
  return L.slice(0, 9);
}
function updateKeyHints(dt) {
  KEYHINT.t -= dt; if (KEYHINT.t > 0) return; KEYHINT.t = 0.25;
  let el = $('keys'); if (!el) { el = document.createElement('div'); el.id = 'keys'; document.body.appendChild(el); }
  const off = (typeof TOUCH !== 'undefined' && TOUCH.on) || document.body.classList.contains('photo') || paused || !started || (typeof SETTINGS !== 'undefined' && SETTINGS.hints === false);
  if (off) { el.hidden = true; return; }
  const list = keyHintList(), key = JSON.stringify(list);
  el.hidden = !list.length; if (key === KEYHINT.last) return; KEYHINT.last = key;
  el.innerHTML = '';
  for (const [k, label, warn] of list) { const s = document.createElement('span'); s.className = 'kh' + (warn ? ' warn' : ''); const b = document.createElement('kbd'); b.textContent = k; s.appendChild(b); s.appendChild(document.createTextNode(label)); el.appendChild(s); }
}
function refreshKeyHints() { KEYHINT.t = 0; KEYHINT.last = ''; updateKeyHints(0); }
