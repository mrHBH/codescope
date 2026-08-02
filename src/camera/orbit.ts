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
// ── Cursor-anchored rotation state (see rotDown / applyRot). ──────────────────
// We rotate the whole rig rigidly about the ground point P under the cursor, but
// we reconstruct each frame's pose from the PRESS-TIME base pose + an *eased*
// cumulative angle (so it's damped like the old right-drag, not snappy). The new
// offset direction is built from spherical coords exactly as camera-controls would
// (same theta/phi sign + speed), so direction and sensitivity match the old
// right-drag 1:1 — only the pivot differs (P instead of the target).
const _YAXIS = new THREE.Vector3(0, 1, 0);
const _rotP = new THREE.Vector3();        // ground pivot (world)
const _rotC0 = new THREE.Vector3();       // base camera position at press
const _rotT0 = new THREE.Vector3();       // base target at press
const _rotQ0 = new THREE.Quaternion();    // base camera orientation at press
const _rotSph0 = new THREE.Spherical();   // base offset (camera−target) spherical
const _rotSphS = new THREE.Spherical();   // scratch spherical (base + eased Δ)
const _rotO1 = new THREE.Vector3();       // rotated offset about T0
const _rotC1 = new THREE.Vector3();       // scratch: orbit cam, then rigid cam
const _rotT1 = new THREE.Vector3();       // scratch: rigid target
const _rotQ1 = new THREE.Quaternion();    // orientation of orbit-about-T0 pose
const _rotQt = new THREE.Quaternion();    // scratch (q0⁻¹)
const _rotR = new THREE.Quaternion();     // rigid rotation = q1·q0⁻¹
const _rotLook = new THREE.Matrix4();     // lookAt scratch
const _rotRight = new THREE.Vector3();    // camera right (world) — truck fold
const _rotUp = new THREE.Vector3();       // camera up (world) — truck fold
let _rotThetaD = 0, _rotPhiD = 0;         // desired cumulative angles (rad)
let _rotThetaC = 0, _rotPhiC = 0;         // eased current cumulative angles (rad)
const ROT_TAU = 0.14;                     // damping time constant (s) — soft glide, matches TRUCK_SMOOTH_TAU
let _domEl: HTMLElement | null = null;
let _rotBound = false;
let _rotActive = false;   // right button currently held for rotation
let _rotSettle = false;   // released but still easing toward desired
let _rotCssH = 1, _rotLX = 0, _rotLY = 0;
const ROT_CLAMP_EPS = 0.0015;             // gimbal guard (matches enterOrbit)

export function initOrbit(dom: HTMLElement) {
  camera = new THREE.PerspectiveCamera(50, 1, 1, 1e7);
  controls = new CameraControls(camera, dom);
  _domEl = dom;
  // Mouse map: left is NONE so the app layer owns it (per-surface rule: text
  // cursor shown → drag selects, otherwise → drag pans via orbitTruck; clicks
  // still pick on release), middle scrolls (truck), wheel dollies toward the
  // cursor. Right-drag rotation is OWNED here (rotDown/rotMove/rotUp below) so it
  // pivots about the ground point under the cursor instead of the orbit target —
  // the library's target-based rotate is disabled (NONE). Holding right swaps
  // middle to zoom — see setOrbitPanChord().
  controls.mouseButtons.left = CameraControls.ACTION.NONE;
  controls.mouseButtons.right = CameraControls.ACTION.NONE;
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
  if (!_rotBound) {
    _rotBound = true;
    dom.addEventListener('pointerdown', rotDown);
    dom.addEventListener('pointermove', rotMove);
    dom.addEventListener('pointerup', rotUp);
    dom.addEventListener('pointercancel', rotUp);
    dom.addEventListener('lostpointercapture', () => { _rotActive = false; });
  }
}

export function isReady() { return ready; }
export function isEnabled() { return ready && controls.enabled; }
export function setOrbitEnabled(enabled: boolean) { if (ready) controls.enabled = enabled; }

