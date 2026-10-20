#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * architecture-boundary-check.mjs -- the architecture map, checked over the whole tracked tree.
 * (FB3-PF-54 first stage, D56 (1); backlog/items/2026-10-20-the-architecture-map-is-not-enforced.md)
 *
 * The fitness evaluator (architecture-fitness.mjs) checks only the paths a caller hands it, so a
 * Verify run with no candidate list checks no import at all. This check walks `git ls-files` itself
 * and applies three rules to every tracked source file:
 *   - `unowned-path` / `ambiguous-ownership`: the file belongs to exactly one module's `ownedPaths`
 *     (the longest matching pattern wins, as in `resolveModuleForPath`; a tie between two modules is
 *     ambiguous);
 *   - `forbidden-dependency`: a relative import (`./`, `../`) stays inside its module or reaches a
 *     module listed in `allowedDependencies`; package and `node:` imports are not the map's concern;
 *   - `over-line-bound`: the file has at most `lineBound` lines.
 * Each violation names the file, the module and the rule.
 *
 * The optional `architecture/boundary-policy.json` (`pipeline.architecture-boundary-policy.v1`)
 * sets the bound, excludes trees that hold no source of the project (`excludedPaths`, e.g.
 * recorded evidence), and lists accepted exceptions, each with a reason. A line-bound exception is
 * a ratchet, not a pass: it records `maxLines`, and a file that grows past it is a violation
 * again. `--write-policy` writes a first policy that accepts the current violations, only when
 * none exists. A project without `architecture/map` is `not-applicable`, never failed. The fitness
 * evaluator, whose outcomes the rigor lifecycle binds by digest, is not changed.
 *
 * Usage: node architecture-boundary-check.mjs [--root <dir>] [--json] [--write-policy]
 * Exit: 0 pass or not-applicable, 1 findings or an invalid map/policy, 2 unavailable or usage.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapBundle, pathMatchesPattern } from "./module-inventory.mjs";
import { extractJsImports } from "./architecture-fitness.mjs";

export const BOUNDARY_CHECK_SCHEMA = "pipeline.architecture-boundary-check.v1";
export const BOUNDARY_POLICY_SCHEMA = "pipeline.architecture-boundary-policy.v1";
export const BOUNDARY_POLICY_PATH = "architecture/boundary-policy.json";
export const DEFAULT_LINE_BOUND = 1000;
export const BOUNDARY_RULES = Object.freeze(["unowned-path", "ambiguous-ownership", "forbidden-dependency", "over-line-bound"]);
export const DEFAULT_SOURCE_EXTENSIONS = Object.freeze([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".py", ".go", ".rs", ".java", ".kt",
  ".rb", ".cs", ".swift", ".c", ".h", ".cc", ".cpp", ".hpp", ".php", ".scala",
]);
const IMPORT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"]);
const POLICY_KEYS = new Set(["schema", "lineBound", "excludedPaths", "exceptions"]);
const EXCEPTION_KEYS = Object.freeze({
  "unowned-path": ["rule", "path", "reason"],
  "ambiguous-ownership": ["rule", "path", "reason"],
  "forbidden-dependency": ["rule", "path", "target", "reason"],
  "over-line-bound": ["rule", "path", "maxLines", "reason"],
});

/** Every module whose longest matching pattern ties for the longest match of `relPath`. */
export function owningModules(relPath, modules) {
  let best = -1;
  let owners = [];
  for (const mod of modules) {
    let length = -1;
    for (const pattern of mod.ownedPaths ?? []) {
      if (pathMatchesPattern(relPath, pattern)) length = Math.max(length, pattern.length);
    }
    if (length < 0) continue;
    if (length > best) { best = length; owners = [mod]; }
    else if (length === best && !owners.some((owner) => owner.id === mod.id)) owners.push(mod);
  }
  return owners;
}

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export const defaultBoundaryPolicy = () => ({ lineBound: DEFAULT_LINE_BOUND, excludedPaths: [], exceptions: [], source: "default" });

