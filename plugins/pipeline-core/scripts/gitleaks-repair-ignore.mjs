#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * gitleaks-repair-ignore.mjs -- repairs exactly one stale `.gitleaksignore` content-v1 entry
 * (NVA-GLFP-1): the manual fix for the near-miss diagnostic gitleaks.mjs's `run()` now appends to
 * a blocked finding's `msg` (path+rule+column match an entry recorded at a DIFFERENT line -- the
 * line-bound suppression almost certainly just needs recomputing after something moved above it,
 * see gitleaks.mjs's header doc and backlog
 * pipeline.gitleaks-content-fingerprint-breaks-on-any-line-insertion-above-it).
 *
 * DELIBERATE, ON-REQUEST ONLY: this is never invoked by the scan itself -- `run()` only reports
 * the mismatch and points here. Rewriting a live suppression is a distinct, deliberate act; the
 * scan silently repairing its own suppressions would defeat the review the line-binding exists to
 * enforce (the digest still binds path+rule+line+column+secret exactly as before; only the
 * specific entry named on the command line is ever touched, and only by re-running the same
 * digest arithmetic gitleaksContentAuthorityLine() already uses everywhere else).
 *
 * Exported core (`repairStaleIgnoreEntry`) accepts an injectable spawnFn/binaryPath so it is
 * unit-testable with a hermetic spy (see gitleaks.test.mjs), the same convention gitleaks.mjs's
 * own run() already uses. The CLI below is a thin argv wrapper around it using the real,
 * PATH/PIPELINE_GITLEAKS_PATH-resolved gitleaks binary via gitleaks.mjs's own isInstalled().
 *
 * Public use first calls --prepare-gate with the exact current --line and a manually reviewed
 * plain-domain value in a regular file under root/scratch. It writes only digest metadata under
 * scratch. A later --approve-new or stale --old-line repair re-runs the scanner and checks that
 * same gate, value, source file, config and binary before touching `.gitleaksignore`. The low-level
 * exported repair primitive retains its injected-spawn test seam; ordinary production calls to
 * it without this module's verified gate refuse mutation. The gate is not push authorization.
 */
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import {
  run,
  gitleaksContentAuthorityLine,
  parseContentAuthorityLine,
  normalizeCandidateFindingPath,
  isInstalled,
} from "./security-adapters/gitleaks.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { reproduceReviewedFinding, reproductionGateFactsStillMatch, verifyReproductionGate } from "./security-adapters/gitleaks-reproduction-gate.mjs";
import { assessTrustedExecutablePath } from "./tool-identity.mjs";

const IGNORE_FILE = ".gitleaksignore";
const PENDING_FILE = ".gitleaksignore.pipeline-pending";
const MAX_IGNORE_BYTES = 256 * 1024;
const VERIFIED_LOCAL_REPRODUCTION = Symbol("verified-local-reproduction");

function physicalIgnorePath(rootDir, ignoreFilePath) {
  const lexicalRoot = resolve(rootDir);
  const root = realpathSync(lexicalRoot);
  if (process.platform !== "win32" && root !== lexicalRoot) throw new Error("root path is linked");
  if (!lstatSync(lexicalRoot).isDirectory() || lstatSync(lexicalRoot).isSymbolicLink()) throw new Error("root is not a physical directory");
  const path = join(root, IGNORE_FILE);
  if (ignoreFilePath !== undefined && resolve(ignoreFilePath) !== path) throw new Error("ignore path must be root .gitleaksignore");
  return { root, path };
}

function readIgnoreSnapshot(rootDir, ignoreFilePath, required = false) {
  const { root, path } = physicalIgnorePath(rootDir, ignoreFilePath);
  let before;
  try { before = lstatSync(path); }
  catch (error) {
    if (error.code === "ENOENT" && !required) return { root, path, stat: null, bytes: null };
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_IGNORE_BYTES) {
    throw new Error("ignore file is linked, nonregular or too large");
  }
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error("ignore file changed during open");
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (bytes.length > MAX_IGNORE_BYTES || after.size !== bytes.length || after.dev !== before.dev || after.ino !== before.ino) {
      throw new Error("ignore file changed during read");
    }
    return { root, path, stat: after, bytes };
  } finally { closeSync(fd); }
}

function sameIgnoreSnapshot(expected) {
  try {
    const current = readIgnoreSnapshot(expected.root, expected.path);
    return expected.stat === null ? current.stat === null
      : current.stat !== null && expected.stat.dev === current.stat.dev
        && expected.stat.ino === current.stat.ino && expected.bytes.equals(current.bytes);
  } catch { return false; }
}

