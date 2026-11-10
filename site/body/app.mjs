import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LAYER_INFO, GROUP_INFO, VIEW_INFO, TOUR, BUGS, DIFFERENCES, GAPS, colourOf, SHOWN_WHEN_CHOSEN } from './parts.mjs';
import { REGIONS, ALL, indexParts, regionContext, sideOfPart } from './closeups.mjs';
import { CYCLE_MS, FIRST_SOUND, SECOND_SOUND, beatAt, moveOf, lookOf, RIDES_THE_WALL, INFLOW_VALVE, OUTFLOW_VALVE, STREAMS, flowAt } from './heartbeat.mjs';
performance.mark('body:module-start');

/* ---------- Coordinates ----------
   1 unit = 1 cm. +x = the body's left, +y = up (the floor is y = 0), +z = the body's front.
   Each layer is one merged mesh; its _part vertex attribute indexes the sex's parts.json list. */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const $ = id => document.getElementById(id);
const phone = matchMedia('(max-width: 820px)');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const LAYERS = Object.keys(LAYER_INFO);

/* ---------- Renderer ---------- */
const stage = $('stage');
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
camera.position.set(0, 90, 400);

/* turntable: dragging sideways spins the model about the screen's up axis (camera.up), dragging up-down tilts it.
   Screen "up" never rolls, and a pixel of drag turns the model the same amount on a phone as on a desktop.
   One finger or the left button rotates; two fingers pinch to zoom and move together to pan; right-drag or shift-drag pans. */
class TurntableControls extends THREE.EventDispatcher {
  constructor(camera, element) {
    super();
    this.camera = camera; this.element = element; this.target = new THREE.Vector3();
    this.minDistance = 12; this.maxDistance = 900; this.rotateSpeed = 0.005;   // radians per pixel
    this.pointers = new Map(); this.panning = false;
    this.last = { position: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3() };
    element.addEventListener('pointerdown', event => this.pointerDown(event));
    element.addEventListener('pointermove', event => this.pointerMove(event));
    element.addEventListener('pointerup', event => this.pointerUp(event));
    element.addEventListener('pointercancel', event => this.pointerUp(event));
    element.addEventListener('contextmenu', event => event.preventDefault());
    /* a pinch (which arrives as a wheel event with ctrl held) and a mouse wheel zoom toward the pointer; a two-finger swipe on
       a trackpad moves the view, up and down the body or across it. A trackpad's wheel events report wheelDeltaY as -3
       times deltaY; a mouse wheel's do not (Firefox, which has no wheelDeltaY, reports a mouse wheel in lines). */
    element.addEventListener('wheel', event => {
      event.preventDefault();
      const trackpad = event.wheelDeltaY !== undefined ? event.wheelDeltaY === -3 * event.deltaY && event.deltaY !== 0 || event.deltaX !== 0 : event.deltaMode === 0;
      if (trackpad && !event.ctrlKey) this.pan(-event.deltaX, -event.deltaY);
      else this.zoomAt(Math.exp(event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), event.clientX, event.clientY);
      this.dispatchEvent({ type: 'start' });
    }, { passive: false });
  }
  pointerDown(event) {
    if (this.pointers.size === 0) {
      this.element.setPointerCapture(event.pointerId);
      this.panning = event.pointerType === 'mouse' && (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey);
      this.dispatchEvent({ type: 'start' });
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  pointerMove(event) {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    if (this.pointers.size === 1) {
      if (this.panning) this.pan(current.x - previous.x, current.y - previous.y);
      else this.rotate(current.x - previous.x, current.y - previous.y);
    } else {
      /* two fingers: the gap between them zooms, their midpoint pans */
      const other = [...this.pointers].find(([id]) => id !== event.pointerId)[1];
      const gapBefore = Math.hypot(previous.x - other.x, previous.y - other.y), gapAfter = Math.hypot(current.x - other.x, current.y - other.y);
      if (gapBefore > 0 && gapAfter > 0) this.zoom(gapBefore / gapAfter);
      this.pan((current.x - previous.x) / 2, (current.y - previous.y) / 2);
    }
    this.pointers.set(event.pointerId, current);
  }
  pointerUp(event) {
    if (!this.pointers.delete(event.pointerId)) return;
    if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
    if (this.pointers.size === 0) this.dispatchEvent({ type: 'end' });
  }
  rotate(dx, dy) {
    const up = this.camera.up.clone().normalize();
    const eye = this.camera.position.clone().sub(this.target);
    eye.applyAxisAngle(up, -dx * this.rotateSpeed);
    /* tilt about the screen's right-hand axis, stopping short of looking straight along "up" */
    const polar = eye.angleTo(up), limit = 0.12;
    const tilt = THREE.MathUtils.clamp(polar - dy * this.rotateSpeed, limit, Math.PI - limit) - polar;
    eye.applyAxisAngle(new THREE.Vector3().crossVectors(up, eye).normalize(), tilt);
    this.camera.position.copy(this.target).add(eye);
  }
  pan(dx, dy) {
    const eye = this.camera.position.clone().sub(this.target);
    const perPixel = 2 * eye.length() * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / this.element.clientHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const screenUp = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const shift = right.multiplyScalar(-dx * perPixel).addScaledVector(screenUp, dy * perPixel);
    this.camera.position.add(shift); this.target.add(shift);
  }
  zoom(factor) {
    const eye = this.camera.position.clone().sub(this.target);
    eye.setLength(THREE.MathUtils.clamp(eye.length() * factor, this.minDistance, this.maxDistance));
    this.camera.position.copy(this.target).add(eye);
  }
  /* zoom about the point under the pointer, at the target's depth, so what is under the pointer stays there */
  zoomAt(factor, clientX, clientY) {
    const distance = this.camera.position.distanceTo(this.target);
    factor = THREE.MathUtils.clamp(distance * factor, this.minDistance, this.maxDistance) / distance;
    const rect = this.element.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), this.target);
    const point = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) { this.zoom(factor); return; }
    this.target.sub(point).multiplyScalar(factor).add(point);
    this.camera.position.sub(point).multiplyScalar(factor).add(point);
  }
  /* move the view straight up or down the body, by cm */
  lift(cm) { this.target.y += cm; this.camera.position.y += cm; }
  update() {
    this.camera.lookAt(this.target);
    const { last } = this;
    if (last.position.equals(this.camera.position) && last.target.equals(this.target) && last.up.equals(this.camera.up)) return;
    last.position.copy(this.camera.position); last.target.copy(this.target); last.up.copy(this.camera.up);
    this.dispatchEvent({ type: 'change' });
  }
}
const controls = new TurntableControls(camera, canvas);
/* draw only when something changed: an idle page costs nothing */
let needsRender = true, renderCount = 0, lastChange = 0;
const invalidate = () => { needsRender = true; lastChange = performance.now(); };
controls.addEventListener('change', invalidate);
controls.addEventListener('start', () => { flight = null; if (!state.touched) { state.touched = true; $('hint').hidden = true; } });
const root = new THREE.Group(); scene.add(root);
/* studio lighting: warm key from front left, cool low fill, and a rim from behind to separate the model from the backdrop */
scene.add(new THREE.HemisphereLight(0xffffff, 0x6f757a, 0.45));
const key = new THREE.DirectionalLight(0xfff4ec, 2.4); key.position.set(-120, 160, 220); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(140, 120, -200); scene.add(rim);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5); fill.position.set(160, -60, 60); scene.add(fill);

/* ---------- Per-part state ----------
   Each part's colour and opacity live in one texel of a texture the shaders read by the vertex's _part index, and its
   flags in a second: red = selected, green = isolation context (drawn as grey outlines), blue = no ink line, alpha = the
   faint highlight glow, for a selected part shown among the others (an isolated part needs none). */
