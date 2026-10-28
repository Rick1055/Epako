import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

import { PLANT } from "./palette";

// The garden's plants, built in code at high detail. Every piece is smooth-shaded, carries its colours in the
// vertices, and is merged into one mesh per plant so repeats can be instanced.

export type V3 = [number, number, number];
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Deterministic randomness (mulberry32): the garden is the same on every visit, so the stills match it. */
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth, cheap 3D noise in roughly -1..1 (sums of sines; enough for bark, stones and ground). */
export function noise(x: number, y: number, z: number) {
  return (
    Math.sin(x * 1.7 + Math.sin(z * 1.3 + y * 0.7)) * 0.5 +
    Math.sin(y * 2.3 + Math.sin(x * 1.1)) * 0.3 +
    Math.sin(z * 2.9 + x * 0.6 + Math.sin(y * 1.9)) * 0.2
  );
}

const tmp = new Color();
const tmp2 = new Color();

/** Normals from the shaped surface, then one colour per vertex, then non-indexed so any pieces can merge. */
export function finish(g: BufferGeometry, colour: string | ((p: Vector3, i: number, n: Vector3) => Color)) {
  g.computeVertexNormals();
  const pos = g.attributes.position;
  if (!g.attributes.color) {
    const c = new Float32Array(pos.count * 3);
    const p = new Vector3();
    const n = new Vector3();
    const normals = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const col = typeof colour === "string" ? tmp.set(colour) : colour(p.fromBufferAttribute(pos, i), i, n.fromBufferAttribute(normals, i));
      c.set([col.r, col.g, col.b], i * 3);
    }
    g.setAttribute("color", new Float32BufferAttribute(c, 3));
  }
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  return out;
}

export function merge(parts: BufferGeometry[]) {
  const m = mergeGeometries(parts);
  if (!m) throw new Error("garden pieces don't match");
  return m;
}

/** A gradient from a (at y = 0 of the piece's own height range) to b (at the top). */
const gradient = (a: string, b: string, y0: number, y1: number) => (p: Vector3) =>
  tmp.set(a).lerp(tmp2.set(b), Math.min(1, Math.max(0, (p.y - y0) / (y1 - y0))));

/**
 * A petal or leaf blade, grown along +y from the origin: `width` at its widest, `cup` curls it across,
 * `bend` curls it along its length (negative bends back), `point` sharpens the tip. Colour runs base to tip.
 */
export function petal(o: { width: number; length: number; cup?: number; bend?: number; point?: number; base: string; tip: string; edge?: string; segs?: number }) {
  const { width, length, cup = 0.3, bend = 0.2, point = 0.6, base, tip, edge, segs = 8 } = o;
  const g = new PlaneGeometry(1, 1, 4, segs).translate(0, 0.5, 0);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const t = pos.getY(i);
    const profile = Math.sin(Math.PI * Math.min(1, t * (1 + point * 0.4))) ** (0.6 + point * 0.5) * (1 - 0.25 * t);
    const x = u * width * Math.max(profile, 0.02);
    const z = cup * width * (u * 2) ** 2 * 0.5 + bend * length * t * t;
    pos.setXYZ(i, x, t * length, z);
    tmp.set(base).lerp(tmp2.set(tip), t);
    if (edge) tmp.lerp(tmp2.set(edge), Math.abs(u) * 1.2 * t);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  return finish(g, base);
}

/** Rotate then place a piece: tilt away from vertical by `tilt`, turn by `yaw`, move to `at`. */
export function place(g: BufferGeometry, at: V3, yaw = 0, tilt = 0, roll = 0) {
  return g.rotateZ(roll).rotateX(tilt).rotateY(yaw).translate(...at);
}

