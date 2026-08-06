// SPDX-License-Identifier: SUL-1.0
/**
 * May an externally-effective action proceed on the strength of a recorded human
 * approval? Covers the two routes a session can actually reach: a raw `git push`, and
 * the deploy-triggering push the release branch of guard-push gates.
 *
 * WHY THIS MODULE EXISTS
 *
 * Until now the push answer was "never". `gates.push.approval: required` with
 * `gates.push_approval: signature` reached a branch in guard-push.mjs that refused every
 * agent-issued push outright and pointed at the fixed publication executor. That was
 * safe and, for this repository's actual workflow, unusable: publication is a release
 * path, and an ordinary feature branch — or `main` — needs to be pushable without one.
 * The PO's requirement was explicit: every session, every branch, `main` included, when
 * the human has cleared it.
 *
 * The naive way to grant that is to believe `pushApproval.lastApproved` — it already
 * names the commit, the remote and the destination. That would have been wrong, and the
 * reason is worth stating plainly rather than discovering later: `project/pipeline-state.json`
 * is a mutable working-tree file. It is protected against an agent's Edit/Write by
 * guard-lifecycle-ready, but protection is a guard, and a guard is not a signature.
 * Believing that record would have turned `signature` into `chat` without anybody
 * changing a setting — the precise class of silent self-weakening the T2..T5 Critic
 * rounds spent this sprint closing in the neighbouring module.
 *
 * So this module verifies rather than believes. It rebuilds, from what the guard can
 * OBSERVE about the action that is actually happening, the exact subject digest the key
 * holder signed, rebuilds the approval intent around it, and checks the detached Ed25519
 * signature against a key identity committed in `project/critical-human-proof.json`.
 * That file is gate-strength protected (GS-2): the agent can reach it through neither
 * the write lane nor the shell lane. An agent that rewrote the whole state record would
 * therefore have to produce a signature under the operator's key to gain anything, which
 * is the property `signature` mode was always supposed to have and, on these routes, now
 * does.
 *
 * THE DEPLOY ROUTE IS PART OF THIS, NOT A SEQUEL. Hardening only the push would have
 * been the more visible half of one door. `checkDeployApprovals` matched a recorded
 * approval on `forArtifact`/`forEnvironment`/`!usedAt` alone and never looked at
 * `criticalProof` at all — so on the release path a state record was not merely believed,
 * its proof was not even read. The same rebuild-and-verify applies there, over that
 * route's own signed subject (`{artifact, environment}`).
 *
 * CONSEQUENCE THAT CHANGES A WORKFLOW, stated rather than buried: the signed intent
 * covers the candidate commit AND tree. Verifying it therefore binds a deploy approval to
 * the commit it was approved for. Previously an approval for artifact X survived
 * arbitrary later commits. It no longer does, and that is deliberate — an approval for
 * one set of bytes was never meant to authorize a different set.
 *
 * WHAT IT DOES NOT CLAIM. The private key is what protects the action; nothing here
 * defends against an operator who signs the wrong thing, and nothing here applies where
 * the project has deliberately stood the proof down — `chat` mode for push (ADR-0056) or
 * an explicit `.v2` waiver for deploy (ADR-0055) — where a recorded approval is an
 * attribution rather than a proof. Publication keeps its own external-verification route
 * through the fixed executor and is untouched here.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { criticalActionSha256, criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import { readCriticalHumanProofPolicy } from "./critical-human-proof-policy.mjs";
import { createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";

const OID = /^[a-f0-9]{40,64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_BOUND_ARTIFACT_BYTES = 1_048_576;

const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * The digest of a repository-relative artifact the approval bound.
 *
 * The path arrives inside the state record, so it is treated as untrusted input: it must
 * be repository-relative, must land inside the project, and must be an ordinary file of
 * bounded size. A path that leaves the repository is refused rather than resolved — the
 * same containment rule `boundRepositoryArtifact` applies on the writing side, restated
 * here because a verifier that trusted the writer's containment would be trusting the
 * record again.
 *
 * Be exact about the symlink half, because the first version of this comment was not
 * (T6 Critic, F5). Containment is LEXICAL — `resolve`/`relative`/`startsWith` — and only
 * the FINAL component is `lstat`ed. A path whose intermediate directory is a symlink out
 * of the repository therefore passes containment and is read through that symlink.
 *
 * That is left as-is rather than hardened, and the reason is worth stating so nobody
 * "fixes" it into a false sense of strength later: both the path and its digest live
 * inside the signed subject, so neither is choosable without the private key. Hardening
 * here would defend against an attacker who, by construction, has already won. What was
 * actually wrong was the comment claiming a protection the code does not implement.
 */
