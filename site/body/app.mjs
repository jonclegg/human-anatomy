import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LAYER_INFO, GROUP_INFO, VIEW_INFO, TOUR, BUGS, DIFFERENCES, GAPS, colourOf, SHOWN_WHEN_CHOSEN } from './parts.mjs';
import { REGIONS, GROUPS, DETAILS, ALL, indexParts, regionContext, sideOfPart } from './closeups.mjs';
import { MOTIONS } from './motions.mjs';
import { STORIES } from './stories.mjs';
import { NARRATION } from './narration.mjs';
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
    this.minDistance = 5; this.maxDistance = 900; this.rotateSpeed = 0.005;   // radians per pixel
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
  /* how a part moves (a close-up's motion), four texels a part: its pivot and kind of movement, its turn (a quaternion),
     and two more that depend on the kind (see MOVE below) */
  stateTexture.moves?.dispose();
  stateTexture.moves = new THREE.DataTexture(new Float32Array(STATE_WIDTH * 4 * rows * 4), STATE_WIDTH * 4, rows, THREE.RGBAFormat, THREE.FloatType);
  stateTexture.moves.magFilter = stateTexture.moves.minFilter = THREE.NearestFilter; stateTexture.moves.needsUpdate = true;
  stateTexture.rows = rows; motion.for = null;   // the new texture has no movements yet
  for (const uniforms of shaderUniforms) { uniforms.uColour.value = stateTexture.colour; uniforms.uFlags.value = stateTexture.flags; uniforms.uMoves.value = stateTexture.moves; }
}
const shaderUniforms = [];
const outlineResolution = { value: new THREE.Vector2(1, 1) };
const VERTEX_STATE = `
attribute float _part;
uniform sampler2D uColour; uniform sampler2D uFlags; uniform highp sampler2D uMoves;
varying vec4 vState; varying vec4 vFlags; varying float vCutX; varying vec3 vPlace;
vec3 turned(vec4 turn, vec3 arm) { return arm + 2.0 * cross(turn.xyz, cross(turn.xyz, arm) + turn.w * arm); }
`;
const FETCH_STATE = `
  ivec2 cell = ivec2(int(mod(_part, ${STATE_WIDTH}.0)), int(_part / ${STATE_WIDTH}.0));
  vState = texelFetch(uColour, cell, 0); vFlags = texelFetch(uFlags, cell, 0);
  vCutX = position.x;
`;
/* A part that moves (the texels are written by the motion, below). By kind:
   1 rigid: scaled about its pivot (texel 3), turned about it (texel 1), then shifted (texel 2)
   2 bent: turned about its pivot by a share that grows along a direction (texel 2), from none to all across a band
     (texel 3: where the band starts and ends, in cm from the pivot), as a muscle that crosses a bending joint
   3 held at one end: turned in full near the pivot and not at all far from it (texel 2: the two distances), as the
     muscles of the eye, fixed to the orbit behind and to the turning eyeball in front */
const MOVE = (point, normal) => `
  vec4 move = texelFetch(uMoves, ivec2(cell.x * 4, cell.y), 0);
  if (move.w > 0.5) {
    vec4 turn = texelFetch(uMoves, ivec2(cell.x * 4 + 1, cell.y), 0), more = texelFetch(uMoves, ivec2(cell.x * 4 + 2, cell.y), 0);
    vec3 arm = ${point} - move.xyz;
    if (move.w < 1.5) { arm *= texelFetch(uMoves, ivec2(cell.x * 4 + 3, cell.y), 0).xyz; ${point} = move.xyz + turned(turn, arm) + more.xyz; }
    else {
      vec4 band = texelFetch(uMoves, ivec2(cell.x * 4 + 3, cell.y), 0);
      float share = move.w < 2.5 ? smoothstep(band.x, band.y, dot(arm, more.xyz)) : 1.0 - smoothstep(more.x, more.y, length(arm));
      turn = normalize(mix(vec4(0.0, 0.0, 0.0, 1.0), turn, share));
      ${point} = move.xyz + turned(turn, arm);
    }
    ${normal} = turned(turn, ${normal});
  }
`;
/* the midline cut: everything on the body's left of the cut (x beyond it) is not drawn */
const cutUniform = { value: 1e6 };
/* a close-up opened to show its inside (a step of a story): within a ball round it, whatever lies beyond a plane, on the
   viewer's side, is not drawn. plane: its normal, and how far along it the plane lies; ball: its middle and radius (none: not open) */
const opened = { plane: { value: new THREE.Vector4(0, 0, 1, 0) }, ball: { value: new THREE.Vector4(0, 0, 0, 0) } };
const CUT_FRAGMENT = 'varying float vCutX; varying vec3 vPlace; uniform float uCut; uniform vec4 uOpen; uniform vec4 uOpenBall;\n';
const CUT_AWAY = 'uOpenBall.w > 0.0 && dot(vPlace, uOpen.xyz) > uOpen.w && distance(vPlace, uOpenBall.xyz) < uOpenBall.w';
const CUT_TEST = `if (vCutX > uCut) discard; if (${CUT_AWAY}) discard;`;
/* the same cut, for what is drawn with three.js's own materials (a motion's models): the plane, far off while nothing is open */
const openPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e6);
/* pass 0 draws the solid parts, pass 1 the see-through ones (rim-lit "X-ray" ghosts below half opacity) */
function partMaterial(pass) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, side: pass === 0 ? THREE.FrontSide : THREE.DoubleSide, transparent: pass === 1, depthWrite: pass === 0 });
  material.envMapIntensity = 0.55;
  const uniforms = { uColour: { value: stateTexture.colour }, uFlags: { value: stateTexture.flags }, uMoves: { value: stateTexture.moves }, uCut: cutUniform, uOpen: opened.plane, uOpenBall: opened.ball };
  shaderUniforms.push(uniforms);
  material.customProgramCacheKey = () => `body-part-${pass}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_STATE + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${FETCH_STATE} vec3 moved = position; ${MOVE('moved', 'objectNormal')} vPlace = moved;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = moved;');
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
  `);
  };
  return material;
}
/* ink outlines, as in a technical drawing: a copy of each layer pushed outward a fixed number of screen pixels, drawn back
   faces only, in a darker shade of each part's colour (ink for the selected part). Only solid parts get a line. */
function outlineMaterial() {
  const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  const uniforms = { uColour: { value: stateTexture.colour }, uFlags: { value: stateTexture.flags }, uMoves: { value: stateTexture.moves }, uCut: cutUniform, uOpen: opened.plane, uOpenBall: opened.ball };
  shaderUniforms.push(uniforms);
  material.customProgramCacheKey = () => 'body-outline';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { uResolution: outlineResolution });
    shader.vertexShader = VERTEX_STATE + 'uniform vec2 uResolution;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${FETCH_STATE} vec3 movedNormal = normal; ${MOVE('transformed', 'movedNormal')} vPlace = transformed;`).replace('#include <project_vertex>', `#include <project_vertex>
  vec4 clipNormal = projectionMatrix * modelViewMatrix * vec4(movedNormal, 0.0);
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
  const uniforms = { uColour: { value: stateTexture.colour }, uFlags: { value: stateTexture.flags }, uThreshold: pickThreshold, uMoves: { value: stateTexture.moves }, uCut: cutUniform, uOpen: opened.plane, uOpenBall: opened.ball };
  shaderUniforms.push(uniforms);
  return new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide,
    vertexShader: `${VERTEX_STATE} varying float vPart;
      void main() { ${FETCH_STATE} vec3 moved = position, movedNormal = normal; ${MOVE('moved', 'movedNormal')} vPlace = moved; vPart = _part + 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0); }`,
    fragmentShader: `${CUT_FRAGMENT} uniform float uThreshold; varying vec4 vState; varying vec4 vFlags; varying float vPart;
      void main() { ${CUT_TEST} if (vState.a < uThreshold) discard; float id = vPart; gl_FragColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, 0.0, 1.0); }`,
  });
}
const MATERIALS = { solid: partMaterial(0), ghost: partMaterial(1), outline: outlineMaterial(), pick: pickMaterial() };
/* The flat face of a cut. Where the plane of an opened close-up passes through a solid part (the wall of the heart),
   the cut is closed with a flat face, as a knife leaves one. The part's back faces beyond the plane count up in the
   stencil and its front faces count down, which leaves a mark wherever the plane lies inside the part; a sheet lying
   on the plane is then drawn only where the mark is. */
function capCount(side, count) {
  const uniforms = { uColour: { value: stateTexture.colour }, uFlags: { value: stateTexture.flags }, uMoves: { value: stateTexture.moves }, uCut: cutUniform, uOpen: opened.plane, uOpenBall: opened.ball };
  shaderUniforms.push(uniforms);
  return new THREE.ShaderMaterial({
    uniforms, side, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilWriteMask: 0x7f, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: count, stencilZFail: count, stencilZPass: count,
    vertexShader: `${VERTEX_STATE} void main() { ${FETCH_STATE} vec3 moved = position, movedNormal = normal; ${MOVE('moved', 'movedNormal')} vPlace = moved; gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0); }`,
    fragmentShader: `${CUT_FRAGMENT} void main() { if (${CUT_AWAY}) discard; gl_FragColor = vec4(0.0); }`,
  });
}
const CAP_COUNTS = [capCount(THREE.BackSide, THREE.IncrementWrapStencilOp), capCount(THREE.FrontSide, THREE.DecrementWrapStencilOp)];
const CUT_FACE = '#cf7a78';   // the face of a cut, unless the motion gives its own (`cut`)
/* the grain of cut flesh: fine pale and dark flecks, laid over the face's colour, so a wide cut is not a flat patch */
const GRAIN = (() => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d'); g.fillStyle = '#ececec'; g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 2600; k++) { const x = Math.random() * 256, y = Math.random() * 256, long = 3 + Math.random() * 9, shade = Math.random() < 0.5 ? 255 : 150; g.strokeStyle = `rgba(${shade},${shade},${shade},${0.05 + Math.random() * 0.1})`; g.lineWidth = 0.6 + Math.random() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + long, y + (Math.random() - 0.5) * 3); g.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(5, 5); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
})();
const capSheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: CUT_FACE, map: GRAIN, side: THREE.DoubleSide,
  stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp }));
capSheet.renderOrder = -1; capSheet.visible = false; capSheet.raycast = () => {}; capSheet.onAfterRender = () => renderer.clearStencil();
root.add(capSheet);
/* A way through a solid part that the source left filled in (the mouth of a valve in the heart's wall) is kept clear of
   the cut's face. Each is a tube; where the plane lies inside one, the top bit of the stencil is set (every face of
   the tube beyond the plane flips it), and a first pass over the sheet wipes the mark there before the face is drawn. */
const HOLLOW = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false, depthTest: false, clippingPlanes: [openPlane],
  stencilWrite: true, stencilWriteMask: 0x80, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.InvertStencilOp, stencilZFail: THREE.InvertStencilOp, stencilZPass: THREE.InvertStencilOp });
const capClear = new THREE.Mesh(capSheet.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false, depthTest: false,
  stencilWrite: true, stencilRef: 0x80, stencilFunc: THREE.LessEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.ZeroStencilOp, stencilZPass: THREE.ZeroStencilOp }));
