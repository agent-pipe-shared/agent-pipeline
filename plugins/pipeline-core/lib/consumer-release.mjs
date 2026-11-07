// SPDX-License-Identifier: SUL-1.0
/**
 * G20-42 (candidate 20): the consumer release. For a consumer project a release is a version tag (PO decision 2026-11-07). This module holds the
 * observations behind the consumer mode of scripts/release-preflight-cli.mjs; the project-shape test and the tag authorization the push guard
 * reads live in lib/critical-action-authorization.mjs (a kernel file the guard already imports).
 *
 * `firstConsumerReleaseBlocker` answers one question: is the closed, pushed feature ready for the one PO release approval? It returns the FIRST
 * missing step as { code, message, repair } -- the repair is a command the agent can run -- or null. Nothing is written here.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { authorizeRecordedChatPush, authorizeRecordedPush, withPrivateCriticalApprovals } from "./critical-action-authorization.mjs";
import { criticalProofWaiverFor } from "./critical-human-proof-policy.mjs";
import { resolveProjectAuthorityPaths } from "./project-authority.mjs";
import { securityGateNotConfiguredRefusal } from "./security-close-status.mjs";

export const CONSUMER_VERSION_INITIAL = "0.1.0";
export const CONSUMER_RELEASE_RECORD_PATH = "evidence/release-preflight.json";
export const CONSUMER_RELEASE_NOTES_PATH = "RELEASE-NOTES.md";
export const CONSUMER_RELEASE_PREFLIGHT_ID = "consumer-release";
/** A consumer project has no retention policy file; the digest of this label stands in so the record shape stays the Pipeline's. */
export const CONSUMER_RETENTION_POLICY_SHA256 = createHash("sha256").update("pipeline.consumer-release-retention.v1").digest("hex");
export const CONSUMER_RELEASE_REMOTE = "origin";
export const CONSUMER_RELEASE_DESTINATION = "refs/heads/main";
const SEMVER = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
/** Checks push-prepare appends AFTER readiness for the signature route; they concern the push ceremony, not this release. */
const PUSH_CEREMONY_CHECKS = new Set(["subject-hash", "active-feature", "approval-directory"]);

const script = (name) => fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
const word = (value) => (/^[\w@%+=:,./\\-]+$/u.test(value) ? value : JSON.stringify(value));

function gitOut(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10_000 });
  return result.status === 0 ? String(result.stdout).trim() : null;
}

/** The repair for a missing VERSION: the release preparation creates it, create-only, and the agent commits it. */
export function consumerVersionRepair(root) {
  return `node ${word(script("release-preflight-cli.mjs"))} --init-version --root ${word(root)} (creates VERSION ${CONSUMER_VERSION_INITIAL}, never overwrites), then commit it`;
}

export function readConsumerVersion(root) {
  const path = join(root, "VERSION");
  if (!existsSync(path)) return { ok: false, code: "RPC-VERSION-MISSING", message: "this project has no tracked VERSION file", repair: consumerVersionRepair(root) };
  const version = readFileSync(path, "utf8").trim();
  if (!SEMVER.test(version)) return { ok: false, code: "RPC-VERSION", message: `VERSION must hold one stable version such as ${CONSUMER_VERSION_INITIAL} (found ${JSON.stringify(version.slice(0, 40))})`, repair: "correct VERSION and commit it" };
  return { ok: true, version };
}

/** prd/spec/acceptance/result of the feature package, read from its registered manifest (the consumer has no separate lifecycle.documents). */
export function consumerManifestDocuments(manifest) {
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const documents = {};
  for (const kind of ["prd", "spec", "acceptance", "result"]) {
    const entry = artifacts.find((artifact) => artifact?.class === kind && typeof artifact.path === "string");
    if (entry === undefined) return { ok: false, kind };
    documents[kind] = entry.path;
  }
  return { ok: true, documents };
}

function readClosedFeatureIds(root) {
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  if (authority.status !== "ready") return null;
  try {
    const state = JSON.parse(readFileSync(join(root, authority.state), "utf8"));
    return { state, ids: Array.isArray(state.closedFeatures) ? state.closedFeatures.map((entry) => entry?.id) : [] };
  } catch {
    return null;
  }
}

/**
 * @param {{root: string, featureId: string, version: string, candidate: {commit: string, tree: string}, pushReport: object, now?: string}} input
 *   `pushReport` is push-prepare's own report for origin/refs/heads/main (the SAME Verify, Critic-bound Verify and security checks the push used).
 */