function boundArtifactDigest(projectDir, relativePath) {
  if (typeof relativePath !== "string" || relativePath === "" || isAbsolute(relativePath)) return null;
  const root = resolve(projectDir);
  const path = resolve(root, relativePath);
  const inside = relative(root, path);
  if (inside === "" || inside.startsWith(`..${sep}`) || inside === ".." || !path.startsWith(`${root}${sep}`)) return null;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BOUND_ARTIFACT_BYTES) return null;
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * The committed key identity, or a typed refusal. Shared by both routes.
 *
 * `anchorDir` is the GOVERNED SESSION ROOT, and it is a separate parameter from the
 * repository the action targets for a reason that cost a blocker to learn. The first
 * version read the anchor from the target — `binding.projectDir`, i.e. whatever
 * `git -C <path> push` named. But the entire justification for trusting the anchor is
 * that `project/critical-human-proof.json` is gate-strength protected, and GS-2 matches an
 * EXACT repository-relative path against the session root: `<root>/sub/project/…` is not a
 * gate-strength path at all. An agent that creates a nested repository could therefore mint
 * its own anchor, sign with its own key, and watch the guard verify it — measured, not
 * theorised: PG12s13 and PG12s14 both exited 0 before this change.
 *
 * Anchoring to the session root does not forbid a cross-repository push. It requires that
 * such a push carry a signature under the GOVERNING project's key, over the target's
 * candidate — which is the property "the human cleared this" was always supposed to mean.
 */
function trustAnchorFor(anchorDir, prefix) {
  const policy = readCriticalHumanProofPolicy(anchorDir);
  if (!policy.ok) return { ok: false, code: policy.code };
  return policy.trustAnchor === null
    ? { ok: false, code: `${prefix}-TRUST-ANCHOR-MISSING` }
    : { ok: true, anchor: policy.trustAnchor, policy };
}

/**
 * The half both routes share: a recorded proof is accepted only if the signature
 * verifies against the committed anchor over an intent rebuilt from the OBSERVED
 * subject. `subject` is the caller's route-specific object; everything else is uniform.
 */
