import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  DataTexture,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LOD,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";

import * as K from "./kit";
import { impostorLight, impostorTrees } from "./impostors";
import { type Materials, windy } from "./materials";
import type { ModelName, Models, Part } from "./models";
import { PLANT } from "./palette";
import { signals } from "./store";

// ---- The lie of the land -------------------------------------------------------------------------------
//
// A paved walk, 1.1 m wide, runs from the start (z = 7) straight down -z to the fork at z = -25, where it splits in
// two ways angled 0.42 rad apart. Beds line both sides of the walk; a shrub border runs behind them; firs stand far
// off in the mist. The tree stands on the lawn LEFT of the walk in the clearing, never on the paving.

export const TREE = new Vector3(-2.9, 0, -18);
const FORK = -25;
const FORK_ANGLE = 0.42;
const HALF_WIDTH = 0.55;

/** Distance from (x, z) to the centre line of the walk (the straight part, or either way at the fork). */
function walkDistance(x: number, z: number) {
  if (z > 7) return Math.hypot(x, z - 7);
  if (z >= FORK) return Math.abs(x);
  const along = FORK - z;
  const toWay = Math.abs(Math.abs(x) - along * Math.tan(FORK_ANGLE)) * Math.cos(FORK_ANGLE);
  return along > 13 ? Infinity : toWay;
}
/** Nothing grows or stands here: the paving and a little margin either side. */
/**
 * The fountain plaza far off to the west of the clearing (what the camera turns to after signing in, about 19 m away,
 * where the haze softens it): a paved circle with the fountain at its middle (FOUNTAIN_SCALE times kit.fountain),
 * settees round its edge facing it, people sitting and standing about, paths leading in from three sides.
 */
const PLAZA: [number, number] = [-13.4, -25.9];
const PLAZA_R = 4.2;
const FOUNTAIN_SCALE = 1.3;
const plazaDistance = (x: number, z: number) => Math.hypot(x - PLAZA[0], z - PLAZA[1]);

/**
 * Gravel paths winding off the paved walk, as in Central Park, every one running on out of sight into the hills so the
 * park carries on past what you see: the meadow loop through the fountain plaza, a path from the plaza west across
 * the meadow, a spur from the walk to the plaza, the hill walk east, the picnic path, and the two ways on from the fork.
 * Each is a smooth curve through these points.
 */
const GRAVEL_HALF = 0.42;
const GRAVEL: [number, number][][] = [
  [[-0.5, -3.5], [-2.5, -5.0], [-5.0, -7.5], [-6.6, -11], [-7.4, -15], [-7.4, -19], [-6.4, -22.5], [-4.4, -24.3], [-2.4, -24.6], [-0.5, -24.4]],
  [[-0.4, -21.3], [-2.4, -21.6], [-4.4, -21.0], [-6.9, -20.2]],
  [[-7.0, -21.4], [-8.4, -23.6], [-9.6, -24.8]],
  [[-14.9, -25.5], [-19, -21.5], [-25, -19.5], [-33, -21.5], [-44, -20], [-54, -21]],
  [[-13.9, -29.4], [-16.5, -32.6], [-24, -33.5], [-31, -31], [-40, -33], [-52, -31]],
  [[1.0, -15.0], [1.0, -19.2]],
  [[0.5, 1.0], [2.4, -0.6], [4.6, -3.0], [6.8, -6.5], [9.5, -9.0], [13, -10.5], [18, -11.5], [25, -10.5], [34, -8], [44, -6]],
  [[0.0, -11.8], [2.6, -12.9], [4.4, -14.6], [5.8, -16.9], [7.6, -19.4], [11, -21], [17, -20.2], [26, -22], [38, -21]],
  [[5.2, -36.3], [6.9, -40.0], [8.4, -46], [8.0, -53], [10.5, -62]],
  [[-5.2, -36.3], [-7.1, -40.4], [-8.2, -47], [-11, -54], [-12, -63]],
];
/** Each gravel path sampled every 20 cm (for its ribbon, and for keeping plants off it). */
const GRAVEL_POINTS = GRAVEL.map((pts) => {
  const curve = new CatmullRomCurve3(pts.map(([x, z]) => new Vector3(x, 0, z)));
  return curve.getSpacedPoints(Math.ceil(curve.getLength() / 0.2));
});
function gravelDistance(x: number, z: number) {
  let best = Infinity;
  for (const line of GRAVEL_POINTS) for (const p of line) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
  return Math.sqrt(best);
}
/**
 * The far park, there to be seen from a distance (more than 13 m from the walk's middle): settees beside the gravel
 * paths with people sitting on some, people walking the paths, and groups standing on the far lawns. Every one stands
 * on gravel: a settee or a group gets a round gravel pad. Drawn with the people's lightest tier, instanced.
 */