/** A tube along a curve whose radius tapers from r0 to r1, optionally knobbly (bark). */
export function taperedTube(points: Vector3[], r0: number, r1: number, o: { segs?: number; radial?: number; knobs?: number; colour: string | ((p: Vector3, i: number, n: Vector3) => Color) }) {
  const { segs = 24, radial = 8, knobs = 0 } = o;
  const curve = new CatmullRomCurve3(points);
  const g = new TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position;
  const p = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / (radial + 1));
    const t = ring / segs;
    curve.getPointAt(t, c);
    p.fromBufferAttribute(pos, i).sub(c);
    const r = (r0 + (r1 - r0) * t) * (1 + knobs * noise(p.x * 9 + t * 7, p.y * 9, p.z * 9));
    p.multiplyScalar(r).add(c);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  return finish(g, o.colour);
}

// ---- Flowers -------------------------------------------------------------------------------------------

/** A snowdrop: nodding stem, green ovary, three long white petals and three short green-marked inner ones, two strap leaves. */
export function snowdrop() {
  const top = v(0.012, 0.15, 0);
  const parts = [
    taperedTube([v(0, 0, 0), v(0.002, 0.08, 0), v(0.006, 0.14, 0), top, v(0.024, 0.142, 0)], 0.0022, 0.0016, { segs: 12, radial: 5, colour: PLANT.stem }),
    finish(new SphereGeometry(0.0045, 8, 6).translate(0.026, 0.138, 0), PLANT.stem),
  ];
  const hang = v(0.027, 0.134, 0);
  for (let k = 0; k < 3; k++) {
    const yaw = (k / 3) * Math.PI * 2;
    // Outer petals hang downward (tilt past horizontal) and flare a little.
    parts.push(place(petal({ width: 0.011, length: 0.024, cup: 0.6, bend: -0.12, point: 0.3, base: PLANT.snowdrop, tip: PLANT.snowdrop }), [0, 0, 0], yaw, Math.PI - 0.32).translate(hang.x, hang.y, hang.z));
    parts.push(place(petal({ width: 0.007, length: 0.012, cup: 0.8, bend: 0, point: 0.1, base: PLANT.snowdrop, tip: PLANT.snowdropMark }), [0, 0, 0], yaw + Math.PI / 3, Math.PI - 0.12).translate(hang.x, hang.y, hang.z));
  }
  for (const side of [-1, 1]) {
    parts.push(place(petal({ width: 0.007, length: 0.13, cup: 0.4, bend: 0.25, point: 0.15, base: PLANT.stem, tip: PLANT.strapLeaf, segs: 10 }), [side * 0.004, 0, 0], side * 0.6, side * 0.18));
  }
  return merge(parts);
}

