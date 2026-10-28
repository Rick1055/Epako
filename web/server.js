// The page server: the site's one front door (DESIGN.md, rule 35 and Hosting).
// It renders pages and forwards /api/*, /ws/* and /health to the speech API, so the browser sees a single origin (no CORS).
// /health lets the app retry while the API wakes up ("Epako is waking up").
import compression from "compression";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const DEVELOPMENT = process.argv.includes("--dev");
// Set here, not in the npm script, so it works in every shell; Express and React read it after this line.
process.env.NODE_ENV = DEVELOPMENT ? "development" : "production";
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "3000");
const API_URL = process.env.API_URL || "http://127.0.0.1:8000";

const isApiPath = (path) => path.startsWith("/api/") || path.startsWith("/ws/") || path === "/health";
const api = createProxyMiddleware({
  target: API_URL,
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
// Before compression, so requests, uploads and responses stream through untouched.
app.use(api);
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