type Far = { name: ModelName; x: number; z: number; yaw: number };
const FAR = (() => {
  const rnd = K.seeded(99);
  const benches: [number, number, number][] = [];
  const people: Far[] = [];
  const pads: [number, number, number][] = [];
  const far = (x: number, z: number) => Math.hypot(x, z + 15) > 13 && Math.hypot(x, z + 15) < 52 && plazaDistance(x, z) > PLAZA_R + 1;
  const sit = (x: number, z: number, yaw: number, chance: number) => {
    for (const s of [-1, 1]) {
      if (rnd() < chance) people.push({ name: (["visitor-a", "visitor-b", "visitor-e"] as const)[Math.floor(rnd() * 3)], x: x + s * 0.42 * Math.cos(yaw), z: z - s * 0.42 * Math.sin(yaw), yaw });
    }
  };
  const standing = () => (["visitor-c", "visitor-d", "visitor-f"] as const)[Math.floor(rnd() * 3)];
  GRAVEL_POINTS.forEach((line) => {
    let side = 1;
    for (let i = 5; i < line.length - 5; i++) {
      const p = line[i];
      if (!far(p.x, p.z)) continue;
      const tx = line[i + 1].x - line[i - 1].x;
      const tz = line[i + 1].z - line[i - 1].z;
      const len = Math.hypot(tx, tz);
      const [nx, nz] = [(-tz / len) * side, (tx / len) * side];
      if (i % 45 === 0) {
        // A settee at the path's edge, facing across it, on its own pad of gravel.
        const x = p.x + nx * (GRAVEL_HALF + 0.55);
        const z = p.z + nz * (GRAVEL_HALF + 0.55);
        const yaw = Math.atan2(-nx, -nz);
        benches.push([x, z, yaw]);
        pads.push([x, z, 1.05]);
        sit(x, z, yaw, 0.6);
        side = -side;
      } else if (i % 30 === 0 && rnd() < 0.6) {
        // Someone walking, one way or the other, a little to one side of the middle.
        const off = (rnd() - 0.5) * 0.4;
        people.push({ name: standing(), x: p.x + nx * off, z: p.z + nz * off, yaw: Math.atan2(tx, tz) + (rnd() < 0.5 ? Math.PI : 0) });
      }
    }
  });
  // Groups standing on the far lawns, turned toward each other, each on a gravel pad.
  for (const [x, z] of [[-17, -11], [15, -27], [-21, -40], [19, -3], [11, -46], [-27, -27], [24, -15], [-13, -48]] as [number, number][]) {
    const n = 2 + Math.floor(rnd() * 2);
    pads.push([x, z, 1.4]);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd();
      people.push({ name: standing(), x: x + Math.cos(a) * 0.55, z: z + Math.sin(a) * 0.55, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
    }
  }
  return { benches, people, pads };
})();

/** False within 2.8 m of the line from the clearing's camera to the fountain, so nothing tall stands in that view. */
function inView(x: number, z: number) {
  const [ax, az] = [1.6, -13.4];
  const [dx, dz] = [PLAZA[0] - ax, PLAZA[1] - az];
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz) > 2.8;
}

/** Gravel pads under the picnic table and the far settees and groups: [x, z, radius]. */
const PADS: [number, number, number][] = [[5.0, -20.6, 2.1], ...FAR.pads]; // the first is under the picnic table (TABLE, declared further down)
const onPad = (x: number, z: number, margin: number) => PADS.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + margin);

/** Nothing grows or stands here: the paving and the gravel paths and pads, and a little margin either side. */
const clearOfWalk = (x: number, z: number) =>
  walkDistance(x, z) > HALF_WIDTH + 0.22 && gravelDistance(x, z) > GRAVEL_HALF + 0.12 && plazaDistance(x, z) > PLAZA_R + 0.25 && !onPad(x, z, 0.15);

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The lie of the land: rolling lawn, flat beside the walk so nothing pokes through the paving, rising into soft hills
 * on both sides and behind the fork, so the park has a horizon of its own instead of an edge.
 */
function rolling(x: number, z: number) {
  const roll = 0.24 * K.noise(x * 0.3, 0.3, z * 0.3) + 0.06 * K.noise(x * 1.4, 1.1, z * 1.4);
  const hills = (1.8 * smooth(5, 18, Math.abs(x)) + 2.4 * smooth(-30, -48, z) + 1.2 * smooth(9, 22, z)) * (0.65 + 0.35 * K.noise(x * 0.11, 2.2, z * 0.11));
  return roll + hills;
}
/** The plaza is levelled at the height the hillside has at its middle (not dug down to the walk's level). */
const PLAZA_LEVEL = rolling(PLAZA[0], PLAZA[1]);

export function groundHeight(x: number, z: number) {
  const nearWalk = Math.min(1, Math.max(0, walkDistance(x, z) - 0.9) / 1.2);
  const nearPlaza = Math.min(1, Math.max(0, plazaDistance(x, z) - PLAZA_R - 0.3) / 1.5);
  return PLAZA_LEVEL + (rolling(x, z) * nearWalk - PLAZA_LEVEL) * nearPlaza - 0.01;
}

/**
 * The lawn: the texture gives the grass; the vertex colour is a tint that gives the ground depth (darker in the
 * shade under the shrub border, lifted where frost lies).
 */
function ground() {
  // Out past the city round the park (skyline.ts), so the lawn never ends in a gap below the buildings.
  const g = new PlaneGeometry(220, 220, 240, 240).rotateX(-Math.PI / 2).translate(0, 0, -18);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    // Large soft patches of lighter and darker turf, so the lawn is never one flat carpet; frost in the hollows.
    const patches = 0.5 + 0.5 * K.noise(x * 0.32, 0.5, z * 0.32);
    const shade = 0.76 + 0.22 * patches + 0.06 * K.noise(x * 1.9, 2.5, z * 1.9);
    const frost = Math.max(0, K.noise(x * 0.9, 2, z * 0.9) - 0.2) * 0.25;
    col.set([shade + frost, shade + frost * 1.05, shade + frost * 1.1], i * 3);
  }
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The gravel paths: ribbons laid on the ground along each curve. */
function gravelPaths() {
  const parts = GRAVEL_POINTS.map((line) => {
    const pos: number[] = [];
    const index: number[] = [];
    line.forEach((p, i) => {
      const next = line[Math.min(i + 1, line.length - 1)];
      const prev = line[Math.max(i - 1, 0)];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      for (const s of [-1, 1]) {
        const x = p.x + (s * -dz * GRAVEL_HALF) / len;
        const z = p.z + (s * dx * GRAVEL_HALF) / len;
        pos.push(x, groundHeight(x, z) + 0.02, z);
      }
      if (i && plazaDistance(p.x, p.z) > PLAZA_R - 0.3) index.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g.toNonIndexed();
  });
  for (const [x, z, r] of PADS) {
    const g = new CircleGeometry(r, 20).rotateX(-Math.PI / 2).translate(x, 0, z);
    g.deleteAttribute("uv");
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)) + 0.02);
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
    g.computeVertexNormals();
    parts.push(g.toNonIndexed());
  }
  return K.merge(parts);
}

