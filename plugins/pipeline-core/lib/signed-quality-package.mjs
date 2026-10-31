// SPDX-License-Identifier: SUL-1.0
/** A signed quality package is a narrowly scoped, reviewable patch application. */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, parse, relative, resolve, sep, win32 } from "node:path";
import { canonical, verifyPoApprovalProof } from "./po-approval-proof.mjs";
import { SIGNED_QUALITY_PACKAGE_SCHEMA, QUALITY_PACKAGE_COMMIT_AUTHORIZATION_SCHEMA, QUALITY_PACKAGE_POLICY_PATH, physicalQualityPackageFile, sqpOwn as own, sqpFail as fail, gitReportedPathIsSamePhysicalPath, receiptModeBitsRefused, runGit, targetModeFromPatch, validatePackage, committedTrustPolicy, authorizationDirectory, directoryHasNoSymlinkAncestors, readExactAuthorization } from "./review-admission-read.mjs";
export { SIGNED_QUALITY_PACKAGE_SCHEMA, QUALITY_PACKAGE_COMMIT_AUTHORIZATION_SCHEMA, QUALITY_PACKAGE_POLICY_PATH, isCanonicalPhysicalQualityPackagePath, physicalQualityPackageFile, gitReportedPathIsSamePhysicalPath, receiptModeBitsRefused, qualityPackageIntentSha256, verifyQualityPackageIntegrationPostCommit } from "./review-admission-read.mjs";

function repositoryScratchDirectory(root) {
  if (realpathSync(root) !== root) throw new Error("QUALITY-PACKAGE-REPOSITORY-ROOT-INVALID");
  const scratch = join(root, "scratch");
  let stat;
  try { stat = lstatSync(scratch); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    mkdirSync(scratch, { mode: 0o700 });
    stat = lstatSync(scratch);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(scratch) !== scratch) throw new Error("QUALITY-PACKAGE-SCRATCH-INVALID");
  return scratch;
}

export function validateQualityPackageCommandArgs(args, currentRoot) {
  if (!Array.isArray(args) || args.length !== 5) return false;
  const [root, intent, proof, policy, mode] = args;
  try {
    if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root || root !== realpathSync(currentRoot)) return false;
    if (policy !== join(root, QUALITY_PACKAGE_POLICY_PATH) || !["verify", "apply", "authorize-commit", "prepare-commit"].includes(mode)) return false;
    return physicalQualityPackageFile(intent, root, 16 * 1024 * 1024)
      && physicalQualityPackageFile(proof, root, 32768)
      && physicalQualityPackageFile(policy, root, 32768);
  } catch { return false; }
}

/** Pure disclosure using the exact package validator; never an authorization. */
export function describeSignedQualityPackageIntent(record, intentSha256) {
  const paths = validatePackage(record);
  if (!paths || record.intentSha256 !== intentSha256) return null;
  // Keep the complete sorted scope visible; refuse oversized disclosure instead of truncating it.
  if (paths.length > 4096 || paths.some(path => path.length > 512)) return null;
  const visiblePath = path => path.replace(/\p{C}/gu, character => `\\u{${character.codePointAt(0).toString(16)}}`);
  const lines = [
    `recorded request: ${SIGNED_QUALITY_PACKAGE_SCHEMA}`,
    `base commit: ${record.baseCommit}`,
    `changed paths and exact postimage digests (${paths.length}):`,
    ...paths.map(path => `${visiblePath(path)}: ${record.expectedDigests[path]}`),
  ];
  if (Buffer.byteLength(lines.join("\n"), "utf8") > 1024 * 1024) return null;
  return {
    resolved: true,
    code: "QUALITY-PACKAGE-DISCLOSURE-RESOLVED",
    lines,
  };
}