const STATE_WIDTH = 1024;
const stateTexture = { colour: null, flags: null, moves: null, rows: 1 };
function makeStateTextures(count) {
  const rows = Math.max(1, Math.ceil(count / STATE_WIDTH));
  for (const name of ['colour', 'flags']) {
    stateTexture[name]?.dispose();
    const texture = new THREE.DataTexture(new Uint8Array(STATE_WIDTH * rows * 4), STATE_WIDTH, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.needsUpdate = true;
    stateTexture[name] = texture;
  }
  /* how a part moves (the beating heart): the point it shrinks toward, and its kind of movement */
  stateTexture.moves?.dispose();
  stateTexture.moves = new THREE.DataTexture(new Float32Array(STATE_WIDTH * rows * 4), STATE_WIDTH, rows, THREE.RGBAFormat, THREE.FloatType);
  stateTexture.moves.magFilter = stateTexture.moves.minFilter = THREE.NearestFilter; stateTexture.moves.needsUpdate = true;
  stateTexture.rows = rows; heart.for = null;   // the new texture has no movements yet
  for (const uniforms of shaderUniforms) { uniforms.uColour.value = stateTexture.colour; uniforms.uFlags.value = stateTexture.flags; uniforms.uMoves.value = stateTexture.moves; }
}
const shaderUniforms = [];
const outlineResolution = { value: new THREE.Vector2(1, 1) };
const VERTEX_STATE = `
attribute float _part;
uniform sampler2D uColour; uniform sampler2D uFlags; uniform highp sampler2D uMoves; uniform vec2 uBeat;
varying vec4 vState; varying vec4 vFlags; varying float vCutX;
`;
const FETCH_STATE = `
  ivec2 cell = ivec2(int(mod(_part, ${STATE_WIDTH}.0)), int(_part / ${STATE_WIDTH}.0));
  vState = texelFetch(uColour, cell, 0); vFlags = texelFetch(uFlags, cell, 0);
  vCutX = position.x;
`;
/* a part that moves shrinks toward its pivot: an atrium with the atria's squeeze (uBeat.x), a ventricle with the ventricles' (uBeat.y); a cavity far more than its wall */
const MOVE = name => `
  vec4 moves = texelFetch(uMoves, cell, 0);
  float squeeze = moves.w < 0.5 ? 0.0 : moves.w < 1.5 ? uBeat.x * 0.07 : moves.w < 2.5 ? uBeat.y * 0.09 : moves.w < 3.5 ? uBeat.x * 0.2 : uBeat.y * 0.26;
  ${name} = moves.xyz + (${name} - moves.xyz) * (1.0 - squeeze);
`;
const beatUniform = { value: new THREE.Vector2(0, 0) };
/* the midline cut: everything on the body's left of the cut (x beyond it) is not drawn */
const cutUniform = { value: 1e6 };
const CUT_FRAGMENT = 'varying float vCutX; uniform float uCut;\n', CUT_TEST = 'if (vCutX > uCut) discard;';
/* pass 0 draws the solid parts, pass 1 the see-through ones (rim-lit "X-ray" ghosts below half opacity) */
function partMaterial(pass) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, side: pass === 0 ? THREE.FrontSide : THREE.DoubleSide, transparent: pass === 1, depthWrite: pass === 0 });
  material.envMapIntensity = 0.55;
  const uniforms = { uColour: { value: stateTexture.colour }, uFlags: { value: stateTexture.flags }, uMoves: { value: stateTexture.moves }, uBeat: beatUniform, uCut: cutUniform };
  shaderUniforms.push(uniforms);
  material.customProgramCacheKey = () => `body-part-${pass}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_STATE + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${FETCH_STATE}${MOVE('transformed')}`);
    shader.fragmentShader = 'varying vec4 vState; varying vec4 vFlags;\n' + CUT_FRAGMENT + shader.fragmentShader
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
  ${CUT_TEST}
  if (vState.a < 0.004) discard;
  ${pass === 0 ? 'if (vState.a < 0.999) discard;' : 'if (vState.a >= 0.999) discard;'}
  vec4 diffuseColor = vec4(pow(vState.rgb, vec3(2.2)), vState.a);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float edge = 1.0 - abs(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance += diffuseColor.rgb * vec3(0.5, 0.2, 0.14) * pow(edge, 2.5) * 0.7;   // light through thin edges, a cheap subsurface glow
  if (vFlags.a > 0.5) totalEmissiveRadiance += vec3(1.0, 0.69, 0.0) * 0.16;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  if (vState.a < 0.999) {   /* a faded part keeps its silhouette and loses its middle, so faded context stays readable; the more solid it is, the more of its middle it keeps, with no jump on the way */
    float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
    gl_FragColor.a = mix(clamp(vState.a * (0.3 + 3.2 * rim * rim), 0.0, 0.85), vState.a, smoothstep(0.3, 0.95, vState.a));
    if (vFlags.g > 0.5 && vState.a < 0.5) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.52, 0.55, 0.58), 0.75);
  }
  ${pass === 0 ? '' : ''}`);
  };
  return material;
}
/* ink outlines, as in a technical drawing: a copy of each layer pushed outward a fixed number of screen pixels, drawn back
   faces only, in a darker shade of each part's colour (ink for the selected part). Only solid parts get a line. */
function outlineMaterial() {
  const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  const uniforms = { uColour: { value: stateTexture.colour }, uFlags: { value: stateTexture.flags }, uMoves: { value: stateTexture.moves }, uBeat: beatUniform, uCut: cutUniform };
  shaderUniforms.push(uniforms);
  material.customProgramCacheKey = () => 'body-outline';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { uResolution: outlineResolution });
    shader.vertexShader = VERTEX_STATE + 'uniform vec2 uResolution;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${FETCH_STATE}${MOVE('transformed')}`).replace('#include <project_vertex>', `#include <project_vertex>
  vec4 clipNormal = projectionMatrix * modelViewMatrix * vec4(normal, 0.0);
  float width = vFlags.r > 0.5 ? 2.0 : 1.2;
  gl_Position.xy += normalize(clipNormal.xy + 1e-6) / uResolution * 2.0 * width * gl_Position.w;`);
    shader.fragmentShader = 'varying vec4 vState; varying vec4 vFlags;\n' + CUT_FRAGMENT + shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
  ${CUT_TEST}
  if (vState.a < 0.999 || vFlags.b > 0.5) discard;
  vec4 diffuseColor = vec4(vFlags.r > 0.5 ? vec3(0.006, 0.007, 0.008) : pow(vState.rgb * 0.42, vec3(2.2)), 1.0);`);
  };
  return material;
}
/* the pick pass writes each part's index + 1 as a colour; parts fainter than a threshold are skipped */
const pickThreshold = { value: 0.35 };
function pickMaterial() {
  const uniforms = { uColour: { value: stateTexture.colour }, uFlags: { value: stateTexture.flags }, uThreshold: pickThreshold, uMoves: { value: stateTexture.moves }, uBeat: beatUniform, uCut: cutUniform };
  shaderUniforms.push(uniforms);
  return new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide,
    vertexShader: `${VERTEX_STATE} varying float vPart;
      void main() { ${FETCH_STATE} vec3 moved = position; ${MOVE('moved')} vPart = _part + 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0); }`,
    fragmentShader: `uniform float uThreshold; uniform float uCut; varying vec4 vState; varying vec4 vFlags; varying float vPart; varying float vCutX;
      void main() { ${CUT_TEST} if (vState.a < uThreshold) discard; float id = vPart; gl_FragColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, 0.0, 1.0); }`,
  });
}
const MATERIALS = { solid: partMaterial(0), ghost: partMaterial(1), outline: outlineMaterial(), pick: pickMaterial() };
const pickScene = new THREE.Scene();

/* ---------- Data: parts lists and layers, per sex, loaded on demand ---------- */
const SHEET = /mesentery|mesocolon|mesoappendix|omentum|peritone|pleura|pericardi|membrane|fascia|aponeuros|sheath|retinacul|capsule|ligament|septum|tendon|tract\b|meninge|dura|arachnoid|pia mater|falx|tentorium|mesovarium|mesosalpinx|mesometrium|broad ligament|bursa/i;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const bodies = {};        // sex -> { parts, entries, layers: { name -> { promise, group, pick } } }
async function loadBody(sex) {
  if (bodies[sex]) return bodies[sex];
  const response = await fetch(`data/${sex}/parts.json`);
  if (!response.ok) throw new Error(`data/${sex}/parts.json: ${response.status}`);
  const data = await response.json();
  const body = { sex, height: data.height, parts: data.parts, layers: {}, indexes: {} };
  data.parts.forEach((part, index) => {
    part.index = index;
    /* a thin sheet (a membrane, mesentery, fascia, capsule or ligament): drawn without an ink outline, which is drawn
       on the back faces and would fill a sheet in dark */
    part.sheet = SHEET.test(part.name);
  });
  useIndex(body, null);
  bodies[sex] = body;
  return body;
}
/* Which entry each structure belongs to, and the numbered parts: the main entries for the whole body, a close-up's own
   inside it (closeups.mjs). A close-up also has its box and its faint context. */
function useIndex(body, region) {
  const index = body.indexes[region?.id || ''] ||= indexParts(body.parts, body.sex, body.height, region);
  if (region) index.around ||= regionContext(body.parts, index, region);
  Object.assign(body, { keys: index.keys, entryOf: index.entryOf, entries: index.entries, order: index.order, around: region ? index.around : null });
}
function loadLayer(body, layer) {
  if (body.layers[layer]) return body.layers[layer].promise;
  const record = body.layers[layer] = { group: null, pick: null };
  record.promise = loader.loadAsync(`data/${body.sex}/${layer}.glb`).then(gltf => {
    const group = new THREE.Group(); group.name = `${body.sex}-${layer}`;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry;
      if (!geometry.attributes._part) throw new Error(`${layer}.glb has no _PART attribute`);
      /* the positions arrive quantized (normalized 16-bit, placed by the node's transform): expand to floats and bake the
         transform in, so the layer sits in the model frame and its vertices read back in cm */
      for (const name of ['position', 'normal']) {
        const attribute = geometry.attributes[name], array = new Float32Array(attribute.count * 3);
        for (let k = 0; k < attribute.count; k++) { array[3 * k] = attribute.getX(k); array[3 * k + 1] = attribute.getY(k); array[3 * k + 2] = attribute.getZ(k); }
        geometry.setAttribute(name, new THREE.BufferAttribute(array, 3));
      }
      geometry.applyMatrix4(object.matrixWorld);
      geometry.computeBoundingSphere();
      for (const material of [MATERIALS.solid, MATERIALS.outline, MATERIALS.ghost]) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = material === MATERIALS.ghost ? 2 : material === MATERIALS.outline ? 1 : 0;
        mesh.raycast = () => {};
        group.add(mesh);
      }
      const pick = new THREE.Mesh(geometry, MATERIALS.pick); pickScene.add(pick); record.pick = pick;
      measureAnchors(body, geometry);
    });
    record.group = group;
    root.add(group);
    applyVisibility();
    invalidate();
    return record;
  });
  return record.promise;
}
/* the clothing (data/<sex>/clothing.glb), its colours in the file; not a part, so it is neither listed nor picked */
const CLOTH = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
const CUT_PLANE = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);   // keeps x < 0, as the parts' own cut does
renderer.localClippingEnabled = true;
function loadClothing(body) {
  if (body.clothing) return body.clothing.promise;
  const record = body.clothing = { group: null };
  record.promise = loader.loadAsync(`data/${body.sex}/clothing.glb`).then(gltf => {
    gltf.scene.traverse(object => { if (object.isMesh) { object.material = CLOTH; object.renderOrder = 3; object.raycast = () => {}; } });
    gltf.scene.name = `${body.sex}-clothing`;
    record.group = gltf.scene;
    root.add(gltf.scene);
    applyVisibility();
    return record;
  });
  return record.promise;
}
/* how solid the clothing is: solid on an opaque body; as the body fades, the clothing fades less, so it still covers */
/* The page opens covered and stays covered as you look around; what you deliberately choose is shown: the Clothing
   switch, or picking a reproductive or genital part (the cover comes off while it is selected). */
const UNDER_COVER = /penis|scrot|testi|epididym|vagin|vulva|clitor|labi(a|um) (majora|minora|majus|minus)|mons pubis|vestibul|hymen|urethral orifice|bulbospong|ischiocavern|uterus|ovar|perine|pubic hair/i;
const revealed = () => selectedParts().some(index => body.parts[index].group === 'reproductive' || UNDER_COVER.test(body.parts[index].name));
function clothingOpacity() {
  if (!state.clothed || state.layers.skin === 'off' || revealed() || state.region) return 0;   // a close-up is of what lies under it
  if (isolating()) return 0.12;
  return Math.min(1, state.body / 0.05) * (0.35 + 0.65 * state.body);   // solid on solid skin; fainter with it but still covering; gone only as the skin goes
}

/* a label's dot sits on a vertex of its part: the one nearest the middle of the part's box */
function measureAnchors(body, geometry) {
  const position = geometry.attributes.position, part = geometry.attributes._part;
  for (let k = 0; k < position.count; k++) {
    const p = body.parts[part.getX(k)], x = position.getX(k), y = position.getY(k), z = position.getZ(k);
    const d = (x - p.centre[0]) ** 2 + (y - p.centre[1]) ** 2 + (z - p.centre[2]) ** 2;
    if (p.anchorDistance === undefined || d < p.anchorDistance) { p.anchorDistance = d; p.anchor = [x, y, z]; }
  }
}

/* ---------- State ---------- */
const state = {
  sex: 'male', view: 'body', peel: 0, blend: null, spot: 'heart', region: null, layers: {}, xray: 0, body: 0.25, labels: true, clothed: true, cut: false, beat: !reducedMotion(), tone: 0,
  selection: null, hovered: -1, drawer: false, dock: false, closeups: false, inspectorOpen: true, sheet: 'peek', tour: null, touched: false, search: '',
};
try { const saved = JSON.parse(localStorage.getItem('wl-body') || '{}'); if (saved.tonePicked && Number.isInteger(saved.tone)) state.tone = saved.tone; if (saved.sex === 'female' || saved.sex === 'male') state.sex = saved.sex; } catch (error) { /* storage unavailable */ }
const params = new URLSearchParams(location.search);
if (params.get('sex') === 'female' || params.get('sex') === 'male') state.sex = params.get('sex');
let body = null;   // the body on show
/* what is on show: one of the whole-body views, or a close-up, which has the same fields */
const closeUp = () => (state.region ? REGIONS[state.region] : null);
function viewInfo() {
  const region = closeUp();
  if (!region) return VIEW_INFO[state.view];
  return region.info ||= { name: region.id, title: region.title, figure: region.figure, text: region.text, body: region.body ?? 0.1, xray: [], isolate: true,
    items: region.parts.map(key => [key, ALL[key].aka || '']), labels: { any: region.parts }, direction: region.direction ? V(...region.direction).normalize() : null };
}
const GHOST = 0.16;
const TONES = ['#ebc2aa', '#c9966f', '#8f5f3d', '#5b3926'];

/* the selection: an entry (all its parts, from the parts list or stepping) or one picked part (with its entry's text) */
const selectedParts = () => state.selection ? state.selection.parts : [];
const isolating = () => !!state.selection && state.selection.isolate;

function applyVisibility() {
  if (!body) return;
  const view = viewInfo(), around = body.around;
  for (const layer of LAYERS) { const record = body.layers[layer]; if (record?.group) record.group.visible = state.layers[layer] !== 'off'; }
  for (const [sex, other] of Object.entries(bodies)) if (other !== body) for (const record of Object.values(other.layers)) if (record.group) { record.group.visible = false; if (record.pick) record.pick.visible = false; }
  for (const record of Object.values(body.layers)) if (record.pick) record.pick.visible = record.group?.visible;
  for (const other of Object.values(bodies)) if (other.clothing?.group) other.clothing.group.visible = other === body && clothingOpacity() > 0;
  {
    const opacity = clothingOpacity();
    CLOTH.opacity = opacity; CLOTH.transparent = opacity < 1; CLOTH.depthWrite = opacity >= 1;
  }
  /* the midline cut opens every shell, so the inside faces are drawn too, and the ink line (drawn on back faces) is left out */
  cutUniform.value = state.cut ? 0 : 1e6;
  if (MATERIALS.solid.side !== (state.cut ? THREE.DoubleSide : THREE.FrontSide)) { MATERIALS.solid.side = state.cut ? THREE.DoubleSide : THREE.FrontSide; MATERIALS.solid.needsUpdate = true; }
  MATERIALS.outline.visible = !state.cut;
  if ((CLOTH.clippingPlanes?.length || 0) !== (state.cut ? 1 : 0)) { CLOTH.clippingPlanes = state.cut ? [CUT_PLANE] : []; CLOTH.needsUpdate = true; }
  const colours = stateTexture.colour.image.data, flags = stateTexture.flags.image.data;
  const chosen = new Set(selectedParts()), isolate = isolating(), colour = new THREE.Color(), live = beating();
  body.parts.forEach((part, index) => {
    const mode = state.layers[part.layer];
    let opacity = state.blend ? state.blend[part.layer] : mode === 'solid' ? 1 : mode === 'ghost' ? GHOST : 0;
    if (part.layer === 'skin') opacity = mode === 'off' || (state.clothed && !revealed() && !state.region && /pubic hair/i.test(part.name)) ? 0 : state.body;
    else if (around) opacity = around.own.has(index) ? 1 : around.context.has(index) ? (live ? 0.4 * GHOST : GHOST) : 0;   // a close-up: its parts, and its context faint
    if (mode === 'solid' && !state.blend && view.xray.includes(part.layer)) opacity = 1 - (1 - GHOST) * state.xray;
    if (SHOWN_WHEN_CHOSEN.test(part.name) && !chosen.has(index)) opacity = 0;
    if (isolate) opacity = chosen.has(index) ? 1 : Math.min(opacity, part.layer === 'skin' ? 0.05 : 0.12);
    if (chosen.has(index) && !isolate) opacity = Math.max(opacity, 1);
    const look = live && around.own.has(index) ? lookOf(part.name) : null;   // the beating heart: glass walls, cavities the colour of their blood
    if (look && !chosen.has(index)) opacity = Math.min(opacity, look.opacity);
    colour.set(part.layer === 'skin' ? TONES[state.tone] : look?.colour || colourOf(part));
    const k = index * 4;
    colours[k] = Math.round(colour.r * 255); colours[k + 1] = Math.round(colour.g * 255); colours[k + 2] = Math.round(colour.b * 255);
    colours[k + 3] = Math.round(THREE.MathUtils.clamp(opacity, 0, 1) * 255);
    flags[k] = chosen.has(index) ? 255 : 0;
    flags[k + 1] = isolate && !chosen.has(index) ? 255 : 0;
    flags[k + 2] = part.layer === 'skin' || part.layer === 'vessels' || part.group === 'nerves' || part.sheet ? 255 : 0;   // the skin, thin tubes and thin sheets, which a line would darken
    flags[k + 3] = chosen.has(index) && !isolate ? 255 : 0;
  });
  stateTexture.colour.needsUpdate = true; stateTexture.flags.needsUpdate = true;
  setHeart();
  invalidate();
}

/* ---------- UI: drawer, inspector, guided tour ---------- */
const layersEl = $('layers');
for (const layer of LAYERS) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'chip'; button.dataset.layer = layer;
  button.style.setProperty('--dot', LAYER_INFO[layer].dot);
  button.innerHTML = `<i></i>${LAYER_INFO[layer].name}`;
  button.addEventListener('click', () => {
    const mode = state.layers[layer];
    state.layers[layer] = mode === 'off' ? (layer === 'skin' ? 'ghost' : 'solid') : 'off';
    if (layer === 'skin' && state.layers.skin !== 'off' && state.body < 0.05) state.body = 0.25;
    ensureLayers(); applyVisibility(); syncUI();
  });
  layersEl.append(button);
}
const tonesEl = $('tones');
TONES.forEach((tone, k) => {
  const button = document.createElement('button'); button.type = 'button'; button.style.setProperty('--sw', tone);
  button.setAttribute('aria-label', `Skin tone ${k + 1}`);
  button.addEventListener('click', () => { state.tone = k; tonePicked = true; save(); applyVisibility(); syncUI(); });
  tonesEl.append(button);
});
/* the skin tone is kept only once the visitor has picked one, so the default can change for everyone else */
let tonePicked = (() => { try { return !!JSON.parse(localStorage.getItem('wl-body') || '{}').tonePicked; } catch (error) { return false; } })();
const save = () => { try { localStorage.setItem('wl-body', JSON.stringify({ tone: state.tone, tonePicked, sex: state.sex })); } catch (error) { /* storage unavailable */ } };

/* every entry has a number, as in a parts diagram: the callouts on the model and the parts list share it */
const entryNumber = key => body.order.indexOf(key) + 1;   // 0 for an entry that is not among the numbered parts (inside a close-up)
const entryLayer = key => body.parts[body.entries[key][0]].layer;
const entryGroup = key => body.parts[body.entries[key][0]].group;
let listButtons = {};
function buildPartsList() {
  const holder = $('partGroups'); holder.innerHTML = ''; listButtons = {};
  const query = state.search.trim().toLowerCase();
  let shown = 0;
  for (const layer of LAYERS) {
    const keys = body.order.filter(key => entryLayer(key) === layer);
    const structures = body.parts.filter(part => part.layer === layer);
    const keysShown = keys.filter(key => !query || ALL[key].name.toLowerCase().includes(query) || (ALL[key].aka || '').toLowerCase().includes(query));
    const structuresShown = query ? structures.filter(part => part.name.toLowerCase().includes(query)).slice(0, 80) : structures;
    if (!keysShown.length && !(query && structuresShown.length)) continue;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<div class="group-name" style="--dot:${LAYER_INFO[layer].dot}"><i></i>${LAYER_INFO[layer].name}</div>`;
    const list = document.createElement('ul'); list.className = 'part-list';
    for (const key of keysShown) {
      const item = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button'; button.dataset.entry = key;
      button.innerHTML = `<span>${entryNumber(key)}</span>${escapeHtml(ALL[key].name)}`;
      button.addEventListener('click', () => { stopTour(); if (phone.matches) state.drawer = false; selectEntry(key); focusSelection(); });
      item.append(button); list.append(item); listButtons[key] = button; shown++;
    }
    wrapper.append(list);
    if (structuresShown.length) {
      /* every structure of the layer, named and selectable, under a fold (open when searching) */
      const more = document.createElement('details'); more.className = 'more'; if (query) more.open = true;
      more.innerHTML = `<summary>${query ? `${structuresShown.length}${structuresShown.length === 80 ? '+' : ''} structures matching` : `All ${structures.length} ${LAYER_INFO[layer].name.toLowerCase()} structures`}</summary>`;
      const minorList = document.createElement('ul'); minorList.className = 'part-list minor';
      const fill = () => {
        if (minorList.childElementCount) return;
        for (const part of structuresShown.slice().sort((a, b) => a.name.localeCompare(b.name))) {
          const item = document.createElement('li'), button = document.createElement('button');
          button.type = 'button'; button.dataset.part = part.index;
          const at = body.entryOf[part.index];
          button.innerHTML = `<span>${(at >= 0 && entryNumber(body.keys[at])) || '·'}</span>${escapeHtml(part.name)}`;
          button.addEventListener('click', () => { stopTour(); if (phone.matches) state.drawer = false; selectPart(part.index); focusSelection(); });
          item.append(button); minorList.append(item);
        }
      };
      more.addEventListener('toggle', fill); if (query) fill();
      more.append(minorList); wrapper.append(more); shown += query ? structuresShown.length : 0;
    }
    holder.append(wrapper);
  }
  $('searchNote').textContent = query ? (shown ? '' : 'Nothing by that name in this body.') : `${body.order.length} main parts, ${body.parts.length.toLocaleString('en')} structures in all.`;
}
$('search').addEventListener('input', event => { state.search = event.target.value; buildPartsList(); syncUI(); });
$('partsBtn').addEventListener('click', () => { state.drawer = !state.drawer; if (state.drawer) { state.dock = false; state.closeups = false; } syncUI(); });
$('dockBtn').addEventListener('click', () => { state.dock = !state.dock; if (state.dock) { state.drawer = false; state.closeups = false; } syncUI(); });
/* the close-ups this body has, as a menu */
function buildCloseupList() {
  $('closeupList').innerHTML = Object.values(REGIONS).filter(region => !region.sex || region.sex === body.sex).map(region =>
    `<button type="button" data-region="${region.id}"><b>${escapeHtml(region.name)}</b><span>${escapeHtml(region.note || '')}</span></button>`).join('');
}
$('bugList').innerHTML = BUGS.map(([title, fix]) => `<li><b>${escapeHtml(title)}</b><span>${escapeHtml(fix)}</span></li>`).join('');
$('differenceRows').innerHTML = DIFFERENCES.map(([female, male]) => `<tr><td>${escapeHtml(female)}</td><td>${escapeHtml(male)}</td></tr>`).join('');
$('gapList').innerHTML = GAPS.map(([title, text]) => `<li><b>${escapeHtml(title)}.</b> ${escapeHtml(text)}</li>`).join('');

