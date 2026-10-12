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
import { isSafeTaskId } from "./dispatch-record.mjs";
import { AGY_HOST_OBSERVED_TRAILER, AGY_FAMILY_HOST_OBSERVED_TRAILER } from "./agy-host-observed-receipt.mjs";
import { commitTypeFindings, finishedCommitMessageFindings } from "./commit-message-policy.mjs";
import { agyHostGitEnvironment, assessAgyHostCommit } from "./agy-host-commit-admission.mjs";

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

function commitAdmittedReturn({ baseline, final, allowedPaths, taskId, priorAdmission } = {}, dependencies = {}, {
  runner, subject, body, marker, codePrefix,
} = {}) {
  const code = (suffix) => `${codePrefix}-${suffix}`;
  if (!isSafeTaskId(taskId) || final?.outcome !== "succeeded") return fail(code("HOST-COMMIT-INPUT"));
  const admitted = assessAgyHostCommit({ baseline, final, allowedPaths });
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
  if (staged === null || unstaged === null || !same(staged, admitted.paths) || unstaged.length !== 0) {
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
  const committed = runGit(root, ["commit", "-m", subject, "-m", body,
    "-m", `Dispatch: ${taskId} (goldfish)\n${marker}\nAI-Assisted: true`], spawn);
  if (committed.error || committed.status !== 0) {
    const observedHead = git(root, ["rev-parse", "--verify", "HEAD^{commit}"], spawn)?.trim();
    // A timeout or a changed/unreadable HEAD cannot honestly be reduced to
    // "the guard rejected before a commit". Preserve the observed OID for
    // recovery, and never publish a no-delivery record from this result.
    if (committed.error || !observedHead || observedHead !== baseline.candidateCommit) {
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
