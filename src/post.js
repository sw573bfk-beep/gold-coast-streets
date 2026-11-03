// ============================================================================
// Gold Coast Streets — the picture. On High and Ultra the scene renders into an HDR buffer, then bright parts
// bloom (the sun on the water, street lights and windows at night), the colours are graded and tone mapped,
// and the edges darken a touch. Hyper adds ambient occlusion (soft shade where things meet: corners, under cars,
// round the feet of walls and trees), punchy stylised colour and a sharpening pass. Low draws straight to the screen.
// Graphics settings live on the start screen and are remembered in this browser.
// ============================================================================
const GFX_LEVELS = {
  low: { post: false, ratio: 1, shadow: 1024, grass: 0, bloom: 0, crowd: 0.5 },
  high: { post: true, ratio: 1.5, shadow: 2048, grass: 42, bloom: 0.32, crowd: 1 },
  ultra: { post: true, ratio: 2, shadow: 4096, grass: 64, bloom: 0.4, crowd: 1.25 }, // crowd: how many people on the streets and in the shops
  hyper: { post: true, ratio: 2, shadow: 4096, grass: 84, bloom: 0.44, crowd: 1.35, ao: true, puffy: true }, // puffy: soft rounded tree crowns
};
const GFX = { level: 'high', cfg: GFX_LEVELS.high };
try { const v = localStorage.getItem('gcs-gfx'); if (GFX_LEVELS[v]) GFX.level = v; } catch (e) { /* storage blocked */ }
GFX.cfg = GFX_LEVELS[GFX.level];

const POST = { ok: renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')), rt: null, half: null, b1: null, b2: null, q1: null, q2: null, ao: null, ao2: null };
const POST_SCENE = new THREE.Scene(), POST_CAM = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const POST_QUAD = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); POST_QUAD.frustumCulled = false; POST_SCENE.add(POST_QUAD);
const POST_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const postMat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: POST_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
// bright parts only, with a soft knee so the glow fades in rather than snapping on
const BRIGHT_MAT = postMat(`uniform sampler2D src; varying vec2 vUv;
  void main() { vec3 c = texture2D(src, vUv).rgb; float l = max(max(c.r, c.g), c.b);
    float k = clamp(l - 1.0, 0.0, 0.8); k = k * k / 1.6; float w = max(k, l - 1.4) / max(l, 1e-4); // threshold 1.4, knee 0.4: pale walls don't haze
    gl_FragColor = vec4(c * w, 1.0); }`, { src: { value: null } });
// one direction of a 9-tap gaussian
const BLUR_MAT = postMat(`uniform sampler2D src; uniform vec2 step; varying vec2 vUv;
  void main() { vec3 c = texture2D(src, vUv).rgb * 0.227;
    c += (texture2D(src, vUv + step * 1.385).rgb + texture2D(src, vUv - step * 1.385).rgb) * 0.316;
    c += (texture2D(src, vUv + step * 3.231).rgb + texture2D(src, vUv - step * 3.231).rgb) * 0.07;
    gl_FragColor = vec4(c, 1.0); }`, { src: { value: null }, step: { value: new THREE.Vector2() } });
// ambient occlusion (Hyper): from the depth of each pixel, how much nearby geometry hems it in. 12 samples in a disc
// a metre or two across in the world, rotated per pixel; the result is blurred at half size and darkens the picture
const AO_MAT = postMat(`uniform sampler2D tDepth; uniform mat4 projInv; uniform vec2 texel; uniform float radius; uniform float strength; uniform float projY; uniform float aspect; varying vec2 vUv;
  vec3 viewPos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
  void main() {
    vec2 uv = (floor(vUv / texel - 0.25) + 0.5) * texel; // a half-size pixel sits exactly between two depth pixels: pick one for sure, or rows flip between them and the ground comes out striped
    float d0 = texture2D(tDepth, uv).x; if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
    vec3 p = viewPos(uv);
    vec3 px1 = viewPos(uv + vec2(texel.x, 0.0)), px0 = viewPos(uv - vec2(texel.x, 0.0)), py1 = viewPos(uv + vec2(0.0, texel.y)), py0 = viewPos(uv - vec2(0.0, texel.y));
    vec3 dx = abs(px1.z - p.z) < abs(p.z - px0.z) ? px1 - p : p - px0, dy = abs(py1.z - p.z) < abs(p.z - py0.z) ? py1 - p : p - py0; // the flatter side: no false edges
    vec3 n = normalize(cross(dx, dy)); if (dot(n, p) > 0.0) n = -n;
    float bias = 0.05 + 4.0 * max(abs(dx.z), abs(dy.z)); // roads and paving are drawn nudged towards the camera, more the more side-on they are: that nudge isn't a wall
    float rs = min(radius * projY / -p.z * 0.5, 0.06), a0 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2832, occ = 0.0;
    for (int i = 0; i < 12; i++) {
      float f = (float(i) + 0.6) / 12.0, a = a0 + float(i) * 2.39996;
      vec3 v = viewPos(uv + vec2(cos(a) / aspect, sin(a)) * rs * f) - p; float L = length(v);
      occ += clamp((dot(v, n) - bias) / max(L, 0.1), 0.0, 1.0) * (1.0 - smoothstep(radius * 0.4, radius * 1.6, L)); // only things standing clear of the surface count
    }
    float ao = clamp(1.0 - strength * occ / 12.0, 0.0, 1.0);
    gl_FragColor = vec4(vec3(mix(ao, 1.0, smoothstep(90.0, 220.0, -p.z))), 1.0); }`,
  { tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, texel: { value: new THREE.Vector2() }, radius: { value: 2.0 }, strength: { value: 2.4 }, projY: { value: 1 }, aspect: { value: 1 } });