/* the tour visits the main landmarks of each system, each from the view it is best seen in */
const tourStops = () => (state.region ? body.order.map(key => [key, null]) : TOUR.filter(([key]) => body.entries[key]));   // a close-up's tour is its own parts in order
const TOUR_STEP_MS = 7000;
function goTour(index) {
  const stops = tourStops(), [key, view] = stops[index];
  state.tour = { index, playing: state.tour?.playing ?? true, stepStart: performance.now() };
  if (view) applyView(view);
  state.inspectorOpen = true;
  selectEntry(key);
  focusSelection(viewInfo());
}
/* step through the main parts by hand, in number order; each is shown in the view of its layer */
function stepPart(delta) {
  const keys = body.order, current = state.selection ? keys.indexOf(state.selection.entry) : -1;
  const first = state.region ? 0 : Math.max(0, keys.findIndex(key => viewForLayer(entryLayer(key)) === state.view));
  const index = current < 0 ? (delta > 0 ? first : keys.length - 1) : (current + delta + keys.length) % keys.length;
  const key = keys[index];
  stopTour();
  if (phone.matches) state.drawer = false;
  if (!state.region && viewForLayer(entryLayer(key)) !== state.view) applyView(viewForLayer(entryLayer(key)));
  state.inspectorOpen = true;
  selectEntry(key);
  focusSelection(viewInfo());
}
const viewForLayer = layer => ({ skeleton: 'skeleton', muscles: 'muscles', organs: 'organs', vessels: 'vessels', nerves: 'nerves', skin: 'body' })[layer];
function startTour() { state.tour = { index: 0, playing: true }; goTour(0); }
function stopTour() { if (!state.tour) return; state.tour = null; renderInspector(); syncUI(); }
function stepTour(now) {
  if (!state.tour?.playing) return;
  /* with the sound on, a stop that is spoken lasts as long as the voice, and a breath more */
  if (sound.on && sound.clip ? sound.speaking || now - sound.endedAt < AFTER_VOICE_MS : now - state.tour.stepStart < TOUR_STEP_MS) return;
  if (state.tour.index + 1 < tourStops().length) goTour(state.tour.index + 1);
  else { state.tour.playing = false; renderInspector(); syncUI(); }
}
$('tourBtn').addEventListener('click', () => state.tour ? stopTour() : startTour());

/* ---------- The beating heart (heartbeat.mjs says what moves, when, and where the blood goes) ----------
   In the heart close-up the chambers squeeze in turn (the shader shrinks each toward its pivot), the valves show open
   (faint) or shut (solid), and two streams of drops run through: spent blood to the lungs, fresh blood to the body. */