function stagedPackageMatches(root, record, paths) {
  try {
    if (runGit(root, ["rev-parse", "HEAD"]).trim() !== record.baseCommit) return false;
    const staged = runGit(root, ["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean).sort();
    if (staged.length !== paths.length || staged.some((path, index) => path !== paths[index])) return false;
    for (const path of paths) {
      const indexEntry = runGit(root, ["ls-files", "-s", "--", path]).trim();
      const indexMatch = /^(100644|100755)\s+([0-9a-f]{40,64})\s+0\t/u.exec(indexEntry);
      if (!indexMatch || indexMatch[1] !== targetModeFromPatch(root, record, path)) return false;
      const result = spawnSync("git", ["show", `:${path}`], { cwd: root, encoding: null, maxBuffer: 64 * 1024 * 1024 });
      if (result.error || result.status !== 0 || createHash("sha256").update(result.stdout).digest("hex") !== record.expectedDigests[path]) return false;
    }
    return true;
  } catch { return false; }
}

/** Read-only observation for the existing installed writer's related-worktree lane.
 * Never an execution-CWD attestation or a standalone grant: the fixed CLI still
 * checks its actual process.cwd() before effects. Native session guards remain.
 */
export function relatedCommittedQualityPackageCommandAdmission(args, nativeSessionRoot) {
  try {
    if (!Array.isArray(args) || args.length !== 5 || typeof nativeSessionRoot !== "string") return false;
    const [candidateRoot, intentPath, proofPath, policyPath, mode] = args;
    if (candidateRoot === nativeSessionRoot || !validateQualityPackageCommandArgs(args, candidateRoot)) return false;
    const directoryIdentity = path => {
      if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path
        || !directoryHasNoSymlinkAncestors(path)) return null;
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink()) return null;
      return { path, dev: String(info.dev), ino: String(info.ino), mode: info.mode, uid: info.uid, gid: info.gid, nlink: info.nlink };
    };
    const repositoryIdentity = root => {
      const physicalRoot = directoryIdentity(root);
      if (!physicalRoot || !gitReportedPathIsSamePhysicalPath(runGit(root, ["rev-parse", "--show-toplevel"]).trim(), root)) return null;
      const common = runGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
      const commonIdentity = directoryIdentity(common);
      if (!commonIdentity) return null;
      const registration = runGit(root, ["worktree", "list", "--porcelain", "-z"]);
      if (Buffer.byteLength(registration, "utf8") > 1024 * 1024) return null;
      const roots = registration.split("\0").filter(value => value.startsWith("worktree ")).map(value => value.slice(9));
      if (roots.filter(path => gitReportedPathIsSamePhysicalPath(path, root)).length !== 1) return null;
      return { root: physicalRoot, common: commonIdentity };
    };
    const nativeBefore = repositoryIdentity(nativeSessionRoot);
    const candidateBefore = repositoryIdentity(candidateRoot);
    if (!nativeBefore || !candidateBefore || canonical(nativeBefore.common) !== canonical(candidateBefore.common)) return false;
    const paths = [intentPath, proofPath, policyPath];
    const limits = [16 * 1024 * 1024, 32768, 32768];
    const snapshots = paths.map((path, index) => {
      if (!physicalQualityPackageFile(path, candidateRoot, limits[index])) throw new Error("QUALITY-PACKAGE-CANDIDATE-FILE");
      return readFileSync(path);
    });
    const packageIntent = JSON.parse(snapshots[0].toString("utf8"));
    const proof = JSON.parse(snapshots[1].toString("utf8"));
    const changedPaths = validatePackage(packageIntent);
    if (!changedPaths || changedPaths.includes(QUALITY_PACKAGE_POLICY_PATH)) return false;
    const trustPolicy = committedTrustPolicy(candidateRoot, proof);
    if (!trustPolicy || !verifyPoApprovalProof({ intent: { sha256: packageIntent.intentSha256 }, proof, trustPolicy }).verified) return false;
    const targetStateMatches = () => runGit(candidateRoot, ["rev-parse", "HEAD"]).trim() === packageIntent.baseCommit
      && (mode === "authorize-commit"
        ? stagedPackageMatches(candidateRoot, packageIntent, changedPaths)
        : runGit(candidateRoot, ["status", "--porcelain"]) === "");
    if (!targetStateMatches()) return false;
    if (paths.some((path, index) => !physicalQualityPackageFile(path, candidateRoot, limits[index])
      || !readFileSync(path).equals(snapshots[index]))) return false;
    const nativeAfter = repositoryIdentity(nativeSessionRoot), candidateAfter = repositoryIdentity(candidateRoot);
    return nativeAfter !== null && candidateAfter !== null
      && canonical(nativeAfter) === canonical(nativeBefore) && canonical(candidateAfter) === canonical(candidateBefore)
      && targetStateMatches();
  } catch { return false; }
}

/** Canonical CLI authority; explicit external trust stays a separate library API. */
export function applyCommittedQualityPackage({ repoRoot, packageIntent, proof, applyToMain = false } = {}) {
  const root = typeof repoRoot === "string" ? resolve(repoRoot) : null;
  const trustPolicy = root && committedTrustPolicy(root, proof);
  if (!trustPolicy) return fail("QUALITY-PACKAGE-COMMITTED-POLICY-INVALID");
  return applyQualityPackage({ repoRoot: root, packageIntent, proof, trustPolicy, applyToMain });
}

