import { useMemo } from "react";
import { Group, LOD, Mesh, type MeshStandardMaterial } from "three";

import { windy } from "./materials";
import type { Models } from "./models";
import { groundHeight, TREE } from "./World";

function build(models: Models) {
  const lod = new LOD();
  models.tree.forEach((variants, i) => {
    const level = new Group();
    for (const part of variants.flat()) {
      const m = part.material as MeshStandardMaterial;
      // Leaves (alpha-cut cards) stir in the breeze; the trunk and branches stay put, pointer or not.
      const mesh = new Mesh(part.geometry, m.alphaTest > 0 || m.transparent ? windy(m, 0.0016) : m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      level.add(mesh);
    }
    lod.addLevel(level, [0, 10, 18][i]);
  });
  return lod;
}

/** The tree on the lawn left of the walk in the clearing: the person's progress. */
export function Tree({ models }: { models: Models }) {
  const lod = useMemo(() => build(models), [models]);
  return <primitive object={lod} position={[TREE.x, groundHeight(TREE.x, TREE.z), TREE.z]} />;
}
