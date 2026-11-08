// SPDX-License-Identifier: SUL-1.0
/**
 * G20-66: a sanctioned writer arms the commit of exactly the files it wrote.
 *
 * `pipeline-state.mjs approve-plan` / `close-feature` and `finish-feature.mjs` write the Pipeline's own protected files (State,
 * lifecycle, audit bundle, result). The commit that publishes them used to be refused at the commit boundary and cost the PO
 * extra human-guard-override signatures for files no human decides about. After a SUCCESSFUL write a writer now calls
 * `armWriterCommitCapability`, which records the exact paths and sha256 digests it wrote in a record store under the git
 * common directory (HMAC-authenticated, key in the same store). The pre-commit hook admits a staged protected path only when
 * its staged blob hashes to a recorded digest (`writerCommitAdmission`, lib/protected-test-paths.mjs, the consumer in the
 * shape of the G20-55 closed-continuity admission). Nothing here is a signature: the capability is a statement by the writer
 * about its own output, so it can never cover a path it did not write, a gate-strength path (GS-*) or a shipped-baseline
 * path (hooks, guard libraries, the protected baseline itself); those are excluded at arming.
 *
 * Entry points (stable; the one-shot close calls them):
 *   armWriterCommitCapability({ rootDir, writer, rerun, files: [{ path, sha256 }] })  the shared mechanism
 *   withWriterCommitCapability({ rootDir, writer, rerun }, fn)                         snapshot, run `fn` (an exit code), arm what changed, print the next step
 *   captureWorktree(rootDir) / armWrittenSince({ rootDir, before, writer, rerun })      the same in two steps (finish-feature brackets each stage)
 *   formatWriterCommitNextStep(result)                                                  the lines printed as the next step
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { gateStrengthRuleFor } from "../hooks/guard-gate-strength.mjs";
import { ensureHardenedPrivateDirectory } from "./hardened-private-directory.mjs";
import { loadShippedProtectedBaseline } from "./protected-baseline.mjs";
import { loadProtectedTestPathRules, protectedTestPathRuleFor, writerCommitMac, writerCommitStoreDir, WRITER_COMMIT_SCHEMA } from "./protected-test-paths.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const KEY_FILE = "mac.key";
const WRITER_MESSAGE_FILE = "scratch/commit-msg/writer-output.txt";
const MAX_SNAPSHOT_FILE_BYTES = 16 * 1024 * 1024;
const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");

function writerCommitError(code, message, heal) {
  const error = new Error(`${message}; heal: ${heal}`);
  error.code = code;
  error.heal = heal;
  return error;
}

const quoted = (path) => (/^[\w./@+=-]+$/u.test(path) ? path : JSON.stringify(path));
const commitSubject = (writer) => `chore(pipeline): commit the ${String(writer).split(/\s+/u).filter(Boolean).pop()?.replace(/\.mjs$/u, "") ?? "writer"} output`;

/** The exact commit that publishes `paths`, as the next step a writer prints. */
export function writerCommitSteps(paths, message) {
  const list = paths.map(quoted).join(" ");
  // GIT-03 needs both trailers in the final block, and the push guard refuses parentheses on a command line, so the route is a message file.
  return [
    `git add -- ${list}`,
    `Write this to ${WRITER_MESSAGE_FILE}: the line "${message}", a blank line, then the two lines "AI-Assisted: true" and "Dispatch: stage-0 (elephant)".`,
    `git commit -F ${WRITER_MESSAGE_FILE} -- ${list}`,
  ];
}

function repoRootOf(rootDir, spawn) {
  const top = spawn("git", ["rev-parse", "--show-toplevel"], { cwd: rootDir, encoding: "utf8", timeout: 15000 });
  if (top.status !== 0 || typeof top.stdout !== "string" || top.stdout.trim() === "") throw writerCommitError("WC-REPO", `${rootDir} is not inside a git work tree`, "run the writer from the project root");
  return realpathSync(top.stdout.trim());
}

/**
 * Arms the commit of `files` (`{ path, sha256 }`: the exact paths and bytes the writer just wrote). Returns
 * `{ status: "armed" | "not-needed", id, paths, protectedPaths, excluded, message, steps }`; throws an Error with `.code` and
 * `.heal` (the rerun of the writer) when a file no longer holds the bytes the writer wrote. Stages nothing.
 */
