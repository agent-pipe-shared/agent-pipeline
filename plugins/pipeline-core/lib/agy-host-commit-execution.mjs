// SPDX-License-Identifier: SUL-1.0
/**
 * Commit the exact diff admitted after a validated Agy final. This is a host
 * operation, not a model tool: the caller must have checked the final and the
 * stored consent before calling, and retain its original admission outside
 * child control. Matching the prior admission detects drift; the plain object
 * is not a signature or independent authority. It uses ordinary Git hooks.
 * Publication of the exclusive v4 dispatch record is a separate, later step.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isSafeTaskId } from "./dispatch-record.mjs";
import { AGY_HOST_OBSERVED_TRAILER, AGY_FAMILY_HOST_OBSERVED_TRAILER } from "./agy-host-observed-receipt.mjs";
import { commitTypeFindings, finishedCommitMessageFindings } from "./commit-message-policy.mjs";
import { agyHostGitEnvironment, assessAgyHostCommit, assessSourceOwnedNativeHostCommit, inspectSourceOwnedNativeConcurrentAdmission } from "./agy-host-commit-admission.mjs";

const TIMEOUT_MS = 300_000;
function fail(code) { return { ok: false, code }; }
function runGit(root, args, spawn = spawnSync) {
  return spawn("git", ["-C", root, ...args], {
    encoding: "utf8", shell: false, timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024,
    env: agyHostGitEnvironment(),
  });
}
function git(root, args, spawn) {
  const result = runGit(root, args, spawn);
  return result.error || result.status !== 0 ? null : result.stdout;
}
function paths(output) { return output === null ? null : output.split("\0").filter(Boolean).sort(); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function committedMessage(root, commit, spawn) {
  const object = git(root, ["cat-file", "commit", commit], spawn);
  if (object === null) return null;
  const boundary = object.indexOf("\n\n");
  return boundary < 0 ? null : object.slice(boundary + 2);
}
function stagedBlob(root, path, spawn) {
  const output = git(root, ["ls-files", "--stage", "-z", "--", path], spawn);
  if (output === null) return undefined;
  const entries = output.split("\0").filter(Boolean);
  if (entries.length === 0) return null;
  if (entries.length !== 1) return undefined;
  const match = /^(?:100644|100755) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t([^\0]+)$/u.exec(entries[0]);
  return match && match[2] === path ? match[1] : undefined;
}

// Physical snapshots are only retry prerequisites; an unavailable snapshot
// cannot turn ordinary success into failure or authorize another commit.
function physicalIndexSnapshot(path) {
  let fd;
  try {
    if (!isAbsolute(path) || /[\r\n\0]/u.test(path)) return null;
    const parentPath = dirname(path), parent = lstatSync(parentPath);
    if (!parent.isDirectory() || parent.isSymbolicLink() || realpathSync(parentPath) !== parentPath) return null;
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 16 * 1024 * 1024) return null;
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd), bytes = readFileSync(fd), after = fstatSync(fd), named = lstatSync(path), parentAfter = lstatSync(parentPath);
    const identity = s => ({dev:s.dev,ino:s.ino,mode:s.mode,nlink:s.nlink,uid:s.uid,gid:s.gid,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs});
    if (!same(identity(before),identity(opened)) || !same(identity(opened),identity(after))
      || !same(identity(after),identity(named)) || bytes.length !== after.size
      || parent.dev !== parentAfter.dev || parent.ino !== parentAfter.ino || parent.mode !== parentAfter.mode) return null;
    return {path, parent:{dev:parent.dev,ino:parent.ino,mode:parent.mode},
      identity:identity(after),sha256:createHash("sha256").update(bytes).digest("hex")};
  } catch { return null; } finally { if (fd !== undefined) closeSync(fd); }
}
function lockHasCeased(path) {
  try { lstatSync(path); return false; } catch (error) { return error.code === "ENOENT"; }
}
function exactIndexLockRefusal(result, lockPath) {
  if (!lockPath || result.error || result.signal || result.status !== 128 || result.stdout !== "" || typeof result.stderr !== "string") return false;
  const first = `fatal: Unable to create '${lockPath}': File exists.`;
  const advice = "\n\nAnother git process seems to be running in this repository, e.g.\n"
    + "an editor opened by 'git commit'. Please make sure all processes\n"
    + "are terminated then try again. If it still fails, a git process\n"
    + "may have crashed in this repository earlier:\n"
    + "remove the file manually to continue.";
  const text = result.stderr.replace(/\r\n/gu,"\n");
  return text === first + "\n" || text === first + advice + "\n";
}
function unchangedRetryAdmission(root, admitted, stagedTree, originalIndex, spawn) {
  if (!originalIndex) return false;
  const head = git(root,["rev-parse","--verify","HEAD^{commit}"],spawn)?.trim();
  // Verify the admitted tree without rewriting the index whose physical
  // identity is pinned below. Optional refreshes and external diff are disabled.
  const treeCheck = runGit(root,["--no-optional-locks","diff-index","--cached","--quiet","--no-ext-diff",stagedTree,"--"],spawn);
  if (treeCheck.error || treeCheck.signal !== null || treeCheck.status !== 0 || treeCheck.stdout !== "") return false;
  const staged = paths(git(root,["--no-optional-locks","diff","--no-ext-diff","--cached","--name-only","-z"],spawn));
  const unstaged = paths(git(root,["--no-optional-locks","diff","--no-ext-diff","--name-only","-z"],spawn));
  if (head !== admitted.candidateCommit || !same(staged,admitted.paths)
    || unstaged === null || unstaged.length !== 0
    || admitted.admittedBlobs.some(({path,oid}) => stagedBlob(root,path,spawn) !== oid)) return false;
  const currentIndex = physicalIndexSnapshot(originalIndex.path);
  return same(currentIndex,originalIndex) && lockHasCeased(join(dirname(originalIndex.path),"index.lock"));
}

function commitAdmittedReturn({ baseline, final, allowedPaths, taskId, priorAdmission, nativeAuthority } = {}, dependencies = {}, {
  runner, subject, body, marker, codePrefix,
} = {}) {
  const code = (suffix) => `${codePrefix}-${suffix}`;
  if (!isSafeTaskId(taskId) || final?.outcome !== "succeeded") return fail(code("HOST-COMMIT-INPUT"));
  const admitted = nativeAuthority && runner!=="antigravity" ? assessSourceOwnedNativeHostCommit({baseline,final,allowedPaths,authority:nativeAuthority}) : assessAgyHostCommit({ baseline, final, allowedPaths });
  const nativePlan=nativeAuthority&&runner!=="antigravity"&&admitted.ok?inspectSourceOwnedNativeConcurrentAdmission(admitted):null;
  if(nativePlan)baseline={...baseline,candidateCommit:nativePlan.parentCommit};
  if (!admitted.ok) return { ...admitted, code: admitted.code.replace(/^AGY-/u, `${codePrefix}-`) };
  if (priorAdmission?.code !== "AGY-HOST-COMMIT-ADMITTED"
    || priorAdmission.candidateCommit !== admitted.candidateCommit
    || !same(priorAdmission.paths, admitted.paths)
    || !same(priorAdmission.admittedBlobs, admitted.admittedBlobs)) {
    return fail(code("HOST-COMMIT-PRIOR-ADMISSION-DRIFT"));
  }
  const root = admitted.root;
  const spawn = dependencies.spawnSync ?? spawnSync;
  const message = `${subject}\n\n${body}\n\nDispatch: ${taskId} (goldfish)\n${marker}\nAI-Assisted: true\n`;
  if (commitTypeFindings(subject).findings.length > 0
    || finishedCommitMessageFindings(message, { requireMarker: true, requireDispatch: true }).findings.length > 0) {
    return fail(code("HOST-COMMIT-MESSAGE"));
  }
  if (git(root, ["add", "-A", "--", ...admitted.paths], spawn) === null) return fail(code("HOST-COMMIT-STAGE-FAILED"));
  const staged = paths(git(root, ["diff", "--cached", "--name-only", "-z"], spawn));
  const unstaged = paths(git(root, ["diff", "--name-only", "-z"], spawn));
  if (staged === null || unstaged === null || !same(staged, admitted.paths) || unstaged.some(path=>!nativePlan?.foreignPaths.includes(path))) {
    return fail(code("HOST-COMMIT-STAGED-DRIFT"));
  }
  if (admitted.admittedBlobs.some(({ path, oid }) => stagedBlob(root, path, spawn) !== oid)) {
    return fail(code("HOST-COMMIT-CONTENT-DRIFT"));
  }
  if (git(root, ["diff", "--cached", "--check"], spawn) === null) return fail(code("HOST-COMMIT-DIFF-CHECK"));
  const stagedTree = git(root, ["write-tree"], spawn)?.trim();
  if (!stagedTree) return fail(code("HOST-COMMIT-TREE"));
  // Neither --no-verify nor a temporary hooksPath is permitted here. A hook
  // rejection leaves the staged snapshot visible for explicit recovery.
  const indexPath = git(root,["rev-parse","--path-format=absolute","--git-path","index"],spawn)?.trim();
  const originalIndex = indexPath ? physicalIndexSnapshot(indexPath) : null;
  const beforeHead = git(root,["rev-parse","--verify","HEAD^{commit}"],spawn)?.trim();
  const commitArgs = ["commit", "-m", subject, "-m", body,
    "-m", `Dispatch: ${taskId} (goldfish)\n${marker}\nAI-Assisted: true`];
  let committed = runGit(root,commitArgs,spawn);
  const lockPath = originalIndex ? join(dirname(originalIndex.path),"index.lock") : null;
  if (beforeHead === admitted.candidateCommit && exactIndexLockRefusal(committed,lockPath)
    && unchangedRetryAdmission(root,admitted,stagedTree,originalIndex,spawn)) {
    // At most one retry. Never delete a lock, override hooks/signing, or retry
    // timeout, unknown outcome or a changed physical/staged snapshot.
    committed = runGit(root,commitArgs,spawn);
  }
  if (committed.error || committed.status !== 0) {
    const observedHead = git(root, ["rev-parse", "--verify", "HEAD^{commit}"], spawn)?.trim();
    // A timeout or a changed/unreadable HEAD cannot honestly be reduced to
    // "the guard rejected before a commit". Preserve the observed OID for
    // recovery, and never publish a no-delivery record from this result.
    if (committed.error || committed.signal || !observedHead || observedHead !== baseline.candidateCommit) {
      return { ...fail(code("HOST-COMMIT-OUTCOME-UNKNOWN")), commit: observedHead ?? null };
    }
    return fail(code("HOST-COMMIT-GUARD-OR-GIT-FAILED"));
  }
  const commit = git(root, ["rev-parse", "--verify", "HEAD^{commit}"], spawn)?.trim();
  const parent = git(root, ["rev-parse", "--verify", "HEAD^"], spawn)?.trim();
  const committedTree = git(root, ["rev-parse", "--verify", "HEAD^{tree}"], spawn)?.trim();
  const committedPaths = paths(git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "HEAD"], spawn));
  const actualMessage = commit ? committedMessage(root, commit, spawn) : null;
  const finalHead = git(root, ["rev-parse", "--verify", "HEAD^{commit}"], spawn)?.trim();
  if (!commit || parent !== baseline.candidateCommit || committedTree !== stagedTree
    || committedPaths === null || !same(committedPaths, admitted.paths) || actualMessage !== message
    || finalHead !== commit) {
    return { ...fail(code("HOST-COMMIT-READBACK-MISMATCH")), commit: commit ?? null };
  }
  return {
    ok: true, code: code("HOST-COMMIT-READBACK-VERIFIED"), commit,
    parent, tree: committedTree, paths: committedPaths,
  };
}

export function commitAdmittedAgyReturn(input = {}, dependencies = {}) {
  const { adapterVersion = 1, ...admittedInput } = input;
  if (![1, 2].includes(adapterVersion)) return { ok: false, code: "AGY-HOST-COMMIT-ADAPTER-VERSION" };
  return commitAdmittedReturn(admittedInput, dependencies, { runner: "antigravity",
    subject: "feat(agy): deliver validated Goldfish return",
    body: "Host commit after validated Agy final and exact-path admission.",
    marker: adapterVersion === 2 ? AGY_FAMILY_HOST_OBSERVED_TRAILER : AGY_HOST_OBSERVED_TRAILER, codePrefix: "AGY" });
}

/** Claude/Codex native hook return adapter; no caller-controlled runner, model, or marker. */
export function commitAdmittedNativeGoldfishReturn({ runner, adapterVersion = 1, ...input } = {}, dependencies = {}) {
  if (runner !== "claude" && runner !== "codex") return fail("NATIVE-HOST-COMMIT-RUNNER");
  if (!Number.isSafeInteger(adapterVersion) || (runner === "claude" && adapterVersion !== 1)
    || (runner === "codex" && ![1, 2].includes(adapterVersion))) return fail("NATIVE-HOST-COMMIT-ADAPTER-VERSION");
  return commitAdmittedReturn(input, dependencies, { runner,
    subject: `feat(${runner}): deliver validated Goldfish return`,
    body: `Host commit after validated ${runner} native Goldfish return and exact-path admission.`,
    marker: `Native-Host-Observed: v${adapterVersion} (${runner})`, codePrefix: "NATIVE" });
}
