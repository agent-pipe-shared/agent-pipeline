#!/usr/bin/env node
/**
 * Coordinator-side harness for a normal Codex Critic dispatched through the
 * native host agent surface. This file never starts Codex or another agent.
 *
 * prepare  -> validates an exact public candidate, creates a disposable
 *             no-remote checkout, runs the calibrated deterministic verify,
 *             and emits a hash-bound dispatch packet outside the repositories.
 * finalize -> validates the coordinator-captured host return, liveness record,
 *             semantic verdict, reference hashes and before/after repository
 *             fingerprints, then emits a sanitized receipt.
 *
 * The achieved assurance is detection/containment, not technical isolation.
 */

import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { projectHostDuty, routingProvenance } from "../lib/routing-projection.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PIPELINE_ROOT = resolve(HERE, "..", "..", "..");
const REQUEST_SCHEMA_PATH = join(HERE, "codex-critic-dispatch.schema.json");
const RECEIPT_SCHEMA_PATH = join(HERE, "codex-critic-receipt.schema.json");
const HOST_RETURN_SCHEMA_PATH = join(HERE, "codex-critic-host-return.schema.json");
const VERDICT_SCHEMA_PATH = join(HERE, "critic-verdict.schema.json");
const VERDICT_SCHEMA_REPO_PATH = "plugins/pipeline-core/scripts/critic-verdict.schema.json";
const EXECUTION_BINDING_PATHS = Object.freeze([
  "plugins/pipeline-core/config/routing-authority.json",
  "plugins/pipeline-core/config/runner-mappings.json",
  "plugins/pipeline-core/lib/routing-projection.mjs",
  "plugins/pipeline-core/lib/schema-lite.mjs",
  "plugins/pipeline-core/scripts/codex-critic-dispatch.schema.json",
  "plugins/pipeline-core/scripts/codex-critic-host-return.schema.json",
  "plugins/pipeline-core/scripts/codex-critic-host.mjs",
  "plugins/pipeline-core/scripts/codex-critic-receipt.schema.json",
  VERDICT_SCHEMA_REPO_PATH,
]);
const ROLE_CONTRACT_PATH = "roles/critic.md";
const PROMPT_CONTRACT_PATH = "templates/prompts/critic-review.md";
const DIFF_REFERENCE_PATH = "evidence/codex-critic-commit-set.json";
const MAX_JSON_BYTES = 256 * 1024;
const MAX_INVENTORY_FILES = 100_000;
const MAX_INVENTORY_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_REVIEW_COMMITS = 256;
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,79}$/;

export const ASSURANCE = "normal-contractual-read-only; OS isolation not asserted";
export const RESIDUAL_RISKS = Object.freeze([
  "private reads are not technically excluded",
  "writes outside observed repositories are not technically excluded",
  "hidden tools and network or external effects are not technically excluded",
  "prompt-injection influence is not technically excluded",
  "provider-side model fallback is not cryptographically excluded",
  "escaped processes are not technically excluded",
  "write-then-restore activity can evade net-state fingerprints",
  "final fingerprints are sequential point-in-time snapshots and can become stale after capture",
]);
export const HOST_LIMITS = Object.freeze({
  firstEvidenceMs: 60_000,
  progressGapMs: 180_000,
  maxElapsedMs: 480_000,
  maxRecoveries: 1,
});

function fail(message) {
  throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function decodeUtf8Strict(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail("JSON input is not valid UTF-8");
  }
}

/** Lexically parse JSON once to reject duplicate object keys before JSON.parse. */
export function assertNoDuplicateJsonKeys(text) {
  let at = 0;
  const ws = () => { while (/\s/.test(text[at] ?? "")) at += 1; };
  const string = () => {
    if (text[at] !== '"') fail(`invalid JSON string at byte ${at}`);
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") {
        at += 1;
        continue;
      }
      if (char === '"') {
        try { return JSON.parse(text.slice(start, at)); } catch { fail(`invalid JSON string at byte ${start}`); }
      }
    }
    fail(`unterminated JSON string at byte ${start}`);
  };
  const value = () => {
    ws();
    if (text[at] === "{") {
      at += 1;
      ws();
      const keys = new Set();
      if (text[at] === "}") { at += 1; return; }
      while (true) {
        const key = string();
        if (keys.has(key)) fail(`duplicate JSON key: ${key}`);
        keys.add(key);
        ws();
        if (text[at++] !== ":") fail(`expected ':' at byte ${at - 1}`);
        value();
        ws();
        const delimiter = text[at++];
        if (delimiter === "}") return;
        if (delimiter !== ",") fail(`expected ',' or '}' at byte ${at - 1}`);
        ws();
      }
    }
    if (text[at] === "[") {
      at += 1;
      ws();
      if (text[at] === "]") { at += 1; return; }
      while (true) {
        value();
        ws();
        const delimiter = text[at++];
        if (delimiter === "]") return;
        if (delimiter !== ",") fail(`expected ',' or ']' at byte ${at - 1}`);
      }
    }
    if (text[at] === '"') { string(); return; }
    const rest = text.slice(at);
    const token = rest.match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
    if (!token) fail(`invalid JSON value at byte ${at}`);
    at += token.length;
  };
  value();
  ws();
  if (at !== text.length) fail(`unexpected data after JSON at byte ${at}`);
}

export function readJsonBounded(path, maxBytes = MAX_JSON_BYTES) {
  const info = statSync(path);
  if (!info.isFile()) fail(`JSON input is not a regular file: ${path}`);
  if (info.size > maxBytes) fail(`JSON input exceeds ${maxBytes} bytes`);
  const buffer = readFileSync(path);
  const text = decodeUtf8Strict(buffer);
  assertNoDuplicateJsonKeys(text);
  let value;
  try { value = JSON.parse(text); } catch (error) { fail(`invalid JSON: ${error.message}`); }
  return { value, text, sha256: sha256(buffer), bytes: buffer.length };
}

function loadSchema(path) {
  return readJsonBounded(path).value;
}

function assertSchema(value, schemaPath, label) {
  const result = validateAgainstSchema(value, loadSchema(schemaPath));
  if (!result.valid) fail(`${label} schema invalid: ${result.errors.join("; ")}`);
}

export function normalizeRepoRelativePath(value, label = "path") {
  if (typeof value !== "string" || value.length === 0 || value.length > 240) fail(`${label} must be a bounded string`);
  if (/[\u0000-\u001f\u007f\\]/.test(value)) fail(`${label} contains a control character or backslash`);
  if (isAbsolute(value) || value.startsWith("/") || value.endsWith("/")) fail(`${label} must be repo-relative`);
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) fail(`${label} is not normalized`);
  const lower = parts.map((part) => part.toLowerCase());
  if (lower.includes("agents.md")) fail(`${label} references excluded AGENTS.md`);
  if (lower.at(-1) === "state.md" || lower.includes("state-archive") || lower.includes("handover") || lower.includes("memory")) {
    fail(`${label} references prohibited state/history input`);
  }
  return value;
}

function isInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function assertOutsideRoots(path, roots, label) {
  const absolute = resolve(path);
  for (const root of roots.map((entry) => resolve(entry))) {
    if (absolute === root || isInside(root, absolute)) fail(`${label} must stay outside observed repositories`);
  }
  return absolute;
}

function assertControlRoot(path, protectedRoots) {
  const lexical = lstatSync(path);
  if (lexical.isSymbolicLink() || !lexical.isDirectory()) fail("control-dir must be a real directory");
  if ((lexical.mode & 0o077) !== 0) fail("control-dir must not be accessible to group or other users");
  return assertOutsideRoots(realpathSync(path), protectedRoots, "control-dir");
}

function assertSafeControlPath(path, controlRoot, label) {
  const absolute = resolve(path);
  if (!isInside(controlRoot, absolute)) fail(`${label} must be inside control-dir`);
  try {
    if (lstatSync(absolute).isSymbolicLink()) fail(`${label} must not be a symlink`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  let cursor = dirname(absolute);
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) fail(`${label} has no existing parent`);
    cursor = parent;
  }
  const realParent = realpathSync(cursor);
  if (realParent !== controlRoot && !isInside(controlRoot, realParent)) fail(`${label} parent escapes control-dir`);
  let component = controlRoot;
  const rel = relative(controlRoot, dirname(absolute));
  if (rel !== "") {
    for (const part of rel.split(sep)) {
      component = join(component, part);
      if (existsSync(component) && lstatSync(component).isSymbolicLink()) fail(`${label} crosses a symlink`);
    }
  }
  return absolute;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    env: options.env ?? process.env,
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
    shell: false,
  });
  if (result.error) fail(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0 && !options.allowNonzero) {
    fail(`${command} ${args.join(" ")} failed (${result.status}): ${(result.stderr ?? "").trim()}`);
  }
  return result;
}

function gitEnv() {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
  };
}

function calibratedEnv() {
  return {
    ...gitEnv(),
    HOME: "/nonexistent/pipeline-normal-critic",
    NODE_OPTIONS: "",
    NODE_PATH: "",
    NPM_CONFIG_USERCONFIG: "/dev/null",
  };
}

export function runGit(repoRoot, args, options = {}) {
  // Every repository-scoped Git invocation is preceded by a filesystem-only
  // index check. This happens before Git can dereference a redirected index.
  regularGitIndex(repoRoot, { allowMissing: args[0] === "checkout" });
  return run("git", [
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false",
    "-c", "core.untrackedCache=false",
    "-c", "core.preloadIndex=false",
    "-c", "credential.helper=",
    ...args,
  ], {
    cwd: repoRoot,
    env: gitEnv(),
    allowNonzero: options.allowNonzero,
    encoding: options.encoding,
    maxBuffer: options.maxBuffer,
  });
}

