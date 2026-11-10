#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * After a signed push of a consumer project: adds the push proof and the final Verify and Security records to the feature's audit bundle as new files, arms the commit of
 * exactly those files and prints the commit steps and the push. PO tile 2026-11-10: every evidence reaches the repository, also without a release, with no further signature.
 * The push guard admits exactly that one commit (`authorizeAuditProofFollowUp`). Never blocking: a project with nothing to carry gets a typed status and exit 0.
 *
 * Usage: audit-proof-followup.mjs --root <root> --remote <remote> --destination refs/heads/<branch>
 */
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { prepareAuditProofFollowUp } from "../lib/audit-proof-collection.mjs";
import { isConsumerReleaseProject, readPrivateApprovals, resolveCriticalApprovalCommonDir } from "../lib/critical-action-authorization.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { resolveProjectAuthorityPaths } from "../lib/project-authority.mjs";
import { armWriterCommitCapability, writerCommitSteps } from "../lib/writer-commit-capability.mjs";

const USAGE = "Usage: audit-proof-followup.mjs --root <root> --remote <remote> --destination refs/heads/<branch>";

function latestClosedFeature(root) {
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  if (authority.status !== "ready") return null;
  try {
    const closed = JSON.parse(readFileSync(join(root, authority.state), "utf8")).closedFeatures;
    const id = Array.isArray(closed) && closed.length > 0 ? closed[closed.length - 1]?.id : null;
    return typeof id === "string" ? id : null;
  } catch { return null; }
}

export function runAuditProofFollowUp({ root: rootInput, remote, destination }) {
  const root = realpathSync(resolve(rootInput));
  if (!isConsumerReleaseProject(root)) return { status: "not-applicable", reason: "only a consumer project carries a follow-up" };
  if (!/^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/u.test(destination ?? "") || !/^[A-Za-z0-9._-]{1,64}$/u.test(remote ?? "")) return { status: "usage", reason: USAGE };
  const git = (args) => { const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10_000 }); return result.status === 0 ? String(result.stdout).trim() : null; };
  const head = git(["rev-parse", "HEAD"]);
  if (head === null || git(["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${destination.slice("refs/heads/".length)}`]) !== head) return { status: "not-published", reason: "HEAD is not the published tip of this destination; run this right after the push" };
  const common = resolveCriticalApprovalCommonDir(root);
  if (common === null || !readPrivateApprovals(common, "push").some((entry) => entry.approval?.forCommit === head && entry.approval.remote === remote && entry.approval.destination === destination)) return { status: "no-push-approval", reason: "no push approval is recorded for HEAD and this destination" };
  const featureId = latestClosedFeature(root);
  if (featureId === null) return { status: "no-bundle" };
  const prepared = prepareAuditProofFollowUp({ root, featureId, approvedCommit: head, common, releaseProof: null, releaseApproval: null });
  if (prepared.status !== "written") return { status: prepared.status };
  const paths = prepared.files.map((file) => file.path);
  const push = `git push ${remote} HEAD:${destination}`;
  let armed = null;
  try { armed = armWriterCommitCapability({ rootDir: root, writer: "audit-proof-followup.mjs", rerun: "audit-proof-followup.mjs (the same command again)", files: prepared.files }); } catch { armed = null; }
  const message = armed?.message ?? "evidence: approval proofs and final records of the approved commit";
  const steps = armed?.steps ?? writerCommitSteps(paths, message);
  return { status: "written", bundleDir: prepared.bundleDir, paths, commit: { message, steps }, nextActions: [...steps, push] };
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) { process.stdout.write(`${USAGE}\n`); process.exit(0); }
  const value = (flag) => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined; };
  try {
    const result = runAuditProofFollowUp({ root: value("--root") ?? process.cwd(), remote: value("--remote") ?? "origin", destination: value("--destination") });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === "usage") process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "failed", code: error?.code ?? "AB-FOLLOWUP", message: String(error?.message ?? error).slice(0, 200) }, null, 2)}\n`);
  }
}