const beating = () => state.region === 'heart' && state.beat && !state.cut;
const heart = { for: null, valves: [], streams: [], phase: 0, caption: '', last: 0, held: null };   // held: a moment of the beat to stay at (tests and pictures)
const DROP = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), fill = g.createRadialGradient(16, 16, 0, 16, 16, 16); fill.addColorStop(0, 'rgba(255,255,255,1)'); fill.addColorStop(0.5, 'rgba(255,255,255,0.9)'); fill.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = fill; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const DROPS = 280;
function setHeart() {
  const live = beating(), key = live ? body.sex : null;
  for (const stream of heart.streams) stream.points.visible = live && stream.sex === body.sex;
  if (heart.for === key) return;
  heart.for = key;
  const moves = stateTexture.moves.image.data; moves.fill(0);
  heart.valves = [];
  if (live) {
    const named = name => { const part = body.parts.find(item => item.name === name); if (!part) throw new Error(`the ${body.sex} heart has no ${name}`); return part; };
    const middle = parts => parts.reduce((sum, part) => sum.add(V(...part.centre)), V(0, 0, 0)).divideScalar(parts.length);
    const own = [...body.around.own].map(index => body.parts[index]);
    const valve = pattern => { const parts = own.filter(part => (INFLOW_VALVE.test(part.name) || OUTFLOW_VALVE.test(part.name)) && pattern.test(part.name)); if (!parts.length) throw new Error(`the heart has no valve matching ${pattern}`); return middle(parts); };
    const base = middle(own.filter(part => INFLOW_VALVE.test(part.name) || OUTFLOW_VALVE.test(part.name)));   // the plane of the four valves: the ventricles shorten toward it
    const riding = new Set(RIDES_THE_WALL.flatMap(entry => body.entries[entry] || []));
    for (const index of body.around.own) {
      const part = body.parts[index], move = riding.has(index) ? 2 : moveOf(part.name);
      if (INFLOW_VALVE.test(part.name) || OUTFLOW_VALVE.test(part.name)) heart.valves.push({ index, inflow: INFLOW_VALVE.test(part.name) });
      if (!move) continue;
      /* an atrium's wall shrinks about its cavity's middle, the ventricles' wall toward the valves, a ventricle's cavity toward a point between */
      const pivot = move === 2 ? base : move === 1 ? V(...named(part.name.replace('Wall', 'Cavity')).centre) : move === 4 ? V(...part.centre).lerp(base, 0.45) : V(...part.centre);
      moves.set([pivot.x, pivot.y, pivot.z, move], index * 4);
    }
    if (!heart.streams.some(stream => stream.sex === body.sex)) for (const { colour, through } of STREAMS) {
      const points = [], marks = {};
      for (const stop of through) {
        if (typeof stop === 'string') points.push(V(...named(stop).centre));
        else if (stop.ventricle) { const centre = V(...named(stop.ventricle).centre); points.push(centre.clone().lerp(base, -0.55)); }   // down toward the apex before it turns for the way out
        else { marks[stop.inflow ? 'inflow' : 'outflow'] = points.length; points.push(valve(stop.inflow || stop.outflow)); }
      }
      const last = points.at(-1), before = points.at(-2);
      points.push(last.clone().add(last.clone().sub(before).setLength(2.5)));
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal'), lengths = curve.getLengths(200);
      const whereOf = at => { const target = points[at]; let best = 0, bestDistance = Infinity; for (let k = 0; k <= 200; k++) { const d = curve.getPointAt(k / 200).distanceTo(target); if (d < bestDistance) { bestDistance = d; best = k / 200; } } return best; };
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 3), 3));
      const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({ color: new THREE.Color(colour).lerp(new THREE.Color('#ffffff'), 0.3), size: 0.8, map: DROP, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, sizeAttenuation: true }));
      cloud.renderOrder = 4; cloud.frustumCulled = false; cloud.raycast = () => {};
      root.add(cloud);
      heart.streams.push({ sex: body.sex, points: cloud, curve, inflowAt: whereOf(marks.inflow), outflowAt: whereOf(marks.outflow), length: lengths.at(-1),
        drops: Array.from({ length: DROPS }, (_, k) => ({ where: (k + Math.random()) / DROPS, off: V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.65) })) });
    }
    for (const stream of heart.streams) stream.points.visible = stream.sex === body.sex;
  } else { beatUniform.value.set(0, 0); heart.caption = ''; }
  stateTexture.moves.needsUpdate = true;
}
const spot = new THREE.Vector3();
function stepHeart(now) {
  if (!beating() || heart.for !== body.sex) return;
  const seconds = THREE.MathUtils.clamp((now - heart.last) / 1000, 0, 0.05); heart.last = now;   // frames can arrive out of order by a hair: the blood never steps back
  const before = heart.phase; heart.phase = heart.held ?? (now % CYCLE_MS) / CYCLE_MS;
  const beat = beatAt(heart.phase);
  beatUniform.value.set(beat.atria, beat.ventricles);
  /* a valve shows solid when shut and faint when open (a chosen one stays solid) */
  const colours = stateTexture.colour.image.data, chosen = new Set(selectedParts());
  for (const { index, inflow } of heart.valves) colours[index * 4 + 3] = chosen.has(index) || !(inflow ? beat.inflowOpen : beat.outflowOpen) ? 255 : 46;
  stateTexture.colour.needsUpdate = true;
  for (const stream of heart.streams) {
    if (stream.sex !== body.sex) continue;
    const position = stream.points.geometry.attributes.position;
    stream.drops.forEach((drop, k) => {
      let next = drop.where + flowAt(drop.where, stream.inflowAt, stream.outflowAt, beat) * seconds;
      /* a shut valve holds the blood behind it */
      if (!beat.inflowOpen && drop.where < stream.inflowAt && next >= stream.inflowAt) next = drop.where;
      if (!beat.outflowOpen && drop.where < stream.outflowAt && next >= stream.outflowAt) next = drop.where;
      drop.where = next >= 1 ? next - 1 : next;
      stream.curve.getPointAt(drop.where, spot);
      const narrow = Math.min(1, 0.45 + 6 * Math.min(Math.abs(drop.where - stream.inflowAt), Math.abs(drop.where - stream.outflowAt)));   // the stream narrows through a valve
      position.setXYZ(k, spot.x + drop.off.x * narrow, spot.y + drop.off.y * narrow, spot.z + drop.off.z * narrow);
    });
    position.needsUpdate = true;
  }
  if (sound.on) { if (before < FIRST_SOUND && heart.phase >= FIRST_SOUND) thump(58, 0.13, 0.5); if (before < SECOND_SOUND && heart.phase >= SECOND_SOUND) thump(74, 0.09, 0.36); }
  if (beat.caption !== heart.caption) { heart.caption = beat.caption; $('figure').textContent = beat.caption; }
  needsRender = true;
}
/* a heart sound: a short low thump */
let audioContext = null;
function thump(pitch, seconds, level) {
  audioContext ||= new AudioContext();
  const start = audioContext.currentTime, tone = audioContext.createOscillator(), gain = audioContext.createGain();
  tone.frequency.setValueAtTime(pitch, start); tone.frequency.exponentialRampToValueAtTime(pitch * 0.6, start + seconds);
  gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(level, start + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  tone.connect(gain).connect(audioContext.destination); tone.start(start); tone.stop(start + seconds + 0.02);
}

/* ---------- Sound: music under everything, and a voice for what is on show ----------
   Off until asked for (a browser plays nothing before a click). audio/manifest.json lists the music and the voice clips
   (scripts/body/make-audio.mjs); a clip belongs to a part, a close-up's opening, or a whole-body view. */
const MUSIC_LEVEL = 0.2, UNDER_VOICE = 0.07, AFTER_VOICE_MS = 900;
const sound = { on: false, manifest: null, music: new Audio(), voice: new Audio(), key: null, clip: null, speaking: false, endedAt: 0 };
sound.music.loop = true; sound.music.volume = MUSIC_LEVEL;
sound.voice.addEventListener('ended', () => { sound.speaking = false; sound.endedAt = performance.now(); sound.music.volume = MUSIC_LEVEL; invalidate(); });
const voiceKey = () => (state.selection?.entry ? `entry:${state.selection.entry}` : state.region ? `region:${state.region}` : state.selection || state.blend ? null : `view:${state.view}`);
/* a browser may still refuse to play (no click yet): the sound goes back off. A clip cut short by the next one is not a refusal. */
const refused = error => { if (error.name === 'AbortError') return; sound.on = false; sound.music.pause(); sound.voice.pause(); sound.speaking = false; syncUI(); };
function speak() {
  const key = sound.on ? voiceKey() : null;
  if (key === sound.key) return;
  sound.key = key; sound.clip = key && sound.manifest.narration[key] ? sound.manifest.narration[key].file : null;
  sound.voice.pause(); sound.speaking = false; sound.music.volume = MUSIC_LEVEL;
  if (!sound.clip) return;
  sound.voice.src = `audio/${sound.clip}`; sound.speaking = true; sound.music.volume = UNDER_VOICE;
  sound.voice.play().catch(refused);
}
$('soundBtn').addEventListener('click', () => {
  sound.on = !sound.on;
  if (sound.on && sound.manifest.music) { sound.music.src ||= `audio/${sound.manifest.music}`; sound.music.play().catch(refused); }
  if (!sound.on) { sound.music.pause(); sound.voice.pause(); sound.speaking = false; }
  syncUI();
});

const otherSex = () => state.sex === 'male' ? 'female' : 'male';
function sourceNote(parts) {
  const fitted = parts.some(index => body.parts[index].fitted);
  const source = body.parts[parts[0]].source;
  return fitted
    ? `<div class="source"><em class="fitted">Fitted</em><span>The male body's part (${escapeHtml(SOURCE_NAME[source] || source)}), reshaped with the whole body to a young woman's build. No free female model of this part exists.</span></div>`
    : `<div class="source"><em>${MODELLED.includes(source) ? 'Modelled' : 'Scanned'}</em><span>${escapeHtml(SOURCE_TEXT[source] || source)}</span></div>`;
}
const SOURCE_NAME = { 'NIH male': 'NIH Visible Human Male' };
const MODELLED = ['MakeHuman', 'Wooten Labs'];
const SOURCE_TEXT = {
  BodyParts3D: 'BodyParts3D: an adult Japanese man, built from CT and MRI.',
  'NIH female': 'NIH Visible Human Female: a 59-year-old woman, from cryosection images. Fitted into the slim young body here.',
  MakeHuman: 'MakeHuman base mesh with young-female shape targets (CC0), in the pose of the male body.',
  'Wooten Labs': 'Built in code from published measurements (clitoris: Longhurst 2023; vulva: Lloyd 2005), and placed here by her pelvic bones.',
  'NIH male': 'NIH Visible Human Male: a 38-year-old man, from cryosection images. Aligned to the BodyParts3D body.',
  'Z-Anatomy': 'Z-Anatomy, an open atlas built on BodyParts3D (CC BY-SA 4.0). Aligned to the BodyParts3D body.',
};
function renderInspector() {
  const el = $('inspector');
  if (el.hidden !== !state.inspectorOpen) el.hidden = !state.inspectorOpen;
  requestAnimationFrame(resize);   // the free space for the model changes with the panel
  const selection = state.selection;
  el.classList.toggle('empty', !selection && !state.tour);
  el.classList.toggle('peek', state.sheet === 'peek');
  const handle = `<button type="button" class="sheet-handle" data-sheet aria-label="${state.sheet === 'peek' ? 'Show more' : 'Show less'}"></button>`;
  const stops = body ? tourStops() : [];
  const tour = state.tour ? `
    <div class="tour-bar">
      <span class="count" id="tourCount">Tour ${state.tour.index + 1} of ${stops.length}</span>
      <button type="button" class="btn" data-tour="prev" ${state.tour.index === 0 ? 'disabled' : ''}>Back</button>
      <button type="button" class="btn" data-tour="play">${state.tour.playing ? 'Pause' : 'Play'}</button>
      <button type="button" class="btn primary" data-tour="next" ${state.tour.index === stops.length - 1 ? 'disabled' : ''}>Next</button>
      <button type="button" class="btn" data-tour="stop">End</button>
      <div class="tour-progress"><span style="width:${((state.tour.index + 1) / stops.length * 100).toFixed(1)}%"></span></div>
    </div>` : '';
  if (!selection) {
    const intro = viewInfo();
    const items = body ? intro.items.filter(([key]) => body.entries[key]) : [];
    const eyebrow = state.region ? `Close-up · ${body.order.length} parts` : `Layer ${String(Math.round(state.peel) + 1).padStart(2, '0')} / ${String(PEEL.length).padStart(2, '0')}`;
    el.innerHTML = `${handle}
      ${state.region ? '<button type="button" class="quiet leave" data-leave>←  Whole body</button>' : ''}
      <div class="eyebrow">${eyebrow}</div>
      <div class="welcome"><h2>${escapeHtml(intro.title)}</h2></div>
      <p class="lead">${escapeHtml(intro.text[state.sex] || intro.text.any)}</p>
      ${state.region ? `<div class="nav-row"><button type="button" class="go" data-tour-start>Start the tour  →</button></div>` : `<div class="exits">${items.map(([key, note]) => `
        <button type="button" data-entry="${key}"><i>${String(entryNumber(key)).padStart(2, '0')}</i><b>${escapeHtml(ALL[key].name)}</b><span>${escapeHtml(note)}</span></button>`).join('')}
      </div>`}
      <button type="button" class="quiet step-start" data-step="1">${state.region ? 'Or step through the parts yourself' : 'Step through the parts  →'}</button>
      ${state.region === 'heart' ? `<button type="button" class="quiet" data-beat>${state.beat ? 'Stop the heart beating' : 'Set the heart beating'}</button>` : ''}
      <p class="small">Drag to turn · scroll or pinch to zoom · ↑ ↓ move along the body · ← → step from part to part</p>`;
    return;
  }
  const key = selection.entry, entry = key ? ALL[key] : null, part = body.parts[selection.part ?? selection.parts[0]];
  const title = selectionName();
  const picked = selection.part !== undefined ? body.parts[selection.part].name : null;
  const aka = !entry ? `${LAYER_INFO[part.layer].name} · ${GROUP_INFO[part.group]?.name || part.group}`
    : title !== entry.name ? `Part of: ${entry.name}` : picked && picked !== entry.name ? `Selected piece: ${picked}` : entry.aka;
  const stepper = state.tour || !key || !entryNumber(key) ? '' : `<div class="stepper"><span>${body.order.indexOf(key) + 1} of ${body.order.length}</span></div>`;   // Back and Next are under the story
  const size = part.max.map((value, axis) => value - part.min[axis]);
  const facts = entry ? entry.stats : [['Size (this model)', `${Math.max(...size).toFixed(1)} cm across`], ['Layer', LAYER_INFO[part.layer].name]];
  const equivalent = entry && (entry.other?.[otherSex()] ?? entry.other?.any);
  el.innerHTML = `${handle}${tour}
    <div class="inspector-head"><span class="sys" style="--dot:${LAYER_INFO[part.layer].dot}">${key && entryNumber(key) ? `<em class="no">${entryNumber(key)}</em>` : ''}${escapeHtml(GROUP_INFO[part.group]?.name || LAYER_INFO[part.layer].name)}</span>${stepper}${isolating() ? '<button type="button" class="btn show-all" data-show-all>Show all</button>' : ''}<button type="button" class="close" data-close aria-label="Close panel">×</button></div>
    <div><h2 id="inspectorTitle">${escapeHtml(title)}</h2><div class="aka">${escapeHtml(aka || '')}</div></div>
    ${entry ? `<p>${escapeHtml(entry.what)}</p><p>${escapeHtml(entry.does)}</p><div class="bug"><b>Common misconception</b>${escapeHtml(entry.bug)}</div>` : `<p>One of the ${body.parts.length} structures in this model, in the ${escapeHtml((GROUP_INFO[part.group]?.name || part.group).toLowerCase())}. The main parts have full notes; step through them with ‹ ›.</p>`}
    <dl class="stats">${facts.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>
    ${equivalent ? `<div class="homolog">${state.sex === 'male' ? 'Female' : 'Male'} equivalent: <b>${escapeHtml(equivalent)}</b></div>` : ''}
    ${storyNav(key)}
    ${sourceNote(selection.parts)}`;
}
/* Back, and Next named for the stop it leads to: the numbered parts in order */
function storyNav(key) {
  const at = key ? body.order.indexOf(key) : -1;
  if (at < 0) return '';
  const next = body.order[(at + 1) % body.order.length];
  return `<div class="nav-row"><button type="button" class="back" data-step="-1">Back</button><button type="button" class="go" data-step="1">Next: ${escapeHtml(ALL[next].short || ALL[next].name)}  →</button></div>`;
}
/* The right column (desktop). On the whole body: the card of the close-up whose glowing point was chosen. In a close-up:
   its stops, numbered, the one on show marked. */
const HOTSPOTS = [['brain', 'frontalLobe', null, 'Brain'], ['eye', 'eye', 'right', 'Eye'], ['heart', 'heart', null, 'Heart'], ['shoulder', 'scapula', 'right', 'Shoulder'], ['digestive', 'smallIntestine', null, 'Gut'], ['hand', 'carpals', 'right', 'Hand'], ['knee', 'patella', 'right', 'Knee'], ['foot', 'talus', 'right', 'Foot']];
const atHome = () => !state.region && !state.selection && !state.tour;
let sideShown = null;
function renderSide() {
  const el = $('side');
  if (!body || phone.matches) { el.hidden = true; return; }
  const key = state.region ? `stops ${state.region} ${body.sex} ${state.selection?.entry || ''}` : atHome() && REGIONS[state.spot] ? `card ${state.spot}` : '';
  if (key === sideShown) return;
  sideShown = key;
  el.hidden = !key;
  if (state.region) {
    el.innerHTML = `<div class="hint-line">${escapeHtml(REGIONS[state.region].name)}: ${body.order.length} stops</div><div class="stops">${body.order.map((entry, k) =>
      `<button type="button" data-entry="${entry}" aria-current="${entry === state.selection?.entry}"><i>${String(k + 1).padStart(2, '0')}</i>${escapeHtml(ALL[entry].short || ALL[entry].name)}</button>`).join('')}</div>`;
  } else if (key) {
    const region = REGIONS[state.spot];
    el.innerHTML = `<div class="hint-line">Tap a glowing point on the body</div>
      <div class="card"><div class="shot"><img src="img/close-${region.id}.webp" alt="${escapeHtml(region.name)}, close up"></div>
      <div class="body"><div class="meta">${region.parts.length} parts · about ${Math.max(2, Math.round(region.parts.length * 7 / 60))} min</div><h3>${escapeHtml(region.title)}</h3><p>${escapeHtml(region.note.charAt(0).toUpperCase() + region.note.slice(1))}.</p>
      <button type="button" class="go" data-tour-region="${region.id}">Start the tour  →</button><button type="button" class="quiet" data-region="${region.id}">Or explore it freely</button></div></div>`;
  }
  requestAnimationFrame(resize);
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-entry],[data-tour],[data-close],[data-sheet],[data-step],[data-show-all],[data-route],[data-leave],[data-region],[data-tour-region],[data-tour-start],[data-beat]');
  if (!target || target.closest('#views') || target.closest('#partGroups')) return;
  if (target.hasAttribute('data-leave')) { stopTour(); setView(state.view); }
  if (target.dataset.tourRegion) { setRegion(target.dataset.tourRegion); startTour(); return; }
  if (target.hasAttribute('data-tour-start')) { startTour(); return; }
  if (target.hasAttribute('data-beat')) { state.beat = !state.beat; applyVisibility(); renderInspector(); syncUI(); return; }
  if (target.dataset.region) { stopTour(); state.closeups = false; setRegion(target.dataset.region); }
  if (target.dataset.step) stepPart(Number(target.dataset.step));
  if (target.hasAttribute('data-show-all')) { select(null); resetView(); }
  const action = target.dataset.tour;
  if (action === 'stop') stopTour();
  if (action === 'next' && state.tour) goTour(Math.min(tourStops().length - 1, state.tour.index + 1));
  if (action === 'prev' && state.tour) goTour(Math.max(0, state.tour.index - 1));
  if (action === 'play' && state.tour) { state.tour.playing = !state.tour.playing; state.tour.stepStart = performance.now(); renderInspector(); }
  if (target.hasAttribute('data-close')) { if (phone.matches) { state.selection = null; applyVisibility(); syncUI(); } else state.inspectorOpen = false; stopTour(); renderInspector(); }
  if (target.hasAttribute('data-sheet')) { state.sheet = state.sheet === 'peek' ? 'full' : 'peek'; renderInspector(); }
  if (target.dataset.entry && body.entries[target.dataset.entry]) {
    stopTour();
    const key = target.dataset.entry, view = target.dataset.view || viewForLayer(entryLayer(key));
    if (target.dataset.view ? state.region || view !== state.view : !state.region && view !== state.view) applyView(view);   // a close-up's own parts stay in it
    selectEntry(key);
    focusSelection(viewInfo());
    if (target.closest('.manual')) $('viewer').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
});

