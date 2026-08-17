#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Build one new, static, offline Evidence Viewer report. */
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { buildEvidenceViewModelFromFeaturePackage } from "../lib/evidence-view-model.mjs";
import { renderEvidenceView } from "../lib/evidence-view-renderer.mjs";
import { deriveNextGate, projectGateEstimate } from "../lib/gate-estimate.mjs";

// The documented normal location of the live State under a checkout root
// (scripts/pipeline-state.mjs header). This viewer is read-only and offline: it
// deliberately does not import the sanctioned State writer to resolve the path,
// and an absent or unreadable file is reported as an unresolvable estimate
// rather than repaired, guessed at, or written.
const STATE_RELATIVE = ".claude/pipeline-state.json";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function safeRelative(root, value, code) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\")) fail(code, "A canonical repository-relative path is required.");
  const target = resolve(root, value); const check = relative(root, target);
  if (check === "" || check === ".." || check.startsWith(`..${sep}`) || isAbsolute(check) || check.split(sep).some((part) => part === "." || part === "..")) fail(code, "The path escapes the repository.");
  return target;
}
function parse(argv) {
  if (argv[0] !== "build") fail("EVC-ARGUMENT", "Usage: evidence-viewer.mjs build --root <checkout> --manifest <relative-manifest> --output <relative-report> [--sharing private|redacted] [--export-status-file <relative-json>] [--gate-estimate-context-file <relative-json>]");
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!new Set(["--root", "--manifest", "--output", "--sharing", "--export-status-file", "--gate-estimate-context-file"]).has(key) || value === undefined || values.has(key)) fail("EVC-ARGUMENT", "Viewer arguments are invalid.");
    values.set(key, value);
  }
  if (!["--root", "--manifest", "--output"].every((key) => values.has(key)) || (values.has("--sharing") && !["private", "redacted"].includes(values.get("--sharing")))) fail("EVC-ARGUMENT", "Viewer arguments are incomplete or invalid.");
  return { root: resolve(values.get("--root")), manifestPath: values.get("--manifest"), outputPath: values.get("--output"), sharing: values.get("--sharing") ?? "private", exportStatusFile: values.get("--export-status-file") ?? null, gateEstimateContextFile: values.get("--gate-estimate-context-file") ?? null };
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

/**
 * Turn an operator-supplied `{activeFeature, observation, evidence}` context
 * plus the live `state.gateEstimate` into one closed view observation. The
 * projection itself stays in `projectGateEstimate`: this caller adds no rule
 * of its own beyond naming the feature and the next gate the projection was
 * computed for, so the model can refuse an estimate that belongs to a
 * different feature package.
 */
async function gateEstimateObservationFor(root, contextPath) {
  let context;
  try { context = JSON.parse(await readFile(contextPath, "utf8")); } catch { context = null; }
  if (context === null || typeof context !== "object" || Array.isArray(context)) fail("EVC-GATE-ESTIMATE", "Gate estimate context input is invalid.");
  let record;
  // An absent or unreadable live State is a normal offline condition for a
  // report built from a checkout: the estimate is then unresolvable, never
  // invented, and nothing is written to repair it.
  try { record = JSON.parse(await readFile(resolve(root, STATE_RELATIVE), "utf8")).gateEstimate; } catch { record = undefined; }
  const feature = context.activeFeature !== null && typeof context.activeFeature === "object" && !Array.isArray(context.activeFeature) ? context.activeFeature : null;
  const projected = projectGateEstimate(record, { activeFeature: context.activeFeature, observation: context.observation, evidence: context.evidence });
  return {
    schema: "pipeline.gate-estimate-view-observation.v1",
    featureId: typeof feature?.id === "string" && feature.id !== "" ? feature.id : null,
    gate: deriveNextGate(feature?.phase),
    state: projected.state, rangeMinutes: projected.rangeMinutes, source: projected.source, code: projected.code,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  const output = safeRelative(options.root, options.outputPath, "EVC-OUTPUT");
  safeRelative(options.root, options.manifestPath, "EVC-MANIFEST");
  const exportStatusPath = options.exportStatusFile === null ? null : safeRelative(options.root, options.exportStatusFile, "EVC-EXPORT");
  const gateEstimateContextPath = options.gateEstimateContextFile === null ? null : safeRelative(options.root, options.gateEstimateContextFile, "EVC-GATE-ESTIMATE");
  await ensurePhysicalParent(options.root, output);
  try { const existing = await lstat(output); if (existing) fail("EVC-OUTPUT-EXISTS", "Refusing to overwrite an existing report."); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  let exportObservation = null;
  if (exportStatusPath !== null) { try { exportObservation = JSON.parse(await readFile(exportStatusPath, "utf8")); } catch { fail("EVC-EXPORT", "Export status input is invalid."); } }
  const gateEstimateObservation = gateEstimateContextPath === null ? null : await gateEstimateObservationFor(options.root, gateEstimateContextPath);
  const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: options.root, manifestPath: options.manifestPath, sharing: options.sharing, exportObservation, gateEstimateObservation });
  const html = renderEvidenceView(model, { sourceHref: (source) => relative(dirname(output), resolve(options.root, source)).split(sep).join("/") });
  await writeFile(output, html, { encoding: "utf8", flag: "wx", mode: 0o644 });
  return Object.freeze({ schema: "pipeline.evidence-viewer-build-receipt.v1", authority: "non-authoritative", output: options.outputPath, outputSha256: createHash("sha256").update(html, "utf8").digest("hex"), status: model.status, candidate: model.candidate.state === "fact" ? { commit: model.candidate.commit, tree: model.candidate.tree } : null, sharing: options.sharing });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await main())}\n`); }
  catch (error) { process.stderr.write(`${error.code ?? "EVC-FAILED"}: ${error.message}\n`); process.exitCode = 2; }
}