function verifySignedAction({ state, kind, prefix, candidate, subject, recorded, anchor, now }) {
  if (!object(recorded) || !object(recorded.proof) || !object(recorded.action)
    || !SHA256.test(recorded.proofSha256 ?? "") || !SHA256.test(recorded.intentSha256 ?? "")) {
    return { ok: false, code: `${prefix}-RECORD-INCOMPLETE` };
  }
  if (recorded.action.kind !== kind) return { ok: false, code: `${prefix}-KIND` };

  // Expiry is measured against the action, not against the approval: a proof that was
  // valid when it was signed is not valid indefinitely afterwards.
  const expiresAt = recorded.action.expiresAt;
  if (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))) {
    return { ok: false, code: `${prefix}-RECORD-INCOMPLETE` };
  }
  if (Date.parse(expiresAt) < Date.parse(now)) return { ok: false, code: `${prefix}-EXPIRED` };

  // The subject, rebuilt from what is observably happening. Everything the guard can see
  // about this action has to reproduce the digest inside the signed action.
  let expectedSubject;
  try {
    expectedSubject = criticalActionSubjectSha256({
      kind,
      candidate: { commit: candidate.commit, tree: candidate.tree },
      subject,
    });
  } catch {
    return { ok: false, code: `${prefix}-RECORD-INCOMPLETE` };
  }
  if (recorded.action.subjectSha256 !== expectedSubject) return { ok: false, code: `${prefix}-SUBJECT-MISMATCH` };

  // The intent, rebuilt around that action. This is where the plan/spec authority and the
  // candidate tree enter: an approval signed under a different plan, or for a different
  // tree at the same commit, cannot be replayed here.
  const gate = state?.planApproval?.poGateAuthority;
  let intent;
  try {
    intent = createPoApprovalIntent({
      kind: "critical-action",
      featureId: state?.activeFeature?.id,
      planSha256: gate?.planSha256,
      specSha256: gate?.specSha256,
      candidate: { commit: candidate.commit, tree: candidate.tree },
      policyRevision: "critical-human-proof-v1",
      subjectSha256: criticalActionSha256(recorded.action),
      decision: "approved",
    });
  } catch {
    return { ok: false, code: `${prefix}-STATE-AUTHORITY` };
  }
  if (intent.sha256 !== recorded.intentSha256) return { ok: false, code: `${prefix}-INTENT-MISMATCH` };

  const verified = verifyPoApprovalProof({ intent, trustPolicy: anchor, proof: recorded.proof });
  if (!verified.verified) {
    return {
      ok: false,
      code: verified.code === "PO-APPROVAL-TRUST-MISMATCH" ? `${prefix}-TRUST-MISMATCH`
        : verified.code === "PO-APPROVAL-PROOF-MISMATCH" ? `${prefix}-SIGNATURE-MISMATCH`
          : `${prefix}-INVALID`,
    };
  }

  // The recorded digest must be the digest OF the recorded proof, otherwise a ledger or
  // usage check could be pointed at an entry for a different object.
  if (verified.proofSha256 !== recorded.proofSha256
    || createHash("sha256").update(canonical(recorded.proof)).digest("hex") !== recorded.proofSha256) {
    return { ok: false, code: `${prefix}-DIGEST-MISMATCH` };
  }
  return { ok: true };
}

function validCandidate(candidate) {
  return object(candidate) && OID.test(candidate.commit ?? "") && OID.test(candidate.tree ?? "")
    && candidate.commit !== candidate.tree;
}

const validNow = (now) => typeof now === "string" && Number.isFinite(Date.parse(now));

/**
 * @param {{projectDir: string, state: object, candidate: {commit: string, tree: string},
 *          remote: string, destination: string, now: string}} input
 * @returns {{authorized: true, code: "PUSH-PROOF-VERIFIED", keyReference: string}
 *          | {authorized: false, code: string}}
 */
