// SPDX-License-Identifier: SUL-1.0
/** A signed quality package is a narrowly scoped, reviewable patch application. */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, parse, posix, relative, resolve, sep, win32 } from "node:path";
import { canonical, verifyPoApprovalProof } from "./po-approval-proof.mjs";
import { readCriticalHumanProofPolicy } from "./critical-human-proof-policy.mjs";

export const SIGNED_QUALITY_PACKAGE_SCHEMA = "pipeline.signed-quality-package.v1";
export const QUALITY_PACKAGE_COMMIT_AUTHORIZATION_SCHEMA = "pipeline.signed-quality-package-commit-authorization.v1";
export const QUALITY_PACKAGE_POLICY_PATH = "project/critical-human-proof.json";

/** Pure lexical contract only; physicalQualityPackageFile still performs all filesystem admission. */
export function isCanonicalPhysicalQualityPackagePath(path, pathFlavor = process.platform === "win32" ? "win32" : "posix") {
  const pathApi = pathFlavor === "win32" ? win32 : pathFlavor === "posix" ? posix : null;
  if (!pathApi || typeof path !== "string" || !pathApi.isAbsolute(path) || pathApi.resolve(path) !== path || /[\u0000-\u001f]/u.test(path)) return false;
  if (pathFlavor === "posix" && path.includes("\\")) return false;
  if (pathFlavor === "win32" && path.includes("/")) return false;
  return true;
}

/** Closed filesystem grammar shared by the command classifier and CLI. */
export function physicalQualityPackageFile(path, root, maxBytes) {
  try {
    if (!isCanonicalPhysicalQualityPackagePath(path) || !isAbsolute(path) || resolve(path) !== path) return false;
    const rel = relative(root, path);
    if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) return false;
    let cursor = parse(path).root;
    const parts = relative(cursor, path).split(sep);
    for (let i = 0; i < parts.length; i++) {
      cursor = join(cursor, parts[i]);
      const st = lstatSync(cursor);
      if (st.isSymbolicLink() || (i < parts.length - 1 && !st.isDirectory())) return false;
      if (i === parts.length - 1 && (!st.isFile() || st.nlink !== 1 || st.size === 0 || st.size > maxBytes)) return false;
    }
    return realpathSync(path) === path;
  } catch { return false; }
}

export function validateQualityPackageCommandArgs(args, currentRoot) {
  if (!Array.isArray(args) || args.length !== 5) return false;
  const [root, intent, proof, policy, mode] = args;
  try {
    if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root || root !== realpathSync(currentRoot)) return false;
    if (policy !== join(root, QUALITY_PACKAGE_POLICY_PATH) || !["verify", "apply", "authorize-commit"].includes(mode)) return false;
    return physicalQualityPackageFile(intent, root, 16 * 1024 * 1024)
      && physicalQualityPackageFile(proof, root, 32768)
      && physicalQualityPackageFile(policy, root, 32768);
  } catch { return false; }
}

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const fail = (code) => ({ ok: false, code });

function runGit(root, args, input = undefined) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`QUALITY-PACKAGE-GIT-${args[0]}`);
  return result.stdout;
}

function safeRepositoryPath(value) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\\]/u.test(value) || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..") && parts[0] !== ".git";
}

function packagePayload(record) {
  return { schema: record.schema, baseCommit: record.baseCommit, unifiedDiff: record.unifiedDiff, expectedDigests: record.expectedDigests };
}

export function qualityPackageIntentSha256(record) { return digest(canonical(packagePayload(record))); }

function changedPathsFromPatch(unifiedDiff) {
  const paths = [];
  for (const line of unifiedDiff.split("\n")) {
    if (!line.startsWith("+++ ")) continue;
    const target = line.slice(4);
    if (!target.startsWith("b/") || target === "/dev/null") return null;
    const path = target.slice(2);
    if (!safeRepositoryPath(path) || paths.includes(path)) return null;
    paths.push(path);
  }
  return paths.length > 0 ? paths.sort() : null;
}

