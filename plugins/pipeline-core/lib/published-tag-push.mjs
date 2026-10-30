// SPDX-License-Identifier: SUL-1.0
/**
 * published-tag-push -- the ONE predicate both push gates use to decide that a TAG push needs no Verify evidence and no push
 * approval (N27a / D206): hooks/guard-push.mjs (the agent's own push) and the generated pre-push hook
 * (scripts/pre-push-hook-install.mjs renderImpl, which imports this module the way it imports the shared approval overlay).
 *
 * Why it exists: a consumer rule tags the pre-merge `main` commit `rollback/<date>-<block>` before a fast-forward. That commit
 * is already published, so pushing the tag publishes nothing new; yet both gates asked for Verify evidence and an approval
 * bound to that old commit, which can neither be met nor make sense.
 *
 * The rule (everything else keeps its gate exactly as before):
 *   - the pushed ref is under refs/tags/, and is NOT a release tag (the strict grammar v<n>.<n>.<n>[-beta.<n>], or anything
 *     else that starts like one: a release-looking name is never relaxed);
 *   - the tag's target, peeled to a commit (an annotated tag object is peeled), is reachable from a remote-tracking ref of
 *     the SAME remote: `refs/remotes/<remote>/*`.
 *
 * TRUST ASSUMPTION, stated rather than hidden: a local remote-tracking ref is taken as the record of what that remote holds.
 * It is what a push or fetch wrote there; it is not a live query of the remote (no network is used). A stale or manually
 * written remote-tracking ref therefore widens the pass only to commits a push or fetch once recorded -- never to a commit
 * that was never on that remote through git. A remote addressed by URL, an unconfigured remote name and an option-shaped
 * remote cannot be matched to a remote-tracking namespace, so they never pass (fail closed). Publication on another remote
 * does not count. A release tag is never relaxed, published or not.
 */
import { spawnSync } from "node:child_process";

const TAG_REF_PREFIX = "refs/tags/";
const RELEASE_TAG_NUMERIC = "(?:0|[1-9]\\d*)";
/** The strict release-tag grammar; mirrors ruleset-freshness.mjs's `validTag` (same numeric definition, no leading zeros). */
export const RELEASE_TAG_REF = new RegExp(
  `^refs/tags/v${RELEASE_TAG_NUMERIC}\\.${RELEASE_TAG_NUMERIC}\\.${RELEASE_TAG_NUMERIC}(?:-beta\\.${RELEASE_TAG_NUMERIC})?$`,
  "u",
);
const RELEASE_LOOKING_TAG_REF = /^refs\/tags\/v[0-9]/u;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const OID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/iu;

/** True for every tag the relaxation must never touch: the release grammar and anything release-looking. */
export function isGatedTagRef(tagRef) {
  return typeof tagRef === "string" && (RELEASE_TAG_REF.test(tagRef) || RELEASE_LOOKING_TAG_REF.test(tagRef));
}

function git(projectDir, args) {
  const result = spawnSync("git", ["-C", projectDir, ...args], { encoding: "utf8", timeout: 10000 });
  return result.status === 0 && typeof result.stdout === "string" ? result.stdout.trim() : null;
}

/**
 * @param {{projectDir: string, remote: string, tagRef: string, target: string}} input `target` is the pushed object (a commit
 *   or an annotated tag object); `tagRef` the full ref name being written on the remote.
 * @returns {{passes: boolean, code: string, reason: string, commit?: string}} `passes` is true only for PTP-PUBLISHED.
 */
export function classifyPublishedTagPush({ projectDir, remote, tagRef, target }) {
  const refuse = (code, reason) => ({ passes: false, code, reason });
  if (typeof tagRef !== "string" || !tagRef.startsWith(TAG_REF_PREFIX) || tagRef.length === TAG_REF_PREFIX.length) {
    return refuse("PTP-NOT-A-TAG", "the pushed ref is not a tag");
  }
  if (isGatedTagRef(tagRef)) return refuse("PTP-RELEASE-TAG", "a release tag is never relaxed");
  if (typeof remote !== "string" || !REMOTE_NAME.test(remote) || remote.includes("..")
    || git(projectDir, ["config", "--get", `remote.${remote}.url`]) === null) {
    return refuse("PTP-REMOTE-NOT-A-NAME", "the remote is not a configured remote name, so no remote-tracking namespace belongs to it");
  }
  if (typeof target !== "string" || target === "" || target.startsWith("-")) return refuse("PTP-COMMIT-UNRESOLVED", "the tag target is not a commit");
  const commit = git(projectDir, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${target}^{commit}`]);
  if (commit === null || !OID.test(commit)) return refuse("PTP-COMMIT-UNRESOLVED", "the tag target does not resolve to a commit locally");
  const containing = git(projectDir, ["for-each-ref", "--count=1", "--format=%(refname)", "--contains", commit, `refs/remotes/${remote}/`]);
  if (containing === null || containing === "") return refuse("PTP-UNPUBLISHED", "the tag target is not reachable from any remote-tracking ref of this remote");
  return { passes: true, code: "PTP-PUBLISHED", reason: "the tag target is already reachable from a remote-tracking ref of this remote", commit };
}