/** The plaza's paving: a disc on the (flattened) ground, a little above the gravel that runs under its edge. */
function plaza() {
  const g = new CircleGeometry(PLAZA_R, 64).rotateX(-Math.PI / 2).translate(PLAZA[0], PLAZA_LEVEL + 0.016, PLAZA[1]);
  g.setAttribute("color", new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g.toNonIndexed();
}

/** The paved walk and its two ways at the fork. */
function walk() {
  const strip = (length: number, z: number, angle = 0) => {
    const g = new PlaneGeometry(HALF_WIDTH * 2, length, 2, Math.ceil(length * 2)).rotateX(-Math.PI / 2).translate(0, 0.012, -length / 2).rotateY(angle).translate(0, 0, z);
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    return g.toNonIndexed();
  };
  return K.merge([strip(7 - FORK + 0.6, 7), strip(13, FORK + 0.3, FORK_ANGLE), strip(13, FORK + 0.3, -FORK_ANGLE)]);
}

// ---- Level of detail -------------------------------------------------------------------------------------

/** Swap distances (metres from the camera) for LOD1 and LOD2. */
const LOD_AT = [6, 12] as const;

/** Lamp posts along the walk, alternating sides; each lit in the evening. */
/** The picnic table (centre, turn) and the two visitors at it, in the table's own frame: [model, across, along, facing]. */
const TABLE: [number, number] = [5.0, -20.6];
const TABLE_YAW = 0.35;
const VISITORS_AT_TABLE: ["visitor-a" | "visitor-b", number, number, number][] = [
  ["visitor-a", 0.45, 0.35, -Math.PI / 2],
  ["visitor-b", -0.45, -0.3, Math.PI / 2],
];
/** A point in the table's frame (x across it, z along it) in the world. */
function atTable(x: number, z: number): [number, number] {
  return [TABLE[0] + x * Math.cos(TABLE_YAW) + z * Math.sin(TABLE_YAW), TABLE[1] - x * Math.sin(TABLE_YAW) + z * Math.cos(TABLE_YAW)];
}

/** Where the benches beside the walk stand (on a gravel apron, facing -x, across the walk to the tree). */
const BENCHES = [-18.2, -16.0];
const BENCH_X = 1.25;
/** Settees round the plaza's edge, facing the fountain, between the three paths that come in (at about 0.3, 2.5 and -1.7) (angles round it; 0 = +x, pi/2 = +z). */
const PLAZA_BENCHES = [-0.55, -1.15, 1.0, 1.65, 3.3, 3.95];
/** A settee round the plaza at angle a: where it stands and its turn (its front, +z, toward the fountain). */
const plazaBench = (a: number): [number, number, number] => [PLAZA[0] + 3.6 * Math.cos(a), PLAZA[1] + 3.6 * Math.sin(a), Math.atan2(-Math.cos(a), -Math.sin(a))];

/** Signposts at the junctions: [x, z, boards as [words, the place it points to]]. */
const SIGNS: [number, number, [string, [number, number]][]][] = [
  [-0.95, -2.9, [["Meadow Loop", [-2.5, -5.0]], ["The Clearing", [0, -14]]]],
  [0.95, 0.3, [["Hill Walk", [2.4, -0.6]], ["Welcome", [0, 6]]]],
  [4.9, -17.4, [["Picnic Lawn", TABLE]]],
  [-0.95, -22.2, [["The Fountain", PLAZA]]],
  [-8.4, -17.0, [["The Fountain", PLAZA], ["Meadow Loop", [-6.6, -11]]]],
  [0.0, -26.4, [["North Woods", [-5, -37]], ["Lake Walk", [5, -37]]]],
];

/** The far tree pictures at dusk: dimmed and cooled, to sit with the lit trees in front of them. */
const dusk = new Color(PLANT.impostorDusk);

const LAMPS: [number, number][] = [[-0.93, -1.0], [0.93, -1.0], [-0.95, -9.4], [2.35, -16.2], [-0.95, -20.6]];

/** How much each scanned plant sways (the wind shader moves by the square of the height above its base), and how far it parts under the pointer. */
const SWAY: Partial<Record<ModelName, [number, number]>> = {
  ferns: [0.3, 0.5],
  celandine: [0.8, 0.6],
  shrubs: [0.02, 0.12],
};

function materialFor(part: Part, materials: Materials, name: ModelName): Material {
  if (part.look === "real") {
    const m = part.material as MeshStandardMaterial;
    const sway = SWAY[name];
    return sway ? windy(m, sway[0], name === "celandine", sway[1]) : m;
  }
  return materials[part.look];
}

type Placed = K.Instance & { variant?: number };

/** A placed object: one THREE.LOD whose levels are the model's three tiers (one variant of a set). */
function heroLod(models: Models, name: ModelName, materials: Materials, matrix: Matrix4, variant = 0, cast = true) {
  const lod = new LOD();
  models[name].forEach((variants, i) => {
    const level = new Group();
    for (const part of variants[variant % variants.length]) {
      const mesh = new Mesh(part.geometry, materialFor(part, materials, name));
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      level.add(mesh);
    }
    lod.addLevel(level, i === 0 ? 0 : LOD_AT[i - 1]);
  });
  lod.applyMatrix4(matrix);
  return lod;
}

/**
 * Many copies of a model near one spot (each instance one variant of the set): instanced per tier and variant,
 * inside one LOD placed at their middle, so the whole bed changes tier together as the camera walks away from it.
 */
function manyLod(models: Models, name: ModelName, materials: Materials, items: Placed[]) {
  const lod = new LOD();
  if (!items.length) return lod;
  const centre = items.reduce((c, it) => c.add(new Vector3().setFromMatrixPosition(it.matrix)), new Vector3()).divideScalar(items.length);
  const toLocal = new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z);
  const colour = new Color();
  models[name].forEach((variants, i) => {
    const level = new Group();
    variants.forEach((parts, v) => {
      const mine = items.filter((it) => (it.variant ?? 0) % variants.length === v);
      if (!mine.length) return;
      for (const part of parts) {
        const mesh = new InstancedMesh(part.geometry, materialFor(part, materials, name), mine.length);
        mine.forEach((it, k) => {
          mesh.setMatrixAt(k, toLocal.clone().multiply(it.matrix));
          if (it.colour) mesh.setColorAt(k, colour.set(it.colour));
        });
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        level.add(mesh);
      }
    });
    lod.addLevel(level, i === 0 ? 0 : LOD_AT[i - 1]);
  });
  lod.position.copy(centre);
  return lod;
}