function validatePackage(record) {
  if (!own(record, ["schema", "baseCommit", "unifiedDiff", "expectedDigests", "intentSha256"]) || record.schema !== SIGNED_QUALITY_PACKAGE_SCHEMA || !OID.test(record.baseCommit) || typeof record.unifiedDiff !== "string" || !SHA256.test(record.intentSha256)) return null;
  if (record.expectedDigests === null || typeof record.expectedDigests !== "object" || Array.isArray(record.expectedDigests)) return null;
  const paths = Object.keys(record.expectedDigests).sort();
  if (paths.length === 0 || paths.some((path) => !safeRepositoryPath(path) || !SHA256.test(record.expectedDigests[path]))) return null;
  const patchPaths = changedPathsFromPatch(record.unifiedDiff);
  if (!patchPaths || patchPaths.length !== paths.length || patchPaths.some((path, index) => path !== paths[index])) return null;
  return record.intentSha256 === qualityPackageIntentSha256(record) ? paths : null;
}

function stagedPackageMatches(root, record, paths) {
  try {
    if (runGit(root, ["rev-parse", "HEAD"]).trim() !== record.baseCommit) return false;
    const staged = runGit(root, ["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean).sort();
    if (staged.length !== paths.length || staged.some((path, index) => path !== paths[index])) return false;
    for (const path of paths) {
      const indexEntry = runGit(root, ["ls-files", "-s", "--", path]).trim();
      if (!/^100(?:644|755)\s+[0-9a-f]{40,64}\s+0\t/u.test(indexEntry)) return false;
      const result = spawnSync("git", ["show", `:${path}`], { cwd: root, encoding: null, maxBuffer: 64 * 1024 * 1024 });
      if (result.error || result.status !== 0 || createHash("sha256").update(result.stdout).digest("hex") !== record.expectedDigests[path]) return false;
    }
    return true;
  } catch { return false; }
}

function committedTrustPolicy(root, proof) {
  // Presence, regular blob mode, index and worktree equality are independently
  // established. Authority is selected from HEAD bytes, never a caller's path.
  try {
    if (realpathSync(root) !== root || runGit(root, ["rev-parse", "--show-toplevel"]).trim() !== root) return null;
    const path = join(root, QUALITY_PACKAGE_POLICY_PATH);
    if (!physicalQualityPackageFile(path, root, 32768)) return null;
    const entry = runGit(root, ["ls-tree", "HEAD", "--", QUALITY_PACKAGE_POLICY_PATH]).trim();
    const match = /^(100644|100755) blob ([a-f0-9]{40,64})\tproject\/critical-human-proof\.json$/u.exec(entry);
    if (!match || runGit(root, ["ls-files", "-s", "--", QUALITY_PACKAGE_POLICY_PATH]).trim() !== match[1] + " " + match[2] + " 0\t" + QUALITY_PACKAGE_POLICY_PATH) return null;
    const blob = runGit(root, ["show", "HEAD:" + QUALITY_PACKAGE_POLICY_PATH]);
    if (!Buffer.from(blob).equals(readFileSync(path))) return null;
    // Reuse the full policy schema validator, then select exclusively from the
    // established committed blob rather than the reader's mutable return value.
    if (!readCriticalHumanProofPolicy(root).ok) return null;
    const policy = JSON.parse(blob);
    const anchors = policy.schema === "pipeline.critical-human-proof-policy.v3" ? policy.trustAnchors : [policy.trustAnchor];
    return Array.isArray(anchors) && typeof proof?.keyReference === "string"
      ? anchors.find(anchor => anchor?.keyReference === proof.keyReference) ?? null : null;
  } catch { return null; }
}

/** Canonical CLI authority; explicit external trust stays a separate library API. */
export function applyCommittedQualityPackage({ repoRoot, packageIntent, proof, applyToMain = false } = {}) {
  const root = typeof repoRoot === "string" ? resolve(repoRoot) : null;
  const trustPolicy = root && committedTrustPolicy(root, proof);
  if (!trustPolicy) return fail("QUALITY-PACKAGE-COMMITTED-POLICY-INVALID");
  return applyQualityPackage({ repoRoot: root, packageIntent, proof, trustPolicy, applyToMain });
}

function authorizationDirectory(root) {
  try { return join(runGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim(), "agent-pipeline", "signed-quality-packages", "commit-authorizations"); }
  catch { return null; }
}

function directoryHasNoSymlinkAncestors(path) {
  try {
    const parsed = parse(resolve(path));
    let cursor = parsed.root;
    for (const part of relative(parsed.root, resolve(path)).split(sep).filter(Boolean)) {
      cursor = join(cursor, part);
      const stat = lstatSync(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    }
    return true;
  } catch { return false; }
}

function safeAuthorizationDirectory(path) {
  try { mkdirSync(path, { recursive: true, mode: 0o700 }); } catch { return false; }
  return directoryHasNoSymlinkAncestors(path);
}

function matchingExistingReceipt(target, receipt) {
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077) return false;
    const existing = JSON.parse(readFileSync(target, "utf8"));
    return canonical(existing) === canonical(receipt);
  } catch { return false; }
}

/** Records a local authorization only after the proof and the whole staged index agree. */
export function authorizeQualityPackageCommit({ repoRoot, packageIntent, proof } = {}) {
  const root = typeof repoRoot === "string" ? resolve(repoRoot) : null;
  const paths = validatePackage(packageIntent);
  if (!root || !paths || paths.includes("project/critical-human-proof.json")) return fail("QUALITY-PACKAGE-COMMIT-INVALID");
  const trustPolicy = committedTrustPolicy(root, proof);
  if (!trustPolicy || !verifyPoApprovalProof({ intent: { sha256: packageIntent.intentSha256 }, proof, trustPolicy }).verified) return fail("QUALITY-PACKAGE-COMMIT-PROOF-INVALID");
  if (!stagedPackageMatches(root, packageIntent, paths)) return fail("QUALITY-PACKAGE-COMMIT-INDEX-MISMATCH");
  const directory = authorizationDirectory(root);
  if (!directory || !safeAuthorizationDirectory(directory)) return fail("QUALITY-PACKAGE-COMMIT-STORAGE-INVALID");
  const receipt = { schema: QUALITY_PACKAGE_COMMIT_AUTHORIZATION_SCHEMA, packageIntent, proof };
  const target = join(directory, `${packageIntent.intentSha256}.json`);
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    try { linkSync(temp, target); }
    catch (error) {
      if (error?.code !== "EEXIST" || !matchingExistingReceipt(target, receipt)) throw error;
    }
    unlinkSync(temp);
    return { ok: true, code: "QUALITY-PACKAGE-COMMIT-AUTHORIZED", intentSha256: packageIntent.intentSha256 };
  } catch { try { rmSync(temp, { force: true }); } catch { /* best effort */ } return fail("QUALITY-PACKAGE-COMMIT-STORAGE-INVALID"); }
}