/** Reads the optional policy; returns `{ok, policy}` or `{ok:false, errors}`. */
export function readBoundaryPolicy(rootDir) {
  const file = path.join(rootDir, BOUNDARY_POLICY_PATH);
  if (!existsSync(file)) return { ok: true, policy: defaultBoundaryPolicy() };
  let value;
  try { value = JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { return { ok: false, errors: [`${BOUNDARY_POLICY_PATH}: not JSON (${error.message})`] }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: [`${BOUNDARY_POLICY_PATH}: must be an object`] };
  const errors = [];
  for (const key of Object.keys(value)) if (!POLICY_KEYS.has(key)) errors.push(`${BOUNDARY_POLICY_PATH}: unknown key "${key}"`);
  if (value.schema !== BOUNDARY_POLICY_SCHEMA) errors.push(`${BOUNDARY_POLICY_PATH}: schema must be ${BOUNDARY_POLICY_SCHEMA}`);
  const lineBound = value.lineBound ?? DEFAULT_LINE_BOUND;
  if (!Number.isInteger(lineBound) || lineBound < 1) errors.push(`${BOUNDARY_POLICY_PATH}: lineBound must be a positive integer`);
  const excludedPaths = value.excludedPaths ?? [];
  if (!Array.isArray(excludedPaths) || !excludedPaths.every((entry) => exactKeys(entry, ["pattern", "reason"]) && nonEmpty(entry.pattern) && nonEmpty(entry.reason))) {
    errors.push(`${BOUNDARY_POLICY_PATH}: excludedPaths is a list of {pattern, reason}, both non-empty`);
  }
  const exceptions = value.exceptions ?? [];
  if (!Array.isArray(exceptions)) errors.push(`${BOUNDARY_POLICY_PATH}: exceptions must be a list`);
  else {
    exceptions.forEach((entry, index) => {
      const keys = EXCEPTION_KEYS[entry?.rule];
      const shaped = keys && exactKeys(entry, keys) && nonEmpty(entry.path) && nonEmpty(entry.reason)
        && (entry.rule !== "forbidden-dependency" || nonEmpty(entry.target))
        && (entry.rule !== "over-line-bound" || (Number.isInteger(entry.maxLines) && entry.maxLines > 0));
      if (!shaped) errors.push(`${BOUNDARY_POLICY_PATH}: exceptions[${index}] must be {rule, path, reason} plus target (forbidden-dependency) or maxLines (over-line-bound)`);
    });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, policy: { lineBound, excludedPaths, exceptions, source: BOUNDARY_POLICY_PATH } };
}

function trackedFiles(rootDir) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: rootDir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) return null;
  return result.stdout.split("\0").filter(Boolean);
}

function lineCount(text) {
  if (text.length === 0) return 0;
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") ? breaks : breaks + 1;
}

const exceptionKey = (rule, file, target = null) => JSON.stringify([rule, file, target]);
const order = (a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule) || String(a.target ?? "").localeCompare(String(b.target ?? ""));

