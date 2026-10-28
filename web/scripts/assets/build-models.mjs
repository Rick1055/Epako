// The garden's asset pipeline (DESIGN.md, How the garden is made and delivered).
// Usage (from web/): node scripts/assets/build-models.mjs [only-these-names...]
//   1. builds each hero model at full detail from app/three/kit.ts (sources.ts) and writes a source .glb
//   2. Blender: bakes ambient occlusion into vertex colours where asked, then Decimate to each LOD budget
//   3. gltf-transform: weld, dedup, prune, quantise, meshopt-compress -> public/models/<name>-lod<i>.glb
//   4. impostors: Blender renders full-detail trees to transparent pictures for distant cards (app/three/impostors.json)
//   5. fails if any hero asset file is over 2 MB; writes app/three/models.json (what the scene loads)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Document, Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { createServer } from "vite";

const BLENDER = process.env.BLENDER ?? "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe";
const MAX_BYTES = 2 * 1024 * 1024;
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const WORK = here("../../.cache/models/"); // sources and Blender output (git-ignored)
const OUT = here("../../public/models/");
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

// ---- 1. Sources -----------------------------------------------------------------------------------------
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const { assets } = await vite.ssrLoadModule("/scripts/assets/sources.ts");
const everything = assets();
const list = everything.filter((a) => !only.length || only.includes(a.name));
await vite.close();

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

/** A glTF document from geometry parts: positions, normals, vertex colours. */
function toDocument(parts) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const materials = {};
  const material = (look) => (materials[look] ??= doc.createMaterial(look).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0).setDoubleSided(look !== "solid"));
  for (const part of parts) {
    const g = part.geometry;
    const prim = doc.createPrimitive().setMaterial(material(part.look));
    const add = (semantic, attr, type) => prim.setAttribute(semantic, doc.createAccessor().setType(type).setArray(new Float32Array(attr.array)).setBuffer(buffer));
    add("POSITION", g.attributes.position, "VEC3");
    add("NORMAL", g.attributes.normal ?? (g.computeVertexNormals(), g.attributes.normal), "VEC3");
    if (g.attributes.color) add("COLOR_0", g.attributes.color, "VEC3");
    if (g.index) prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(g.index.array)).setBuffer(buffer));
    scene.addChild(doc.createNode(part.name).setMesh(doc.createMesh(part.name).addPrimitive(prim)));
  }
  return doc;
}

const triangles = (doc) =>
  doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);