/** A hellebore clump: a mound of leathery palmate leaves, with nodding cupped flowers held above on curved stems. */
export function hellebore(base: string, tip: string) {
  const rnd = seeded(base.charCodeAt(1) * 31 + 7);
  const parts: BufferGeometry[] = [];
  // Seven leaves arching out from the crown, each a stalk ending in a fan of seven pointed leaflets.
  for (let i = 0; i < 7; i++) {
    const yaw = (i / 7) * Math.PI * 2 + rnd() * 0.5;
    const len = 0.09 + rnd() * 0.05;
    const end = v(Math.sin(yaw) * len, 0.1 + rnd() * 0.05, Math.cos(yaw) * len);
    parts.push(taperedTube([v(0, 0, 0), v(end.x * 0.35, end.y * 0.95, end.z * 0.35), end], 0.0032, 0.0022, { segs: 8, radial: 5, colour: PLANT.stem }));
    for (let k = 0; k < 7; k++) {
      const leaflet = petal({ width: 0.024, length: 0.088 - Math.abs(k - 3) * 0.01, cup: 0.35, bend: 0.28, point: 0.9, base: PLANT.camelliaLeaf, tip: PLANT.cyclamenLeaf, segs: 8 });
      parts.push(place(leaflet, [0, 0, 0], yaw + (k - 3) * 0.36, 1.45 + rnd() * 0.25).translate(end.x, end.y, end.z));
    }
  }
  // Four flowers above the leaves, each facing outward and nodding down, as hellebores do.
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * Math.PI * 2 + rnd() * 0.8;
    const out = 0.05 + rnd() * 0.04;
    const head = v(Math.sin(yaw) * out, 0.2 + rnd() * 0.08, Math.cos(yaw) * out);
    parts.push(taperedTube([v(0, 0, 0), v(head.x * 0.2, head.y * 0.6, head.z * 0.2), v(head.x * 0.8, head.y * 0.98, head.z * 0.8), head], 0.0035, 0.0026, { segs: 12, radial: 5, colour: PLANT.stem }));
    const flower: BufferGeometry[] = [];
    // Five broad, rounded, overlapping sepals make a shallow bowl around the flower's axis (+y).
    for (let k = 0; k < 5; k++) {
      flower.push(place(petal({ width: 0.046, length: 0.036, cup: 0.55, bend: 0.12, point: 0.05, base, tip, segs: 10 }), [0, 0, 0], (k / 5) * Math.PI * 2 + rnd() * 0.15, 0.8));
    }
    // A ring of green nectaries, then a dense boss of stamens with pale anthers.
    for (let k = 0; k < 10; k++) {
      flower.push(finish(new ConeGeometry(0.0022, 0.007, 5).translate(0, 0.0045, 0).rotateX(0.55).rotateY((k / 10) * Math.PI * 2), PLANT.snowdropMark));
    }
    for (let k = 0; k < 28; k++) {
      const a = k * 2.4;
      const lean = 0.15 + (k % 4) * 0.12;
      const s = 0.011 + (k % 3) * 0.002;
      flower.push(finish(new CylinderGeometry(0.0006, 0.0006, s, 3).translate(0, s / 2, 0).rotateX(lean).rotateY(a), PLANT.stamen));
      flower.push(finish(new SphereGeometry(0.0013, 4, 3).translate(0, s, 0).rotateX(lean).rotateY(a), PLANT.helleboreCream));
    }
    flower.push(finish(new SphereGeometry(0.0045, 8, 6), PLANT.stem));
    const face = new Matrix4().makeRotationX(1.95 + rnd() * 0.3).premultiply(new Matrix4().makeRotationY(yaw)).premultiply(new Matrix4().makeTranslation(head.x, head.y, head.z));
    parts.push(...flower.map((g) => g.applyMatrix4(face)));
  }
  return merge(parts);
}

/** Cyclamen: a low mat of silver-marked heart-shaped leaves, and flowers whose petals sweep up and back from a nodding mouth. */
export function cyclamen() {
  const rnd = seeded(23);
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const yaw = k * 0.9 + rnd() * 0.4;
    const r = 0.012 + rnd() * 0.02;
    parts.push(place(petal({ width: 0.05, length: 0.045, cup: 0.15, bend: 0.05, point: 0.25, base: PLANT.cyclamenLeaf, tip: PLANT.cyclamenLeaf, edge: PLANT.cyclamenLeafSilver }), [Math.sin(yaw) * r, 0.01 + rnd() * 0.012, Math.cos(yaw) * r], yaw, 1.3 + rnd() * 0.15));
  }
  // Three flowers of different heights, each on a stem that hooks over at the top.
  for (let i = 0; i < 3; i++) {
    const yaw = (i / 3) * Math.PI * 2 + rnd();
    const h = 0.085 + rnd() * 0.045;
    const d = v(Math.sin(yaw), 0, Math.cos(yaw));
    const mouth = v(d.x * 0.03, h - 0.006, d.z * 0.03);
    parts.push(taperedTube([v(0, 0, 0), v(d.x * 0.01, h * 0.65, d.z * 0.01), v(d.x * 0.022, h, d.z * 0.022), mouth], 0.002, 0.0016, { segs: 10, radial: 5, colour: PLANT.cyclamenBase }));
    for (let k = 0; k < 5; k++) {
      parts.push(place(petal({ width: 0.012, length: 0.032, cup: 0.3, bend: -0.2, point: 0.4, base: PLANT.cyclamenBase, tip: PLANT.cyclamen }), [0, 0, 0], (k / 5) * Math.PI * 2, 0.3 + rnd() * 0.15, (rnd() - 0.5) * 0.4).translate(mouth.x, mouth.y, mouth.z));
    }
  }
  return merge(parts);
}