/** All raw violations of the tree, before exceptions. */
function observe(root, modules, policy, listed, readFile, extensions) {
  const excluded = (file) => policy.excludedPaths.some((entry) => pathMatchesPattern(file, entry.pattern));
  const sources = listed.filter((file) => extensions.has(path.extname(file)) && !excluded(file)).sort();
  const violations = [];
  for (const file of sources) {
    const owners = owningModules(file, modules);
    if (owners.length === 0) {
      violations.push({ file, module: null, rule: "unowned-path", detail: `${file} is in no module's ownedPaths` });
    } else if (owners.length > 1) {
      const ids = owners.map((owner) => owner.id).sort();
      violations.push({ file, module: ids.join(", "), rule: "ambiguous-ownership", detail: `${file} is owned equally by ${ids.join(" and ")}` });
    }
    let text;
    try { text = readFile(path.join(root, file)); } catch { continue; }
    const lines = lineCount(text);
    if (lines > policy.lineBound) {
      violations.push({ file, module: owners.length === 1 ? owners[0].id : null, rule: "over-line-bound", lines,
        detail: `${file} has ${lines} lines, over the bound of ${policy.lineBound}` });
    }
    if (owners.length !== 1 || !IMPORT_EXTENSIONS.has(path.extname(file))) continue;
    const caller = owners[0];
    const allowed = caller.allowedDependencies ?? [];
    for (const spec of new Set(extractJsImports(text))) {
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      if (target.startsWith("../")) {
        violations.push({ file, module: caller.id, rule: "forbidden-dependency", target, detail: `${file} imports ${spec}, outside the project` });
        continue;
      }
      const targetOwners = owningModules(target, modules);
      if (targetOwners.length !== 1 || targetOwners[0].id === caller.id || allowed.includes(targetOwners[0].id)) continue;
      violations.push({ file, module: caller.id, rule: "forbidden-dependency", target,
        detail: `module ${caller.id} imports ${target} of module ${targetOwners[0].id}, which is not in its allowedDependencies [${allowed.join(", ")}]` });
    }
  }
  return { sources, violations: violations.sort(order) };
}

/**
 * Checks the tracked tree against the map. `deps.listFiles(rootDir)` and `deps.readFile(abs)` are
 * injectable for tests.
 */
export function checkArchitectureBoundaries({ rootDir = process.cwd(), sourceExtensions = DEFAULT_SOURCE_EXTENSIONS } = {}, deps = {}) {
  const root = path.resolve(rootDir);
  const base = { schema: BOUNDARY_CHECK_SCHEMA, rules: BOUNDARY_RULES };
  if (!existsSync(path.join(root, "architecture/map"))) {
    return { ...base, status: "not-applicable", reason: "no architecture/map in this project", violations: [] };
  }
  const bundle = loadMapBundle(root);
  if (!bundle.ok) return { ...base, status: "map-invalid", errors: bundle.errors, violations: [] };
  const policyRead = (deps.readPolicy ?? readBoundaryPolicy)(root);
  if (!policyRead.ok) return { ...base, status: "policy-invalid", errors: policyRead.errors, violations: [] };
  const { policy } = policyRead;
  const listed = (deps.listFiles ?? trackedFiles)(root);
  if (listed === null) return { ...base, status: "unavailable", reason: "git ls-files failed; the check needs a Git work tree", violations: [] };
  const readFile = deps.readFile ?? ((abs) => readFileSync(abs, "utf8"));
  const { sources, violations: observed } = observe(root, bundle.modules, policy, listed, readFile, new Set(sourceExtensions));

  const accepted = new Map(policy.exceptions.map((entry) => [exceptionKey(entry.rule, entry.path, entry.target ?? null), entry]));
  const used = new Set();
  const violations = [];
  let excepted = 0;
  for (const violation of observed) {
    const key = exceptionKey(violation.rule, violation.file, violation.rule === "forbidden-dependency" ? violation.target : null);
    const entry = accepted.get(key);
    if (entry && (violation.rule !== "over-line-bound" || violation.lines <= entry.maxLines)) {
      used.add(key);
      excepted += 1;
      continue;
    }
    if (entry) {
      used.add(key);
      violations.push({ ...violation, detail: `${violation.detail}, and past its accepted ${entry.maxLines} lines in ${BOUNDARY_POLICY_PATH}; split it rather than raise the ratchet` });
      continue;
    }
    violations.push({ ...violation, detail: `${violation.detail}; fix it, or accept it in ${BOUNDARY_POLICY_PATH} exceptions with a reason` });
  }
  // An exception no violation used any more (fixed, removed, or now under the bound) can be dropped; never a failure.
  const staleExceptions = policy.exceptions
    .filter((entry) => !used.has(exceptionKey(entry.rule, entry.path, entry.target ?? null)))
    .map((entry) => ({ rule: entry.rule, path: entry.path, ...(entry.target ? { target: entry.target } : {}) }));
  return {
    ...base,
    status: violations.length ? "findings" : "pass",
    policy: { lineBound: policy.lineBound, excludedPaths: policy.excludedPaths.length, exceptions: policy.exceptions.length, source: policy.source },
    counts: { sourceFiles: sources.length, modules: bundle.modules.length, violations: violations.length, excepted },
    violations,
    staleExceptions,
    _observed: observed,
  };
}

