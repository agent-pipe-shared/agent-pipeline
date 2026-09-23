#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Offline, source-derived human view of the governed architecture map. */
import { createHash, randomBytes } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapBundle } from "./module-inventory.mjs";

// The tool ships in an installed plugin; its default target is the consuming
// repository, never the plugin or marketplace installation directory.
const DEFAULT_ROOT = process.cwd();
const OUTPUT = "architecture/map/overview.html";
const ID = /^[a-z][a-z0-9-]*$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_@+./-]+$/u;
const escapeHtml = (value) => String(value).replace(/[&<>"']/gu, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
function safePath(path) {
  if (typeof path !== "string" || !SAFE_PATH.test(path) || path.includes("//") || path.includes("/./")
    || path.startsWith("./") || path.includes("\\")) throw new Error("architecture overview contains an unsafe path");
  return path.split("/").map(encodeURIComponent).join("/");
}
function sourceLink(path) { return `../../${safePath(path)}`; }
function contractTarget(path) {
  if (path.endsWith("/**")) {
    safePath(path.slice(0, -3));
    return `${escapeHtml(path)} <span class="small">(path pattern; no single source file)</span>`;
  }
  return `<a href="${escapeHtml(sourceLink(path))}">${escapeHtml(path)} ↗</a>`;
}
function conceptDescription(source, path) {
  const line = source.split("\n").find((entry) => entry.startsWith(`- \`${path}\`: `));
  return line ? line.slice(`- \`${path}\`: `.length).trim() : null;
}
function dependencyDescription(source, id) {
  const prefix = `- [${id}](${id}.md): `;
  const line = source.split("\n").find((entry) => entry.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : null;
}
function linkedModules(ids) {
  return ids.length ? ids.map((id) => `<a href="#module-${escapeHtml(id)}">${escapeHtml(id)}</a>`).join(", ") : "none declared";
}
export function renderArchitectureOverview(modules, conceptSources, sourceDigest) {
  const ordered = [...modules].sort((a, b) => a.id.localeCompare(b.id));
  if (!/^[a-f0-9]{64}$/u.test(sourceDigest)) throw new Error("invalid source digest");
  const byId = new Map(ordered.map((module) => [module.id, module]));
  if (byId.size !== ordered.length || ordered.some((module) => !ID.test(module.id))) throw new Error("invalid module identity");
  for (const module of ordered) {
    for (const id of module.allowedDependencies) if (!byId.has(id)) throw new Error("unknown module dependency");
    for (const path of module.publicContracts) contractTarget(path);
    for (const path of module.verificationEntryPoints) safePath(path);
  }
  const cards = ordered.map((module) => {
    const usedBy = ordered.filter((candidate) => candidate.allowedDependencies.includes(module.id)).map((candidate) => candidate.id);
    const contracts = module.publicContracts.map((path, index) => `<li><a href="#contract-${escapeHtml(module.id)}-${index}">${escapeHtml(path)}</a></li>`).join("");
    return `<article class="module" id="module-${escapeHtml(module.id)}"><span class="eyebrow">${escapeHtml(module.type ?? "Module")}</span>
<h2>${escapeHtml(module.id)}</h2><p>${escapeHtml(module.responsibility)}</p>
<p><strong>Uses:</strong> ${linkedModules(module.allowedDependencies)}<br><strong>Used by:</strong> ${linkedModules(usedBy)}</p>
<p class="small">Authority effects: ${module.authorityEffects.length ? escapeHtml(module.authorityEffects.join(", ")) : "none declared"}</p>
<details><summary>Explore public contracts (${module.publicContracts.length})</summary><ol>${contracts || "<li>No contracts declared.</li>"}</ol></details>
<a class="source" href="${escapeHtml(`${safePath(module.id)}.md`)}">Open authoritative concept ↗</a></article>`;
  }).join("\n");
  const contracts = ordered.map((module) => `<section class="contract-section" aria-labelledby="section-${escapeHtml(module.id)}">
<h2 id="section-${escapeHtml(module.id)}"><a href="#module-${escapeHtml(module.id)}">${escapeHtml(module.id)}</a></h2>
<p>${escapeHtml(module.responsibility)}</p>
<div class="contract-grid">${module.publicContracts.map((path, index) => `<article class="contract" id="contract-${escapeHtml(module.id)}-${index}">
<h3>${contractTarget(path)}</h3>
<p>${escapeHtml(conceptDescription(conceptSources.get(module.id) ?? "", path) ?? "Purpose not declared in the concept file.")}</p>
<p class="small">Owner: <a href="#module-${escapeHtml(module.id)}">${escapeHtml(module.id)}</a>. Verification: ${module.verificationEntryPoints.length
    ? module.verificationEntryPoints.map((entry) => `<a href="${escapeHtml(sourceLink(entry))}">${escapeHtml(entry)}</a>`).join(", ") : "not declared"}.</p>
</article>`).join("") || "<p>No public contracts declared.</p>"}</div>
<details><summary>Boundary and decision context</summary>
<p><strong>Not responsible for:</strong> ${module.nonResponsibilities.length ? escapeHtml(module.nonResponsibilities.join("; ")) : "not declared"}.</p>
<p><strong>ADRs:</strong> ${module.adrReferences.length ? escapeHtml(module.adrReferences.join(", ")) : "none declared"}.</p>
<h3>Why this module depends on others</h3>
${module.allowedDependencies.length ? `<ul>${module.allowedDependencies.map((id) => `<li><a href="#module-${escapeHtml(id)}">${escapeHtml(id)}</a>: ${escapeHtml(dependencyDescription(conceptSources.get(module.id) ?? "", id) ?? "Rationale not documented in the concept file.")}</li>`).join("")}</ul>` : "<p>No outgoing module dependency declared.</p>"}
</details></section>`).join("\n");
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="generated-from" content="architecture/map/index.md and concept files"><meta name="source-sha256" content="${sourceDigest}">
<title>Architecture overview</title><style>
:root{color-scheme:dark;font:16px/1.5 system-ui,sans-serif;background:#101a22;color:#e8f1f3}*{box-sizing:border-box}body{margin:0}a{color:#8de7d6}a:focus-visible,summary:focus-visible{outline:3px solid #ffd47c;outline-offset:3px}
header{padding:clamp(2rem,6vw,5rem) max(1.25rem,calc((100vw - 80rem)/2));background:linear-gradient(130deg,#173d4a,#1c2839 65%,#2c2840)}header h1{font-size:clamp(2.4rem,6vw,5rem);line-height:1.05;margin:.5rem 0 1rem}header p{max-width:70ch;color:#d0e2e3}.eyebrow{font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#96dfd4}
main{max-width:90rem;margin:auto;padding:2rem 1.25rem 5rem}.module-grid,.contract-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:1rem}.module,.contract,.contract-section{background:#1a2b35;border:1px solid #45616b;border-radius:1rem;padding:1.25rem;scroll-margin-top:1rem}.module:target,.contract:target{border-color:#ffd47c;box-shadow:0 0 0 2px #ffd47c}.module h2,.contract h3{overflow-wrap:anywhere}.module h2{margin:.4rem 0}.module p{margin:.5rem 0 1rem}.module .source{display:inline-block;margin-top:1rem}.small{font-size:.85rem;color:#b7c8cd;overflow-wrap:anywhere}details{border-top:1px solid #45616b;padding-top:.7rem}summary{cursor:pointer;font-weight:650}.contract-section{margin-top:2rem}.contract-grid{margin:1rem 0}.contract{background:#10242d}.contract h3{font-size:1rem;margin:0}.contract p{margin:.5rem 0 0}footer{padding:1.5rem;max-width:90rem;margin:auto;border-top:1px solid #45616b;color:#b7c8cd}code{overflow-wrap:anywhere}
</style></head><body><header><div class="eyebrow">Agent Pipeline · source-derived view</div><h1>Explore the architecture</h1>
<p>Start with a module, then follow its declared dependencies and public contracts. Keyboard links and openable details work without scripts or a server.</p>
<p><strong>${ordered.length} governed modules.</strong> Unmapped areas and runtime call edges are not represented. <a href="index.md">Read the authoritative map</a>.</p><p class="small">Source SHA-256: <code>${sourceDigest}</code></p></header>
<main><section aria-labelledby="modules"><h2 id="modules">Modules and dependencies</h2><div class="module-grid">${cards}</div></section>
<section aria-labelledby="contracts"><h2 id="contracts">Public contracts</h2><p>Select a contract for its purpose, owner and verification. These are declared interfaces, not an inferred function-call graph.</p>${contracts}</section></main>
<footer>Generated offline from the machine-readable map. Edit the concepts, never this HTML.</footer></body></html>\n`;
}

export function architectureOverview(rootDir) {
  const root = resolve(rootDir);
  const map = loadMapBundle(root);
  if (!map.ok || !map.indexFileExists) throw new Error(`architecture map invalid: ${map.errors.join("; ")}`);
  const ordered = [...map.modules].sort((a, b) => a.id.localeCompare(b.id));
  const sources = new Map();
  const digest = createHash("sha256");
  digest.update("index\0");
  digest.update(readFileSync(resolve(root, "architecture/map/index.md")));
  for (const module of ordered) {
    if (!ID.test(module.id)) throw new Error("invalid module identity");
    const source = readFileSync(resolve(root, `architecture/map/${module.id}.md`));
    digest.update(`${module.id}\0`);
    digest.update(source);
    sources.set(module.id, source.toString("utf8"));
  }
  return { path: resolve(root, OUTPUT), html: renderArchitectureOverview(ordered, sources, digest.digest("hex")) };
}

export function checkArchitectureOverview(rootDir) {
  const rendered = architectureOverview(rootDir);
  let observed = null;
  try { observed = readFileSync(rendered.path, "utf8"); } catch { /* missing is stale */ }
  return { ok: observed === rendered.html, path: rendered.path };
}

export function writeArchitectureOverview(rootDir) {
  const rendered = architectureOverview(rootDir);
  const root = resolve(rootDir);
  for (const directory of [root, resolve(root, "architecture"), dirname(rendered.path)]) {
    const row = lstatSync(directory);
    if (row.isSymbolicLink() || !row.isDirectory()) throw new Error("architecture overview parent is not a physical directory");
  }
  try {
    const target = lstatSync(rendered.path);
    if (target.isSymbolicLink() || !target.isFile()) throw new Error("architecture overview target is not a regular file");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = `${rendered.path}.generating-${randomBytes(8).toString("hex")}`;
  try {
    const fd = openSync(temporary, "wx", 0o600);
    try { writeFileSync(fd, rendered.html, "utf8"); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, rendered.path);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return rendered.path;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let root = DEFAULT_ROOT;
  let mode = "--check";
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--root" && args[index + 1]) root = resolve(args[++index]);
    else if (["--check", "--write"].includes(args[index]) && mode === "--check") mode = args[index];
    else { process.stderr.write("Usage: generate-architecture-overview.mjs [--root <repo>] [--check|--write]\n"); process.exit(2); }
  }
  try {
    const rendered = architectureOverview(root);
    if (mode === "--write") {
      writeArchitectureOverview(root);
      process.stdout.write(`Generated ${OUTPUT}\n`);
    } else {
      const result = checkArchitectureOverview(root);
      process.stdout.write(result.ok ? `Architecture overview current: ${OUTPUT}\n` : `Architecture overview stale: run node plugins/pipeline-core/scripts/generate-architecture-overview.mjs --write\n`);
      if (!result.ok) process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`Architecture overview unavailable: ${error.message}\n`);
    process.exitCode = 2;
  }
}
