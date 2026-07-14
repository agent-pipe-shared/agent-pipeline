/**
 * Profile-bound, coordinator-owned Codex Critic isolation adapter.
 *
 * The coordinator proves one exact named permission profile with direct
 * synthetic probes, then sends the complete Git-object review bundle to a
 * tool-less Critic over stdin. Public evidence contains hashes/categories only.
 */
import { spawn as nodeSpawn, execFileSync as nodeExecFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA = path.join(SCRIPT_DIR, "critic-verdict.schema.json");
const MAX_STREAM_BYTES = 256 * 1024;
const MAX_RESULT_BYTES = 64 * 1024;
const MAX_ARTIFACT_BYTES = 512 * 1024;
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const DENIED_ENV = /(?:token|secret|credential|password|auth|cookie|proxy|github|gitlab|git_|ci$|aws|azure|google|npm|yarn|pnpm|registry|remote|origin|ssh|http)/iu;
const SAFE_ENV = new Set(["PATH", "HOME", "CODEX_HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "SYSTEMROOT", "WINDIR", "COMSPEC", "USERPROFILE"]);
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;
const SAFE_PROFILE_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const BROAD_READ_ROOTS = new Set(["/home", "/mnt", "/opt", "/tmp", "/usr", "/var", os.homedir(), path.dirname(os.homedir())].map(normalizedPath));

export const CODEX_CRITIC_POLICY = Object.freeze({
  schema: "pipeline.codex-critic-profile-bound.v1",
  adapter: "codex-critic-profile-bound.v1",
  model: "gpt-5.6-sol",
  effort: "max",
  approval: "never",
  webSearch: "disabled",
  permissionProfile: "pipeline-critic",
  requiredVersion: "codex-cli 0.144.4",
  // Historical probe/control modules still read this field. The new acceptance
  // invocation never consumes it and rejects every --sandbox argument.
  sandbox: "read-only",
  leaseMs: 120_000,
  sourceReference: Object.freeze({
    tag: "rust-v0.144.4",
    commit: "8c68d4c87dc54d38861f5114e920c3de2efa5876",
    profileSource: "codex-rs/cli/src/debug_sandbox.rs",
    linuxSandboxSource: "codex-rs/linux-sandbox/src/linux_run_main.rs",
  }),
});

export const CODEX_CRITIC_REVIEW_CONTRACT = Object.freeze({
  schema: "pipeline.codex-critic-review-contract.v1",
  scope: "exact five-artifact profile-bound isolation candidate",
  requirements: Object.freeze([
    "named profile starts root-deny, permits only minimal runtime, exact fixture and exact pinned runtime release reads, grants no writes, and disables command network",
    "profile-bound invocation is gpt-5.6-sol/max, approval never, ephemeral, strict, user config/rules ignored, web disabled, shell environment inherit none, and contains no legacy --sandbox",
    "fixture and stdin bundle contain all five exact Git-object artifacts with complete bounded UTF-8 content and commit/tree/blob/hash binding",
    "preflight is direct, categorical, lease-bounded, and proves fixture read, synthetic external read denial, fixture write denial, unchanged canaries, and cleanup",
    "JSONL is closed-allowlist and tool-free; result is schema-valid, replay-bound, clean pass=true, and every failure is fail-closed",
    "public evidence contains only hashes, categories and bounded process facts, without prompt, stream, raw verdict, absolute paths, credentials, or private coordinates",
  ]),
});

export const CODEX_CRITIC_ARTIFACTS = Object.freeze([
  "plugins/pipeline-core/scripts/codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/codex-critic-isolation.test.mjs",
  "plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json",
  "harness/scripts/verify.mjs",
]);

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function isFullSha(value) { return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value); }
function assertAbsolute(value, label) { if (typeof value !== "string" || !path.isAbsolute(value)) fail(`${label} must be absolute`); }
function assertSafeRelative(value, label) { if (typeof value !== "string" || !SAFE_RELATIVE.test(value)) fail(`${label} must be a normalized relative path`); }
function tomlString(value) { return JSON.stringify(value); }
function normalizedPath(value) { return path.resolve(value); }
function pathsOverlap(left, right) {
  const a = normalizedPath(left); const b = normalizedPath(right);
  return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function canonical(value) { return `${JSON.stringify(canonicalize(value))}\n`; }
function invocationHash(command, args) { return sha256(canonical({ command, args })); }
function reviewContractHash() { return sha256(canonical(CODEX_CRITIC_REVIEW_CONTRACT)); }

// Kept inside this exact reviewed artifact so acceptance never executes an
// unbound worktree validator dependency. It intentionally implements only the
// schema keywords used by critic-verdict.schema.json and the bound wrapper.
function jsonType(value) { return value === null ? "null" : Array.isArray(value) ? "array" : typeof value; }
function validateNode(value, schema, at, errors) {
  const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type && !expected.includes(jsonType(value))) { errors.push(`${at}: invalid type`); return; }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: value outside enum`);
  if (schema.type === "object") {
    const object = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    for (const required of schema.required ?? []) if (!Object.hasOwn(object, required)) errors.push(`${at}: missing ${required}`);
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(object, key)) validateNode(object[key], childSchema, `${at}.${key}`, errors);
    const allowed = new Set(Object.keys(schema.properties ?? {}));
    for (const key of Object.keys(object)) {
      if (allowed.has(key)) continue;
      if (schema.additionalProperties === false) errors.push(`${at}: unexpected ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") validateNode(object[key], schema.additionalProperties, `${at}.${key}`, errors);
    }
  }
  if (schema.type === "array" && schema.items) for (const [index, item] of (Array.isArray(value) ? value : []).entries()) validateNode(item, schema.items, `${at}[${index}]`, errors);
}
function validateAgainstBoundSchema(value, schema) { const errors = []; validateNode(value, schema, "$", errors); return Object.freeze({ valid: errors.length === 0, errors }); }

export function sanitizeEnvironment(env = process.env) {
  const clean = {};
  for (const [key, value] of Object.entries(env)) {
    if (!SAFE_ENV.has(key) || DENIED_ENV.test(key) || typeof value !== "string") continue;
    clean[key] = value;
  }
  if (!clean.PATH) fail("minimal Codex environment requires PATH");
  return Object.freeze(clean);
}