export function armWriterCommitCapability({ rootDir, writer, rerun, files, nowMs = Date.now(), spawn = spawnSync } = {}) {
  if (typeof writer !== "string" || writer === "" || typeof rerun !== "string" || rerun === ""
    || !Array.isArray(files) || files.length === 0
    || files.some((file) => typeof file?.path !== "string" || file.path === "" || !SHA256.test(file.sha256 ?? ""))) {
    throw writerCommitError("WC-INPUT", "the writer commit capability needs the writer, its rerun command and the exact paths and sha256 digests it wrote", "pass { writer, rerun, files: [{ path, sha256 }] }");
  }
  const root = repoRootOf(rootDir, spawn);
  const written = [];
  for (const file of files) {
    const rel = relative(root, resolve(root, file.path)).replace(/\\/gu, "/");
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw writerCommitError("WC-INPUT", `path ${file.path} is outside the repository`, "pass repository-relative paths");
    let onDisk = null;
    try { onDisk = sha256Of(readFileSync(resolve(root, rel))); } catch { onDisk = null; }
    if (onDisk !== file.sha256) throw writerCommitError("WC-BYTES", `${rel} no longer holds the bytes ${writer} wrote`, `rerun the writer: ${rerun}`);
    written.push({ path: rel, sha256: file.sha256 });
  }
  // Never armed: a gate-strength path, or a path of the shipped protected baseline (guard hooks, guard libraries, the baseline
  // data, the sanctioned writer's own source). A writer's tree delta can contain such a file only by accident.
  const shipped = loadShippedProtectedBaseline();
  const staticIds = new Set(shipped.ok ? shipped.baseline.entries.map((entry) => entry.id) : []);
  const { rules } = loadProtectedTestPathRules({ rootDir: root });
  const armed = []; const excluded = []; const protectedPaths = [];
  for (const file of written) {
    const rule = protectedTestPathRuleFor(rules, file.path);
    let gate = null;
    try { gate = gateStrengthRuleFor(file.path, root); } catch { gate = null; }
    if (gate || (rule && (staticIds.has(rule.id) || rule.id === "PB-BASELINE-UNAVAILABLE"))) { excluded.push(file.path); continue; }
    armed.push(file);
    if (rule) protectedPaths.push(file.path);
  }
  const paths = armed.map((file) => file.path).sort();
  const message = commitSubject(writer);
  const result = { status: "not-needed", paths, protectedPaths: protectedPaths.sort(), excluded: excluded.sort(), message, steps: writerCommitSteps(paths, message), writer, rerun };
  if (protectedPaths.length === 0) return { ...result, reason: "no-protected-path" };
  const store = writerCommitStoreDir(root, { spawn });
  if (store === null) throw writerCommitError("WC-STORE", "the git common directory could not be resolved", `rerun the writer: ${rerun}`);
  const common = resolve(store, "..", "..");
  ensureHardenedPrivateDirectory(common, store);
  const keyPath = join(store, KEY_FILE);
  if (!existsSync(keyPath)) {
    try { writeFileSync(keyPath, `${randomBytes(32).toString("hex")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" }); } catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  const keyHex = readFileSync(keyPath, "utf8").trim();
  const id = `${String(nowMs).padStart(15, "0")}-${randomBytes(6).toString("hex")}`;
  const core = {
    schema: WRITER_COMMIT_SCHEMA, id, writer, rerun, armedAt: new Date(nowMs).toISOString(),
    entries: armed.map((file) => ({ path: file.path, sha256: file.sha256, consumedAtHead: null })),
  };
  const record = { ...core, mac: writerCommitMac(keyHex, core) };
  const file = join(store, `${id}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, file);
  return { ...result, status: "armed", id };
}

/** The tracked-dirty and untracked files of `rootDir` with the sha256 of their bytes (null: deleted), or null when unreadable. */
export function captureWorktree(rootDir, { spawn = spawnSync } = {}) {
  try {
    const root = repoRootOf(rootDir, spawn);
    const status = spawn("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8", timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
    if (status.status !== 0 || typeof status.stdout !== "string") return null;
    const tokens = status.stdout.split("\0").filter((token) => token !== "");
    const snapshot = new Map();
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const code = token.slice(0, 2); const path = token.slice(3);
      if (/[RC]/u.test(code)) index += 1; // the original path of a rename follows as its own token
      let digest = null;
      // A writer's protected outputs are small JSON and Markdown files; a large dirty file is never one of them and is not hashed.
      try { digest = statSync(resolve(root, path)).size > MAX_SNAPSHOT_FILE_BYTES ? null : sha256Of(readFileSync(resolve(root, path))); } catch { digest = null; }
      snapshot.set(path, digest);
    }
    return { root, files: snapshot };
  } catch { return null; }
}

/** Arms what changed in the working tree since `before` (a `captureWorktree` result). Never throws for "nothing written". */
export function armWrittenSince({ rootDir, before, writer, rerun, spawn = spawnSync } = {}) {
  const after = captureWorktree(rootDir, { spawn });
  if (before === null || after === null) return { status: "unavailable", paths: [], protectedPaths: [], excluded: [], steps: [], message: commitSubject(writer), writer, rerun };
  const files = [];
  for (const [path, sha256] of after.files) if (sha256 !== null && before.files.get(path) !== sha256) files.push({ path, sha256 });
  if (files.length === 0) return { status: "not-needed", reason: "nothing-written", paths: [], protectedPaths: [], excluded: [], steps: [], message: commitSubject(writer), writer, rerun };
  return armWriterCommitCapability({ rootDir, writer, rerun, files, spawn });
}

/** The lines a writer prints as its next step. */
export function formatWriterCommitNextStep(result) {
  return [
    `Next step (no human override needed): commit exactly what ${result.writer} wrote.`,
    ...result.steps.map((step) => `  ${step}`),
    `The pre-commit hook admits exactly these bytes (writer commit capability ${result.id}), once, whatever unprotected files are staged beside them. If one of them changes first, rerun: ${result.rerun}`,
  ];
}

/**
 * Runs `fn` (a writer returning its exit code), then arms the files it wrote when it succeeded and prints the exact commit on
 * stderr (stdout stays the writer's own JSON). An arming fault never changes the writer's exit code: the hook then falls back
 * to its own refusal, which is today's behaviour.
 */
export function withWriterCommitCapability({ rootDir, writer, rerun }, fn, { spawn = spawnSync } = {}) {
  const before = captureWorktree(rootDir, { spawn });
  const status = fn();
  if (status !== 0 || before === null) return status;
  try {
    const armed = armWrittenSince({ rootDir, before, writer, rerun, spawn });
    if (armed.status === "armed") for (const line of formatWriterCommitNextStep(armed)) console.error(line);
  } catch (error) {
    console.error(`${writer}: the commit capability was not armed (${error?.code ?? "fault"}); heal: ${error?.heal ?? rerun}`);
  }
  return status;
}
