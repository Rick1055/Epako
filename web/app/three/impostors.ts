import {
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  type Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from "three";

import cards from "./impostors.json";

// Distant trees as impostors (scripts/assets/bake_impostor.py): Blender renders the full-detail model to a
// transparent picture, and here each tree is two crossed cards carrying it. Almost no triangles, and they look
// like the real tree. Unlit: the light is already in the picture; the scene's mist still applies.

export type ImpostorName = keyof typeof cards;
type Card = { file: string; view: string; width: number; height: number };

export async function loadImpostors(): Promise<Record<string, Texture>> {
  const loader = new TextureLoader();
  const files = Object.values(cards).flatMap((list) => (list as Card[]).map((c) => c.file));
  const textures = await Promise.all(
    files.map(async (file) => {
      const t = await loader.loadAsync(`/textures/${file}`);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      return [file, t] as const;
    }),
  );
  return Object.fromEntries(textures);
}

/**
 * One colour every impostor is multiplied by: white in the morning, a dusky blue-grey in the evening (World eases it
 * with the lamps), so the unlit pictures dim with the light around them instead of glowing like cut-outs at dusk.
 */
export const impostorLight = new Color(1, 1, 1);

/** A card standing on its base, facing +z (or turned a quarter for the side view). */
function card(c: Card, turned: boolean) {
  const g: BufferGeometry = new PlaneGeometry(c.width, c.height).translate(0, c.height / 2 - c.height * 0.02, 0);
  return turned ? g.rotateY(Math.PI / 2) : g;
}

/**
 * Instanced impostor trees. A model with front and side pictures crosses them; one with a single picture per tree
 * (each fir of the set) crosses that picture with itself. `variant` picks the tree when there are several.
 */
export function impostorTrees(name: ImpostorName, textures: Record<string, Texture>, placed: { matrix: Matrix4; variant?: number }[], tint = 1) {
  const group = new Group();
  const list = cards[name] as Card[];
  const fronts = list.filter((c) => c.view === "front");
  const side = list.find((c) => c.view === "side");
  fronts.forEach((front, k) => {
    const mine = placed.filter((p) => (p.variant ?? 0) % fronts.length === k);
    if (!mine.length) return;
    const pairs: [Card, boolean][] = side ? [[front, false], [side, true]] : [[front, false], [front, true]];
    for (const [c, turned] of pairs) {
      const material = new MeshBasicMaterial({ map: textures[c.file], alphaTest: 0.5, side: DoubleSide, transparent: false });
      material.color = tint === 1 ? impostorLight : new Color().setScalar(tint);
      const mesh = new InstancedMesh(card(c, turned), material, mine.length);
      mine.forEach((p, i) => mesh.setMatrixAt(i, p.matrix));
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  });
  return group;
}