/** A grass blade with a frosted tip, about 1 unit tall (instances scale it). Bottom is y = 0 for the wind shader. */
export function grassBlade() {
  const g = new PlaneGeometry(1, 1, 1, 2).translate(0, 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i);
    pos.setXYZ(i, pos.getX(i) * 0.045 * (1 - t * 0.92), t, 0.18 * t * t);
  }
  // Dark at the root, fresh green toward the tip, a touch of frost only at the very tip.
  return finish(g, (p) => tmp.set(PLANT.grassDark).lerp(tmp2.set(PLANT.grassLight), Math.pow(p.y, 0.8)).lerp(tmp2.set(PLANT.frost), Math.max(0, p.y - 0.9) * 2));
}

/**
 * A tuft of meadow grass: seven blades fanned out from one root, about 0.35 m across and a unit tall. Far cheaper
 * to draw out on the open lawns than the same number of single blades (28 triangles, one instance).
 */
export function meadowTuft() {
  const rnd = seeded(5);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.35;
    parts.push(grassBlade().scale(2.4, 0.65 + rnd() * 0.45, 1).rotateX((rnd() - 0.5) * 0.5).rotateY(rnd() * Math.PI * 2).translate(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return merge(parts);
}

/**
 * A Central Park settee: five seat slats and four back slats of weathered wood on three cast-iron frames (curved
 * legs, a raked back), 1.8 m long, facing +z, its seat 0.45 m up. Returns the wood and the iron as two geometries
 * (white vertex colours: the materials carry the texture and colour).
 */
export function parkBench() {
  const L = 1.8;
  const wood: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) wood.push(new BoxGeometry(L, 0.035, 0.075).translate(0, 0.45, 0.17 - i * 0.088));
  for (let i = 0; i < 4; i++) {
    // The back leans 15 degrees, its slats following the frame.
    const h = 0.58 + i * 0.1;
    wood.push(new BoxGeometry(L, 0.075, 0.03).rotateX(-0.26).translate(0, h, -0.2 - (h - 0.55) * 0.27));
  }
  // The side frame in profile (y up, z forward): front leg curving forward, seat rail, back leg rising into the back.
  const frame = new Shape();
  frame.moveTo(0.22, 0);
  frame.quadraticCurveTo(0.17, 0.2, 0.2, 0.43);
  frame.lineTo(-0.2, 0.43);
  frame.lineTo(-0.36, 0.95);
  frame.lineTo(-0.31, 0.96);
  frame.lineTo(-0.16, 0.47);
  frame.lineTo(0.24, 0.47);
  frame.lineTo(0.27, 0.43);
  frame.quadraticCurveTo(0.22, 0.22, 0.28, 0.0);
  frame.lineTo(0.22, 0);
  const hind = new Shape();
  hind.moveTo(-0.22, 0);
  hind.quadraticCurveTo(-0.17, 0.2, -0.2, 0.43);
  hind.lineTo(-0.15, 0.43);
  hind.quadraticCurveTo(-0.12, 0.2, -0.16, 0);
  hind.lineTo(-0.22, 0);
  const side = (x: number) => [frame, hind].map((s) => new ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: false, curveSegments: 10 }).rotateY(-Math.PI / 2).translate(x + 0.0225, 0, 0));
  const iron: BufferGeometry[] = [-L / 2 + 0.08, 0, L / 2 - 0.08].flatMap(side);
  // Arm rests on the two ends.
  for (const x of [-L / 2 + 0.08, L / 2 - 0.08]) iron.push(new BoxGeometry(0.05, 0.03, 0.42).translate(x, 0.68, 0.02));
  for (const x of [-L / 2 + 0.08, L / 2 - 0.08]) iron.push(new BoxGeometry(0.035, 0.24, 0.035).translate(x, 0.56, 0.2));
  return { wood: finish(merge(wood.map((g) => g.toNonIndexed())), "#ffffff"), iron: finish(merge(iron.map((g) => (g.index ? g.toNonIndexed() : g)).map(stripUv)), "#ffffff") };
}

