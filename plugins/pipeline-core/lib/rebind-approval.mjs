// SPDX-License-Identifier: SUL-1.0
//
// R7-5 -- rebind an existing final plan approval on another device (spec section 22.5;
// rulings 58 and 64; PO decision BL). A clone carries the committed approval record and
// the tracked bound set, but none of the device-local proofs the origin device held. This
// route re-checks, on THIS checkout, every digest the approval binds and answers with one
// of three outcomes:
//
//   verified            every bound digest is equal, every bound path is present and tracked
//                       and clean, the package candidate is an ancestor of HEAD, and the
//                       existing approval verifier accepts it. Zero signatures, zero State
//                       change. The ONLY write is a device-local receipt in private state.
//   digest-set-changed  the PRD or Spec bytes differ from the digests the approval binds.
//   refused             anything else, including DWP-REBIND-ARTIFACT-LOST: a bound artifact
//                       exists on no reachable device. It is never regenerated and never
//                       treated as equal; the typed attended prerequisite is to retrieve the
//                       exact bytes from the origin device or to re-approve.
//
// Read-only by construction: this module never calls the State writer, never takes a lock,
// never writes into the working tree, never creates or requests a signature, never reads a
// key directory and never regenerates an artifact. The readiness HOST-EXECUTION proof lives
// in device-local private state, was verified on the origin device before the PO signed, and
// is therefore not required again here (PO decision BL): the tracked bound digests, the
// candidate ancestry and the signed approval are what count. That relaxation is passed to
// the shared approval verifier as one explicit argument; no other caller of it changes.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { verifyFinalDesignWorkflowApproval } from "./architecture-design.mjs";
import { ensurePrivateDirectory, writePrivateFileNoReplaceAtomic } from "./private-boundary.mjs";

export const REBIND_APPROVAL_SCHEMA = "pipeline.rebind-approval.v1";
export const REBIND_RECEIPT_SCHEMA = "pipeline.rebind-approval-receipt.v1";
const STATE_PATH = "project/pipeline-state.json";
const RECEIPT_DIRECTORY = ["agent-pipeline", "rebind-approval"];
// PO decision BL: the device-local host-execution proof is not required on a rebind.
const REQUIRE_READINESS_EXECUTION_ON_REBIND = false;

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const REPAIR = Object.freeze({
  "DWP-REBIND-NO-APPROVAL": "Rebind needs a recorded final plan approval bound to a design-workflow package; there is none on this checkout. Present and approve the plan instead.",
  "DWP-REBIND-ARTIFACT-UNSAFE": "A bound path is a symbolic link or not a regular file; the exact bound bytes must be a plain tracked file.",
  "DWP-REBIND-PACKAGE-INVALID": "The approved design-workflow package could not be read as the approval describes it; retrieve the exact committed bytes or re-approve.",
  "DWP-BOUND-PATH-IGNORED": "The bound bytes are git-ignored on this device. Make the exact path trackable and commit it (exact-path stage and commit), or re-approve with the artifacts produced under a tracked prefix.",
  "DWP-BOUND-PATH-UNTRACKED": "Stage and commit the exact bound path (ordinary exact-path stage and commit), then run rebind-approval again.",
  "DWP-BOUND-PATH-MODIFIED": "The bound path differs from HEAD. Restore the committed bytes, or commit the exact path if these are the approved bytes, then run rebind-approval again.",
  "DWP-APPROVAL-DIGEST-DRIFT": "The package bytes on this checkout are not the bytes the approval names. Retrieve the exact approved package from the origin device or re-approve.",
  "DWP-REBIND-CANDIDATE-UNREACHABLE": "The package candidate commit is not present in this clone. Fetch the history that contains it, then run rebind-approval again.",
  "DWP-REBIND-CANDIDATE-NOT-ANCESTOR": "HEAD does not descend from the package candidate commit. Check out the approved history or re-approve.",
  "DWP-REBIND-STATE-DRIFT": "The approval record changed while it was being verified. Run rebind-approval again on a quiet checkout.",
  "DWP-REBIND-RECEIPT-UNAVAILABLE": "The device-local verification receipt could not be written to private state; nothing was accepted.",
  "DWP-REBIND-ARGS": "rebind-approval accepts no arguments.",
  "DWP-REBIND-INTERNAL": "Rebind could not complete; nothing was accepted. Re-run once the checkout is quiet.",
});

