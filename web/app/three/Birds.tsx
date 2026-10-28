import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, type InstancedMesh, MeshStandardMaterial, Object3D, Vector3 } from "three";

import { PLANT } from "./palette";

// A small flock wheeling slowly over the park (the garden is alive, not abandoned): far-off silhouettes against the
// sky, wings beating in the vertex shader. A body and two wings, about 30 cm across.

const FLOCK = 7;

function bird() {
  // x: across the wings, z: nose forward. Wing tips are the vertices with |x| > 0.05; the shader lifts them.
  const p = [
    // body
    0, 0, 0.12, -0.03, 0, -0.1, 0.03, 0, -0.1,
    // left wing
    -0.03, 0, 0.04, -0.17, 0.01, -0.02, -0.03, 0, -0.05,
    // right wing
    0.03, 0, 0.04, 0.03, 0, -0.05, 0.17, 0.01, -0.02,
  ];
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

function flapping() {
  const m = new MeshStandardMaterial({ color: PLANT.bird, roughness: 1, side: DoubleSide });
  const time = { value: 0 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader =
      "uniform float uTime;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float tip = smoothstep(0.04, 0.17, abs(position.x));
        float phase = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
        transformed.y += sin(uTime * 9.0 + phase) * 0.09 * tip;`,
      );
  };
  return { m, time };
}

export function Birds() {
  const mesh = useRef<InstancedMesh>(null!);
  const { geometry, material, time, offsets } = useMemo(() => {
    const { m, time } = flapping();
    // Loose formation: each bird's place in the flock and its own small drift.
    const offsets = Array.from({ length: FLOCK }, (_, i) => new Vector3(((i % 3) - 1) * 0.9 + Math.sin(i * 7.1) * 0.4, Math.cos(i * 3.3) * 0.5, -Math.floor(i / 2) * 0.8));
    return { geometry: bird(), material: m, time, offsets };
  }, []);
  const tmp = useMemo(() => ({ o: new Object3D(), centre: new Vector3(), ahead: new Vector3(), side: new Vector3(), look: new Vector3() }), []);

  useFrame((_, dt) => {
    time.value += Math.min(dt, 1 / 30);
    const t = time.value * 0.035; // one slow circuit in about three minutes
    // A wide loop over the park, high enough to read as sky, dipping and rising a little.
    tmp.centre.set(Math.cos(t) * 16, 8 + Math.sin(t * 2.3) * 1.2, -16 + Math.sin(t) * 22);
    tmp.ahead.set(-Math.sin(t) * 16, 0, Math.cos(t) * 22).normalize();
    tmp.side.set(tmp.ahead.z, 0, -tmp.ahead.x);
    offsets.forEach((off, i) => {
      const bob = Math.sin(time.value * 0.7 + i) * 0.25;
      tmp.o.position.copy(tmp.centre).addScaledVector(tmp.side, off.x).addScaledVector(tmp.ahead, off.z).setY(tmp.centre.y + off.y + bob);
      tmp.o.lookAt(tmp.look.copy(tmp.o.position).add(tmp.ahead));
      tmp.o.scale.setScalar(1.6);
      tmp.o.updateMatrix();
      mesh.current.setMatrixAt(i, tmp.o.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, FLOCK]} frustumCulled={false} />;
}