/**
 * A two-tier fountain in the manner of Central Park's Bethesda Fountain, scaled to a small plaza: a round pool with a
 * low lipped wall (r 2 m), and a column carrying a wide lower basin and a small upper one, water spilling from each.
 * Lathed profiles [radius, height]; `still` is the three water surfaces, `falls` the two sheets spilling over the basin rims.
 */
export function fountain() {
  const lathe = (pts: [number, number][], segs = 48) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), segs);
  const pool = lathe([[2.05, -0.02], [2.05, 0.4], [2.0, 0.47], [1.86, 0.48], [1.8, 0.44], [1.76, 0.12], [0.001, 0.12]]);
  const column = lathe([
    [0.34, 0.12], [0.3, 0.28], [0.2, 0.42], [0.17, 0.75], [0.26, 0.92], [0.62, 1.0], [0.92, 1.08], [0.93, 1.15], [0.88, 1.16], [0.82, 1.1],
    [0.3, 1.04], [0.13, 1.08], [0.11, 1.5], [0.18, 1.62], [0.44, 1.7], [0.46, 1.76], [0.42, 1.77], [0.13, 1.72], [0.09, 1.84], [0.15, 1.94],
    [0.12, 2.04], [0.05, 2.12], [0.001, 2.14],
  ]);
  const stone = merge([pool, column].map((g) => finish(g, "#ffffff")));
  const disc = (r: number, y: number) => new CircleGeometry(r, 48).rotateX(-Math.PI / 2).translate(0, y, 0);
  const sheet = (r0: number, r1: number, top: number, bottom: number) => new CylinderGeometry(r0, r1, top - bottom, 48, 1, true).translate(0, (top + bottom) / 2, 0);
  const still = merge([disc(1.77, 0.36), disc(0.84, 1.12), disc(0.42, 1.74)].map((g) => g.toNonIndexed()));
  const falls = merge([sheet(0.47, 0.5, 1.74, 1.13), sheet(0.95, 1.02, 1.12, 0.37)].map((g) => g.toNonIndexed()));
  return { stone, still, falls };
}

/** A park signpost: a wooden post (2 m) with a finial; its boards are added by the scene (they carry painted words). */
export function signpost() {
  return finish(merge([new BoxGeometry(0.09, 2.0, 0.09).translate(0, 1.0, 0), new ConeGeometry(0.075, 0.12, 4).rotateY(Math.PI / 4).translate(0, 2.06, 0)].map((g) => stripUv(g.toNonIndexed()))), "#ffffff");
}

function stripUv(g: BufferGeometry) {
  g.deleteAttribute("uv");
  return g;
}

// ---- Wood, stone and the built garden ----------------------------------------------------------------------

/** A weathered stone: a lumpy, flattened sphere. */
export function stone(seed: number, scale: V3) {
  const g = new IcosahedronGeometry(1, 16); // ~5.8k triangles at full detail; the pipeline decimates per tier
  const pos = g.attributes.position;
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = 1 + 0.18 * noise(p.x * 2 + seed, p.y * 2, p.z * 2) + 0.05 * noise(p.x * 7, p.y * 7 + seed, p.z * 7);
    pos.setXYZ(i, p.x * k * scale[0], Math.max(p.y * k * scale[1], -0.02), p.z * k * scale[2]);
  }
  g.deleteAttribute("normal");
  return finish(g, (q) => tmp.set(PLANT.stoneDark).lerp(tmp2.set(PLANT.stoneLight), 0.5 + 0.5 * noise(q.x * 6 + seed, q.y * 6, q.z * 6)));
}

// ---- Scattering ------------------------------------------------------------------------------------------

export type Instance = { matrix: Matrix4; colour?: string };
const UP = v(0, 1, 0);