/** A first policy that accepts every current violation, ready to be committed and then ratcheted down. */
export function proposeBoundaryPolicy(result, { lineBound = DEFAULT_LINE_BOUND, excludedPaths = [], reason } = {}) {
  const why = reason ?? "accepted when the boundary check was adopted; fix it and remove this entry";
  return {
    schema: BOUNDARY_POLICY_SCHEMA,
    lineBound,
    excludedPaths,
    exceptions: (result._observed ?? []).map((violation) => ({
      rule: violation.rule,
      path: violation.file,
      ...(violation.rule === "forbidden-dependency" ? { target: violation.target } : {}),
      ...(violation.rule === "over-line-bound" ? { maxLines: violation.lines } : {}),
      reason: why,
    })),
  };
}

export function exitCodeForBoundaryCheck(result) {
  if (result.status === "pass" || result.status === "not-applicable") return 0;
  if (result.status === "unavailable") return 2;
  return 1;
}

function publicResult(result) {
  const { _observed, ...rest } = result;
  return rest;
}

function runCli(argv) {
  let rootDir = process.cwd();
  let json = false;
  let writePolicy = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root" && argv[index + 1]) rootDir = argv[++index];
    else if (argv[index] === "--json") json = true;
    else if (argv[index] === "--write-policy") writePolicy = true;
    else {
      process.stderr.write("usage: architecture-boundary-check.mjs [--root <dir>] [--json] [--write-policy]\n");
      return 2;
    }
  }
  if (writePolicy) {
    const target = path.join(path.resolve(rootDir), BOUNDARY_POLICY_PATH);
    if (existsSync(target)) {
      process.stderr.write(`${BOUNDARY_POLICY_PATH} exists; edit it, it is never overwritten\n`);
      return 1;
    }
    const observed = checkArchitectureBoundaries({ rootDir }, { readPolicy: () => ({ ok: true, policy: defaultBoundaryPolicy() }) });
    if (!Array.isArray(observed._observed)) {
      process.stderr.write(`no policy written: the check is ${observed.status}\n`);
      return exitCodeForBoundaryCheck(observed) || 1;
    }
    writeFileSync(target, `${JSON.stringify(proposeBoundaryPolicy(observed), null, 2)}\n`, { flag: "wx" });
    process.stdout.write(`wrote ${BOUNDARY_POLICY_PATH} accepting ${observed._observed.length} current violation(s); commit it, then remove entries as they are fixed\n`);
    return 0;
  }
  const result = checkArchitectureBoundaries({ rootDir });
  if (json) process.stdout.write(`${JSON.stringify(publicResult(result), null, 2)}\n`);
  else {
    process.stdout.write(`Architecture boundary check: ${result.status}${result.counts ? ` (${result.counts.sourceFiles} source files, ${result.counts.violations} violations, ${result.counts.excepted} accepted)` : ""}\n`);
    for (const line of result.errors ?? []) process.stdout.write(`  - ${line}\n`);
    if (result.reason) process.stdout.write(`  - ${result.reason}\n`);
    for (const violation of result.violations) process.stdout.write(`  - [${violation.rule}] ${violation.detail}\n`);
  }
  return exitCodeForBoundaryCheck(result);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runCli(process.argv.slice(2));
}