function gitText(repoRoot, args) {
  return runGit(repoRoot, args).stdout.trim();
}

function assertGitRepository(path, label) {
  const root = realpathSync(path);
  if (gitText(root, ["rev-parse", "--show-toplevel"]) !== root) fail(`${label} is not a repository root`);
  return root;
}

export function validateCriticRequest(request) {
  assertSchema(request, REQUEST_SCHEMA_PATH, "request");
  if (!SAFE_ID.test(request.task_id)) fail("task_id is not a safe stable identifier");
  if (!SAFE_ID.test(request.project)) fail("project is not a safe stable identifier");
  for (const field of ["ruleset_sha", "review_base", "candidate_commit"]) {
    if (!SHA40.test(request[field])) fail(`${field} must be a full lowercase commit SHA`);
  }
  if (!SHA40.test(request.candidate_tree)) fail("candidate_tree must be a full lowercase tree SHA");
  const authorization = request.normal_lane_authorization;
  if (request.trigger_row === "T1" && !authorization) fail("T1 normal lane requires a named scope-bounded PO waiver");
  if (authorization) {
    if (authorization.kind !== "named-po-waiver" || authorization.authority !== "PO"
      || !SAFE_ID.test(authorization.risk_id) || !SAFE_ID.test(authorization.scope)
      || !SHA256.test(authorization.evidence_sha256)
      || authorization.candidate_commit !== request.candidate_commit) {
      fail("normal lane authorization is invalid or stale");
    }
  }
  request.calibration_path = normalizeRepoRelativePath(request.calibration_path, "calibration_path");
  request.spec_path = normalizeRepoRelativePath(request.spec_path, "spec_path");
  if (request.guardrail_paths.length === 0) fail("guardrail_paths must not be empty");
  if (request.evidence_paths.length === 0) fail("evidence_paths must not be empty");
  for (const key of ["guardrail_paths", "evidence_paths"]) {
    request[key] = request[key].map((path, index) => normalizeRepoRelativePath(path, `${key}[${index}]`));
    if (new Set(request[key]).size !== request[key].length) fail(`${key} contains duplicates`);
  }
  const allPaths = [request.calibration_path, request.spec_path, ...request.guardrail_paths, ...request.evidence_paths];
  if (new Set(allPaths).size !== allPaths.length) fail("request reference paths must be unique");
  if (allPaths.includes(DIFF_REFERENCE_PATH)) {
    fail("request must not claim the coordinator-reserved diff reference path");
  }
  return request;
}

function resolveRegularFile(root, path, { allowUntracked = false } = {}) {
  const normalized = normalizeRepoRelativePath(path);
  const joined = resolve(root, normalized);
  if (!isInside(root, joined)) fail(`reference escapes repository: ${normalized}`);
  const lexical = lstatSync(joined);
  if (lexical.isSymbolicLink()) fail(`reference must not be a symlink: ${normalized}`);
  const real = realpathSync(joined);
  if (!isInside(root, real) || !statSync(real).isFile()) fail(`reference is not a regular in-repo file: ${normalized}`);
  if (!allowUntracked) {
    const tracked = runGit(root, ["ls-files", "--error-unmatch", "--", normalized], { allowNonzero: true });
    if (tracked.status !== 0) fail(`reference is not tracked by the candidate: ${normalized}`);
  }
  const buffer = readFileSync(real);
  return { path: normalized, sha256: sha256(buffer), bytes: buffer.length };
}

function validateCandidate(repoRoot, request) {
  const head = gitText(repoRoot, ["rev-parse", "HEAD"]);
  const tree = gitText(repoRoot, ["rev-parse", "HEAD^{tree}"]);
  if (head !== request.candidate_commit) fail("candidate_commit does not match source HEAD");
  if (tree !== request.candidate_tree) fail("candidate_tree does not match source HEAD tree");
  if (gitText(repoRoot, ["cat-file", "-t", request.review_base]) !== "commit") fail("review_base is not a commit");
  const ancestor = runGit(repoRoot, ["merge-base", "--is-ancestor", request.review_base, request.candidate_commit], { allowNonzero: true });
  if (ancestor.status !== 0) fail("review_base is not an ancestor of candidate_commit");
  if (runGit(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { encoding: "buffer" }).stdout.length !== 0) {
    fail("candidate source repository is not clean");
  }
}

function assertRepositoryClean(repoRoot, label) {
  const visibility = runGit(repoRoot, ["ls-files", "-v", "-z"], { encoding: "buffer" }).stdout.toString("utf8").split("\0").filter(Boolean);
  const hidden = visibility.find((entry) => entry[0] !== "H");
  if (hidden) fail(`${label} repository contains a skip-worktree, assume-unchanged, or non-canonical index entry`);
  if (runGit(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { encoding: "buffer" }).stdout.length !== 0) {
    fail(`${label} repository is not clean`);
  }
}

function executionBindings(pipelineRoot) {
  const bindings = EXECUTION_BINDING_PATHS.map((path) => {
    const executing = resolveRegularFile(DEFAULT_PIPELINE_ROOT, path);
    const pinned = resolveRegularFile(pipelineRoot, path);
    if (executing.sha256 !== pinned.sha256 || executing.bytes !== pinned.bytes) fail(`executing component differs from pinned ruleset: ${path}`);
    return { path, sha256: pinned.sha256, bytes: pinned.bytes };
  });
  return { bindings, sha256: sha256(canonicalJson(bindings)) };
}

function parseVerifyCommand(reviewRoot, calibrationPath) {
  const calibration = readJsonBounded(join(reviewRoot, calibrationPath)).value;
  const match = typeof calibration.verify === "string" && calibration.verify.match(/^node ([A-Za-z0-9._/-]+\.mjs)$/);
  if (!match) fail("calibrated verify command is not the supported node <relative.mjs> form");
  const script = normalizeRepoRelativePath(match[1], "verify script");
  resolveRegularFile(reviewRoot, script);
  return { command: calibration.verify, script };
}

function enumerateReviewCommits(reviewRoot, base, candidate) {
  const commits = gitText(reviewRoot, ["rev-list", "--reverse", "--topo-order", `${base}..${candidate}`])
    .split("\n")
    .filter(Boolean);
  if (commits.length === 0 || commits.length > MAX_REVIEW_COMMITS) {
    fail(`review commit set must contain 1..${MAX_REVIEW_COMMITS} commits`);
  }
  if (commits.some((commit) => !SHA40.test(commit)) || new Set(commits).size !== commits.length
    || commits.at(-1) !== candidate) {
    fail("review commit set is invalid or does not terminate at the candidate");
  }
  return commits;
}

function reviewCommitSet(base, candidate, tree, commits) {
  return {
    schema: "pipeline.codex-critic-commit-set.v1",
    base,
    commits,
    candidateCommit: candidate,
    candidateTree: tree,
  };
}

function validateReviewCommitSet(reviewRoot, review) {
  if (review.diffReferencePath !== DIFF_REFERENCE_PATH || !Array.isArray(review.commits)) {
    fail("prepared review commit-set binding is invalid");
  }
  const expectedCommits = enumerateReviewCommits(reviewRoot, review.base, review.commit);
  if (JSON.stringify(review.commits) !== JSON.stringify(expectedCommits)) fail("prepared review commit set drift");
  const record = readJsonBounded(join(reviewRoot, review.diffReferencePath)).value;
  exactKeys(record, ["schema", "base", "commits", "candidateCommit", "candidateTree"], "review commit-set reference");
  if (JSON.stringify(record) !== JSON.stringify(reviewCommitSet(review.base, review.commit, review.tree, expectedCommits))) {
    fail("review commit-set reference drift");
  }
  return expectedCommits;
}

function assertDisposableCheckout(reviewRoot, commit, allowedGenerated = []) {
  if (gitText(reviewRoot, ["rev-parse", "HEAD"]) !== commit) fail("disposable checkout HEAD mismatch");
  if (gitText(reviewRoot, ["remote"]) !== "") fail("disposable checkout retains a remote");
  const alternates = join(reviewRoot, ".git", "objects", "info", "alternates");
  if (existsSync(alternates)) fail("disposable checkout uses Git alternates");
  if (existsSync(join(reviewRoot, ".gitmodules"))) fail("submodules are forbidden in the disposable checkout");
  const tracked = runGit(reviewRoot, ["ls-files", "-s", "-z"], { encoding: "buffer" }).stdout.toString("utf8");
  if (tracked.split("\0").some((line) => line.startsWith("120000 "))) fail("tracked symlinks are forbidden in the disposable checkout");
  if (runGit(reviewRoot, ["diff", "--quiet"], { allowNonzero: true }).status !== 0
    || runGit(reviewRoot, ["diff", "--cached", "--quiet"], { allowNonzero: true }).status !== 0) {
    fail("disposable checkout is not clean");
  }
  const allowed = new Set(allowedGenerated);
  const untracked = runGit(reviewRoot, ["ls-files", "--others", "--exclude-standard", "-z"], { encoding: "buffer" }).stdout.toString("utf8").split("\0").filter(Boolean);
  const ignored = runGit(reviewRoot, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], { encoding: "buffer" }).stdout.toString("utf8").split("\0").filter(Boolean);
  for (const path of [...untracked, ...ignored]) {
    if (!allowed.has(path)) fail(`disposable checkout contains undeclared generated content: ${path}`);
  }
  for (const path of allowed) resolveRegularFile(reviewRoot, path, { allowUntracked: true });
}