/** Apply, stage only the signed paths, and authorize the exact resulting index.
 * A refusal after application retains effects for explicit repair; this never
 * commits, resets, bypasses hooks, or manufactures a human approval.
 */
export function prepareCommittedQualityPackageCommit({ repoRoot, packageIntent, proof } = {}) {
  const root = typeof repoRoot === "string" ? resolve(repoRoot) : null;
  const paths = validatePackage(packageIntent);
  if (!root || !paths || paths.includes(QUALITY_PACKAGE_POLICY_PATH)) return fail("QUALITY-PACKAGE-INVALID");
  const applied = applyCommittedQualityPackage({ repoRoot: root, packageIntent, proof, applyToMain: true });
  if (!applied.ok) return { ...applied, stage: "apply", effects: "inspect-required" };
  try { runGit(root, ["add", "--", ...paths]); }
  catch { return { ...fail("QUALITY-PACKAGE-STAGE-FAILED"), stage: "stage", effects: "applied-inspect-required" }; }
  const authorized = authorizeQualityPackageCommit({ repoRoot: root, packageIntent, proof });
  if (!authorized.ok) return { ...authorized, stage: "authorize", effects: "applied-and-staged-inspect-required" };
  return { ...authorized, code: "QUALITY-PACKAGE-COMMIT-PREPARED", stage: "authorized", effects: "applied-and-staged", commitPerformed: false };
}

function safeAuthorizationDirectory(path) {
  try { mkdirSync(path, { recursive: true, mode: 0o700 }); } catch { return false; }
  return directoryHasNoSymlinkAncestors(path);
}

function matchingExistingReceipt(target, receipt) {
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || receiptModeBitsRefused(stat.mode)) return false;
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
    try { const stat = lstatSync(join(directory, name)); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || receiptModeBitsRefused(stat.mode)) continue; receipt = JSON.parse(readFileSync(join(directory, name), "utf8")); } catch { continue; }
    if (!own(receipt, ["schema", "packageIntent", "proof"]) || receipt.schema !== QUALITY_PACKAGE_COMMIT_AUTHORIZATION_SCHEMA) continue;
    const paths = validatePackage(receipt.packageIntent);
    if (!paths || name !== `${receipt.packageIntent.intentSha256}.json` || paths.includes("project/critical-human-proof.json")) continue;
    const trustPolicy = committedTrustPolicy(root, receipt.proof);
    if (!trustPolicy || !verifyPoApprovalProof({ intent: { sha256: receipt.packageIntent.intentSha256 }, proof: receipt.proof, trustPolicy }).verified) continue;
    if (stagedPackageMatches(root, receipt.packageIntent, paths)) return { ok: true, code: "QUALITY-PACKAGE-COMMIT-VERIFIED", intentSha256: receipt.packageIntent.intentSha256 };
  }
  return fail("QUALITY-PACKAGE-COMMIT-ABSENT");
}

