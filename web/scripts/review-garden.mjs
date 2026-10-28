// Photographs every stop of the garden, so the whole walk can be judged (not only the pages that exist yet).
// Needs the development server: `npm run dev` (port 3000, or PORT=3001), then
//   node scripts/review-garden.mjs <out-dir> [base url] [theme] [shape]
// Writes <stop>.png for each stop (scene only: page hidden, mist off) and sheet.png, a labelled contact sheet.
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "playwright";

const [outDir, base = "http://127.0.0.1:3001", theme = "light", shape = "wide"] = process.argv.slice(2);
if (!outDir) throw new Error("usage: node scripts/review-garden.mjs <out-dir> [base url] [light|dark] [wide|narrow]");
const STOPS = ["gate", "path", "stone1", "stone2", "stone3", "border", "hedgewalk", "clearing", "summary", "bench", "ferns", "benches", "stump", "fork", "greenhouse"];
const viewport = shape === "wide" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport, colorScheme: theme });
await page.goto(base + "/?keep-garden", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.documentElement.dataset.gardenArrived === "gate", null, { timeout: 120_000 });
await page.addStyleTag({ content: "#page { visibility: hidden !important } .garden-layer { -webkit-mask-image: none !important; mask-image: none !important }" });
const shots = [];
for (const stop of STOPS) {
  await page.evaluate((s) => (window.gardenReview(s), void 0), stop);
  await page.waitForFunction((s) => document.documentElement.dataset.gardenArrived === s, stop, { timeout: 60_000 });
  await page.waitForTimeout(700);
  const png = await page.screenshot();
  writeFileSync(`${outDir}/${stop}.png`, png);
  shots.push([stop, png.toString("base64")]);
  console.log("shot", stop);
}
// A labelled contact sheet (drawn in the browser, so no image tool is needed).
const sheet = await page.evaluate(async (shots) => {
  const cols = 3, w = 480, h = Math.round((w * innerHeight) / innerWidth), pad = 26;
  const c = new OffscreenCanvas(cols * w, Math.ceil(shots.length / cols) * (h + pad));
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.font = "18px sans-serif";
  g.fillStyle = "#000";
  for (let i = 0; i < shots.length; i++) {
    const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + shots[i][1])).blob());
    const x = (i % cols) * w, y = Math.floor(i / cols) * (h + pad);
    g.drawImage(bmp, x, y + pad, w - 4, h - 4);
    g.fillText(shots[i][0], x + 6, y + 19);
  }
  const blob = await c.convertToBlob({ type: "image/png" });
  return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
}, shots);
writeFileSync(`${outDir}/sheet.png`, Buffer.from(sheet, "base64"));
await browser.close();
console.log(`${STOPS.length} stops -> ${outDir}/sheet.png`);