capClear.renderOrder = -1.5; capClear.raycast = () => {}; capSheet.add(capClear);   // it lies where the sheet lies, and shows when it shows
function makeHollow({ middle, axis, radius, from, to }) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, to - from, 28, 1, false), HOLLOW);
  mesh.position.copy(middle).addScaledVector(axis, (from + to) / 2); mesh.quaternion.setFromUnitVectors(V(0, 1, 0), axis);
  mesh.renderOrder = -2; mesh.frustumCulled = false; mesh.visible = false; mesh.raycast = () => {};
  root.add(mesh);
  return mesh;
}
/* the faces of some parts, for the count: the same vertices as their layers, and only their triangles */
function capMeshes(indices) {
  const meshes = [];
  for (const layer of new Set(indices.map(index => body.parts[index].layer))) {
    const source = body.layers[layer].pick.geometry, ids = source.attributes._part, wanted = new Set(indices), kept = [];
    for (let t = 0; t < source.index.count; t += 3) if (wanted.has(ids.getX(source.index.getX(t)))) kept.push(source.index.getX(t), source.index.getX(t + 1), source.index.getX(t + 2));
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', '_part']) geometry.setAttribute(name, source.attributes[name]);
    geometry.setIndex(kept);
    for (const material of CAP_COUNTS) { const mesh = new THREE.Mesh(geometry, material); mesh.renderOrder = -2; mesh.frustumCulled = false; mesh.visible = false; mesh.raycast = () => {}; root.add(mesh); meshes.push(mesh); }
  }
  return meshes;
}
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
  sex: 'male', view: 'body', peel: 0, blend: null, region: null, layers: {}, xray: 0, body: 0.25, labels: true, clothed: true, cut: false, tone: 0,
  selection: null, hovered: -1, sheet: 'peek', story: null, contents: false, touched: false,
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

/* the selection: an entry (all its parts, from the sheet's list, the search or stepping) or one picked part (with its entry's text) */
const selectedParts = () => state.selection ? state.selection.parts : [];
const isolating = () => !!state.selection && state.selection.isolate;

/* a cut, of either kind, opens every shell: the inside faces are drawn too, and the ink line (drawn on back faces) is left out */
function openShells() {
  const open = state.cut || opened.ball.value.w > 0, side = open ? THREE.DoubleSide : THREE.FrontSide;
  if (MATERIALS.solid.side !== side) { MATERIALS.solid.side = side; MATERIALS.solid.needsUpdate = true; }
  MATERIALS.outline.visible = !open;
}
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
  cutUniform.value = state.cut ? 0 : 1e6;
  openShells();
  if ((CLOTH.clippingPlanes?.length || 0) !== (state.cut ? 1 : 0)) { CLOTH.clippingPlanes = state.cut ? [CUT_PLANE] : []; CLOTH.needsUpdate = true; }
  const colours = stateTexture.colour.image.data, flags = stateTexture.flags.image.data;
  const chosen = new Set(selectedParts()), isolate = isolating(), colour = new THREE.Color(), live = moving() ? MOTIONS[state.region] : null;
  body.parts.forEach((part, index) => {
    const mode = state.layers[part.layer];
    let opacity = state.blend ? state.blend[part.layer] : mode === 'solid' ? 1 : mode === 'ghost' ? GHOST : 0;
    if (part.layer === 'skin') opacity = mode === 'off' || (state.clothed && !revealed() && !state.region && /pubic hair/i.test(part.name)) ? 0 : state.body * (live?.skin ?? 1);
    else if (around) opacity = around.own.has(index) ? 1 : around.context.has(index) ? GHOST * (live?.context ?? 1) : 0;   // a close-up: its parts, and its context faint
    if (mode === 'solid' && !state.blend && view.xray.includes(part.layer)) opacity = 1 - (1 - GHOST) * state.xray;
    if (SHOWN_WHEN_CHOSEN.test(part.name) && !chosen.has(index)) opacity = 0;
    if (isolate) opacity = chosen.has(index) ? 1 : Math.min(opacity, part.layer === 'skin' ? 0.05 : 0.12);
    if (chosen.has(index) && !isolate) opacity = Math.max(opacity, 1);
    const look = live?.look && around.own.has(index) ? live.look(part.name) : null;   // how a part looks while its close-up moves: the heart's walls as glass, its cavities the colour of their blood
    if (look?.opacity !== undefined && !chosen.has(index)) opacity = Math.min(opacity, look.opacity);
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
  setMotion();
  invalidate();
}

/* ---------- UI: the sheet, the stories, Contents ---------- */
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

/* every entry has a number, as in a parts diagram: the callouts on the model and the sheet's list of parts share it */
const entryNumber = key => body.order.indexOf(key) + 1;   // 0 for an entry that is not among the numbered parts (inside a region)
const entryLayer = key => body.parts[body.entries[key][0]].layer;
$('bugList').innerHTML = BUGS.map(([title, fix]) => `<li><b>${escapeHtml(title)}</b><span>${escapeHtml(fix)}</span></li>`).join('');
$('differenceRows').innerHTML = DIFFERENCES.map(([female, male]) => `<tr><td>${escapeHtml(female)}</td><td>${escapeHtml(male)}</td></tr>`).join('');
$('gapList').innerHTML = GAPS.map(([title, text]) => `<li><b>${escapeHtml(title)}.</b> ${escapeHtml(text)}</li>`).join('');

/* ---------- Stories ----------
   A story has the stage: the sheet lists its sections, the model moves, the words being spoken are shown under it, and
   the strip is its transport. There are three kinds, and they share this one mode.
   'steps'   how a region works, a step at a time (stories.mjs: the heart has one)
   'motion'  a region that moves and has no steps: its motion plays over and over, and the region's opening is spoken once
   'tour'    the main parts of the whole body, one by one, each in the view of its layer */
const sentence = text => text.charAt(0).toUpperCase() + text.slice(1);
const TOUR_NAME = 'Tour of the body';
const HOME_STORIES = ['heart', 'lungs', 'eye', 'knee'];   // the few offered on the home page; Contents lists them all
const storyKind = id => (!id ? 'tour' : STORIES[id] ? 'steps' : 'motion');
const storyName = id => (id ? sentence(MOTIONS[id].watch) : TOUR_NAME);
const storySteps = (id, kind) => (kind === 'tour' ? TOUR.filter(([key]) => body.entries[key]).map(([entry, view]) => ({ entry, view })) : kind === 'steps' ? STORIES[id] : [{}]);
/* what the voice says at a step: a step's own words, a part's name and notes, or the region's opening */
function stepWords(kind, id, step) {
  if (kind === 'steps') return step.say;
  if (kind === 'tour') { const entry = ALL[step.entry]; return `${entry.name}. ${entry.what} ${entry.does}`; }
  return NARRATION[`region:${id}`];
}
/* how long a story takes told aloud, in whole minutes: the voice takes about SPEECH_MS over each character (measured
   from the clips), and a breath after each step. Read with the sound off, a step lasts as long as its words take to read. */
const SPEECH_MS = 88, READ_MS = 60, STEP_MS = 7000;
function storyMinutes(id) {
  const kind = storyKind(id), spoken = storySteps(id, kind).reduce((ms, step) => ms + stepWords(kind, id, step).length * SPEECH_MS + AFTER_VOICE_MS, 0);
  return Math.max(1, Math.round(spoken / 60_000));
}
const telling = () => (state.story?.kind === 'steps' ? state.story.steps[state.story.index] : null);   // the step of a region's story being told now
/* Starts a region's story, or with no region the tour of the body. A story is told aloud, so starting one turns the
   sound on (aloud: false for a screen showing itself off to nobody). loop: play the region's motion on its own, though
   it has steps. A story started from inside another ends where that one would have. */
function startStory(id, { aloud = true, loop = false } = {}) {
  if (id && !MOTIONS[id]) throw new Error(`${id} has no story`);
  const kind = loop ? 'motion' : storyKind(id), from = state.story ? state.story.from : { region: state.region, view: state.view };
  setContents(false);
  state.cut = false;
  state.story = { kind, region: id, name: storyName(id), steps: storySteps(id, kind), index: 0, at: null, playing: true, done: false, stepStart: 0, spent: 0, from };
  sound.key = null;   // its words are spoken from the start, though the region's opening may just have said them
  if (id && state.region !== id) applyRegion(id);
  goStep(0);
  if (aloud) setSound(true);
}
function goStep(index) {
  const story = state.story, step = story.steps[index], held = paused();
  Object.assign(story, { index, playing: true, done: false, stepStart: performance.now() });   // moving on, by hand or not, plays
  if (held && sound.on && sound.manifest.music) sound.music.play().catch(refused);
  /* a stop of the tour picks its part out, in the view of its layer. A region's step picks nothing out: the part it
     is about stays as it is drawn in motion (glass, with its blood showing), labelled and gently lit */
  if (story.kind === 'tour') { applyView(step.view); selectEntry(step.entry); focusSelection(viewInfo()); }
  else { select(null); focusStep(step); }
}
/* a step closes in on what it is about, from where it is best seen; one that names nothing shows the whole region */
function focusStep(step) {
  if (!step.frame) { const frame = viewFrame(); flyTo(frame.position, frame.target, V(0, 1, 0)); return; }
  const parts = step.frame.flatMap(key => body.entries[key] || []);
  const frame = fitFrame(boxPoints(parts, 1), step.from ? V(...step.from).normalize() : viewInfo().direction || FRONT, V(0, 1, 0), step.fill || 0.82);
  flyTo(frame.position, frame.target, V(0, 1, 0), 1400);
}
/* A part picked from the sheet while its region moves: the story plays on, the view closes in on the part from its own
   side of the region, and its label is lit. Picked again, the view goes back to the whole region. */
function watchPart(key) {
  const story = state.story;
  story.at = story.at === key ? null : key;
  if (!story.at) focusStep({});
  else {
    const parts = body.entries[key], points = boxPoints(parts, 0.8), whole = viewFrame();
    const aside = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3()).sub(whole.target);
    const direction = (viewInfo().direction || FRONT).clone().normalize().addScaledVector(aside.lengthSq() ? aside.normalize() : aside, 0.9).normalize();
    const near = fitFrame(points, direction, V(0, 1, 0), 0.6);
    /* a part that reaches far out of the region (a thigh bone at the knee) is shown where it is in the region */
    const frame = near.position.distanceTo(near.target) < whole.position.distanceTo(whole.target) ? near : whole;
    flyTo(frame.position, frame.target, V(0, 1, 0), 1400);
  }
  renderSheet(); syncUI();
}
/* step through the main parts by hand, in number order; each is shown in the view of its layer */
function stepPart(delta) {
  const keys = body.order, current = state.selection ? keys.indexOf(state.selection.entry) : -1;
  const first = state.region ? 0 : Math.max(0, keys.findIndex(key => viewForLayer(entryLayer(key)) === state.view));
  const index = current < 0 ? (delta > 0 ? first : keys.length - 1) : (current + delta + keys.length) % keys.length;
  const key = keys[index];
  if (!state.region && viewForLayer(entryLayer(key)) !== state.view) applyView(viewForLayer(entryLayer(key)));
  selectEntry(key);
  focusSelection(viewInfo());
}
const viewForLayer = layer => ({ skeleton: 'skeleton', muscles: 'muscles', organs: 'organs', vessels: 'vessels', nerves: 'nerves', skin: 'body' })[layer];
/* A story held where it is: its voice, its music, its motion and its clock all wait, and all go on from where they were.
   A story that has played to its end is not held: it plays again from the top. */
const paused = () => !!state.story && !state.story.playing && !state.story.done;
function playStory(playing) {
  const story = state.story;
  if (!story || story.playing === playing) return;
  if (story.done) { goStep(0); return; }
  const now = performance.now();
  story.playing = playing;
  if (playing) story.stepStart = now - story.spent; else story.spent = now - story.stepStart;
  if (!playing) { sound.voice.pause(); sound.music.pause(); }
  else if (sound.on) { if (sound.speaking) sound.voice.play().catch(refused); if (sound.manifest.music) sound.music.play().catch(refused); }
  syncUI();
}
/* the story is over, and whoever ends it goes somewhere next, which draws the page again; music it was holding plays on */
function endStory() {
  if (!state.story) return;
  const held = paused();
  state.story = null;
  if (held && sound.on && sound.manifest.music) sound.music.play().catch(refused);
}
/* Exit: back to where the story was started, home or a region, with the model at rest */
function exitStory() {
  const { from } = state.story;
  endStory();
  if (from.region) setRegion(from.region); else { state.selection = null; setView(from.view); }
}
/* How long a step runs: with the sound on, as long as its clip and a breath more; read, as long as its words take */
const stepClip = (story, index) => (story.kind === 'steps' ? `story:${story.region}:${index}` : story.kind === 'motion' ? `region:${story.region}` : `entry:${story.steps[index].entry}`);
function stepLength(story, index) {
  const seconds = sound.on && sound.manifest.narration[stepClip(story, index)]?.seconds;
  return seconds ? seconds * 1000 + AFTER_VOICE_MS : Math.max(STEP_MS, stepWords(story.kind, story.region, story.steps[index]).length * READ_MS);
}
/* The playback bar: how much of the story has been told, and how long it is in all. A region's motion goes round after
   its words are done, and the bar stays full. */
