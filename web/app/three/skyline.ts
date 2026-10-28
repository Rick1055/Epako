import { BoxGeometry, type BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial } from "three";

import { merge, seeded } from "./kit";

// The city round the park, far off: buildings in a ring past the lawns' edge, the way Central Park sits inside
// Manhattan. One mesh, outside the haze (the haze would hide it at this distance); the shader paints the windows and
// fades the whole skyline toward the horizon colour, so it reads as far away. In the evening, scattered windows are lit.

/** Centre and radius of the ring, and how many buildings. */
const CENTRE: [number, number] = [0, -18];
const RADIUS: [number, number] = [86, 100];
const COUNT = 170;

/** New York facades: brownstone and red brick, limestone, pale stone, grey concrete, and dark glass towers. */
const FACADES = ["#9C6B55", "#B07E62", "#C9BFA9", "#D8CDB6", "#A3A7AB", "#8E949B"];
const GLASS = "#7A8C9C";

export function skylineGeometry() {
  const rnd = seeded(77);
  const parts: BufferGeometry[] = [];
  const colour = new Color();
  /** One block: its windows counted in uv (a storey every 1.6 m, a bay every 1.4 m: the city is drawn smaller than life). */
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, turn: number, look: { wall: string; glass: number; window: number; seed: number }) => {
    const g = new BoxGeometry(w, h, d).toNonIndexed();
    const uv = g.attributes.uv;
    const normal = g.attributes.normal;
    for (let k = 0; k < uv.count; k++) {
      const across = Math.abs(normal.getX(k)) > 0.5 ? d : w;
      uv.setXY(k, uv.getX(k) * Math.round(across / 1.4), uv.getY(k) * Math.round(h / 1.6));
    }
    colour.set(look.wall);
    const n = uv.count;
    g.setAttribute("wall", new Float32BufferAttribute(Array.from({ length: n }, () => [colour.r, colour.g, colour.b]).flat(), 3));
    // x: glass tower (0 or 1), y: how much of each bay is window, z: a seed for which windows are lit.
    g.setAttribute("look", new Float32BufferAttribute(Array.from({ length: n }, () => [look.glass, look.window, look.seed]).flat(), 3));
    g.rotateY(-turn).translate(x, y, z);
    parts.push(g);
  };
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2 + (rnd() - 0.5) * 0.03;
    const r = RADIUS[0] + rnd() * (RADIUS[1] - RADIUS[0]);
    const x = CENTRE[0] + Math.cos(a) * r;
    const z = CENTRE[1] + Math.sin(a) * r;
    const w = 5 + rnd() * 7;
    const d = 5 + rnd() * 7;
    // Mostly mid-rise, a few towers: low on the horizon, as the city looks from inside the park.
    const tower = rnd() < 0.15;
    const h = tower ? 20 + rnd() * 8 : 7 + rnd() * 9;
    const glass = tower && rnd() < 0.6 ? 1 : 0;
    const look = { wall: glass ? GLASS : FACADES[Math.floor(rnd() * FACADES.length)], glass, window: 0.35 + rnd() * 0.35, seed: rnd() * 100 };
    block(w, h, d, x, h / 2 - 6, z, a, look);
    // Setbacks: many older towers step in near the top, with a smaller block above.
    if (!glass && rnd() < 0.45) {
      const top = 2 + rnd() * 4;
      block(w * 0.6, top, d * 0.6, x, h - 6 + top / 2, z, a, look);
    }
  }
  return merge(parts);
}

export function skylineMaterial(wall: string, fade: number) {
  return new ShaderMaterial({
    fog: false,
    uniforms: {
      uWall: { value: new Color(wall) },
      uHaze: { value: new Color() },
      uFade: { value: fade },
      uLit: { value: 0 },
    },
    vertexShader: `attribute vec3 wall; attribute vec3 look;
      varying vec2 vUv; varying vec3 vWall; varying vec3 vLook; varying vec3 vNormal;
      void main() {
        vUv = uv; vWall = wall; vLook = look; vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 uWall, uHaze; uniform float uFade, uLit;
      varying vec2 vUv; varying vec3 vWall; varying vec3 vLook; varying vec3 vNormal;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main() {
        // Faces turned to the light are brighter, roofs brightest; uWall tints the whole city for the time of day.
        float face = 0.72 + 0.28 * dot(normalize(vNormal), normalize(vec3(0.6, 1.0, 0.4)));
        vec3 col = vWall * uWall * face;
        vec2 cell = floor(vUv);
        vec2 f = fract(vUv);
        float side = abs(vNormal.y) < 0.5 ? 1.0 : 0.0;
        float hw = vLook.y * 0.5;
        // Stone and brick: separate windows; glass towers: continuous bands of glass with thin spandrels between floors.
        float punched = step(0.5 - hw, f.x) * step(f.x, 0.5 + hw) * step(0.28, f.y) * step(f.y, 0.85);
        float band = step(0.18, f.y);
        float glass = side * mix(punched, band, vLook.x);
        col = mix(col, col * 0.5 + vec3(0.03, 0.05, 0.08) + vLook.x * 0.06 * f.x, glass * (0.85 - vLook.x * 0.3));
        float lit = side * punched * step(0.78, hash(cell + vLook.z)) * uLit;
        col = mix(col, vec3(1.0, 0.82, 0.55), lit * 0.7);
        gl_FragColor = vec4(mix(col, uHaze, uFade * (1.0 - lit * 0.6)), 1.0);
      }`,
  });
}