function filesystemInline(entries) {
  return `{${entries.map((entry) => `${tomlString(entry.path)}=${tomlString(entry.access)}`).join(",")}}`;
}

export function buildPermissionProfile({ fixtureRoot, runtimeRoot, profileId = CODEX_CRITIC_POLICY.permissionProfile } = {}) {
  assertAbsolute(fixtureRoot, "fixtureRoot");
  assertAbsolute(runtimeRoot, "runtimeRoot");
  if (!SAFE_PROFILE_ID.test(profileId)) fail("permission profile id is invalid");
  const fixture = normalizedPath(fixtureRoot);
  const runtime = normalizedPath(runtimeRoot);
  if ([fixture, runtime].some((entry) => entry === path.parse(entry).root)) fail("permission profile cannot reopen a filesystem root");
  if ([fixture, runtime].some((entry) => BROAD_READ_ROOTS.has(entry))) fail("permission profile cannot reopen a broad or home read root");
  if (pathsOverlap(fixture, runtime)) fail("fixture and runtime roots must be disjoint");
  const filesystem = Object.freeze([
    Object.freeze({ path: ":root", access: "deny" }),
    Object.freeze({ path: ":minimal", access: "read" }),
    ...[fixture, runtime].sort().map((entry) => Object.freeze({ path: entry, access: "read" })),
  ]);
  const normalized = Object.freeze({
    schema: "pipeline.codex-permission-profile.v1",
    id: profileId,
    roots: Object.freeze({ fixture, runtime }),
    filesystem,
    network: Object.freeze({ enabled: false }),
  });
  const config = Object.freeze([
    `default_permissions=${tomlString(profileId)}`,
    `permissions.${profileId}.filesystem=${filesystemInline(filesystem)}`,
    `permissions.${profileId}.network.enabled=false`,
  ]);
  return Object.freeze({ id: profileId, normalized, hash: sha256(canonical(normalized)), config });
}

function assertPermissionProfile(profile) {
  if (!profile || !SAFE_PROFILE_ID.test(profile.id ?? "") || !(profile.id === CODEX_CRITIC_POLICY.permissionProfile || profile.id.startsWith(`${CODEX_CRITIC_POLICY.permissionProfile}-`)) || profile.normalized?.id !== profile.id || !Array.isArray(profile.config) || !/^[0-9a-f]{64}$/u.test(profile.hash ?? "")) fail("verified permission profile is required");
  const entries = profile.normalized?.filesystem;
  if (!Array.isArray(entries) || entries[0]?.path !== ":root" || entries[0]?.access !== "deny") fail("permission profile must start with root deny");
  const roots = profile.normalized?.roots;
  if (!roots || typeof roots.fixture !== "string" || typeof roots.runtime !== "string" || pathsOverlap(roots.fixture, roots.runtime)) fail("permission profile read roots are invalid");
  const expectedEntries = [
    { path: ":root", access: "deny" },
    { path: ":minimal", access: "read" },
    ...[roots.fixture, roots.runtime].sort().map((entry) => ({ path: entry, access: "read" })),
  ];
  if (canonical(entries) !== canonical(expectedEntries)) fail("permission profile contains missing, extra, broad, or writable filesystem entries");
  if (profile.normalized?.network?.enabled !== false) fail("permission profile command network must be disabled");
  const expectedConfig = [
    `default_permissions=${tomlString(profile.id)}`,
    `permissions.${profile.id}.filesystem=${filesystemInline(expectedEntries)}`,
    `permissions.${profile.id}.network.enabled=false`,
  ];
  if (canonical(profile.config) !== canonical(expectedConfig) || profile.hash !== sha256(canonical(profile.normalized))) fail("permission profile configuration or hash drifted");
}

function profileConfigArgs(profile) {
  assertPermissionProfile(profile);
  return profile.config.flatMap((entry) => ["-c", entry]);
}

export function buildProfileBoundCodexCriticInvocation({ fixtureRoot, schemaPath, resultPath, permissionProfile, model = CODEX_CRITIC_POLICY.model, effort = CODEX_CRITIC_POLICY.effort, codexBinary, env = process.env } = {}) {
  assertAbsolute(fixtureRoot, "fixtureRoot");
  assertAbsolute(schemaPath, "schemaPath");
  assertAbsolute(resultPath, "resultPath");
  assertAbsolute(codexBinary, "codexBinary");
  assertPermissionProfile(permissionProfile);
  if (model !== CODEX_CRITIC_POLICY.model || effort !== CODEX_CRITIC_POLICY.effort) fail("Codex Critic model/effort binding is fixed to Sol/max");
  const args = [
    "exec", "--ignore-user-config", "--ignore-rules", "--strict-config", "--ephemeral",
    "--model", model,
    "-c", `model_reasoning_effort=${tomlString(effort)}`,
    "-c", `approval_policy=${tomlString(CODEX_CRITIC_POLICY.approval)}`,
    "-c", `web_search=${tomlString(CODEX_CRITIC_POLICY.webSearch)}`,
    "-c", "shell_environment_policy.inherit=\"none\"",
    ...profileConfigArgs(permissionProfile),
    "--cd", fixtureRoot, "--skip-git-repo-check",
    "--output-schema", schemaPath, "--output-last-message", resultPath,
    "--json", "-",
  ];
  if (args.includes("--sandbox")) fail("legacy --sandbox cannot be combined with a named permission profile");
  return Object.freeze({
    command: codexBinary,
    args: Object.freeze(args),
    options: Object.freeze({
      cwd: fixtureRoot,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      env: sanitizeEnvironment(env),
    }),
  });
}

