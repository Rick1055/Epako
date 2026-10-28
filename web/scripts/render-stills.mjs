// Renders the still picture of every garden stop from the real pages (DESIGN.md, Still pictures): both themes,
// and both screen shapes (wide desktops, narrow phones), each with its own composition. They are what server
// rendering, reduced motion, weak devices and "Show the garden: off" show instead of the live scene.
// Every stop is reached through the development server's review hook (signed-in pages can't be opened without an
// account), from the opening page. Usage: npm run dev (PORT=3001), then node scripts/render-stills.mjs [base url]
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3001";
// Every stop a page uses (app/three/stops.ts).
const STOPS = ["gate", "path", "stone1", "stone2", "stone3", "border", "hedgewalk", "clearing", "summary", "bench", "ferns", "benches", "stump", "fork", "greenhouse"];
const SHAPES = { wide: { width: 1440, height: 900 }, narrow: { width: 390, height: 844 } };
const OUT = new URL("../public/garden/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const done = [];
for (const theme of ["light", "dark"]) {
  for (const [shape, viewport] of Object.entries(SHAPES)) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1.5, colorScheme: theme });
    await page.goto(BASE + "/?keep-garden", { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.gardenArrived === "gate", null, { timeout: 120_000 });
    for (const stop of STOPS) {
      await page.evaluate((s) => (window.gardenReview(s), void 0), stop);
      await page.waitForFunction((s) => document.documentElement.dataset.gardenArrived === s, stop, { timeout: 60_000 });
      await page.waitForTimeout(1200); // the walk's last frames and the fade-in finish
      // The scene alone: hide the page, and take off the mist mask (it is applied again when the still is shown).
      await page.addStyleTag({ content: "#page { visibility: hidden !important } [data-garden-canvas] { -webkit-mask-image: none !important; mask-image: none !important }" }).then((h) => h.evaluate((e) => e.setAttribute("data-still", "")));
      await page.waitForTimeout(200);
      const png = await page.screenshot();
      // Encode as WebP inside Chromium, so no image tool needs installing.
      const webp = await page.evaluate(async (b64) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.78 });
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.readAsDataURL(blob);
        });
      }, png.toString("base64"));
      const bytes = Buffer.from(webp, "base64");
      writeFileSync(new URL(`${stop}-${theme}-${shape}.webp`, OUT), bytes);
      console.log(`${stop}-${theme}-${shape}.webp  ${(bytes.length / 1024).toFixed(0)} KB`);
      await page.evaluate(() => document.querySelectorAll("style[data-still]").forEach((e) => e.remove()));
    }
    await page.close();
  }
}
done.push(...STOPS);
await browser.close();
writeFileSync(new URL("../app/three/stills.json", import.meta.url), JSON.stringify(done.sort(), null, 2) + "\n");
console.log(`stills for ${done.length} stops; app/three/stills.json updated`);
