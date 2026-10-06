import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BASE = import.meta.env.BASE_URL;

// ---- pose tuned in the viewer ----
const C = {
  env: 2.45, sunI: 13.1, sunAz: 58, sunEl: 8, topI: 2.2, rimI: 4.9,
  rotX: 20, rotY: 16, rotZ: 6,          // model rotation (deg)
  camAz: -2, camEl: 21, camDist: 0.55,  // camera orbit around the jet
  fov: 27, aperture: 1.5,               // depth of field; focus follows the orbit target
  shiftX: -0.02, shiftY: 0,             // jet offset in frame (fraction of width/height)
};
const NARROW_SHIFT = { x: 0, y: -0.2 }; // narrow desktop windows: jet sits higher so the headline has room
const REF_ASPECT = 1.8;                 // narrower windows dolly the camera back to keep the whole jet in frame
const SCROLL_DEG = 18;                  // camera swing while scrolling past the hero (negative = other way)

// ---- aircraft lights ----
// The lights themselves are baked into jet.glb / jet_low.glb as an emissive texture (formation strips, wingtip
// nav lenses, white tail lights, fin-pod lenses). The soft glow around the point lights is added here.
// Positions are in the airframe's own space: x = forward, y = right wing, z = down (model units).
// Add ?nolights to the URL to compare with them off.
const LIGHTS_ON = !/[?&]nolights/.test(location.search);
const GREEN = 0x1fd45c, RED = 0xe02a1a, WHITE = 0xd9d2c8;   // slightly under-driven so additive glow stays coloured, not white
const HALOS = [
  // wingtip nav lights: green = right wing, red = left wing; white tail light on the trailing edge
  { p: [4.6,  64.5, -1.9], c: GREEN, s: 5 }, { p: [4.6, -64.5, -1.9], c: RED, s: 5 },
  { p: [7.5,  63.7, -1.7], c: WHITE, s: 3.4 }, { p: [7.5, -63.7, -1.7], c: WHITE, s: 3.4 },
  // vertical-stabiliser pods: white + red lens on each fin
  { p: [-41.1,  17, -32.8], c: WHITE, s: 3.4 }, { p: [-41.1, -17, -32.8], c: WHITE, s: 3.4 },
  { p: [-40.6,  17, -31.2], c: RED, s: 3.4 },   { p: [-40.6, -17, -31.2], c: RED, s: 3.4 },
];
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.18, 'rgba(255,255,255,.65)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.16)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeHalos(model) {
  const airframe = model.getObjectByName('F-15E-airframe_0');
  if (!airframe) return null;
  const group = new THREE.Group(), map = glowTexture();
  for (const h of HALOS) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map, color: h.c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    sp.position.set(...h.p); sp.scale.set(h.s, h.s, 1);
    group.add(sp);
  }
  airframe.add(group);
  return group;
}

// add ?debug to the URL for an on-screen log
const DEBUG = /[?&]debug/.test(location.search);
let dbg;
function log(...a) {
  console.log('[altavue]', ...a);
  if (!DEBUG) return;
  if (!dbg) {
    dbg = document.createElement('pre');
    dbg.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;max-height:45vh;overflow:auto;margin:0;padding:8px;background:#000d;color:#9f9;font:11px/1.4 monospace;z-index:2000;white-space:pre-wrap;border-radius:6px';
    document.body.append(dbg);
  }
  dbg.textContent += a.join(' ') + '\n';
  dbg.scrollTop = dbg.scrollHeight;
}
addEventListener('error', (e) => log('ERROR', e.message));
addEventListener('unhandledrejection', (e) => log('REJECT', (e.reason && e.reason.message) || e.reason));

/**
 * Starts the 3D hero. Resolves true once the first frame is rendered and the scene is
 * ready to show, or false if it can't run (no WebGL / load failure).
 * onProgress(0..1) reports download + setup progress for the loading screen.
 * lite: true  = phone/tablet profile (jet_low.glb, daytime_low.exr, no depth of field,
 *               smaller shadow maps, lower pixel ratio).
 */
export function startHero({ onProgress, lite = false } = {}) {
  const stage = document.getElementById('stage');
  if (!stage) return Promise.resolve(false);
  if (!document.createElement('canvas').getContext('webgl2')) { log('WebGL2 not available'); return Promise.resolve(false); }
  try { return build(stage, onProgress || (() => {}), lite); }
  catch (e) { log('START FAILED', e.message); console.error(e); return Promise.resolve(false); }
}