// The 3D zoom (world px → device px): the on-screen scale of the grounded document
// at the viewport centre. This is the perspective scale at the point where the
// centre view-ray intersects the ground plane (world y = 0):
//   t = -camera.y / viewDir.y
// Using the ray-ground distance (rather than controls.distance or camera.height)
// fixes two decoupling bugs:
//  1. Target float: screen-space truck / cursor-dolly moves the orbit target along
//     the camera up/right which has a vertical component when tilted, floating the
//     target off the floor. controls.distance (camera→target) then collapses toward
//     zero while the ground is still far → reported millions for a zoomed-out view.
//  2. Tilt inflation: camera.position.y = dist·cos(polar) shrinks with tilt, so a
//     pure tilt (no zoom) inflated the pill toward the display cap.
// The ray-ground distance equals controls.distance when the target is on the floor
// (the common case), equals camera.height at top-down (polar=0), and stays bounded
// and correct under any combination of tilt + target drift. When the view ray is
// parallel to or above the ground (polar ≈ π/2) the ground at screen-centre is at
// infinity; we fall back to the slant range so the pill stays finite.
const _viewDir = new THREE.Vector3();
// Centre-ray ground distance: where the viewport-centre ray hits the floor (world
// y=0). Shared by the zoom pill, pan sensitivity and fly-zoom so all three stay
// locked to the *visible* ground scale (not the slant range to a possibly-floated
// target). Falls back to the slant range at the horizon.
function groundCenterDist(): number {
  camera.getWorldDirection(_viewDir);
  const dy = _viewDir.y;
  return dy < -1e-4 ? -camera.position.y / dy : controls.distance;
}
export function orbitScale(viewHpx: number): number {
  return viewHpx / (2 * Math.max(groundCenterDist(), 1e-4) * Math.tan((camera.fov * DEG2RAD) / 2));
}

// Perspective scale (device-px per world-px) of a ground point at doc (dx,dy): the
// on-screen size a grid cell there actually has. Uses the radial camera→point
// distance in the same frustum formula as orbitScale. Lets each board's grid adapt
// to its own apparent size instead of every grid marching to the centre zoom.
const _gpWorld = new THREE.Vector3();
export function orbitScaleAtDoc(dx: number, dy: number, viewHpx: number): number {
  const [wx, , wz] = transformPoint(GROUND_MODEL, dx, dy, 0);
  _gpWorld.set(wx, 0, wz);
  const d = Math.max(camera.position.distanceTo(_gpWorld), 1e-4);
  return viewHpx / (2 * d * Math.tan((camera.fov * DEG2RAD) / 2));
}

function fromTHREE(m: THREE.Matrix4): Mat4 {
  _m.set(m.elements);
  return _m;
}