export function createDisposableCheckout(sourceRoot, reviewDir, commit, dispatchId, cleanupCapability) {
  if (existsSync(reviewDir)) fail("review-dir already exists");
  mkdirSync(dirname(reviewDir), { recursive: true });
  run("git", ["clone", "--quiet", "--no-hardlinks", "--no-local", "--no-checkout", "--single-branch", sourceRoot, reviewDir], {
    env: gitEnv(),
  });
  runGit(reviewDir, ["checkout", "--quiet", "--detach", commit]);
  runGit(reviewDir, ["remote", "remove", "origin"]);
  runGit(reviewDir, ["config", "--local", "core.hooksPath", "/dev/null"]);
  assertDisposableCheckout(reviewDir, commit);
  const marker = join(reviewDir, ".git", "pipeline-codex-review.json");
  writeFileSync(marker, canonicalJson({
    schema: "pipeline.codex-review-marker.v1",
    dispatchId,
    cleanupCapabilitySha256: sha256(cleanupCapability),
  }), { flag: "wx", mode: 0o600 });
  return reviewDir;
}

export function runCalibratedVerify(reviewRoot, calibrationPath) {
  const verify = parseVerifyCommand(reviewRoot, calibrationPath);
  const result = run(process.execPath, [join(reviewRoot, verify.script)], {
    cwd: reviewRoot,
    env: calibratedEnv(),
    maxBuffer: 64 * 1024 * 1024,
    allowNonzero: true,
  });
  if (result.status !== 0) fail(`calibrated verify failed with exit ${result.status}`);
  return {
    command: verify.command,
    stdoutSha256: sha256(result.stdout ?? ""),
    stderrSha256: sha256(result.stderr ?? ""),
  };
}

function artifactBindings(reviewRoot, pipelineRoot, request) {
  const result = [
    { source: "review", kind: "calibration", ...resolveRegularFile(reviewRoot, request.calibration_path) },
    { source: "review", kind: "spec", ...resolveRegularFile(reviewRoot, request.spec_path) },
    { source: "review", kind: "diff", ...resolveRegularFile(reviewRoot, DIFF_REFERENCE_PATH, { allowUntracked: true }) },
    ...request.guardrail_paths.map((path) => ({ source: "review", kind: "guardrail", ...resolveRegularFile(reviewRoot, path) })),
    ...request.evidence_paths.map((path) => ({ source: "review", kind: "evidence", ...resolveRegularFile(reviewRoot, path, { allowUntracked: true }) })),
    { source: "ruleset", kind: "role-contract", ...resolveRegularFile(pipelineRoot, ROLE_CONTRACT_PATH) },
    { source: "ruleset", kind: "prompt-contract", ...resolveRegularFile(pipelineRoot, PROMPT_CONTRACT_PATH) },
    { source: "ruleset", kind: "verdict-schema", ...resolveRegularFile(pipelineRoot, VERDICT_SCHEMA_REPO_PATH) },
    { source: "ruleset", kind: "host-return-schema", ...resolveRegularFile(pipelineRoot, "plugins/pipeline-core/scripts/codex-critic-host-return.schema.json") },
  ];
  const identities = result.map(({ source, kind, path }) => `${source}:${kind}:${path}`);
  if (new Set(identities).size !== identities.length) fail("reference set contains duplicate kind/path bindings");
  return result;
}

function inventoryPaths(repoRoot, args, label) {
  const output = runGit(repoRoot, args, { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 }).stdout;
  const paths = output.toString("utf8").split("\0").filter(Boolean).sort();
  if (paths.length > MAX_INVENTORY_FILES) fail(`${label} inventory exceeds ${MAX_INVENTORY_FILES} files`);
  let bytes = 0;
  const entries = paths.map((path) => {
    const normalized = normalizeRepoRelativePath(path, `${label} inventory path`);
    const absolute = resolve(repoRoot, normalized);
    if (!isInside(repoRoot, absolute)) fail(`${label} inventory escapes repository`);
    const info = lstatSync(absolute);
    if (info.isSymbolicLink()) {
      const target = Buffer.from(readlinkSync(absolute), "utf8");
      bytes += target.length;
      return { path: normalized, type: "symlink", bytes: target.length, sha256: sha256(target) };
    }
    if (!info.isFile()) return { path: normalized, type: "special", bytes: 0, sha256: sha256(String(info.mode)) };
    const content = readFileSync(absolute);
    bytes += content.length;
    if (bytes > MAX_INVENTORY_BYTES) fail(`${label} inventory exceeds ${MAX_INVENTORY_BYTES} bytes`);
    return { path: normalized, type: "file", bytes: content.length, sha256: sha256(content) };
  });
  return { count: entries.length, bytes, sha256: sha256(canonicalJson(entries)) };
}

function adminDirectoryInventory(root, label) {
  const entries = [];
  let bytes = 0;
  const walk = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (prefix === "" && entry.name === "index") continue;
      if (entry.name.toLowerCase() === "agents.md") fail(`${label} contains excluded AGENTS.md`);
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const absolute = join(directory, entry.name);
      const info = lstatSync(absolute);
      if (entry.isDirectory()) {
        entries.push({ path, type: "directory", mode: info.mode & 0o777 });
        walk(absolute, path);
      } else if (entry.isSymbolicLink()) {
        const target = Buffer.from(readlinkSync(absolute), "utf8");
        bytes += target.length;
        entries.push({ path, type: "symlink", mode: info.mode & 0o777, bytes: target.length, sha256: sha256(target) });
      } else if (entry.isFile()) {
        const content = readFileSync(absolute);
        bytes += content.length;
        entries.push({ path, type: "file", mode: info.mode & 0o777, bytes: content.length, sha256: sha256(content) });
      } else {
        entries.push({ path, type: "special", mode: info.mode });
      }
      if (entries.length > MAX_INVENTORY_FILES || bytes > MAX_INVENTORY_BYTES) fail(`${label} administrative inventory exceeds its bound`);
    }
  };
  walk(root);
  return { count: entries.length, bytes, sha256: sha256(canonicalJson(entries)) };
}

function regularGitIndex(repoRoot, { allowMissing = false } = {}) {
  const dotGit = join(repoRoot, ".git");
  const dotGitInfo = lstatSync(dotGit);
  if (dotGitInfo.isSymbolicLink()) fail(".git must not be a symlink");
  let gitDir;
  if (dotGitInfo.isDirectory()) {
    gitDir = realpathSync(dotGit);
  } else if (dotGitInfo.isFile()) {
    const pointer = readFileSync(dotGit, "utf8");
    const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(pointer);
    if (!match) fail(".git file is not a strict gitdir pointer");
    gitDir = realpathSync(isAbsolute(match[1]) ? match[1] : resolve(repoRoot, match[1]));
  } else {
    fail(".git must be a directory or gitdir file");
  }
  const path = join(gitDir, "index");
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return { gitDir, path, info: null };
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) fail("Git index must be a regular non-symlink file");
  return { gitDir, path, info };
}

function gitAdministrativeFingerprint(repoRoot) {
  const { gitDir, path: indexPath, info: indexInfo } = regularGitIndex(repoRoot);
  const commonRaw = gitText(repoRoot, ["rev-parse", "--git-common-dir"]);
  const commonDir = realpathSync(isAbsolute(commonRaw) ? commonRaw : resolve(repoRoot, commonRaw));
  const index = readFileSync(indexPath);
  const roots = {
    git: adminDirectoryInventory(gitDir, "git-dir"),
    index: { type: "file", mode: indexInfo.mode & 0o777, bytes: index.length, sha256: sha256(index) },
  };
  if (commonDir !== gitDir) roots.common = adminDirectoryInventory(commonDir, "git-common-dir");
  const dotGit = join(repoRoot, ".git");
  const link = lstatSync(dotGit);
  roots.worktreeLink = link.isFile()
    ? { type: "file", sha256: sha256(readFileSync(dotGit)) }
    : { type: link.isDirectory() ? "directory" : "special", mode: link.mode };
  return { sha256: sha256(canonicalJson(roots)), detail: roots };
}

export function captureRepositoryFingerprint(repoRoot, declaredArtifacts = []) {
  // Reject a redirected/special index before any ls-files/diff/status command
  // can dereference it, block on it, or touch an external target.
  regularGitIndex(repoRoot);
  const parts = {
    head: gitText(repoRoot, ["rev-parse", "HEAD"]),
    tree: gitText(repoRoot, ["rev-parse", "HEAD^{tree}"]),
    index: sha256(runGit(repoRoot, ["ls-files", "-s", "-z"], { encoding: "buffer" }).stdout),
    visibility: sha256(runGit(repoRoot, ["ls-files", "-v", "-z"], { encoding: "buffer" }).stdout),
    staged: sha256(runGit(repoRoot, ["diff", "--cached", "--binary", "--no-ext-diff"], { encoding: "buffer" }).stdout),
    tracked: sha256(runGit(repoRoot, ["diff", "--binary", "--no-ext-diff"], { encoding: "buffer" }).stdout),
    status: sha256(runGit(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { encoding: "buffer" }).stdout),
    untracked: inventoryPaths(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"], "untracked"),
    ignored: inventoryPaths(repoRoot, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], "ignored"),
    artifacts: Object.fromEntries(declaredArtifacts.map((item) => [item.path, resolveRegularFile(repoRoot, item.path, {
      allowUntracked: item.kind === "evidence" || item.kind === "diff",
    }).sha256])),
    administrative: gitAdministrativeFingerprint(repoRoot),
  };
  return { sha256: sha256(canonicalJson(parts)), detail: parts };
}