/** Independently rechecks the selected signed authorization against HEAD and the complete staged index. */
export function verifyQualityPackageIntegrationPreCommit({ repoRoot, intentSha256 } = {}) {
  const root = typeof repoRoot === "string" ? resolve(repoRoot) : null;
  if (!root) return fail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
  const selected = readExactAuthorization(root, intentSha256);
  if (!selected.ok) return fail("QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID");
  if (!stagedPackageMatches(root, selected.packageIntent, selected.paths)) return fail("QUALITY-PACKAGE-INTEGRATION-INDEX-MISMATCH");
  return { ok: true, code: "QUALITY-PACKAGE-INTEGRATION-PRECOMMIT-VERIFIED", intentSha256 };
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


// Private index writes raw result blobs; working-tree apply would run EOL/filters.
function rawPackageGit(root, indexPath, args, input) {
  const result = spawnSync("git", args, { cwd: root, env: { ...process.env, GIT_INDEX_FILE: indexPath }, encoding: null, input, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`QUALITY-PACKAGE-GIT-${args[0]}`);
  return result.stdout;
}

function rawPackageResults(root, indexPath, record, paths) {
  if (["GIT_INDEX_FILE", "GIT_DIR", "GIT_WORK_TREE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"].some(key => process.env[key])) throw new Error("QUALITY-PACKAGE-REPOSITORY-ROOT-INVALID");
  rawPackageGit(root, indexPath, ["read-tree", record.baseCommit]);
  const st = lstatSync(indexPath);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1) throw new Error("QUALITY-PACKAGE-SCRATCH-INVALID");
  rawPackageGit(root, indexPath, ["apply", "--cached", "--check", "--whitespace=error", "-"], record.unifiedDiff);
  rawPackageGit(root, indexPath, ["apply", "--cached", "--whitespace=error", "-"], record.unifiedDiff);
  const changed = rawPackageGit(root, indexPath, ["diff", "--cached", "--name-only", "-z", record.baseCommit]).toString("utf8").split("\0").filter(Boolean).sort();
  if (changed.length !== paths.length || changed.some((path, i) => path !== paths[i])) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
  let totalBytes = 0;
  return paths.map(path => {
    const entry = rawPackageGit(root, indexPath, ["ls-files", "-s", "-z", "--", path]).toString("utf8");
    const match = /^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)\0$/u.exec(entry);
    if (!match || match[3] !== path || match[1] !== targetModeFromPatch(root, record, path)) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
    const bytes = rawPackageGit(root, indexPath, ["cat-file", "blob", match[2]]);
    totalBytes += bytes.length;
    if (totalBytes > 64 * 1024 * 1024) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
    if (createHash("sha256").update(bytes).digest("hex") !== record.expectedDigests[path]) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
    const baseEntry = runGit(root, ["ls-tree", record.baseCommit, "--", path]).trim();
    const target = packageTarget(root, path, false);
    const preimage = target ? packageFileSnapshot(target) : null;
    const baseMatch = /^(100644|100755) blob ([a-f0-9]{40,64})\t/u.exec(baseEntry);
    if ((baseEntry === "") !== (preimage === null) || (baseEntry !== "" && !baseMatch)) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
    // Admit only exact committed bytes or the exact genuine isolated checkout.
    // No normalized/filtered target digest is used as a substitute for either.
    const canonicalBase = baseMatch ? {
      sha256: createHash("sha256").update(rawPackageGit(root, indexPath, ["cat-file", "blob", baseMatch[2]])).digest("hex"),
      mode: baseMatch[1] === "100755" ? 0o755 : 0o644,
    } : null;
    return { path, bytes, mode: match[1] === "100755" ? 0o755 : 0o644, preimage, canonicalBase };
  });
}

function packageFileSnapshot(path) {
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const held = fstatSync(fd); const bytes = readFileSync(fd);
      if (!held.isFile() || held.dev !== before.dev || held.ino !== before.ino || held.nlink !== 1) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
      const after = fstatSync(fd); const pathAfter = lstatSync(path);
      if (after.dev !== held.dev || after.ino !== held.ino || after.size !== held.size || after.mtimeMs !== held.mtimeMs || after.ctimeMs !== held.ctimeMs || after.nlink !== 1 || pathAfter.isSymbolicLink() || pathAfter.dev !== held.dev || pathAfter.ino !== held.ino) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
      return { dev: held.dev, ino: held.ino, mode: held.mode, size: held.size, sha256: createHash("sha256").update(bytes).digest("hex") };
    } finally { closeSync(fd); }
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function packageTarget(root, path, createDirectories) {
  let cursor = root;
  const parts = path.split("/");
  for (const part of parts.slice(0, -1)) {
    cursor = join(cursor, part);
    let st;
    try { st = lstatSync(cursor); }
    catch (error) { if (error.code !== "ENOENT") throw error; if (!createDirectories) return null; mkdirSync(cursor); st = lstatSync(cursor); }
    if (!st.isDirectory() || st.isSymbolicLink() || realpathSync(cursor) !== cursor) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
  }
  return join(cursor, parts.at(-1));
}

function publishRawPackage(root, results) {
  const snapshots = results.map(result => {
    const path = packageTarget(root, result.path, false); const observed = path ? packageFileSnapshot(path) : null;
    const exactCheckout = observed && result.preimage && observed.sha256 === result.preimage.sha256
      && (process.platform === "win32" || (observed.mode & 0o777) === (result.preimage.mode & 0o777));
    const exactCommitted = observed && result.canonicalBase && observed.sha256 === result.canonicalBase.sha256
      && (process.platform === "win32" || (observed.mode & 0o777) === result.canonicalBase.mode);
    if ((observed === null) !== (result.preimage === null) || (observed && !exactCheckout && !exactCommitted)) throw new Error("QUALITY-PACKAGE-BASE-DRIFT");
    return observed;
  });
  for (let i = 0; i < results.length; i++) {
    const result = results[i]; const path = packageTarget(root, result.path, true);
    if (canonical(packageFileSnapshot(path)) !== canonical(snapshots[i])) throw new Error("QUALITY-PACKAGE-BASE-DRIFT");
    const temp = `${path}.${randomUUID()}.quality-package-tmp`;
    let fd;
    try {
      fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), result.mode);
      writeFileSync(fd, result.bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
      chmodSync(temp, result.mode);
      if (canonical(packageFileSnapshot(path)) !== canonical(snapshots[i])) throw new Error("QUALITY-PACKAGE-BASE-DRIFT");
      // Like the prior Git rewrite, replacement is not a CAS against external writers.
      if (snapshots[i] === null) { linkSync(temp, path); unlinkSync(temp); }
      else renameSync(temp, path);
      const observed = packageFileSnapshot(path);
      if (observed.sha256 !== createHash("sha256").update(result.bytes).digest("hex") || (process.platform !== "win32" && (observed.mode & 0o777) !== result.mode)) throw new Error("QUALITY-PACKAGE-READBACK-MISMATCH");
    } finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(temp); } catch { /* original failure remains authoritative */ } }
  }
}