export function authorizeRecordedPush({ projectDir, anchorDir = projectDir, state, candidate, remote, destination, now } = {}) {
  const prefix = "PUSH-PROOF";
  if (typeof projectDir !== "string" || typeof anchorDir !== "string" || !object(state) || !validCandidate(candidate)
    || typeof remote !== "string" || remote === ""
    || typeof destination !== "string" || destination === "" || !validNow(now)) {
    return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  }

  // The key identity is read first: every later check is meaningless without an anchor to
  // verify against, and "no anchor" must never read as "no check needed". It comes from the
  // governed session root, never from the pushed repository -- see `trustAnchorFor`.
  const trust = trustAnchorFor(anchorDir, prefix);
  if (!trust.ok) return { authorized: false, code: trust.code };

  const approval = state?.pushApproval?.lastApproved;
  const recorded = approval?.criticalProof;
  if (!object(approval) || !object(recorded) || !object(approval.threatModel)) {
    return { authorized: false, code: `${prefix}-RECORD-INCOMPLETE` };
  }

  // The guard-visible binding. These fields are what a human reads in the record, so a
  // mismatch is reported as a binding failure rather than as a digest failure the
  // operator would have to decode. The signature check below re-derives the same facts,
  // which is what catches a record whose fields were rewritten to agree.
  if (approval.forCommit !== candidate.commit) return { authorized: false, code: `${prefix}-COMMIT-MISMATCH` };
  if (approval.remote !== remote || approval.destination !== destination) {
    return { authorized: false, code: `${prefix}-BINDING-MISMATCH` };
  }

  // The threat model is inside the signed subject, so its CURRENT bytes must still be the
  // ones that were signed. Editing it after approval revokes the authorization.
  const threatModelDigest = boundArtifactDigest(projectDir, approval.threatModel.path);
  if (threatModelDigest === null || threatModelDigest !== approval.threatModel.sha256) {
    return { authorized: false, code: `${prefix}-THREAT-MODEL` };
  }

  const verified = verifySignedAction({
    state, kind: "push", prefix, candidate, recorded, anchor: trust.anchor, now,
    subject: {
      sourceCommit: candidate.commit,
      remote,
      destination,
      threatModel: { path: approval.threatModel.path, sha256: approval.threatModel.sha256 },
    },
  });
  if (!verified.ok) return { authorized: false, code: verified.code };

  // approve-push writes the approval and its consumption entry in one transaction, so a
  // record whose proof was never consumed did not come from that writer.
  const ledger = state?.criticalProofConsumption;
  if (!Array.isArray(ledger)
    || !ledger.some((entry) => object(entry) && entry.proofSha256 === recorded.proofSha256 && entry.kind === "push")) {
    return { authorized: false, code: `${prefix}-NOT-CONSUMED` };
  }

  return { authorized: true, code: `${prefix}-VERIFIED`, keyReference: trust.anchor.keyReference };
}

/**
 * The release route's equivalent: is there a recorded, unused deploy approval for this
 * artifact and environment whose detached proof verifies against the committed anchor?
 *
 * Deliberately NOT modelled on the push ledger: `approve-deploy` writes no
 * `criticalProofConsumption` entry — `consume-deploy`'s `usedAt` mark is that route's
 * single-use control, so requiring a ledger entry here would refuse every approval the
 * writer has ever produced.
 *
 * @param {{projectDir: string, state: object, candidate: {commit: string, tree: string},
 *          artifact: string, environment: string, now: string}} input
 * @returns {{authorized: true, code: "DEPLOY-PROOF-VERIFIED", keyReference: string}
 *          | {authorized: false, code: string}}
 */
export function authorizeRecordedDeploy({ projectDir, anchorDir = projectDir, state, candidate, artifact, environment, now } = {}) {
  const prefix = "DEPLOY-PROOF";
  if (typeof projectDir !== "string" || typeof anchorDir !== "string" || !object(state) || !validCandidate(candidate)
    || typeof artifact !== "string" || artifact === ""
    || typeof environment !== "string" || environment === "" || !validNow(now)) {
    return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  }

  const trust = trustAnchorFor(anchorDir, prefix);
  if (!trust.ok) return { authorized: false, code: trust.code };

  const approvals = Array.isArray(state?.deployApprovals) ? state.deployApprovals : [];
  const matching = approvals.filter((entry) => object(entry)
    && entry.forArtifact === artifact && entry.forEnvironment === environment && !entry.usedAt);
  if (matching.length === 0) return { authorized: false, code: `${prefix}-RECORD-INCOMPLETE` };

  // Several unused approvals for the same tuple are legitimate — the writer appends. Take
  // the first whose proof actually verifies rather than the first that merely exists, so
  // one stale entry cannot mask a valid one. The last refusal is reported, because a
  // caller with no matching proof needs the reason, not a generic miss.
  let lastCode = `${prefix}-RECORD-INCOMPLETE`;
  for (const entry of matching) {
    const verified = verifySignedAction({
      state, kind: "deploy", prefix, candidate, recorded: entry.criticalProof,
      anchor: trust.anchor, now, subject: { artifact, environment },
    });
    if (verified.ok) return { authorized: true, code: `${prefix}-VERIFIED`, keyReference: trust.anchor.keyReference };
    lastCode = verified.code;
  }
  return { authorized: false, code: lastCode };
}