// HDR + bloom -> exposure -> grade (saturation, contrast) -> filmic curve -> sRGB, plus a soft vignette and fine grain
const FINAL_MAT = postMat(`uniform sampler2D src; uniform sampler2D bloomA; uniform sampler2D bloomB; uniform sampler2D aoTex; uniform float hyper; uniform vec2 texel; uniform float bloom; uniform float exposure; uniform float time; varying vec2 vUv;
  vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 aces(vec3 c) {
    const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    c *= exposure / 0.6; c = IN * c; c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0); }
  vec3 toSRGB(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
  void main() {
    vec3 c = texture2D(src, vUv).rgb;
    if (hyper > 0.5) { // sharpen against the four neighbours, then the ambient occlusion
      vec3 nb = (texture2D(src, vUv + vec2(texel.x, 0.0)).rgb + texture2D(src, vUv - vec2(texel.x, 0.0)).rgb + texture2D(src, vUv + vec2(0.0, texel.y)).rgb + texture2D(src, vUv - vec2(0.0, texel.y)).rgb) * 0.25;
      vec3 dlt = clamp((c - nb) * 0.35, -0.03, 0.03); // capped, so fine ground grain doesn't turn into stripes
      c = max(c + dlt, 0.0) * mix(0.12, 1.0, texture2D(aoTex, vUv).r);
    }
    c += (texture2D(bloomA, vUv).rgb * 0.55 + texture2D(bloomB, vUv).rgb * 0.75) * bloom;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = max(mix(vec3(lum), c, 1.2), 0.0); c = pow(c, vec3(1.06)) * 1.04;
    if (hyper > 0.5) { // stylised: dull colours pushed harder than bright ones (vibrance), cool shadows, warm light
      float mx = max(c.r, max(c.g, c.b)), sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-4);
      c = max(mix(vec3(lum), c, 1.12 + 0.9 * (1.0 - sat)), 0.0);
      c *= mix(vec3(0.93, 0.97, 1.1), vec3(1.07, 1.0, 0.9), smoothstep(0.04, 0.9, lum));
    }
    c = toSRGB(aces(c));
    vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.55;
    c += (fract(sin(dot(vUv * 913.0 + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
    gl_FragColor = vec4(c, 1.0); }`, { src: { value: null }, bloomA: { value: null }, bloomB: { value: null }, aoTex: { value: null }, hyper: { value: 0 }, texel: { value: new THREE.Vector2() }, bloom: { value: 0.32 }, exposure: { value: 1 }, time: { value: 0 } });