/** Validates in an isolated checkout; main-tree application is explicitly opt-in. */
export function applyQualityPackage({ repoRoot, packageIntent, proof, trustPolicy, applyToMain = false } = {}) {
  const root = typeof repoRoot === "string" ? resolve(repoRoot) : null;
  const paths = validatePackage(packageIntent);
  if (!root || !paths || paths.includes(QUALITY_PACKAGE_POLICY_PATH)) return fail("QUALITY-PACKAGE-INVALID");
  const verified = verifyPoApprovalProof({ intent: { sha256: packageIntent.intentSha256 }, proof, trustPolicy });
  if (!verified.verified) return fail(verified.code);
  let worktreeDir = null;
  let privateIndex = null;
  try {
    const head = runGit(root, ["rev-parse", "HEAD"]).trim();
    if (applyToMain && (head !== packageIntent.baseCommit || runGit(root, ["--no-optional-locks", "status", "--porcelain"]) !== "")) return fail("QUALITY-PACKAGE-BASE-DRIFT");
    const targetIndexPath = resolve(root, runGit(root, ["rev-parse", "--git-path", "index"]).trim());
    const targetIndexBefore = packageFileSnapshot(targetIndexPath);
    const indexConserved = () => canonical(packageFileSnapshot(targetIndexPath)) === canonical(targetIndexBefore);
    worktreeDir = mkdtempSync(join(repositoryScratchDirectory(root), "pipeline-quality-package-")); rmSync(worktreeDir, { recursive: true, force: true });
    runGit(root, ["worktree", "add", "--detach", worktreeDir, packageIntent.baseCommit]);
    privateIndex = `${worktreeDir}.index`;
    const results = rawPackageResults(worktreeDir, privateIndex, packageIntent, paths);
    publishRawPackage(worktreeDir, results);
    // `git apply` leaves added paths untracked in this detached checkout.
    // Read both tracked modifications and every untracked path (including an
    // ignored path explicitly added by the signed patch) before byte readback.
    const changed = [
      ...runGit(worktreeDir, ["diff", "--name-only", "-z"]).split("\0").filter(Boolean),
      ...runGit(worktreeDir, ["ls-files", "--others", "-z"]).split("\0").filter(Boolean),
    ].sort();
    if (changed.length !== paths.length || changed.some((path, index) => path !== paths[index]) || !verifyResultingFiles(worktreeDir, paths, packageIntent.expectedDigests)) return fail("QUALITY-PACKAGE-READBACK-MISMATCH");
    if (!indexConserved()) return fail("QUALITY-PACKAGE-BASE-DRIFT");
    if (!applyToMain) return { ok: true, code: "QUALITY-PACKAGE-VERIFIED", intentSha256: packageIntent.intentSha256 };
    if (runGit(root, ["rev-parse", "HEAD"]).trim() !== packageIntent.baseCommit || runGit(root, ["--no-optional-locks", "status", "--porcelain"]) !== "") return fail("QUALITY-PACKAGE-BASE-DRIFT");
    if (!indexConserved()) return fail("QUALITY-PACKAGE-BASE-DRIFT");
    publishRawPackage(root, results);
    if (!indexConserved()) return fail("QUALITY-PACKAGE-BASE-DRIFT");
    if (!verifyResultingFiles(root, paths, packageIntent.expectedDigests)) return fail("QUALITY-PACKAGE-READBACK-MISMATCH");
    return { ok: true, code: "QUALITY-PACKAGE-APPLIED", intentSha256: packageIntent.intentSha256 };
  } catch (error) { return fail(error.message); }
  finally {
    if (privateIndex) { rmSync(privateIndex, { force: true }); rmSync(`${privateIndex}.lock`, { force: true }); }
    if (worktreeDir) {
      try { runGit(root, ["worktree", "remove", "--force", worktreeDir]); } catch { /* cleanup is best effort */ }
      rmSync(worktreeDir, { recursive: true, force: true });
    }
  }
}