export function parseObserverArgs(values = []) {
  const observers = [];
  for (const raw of values) {
    const at = raw.indexOf("=");
    if (at < 1) fail("--observer must be name=/absolute/repo");
    const name = raw.slice(0, at);
    const path = raw.slice(at + 1);
    if (!SAFE_ID.test(name)) fail(`invalid observer name: ${name}`);
    if (!isAbsolute(path)) fail(`observer path must be absolute: ${name}`);
    observers.push({ name, root: assertGitRepository(path, `observer ${name}`) });
  }
  if (new Set(observers.map(({ name }) => name)).size !== observers.length) fail("observer names must be unique");
  return observers.sort((a, b) => a.name.localeCompare(b.name));
}

function observerFingerprintMap(observers) {
  return Object.fromEntries(observers.map(({ name, root }) => [name, captureRepositoryFingerprint(root).sha256]));
}

function assertCanonicalObservers(observers) {
  const names = observers.map(({ name }) => name).sort();
  if (JSON.stringify(names) !== JSON.stringify(["private", "shared"])) {
    fail("normal Critic requires exactly the private and shared observers");
  }
}

function assertObserverSeparation(repoRoot, pipelineRoot, observers) {
  const candidateRoot = realpathSync(repoRoot);
  const rulesetRoot = realpathSync(pipelineRoot);
  if (candidateRoot === rulesetRoot) fail("candidate and ruleset roots must be separate checkouts");
  const protectedRoots = new Set([candidateRoot, rulesetRoot]);
  for (const { name, root } of observers) {
    const canonical = realpathSync(root);
    if (protectedRoots.has(canonical)) fail(`observer ${name} must be distinct from candidate, ruleset, and other observers`);
    protectedRoots.add(canonical);
  }
}

function protectedFingerprintMap(repoRoot, pipelineRoot, observers) {
  const entries = [["candidate", repoRoot], ["ruleset", pipelineRoot]];
  for (const { name, root } of observers) entries.push([`observer.${name}`, root]);
  const seen = new Map();
  for (const [name, root] of entries) {
    const canonical = realpathSync(root);
    if (!seen.has(canonical)) seen.set(canonical, { names: [name], sha256: captureRepositoryFingerprint(canonical).sha256 });
    else seen.get(canonical).names.push(name);
  }
  return Object.fromEntries([...seen.values()].flatMap(({ names, sha256: hash }) => names.map((name) => [name, hash])));
}

function protectedRootPathMap(repoRoot, pipelineRoot, observers) {
  return {
    candidate: realpathSync(repoRoot),
    ruleset: realpathSync(pipelineRoot),
    "observer.private": realpathSync(observers.find(({ name }) => name === "private").root),
    "observer.shared": realpathSync(observers.find(({ name }) => name === "shared").root),
  };
}

function assertFingerprintMapEqual(before, after, label) {
  if (JSON.stringify(before) !== JSON.stringify(after)) fail(`${label} repository mutation observed`);
}

function routeForNormalCritic() {
  const route = projectHostDuty("criticNormal", "codex");
  if (route.model !== "gpt-5.6-sol" || route.effort !== "xhigh" || route.dispatch !== "host-native") {
    fail("normal Critic routing authority is not gpt-5.6-sol/xhigh host-native");
  }
  return { duty: route.duty, runner: route.runner, alias: "fable", model: route.model, effort: route.effort };
}

function atomicWriteExclusive(path, value) {
  if (existsSync(path)) fail(`refusing to overwrite: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${nodeRandomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, canonicalJson(value), { flag: "wx", mode: 0o600 });
    const file = openSync(temporary, "r");
    try { fsyncSync(file); } finally { closeSync(file); }
    linkSync(temporary, path);
    chmodSync(path, 0o600);
    unlinkSync(temporary);
    const directory = openSync(dirname(path), "r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
    return { path, sha256: sha256(readFileSync(path)) };
  } catch (error) {
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* preserve original error */ }
    throw error;
  }
}

function fsyncDirectory(path) {
  const directory = openSync(path, "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function stageExactFile(path, value) {
  const expected = canonicalJson(value);
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    if (current !== expected) fail(`staged transaction artifact differs: ${path}`);
    return { path, sha256: sha256(current) };
  }
  return atomicWriteExclusive(path, value);
}

export function prepareNativeCritic(options, deps = {}) {
  if (!options.pipelineRoot) fail("pipelineRoot is required; implicit installed-plugin provenance is forbidden");
  const pipelineRoot = assertGitRepository(options.pipelineRoot, "pipeline root");
  const repoRoot = assertGitRepository(options.repoRoot, "candidate repository");
  const observers = options.observers ?? [];
  assertCanonicalObservers(observers);
  assertObserverSeparation(repoRoot, pipelineRoot, observers);
  const protectedRoots = [repoRoot, pipelineRoot, ...observers.map(({ root }) => root)];
  const controlRoot = assertControlRoot(options.controlDir, protectedRoots);
  const preparedPath = assertSafeControlPath(options.preparedPath, controlRoot, "prepared output");
  const dispatchStatePath = assertSafeControlPath(options.dispatchStatePath, controlRoot, "dispatch state");
  const reviewRoot = assertSafeControlPath(options.reviewRoot, controlRoot, "review directory");
  if ([preparedPath, dispatchStatePath].some((path) => path === reviewRoot || isInside(reviewRoot, path))) {
    fail("coordinator outputs must stay outside review directory");
  }
  if (new Set([preparedPath, dispatchStatePath, reviewRoot]).size !== 3) fail("control paths must be distinct");
  const requestRecord = readJsonBounded(options.requestPath);
  const request = validateCriticRequest(structuredClone(requestRecord.value));
  const protectedBefore = protectedFingerprintMap(repoRoot, pipelineRoot, observers);
  assertRepositoryClean(repoRoot, "candidate");
  validateCandidate(repoRoot, request);
  assertFingerprintMapEqual(protectedBefore, protectedFingerprintMap(repoRoot, pipelineRoot, observers), "candidate validation");
  assertRepositoryClean(pipelineRoot, "ruleset");
  assertFingerprintMapEqual(protectedBefore, protectedFingerprintMap(repoRoot, pipelineRoot, observers), "ruleset validation");
  const rulesetHead = gitText(pipelineRoot, ["rev-parse", "HEAD"]);
  if (rulesetHead !== request.ruleset_sha) fail("ruleset_sha does not match loaded pipeline checkout");
  if (request.ruleset_sha !== request.candidate_commit) fail("self-application requires ruleset_sha and candidate_commit to match");
  const execution = executionBindings(pipelineRoot);
  assertFingerprintMapEqual(protectedBefore, protectedFingerprintMap(repoRoot, pipelineRoot, observers), "ruleset identity");
  const route = routeForNormalCritic();
  const nonce = (deps.randomBytes ?? nodeRandomBytes)(32).toString("hex");
  const cleanupCapability = (deps.randomBytes ?? nodeRandomBytes)(32).toString("hex");
  const dispatchId = sha256(`${request.task_id}\0${request.candidate_commit}\0${nonce}`).slice(0, 32);
  const expectedTaskName = `critic_${request.task_id.replace(/[^a-z0-9_]/g, "_")}`.slice(0, 64);
  (deps.createCheckout ?? createDisposableCheckout)(repoRoot, reviewRoot, request.candidate_commit, dispatchId, cleanupCapability);
  assertFingerprintMapEqual(protectedBefore, protectedFingerprintMap(repoRoot, pipelineRoot, observers), "checkout subprocess");
  const verify = (deps.runVerify ?? runCalibratedVerify)(reviewRoot, request.calibration_path);
  assertFingerprintMapEqual(protectedBefore, protectedFingerprintMap(repoRoot, pipelineRoot, observers), "verify subprocess");
  const commits = enumerateReviewCommits(reviewRoot, request.review_base, request.candidate_commit);
  atomicWriteExclusive(join(reviewRoot, DIFF_REFERENCE_PATH), reviewCommitSet(
    request.review_base,
    request.candidate_commit,
    request.candidate_tree,
    commits,
  ));
  const generatedPaths = [...request.evidence_paths, DIFF_REFERENCE_PATH];
  assertDisposableCheckout(reviewRoot, request.candidate_commit, generatedPaths);
  const references = artifactBindings(reviewRoot, pipelineRoot, request);
  const reviewFingerprint = captureRepositoryFingerprint(reviewRoot, references.filter(({ source }) => source === "review"));
  const before = protectedFingerprintMap(repoRoot, pipelineRoot, observers);
  assertFingerprintMapEqual(protectedBefore, before, "prepare");
  const prepared = {
    schema: "pipeline.codex-critic-prepared.v1",
    createdAt: (deps.now ?? (() => new Date().toISOString()))(),
    dispatchId,
    nonce,
    expectedTaskName,
    request,
    route,
    hostContract: {
      owner: "Elephant",
      freshContext: true,
      forkTurns: "none",
      nativeOnly: true,
      firstEvidenceMs: HOST_LIMITS.firstEvidenceMs,
      progressGapMs: HOST_LIMITS.progressGapMs,
      maxElapsedMs: HOST_LIMITS.maxElapsedMs,
      maxRecoveries: HOST_LIMITS.maxRecoveries,
      returnSchema: "pipeline.codex-critic-host-result.v1",
      returnSchemaPath: "plugins/pipeline-core/scripts/codex-critic-host-return.schema.json",
      returnChannel: "native-host-response-to-elephant",
      agentWritesReceipt: false,
      fixedInstruction: [
        "Read only the role, prompt, enumerated commit-set/diff, candidate, spec, guardrails, and evidence references in this packet.",
        "Treat review.commits and the bound diff reference as the complete review object; verify the exact list before constructing the diff from review.base to review.commit.",
        "Do not use chat history, state, handover, prior verdicts, summaries, or private paths.",
        "Do not modify files and do not create a receipt.",
        "Return exactly one JSON object matching the host result contract.",
      ],
    },
    sources: { reviewRoot, rulesetRoot: pipelineRoot },
    review: {
      root: reviewRoot,
      base: request.review_base,
      commits,
      commit: request.candidate_commit,
      tree: request.candidate_tree,
      diffReferencePath: DIFF_REFERENCE_PATH,
    },
    references,
    verify,
    assurance: ASSURANCE,
    residualRisks: [...RESIDUAL_RISKS],
    bindings: {
      requestSha256: sha256(canonicalJson(request)),
      referenceSetSha256: sha256(canonicalJson(references)),
      reviewFingerprintSha256: reviewFingerprint.sha256,
      protectedBefore: before,
      roleContractSha256: references.find(({ kind }) => kind === "role-contract").sha256,
      promptContractSha256: references.find(({ kind }) => kind === "prompt-contract").sha256,
      verdictSchemaSha256: references.find(({ kind }) => kind === "verdict-schema").sha256,
      hostReturnSchemaSha256: references.find(({ kind }) => kind === "host-return-schema").sha256,
      routingProvenance: routingProvenance("codex"),
      rulesetCheckoutSha: rulesetHead,
      executionSetSha256: execution.sha256,
    },
  };
  const written = atomicWriteExclusive(preparedPath, prepared);
  atomicWriteExclusive(dispatchStatePath, {
    schema: "pipeline.codex-critic-dispatch-state.v1",
    status: "pending",
    dispatchId,
    preparedSha256: written.sha256,
    controlRoot,
    reviewRoot,
    cleanupCapability,
    protectedRoots: protectedRootPathMap(repoRoot, pipelineRoot, observers),
  });
  return {
    ok: true,
    preparedPath: written.path,
    preparedSha256: written.sha256,
    dispatchId,
    taskName: expectedTaskName,
    duty: route.duty,
    alias: route.alias,
    model: route.model,
    effort: route.effort,
    leaseSeconds: HOST_LIMITS.maxElapsedMs / 1000,
  };
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} has missing or unknown fields`);
}

