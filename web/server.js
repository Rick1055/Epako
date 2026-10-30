// The page server: the site's one front door (DESIGN.md, rule 35 and Hosting).
// It renders pages and forwards /api/*, /ws/* and /health to the speech API, so the browser sees a single origin (no CORS).
// /health lets the app retry while the API wakes up ("Epako is waking up").
import { randomBytes } from "node:crypto";
import path from "node:path";

import compression from "compression";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const DEVELOPMENT = process.argv.includes("--dev");
// Set here, not in the npm script, so it works in every shell; Express and React read it after this line.
process.env.NODE_ENV = DEVELOPMENT ? "development" : "production";
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "3000");
const API_URL = process.env.API_URL || process.env.VITE_API_URL || "http://127.0.0.1:8000";

const isApiPath = (path) => path.startsWith("/api/") || path.startsWith("/ws/") || path === "/health";
const api = createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathFilter: isApiPath,
  xfwd: true,
  on: {
    // API not running or dropped mid-answer: a plain 503 the app turns into "Epako is waking up", never internal details.
    error: (err, req, res) => {
      console.error(`[api proxy] ${req.method} ${req.url.split("?")[0]}: ${err.code ?? err.message}`);
      if (typeof res.writeHead !== "function") return res.destroy(); // a WebSocket
      if (res.headersSent) return res.destroy();
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "The speech service isn't reachable right now." }));
    },
  },
});

const app = express();
app.disable("x-powered-by");

// Security headers on every response (DESIGN.md, rule 23). The Content-Security-Policy is production-only (Vite's
// development server needs inline and eval'd scripts); its nonce is fresh per request and reaches the page's own
// inline scripts through the x-csp-nonce request header (app/entry.server.tsx, app/root.tsx), which is overwritten
// here so a browser can't choose it.
try {
  process.loadEnvFile(".env"); // the public Supabase address, for connect-src
} catch {
  // no .env: the address comes from the environment
}
const supabase = process.env.VITE_SUPABASE_URL ? new URL(process.env.VITE_SUPABASE_URL).host : "*.supabase.co";
app.use((req, res, next) => {
  const nonce = randomBytes(16).toString("base64");
  req.headers["x-csp-nonce"] = nonce;
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "microphone=(self), camera=(), geolocation=(), payment=(), usb=()");
  // Nothing may frame the site, except the Sylva tree page, which only our own entry pages frame (components/Sylva.tsx).
  const framedByUs = req.path.startsWith("/sylva/");
  res.setHeader("X-Frame-Options", framedByUs ? "SAMEORIGIN" : "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // Only over HTTPS (the demo tunnel): browsers ignore it on plain http, and it must never pin 127.0.0.1.
  if (req.headers["x-forwarded-proto"] === "https") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (!DEVELOPMENT) {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        // The model decoder compiles WebAssembly; the CAPTCHA loads its script from Cloudflare.
        `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://challenges.cloudflare.com`,
        "style-src 'self' 'unsafe-inline'", // React style attributes
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:", // the spoken voice arrives as a data: address
        "font-src 'self'",
        // blob: and data: are the 3D models' own embedded textures, read by the model loader.
        `connect-src 'self' blob: data: https://${supabase} wss://${supabase} https://api.pwnedpasswords.com https://challenges.cloudflare.com`,
        "frame-src 'self' https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        framedByUs ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
      ].join("; "),
    );
  }
  next();
});

// Before compression, so requests, uploads and responses stream through untouched.
app.use(api);

// For search engines and AI crawlers (DESIGN.md, rules 28 and 35): the public pages only; nothing signed-in is listed.
const PUBLIC_PAGES = [
  "/",
  "/guides/what-is-dysarthria",
  "/guides/acoustic-biomarkers",
  "/guides/speech-exercises",
  "/sign-up",
  "/sign-in",
  "/help",
  "/terms",
  "/privacy",
  "/accessibility",
  "/clinician/sign-up",
];
const origin = (req) => `${req.headers["x-forwarded-proto"] === "https" ? "https" : req.protocol}://${req.headers["x-forwarded-host"] ?? req.headers.host}`;
app.get("/robots.txt", (req, res) => {
  res.sendFile(path.resolve("public/robots.txt"));
});
app.get("/sitemap.xml", (req, res) => {
  res.sendFile(path.resolve("public/sitemap.xml"));
});
app.get("/llms.txt", (req, res) => {
  res.type("text/plain").send(
    `# Epako Voice\n\n> A web app for people with dysarthria: it listens, tidies up what they said, and says it back in a clear voice they chose; they practise daily and can share sessions with their speech therapist. A communication and practice aid, not a medical device.\n\n## Pages\n${PUBLIC_PAGES.map((p) => `- [${p === "/" ? "Welcome" : p.slice(1)}](${origin(req)}${p})`).join("\n")}\n`,
  );
});
app.use(compression());

if (DEVELOPMENT) {
  const vite = await import("vite").then((v) => v.createServer({ server: { middlewareMode: true } }));
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try {
      const source = await vite.ssrLoadModule("./server/app.ts");
      return await source.app(req, res, next);
    } catch (error) {
      if (error instanceof Error) vite.ssrFixStacktrace(error);
      next(error);
    }
  });
} else {
  app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
  app.use(express.static("build/client", { maxAge: "1h" }));
  app.use(await import("./build/server/index.js").then((mod) => mod.app));
}

const server = app.listen(PORT, HOST, () => console.log(`Epako Voice on http://${HOST}:${PORT} (API: ${API_URL})`));
// WebSockets (live conversation mode) are forwarded too. Vite's own reload socket runs on its own port in development.
server.on("upgrade", (req, socket, head) => {
  if (isApiPath(new URL(req.url, "http://x").pathname)) api.upgrade(req, socket, head);
  else socket.destroy();
});
