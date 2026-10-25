// SPDX-License-Identifier: SUL-1.0
// A local, review-bound reproduction. This is evidence for one finding, never push authority.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeCandidateFindingPath, resolveGitleaksConfigPath, run } from "./gitleaks.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const hex = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const domain = value => typeof value === "string" && value.length <= 253
  && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/iu.test(value);
const safePath = value => typeof value === "string" && value.length > 0 && !isAbsolute(value)
  && !value.includes("\\") && value.split("/").every(part => part && part !== "." && part !== "..");

function fileDigest(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("source must be a regular file");
  return digest(readFileSync(path));
}

function sourcePath(rootDir, path) {
  if (!safePath(path)) throw new Error("invalid finding path");
  const root = realpathSync(rootDir);
  const file = realpathSync(join(rootDir, path));
  const rel = relative(root, file);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("finding path leaves source");
  return file;
}

function fields(f) {
  return { path: f?.File ?? f?.file, rule: f?.RuleID ?? f?.rule,
    line: f?.StartLine ?? f?.line, column: f?.StartColumn ?? f?.column,
    value: f?.Secret ?? f?.secret };
}

export async function reproduceReviewedFinding({ rootDir, binaryPath, path, rule, line, column,
  reviewedValue, spawnFn = spawnSync, env = process.env }) {
  if (!domain(reviewedValue)) return { ok: false, reason: "reviewed value is not a plain domain" };
  if (!safePath(path) || typeof rule !== "string" || !/^[a-z0-9][a-z0-9._-]*$/iu.test(rule)
    || !Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) {
    return { ok: false, reason: "invalid finding selector" };
  }
  try {
    const configPath = resolveGitleaksConfigPath();
    if (!configPath || typeof binaryPath !== "string") return { ok: false, reason: "scanner or config unavailable" };
    const inputSha256 = fileDigest(sourcePath(rootDir, path));
    const configSha256 = fileDigest(configPath);
    const binarySha256 = fileDigest(binaryPath);
    const adapterSha256 = fileDigest(fileURLToPath(new URL("./gitleaks.mjs", import.meta.url)));
    const gateSourceSha256 = fileDigest(fileURLToPath(import.meta.url));
    const scan = await run({ rootDir, config: { binaryPath }, spawnFn, env });
    if (scan.status === "ERROR" || scan.status === "SKIPPED" || typeof scan.raw !== "string") {
      return { ok: false, reason: `scanner unavailable: ${scan.classification ?? scan.status}` };
    }
    const report = JSON.parse(scan.raw);
    if (!Array.isArray(report)) return { ok: false, reason: "malformed scanner report" };
    const matches = report.map(f => fields(normalizeCandidateFindingPath(f, rootDir)))
      .filter(f => f.path === path && f.rule === rule && f.line === line && f.column === column);
    if (matches.length !== 1 || matches[0].value !== reviewedValue) {
      return { ok: false, reason: "finding or exact reviewed value mismatch" };
    }
    return { ok: true, gate: {
      schema: "pipeline.gitleaks-reproduction-gate.v1", historicalIdentity: "unknown",
      scanner: "gitleaks", binarySha256, adapterSha256, gateSourceSha256, configSha256, inputSha256,
      ignoreSha256: scan.ignored?.authoritySha256 ?? null,
      reportSha256: digest(scan.raw), path, rule, line, column,
      valueSha256: digest(reviewedValue),
    } };
  } catch {
    return { ok: false, reason: "reproduction input unavailable or malformed" };
  }
}

export async function verifyReproductionGate({ gate, ...options }) {
  if (!gate || typeof gate !== "object" || Array.isArray(gate)
    || Object.keys(gate).sort().join("|") !== ["schema", "historicalIdentity", "scanner", "binarySha256", "adapterSha256", "gateSourceSha256", "configSha256", "inputSha256", "ignoreSha256", "reportSha256", "path", "rule", "line", "column", "valueSha256"].sort().join("|")
    || gate.schema !== "pipeline.gitleaks-reproduction-gate.v1" || gate.historicalIdentity !== "unknown"
    || gate.scanner !== "gitleaks" || !(gate.ignoreSha256 === null || hex(gate.ignoreSha256))
    || ![gate.binarySha256, gate.adapterSha256, gate.gateSourceSha256, gate.configSha256, gate.inputSha256, gate.reportSha256, gate.valueSha256].every(hex)) {
    return { ok: false, reason: "missing or malformed reproduction gate" };
  }
  const current = await reproduceReviewedFinding({ ...options, path: gate.path, rule: gate.rule,
    line: gate.line, column: gate.column });
  if (!current.ok) return current;
  if (JSON.stringify(current.gate) !== JSON.stringify(gate)) {
    return { ok: false, reason: "stale or forged reproduction gate" };
  }
  return { ok: true, observedReportSha256: current.gate.reportSha256 };
}

// Synchronous final-readback for the publication boundary after any awaited scanner call.
// The report digest is supplied only by that scanner call, never by the caller's gate JSON.
export function reproductionGateFactsStillMatch({ gate, rootDir, binaryPath, reviewedValue, rawReport, observedReportSha256 }) {
  try {
    const configPath = resolveGitleaksConfigPath();
    return domain(reviewedValue) && gate?.schema === "pipeline.gitleaks-reproduction-gate.v1"
      && digest(reviewedValue) === gate.valueSha256
      && (typeof rawReport === "string" ? digest(rawReport) : observedReportSha256) === gate.reportSha256
      && fileDigest(sourcePath(rootDir, gate.path)) === gate.inputSha256
      && (existsSync(join(rootDir, ".gitleaksignore"))
        ? fileDigest(join(rootDir, ".gitleaksignore")) : null) === gate.ignoreSha256
      && fileDigest(binaryPath) === gate.binarySha256
      && fileDigest(configPath) === gate.configSha256
      && fileDigest(fileURLToPath(new URL("./gitleaks.mjs", import.meta.url))) === gate.adapterSha256
      && fileDigest(fileURLToPath(import.meta.url)) === gate.gateSourceSha256;
  } catch { return false; }
}