/**
 * The fine grass blades made in code (a few vertices each, thousands of them), in 4 m tiles: each tile is one
 * instanced draw, and it isn't drawn at all beyond GRASS_FAR (the blades are smaller than a pixel there, and in the haze).
 */
const GRASS_FAR = 10;
function blades(geometry: BufferGeometry, material: Material, items: K.Instance[], far = GRASS_FAR) {
  const tiles = new Map<string, K.Instance[]>();
  const at = new Vector3();
  for (const it of items) {
    at.setFromMatrixPosition(it.matrix);
    const key = `${Math.floor(at.x / 4)},${Math.floor(at.z / 4)}`;
    tiles.set(key, [...(tiles.get(key) ?? []), it]);
  }
  const group = new Group();
  for (const [key, tile] of tiles) {
    const [tx, tz] = key.split(",").map(Number);
    const centre = new Vector3(tx * 4 + 2, 0, tz * 4 + 2);
    const mesh = new InstancedMesh(geometry, material, tile.length);
    const toLocal = new Matrix4().makeTranslation(-centre.x, 0, -centre.z);
    tile.forEach((it, k) => mesh.setMatrixAt(k, toLocal.clone().multiply(it.matrix)));
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    const lod = new LOD();
    lod.addLevel(mesh, 0);
    lod.addLevel(new Group(), far);
    lod.position.copy(centre);
    group.add(lod);
  }
  return group;
}

/**
 * Soft dark discs on the ground under trees, benches and lamps, so they sit on the lawn instead of floating (the
 * sun's own shadows only reach the few metres round the camera's subject). Spots: [x, z, radius].
 */
