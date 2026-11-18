#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * repository-mode-promote.mjs -- the one narrow, agent-executable command that moves the calibrated `repositoryMode` from `local-only` to
 * `remote-tracked` (AC-108 closest criterion; CGR-19, PO decision). Every other direction, value or field stays on the signed guard-override route.
 *
 * Usage: node <plugin-root>/scripts/repository-mode-promote.mjs --root <project-root> --to remote-tracked
 *
 * What it does: writes BOTH calibration twins (`project/pipeline.json`, `.claude/pipeline.json`, each when present) by replacing the single value
 * token `"repositoryMode": "local-only"` -> `"remote-tracked"` at the byte level, so CRLF, a BOM, the indent and the key order stay exactly as they
 * were. Exactly one token per file is required and the re-parsed result must equal the old value with only that field changed. The twins are compared
 * after normalising that token, so a half-applied state resumes and a rerun reports `unchanged`. It refuses `host-managed`, an absent or invalid
 * current value, any other target and a project without a configured remote, each with a typed RMP-* code that names the route that remains.
 * Writes are atomic (temporary file in the same directory, then rename) and happen only after the preimage bytes were checked again.
 *
 * The same byte rule (`promoteRepositoryModeBytes`) is what the pre-commit hook compares the staged twins against, so the commit boundary admits
 * exactly this change and nothing else (scripts/pre-commit-hook-install.mjs).
 *
 * Output: ONE JSON line. Exit 0 promoted or unchanged, 1 refused, 2 usage.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { CALIBRATION_PATHS } from "../lib/project-authority-read.mjs";

// Both twins are read and written, so the order of the shared list changes no result (it stays neutral first, as before).
export const TWIN_PATHS = CALIBRATION_PATHS;
const SCHEMA = "pipeline.repository-mode-promotion.v1";
const MAX_BYTES = 1_048_576;
const SIGNED_ROUTE = "any other change to the calibration stays on the signed route: plan it with node <plugin-root>/scripts/guard-human-override.mjs plan";
// The ONE token this command may change. Whitespace between the key and its value is kept exactly as found (captured, not rewritten).
const TOKEN = /("repositoryMode"[ \t\r\n]*:[ \t\r\n]*)"local-only"/gu;
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function parseObject(bytes) {
  try {
    const text = strictUtf8.decode(bytes);
    const value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    return plain(value) ? value : null;
  } catch { return null; }
}

/**
 * The one rule. `bytes` -> `{ ok: true, bytes }` when the document is valid UTF-8 JSON whose top-level `repositoryMode` is `local-only` and exactly one
 * literal `"repositoryMode": "local-only"` token exists; the result differs from the input in those value bytes only and re-parses to the old value with
 * only that field changed. Otherwise `{ ok: false, code, mode? }` (`mode` is the current top-level value when the document is valid).
 */
export function promoteRepositoryModeBytes(bytes) {
  const old = parseObject(bytes);
  if (old === null) return { ok: false, code: "RMP-CALIBRATION-INVALID" };
  const mode = old.repositoryMode;
  if (mode === "host-managed") return { ok: false, code: "RMP-HOST-MANAGED", mode };
  if (mode === "remote-tracked") return { ok: false, code: "RMP-NOT-LOCAL-ONLY", mode };
  if (mode !== "local-only") return { ok: false, code: "RMP-MODE-INVALID", mode: mode === undefined ? null : mode };
  // latin1 maps every byte to one character and back, so the replacement cannot touch any byte outside the token.
  const text = Buffer.from(bytes).toString("latin1");
  if ([...text.matchAll(TOKEN)].length !== 1) return { ok: false, code: "RMP-TOKEN-NOT-ONE", mode };
  const next = Buffer.from(text.replace(TOKEN, '$1"remote-tracked"'), "latin1");
  const reparsed = parseObject(next);
  if (reparsed === null || JSON.stringify(reparsed) !== JSON.stringify({ ...old, repositoryMode: "remote-tracked" })) return { ok: false, code: "RMP-TOKEN-NOT-ONE", mode };
  return { ok: true, bytes: next };
}

const MESSAGES = {
  "RMP-TARGET-UNSUPPORTED": "only --to remote-tracked is offered by this command (local-only -> remote-tracked); no other target or direction is",
  "RMP-NO-CALIBRATION": "neither project/pipeline.json nor .claude/pipeline.json exists under the root, so there is no calibration to change",
  "RMP-CALIBRATION-UNSAFE": "a calibration twin is not a regular, non-linked file of a readable size",
  "RMP-CALIBRATION-INVALID": "a calibration twin is not valid UTF-8 JSON holding an object",
  "RMP-HOST-MANAGED": "the calibrated repositoryMode is host-managed; this command never changes it",
  "RMP-MODE-INVALID": "the calibrated repositoryMode is absent or not one of local-only, remote-tracked, host-managed",
  "RMP-TOKEN-NOT-ONE": "the file does not hold exactly one literal \"repositoryMode\": \"local-only\" token, so a single-token replace is not possible",
  "RMP-TWIN-DRIFT": "project/pipeline.json and .claude/pipeline.json differ by more than the repositoryMode value (after normalising that token)",
  "RMP-NO-REMOTE": "no remote is configured in this repository, and remote-tracked needs one",
  "RMP-PREIMAGE-CHANGED": "a calibration twin changed while the command was running; nothing was written",
  "RMP-WRITE-FAILED": "a calibration twin could not be written",
};
const ROUTES = {
  "RMP-NO-CALIBRATION": "run the onboarding that creates project/pipeline.json first; this command only edits an existing calibration",
  "RMP-NO-REMOTE": "add the remote first (git remote add <name> <url>), then run this command again",
  "RMP-PREIMAGE-CHANGED": "run the command again once no other write is running",
  "RMP-WRITE-FAILED": "run the command again: a half-applied state resumes (the twins are compared after normalising the token)",
};
const refuse = (code, extra = {}) => ({ schema: SCHEMA, status: "refused", code, message: extra.message ?? MESSAGES[code], route: ROUTES[code] ?? SIGNED_ROUTE, ...extra.fields });