const clock = ms => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
let timeShown = null;
function renderProgress(now) {
  const story = state.story;
  if (!story) return;
  const lengths = story.steps.map((step, index) => stepLength(story, index)), total = lengths.reduce((sum, ms) => sum + ms, 0);
  const before = lengths.slice(0, story.index).reduce((sum, ms) => sum + ms, 0);
  const played = story.done ? total : before + Math.min(lengths[story.index], story.playing ? now - story.stepStart : story.spent);
  const time = `${clock(played)} / ${clock(total)}`;
  if (time === timeShown) return;
  timeShown = time;
  $('storyTime').textContent = time;
  $('storyBar').firstElementChild.style.width = `${(played / total) * 100}%`;
  $('storyBar').setAttribute('aria-valuenow', String(Math.round((played / total) * 100)));
}
function stepStory(now) {
  const story = state.story;
  renderProgress(now);
  if (!story?.playing || story.kind === 'motion') return;   // a motion goes round until it is left
  /* with the sound on, a step that is spoken lasts as long as the voice, and a breath more */
  const unspoken = Math.max(STEP_MS, stepWords(story.kind, story.region, story.steps[story.index]).length * READ_MS);
  if (sound.on && sound.clip ? sound.speaking || now - sound.endedAt < AFTER_VOICE_MS : now - story.stepStart < unspoken) return;
  if (story.index + 1 < story.steps.length) goStep(story.index + 1);
  else { story.playing = false; story.done = true; syncUI(); }
}

/* ---------- Motion: what a region does in its story ----------
   motions.mjs says, for each region, what moves, when, and what flows. Here its parts are moved in the shaders (the
   moves texture), its streams are drawn as drops running along curves, its parts fade and glow from moment to moment,
   and it has a caption for each moment and sounds at some of them. */
/* The model moves only inside a story. A region opens still, and is still again once its story is left. For anyone who
   has asked their device for less motion a story still shows its steps and its words, and nothing moves. */
const moving = () => !!state.story && state.story.kind !== 'tour' && state.region === state.story.region && !reducedMotion();
const motionKey = () => (moving() ? `${body.sex}:${state.region}` : null);
const motion = { for: null, definition: null, rig: null, rigs: {}, phase: 0, clock: 0, caption: '', moment: -1, told: null, kept: null, opening: null, open: { amount: 0, normal: V(0, 0, 1), depth: 0, ball: new THREE.Vector4() }, into: 0, last: 0, held: null, base: null, touched: new Set(), chosen: new Set() };   // held: a moment of the cycle to stay at (tests and pictures)
const DROP = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), fill = g.createRadialGradient(16, 16, 0, 16, 16, 16); fill.addColorStop(0, 'rgba(255,255,255,1)'); fill.addColorStop(0.5, 'rgba(255,255,255,0.9)'); fill.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = fill; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const WAY = 600;
const dropHeight = { value: 1 };   // the canvas height in pixels: a drop's size is in cm
const WHITE = new THREE.Color('#ffffff'), GLOW = new THREE.Color('#ffc94a');

/* up to ~1500 vertices of each of some parts, in the model frame (cm): one pass over each layer the parts are in */
function partPoints(indices) {
  const wanted = new Map(indices.map(index => [index, []]));
  for (const layer of new Set(indices.map(index => body.parts[index].layer))) {
    const record = body.layers[layer];
    if (!record?.group) continue;
    const position = record.pick.geometry.attributes.position, ids = record.pick.geometry.attributes._part;
    for (let k = 0; k < position.count; k++) { const list = wanted.get(ids.getX(k)); if (list) list.push(k); }
    for (const [index, list] of wanted) {
      if (body.parts[index].layer !== layer) continue;
      const stride = Math.max(1, Math.floor(list.length / 1500));
      wanted.set(index, list.filter((_, k) => k % stride === 0).map(k => V(position.getX(k), position.getY(k), position.getZ(k))));
    }
  }
  return wanted;
}
/* what a motion is built from: the close-up's parts, and ways to measure them */
function motionKit() {
  const own = [...body.around.own].map(index => body.parts[index]), context = [...body.around.context].map(index => body.parts[index]), shown = [...own, ...context];
  const fail = what => { throw new Error(`the ${body.sex} ${state.region} close-up has ${what}`); };
  const several = parts => (Array.isArray(parts) ? parts : [parts]);
  const mean = points => points.reduce((sum, point) => sum.add(point), V(0, 0, 0)).divideScalar(points.length);
  const cloud = new Map();
  const points = parts => several(parts).flatMap(part => {
    if (!cloud.has(part.index)) for (const [index, list] of partPoints(shown.includes(part) ? shown.filter(other => other.layer === part.layer).map(other => other.index) : [part.index])) cloud.set(index, list);
    return cloud.get(part.index);
  });
  const kit = {
    models: [], model(spec) { const model = makeModel(spec); kit.models.push(model); return model; },
    /* a way through that a cut's face must leave clear: a tube round an axis through a point, from one depth along it to another (cm) */
    hollows: [], hollow(spec) { kit.hollows.push(makeHollow(spec)); },
    V, own, context, shown, skin: body.parts.filter(part => part.layer === 'skin'), sex: body.sex, height: body.height,
    find: (pattern, among = own) => among.filter(part => pattern.test(part.name)),
    one: (pattern, among = shown) => among.find(part => pattern.test(part.name)) || fail(`nothing named ${pattern}`),
    entry: key => (body.entries[key] || fail(`no ${key}`)).map(index => body.parts[index]),
    has: key => !!body.entries[key],
    centre: parts => mean(several(parts).map(part => V(...part.centre))),
    box: parts => several(parts).reduce((all, part) => all.expandByPoint(V(...part.min)).expandByPoint(V(...part.max)), new THREE.Box3()),
    points,
    /* the middle of the end of a part: of its points within some cm of its farthest reach in a direction */
    end(parts, direction, depth = 2) {
      const all = points(parts); if (!all.length) fail(`no points for ${several(parts)[0].name}`);
      const far = Math.max(...all.map(point => point.dot(direction)));
      return mean(all.filter(point => point.dot(direction) > far - depth).map(point => point.clone()));
    },
    /* the line down the middle of a tube (a vessel, a duct, a nerve), from the end nearest a point: a ball is walked
       along it, each step to the middle of what it has not yet covered */
    line(parts, { from, radius, to } = {}) {
      const all = points(parts); if (!all.length) fail(`no points for ${several(parts)[0].name}`);
      const size = kit.box(parts).getSize(V(0, 0, 0)), reach = radius || Math.max(0.5, Math.min(size.x, size.y, size.z) * 0.6);
      if (!from) { const axis = size.x >= size.y && size.x >= size.z ? V(1, 0, 0) : size.y >= size.z ? V(0, 1, 0) : V(0, 0, 1); from = kit.end(parts, to ? to.clone().sub(kit.centre(parts)).negate().normalize() : axis, reach); }
      let left = all, at = all.reduce((best, point) => (point.distanceToSquared(from) < best.distanceToSquared(from) ? point : best));
      const path = [];
      while (left.length) {
        const near = left.filter(point => point.distanceTo(at) < reach);
        if (!near.length) break;
        const middle = mean(near.map(point => point.clone())); path.push(middle);
        left = left.filter(point => point.distanceTo(at) >= reach);
        const ahead = left.filter(point => point.distanceTo(middle) < reach * 2.2);
        if (!ahead.length) break;
        at = mean(ahead.map(point => point.clone()));
      }
      return path;
    },
    /* straight lines from point to point: the way of a ray of light */
    path(through) { const path = new THREE.CurvePath(); through.slice(1).forEach((point, k) => path.add(new THREE.LineCurve3(through[k], point))); return path; },
    /* a smooth curve through points, with how far along it (0 to 1) a place lies */
    curve(through) {
      const curve = new THREE.CatmullRomCurve3(through, false, 'centripetal'), spot = V(0, 0, 0);
      return { curve, length: curve.getLength(), whereOf(place) { let best = 0, least = Infinity; for (let k = 0; k <= 300; k++) { const d = curve.getPointAt(k / 300, spot).distanceTo(place); if (d < least) { least = d; best = k / 300; } } return best; } };
    },
    /* the direction in which a flat cloud of points is thinnest (the way through a ring, or a valve), on the side of `toward` */
    thin(cloud, toward) {
      const middle = mean(cloud.map(point => point.clone())), spread = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (const point of cloud) { const d = point.clone().sub(middle).toArray(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) spread[i][j] += d[i] * d[j] / cloud.length; }
      /* its least principal axis: the greatest of what is left when the spread is taken from its own total */
      const total = spread[0][0] + spread[1][1] + spread[2][2];
      let axis = toward.clone().normalize();
      for (let pass = 0; pass < 60; pass++) axis = V(...[0, 1, 2].map(i => total * axis.getComponent(i) - spread[i][0] * axis.x - spread[i][1] * axis.y - spread[i][2] * axis.z)).normalize();
      return axis.dot(toward) < 0 ? axis.negate() : axis;
    },
    turn: (axis, degrees) => new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees)),
    /* the axis that swings a limb, hanging from a pivot in one direction, toward another */
    swing: (along, toward) => along.clone().cross(toward).normalize(),
  };
  return kit;
}
/* A model of the motion's own: a shape the source has only at rest (a valve, drawn shut), built in code so that it can
   move as the real thing does. While the motion runs it stands in for some of the close-up's parts: it takes their
   colour and how solid they are, moment by moment, is picked as them, and they are not drawn. { name, parts: the
   parts it stands in for, count: its vertices, index: its triangles, of: the part each vertex is picked as, wet }; the
   motion's step writes its `positions`, and may keep what it likes in its `state`. */
const MODEL_PICK = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uOpen: opened.plane, uOpenBall: opened.ball },
  vertexShader: 'attribute float _part; varying float vPart; varying vec3 vPlace; void main() { vPart = _part + 1.0; vPlace = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec4 uOpen; uniform vec4 uOpenBall; varying float vPart; varying vec3 vPlace; void main() { if (${CUT_AWAY}) discard; float id = vPart; gl_FragColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, 0.0, 1.0); }` });
function makeModel({ name, parts, count, index, of, wet = false }) {
  const geometry = new THREE.BufferGeometry(), positions = new Float32Array(count * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('_part', new THREE.BufferAttribute(Float32Array.from(of, part => part.index), 1));
  geometry.setIndex(index);
  /* wet: glistening, as living tissue is */
  const material = wet ? new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25, clippingPlanes: [openPlane] })
    : new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.78, metalness: 0, clippingPlanes: [openPlane] });
  material.envMapIntensity = wet ? 0.8 : 0.4;
  const mesh = new THREE.Mesh(geometry, material), pick = new THREE.Mesh(geometry, MODEL_PICK);
  for (const object of [mesh, pick]) { object.frustumCulled = false; object.visible = false; object.raycast = () => {}; }
  root.add(mesh); pickScene.add(pick);
  return { name, parts, positions, geometry, mesh, pick, state: {} };
}
const CHOSEN_LIGHT = new THREE.Color('#5a3d00'), NO_LIGHT = new THREE.Color('#000000');
/* a stream: drops that run along a curve. { curve, colour, to (the colour it turns by the end), count, size and spread
   (cm), packed (the share of the curve the drops start bunched into: a single body, such as an egg), speed(where,
   phase, time) in shares of the curve a second, gates [{ at, open(phase) }] that hold the drops behind them when shut,
   place(phase, time) where the head of the stream is, for one that keeps time with the motion instead of flowing freely,
   shown(phase) from 0 to 1 } */