// Exclusive staging serializes this CLI's cooperating publishers. The preimage check and rename
// give atomic file replacement; they are not an OS-level compare-and-swap against a hostile
// same-UID process that races the final rename. No scanner or push authority is minted here.
function publishIgnore(expected, bytes, finalFactsMatch = () => true) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_IGNORE_BYTES) return { ok: false, reason: "ignore output too large" };
  const stage = join(expected.root, PENDING_FILE);
  let fd = null;
  let stageStat = null;
  try {
    fd = openSync(stage, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    stageStat = fstatSync(fd);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    if (!sameIgnoreSnapshot(expected) || !finalFactsMatch()) return { ok: false, reason: "ignore or reproduction facts changed before publication" };
    const now = lstatSync(stage);
    const reread = Buffer.alloc(bytes.length);
    const count = readSync(fd, reread, 0, reread.length, 0);
    if (!now.isFile() || now.nlink !== 1 || now.dev !== stageStat.dev || now.ino !== stageStat.ino
      || now.size !== bytes.length || count !== bytes.length || !reread.equals(bytes)) {
      return { ok: false, reason: "publication stage changed" };
    }
    renameSync(stage, expected.path);
    stageStat = null;
    closeSync(fd); fd = null;
    return { ok: true };
  } catch {
    return { ok: false, reason: "ignore publication unavailable" };
  } finally {
    if (fd !== null) try { closeSync(fd); } catch {}
    if (stageStat !== null) try {
      const now = lstatSync(stage);
      if (now.isFile() && now.nlink === 1 && now.dev === stageStat.dev && now.ino === stageStat.ino) unlinkSync(stage);
    } catch {}
  }
}

/**
 * Repairs one stale content-v1 `.gitleaksignore` entry in place. Never touches any other entry or
 * line in the file. Returns `{ ok: true, ignoreFilePath, oldLine, newLine, newEntry }` on success,
 * `{ ok: false, reason }` on any failure -- never throws, never partially writes the file.
 *
 * Refuses (`reason` starting `value-binding-mismatch:`) unless the live finding carries the SAME
 * value the replaced entry was computed for: the entry is re-bound only to a value somebody reviewed.
 */