function syncUI() {
  invalidate();
  $('drawer').hidden = !state.drawer;
  $('partsBtn').setAttribute('aria-expanded', String(state.drawer));
  for (const button of layersEl.children) button.setAttribute('aria-pressed', String(state.layers[button.dataset.layer] !== 'off'));
  const current = state.selection?.entry;
  for (const [key, button] of Object.entries(listButtons)) button.setAttribute('aria-current', String(key === current));
  [...tonesEl.children].forEach((button, k) => button.setAttribute('aria-pressed', String(k === state.tone)));
  for (const button of document.querySelectorAll('[data-toggle]')) button.setAttribute('aria-pressed', String(state[button.dataset.toggle]));
  for (const button of $('sexSwitch').children) button.setAttribute('aria-pressed', String(button.dataset.sex === state.sex));
  $('tourBtn').setAttribute('aria-pressed', String(!!state.tour));
  $('tourBtn').querySelector('span').textContent = state.tour ? 'End tour' : 'Guided tour';
  $('dock').classList.toggle('open', state.dock);
  $('dockBtn').setAttribute('aria-expanded', String(state.dock));
  $('soundBtn').setAttribute('aria-pressed', String(sound.on));
  speak();
  $('peel').value = Math.round(state.peel * 100);
  $('peel').parentElement.hidden = !!state.region;   // the peel is of the whole body
  renderSide();
  $('closeups').hidden = !state.closeups;
  $('closeupsBtn').setAttribute('aria-expanded', String(state.closeups));
  for (const button of $('closeupList').children) button.setAttribute('aria-current', String(button.dataset.region === state.region));
  $('isolateChip').hidden = !isolating();
  const name = state.selection ? selectionName() : '';
  if (isolating()) $('isolateChip').innerHTML = `<span>Showing <b>${escapeHtml(name)}</b> on its own</span><span class="all">Show all</span>`;
  const figure = state.selection?.entry ? `Fig. ${entryNumber(state.selection.entry)} · ${name}` : state.selection ? name : viewInfo().figure;
  if (!beating()) $('figure').textContent = `${figure}${isolating() ? ', isolated' : ''} · ${state.sex === 'male' ? 'Male' : 'Female'}`;
  else if (heart.caption) $('figure').textContent = heart.caption;
  for (const button of $('views').children) button.setAttribute('aria-pressed', String(!state.region && button.dataset.view === state.view));
  $('hint').hidden = state.touched || !!state.selection || !!state.tour || state.dock || state.drawer;
  const xrayOn = state.xray >= 0.02, coverName = viewInfo().xray.map(layer => LAYER_INFO[layer].name.toLowerCase()).join(' and ');
  $('xrayOut').textContent = xrayOn ? `On · ${Math.round(state.xray * 100)}%` : 'Off';
  $('xraySwitch').setAttribute('aria-checked', String(xrayOn));
  $('xray').hidden = !xrayOn;
  $('xray').value = Math.round(state.xray * 100);
  $('xrayNote').textContent = coverName ? `X-ray fades the ${coverName} to outlines, so what lies behind shows through.` : '';
  $('body').value = Math.round(state.body * 100);
  $('bodyOut').textContent = state.layers.skin === 'off' || state.body < 0.01 ? 'Hidden' : `${Math.round(state.body * 100)}%`;
  if (body) $('partCount').textContent = `${body.parts.length.toLocaleString('en')} parts`;
  for (const range of document.querySelectorAll('input[type="range"]')) range.style.setProperty('--fill', `${(range.value - range.min) / (range.max - range.min) * 100}%`);
}
/* a picked structure is named for itself, unless it is a piece of a whole organ; a chosen entry by the entry's name */
const selectionName = () => {
  const selection = state.selection, entry = selection.entry && ALL[selection.entry];
  if (!entry) return body.parts[selection.parts[0]].name;
  if (selection.part !== undefined && !entry.whole && body.entries[selection.entry].length > 1) return body.parts[selection.part].name;
  return entry.name;
};
/* internal parts are isolated (solid, everything else faint); parts on the surface of their layer just get highlighted */
const shouldIsolate = parts => parts.every(index => !['skin'].includes(body.parts[index].layer)) && viewInfo().isolate && !beating();   // the beating heart stays whole: a chosen part is lit, the rest goes on beating
function select(selection) {
  state.selection = selection;
  if (selection) {
    state.inspectorOpen = true; state.sheet = 'peek'; state.dock = false; state.closeups = false;
    for (const index of selection.parts) { const layer = body.parts[index].layer; if (state.layers[layer] === 'off') state.layers[layer] = 'solid'; }
    ensureLayers();
  }
  applyVisibility(); renderInspector(); syncUI();
}
function selectEntry(key) {
  const parts = body.entries[key];
  select({ entry: key, parts, isolate: shouldIsolate(parts) });
}
/* a picked part: the whole entry when the entry is one organ in pieces (the liver's segments), or the organ on that side
   when it is a pair (one kidney's pyramids and calyces), else just that part */
const sideOf = index => sideOfPart(body.parts[index]);
function selectPart(index) {
  const at = body.entryOf[index], key = at >= 0 ? body.keys[at] : null, whole = key && ALL[key].whole;
  const parts = whole === true ? body.entries[key] : whole === 'side' ? body.entries[key].filter(other => sideOf(other) === sideOf(index)) : [index];
  select({ entry: key, part: index, parts, isolate: shouldIsolate(parts) });
}

/* ---------- Views and camera ---------- */
let flight = null;
function flyTo(position, target, up = camera.up, duration = 900) {
  if (reducedMotion()) duration = 0;
  flight = { from: camera.position.clone(), to: position.clone(), fromTarget: controls.target.clone(), toTarget: target.clone(),
    fromUp: camera.up.clone(), toUp: up.clone().normalize(), start: performance.now(), duration };
}
const FRONT = V(0.32, 0.08, 1).normalize();
function ensureLayers() {
  const sex = body.sex;
  const wanted = LAYERS.filter(layer => state.layers[layer] !== 'off');
  const pending = wanted.filter(layer => !body.layers[layer]?.group);
  if (pending.length) {
    $('fetching').hidden = false; $('fetching').textContent = `Loading ${pending.map(layer => LAYER_INFO[layer].name.toLowerCase()).join(', ')}…`;
  }
  return Promise.all([...wanted.map(layer => loadLayer(body, layer)), loadClothing(body)]).then(() => { if (body.sex === sex) $('fetching').hidden = true; });
}
function applyView(name) {
  if (isolating() && !state.tour) state.selection = null;
  if (state.region) { state.selection = null; state.region = null; useIndex(body, null); buildPartsList(); buildTags(); measureTags(); }
  state.view = name; state.peel = PEEL.indexOf(name); state.blend = null;
  const view = VIEW_INFO[name];
  Object.assign(state.layers, view.layers);
  state.xray = 0; state.body = view.body;
  ensureLayers(); applyVisibility(); renderInspector(); syncUI();
}
/* The peel: the views in order from the outside in. Between two of them every layer is as solid as its share of the way
   from one to the other, so the body fades from skin to skeleton without a jump. */