function readTwin(root, rel) {
  const abs = join(root, ...rel.split("/"));
  let info;
  try { info = lstatSync(abs); } catch (error) { if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { rel, abs, absent: true }; return { rel, abs, unsafe: true }; }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_BYTES) return { rel, abs, unsafe: true };
  try { return { rel, abs, bytes: readFileSync(abs), mode: info.mode & 0o777 }; } catch { return { rel, abs, unsafe: true }; }
}

function hasRemote(root) {
  const result = spawnSync("git", ["-C", root, "remote"], { encoding: "utf8", timeout: 15_000, windowsHide: true });
  return result.status === 0 && typeof result.stdout === "string" && result.stdout.trim() !== "";
}

function writeAtomic(twin, bytes) {
  const tmp = join(dirname(twin.abs), `.${basename(twin.abs)}.rmp-${process.pid}-${randomBytes(4).toString("hex")}.tmp`);
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, twin.mode);
  try { writeSync(fd, bytes); fsyncSync(fd); } catch (error) { try { closeSync(fd); } catch { /* keep the original error */ } try { unlinkSync(tmp); } catch { /* best effort */ } throw error; }
  closeSync(fd);
  try { renameSync(tmp, twin.abs); } catch (error) { try { unlinkSync(tmp); } catch { /* best effort */ } throw error; }
}

function pathsToCommit(root, present) {
  const diff = spawnSync("git", ["-C", root, "diff", "--name-only", "-z", "HEAD", "--", ...present], { encoding: "utf8", timeout: 15_000, windowsHide: true });
  if (diff.status !== 0 || typeof diff.stdout !== "string") return [...present];
  return diff.stdout.split("\0").filter(Boolean).sort();
}

/** `deps.beforeWrite` is a test seam that runs after the first read and before the preimage re-check. */
export function promoteRepositoryMode({ root, to } = {}, deps = {}) {
  if (to !== "remote-tracked") return refuse("RMP-TARGET-UNSUPPORTED");
  const twins = TWIN_PATHS.map((rel) => readTwin(root, rel));
  if (twins.some((twin) => twin.unsafe)) return refuse("RMP-CALIBRATION-UNSAFE");
  const present = twins.filter((twin) => !twin.absent);
  if (present.length === 0) return refuse("RMP-NO-CALIBRATION");
  const plan = [];
  for (const twin of present) {
    const result = promoteRepositoryModeBytes(twin.bytes);
    if (result.ok) plan.push({ twin, after: result.bytes, change: true });
    else if (result.code === "RMP-NOT-LOCAL-ONLY") plan.push({ twin, after: twin.bytes, change: false });
    else return refuse(result.code, { fields: { file: twin.rel } });
  }
  if (plan.some((entry) => !entry.after.equals(plan[0].after))) return refuse("RMP-TWIN-DRIFT");
  const changing = plan.filter((entry) => entry.change);
  if (changing.length === 0) return { schema: SCHEMA, status: "unchanged", repositoryMode: "remote-tracked", written: [], paths: pathsToCommit(root, present.map((twin) => twin.rel)) };
  if (!hasRemote(root)) return refuse("RMP-NO-REMOTE");
  deps.beforeWrite?.();
  for (const entry of changing) {
    const current = readTwin(root, entry.twin.rel);
    if (current.unsafe || current.absent || !current.bytes.equals(entry.twin.bytes)) return refuse("RMP-PREIMAGE-CHANGED", { fields: { file: entry.twin.rel } });
  }
  const written = [];
  for (const entry of changing) {
    try { writeAtomic(entry.twin, entry.after); written.push(entry.twin.rel); } catch (error) { return refuse("RMP-WRITE-FAILED", { fields: { file: entry.twin.rel, written, detail: String(error?.code ?? error?.name ?? "Error") } }); }
  }
  for (const entry of plan) {
    const current = readTwin(root, entry.twin.rel);
    if (current.unsafe || current.absent || !current.bytes.equals(entry.after)) return refuse("RMP-WRITE-FAILED", { fields: { file: entry.twin.rel, written, detail: "readback-mismatch" } });
  }
  return { schema: SCHEMA, status: "promoted", repositoryMode: "remote-tracked", written, paths: pathsToCommit(root, present.map((twin) => twin.rel)),
    next: "stage exactly these paths with git add -- <paths> and commit them as their own commit; the pre-commit hook admits this one-token change without a signature" };
}

function parseArgs(argv) {
  const seen = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if ((flag !== "--root" && flag !== "--to") || Object.hasOwn(seen, flag) || i + 1 >= argv.length || argv[i + 1] === "") return null;
    seen[flag] = argv[i + 1];
  }
  if (seen["--root"] === undefined || seen["--to"] === undefined) return null;
  try { if (!statSync(seen["--root"]).isDirectory()) return null; } catch { return null; }
  return { root: seen["--root"], to: seen["--to"] };
}

function main(argv) {
  const args = parseArgs(argv);
  if (args === null) {
    process.stdout.write(`${JSON.stringify({ schema: SCHEMA, status: "usage", code: "RMP-USAGE", message: "usage: node repository-mode-promote.mjs --root <project-root> --to remote-tracked (each flag once, root an existing directory)" })}\n`);
    return 2;
  }
  const result = promoteRepositoryMode(args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.status === "refused" ? 1 : 0;
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main(process.argv.slice(2));
