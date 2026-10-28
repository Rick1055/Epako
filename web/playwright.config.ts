import { defineConfig, devices } from "@playwright/test";

// The site-rules suite (DESIGN.md, Site-wide rules). Runs against a running page server: `npm run build && npm start`.
const sizes = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "tests",
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000",
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