function postTargets() {
  for (const k of ['rt', 'half', 'b1', 'q1', 'q2', 'ao', 'ao2']) if (POST[k]) { if (POST[k].depthTexture) POST[k].depthTexture.dispose(); POST[k].dispose(); POST[k] = null; }
  if (!POST.ok || !GFX.cfg.post) return;
  const w = Math.round(window.innerWidth * renderer.getPixelRatio()), h = Math.round(window.innerHeight * renderer.getPixelRatio());
  const opt = { type: THREE.HalfFloatType, depthBuffer: false };
  POST.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }); // MSAA keeps edges smooth
  if (GFX.cfg.ao) { // Hyper: keep the depth for the ambient occlusion, worked out at half size
    POST.rt.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType); // 32-bit: with 16 the flat ground comes out in ribs
    POST.ao = new THREE.WebGLRenderTarget(w >> 1, h >> 1, { depthBuffer: false }); POST.ao2 = new THREE.WebGLRenderTarget(w >> 1, h >> 1, { depthBuffer: false });
  }
  POST.half = new THREE.WebGLRenderTarget(w >> 1, h >> 1, opt); POST.b1 = new THREE.WebGLRenderTarget(w >> 1, h >> 1, opt);
  POST.q1 = new THREE.WebGLRenderTarget(w >> 2, h >> 2, opt); POST.q2 = new THREE.WebGLRenderTarget(w >> 2, h >> 2, opt);
}
function postPass(mat, target) { POST_QUAD.material = mat; renderer.setRenderTarget(target); renderer.render(POST_SCENE, POST_CAM); }
function blur(srcRT, tmpRT, outRT, spread) {
  BLUR_MAT.uniforms.src.value = srcRT.texture; BLUR_MAT.uniforms.step.value.set(spread / srcRT.width, 0); postPass(BLUR_MAT, tmpRT);
  BLUR_MAT.uniforms.src.value = tmpRT.texture; BLUR_MAT.uniforms.step.value.set(0, spread / srcRT.height); postPass(BLUR_MAT, outRT);
}
function renderFrame() {
  if (!POST.rt) { renderer.render(scene, camera); return; }
  renderer.setRenderTarget(POST.rt); renderer.render(scene, camera);
  BRIGHT_MAT.uniforms.src.value = POST.rt.texture; postPass(BRIGHT_MAT, POST.half);
  blur(POST.half, POST.b1, POST.half, 1.0);                 // half-size glow, tight
  BLUR_MAT.uniforms.src.value = POST.half.texture;
  BLUR_MAT.uniforms.step.value.set(0, 0); postPass(BLUR_MAT, POST.q1); // copy down to quarter size
  blur(POST.q1, POST.q2, POST.q1, 2.0);                      // quarter-size glow, wide
  if (POST.ao) {
    const A = AO_MAT.uniforms; A.tDepth.value = POST.rt.depthTexture; A.projInv.value.copy(camera.projectionMatrixInverse); A.texel.value.set(1 / POST.rt.width, 1 / POST.rt.height);
    A.projY.value = camera.projectionMatrix.elements[5]; A.aspect.value = POST.rt.width / POST.rt.height; postPass(AO_MAT, POST.ao);
    blur(POST.ao, POST.ao2, POST.ao, 1.0);
  }
  const U = FINAL_MAT.uniforms; U.src.value = POST.rt.texture; U.hyper.value = POST.ao ? 1 : 0; U.aoTex.value = POST.ao ? POST.ao.texture : null; U.texel.value.set(1 / POST.rt.width, 1 / POST.rt.height); U.bloomA.value = POST.half.texture; U.bloomB.value = POST.q1.texture;
  U.bloom.value = GFX.cfg.bloom; U.exposure.value = renderer.toneMappingExposure; U.time.value = (performance.now() % 10000) / 1000;
  postPass(FINAL_MAT, null);
}
// automatic resolution: when the frame rate drops (big screens on laptop graphics), draw fewer pixels until it's
// smooth again, and go back up when there's room. Measured over a second or two so it doesn't flicker.
const AUTORES = { scale: 1, ema: 16, t: 0, last: 0 };
function autoResolution(now) {
  const dt = AUTORES.last ? now - AUTORES.last : 16; AUTORES.last = now;
  if (dt > 3000 || !document.hasFocus()) { AUTORES.t = 0; return; } // hidden or in the background: browsers slow those down on purpose, so it says nothing about the computer
  AUTORES.ema += (dt - AUTORES.ema) * 0.2; AUTORES.t += dt; if (AUTORES.t < 1500) return; AUTORES.t = 0;
  const before = AUTORES.scale;
  if (AUTORES.ema > 38 && AUTORES.scale > 0.4) AUTORES.scale = Math.max(0.4, AUTORES.scale * (AUTORES.ema > 120 ? 0.6 : 0.8)); // very slow: a bigger step
  else if (AUTORES.ema < 19 && AUTORES.scale < 1) AUTORES.scale = Math.min(1, AUTORES.scale * 1.12);
  if (AUTORES.scale !== before) { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GFX.cfg.ratio) * AUTORES.scale); renderer.setSize(window.innerWidth, window.innerHeight); postTargets(); }
}
// apply a graphics level: resolution, shadow detail, post-processing and grass distance
function applyGfx(level) {
  if (!GFX_LEVELS[level]) return;
  GFX.level = level; GFX.cfg = GFX_LEVELS[level];
  try { localStorage.setItem('gcs-gfx', level); } catch (e) { /* storage blocked */ }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GFX.cfg.ratio) * AUTORES.scale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (sun.shadow.mapSize.x !== GFX.cfg.shadow) { sun.shadow.mapSize.set(GFX.cfg.shadow, GFX.cfg.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  postTargets();
  GFX.rescatter = true; // grass re-scatters at the new distance
  setTreeStyle(!!GFX.cfg.puffy); // (nothing to swap yet when this first runs at load)
}
applyGfx(GFX.level);
