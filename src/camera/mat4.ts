// ── mat4 ─────────────────────────────────────────────────────────────────────
// Minimal, dependency-free 4×4 matrix + vec3 helpers for the 3D camera path.
// Column-major storage (WebGPU/WGSL `mat4x4<f32>` reads a Float32Array of 16 as
// four consecutive columns), so a Mat4 uploads directly as a uniform.
//
// Convention: mul(a, b) returns a·b (b applied first, then a — the usual
// "viewProj = proj · view" reading). transformPoint applies the perspective
// divide. Kept intentionally small; extended only as the phases need it.

export type Mat4 = Float32Array; // length 16, column-major
export type Vec3 = [number, number, number];

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function clone(a: Mat4): Mat4 {
  return new Float32Array(a);
}

// out = a · b (column-major). `out` may alias neither a nor b safely via a temp.
export function mul(a: Mat4, b: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

// The exact orthographic view-projection that reproduces the legacy 2D camera:
//   devicePx = worldPx·(sx, sy) + (tx, ty);  ndc = devicePx/res·2 − 1;  clip.y flips.
// Maps a world-plane point (wx, wy, 0, 1) straight to the same clip coords the
// old vertex stage produced — the Phase-1 regression gate depends on this being
// bit-for-bit identical.
export function orthoWorld2D(sx: number, sy: number, tx: number, ty: number, resW: number, resH: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = (2 * sx) / resW;
  m[5] = -(2 * sy) / resH;
  m[10] = 0;
  m[12] = (2 * tx) / resW - 1;
  m[13] = 1 - (2 * ty) / resH;
  m[15] = 1;
  return m;
}

// Right-handed perspective, WebGPU depth range z ∈ [0, 1]. (No depth buffer yet,
// so only x/y/w matter today; the z rows keep it correct for when one is added.)
export function perspective(fovYRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovYRad / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (far * near) / (near - far);
  return m;
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function scaling(x: number, y: number, z: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = x; m[5] = y; m[10] = z; m[15] = 1;
  return m;
}

export function rotationX(rad: number): Mat4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m = identity();
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

export function rotationY(rad: number): Mat4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m = identity();
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

export function rotationZ(rad: number): Mat4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m = identity();
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

// Right-handed lookAt (view matrix): world → camera space.
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx;
  m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

// General 4×4 inverse (needed for screen→world ray unprojection in picking).
// Returns identity if the matrix is singular.
export function invert(a: Mat4): Mat4 {
  const m = a;
  const b00 = m[0] * m[5] - m[1] * m[4], b01 = m[0] * m[6] - m[2] * m[4];
  const b02 = m[0] * m[7] - m[3] * m[4], b03 = m[1] * m[6] - m[2] * m[5];
  const b04 = m[1] * m[7] - m[3] * m[5], b05 = m[2] * m[7] - m[3] * m[6];
  const b06 = m[8] * m[13] - m[9] * m[12], b07 = m[8] * m[14] - m[10] * m[12];
  const b08 = m[8] * m[15] - m[11] * m[12], b09 = m[9] * m[14] - m[10] * m[13];
  const b10 = m[9] * m[15] - m[11] * m[13], b11 = m[10] * m[15] - m[11] * m[14];
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity();
  det = 1 / det;
  const o = new Float32Array(16);
  o[0] = (m[5] * b11 - m[6] * b10 + m[7] * b09) * det;
  o[1] = (m[2] * b10 - m[1] * b11 - m[3] * b09) * det;
  o[2] = (m[13] * b05 - m[14] * b04 + m[15] * b03) * det;
  o[3] = (m[10] * b04 - m[9] * b05 - m[11] * b03) * det;
  o[4] = (m[6] * b08 - m[4] * b11 - m[7] * b07) * det;
  o[5] = (m[0] * b11 - m[2] * b08 + m[3] * b07) * det;
  o[6] = (m[14] * b02 - m[12] * b05 - m[15] * b01) * det;
  o[7] = (m[8] * b05 - m[10] * b02 + m[11] * b01) * det;
  o[8] = (m[4] * b10 - m[5] * b08 + m[7] * b06) * det;
  o[9] = (m[1] * b08 - m[0] * b10 - m[3] * b06) * det;
  o[10] = (m[12] * b04 - m[13] * b02 + m[15] * b00) * det;
  o[11] = (m[9] * b02 - m[8] * b04 - m[11] * b00) * det;
  o[12] = (m[5] * b07 - m[4] * b09 - m[6] * b06) * det;
  o[13] = (m[0] * b09 - m[1] * b07 + m[2] * b06) * det;
  o[14] = (m[13] * b01 - m[12] * b03 - m[14] * b00) * det;
  o[15] = (m[8] * b03 - m[9] * b01 + m[10] * b00) * det;
  return o;
}

// Apply a matrix to a point (w = 1) with perspective divide.
export function transformPoint(m: Mat4, x: number, y: number, z: number): Vec3 {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [cx / cw, cy / cw, cz / cw];
}
