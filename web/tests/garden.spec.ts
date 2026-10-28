import { expect, test, type Page } from "@playwright/test";

// Rule 47: an open 3D garden behind every page, drawn by one scene that persists across pages, drawn only when
// something happens, never in the way of reading.

async function gardenReady(page: Page, stop: string) {
  await expect(page.locator(`[data-garden-slot="${stop}"][data-garden-ready]`)).toHaveCount(1, { timeout: 30_000 });
}

/**
 * The worst contrast between each piece of visible text and the real pixels behind it (text hidden while the page
 * is photographed). Elements on their own solid fill (buttons) carry their own contrast and are skipped.
 */
async function textContrast(page: Page) {
  const targets = await page.evaluate(() => {
    const solid = (el: Element) => {
      for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
        const bg = getComputedStyle(e).backgroundColor;
        if (bg && bg !== "transparent" && !bg.endsWith(", 0)")) return true;
      }
      return false;
    };
    const out: { text: string; x: number; y: number; w: number; h: number; color: string; large: boolean }[] = [];
    for (const el of document.querySelectorAll("#page h1, #page h2, #page h3, #page p, #page a, #page label, #page li, #page span")) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own.length || solid(el) || el.closest(".sr-only")) continue;
      const cs = getComputedStyle(el);
      for (const node of own) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
          el.setAttribute("data-cc", "");
          const size = parseFloat(cs.fontSize);
          out.push({ text: node.textContent!.trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, color: cs.color, large: size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700) });
        }
      }
    }
    return out;
  });
  await page.addStyleTag({ content: "[data-cc], [data-cc] * { color: transparent !important; text-decoration-color: transparent !important; }" });
  await page.waitForTimeout(150);
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ png, targets }) => {
      const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + png)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(bmp, 0, 0);
      const scale = bmp.width / innerWidth;
      const lum = (r: number, gr: number, b: number) => {
        const f = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(gr) + 0.0722 * f(b);
      };
      return targets.map((t) => {
        const [tr, tg, tb] = t.color.match(/\d+/g)!.map(Number);
        const lt = lum(tr, tg, tb);
        let worst = 99;
        for (let gx = 0; gx <= 10; gx++)
          for (let gy = 0; gy <= 4; gy++) {
            const px = Math.round((t.x + (t.w * gx) / 10) * scale);
            const py = Math.round((t.y + (t.h * gy) / 4) * scale);
            if (px < 0 || py < 0 || px >= bmp.width || py >= bmp.height) continue;
            const d = g.getImageData(px, py, 1, 1).data;
            const lb = lum(d[0], d[1], d[2]);
            worst = Math.min(worst, (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
          }
        return { text: t.text, worst: +worst.toFixed(2), need: t.large ? 3 : 4.5 };
      });
    },
    { png, targets },
  );
}

for (const path of ["/", "/no-such-page"]) {
  test(`${path}: every word over the garden is readable against the real pixels behind it (4.5:1, 3:1 large)`, async ({ page }) => {
    await page.goto(path);
    await gardenReady(page, path === "/" ? "gate" : "fork");
    await page.waitForTimeout(1500); // the butterfly lands
    const results = await textContrast(page);
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((r) => r.worst < r.need)).toEqual([]);
  });
}

test("the garden is decorative: hidden from screen readers and takes no clicks", async ({ page }) => {
  await page.goto("/");
  await gardenReady(page, "gate");
  const host = page.locator("[data-garden-canvas]");
  await expect(host).toHaveAttribute("aria-hidden", "true");
  expect(await host.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect(page.locator("#garden-still")).toHaveAttribute("aria-hidden", "true");
  // It covers the whole screen, behind the page.
  const box = await host.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
});

test("animated while on screen; nothing is drawn while the tab is hidden", async ({ page }) => {
  // Count real WebGL draw calls.
  await page.addInitScript(() => {
    const w = window as unknown as { draws: number };
    w.draws = 0;
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const original = proto[name];
      proto[name] = function (this: unknown, ...args: unknown[]) {
        w.draws++;
        return original.apply(this, args);
      };
    }
  });
  await page.goto("/");
  await gardenReady(page, "gate");
  const draws = () => page.evaluate(() => (window as unknown as { draws: number }).draws);
  const a = await draws();
  await page.waitForTimeout(1500);
  expect(await draws()).toBeGreaterThan(a); // still moving (wind, grass) while it is on screen
  // Hide the tab: drawing stops entirely.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  const b = await draws();
  await page.waitForTimeout(1500);
  expect(await draws()).toBe(b);
});

test("one canvas for the whole visit: navigating walks it to the next stop instead of making a new one", async ({ page, isMobile }) => {
  await page.goto("/");
  await gardenReady(page, "gate");
  await page.evaluate(() => {
    (window as unknown as { firstCanvas: Element }).firstCanvas = document.querySelector("[data-garden-canvas] canvas")!;
  });
  // A client-side navigation (no reload) to a page with a different stop: Help, at the bed walk.
  if (isMobile) {
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Help" }).click();
  } else {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Help" }).click();
  }
  await gardenReady(page, "hedgewalk");
  const same = await page.evaluate(() => document.querySelector("[data-garden-canvas] canvas") === (window as unknown as { firstCanvas: Element }).firstCanvas);
  expect(same).toBe(true);
  await expect(page.locator("[data-garden-canvas] canvas")).toHaveCount(1);
});

for (const scheme of ["light", "dark"] as const) {
  test(`reduced motion (${scheme}): no live scene; this theme's still shows, and only it is downloaded`, async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", colorScheme: scheme, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const stills: string[] = [];
    page.on("request", (r) => r.url().includes("/garden/") && stills.push(new URL(r.url()).pathname));
    await page.goto("/");
    await page.waitForTimeout(2500); // longer than the idle wait before the scene would load
    await expect(page.locator("[data-garden-canvas] canvas")).toHaveCount(0);
    const shown = page.locator(`#garden-still img`).filter({ visible: true });
    await expect(shown).toHaveCount(1);
    expect(await shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.currentSrc)).toContain(`/garden/gate-${scheme}-wide.webp`);
    expect(stills).toEqual([`/garden/gate-${scheme}-wide.webp`]);
    await context.close();
  });
}

test("the server-rendered page already carries the garden's still (nothing jumps when it loads)", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('data-garden-slot="gate"');
  expect(html).toContain("/garden/gate-light-wide.webp");
  expect(html).not.toContain("<canvas"); // the live scene is browser-only
});