/** Reads only local receipts, but re-verifies the signed package and the exact staged index. */
export function verifyQualityPackageCommitAuthorization({ repoRoot } = {}) {
  const root = typeof repoRoot === "string" ? resolve(repoRoot) : null;
  const directory = root && authorizationDirectory(root);
  if (!directory || !directoryHasNoSymlinkAncestors(directory)) return fail("QUALITY-PACKAGE-COMMIT-ABSENT");
  let names;
  try { names = readdirSync(directory).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name)).sort(); } catch { return fail("QUALITY-PACKAGE-COMMIT-ABSENT"); }
  for (const name of names) {
    let receipt;
    try { const stat = lstatSync(join(directory, name)); if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077) continue; receipt = JSON.parse(readFileSync(join(directory, name), "utf8")); } catch { continue; }
    if (!own(receipt, ["schema", "packageIntent", "proof"]) || receipt.schema !== QUALITY_PACKAGE_COMMIT_AUTHORIZATION_SCHEMA) continue;
    const paths = validatePackage(receipt.packageIntent);
    if (!paths || name !== `${receipt.packageIntent.intentSha256}.json` || paths.includes("project/critical-human-proof.json")) continue;
    const trustPolicy = committedTrustPolicy(root, receipt.proof);
    if (!trustPolicy || !verifyPoApprovalProof({ intent: { sha256: receipt.packageIntent.intentSha256 }, proof: receipt.proof, trustPolicy }).verified) continue;
    if (stagedPackageMatches(root, receipt.packageIntent, paths)) return { ok: true, code: "QUALITY-PACKAGE-COMMIT-VERIFIED", intentSha256: receipt.packageIntent.intentSha256 };
  }
  return fail("QUALITY-PACKAGE-COMMIT-ABSENT");
}

