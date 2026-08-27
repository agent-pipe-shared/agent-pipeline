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
 * Usage (from repo root, or pass --root explicitly):
 *   node plugins/pipeline-core/scripts/gitleaks-repair-ignore.mjs \
 *     --path <repo-relative-path> --rule <ruleId> --column <n> --old-line <n> [--root <dir>]
 *
 * The four required flags are exactly the values the near-miss diagnostic already names.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import {
  run,
  gitleaksContentAuthorityLine,
  parseContentAuthorityLine,
  normalizeCandidateFindingPath,
  isInstalled,
} from "./security-adapters/gitleaks.mjs";

const IGNORE_FILE = ".gitleaksignore";

/**
 * Repairs one stale content-v1 `.gitleaksignore` entry in place. Never touches any other entry or
 * line in the file. Returns `{ ok: true, ignoreFilePath, oldLine, newLine, newEntry }` on success,
 * `{ ok: false, reason }` on any failure -- never throws, never partially writes the file.
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
}) {
  if (typeof rootDir !== "string" || rootDir.length === 0) return { ok: false, reason: "rootDir is required" };
  if (typeof targetPath !== "string" || targetPath.length === 0) return { ok: false, reason: "path is required" };
  if (typeof targetRule !== "string" || targetRule.length === 0) return { ok: false, reason: "rule is required" };
  if (!Number.isSafeInteger(targetColumn) || targetColumn < 1) return { ok: false, reason: "column must be a positive integer" };
  if (!Number.isSafeInteger(oldLine) || oldLine < 1) return { ok: false, reason: "old-line must be a positive integer" };

  const resolvedIgnorePath = ignoreFilePath ?? join(rootDir, IGNORE_FILE);
  if (!existsSync(resolvedIgnorePath)) return { ok: false, reason: `${resolvedIgnorePath} does not exist` };

  const rawText = readFileSync(resolvedIgnorePath, "utf8");
  const lines = rawText.split(/\r?\n/u);
  let staleIndex = -1;
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
  if (scanResult.raw === null) {
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

  const newLine = typeof matches[0]?.StartLine === "number" ? matches[0].StartLine : matches[0]?.line;
  lines[staleIndex] = newEntry;
  writeFileSync(resolvedIgnorePath, lines.join("\n"));

  return { ok: true, ignoreFilePath: resolvedIgnorePath, oldLine, newLine, newEntry };
}

function parseArgv(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`unexpected argument: ${key}`);
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  const missing = ["path", "rule", "column", "old-line"].filter((k) => args[k] === undefined);
  if (missing.length > 0) {
    console.error(`gitleaks-repair-ignore: missing required flag(s): ${missing.map((k) => `--${k}`).join(", ")}`);
    console.error("usage: node gitleaks-repair-ignore.mjs --path <repo-relative-path> --rule <ruleId> --column <n> --old-line <n> [--root <dir>]");
    process.exitCode = 1;
    return;
  }
  const result = await repairStaleIgnoreEntry({
    rootDir: args.root ?? process.cwd(),
    path: args.path,
    rule: args.rule,
    column: Number(args.column),
    oldLine: Number(args["old-line"]),
  });
  if (!result.ok) {
    console.error(`gitleaks-repair-ignore: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`gitleaks-repair-ignore: replaced stale entry (line ${result.oldLine} -> ${result.newLine}) in ${result.ignoreFilePath}`);
  console.log(result.newEntry);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
