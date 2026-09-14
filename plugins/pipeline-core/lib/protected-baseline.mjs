// SPDX-License-Identifier: SUL-1.0
/** Immutable protected-surface baseline (Sprint Alfred A3 / #101). */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgainstSchema } from "./schema-lite.mjs";
import { resolveAuthorityArtifactPath } from "./project-authority.mjs";

export const PROTECTED_BASELINE_SCHEMA = "pipeline.protected-baseline.v1";
export const PB_CONFIG_INVALID = "PB-CONFIG-INVALID";
export const PB_SUBTRACTION_ATTEMPT = "PB-SUBTRACTION-ATTEMPT";
export const PB_DYNAMIC_UNAVAILABLE = "PB-DYNAMIC-UNAVAILABLE";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = join(PLUGIN_ROOT, "protected-baseline.json");
const SCHEMA_FILE = resolve(PLUGIN_ROOT, "..", "..", "schemas", "pipeline.protected-baseline.v1.json");
const CLASSES = new Set(["config", "loader", "hook", "contract-test", "verify-registration", "sanctioned-writer"]);
const REGEXP_META = /[\\^$.*+?()[\]{}|]/u;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function normal(value) { return String(value ?? "").replace(/\\\\/gu, "/").replace(/^\.\//u, ""); }
function asDiagnostic(code, message, extra = {}) { return Object.freeze({ code, message, ...extra }); }
function compiled(entry) { try { return new RegExp(entry.pathPattern, "i"); } catch { return null; } }
function matches(entry, filePath) { return compiled(entry)?.test(normal(filePath)) ?? false; }
function validEntry(entry) { return entry && typeof entry.id === "string" && entry.id && typeof entry.pathPattern === "string" && entry.pathPattern && CLASSES.has(entry.class) && typeof entry.rationale === "string" && entry.rationale && compiled(entry); }

/** Physical canonicalization rejects both escapes and existing symlinks. */
export function canonicalProjectPath(rootDir, pathValue, adapters = {}) {
  const realpath = adapters.realpathSyncFn ?? realpathSync;
  const exists = adapters.existsSyncFn ?? existsSync;
  const lstat = adapters.lstatSyncFn ?? lstatSync;
  const root = resolve(rootDir);
  const candidate = resolve(root, normal(pathValue));
  if (candidate === root || relative(root, candidate).startsWith(`..${sep}`)) throw new Error("path escapes repository root");
  if (exists(candidate) && lstat(candidate).isSymbolicLink()) throw new Error("path is a symbolic link");
  const physicalRoot = realpath(root);
  const physical = exists(candidate) ? realpath(candidate) : candidate;
  if (physical === physicalRoot || relative(physicalRoot, physical).startsWith(`..${sep}`)) throw new Error("physical path escapes repository root");
  return normal(relative(physicalRoot, physical));
}

export function loadShippedProtectedBaseline({ readFileSyncFn = readFileSync } = {}) {
  try {
    const baseline = JSON.parse(readFileSyncFn(BASELINE_FILE, "utf8"));
    const schema = JSON.parse(readFileSyncFn(SCHEMA_FILE, "utf8"));
    const result = validateAgainstSchema(baseline, schema);
    if (!result.valid || baseline.schema !== PROTECTED_BASELINE_SCHEMA || !baseline.entries.every(validEntry)) throw new Error(result.errors.join("; ") || "invalid baseline entry");
    if (new Set(baseline.entries.map((entry) => entry.id)).size !== baseline.entries.length) throw new Error("duplicate baseline id");
    return Object.freeze({ ok: true, baseline: Object.freeze(baseline), baselineDigest: sha256(baseline) });
  } catch (error) {
    return Object.freeze({ ok: false, diagnostics: [asDiagnostic(PB_CONFIG_INVALID, `shipped protected baseline unavailable: ${error.message}`)] });
  }
}

function configPath(rootDir) {
  const resolved = resolveAuthorityArtifactPath("guardConfig", { rootDir });
  return { path: resolved.path, relPath: resolved.relPath };
}
function entryFromLegacy(entry, index) {
  return {
    // Preserve the historic guard-testpath fallback exactly for migration
    // compatibility; only the new protectedSurfaceAdditions namespace uses
    // PROJECT-<n> defaults.
    id: typeof entry?.id === "string" && entry.id ? entry.id : `TP-${index + 1}`,
    pathPattern: typeof entry?.pattern === "string" ? entry.pattern : "",
    class: "contract-test",
    rationale: typeof entry?.reason === "string" && entry.reason ? entry.reason : "Legacy additive protected test path.",
  };
}
function loadProjectAdditions(rootDir, adapters) {
  const location = configPath(rootDir);
  try {
    if (!adapters.existsSyncFn(location.path)) return { location, additions: [], diagnostics: [] };
    const stat = adapters.lstatSyncFn(location.path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("guard config is not a regular non-symlink file");
    const config = JSON.parse(adapters.readFileSyncFn(location.path, "utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("guard config is not an object");
    if (config.protectedSurfaceAdditions !== undefined && !Array.isArray(config.protectedSurfaceAdditions)) throw new Error("protectedSurfaceAdditions is not an array");
    if (config.protectedTestPaths !== undefined && !Array.isArray(config.protectedTestPaths)) throw new Error("protectedTestPaths is not an array");
    const additions = [
      ...(config.protectedSurfaceAdditions ?? []),
      ...(config.protectedTestPaths ?? []).map(entryFromLegacy),
    ].map((entry, index) => ({
      id: typeof entry?.id === "string" && entry.id ? entry.id : `PROJECT-${index + 1}`,
      pathPattern: typeof entry?.pathPattern === "string" ? entry.pathPattern : "",
      class: typeof entry?.class === "string" ? entry.class : "contract-test",
      rationale: typeof entry?.rationale === "string" && entry.rationale ? entry.rationale : "Project additive protected surface.",
    }));
    return { location, additions, diagnostics: [] };
  } catch (error) {
    return { location, additions: [], diagnostics: [asDiagnostic(PB_CONFIG_INVALID, `project guard config invalid; baseline only: ${error.message}`, { configPath: location.relPath })] };
  }
}
function validateAdditions(rootDir, additions, baseline, adapters) {
  const diagnostics = [];
  const ids = new Set();
  const patterns = new Set();
  const baselineIds = new Set(baseline.map((entry) => entry.id));
  const baselinePatterns = new Set(baseline.map((entry) => normal(entry.pathPattern).toLocaleLowerCase("en-US")));
  for (const entry of additions) {
    const pattern = normal(entry.pathPattern).toLocaleLowerCase("en-US");
    let code = null;
    if (!validEntry(entry) || ids.has(entry.id) || patterns.has(pattern)) code = PB_CONFIG_INVALID;
    if (baselineIds.has(entry.id) || baselinePatterns.has(pattern)) code = PB_SUBTRACTION_ATTEMPT;
    const literal = normal(entry.pathPattern).replace(/\$$/u, "");
    if (!REGEXP_META.test(literal)) {
      try { canonicalProjectPath(rootDir, literal, adapters); } catch { code = PB_SUBTRACTION_ATTEMPT; }
    }
    if (code) diagnostics.push(asDiagnostic(code, `project entry ${entry.id} is not an additive protected-surface entry`, { entryId: entry.id }));
    ids.add(entry.id); patterns.add(pattern);
  }
  return diagnostics.length ? { entries: [], diagnostics } : { entries: additions.map(Object.freeze), diagnostics };
}
function dynamicContinuityEntries(rootDir, adapters) {
  try {
    const state = resolveAuthorityArtifactPath("state", { rootDir });
    if (!adapters.existsSyncFn(state.path)) throw new Error("lifecycle state is absent");
    const parsed = JSON.parse(adapters.readFileSyncFn(state.path, "utf8"));
    if (!Array.isArray(parsed?.closedFeatures)) throw new Error("closedFeatures is not an array");
    const entries = [];
    for (const feature of parsed.closedFeatures) {
      for (const [key, binding] of Object.entries(feature?.continuityClose ?? {})) {
        if (!binding || typeof binding !== "object" || typeof binding.path !== "string" || !binding.path) continue;
        const path = canonicalProjectPath(rootDir, binding.path, adapters);
        entries.push(Object.freeze({
          id: `PB-CONTINUITY-${feature.id ?? "closed"}-${key}`,
          pathPattern: `${path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`,
          class: "sanctioned-writer",
          rationale: "Closed continuity evidence is dynamically protected from lifecycle state.",
          dynamic: true,
        }));
      }
    }
    return { status: "available", entries, diagnostics: [] };
  } catch (error) {
    return { status: "unavailable", entries: [], diagnostics: [asDiagnostic(PB_DYNAMIC_UNAVAILABLE, `dynamic continuity class unavailable; static baseline remains active: ${error.message}`)] };
  }
}

/** Resolves baseline ∪ project additions ∪ state-bound continuity evidence. */
export function resolveProtectedBaseline({ rootDir = process.cwd(), readFileSyncFn = readFileSync, existsSyncFn = existsSync, lstatSyncFn = lstatSync, realpathSyncFn = realpathSync } = {}) {
  const adapters = { readFileSyncFn, existsSyncFn, lstatSyncFn, realpathSyncFn };
  const shipped = loadShippedProtectedBaseline({ readFileSyncFn });
  if (!shipped.ok) return Object.freeze({ status: "unavailable", entries: [], identity: null, diagnostics: shipped.diagnostics, dynamic: { status: "unavailable", entries: [] } });
  const project = loadProjectAdditions(rootDir, adapters);
  const additions = validateAdditions(rootDir, project.additions, shipped.baseline.entries, adapters);
  const dynamic = dynamicContinuityEntries(rootDir, adapters);
  // Additions are evaluated first for compatible rule identifiers/reasons; this
  // does not alter baseline membership, which remains present in every result.
  const entries = Object.freeze([...additions.entries, ...shipped.baseline.entries, ...dynamic.entries]);
  return Object.freeze({
    status: "ready",
    entries,
    identity: Object.freeze({ baselineRevision: shipped.baseline.baselineRevision, baselineDigest: shipped.baselineDigest, mergedDigest: sha256({ baselineRevision: shipped.baseline.baselineRevision, entries }) }),
    diagnostics: Object.freeze([...project.diagnostics, ...additions.diagnostics, ...dynamic.diagnostics]),
    configPath: project.location.relPath,
    dynamic: Object.freeze({ status: dynamic.status, entries: dynamic.entries }),
  });
}

export function protectedBaselineRuleFor(entries, filePath) { return entries.find((entry) => matches(entry, filePath)) ?? null; }
export function protectedBaselineReadback(options = {}) {
  const baseline = resolveProtectedBaseline(options);
  return Object.freeze({ schema: PROTECTED_BASELINE_SCHEMA, status: baseline.status, identity: baseline.identity, entries: baseline.entries, diagnostics: baseline.diagnostics, dynamic: baseline.dynamic.status });
}
