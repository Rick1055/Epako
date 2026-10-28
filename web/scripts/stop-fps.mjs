// Development-only: frames per second, triangles and draw calls at every garden stop (wide or narrow).
//   npm run dev (PORT=3001), then: node scripts/stop-fps.mjs [base url] [light|dark] [wide|narrow]
// Prints the power state first: on battery, integrated and discrete graphics both run far slower.
import { execFileSync } from "node:child_process";

import { chromium } from "playwright";

const [base = "http://127.0.0.1:3001", theme = "light", shape = "wide"] = process.argv.slice(2);
const STOPS = ["gate", "path", "stone1", "stone2", "stone3", "border", "hedgewalk", "clearing", "summary", "bench", "ferns", "benches", "stump", "fork", "greenhouse"];
const viewport = shape === "wide" ? { width: 1440, height: 900 } : { width: 390, height: 844 };

const power = execFileSync("powershell", ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SystemInformation]::PowerStatus.PowerLineStatus"]).toString().trim();
console.log(`power: ${power}${power === "Online" ? "" : " (on battery: these numbers are pessimistic)"}`);

const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport, colorScheme: theme, hasTouch: shape === "narrow", isMobile: shape === "narrow" });
await page.goto(`${base}/?keep-garden`, { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.gardenArrived === "gate", null, { timeout: 120_000 });
const rows = [];
for (const stop of STOPS) {
  await page.evaluate((s) => (window.gardenReview(s), void 0), stop);
  await page.waitForFunction((s) => document.documentElement.dataset.gardenArrived === s, stop, { timeout: 60_000 });
  // Two fresh 2-second windows after arriving (the first can span the walk).
  await page.evaluate(() => (window.gardenStats = undefined));
  await page.waitForFunction(() => window.gardenStats, null, { timeout: 15_000 });
  await page.evaluate(() => (window.gardenStats = undefined));
  await page.waitForFunction(() => window.gardenStats, null, { timeout: 15_000 });
  const s = await page.evaluate(() => window.gardenStats);
  rows.push([stop, s.fps, s.triangles, s.calls]);
  console.log(`${stop.padEnd(10)} ${s.fps.toFixed(1).padStart(5)} fps ${String(Math.round(s.triangles / 1000)).padStart(5)}k tris ${String(s.calls).padStart(4)} calls`);
}
console.log(`slowest: ${rows.sort((a, b) => a[1] - b[1])[0][0]} at ${rows[0][1].toFixed(1)} fps`);
await browser.close();
