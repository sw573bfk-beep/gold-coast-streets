// ============================================================================
// Gold Coast Streets — weather. Mostly fine, with cloudy spells, rain, and the odd afternoon storm rolling in off
// the ocean: grey skies, closer haze, rain falling around you, roads that go dark and shiny (and slippery), wind in
// the trees, lightning with thunder a moment later, and bigger surf.
// ============================================================================
const WEATHER = { name: 'clear', rain: 0, cloud: 0, storm: 0, target: { rain: 0, cloud: 0, storm: 0 }, nextT: 240, flash: 0, boltT: 8, wet: 0 };
const WEATHER_KINDS = { clear: { rain: 0, cloud: 0, storm: 0 }, cloudy: { rain: 0, cloud: 0.7, storm: 0 }, rain: { rain: 0.7, cloud: 0.9, storm: 0 }, storm: { rain: 1, cloud: 1, storm: 1 } };
const WEATHER_SAY = { clear: 'The sun’s out again', cloudy: 'Clouds rolling in', rain: 'It’s started raining', storm: 'A storm is rolling in off the ocean!' };
function setWeather(name, now) {
  WEATHER.name = name; Object.assign(WEATHER.target, WEATHER_KINDS[name]);
  if (now) Object.assign(WEATHER, WEATHER_KINDS[name]);
  if (started) toast(WEATHER_SAY[name]);
}
// rain: streaks falling in a box that travels with the camera
const RAIN_N = 2600, RAIN_BOX = 36;
const RAIN = (() => {
  const pos = new Float32Array(RAIN_N * 6), g = new THREE.BufferGeometry();
  for (let i = 0; i < RAIN_N; i++) { const x = (Math.random() - 0.5) * RAIN_BOX * 2, y = Math.random() * 26, z = (Math.random() - 0.5) * RAIN_BOX * 2; pos.set([x, y, z, x, y - 0.6, z], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col('#c8d6e4'), transparent: true, opacity: 0.45, depthWrite: false }));
  m.frustumCulled = false; m.visible = false; scene.add(m); return m;
})();
let rainSound = null;
function updateWeather(dt) {
  const W = WEATHER;
  W.nextT -= dt;
  if (W.nextT <= 0) { // the next spell: mostly fine
    const r = rand(), next = r < 0.5 ? 'clear' : r < 0.75 ? 'cloudy' : r < 0.9 ? 'rain' : 'storm';
    W.nextT = 240 + rand() * 360; if (next !== W.name) setWeather(next);
  }
  for (const k of ['rain', 'cloud', 'storm']) W[k] += clamp(W.target[k] - W[k], -dt / 25, dt / 25); // about 25 s to change over
  W.wet = clamp(W.wet + (W.rain > 0.2 ? dt / 40 : -dt / 120), 0, 1); // roads stay wet a while after the rain stops
  // the sky and the light (on top of the time of day set by updateSky)
  const o = W.cloud, grey = col('#7d8790');
  skyU.top.value.lerp(grey, o * 0.65); skyU.horizon.value.lerp(col('#9aa3aa'), o * 0.55); skyU.bottom.value.lerp(grey, o * 0.5);
  skyU.cloud.value = Math.min(1.6, skyU.cloud.value + o * 0.9);
  scene.fog.color.lerp(col('#9aa3aa'), o * 0.6);
  sun.intensity *= 1 - o * 0.72; hemi.intensity *= 1 - o * 0.2;
  if (!player.plane) { scene.fog.near = lerp(scene.fog.near, 480 - W.rain * 330, 0.1); scene.fog.far = lerp(scene.fog.far, 1350 - W.rain * 650, 0.1); }
  // lightning in a storm: a flash across the sky and thunder a moment later
  W.boltT -= dt;
  if (W.storm > 0.6 && W.boltT <= 0) { W.boltT = 5 + rand() * 12; W.flash = 1; const delay = 600 + rand() * 2200; setTimeout(() => sfxNoise(2.6, 160, 0.8), delay); }
  W.flash = Math.max(0, W.flash - dt * 3);
  if (W.flash > 0) { const f = W.flash * (0.6 + 0.4 * Math.sin(elapsed * 60)); hemi.intensity += f * 2.5; skyU.top.value.lerp(col('#e8ecff'), f * 0.6); skyU.horizon.value.lerp(col('#f4f6ff'), f * 0.5); }
  // wet roads: darker and glossy
  for (const m of WET_MATS) { m.roughness = 0.92 - W.wet * 0.7; m.envMapIntensity = 0.3 + W.wet * 1.1; if (m.userData.base === undefined) m.userData.base = m.color.clone(); m.color.copy(m.userData.base).multiplyScalar(1 - W.wet * 0.35); }
  TREE_WIND.value += dt * W.storm * 1.5; // trees thrash a bit harder in a storm
  // the rain itself
  RAIN.visible = W.rain > 0.03 && !indoorAt(player.x, player.z) && !shopAt(player.x, player.z) && !TOWER;
  if (RAIN.visible) {
    RAIN.geometry.setDrawRange(0, Math.floor(RAIN_N * W.rain) * 2);
    const P = RAIN.geometry.attributes.position.array, cx = camera.position.x, cy = camera.position.y - 8, cz = camera.position.z, fall = 22 * dt, wind = 4 * dt * (0.4 + W.storm);
    for (let i = 0; i < RAIN_N * W.rain; i++) {
      const o2 = i * 6; let x = P[o2] + wind, y = P[o2 + 1] - fall, z = P[o2 + 2];
      if (y < cy - 4 || Math.abs(x - cx) > RAIN_BOX || Math.abs(z - cz) > RAIN_BOX) { x = cx + (Math.random() - 0.5) * RAIN_BOX * 2; z = cz + (Math.random() - 0.5) * RAIN_BOX * 2; y = cy + 10 + Math.random() * 16; }
      P[o2] = x; P[o2 + 1] = y; P[o2 + 2] = z; P[o2 + 3] = x - wind * 3; P[o2 + 4] = y - 0.7; P[o2 + 5] = z;
    }
    RAIN.geometry.attributes.position.needsUpdate = true;
  }
  // the hiss of rain
  if (AU.ctx && !rainSound) { const C = AU.ctx, s = C.createBufferSource(), f = C.createBiquadFilter(); s.buffer = AU.noise; s.loop = true; f.type = 'highpass'; f.frequency.value = 1200; const g = C.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(AU.master); s.start(); rainSound = g; }
  if (rainSound) rainSound.gain.setTargetAtTime(AU.on ? W.rain * 0.12 * (RAIN.visible ? 1 : 0.3) : 0, AU.ctx.currentTime, 0.3);
}
