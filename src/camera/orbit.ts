// ── 3D orbit (camera-controls) ───────────────────────────────────────────────
// Drives the 3D free camera with the SAME library yasmineOS uses
// (`camera-controls`), so pan/zoom/rotation/damping/direction match 1:1. The
// library moves a THREE PerspectiveCamera in a Y-up world orbiting a ground
// target; we read its view+projection each frame and compose with GROUND_MODEL
// (which lays the document flat on the floor) to feed windfoil's shader.

import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { type Mat4, mul, rotationX, invert, transformPoint } from './mat4';

CameraControls.install({ THREE });

const DEG2RAD = Math.PI / 180;
// doc-local (x, y, 0) → world (x, 0, y): lay the page flat on the ground (XZ).
// With camera-controls' azimuth-0 top-down view (world +X → screen right,
// world +Z → screen down), this makes doc-x read right and doc-y read down —
// identical to the 2D view.
const GROUND_MODEL: Mat4 = rotationX(Math.PI / 2);
const GROUND_INV: Mat4 = invert(GROUND_MODEL);

let camera: THREE.PerspectiveCamera;
let controls: CameraControls;
let ready = false;
const _m = new Float32Array(16);
const _proj = new Float32Array(16);
const _tmp = new Float32Array(16);
const _vp = new Float32Array(16); // last view-projection
const _ro = new THREE.Vector3();
const _rd = new THREE.Vector3();

export function initOrbit(dom: HTMLElement) {
  camera = new THREE.PerspectiveCamera(50, 1, 1, 1e7);
  controls = new CameraControls(camera, dom);
  // Mouse map: left is NONE so the app layer owns it (per-surface rule: text
  // cursor shown → drag selects, otherwise → drag pans via orbitTruck; clicks
  // still pick on release), middle scrolls (truck), right-drag rotates, wheel
  // dollies toward the cursor. Holding right swaps middle to zoom — see
  // setOrbitPanChord().
  controls.mouseButtons.left = CameraControls.ACTION.NONE;
  controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
  controls.mouseButtons.middle = CameraControls.ACTION.TRUCK;
  controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  controls.dollyToCursor = true;
  // Touch: one-finger orbit, two-finger dolly+truck (library defaults are fine).
  // Ground mode: never tilt below the floor. polar 0 = top-down (matches 2D).
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI / 2;
  controls.minDistance = 0.0005;
  controls.maxDistance = 6e5;
  controls.enabled = false;
  ready = true;
}

export function isReady() { return ready; }
export function isEnabled() { return ready && controls.enabled; }
export function setOrbitEnabled(enabled: boolean) { if (ready) controls.enabled = enabled; }

// The distance-based on-axis scale (world px → device px) for the AA-skirt pad.
export function orbitScale(viewHpx: number): number {
  const d = controls.distance;
  return viewHpx / (2 * d * Math.tan((camera.fov * DEG2RAD) / 2));
}

function fromTHREE(m: THREE.Matrix4): Mat4 {
  _m.set(m.elements);
  return _m;
}

// This frame's view-projection = proj · view · groundModel.
export function orbitViewProj(Cw: number, Ch: number): Mat4 {
  camera.aspect = Cw / Ch;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  _proj.set(fromTHREE(camera.projectionMatrix));
  const view = fromTHREE(camera.matrixWorldInverse);
  mul(_proj, view, _tmp);
  mul(_tmp, GROUND_MODEL, _vp);
  return _vp;
}

// Unproject a screen point (device px) to doc-local (x, y) on the ground plane.
// Casts a ray from the camera through the pixel (built from fov + camera basis)
// and intersects the grounded document plane (world y = 0). Deliberately avoids
// inverting the view-projection: with the IDE's extreme near/far that matrix is
// ill-conditioned and a float32 inverse loses precision, mis-aiming every pick.
export function screenToDocLocal(sx: number, sy: number, Cw: number, Ch: number): { x: number; y: number } {
  camera.updateMatrixWorld();
  _ro.setFromMatrixPosition(camera.matrixWorld);
  const t = Math.tan((camera.fov * DEG2RAD) / 2);
  const ndcX = (sx / Cw) * 2 - 1;
  const ndcY = 1 - (sy / Ch) * 2; // screen y is down; clip-space y is up
  _rd.set(ndcX * t * (Cw / Ch), ndcY * t, -1).transformDirection(camera.matrixWorld);
  if (Math.abs(_rd.y) < 1e-12) return { x: _ro.x, y: _ro.z };
  const hit = -_ro.y / _rd.y;
  return { x: _ro.x + _rd.x * hit, y: _ro.z + _rd.z * hit };
}

