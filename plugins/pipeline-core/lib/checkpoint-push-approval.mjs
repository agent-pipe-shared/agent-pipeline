// SPDX-License-Identifier: SUL-1.0
/**
 * The shared decision for a feature-checkpoint push (PUSHSIG; design
 * specs/sprint-alfred-epic/design/feature-branch-push-signature-design.md, sections 2, 3.2, 3.4).
 *
 * WHAT THIS IS FOR. A checkpoint push to a feature branch used to be admitted on clean
 * tree, exact HEAD, one committed intent trailer and architecture currency alone -- no
 * human signature at all. In `signature` mode the PO's rule is that every push needs a
 * commit-bound signature, not only a push to main. This module is the single place that
 * answers "is there a current signed approval for exactly this push?" so the in-session
 * guard and the git pre-push hook cannot drift apart. It adds no new approval kind and no
 * new subject field: the approval is the existing `push` kind, whose signed subject is
 * `{ sourceCommit, remote, destination, threatModel }`, produced by the existing
 * approve-push ceremony and verified by the existing `authorizeRecordedPush`, which this
 * module wraps and does not change.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *  - It reads no Verify, security or Critic evidence. A checkpoint is the lower-rigor lane;
 *    the protected, main, release and tag lanes keep their evidence chain untouched and
 *    never call this module.
 *  - It performs no input or output of its own: the caller supplies the parsed state record,
 *    the candidate and the clock, and runs git itself. The one side effect that can occur is
 *    the delegate's own trust-on-first-use pin of the PO's machine key (see
 *    `authorizeRecordedPush`), which is identical to what the protected lane already does.
 *  - It does not decide WHICH mode applies to a lane; `checkpointApprovalMode` classifies,
 *    and the caller consults the verifier in `signature` mode only. `chat` and `standing`
 *    keep today's behaviour (admitted without an approval).
 *
 * FAIL CLOSED. Every non-approval path returns `{ ok: false, code, reason }` with a typed
 * code, and nothing here throws: an unexpected fault becomes
 * `CHECKPOINT-APPROVAL-VERIFIER-FAULT`. A hook process that dies on an exception can read
 * as "no verdict" to its host, so the exception is converted here instead of left to travel.
 * Reasons are fixed texts. They never interpolate the remote, the destination or an error
 * message: the remote is any positional the command supplied and may be a
 * credential-bearing URL that must not reach a session transcript (SEC-01; the protected
 * lane in guard-push.mjs does the same).
 *
 * CALLER OBLIGATIONS (stated here because the wrong choice is silent):
 *  - `anchorDir` is the GOVERNED SESSION ROOT, not the repository being pushed. The trust
 *    anchor is only as strong as the guarantee that the agent cannot write it, and that
 *    guarantee covers the governed root's policy file, not a nested repository's. Omitting
 *    it falls back to `projectDir`, which is only correct where the two are the same root.
 *  - Pass the raw, untrimmed `git status --porcelain` text to `classifyCheckpointPorcelain`.
 *    Porcelain entries start with a significant space, and a trim turns an unstaged
 *    modification into what reads as a staged one (that is refused, which is safe but wrong).
 *  - The mode lookup (`criticalProofWaiverFor`) must use the same governed root.
 */
import { authorizeRecordedPush } from "./critical-action-authorization.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const VERIFIED = "PUSH-PROOF-VERIFIED";
const FAULT = "CHECKPOINT-APPROVAL-VERIFIER-FAULT";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmptyString = (value) => typeof value === "string" && value !== "";

/**
 * Fixed explanation per code. Static on purpose: see FAIL CLOSED above. The codes that start
 * with `PUSH-PROOF-` are the delegate's own and are passed through unchanged; unknown ones
 * (including the policy reader's) get the generic text.
 */
