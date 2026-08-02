#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Build one new, static, offline Evidence Viewer report. */
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { buildEvidenceViewModelFromFeaturePackage } from "../lib/evidence-view-model.mjs";
import { renderEvidenceView } from "../lib/evidence-view-renderer.mjs";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function safeRelative(root, value, code) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\")) fail(code, "A canonical repository-relative path is required.");
  const target = resolve(root, value); const check = relative(root, target);
  if (check === "" || check === ".." || check.startsWith(`..${sep}`) || isAbsolute(check) || check.split(sep).some((part) => part === "." || part === "..")) fail(code, "The path escapes the repository.");
  return target;
}
function parse(argv) {
  if (argv[0] !== "build") fail("EVC-ARGUMENT", "Usage: evidence-viewer.mjs build --root <checkout> --manifest <relative-manifest> --output <relative-report> [--sharing private|redacted]");
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!new Set(["--root", "--manifest", "--output", "--sharing"]).has(key) || value === undefined || values.has(key)) fail("EVC-ARGUMENT", "Viewer arguments are invalid.");
    values.set(key, value);
  }
  if (!["--root", "--manifest", "--output"].every((key) => values.has(key)) || (values.has("--sharing") && !["private", "redacted"].includes(values.get("--sharing")))) fail("EVC-ARGUMENT", "Viewer arguments are incomplete or invalid.");
  return { root: resolve(values.get("--root")), manifestPath: values.get("--manifest"), outputPath: values.get("--output"), sharing: values.get("--sharing") ?? "private" };
}
async function ensurePhysicalParent(root, target) {
  const rootEntry = await lstat(root); if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) fail("EVC-ROOT", "Repository root must be a physical directory.");
  const parts = relative(root, dirname(target)).split(sep).filter(Boolean); let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    try { const entry = await lstat(current); if (!entry.isDirectory() || entry.isSymbolicLink()) fail("EVC-OUTPUT", "Report parent may not contain a symbolic link or non-directory."); }
    catch (error) { if (error?.code !== "ENOENT") throw error; await mkdir(current); }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  const output = safeRelative(options.root, options.outputPath, "EVC-OUTPUT");
  safeRelative(options.root, options.manifestPath, "EVC-MANIFEST");
  await ensurePhysicalParent(options.root, output);
  try { const existing = await lstat(output); if (existing) fail("EVC-OUTPUT-EXISTS", "Refusing to overwrite an existing report."); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: options.root, manifestPath: options.manifestPath, sharing: options.sharing });
  const html = renderEvidenceView(model, { sourceHref: (source) => relative(dirname(output), resolve(options.root, source)).split(sep).join("/") });
  await writeFile(output, html, { encoding: "utf8", flag: "wx", mode: 0o644 });
  return Object.freeze({ schema: "pipeline.evidence-viewer-build-receipt.v1", authority: "non-authoritative", output: options.outputPath, outputSha256: createHash("sha256").update(html, "utf8").digest("hex"), status: model.status, candidate: model.candidate.state === "fact" ? { commit: model.candidate.commit, tree: model.candidate.tree } : null, sharing: options.sharing });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await main())}\n`); }
  catch (error) { process.stderr.write(`${error.code ?? "EVC-FAILED"}: ${error.message}\n`); process.exitCode = 2; }
}
