import { BufferGeometry, Float32BufferAttribute, type Material, Mesh, type MeshStandardMaterial, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

import manifest from "./models.json";

// The garden's models: glTF files made by scripts/assets/build-models.mjs at three levels of detail. Most are
// one model; scanned sets (rocks, ferns, grass...) hold several variants, named v0, v1... in the file.

export type ModelName = keyof typeof manifest;
/** Our own looks (the models built in code); `real` keeps the scanned model's own material and textures. */
export type Look = "rock" | "flower" | "real";
/** One drawable part; `real` parts carry their whole material. */
export type Part = { geometry: BufferGeometry; look: Look; material?: Material };
/** A variant is a list of parts. */
export type Variant = Part[];
/** A model's variants at LOD0, LOD1, LOD2. */
export type Tiers = [Variant[], Variant[], Variant[]];
export type Models = Record<ModelName, Tiers>;

const OUR_LOOKS = new Set(["rock", "flower"]);

/**
 * Bake the glTF node transform into the geometry, in plain floats: the files are quantised (positions stored as
 * small integers with a scale on the node), but instancing and the wind shader need real positions.
 */
function bake(mesh: Mesh) {
  const g = mesh.geometry.clone();
  for (const name of ["position", "normal"]) {
    const a = g.getAttribute(name);
    if (!a) continue;
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) out.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
    g.setAttribute(name, new Float32BufferAttribute(out, 3));
  }
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

/** The variant a mesh belongs to: its nearest ancestor named v<k>, or 0. */
function variantOf(o: Object3D) {
  for (let p: Object3D | null = o; p; p = p.parent) {
    const m = /^v(\d+)/.exec(p.name);
    if (m) return Number(m[1]);
  }
  return 0;
}

function variantsOf(root: Object3D): Variant[] {
  root.updateMatrixWorld(true);
  const variants: Variant[] = [];
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const material = o.material as MeshStandardMaterial;
    // Blended leaves and grass sort badly when instanced (they turn dark); a cut-out edge is crisp and sorts correctly.
    if (material.transparent) {
      material.transparent = false;
      material.alphaTest = 0.5;
      material.depthWrite = true;
    }
    const ours = OUR_LOOKS.has(material.name);
    const part: Part = ours
      ? { geometry: bake(o), look: material.name as Look }
      : { geometry: bake(o), look: "real", material };
    (variants[variantOf(o)] ??= []).push(part);
  });
  return variants.filter(Boolean);
}

/** Load every model at the tiers this device uses. Phones never load LOD0 (they use LOD1 as their best). */
export async function loadModels(phone: boolean): Promise<Models> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const files = new Map<string, Promise<Variant[]>>(); // each file once, even where a tier stands in for another
  const load = (url: string) => {
    if (!files.has(url)) files.set(url, loader.loadAsync(url).then((gltf) => variantsOf(gltf.scene)));
    return files.get(url)!;
  };
  const names = Object.keys(manifest) as ModelName[];
  const entries = await Promise.all(
    names.map(async (name) => {
      const tiers = await Promise.all([0, 1, 2].map((i) => load(`/models/${name}-lod${phone && i === 0 ? 1 : i}.glb`)));
      return [name, tiers as Tiers] as const;
    }),
  );
  return Object.fromEntries(entries) as Models;
}