// Advance damping; returns true while still animating. The dt/2.2 scaling
// matches yasmineOS's CameraManager.update (their per-frame call is
// cameraControls.update(dt / 2.2)): camera-controls drives ALL smoothDamp-based
// motion — rotation damping, dolly easing, and setLookAt transitions like the
// double-click fit — off this delta, so the factor gives zoom/rotation their
// characteristic slower, smoother glide.
export function updateOrbit(dtMs: number): boolean {
  if (!ready) return false;
  // Ease out any pending drag-pan (see orbitTruck) via instant micro-trucks —
  // per-frame exponential steps read as one smooth damped motion. Paused
  // during setLookAt transitions so the snaps can't stomp them.
  if (!inTransition && (panPX !== 0 || panPY !== 0)) {
    const k = 1 - Math.exp(-(dtMs / 1000) / TRUCK_SMOOTH_TAU);
    const ax = panPX * k, ay = panPY * k;
    panPX -= ax; panPY -= ay;
    if (Math.abs(panPX) < 1e-6) panPX = 0;
    if (Math.abs(panPY) < 1e-6) panPY = 0;
    controls.truck(ax, ay, false);
  }
  const moving = controls.update(dtMs / 1000 / 2.2);
  if (inTransition && !moving) inTransition = false;
  return moving;
}

// Enter from the current 2D framing: place the camera straight above the ground
// target so the top-down view is pixel-identical to the 2D view (seamless). The
// target is the doc point (docX, docY) transformed into world space by the
// ground model; a tiny polar offset avoids the exact top-down gimbal.
export function enterOrbit(docX: number, docY: number, viewZ: number, viewHpx: number) {
  const dist = viewHpx / (2 * viewZ * Math.tan((camera.fov * DEG2RAD) / 2));
  const [wx, wy, wz] = transformPoint(GROUND_MODEL, docX, docY, 0);
  panPX = 0; panPY = 0;
  inTransition = false;
  controls.enabled = true;
  const eps = 0.0015; // ~0.09°, visually flat but not degenerate; +Z lean = azimuth 0
  controls.setLookAt(wx, wy + dist * Math.cos(eps), wz + dist * Math.sin(eps), wx, wy, wz, false);
}

// Ease back toward top-down; the caller polls orbitPolar()/orbitTargetLocal()
// to hand control to the 2D path once flattened.
export function flattenOrbit(): boolean {
  controls.rotateTo(controls.azimuthAngle, 0, true); // polar 0 = top-down
  return true;
}

export function orbitPolar() { return ready ? controls.polarAngle : 0; }
export function orbitAzimuth() { return ready ? controls.azimuthAngle : 0; }

// Set absolute orbit angles immediately (used by the scripted demo finale for a
// smooth cinematic spin — the demo computes eased angles itself).
export function orbitSetAngles(azimuth: number, polar: number) {
  if (ready) controls.rotateTo(azimuth, polar, false);
}

// ── Scripted-flight pose control (used by the cinematic demo) ─────────────────
// The demo drives the whole 3D tour by setting an absolute camera pose per frame
// (ground target + distance + angles) with eased values it computes itself.
const DEG = () => (camera.fov * DEG2RAD) / 2;

// Distance that frames a world-height of `viewHpx / zoom` px on-axis (mirrors the
// 2D zoom → 3D distance mapping used on entry).
export function orbitDistForZoom(zoom: number, viewHpx: number): number {
  return viewHpx / (2 * zoom * Math.tan(DEG()));
}
export function orbitZoomForDist(dist: number, viewHpx: number): number {
  return viewHpx / (2 * dist * Math.tan(DEG()));
}

// Set the full pose immediately: ground target (world y = 0), distance, angles.
export function orbitSetPose(tx: number, tz: number, dist: number, az: number, polar: number) {
  if (!ready) return;
  controls.moveTo(tx, 0, tz, false);
  controls.dollyTo(dist, false);
  controls.rotateTo(az, polar, false);
}

// Read the current pose back (for interpolation start points).
export function orbitGetPose(): { tx: number; tz: number; dist: number; az: number; polar: number } {
  const t = controls.getTarget(new THREE.Vector3());
  return { tx: t.x, tz: t.z, dist: controls.distance, az: controls.azimuthAngle, polar: controls.polarAngle };
}

// The orbit target mapped back to doc-local (2D) coordinates, for the 3D→2D handoff.
export function orbitTargetLocal(): { x: number; y: number } {
  const t = controls.getTarget(new THREE.Vector3());
  const [lx, ly] = transformPoint(GROUND_INV, t.x, t.y, t.z);
  return { x: lx, y: ly };
}

export function disableOrbit() { if (ready) controls.enabled = false; }