// This frame's view-projection = proj · view · groundModel.
let _lastAspectW = 0, _lastAspectH = 0;
export function orbitViewProj(Cw: number, Ch: number): Mat4 {
  if (Cw !== _lastAspectW || Ch !== _lastAspectH) {
    camera.aspect = Cw / Ch;
    camera.updateProjectionMatrix();
    _lastAspectW = Cw; _lastAspectH = Ch;
  }
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
  // Cursor-anchored rotation owns the rig while active or settling (it rewrites the
  // pose from the press-time base each frame), so pause the pan/fly chases then —
  // they'd otherwise fight the setLookAt and the cursor pin would jump.
  const rotBusy = _rotActive || _rotSettle;
  let rotMoving = false;
  if (!inTransition && rotBusy) rotMoving = rotTick(dtMs);
  // Ease out any pending drag-pan (see orbitTruck) via instant micro-trucks —
  // per-frame exponential steps read as one smooth damped motion. Paused only
  // during setLookAt transitions (the snaps can't stomp them). During rotation we
  // fold the truck translation into the rotation base + pivot (same invariant as
  // fly-forward: translating {C0,T0,P} together preserves the rigid rotation about
  // P), so left-drag pan is never blocked by rotation settle — the old !rotBusy
  // guard caused pan to accumulate during settle then dump all at once (the lag).
  if (!inTransition && (panPX !== 0 || panPY !== 0)) {
    const k = 1 - Math.exp(-(dtMs / 1000) / TRUCK_SMOOTH_TAU);
    const ax = panPX * k, ay = panPY * k;
    panPX -= ax; panPY -= ay;
    if (Math.abs(panPX) < 1e-6) panPX = 0;
    if (Math.abs(panPY) < 1e-6) panPY = 0;
    if (rotBusy) {
      _rotRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      _rotUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const tx = _rotRight.x * ax - _rotUp.x * ay;
      const ty = _rotRight.y * ax - _rotUp.y * ay;
      const tz = _rotRight.z * ax - _rotUp.z * ay;
      _rotC0.x += tx; _rotC0.y += ty; _rotC0.z += tz;
      _rotT0.x += tx; _rotT0.y += ty; _rotT0.z += tz;
      _rotP.x += tx; _rotP.y += ty; _rotP.z += tz;
      const t = controls.getTarget(_ro);
      const c = camera.position;
      controls.setLookAt(c.x + tx, c.y + ty, c.z + tz, t.x + tx, t.y + ty, t.z + tz, false);
      camera.position.set(c.x + tx, c.y + ty, c.z + tz);
    } else {
      controls.truck(ax, ay, false);
    }
  }
  // Fly-forward (right+wheel / ctrl+wheel zoom) drains EVERY frame — including
  // while the right button is held for rotation. Blocking it during rotBusy was
  // the bug: rotDown fires on the right *press*, so a pure right+wheel zoom (no
  // drag) held rotBusy the whole gesture, flyFwd accumulated, then dumped after
  // release as a laggy burst. Draining continuously keeps it smooth + instant with
  // no post-gesture tail. While rotating we can't use controls.moveTo (rotTick's
  // setLookAt would clobber it), so we fold the translation into the rotation base
  // pose AND the pivot P by the same vector v: a rigid rotation about P is invariant
  // under translating {C0,T0,P} together, so the cursor pin at P holds exactly and
  // the fly + rotation compose cleanly. The ground clamp reads the post-rotation
  // camera height (the live altitude), so it's correct under any tilt.
  if (!inTransition && flyFwd !== 0) {
    const k = 1 - Math.exp(-(dtMs / 1000) / TRUCK_SMOOTH_TAU);
    let step = flyFwd * k;
    flyFwd -= step;
    if (Math.abs(flyFwd) < 1e-6) flyFwd = 0;
    camera.getWorldDirection(_viewDir);
    if (_viewDir.y < -1e-6) {
      const maxStep = (camera.position.y - 0.01) / (-_viewDir.y);
      if (step > maxStep) { step = Math.max(maxStep, 0); flyFwd = 0; }
    }
    if (step !== 0) {
      const vx = _viewDir.x * step, vy = _viewDir.y * step, vz = _viewDir.z * step;
      if (rotBusy) {
        _rotC0.x += vx; _rotC0.y += vy; _rotC0.z += vz;
        _rotT0.x += vx; _rotT0.y += vy; _rotT0.z += vz;
        _rotP.x += vx; _rotP.y += vy; _rotP.z += vz;
        const t = controls.getTarget(_ro);
        const c = camera.position;
        controls.setLookAt(c.x + vx, c.y + vy, c.z + vz, t.x + vx, t.y + vy, t.z + vz, false);
        camera.position.set(c.x + vx, c.y + vy, c.z + vz);
      } else {
        const t = controls.getTarget(_ro);
        controls.moveTo(t.x + vx, t.y + vy, t.z + vz, false);
      }
    }
  }
  const moving = controls.update(dtMs / 1000 / 2.2);
  if (inTransition && !moving) inTransition = false;
  return moving || rotMoving;
}