/* a point somewhere in a ball, more often near its middle */
const inBall = radius => V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).setLength(radius * Math.random() ** 0.6);
function makeStream(spec) {
  const count = spec.count ?? 160, spread = spec.spread ?? 0.5, geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('grain', new THREE.BufferAttribute(Float32Array.from({ length: count }, () => 0.55 + Math.random() ** 2 * 0.9), 1));   // no two drops quite the same size
  const cloud = new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms: { uMap: { value: DROP }, uSize: { value: spec.size ?? 0.8 }, uHeight: dropHeight, uOpen: opened.plane, uOpenBall: opened.ball }, transparent: true, depthTest: false, depthWrite: false, blending: spec.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `attribute float alpha; attribute vec3 tint; attribute float grain; uniform float uSize; uniform float uHeight; uniform vec4 uOpen; uniform vec4 uOpenBall; varying float vAlpha; varying vec3 vTint;
      void main() { vec3 vPlace = position; vAlpha = ${CUT_AWAY} ? 0.0 : alpha; vTint = tint; vec4 seen = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize * grain * projectionMatrix[1][1] * uHeight * 0.5 / -seen.z; gl_Position = projectionMatrix * seen; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vAlpha; varying vec3 vTint;
      void main() {
        gl_FragColor = vec4(vTint, texture2D(uMap, gl_PointCoord).a * vAlpha);
        #include <colorspace_fragment>
      }`,
  }));
  cloud.renderOrder = 4; cloud.frustumCulled = false; cloud.raycast = () => {}; cloud.visible = false;
  root.add(cloud);
  const from = new THREE.Color(spec.colour).lerp(WHITE, 0.25), to = spec.to ? new THREE.Color(spec.to).lerp(WHITE, 0.25) : from;
  return { ...spec, cloud, from, to, gates: spec.gates || [], way: spec.curve.getSpacedPoints(WAY),   // the curve as points evenly spaced along it: quick to look up, drop by drop, frame by frame
    drops: Array.from({ length: count }, (_, k) => ({ label: (k + Math.random()) / count, behind: (spec.packed ?? 1) * k / count, where: spec.packed ? spec.packed * k / count : (k + Math.random()) / count, off: spec.swirl ? inBall(spread) : V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread * 2), other: spec.swirl ? inBall(spread) : null, rate: (0.5 + Math.random()) * (Math.random() < 0.5 ? -1 : 1), turn: Math.random() * 6.283 })) };
}
/* The words under the model during a story: a step's own; on the tour the part's name and notes; and for a region that
   only moves, the motion's caption for the moment. A motion that turns over faster than a line can be read (a
   heartbeat) names its moments side by side and lights the one it is in: the words stay put. Where nothing moves
   (reduced motion) there are no moments, and the words are the ones the voice says. */
let wordsShown = null;
function renderWords() {
  const say = $('say'), story = state.story;
  say.hidden = !story;
  if (!story) return;
  const step = story.steps[story.index], moments = story.kind === 'motion' && moving() && motion.for === motionKey() && motion.definition.moments;
  const words = story.kind === 'tour' ? `<b>${escapeHtml(ALL[step.entry].name)}.</b> ${escapeHtml(`${ALL[step.entry].what} ${ALL[step.entry].does}`)}`
    : story.kind === 'steps' || !moving() ? escapeHtml(stepWords(story.kind, story.region, step))
    : moments ? moments.map(text => `<span>${escapeHtml(text)}</span>`).join('') : escapeHtml(motion.caption);
  if (words !== wordsShown) { wordsShown = words; say.innerHTML = words; }
  if (moments) [...say.children].forEach((span, k) => span.classList.toggle('now', k === motion.moment));
}
function setMotion() {
  const key = motionKey();
  for (const [name, rig] of Object.entries(motion.rigs)) if (name !== key) { for (const stream of rig.streams) stream.cloud.visible = false; for (const mesh of rig.caps) mesh.visible = false; for (const model of rig.models) model.mesh.visible = model.pick.visible = false; }
  if (motion.for !== key) {
    motion.for = null; motion.definition = motion.rig = null; motion.caption = ''; motion.moment = -1; motion.touched.clear();
    motion.open.amount = 0; opened.ball.value.w = 0; openPlane.normal.set(0, 0, -1); openPlane.constant = 1e6; capSheet.visible = false; openShells();
    stateTexture.moves.image.data.fill(0); stateTexture.moves.needsUpdate = true;
    /* its layers may still be on their way: this runs again when they arrive */
    if (!key || ![...body.around.own, ...body.around.context].every(index => body.layers[body.parts[index].layer]?.group)) return;
    motion.definition = MOTIONS[state.region];
    if (!motion.rigs[key]) {
      const kit = motionKit(), rig = motion.definition.build(kit);
      rig.streams = (rig.streams || []).map(makeStream); rig.models = kit.models;
      /* how each of its parts is when the close-up is cut open (a step of its story): { opacity, cap: the cut leaves a flat face on it } */
      rig.opened = new Map(kit.own.map(part => [part.index, motion.definition.opened?.(part.name)]).filter(([, look]) => look));
      rig.caps = [...capMeshes([...rig.opened].filter(([, look]) => look.cap).map(([index]) => index)), ...kit.hollows];
      motion.rigs[key] = rig;
    }
    motion.rig = motion.rigs[key]; motion.for = key; motion.clock = 0; motion.phase = 0;   // each motion starts from its beginning
    capSheet.material.color.set(motion.definition.cut || CUT_FACE);
  }
  if (key) motion.base = stateTexture.colour.image.data.slice();   // how each part looks before the moment's fades and glows
}
/* what a motion's step may do to a part, for this moment */
const STILL = new THREE.Quaternion(), NONE = [0, 0, 0, 0], FOUR = [0, 0, 0, 0], MORE = [0, 0, 0, 0];
const four = (into, x, y, z, w) => { into[0] = x; into[1] = y; into[2] = z; into[3] = w; return into; };
function writeMove(part, kind, pivot, turn, more, last) {
  const sign = turn.w < 0 ? -1 : 1;   // the short way round, for a share of the turn
  const moves = stateTexture.moves.image.data, k = part.index * 16;
  moves[k] = pivot.x; moves[k + 1] = pivot.y; moves[k + 2] = pivot.z; moves[k + 3] = kind;
  moves[k + 4] = turn.x * sign; moves[k + 5] = turn.y * sign; moves[k + 6] = turn.z * sign; moves[k + 7] = turn.w * sign;
  moves.set(more, k + 8); moves.set(last, k + 12);
}
const act = {
  /* scaled about a pivot (a number, or a vector for each axis), turned about it, then shifted */
  rigid(part, { pivot, turn = STILL, shift, scale = 1 }) { writeMove(part, 1, pivot, turn, shift ? four(MORE, shift.x, shift.y, shift.z, 0) : NONE, scale.isVector3 ? four(FOUR, scale.x, scale.y, scale.z, 0) : four(FOUR, scale, scale, scale, 0)); },
  /* turned about a pivot by a share that goes from none to all across a band: from `from` to `to`, in cm from the pivot along a direction */
  bend(part, { pivot, turn, along, from, to }) { writeMove(part, 2, pivot, turn, four(MORE, along.x, along.y, along.z, 0), four(FOUR, from, to, 0, 0)); },
  /* turned in full within `near` cm of the pivot, not at all beyond `far` */
  held(part, { pivot, turn, near, far }) { writeMove(part, 3, pivot, turn, four(MORE, near, far, 0, 0), NONE); },
  fade(part, opacity) {
    if (motion.chosen.has(part.index)) return;
    stateTexture.colour.image.data[part.index * 4 + 3] = Math.round(THREE.MathUtils.clamp(opacity, 0, 1) * 255); motion.touched.add(part.index);
  },
  /* as solid as a share of what it is at rest */
  dim(part, share) { act.fade(part, motion.base[part.index * 4 + 3] / 255 * share); },
  /* lit, from 0 to 1: its colour drawn toward a light, and a see-through part made more solid */
  glow(part, amount, colour = GLOW) {
    const colours = stateTexture.colour.image.data, k = part.index * 4, share = THREE.MathUtils.clamp(amount, 0, 1) * 0.8;
    colours[k] = Math.round(motion.base[k] + (colour.r * 255 - motion.base[k]) * share); colours[k + 1] = Math.round(motion.base[k + 1] + (colour.g * 255 - motion.base[k + 1]) * share); colours[k + 2] = Math.round(motion.base[k + 2] + (colour.b * 255 - motion.base[k + 2]) * share);
    if (motion.base[k + 3] > 0) colours[k + 3] = Math.round(motion.base[k + 3] + (255 - motion.base[k + 3]) * share);
    motion.touched.add(part.index);
  },
};
/* Where a step of a story cuts the close-up open: a plane that faces the way the step is seen from, through the middle
   of the parts its `open` names (or `lift` cm nearer the viewer); all within a ball round the parts that open. */
function openingOf(step, rig) {
  const normal = V(...(step.from || (viewInfo().direction || FRONT).toArray())).normalize();
  const through = new THREE.Box3().setFromPoints(boxPoints(step.open.flatMap(key => body.entries[key] || []))).getCenter(V(0, 0, 0));
  const round = new THREE.Box3().setFromPoints(boxPoints([...rig.opened.keys()])).getBoundingSphere(new THREE.Sphere());
  return { normal, depth: through.dot(normal) + (step.lift || 0), ball: new THREE.Vector4(round.center.x, round.center.y, round.center.z, round.radius * 1.02) };
}
/* The cut sweeps in from the viewer's side as a step opens the close-up, and back out before the next step cuts
   somewhere else. Returns how far open it is, 0 to 1. */
