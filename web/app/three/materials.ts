import { CanvasTexture, Color, DoubleSide, MeshStandardMaterial, RepeatWrapping, Vector3 } from "three";

import { seeded } from "./kit";
import { PLANT } from "./palette";
import { signals } from "./store";
import { type Surface, type SurfaceName, surfaceMaterial } from "./surfaces";

/**
 * Shared uniforms for every swaying material: time advances with each drawn frame; uPointer is where the pointer meets
 * the ground and uPush how strongly the plants there part around it (eases in while the pointer moves, out at rest).
 */
export const wind = { uTime: { value: 0 }, uVoice: { value: 0 }, uPointer: { value: new Vector3(0, 0, 1e3) }, uPush: { value: 0 } };

/**
 * Sway in the wind: each vertex moves in proportion to the square of its height above the plant's base (so roots
 * stay put), out of phase from one plant to the next. While the person speaks, the sway grows with their voice
 * (DESIGN.md: grass and snowdrops say "I can hear you"). `part`: how far a plant leans away from the pointer passing
 * over it (a tilt; 1 = by its own height), so the lawn parts like grass brushed by a hand. The trees don't.
 */
export function windy(material: MeshStandardMaterial, strength: number, hears = false, part = 0) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uVoice = hears ? wind.uVoice : { value: 0 };
    shader.uniforms.uWind = { value: strength };
    shader.uniforms.uPointer = wind.uPointer;
    shader.uniforms.uPush = wind.uPush;
    shader.uniforms.uPart = { value: part };
    shader.vertexShader =
      "uniform float uTime;\nuniform float uWind;\nuniform float uVoice;\nuniform vec3 uPointer;\nuniform float uPush;\nuniform float uPart;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float windH = max(position.y, 0.0);
        vec3 windSeat = vec3(0.0);
        #ifdef USE_INSTANCING
          windSeat = instanceMatrix[3].xyz;
        #endif
        float windPh = dot(windSeat.xz, vec2(1.7, 1.1));
        float windAmp = uWind * (1.0 + uVoice * 3.0);
        float windSway = sin(uTime * (1.4 + uVoice * 4.0) + windPh) * 0.65 + sin(uTime * 2.3 + windPh * 1.9) * 0.35;
        transformed.x += windSway * windAmp * windH * windH;
        transformed.z += cos(uTime * 1.1 + windPh * 1.3) * 0.35 * windAmp * windH * windH;
        // Parting under the pointer: worked out in the world, then turned back into the plant's own frame.
        mat3 windFrame = mat3(1.0);
        #ifdef USE_INSTANCING
          windFrame = mat3(instanceMatrix);
        #endif
        float windScale = length(windFrame[0]);
        vec2 fromPointer = (modelMatrix * vec4(windSeat, 1.0)).xz - uPointer.xz;
        float windBend = smoothstep(0.7, 0.05, length(fromPointer)) * uPush * uPart;
        vec3 away = vec3(normalize(fromPointer + 1e-4).x, 0.0, normalize(fromPointer + 1e-4).y);
        transformed += transpose(windFrame) * away / (windScale * windScale) * windBend * windH * windScale;
        transformed.y -= windBend * windH * 0.3;`,
      );
  };
  material.customProgramCacheKey = () => `wind-${strength}-${hears}-${part}`;
  return material;
}

const base = { vertexColors: true, roughness: 0.9, metalness: 0 } as const;

/** Falling water: fine vertical streaks of differing strength on clear, repeated round the sheet. */
function streaks() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const c = canvas.getContext("2d")!;
  const rnd = seeded(5);
  for (let i = 0; i < 48; i++) {
    const y = rnd() * 128;
    c.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.55})`;
    c.fillRect(Math.floor(rnd() * 64), y - 128, 1 + Math.floor(rnd() * 2), 40 + rnd() * 90);
    c.fillRect(Math.floor(rnd() * 64), y, 1, 30 + rnd() * 60);
  }
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(12, 1);
  return t;
}

export function createMaterials(s: Record<SurfaceName, Surface>) {
  return {
    // Real textures (surfaces.ts).
    // The stepping stones: plain worn stone, no moss, so they show in the lawn.
    rock: surfaceMaterial({ base: s.rock, scale: 1.1, roughness: 0.95 }),
    ground: surfaceMaterial({ base: s.lawn, over: s.moss, amount: 0.12, scale: 1.1, overScale: 1.4, flat: true }),
    paving: surfaceMaterial({ base: s.paving, scale: 0.85, roughness: 0.95, flat: true }),
    // The fountain: pale dressed stone (the rock picture is dark, so lifted well above white); its water, a still,
    // glossy teal; the water spilling over the rims, thin running streaks (World scrolls them down).
    fountain: Object.assign(surfaceMaterial({ base: s.rock, scale: 1.6, roughness: 0.85 }), { color: new Color(PLANT.stoneLight).multiplyScalar(1.6) }),
    water: new MeshStandardMaterial({ color: PLANT.water, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.85 }),
    falling: new MeshStandardMaterial({ color: PLANT.waterFall, map: streaks(), roughness: 0.2, transparent: true, side: DoubleSide, depthWrite: false }),
    // Drawn a little toward the camera: the lawn between its coarser grid points would otherwise poke through on the rolls.
    gravel: Object.assign(surfaceMaterial({ base: s.gravel, scale: 0.7, roughness: 0.97, flat: true }), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    // Bench slats: painted wood, Central Park green; the bench frames: dark cast iron.
    wood: Object.assign(surfaceMaterial({ base: s.wood, scale: 2.2, roughness: 0.8 }), { color: new Color(PLANT.settee) }),
    iron: new MeshStandardMaterial({ vertexColors: true, color: PLANT.iron, roughness: 0.55, metalness: 0.55 }),
    signPost: new MeshStandardMaterial({ vertexColors: true, color: PLANT.signBoard, roughness: 0.6 }),
    grass: windy(new MeshStandardMaterial({ ...base, side: DoubleSide }), 0.16, true, 0.9),
    flower: windy(new MeshStandardMaterial({ ...base, side: DoubleSide, roughness: 0.75 }), 1.1, true, 0.6),
  };
}
export type Materials = ReturnType<typeof createMaterials>;

/** Called every drawn frame: advance the wind, follow the voice, and ease the parting in while the pointer moves. */
export function tickMaterials(dt: number, pointerMoving: boolean) {
  wind.uTime.value += Math.min(dt, 1 / 30);
  wind.uVoice.value += (signals.voice - wind.uVoice.value) * Math.min(1, dt * 8);
  wind.uPush.value += ((pointerMoving ? 1 : 0) - wind.uPush.value) * Math.min(1, dt * (pointerMoving ? 6 : 1.5));
}