function assertSafeResultText(value) {
  const strings = [];
  const visit = (item) => {
    if (typeof item === "string") strings.push(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") Object.values(item).forEach(visit);
  };
  visit(value.verdict);
  for (const text of strings) {
    for (const pattern of [
      /(^|[\s"'`])\/(?:[^\s/]+\/)*[^\s/]*/,
      /[A-Za-z]:[\\/]/,
      /\\\\[^\\\s]+\\/,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
      /\b[a-z][a-z0-9+.-]*:\/\//i,
      /\b(?:token|secret|password|api[_-]?key)\s*[:=]/i,
      /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    ]) {
      if (pattern.test(text)) fail("critic result contains prohibited path, locator, or secret-like text");
    }
  }
}

function parseEvidenceCitation(value) {
  if (typeof value !== "string") fail("finding evidence must be a string citation");
  const match = value.match(/^([A-Za-z0-9._/-]+):([1-9]\d{0,6})(?:-([1-9]\d{0,6}))?$/);
  if (!match) fail("finding evidence must be one repo-relative path:line[-line] citation");
  const path = normalizeRepoRelativePath(match[1], "finding evidence");
  const startLine = Number(match[2]);
  const endLine = match[3] ? Number(match[3]) : startLine;
  if (endLine < startLine) fail("finding evidence line range is reversed");
  return { path, startLine, endLine };
}

function sanitizeVerdictForReceipt(verdict, reviewRoot) {
  const findings = verdict.findings.map((finding) => {
    const evidence = parseEvidenceCitation(finding.evidence);
    const cited = resolveRegularFile(reviewRoot, evidence.path);
    const citedText = readFileSync(resolve(reviewRoot, cited.path), "utf8");
    const lineCount = citedText.length === 0 ? 0 : (citedText.match(/\n/g)?.length ?? 0) + (citedText.endsWith("\n") ? 0 : 1);
    if (evidence.startLine > lineCount || evidence.endLine > lineCount) fail("finding evidence line is outside the cited file");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(finding.spec_ref)) fail("finding spec_ref is not a closed identifier");
    return {
      severity: finding.severity,
      evidence,
      specRef: finding.spec_ref,
      detailSha256: sha256(canonicalJson({ gap: finding.gap, risk: finding.risk })),
    };
  });
  return {
    findings,
    deliberatelyNotFlaggedSha256: sha256(canonicalJson(verdict.deliberately_not_flagged)),
    trajectoryVerdict: verdict.trajectory_verdict,
    trajectoryEvidenceSha256: sha256(verdict.trajectory_evidence),
    briefingViolationCount: verdict.briefing_violations.length,
    briefingViolationsSha256: sha256(canonicalJson(verdict.briefing_violations)),
    pass: verdict.pass,
  };
}

export function validateHostReturn(prepared, preparedSha256, hostReturn, verdictSchema = loadSchema(VERDICT_SCHEMA_PATH)) {
  assertSchema(hostReturn, HOST_RETURN_SCHEMA_PATH, "host return");
  exactKeys(hostReturn, ["schema", "host_execution", "critic_result"], "host return");
  if (hostReturn.schema !== "pipeline.codex-native-host-return.v1") fail("host return schema mismatch");
  const execution = hostReturn.host_execution;
  exactKeys(execution, [
    "agent_id", "task_name", "dispatch_id", "requested_alias", "requested_effort", "resolved_model",
    "resolved_effort", "route_source", "terminal_status", "completed_elapsed_ms", "recovery_count", "evidence_events",
  ], "host_execution");
  if (execution.dispatch_id !== prepared.dispatchId) fail("host dispatch_id mismatch");
  if (execution.task_name !== prepared.expectedTaskName || typeof execution.agent_id !== "string" || execution.agent_id.length < 3) fail("invalid host task/agent identity");
  if (execution.requested_alias !== "fable" || execution.requested_effort !== "xhigh") fail("host requested route mismatch");
  if (execution.resolved_model !== "gpt-5.6-sol" || execution.resolved_effort !== "xhigh") fail("host confirmed route mismatch");
  if (execution.route_source !== "project-duty+coordinator") fail("host route source mismatch");
  if (execution.terminal_status !== "completed") fail("host task did not complete");
  if (!Number.isInteger(execution.completed_elapsed_ms) || execution.completed_elapsed_ms < 0 || execution.completed_elapsed_ms > HOST_LIMITS.maxElapsedMs) {
    fail("host completion exceeded the bounded lease");
  }
  if (!Number.isInteger(execution.recovery_count) || execution.recovery_count < 0 || execution.recovery_count > HOST_LIMITS.maxRecoveries) {
    fail("host recovery count exceeded the contract");
  }
  if (!Array.isArray(execution.evidence_events) || execution.evidence_events.length === 0) fail("host liveness evidence is missing");
  let prior = 0;
  const hashes = new Set();
  const kinds = [];
  for (const [index, event] of execution.evidence_events.entries()) {
    exactKeys(event, ["sequence", "kind", "elapsed_ms", "evidence_text", "evidence_sha256"], `evidence_events[${index}]`);
    if (event.sequence !== index + 1) fail("host liveness sequence is not contiguous");
    if (!new Set(["review-started", "evidence-inspected", "analysis-progress", "recovery-started", "review-completed"]).has(event.kind)) {
      fail("host liveness event kind is invalid");
    }
    if (!Number.isInteger(event.elapsed_ms) || event.elapsed_ms < prior) fail("host liveness events are not monotonic");
    if (index === 0 && event.elapsed_ms > HOST_LIMITS.firstEvidenceMs) fail("first host evidence arrived too late");
    if (typeof event.evidence_text !== "string" || event.evidence_text.length < 16 || event.evidence_text.length > 2048) fail("host liveness evidence text is invalid");
    if (/^(?:running|alive|waiting|still working)\b/i.test(event.evidence_text)) fail("generic liveness text is not concrete evidence");
    if (sha256(event.evidence_text) !== event.evidence_sha256) fail("host liveness evidence hash mismatch");
    if (!SHA256.test(event.evidence_sha256) || hashes.has(event.evidence_sha256)) fail("host liveness evidence is invalid or repeated");
    prior = event.elapsed_ms;
    hashes.add(event.evidence_sha256);
    kinds.push(event.kind);
  }
  if (execution.completed_elapsed_ms < prior) fail("host completion precedes its final event");

  const result = hostReturn.critic_result;
  exactKeys(result, [
    "schema", "dispatch_id", "prepared_sha256", "nonce", "candidate_commit", "candidate_tree",
    "context_disclosure", "achieved_assurance", "verdict",
  ], "critic_result");
  if (result.schema !== "pipeline.codex-critic-host-result.v1") fail("critic result schema mismatch");
  if (result.dispatch_id !== prepared.dispatchId || result.prepared_sha256 !== preparedSha256 || result.nonce !== prepared.nonce) fail("critic result replay/binding mismatch");
  if (result.candidate_commit !== prepared.review.commit || result.candidate_tree !== prepared.review.tree) fail("critic candidate binding mismatch");
  if (result.achieved_assurance !== ASSURANCE) fail("critic assurance claim mismatch");
  if (kinds[0] !== "review-started" || !kinds.includes("evidence-inspected") || kinds.at(-1) !== "review-completed") {
    fail("host liveness lifecycle is incomplete");
  }
  if (kinds.filter((kind) => kind === "recovery-started").length !== execution.recovery_count) fail("host recovery evidence mismatch");
  const expectedStarted = `prepared:${preparedSha256}`;
  const expectedInspected = `reference-set:${prepared.bindings.referenceSetSha256}`;
  const expectedCompleted = `result:${sha256(canonicalJson(result))}`;
  const contentEvidence = [];
  for (const event of execution.evidence_events) {
    if (event.kind === "review-started" && event.evidence_text !== expectedStarted) fail("review-started evidence is not prepared-bound");
    if (event.kind === "evidence-inspected" && event.evidence_text !== expectedInspected) fail("evidence-inspected event is not reference-bound");
    if (event.kind === "review-completed" && event.evidence_text !== expectedCompleted) fail("review-completed evidence is not result-bound");
    if (event.kind === "analysis-progress") {
      const match = /^analysis-progress:([^:]+):([1-9][0-9]*):([A-Za-z0-9._-]{3,80})$/.exec(event.evidence_text);
      if (!match) fail("analysis-progress evidence is not path/line/control-bound");
      const [, path, rawLine] = match;
      const reference = prepared.references.find((item) => item.path === path);
      if (!reference) fail("analysis-progress path is outside the prepared reference set");
      const sourceRoot = reference.source === "review" ? prepared.sources.reviewRoot
        : reference.source === "ruleset" ? prepared.sources.rulesetRoot : null;
      if (!sourceRoot) fail("analysis-progress reference source is invalid");
      const content = readFileSync(resolve(sourceRoot, path), "utf8");
      const lineCount = content.length === 0 ? 0 : (content.match(/\n/g)?.length ?? 0) + (content.endsWith("\n") ? 0 : 1);
      if (Number(rawLine) > lineCount) fail("analysis-progress line is outside the prepared reference");
    }
    if (event.kind !== "recovery-started") contentEvidence.push(event);
  }
  if (kinds.filter((kind) => kind === "review-started").length !== 1
    || kinds.filter((kind) => kind === "evidence-inspected").length !== 1
    || kinds.filter((kind) => kind === "review-completed").length !== 1) {
    fail("host liveness evidence is not uniquely bound to prepared, references, and result");
  }
  if (contentEvidence[0].elapsed_ms > HOST_LIMITS.firstEvidenceMs) fail("first host evidence arrived too late");
  for (let index = 1; index < contentEvidence.length; index++) {
    if (contentEvidence[index].elapsed_ms - contentEvidence[index - 1].elapsed_ms > HOST_LIMITS.progressGapMs) {
      fail("host content-evidence gap exceeded the lease");
    }
  }
  if (execution.completed_elapsed_ms - contentEvidence.at(-1).elapsed_ms > HOST_LIMITS.progressGapMs) fail("host completion liveness gap exceeded the lease");
  const allowedDisclosure = new Set(["project-instructions", "git-status", "user-settings", "host-runtime", "none"]);
  if (!Array.isArray(result.context_disclosure) || result.context_disclosure.length === 0
    || result.context_disclosure.some((item) => !allowedDisclosure.has(item))
    || new Set(result.context_disclosure).size !== result.context_disclosure.length
    || (result.context_disclosure.includes("none") && result.context_disclosure.length !== 1)) {
    fail("critic context disclosure is invalid");
  }
  const verdictValidation = validateAgainstSchema(result.verdict, verdictSchema);
  if (!verdictValidation.valid) fail(`critic verdict invalid: ${verdictValidation.errors.join("; ")}`);
  assertSafeResultText(result);
  const hasBlockingFinding = result.verdict.findings.some(({ severity }) => severity === "blocker" || severity === "major");
  const reviewPass = result.verdict.pass === true
    && !hasBlockingFinding
    && result.verdict.briefing_violations.length === 0
    && result.verdict.trajectory_verdict === "consistent";
  if (result.verdict.pass === true && !reviewPass) fail("critic pass contradicts findings, briefing, or trajectory evidence");
  return { execution, result, reviewPass };
}

function validatePrepared(prepared) {
  exactKeys(prepared, [
    "schema", "createdAt", "dispatchId", "nonce", "expectedTaskName", "request", "route", "hostContract", "sources", "review",
    "references", "verify", "assurance", "residualRisks", "bindings",
  ], "prepared packet");
  if (prepared.schema !== "pipeline.codex-critic-prepared.v1") fail("prepared packet schema mismatch");
  validateCriticRequest(structuredClone(prepared.request));
  if (!SHA256.test(prepared.nonce) || !/^[0-9a-f]{32}$/.test(prepared.dispatchId)) fail("prepared nonce/dispatch ID invalid");
  if (prepared.assurance !== ASSURANCE || JSON.stringify(prepared.residualRisks) !== JSON.stringify(RESIDUAL_RISKS)) fail("prepared assurance boundary drift");
  exactKeys(prepared.route, ["duty", "runner", "alias", "model", "effort"], "prepared route");
  exactKeys(prepared.sources, ["reviewRoot", "rulesetRoot"], "prepared sources");
  exactKeys(prepared.review, ["root", "base", "commits", "commit", "tree", "diffReferencePath"], "prepared review");
  exactKeys(prepared.bindings, [
    "requestSha256", "referenceSetSha256", "reviewFingerprintSha256", "protectedBefore",
    "roleContractSha256", "promptContractSha256", "verdictSchemaSha256", "hostReturnSchemaSha256", "routingProvenance", "rulesetCheckoutSha", "executionSetSha256",
  ], "prepared bindings");
  const route = routeForNormalCritic();
  if (JSON.stringify(prepared.route) !== JSON.stringify(route)) fail("prepared route drift");
  if (!isAbsolute(prepared.review.root) || prepared.sources.reviewRoot !== prepared.review.root || !isAbsolute(prepared.sources.rulesetRoot)
    || prepared.review.base !== prepared.request.review_base
    || prepared.review.commit !== prepared.request.candidate_commit || prepared.review.tree !== prepared.request.candidate_tree) {
    fail("prepared review binding drift");
  }
  validateReviewCommitSet(prepared.review.root, prepared.review);
  if (prepared.expectedTaskName !== `critic_${prepared.request.task_id.replace(/[^a-z0-9_]/g, "_")}`.slice(0, 64)) fail("prepared task name drift");
  if (!prepared.bindings.protectedBefore || typeof prepared.bindings.protectedBefore !== "object" || Array.isArray(prepared.bindings.protectedBefore)) {
    fail("prepared protected-root bindings invalid");
  }
  if (JSON.stringify(Object.keys(prepared.bindings.protectedBefore).sort()) !== JSON.stringify(["candidate", "observer.private", "observer.shared", "ruleset"])) {
    fail("prepared protected-root binding set is incomplete");
  }
  for (const [name, hash] of Object.entries(prepared.bindings.protectedBefore)) {
    if (!/^(?:candidate|ruleset|observer\.(?:private|shared))$/.test(name) || !SHA256.test(hash)) fail("prepared protected-root binding invalid");
  }
  exactKeys(prepared.hostContract, [
    "owner", "freshContext", "forkTurns", "nativeOnly", "firstEvidenceMs", "progressGapMs", "maxElapsedMs",
    "maxRecoveries", "returnSchema", "returnSchemaPath", "returnChannel", "agentWritesReceipt", "fixedInstruction",
  ], "prepared hostContract");
  if (prepared.hostContract.owner !== "Elephant" || prepared.hostContract.freshContext !== true
    || prepared.hostContract.forkTurns !== "none" || prepared.hostContract.nativeOnly !== true
    || prepared.hostContract.firstEvidenceMs !== HOST_LIMITS.firstEvidenceMs
    || prepared.hostContract.progressGapMs !== HOST_LIMITS.progressGapMs
    || prepared.hostContract.maxElapsedMs !== HOST_LIMITS.maxElapsedMs
    || prepared.hostContract.maxRecoveries !== HOST_LIMITS.maxRecoveries
    || prepared.hostContract.returnSchema !== "pipeline.codex-critic-host-result.v1"
    || prepared.hostContract.returnSchemaPath !== "plugins/pipeline-core/scripts/codex-critic-host-return.schema.json"
    || prepared.hostContract.returnChannel !== "native-host-response-to-elephant"
    || prepared.hostContract.agentWritesReceipt !== false) fail("prepared host contract drift");
  if (prepared.bindings.requestSha256 !== sha256(canonicalJson(prepared.request))) fail("prepared request hash drift");
  if (prepared.request.ruleset_sha !== prepared.request.candidate_commit) fail("prepared self-application commit binding drift");
  if (!SHA256.test(prepared.bindings.referenceSetSha256) || !SHA256.test(prepared.bindings.reviewFingerprintSha256)) fail("prepared binding hash invalid");
  if (prepared.bindings.routingProvenance !== routingProvenance("codex")) fail("prepared routing provenance drift");
  if (!SHA256.test(prepared.bindings.executionSetSha256)) fail("prepared execution binding invalid");
  if (!Array.isArray(prepared.references) || prepared.references.length === 0) fail("prepared references missing");
  for (const [index, reference] of prepared.references.entries()) {
    exactKeys(reference, ["source", "kind", "path", "sha256", "bytes"], `prepared references[${index}]`);
    if (!new Set(["review", "ruleset"]).has(reference.source) || !SHA256.test(reference.sha256)) fail("prepared reference binding invalid");
  }
  const diffReferences = prepared.references.filter(({ source, kind, path }) => source === "review" && kind === "diff" && path === DIFF_REFERENCE_PATH);
  if (diffReferences.length !== 1) fail("prepared enumerated diff reference is missing or ambiguous");
}

function cleanupReviewRoot(prepared, dispatchState) {
  if (realpathSync(prepared.review.root) !== realpathSync(dispatchState.reviewRoot)) fail("review cleanup root mismatch");
  const markerPath = join(prepared.review.root, ".git", "pipeline-codex-review.json");
  const marker = readJsonBounded(markerPath).value;
  if (marker.schema !== "pipeline.codex-review-marker.v1" || marker.dispatchId !== prepared.dispatchId
    || marker.cleanupCapabilitySha256 !== sha256(dispatchState.cleanupCapability)) fail("review cleanup marker mismatch");
  rmSync(prepared.review.root, { recursive: true, force: false });
  return !existsSync(prepared.review.root);
}

function validateDispatchState(state, preparedRecord, controlRoot, expectedProtectedRoots) {
  exactKeys(state, ["schema", "status", "dispatchId", "preparedSha256", "controlRoot", "reviewRoot", "cleanupCapability", "protectedRoots"], "dispatch state");
  if (state.schema !== "pipeline.codex-critic-dispatch-state.v1" || state.status !== "pending") fail("dispatch state is not pending");
  if (state.dispatchId !== preparedRecord.value.dispatchId || state.preparedSha256 !== preparedRecord.sha256) fail("dispatch state binding mismatch");
  if (realpathSync(state.controlRoot) !== controlRoot || !isAbsolute(state.reviewRoot) || !SHA256.test(state.cleanupCapability)) fail("dispatch state control binding invalid");
  if (JSON.stringify(state.protectedRoots) !== JSON.stringify(expectedProtectedRoots)) fail("dispatch protected-root identity mismatch");
}

function completeReceiptTransaction({
  controlRoot,
  consumePath,
  completePath,
  pendingPath,
  receiptPath,
  receipt,
  prepared,
  dispatchState,
  cleanup,
}) {
  const receiptSha256 = sha256(canonicalJson(receipt));
  const marker = {
    schema: "pipeline.codex-critic-dispatch-finalizing.v1",
    dispatchId: prepared.dispatchId,
    preparedSha256: dispatchState.preparedSha256,
    receiptRelativePath: relative(controlRoot, receiptPath).split(sep).join("/"),
    receiptSha256,
    cleanupRequested: cleanup === true,
  };
  stageExactFile(pendingPath, receipt);
  stageExactFile(consumePath, marker);
  linkSync(pendingPath, receiptPath);
  chmodSync(receiptPath, 0o600);
  fsyncDirectory(dirname(receiptPath));
  if (existsSync(pendingPath)) unlinkSync(pendingPath);
  fsyncDirectory(dirname(pendingPath));
  atomicWriteExclusive(completePath, {
    schema: "pipeline.codex-critic-dispatch-consumed.v1",
    dispatchId: prepared.dispatchId,
    preparedSha256: dispatchState.preparedSha256,
    receiptSha256,
    cleanupRequested: cleanup === true,
  });
  let cleanupComplete = false;
  if (cleanup) {
    try { cleanupComplete = existsSync(prepared.review.root) ? cleanupReviewRoot(prepared, dispatchState) : true; } catch { cleanupComplete = false; }
  }
  return { receiptSha256, cleanupComplete };
}

function recoverReceiptTransaction({ controlRoot, consumePath, completePath, pendingPath, receiptPath, prepared, dispatchState, cleanup }) {
  if (existsSync(completePath)) fail("dispatch was already consumed");
  if (!existsSync(consumePath)) return null;
  const marker = readJsonBounded(consumePath).value;
  exactKeys(marker, ["schema", "dispatchId", "preparedSha256", "receiptRelativePath", "receiptSha256", "cleanupRequested"], "receipt transaction marker");
  if (marker.schema !== "pipeline.codex-critic-dispatch-finalizing.v1" || marker.dispatchId !== prepared.dispatchId
    || marker.preparedSha256 !== dispatchState.preparedSha256
    || marker.receiptRelativePath !== relative(controlRoot, receiptPath).split(sep).join("/")
    || marker.cleanupRequested !== (cleanup === true) || !SHA256.test(marker.receiptSha256)) fail("receipt recovery binding mismatch");
  if (!existsSync(receiptPath)) {
    if (!existsSync(pendingPath) || sha256(readFileSync(pendingPath)) !== marker.receiptSha256) fail("receipt recovery payload is missing or invalid");
    linkSync(pendingPath, receiptPath);
    chmodSync(receiptPath, 0o600);
  }
  if (sha256(readFileSync(receiptPath)) !== marker.receiptSha256) fail("receipt recovery target differs");
  const recoveredReceipt = readJsonBounded(receiptPath).value;
  fsyncDirectory(dirname(receiptPath));
  if (existsSync(pendingPath)) unlinkSync(pendingPath);
  fsyncDirectory(dirname(pendingPath));
  atomicWriteExclusive(completePath, {
    schema: "pipeline.codex-critic-dispatch-consumed.v1",
    dispatchId: prepared.dispatchId,
    preparedSha256: dispatchState.preparedSha256,
    receiptSha256: marker.receiptSha256,
    cleanupRequested: cleanup === true,
  });
  let cleanupComplete = false;
  if (cleanup) {
    try { cleanupComplete = existsSync(prepared.review.root) ? cleanupReviewRoot(prepared, dispatchState) : true; } catch { cleanupComplete = false; }
  }
  return { ok: true, receiptPath, receiptSha256: marker.receiptSha256, reviewPass: recoveredReceipt.reviewPass, recovered: true, cleanupComplete };
}

function validateReceiptSemantics(receipt, prepared, sanitizedVerdict) {
  if (receipt.assurance !== ASSURANCE || JSON.stringify(receipt.residualRisks) !== JSON.stringify(RESIDUAL_RISKS)) fail("receipt assurance boundary drift");
  if (receipt.route.providerAttested !== false || receipt.route.coordinatorConfirmed !== true) fail("receipt route claim drift");
  if (receipt.route.duty !== "criticNormal" || receipt.route.runner !== "codex" || receipt.route.alias !== "fable"
    || receipt.route.requestedModel !== "gpt-5.6-sol" || receipt.route.requestedEffort !== "xhigh") fail("receipt route binding drift");
  if (receipt.state.mutationObserved !== false) fail("receipt mutation claim drift");
  const authorization = prepared.request.normal_lane_authorization;
  const expectedAuthorization = authorization ? {
    kind: authorization.kind,
    authority: authorization.authority,
    riskId: authorization.risk_id,
    scope: authorization.scope,
    evidenceSha256: authorization.evidence_sha256,
    candidateCommit: authorization.candidate_commit,
  } : undefined;
  if (JSON.stringify(receipt.normalLaneAuthorization) !== JSON.stringify(expectedAuthorization)) {
    fail("receipt normal lane authorization drift");
  }
  if (receipt.reviewPass !== sanitizedVerdict.pass || receipt.reviewPass !== (sanitizedVerdict.pass
    && sanitizedVerdict.findings.every(({ severity }) => !["blocker", "major"].includes(severity))
    && sanitizedVerdict.briefingViolationCount === 0
    && sanitizedVerdict.trajectoryVerdict === "consistent")) fail("receipt review verdict drift");
  if (!/^[0-9a-f]{32}$/.test(receipt.dispatchId) || receipt.dispatchId !== prepared.dispatchId) fail("receipt dispatch binding invalid");
  const hashKeys = [
    "preparedSha256", "requestSha256", "referenceSetSha256", "resultSha256", "reviewFingerprintBefore",
    "reviewFingerprintAfter", "roleContractSha256", "promptContractSha256", "verdictSchemaSha256", "hostReturnSchemaSha256", "executionSetSha256",
  ];
  if (hashKeys.some((key) => !SHA256.test(receipt.bindings[key]))) fail("receipt hash binding invalid");
  if (receipt.bindings.routingProvenance !== prepared.bindings.routingProvenance) fail("receipt routing provenance drift");
  if (receipt.candidate.base !== prepared.review.base || receipt.candidate.commit !== prepared.review.commit
    || receipt.candidate.tree !== prepared.review.tree || !SHA40.test(receipt.candidate.base)
    || !SHA40.test(receipt.candidate.commit) || !SHA40.test(receipt.candidate.tree)) fail("receipt candidate drift");
  if (receipt.liveness.taskName !== prepared.expectedTaskName || !SHA256.test(receipt.liveness.agentIdHash)
    || receipt.liveness.evidenceEvents.length === 0
    || receipt.liveness.evidenceEvents.some(({ evidenceSha256 }) => !SHA256.test(evidenceSha256))) fail("receipt liveness binding invalid");
  if (JSON.stringify(receipt.state.before) !== JSON.stringify(prepared.bindings.protectedBefore)
    || JSON.stringify(receipt.state.after) !== JSON.stringify(prepared.bindings.protectedBefore)) fail("receipt protected-state binding drift");
  if (sanitizedVerdict.findings.some(({ detailSha256, evidence, specRef }) => !SHA256.test(detailSha256)
    || !Number.isInteger(evidence.startLine) || evidence.startLine < 1 || !Number.isInteger(evidence.endLine)
    || evidence.endLine < evidence.startLine || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(specRef))) fail("receipt finding binding invalid");
  for (const hash of [sanitizedVerdict.deliberatelyNotFlaggedSha256, sanitizedVerdict.trajectoryEvidenceSha256, sanitizedVerdict.briefingViolationsSha256]) {
    if (!SHA256.test(hash)) fail("receipt verdict hash invalid");
  }
}

export function finalizeNativeCritic(options) {
  if (!options.pipelineRoot) fail("pipelineRoot is required; implicit installed-plugin provenance is forbidden");
  const pipelineRoot = assertGitRepository(options.pipelineRoot, "pipeline root");
  const repoRoot = assertGitRepository(options.repoRoot, "candidate repository");
  const observers = options.observers ?? [];
  assertCanonicalObservers(observers);
  assertObserverSeparation(repoRoot, pipelineRoot, observers);
  const protectedRoots = [repoRoot, pipelineRoot, ...observers.map(({ root }) => root)];
  const controlRoot = assertControlRoot(options.controlDir, protectedRoots);
  const preparedPath = assertSafeControlPath(options.preparedPath, controlRoot, "prepared input");
  const returnPath = assertSafeControlPath(options.returnPath, controlRoot, "host return input");
  const dispatchStatePath = assertSafeControlPath(options.dispatchStatePath, controlRoot, "dispatch state");
  const receiptPath = assertSafeControlPath(options.receiptPath, controlRoot, "receipt output");
  const consumePath = assertSafeControlPath(`${dispatchStatePath}.consumed`, controlRoot, "dispatch consumption marker");
  const completePath = assertSafeControlPath(`${dispatchStatePath}.complete`, controlRoot, "dispatch completion marker");
  const pendingPath = assertSafeControlPath(`${dispatchStatePath}.receipt.pending`, controlRoot, "pending receipt");
  const controlPaths = [preparedPath, returnPath, dispatchStatePath, receiptPath, consumePath, completePath, pendingPath];
  if (new Set(controlPaths).size !== controlPaths.length) fail("finalize control paths must be pairwise distinct");
  const preparedRecord = readJsonBounded(preparedPath);
  const prepared = preparedRecord.value;
  validatePrepared(prepared);
  if (realpathSync(pipelineRoot) !== realpathSync(prepared.sources.rulesetRoot)) fail("finalize pipeline root differs from prepare");
  if (gitText(pipelineRoot, ["rev-parse", "HEAD"]) !== prepared.bindings.rulesetCheckoutSha) fail("ruleset checkout changed after prepare");
  assertRepositoryClean(pipelineRoot, "ruleset");
  if (executionBindings(pipelineRoot).sha256 !== prepared.bindings.executionSetSha256) fail("executing component binding changed after prepare");
  const dispatchState = readJsonBounded(dispatchStatePath).value;
  validateDispatchState(dispatchState, preparedRecord, controlRoot, protectedRootPathMap(repoRoot, pipelineRoot, observers));
  const recovered = recoverReceiptTransaction({
    controlRoot, consumePath, completePath, pendingPath, receiptPath, prepared, dispatchState, cleanup: options.cleanup,
  });
  if (recovered) return recovered;
  if (existsSync(receiptPath)) fail("receipt output already exists before dispatch consumption");
  if (realpathSync(repoRoot) === realpathSync(prepared.review.root)) fail("review checkout must be separate from candidate source");
  const hostReturnRecord = readJsonBounded(returnPath);
  const validated = validateHostReturn(prepared, preparedRecord.sha256, hostReturnRecord.value);

  const generatedPaths = [...prepared.request.evidence_paths, prepared.review.diffReferencePath];
  assertDisposableCheckout(prepared.review.root, prepared.review.commit, generatedPaths);
  validateReviewCommitSet(prepared.review.root, prepared.review);
  const referenceNow = artifactBindings(prepared.review.root, pipelineRoot, prepared.request);
  if (sha256(canonicalJson(referenceNow)) !== prepared.bindings.referenceSetSha256) fail("reference set drift after review");
  const reviewAfter = captureRepositoryFingerprint(prepared.review.root, referenceNow.filter(({ source }) => source === "review"));
  const after = protectedFingerprintMap(repoRoot, pipelineRoot, observers);
  const reviewMutation = reviewAfter.sha256 !== prepared.bindings.reviewFingerprintSha256;
  const protectedMutation = JSON.stringify(after) !== JSON.stringify(prepared.bindings.protectedBefore);
  if (reviewMutation || protectedMutation) fail("repository mutation observed during normal Critic run");
  const sanitizedVerdict = sanitizeVerdictForReceipt(validated.result.verdict, prepared.review.root);

  const receipt = {
    schema: "pipeline.codex-critic-host-receipt.v1",
    taskId: prepared.request.task_id,
    dispatchId: prepared.dispatchId,
    candidate: { base: prepared.review.base, commit: prepared.review.commit, tree: prepared.review.tree },
    route: {
      duty: prepared.route.duty,
      runner: prepared.route.runner,
      alias: prepared.route.alias,
      requestedModel: prepared.route.model,
      requestedEffort: prepared.route.effort,
      coordinatorConfirmed: true,
      providerAttested: false,
    },
    liveness: {
      agentIdHash: sha256(validated.execution.agent_id),
      taskName: validated.execution.task_name,
      completedElapsedMs: validated.execution.completed_elapsed_ms,
      recoveryCount: validated.execution.recovery_count,
      evidenceEvents: validated.execution.evidence_events.map(({ elapsed_ms, evidence_sha256 }) => ({ elapsedMs: elapsed_ms, evidenceSha256: evidence_sha256 })),
    },
    bindings: {
      preparedSha256: preparedRecord.sha256,
      requestSha256: prepared.bindings.requestSha256,
      referenceSetSha256: prepared.bindings.referenceSetSha256,
      resultSha256: sha256(canonicalJson(validated.result)),
      reviewFingerprintBefore: prepared.bindings.reviewFingerprintSha256,
      reviewFingerprintAfter: reviewAfter.sha256,
      roleContractSha256: prepared.bindings.roleContractSha256,
      promptContractSha256: prepared.bindings.promptContractSha256,
      verdictSchemaSha256: prepared.bindings.verdictSchemaSha256,
      hostReturnSchemaSha256: prepared.bindings.hostReturnSchemaSha256,
      executionSetSha256: prepared.bindings.executionSetSha256,
      routingProvenance: prepared.bindings.routingProvenance,
    },
    state: { before: prepared.bindings.protectedBefore, after, mutationObserved: false },
    assurance: ASSURANCE,
    residualRisks: [...RESIDUAL_RISKS],
    ...(prepared.request.normal_lane_authorization ? {
      normalLaneAuthorization: {
        kind: prepared.request.normal_lane_authorization.kind,
        authority: prepared.request.normal_lane_authorization.authority,
        riskId: prepared.request.normal_lane_authorization.risk_id,
        scope: prepared.request.normal_lane_authorization.scope,
        evidenceSha256: prepared.request.normal_lane_authorization.evidence_sha256,
        candidateCommit: prepared.request.normal_lane_authorization.candidate_commit,
      },
    } : {}),
    verdict: sanitizedVerdict,
    reviewPass: validated.reviewPass,
  };
  assertSchema(receipt, RECEIPT_SCHEMA_PATH, "receipt");
  validateReceiptSemantics(receipt, prepared, sanitizedVerdict);
  const published = completeReceiptTransaction({
    controlRoot, consumePath, completePath, pendingPath, receiptPath, receipt, prepared, dispatchState, cleanup: options.cleanup,
  });
  return {
    ok: true,
    receiptPath,
    receiptSha256: published.receiptSha256,
    reviewPass: validated.reviewPass,
    recovered: false,
    cleanupComplete: published.cleanupComplete,
  };
}

export function parseCliArgs(argv) {
  const command = argv[0];
  if (!new Set(["prepare", "finalize"]).has(command)) fail("first argument must be prepare or finalize");
  const values = { command, observers: [], cleanup: false };
  const takesValue = new Set(["--repo", "--pipeline-root", "--control-dir", "--dispatch-state", "--request", "--prepared", "--review-dir", "--return", "--receipt", "--observer"]);
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--cleanup") { values.cleanup = true; continue; }
    if (!takesValue.has(flag) || index + 1 >= argv.length) fail(`unknown or incomplete argument: ${flag}`);
    const value = argv[++index];
    if (flag === "--observer") values.observers.push(value);
    else values[flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  const required = command === "prepare"
    ? ["repo", "pipelineRoot", "controlDir", "dispatchState", "request", "prepared", "reviewDir"]
    : ["repo", "pipelineRoot", "controlDir", "dispatchState", "prepared", "return", "receipt"];
  for (const key of required) if (!values[key]) fail(`missing required argument: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  return values;
}

async function main() {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const observers = parseObserverArgs(args.observers);
    const result = args.command === "prepare"
      ? prepareNativeCritic({
          repoRoot: args.repo,
          pipelineRoot: args.pipelineRoot,
          controlDir: args.controlDir,
          dispatchStatePath: args.dispatchState,
          requestPath: args.request,
          preparedPath: args.prepared,
          reviewRoot: args.reviewDir,
          observers,
        })
      : finalizeNativeCritic({
          repoRoot: args.repo,
          pipelineRoot: args.pipelineRoot,
          controlDir: args.controlDir,
          dispatchStatePath: args.dispatchState,
          preparedPath: args.prepared,
          returnPath: args.return,
          receiptPath: args.receipt,
          observers,
          cleanup: args.cleanup,
        });
    process.stdout.write(canonicalJson(result));
  } catch (error) {
    process.stderr.write(`codex-critic-host: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