export function setOrbitWheelDolly(enabled: boolean) {
  if (ready) controls.mouseButtons.wheel = enabled ? CameraControls.ACTION.DOLLY : CameraControls.ACTION.NONE;
}

// Right mouse acts as a zoom modifier chord: while it is held, middle-drag
// zooms (dolly, toward the cursor via dollyToCursor) instead of scrolling.
// Right-drag alone always rotates; left stays app-owned regardless.
export function setOrbitPanChord(on: boolean) {
  if (!ready) return;
  controls.mouseButtons.middle = on ? CameraControls.ACTION.DOLLY : CameraControls.ACTION.TRUCK;
}

// Screen-space left-drag pan for the free camera (device-px deltas → world
// truck; the content follows the cursor, so deltas are negated — truck()
// offsets the target by right·x − up·y). Deltas ACCUMULATE into a pending
// offset that updateOrbit eases out every frame with a tight exponential
// (TRUCK_SMOOTH_TAU): responsive while dragging, a visible glide + soft
// settle on release. External truck(..., true) ran on the long smoothTime
// (sluggish) and truck(..., false) was teleport-instant; owning the chase
// here keeps smoothTime free to tune fit/zoom/rotate independently.
let panPX = 0, panPY = 0;
// True while a setLookAt transition (double-click fit) is easing. The pan
// chase must pause then: its instant micro-trucks snap _target to _targetEnd,
// which would teleport the camera mid-transition (position jumps, only the
// rotation keeps easing). updateOrbit clears it once the controls rest.
let inTransition = false;
const TRUCK_SMOOTH_TAU = 0.14;
export function orbitTruck(dxPx: number, dyPx: number, viewHpx: number) {
  if (!ready) return;
  const wpp = (2 * controls.distance * Math.tan((camera.fov * DEG2RAD) / 2)) / viewHpx;
  panPX -= dxPx * wpp;
  panPY -= dyPx * wpp;
}

// ── Double-click-to-fit ──────────────────────────────────────────────────────
// Recreation of yasmineOS's HybridUIComponent.zoom + zoomTo (called there on
// double-click of a UI component): the ideal distance fits the rect's height
// and width against the vertical/horizontal FOV (their _calculateIdealRadius
// formula, max of both), then the camera glides along the surface normal to
// that distance, gazing at the rect centre — setLookAt(..., true) eases the
// whole move. Their component faced the camera along its own normal; our
// document lies flat on the ground, so the normal is world +Y (top-down fit).
export function orbitZoomToRect(x0: number, y0: number, x1: number, y1: number, Cw: number, Ch: number, padding = 1, animate = true) {
  if (!ready) return;
  const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
  const [cx, cy, cz] = transformPoint(GROUND_MODEL, (x0 + x1) / 2, (y0 + y1) / 2, 0);
  const vFov = camera.fov * DEG2RAD;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (Cw / Ch));
  const dist = Math.max(
    (h * padding) / (2 * Math.tan(vFov / 2)),
    (w * padding) / (2 * Math.tan(hFov / 2)));
  controls.normalizeRotations();
  // The fit is an absolute pose: drop any stale pan glide and mark the
  // transition so the pan chase can't teleport the camera mid-flight.
  panPX = 0; panPY = 0;
  inTransition = animate;
  const eps = 0.0015; // same top-down gimbal avoidance as enterOrbit
  controls.setLookAt(cx, cy + dist * Math.cos(eps), cz + dist * Math.sin(eps), cx, cy, cz, animate);
}

export function orbitDolly(delta: number) {
  if (ready) controls.dolly(delta, false);
}

// Override the perspective near plane (e.g. the IDE drops it to render extreme
// close-ups; the playground restores a larger near for depth precision on its
// true-3D meshes). orbitViewProj re-uploads the projection every frame.
export function setOrbitNear(near: number) {
  if (!ready) return;
  camera.near = near;
  camera.updateProjectionMatrix();
}

// Logarithmic, zoom-level-aware wheel dolly: each wheel delta scales the current
// distance by a constant ratio (distance *= e^(deltaY·k)), so a notch zooms by the
// same *factor* whether you're close or far — constant sensitivity in log-space.
// dollyTo(..., true) clamps to [minDistance, maxDistance] and eases smoothly.
// (Cursor-anchored zooming is done by the library itself via dollyToCursor —
// callers that can, let the library own the wheel instead of using this.)
const WHEEL_DOLLY_K = 0.005;
export function orbitDollyByWheel(deltaY: number) {
  if (!ready) return;
  controls.dollyTo(controls.distance * Math.exp(deltaY * WHEEL_DOLLY_K), true);
}