function stepOpening(seconds) {
  const open = motion.open, goal = motion.opening;
  if (goal && open.amount === 0) { open.normal.copy(goal.normal); open.depth = goal.depth; open.ball.copy(goal.ball); }
  const there = !!goal && open.normal.equals(goal.normal) && open.depth === goal.depth;
  open.amount = THREE.MathUtils.clamp(open.amount + (there ? seconds / 0.9 : -seconds / 0.45), 0, 1);
  const eased = open.amount * open.amount * (3 - 2 * open.amount), edge = open.ball.x * open.normal.x + open.ball.y * open.normal.y + open.ball.z * open.normal.z + open.ball.w;
  opened.plane.value.set(open.normal.x, open.normal.y, open.normal.z, edge + (open.depth - edge) * eased);
  /* the sheet that closes the cut lies on the plane, across the whole ball */
  capSheet.position.set(open.ball.x, open.ball.y, open.ball.z).addScaledVector(open.normal, opened.plane.value.w - edge + open.ball.w);
  capSheet.quaternion.setFromUnitVectors(V(0, 0, 1), open.normal); capSheet.scale.setScalar(open.ball.w * 2.2);
  const was = opened.ball.value.w > 0;
  opened.ball.value.copy(open.ball); if (open.amount === 0) opened.ball.value.w = 0;
  if (open.amount === 0) { openPlane.normal.set(0, 0, -1); openPlane.constant = 1e6; } else { openPlane.normal.copy(open.normal).negate(); openPlane.constant = opened.plane.value.w; }
  if (was !== opened.ball.value.w > 0) openShells();
  return open.amount;
}
const spot = new THREE.Vector3();
function stepMotion(now) {
  const key = motionKey();
  if (!key || motion.for !== key) return;
  const { definition, rig } = motion, cycle = definition.cycle / 1000;
  const seconds = paused() ? 0 : THREE.MathUtils.clamp((now - motion.last) / 1000, 0, 0.05); motion.last = now;   // frames can arrive out of order by a hair: nothing steps back; a story that is paused holds its motion too
  /* a story's step plays one stretch of the cycle, slowed, over and over, with a breath between: the drops fade out and in across the join */
  const step = telling(), span = motion.held === null && step?.span ? step : null;
  if (motion.told !== step) {
    motion.told = step; motion.clock = 0;
    /* what a step is about: the parts it frames, names and labels. The rest stands back while it is told. */
    motion.kept = step?.frame && step.keep !== 'all' ? new Set([...step.frame, ...(step.labels || []), step.entry].flatMap(key => body.entries[key] || [])) : null;
    motion.opening = step?.open ? openingOf(step, rig) : null;
  }
  const open = stepOpening(seconds);
  if (motion.held === null) motion.clock += seconds;
  let time = motion.held === null ? motion.clock : motion.held * cycle, join = 1, rejoined = false;
  if (span) {
    const round = span.seconds + 0.6, into = motion.clock % round;
    time = (span.span[0] + (span.span[1] - span.span[0]) * Math.min(1, into / span.seconds)) * cycle;
    join = THREE.MathUtils.clamp(Math.min(into / 0.35, (round - into) / 0.35), 0, 1); rejoined = into < motion.into; motion.into = into;
  }
  const before = motion.phase, phase = motion.phase = (time % cycle) / cycle;
  const colours = stateTexture.colour.image.data;
  for (const index of motion.touched) colours.set(motion.base.subarray(index * 4, index * 4 + 4), index * 4);
  motion.touched.clear(); motion.chosen = new Set(selectedParts());
  const moment = definition.step(rig, phase, act, time) || {};
  if (span) for (const index of body.entries[step.entry] || []) act.glow(body.parts[index], 0.3);   // what the step is about, gently lit
  if (open > 0) for (const [index, look] of rig.opened) {
    const part = body.parts[index], was = motion.base[index * 4 + 3] / 255;
    act.fade(part, was + (look.opacity - was) * Math.min(1, open * 2));
  }
  for (const mesh of rig.caps) mesh.visible = open >= 0.5;   // the cut gets its flat face as the walls turn solid
  capSheet.visible = open >= 0.5;
  if (motion.kept) {
    const away = Math.min(1, motion.clock / 0.7);   // eased out over the first moments of the step
    for (const index of body.around.own) if (!motion.kept.has(index) && !(motion.opening && rig.opened.has(index))) act.fade(body.parts[index], motion.base[index * 4 + 3] / 255 * (1 - 0.85 * away));
    for (const index of body.around.context) act.fade(body.parts[index], motion.base[index * 4 + 3] / 255 * (1 - 0.6 * away));
  }
  /* each model takes the look its parts have at this moment, and stands in for them */
  for (const model of rig.models) {
    const k = model.parts[0].index * 4, solid = colours[k + 3] / 255, material = model.mesh.material;
    model.mesh.visible = model.pick.visible = solid > 0.004;
    material.color.setRGB(colours[k] / 255, colours[k + 1] / 255, colours[k + 2] / 255, THREE.SRGBColorSpace); material.opacity = solid;
    if (material.transparent !== solid < 0.999) { material.transparent = solid < 0.999; material.depthWrite = !material.transparent; material.needsUpdate = true; }
    material.emissive.copy(model.parts.some(part => motion.chosen.has(part.index)) ? CHOSEN_LIGHT : NO_LIGHT);
    for (const part of model.parts) { colours[part.index * 4 + 3] = 0; motion.touched.add(part.index); }
    model.geometry.attributes.position.needsUpdate = true; model.geometry.computeVertexNormals();
  }
  stateTexture.moves.needsUpdate = true; stateTexture.colour.needsUpdate = true;
  dropHeight.value = renderer.domElement.height;
  rig.streams.forEach((stream, which) => {
    const { position, alpha, tint } = stream.cloud.geometry.attributes, shown = step?.streams && !step.streams.includes(which) ? 0 : join * (stream.shown ? stream.shown(phase, time) : 1);
    stream.cloud.visible = shown > 0.004;
    if (!stream.cloud.visible) return;
    stream.cloud.material.depthTest = open > 0;   // an opened close-up has solid walls, and its blood shows only where the cut lets it be seen
    stream.cloud.material.uniforms.uSize.value = (stream.size ?? 0.8) * (1 + 0.25 * open);   // and is seen closer
    const lay = stream.lay?.(phase, time);   // a stream that knows where each of its drops is, by its place in the queue
    stream.drops.forEach((drop, k) => {
      if (lay) drop.where = lay(drop.label);
      else if (stream.place) drop.where = THREE.MathUtils.clamp(stream.place(phase, time) - drop.behind, 0, 1);
      else {
        let next = drop.where + stream.speed(drop.where, phase, time) * seconds;
        for (const gate of stream.gates) if (drop.where < gate.at && next >= gate.at && !gate.open(phase)) next = drop.where;   // a shut gate holds the stream behind it
        drop.where = next >= 1 ? next - 1 : next < 0 ? next + 1 : next;
      }
      const along = drop.where * WAY, before = Math.min(WAY - 1, Math.floor(along));
      spot.lerpVectors(stream.way[before], stream.way[before + 1], along - before);
      let narrow = 1, { x, y, z } = drop.off;
      if (stream.width) narrow = stream.width(drop.where);   // as wide as what it runs through
      else for (const gate of stream.gates) narrow = Math.min(narrow, 0.45 + 6 * Math.abs(drop.where - gate.at));   // or it narrows through a gate
      if (stream.swirl) {   // each drop wanders round the middle of the stream, so the whole churns
        const angle = time * stream.swirl * drop.rate + drop.turn, cos = Math.cos(angle), sin = Math.sin(angle);
        x = x * cos + drop.other.x * sin; y = y * cos + drop.other.y * sin; z = z * cos + drop.other.z * sin;
      }
      position.setXYZ(k, spot.x + x * narrow, spot.y + y * narrow, spot.z + z * narrow);
      alpha.setX(k, (stream.strength ?? 0.92) * shown * (stream.place ? 1 - 0.85 * drop.behind / stream.packed : Math.min(1, drop.where / 0.04, (1 - drop.where) / 0.05)));   // a free stream fades in at its start and out at its end; one that keeps time trails off behind its head
      tint.setXYZ(k, stream.from.r + (stream.to.r - stream.from.r) * drop.where, stream.from.g + (stream.to.g - stream.from.g) * drop.where, stream.from.b + (stream.to.b - stream.from.b) * drop.where);
    });
    position.needsUpdate = alpha.needsUpdate = tint.needsUpdate = true;
  });
  /* a sound is made as the cycle passes its moment: not while a moment is held, nor on a frame in which no time passed */
  if (sound.on && motion.held === null && phase !== before && !rejoined) for (const [at, make] of rig.sounds || definition.sounds || []) if (before < phase ? before < at && at <= phase : at > before || at <= phase) make(play, rig);
  const which = moment.moment ?? -1;
  if ((moment.caption && moment.caption !== motion.caption) || which !== motion.moment) { motion.caption = moment.caption || motion.caption; motion.moment = which; renderWords(); }
  needsRender = true;
}
/* the sounds a motion can make: a low thump (a heart sound), a breath, a sung note, a soft chime */
let audioContext = null, audioOut = null, hiss = null;   // hiss: three seconds of noise, which every breath is cut from
/* where they all go. It is opened by the Sound button, since a browser starts sound only at a touch. */
function outlet() {
  if (!audioContext) { audioContext = new AudioContext(); audioOut = audioContext.createGain(); audioOut.connect(audioContext.destination); }
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioOut;
}
/* quieter while the voice is speaking, so it is not talked over; silent once the sound is off or nothing moves */
function levelSounds() { if (audioOut) audioOut.gain.value = !sound.on || !moving() ? 0 : sound.speaking ? 0.3 : 1; }
const play = {
  thump(pitch, seconds, level) {
    const out = outlet();
    const start = audioContext.currentTime, tone = audioContext.createOscillator(), gain = audioContext.createGain();
    tone.frequency.setValueAtTime(pitch, start); tone.frequency.exponentialRampToValueAtTime(pitch * 0.6, start + seconds);
    gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(level, start + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    tone.connect(gain).connect(out); tone.start(start); tone.stop(start + seconds + 0.02);
  },
  breath(seconds, level, pitch) {
    const out = outlet();
    if (!hiss) { hiss = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate); const samples = hiss.getChannelData(0); for (let k = 0; k < samples.length; k++) samples[k] = Math.random() * 2 - 1; }
    const start = audioContext.currentTime, buffer = hiss;
    const noise = audioContext.createBufferSource(), band = audioContext.createBiquadFilter(), gain = audioContext.createGain();
    noise.buffer = buffer; band.type = 'bandpass'; band.frequency.value = pitch; band.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(level, start + seconds * 0.45); gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    noise.connect(band).connect(gain).connect(out); noise.start(start); noise.stop(start + seconds);
  },
  /* "aah": a buzz like the vocal folds make, shaped by two resonances as the throat and mouth shape it */
  voice(seconds, pitch, level) {
    const out = outlet();
    const start = audioContext.currentTime, buzz = audioContext.createOscillator(), gain = audioContext.createGain();
    buzz.type = 'sawtooth'; buzz.frequency.setValueAtTime(pitch, start); buzz.frequency.linearRampToValueAtTime(pitch * 0.94, start + seconds);
    gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(level, start + 0.12); gain.gain.setValueAtTime(level, start + seconds - 0.25); gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    for (const resonance of [730, 1090]) { const band = audioContext.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = resonance; band.Q.value = 6; buzz.connect(band).connect(gain); }
    gain.connect(out); buzz.start(start); buzz.stop(start + seconds + 0.02);
  },
  chime(pitch, level) {
    const out = outlet();
    const start = audioContext.currentTime, tone = audioContext.createOscillator(), gain = audioContext.createGain();
    tone.type = 'sine'; tone.frequency.value = pitch;
    gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(level, start + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
    tone.connect(gain).connect(out); tone.start(start); tone.stop(start + 1.15);
  },
};

/* ---------- Sound: music under everything, and a voice for what is on show ----------
   Off until asked for (a browser plays nothing before a click). audio/manifest.json lists the music and the voice clips
   (scripts/body/make-audio.mjs); a clip belongs to a part, a close-up's opening, or a whole-body view. */
const MUSIC_LEVEL = 0.2, UNDER_VOICE = 0.07, AFTER_VOICE_MS = 900;
const sound = { on: false, manifest: null, music: new Audio(), voice: new Audio(), key: null, clip: null, speaking: false, endedAt: 0 };
sound.music.loop = true; sound.music.volume = MUSIC_LEVEL;
sound.voice.addEventListener('ended', () => { sound.speaking = false; sound.endedAt = performance.now(); sound.music.volume = MUSIC_LEVEL; invalidate(); });
const voiceKey = () => {
  const story = state.story;
  if (story?.kind === 'steps') return `story:${story.region}:${story.index}`;
  if (story?.kind === 'motion') return `region:${story.region}`;
  return state.selection?.entry ? `entry:${state.selection.entry}` : state.region ? `region:${state.region}` : state.selection || state.blend ? null : `view:${state.view}`;
};
/* a browser may still refuse to play (no click yet): the sound goes back off. A clip cut short by the next one is not a refusal. */
const refused = error => { if (error.name === 'AbortError') return; sound.on = false; sound.music.pause(); sound.voice.pause(); sound.speaking = false; syncUI(); };
function speak() {
  const key = sound.on ? voiceKey() : null;
  if (key === sound.key) return;
  sound.key = key; sound.clip = key && sound.manifest.narration[key] ? sound.manifest.narration[key].file : null;
  sound.voice.pause(); sound.speaking = false; sound.music.volume = MUSIC_LEVEL;
  if (!sound.clip) return;
  sound.voice.src = `audio/${sound.clip}`; sound.speaking = true; sound.music.volume = UNDER_VOICE;
  if (!paused()) sound.voice.play().catch(refused);
}
$('soundBtn').addEventListener('click', () => setSound(!sound.on));
$('labelsBtn').addEventListener('click', () => { state.labels = !state.labels; syncUI(); });   // every label on the model, on or off, from anywhere
/* only ever called from a touch or a click, which is what a browser waits for before it will play */
function setSound(on) {
  if (sound.on === on) return;
  sound.on = on;
  if (sound.on) outlet();
  if (sound.on && sound.manifest.music) { sound.music.src ||= `audio/${sound.manifest.music}`; if (!paused()) sound.music.play().catch(refused); }
  if (!sound.on) { sound.music.pause(); sound.voice.pause(); sound.speaking = false; }
  syncUI();
}

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
/* The sheet shows exactly one thing: the home page (the layer on show, the tour, a few stories), a region (what it is,
   its story, its numbered parts), a part's card, or during a story its sections: the steps of a story that has them,
   the stops of the tour, or the numbered parts of a region in motion, with the one being told marked. Phones have no
   room for it during a story. */
const lowerFirst = text => text.charAt(0).toLowerCase() + text.slice(1);
function renderSheet() {
  const el = $('sheet');
  el.classList.toggle('full', state.sheet === 'full');
  el.classList.toggle('telling', !!state.story);
  /* the keyboard keeps its place when the sheet is drawn again: on the same button if it is still there, else on the heading */
  const held = el.contains(document.activeElement) ? document.activeElement : null;
  const again = held && (held.dataset.step ? `[data-step="${held.dataset.step}"]` : held.hasAttribute('data-sheet') ? '[data-sheet]' : null);
  el.innerHTML = `<button type="button" class="sheet-handle" data-sheet aria-label="${state.sheet === 'peek' ? 'Show more' : 'Show less'}"></button>${sheetContent()}`;
  if (held) (again && el.querySelector(again) || $('sheetTitle')).focus();
  el.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
}
function storySections() {
  const story = state.story, head = `<div class="eyebrow">Watching</div><h2 id="sheetTitle" tabindex="-1">${escapeHtml(story.name)}</h2>`;
  if (story.kind === 'motion') return `${head}
    <h3 class="sub">Parts</h3>
    <div class="list parts">${body.order.map(key => `<button type="button" data-entry="${key}" aria-current="${key === story.at}"><i>${entryNumber(key)}</i>${escapeHtml(ALL[key].short || ALL[key].name)}</button>`).join('')}</div>`;
  const title = step => (story.kind === 'tour' ? ALL[step.entry].short || ALL[step.entry].name : step.title);
  return `${head}
    <h3 class="sub">${story.kind === 'tour' ? 'Stops' : 'Steps'}</h3>
    <div class="list parts">${story.steps.map((step, k) => `<button type="button" data-go="${k}" aria-current="${k === story.index}"><i>${k + 1}</i>${escapeHtml(title(step))}</button>`).join('')}</div>`;
}
function sheetContent() {
  if (state.story) return storySections();
  const selection = state.selection, intro = viewInfo();
  const heading = `<h2 id="sheetTitle" tabindex="-1">${escapeHtml(intro.title)}</h2>
    <p class="lead">${escapeHtml(intro.text[state.sex] || intro.text.any)}</p>`;
  if (!selection && !state.region) return `
    <div class="eyebrow">Layer ${Math.round(state.peel) + 1} of ${PEEL.length}</div>
    ${heading}
    <button type="button" class="go" data-watch="">Tour the body, ${storyMinutes(null)} min</button>
    <h3 class="sub">Watch how it works</h3>
    <div class="list">${HOME_STORIES.map(id => `<button type="button" data-watch="${id}">${escapeHtml(storyName(id))}<span>${storyMinutes(id)} min</span></button>`).join('')}
      <button type="button" data-contents>Everything on this site<span>Contents</span></button></div>`;
  if (!selection) return `
    <div class="eyebrow">Region</div>
    ${heading}
    ${MOTIONS[state.region] ? `<button type="button" class="go" data-watch="${state.region}">Watch: ${escapeHtml(MOTIONS[state.region].watch)}, ${storyMinutes(state.region)} min</button>` : ''}
    <h3 class="sub">Parts</h3>
    <div class="list parts">${body.order.map(key => `<button type="button" data-entry="${key}"><i>${entryNumber(key)}</i>${escapeHtml(ALL[key].short || ALL[key].name)}</button>`).join('')}</div>`;
  const key = selection.entry, entry = key ? ALL[key] : null, part = body.parts[selection.part ?? selection.parts[0]];
  const title = selectionName();
  const picked = selection.part !== undefined ? body.parts[selection.part].name : null;
  const aka = !entry ? `${LAYER_INFO[part.layer].name} · ${GROUP_INFO[part.group]?.name || part.group}`
    : title !== entry.name ? `Part of: ${entry.name}` : picked && picked !== entry.name ? `Selected piece: ${picked}` : entry.aka;
  const at = key ? body.order.indexOf(key) : -1;
  const size = part.max.map((value, axis) => value - part.min[axis]);
  const facts = entry ? entry.stats : [['Size (this model)', `${Math.max(...size).toFixed(1)} cm across`], ['Layer', LAYER_INFO[part.layer].name]];
  const equivalent = entry && (entry.other?.[otherSex()] ?? entry.other?.any);
  return `
    <div class="sheet-head"><span class="sys" style="--dot:${LAYER_INFO[part.layer].dot}">${at >= 0 ? `<em class="no">${at + 1}</em>` : ''}${escapeHtml(GROUP_INFO[part.group]?.name || LAYER_INFO[part.layer].name)}</span>${at >= 0 ? `<span class="count">${at + 1} of ${body.order.length}</span>` : ''}</div>
    <div><h2 id="sheetTitle" tabindex="-1">${escapeHtml(title)}</h2><div class="aka">${escapeHtml(aka || '')}</div></div>
    ${entry ? `<p>${escapeHtml(entry.what)}</p><p>${escapeHtml(entry.does)}</p><div class="bug"><b>Worth knowing</b>${escapeHtml(entry.bug)}</div>` : `<p>One of the ${body.parts.length} structures in this model, in the ${escapeHtml((GROUP_INFO[part.group]?.name || part.group).toLowerCase())}. The main parts have full notes.</p>`}
    <dl class="stats">${facts.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>
    ${equivalent ? `<div class="homolog">${state.sex === 'male' ? 'Female' : 'Male'} equivalent: <b>${escapeHtml(equivalent)}</b></div>` : ''}
    ${partNav(at)}
    ${sourceNote(selection.parts)}`;
}
/* Next and Previous, each named for the part it leads to (the numbered parts, in order), and the way back up: to the
   region, or on the whole body to the layer */
function partNav(at) {
  const up = `<button type="button" data-up>Back to ${escapeHtml(lowerFirst(viewInfo().title))}</button>`;
  if (at < 0) return `<div class="part-nav">${up}</div>`;
  const name = k => { const entry = ALL[body.order[(k + body.order.length) % body.order.length]]; return escapeHtml(entry.short || entry.name); };
  return `<div class="part-nav"><button type="button" class="go" data-step="1">Next: ${name(at + 1)}</button><button type="button" data-step="-1">Previous: ${name(at - 1)}</button>${up}</div>`;
}
const HOTSPOTS = [['brain', 'frontalLobe', null, 'Brain'], ['eye', 'eye', 'right', 'Eye'], ['heart', 'heart', null, 'Heart'], ['shoulder', 'scapula', 'right', 'Shoulder'], ['digestive', 'smallIntestine', null, 'Gut'], ['hand', 'carpals', 'right', 'Hand'], ['knee', 'patella', 'right', 'Knee'], ['foot', 'talus', 'right', 'Foot']];
const atHome = () => !state.region && !state.selection && !state.story;
/* a part goes back up to its region, or on the whole body to its layer */
function leavePart() { select(null); const frame = viewFrame(); flyTo(frame.position, frame.target, V(0, 1, 0)); }
/* home: out of any region, story and selection, onto the whole body in one layer (the skin, from the title), the camera reset */
function goHome(view = 'body') { endStory(); setContents(false); state.selection = null; setView(view); }
/* up one level: Contents closes, a story exits, a part goes back to its region or layer, a region goes home */
function goUp() {
  if (state.contents) { setContents(false); $('contentsBtn').focus(); }
  else if (state.story) { exitStory(); $('sheetTitle').focus(); }
  else if (state.selection) leavePart();
  else if (state.region) setView(state.view);
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-entry],[data-step],[data-go],[data-up],[data-sheet],[data-region],[data-watch],[data-contents],[data-layer],[data-story],[data-manual]');
  if (!target) return;
  if (target.hasAttribute('data-sheet')) { state.sheet = state.sheet === 'peek' ? 'full' : 'peek'; renderSheet(); }
  else if (target.hasAttribute('data-contents')) { setContents(true); $('contents').focus(); }
  else if (target.hasAttribute('data-up')) leavePart();
  else if (target.hasAttribute('data-watch')) { startStory(target.dataset.watch || null); $('transport').querySelector('[data-story="play"]').focus(); }
  else if (target.dataset.region) { endStory(); setContents(false); setRegion(target.dataset.region); }
  else if (target.dataset.layer) goHome(target.dataset.layer);
  else if (target.dataset.step) stepPart(Number(target.dataset.step));
  else if (target.dataset.go) goStep(Number(target.dataset.go));
  else if (target.dataset.manual) { setContents(false); $(target.dataset.manual).scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); }
  else if (target.dataset.story) {
    const story = state.story, action = target.dataset.story;
    if (action === 'exit') { exitStory(); $('sheetTitle').focus(); }
    if (action === 'play') playStory(!story.playing);
    if (action === 'next') goStep(Math.min(story.steps.length - 1, story.index + 1));
    if (action === 'prev') goStep(Math.max(0, story.index - 1));
  } else if (state.story?.kind === 'motion' && target.closest('#sheet') && body.entries[target.dataset.entry]) watchPart(target.dataset.entry);
  else if (body.entries[target.dataset.entry]) {
    endStory(); setContents(false);
    const key = target.dataset.entry, view = target.dataset.view || viewForLayer(entryLayer(key));
    if (target.dataset.view ? state.region || view !== state.view : !state.region && view !== state.view) applyView(view);   // a region's own parts stay in it
    selectEntry(key);
    focusSelection(viewInfo());
    if (target.closest('.manual')) $('viewer').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
});

