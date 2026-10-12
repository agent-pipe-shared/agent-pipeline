// SPDX-License-Identifier: SUL-1.0
// Read-only reporting inputs. Handles carry source observations, never admission.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { GIT_NULL_DEVICE } from "./git-null-device.mjs";
import { resolveTrustedSystemExecutable } from "./trusted-tool-resolution.mjs";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const contexts = new WeakMap();
const MAX_BYTES = 1024 * 1024;
export function reportBytesSha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function context(handle) { const value = contexts.get(handle); if (!value) fail("REPORT-SOURCE-HANDLE"); return value; }
function oid(value) { if (typeof value !== "string" || !OID.test(value)) fail("REPORT-REF"); return value; }
function publicPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || value.includes("\\")
    || /[\0-\x1f\x7f]/u.test(value) || value.startsWith("/") || value.startsWith("-")) fail("REPORT-PUBLIC-PATH");
  const parts = value.split("/");
  if (parts.some(part => !part || part === "." || part === ".."
    || /^(?:\.git|\.ssh|\.aws|\.gnupg|\.netrc|\.env(?:\..*)?|private|node_modules)$/iu.test(part))) fail("REPORT-PUBLIC-PATH");
  return value;
}
function git(source, args, maxBuffer = MAX_BYTES) {
  try { return execFileSync(source.gitPath, args, { cwd: source.root, env: source.env,
    encoding: "buffer", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000, maxBuffer }); }
  catch { fail("REPORT-GIT-UNAVAILABLE"); }
}
function env() {
  const value = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  return { ...value, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: GIT_NULL_DEVICE,
    GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LANG: "C", LC_ALL: "C" };
}

/** Resolve exact commit/tree and tracked inventory without consulting mutable HEAD. */
export function openReportCandidate({ repoRoot, candidateCommit } = {}) {
  oid(candidateCommit);
  if (typeof repoRoot !== "string" || !isAbsolute(repoRoot)) fail("REPORT-ROOT");
  const root = realpathSync(repoRoot);
  const tool = resolveTrustedSystemExecutable("git", { homeDir: null });
  if (!tool.ok) fail("REPORT-GIT-UNAVAILABLE");
  const source = { root, gitPath: tool.path, env: env(), files: new Map() };
  const observedRoot = realpathSync(git(source, ["rev-parse", "--show-toplevel"]).toString("utf8").trim());
  if (observedRoot !== root) fail("REPORT-REPOSITORY-ROOT-MISMATCH");
  if (git(source, ["cat-file", "-t", candidateCommit]).toString("utf8").trim() !== "commit") fail("REPORT-CANDIDATE-TYPE");
  const tree = git(source, ["rev-parse", "--verify", `${candidateCommit}^{tree}`]).toString("utf8").trim();
  oid(tree);
  const rows = git(source, ["ls-tree", "-r", "-z", candidateCommit], 8 * MAX_BYTES).toString("utf8").split("\0").filter(Boolean);
  if (rows.length > 50_000) fail("REPORT-INVENTORY-BOUND");
  for (const row of rows) {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40,64})\t(.+)$/u.exec(row);
    if (!match || source.files.has(match[4])) fail("REPORT-INVENTORY");
    source.files.set(match[4], { mode: match[1], blobOid: match[3], readable: match[2] === "blob" && ["100644", "100755"].includes(match[1]) });
  }
  source.candidate = Object.freeze({ commit: candidateCommit, tree });
  const handle = Object.freeze({}); contexts.set(handle, source); return handle;
}
export function reportCandidateIdentity(handle) { return { ...context(handle).candidate }; }
export function reportCandidateInventory(handle) { return new Map([...context(handle).files].map(([path, entry]) => [path, { ...entry }])); }
export function readReportCandidateFile(handle, path) {
  const source = context(handle); publicPath(path);
  const entry = source.files.get(path);
  if (!entry?.readable) fail("REPORT-CANDIDATE-FILE");
  return git(source, ["cat-file", "blob", entry.blobOid]);
}
export function readReportCommitPaths(handle, commit) {
  const source = context(handle); oid(commit);
  const paths = git(source, ["diff-tree", "--root", "-m", "--no-commit-id", "--no-renames", "--name-only", "-r", "-z", commit], 8 * MAX_BYTES)
    .toString("utf8").split("\0").filter(Boolean);
  if (paths.length > 8192) fail("REPORT-PATH-BOUND");
  return [...new Set(paths)].sort();
}
export function readReportCommitMessage(handle, commit) {
  const source = context(handle); oid(commit);
  return git(source, ["show", "-s", "--format=%B", commit], 64 * 1024).toString("utf8");
}
export function inspectReportRange(handle, { baseCommit } = {}) {
  const source = context(handle); oid(baseCommit);
  if (git(source, ["cat-file", "-t", baseCommit]).toString("utf8").trim() !== "commit") fail("REPORT-BASE-TYPE");
  git(source, ["merge-base", "--is-ancestor", baseCommit, source.candidate.commit]);
  const commits = git(source, ["rev-list", "--reverse", `${baseCommit}..${source.candidate.commit}`]).toString("utf8").trim().split("\n").filter(Boolean);
  if (commits.length > 512 || commits.some(commit => !OID.test(commit))) fail("REPORT-COMMIT-BOUND");
  const changedPaths = git(source, ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-only", "-z", baseCommit, source.candidate.commit, "--"], 8 * MAX_BYTES)
    .toString("utf8").split("\0").filter(Boolean);
  if (changedPaths.length > 8192) fail("REPORT-PATH-BOUND");
  const perCommit = commits.map(commit => ({ commit, changedPaths: readReportCommitPaths(handle, commit) }));
  if (perCommit.reduce((sum, unit) => sum + unit.changedPaths.length, 0) > 16_384) fail("REPORT-RANGE-PATH-BOUND");
  return { baseCommit, candidate: { ...source.candidate }, commits, changedPaths: [...new Set(changedPaths)].sort(),
    perCommit,
    baselineAuthority: { state: "unavailable", code: "REPORT-IMPLEMENTATION-BASELINE-OWNER-UNRESOLVED" },
    comparisonSource: "explicit-requested-ancestor-range" };
}

/** Explicit public artifact only; no private journal discovery or recursive scan. */
export function readReportPublicArtifact(handle, path) {
  const source = context(handle); publicPath(path);
  if (!/^(?:evidence|specs)\//u.test(path)) fail("REPORT-PUBLIC-ARTIFACT-SCOPE");
  const absolute = resolve(source.root, path), rel = relative(source.root, realpathSync(absolute)).replaceAll("\\", "/");
  if (rel !== path) fail("REPORT-PUBLIC-ARTIFACT-PHYSICAL");
  const before = lstatSync(absolute);
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_BYTES) fail("REPORT-PUBLIC-ARTIFACT-PHYSICAL");
  const fd = openSync(absolute, "r");
  let bytes;
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) fail("REPORT-PUBLIC-ARTIFACT-DRIFT");
    bytes = readFileSync(fd);
  } finally { closeSync(fd); }
  const after = lstatSync(absolute);
  if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
    || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || bytes.length !== before.size) fail("REPORT-PUBLIC-ARTIFACT-DRIFT");
  return { bytes, reference: { path, sha256: reportBytesSha256(bytes), bytes: bytes.length } };
}