const PEEL = ['body', 'muscles', 'organs', 'vessels', 'nerves', 'skeleton'];
const layerLevel = (view, layer) => (layer === 'skin' ? (view.layers.skin === 'off' ? 0 : view.body) : { solid: 1, ghost: GHOST, off: 0 }[view.layers[layer]]);
function setPeel(value) {
  value = THREE.MathUtils.clamp(value, 0, PEEL.length - 1);
  const low = Math.min(PEEL.length - 2, Math.floor(value)), share = value - low;
  if (share < 0.01 || share > 0.99) { const name = PEEL[Math.round(value)]; if (state.blend || state.region || state.view !== name) applyView(name); return; }
  if (state.region || state.selection) applyView(state.view);
  const from = VIEW_INFO[PEEL[low]], to = VIEW_INFO[PEEL[low + 1]];
  state.peel = value; state.view = PEEL[Math.round(value)]; state.xray = 0; state.blend = {};
  for (const layer of LAYERS) {
    state.blend[layer] = layerLevel(from, layer) + (layerLevel(to, layer) - layerLevel(from, layer)) * share;
    state.layers[layer] = state.blend[layer] > 0.002 ? (layer === 'skin' ? 'ghost' : 'solid') : 'off';
  }
  state.body = state.blend.skin;
  ensureLayers(); applyVisibility(); renderInspector(); syncUI();
}
/* a layer's name under the line glides the body there */
let glide = null;
function glideTo(name) {
  const target = PEEL.indexOf(name);
  if (reducedMotion() || state.region || Math.abs(target - state.peel) < 0.01) { glide = null; setView(name); return; }
  glide = { from: state.peel, to: target, start: performance.now(), duration: 380 + 160 * Math.abs(target - state.peel) };
  invalidate();
}
function stepGlide(now) {
  if (!glide) return;
  const t = Math.min(1, (now - glide.start) / glide.duration), eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const { to } = glide;
  if (t >= 1) glide = null;
  setPeel(t >= 1 ? to : glide.from + (to - glide.from) * eased);
  invalidate();
}
$('peel').addEventListener('input', event => { glide = null; stopTour(); setPeel(event.target.value / 100); });
/* a close-up: its own numbered parts, and only the layers its parts and context are in */
function applyRegion(id) {
  const region = REGIONS[id];
  if (region.sex && region.sex !== body.sex) throw new Error(`the ${body.sex} body has no ${id} close-up`);
  state.selection = null; state.region = id; state.blend = null; glide = null;
  useIndex(body, region);
  buildPartsList(); buildTags(); measureTags();
  for (const layer of LAYERS) state.layers[layer] = 'off';
  for (const index of [...body.around.own, ...body.around.context]) state.layers[body.parts[index].layer] = 'solid';
  state.layers.skin = 'ghost';
  state.xray = 0; state.body = viewInfo().body;
  state.inspectorOpen = true;
  ensureLayers(); applyVisibility(); renderInspector(); syncUI();
}
function setRegion(id) {
  applyRegion(id);
  const frame = viewFrame();
  flyTo(frame.position, frame.target, V(0, 1, 0));
}
const resetView = () => (state.region ? setRegion(state.region) : setView(state.view));
/* each view keeps its direction but sets its distance so its subject fills the screen space the panels leave free */
function freeRect() {
  const box = stage.getBoundingClientRect(), rect = el => el.getBoundingClientRect();
  const inspector = $('inspector'), sheetOpen = !inspector.hidden && !inspector.classList.contains('empty');
  if (phone.matches) return { left: 12, right: box.width - 12, top: (state.region ? rect(document.querySelector('.top-right')).bottom : rect($('views')).bottom) - box.top + 16,
    bottom: rect(sheetOpen ? inspector : document.querySelector('.rail')).top - box.top - 28 };
  const { left, right } = insets();
  return { left: left + 24, right: box.width - right - 24, top: rect(document.querySelector('.masthead')).bottom - box.top + 24, bottom: state.region ? box.height - 56 : rect($('peel')).top - box.top - 34 };
}
/* how much of the stage the columns take on each side (desktop): the tools and the story on the left, the card or the stops on the right */
function insets() {
  const box = stage.getBoundingClientRect(), inspector = $('inspector'), side = $('side');
  const left = Math.max(document.querySelector('.rail').getBoundingClientRect().right, inspector.hidden ? 0 : inspector.getBoundingClientRect().right) - box.left;
  return { left, right: side.hidden ? 24 : box.right - side.getBoundingClientRect().left };
}
const corner = new THREE.Vector3();
function boxPoints(parts, margin = 0) {
  const points = [];
  for (const index of parts) {
    const { min, max } = body.parts[index];
    for (let k = 0; k < 8; k++) points.push(V(k & 1 ? max[0] + margin : min[0] - margin, k & 2 ? max[1] + margin : min[1] - margin, k & 4 ? max[2] + margin : min[2] - margin));
  }
  return points;
}
/* the camera position, looking along a direction, that fits a set of points into the free screen area at a given fill */
function fitFrame(points, direction, up, fill = 1) {
  resize();
  const { clientWidth: width, clientHeight: height } = stage, free = freeRect();
  /* a page opened in a hidden tab has no size yet: keep the camera where it is, and fit once the stage appears */
  if (!width || !height) { fitWhenShown = true; return { target: controls.target.clone(), position: camera.position.clone() }; }
  const target = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  const probe = camera.clone();
  let distance = 300;
  for (let pass = 0; pass < 5; pass++) {
    probe.position.copy(target).addScaledVector(direction, distance); probe.up.copy(up); probe.lookAt(target); probe.updateMatrixWorld();
    corner.copy(target).project(probe);
    const cx = (corner.x + 1) / 2 * width, cy = (1 - corner.y) / 2 * height;
    let need = 0;
    for (const point of points) {
      corner.copy(point).project(probe);
      const x = (corner.x + 1) / 2 * width, y = (1 - corner.y) / 2 * height;
      need = Math.max(need, x > cx ? (x - cx) / (free.right - cx) : (cx - x) / (cx - free.left), y > cy ? (y - cy) / (free.bottom - cy) : (cy - y) / (cy - free.top));
    }
    distance *= need * 0.98 + 0.02;
  }
  distance /= fill;
  return { target, position: target.clone().addScaledVector(direction, THREE.MathUtils.clamp(distance, controls.minDistance, controls.maxDistance)) };
}
function viewFrame() {
  const view = viewInfo();
  /* a close-up: its own parts; else the whole body, head to toe: the skin outline (or the skeleton when the skin is not loaded yet) */
  if (state.region) {
    /* framed on the parts it names (a joint, where the bones meeting at it are far longer), else on all of its parts */
    const region = closeUp(), framed = region.frame ? region.frame.flatMap(key => body.entries[key] || []) : [...body.around.own];
    return fitFrame(boxPoints(framed, region.margin ?? 1), view.direction || FRONT, V(0, 1, 0), 0.9);
  }
  const parts = body.parts.filter(part => part.layer === 'skin' || part.layer === 'skeleton').map(part => part.index);
  return fitFrame(boxPoints(parts), view.direction || FRONT, V(0, 1, 0), 1);
}
function setView(name) {
  applyView(name);
  const frame = viewFrame();
  flyTo(frame.position, frame.target, V(0, 1, 0));
}
function focusSelection(fromView = null) {
  const parts = selectedParts();
  if (!parts.length) return;
  const direction = fromView ? (fromView.direction || FRONT).clone() : camera.position.clone().sub(controls.target).normalize();
  const size = parts.reduce((s, index) => Math.max(s, ...body.parts[index].max.map((v, axis) => v - body.parts[index].min[axis])), 0);
  const frame = fitFrame(boxPoints(parts, Math.max(4, size * 0.25)), direction, V(0, 1, 0), 0.7);
  flyTo(frame.position, frame.target, V(0, 1, 0));
}
for (const button of $('views').children) button.addEventListener('click', () => { stopTour(); glideTo(button.dataset.view); });
$('resetBtn').addEventListener('click', () => { stopTour(); resetView(); });
$('isolateChip').addEventListener('click', () => { select(null); resetView(); });
$('manualBtn').addEventListener('click', () => document.querySelector('.manual-wrap').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' }));
for (const button of document.querySelectorAll('[data-toggle]')) button.addEventListener('click', () => {
  const key = button.dataset.toggle; state[key] = !state[key]; applyVisibility(); syncUI();
  /* the cut is looked at from the body's left, square on, from where the view already is */
  if (key === 'cut' && state.cut) { const distance = camera.position.distanceTo(controls.target); flyTo(controls.target.clone().addScaledVector(V(1, 0.06, 0.1).normalize(), distance), controls.target, V(0, 1, 0)); }
});
$('closeupsBtn').addEventListener('click', () => { state.closeups = !state.closeups; if (state.closeups) { state.drawer = false; state.dock = false; } syncUI(); });
$('xraySwitch').addEventListener('click', () => { state.xray = state.xray < 0.02 ? 0.85 : 0; applyVisibility(); syncUI(); });
$('xray').addEventListener('input', event => { state.xray = event.target.value / 100; applyVisibility(); syncUI(); });
$('body').addEventListener('input', event => { state.body = event.target.value / 100; if (state.body > 0 && state.layers.skin === 'off') { state.layers.skin = 'ghost'; ensureLayers(); } applyVisibility(); syncUI(); });
document.addEventListener('keydown', event => {   // arrow keys step from part to part, unless a control has the keys
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, textarea, select')) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); stepPart(event.key === 'ArrowRight' ? 1 : -1); }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); flight = null; controls.lift((event.key === 'ArrowUp' ? 1 : -1) * Math.max(3, visibleHeight() * 0.08)); clampLift(); invalidate(); }
  if (event.key === 'Escape' && state.selection) { select(null); }
});
for (const button of $('sexSwitch').children) button.addEventListener('click', () => switchSex(button.dataset.sex));

/* switching body keeps the view and, where the other body has it, the selected part (or its equivalent) */
async function switchSex(sex) {
  if (sex === state.sex && body?.sex === sex) return;
  stopTour();
  const previous = state.selection?.entry;
  state.sex = sex; save();
  $('fetching').hidden = false; $('fetching').textContent = `Loading the ${sex} body…`;
  body = await loadBody(sex);
  makeStateTextures(body.parts.length);
  state.selection = null; state.search = ''; $('search').value = '';
  buildHeightRuler(); buildCloseupList(); buildSpots();
  /* a close-up carries over when the other body has it */
  const region = state.region && (!REGIONS[state.region].sex || REGIONS[state.region].sex === sex) ? state.region : null;
  state.region = null;
  if (region) applyRegion(region); else { buildPartsList(); buildTags(); applyView(state.view); }
  await ensureLayers();
  const swap = previous && (body.entries[previous] ? previous : ALL[previous]?.swap);
  if (swap && body.entries[swap] && (!region || body.order.includes(swap))) { selectEntry(swap); focusSelection(); }
  else { const frame = viewFrame(); flyTo(frame.position, frame.target, V(0, 1, 0)); }
  measureTags(); syncUI();
}

/* ---------- Labels ---------- */
const labelsEl = $('labels');
let pressedTag = null;
let tagEls = {};
const tagWidths = {};
function buildTags() {
  labelsEl.querySelectorAll('.tag').forEach(tag => tag.remove()); tagEls = {};
  for (const key of body.order) {
    const tag = document.createElement('button');
    tag.type = 'button'; tag.className = 'tag';
    tag.innerHTML = `<i>${entryNumber(key)}</i>${escapeHtml(ALL[key].short || ALL[key].name)}`;
    /* a press on a label is handed to the canvas, so dragging from a label still rotates; a clean click selects the label's part */
    tag.addEventListener('pointerdown', event => { pressedTag = key; event.preventDefault(); canvas.dispatchEvent(new PointerEvent('pointerdown', event)); });
    tag.addEventListener('click', event => { if (event.detail === 0) { stopTour(); selectEntry(key); focusSelection(); } });   // keyboard activation
    tag.hidden = true;
    labelsEl.append(tag); tagEls[key] = tag;
  }
}
/* The glowing points: one per close-up worth diving into from the whole body. Each stands clear of the body, in a column
   on its side of it, with its name, and a fine line runs from it to the part it opens, so nothing sits on the body itself. */
let spotEls = [];
function buildSpots() {
  for (const { el } of spotEls) el.remove();
  spotEls = [];
  for (const [id, entry, side, name] of HOTSPOTS) {
    const parts = (body.entries[entry] || []).filter(index => !side || sideOf(index) === side);
    if (!REGIONS[id] || !parts.length) continue;
    const box = new THREE.Box3();
    for (const index of parts) box.expandByPoint(V(...body.parts[index].min)).expandByPoint(V(...body.parts[index].max));
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'spot'; el.hidden = true; el.innerHTML = `<b></b><i></i><span>${escapeHtml(name)}</span>`;
    el.setAttribute('aria-label', `Open ${REGIONS[id].title.toLowerCase()}`);
    el.addEventListener('click', () => { if (phone.matches) { setRegion(id); return; } state.spot = id; syncUI(); });
    labelsEl.append(el); spotEls.push({ id, el, point: box.getCenter(new THREE.Vector3()) });
  }
}
/* places the points and returns their lines (SVG); the columns stand a little outside the body's widest reach on screen */
function placeSpots(width, height) {
  const shown = atHome() && !isolating();
  const skin = body.parts.find(part => part.name === 'Skin'), at = point => { projected.copy(point).project(camera); return [(projected.x + 1) / 2 * width, (1 - projected.y) / 2 * height, projected.z]; };
  const middle = at(V(0, body.height / 2, 0))[0], reach = Math.abs(at(V(skin.max[0], body.height / 2, 0))[0] - at(V(skin.min[0], body.height / 2, 0))[0]) / 2;
  const columns = { left: [], right: [] };
  for (const spot of spotEls) {
    const [x, y, z] = at(spot.point);
    spot.el.hidden = !(shown && z < 1 && x > 0 && x < width && y > 0 && y < height);
    if (!spot.el.hidden) columns[x < middle ? 'left' : 'right'].push({ spot, x, y });
  }
  let svg = '';
  const gap = phone.matches ? 40 : 46, out = reach + (phone.matches ? 14 : 44);
  for (const side of ['left', 'right']) {
    const column = columns[side].sort((p, q) => p.y - q.y), ys = [];
    column.forEach((item, k) => ys.push(Math.max(item.y, k ? ys[k - 1] + gap : 0)));
    column.forEach((item, k) => {
      const x = side === 'left' ? middle - out : middle + out, y = ys[k];
      item.spot.el.classList.toggle('left', side === 'left');
      item.spot.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      item.spot.el.setAttribute('aria-pressed', String(item.spot.id === state.spot));
      svg += `<polyline class="spot-line" points="${item.x.toFixed(1)},${item.y.toFixed(1)} ${(side === 'left' ? x + 18 : x - 18).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}"/><circle class="spot-end" cx="${item.x.toFixed(1)}" cy="${item.y.toFixed(1)}" r="2"/>`;
    });
  }
  return svg;
}
function measureTags() { for (const [key, tag] of Object.entries(tagEls)) { tag.hidden = false; tagWidths[key] = tag.offsetWidth; tag.hidden = true; } invalidate(); }
const projected = new THREE.Vector3();
const OVERLAYS = ['#inspector', '#side', '.peel', '#dock', '#drawer', '#closeups', '.masthead h1', '.top-right', '.rail', '.views', '.hint', '.figure', '#isolateChip', '#fetching'];
const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); leaders.id = 'leaders'; labelsEl.prepend(leaders);
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
/* a label's anchor: of an entry's parts, the one whose dot shows on screen and sits nearest the camera */
function anchorOf(key) {
  const parts = state.selection?.entry === key && state.selection.part !== undefined ? [state.selection.part] : body.entries[key];
  let best = null;
  for (const index of parts) {
    const part = body.parts[index];
    if (!part.anchor) continue;
    const point = V(...part.anchor);
    const distance = point.distanceTo(camera.position);
    const seen = visibleAt(point, parts);
    const score = (seen ? 0 : 1e6) + distance;
    if (!best || score < best.score) best = { point, score, seen };
  }
  return best;
}
function updateLabels(width, height) {
  const spotLines = placeSpots(width, height);
  const origin = stage.getBoundingClientRect();
  const placed = [...document.querySelectorAll(OVERLAYS.join(','))].filter(el => !el.hidden && el.offsetParent).map(el => el.getBoundingClientRect())
    .map(r => [r.left - origin.left, r.top - origin.top, r.right - origin.left, r.bottom - origin.top]);
  const panels = placed.slice();
  const selectedKey = state.selection?.entry, hoveredKey = state.hovered >= 0 && body.entryOf[state.hovered] >= 0 ? body.keys[body.entryOf[state.hovered]] : null;
  const priority = atHome() && spotEls.length && !state.blend && state.peel === 0 ? [] : viewInfo().labels[state.sex] || viewInfo().labels.any;   // on the opening view the glowing points invite; callouts come with the layers
  const order = (isolating() ? [selectedKey, hoveredKey] : [selectedKey, hoveredKey, ...priority]).filter((key, k, list) => key && body.entries[key] && list.indexOf(key) === k);
  for (const [key, tag] of Object.entries(tagEls)) if (!order.includes(key)) tag.hidden = true;
  const shown = [];
  for (const key of order) {
    const important = key === selectedKey || key === hoveredKey;
    const anchor = anchorOf(key);
    if (!anchor || (!important && (!state.labels || !anchor.seen))) { tagEls[key].hidden = true; continue; }
    projected.copy(anchor.point).project(camera);
    const ax = (projected.x + 1) / 2 * width, ay = (1 - projected.y) / 2 * height;
    if (projected.z > 1 || ax < 0 || ax > width || ay < 0 || ay > height || panels.some(b => overlaps([ax - 4, ay - 4, ax + 4, ay + 4], b))) { tagEls[key].hidden = true; continue; }
    shown.push({ key, ax, ay, important });
  }
  /* parts-diagram layout: callouts left of the model's midline stack in a column on the left, the rest on the right.
     Each column is sorted top to bottom by its parts, so leader lines never cross; labels keep 26 px apart. */
  let room = phone.matches ? (state.region ? 6 : 5) : state.region ? 16 : 10, svg = '';
  const kept = shown.filter(c => c.important || room-- > 0);
  for (const c of shown) if (!kept.includes(c)) tagEls[c.key].hidden = true;
  const midline = kept.length ? kept.map(c => c.ax).sort((x, y) => x - y)[Math.floor(kept.length / 2)] : width / 2;
  const bounds = { left: 6, right: width - 6, top: 6, bottom: height - 6 };
  for (const b of panels) {   // the free band between the panels at the model's height
    if (b[2] < midline && b[3] > height * 0.25 && b[1] < height * 0.75) bounds.left = Math.max(bounds.left, b[2] + 8);
    if (b[0] > midline && b[3] > height * 0.25 && b[1] < height * 0.75) bounds.right = Math.min(bounds.right, b[0] - 8);
    if (b[3] < height * 0.25) bounds.top = Math.max(bounds.top, b[3] + 6);
    if (b[1] > height * 0.75) bounds.bottom = Math.min(bounds.bottom, b[1] - 6);
  }
  const gap = 26, h = 22;
  const listed = kept.filter(c => c.important || (c.ay > bounds.top + 4 && c.ay < bounds.bottom - 4));
  for (const c of kept) if (!listed.includes(c)) tagEls[c.key].hidden = true;
  for (const side of ['left', 'right']) {
    const column = listed.filter(c => side === 'left' ? c.ax < midline : c.ax >= midline).sort((p, q) => p.ay - q.ay);
    if (!column.length) continue;
    const reach = phone.matches ? 26 : 44;
    const edge = side === 'left' ? Math.min(...column.map(c => c.ax)) - reach : Math.max(...column.map(c => c.ax)) + reach;
    const ys = [];
    column.forEach((c, k) => ys.push(Math.max(c.ay - h / 2, k ? ys[k - 1] + gap : bounds.top)));
    for (let k = column.length - 1; k >= 0; k--) ys[k] = Math.min(ys[k], (k === column.length - 1 ? bounds.bottom - h : ys[k + 1] - gap));
    column.forEach((c, k) => {
      const tag = tagEls[c.key], w = tagWidths[c.key] || 90;
      let x = side === 'left' ? edge - w : edge;
      x = Math.max(bounds.left, Math.min(x, bounds.right - w));
      const y = ys[k], box = [x, y, x + w, y + h];
      tag.hidden = false;
      tag.classList.toggle('on', c.key === selectedKey);
      tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      placed.push(box);
      const ex = side === 'left' ? box[2] : box[0], ey = y + h / 2, elbow = side === 'left' ? ex + 10 : ex - 10;
      svg += `<polyline points="${c.ax.toFixed(1)},${c.ay.toFixed(1)} ${elbow.toFixed(1)},${ey.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}"/><circle class="${c.key === selectedKey ? 'on' : ''}" cx="${c.ax.toFixed(1)}" cy="${c.ay.toFixed(1)}" r="3.5"/>`;
    });
  }
  svg += spotLines + ruler(width, height, placed);
  leaders.innerHTML = svg;
}
/* a 10 cm ruler beside the body, drawn from two projected points so it stays true to scale as the camera moves */
function ruler(width, height, placed) {
  const box = new THREE.Box3();
  for (const part of body.parts) if (part.layer === 'skeleton') box.expandByPoint(V(...part.min)).expandByPoint(V(...part.max));
  const y = box.min.y + 8, x = box.max.x + 14;
  const ends = [V(x, y, 0), V(x, y + 10, 0)].map(point => { projected.copy(point).project(camera); return [(projected.x + 1) / 2 * width, (1 - projected.y) / 2 * height, projected.z]; });
  const [[x0, y0, z0], [x1, y1, z1]] = ends, length = Math.hypot(x1 - x0, y1 - y0);
  const rulerBox = [Math.min(x0, x1) - 8, Math.min(y0, y1) - 4, Math.max(x0, x1) + 44, Math.max(y0, y1) + 4];
  if (!Number.isFinite(length) || z0 >= 1 || z1 >= 1 || length < 40 || placed.some(b => overlaps(rulerBox, b))) return '';   // no size yet (a hidden tab), behind, too small or crowded
  const nx = (y1 - y0) / length * 5, ny = -(x1 - x0) / length * 5;
  const ticks = Array.from({ length: 11 }, (_, k) => { const tx = x0 + (x1 - x0) * k / 10, ty = y0 + (y1 - y0) * k / 10, n = k % 5 ? 0.6 : 1; return `<line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${(tx + nx * n).toFixed(1)}" y2="${(ty + ny * n).toFixed(1)}"/>`; }).join('');
  return `<g class="ruler"><line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>${ticks}<text x="${((x0 + x1) / 2 + 26).toFixed(1)}" y="${((y0 + y1) / 2 + 4).toFixed(1)}">10 cm</text></g>`;
}