export async function repairStaleIgnoreEntry({
  rootDir,
  ignoreFilePath,
  path: targetPath,
  rule: targetRule,
  column: targetColumn,
  oldLine,
  spawnFn = nodeSpawnSync,
  binaryPath,
  timeoutMs = 60000,
  env = process.env,
  recomputeOnly = false,
  expectedLine,
  verifiedLocalReproduction,
  reproductionGate,
  reviewedValue,
}) {
  // The injected-spawn route is METHOD-only test compatibility, not provenance or production
  // admission. Ordinary callers must use the CLI's private verification path.
  if (!recomputeOnly && spawnFn === nodeSpawnSync && verifiedLocalReproduction !== VERIFIED_LOCAL_REPRODUCTION) {
    return { ok: false, reason: "reproduction gate required before ignore mutation" };
  }
  if (typeof rootDir !== "string" || rootDir.length === 0) return { ok: false, reason: "rootDir is required" };
  if (typeof targetPath !== "string" || targetPath.length === 0) return { ok: false, reason: "path is required" };
  if (typeof targetRule !== "string" || targetRule.length === 0) return { ok: false, reason: "rule is required" };
  if (!Number.isSafeInteger(targetColumn) || targetColumn < 1) return { ok: false, reason: "column must be a positive integer" };
  if (!Number.isSafeInteger(oldLine) || oldLine < 1) return { ok: false, reason: "old-line must be a positive integer" };

  let snapshot;
  try { snapshot = readIgnoreSnapshot(rootDir, ignoreFilePath, true); }
  catch { return { ok: false, reason: "ignore destination is missing, linked, outside root or unreadable" }; }
  const resolvedIgnorePath = snapshot.path;
  const rawText = snapshot.bytes.toString("utf8");
  if (!Buffer.from(rawText).equals(snapshot.bytes)) return { ok: false, reason: "ignore file is not UTF-8" };
  const lines = rawText.split(/(?<=\n)/u);
  let staleIndex = -1;
  let staleDigest = null;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const parsed = parseContentAuthorityLine(trimmed);
    if (parsed.kind !== "content") continue;
    if (parsed.path === targetPath && parsed.rule === targetRule && parsed.column === targetColumn && parsed.line === oldLine) {
      if (staleIndex !== -1) {
        return { ok: false, reason: `${resolvedIgnorePath} has more than one entry at ${targetPath}:${targetRule}:${oldLine}:${targetColumn}; ambiguous, resolve by hand` };
      }
      staleIndex = i;
      staleDigest = parsed.digest;
    }
  }
  if (staleIndex === -1) {
    return { ok: false, reason: `no entry found at ${targetPath}:${targetRule}:${oldLine}:${targetColumn} in ${resolvedIgnorePath} -- nothing to repair` };
  }

  let resolvedBinaryPath = binaryPath;
  if (!resolvedBinaryPath) {
    const resolved = isInstalled(env);
    if (!resolved.installed) return { ok: false, reason: resolved.reason };
    resolvedBinaryPath = resolved.path;
  }

  const scanResult = await run({ rootDir, config: { binaryPath: resolvedBinaryPath }, spawnFn, timeoutMs, env });
  if (scanResult.raw === null || scanResult.status === "ERROR" || scanResult.status === "SKIPPED") {
    return { ok: false, reason: `gitleaks scan did not produce a report: ${scanResult.reason ?? scanResult.status}` };
  }
  let parsedRaw;
  try {
    parsedRaw = JSON.parse(scanResult.raw);
  } catch (err) {
    return { ok: false, reason: `could not parse gitleaks report: ${err.message}` };
  }
  if (!Array.isArray(parsedRaw)) return { ok: false, reason: "unexpected gitleaks report JSON shape (expected top-level array)" };

  const matches = [];
  for (const rawFinding of parsedRaw) {
    const finding = normalizeCandidateFindingPath(rawFinding, rootDir);
    const path = finding?.File ?? finding?.file;
    const rule = finding?.RuleID ?? finding?.rule;
    const column = finding?.StartColumn ?? finding?.column;
    if (path === targetPath && rule === targetRule && column === targetColumn) matches.push(finding);
  }
  if (matches.length === 0) {
    return { ok: false, reason: `no live finding currently matches ${targetPath}:${targetRule} column ${targetColumn} -- nothing to repair (rescan and re-check the diagnostic before retrying)` };
  }
  if (matches.length > 1) {
    return { ok: false, reason: `${matches.length} live findings match ${targetPath}:${targetRule} column ${targetColumn} -- ambiguous, resolve by hand` };
  }

  const newEntry = gitleaksContentAuthorityLine(matches[0]);
  if (newEntry === null) return { ok: false, reason: "could not compute a content authority for the live finding (malformed finding fields)" };

  // Value binding (backlog pipeline.gitleaks-repair-does-not-check-that-the-moved-value-is-the-reviewed-one):
  // the entry being replaced was reviewed for ONE value. Re-bind it only when the live finding carries
  // that same value: recompute the live finding's authority at the OLD line (same path, rule, column and
  // live value, StartLine = oldLine) and compare its digest with the digest of the entry being replaced.
  // A different value at the same path/rule/column was never reviewed and must stay a finding. Fail
  // closed (a digest that cannot be computed or parsed also refuses), before any write, and never put
  // the secret value in the reason.
  const liveAtOldLineLine = gitleaksContentAuthorityLine({ ...matches[0], StartLine: oldLine });
  const liveAtOldLine = liveAtOldLineLine === null ? null : parseContentAuthorityLine(liveAtOldLineLine);
  if (liveAtOldLine?.kind !== "content" || liveAtOldLine.digest !== staleDigest) {
    return { ok: false, reason: `value-binding-mismatch: the live finding at ${targetPath}:${targetRule} column ${targetColumn} does not carry the value the entry at line ${oldLine} was recorded for -- refusing to re-bind an entry to a value nobody reviewed; review the live finding and replace the entry by hand if it is acceptable` };
  }

  const newLine = typeof matches[0]?.StartLine === "number" ? matches[0].StartLine : matches[0]?.line;
  if (expectedLine !== undefined && newLine !== expectedLine) {
    return { ok: false, reason: "reproduced finding moved before repair" };
  }
  // Recompute uses the same reviewed-value and ambiguity checks, without writing.
  if (recomputeOnly) return { ok: true, oldLine, newLine, newEntry, mode: "recompute", mutated: false };
  const ending = lines[staleIndex].endsWith("\r\n") ? "\r\n" : lines[staleIndex].endsWith("\n") ? "\n" : "";
  lines[staleIndex] = newEntry + ending;
  const finalFactsMatch = verifiedLocalReproduction === VERIFIED_LOCAL_REPRODUCTION
    ? () => reproductionGateFactsStillMatch({ gate: reproductionGate, rootDir, binaryPath: resolvedBinaryPath,
      reviewedValue, rawReport: scanResult.raw })
    : () => true;
  const published = publishIgnore(snapshot, Buffer.from(lines.join("")), finalFactsMatch);
  if (!published.ok) return published;

  return { ok: true, ignoreFilePath: resolvedIgnorePath, oldLine, newLine, newEntry };
}

