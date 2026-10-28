import { defineConfig, devices } from "@playwright/test";

// The site-rules suite (DESIGN.md, Site-wide rules). It builds the site and starts its own page server on port 3100,
// so a stale server left on 3000 can never answer for the current code; BASE_URL tests a server you started instead.
// Two workers: four browsers each running the 3D garden at once is more than an integrated GPU and 16 GB hold.
const PORT = 3100;
const sizes = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "tests",
  reporter: "list",
  workers: 2,
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run build && node server.js", url: `http://127.0.0.1:${PORT}`, env: { PORT: String(PORT) }, reuseExistingServer: false, timeout: 240_000 },
  use: {
    baseURL: process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`,
    // Real GPU for the garden; headless Chrome's software WebGL is slow enough to trip the frame-rate fallback.
    launchOptions: { args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] },
  },
  projects: (["light", "dark"] as const).flatMap((colorScheme) =>
    (Object.keys(sizes) as (keyof typeof sizes)[]).map((size) => ({
      name: `${size}-${colorScheme}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: sizes[size],
        colorScheme,
        hasTouch: size === "phone",
        isMobile: size === "phone",
      },
    })),
  ),
});