/* ---------- Picking: render part indices, read back the pixel under the pointer ---------- */
const pickTarget = new THREE.WebGLRenderTarget(1, 1);
const pickPixel = new Uint8Array(4);
const pickCamera = new THREE.PerspectiveCamera();
function pickAt(x, y, threshold = 0.35) {
  /* the pick camera sees one pixel of the main camera's view, including its centring offset */
  pickCamera.copy(camera);
  const view = camera.view, width = stage.clientWidth, height = stage.clientHeight;
  const full = view ? [view.fullWidth, view.fullHeight, view.offsetX, view.offsetY] : [width, height, 0, 0];
  pickCamera.setViewOffset(full[0], full[1], full[2] + x, full[3] + y, 1, 1);
  pickCamera.updateMatrixWorld();
  pickThreshold.value = threshold;
  renderer.setRenderTarget(pickTarget); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(pickScene, pickCamera);
  renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pickPixel);
  renderer.setRenderTarget(null);
  return pickPixel[0] + pickPixel[1] * 256 - 1;
}
function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect(), x = clientX - rect.left, y = clientY - rect.top;
  const solid = pickAt(x, y, 0.35);
  return solid >= 0 ? solid : pickAt(x, y, 0.1);
}
/* which parts show at a few low-resolution points: a small index map of the whole view, redrawn after the camera settles */
const mapTarget = new THREE.WebGLRenderTarget(1, 1);
let visibility = { data: null, width: 0, height: 0, stamp: -1 };
function refreshVisibility() {
  const width = Math.max(1, Math.round(stage.clientWidth / 4)), height = Math.max(1, Math.round(stage.clientHeight / 4));
  if (mapTarget.width !== width || mapTarget.height !== height) mapTarget.setSize(width, height);
  pickThreshold.value = 0.35;
  renderer.setRenderTarget(mapTarget); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(pickScene, camera);
  if (!visibility.data || visibility.data.length !== width * height * 4) visibility.data = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(mapTarget, 0, 0, width, height, visibility.data);
  renderer.setRenderTarget(null);
  visibility.width = width; visibility.height = height; visibility.stamp = renderCount;
}
function visibleAt(point, parts) {
  if (!visibility.data) return false;   // no map yet (the first frames): no callouts rather than every callout
  projected.copy(point).project(camera);
  const cx = Math.round((projected.x + 1) / 2 * visibility.width), cy = Math.round((projected.y + 1) / 2 * visibility.height);
  const wanted = new Set(parts);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= visibility.width || y >= visibility.height) continue;
    const k = (y * visibility.width + x) * 4, id = visibility.data[k] + visibility.data[k + 1] * 256 - 1;
    if (wanted.has(id)) return true;
  }
  return false;
}
const tip = $('tip');
let down = null, hoverEvent = null;
/* a tap is a press that never strays more than 5 px: a drag that comes back to where it started is still a drag */
canvas.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY, strayed: false }; });
canvas.addEventListener('pointermove', event => { if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) >= 5) down.strayed = true; });
canvas.addEventListener('pointerup', event => {
  if (down && !down.strayed && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5) {
    stopTour();
    if (pressedTag) { selectEntry(pressedTag); focusSelection(); }
    else {
      const index = pick(event.clientX, event.clientY);
      if (index >= 0) { selectPart(index); focusSelection(); } else if (state.selection) select(null);
    }
  }
  down = null; pressedTag = null;
});
canvas.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') hoverEvent = event; });
canvas.addEventListener('pointerleave', () => { hoverEvent = null; state.hovered = -1; tip.hidden = true; canvas.classList.remove('pointing'); invalidate(); });

/* ---------- Height ruler: where on the body the view is, and a way to move up and down it ---------- */
const heightRuler = $('heightRuler'), heightScale = heightRuler.querySelector('.scale'), heightWindow = heightRuler.querySelector('.window');
/* how much of the body's height the screen shows at the target's depth, cm */
const visibleHeight = () => 2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
/* the view's middle stays on the body, from the feet to the crown */
function clampLift() {
  if (!body) return;
  const y = THREE.MathUtils.clamp(controls.target.y, 0, body.height);
  if (y !== controls.target.y) controls.lift(y - controls.target.y);
}
function buildHeightRuler() {
  heightScale.querySelectorAll('.tick').forEach(tick => tick.remove());
  for (let cm = 0; cm <= body.height; cm += 10) {
    const tick = document.createElement('span');
    tick.className = cm % 50 ? 'tick' : 'tick major';
    tick.style.bottom = `${cm / body.height * 100}%`;
    if (!(cm % 50)) tick.dataset.cm = cm;
    heightScale.append(tick);
  }
  heightRuler.setAttribute('aria-valuemax', String(Math.round(body.height)));
  updateHeightRuler();
}
function updateHeightRuler() {
  if (!body) return;
  const half = visibleHeight() / 2, y = controls.target.y, height = body.height;
  const low = THREE.MathUtils.clamp(y - half, 0, height), high = THREE.MathUtils.clamp(y + half, 0, height);
  heightWindow.style.bottom = `${low / height * 100}%`;
  heightWindow.style.height = `${Math.max(2, (high - low) / height * 100)}%`;
  heightRuler.setAttribute('aria-valuenow', String(Math.round(y)));
  heightRuler.setAttribute('aria-valuetext', `${Math.round(y)} cm up the body`);
}
function heightTo(clientY) {
  const box = heightScale.getBoundingClientRect();
  const cm = THREE.MathUtils.clamp((box.bottom - clientY) / box.height, 0, 1) * body.height;
  flight = null; controls.lift(cm - controls.target.y); invalidate();
}
heightRuler.addEventListener('pointerdown', event => { heightRuler.setPointerCapture(event.pointerId); heightTo(event.clientY); });
heightRuler.addEventListener('pointermove', event => { if (heightRuler.hasPointerCapture(event.pointerId)) heightTo(event.clientY); });
heightRuler.addEventListener('keydown', event => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault(); event.stopPropagation();
  flight = null; controls.lift(event.key === 'ArrowUp' ? 5 : -5); clampLift(); invalidate();
});
controls.addEventListener('change', updateHeightRuler);