function refuse(code, extra = {}) {
  return { exit: 2, payload: { schema: REBIND_APPROVAL_SCHEMA, status: "refused", code,
    repair: REPAIR[code] ?? "Resolve the typed code, or re-approve.", ...extra } };
}

/** Bounded repository-relative path: no escape, no drive letter, no control or glob characters. */
function boundedRepoPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && !/[\\:*?\x00-\x1f]/u.test(value) && !value.startsWith("/")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && part.toLowerCase() !== ".git");
}

/** Walks the physical path component by component; a symbolic link anywhere is unsafe. */
function inspectFile(root, relativePath, read = false) {
  let current = root;
  const parts = relativePath.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    let info;
    try { info = lstatSync(current); } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return { state: "missing" };
      throw error;
    }
    if (info.isSymbolicLink()) return { state: "unsafe" };
    if (index === parts.length - 1 ? !info.isFile() : !info.isDirectory()) return { state: "unsafe" };
  }
  return read ? { state: "present", bytes: readFileSync(current) } : { state: "present" };
}

const GIT_ENV = Object.freeze({ GIT_OPTIONAL_LOCKS: "0", GIT_LITERAL_PATHSPECS: "1" });
function git(dir, args) {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", shell: false, windowsHide: true,
    timeout: 30_000, env: { ...process.env, ...GIT_ENV } });
  if (result.error || result.status === null) throw new Error("REBIND-GIT-UNAVAILABLE");
  return result;
}

/** tracked | modified | ignored | untracked; git failures other than "no" propagate. */
function boundPathStatus(dir, path) {
  const listed = git(dir, ["ls-files", "--error-unmatch", "--", path]);
  if (listed.status === 0) {
    const diff = git(dir, ["diff", "--quiet", "HEAD", "--", path]);
    if (diff.status === 0) return "tracked";
    if (diff.status === 1) return "modified";
    throw new Error("REBIND-GIT-DIFF");
  }
  if (listed.status !== 1) throw new Error("REBIND-GIT-LS-FILES");
  const ignored = git(dir, ["check-ignore", "-q", "--", path]);
  if (ignored.status === 0) return "ignored";
  if (ignored.status === 1) return "untracked";
  throw new Error("REBIND-GIT-CHECK-IGNORE");
}
const BOUND_PATH_CODE = Object.freeze({ ignored: "DWP-BOUND-PATH-IGNORED", untracked: "DWP-BOUND-PATH-UNTRACKED", modified: "DWP-BOUND-PATH-MODIFIED" });

/** Every `{path, sha256}` object the approved package references, whatever the package schema. */
function collectBoundReferences(value, refs, depth = 0) {
  if (depth > 12) return refs;
  if (Array.isArray(value)) { for (const item of value) collectBoundReferences(item, refs, depth + 1); return refs; }
  if (value === null || typeof value !== "object") return refs;
  if (typeof value.path === "string" && typeof value.sha256 === "string" && SHA256.test(value.sha256)) {
    if (refs.has(value.path) && refs.get(value.path) !== value.sha256) refs.conflict = true;
    else refs.set(value.path, value.sha256);
  }
  for (const child of Object.values(value)) collectBoundReferences(child, refs, depth + 1);
  return refs;
}

function gitCommonDir(dir) {
  const result = git(dir, ["rev-parse", "--git-common-dir"]);
  const printed = result.status === 0 ? result.stdout.trim() : "";
  return printed === "" ? null : realpathSync(resolve(dir, printed));
}

function lostArtifactPrerequisite(paths) {
  return {
    kind: "attended-prerequisite",
    prerequisite: "bound-artifact-lost",
    paths,
    summary: `The approval binds ${paths.join(", ")}, which is not present on this checkout. The Pipeline never regenerates a bound artifact and never treats it as equal: its bytes embed createdAt and host-observed digests, so they are not reproducible.`,
    options: [
      { id: "retrieve-from-origin", text: "Retrieve the exact bound bytes from the origin device where the plan was approved, commit the exact path(s), then run rebind-approval again." },
      { id: "re-approve", text: "Re-approve: repeat the design course and readiness so the evidence is produced again, then present the plan and sign the final approval once. A re-approval after a lost bound artifact reuses no earlier course or readiness evidence." },
    ],
  };
}

function changedDigestPrerequisite(paths) {
  return {
    kind: "attended-prerequisite",
    prerequisite: "final-plan-approval",
    paths,
    summary: `The bytes of ${paths.join(", ")} differ from the digests the approval binds, so this approval cannot be rebound. The final plan approval is the only signature and is requested once, after the plan is presented again; no signature was created or requested by this route.`,
  };
}

