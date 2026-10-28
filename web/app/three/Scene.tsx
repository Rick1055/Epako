import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { use, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BackSide, Color, DirectionalLight, Fog, HemisphereLight, type Mesh, PerspectiveCamera, Plane, Raycaster, ShaderMaterial, Vector2, Vector3 } from "three";

import { createMaterials, tickMaterials, wind } from "./materials";
import { loadModels, type Models } from "./models";
import { LIGHT, type Light } from "./palette";
import { listenToPointer, pointer } from "./pointer";
import { loadImpostors } from "./impostors";
import { loadSurfaces } from "./surfaces";
import { STOPS, type StopId } from "./stops";
import { Birds } from "./Birds";
import { skylineGeometry, skylineMaterial } from "./skyline";
import { Tree } from "./Tree";
import { World } from "./World";

export type SceneProps = {
  stop: StopId;
  theme: "light" | "dark";
  /** False when the tab is hidden: nothing is drawn. Otherwise the scene draws continuously (off-screen objects are culled). */
  active: boolean;
  /** Clinician screens: no pointer play. */
  still: boolean;
  /** Called once the camera has arrived at a stop and that view has been drawn. */
  onSettled: (stop: StopId) => void;
  /** The device can't keep up: show the still picture instead. */
  onFallback: () => void;
  /** The browser took the drawing context away (it can, while the person is in another app): build the scene afresh. */
  onLost: () => void;
};

/** Unhurried, so the walk between places is felt and the next area has time to load. */
const WALK_SECONDS = 2.8;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** After an idle spell the first frame's time step is huge; animations use this so nothing snaps. */
const step = (dt: number) => Math.min(dt, 1 / 30);

/**
 * Composition by view offset: render part of a larger virtual frame centred on the subject, so the subject lands
 * at an exact place on screen without changing the perspective. Wide screens: the subject at ~78% of the width
 * (the words have the misty left). Narrow screens: the subject in the upper part, above the words.
 */
function frame(camera: PerspectiveCamera, w: number, h: number) {
  const wide = w >= 960 && w / h > 1.15;
  const full = wide ? [w * 1.56, h] : [w, h * 1.5];
  if (camera.view?.enabled && camera.view.fullWidth === full[0] && camera.view.fullHeight === full[1] && camera.aspect === full[0] / full[1]) return;
  camera.setViewOffset(full[0], full[1], 0, wide ? 0 : h * 0.55, w, h);
}

/** Walks the camera between stops (interruptible: a new stop starts from wherever it is now). */
function Rig({ stop, focus, onSettled }: Pick<SceneProps, "stop" | "onSettled"> & { focus: Vector3 }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const [base] = useState(() => new Vector3(...STOPS[stop].camera));
  const walk = useRef({
    fromPos: new Vector3(...STOPS[stop].camera),
    fromTarget: new Vector3(...STOPS[stop].target),
    toPos: new Vector3(...STOPS[stop].camera),
    toTarget: new Vector3(...STOPS[stop].target),
    start: -1e9 as number | null, // the first stop is already "arrived"; null = start on the next frame
    settled: false,
    stop,
  });

  useEffect(() => {
    const w = walk.current;
    if (w.stop === stop) return;
    w.fromPos.copy(base);
    w.fromTarget.copy(focus);
    w.toPos.set(...STOPS[stop].camera);
    w.toTarget.set(...STOPS[stop].target);
    w.start = null;
    w.settled = false;
    w.stop = stop;
  }, [stop, base, focus]);

  useFrame(({ clock }) => {
    const w = walk.current;
    if (w.start === null) w.start = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - w.start) / WALK_SECONDS);
    const k = easeInOut(t);
    base.lerpVectors(w.fromPos, w.toPos, k);
    focus.lerpVectors(w.fromTarget, w.toTarget, k);
    frame(camera as PerspectiveCamera, size.width, size.height);
    camera.position.copy(base);
    camera.lookAt(focus);
    if (t === 1 && !w.settled) {
      w.settled = true;
      requestAnimationFrame(() => onSettled(w.stop)); // after this frame has been drawn
    }
  });
  return null;
}