function build(stage, onProgress, lite) {
  const t0 = performance.now(), T = () => ((performance.now() - t0) / 1000).toFixed(1) + 's';
  const MODEL = BASE + (lite ? 'jet_low.glb' : 'jet.glb');
  const ENV = BASE + (lite ? 'daytime_low.exr' : 'daytime.exr');
  const SHADOW = lite ? 1024 : 4096;
  log(lite ? 'lite mode (mobile)' : 'full mode (desktop)', MODEL, ENV);

  // 1) kick off both downloads right away, in parallel with the scene setup below
  const prog = { glb: [0, 0], exr: [0, 0] };
  const track = (k) => (e) => {
    prog[k] = [e.loaded, e.lengthComputable ? e.total : 0];
    let l = 0, t = 0;
    for (const v of Object.values(prog)) if (v[1] > 0) { l += Math.min(v[0], v[1]); t += v[1]; }
    if (t > 0) onProgress((l / t) * 0.88);
  };
  const draco = new DRACOLoader().setDecoderPath(BASE + 'draco/');
  const gltfP = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL, track('glb'))
    .then((g) => { log('jet.glb loaded', T()); return g; });
  const envP = new EXRLoader().loadAsync(ENV, track('exr'))
    .then((t) => { log('daytime.exr loaded', T()); return t; })
    .catch((e) => { log('daytime.exr FAILED', e.message || e); return null; });

  const W = () => stage.clientWidth, H = () => stage.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1.5 : 2));
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141a45);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // until the EXR is ready
  scene.environmentIntensity = C.env;

  const camera = new THREE.PerspectiveCamera(C.fov, W() / H(), 0.1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enableZoom = false; controls.enablePan = false; // keep page scroll working
  renderer.domElement.style.touchAction = 'pan-y';          // OrbitControls sets 'none'; allow vertical swipe-scroll
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); log('WEBGL CONTEXT LOST'); });

  const sun = new THREE.DirectionalLight(0xfff1e0, C.sunI);
  sun.castShadow = true; sun.shadow.mapSize.set(SHADOW, SHADOW); sun.shadow.bias = -0.0001;
  scene.add(sun, sun.target);
  const topLight = new THREE.SpotLight(0xffffff, C.topI, 0, Math.PI / 4, 0.6, 0);
  topLight.castShadow = !lite; topLight.shadow.mapSize.set(SHADOW, SHADOW); topLight.shadow.bias = -0.0001; // lite: top light casts no shadow (one shadow pass instead of two)
  scene.add(topLight, topLight.target);
  const rimLight = new THREE.DirectionalLight(0xffffff, C.rimI);
  scene.add(rimLight, rimLight.target);

  let R = 1, modelH = 1, dolly = 1, ready = false;
  const dollyFor = (aspect) => Math.min(Math.max(REF_ASPECT / aspect, 1), 4);

  function placeCamera() {
    const az = THREE.MathUtils.degToRad(C.camAz), el = THREE.MathUtils.degToRad(C.camEl), d = R * C.camDist * dolly;
    camera.position.set(
      controls.target.x + d * Math.cos(el) * Math.sin(az),
      controls.target.y + d * Math.sin(el),
      controls.target.z + d * Math.cos(el) * Math.cos(az));
  }
  function updateSun() {
    const az = THREE.MathUtils.degToRad(C.sunAz), el = THREE.MathUtils.degToRad(C.sunEl), d = R * 1.56;
    sun.target.position.set(0, modelH * 0.5, 0);
    sun.position.set(d * Math.cos(el) * Math.sin(az), modelH * 0.5 + d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
  }

  const HALF = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const pr = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer,
    new THREE.WebGLRenderTarget(W() * pr, H() * pr, { type: HALF ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: lite ? 2 : 4 }));
  composer.setPixelRatio(pr); composer.setSize(W(), H());
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0, maxblur: 0.03 });
  const bokehRender = bokeh.render.bind(bokeh);
  let halos = null;   // glow sprites; hidden while the depth-of-field pass draws its depth map
  bokeh.render = (...a) => {
    const bg = scene.background; scene.background = null;
    if (halos) halos.visible = false;
    bokehRender(...a);
    scene.background = bg;
    if (halos) halos.visible = true;
  };
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());
  function applyAperture() { bokeh.uniforms.aperture.value = C.aperture * dolly * 0.004 / R; bokeh.enabled = C.aperture > 0 && !lite; } // depth of field is the costliest pass: off on mobile

  const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ';
  pivot.rotation.set(...[C.rotX, C.rotY, C.rotZ].map(THREE.MathUtils.degToRad));
  scene.add(pivot);

  function resize() {
    const w = W(), h = H(), aspect = w / h, wide = w > 760;
    renderer.setSize(w, h); composer.setSize(w, h);
    camera.aspect = aspect;
    const sx = wide ? C.shiftX : NARROW_SHIFT.x, sy = wide ? C.shiftY : NARROW_SHIFT.y;
    camera.setViewOffset(w, h, -w * sx, -h * sy, w, h);
    const f = dollyFor(aspect);
    if (ready && f !== dolly) {
      const off = camera.position.clone().sub(controls.target).multiplyScalar(f / dolly);
      camera.position.copy(controls.target).add(off);
    }
    dolly = f;
    if (ready) applyAperture();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  // 2) build the scene once both files are in; resolve when the first frame is rendered
  const done = Promise.all([gltfP, envP]).then(async ([gltf, tex]) => {
    onProgress(0.9);
    if (tex) {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      scene.background = tex;
      scene.backgroundIntensity = C.env;
      scene.environmentIntensity = C.env;
    }
    onProgress(0.94);
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const model = gltf.scene; pivot.add(model);
    if (LIGHTS_ON) halos = makeHalos(model);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = aniso;
        if (m.transparent) { m.depthWrite = false; o.castShadow = false; }
        m.envMapIntensity = 1;
      });
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x; model.position.z -= center.z; model.position.y -= box.min.y + size.y / 2;
    pivot.position.set(0, size.y / 2, 0);
    const r = size.length(); R = r; modelH = size.y;

    controls.target.set(0, size.y * 0.45, 0);
    camera.near = r / 500; camera.far = r * 50;
    dolly = dollyFor(W() / H());
    placeCamera();
    controls.update();

    updateSun();
    const s = r * 0.7;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: r * 4 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = topLight.shadow.normalBias = r * 0.002;
    topLight.position.set(0, size.y + r * 0.9, 0);
    topLight.target.position.set(0, size.y * 0.3, 0);
    topLight.shadow.camera.near = r * 0.1; topLight.shadow.camera.far = r * 4;
    rimLight.position.set(-r * 0.8, size.y + r * 0.35, -r * 0.9);
    rimLight.target.position.set(0, size.y * 0.45, 0);

    ready = true;
    applyAperture();
    resize();
    onProgress(0.97);
    try { await renderer.compileAsync(scene, camera); } catch (e) { /* not fatal */ }
    composer.render();                       // first frame is drawn before anything is revealed

    // behind the loading screen -> appear instantly; if the loader was skipped (timeout) -> fade in over the image
    if (document.documentElement.classList.contains('is-loading')) stage.style.transition = 'none';
    stage.classList.add('on');
    const poster = document.getElementById('poster');
    if (poster) setTimeout(() => poster.remove(), 1500);
    onProgress(1);
    log('scene ready', T());
    return true;
  }).catch((err) => { log('3D FAILED', err && err.message); console.error(err); return false; });

  // only render while the hero is on screen
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stage);

  const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let sp = 0, spApplied = 0;
  const Y = new THREE.Vector3(0, 1, 0);
  renderer.setAnimationLoop(() => {
    if (!visible || !ready) return;
    // scroll-driven orbit: ease toward the scroll position, rotate the camera about the jet by the change
    const target = reduceMotion ? 0 : Math.min(Math.max(scrollY / Math.max(stage.clientHeight, 1), 0), 1);
    sp += (target - sp) * 0.08;
    const d = sp - spApplied;
    if (Math.abs(d) > 1e-5) {
      const off = camera.position.clone().sub(controls.target).applyAxisAngle(Y, THREE.MathUtils.degToRad(d * SCROLL_DEG));
      camera.position.copy(controls.target).add(off);
      spApplied = sp;
    }
    controls.update();
    bokeh.uniforms.focus.value = camera.position.distanceTo(controls.target);
    composer.render();
  });

  return done;
}
