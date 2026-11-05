// Sandbox build (stand-in for `vite build`): esbuild for TSX + Tailwind v4 compiler for CSS,
// then everything inlined into one offline HTML file.
import * as esbuild from "/opt/npm-tools/node_modules/esbuild/lib/main.js";
import { compile } from "/opt/npm-tools/node_modules/tailwindcss/dist/lib.mjs";
import fs from "fs"; import path from "path";
const NM = "/opt/npm-tools/node_modules";
const js = await esbuild.build({
  entryPoints: ["src/main.tsx"], bundle: true, write: false, minify: true, format: "iife", target: "es2020",
  jsx: "automatic", alias: { "@": path.resolve("src") }, nodePaths: [NM], define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "css-skip", setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" })); } }],
});
// collect class candidates from source
const files = []; const walk = (d) => fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); }); walk("src");
const cands = new Set(); for (const f of files) for (const t of fs.readFileSync(f, "utf8").split(/[\s"'`{}<>]+/)) if (t) cands.add(t);
const load = async (id, base) => { const p = id === "tailwindcss" ? NM + "/tailwindcss/index.css" : path.resolve(base, id); return { path: p, base: path.dirname(p), content: fs.readFileSync(p, "utf8") }; };
const c = await compile(fs.readFileSync("src/styles.css", "utf8"), { base: path.resolve("src"), loadStylesheet: load });
let css = fs.readFileSync("src/fonts.css", "utf8") + c.build([...cands]);
css = (await esbuild.transform(css, { loader: "css", minify: true })).code;
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#F3F5F4"><title>Spare Parts ERP — React demo</title><style>${css}</style></head><body><div id="root"></div><script>${js.outputFiles[0].text.replace(/<\/script/g, "<\\/script")}</script></body></html>`;
fs.mkdirSync("dist", { recursive: true }); fs.writeFileSync("dist/SpareParts-ERP-React-demo.html", html);
console.log("built", (html.length / 1024).toFixed(0) + " KB,", files.length, "source files");
