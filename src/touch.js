// ============================================================================
// Gold Coast Streets — phone and tablet controls: a thumbstick on the left (push it all the way to sprint),
// drag anywhere else to look around (or fly the plane), and buttons for use, jump/handbrake, attack, aim,
// phone, map, radio and pause. They only show up on touch screens.
// ============================================================================
const TOUCH = { on: false, stick: null, look: null, el: null };
function touchDevice() { return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0; }
function setStick(dx, dy) { // -1..1 each way: the same keys the keyboard presses
  const L = Math.hypot(dx, dy), dead = 0.28;
  keys.KeyW = dy < -dead; keys.KeyS = dy > dead; keys.KeyA = dx < -dead; keys.KeyD = dx > dead;
  keys.ShiftLeft = L > 0.95 && player.state === 'foot';
}
function buildTouch() {
  const root = document.createElement('div'); root.id = 'touch'; root.hidden = true;
  root.innerHTML = '<div class="tstick"><div class="tknob"></div></div>';
  const stick = root.firstChild, knob = stick.firstChild;
  const btn = (label, cls, down, up) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn ' + cls; b.textContent = label; b.setAttribute('aria-label', label);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); if (started && !paused && !uiOpen) down(); });
    const end = (e) => { e.preventDefault(); b.classList.remove('on'); if (up) up(); };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('pointerleave', end);
    root.appendChild(b); return b;
  };
  btn('E', 'tuse', () => useKey());
  btn('⤒', 'tjump', () => { keys.Space = true; struggleTap(); }, () => { keys.Space = false; });
  btn('👊', 'tfire', () => { mouse.fire = true; mouse.fired = false; if (player.weapon === 'fist') punch(); }, () => { mouse.fire = false; });
  const aim = btn('◎', 'taim', () => { mouse.aim = !mouse.aim; aim.classList.toggle('lit', mouse.aim); });
  btn('🔫', 'twep', () => cycleWeapon(1));
  btn('📱', 'tphone', () => openPhone());
  btn('🗺️', 'tmap', () => toggleMap());
  TOUCH.radio = btn('📻', 'tradio', () => changeStation());
  btn('⏸', 'tpause', () => setPaused(true));
  // the thumbstick
  stick.addEventListener('pointerdown', (e) => { e.preventDefault(); try { stick.setPointerCapture(e.pointerId); } catch (err) { /* the thumb slides off: moves still arrive on the stick */ } TOUCH.stick = { id: e.pointerId, r: stick.getBoundingClientRect() }; moveStick(e); });
  const moveStick = (e) => {
    const S = TOUCH.stick; if (!S || e.pointerId !== S.id) return;
    const cx = S.r.left + S.r.width / 2, cy = S.r.top + S.r.height / 2, R = S.r.width / 2;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
    knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`; setStick(dx, dy);
  };
  stick.addEventListener('pointermove', moveStick);
  const endStick = () => { TOUCH.stick = null; knob.style.transform = ''; setStick(0, 0); };
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
  document.body.appendChild(root); document.body.classList.add('touch'); TOUCH.el = root;
  // drag on the world to look (no mouse events follow, so a tap doesn't fire a gun)
  canvasEl.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; e.preventDefault(); if (!TOUCH.look) TOUCH.look = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointermove', (e) => {
    const T = TOUCH.look; if (!T || e.pointerId !== T.id || !started || paused || uiOpen) return;
    const dx = e.clientX - T.x, dy = e.clientY - T.y; T.x = e.clientX; T.y = e.clientY;
    if (player.state === 'plane') { PLANE_MOUSE.y = clamp(PLANE_MOUSE.y - dy * 0.02, -1, 1); PLANE_MOUSE.x = clamp(PLANE_MOUSE.x - dx * 0.012, -1, 1); return; }
    camYaw -= dx * 0.005; camPitch = clamp(camPitch + dy * 0.004, -0.35, 1.25); mouse.last = elapsed;
  });
  const endLook = (e) => { if (TOUCH.look && e.pointerId === TOUCH.look.id) TOUCH.look = null; };
  window.addEventListener('pointerup', endLook); window.addEventListener('pointercancel', endLook);
}
function updateTouch() {
  if (!TOUCH.el) { if (!touchDevice()) return; buildTouch(); TOUCH.on = true; }
  const show = started && !paused && !uiOpen && !bigMapOpen && !document.body.classList.contains('photo');
  TOUCH.el.hidden = !show;
  if (show) TOUCH.radio.hidden = !(['car', 'plane', 'boat', 'ride'].includes(player.state) || hasGear('headphones'));
  if (!show && TOUCH.stick) { TOUCH.stick = null; setStick(0, 0); }
}