const REASONS = Object.freeze({
  "CHECKPOINT-APPROVAL-STATE-MISSING": "the pipeline state record is missing or unreadable, so no approval can be verified",
  "CHECKPOINT-APPROVAL-STALE": "no approval is recorded for this exact commit (none, or one for another commit)",
  "CHECKPOINT-APPROVAL-BINDING": "the recorded approval was given for a different remote or destination",
  [FAULT]: "the approval check could not complete, so it refuses rather than guesses",
  "PUSH-PROOF-INPUT-INVALID": "the commit, tree, remote, destination or clock supplied to the approval check is not usable",
  "PUSH-PROOF-TRUST-ANCHOR-MISSING": "no trusted operator key is available to verify the approval against",
  "PUSH-PROOF-RECORD-INCOMPLETE": "the recorded approval carries no complete signed proof",
  "PUSH-PROOF-COMMIT-MISMATCH": "the recorded approval was given for a different commit",
  "PUSH-PROOF-BINDING-MISMATCH": "the recorded approval was given for a different remote or destination",
  "PUSH-PROOF-THREAT-MODEL": "the push threat model changed (or is unreadable) since the approval was signed",
  "PUSH-PROOF-KIND": "the recorded proof is not a push approval",
  "PUSH-PROOF-EXPIRED": "the recorded approval has expired",
  "PUSH-PROOF-SUBJECT-MISMATCH": "the signed subject does not match this commit, tree, remote and destination",
  "PUSH-PROOF-STATE-AUTHORITY": "the approved plan and spec authority needed to check the signature is missing",
  "PUSH-PROOF-INTENT-MISMATCH": "the approval was signed under a different plan or spec authority",
  "PUSH-PROOF-TRUST-MISMATCH": "the approval was signed by a key that is not a trusted operator key",
  "PUSH-PROOF-SIGNATURE-MISMATCH": "the approval signature does not verify",
  "PUSH-PROOF-INVALID": "the approval proof is not valid",
  "PUSH-PROOF-DIGEST-MISMATCH": "the recorded proof digest does not match the recorded proof",
  "PUSH-PROOF-NOT-CONSUMED": "the approval was not recorded by the approval writer (no consumption entry)",
});
const GENERIC_REASON = "the recorded approval did not verify against the signed action";

function refuse(code) {
  return { ok: false, code, reason: Object.hasOwn(REASONS, code) ? REASONS[code] : GENERIC_REASON };
}

/**
 * Which approval mode governs a feature-checkpoint push.
 *
 * Mirrors the protected lane's own order (guard-push.mjs, the standing-approved auto-pass and
 * the waiver check): `standing` iff the gate says `standing-approved`; `chat` iff the proof is
 * genuinely stood down (`waived` with a null code); everything else -- the default, an
 * unreadable proof policy, a waiver that carries a fault code, missing or malformed input --
 * is `signature`. The strict mode is the fallback, so a policy-read fault can only tighten.
 *
 * @param {{pushGate?: {approval?: string}, waiver?: {waived?: boolean, code?: string|null}}} [input]
 *   `waiver` is the result of `criticalProofWaiverFor(<governed root>, "push")`.
 * @returns {"signature"|"chat"|"standing"}
 */
export function checkpointApprovalMode(input) {
  try {
    const { pushGate, waiver } = input ?? {};
    if (isObject(pushGate) && pushGate.approval === "standing-approved") return "standing";
    if (isObject(waiver) && waiver.waived === true && waiver.code == null) return "chat";
  } catch {
    // fall through to the strict mode
  }
  return "signature";
}

/**
 * Is there a current, signed `push` approval for exactly this push?
 *
 * Order (cheapest and most legible refusals first): the state record must be an object;
 * `pushApproval.lastApproved.forCommit` must equal the candidate commit; the recorded remote
 * and destination must equal the push's; then `authorizeRecordedPush` verifies the detached
 * Ed25519 signature over an intent rebuilt from what is observed (expiry, subject digest,
 * plan/spec authority, trust anchor, threat-model bytes still equal to the signed digest,
 * consumption ledger) and its `PUSH-PROOF-*` code is passed through on refusal.
 *
 * A record that is absent is reported as `CHECKPOINT-APPROVAL-STALE` ("none, or one for
 * another commit"), the same missing-or-stale reading the protected lane uses.
 *
 * @param {{projectDir: string, anchorDir?: string, state: object,
 *          candidate: {commit: string, tree: string}, remote: string, destination: string,
 *          now: string, machinePlaneDeps?: object}} [input]
 *   `machinePlaneDeps` is the delegate's injection point for the machine-key provenance gate;
 *   production callers omit it, tests substitute a fixture home.
 * @returns {{ok: true, proofSha256: string, keyReference: string}
 *          | {ok: false, code: string, reason: string}}
 */