/** Historical compatibility for already-evidenced, inactive probe/control runners. */
export function buildCodexCriticInvocation({ fixtureRoot, schemaPath, resultPath, model = CODEX_CRITIC_POLICY.model, effort = CODEX_CRITIC_POLICY.effort, codexBinary = "codex", env = process.env } = {}) {
  assertAbsolute(fixtureRoot, "fixtureRoot"); assertAbsolute(schemaPath, "schemaPath"); assertAbsolute(resultPath, "resultPath");
  if (model !== CODEX_CRITIC_POLICY.model || effort !== CODEX_CRITIC_POLICY.effort) fail("Codex Critic model/effort binding is fixed to Sol/max");
  return Object.freeze({
    command: codexBinary,
    args: Object.freeze([
      "exec", "--ignore-user-config", "--strict-config", "--ephemeral", "--model", model,
      "-c", `model_reasoning_effort=${tomlString(effort)}`, "-c", `approval_policy=${tomlString(CODEX_CRITIC_POLICY.approval)}`,
      "--sandbox", CODEX_CRITIC_POLICY.sandbox, "--cd", fixtureRoot, "--skip-git-repo-check",
      "--output-schema", schemaPath, "--output-last-message", resultPath, "--json", "-",
    ]),
    options: Object.freeze({ cwd: fixtureRoot, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"], env: sanitizeEnvironment(env) }),
  });
}

function git(repoRoot, args, execFileSync = nodeExecFileSync) {
  try { return execFileSync("git", args, { cwd: repoRoot, encoding: "buffer", stdio: ["ignore", "pipe", "pipe"], shell: false }); }
  catch (error) { fail(`exact Git-object read failed: ${error.stderr?.toString("utf8").trim() || error.message}`); }
}
function gitText(repoRoot, args, execFileSync) { return git(repoRoot, args, execFileSync).toString("utf8").trim(); }

export async function buildExactFixture({ repoRoot, candidateCommit, artifactPaths, fixtureParent = os.tmpdir(), execFileSync = nodeExecFileSync } = {}) {
  assertAbsolute(repoRoot, "repoRoot");
  if (!isFullSha(candidateCommit)) fail("candidateCommit must be a full SHA");
  if (!Array.isArray(artifactPaths) || artifactPaths.length === 0 || artifactPaths.length > 16) fail("artifactPaths must contain 1..16 paths");
  const unique = [...new Set(artifactPaths)];
  if (unique.length !== artifactPaths.length) fail("artifactPaths must be unique");
  unique.forEach((entry) => assertSafeRelative(entry, "artifact path"));
  const commit = gitText(repoRoot, ["rev-parse", `${candidateCommit}^{commit}`], execFileSync);
  if (commit !== candidateCommit) fail("candidate commit did not resolve exactly");
  const tree = gitText(repoRoot, ["rev-parse", `${candidateCommit}^{tree}`], execFileSync);
  const ancestry = gitText(repoRoot, ["rev-list", "--parents", "-n", "1", candidateCommit], execFileSync).split(/\s+/u);
  if (ancestry.length !== 2 || ancestry[0] !== candidateCommit || !isFullSha(ancestry[1])) fail("candidate must have exactly one bound parent");
  const parent = ancestry[1];
  const parentTree = gitText(repoRoot, ["rev-parse", `${parent}^{tree}`], execFileSync);
  const root = await mkdtemp(path.join(fixtureParent, "agent-pipeline-codex-critic-"));
  const artifacts = [];
  try {
    for (const relativePath of unique.sort()) {
      const record = git(repoRoot, ["ls-tree", candidateCommit, "--", relativePath], execFileSync).toString("utf8").trim();
      const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/u.exec(record);
      if (!match || match[3] !== relativePath) fail(`fixture artifact is missing, symlinked, non-regular, or ambiguous: ${relativePath}`);
      const bytes = git(repoRoot, ["cat-file", "blob", match[2]], execFileSync);
      if (bytes.length > MAX_ARTIFACT_BYTES) fail(`fixture artifact exceeds ${MAX_ARTIFACT_BYTES} bytes: ${relativePath}`);
      const destination = path.join(root, relativePath);
      if (!destination.startsWith(`${root}${path.sep}`)) fail("fixture path escaped root");
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { mode: 0o600 });
      const written = await readFile(destination);
      if (!written.equals(bytes)) fail(`fixture materialization mismatch: ${relativePath}`);
      artifacts.push(Object.freeze({ path: relativePath, mode: match[1], blob: match[2], bytes: bytes.length, sha256: sha256(bytes) }));
    }
    const nonce = randomBytes(16).toString("hex");
    const manifest = Object.freeze({ schema: "pipeline.codex-critic-fixture.v2", candidateCommit, tree, parent, parentTree, nonce, artifacts: Object.freeze(artifacts) });
    const manifestPath = path.join(root, "fixture-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    return Object.freeze({ root, manifestPath, manifest, manifestHash: sha256(await readFile(manifestPath)) });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function buildReviewBundle(fixture) {
  if (!fixture?.root || !fixture?.manifest || !fixture.manifestHash) fail("verified fixture is required");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const artifacts = [];
  let contentBytes = 0;
  for (const item of fixture.manifest.artifacts) {
    assertSafeRelative(item.path, "artifact path");
    const file = path.join(fixture.root, item.path);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) fail(`review artifact is not a regular file: ${item.path}`);
    const bytes = await readFile(file);
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) fail(`review artifact drifted after materialization: ${item.path}`);
    let content;
    try { content = decoder.decode(bytes); } catch { fail(`review artifact is not valid UTF-8: ${item.path}`); }
    contentBytes += bytes.length;
    if (contentBytes > MAX_BUNDLE_BYTES) fail(`review bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
    artifacts.push(Object.freeze({ ...item, content }));
  }
  if (artifacts.length !== fixture.manifest.artifacts.length || artifacts.length === 0) fail("review bundle is incomplete");
  const value = Object.freeze({
    schema: "pipeline.codex-critic-review-bundle.v2",
    candidateCommit: fixture.manifest.candidateCommit,
    candidateTree: fixture.manifest.tree,
    candidateParent: fixture.manifest.parent,
    candidateParentTree: fixture.manifest.parentTree,
    fixtureManifestSha256: fixture.manifestHash,
    reviewContract: CODEX_CRITIC_REVIEW_CONTRACT,
    reviewContractSha256: reviewContractHash(),
    artifacts: Object.freeze(artifacts),
  });
  const serialized = canonical(value);
  if (Buffer.byteLength(serialized) > MAX_BUNDLE_BYTES) fail(`serialized review bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
  return Object.freeze({ value, serialized, hash: sha256(serialized), contentBytes });
}

async function directoryHash(root) {
  const rows = [];
  async function walk(relative = "") {
    const directory = path.join(root, relative);
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      const absolute = path.join(root, child);
      if (entry.isSymbolicLink() || !(entry.isDirectory() || entry.isFile())) fail("fixture contains a non-regular path");
      if (entry.isDirectory()) await walk(child);
      else { const bytes = await readFile(absolute); rows.push({ path: child.replaceAll("\\", "/"), sha256: sha256(bytes), bytes: bytes.length }); }
    }
  }
  await walk();
  return sha256(canonical(rows));
}

async function assertFixtureInventory(fixture) {
  const expected = [...fixture.manifest.artifacts.map((item) => item.path), "fixture-manifest.json"].sort();
  const actual = [];
  async function walk(relative = "") {
    for (const entry of await readdir(path.join(fixture.root, relative), { withFileTypes: true })) {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isSymbolicLink() || !(entry.isDirectory() || entry.isFile())) fail("fixture contains a non-regular path");
      if (entry.isDirectory()) await walk(child);
      else actual.push(child.replaceAll("\\", "/"));
    }
  }
  await walk(); actual.sort();
  if (canonical(actual) !== canonical(expected)) fail("fixture inventory contains missing or extra files");
  return sha256(canonical(actual));
}

function capture() { return { bytes: 0, totalBytes: 0, parts: [], overflow: false }; }
function appendBounded(target, chunk, maxBytes = MAX_STREAM_BYTES) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  target.totalBytes += bytes.length;
  if (target.bytes >= maxBytes) { target.overflow = true; return; }
  const slice = bytes.subarray(0, Math.max(0, maxBytes - target.bytes));
  target.bytes += slice.length;
  target.parts.push(slice);
  if (slice.length !== bytes.length) target.overflow = true;
}

