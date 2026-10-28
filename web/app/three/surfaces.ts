import { DoubleSide, LinearSRGBColorSpace, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture, TextureLoader } from "three";

// Real material textures (CC0, ambientCG; public/textures, fetched by scripts/assets/fetch_textures.py), projected
// "triplanar": sampled along all three world axes and blended by which way the surface faces, so the ground and
// stones take the texture without stretched or broken UVs.

export type Surface = { color: Texture; normal: Texture };
export type SurfaceName = "paving" | "moss" | "rock" | "lawn" | "gravel" | "wood";

export async function loadSurfaces(): Promise<Record<SurfaceName, Surface>> {
  const loader = new TextureLoader();
  const names: SurfaceName[] = ["paving", "moss", "rock", "lawn", "gravel", "wood"];
  const load = async (url: string, colour: boolean) => {
    const t = await loader.loadAsync(url);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.colorSpace = colour ? SRGBColorSpace : LinearSRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const entries = await Promise.all(
    names.map(async (n) => [n, { color: await load(`/textures/${n}-color.webp`, true), normal: await load(`/textures/${n}-normal.webp`, false) }] as const),
  );
  return Object.fromEntries(entries) as Record<SurfaceName, Surface>;
}

/**
 * A textured surface. `base` everywhere; `over` (moss) settles on the faces that look up, in natural patches,
 * `over` amount 0..1. `scale`: texture repeats per metre. Vertex colours multiply in (Blender's baked occlusion).
 * `flat`: the ground and the path barely tilt, so one top-down projection does instead of three (a third of the
 * texture reads on the surfaces that fill most of the screen; integrated graphics are limited by exactly that).
 */
export function surfaceMaterial(o: { base: Surface; over?: Surface; amount?: number; scale: number; overScale?: number; roughness?: number; bothSides?: boolean; flat?: boolean }) {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.92, metalness: 0, ...(o.bothSides && { side: DoubleSide }) });
  const over = o.over ?? o.base;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tBaseColor: { value: o.base.color },
      tBaseNormal: { value: o.base.normal },
      tOverColor: { value: over.color },
      tOverNormal: { value: over.normal },
      tScale: { value: o.scale },
      tOverScale: { value: o.overScale ?? o.scale },
      tOver: { value: o.over ? (o.amount ?? 0.5) : 0 },
    });
    shader.vertexShader =
      "varying vec3 vTpPos;\nvarying vec3 vTpNormal;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 tpWorld = vec4(transformed, 1.0);
        vec3 tpNormal = objectNormal;
        #ifdef USE_INSTANCING
          tpWorld = instanceMatrix * tpWorld;
          tpNormal = mat3(instanceMatrix) * tpNormal;
        #endif
        vTpPos = (modelMatrix * tpWorld).xyz;
        vTpNormal = normalize(mat3(modelMatrix) * tpNormal);`,
      );
    shader.fragmentShader =
      `varying vec3 vTpPos;
      varying vec3 vTpNormal;
      uniform sampler2D tBaseColor, tBaseNormal, tOverColor, tOverNormal;
      uniform float tScale, tOverScale, tOver;
      vec3 triColour(sampler2D t, vec3 p, vec3 w) {
        #ifdef TP_FLAT
          return texture2D(t, p.xz).rgb;
        #else
          return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z;
        #endif
      }
      // Each projection's tangent-space normal turned into world space (the "UDN" blend), weighted by facing.
      vec3 triNormal(sampler2D t, vec3 p, vec3 w) {
        #ifdef TP_FLAT
          vec3 nf = texture2D(t, p.xz).xyz * 2.0 - 1.0;
          return vec3(nf.x, 0.0, nf.y);
        #endif
        vec3 nx = texture2D(t, p.zy).xyz * 2.0 - 1.0;
        vec3 ny = texture2D(t, p.xz).xyz * 2.0 - 1.0;
        vec3 nz = texture2D(t, p.xy).xyz * 2.0 - 1.0;
        return vec3(0.0, nx.y, nx.x) * w.x + vec3(ny.x, 0.0, ny.y) * w.y + vec3(nz.x, nz.y, 0.0) * w.z;
      }
      ` +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          vec3 tpN = normalize(vTpNormal);
          vec3 tpW = pow(abs(tpN), vec3(4.0));
          tpW /= (tpW.x + tpW.y + tpW.z);
          #ifdef TP_FLAT
            tpW = vec3(0.0, 1.0, 0.0);
          #endif
          float tpPatch = 0.5 + 0.5 * sin(vTpPos.x * 3.1 + sin(vTpPos.z * 2.3)) * sin(vTpPos.z * 2.7 + vTpPos.y * 1.7);
          float tpOver = tOver > 0.0 ? smoothstep(0.2, 0.62, tpN.y + (tpPatch - 0.5) * 0.55 + tOver - 0.5) : 0.0;
          vec3 tpColour = mix(triColour(tBaseColor, vTpPos * tScale, tpW), triColour(tOverColor, vTpPos * tOverScale, tpW), tpOver);
          diffuseColor.rgb *= tpColour;`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          vec3 tpDetail = mix(triNormal(tBaseNormal, vTpPos * tScale, tpW), triNormal(tOverNormal, vTpPos * tOverScale, tpW), tpOver);
          normal = normalize((viewMatrix * vec4(normalize(tpN + tpDetail), 0.0)).xyz);`,
        );
  };
  if (o.flat) m.defines = { TP_FLAT: "" };
  m.customProgramCacheKey = () => `surface-${o.scale}-${o.overScale}-${o.amount}-${!!o.over}-${!!o.bothSides}-${!!o.flat}`;
  return m;
}