/**
 * @param {{dir: string, now?: () => string, deps?: object}} input
 * @returns {{exit: number, payload: object}} never logs; the caller prints the payload once.
 */
export function rebindApproval({ dir, now = () => new Date().toISOString(), deps = {} } = {}) {
  try {
    const root = realpathSync(resolve(dir));

    // 1. State preconditions: a recorded, sealed-in-State final approval bound to a package.
    const stateFile = inspectFile(root, STATE_PATH, true);
    if (stateFile.state !== "present") return refuse("DWP-REBIND-NO-APPROVAL");
    const stateSha256 = sha256(stateFile.bytes);
    let state;
    try { state = JSON.parse(stateFile.bytes.toString("utf8")); } catch { return refuse("DWP-REBIND-NO-APPROVAL"); }
    const approval = state?.planApproval;
    const authority = approval?.poGateAuthority;
    const packagePath = approval?.designWorkflowPackagePath;
    const packageSha256 = approval?.designWorkflowPackageSha256;
    if (state?.planApproved !== true || !authority || typeof authority !== "object"
      || !boundedRepoPath(authority.planPath) || !SHA256.test(authority.planSha256 ?? "")
      || !boundedRepoPath(authority.specPath) || !SHA256.test(authority.specSha256 ?? "")
      || !boundedRepoPath(packagePath) || !SHA256.test(packageSha256 ?? "")) return refuse("DWP-REBIND-NO-APPROVAL");

    // 2. PRD and Spec: the current tracked bytes against the digests the approval binds.
    const changed = [];
    const observed = {};
    for (const [role, path, expected] of [["prd", authority.planPath, authority.planSha256], ["spec", authority.specPath, authority.specSha256]]) {
      const file = inspectFile(root, path, true);
      if (file.state === "unsafe") return refuse("DWP-REBIND-ARTIFACT-UNSAFE", { path });
      const actual = file.state === "present" ? sha256(file.bytes) : null;
      observed[role] = actual;
      if (actual !== expected) changed.push({ role, path, expectedSha256: expected, observedSha256: actual });
    }
    if (changed.length > 0) {
      return { exit: 2, payload: { schema: REBIND_APPROVAL_SCHEMA, status: "digest-set-changed",
        changed, changedPaths: changed.map((entry) => entry.path), signaturesRequested: 0,
        attendedPrerequisite: changedDigestPrerequisite(changed.map((entry) => entry.path)) } };
    }

    // 3. The approved package: exact bytes first, then every artifact it references.
    const packageFile = inspectFile(root, packagePath, true);
    if (packageFile.state === "unsafe") return refuse("DWP-REBIND-ARTIFACT-UNSAFE", { path: packagePath });
    if (packageFile.state === "missing") {
      return refuse("DWP-REBIND-ARTIFACT-LOST", { lostPaths: [packagePath], attendedPrerequisite: lostArtifactPrerequisite([packagePath]) });
    }
    if (sha256(packageFile.bytes) !== packageSha256) return refuse("DWP-APPROVAL-DIGEST-DRIFT", { path: packagePath });
    let workflowPackage;
    try { workflowPackage = JSON.parse(packageFile.bytes.toString("utf8")); } catch { return refuse("DWP-REBIND-PACKAGE-INVALID"); }
    const candidate = workflowPackage?.candidate;
    if (!COMMIT.test(candidate?.commit ?? "")) return refuse("DWP-REBIND-PACKAGE-INVALID");
    const refs = collectBoundReferences(workflowPackage, new Map([[packagePath, packageSha256]]));
    if (refs.conflict === true) return refuse("DWP-REBIND-PACKAGE-INVALID");
    const boundSet = [...refs].map(([path, digest]) => ({ path, sha256: digest })).sort((a, b) => (a.path < b.path ? -1 : 1));
    if (boundSet.some((entry) => !boundedRepoPath(entry.path))) return refuse("DWP-REBIND-PACKAGE-INVALID");
    const lost = [];
    for (const entry of boundSet) {
      const file = inspectFile(root, entry.path);
      if (file.state === "unsafe") return refuse("DWP-REBIND-ARTIFACT-UNSAFE", { path: entry.path });
      if (file.state === "missing") lost.push(entry.path);
    }
    if (lost.length > 0) {
      return refuse("DWP-REBIND-ARTIFACT-LOST", { lostPaths: lost, attendedPrerequisite: lostArtifactPrerequisite(lost) });
    }
    // Present is not enough: the reader below takes bytes straight from disk, so a file copied
    // over from another device would otherwise verify while still not being tracked and clean.
    const untracked = [];
    for (const entry of boundSet) {
      const status = boundPathStatus(root, entry.path);
      if (status !== "tracked") untracked.push({ code: BOUND_PATH_CODE[status], path: entry.path });
    }
    if (untracked.length > 0) return refuse(untracked[0].code, { path: untracked[0].path, boundPathFailures: untracked });

    // 4. Candidate ancestry against the real repository history.
    const ancestry = git(root, ["merge-base", "--is-ancestor", candidate.commit, "HEAD"]);
    if (ancestry.status === 1) return refuse("DWP-REBIND-CANDIDATE-NOT-ANCESTOR", { candidateCommit: candidate.commit });
    if (ancestry.status !== 0) return refuse("DWP-REBIND-CANDIDATE-UNREACHABLE", { candidateCommit: candidate.commit });
    const head = git(root, ["rev-parse", "HEAD"]);
    const headTree = git(root, ["rev-parse", "HEAD^{tree}"]);
    if (head.status !== 0 || headTree.status !== 0) return refuse("DWP-REBIND-CANDIDATE-UNREACHABLE", { candidateCommit: candidate.commit });

    // 5. The shared approval verifier, with the device-local host-execution proof not required.
    const verification = verifyFinalDesignWorkflowApproval(root, state, authority,
      { planSha256: observed.prd, specSha256: observed.spec }, {
        ...(typeof deps.gitCandidate === "function" ? { gitCandidate: deps.gitCandidate } : {}),
        ...(deps.trustedAdvisorExecutablePath ? { trustedAdvisorExecutablePath: deps.trustedAdvisorExecutablePath } : {}),
        ...(typeof deps.verifyDesignReadinessHostExecution === "function"
          ? { verifyReadinessExecution: deps.verifyDesignReadinessHostExecution } : {}),
      }, REQUIRE_READINESS_EXECUTION_ON_REBIND);
    if (verification?.ok !== true) return refuse(typeof verification?.code === "string" ? verification.code : "DWP-REBIND-INTERNAL");

    // 6. The approval record must not have moved while it was being verified.
    const after = inspectFile(root, STATE_PATH, true);
    if (after.state !== "present" || sha256(after.bytes) !== stateSha256) return refuse("DWP-REBIND-STATE-DRIFT");

    // 7. The one write: a device-local receipt in private state.
    const receiptName = `${packageSha256}-${head.stdout.trim()}.json`;
    const receipt = {
      schema: REBIND_RECEIPT_SCHEMA,
      status: "verified",
      featureId: state.activeFeature?.id ?? null,
      approvalMode: approval.designWorkflowApproval?.mode ?? null,
      designWorkflowPackagePath: packagePath,
      designWorkflowPackageSha256: packageSha256,
      plan: { path: authority.planPath, sha256: authority.planSha256 },
      spec: { path: authority.specPath, sha256: authority.specSha256 },
      packageCandidate: { commit: candidate.commit, tree: candidate.tree ?? null },
      verifiedAtHead: { commit: head.stdout.trim(), tree: headTree.stdout.trim() },
      boundSet,
      stateSha256,
      readinessHostExecution: "not-required-on-rebind",
      verifiedAt: String(now()),
    };
    let written;
    try {
      const common = gitCommonDir(root);
      if (common === null) return refuse("DWP-REBIND-RECEIPT-UNAVAILABLE");
      const directory = ensurePrivateDirectory(join(common, ...RECEIPT_DIRECTORY));
      written = writePrivateFileNoReplaceAtomic(join(directory, receiptName), `${JSON.stringify(receipt, null, 2)}\n`);
    } catch { return refuse("DWP-REBIND-RECEIPT-UNAVAILABLE"); }
    return { exit: 0, payload: { schema: REBIND_APPROVAL_SCHEMA, status: "verified", featureId: receipt.featureId,
      designWorkflowPackageSha256: packageSha256, boundPathCount: boundSet.length,
      signaturesRequested: 0, stateChanged: false, readinessHostExecution: receipt.readinessHostExecution,
      receipt: { location: [...RECEIPT_DIRECTORY, receiptName].join("/"), created: written.created === true } } };
  } catch {
    return refuse("DWP-REBIND-INTERNAL");
  }
}