export function localFailureDiagnostic(stdout, stderr) {
  const text = (value) => Buffer.concat(value.parts).toString("utf8");
  const tail = (value) => text(value).slice(-2_000);
  return Object.freeze({
    stdoutBytes: stdout.totalBytes,
    stderrBytes: stderr.totalBytes,
    stdoutSha256: sha256(text(stdout)),
    stderrSha256: sha256(text(stderr)),
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr),
  });
}

function groupAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0 || process.platform === "win32") return false;
  try { kill(-pid, 0); return true; } catch { return false; }
}
// This proves only that the detached process group we created is gone. A child
// that successfully escaped that PGID is outside the observable claim.
export async function ensureOwnedProcessGroupGone(pid, kill = process.kill) {
  if (process.platform === "win32" || !groupAlive(pid, kill)) return true;
  try { kill(-pid, "SIGTERM"); } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!groupAlive(pid, kill)) return true;
  try { kill(-pid, "SIGKILL"); } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
  return !groupAlive(pid, kill);
}

async function awaitChild(child, { leaseMs, onHeartbeat = () => {}, label }) {
  const stdout = capture(); const stderr = capture();
  child.stdout?.on("data", (chunk) => appendBounded(stdout, chunk));
  child.stderr?.on("data", (chunk) => appendBounded(stderr, chunk));
  const started = Date.now(); let timedOut = false;
  const terminal = await new Promise((resolve) => {
    let killTimer = null; let forceSettleTimer = null; let settled = false;
    const signal = (name) => {
      try {
        if (process.platform !== "win32" && Number.isInteger(child.pid) && child.pid > 0) process.kill(-child.pid, name);
        else child.kill?.(name);
      } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      signal("SIGTERM");
      killTimer = setTimeout(() => signal("SIGKILL"), 500);
      forceSettleTimer = setTimeout(() => settle({ code: null, signal: "SIGKILL", error: "lease-expired" }), 2_000);
    }, leaseMs);
    const heartbeat = setInterval(() => { try { onHeartbeat({ label, elapsedMs: Date.now() - started, stdoutBytes: stdout.totalBytes, stderrBytes: stderr.totalBytes }); } catch {} }, 5_000);
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(forceSettleTimer); clearInterval(heartbeat); resolve(value);
    };
    child.once("error", () => settle({ code: null, signal: null, error: "process-error" }));
    child.once("close", (code, signal) => settle({ code, signal, error: null }));
  });
  const ownedProcessGroupGone = await ensureOwnedProcessGroupGone(child.pid);
  return Object.freeze({ terminal, timedOut, ownedProcessGroupGone, stdout, stderr, diagnostics: localFailureDiagnostic(stdout, stderr) });
}

async function executable(candidate) { try { await access(candidate, constants.X_OK); return true; } catch { return false; } }
export async function resolveCodexBinary({ pathEnv = process.env.PATH, platform = process.platform } = {}) {
  if (typeof pathEnv !== "string" || !pathEnv) fail("PATH is required to resolve Codex");
  const names = platform === "win32" ? ["codex.exe", "codex.cmd", "codex"] : ["codex"];
  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) { const candidate = path.join(directory, name); if (await executable(candidate)) return realpath(candidate); }
  }
  fail("Codex binary is unavailable on PATH");
}

async function runtimeReleaseManifest(runtimeRoot) {
  const rows = [];
  async function walk(relative = "") {
    const directory = path.join(runtimeRoot, relative);
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      const absolute = path.join(runtimeRoot, child);
      const info = await lstat(absolute);
      const mode = info.mode & 0o777;
      if (info.isDirectory()) {
        rows.push({ path: child.replaceAll("\\", "/"), type: "directory", mode });
        await walk(child);
      } else if (info.isFile()) {
        const bytes = await readFile(absolute);
        rows.push({ path: child.replaceAll("\\", "/"), type: "file", mode, bytes: bytes.length, sha256: sha256(bytes) });
      } else if (info.isSymbolicLink()) {
        const target = await readlink(absolute);
        const resolvedTarget = path.resolve(path.dirname(absolute), target);
        if (!resolvedTarget.startsWith(`${runtimeRoot}${path.sep}`)) fail("Codex runtime release contains an escaping symlink");
        rows.push({ path: child.replaceAll("\\", "/"), type: "symlink", target });
      } else fail("Codex runtime release contains a non-regular entry");
    }
  }
  await walk();
  return Object.freeze({ entries: rows.length, sha256: sha256(canonical(rows)) });
}

