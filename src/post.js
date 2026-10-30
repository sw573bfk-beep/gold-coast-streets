// ============================================================================
// Gold Coast Streets — the picture. On High and Ultra the scene renders into an HDR buffer, then bright parts
// bloom (the sun on the water, street lights and windows at night), the colours are graded and tone mapped,
// and the edges darken a touch. Low draws straight to the screen for older machines.
// Graphics settings live on the start screen and are remembered in this browser.
// ============================================================================
const GFX_LEVELS = {
  low: { post: false, ratio: 1, shadow: 1024, grass: 0, bloom: 0, crowd: 0.5 },
  high: { post: true, ratio: 1.5, shadow: 2048, grass: 42, bloom: 0.32, crowd: 1 },
  ultra: { post: true, ratio: 2, shadow: 4096, grass: 64, bloom: 0.4, crowd: 1.25 }, // crowd: how many people on the streets and in the shops
};
const GFX = { level: 'high', cfg: GFX_LEVELS.high };
try { const v = localStorage.getItem('gcs-gfx'); if (GFX_LEVELS[v]) GFX.level = v; } catch (e) { /* storage blocked */ }
GFX.cfg = GFX_LEVELS[GFX.level];

const POST = { ok: renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')), rt: null, half: null, b1: null, b2: null, q1: null, q2: null };
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
// HDR + bloom -> exposure -> grade (saturation, contrast) -> filmic curve -> sRGB, plus a soft vignette and fine grain
const FINAL_MAT = postMat(`uniform sampler2D src; uniform sampler2D bloomA; uniform sampler2D bloomB; uniform float bloom; uniform float exposure; uniform float time; varying vec2 vUv;
  vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 aces(vec3 c) {
    const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    c *= exposure / 0.6; c = IN * c; c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0); }
  vec3 toSRGB(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
  void main() {
    vec3 c = texture2D(src, vUv).rgb + (texture2D(bloomA, vUv).rgb * 0.55 + texture2D(bloomB, vUv).rgb * 0.75) * bloom;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = max(mix(vec3(lum), c, 1.2), 0.0); c = pow(c, vec3(1.06)) * 1.04;
    c = toSRGB(aces(c));
    vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.55;
    c += (fract(sin(dot(vUv * 913.0 + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
    gl_FragColor = vec4(c, 1.0); }`, { src: { value: null }, bloomA: { value: null }, bloomB: { value: null }, bloom: { value: 0.32 }, exposure: { value: 1 }, time: { value: 0 } });

function postTargets() {
  for (const k of ['rt', 'half', 'b1', 'q1', 'q2']) if (POST[k]) { POST[k].dispose(); POST[k] = null; }
  if (!POST.ok || !GFX.cfg.post) return;
  const w = Math.round(window.innerWidth * renderer.getPixelRatio()), h = Math.round(window.innerHeight * renderer.getPixelRatio());
  const opt = { type: THREE.HalfFloatType, depthBuffer: false };
  POST.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }); // MSAA keeps edges smooth
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
  const U = FINAL_MAT.uniforms; U.src.value = POST.rt.texture; U.bloomA.value = POST.half.texture; U.bloomB.value = POST.q1.texture;
  U.bloom.value = GFX.cfg.bloom; U.exposure.value = renderer.toneMappingExposure; U.time.value = (performance.now() % 10000) / 1000;
  postPass(FINAL_MAT, null);
}
// apply a graphics level: resolution, shadow detail, post-processing and grass distance
function applyGfx(level) {
  if (!GFX_LEVELS[level]) return;
  GFX.level = level; GFX.cfg = GFX_LEVELS[level];
  try { localStorage.setItem('gcs-gfx', level); } catch (e) { /* storage blocked */ }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GFX.cfg.ratio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (sun.shadow.mapSize.x !== GFX.cfg.shadow) { sun.shadow.mapSize.set(GFX.cfg.shadow, GFX.cfg.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  postTargets();
  GFX.rescatter = true; // grass re-scatters at the new distance
}
applyGfx(GFX.level);