/* ---------- Contents: the whole site on one page, laid over the stage ----------
   The stories to watch, the regions by part of the body, the six layers, how the model is drawn, and the reading. What
   is under it keeps its place, and shows again when the page is closed. Opening it ends a story. */
function renderContents() {
  const regions = Object.values(REGIONS).filter(region => !region.sex || region.sex === body.sex);
  const watch = id => `<button type="button" data-watch="${id || ''}">${escapeHtml(storyName(id))}<span>${storyMinutes(id)} min</span></button>`;
  $('contentsWatch').innerHTML = [null, ...regions.filter(region => MOTIONS[region.id]).map(region => region.id)].map(watch).join('');
  $('contentsRegions').innerHTML = GROUPS.map(group => `<section><h2>${escapeHtml(group)}</h2><div class="list">${regions.filter(region => region.group === group).map(region =>
    `<button type="button" data-region="${region.id}">${escapeHtml(region.name)}</button>`).join('')}</div></section>`).join('');
}
function setContents(open) {
  if (state.contents === open) return;
  if (open && state.story) exitStory();
  state.contents = open;
  if (open) { renderContents(); $('contents').scrollTop = 0; }
  syncUI();
}
$('contentsBtn').addEventListener('click', () => { setContents(!state.contents); if (state.contents) $('contents').focus(); });