export async function inspectCodexBinary({ codexBinary, execFileSync = nodeExecFileSync } = {}) {
  assertAbsolute(codexBinary, "codexBinary");
  const resolvedBinary = await realpath(codexBinary);
  if (resolvedBinary !== normalizedPath(codexBinary)) fail("Codex binary must be supplied as its exact realpath");
  const info = await stat(resolvedBinary);
  if (!info.isFile()) fail("Codex binary is not a regular file");
  let version;
  try { version = execFileSync(resolvedBinary, ["--version"], { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { fail("Codex binary version inspection failed"); }
  if (version !== CODEX_CRITIC_POLICY.requiredVersion) fail(`Codex binary version must be ${CODEX_CRITIC_POLICY.requiredVersion}`);
  const runtimeRoot = path.dirname(path.dirname(resolvedBinary));
  const releaseName = path.basename(runtimeRoot);
  if (path.basename(path.dirname(resolvedBinary)) !== "bin" || path.basename(path.dirname(runtimeRoot)) !== "releases" || !releaseName.startsWith("0.144.4-") || !resolvedBinary.startsWith(`${runtimeRoot}${path.sep}`)) fail("Codex runtime release root is not the pinned standalone layout");
  const runtimeManifest = await runtimeReleaseManifest(runtimeRoot);
  return Object.freeze({
    binarySha256: sha256(await readFile(resolvedBinary)),
    versionSha256: sha256(version),
    runtimeRoot,
    runtimeRootSha256: sha256(runtimeRoot),
    runtimeManifestSha256: runtimeManifest.sha256,
    runtimeEntries: runtimeManifest.entries,
  });
}

export function verifyProfileContract({ codexBinary, execFileSync = nodeExecFileSync } = {}) {
  assertAbsolute(codexBinary, "codexBinary");
  let sandboxHelp; let execHelp;
  try {
    sandboxHelp = execFileSync(codexBinary, ["sandbox", "--help"], { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] });
    execHelp = execFileSync(codexBinary, ["exec", "--help"], { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] });
  } catch { fail("Codex profile contract inspection failed"); }
  if (!/Run commands within a Codex-provided sandbox/u.test(sandboxHelp) || !/--permission-profile\s+<NAME>/u.test(sandboxHelp)) fail("Codex named permission profile sandbox contract is unavailable");
  for (const token of ["--ignore-user-config", "--ignore-rules", "--strict-config", "--ephemeral", "--json", "--output-schema", "--output-last-message"]) if (!execHelp.includes(token)) fail(`Codex exec contract is missing ${token}`);
  return Object.freeze({ contractSha256: sha256(canonical({ sandbox: "named-permission-profile", exec: "tool-free-jsonl", version: CODEX_CRITIC_POLICY.requiredVersion })) });
}

function sandboxInvocation({ codexBinary, permissionProfile, cwd, command, env }) {
  assertAbsolute(codexBinary, "codexBinary"); assertAbsolute(cwd, "cwd"); assertPermissionProfile(permissionProfile);
  const args = ["sandbox", ...profileConfigArgs(permissionProfile), "-P", permissionProfile.id, "--", ...command];
  return Object.freeze({ command: codexBinary, args: Object.freeze(args), options: Object.freeze({ cwd, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], env }) });
}

async function runProbeCommand({ invocation, leaseMs, spawn, onHeartbeat, label }) {
  let child;
  try { child = spawn(invocation.command, invocation.args, invocation.options); }
  catch { return Object.freeze({ ok: false, category: "spawn-failed", invocationSha256: invocationHash(invocation.command, invocation.args), diagnostics: null }); }
  const execution = await awaitChild(child, { leaseMs, onHeartbeat, label });
  return Object.freeze({
    ok: !execution.timedOut && execution.ownedProcessGroupGone && !execution.stdout.overflow && !execution.stderr.overflow,
    invocationSha256: invocationHash(invocation.command, invocation.args),
    process: Object.freeze({ exitCode: execution.terminal.code, signal: execution.terminal.signal, timedOut: execution.timedOut, ownedProcessGroupGone: execution.ownedProcessGroupGone, error: execution.terminal.error }),
    diagnostics: execution.diagnostics,
  });
}

async function hashedFile(file) { const bytes = await readFile(file); return Object.freeze({ sha256: sha256(bytes), bytes: bytes.length }); }
async function pathAbsent(file) { try { await lstat(file); return false; } catch (error) { if (error?.code === "ENOENT") return true; throw error; } }