/** Clean up and compress one tier for the web; `textureSize` resizes its textures and converts them to WebP. */
async function finalise(doc, file, textureSize) {
  await MeshoptEncoder.ready;
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const textures = textureSize ? [textureCompress({ encoder: sharp, targetFormat: "webp", resize: [textureSize, textureSize], quality: 82 })] : [];
  await doc.transform(weld(), dedup(), prune(), ...textures, quantize(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const tris = Math.round(triangles(doc));
  await io.write(file, doc);
  return { bytes: statSync(file).size, tris };
}

/**
 * Bake an impostor: Blender renders the undecimated model front and side; a row of separate trees is cut into one
 * picture per tree (at the empty columns between them). Pictures go to public/textures as WebP.
 */
async function bakeImpostor(asset) {
  const src = here(`../../.cache/polyhaven/${asset.source}/${asset.source}.gltf`);
  const prefix = `${WORK}${asset.name}`;
  execFileSync(BLENDER, ["-b", "--factory-startup", "-P", here("./bake_impostor.py"), "--", src, prefix, String(asset.pixels)], { stdio: ["ignore", "ignore", "inherit"] });
  const dims = JSON.parse(readFileSync(`${prefix}.json`, "utf8"));
  const cards = [];
  const save = async (input, extract, view, k, metresPerPixel) => {
    const file = `impostor-${asset.name}-${view}${k === null ? "" : `-${k}`}.webp`;
    const target = here(`../../public/textures/${file}`);
    await sharp(input).extract(extract).webp({ quality: 82, alphaQuality: 90 }).toFile(target);
    cards.push({ file, view, width: extract.width * metresPerPixel, height: extract.height * metresPerPixel, kb: Math.round(statSync(target).size / 1024) });
  };
  for (const view of asset.split ? ["front"] : ["front", "side"]) {
    const input = `${prefix}-${view}.png`;
    const { width, height } = await sharp(input).metadata();
    const metresPerPixel = dims[`${view}Scale`] / Math.max(width, height);
    if (!asset.split) {
      await save(input, { left: 0, top: 0, width, height }, view, null, metresPerPixel);
      continue;
    }
    // Columns with any visible pixel; each run of them is one tree.
    const { data } = await sharp(input).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
    const filled = Array.from({ length: width }, (_, x) => {
      for (let y = 0; y < height; y++) if (data[y * width + x] > 8) return true;
      return false;
    });
    let k = 0;
    for (let x = 0; x < width; ) {
      if (!filled[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < width && filled[end]) end++;
      if (end - x > width * 0.05) await save(input, { left: x, top: 0, width: end - x, height }, view, k++, metresPerPixel);
      x = end;
    }
  }
  return cards;
}

// ---- 2-4. Blender and gltf-transform ----------------------------------------------------------------------
const manifest = {};
const impostorFile = here("../../app/three/impostors.json");
let impostors = {};
try {
  impostors = JSON.parse(readFileSync(impostorFile, "utf8"));
} catch {
  // first run
}
const report = [];
for (const asset of list) {
  const tiers = [];
  if (asset.kind === "sculpted") {
    const doc = toDocument(asset.parts);
    doc.setLogger(new Logger(Logger.Verbosity.WARN));
    await doc.transform(weld()); // join the shared corners, so Decimate can collapse across them
    const src = `${WORK}${asset.name}.glb`;
    await io.write(src, doc);
    const full = Math.round(triangles(doc));
    // Each tier within its budget, and lower tiers always lighter than the source (half, then a fifth) so LOD is real.
    const ratios = asset.budgets.map((b, i) => Math.min(b / full, [1, 0.5, 0.2][i]).toFixed(4)).join(",");
    execFileSync(BLENDER, ["-b", "--factory-startup", "-P", here("./decimate.py"), "--", src, `${WORK}${asset.name}`, ratios, asset.ao ? "1" : "0"], { stdio: ["ignore", "ignore", "inherit"] });
    for (let i = 0; i < 3; i++) tiers.push(await finalise(await io.read(`${WORK}${asset.name}-lod${i}.glb`), `${OUT}${asset.name}-lod${i}.glb`));
    report.push(`${asset.name.padEnd(16)} source ${String(full).padStart(7)} tris -> ${tiers.map((t) => `${t.tris} tris ${(t.bytes / 1024).toFixed(0)} KB`).join(" | ")}${asset.ao ? "  (AO baked)" : ""}`);
  } else if (asset.kind === "scanned") {
    const src = here(`../../.cache/polyhaven/${asset.source}/${asset.source}.gltf`);
    execFileSync(BLENDER, ["-b", "--factory-startup", "-P", here("./prepare_scanned.py"), "--", src, `${WORK}${asset.name}`, asset.split ? "1" : "0", asset.budgets.join(","), (asset.keep ?? []).join(","), (asset.leaves ?? []).join(",")], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    for (let i = 0; i < 3; i++) tiers.push(await finalise(await io.read(`${WORK}${asset.name}-lod${i}.glb`), `${OUT}${asset.name}-lod${i}.glb`, asset.textures[i]));
    report.push(`${asset.name.padEnd(16)} scanned (${asset.source}) -> ${tiers.map((t) => `${t.tris} tris ${(t.bytes / 1024).toFixed(0)} KB`).join(" | ")}`);
  } else {
    impostors[asset.name] = await bakeImpostor(asset);
    report.push(`${asset.name.padEnd(16)} impostor (${asset.source}) -> ${impostors[asset.name].map((c) => `${c.file} ${c.width.toFixed(1)}x${c.height.toFixed(1)} m ${c.kb} KB`).join(" | ")}`);
    continue;
  }
  manifest[asset.name] = tiers.map((t) => ({ tris: t.tris, bytes: t.bytes }));
}

// ---- 5. Budget and manifest -------------------------------------------------------------------------------
console.log(report.join("\n"));
const impostorNames = new Set(everything.filter((a) => a.kind === "impostor").map((a) => a.name));
writeFileSync(impostorFile, JSON.stringify(Object.fromEntries(Object.entries(impostors).filter(([name]) => impostorNames.has(name))), null, 2) + "\n");
const manifestFile = here("../../app/three/models.json");
let previous = {};
try {
  previous = JSON.parse(readFileSync(manifestFile, "utf8"));
} catch {
  // first run
}
// Keep earlier results only for assets that still exist (a removed model must not linger and be downloaded).
const names = new Set(everything.map((a) => a.name));
const all = Object.fromEntries(Object.entries({ ...previous, ...manifest }).filter(([name]) => names.has(name)));
writeFileSync(manifestFile, JSON.stringify(all, null, 2) + "\n");
const over = Object.entries(all).flatMap(([name, tiers]) => tiers.map((t, i) => ({ name, i, ...t }))).filter((t) => t.bytes > MAX_BYTES);
const total = Object.values(all).flat().reduce((n, t) => n + t.bytes, 0);
console.log(`\n${Object.keys(all).length} assets, all tiers together ${(total / 1024 / 1024).toFixed(2)} MB; largest file ${(Math.max(...Object.values(all).flat().map((t) => t.bytes)) / 1024).toFixed(0)} KB`);
if (over.length) {
  console.error(`over the 2 MB hero-asset budget: ${over.map((o) => `${o.name}-lod${o.i} ${(o.bytes / 1024 / 1024).toFixed(2)} MB`).join(", ")}`);
  process.exit(1);
}