function syncUI() {
  invalidate();
  const story = state.story;
  [...tonesEl.querySelectorAll('button')].forEach((button, k) => button.setAttribute('aria-pressed', String(k === state.tone)));
  for (const button of document.querySelectorAll('[data-toggle]')) { button.setAttribute('aria-pressed', String(state[button.dataset.toggle])); button.querySelector('span').textContent = state[button.dataset.toggle] ? 'On' : 'Off'; }
  for (const button of $('sexSwitch').children) button.setAttribute('aria-pressed', String(button.dataset.sex === state.sex));
  $('soundBtn').setAttribute('aria-pressed', String(sound.on));
  $('labelsBtn').setAttribute('aria-pressed', String(state.labels));
  speak();
  renderTrail();
  /* Contents lies over the stage and the sheet, which are out of reach until it is closed */
  $('contents').hidden = !state.contents;
  $('contentsBtn').textContent = state.contents ? 'Close' : 'Contents';
  $('contentsBtn').setAttribute('aria-expanded', String(state.contents));
  stage.inert = $('sheet').inert = state.contents;
  /* the strip: the layers at home, a story's transport, and nothing in a region or on a part */
  $('layerStrip').hidden = !atHome();
  $('peel').value = Math.round(state.peel * 100);
  for (const button of $('views').children) button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  $('transport').hidden = !story;
  if (story) {
    const stepped = story.steps.length > 1, button = action => $('transport').querySelector(`[data-story="${action}"]`);
    button('prev').hidden = button('next').hidden = $('storyCount').hidden = !stepped;
    button('prev').disabled = story.index === 0; button('next').disabled = story.index === story.steps.length - 1;
    $('storyCount').textContent = `${story.index + 1} / ${story.steps.length}`;
    button('play').textContent = story.playing ? 'Pause' : story.done ? 'Play again' : 'Play';
  }
  renderWords();
  $('hint').hidden = state.touched || !atHome();
  const xrayOn = state.xray >= 0.02, coverName = viewInfo().xray.map(layer => LAYER_INFO[layer].name.toLowerCase()).join(' and ');
  $('xrayOut').textContent = xrayOn ? `On, ${Math.round(state.xray * 100)}%` : 'Off';
  $('xraySwitch').setAttribute('aria-checked', String(xrayOn));
  $('xray').hidden = !xrayOn;
  $('xray').value = Math.round(state.xray * 100);
  $('xrayNote').textContent = coverName ? `X-ray fades the ${coverName} to outlines, so what lies behind shows through.` : '';
  $('body').value = Math.round(state.body * 100);
  $('bodyOut').textContent = state.layers.skin === 'off' || state.body < 0.01 ? 'Hidden' : `${Math.round(state.body * 100)}%`;
  for (const range of document.querySelectorAll('input[type="range"]')) range.style.setProperty('--fill', `${(range.value - range.min) / (range.max - range.min) * 100}%`);
  resize();   // the strip and the words take room from the model, or give it back
}
/* a picked structure is named for itself, unless it is a piece of a whole organ; a chosen entry by the entry's name */
const selectionName = () => {
  const selection = state.selection, entry = selection.entry && ALL[selection.entry];
  if (!entry) return body.parts[selection.parts[0]].name;
  if (selection.part !== undefined && !entry.whole && body.entries[selection.entry].length > 1) return body.parts[selection.part].name;
  return entry.name;
};
/* internal parts are isolated (solid, everything else faint); parts on the surface of their layer just get highlighted */
const shouldIsolate = parts => parts.every(index => !['skin'].includes(body.parts[index].layer)) && viewInfo().isolate;
function select(selection) {
  state.selection = selection;
  if (selection) {
    state.sheet = 'peek';
    for (const index of selection.parts) { const layer = body.parts[index].layer; if (state.layers[layer] === 'off') state.layers[layer] = 'solid'; }
    ensureLayers();
  }
  applyVisibility(); renderSheet(); syncUI();
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
  if (isolating()) state.selection = null;
  if (state.region) { state.selection = null; state.region = null; useIndex(body, null); buildTags(); measureTags(); }
  state.view = name; state.peel = PEEL.indexOf(name); state.blend = null;
  const view = VIEW_INFO[name];
  Object.assign(state.layers, view.layers);
  state.xray = 0; state.body = view.body;
  ensureLayers(); applyVisibility(); renderSheet(); syncUI();
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
  ensureLayers(); applyVisibility(); renderSheet(); syncUI();
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
$('peel').addEventListener('input', event => { glide = null; setPeel(event.target.value / 100); });
/* a region: its own numbered parts, and only the layers its parts and context are in. It opens still. */
function applyRegion(id) {
  const region = REGIONS[id];
  if (region.sex && region.sex !== body.sex) throw new Error(`the ${body.sex} body has no ${id} region`);
  state.selection = null; state.region = id; state.blend = null; glide = null;
  useIndex(body, region);
  buildTags(); measureTags();
  for (const layer of LAYERS) state.layers[layer] = 'off';
  for (const index of [...body.around.own, ...body.around.context]) state.layers[body.parts[index].layer] = 'solid';
  state.layers.skin = 'ghost';
  state.xray = 0; state.body = viewInfo().body;
  ensureLayers(); applyVisibility(); renderSheet(); syncUI();
}
function setRegion(id) {
  applyRegion(id);
  const frame = viewFrame();
  flyTo(frame.position, frame.target, V(0, 1, 0));
}
const resetView = () => (state.region ? setRegion(state.region) : setView(state.view));
/* each view keeps its direction but sets its distance so its subject fills the part of the stage it has to itself: all
   of it but a margin, and what the strip and a story's words take at the bottom */
function freeRect() {
  const box = stage.getBoundingClientRect(), margin = phone.matches ? 12 : 24;
  const taken = ['layerStrip', 'transport', 'say'].map($).filter(el => !el.hidden).map(el => el.getBoundingClientRect().top - box.top);
  return { left: margin, right: box.width - margin, top: margin, bottom: Math.min(box.height, ...taken) - margin };
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
    return fitFrame(boxPoints(framed, region.margin ?? 0.5), view.direction || FRONT, V(0, 1, 0), 1);
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
  /* close enough that the part is what the picture is of: in a close-up, where everything is small, closer still */
  const frame = fitFrame(boxPoints(parts, Math.max(state.region ? 0.8 : 2.5, size * 0.2)), direction, V(0, 1, 0), 0.85);
  flyTo(frame.position, frame.target, V(0, 1, 0));
}
for (const button of $('views').children) button.addEventListener('click', () => glideTo(button.dataset.view));
$('homeBtn').addEventListener('click', () => goHome());
$('resetBtn').addEventListener('click', () => { setContents(false); resetView(); });
for (const button of document.querySelectorAll('[data-toggle]')) button.addEventListener('click', () => {
  const key = button.dataset.toggle; state[key] = !state[key]; applyVisibility(); syncUI();
  /* the cut is looked at from the body's left, square on, from where the view already is */
  if (key === 'cut' && state.cut) { const distance = camera.position.distanceTo(controls.target); flyTo(controls.target.clone().addScaledVector(V(1, 0.06, 0.1).normalize(), distance), controls.target, V(0, 1, 0)); }
});
$('xraySwitch').addEventListener('click', () => { state.xray = state.xray < 0.02 ? 0.85 : 0; applyVisibility(); syncUI(); });
$('xray').addEventListener('input', event => { state.xray = event.target.value / 100; applyVisibility(); syncUI(); });
$('body').addEventListener('input', event => { state.body = event.target.value / 100; if (state.body > 0 && state.layers.skin === 'off') { state.layers.skin = 'ghost'; ensureLayers(); } applyVisibility(); syncUI(); });
/* Escape goes up one level from anywhere but the search box, which it clears. The arrow keys step from part to part, or
   from step to step of a story, and move the view up and down the body, unless a control or Contents has the keys. */
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape' && event.target.id !== 'find') { goUp(); return; }
  if (state.contents || event.target.closest('input, textarea, select')) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1, story = state.story;
    if (!story) stepPart(delta);
    else if (story.steps[story.index + delta]) goStep(story.index + delta);
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); flight = null; controls.lift((event.key === 'ArrowUp' ? 1 : -1) * Math.max(3, visibleHeight() * 0.08)); clampLift(); invalidate(); }
  if (event.key === ' ' && state.story && !event.target.closest('button, a, [role="button"]')) { event.preventDefault(); playStory(!state.story.playing); }   // the space bar pauses a story, as it does a film
});
for (const button of $('sexSwitch').children) button.addEventListener('click', () => switchSex(button.dataset.sex));

/* ---------- Where you are, and finding a part ---------- */
/* The trail runs on from the title, down to what is on show: Human Anatomy › Heart › Mitral valve. Each step before the
   last is a button that goes back up to it; during a story the last step is the story's name. */
function renderTrail() {
  const region = closeUp(), story = state.story, trail = [];
  if (state.contents) trail.push(['contents', 'Contents']);
  else {
    if (region) trail.push(['place', region.name]);
    else if (!story && state.view !== 'body' && !state.blend) { const button = $('views').querySelector(`[data-view="${state.view}"]`); trail.push(['place', (button.querySelector('.long') || button).textContent]); }
    if (story) trail.push(['story', story.name]);
    else if (state.selection) trail.push(['part', selectionName()]);
  }
  $('crumbs').innerHTML = trail.map(([kind, name], k) => `<i aria-hidden="true">›</i>${k === trail.length - 1 ? `<b aria-current="page">${escapeHtml(name)}</b>` : `<button type="button" data-crumb="${kind}">${escapeHtml(name)}</button>`}`).join('');
}
/* the only step that can come before the last is the place a part or a story is in: its region, or its layer */
$('crumbs').addEventListener('click', event => {
  if (!event.target.closest('[data-crumb]')) return;
  if (state.story) { endStory(); resetView(); } else leavePart();
});
/* Everything that can be found, for this body: the close-ups, the main parts, the parts a close-up adds, and every named
   structure. Each says where it is and how to get there. */
let findable = null;
function findables() {
  if (findable?.body === body) return findable.list;
  const main = body.indexes[''] ||= indexParts(body.parts, body.sex, body.height), list = [];
  const regions = Object.values(REGIONS).filter(region => !region.sex || region.sex === body.sex);
  list.push({ name: TOUR_NAME, words: `${TOUR_NAME} guided`, note: `${storyMinutes(null)} min`, kind: 'Story', rank: 0, go: () => startStory(null) });
  for (const region of regions) {
    list.push({ name: region.name, words: `${region.name} ${region.title} ${region.note}`, note: region.note, kind: 'Region', rank: 0, go: () => setRegion(region.id) });
    if (MOTIONS[region.id]) list.push({ name: storyName(region.id), words: `${storyName(region.id)} ${region.name}`, note: `${storyMinutes(region.id)} min`, kind: 'Story', rank: 1, go: () => startStory(region.id) });
  }
  for (const key of main.order) { const entry = ALL[key]; list.push({ name: entry.name, words: `${entry.name} ${entry.short || ''} ${entry.aka || ''}`, note: entry.aka || '', kind: LAYER_INFO[body.parts[main.entries[key][0]].layer].name, rank: 1, go: () => goEntry(key, null) }); }
  for (const region of regions) for (const key of region.parts) {
    const entry = DETAILS[key];
    if (!entry || (entry.sex && entry.sex !== body.sex)) continue;
    list.push({ name: entry.name, words: `${entry.name} ${entry.short || ''} ${entry.aka || ''}`, note: entry.aka || '', kind: `In ${region.name}`, rank: 2, go: () => goEntry(key, region.id) });
  }
  const named = new Set(list.map(item => item.name.toLowerCase()));
  for (const part of body.parts) if (part.layer !== 'skin' && !named.has(part.name.toLowerCase())) list.push({ name: part.name, words: part.name, note: '', kind: LAYER_INFO[part.layer].name, rank: 3, go: () => goPart(part.index) });
  for (const item of list) item.words = item.words.toLowerCase();
  findable = { body, list };
  return list;
}
/* straight to a part: into its close-up if it belongs to one, else onto the whole body in the layer it is part of */
function goEntry(key, region) {
  if (region) { if (state.region !== region) applyRegion(region); }
  else if (!(state.region && body.order.includes(key))) applyView(viewForLayer(body.parts[(body.indexes[''].entries[key])[0]].layer));
  if (!body.entries[key]) { const frame = viewFrame(); flyTo(frame.position, frame.target, V(0, 1, 0)); return; }   // this body's close-up lacks it: the close-up itself
  selectEntry(key); focusSelection(viewInfo());
}
function goPart(index) {
  applyView(viewForLayer(body.parts[index].layer));
  selectPart(index); focusSelection(viewInfo());
}
/* best first: a name that starts with what was typed, then a word in it that does, then anything that holds it; close-ups and main parts before lesser ones */
function find(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const here = state.region && `In ${closeUp().name}`;
  const score = item => { const name = item.name.toLowerCase(); return (name.startsWith(words[0]) ? 0 : new RegExp(`\\b${words[0].replace(/[^a-z0-9]/g, '.')}`).test(name) ? 1 : name.includes(words[0]) ? 2 : 3) * 10 + (here && item.kind === here ? -1 : item.rank); };   // a part of the close-up that is open comes first
  return findables().filter(item => words.every(word => item.words.includes(word))).map(item => [score(item), item]).sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).slice(0, 9).map(([, item]) => item);
}
const finder = { found: [], at: 0 };
function showFound() {
  const box = $('find'), list = $('found'), query = box.value.trim();
  finder.found = find(query); finder.at = 0;
  list.hidden = !query; box.setAttribute('aria-expanded', String(!!query));
  list.innerHTML = finder.found.length ? finder.found.map((item, k) => `<li role="option" data-found="${k}" aria-selected="${k === 0}"><b>${escapeHtml(item.name)}</b><em>${escapeHtml(item.kind)}</em>${item.note ? `<span>${escapeHtml(item.note)}</span>` : ''}</li>`).join('')
    : '<li class="none">Nothing by that name in this body.</li>';
}
function takeFound(k) {
  const item = finder.found[k];
  if (!item) return;
  endStory(); setContents(false);
  $('find').value = ''; $('found').hidden = true; $('find').setAttribute('aria-expanded', 'false'); $('find').blur();
  item.go();
}
$('find').addEventListener('input', showFound);
$('find').addEventListener('focus', () => { if ($('find').value.trim()) showFound(); });
$('find').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); takeFound(finder.at); }
  else if (event.key === 'Escape') { $('find').value = ''; $('found').hidden = true; $('find').blur(); }
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); if (!finder.found.length) return;
    finder.at = (finder.at + (event.key === 'ArrowDown' ? 1 : -1) + finder.found.length) % finder.found.length;
    [...$('found').children].forEach((row, k) => row.setAttribute('aria-selected', String(k === finder.at)));
    $('found').children[finder.at].scrollIntoView({ block: 'nearest' });
  }
});
$('found').addEventListener('pointerdown', event => { const row = event.target.closest('[data-found]'); if (row) { event.preventDefault(); takeFound(+row.dataset.found); } });
document.addEventListener('pointerdown', event => { if (!event.target.closest('#finder')) $('found').hidden = true; });
/* "/" starts a search from anywhere */
document.addEventListener('keydown', event => { if (event.key === '/' && !event.target.closest('input, textarea, select')) { event.preventDefault(); $('find').focus(); } });

