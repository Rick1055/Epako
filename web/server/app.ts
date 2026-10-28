import { createRequestHandler } from "@react-router/express";
import express from "express";

// The React Router request handler; server.js mounts it after the API proxy and static files.
export const app = express();
app.disable("x-powered-by");

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
  }),
);