export function checkCheckpointPushApproval(input) {
  try {
    const { projectDir, anchorDir, state, candidate, remote, destination, now, machinePlaneDeps } = input ?? {};
    if (!isObject(state)) return refuse("CHECKPOINT-APPROVAL-STATE-MISSING");

    const commit = candidate?.commit;
    // The binding comparisons only mean something for usable operands; unusable ones fall
    // through to the delegate, which refuses them with its own typed input code.
    if (nonEmptyString(commit) && nonEmptyString(remote) && nonEmptyString(destination)) {
      const approval = state.pushApproval?.lastApproved;
      if (!isObject(approval) || approval.forCommit !== commit) return refuse("CHECKPOINT-APPROVAL-STALE");
      if (approval.remote !== remote || approval.destination !== destination) return refuse("CHECKPOINT-APPROVAL-BINDING");
    }

    const verdict = authorizeRecordedPush({
      projectDir, anchorDir, state, candidate, remote, destination, now, machinePlaneDeps,
    });
    if (verdict?.authorized !== true || verdict.code !== VERIFIED) {
      const refusedCode = verdict?.authorized === false && nonEmptyString(verdict.code) && verdict.code !== VERIFIED
        ? verdict.code
        : FAULT;
      return refuse(refusedCode);
    }

    // The digest of the proof that was just verified (the delegate checked it equals the
    // digest of the recorded proof object), reported so a caller can audit WHICH approval
    // admitted the push without re-deriving it.
    const proofSha256 = state.pushApproval?.lastApproved?.criticalProof?.proofSha256;
    if (typeof proofSha256 !== "string" || !SHA256.test(proofSha256) || !nonEmptyString(verdict.keyReference)) {
      return refuse(FAULT);
    }
    return { ok: true, proofSha256, keyReference: verdict.keyReference };
  } catch {
    return refuse(FAULT);
  }
}

/**
 * Normalise the caller's state-record paths to the form `git status --porcelain` prints:
 * forward slashes, repository-relative, no leading `./`. Anything that is not a plain
 * relative path is dropped, so a malformed entry can only remove the exemption, never widen it.
 */
function normalizedStatePaths(stateRelPaths) {
  const list = typeof stateRelPaths === "string" ? [stateRelPaths] : Array.isArray(stateRelPaths) ? stateRelPaths : [];
  const allowed = new Set();
  for (const candidate of list) {
    if (typeof candidate !== "string") continue;
    const path = candidate.replace(/\\/gu, "/").replace(/^(?:\.\/)+/u, "");
    if (path === "" || path.startsWith("/") || /^[A-Za-z]:/u.test(path)) continue;
    if (path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) continue;
    allowed.add(path);
  }
  return allowed;
}

/**
 * Classify `git status --porcelain` output for the checkpoint clean-tree check (design 3.4).
 *
 * `approve-push` rewrites the tracked state record AFTER the signed subject was computed, so
 * the record can never be inside the commit it covers; committing it would move HEAD and stale
 * the very approval it records. The checkpoint lane in `signature` mode therefore tolerates
 * exactly one dirty entry: the tracked state record, modified in the work tree and not staged.
 * The push transmits the commit, not the work tree, and a forged record still fails the
 * signature check.
 *
 *  - `clean`: the porcelain output has no entries at all.
 *  - `approvalRecordOnly`: exactly one entry, and it is ` M <a named state path>`.
 *
 * The two are mutually exclusive, and `clean` stays the STRICT answer on purpose: a caller
 * that wants the exemption has to ask for it (`clean || (signatureMode && approvalRecordOnly)`),
 * so a caller in any other mode that reads only `clean` keeps today's behaviour. Everything
 * else is `{ clean: false, approvalRecordOnly: false }`: another modified file, an untracked
 * file, a staged, added, deleted, renamed or conflicted state record, a second entry, a path
 * that merely resembles the record, or text that cannot be parsed. Never throws.
 *
 * @param {string} porcelainText the raw, untrimmed output of `git status --porcelain`
 * @param {string|string[]} stateRelPaths the project's state-record path(s), repository-relative
 * @returns {{clean: boolean, approvalRecordOnly: boolean}}
 */
export function classifyCheckpointPorcelain(porcelainText, stateRelPaths) {
  try {
    if (typeof porcelainText !== "string") return { clean: false, approvalRecordOnly: false };
    const lines = porcelainText.split(/\r?\n/u);
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    if (lines.length === 0) return { clean: true, approvalRecordOnly: false };
    if (lines.length === 1 && lines[0].startsWith(" M ") && normalizedStatePaths(stateRelPaths).has(lines[0].slice(3))) {
      return { clean: false, approvalRecordOnly: true };
    }
  } catch {
    // fall through to "not clean"
  }
  return { clean: false, approvalRecordOnly: false };
}
