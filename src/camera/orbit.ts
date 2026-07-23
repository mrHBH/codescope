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
const _vp = new Float32Array(16); // last view-projection
const _ro = new THREE.Vector3();
const _rd = new THREE.Vector3();

export function initOrbit(dom: HTMLElement) {
  camera = new THREE.PerspectiveCamera(50, 1, 1, 1e7);
  controls = new CameraControls(camera, dom);
  // yasmineOS mouse map: left = truck/pan, right = rotate/orbit, wheel = dolly.
  controls.mouseButtons.left = CameraControls.ACTION.TRUCK;
  controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
  controls.mouseButtons.middle = CameraControls.ACTION.NONE;
  controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
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
  const proj = new Float32Array(fromTHREE(camera.projectionMatrix));
  const view = fromTHREE(camera.matrixWorldInverse);
  const vp = mul(mul(proj, view), GROUND_MODEL);
  _vp.set(vp);
  return vp;
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

// Advance damping; returns true while still animating.
export function updateOrbit(dtMs: number): boolean {
  return controls.update(dtMs / 1000);
}

// Enter from the current 2D framing: place the camera straight above the ground
// target so the top-down view is pixel-identical to the 2D view (seamless). The
// target is the doc point (docX, docY) transformed into world space by the
// ground model; a tiny polar offset avoids the exact top-down gimbal.
export function enterOrbit(docX: number, docY: number, viewZ: number, viewHpx: number) {
  const dist = viewHpx / (2 * viewZ * Math.tan((camera.fov * DEG2RAD) / 2));
  const [wx, wy, wz] = transformPoint(GROUND_MODEL, docX, docY, 0);
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
const WHEEL_DOLLY_K = 0.005;
export function orbitDollyByWheel(deltaY: number) {
  if (!ready) return;
  controls.dollyTo(controls.distance * Math.exp(deltaY * WHEEL_DOLLY_K), true);
}