/** Read-only display of one uniquely matched, value-bound stale entry. */
export async function recomputeStaleIgnoreEntry(options) {
  return repairStaleIgnoreEntry({ ...options, recomputeOnly: true });
}

/** Closed CLI: no raw secret, arbitrary flag, duplicate selector or positional operand. */
export function parseArgv(argv) {
  const args = {};
  const values = new Set(["root", "path", "rule", "column", "old-line", "line", "gate-file", "reviewed-value-file"]);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--recompute") {
      if (Object.hasOwn(args, "recompute")) throw new Error("duplicate --recompute");
      args.recompute = true;
      continue;
    }
    if (token === "--prepare-gate") {
      if (Object.hasOwn(args, "prepare-gate")) throw new Error("duplicate --prepare-gate");
      args["prepare-gate"] = true;
      continue;
    }
    if (token === "--approve-new") {
      if (Object.hasOwn(args, "approve-new")) throw new Error("duplicate --approve-new");
      args["approve-new"] = true;
      continue;
    }
    if (typeof token !== "string" || !token.startsWith("--")) throw new Error("unexpected positional argument");
    const key = token.slice(2);
    if (!values.has(key) || Object.hasOwn(args, key)) throw new Error("unknown or duplicate selector");
    const value = argv[++i];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--") || /[\x00-\x1f\x7f]/u.test(value)) throw new Error("missing or invalid selector value");
    if ((key === "column" || key === "old-line" || key === "line") && !/^[1-9][0-9]*$/u.test(value)) throw new Error("invalid positive integer selector");
    args[key] = value;
  }
  return args;
}

function readLocalReviewInput(rootDir, path) {
  if (typeof path !== "string") throw new Error("review input required");
  const scratch = realpathSync(join(rootDir, "scratch"));
  const physical = realpathSync(path);
  const rel = relative(scratch, physical);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)
    || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || lstatSync(path).nlink !== 1) {
    throw new Error("review input must be a regular file in root scratch");
  }
  return readFileSync(physical, "utf8").replace(/\r?\n$/u, "");
}

function localGatePath(rootDir, path) {
  if (typeof path !== "string") throw new Error("gate file required");
  const scratch = realpathSync(join(rootDir, "scratch"));
  const parent = realpathSync(dirname(path));
  const rel = relative(scratch, parent);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("gate file must be in root scratch");
  return path;
}