// Enter from the current 2D framing: place the camera straight above the ground
// target so the top-down view is pixel-identical to the 2D view (seamless). The
// target is the doc point (docX, docY) transformed into world space by the
// ground model; a tiny polar offset avoids the exact top-down gimbal.
export function enterOrbit(docX: number, docY: number, viewZ: number, viewHpx: number) {
  const dist = viewHpx / (2 * viewZ * Math.tan((camera.fov * DEG2RAD) / 2));
  const [wx, wy, wz] = transformPoint(GROUND_MODEL, docX, docY, 0);
  panPX = 0; panPY = 0; flyFwd = 0;
  inTransition = false;
  controls.enabled = true;
  const eps = 0.0015; // ~0.09°, visually flat but not degenerate; +Z lean = azimuth 0
  controls.setLookAt(wx, wy + dist * Math.cos(eps), wz + dist * Math.sin(eps), wx, wy, wz, false);
}

// Smoothly ease back toward top-down (north-up). Animates BOTH axes simultaneously:
// polar→0 (tilt) AND azimuth→0 (rotation), so the handoff to 2D (which is always
// azimuth=0) has no rotation snap. normalizeRotations ensures the azimuth ease
// takes the short way around.
export function flattenOrbit(): boolean {
  controls.normalizeRotations();
  controls.rotateTo(0, 0, true);
  return true;
}

