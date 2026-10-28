// The garden's own colours (the one place besides styles/tokens.css allowed colour values).
// The sky and mist are exactly the page colour, so the scene and the page are one surface.
export const PLANT = {
  soil: "#6F7A55",
  grassDark: "#4C6B35",
  grassLight: "#9BC266",
  frost: "#E8EEEA",
  gravel: "#D9CCB2",
  stoneDark: "#8E8A80",
  stoneLight: "#C9C2B3",
  bark: "#5E4A3B",
  barkLight: "#8A7360",
  moss: ["#4F7A3A", "#6E8F45", "#8BA35A", "#3E6033", "#A2B56A"],
  hedge: "#3F6A4C",
  conifer: "#2E5242",
  foliage: ["#2F7F83", "#3B8F8F", "#8CC5B8", "#5FA79E", "#236468"],
  stem: "#5C8A4C",
  snowdrop: "#FBFCF8",
  snowdropMark: "#7DAA4E",
  strapLeaf: "#6E9C86",
  helleboreCreamBase: "#D4DCAE",
  helleboreCream: "#F2EBD6",
  helleborePlumBase: "#4E2340",
  helleborePlum: "#9A5578",
  stamen: "#E6C45A",
  aconite: "#F0C93A",
  aconiteRuff: "#5E8F3E",
  cyclamenBase: "#8E1F4F",
  cyclamen: "#E07AA6",
  cyclamenLeaf: "#4F6E55",
  cyclamenLeafSilver: "#B9C9BC",
  fern: "#4E7F3E",
  fernTip: "#86A85A",
  witchHazelBase: "#C2552A",
  witchHazel: "#F0A13C",
  camellia: "#E89A7B",
  camelliaDeep: "#C9674A",
  camelliaLeaf: "#2C5A42",
  wood: "#8E6E52",
  iron: "#2F3534",
  lanternGlass: "#FFC983",
  bird: "#3D3A36",
  contactShadow: "#1F2A1D",
  // Park signs, in the manner of Central Park's: deep green boards, cream lettering.
  signBoard: "#2E5A43",
  // Central Park settees: slats painted the park's deep green, on black iron.
  settee: "#3F5C46",
  impostorDusk: "#8A8C9C",
  water: "#4F7E86",
  waterFall: "#D8ECEE",
  signText: "#F4F0E1",
  brimstone: "#EDE57E",
} as const;

export type Light = {
  /** The sky overhead and at the horizon (a gradient dome), and the haze distant things fade into. */
  zenith: string;
  horizon: string;
  haze: string;
  /** A tint over the city's walls round the park (the light on them), and how far they fade into the horizon colour (0..1). */
  city: string;
  cityFade: number;
  /** Where the haze starts and where it hides everything, in metres. */
  hazeNear: number;
  hazeFar: number;
  sun: string;
  sunIntensity: number;
  sunPosition: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  lantern: number; // 0 = off in the morning, 1 = lit in the evening
};

export const LIGHT: Record<"light" | "dark", Light> = {
  // Morning: a clear pale winter sky, a low gold sun from the side, a soft blue-green haze far off (not a white-out).
  light: {
    zenith: "#8EC1E6",
    horizon: "#EAF2EE",
    haze: "#CFDCD5",
    city: "#F4F1EA",
    cityFade: 0.5,
    hazeNear: 12,
    hazeFar: 55,
    sun: "#FFEBC4",
    sunIntensity: 3.1,
    sunPosition: [-4, 4.2, 2.5],
    hemiSky: "#E8F2F6",
    hemiGround: "#86965F",
    hemiIntensity: 1.65,
    lantern: 0,
  },
  // Evening: golden hour going to dusk, never night. A warm low sun and a peach horizon under a deep blue sky, the
  // lamps lit and pooling warm light, the garden still clearly seen.
  dark: {
    zenith: "#6A8FB8",
    horizon: "#F5CDB0",
    haze: "#A49AA8",
    city: "#6A6F86",
    cityFade: 0.5,
    hazeNear: 12,
    hazeFar: 58,
    sun: "#FFD9AE",
    sunIntensity: 2.5,
    sunPosition: [4.5, 2.6, -2.5],
    hemiSky: "#B3C6DA",
    hemiGround: "#5A6C4F",
    hemiIntensity: 1.75,
    lantern: 1,
  },
};
