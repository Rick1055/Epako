// What the asset pipeline builds (build-models.mjs loads this through Vite, so it can use the app's kit).
// Every hero model, its triangle budget for each level of detail, and whether Blender bakes ambient occlusion.
import { type BufferGeometry, Float32BufferAttribute } from "three";

import * as K from "../../app/three/kit";
import { PLANT } from "../../app/three/palette";

/**
 * How a part is drawn at run time (the material name the scene maps to its own materials).
 * rock: a real texture (public/textures) projected in the shader; its vertex colours carry only Blender's baked
 * ambient occlusion. flower: vertex colours.
 */
export type Look = "rock" | "flower";
export type Part = { name: string; look: Look; geometry: BufferGeometry };

/** Decimated by Blender to each budget (triangles for LOD0, LOD1, LOD2). */
export type Sculpted = { name: string; kind: "sculpted"; parts: Part[]; budgets: [number, number, number]; ao: boolean };
/**
 * A scanned or modelled asset from Poly Haven (CC0; scripts/assets/fetch_models.py), with its own textures.
 * `split`: the file is a set of separate variants (each becomes its own, re-centred on its base). `budgets`:
 * triangles per variant for LOD0..2; `textures`: texture size in pixels for each tier.
 */
export type Scanned = {
  name: string;
  kind: "scanned";
  source: string;
  split: boolean;
  budgets: [number, number, number];
  textures: [number, number, number];
  keep?: string[];
  /** Leafy: each leaf becomes one card; the share of leaves kept per tier (budgets then count the wood only). */
  leaves?: [number, number, number];
};
/**
 * An impostor: Blender renders the full-detail model (front and side) to transparent pictures; distant trees are
 * crossed cards carrying them. `split`: the source is a row of separate trees, cut into one picture each.
 */
export type Impostor = { name: string; kind: "impostor"; source: string; split: boolean; pixels: number };
export type Asset = Sculpted | Scanned | Impostor;

/** `keep`: only these objects of the file (by name prefix), e.g. one complete bench out of a set of modules. */
const scanned = (
  name: string,
  source: string,
  split: boolean,
  budgets: [number, number, number],
  textures: [number, number, number] = [512, 256, 128],
  keep?: string[],
  leaves?: [number, number, number],
): Scanned => ({ name, kind: "scanned", source, split, budgets, textures, keep, leaves });

/** White vertex colours, so after Blender's bake they hold only the ambient occlusion (the texture gives the colour). */
function white(g: BufferGeometry) {
  g.setAttribute("color", new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

const sculpted = (name: string, look: Look, geometry: BufferGeometry, budgets: [number, number, number], ao = false): Sculpted => ({
  name,
  kind: "sculpted",
  parts: [{ name, look, geometry: look === "rock" ? white(geometry) : geometry }],
  budgets,
  ao,
});

export function assets(): Asset[] {
  return [
    sculpted("stone-c", "rock", K.stone(3, [1, 0.25, 0.82]), [4000, 1500, 500], true),
    sculpted("snowdrop", "flower", K.snowdrop(), [380, 170, 70]),
    sculpted("hellebore-cream", "flower", K.hellebore(PLANT.helleboreCreamBase, PLANT.helleboreCream), [6000, 2400, 900]),
    sculpted("hellebore-plum", "flower", K.hellebore(PLANT.helleborePlumBase, PLANT.helleborePlum), [6000, 2400, 900]),
    sculpted("cyclamen", "flower", K.cyclamen(), [5000, 2000, 800]),
    // Scanned and modelled plants and props (Poly Haven, CC0).
    // Leafy trees and shrubs: every leaf a card (prepare_scanned.py), the wood decimated to the budget.
    scanned("tree", "island_tree_01", false, [20000, 8000, 3000], [768, 512, 256], undefined, [0.42, 0.24, 0.1]),
    scanned("start-tree", "island_tree_02", false, [18000, 7000, 2500], [768, 512, 256], undefined, [0.55, 0.3, 0.12]),
    scanned("shrubs", "searsia_lucida", true, [10000, 3500, 1200], [768, 512, 256], undefined, [0.8, 0.4, 0.16]),
    scanned("picnic-table", "wooden_picnic_table", false, [6000, 2500, 900], [1024, 512, 256]),
    { name: "tree-card", kind: "impostor", source: "island_tree_01", split: false, pixels: 1024 },
    { name: "tree-card-b", kind: "impostor", source: "island_tree_02", split: false, pixels: 1024 },
    { name: "fir-card", kind: "impostor", source: "fir_sapling_medium", split: true, pixels: 768 },
    scanned("stump", "tree_stump_01", false, [8000, 3000, 1000], [1024, 512, 256]),
    scanned("rocks-a", "rock_moss_set_01", true, [5000, 2000, 700], [1024, 512, 256]),
    scanned("rocks-b", "rock_moss_set_02", true, [5000, 2000, 700], [1024, 512, 256]),
    // Visitors (MakeHuman via MPFB, CC0 assets; scripts/assets/build_person.py): seen across the lawn, not up close.
    scanned("visitor-a", "person_a", false, [9000, 3500, 1200], [512, 256, 128]),
    scanned("visitor-b", "person_b", false, [9000, 3500, 1200], [512, 256, 128]),
    scanned("visitor-c", "person_c", false, [9000, 3500, 1200], [512, 256, 128]),
    scanned("visitor-d", "person_d", false, [9000, 3500, 1200], [512, 256, 128]),
    scanned("visitor-e", "person_e", false, [9000, 3500, 1200], [512, 256, 128]),
    scanned("visitor-f", "person_f", false, [9000, 3500, 1200], [512, 256, 128]),
    scanned("lamp", "street_lamp_01", false, [6000, 2500, 900], [1024, 512, 256]),
    // Leafy models are made of separate leaf cards, which decimation tears apart: their tiers differ in texture size only.
    scanned("ferns", "fern_02", true, [99999, 99999, 99999]),
    scanned("celandine", "celandine_01", true, [99999, 99999, 99999]),
  ];
}
