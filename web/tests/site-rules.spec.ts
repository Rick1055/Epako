import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Every public route (signed-in pages render only a shell on the server and are checked with a session elsewhere).
const PUBLIC_ROUTES = ["/", "/sign-up", "/sign-in", "/forgot-password", "/help", "/terms", "/privacy", "/accessibility", "/clinician/sign-up"];

/** Collect console errors and page errors (hydration problems show up as console errors). */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  return problems;
}

for (const path of PUBLIC_ROUTES) {
  test(`${path}: one h1, lang, title, no sideways scroll, no console errors, no axe violations`, async ({ page }) => {
    const problems = watchConsole(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1); // rule 29
    await expect(page.locator("html")).toHaveAttribute("lang", "en"); // rule 33
    expect(await page.title()).toMatch(/^.+ - Epako Voice$/); // rule 14
    expect((await page.title()).length).toBeLessThan(60);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0); // rule 1
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test("an unknown address is a kind 404 with a real 404 status, inside the header and footer (rule 10)", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("That page isn't here, but you're not lost.");
  await expect(page.locator("header")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await page.getByRole("link", { name: "Take me home" }).click();
  await expect(page).toHaveURL("/");
});

test("the theme toggle flips the look, is remembered, and the server renders it next time (rule 46)", async ({ page, context }) => {
  await page.goto("/");
  const html = page.locator("html");
  const startsDark = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const toEvening = page.getByRole("button", { name: "Switch to the evening look" });
  const toMorning = page.getByRole("button", { name: "Switch to the morning look" });
  await (startsDark ? toMorning : toEvening).click();
  const flipped = startsDark ? "light" : "dark";
  await expect(html).toHaveAttribute("data-theme", flipped);
  await expect(startsDark ? toEvening : toMorning).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === "theme")?.value).toBe(flipped);
  // The server-rendered HTML already carries the theme, before any script runs.
  const raw = await (await page.request.get("/")).text();
  expect(raw).toContain(`data-theme="${flipped}"`);
  // A plain page (the entry pages sit on the tree's moss in either look) takes the chosen look's page colour.
  await page.goto("/help");
  await expect(html).toHaveAttribute("data-theme", flipped);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe(flipped === "dark" ? "rgb(15, 30, 27)" : "rgb(243, 247, 244)");
});

test("the footer has working contact links, legal links and this year's copyright (rules 6, 11, 12, 16)", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "hello@epakovoice.example" })).toHaveAttribute("href", "mailto:hello@epakovoice.example");
  await expect(footer.getByRole("link", { name: "+44 20 7946 0958" })).toHaveAttribute("href", "tel:+442079460958");
  for (const name of ["Terms", "Privacy", "Accessibility", "Help"]) await expect(footer.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(footer).toContainText(`© ${new Date().getFullYear()} Epako Voice`);
  await expect(footer.getByRole("link", { name: "Epako Voice, home" })).toHaveAttribute("href", "/");
});

test("phones get a menu sheet that traps focus and closes on Escape, outside tap and link (rule 4)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the sheet is the phone menu");
  await page.goto("/");
  const open = page.getByRole("button", { name: "Menu" });
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await open.click();
  await expect(sheet).toBeVisible();
  // Tabbing never reaches the page behind (it is inert). Past the last link focus may visit the browser's own
  // toolbar, which the page sees as <body>; it then comes back into the sheet.
  const visited = new Set<string>();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "browser";
      return el.closest("dialog") ? "sheet" : `page: ${el.outerHTML.slice(0, 80)}`;
    });
    visited.add(where);
  }
  expect([...visited].filter((w) => w.startsWith("page"))).toEqual([]);
  expect(visited).toContain("sheet");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await expect(sheet).toBeVisible();
  await page.mouse.click(10, 400); // the scrim, left of the sheet
  await expect(sheet).toBeHidden();
  await open.click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("link", { name: "Help" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL("/help");
});

test("the skip link is the first thing a keyboard reaches and jumps to the content", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard check runs on desktop");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("the suggested accent comes only from the device's language setting, and only when a voice has it", async () => {
  const { deviceAccent } = await import("../app/lib/patient");
  expect(deviceAccent("en-GB")).toBe("British");
  expect(deviceAccent("en-us")).toBe("American");
  expect(deviceAccent("en-IN")).toBe("Indian");
  expect(deviceAccent("en-AU")).toBeNull();
  expect(deviceAccent("en")).toBeNull();
});

test("security headers on every page: a strict CSP with a fresh nonce on the page's own scripts, no framing (rule 23)", async ({ page, request }) => {
  const first = await request.get("/");
  const second = await request.get("/");
  const h = first.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("microphone=(self)");
  expect(h["x-frame-options"]).toBe("DENY");
  const csp = h["content-security-policy"] ?? "";
  for (const rule of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"]) expect(csp).toContain(rule);
  expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(second.headers()["content-security-policy"]).not.toContain(nonce!); // fresh per request
  // Every inline script the page ships carries the nonce, so none is blocked; and the page runs with no CSP errors.
  const violations: string[] = [];
  page.on("console", (m) => /Content Security Policy/.test(m.text()) && !/challenges\.cloudflare/.test(m.text()) && violations.push(m.text()));
  await page.goto("/");
  const unsigned = await page.evaluate(() => [...document.querySelectorAll<HTMLScriptElement>("script:not([src]):not([type='application/ld+json'])")].filter((s) => !s.nonce).length);
  expect(unsigned).toBe(0);
  await page.waitForTimeout(1500);
  expect(violations).toEqual([]);
});

test("robots.txt, sitemap.xml and llms.txt list the public pages only; the welcome page carries valid structured data (rules 28, 35)", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /home");
  expect(robots).toMatch(/Sitemap: http.*\/sitemap\.xml/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/privacy</loc>");
  expect(sitemap).not.toContain("/home</loc>");
  expect((await request.get("/llms.txt")).ok()).toBe(true);
  await page.goto("/");
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.length).toBeGreaterThanOrEqual(1);
  const data = blocks.map((b) => JSON.parse(b)).find((d) => d["@graph"]);
  expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["Organization", "WebSite"]);
});