async function main() {
  let args;
  try { args = parseArgv(process.argv.slice(2)); }
  catch (error) { console.error(`gitleaks-repair-ignore: ${error.message}`); process.exitCode = 1; return; }
  if (args["prepare-gate"] && args["approve-new"]) {
    console.error("gitleaks-repair-ignore: choose one action"); process.exitCode = 1; return;
  }
  const required = args["prepare-gate"] || args["approve-new"]
    ? ["path", "rule", "column", "line", "gate-file", "reviewed-value-file"]
    : ["path", "rule", "column", "old-line", "gate-file", "reviewed-value-file"];
  const missing = required.filter((k) => args[k] === undefined);
  if (missing.length > 0) {
    console.error(`gitleaks-repair-ignore: missing required flag(s): ${missing.map((k) => `--${k}`).join(", ")}`);
    console.error("usage: node gitleaks-repair-ignore.mjs --prepare-gate --path <relative> --rule <id> --line <n> --column <n> --gate-file <scratch-file> --reviewed-value-file <scratch-file> [--root <dir>]; then use --approve-new --line <n> or --old-line <n> with the same selectors and gate/review flags");
    process.exitCode = 1;
    return;
  }
  const rootDir = args.root ?? process.cwd();
  let reviewedValue, gatePath, binaryPath;
  try {
    reviewedValue = readLocalReviewInput(rootDir, args["reviewed-value-file"]);
    gatePath = localGatePath(rootDir, args["gate-file"]);
    const binary = isInstalled();
    if (!binary.installed) throw new Error("scanner unavailable");
    const admitted = assessTrustedExecutablePath(binary.path);
    if (!admitted.ok) throw new Error("scanner path not admitted");
    binaryPath = admitted.path;
  } catch (error) {
    console.error(`gitleaks-repair-ignore: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (args["prepare-gate"]) {
    const produced = await reproduceReviewedFinding({ rootDir, binaryPath, path: args.path,
      rule: args.rule, line: Number(args.line), column: Number(args.column), reviewedValue });
    if (!produced.ok) { console.error(`gitleaks-repair-ignore: ${produced.reason}`); process.exitCode = 1; return; }
    try { writeFileSync(gatePath, `${JSON.stringify(produced.gate, null, 2)}\n`, { flag: "wx", mode: 0o600 }); }
    catch { console.error("gitleaks-repair-ignore: gate file could not be created exclusively"); process.exitCode = 1; return; }
    console.log("gitleaks-repair-ignore: reproduced exact reviewed domain; sanitized gate prepared");
    return;
  }
  let gate;
  try {
    const stat = lstatSync(gatePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("unsafe gate file");
    gate = JSON.parse(readFileSync(gatePath, "utf8"));
  }
  catch { console.error("gitleaks-repair-ignore: missing or malformed reproduction gate"); process.exitCode = 1; return; }
  const verified = await verifyReproductionGate({ gate, rootDir, binaryPath, reviewedValue });
  if (!verified.ok || gate.path !== args.path || gate.rule !== args.rule || gate.column !== Number(args.column)) {
    console.error(`gitleaks-repair-ignore: ${verified.reason ?? "reproduction gate selector mismatch"}`);
    process.exitCode = 1;
    return;
  }
  if (args["approve-new"]) {
    if (Number(args.line) !== gate.line) {
      console.error("gitleaks-repair-ignore: reproduction gate line mismatch"); process.exitCode = 1; return;
    }
    const newEntry = gitleaksContentAuthorityLine({ File: gate.path, RuleID: gate.rule,
      StartLine: gate.line, StartColumn: gate.column, Secret: reviewedValue });
    if (!newEntry) { console.error("gitleaks-repair-ignore: invalid reviewed finding"); process.exitCode = 1; return; }
    let snapshot;
    try {
      snapshot = readIgnoreSnapshot(rootDir);
    } catch (error) {
      console.error("gitleaks-repair-ignore: ignore destination is linked, outside root or unreadable"); process.exitCode = 1; return;
    }
    const prior = snapshot.bytes?.toString("utf8") ?? "";
    if (snapshot.bytes && !Buffer.from(prior).equals(snapshot.bytes)) {
      console.error("gitleaks-repair-ignore: ignore file is not UTF-8"); process.exitCode = 1; return;
    }
    if (prior.split(/\r?\n/u).includes(newEntry)) {
      console.error("gitleaks-repair-ignore: suppression already exists"); process.exitCode = 1; return;
    }
    const next = Buffer.from(`${prior}${prior && !prior.endsWith("\n") ? "\n" : ""}${newEntry}\n`);
    const published = publishIgnore(snapshot, next, () => reproductionGateFactsStillMatch({
      gate, rootDir, binaryPath, reviewedValue, observedReportSha256: verified.observedReportSha256,
    }));
    if (!published.ok) { console.error(`gitleaks-repair-ignore: ${published.reason}`); process.exitCode = 1; return; }
    console.log("gitleaks-repair-ignore: approved one reproduced exact domain finding");
    return;
  }
  const action = args.recompute ? recomputeStaleIgnoreEntry : repairStaleIgnoreEntry;
  const result = await action({
    rootDir,
    path: args.path,
    rule: args.rule,
    column: Number(args.column),
    oldLine: Number(args["old-line"]),
    binaryPath,
    expectedLine: gate.line,
    verifiedLocalReproduction: VERIFIED_LOCAL_REPRODUCTION,
    reproductionGate: gate,
    reviewedValue,
  });
  if (!result.ok) {
    console.error(`gitleaks-repair-ignore: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  if (args.recompute) {
    console.log("gitleaks-repair-ignore: recomputed reviewed entry; ignore file unchanged");
    console.log(result.newEntry);
    return;
  }
  console.log(`gitleaks-repair-ignore: replaced stale entry (line ${result.oldLine} -> ${result.newLine}) in ${result.ignoreFilePath}`);
  console.log(result.newEntry);
}

if (isDirectInvocation(import.meta.url)) {
  main();
}