function contactShadows(spots: [number, number, number][], darkness: number) {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const d = Math.hypot(((i % size) + 0.5) / size - 0.5, (Math.floor(i / size) + 0.5) / size - 0.5) * 2;
    pixels.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - d) ** 1.8)], i * 4);
  }
  const texture = new DataTexture(pixels, size, size);
  texture.needsUpdate = true;
  const material = new MeshBasicMaterial({ color: PLANT.contactShadow, map: texture, transparent: true, opacity: darkness, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const mesh = new InstancedMesh(new PlaneGeometry(2, 2).rotateX(-Math.PI / 2), material, spots.length);
  spots.forEach(([x, z, r], k) => mesh.setMatrixAt(k, new Matrix4().compose(new Vector3(x, groundHeight(x, z) + 0.02, z), new Quaternion(), new Vector3(r, 1, r))));
  mesh.computeBoundingSphere();
  return mesh;
}

/** A settee (kit.parkBench): weathered wood slats on cast-iron frames. */
function bench(materials: Materials, matrix: Matrix4) {
  const { wood, iron } = K.parkBench();
  const g = new Group();
  for (const [geometry, material] of [[wood, materials.wood], [iron, materials.iron]] as const) {
    const m = new Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.applyMatrix4(matrix);
  return g;
}

/** Many settees at once (two instanced meshes): [x, z, turn] each. */
function benches(materials: Materials, at: [number, number, number][]) {
  const { wood, iron } = K.parkBench();
  const g = new Group();
  for (const [geometry, material] of [[wood, materials.wood], [iron, materials.iron]] as const) {
    const m = new InstancedMesh(geometry, material, at.length);
    at.forEach(([x, z, yaw], i) => m.setMatrixAt(i, standAt(x, z, yaw)));
    m.computeBoundingSphere();
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** People seen from afar: each visitor's lightest tier, instanced (a handful of draw calls for any number). */
function crowd(models: Models, materials: Materials, people: Far[]) {
  const g = new Group();
  for (const name of new Set(people.map((p) => p.name))) {
    const mine = people.filter((p) => p.name === name);
    const tiers = models[name];
    for (const part of tiers[tiers.length - 1][0]) {
      const m = new InstancedMesh(part.geometry, materialFor(part, materials, name), mine.length);
      mine.forEach((p, i) => m.setMatrixAt(i, standAt(p.x, p.z, p.yaw)));
      m.computeBoundingSphere();
      g.add(m);
    }
  }
  return g;
}

/** Painted words on a board: cream letters on park green, both faces (redrawn once the page's typeface has loaded). */
function boardTexture(words: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const draw = () => {
    const c = canvas.getContext("2d")!;
    c.fillStyle = PLANT.signBoard;
    c.fillRect(0, 0, 512, 128);
    c.strokeStyle = PLANT.signText;
    c.lineWidth = 4;
    c.strokeRect(10, 10, 492, 108);
    c.fillStyle = PLANT.signText;
    c.font = '600 58px "Atkinson Hyperlegible Next Variable", system-ui, sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(words, 256, 68, 470);
    texture.needsUpdate = true;
  };
  draw();
  void document.fonts?.ready.then(draw);
  return texture;
}

/** A signpost with fingerboards pointing along the paths. */
function signpost(materials: Materials, x: number, z: number, boards: [string, [number, number]][]) {
  const g = new Group();
  const post = new Mesh(K.signpost(), materials.signPost);
  post.castShadow = true;
  g.add(post);
  boards.forEach(([words, [tx, tz]], i) => {
    // Turned by `direction`, a board's length runs along (cos, -sin) in x, z.
    const direction = Math.atan2(-(tz - z), tx - x);
    const painted = new MeshStandardMaterial({ map: boardTexture(words), roughness: 0.7 });
    const edge = new MeshStandardMaterial({ color: PLANT.signBoard, roughness: 0.7 });
    const board = new Mesh(new BoxGeometry(0.72, 0.18, 0.025), [edge, edge, edge, edge, painted, painted]);
    // Each board sticks out from the post toward where it points.
    board.position.set(Math.cos(direction) * 0.36, 1.7 - i * 0.24, -Math.sin(direction) * 0.36);
    board.rotation.y = direction;
    board.castShadow = true;
    g.add(board);
  });
  g.position.set(x, groundHeight(x, z), z);
  return g;
}

// ---- Placing things ------------------------------------------------------------------------------------

/** A matrix standing on the ground at (x, z), turned by yaw, scaled (uniformly, or [x, y, z]). */
function standAt(x: number, z: number, yaw = 0, scale: number | [number, number, number] = 1, tilt = 0) {
  const s = typeof scale === "number" ? new Vector3(scale, scale, scale) : new Vector3(...scale);
  return new Matrix4().compose(new Vector3(x, groundHeight(x, z), z), new Quaternion().setFromEuler(new Euler(tilt, yaw, 0, "YXZ")), s);
}

type Area = { x: [number, number]; z: [number, number] };

/** Points scattered over a rectangle of ground, kept clear of the walk and of `avoid` circles [x, z, r]. */
function scatter(rnd: () => number, count: number, area: Area, size: [number, number], o: { avoid?: [number, number, number][]; tilt?: number; variants?: number } = {}): Placed[] {
  const out: Placed[] = [];
  for (let tries = 0; out.length < count && tries < count * 12; tries++) {
    const x = area.x[0] + rnd() * (area.x[1] - area.x[0]);
    const z = area.z[0] + rnd() * (area.z[1] - area.z[0]);
    if (!clearOfWalk(x, z) || o.avoid?.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    const s = size[0] + rnd() * (size[1] - size[0]);
    out.push({ matrix: standAt(x, z, rnd() * Math.PI * 2, s, o.tilt ? (rnd() - 0.5) * o.tilt : 0), variant: Math.floor(rnd() * (o.variants ?? 1)) });
  }
  return out;
}

/** Both beds beside the walk between two z values (left: -2.6..-0.8, right: 0.8..2.6). */
const beds = (z0: number, z1: number): Area[] => [
  { x: [-2.6, -0.78], z: [z1, z0] },
  { x: [0.78, 2.6], z: [z1, z0] },
];

// ---- The garden, stop by stop --------------------------------------------------------------------------

function buildGarden(models: Models, materials: Materials, cards: Record<string, Texture>, density: number) {
  const n = (count: number) => Math.max(1, Math.round(count * density));
  const rnd = K.seeded(21);
  const root = new Group();
  const blade = K.grassBlade();
  const variantsOf = (name: ModelName) => models[name][0].length;

  const hero = (name: ModelName, matrix: Matrix4, variant = 0, cast = true) => root.add(heroLod(models, name, materials, matrix, variant, cast));
  const many = (name: ModelName, items: Placed[]) => root.add(manyLod(models, name, materials, items));
  // Plants don't cast the sun's shadow (the contact shadows ground them): half the drawing on integrated graphics.
  const plant = (name: ModelName, count: number, areas: Area[], size: [number, number], o: { avoid?: [number, number, number][] } = {}) =>
    many(name, areas.flatMap((a) => scatter(rnd, n(count), a, size, { tilt: 0.2, variants: variantsOf(name), avoid: o.avoid })));
  /** Ground cover for a stretch of beds: a dense, short, living lawn of fine blades over the lawn texture. */
  const groundCover = (areas: Area[], avoid: [number, number, number][] = []) => {
    for (const a of areas) {
      const m2 = (a.x[1] - a.x[0]) * (a.z[1] - a.z[0]);
      root.add(blades(blade, materials.grass, scatter(rnd, n(Math.round(m2 * 400)), a, [0.06, 0.15], { avoid })));
    }
  };

  // The start of the walk (Welcome): a full, living old tree on the bank to the right, snowdrops and hellebores at
  // its foot, mossy stones and ferns about it.
  hero("start-tree", standAt(2.6, 2.0, 0.8, 1.05));
  hero("rocks-a", standAt(1.15, 3.6, 0.3, 0.3), 1);
  hero("rocks-b", standAt(3.7, 3.4, 1.2, 0.26), 2);
  const startAvoid: [number, number, number][] = [[2.6, 2.0, 0.7], [1.15, 3.6, 0.4], [3.7, 3.4, 0.4]];
  plant("snowdrop", 80, [{ x: [0.9, 3.2], z: [3.4, 4.6] }], [1.4, 1.8], { avoid: startAvoid });
  plant("snowdrop", 40, [{ x: [0.9, 2.2], z: [0.8, 2.4] }], [1.3, 1.7], { avoid: startAvoid });
  plant("hellebore-cream", 3, [{ x: [1.0, 1.8], z: [1.6, 2.6] }], [0.85, 1.05]);
  plant("hellebore-plum", 3, [{ x: [1.6, 2.4], z: [3.6, 4.2] }], [0.85, 1.05]);
  plant("ferns", 4, [{ x: [3.2, 4.8], z: [-0.4, 1.0] }], [0.9, 1.15]);
  plant("celandine", 6, [{ x: [0.9, 2.4], z: [-1, 1] }], [1, 1.2]);
  groundCover([{ x: [0.78, 5.5], z: [-2, 6] }, { x: [-4, -0.78], z: [-2, 6] }], startAvoid);

  // Just inside (Sign in, Sign up): snowdrops along both edges, mossy stones, ferns.
  plant("snowdrop", 80, beds(-2.5, -7.5), [0.9, 1.25]);
  hero("rocks-b", standAt(-1.6, -5.4, 0.3, 0.26), 0);
  hero("rocks-a", standAt(1.9, -6.6, 2.3, 0.24), 3);
  plant("ferns", 3, [{ x: [1.4, 2.4], z: [-4.6, -3.2] }, { x: [-2.4, -1.6], z: [-7.2, -6.2] }], [0.8, 1.0]);
  groundCover(beds(-2, -8), [[-1.6, -5.4, 0.5], [1.9, -6.6, 0.5]]);

  // Three stepping stones across the lawn to the right (Setup), a cyclamen opening beside each.
  const stones: [number, number][] = [[1.3, -9.0], [1.8, -10.2], [2.25, -11.4]];
  stones.forEach(([x, z], i) => {
    hero("stone-c", standAt(x, z, i * 1.3, [0.3, 0.45, 0.3]));
    plant("cyclamen", 4, [{ x: [x + 0.35, x + 0.7], z: [z - 0.3, z + 0.3] }], [1.4, 1.8]);
  });
  groundCover(beds(-8, -12.4), stones.map(([x, z]) => [x, z, 0.4] as [number, number, number]));

  // The long border (Progress) on the left, the yellow celandine walk (Help, legal) on the right.
  plant("ferns", 4, [{ x: [-2.4, -1.2], z: [-14.6, -12.4] }], [0.9, 1.1]);
  plant("hellebore-plum", 3, [{ x: [-2.0, -1.0], z: [-14.2, -12.8] }], [0.75, 0.95]);
  plant("celandine", 8, [{ x: [0.9, 2.4], z: [-14.8, -12.4] }], [1, 1.25]);
  groundCover(beds(-12.4, -15.2));

  // The clearing (Home, the summary): the tree on the lawn left of the walk (Tree.tsx), a bench at the right
  // edge facing it, hellebores either side of the bench, ferns and snowdrops round the tree.
  // One long park bench along the right edge of the walk, facing the tree across it.
  // Two Central Park settees side by side, facing the tree across the walk (Speak, Care team).
  for (const z of BENCHES) root.add(bench(materials, standAt(BENCH_X, z, -Math.PI / 2)));
  // A picnic table on the lawn behind it: somewhere people come and sit together, and two people sitting at it.
  hero("picnic-table", standAt(TABLE[0], TABLE[1], TABLE_YAW, 0.95));
  for (const [name, x, z, facing] of VISITORS_AT_TABLE) {
    const [wx, wz] = atTable(x, z);
    hero(name, standAt(wx, wz, TABLE_YAW + facing));
  }
  // The fountain plaza and the far park: settees round the fountain and along the far paths (instanced), people
  // sitting on them and walking and standing about, all in the people's lightest tier (they are only seen from afar).
  const plazaSeats = PLAZA_BENCHES.map(plazaBench);
  root.add(benches(materials, [...plazaSeats, ...FAR.benches]));
  const plazaPeople: Far[] = [];
  plazaSeats.forEach(([x, z, yaw], k) => {
    for (const s of k % 2 ? [-1] : [-1, 1]) plazaPeople.push({ name: (["visitor-e", "visitor-a", "visitor-b"] as const)[(k + s + 3) % 3], x: x + s * 0.42 * Math.cos(yaw), z: z - s * 0.42 * Math.sin(yaw), yaw });
  });
  for (const [a, name] of [[0.5, "visitor-d"], [2.2, "visitor-f"], [4.2, "visitor-c"], [5.0, "visitor-d"]] as [number, ModelName][]) {
    plazaPeople.push({ name, x: PLAZA[0] + 3.05 * Math.cos(a), z: PLAZA[1] + 3.05 * Math.sin(a), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) + 0.4 });
  }
  root.add(crowd(models, materials, [...plazaPeople, ...FAR.people]));
  // Out walking on the meadow loop, stopped to look toward the walk.
  hero("visitor-c", standAt(-7.3, -15.6, Math.PI / 2 + 0.2));
  plant("hellebore-cream", 3, [{ x: [0.85, 2.2], z: [-15.0, -14.6] }], [0.75, 0.95]);
  plant("hellebore-plum", 3, [{ x: [0.85, 2.2], z: [-20.4, -20.0] }], [0.75, 0.95]);
  plant("ferns", 4, [{ x: [-4.2, -1.6], z: [-19.8, -17.4] }], [0.9, 1.15]);
  hero("rocks-b", standAt(-4.1, -16.8, 0.6, 0.26), 3);
  plant("snowdrop", 45, [{ x: [-4.6, -1.4], z: [-16.4, -15.4] }], [0.9, 1.2]);
  groundCover([{ x: [-6, -0.78], z: [-21.5, -15.2] }, { x: [0.78, 2.6], z: [-21.5, -15.2] }], [
    [TREE.x, TREE.z, 0.7],
    [1.4, -18.2, 1.8],
    [1.4, -16.0, 1.8],
    [TABLE[0], TABLE[1], 1.9],
    [-4.1, -16.8, 0.5],
  ]);

  // The old stump (Me), past the clearing on the right.
  hero("stump", standAt(2.3, -22.4, 0.4, 0.55));
  plant("ferns", 3, [{ x: [2.7, 3.4], z: [-23.2, -22.2] }], [0.8, 1.0]);
  groundCover(beds(-21.5, -25), [[2.3, -22.4, 0.6]]);

  // The fork (404): two ways under the firs, mossy rocks between them, snowdrops.
  hero("rocks-a", standAt(0, -29.2, 0.8, 0.4), 4);
  hero("rocks-b", standAt(-2.6, -27.2, 2.0, 0.32), 5);
  plant("snowdrop", 70, [{ x: [-2.4, 2.4], z: [-31, -27] }], [0.9, 1.25]);
  groundCover([{ x: [-4, 4], z: [-33, -25] }], [[0, -29.2, 0.7], [-2.6, -27.2, 0.6]]);

  // Planting all along the walk, so every view has depth: clumps of ferns, drifts of snowdrops, groups of
  // hellebores and yellow celandine, at natural intervals in both beds (kept off the stops' own subjects).
  const keepClear: [number, number, number][] = [[2.6, 2.0, 0.8], ...stones.map(([x, z]) => [x, z, 0.5] as [number, number, number]), [1.4, -18.2, 1.3], [1.4, -16.0, 1.3], [-7.3, -15.6, 0.5], [4.0, -13.0, 1.8], [2.3, -22.4, 0.7], [TREE.x, TREE.z, 0.8], ...SIGNS.map(([x, z]) => [x, z, 0.4] as [number, number, number])];
  // In 6.4 m stretches (each stretch is one group per plant, so fewer draw calls), a drift of snowdrops in each half.
  for (let z = 4; z > FORK + 1; z -= 6.4) {
    for (const [x0, x1] of [[-2.6, -0.85], [0.85, 2.6]] as [number, number][]) {
      const bed = [{ x: [x0, x1] as [number, number], z: [z - 6.4, z] as [number, number] }];
      plant("ferns", 4, bed, [0.75, 1.05], { avoid: keepClear });
      plant("snowdrop", 28, [{ x: [x0, x1], z: [z - 1.6 - rnd(), z - 0.6] }, { x: [x0, x1], z: [z - 4.8 - rnd(), z - 3.8] }], [0.9, 1.25], { avoid: keepClear });
      plant(rnd() < 0.5 ? "hellebore-cream" : "hellebore-plum", 3, bed, [0.7, 0.9], { avoid: keepClear });
      plant("celandine", 2, bed, [0.9, 1.15], { avoid: keepClear });
    }
  }
  // Round the tree: ferns and snowdrops at its feet, as in a planted bed.
  plant("ferns", 6, [{ x: [TREE.x - 1.6, TREE.x + 1.4], z: [TREE.z - 1.5, TREE.z + 1.6] }], [0.85, 1.1], { avoid: [[TREE.x, TREE.z, 0.6]] });
  plant("snowdrop", 60, [{ x: [TREE.x - 1.8, TREE.x + 1.6], z: [TREE.z - 1.8, TREE.z + 1.8] }], [0.9, 1.2], { avoid: [[TREE.x, TREE.z, 0.5]] });

  for (const [x, z, boards] of SIGNS) root.add(signpost(materials, x, z, boards));

  // Lamps along the walk, alternating sides (warm pools of light in the evening): a matched pair near the start,
  // one beside the bench, where its glow breathes while the recogniser works (Speak), more beyond.
  // No sun shadow: a low sun stretches a thin post's shadow into a long dark line across the lawn, like a crack.
  for (const [x, z] of LAMPS) hero("lamp", standAt(x, z, 0, 0.75), 0, false);

  // Trees in the lawns behind the beds on both sides (the clearing's own tree is Tree.tsx), firs further back:
  // all impostors (crossed cards carrying a full-detail render), so a whole wooded horizon costs almost nothing.
  const lawnSpots: [number, number][] = [
    [-5.2, 1.5], [5.6, -3.5], [-5.6, -8.5], [5.2, -12.5], [5.8, -21.5], [-6.4, -24.5], [4.8, -28.5], [-3.6, -32], [7.2, 3.5], [-7.4, -14],
    [-4.2, -4.0], [4.4, -8.0], [-4.6, -12.2], [4.0, -16.6], [-5.6, -20.6], [3.8, -25.0], [-8.8, -2.0], [8.6, -9.5], [8.4, -18.0], [-9.0, -28.0],
    [11.5, -4], [-12, -10], [12.5, -15], [-11, -21], [10.5, -26], [-13.5, 0], [14, 1], [-7.5, -34], [7.5, -35], [0.8, -38],
  ];
  const openLawn = ([x, z]: [number, number]) => gravelDistance(x, z) > 1.5 && plazaDistance(x, z) > PLAZA_R + 1.6 && inView(x, z);
  const lawnTrees: Placed[] = lawnSpots.filter(openLawn).map(([x, z], k) => ({ matrix: standAt(x, z, rnd() * Math.PI * 2, 0.75 + rnd() * 0.35), variant: k % 2 }));
  root.add(impostorTrees("tree-card", cards, lawnTrees.filter((t) => t.variant === 0)));
  root.add(impostorTrees("tree-card-b", cards, lawnTrees.filter((t) => t.variant === 1)));

  // Meadow: tufts of grass over the open lawns on both sides, out to the haze, so the park is grown over, not bare.
  const tuftGeometry = K.meadowTuft();
  for (const [x0, x1] of [[-14, -2.5], [2.5, 14]] as [number, number][]) {
    const area: Area = { x: [x0, x1], z: [-36, 8] };
    const m2 = (x1 - x0) * 44;
    root.add(blades(tuftGeometry, materials.grass, scatter(rnd, n(Math.round(m2 * 3.4)), area, [0.2, 0.38], { avoid: keepClear }), 26));
  }

  // Shrubs filling the lawns behind the beds, in loose groups, so the park looks planted and tended, not empty.
  const shrubAreas: Area[] = [
    { x: [-5.5, -3.2], z: [-2, 5] }, { x: [3.4, 6], z: [-8, -2] }, { x: [-6, -3.4], z: [-15, -7] }, { x: [3.2, 5.6], z: [-15.5, -10] },
    { x: [-7.5, -5], z: [-23, -17] }, { x: [5.6, 7.5], z: [-24, -17] }, { x: [-5, -2.6], z: [-31, -26] }, { x: [2.8, 5.5], z: [-33, -27] },
    { x: [-10, -6.5], z: [-8, 4] }, { x: [6.5, 10], z: [-6, 6] }, { x: [-10, -7], z: [-26, -14] }, { x: [7, 10.5], z: [-30, -20] },
  ];
  const nearTrees = lawnSpots.map(([x, z]) => [x, z, 1.4] as [number, number, number]);
  const shrubSpots = shrubAreas
    .flatMap((a) => scatter(rnd, n(6), a, [0.8, 1.3], { variants: variantsOf("shrubs"), avoid: [...keepClear, ...nearTrees] }))
    .filter((s) => inView(s.matrix.elements[12], s.matrix.elements[14]));
  many("shrubs", shrubSpots);

  const seat = (m: Matrix4): [number, number, number] => {
    const p = new Vector3().setFromMatrixPosition(m);
    return [p.x, p.z, 0.8];
  };
  root.add(
    contactShadows(
      [
        ...lawnSpots.filter(openLawn).map(([x, z]) => [x, z, 1.9] as [number, number, number]),
        [TREE.x, TREE.z, 2.6],
        [2.6, 2.0, 2.3],
        [1.4, -18.2, 1.2],
        [1.4, -16.0, 1.2],
        ...SIGNS.map(([x, z]) => [x, z, 0.3] as [number, number, number]),
        [TABLE[0], TABLE[1], 1.7],
        ...plazaSeats.map(([x, z]) => [x, z, 1.1] as [number, number, number]),
        ...FAR.benches.map(([x, z]) => [x, z, 1.1] as [number, number, number]),
        ...[...plazaPeople, ...FAR.people].map((p) => [p.x, p.z, 0.4] as [number, number, number]),
        [PLAZA[0], PLAZA[1], 2.6 * FOUNTAIN_SCALE],
        [-7.3, -15.6, 0.35],
        ...LAMPS.map(([x, z]) => [x, z, 0.45] as [number, number, number]),
        ...shrubSpots.map((s) => seat(s.matrix)),
      ],
      0.42,
    ),
  );
  const firs: Placed[] = [];
  for (let i = 0; i < 46; i++) {
    const far = i < 16;
    const x = far ? -18 + (i / 15) * 36 + (rnd() - 0.5) * 2 : (i % 2 ? -1 : 1) * (13 + rnd() * 7);
    const z = far ? -37 - rnd() * 8 : 7 - ((i - 16) / 30) * 42;
    if (gravelDistance(x, z) < 1.6) continue;
    firs.push({ matrix: standAt(x, z, rnd() * Math.PI, 0.5 + rnd() * 0.3), variant: Math.floor(rnd() * 3) });
  }
  root.add(impostorTrees("fir-card", cards, firs));
  return root;
}

/** The whole garden. Lamps glow in the evening, and breathe while the recogniser works. */
export function World({ models, materials, cards, density, lantern }: { models: Models; materials: Materials; cards: Record<string, Texture>; density: number; lantern: { current: number } }) {
  const land = useMemo(ground, []);
  const paving = useMemo(walk, []);
  const gravel = useMemo(gravelPaths, []);
  const square = useMemo(plaza, []);
  const water = useMemo(K.fountain, []);
  const garden = useMemo(() => buildGarden(models, materials, cards, density), [models, materials, cards, density]);
  // The lamps' own bulb material (from the scanned model) is what glows.
  const bulbs = useMemo(
    () => models.lamp.flat(2).flatMap((p) => (p.material && /bulb|glass/i.test(p.material.name) ? [p.material as MeshStandardMaterial] : [])),
    [models],
  );
  const light = useRef<PointLight>(null!);
  const pools = useRef(new Set<PointLight>());
  const breath = useRef(0);
  useFrame((_, dt) => {
    breath.current += Math.min(dt, 1 / 30);
    const working = signals.working ? 0.55 + 0.45 * Math.sin(breath.current * 2.4) : 0;
    const glow = Math.max(lantern.current, working);
    for (const b of bulbs) {
      b.emissive.set(PLANT.lanternGlass);
      b.emissiveIntensity = glow * 2.5;
    }
    light.current.intensity = glow * 6;
    for (const pool of pools.current) pool.intensity = lantern.current * 4;
    impostorLight.set("#FFFFFF").lerp(dusk, lantern.current);
    materials.falling.map!.offset.y += Math.min(dt, 1 / 30) * 0.9;
  });
  return (
    <group>
      <mesh geometry={land} material={materials.ground} receiveShadow />
      <mesh geometry={paving} material={materials.paving} receiveShadow />
      <mesh geometry={gravel} material={materials.gravel} receiveShadow />
      <mesh geometry={square} material={materials.paving} receiveShadow />
      <group position={[PLAZA[0], PLAZA_LEVEL - 0.01, PLAZA[1]]} scale={FOUNTAIN_SCALE}>
        <mesh geometry={water.stone} material={materials.fountain} castShadow receiveShadow />
        <mesh geometry={water.still} material={materials.water} />
        <mesh geometry={water.falls} material={materials.falling} />
      </group>
      <primitive object={garden} />
      <pointLight ref={light} position={[2.35, 2.7, -16.2]} color={PLANT.lanternGlass} intensity={0} distance={6} decay={1.5} />
      {/* Two more pools of evening light (every light costs every lit surface, so not one per lamp; the rest just glow). */}
      {[[0, -1.0], [-0.95, -9.4]].map(([x, z]) => (
        <pointLight key={`${x},${z}`} ref={(l) => void (l && pools.current.add(l))} position={[x, 2.7, z]} color={PLANT.lanternGlass} intensity={0} distance={5.5} decay={1.5} />
      ))}
    </group>
  );
}