export async function runPermissionProfilePreflight({ codexBinary, permissionProfile, fixtureRoot, externalParent, leaseMs = CODEX_CRITIC_POLICY.leaseMs, spawn = nodeSpawn, env = process.env, onHeartbeat = () => {} } = {}) {
  assertAbsolute(codexBinary, "codexBinary"); assertAbsolute(fixtureRoot, "fixtureRoot"); assertAbsolute(externalParent, "externalParent"); assertPermissionProfile(permissionProfile);
  const fixtureRealpath = await realpath(fixtureRoot);
  if (fixtureRealpath !== permissionProfile.normalized.roots.fixture) fail("preflight fixture drifted from the bound profile");
  const coordinator = await mkdtemp(path.join(externalParent, ".pipeline-codex-profile-external-"));
  const coordinatorRealpath = await realpath(coordinator);
  if ([permissionProfile.normalized.roots.fixture, permissionProfile.normalized.roots.runtime].some((entry) => pathsOverlap(entry, coordinatorRealpath))) {
    await rm(coordinator, { recursive: true, force: true });
    fail("preflight external sentinel overlaps a readable profile root");
  }
  const fixtureSentinel = path.join(fixtureRoot, "profile-read-sentinel.txt");
  const externalSentinel = path.join(coordinator, "external-read-sentinel.txt");
  const writeTarget = path.join(fixtureRoot, "forbidden-write-sentinel.txt");
  let configHome = null;
  const runs = {};
  try {
    configHome = await mkdtemp(path.join(os.tmpdir(), "pipeline-codex-profile-config-"));
    const cleanEnv = Object.freeze({ ...sanitizeEnvironment(env), CODEX_HOME: configHome });
    await writeFile(fixtureSentinel, "fixture-read-sentinel\n", { mode: 0o600 });
    await writeFile(externalSentinel, "external-read-sentinel\n", { mode: 0o600 });
    const before = Object.freeze({ fixture: await hashedFile(fixtureSentinel), external: await hashedFile(externalSentinel), writeAbsent: await pathAbsent(writeTarget) });
    const commands = [
      Object.freeze({ key: "fixtureRead", expect: 0, command: ["/bin/sh", "-c", 'actual=$(cat -- "$2") || exit 3; test "$actual" = "$1"', "pipeline-profile-preflight", "fixture-read-sentinel", fixtureSentinel] }),
      Object.freeze({ key: "externalReadDenied", expect: "nonzero", command: ["/bin/sh", "-c", 'cat -- "$1" >/dev/null 2>&1', "pipeline-profile-preflight", externalSentinel] }),
      Object.freeze({ key: "writeDenied", expect: "nonzero", command: ["/bin/sh", "-c", 'printf "forbidden\\n" > "$1"', "pipeline-profile-preflight", writeTarget] }),
    ];
    for (const probe of commands) {
      const invocation = sandboxInvocation({ codexBinary, permissionProfile, cwd: fixtureRoot, command: probe.command, env: cleanEnv });
      const result = await runProbeCommand({ invocation, leaseMs, spawn, onHeartbeat, label: `profile-preflight-${probe.key}` });
      const exitMatches = probe.expect === "nonzero" ? Number.isInteger(result.process?.exitCode) && result.process.exitCode !== 0 : result.process?.exitCode === probe.expect;
      runs[probe.key] = Object.freeze({ ...result, ok: result.ok && exitMatches });
      if (!runs[probe.key].ok) break;
    }
    const after = Object.freeze({ fixture: await hashedFile(fixtureSentinel), external: await hashedFile(externalSentinel), writeAbsent: await pathAbsent(writeTarget) });
    const canaries = Object.freeze({
      fixtureUnchanged: before.fixture.sha256 === after.fixture.sha256 && before.fixture.bytes === after.fixture.bytes,
      externalUnchanged: before.external.sha256 === after.external.sha256 && before.external.bytes === after.external.bytes,
      writeTargetAbsent: before.writeAbsent && after.writeAbsent,
    });
    const ok = commands.every((probe) => runs[probe.key]?.ok === true) && Object.values(canaries).every(Boolean);
    const canaryEvidence = Object.freeze({
      fixture: Object.freeze({ before: before.fixture, after: after.fixture }),
      external: Object.freeze({ before: before.external, after: after.external }),
      writeTarget: Object.freeze({ absentBefore: before.writeAbsent, absentAfter: after.writeAbsent }),
    });
    return Object.freeze({ ok, category: ok ? "pass" : "profile-preflight-failed", profileSha256: permissionProfile.hash, probes: Object.freeze(Object.fromEntries(commands.map((probe) => [probe.key, runs[probe.key] ? Object.freeze({ invocationSha256: runs[probe.key].invocationSha256, process: runs[probe.key].process }) : null]))), canaries, canaryEvidence, cleanup: true, diagnostics: Object.freeze(Object.fromEntries(commands.map((probe) => [probe.key, runs[probe.key]?.diagnostics ?? null]))) });
  } finally {
    await rm(fixtureSentinel, { force: true }); await rm(writeTarget, { force: true }); await rm(coordinator, { recursive: true, force: true });
    if (configHome) await rm(configHome, { recursive: true, force: true });
  }
}

export function criticPrompt({ bundle, taskId, nonce, candidateCommit, candidateTree, candidateParent, candidateParentTree }) {
  if (!bundle?.serialized || !/^[0-9a-f]{64}$/u.test(bundle.hash ?? "")) fail("complete review bundle is required");
  if (typeof taskId !== "string" || !taskId || !/^[0-9a-f]{32}$/u.test(nonce ?? "") || ![candidateCommit, candidateTree, candidateParent, candidateParentTree].every(isFullSha)) fail("bound critic task identity is required");
  return [
    "You are an independent tool-less Codex Critic.",
    "Use only the complete public review bundle below. Do not use files, shell, commands, search, MCP, web, apps, browsers, plans, or any other tool.",
    "Review the five artifacts against the profile-bound isolation contract. Return only the bound wrapper JSON required by the output schema. Missing or ambiguous evidence is a blocker and pass=false.",
    `TASK_ID=${taskId}`,
    `NONCE=${nonce}`,
    `CANDIDATE_COMMIT=${candidateCommit}`,
    `CANDIDATE_TREE=${candidateTree}`,
    `CANDIDATE_PARENT=${candidateParent}`,
    `CANDIDATE_PARENT_TREE=${candidateParentTree}`,
    `REVIEW_BUNDLE_SHA256=${bundle.hash}`,
    `REVIEW_CONTRACT_SHA256=${reviewContractHash()}`,
    bundle.serialized.trimEnd(),
  ].join("\n");
}

export function inspectToolFreeJsonl(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");
  const lines = bytes.toString("utf8").split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) return Object.freeze({ ok: false, category: "empty-stream", events: 0 });
  let state = "start"; let finalMessages = 0; let finalMessageText = null; let threadCompleted = false;
  for (const line of lines) {
    let event; try { event = JSON.parse(line); } catch { return Object.freeze({ ok: false, category: "malformed-jsonl", events: lines.length }); }
    if (state === "start" && event?.type === "thread.started") { state = "thread"; continue; }
    if (state === "thread" && event?.type === "turn.started") { state = "turn"; continue; }
    if (state === "turn" && (event?.type === "item.started" || event?.type === "item.completed") && ["reasoning", "agent_message"].includes(event?.item?.type)) {
      if (event.type === "item.completed" && event.item.type === "agent_message") {
        finalMessages += 1;
        if (typeof event.item.text !== "string" || !event.item.text.trim()) return Object.freeze({ ok: false, category: "invalid-agent-message", events: lines.length });
        finalMessageText = event.item.text;
      }
      continue;
    }
    if (state === "turn" && event?.type === "turn.completed") { state = "terminal"; continue; }
    if (state === "terminal" && !threadCompleted && event?.type === "thread.completed") { threadCompleted = true; continue; }
    return Object.freeze({ ok: false, category: "tool-or-unknown-event", events: lines.length });
  }
  const ok = state === "terminal" && finalMessages === 1;
  return Object.freeze({ ok, category: ok ? "pass" : "invalid-lifecycle", events: lines.length, finalMessageText });
}

