// Rule 46: every colour pair the components use passes WCAG in both themes.
// Reads app/styles/tokens.css (light-dark(<light>, <dark>) values) and exits 1 on any failure.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/styles/tokens.css", import.meta.url), "utf8");
const tokens = {};
for (const [, name, light, dark] of css.matchAll(/--([\w-]+):\s*light-dark\((#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\)/g)) {
  tokens[name] = { light, dark };
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
if (Math.abs(ratio("#000000", "#FFFFFF") - 21) > 1e-9) throw new Error("contrast formula is wrong");

const TEXT = 4.5; // body text
const UI = 3; // control edges, icons, focus rings, chart marks
const pairs = [
  ...["bg", "bg-deep", "surface", "raised"].flatMap((g) => [["ink", g, TEXT], ["ink-soft", g, TEXT]]),
  ...["bg", "bg-deep", "surface", "raised"].map((g) => ["link", g, TEXT]),
  ...["bg", "surface"].flatMap((g) => [["error", g, TEXT], ["warning", g, TEXT]]),
  ["primary-ink", "primary", TEXT],
  ["primary-ink", "primary-press", TEXT],
  ["secondary-ink", "secondary", TEXT],
  ["secondary-ink", "secondary-press", TEXT],
  ...["bg", "surface", "raised"].flatMap((g) => [["edge", g, UI], ["focus", g, UI]]),
  ...["bg", "surface"].flatMap((g) => [["primary-edge", g, UI], ["secondary", g, UI]]),
  ["fill", "track", UI],
  ["chart", "surface", UI],
];

let failures = 0;
for (const theme of ["light", "dark"]) {
  for (const [fg, bg, min] of pairs) {
    if (!tokens[fg] || !tokens[bg]) throw new Error(`missing token --${tokens[fg] ? bg : fg}`);
    const r = ratio(tokens[fg][theme], tokens[bg][theme]);
    const ok = r >= min;
    if (!ok) failures++;
    if (!ok || process.argv.includes("--all")) {
      console.log(`${ok ? "ok  " : "FAIL"} ${theme.padEnd(5)} ${r.toFixed(2).padStart(5)} (needs ${min})  ${fg} on ${bg}`);
    }
  }
}
console.log(failures ? `${failures} colour pair(s) fail WCAG` : `all ${pairs.length * 2} colour pairs pass in both themes`);
process.exit(failures ? 1 : 0);