/* switching body keeps the view and, where the other body has it, the selected part (or its equivalent) */
async function switchSex(sex) {
  if (sex === state.sex && body?.sex === sex) return;
  endStory();
  const previous = state.selection?.entry;
  state.sex = sex; save();
  $('fetching').hidden = false; $('fetching').textContent = `Loading the ${sex} body…`;
  body = await loadBody(sex);
  makeStateTextures(body.parts.length);
  state.selection = null;
  buildHeightRuler(); buildSpots();
  /* a close-up carries over when the other body has it */
  const region = state.region && (!REGIONS[state.region].sex || REGIONS[state.region].sex === sex) ? state.region : null;
  state.region = null;
  if (region) applyRegion(region); else { buildTags(); applyView(state.view); }
  await ensureLayers();
  const swap = previous && (body.entries[previous] ? previous : ALL[previous]?.swap);
  if (swap && body.entries[swap] && (!region || body.order.includes(swap))) { selectEntry(swap); focusSelection(); }
  else { const frame = viewFrame(); flyTo(frame.position, frame.target, V(0, 1, 0)); }
  if (state.contents) renderContents();
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
    tag.addEventListener('click', event => { if (event.detail === 0 && !state.story) { selectEntry(key); focusSelection(); } });   // keyboard activation
    tag.hidden = true;
    labelsEl.append(tag); tagEls[key] = tag;
  }
}
/* The glowing points: one per region worth going into from the whole body, and a touch opens it. Each stands clear of the
   body, in a column on its side of it, with its name, and a fine line runs from it to the part, so nothing sits on the body itself. */
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
    el.addEventListener('click', () => setRegion(id));
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
      svg += `<polyline class="spot-line" points="${item.x.toFixed(1)},${item.y.toFixed(1)} ${(side === 'left' ? x + 18 : x - 18).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}"/><circle class="spot-end" cx="${item.x.toFixed(1)}" cy="${item.y.toFixed(1)}" r="2"/>`;
    });
  }
  return svg;
}
function measureTags() { for (const [key, tag] of Object.entries(tagEls)) { tag.hidden = false; tagWidths[key] = tag.offsetWidth; tag.hidden = true; } invalidate(); }
const projected = new THREE.Vector3();
const OVERLAYS = ['#layerStrip', '#transport', '#say', '.hint', '#fetching', '#invite'];
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
  const selectedKey = telling()?.span ? telling().entry : state.story?.at || state.selection?.entry, hoveredKey = state.hovered >= 0 && body.entryOf[state.hovered] >= 0 ? body.keys[body.entryOf[state.hovered]] : null;
  const told = telling() ? telling().labels || [telling().entry] : null;
  const priority = told ? told : atHome() && spotEls.length && !state.blend && state.peel === 0 ? [] : viewInfo().labels[state.sex] || viewInfo().labels.any;   // on the opening view the glowing points invite; callouts come with the layers
  const order = (isolating() ? [selectedKey, hoveredKey] : [selectedKey, hoveredKey, ...priority]).filter((key, k, list) => key && body.entries[key] && list.indexOf(key) === k);
  for (const [key, tag] of Object.entries(tagEls)) if (!order.includes(key)) tag.hidden = true;
  const shown = [];
  for (const key of order) {
    const important = key === selectedKey || key === hoveredKey || !!told?.includes(key);
    const anchor = anchorOf(key);
    if (!anchor || !state.labels || (!important && !anchor.seen)) { tagEls[key].hidden = true; continue; }   // with the labels off there are none, not even the chosen part's
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
  if (down && !down.strayed && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5 && !state.story) {   // a story is watched: nothing is picked out of it
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
/* The canvas is the stage. The model is centred in the part of it that the strip and a story's words leave free (the
   camera looks at a taller picture, of which the stage is the top), and tall screens keep the horizontal field of view. */
const drawn = { width: 0, height: 0 };
function resize() {
  const { clientWidth: width, clientHeight: height } = stage;
  if (width !== drawn.width || height !== drawn.height) { renderer.setSize(width, height, false); outlineResolution.value.set(width, height); drawn.width = width; drawn.height = height; }
  const free = freeRect(), under = Math.max(0, height - free.bottom - free.top);   // what is taken at the bottom, beyond the margin the top has too
  camera.aspect = width / (height + under);
  camera.fov = width / height < 1.2 ? 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(16)) * 1.2 * (height + under) / width) * 180 / Math.PI : 32;
  camera.setViewOffset(width, height + under, 0, under, width, height);
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
/* ---------- A screen left alone (?kiosk, for a museum or a shop window) ----------
   When nobody has touched it for a while it shows itself off, one region's motion after another, silently, under an
   invitation to touch. The first touch ends the show where it is, leaving that motion playing with its transport, and
   turns the sound on: a touch is what a browser waits for. */
const KIOSK = params.has('kiosk'), LEFT_ALONE_MS = 75_000, EACH_MS = 22_000;
const SHOWN_OFF = ['heart', 'lungs', 'brain', 'skull', 'knee', 'digestive', 'eye', 'hand', 'kidney', 'spine', 'shoulder', 'lymphatic'];
const show = { touched: performance.now(), at: -1, next: 0 };
if (KIOSK) {
  for (const type of ['pointerdown', 'keydown', 'wheel']) addEventListener(type, () => { show.touched = performance.now(); }, { capture: true, passive: true });
  /* the show ends when a finger lifts or a key is pressed: that is the moment a browser will let sound start */
  for (const type of ['pointerup', 'keydown']) addEventListener(type, event => {
    if (show.at < 0) return;
    show.at = -1; $('invite').hidden = true;
    if (!sound.on && !event.target.closest?.('#soundBtn')) $('soundBtn').click();
  }, { capture: true });
}
function stepShow(now) {
  if (!KIOSK || !body) return;
  const story = state.story;
  if (show.at < 0 && (sound.speaking || (story && story.kind !== 'motion' && story.playing))) show.touched = now;   // someone listening, or watching a story that is still being told, has not left; a motion goes round for ever
  if (now - show.touched < LEFT_ALONE_MS || now < show.next) return;
  show.at = (show.at + 1) % SHOWN_OFF.length; show.next = now + EACH_MS;
  if (sound.on) $('soundBtn').click();   // the last visitor's sound does not play to an empty room
  startStory(SHOWN_OFF[show.at], { aloud: false, loop: true });
  $('invite').hidden = false;
}
function animate(now) {
  requestAnimationFrame(animate);
  stepShow(now);
  frame(now);
}
let visibilityDue = true, mapped = 0;
function frame(now) {
  stepStory(now);
  stepGlide(now);
  stepMotion(now); levelSounds();
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
  if (flight) invalidate();
  /* the label visibility map is redrawn once the picture has been still for a moment */
  if (!needsRender && visibilityDue && now - lastChange > 120 && body) { visibilityDue = false; refreshVisibility(); updateLabels(stage.clientWidth, stage.clientHeight); }
  /* a moving close-up is never still: there it is redrawn once the view itself has settled, and not again until the
     view changes, so the labels hold their places while the parts move under them */
  if (needsRender && body && moving() && lastChange > mapped && now - lastChange > 120) { mapped = now; refreshVisibility(); }
  if (!needsRender) return;
  needsRender = false; visibilityDue = true;
  renderCount++;
  renderer.render(scene, camera);
  if (body) updateLabels(stage.clientWidth, stage.clientHeight);
}

/* Test and debugging hook: read-only views of the model plus the same actions the UI uses. */
window.bodyModel = {
  state, camera, controls, setView, setRegion, setPeel, spots: () => spotEls.filter(spot => !spot.el.hidden).map(spot => spot.id), freeRect, switchSex, selectEntry, selectPart, stepPart, startStory, exitStory, goHome, frame, pick,
  holdMotion: phase => { motion.held = phase; },
  motion: () => ({ moving: moving() && motion.for === motionKey(), phase: motion.phase, caption: motion.caption, open: motion.open.amount, drops: motion.rig && moving() ? motion.rig.streams.reduce((sum, stream) => sum + stream.drops.length, 0) : 0 }),
  moveOf: index => Array.from(stateTexture.moves.image.data.slice(index * 16, index * 16 + 16)),
  models: () => (motion.rig && moving() ? motion.rig.models.map(model => ({ name: model.name, shown: model.mesh.visible, solid: model.mesh.material.opacity, ...model.state })) : []),
  motions: () => Object.keys(MOTIONS),
  sound: () => ({ on: sound.on, key: sound.key, clip: sound.clip, speaking: sound.speaking, voicePaused: sound.voice.paused, music: sound.music.src.split('/').pop(), musicPlaying: !sound.music.paused, musicLevel: sound.music.volume }),
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
buildTags(); buildSpots(); buildHeightRuler();
Object.assign(state.layers, VIEW_INFO[state.view].layers); state.body = VIEW_INFO[state.view].body;
/* ?closeup=<id> opens on a close-up, when this body has it */
{ const wanted = params.get('closeup'); if (wanted && REGIONS[wanted] && (!REGIONS[wanted].sex || REGIONS[wanted].sex === state.sex)) applyRegion(wanted); }
renderSheet(); syncUI();
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
/* the columns have their sizes only once the page is laid out: fit the view to the space they leave, unless the visitor has already moved it */
requestAnimationFrame(() => { if (state.touched) return; const frame = viewFrame(); camera.position.copy(frame.position); controls.target.copy(frame.target); invalidate(); });
document.documentElement.dataset.modelReady = 'true';