export async function runCodexCritic({ fixture, reviewBundle, permissionProfile, codexBinary, schemaPath = DEFAULT_SCHEMA, leaseMs = CODEX_CRITIC_POLICY.leaseMs, spawn = nodeSpawn, env = process.env, onHeartbeat = () => {} } = {}) {
  if (!fixture?.root || !fixture?.manifest?.nonce) fail("verified fixture is required");
  assertPermissionProfile(permissionProfile); assertAbsolute(codexBinary, "codexBinary"); assertAbsolute(schemaPath, "schemaPath");
  if (!reviewBundle?.serialized || reviewBundle.value?.artifacts?.length !== fixture.manifest.artifacts.length) fail("complete review bundle is required");
  await assertFixtureInventory(fixture);
  const coordinator = await mkdtemp(path.join(os.tmpdir(), "agent-pipeline-profile-critic-"));
  try {
  const resultPath = path.join(coordinator, `${fixture.manifest.nonce}.result.json`);
  const boundSchemaPath = path.join(coordinator, `${fixture.manifest.nonce}.schema.json`);
  const taskId = "phase2-profile-bound-isolation";
  const baseSchema = JSON.parse(await readFile(schemaPath, "utf8"));
  const boundSchema = {
    type: "object",
    required: ["task_id", "nonce", "candidate_commit", "candidate_tree", "candidate_parent", "candidate_parent_tree", "bundle_sha256", "review_contract_sha256", "verdict"],
    additionalProperties: false,
    properties: {
      task_id: { type: "string" }, nonce: { type: "string" }, candidate_commit: { type: "string" }, candidate_tree: { type: "string" }, candidate_parent: { type: "string" }, candidate_parent_tree: { type: "string" }, bundle_sha256: { type: "string" }, review_contract_sha256: { type: "string" }, verdict: baseSchema,
    },
  };
  await writeFile(boundSchemaPath, `${JSON.stringify(boundSchema, null, 2)}\n`, { mode: 0o600 });
  const beforeFixture = await directoryHash(fixture.root);
  const invocation = buildProfileBoundCodexCriticInvocation({ fixtureRoot: fixture.root, schemaPath: boundSchemaPath, resultPath, permissionProfile, codexBinary, env });
  let child;
  try { child = spawn(invocation.command, invocation.args, invocation.options); }
  catch {
    return Object.freeze({ ok: false, category: "spawn-failed", invocationSha256: invocationHash(invocation.command, invocation.args), diagnostics: null });
  }
  child.stdin?.on("error", () => {});
  child.stdin?.end(`${criticPrompt({ bundle: reviewBundle, taskId, nonce: fixture.manifest.nonce, candidateCommit: fixture.manifest.candidateCommit, candidateTree: fixture.manifest.tree, candidateParent: fixture.manifest.parent, candidateParentTree: fixture.manifest.parentTree })}\n`, "utf8");
  const execution = await awaitChild(child, { leaseMs, onHeartbeat, label: "profile-bound-tool-less-critic" });
  const resultBytes = await readFile(resultPath).catch(() => null);
  const afterFixture = await directoryHash(fixture.root);
  const stream = execution.stdout.overflow ? Object.freeze({ ok: false, category: "oversized-stream", events: 0 }) : inspectToolFreeJsonl(Buffer.concat(execution.stdout.parts));
  let verdict = null; let verdictError = null;
  try {
    if (!resultBytes || resultBytes.length > MAX_RESULT_BYTES) fail("missing or oversized critic result");
    verdict = JSON.parse(resultBytes.toString("utf8"));
    const checked = validateAgainstBoundSchema(verdict, boundSchema);
    if (!checked.valid) fail(`invalid critic verdict: ${checked.errors.join("; ")}`);
    if (verdict.task_id !== taskId || verdict.nonce !== fixture.manifest.nonce || verdict.candidate_commit !== fixture.manifest.candidateCommit || verdict.candidate_tree !== fixture.manifest.tree || verdict.candidate_parent !== fixture.manifest.parent || verdict.candidate_parent_tree !== fixture.manifest.parentTree || verdict.bundle_sha256 !== reviewBundle.hash || verdict.review_contract_sha256 !== reviewContractHash()) fail("critic result binding mismatch");
    let streamVerdict;
    try { streamVerdict = JSON.parse(stream.finalMessageText); } catch { fail("final agent message is not the bound result JSON"); }
    if (canonical(streamVerdict) !== canonical(verdict)) fail("final agent message and result sink differ");
    if (verdict.verdict.pass !== true || verdict.verdict.findings.some((item) => ["blocker", "major"].includes(item.severity))) fail("critic verdict did not pass cleanly");
  } catch (error) { verdictError = error.message; }
  const fixtureUnchanged = beforeFixture === afterFixture;
  const stdoutBytes = Buffer.concat(execution.stdout.parts);
  const stderrBytes = Buffer.concat(execution.stderr.parts);
  const ok = execution.terminal.code === 0 && !execution.timedOut && execution.ownedProcessGroupGone && !execution.stderr.overflow && stream.ok && verdictError === null && fixtureUnchanged;
  const result = Object.freeze({
    ok,
    category: ok ? "pass" : execution.timedOut ? "lease-timeout" : !stream.ok ? stream.category : verdictError ? "invalid-verdict" : "process-or-fixture-failed",
    invocationSha256: invocationHash(invocation.command, invocation.args),
    bundleSha256: reviewBundle.hash,
    profileSha256: permissionProfile.hash,
    verdictSha256: resultBytes ? sha256(resultBytes) : null,
    process: Object.freeze({ exitCode: execution.terminal.code, signal: execution.terminal.signal, timedOut: execution.timedOut, ownedProcessGroupGone: execution.ownedProcessGroupGone, error: execution.terminal.error }),
    stream: Object.freeze({ toolFree: stream.ok, category: stream.category, events: stream.events, bytes: execution.stdout.totalBytes, sha256: sha256(stdoutBytes), overflow: execution.stdout.overflow }),
    stderr: Object.freeze({ bytes: execution.stderr.totalBytes, sha256: sha256(stderrBytes), overflow: execution.stderr.overflow }),
    fixtureUnchanged,
    cleanup: true,
    diagnostics: execution.diagnostics,
  });
  return result;
  } finally {
    await rm(coordinator, { recursive: true, force: true });
  }
}

