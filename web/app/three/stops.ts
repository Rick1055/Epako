// DESIGN.md, the winter garden: every page is a stop on one path. Camera position and the point it looks at,
// in metres. The paved walk runs from the start (z = 0) down -z past the clearing with the tree (left of the walk,
// z = -18) to the fork (z = -25). On wide screens the subject is framed on the right (Scene.tsx frame()).
export type Vec3 = [number, number, number];
export type Stop = { camera: Vec3; target: Vec3 };

export const STOPS = {
  gate: { camera: [-0.35, 1.05, 5.9], target: [1.7, 0.6, 2.3] },
  path: { camera: [0.15, 1.05, -2.4], target: [0.7, 0.3, -6.2] },
  stone1: { camera: [0.1, 1.1, -7.0], target: [1.7, 0.05, -9.2] },
  stone2: { camera: [0.1, 1.1, -8.2], target: [1.9, 0.05, -10.4] },
  stone3: { camera: [0.1, 1.1, -9.4], target: [2.1, 0.05, -11.6] },
  border: { camera: [0.3, 1.0, -10.6], target: [-1.5, 0.4, -13.4] },
  hedgewalk: { camera: [-0.3, 1.0, -10.8], target: [1.5, 0.3, -13.6] },
  clearing: { camera: [1.6, 1.4, -13.4], target: [-2.6, 1.3, -18.2] },
  summary: { camera: [0.5, 1.2, -15.0], target: [-2.6, 1.6, -18.0] },
  bench: { camera: [-1.0, 1.2, -13.9], target: [1.35, 0.5, -17.6] },
  ferns: { camera: [0.3, 1.1, -15.4], target: [-2.8, 0.4, -18.6] },
  benches: { camera: [-0.8, 1.15, -13.6], target: [1.35, 0.45, -17.4] },
  stump: { camera: [0.0, 1.2, -19.6], target: [2.3, 0.4, -22.4] },
  fork: { camera: [0, 1.4, -21.6], target: [0, 0.5, -29] },
  greenhouse: { camera: [4.0, 2.6, -13.0], target: [-1.6, 1.2, -18.6] },
} satisfies Record<string, Stop>;

export type StopId = keyof typeof STOPS;