// Ease the polar angle to `polar` with the library's smooth transition (no snap).
// Generalizes the 🗻 ctx.tilt(polar) pattern to any board (task 2.4): the camera
// glides between top-down (2D) and a tilted orbit, so 2D↔3D is one continuous
// motion. Azimuth is held; only the tilt changes.
export function tiltOrbit(polar: number, animate = true) {
  if (ready) controls.rotateTo(controls.azimuthAngle, polar, animate);
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

// The CAMERA's ground-plane position in doc-local (2D) coordinates (NOT the
// target — the camera hangs above the ground and its vertical projection differs
// from the target whenever the orbit is tilted). Feeds the 3D frustum culling
// guard: a ground rect that CONTAINS the camera is always visible (the camera
// sits inside it), even when all four of its corners project behind the near
// plane — the false-cull that made deep-zoom boards/lines vanish.
export function orbitCameraLocal(): { x: number; y: number } {
  const pos = camera.getWorldPosition(new THREE.Vector3());
  const [lx, ly] = transformPoint(GROUND_INV, pos.x, pos.y, pos.z);
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
// Accumulated fly-forward distance (world units, positive = along view dir).
// Eased out each frame in updateOrbit, same pattern as panPX/panPY.
let flyFwd = 0;
export function orbitTruck(dxPx: number, dyPx: number, viewHpx: number) {
  if (!ready) return;
  // Screen-locked pan: 1 device-px drag = 1 device-px of ground motion at the
  // *visible* centre scale. Using the centre-ray ground distance (not the slant
  // range to a possibly-floated target) keeps the pan speed matched to the zoom
  // pill at every tilt/zoom, so it never feels too fast or too slow.
  const wpp = (2 * Math.max(groundCenterDist(), 1e-4) * Math.tan((camera.fov * DEG2RAD) / 2)) / viewHpx;
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
  panPX = 0; panPY = 0; flyFwd = 0;
  inTransition = animate;
  const eps = 0.0015; // same top-down gimbal avoidance as enterOrbit
  controls.setLookAt(cx, cy + dist * Math.cos(eps), cz + dist * Math.sin(eps), cx, cy, cz, animate);
}

// Frame a doc-space rect while KEEPING the current tilt + azimuth (unlike
// orbitZoomToRect, which flattens to top-down). Computes the same fit distance
// the 2D frameRect uses (the +240 / 0.9 margin) so a board button frames a board
// identically in 2D and 3D, then glides target + distance along the current view
// direction so the orientation is preserved. Fixes the 3D toolbar buttons doing
// nothing (they only set 2D targets, which the 3D sync overwrites every frame).
export function orbitFrameRect(x0: number, y0: number, x1: number, y1: number, Cw: number, Ch: number, animate = true) {
  if (!ready) return;
  const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
  const [cx, , cz] = transformPoint(GROUND_MODEL, (x0 + x1) / 2, (y0 + y1) / 2, 0);
  const z = Math.min((Cw / (w + 240)) * 0.9, (Ch / (h + 240)) * 0.9);
  const dist = Ch / (2 * z * Math.tan((camera.fov * DEG2RAD) / 2));
  const t = controls.getTarget(_ro);
  const d = _rd.copy(camera.position).sub(t).normalize();
  const ex = cx + d.x * dist, ey = d.y * dist, ez = cz + d.z * dist;
  panPX = 0; panPY = 0; flyFwd = 0;
  inTransition = animate;
  controls.setLookAt(ex, ey, ez, cx, 0, cz, animate);
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

// Fly-forward zoom for 3D mode (right+wheel / ctrl+wheel): translates both camera
// and orbit target along the view direction, so the camera always moves toward the
// ground regardless of tilt angle. Unlike the library's dollyToCursor (which drifts
// the target off the ground plane at low tilt, capping the effective zoom), this
// preserves orbit angles and distance while reducing the camera altitude — the zoom
// pill tracks ground proximity and never caps prematurely. The step is proportional
// to the centre-ray ground distance for log-space-consistent sensitivity (same feel
// as 2D wheel zoom). Eased out in updateOrbit via the flyFwd accumulator.
export function orbitFlyForward(deltaY: number) {
  if (!ready) return;
  // Log-space zoom locked to the *visible* ground scale: each notch multiplies the
  // centre-ray ground distance t by m = exp(deltaY·k) (scroll-up deltaY<0 → m<1 →
  // zoom in), exactly mirroring the 2D wheel (camZ *= exp(-deltaY·k), and zoom ∝ 1/t).
  // Moving the rig along +viewDir by s reduces t by exactly s (t' = t − s), so the
  // translation that realises the factor is s = t·(1 − m). The old formula
  // t·(exp(−deltaY·k) − 1) = t·(1 − m)/m over-moved on zoom-in by 1/m and under-moved
  // on zoom-out — an asymmetry that read as "zooms way too fast", especially with
  // large trackpad-pinch deltas. This form is symmetric in log-space at every tilt.
  const t = Math.max(groundCenterDist(), 1e-4);
  flyFwd += t * (1 - Math.exp(deltaY * 0.0022));
}

// ── Cursor-anchored rotation (right-drag) ────────────────────────────────────
// The library's rotate pivots about the orbit target, so a feature under the
// cursor swings away while some other point stays fixed. Instead we own right-drag
// and rotate the whole rig rigidly about the ground point P under the cursor at
// press time. A rigid rotation about P keeps P at the exact same pixel (its
// camera-space coordinate is invariant), so the thing under the finger stays
// pinned and everything spins around it.
//
// Damping: the desired cumulative angles (_rotThetaD/_rotPhiD) accumulate from
// pointer deltas; each frame rotTick eases the current angles toward them with an
// exponential (ROT_TAU), reconstructs the pose from the press-time base, and pushes
// it via setLookAt(false). This gives the same soft glide as the old right-drag
// (which used the library's damped rotate) instead of a snappy 1:1 jump.
//
// Direction: the signs are negated relative to the library's _rotateInternal so the
// visual spin matches — the library orbits the camera around a fixed target (drag
// right → camera moves left → scene appears right), whereas a rigid rotation about
// P moves the camera in the same direction as the drag, so without negation the
// scene would appear to go the wrong way.
function applyRot() {
  const r = _rotSph0.radius;
  if (r < 1e-9) return;
  // Orbit-about-T0 pose at the eased angles: offset = base spherical + Δ, camera =
  // T0 + offset, orientation = lookAt(cam, T0). This is exactly the rotation R the
  // library would have applied about T0 (same θ/φ sign + speed), which we then
  // re-pivot about P.
  _rotSphS.copy(_rotSph0);
  _rotSphS.theta += _rotThetaC;
  _rotSphS.phi = THREE.MathUtils.clamp(_rotSphS.phi + _rotPhiC, ROT_CLAMP_EPS, Math.PI / 2 - ROT_CLAMP_EPS);
  _rotO1.setFromSpherical(_rotSphS);
  _rotC1.copy(_rotT0).add(_rotO1);
  _rotLook.lookAt(_rotC1, _rotT0, _YAXIS);
  _rotQ1.setFromRotationMatrix(_rotLook);
  _rotQt.copy(_rotQ0).invert();
  _rotR.copy(_rotQ1).multiply(_rotQt); // rigid rotation = q1·q0⁻¹
  // Re-pivot the whole rig about P: cam' = P + R·(C0−P), tgt' = P + R·(T0−P). The
  // orientation is R·Q0 = Q1, so the cursor pin at P holds exactly (P's camera-space
  // coord is invariant under a rigid rotation about P).
  _rotC1.copy(_rotC0).sub(_rotP).applyQuaternion(_rotR).add(_rotP);
  _rotT1.copy(_rotT0).sub(_rotP).applyQuaternion(_rotR).add(_rotP);
  controls.setLookAt(_rotC1.x, _rotC1.y, _rotC1.z, _rotT1.x, _rotT1.y, _rotT1.z, false);
  camera.position.copy(_rotC1);
  camera.quaternion.copy(_rotQ1);
}

function rotTick(dtMs: number): boolean {
  const k = 1 - Math.exp(-(dtMs / 1000) / ROT_TAU);
  _rotThetaC += (_rotThetaD - _rotThetaC) * k;
  _rotPhiC += (_rotPhiD - _rotPhiC) * k;
  applyRot();
  if (!_rotActive && Math.abs(_rotThetaD - _rotThetaC) < 1e-5 && Math.abs(_rotPhiD - _rotPhiC) < 1e-5) {
    _rotThetaC = _rotThetaD; _rotPhiC = _rotPhiD;
    _rotSettle = false;
    return false;
  }
  return true;
}

function rotDown(e: PointerEvent) {
  if (e.button !== 2 || !ready || !controls.enabled || inTransition || !_domEl) return;
  const rect = _domEl.getBoundingClientRect();
  const cv = _domEl as HTMLCanvasElement;
  const w = cv.width || 1, h = cv.height || 1;
  const sx = (e.clientX - rect.left) * (w / (rect.width || 1));
  const sy = (e.clientY - rect.top) * (h / (rect.height || 1));
  const d = screenToDocLocal(sx, sy, w, h);
  _rotP.set(d.x, 0, d.y);
  _rotC0.copy(camera.position);
  controls.getTarget(_rotT0);
  _rotQ0.copy(camera.quaternion);
  _rotSph0.setFromVector3(_rotO1.copy(_rotC0).sub(_rotT0));
  _rotThetaD = 0; _rotPhiD = 0;
  _rotThetaC = 0; _rotPhiC = 0;
  _rotCssH = rect.height || 1;
  _rotLX = e.clientX; _rotLY = e.clientY;
  _rotActive = true; _rotSettle = false;
  try { _domEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
}

function rotMove(e: PointerEvent) {
  if (!_rotActive) return;
  const dx = e.clientX - _rotLX, dy = e.clientY - _rotLY;
  _rotLX = e.clientX; _rotLY = e.clientY;
  // Negated vs the library's _rotateInternal: a rigid rotation about P moves the
  // camera the same way as the drag, whereas the library's target-orbit moves it
  // the opposite way for the same on-screen spin — so without the sign flip the
  // scene appears to go backwards. Magnitude matches the library (2π per height).
  _rotThetaD -= (Math.PI * 2) * dx / _rotCssH;
  _rotPhiD -= (Math.PI * 2) * dy / _rotCssH;
}

function rotUp(e: PointerEvent) {
  if (e.button !== 2 || !_rotActive || !_domEl) return;
  _rotActive = false;
  _rotSettle = true;
  try { _domEl.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
}