/** A sky dome: deep at the top, paler toward the horizon, with a soft glow round the sun. Not in the haze. */
function skyMaterial(l: Light) {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { zenith: { value: new Color(l.zenith) }, horizon: { value: new Color(l.horizon) }, sunDir: { value: new Vector3(...l.sunPosition).normalize() } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 zenith, horizon, sunDir; varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir); // per pixel, or the sphere's rings show as steps
        float up = smoothstep(-0.02, 0.5, dir.y);
        vec3 col = mix(horizon, zenith, pow(up, 0.8));
        col += horizon * 0.35 * pow(max(dot(dir, sunDir), 0.0), 6.0) * (1.0 - up);
        // A whisper of noise breaks the 8-bit steps a smooth gradient otherwise shows as bands.
        col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Morning and evening light, sky and haze, easing from one to the other over about 600ms. The sun follows the focus so its shadows stay crisp. */
function Lights({ theme, focus, shadows, lantern }: { theme: SceneProps["theme"]; focus: Vector3; shadows: boolean; lantern: { current: number } }) {
  const sun = useRef<DirectionalLight>(null!);
  const hemi = useRef<HemisphereLight>(null!);
  const dome = useRef<Mesh>(null!);
  const scene = useThree((s) => s.scene);
  // Frozen at mount: if these props followed the theme, React would snap the lights and skip the easing below.
  const [first] = useState(() => LIGHT[theme]);
  const sky = useMemo(() => skyMaterial(first), [first]);
  const city = useMemo(() => ({ geometry: skylineGeometry(), material: skylineMaterial(first.city, first.cityFade) }), [first]);
  const goal = useMemo(() => ({ c: new Color(), dir: new Vector3(...first.sunPosition), want: new Vector3() }), [first]);
  useLayoutEffect(() => {
    scene.fog = new Fog(first.haze, first.hazeNear, first.hazeFar);
    scene.add(sun.current.target);
  }, [scene, first]);

  useFrame(({ camera }, dt) => {
    const l = LIGHT[theme];
    const k = 1 - Math.exp(-step(dt) * 7); // ~600ms to settle
    const fog = scene.fog as Fog;
    fog.color.lerp(goal.c.set(l.haze), k);
    fog.near += (l.hazeNear - fog.near) * k;
    fog.far += (l.hazeFar - fog.far) * k;
    sky.uniforms.zenith.value.lerp(goal.c.set(l.zenith), k);
    sky.uniforms.horizon.value.lerp(goal.c.set(l.horizon), k);
    sky.uniforms.sunDir.value.copy(goal.dir).normalize();
    dome.current.position.copy(camera.position);
    sun.current.color.lerp(goal.c.set(l.sun), k);
    sun.current.intensity += (l.sunIntensity - sun.current.intensity) * k;
    goal.dir.lerp(goal.want.set(...l.sunPosition), k);
    sun.current.position.copy(focus).add(goal.dir);
    sun.current.target.position.copy(focus);
    hemi.current.color.lerp(goal.c.set(l.hemiSky), k);
    hemi.current.groundColor.lerp(goal.c.set(l.hemiGround), k);
    hemi.current.intensity += (l.hemiIntensity - hemi.current.intensity) * k;
    lantern.current += (l.lantern - lantern.current) * k;
    // The city fades into the same horizon colour as the sky behind it; its windows light with the lamps.
    const u = city.material.uniforms;
    u.uWall.value.lerp(goal.c.set(l.city), k);
    u.uHaze.value.copy(sky.uniforms.horizon.value);
    u.uFade.value += (l.cityFade - u.uFade.value) * k;
    u.uLit.value = lantern.current;
  });

  return (
    <>
      <directionalLight
        ref={sun}
        color={first.sun}
        intensity={first.sunIntensity}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-3.5}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <hemisphereLight ref={hemi} args={[first.hemiSky, first.hemiGround, first.hemiIntensity]} />
      <mesh ref={dome} material={sky} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[70, 48, 32]} />
      </mesh>
      <mesh geometry={city.geometry} material={city.material} />
    </>
  );
}

/**
 * Watches the frame rate in 2-second windows of continuous drawing (after a 3-second warm-up, taken again each time
 * the tab comes back, while the graphics wake up). Below 40 fps: draw at a lower resolution. Below 25 fps at that
 * resolution: show the still picture instead (integrated graphics run this garden at 37 to 55 fps, which is fine).
 */