function publicRun(run) { if (!run) return null; const { diagnostics, ...safe } = run; return safe; }

function binaryBinding(value) {
  return Object.freeze({
    binarySha256: value.binarySha256,
    versionSha256: value.versionSha256,
    runtimeRootSha256: value.runtimeRootSha256,
    runtimeManifestSha256: value.runtimeManifestSha256,
    runtimeEntries: value.runtimeEntries,
  });
}
function sameBinaryBinding(left, right) { return canonical(binaryBinding(left)) === canonical(binaryBinding(right)); }

export async function runProfileBoundIsolation({ repoRoot, candidateCommit, artifactPaths, schemaPath, fixtureParent = os.tmpdir(), externalParent = path.dirname(repoRoot ?? ""), pathEnv = process.env.PATH, spawn = nodeSpawn, execFileSync = nodeExecFileSync, env = process.env, onHeartbeat = () => {}, resolvedBinary = null, binaryInspection = null, contractInspection = null, inspectBinary = inspectCodexBinary } = {}) {
  assertAbsolute(repoRoot, "repoRoot");
  if (!isFullSha(candidateCommit)) fail("candidateCommit must be a full SHA");
  if (!Array.isArray(artifactPaths) || artifactPaths.length !== CODEX_CRITIC_ARTIFACTS.length || artifactPaths.some((entry, index) => entry !== CODEX_CRITIC_ARTIFACTS[index])) fail("profile-bound acceptance requires the exact five public artifacts");
  const head = gitText(repoRoot, ["rev-parse", "HEAD"], execFileSync);
  if (head !== candidateCommit) fail("candidateCommit must equal the current Shared HEAD");
  const dirty = git(repoRoot, ["status", "--porcelain=v1", "--", ...artifactPaths], execFileSync).toString("utf8").trim();
  if (dirty) fail("profile-bound acceptance artifacts must be clean at candidate HEAD");
  const codexBinary = resolvedBinary ?? await resolveCodexBinary({ pathEnv });
  assertAbsolute(codexBinary, "codexBinary");
  const binary = binaryInspection ?? await inspectBinary({ codexBinary, execFileSync });
  const contract = contractInspection ?? verifyProfileContract({ codexBinary, execFileSync });
  const fixture = await buildExactFixture({ repoRoot, candidateCommit, artifactPaths, fixtureParent, execFileSync });
  try {
    const profile = buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: binary.runtimeRoot, profileId: `${CODEX_CRITIC_POLICY.permissionProfile}-${fixture.manifest.nonce.slice(0, 12)}` });
    const reviewBundle = await buildReviewBundle(fixture);
    const fixtureInventorySha256 = await assertFixtureInventory(fixture);
    const schemaInFixture = schemaPath ?? path.join(fixture.root, "plugins", "pipeline-core", "scripts", "critic-verdict.schema.json");
    const preflight = await runPermissionProfilePreflight({ codexBinary, permissionProfile: profile, fixtureRoot: fixture.root, externalParent, spawn, env, onHeartbeat });
    const inventoryAfterPreflight = preflight.ok ? await assertFixtureInventory(fixture) : null;
    const beforeCriticBinary = preflight.ok ? await inspectBinary({ codexBinary, execFileSync }) : null;
    const bindingStableBeforeCritic = preflight.ok && sameBinaryBinding(binary, beforeCriticBinary);
    const critic = bindingStableBeforeCritic && inventoryAfterPreflight === fixtureInventorySha256
      ? await runCodexCritic({ fixture, reviewBundle, permissionProfile: profile, codexBinary, schemaPath: schemaInFixture, spawn, env, onHeartbeat })
      : null;
    const afterCriticBinary = critic ? await inspectBinary({ codexBinary, execFileSync }) : null;
    const bindingStableAfterCritic = critic ? sameBinaryBinding(binary, afterCriticBinary) : false;
    const inventoryAfterCritic = critic ? await assertFixtureInventory(fixture) : null;
    const ok = preflight.ok && bindingStableBeforeCritic && critic?.ok === true && bindingStableAfterCritic && inventoryAfterCritic === fixtureInventorySha256;
    return Object.freeze({
      ok,
      envelope: Object.freeze({
        schema: CODEX_CRITIC_POLICY.schema,
        candidateCommit: fixture.manifest.candidateCommit,
        candidateTree: fixture.manifest.tree,
        candidateParent: fixture.manifest.parent,
        candidateParentTree: fixture.manifest.parentTree,
        fixtureManifestSha256: fixture.manifestHash,
        fixtureInventorySha256,
        reviewBundleSha256: reviewBundle.hash,
        reviewContractSha256: reviewContractHash(),
        adapter: CODEX_CRITIC_POLICY.adapter,
        policySha256: sha256(canonical(CODEX_CRITIC_POLICY)),
        sourceReferenceSha256: sha256(canonical(CODEX_CRITIC_POLICY.sourceReference)),
        model: CODEX_CRITIC_POLICY.model,
        effort: CODEX_CRITIC_POLICY.effort,
        permissionProfileSha256: profile.hash,
        binarySha256: binary.binarySha256,
        versionSha256: binary.versionSha256,
        runtimeRootSha256: binary.runtimeRootSha256,
        runtimeManifestSha256: binary.runtimeManifestSha256,
        runtimeEntries: binary.runtimeEntries,
        contractSha256: contract.contractSha256,
        bindingStableBeforeCritic,
        bindingStableAfterCritic,
        fixtureInventoryStable: inventoryAfterPreflight === fixtureInventorySha256 && inventoryAfterCritic === fixtureInventorySha256,
        preflight: publicRun(preflight),
        critic: publicRun(critic),
      }),
      localDiagnostics: Object.freeze({ preflight: preflight.diagnostics ?? null, critic: critic?.diagnostics ?? null }),
      reason: ok ? null : "profile-bound isolation evidence is incomplete or failed",
    });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}

export async function verifyFixtureTree(root) { const info = await stat(root); if (!info.isDirectory()) fail("fixture root is not a directory"); return directoryHash(root); }