export function firstConsumerReleaseBlocker({ root, featureId, version, candidate, pushReport, now = new Date().toISOString() }) {
  const push = script("push-prepare.mjs");
  // 1 the feature is closed
  const closed = readClosedFeatureIds(root);
  if (closed === null || !closed.ids.includes(featureId)) {
    return { code: "RPC-CONSUMER-NOT-CLOSED", message: `feature ${featureId} is not in the State's closedFeatures`,
      repair: `close it with the close-feature skill (node ${word(script("close-coordinator.mjs"))} plan-start --root ${word(root)} --lifecycle <id> --actor PO --close-intent durable-stop, then each action it returns)` };
  }
  // 2 the release-notes entry is committed (written with the feature, so the Critic reviewed it and the Critic-bound Verify carries it)
  const notes = gitOut(root, ["show", `${candidate.commit}:${CONSUMER_RELEASE_NOTES_PATH}`]);
  const heading = new RegExp(`^##\\s+v${version.replaceAll(".", "\\.")}\\s*$`, "mu");
  if (notes === null || !heading.test(notes) || !notes.includes(featureId)) {
    return { code: "RPC-CONSUMER-RELEASE-NOTES", message: `${CONSUMER_RELEASE_NOTES_PATH} has no committed "## v${version}" entry naming feature ${featureId}`,
      repair: `write that entry (feature id, title, the acceptance criteria met, the version) in ${CONSUMER_RELEASE_NOTES_PATH}, commit it, run the Critic-bound push Verify again (verify-evidence-producer.mjs --mode release with the Critic inputs, push-prepare names the command) and push` };
  }
  // 3 Verify green, the Critic carried to this candidate, security evidence per calibration: push-prepare's own checks, not a second reader
  const failed = (pushReport?.checks ?? []).find((check) => check.ok !== true && !PUSH_CEREMONY_CHECKS.has(check.id));
  if (failed !== undefined) {
    return { code: "RPC-CONSUMER-EVIDENCE", message: `${failed.id}: ${String(failed.message).split("\n")[0]}`,
      repair: String(failed.remedy ?? `node ${word(push)} --root ${word(root)} --by <name> --remote ${CONSUMER_RELEASE_REMOTE} --destination ${CONSUMER_RELEASE_DESTINATION}`).split("\n")[0] };
  }
  // 3b the security close status is reported per calibration (G20-25): a critical calibration without a configured gate has no security status
  const securityRefusal = (pushReport?.checks ?? []).some((check) => check.id === "security-evidence") ? null : securityGateNotConfiguredRefusal(root, "the consumer release");
  if (securityRefusal !== null) {
    return { code: "RPC-CONSUMER-SECURITY", message: securityRefusal.split(": ")[0], repair: securityRefusal.slice(securityRefusal.indexOf("Run this command")) };
  }
  // 4 the push approval for exactly this candidate exists
  let approvalOk = false;
  let approvalCode = "unavailable";
  try {
    const authority = resolveProjectAuthorityPaths({ rootDir: root });
    const stateRaw = authority.status === "ready" ? JSON.parse(readFileSync(join(root, authority.state), "utf8")) : {};
    const state = withPrivateCriticalApprovals(stateRaw, root);
    const waived = criticalProofWaiverFor(root, "push").waived === true;
    const input = { projectDir: root, anchorDir: root, state, candidate, remote: CONSUMER_RELEASE_REMOTE, destination: CONSUMER_RELEASE_DESTINATION };
    const decision = waived ? authorizeRecordedChatPush(input) : authorizeRecordedPush({ ...input, now });
    approvalOk = decision.authorized === true;
    approvalCode = decision.code;
  } catch { /* unreadable approval state reads as no approval */ }
  if (!approvalOk) {
    return { code: "RPC-CONSUMER-PUSH-APPROVAL", message: `no push approval is recorded for candidate ${candidate.commit.slice(0, 12)} (${approvalCode})`,
      repair: `node ${word(push)} --root ${word(root)} --by <name> --remote ${CONSUMER_RELEASE_REMOTE} --destination ${CONSUMER_RELEASE_DESTINATION}, then the approve-push line it prints` };
  }
  // 5 the candidate is on the published channel (ADR-0078 D5: origin/main)
  const published = spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", candidate.commit, `refs/remotes/${CONSUMER_RELEASE_REMOTE}/main`], { encoding: "utf8", timeout: 10_000 });
  if (published.status !== 0) {
    return { code: "RPC-CONSUMER-NOT-PUSHED", message: `candidate ${candidate.commit.slice(0, 12)} is not on refs/remotes/${CONSUMER_RELEASE_REMOTE}/main`,
      repair: `git push ${CONSUMER_RELEASE_REMOTE} HEAD:${CONSUMER_RELEASE_DESTINATION} (the approved push; the release tags what is already published)` };
  }
  // 6 the version tag is free or already names this commit
  const tagged = gitOut(root, ["rev-parse", "--verify", "--quiet", `refs/tags/v${version}^{commit}`]);
  if (tagged !== null && tagged !== "" && tagged !== candidate.commit) {
    return { code: "RPC-CONSUMER-TAG-EXISTS", message: `tag v${version} already names ${tagged.slice(0, 12)}, not this candidate`, repair: "raise VERSION to the next version, commit it and release that" };
  }
  return null;
}