function Quality({ onFallback, active }: Pick<SceneProps, "onFallback" | "active">) {
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const m = useRef({ warm: 0, time: 0, frames: 0, drops: 0 });
  useEffect(() => {
    if (active) Object.assign(m.current, { warm: 0, time: 0, frames: 0 });
  }, [active]);
  useFrame((_, dt) => {
    const s = m.current;
    if (dt > 0.25) return; // a gap between bursts of drawing is not slowness
    if (s.warm < 3) return void (s.warm += dt);
    s.time += dt;
    s.frames += 1;
    if (s.time < 2) return;
    const fps = s.frames / s.time;
    s.time = 0;
    s.frames = 0;
    // Development only: what the scene costs, for scripts/review tools (?keep-garden turns the fallback off).
    if (import.meta.env.DEV) {
      (window as unknown as { gardenStats: object }).gardenStats = { fps, calls: gl.info.render.calls, triangles: gl.info.render.triangles };
      (window as unknown as { gardenScene: object }).gardenScene = scene;
      if (location.search.includes("keep-garden")) return;
    }
    if (fps >= (s.drops ? 25 : 40)) return;
    s.drops += 1;
    if (s.drops === 1) setDpr(1);
    else onFallback();
  });
  return null;
}

/** Where the pointer meets the ground, for the plants to part around (not on still screens). */
function PointerOnGround({ still }: { still: boolean }) {
  const ray = useMemo(() => ({ caster: new Raycaster(), ground: new Plane(new Vector3(0, 1, 0), 0), hit: new Vector3(), at: new Vector2() }), []);
  useFrame(({ camera }, dt) => {
    const moving = !still && performance.now() - pointer.moved < 900;
    if (moving) {
      ray.caster.setFromCamera(ray.at.set(pointer.x, pointer.y), camera);
      if (ray.caster.ray.intersectPlane(ray.ground, ray.hit)) wind.uPointer.value.copy(ray.hit);
    }
    tickMaterials(dt, moving);
  });
  return null;
}

// Loaded once per visit: the models at the tiers this device uses, and the material textures.
let assets: Promise<[Models, Awaited<ReturnType<typeof loadSurfaces>>, Awaited<ReturnType<typeof loadImpostors>>]> | null = null;

function Garden({ stop, theme, still, onSettled, phone }: Omit<SceneProps, "active" | "onFallback" | "onLost"> & { phone: boolean }) {
  const [loaded, surfaces, cards] = use((assets ??= Promise.all([loadModels(phone), loadSurfaces(), loadImpostors()])));
  const [focus] = useState(() => new Vector3(...STOPS[stop].target));
  const lantern = useRef(theme === "dark" ? 1 : 0);
  const materials = useMemo(() => createMaterials(surfaces), [surfaces]);
  const density = phone ? 0.5 : 1;
  useEffect(listenToPointer, []);
  return (
    <>
      <PointerOnGround still={still} />
      <Rig stop={stop} focus={focus} onSettled={onSettled} />
      <Lights theme={theme} focus={focus} shadows={!phone} lantern={lantern} />
      <World models={loaded} materials={materials} cards={cards} density={density} lantern={lantern} />
      <Tree models={loaded} />
      <Birds />
    </>
  );
}

/** Tells the host when the browser takes the drawing context away. */
function ContextWatch({ onLost }: Pick<SceneProps, "onLost">) {
  const canvas = useThree((s) => s.gl.domElement);
  useEffect(() => {
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [canvas, onLost]);
  return null;
}

export default function Scene({ active, onFallback, onLost, ...garden }: SceneProps) {
  // Phones and touch tablets: lighter models (LOD1 at best), half the plants, no shadows.
  const [phone] = useState(() => matchMedia("(pointer: coarse)").matches);
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.25]}
      flat
      shadows={phone ? false : "percentage"}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 38, near: 0.05, far: 160, position: STOPS[garden.stop].camera }}
      style={{ pointerEvents: "none" }}
    >
      <Quality onFallback={onFallback} active={active} />
      <ContextWatch onLost={onLost} />
      <Garden {...garden} phone={phone} />
    </Canvas>
  );
}