/* ---------- Loop ---------- */
/* centre the model in the space the floating panels leave free, and keep the horizontal field of view on tall screens */
function resize() {
  const { clientWidth: width, clientHeight: height } = stage;
  renderer.setSize(width, height, false);
  outlineResolution.value.set(width, height);
  const inspector = $('inspector'), box = stage.getBoundingClientRect();
  const sheetOpen = !inspector.hidden && inspector.offsetParent && !inspector.classList.contains('empty');
  const columns = phone.matches ? { left: 0, right: 0 } : insets();
  const shiftX = (columns.right - columns.left) / 2;
  const top = phone.matches ? (state.region ? document.querySelector('.top-right') : $('views')).getBoundingClientRect().bottom - box.top : 0;
  const bottom = phone.matches ? box.bottom - (sheetOpen ? inspector : document.querySelector('.rail')).getBoundingClientRect().top : 0;
  const shiftY = (top - bottom) / 2;
  camera.aspect = (width + 2 * Math.abs(shiftX)) / (height + 2 * Math.abs(shiftY));
  camera.fov = width / height < 1.2 ? 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(16)) * 1.2 * (height + 2 * Math.abs(shiftY)) / width) * 180 / Math.PI : 32;
  camera.setViewOffset(width + 2 * Math.abs(shiftX), height + 2 * Math.abs(shiftY), shiftX > 0 ? 2 * shiftX : 0, shiftY < 0 ? -2 * shiftY : 0, width, height);
  updateHeightRuler();
  invalidate();
}
let fitWhenShown = false;
new ResizeObserver(() => {
  resize();
  if (fitWhenShown && stage.clientWidth && stage.clientHeight && body) {
    fitWhenShown = false;
    const frame = viewFrame(); camera.position.copy(frame.position); controls.target.copy(frame.target); invalidate();
  }
}).observe(stage);
function animate(now) {
  requestAnimationFrame(animate);
  frame(now);
}
let visibilityDue = true;
function frame(now) {
  stepTour(now);
  stepGlide(now);
  stepHeart(now);
  if (flight) {
    const t = flight.duration ? Math.min(1, (now - flight.start) / flight.duration) : 1;
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    camera.position.lerpVectors(flight.from, flight.to, e); controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
    camera.up.lerpVectors(flight.fromUp, flight.toUp, e).normalize();
    if (t >= 1) flight = null;
  }
  controls.update();
  if (hoverEvent && !down && body) {
    const index = pick(hoverEvent.clientX, hoverEvent.clientY);
    if (index !== state.hovered) invalidate();
    state.hovered = index;
    canvas.classList.toggle('pointing', index >= 0);
    if (index >= 0) {
      const rect = stage.getBoundingClientRect();
      tip.hidden = false; tip.textContent = body.parts[index].name;
      tip.style.left = `${hoverEvent.clientX - rect.left}px`; tip.style.top = `${hoverEvent.clientY - rect.top}px`;
    } else tip.hidden = true;
    hoverEvent = null;
  }
  if (flight) needsRender = true;
  /* the label visibility map is redrawn once the picture has been still for a moment */
  if (!needsRender && visibilityDue && now - lastChange > 120 && body) { visibilityDue = false; refreshVisibility(); updateLabels(stage.clientWidth, stage.clientHeight); }
  if (!needsRender) return;
  needsRender = false; visibilityDue = true;
  renderCount++;
  renderer.render(scene, camera);
  if (body) updateLabels(stage.clientWidth, stage.clientHeight);
}

/* Test and debugging hook: read-only views of the model plus the same actions the UI uses. */
window.bodyModel = {
  state, camera, controls, setView, setRegion, setPeel, spots: () => spotEls.filter(spot => !spot.el.hidden).map(spot => spot.id), freeRect, switchSex, selectEntry, selectPart, stepPart, startTour, stopTour, frame, pick,
  holdHeart: phase => { heart.held = phase; },
  heart: () => ({ beating: beating(), phase: heart.phase, caption: heart.caption, drops: heart.streams.filter(stream => stream.points.visible).length * DROPS, squeeze: beatUniform.value.toArray() }),
  sound: () => ({ on: sound.on, key: sound.key, clip: sound.clip, speaking: sound.speaking, music: sound.music.src.split('/').pop(), musicPlaying: !sound.music.paused, musicLevel: sound.music.volume }),
  regions: () => Object.values(REGIONS).filter(region => !region.sex || region.sex === body.sex).map(region => region.id), around: () => body.around,
  body: () => body, entries: () => body.order, entryParts: key => body.entries[key] || [],
  part: index => body.parts[index], findPart: name => body.parts.find(part => part.name === name)?.index ?? -1,
  ready: () => Promise.all(LAYERS.filter(layer => state.layers[layer] !== 'off').map(layer => body.layers[layer]?.promise)),
  loaded: () => LAYERS.filter(layer => body.layers[layer]?.group),
  clothing: () => ({ shown: !!body.clothing?.group?.visible, opacity: clothingOpacity(), triangles: body.clothing?.group ? (() => { let n = 0; body.clothing.group.traverse(o => { if (o.isMesh) n += o.geometry.index.count / 3; }); return n; })() : 0 }),
  busy: () => !!flight || !!glide || !$('fetching').hidden,
  renders: () => renderCount,
  opacityOf: index => stateTexture.colour.image.data[index * 4 + 3] / 255,
  visibleNow: index => { refreshVisibility(); const part = body.parts[index]; return !!part.anchor && visibleAt(V(...part.anchor), [index]); },
  screenOf(index) {
    const rect = canvas.getBoundingClientRect(), part = body.parts[index];
    const p = V(...(part.anchor || part.centre)).project(camera);
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height, inFront: p.z < 1 };
  },
  /* up to ~2000 vertices of a part, in the model frame (cm) */
  points(index) {
    const part = body.parts[index], record = body.layers[part.layer];
    if (!record?.group) return [];
    const geometry = record.pick.geometry, position = geometry.attributes.position, ids = geometry.attributes._part, out = [];
    for (let k = 0; k < position.count; k++) if (ids.getX(k) === index) out.push([position.getX(k), position.getY(k), position.getZ(k)]);
    const stride = Math.max(1, Math.floor(out.length / 2000));
    return out.filter((_, k) => k % stride === 0);
  },
  /* the box (cm) around an entry's parts, all of them or one side's */
  size(key, side = null) {
    const box = new THREE.Box3();
    for (const index of body.entries[key] || []) if (!side || sideOf(index) === side) box.expandByPoint(V(...body.parts[index].min)).expandByPoint(V(...body.parts[index].max));
    return box.isEmpty() ? null : { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z, min: box.min.toArray(), max: box.max.toArray() };
  },
  sideOf,
  /* length (cm) of an entry's parts along their long axis: the spread of their points along the main principal axis */
  lengthOf(key, side = null) {
    const points = (body.entries[key] || []).filter(index => !side || sideOf(index) === side).flatMap(index => window.bodyModel.points(index));
    if (!points.length) return null;
    const mean = [0, 1, 2].map(c => points.reduce((sum, p) => sum + p[c], 0) / points.length);
    const C = [0, 1, 2].map(i => [0, 1, 2].map(j => points.reduce((sum, p) => sum + (p[i] - mean[i]) * (p[j] - mean[j]), 0) / points.length));
    let axis = [0.3, 1, 0.2];
    for (let k = 0; k < 50; k++) { const next = [0, 1, 2].map(i => C[i][0] * axis[0] + C[i][1] * axis[1] + C[i][2] * axis[2]); const n = Math.hypot(...next); axis = next.map(v => v / n); }
    const along = points.map(p => (p[0] - mean[0]) * axis[0] + (p[1] - mean[1]) * axis[1] + (p[2] - mean[2]) * axis[2]);
    return Math.max(...along) - Math.min(...along);
  },
  /* share of a set of parts' points that lie inside any of another set of (closed) parts: a ray from each point counts
     crossings of the other parts' surfaces, odd meaning inside. Both layers must be loaded. */
  /* enclosed: inside when surfaces lie both ways along the ray, rather than an odd number of crossings (right for a skin
     modelled as two close surfaces, as BodyParts3D's is) */
  inside(indices, solids, sample = 600, enclosed = false) {
    const meshes = solids.map(index => {
      const part = body.parts[index], record = body.layers[part.layer];
      const geometry = record.pick.geometry, ids = geometry.attributes._part, source = geometry.index.array, kept = [];
      for (let t = 0; t < source.length; t += 3) if (ids.getX(source[t]) === index) kept.push(source[t], source[t + 1], source[t + 2]);
      const piece = new THREE.BufferGeometry(); piece.setAttribute('position', geometry.attributes.position); piece.setIndex(kept);
      piece.computeBoundingBox(); piece.computeBoundingSphere();
      return new THREE.Mesh(piece, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    });
    const points = indices.flatMap(index => window.bodyModel.points(index));
    const stride = Math.max(1, Math.floor(points.length / sample)), caster = new THREE.Raycaster(), direction = V(0.577, 0.577, 0.577);
    let inside = 0, tested = 0;
    for (let k = 0; k < points.length; k += stride) {
      const origin = V(...points[k]);
      tested++;
      for (const mesh of meshes) {
        if (!mesh.geometry.boundingBox.containsPoint(origin)) continue;
        caster.set(origin, direction);
        const hits = caster.intersectObject(mesh, false).length;
        if (enclosed) { caster.set(origin, direction.clone().negate()); if (hits && caster.intersectObject(mesh, false).length) { inside++; break; } continue; }
        if (hits % 2 === 1) { inside++; break; }
      }
    }
    return tested ? inside / tested : 0;
  },
  /* share of a 24 x 24 grid of canvas pixels that the model covers (the background clears to transparent) */
  coverage() {
    renderer.render(scene, camera);
    const gl = renderer.getContext(), pixel = new Uint8Array(4);
    let hits = 0;
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
      gl.readPixels(Math.floor((i + 0.5) / 24 * gl.drawingBufferWidth), Math.floor((j + 0.5) / 24 * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[3] > 0) hits++;
    }
    return hits / 576;
  },
};

/* ---------- Start ---------- */
const loading = $('loading');
for (const [view, info] of Object.entries(VIEW_INFO)) info.name = view;
$('systemRoute').innerHTML = Object.entries(VIEW_INFO).filter(([view]) => view !== 'body').map(([view, info]) => {
  const [key] = info.items[0];
  return `<button type="button" data-entry="${key}" data-view="${view}" data-route><i>${LAYER_INFO[info.main].short}</i>${escapeHtml(info.title)} <span>${escapeHtml(info.route)}</span></button>`;
}).join('');
{ const response = await fetch('audio/manifest.json'); if (!response.ok) throw new Error(`audio/manifest.json: ${response.status}`); sound.manifest = await response.json(); }
body = await loadBody(state.sex);
makeStateTextures(body.parts.length);
buildPartsList(); buildTags(); buildSpots(); buildHeightRuler(); buildCloseupList();
Object.assign(state.layers, VIEW_INFO[state.view].layers); state.body = VIEW_INFO[state.view].body;
/* ?closeup=<id> opens on a close-up, when this body has it */
{ const wanted = params.get('closeup'); if (wanted && REGIONS[wanted] && (!REGIONS[wanted].sex || REGIONS[wanted].sex === state.sex)) applyRegion(wanted); }
renderInspector(); syncUI(); resize();
loading.textContent = 'Loading the 3D model…';
await ensureLayers();
applyVisibility();
{ const frame = viewFrame(); camera.up.set(0, 1, 0); camera.position.copy(frame.position); controls.target.copy(frame.target); camera.lookAt(frame.target); }
performance.mark('body:built');
await renderer.compileAsync(scene, camera);
frame(performance.now());
performance.mark('body:first-frame');
loading.remove();
document.fonts.ready.then(measureTags);
measureTags();
requestAnimationFrame(animate);
document.documentElement.dataset.modelReady = 'true';