function verifyResultingFiles(root, paths, expectedDigests) {
  for (const path of paths) {
    const absolute = resolve(root, path); const fromRoot = relative(root, absolute);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) return false;
    let bytes;
    try { const stat = lstatSync(absolute); if (!stat.isFile() || stat.isSymbolicLink()) return false; bytes = readFileSync(absolute); } catch { return false; }
    if (createHash("sha256").update(bytes).digest("hex") !== expectedDigests[path]) return false;
  }
  return true;
}

/** Validates in an isolated checkout; main-tree application is explicitly opt-in. */
export function applyQualityPackage({ repoRoot, packageIntent, proof, trustPolicy, applyToMain = false } = {}) {
  const root = typeof repoRoot === "string" ? resolve(repoRoot) : null;
  const paths = validatePackage(packageIntent);
  if (!root || !paths || paths.includes(QUALITY_PACKAGE_POLICY_PATH)) return fail("QUALITY-PACKAGE-INVALID");
  const verified = verifyPoApprovalProof({ intent: { sha256: packageIntent.intentSha256 }, proof, trustPolicy });
  if (!verified.verified) return fail(verified.code);
  let worktreeDir = null;
  try {
    const head = runGit(root, ["rev-parse", "HEAD"]).trim();
    if (applyToMain && (head !== packageIntent.baseCommit || runGit(root, ["status", "--porcelain"]) !== "")) return fail("QUALITY-PACKAGE-BASE-DRIFT");
    worktreeDir = mkdtempSync(join(tmpdir(), "pipeline-quality-package-")); rmSync(worktreeDir, { recursive: true, force: true });
    runGit(root, ["worktree", "add", "--detach", worktreeDir, packageIntent.baseCommit]);
    runGit(worktreeDir, ["apply", "--check", "--whitespace=error", "-"], packageIntent.unifiedDiff);
    runGit(worktreeDir, ["apply", "--whitespace=error", "-"], packageIntent.unifiedDiff);
    // `git apply` leaves added paths untracked in this detached checkout.
    // Read both tracked modifications and every untracked path (including an
    // ignored path explicitly added by the signed patch) before byte readback.
    const changed = [
      ...runGit(worktreeDir, ["diff", "--name-only", "-z"]).split("\0").filter(Boolean),
      ...runGit(worktreeDir, ["ls-files", "--others", "-z"]).split("\0").filter(Boolean),
    ].sort();
    if (changed.length !== paths.length || changed.some((path, index) => path !== paths[index]) || !verifyResultingFiles(worktreeDir, paths, packageIntent.expectedDigests)) return fail("QUALITY-PACKAGE-READBACK-MISMATCH");
    if (!applyToMain) return { ok: true, code: "QUALITY-PACKAGE-VERIFIED", intentSha256: packageIntent.intentSha256 };
    runGit(root, ["apply", "--check", "--whitespace=error", "-"], packageIntent.unifiedDiff);
    runGit(root, ["apply", "--whitespace=error", "-"], packageIntent.unifiedDiff);
    if (!verifyResultingFiles(root, paths, packageIntent.expectedDigests)) return fail("QUALITY-PACKAGE-READBACK-MISMATCH");
    return { ok: true, code: "QUALITY-PACKAGE-APPLIED", intentSha256: packageIntent.intentSha256 };
  } catch (error) { return fail(error.message); }
  finally {
    if (worktreeDir) {
      try { runGit(root, ["worktree", "remove", "--force", worktreeDir]); } catch { /* cleanup is best effort */ }
      rmSync(worktreeDir, { recursive: true, force: true });
    }
  }
}
