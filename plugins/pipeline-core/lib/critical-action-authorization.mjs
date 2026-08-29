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
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, unlinkSync, writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { criticalActionSha256, criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import {
  CRITICAL_HUMAN_PROOF_POLICY_PATH, CRITICAL_HUMAN_PROOF_POLICY_V3,
  readCriticalHumanProofPolicy, verifyAgainstTrustAnchors,
} from "./critical-human-proof-policy.mjs";
import { createPoApprovalIntent } from "./po-approval-proof.mjs";
import { resolveLocalOperatorKeyAnchor } from "./machine-plane.mjs";

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
 *
 * SETUP-1: the committed identity is now a SET, not a single object, and its cardinality
 * carries meaning (§5a). A v1/v2 document's single `trustAnchor` is wrapped as a set of
 * one — identical behaviour to before, since membership in a one-element set is exactly
 * the equality check this used to do directly. A v3 document's `trustAnchors` is used as
 * written, EMPTY INCLUDED: an explicit empty v3 set is not "missing", it is the "any
 * well-formed key" posture, and only a v3 reader can say so.
 *
 * TRUST-ON-FIRST-USE (PO decision, 2026-08-29; backlog:
 * 2026-08-28-a-v1-trust-anchor-makes-the-signature-push-route-functionless.md). A v1/v2
 * document with no `trustAnchor` at all — or no policy file at all — used to mean "this
 * route is unavailable" permanently. It now means "no key has ever been pinned YET": this
 * one call is verified against any well-formed key, same as the v3 any-key posture, but the
 * caller is told (`pinOnSuccess`) to record the verifying key once the proof actually checks
 * out, so every later call is pinned to that key rather than staying open forever. A v3
 * document's explicit empty `trustAnchors: []` never sets `pinOnSuccess` — that posture is a
 * deliberate, permanent "any well-formed key, every time" and must never be narrowed by this
 * mechanism.
 *
 * NARROWED (PO decision, 2026-08-29, "TOFU-Fix" -> "A: Provenienz verlangen" — the same-day
 * follow-up to the decision above): `pinOnSuccess` alone is no longer sufficient to accept
 * AND pin a verifying key. A self-fabricated key (no relationship to any machine the PO
 * operates) and a nested repository's own committed key both cryptographically "verify" —
 * that was always the point of TOFU — but neither is evidence the PO ever saw the action.
 * `localOperatorAnchorFor` below is the added gate: only a signer that resolves to THIS
 * machine's own registered operator key (`resolveLocalOperatorKeyAnchor`,
 * `lib/machine-plane.mjs`) may consume the open-verification posture at all; every other
 * signer is refused with `${prefix}-TRUST-ANCHOR-MISSING`, not merely left unpinned. The v3
 * explicit-empty-set posture immediately above (`pinOnSuccess` unset) is untouched by this —
 * it was never routed through the new gate, since the gate only fires where `pinOnSuccess`
 * is set.
 */
function trustAnchorsFor(anchorDir, prefix) {
  const policy = readCriticalHumanProofPolicy(anchorDir);
  if (!policy.ok) return { ok: false, code: policy.code };
  if (policy.trustAnchors !== null) return { ok: true, anchors: policy.trustAnchors, policy };
  if (policy.trustAnchor !== null) return { ok: true, anchors: [policy.trustAnchor], policy };
  return { ok: true, anchors: [], policy, pinOnSuccess: true };
}

/**
 * Trust-on-first-use write-back. Reached ONLY when `trustAnchorsFor` set `pinOnSuccess` and
 * the action this call authorizes has now fully verified — never on a proof that merely
 * checked cryptographically but was then refused for an unrelated reason (unconsumed ledger
 * entry, single-use replay, etc.): only a call that is actually going to return
 * `authorized: true` gets to pin a key.
 *
 * Re-reads the policy immediately before writing and refuses to touch it unless it STILL has
 * no anchor at all: a concurrent write — a human editing one in, or a racing call pinning a
 * different key first — must win over this one, never be silently clobbered by it.
 *
 * Same-directory temp file, fsync, atomic rename, directory fsync — the identical durable-write
 * shape `atomicWriteContinuityState` (scripts/pipeline-state.mjs) already established for this
 * codebase's other state writers, copied rather than reinvented. Best-effort and silent on
 * failure BY DESIGN: the proof that reached this point already verified cryptographically
 * against the open posture, so a write error here must not retroactively unauthorize an action
 * that has already been decided — it only means the pin did not take, and the NEXT call gets
 * the identical chance to record it.
 */
function pinTrustAnchorOnFirstUse(anchorDir, policy, kind, signer) {
  try {
    const path = resolve(anchorDir, CRITICAL_HUMAN_PROOF_POLICY_PATH);
    const fresh = readCriticalHumanProofPolicy(anchorDir);
    if (!fresh.ok || fresh.trustAnchors !== null || fresh.trustAnchor !== null) return;
    const document = {
      schema: CRITICAL_HUMAN_PROOF_POLICY_V3,
      requiredKinds: Array.from(new Set([...policy.requiredKinds, kind])),
      waivedKinds: Array.from(policy.waivers, ([waivedKind, reason]) => ({ kind: waivedKind, reason })),
      trustAnchors: [{ keyReference: signer.keyReference, publicKeySha256: signer.publicKeySha256 }],
    };
    const text = `${JSON.stringify(document, null, 2)}\n`;
    const bytes = Buffer.from(text, "utf8");
    const parent = dirname(path);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const tmp = join(parent, `.critical-human-proof-policy-${randomBytes(12).toString("hex")}.tmp`);
    const fd = openSync(tmp, "wx", 0o600);
    try {
      ftruncateSync(fd, 0);
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      renameSync(tmp, path);
    } catch (error) {
      try { unlinkSync(tmp); } catch { /* best effort cleanup */ }
      throw error;
    }
    try {
      const dirFd = openSync(parent, "r");
      try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
    } catch { /* directory fsync is best-effort durability, not correctness */ }
  } catch {
    // Best-effort by design — see doc comment above.
  }
}

/**
 * The provenance gate `trustAnchorsFor`'s NARROWED doc comment describes, resolved ONCE per
 * call and used twice by each caller: first to refuse outright, before any record is even
 * inspected, when this machine has no registered operator key at all (the route is simply
 * unavailable — the same "no anchor set at all must never read as no check needed" posture
 * the original, pre-trust-on-first-use code had, restored for the machine-key dimension);
 * and again after verification, to confirm the key that actually verified IS that resolved
 * key. `machinePlaneDeps` is the same dependency-injection shape
 * `readMachinePlane`/`resolveLocalOperatorKeyAnchor` already accept (`homedirFn`,
 * `realpathSyncFn`, `existsSyncFn`, `readFileSyncFn`) — production callers pass none of it
 * and get the real machine; tests substitute a `homedirFn` pointing at a fixture home
 * directory. The second check matches on `publicKeySha256` alone: that digest is the actual
 * cryptographic identity — comparing `keyReference` too would only be comparing two
 * independently-chosen labels, neither of which the signature itself binds.
 */
function localOperatorAnchorFor(trust, machinePlaneDeps) {
  return trust.pinOnSuccess ? resolveLocalOperatorKeyAnchor(machinePlaneDeps) : null;
}

/**
 * The half both routes share: a recorded proof is accepted only if the signature
 * verifies against the committed anchor SET (or against any well-formed key, in the
 * absent-set posture) over an intent rebuilt from the OBSERVED subject. `subject` is the
 * caller's route-specific object; everything else is uniform.
 */
function verifySignedAction({ state, kind, prefix, candidate, subject, recorded, anchors, now }) {
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

  const verified = verifyAgainstTrustAnchors({ intent, anchors, proof: recorded.proof });
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
  // `signer` — the recorded `keyReference`/`publicKeySha256` (SETUP-1) — is present in
  // every accepting case, independent of posture: `verifyAgainstTrustAnchors` derives it
  // from the proof itself in the absent-set posture and from the matched anchor otherwise.
  // It is the only remaining source for the caller's reported `keyReference`, because an
  // empty v3 set has no anchor object to read one off.
  return { ok: true, signer: verified.signer };
}

function validCandidate(candidate) {
  return object(candidate) && OID.test(candidate.commit ?? "") && OID.test(candidate.tree ?? "")
    && candidate.commit !== candidate.tree;
}

const validNow = (now) => typeof now === "string" && Number.isFinite(Date.parse(now));

/**
 * @param {{projectDir: string, state: object, candidate: {commit: string, tree: string},
 *          remote: string, destination: string, now: string, machinePlaneDeps?: object}} input
 *   `machinePlaneDeps` — dependency injection for the trust-on-first-use provenance gate
 *   (`localOperatorKeyAuthorizes`/`resolveLocalOperatorKeyAnchor`); production callers omit
 *   it and resolve the real machine, tests substitute `{ homedirFn }`.
 * @returns {{authorized: true, code: "PUSH-PROOF-VERIFIED", keyReference: string, publicKeySha256: string}
 *          | {authorized: false, code: string}}
 */
export function authorizeRecordedPush({
  projectDir, anchorDir = projectDir, state, candidate, remote, destination, now, machinePlaneDeps = {},
} = {}) {
  const prefix = "PUSH-PROOF";
  if (typeof projectDir !== "string" || typeof anchorDir !== "string" || !object(state) || !validCandidate(candidate)
    || typeof remote !== "string" || remote === ""
    || typeof destination !== "string" || destination === "" || !validNow(now)) {
    return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  }

  // The key identity is read first: every later check is meaningless without an anchor set
  // to verify against, and "no anchor set at all" (v1/v2, or no policy) must never read as
  // "no check needed". It comes from the governed session root, never from the pushed
  // repository -- see `trustAnchorsFor`.
  const trust = trustAnchorsFor(anchorDir, prefix);
  if (!trust.ok) return { authorized: false, code: trust.code };

  // NARROWED (see `trustAnchorsFor`'s doc comment): resolved before any record is even
  // inspected — a genuinely anchor-less policy whose machine has no registered operator key
  // at all means the route is simply unavailable, independent of whatever record happens to
  // be present. Deliberately mirrors the ORIGINAL pre-trust-on-first-use gate shape, which
  // also refused here before ever reading the approval record.
  const localAnchor = localOperatorAnchorFor(trust, machinePlaneDeps);
  if (trust.pinOnSuccess && localAnchor === null) {
    return { authorized: false, code: `${prefix}-TRUST-ANCHOR-MISSING` };
  }

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
    state, kind: "push", prefix, candidate, recorded, anchors: trust.anchors, now,
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

  // Trust-on-first-use: only pin once every other check has already passed and this call
  // is actually going to authorize the push — see `pinTrustAnchorOnFirstUse`. NARROWED: the
  // open-verification posture itself is now also conditioned on independent, machine-local
  // provenance (see `trustAnchorsFor`'s doc comment) — a verifying key that is not this
  // machine's own registered operator key (`localAnchor`, resolved above) is refused
  // outright, not merely left unpinned.
  if (trust.pinOnSuccess) {
    if (localAnchor.publicKeySha256 !== verified.signer.publicKeySha256) {
      return { authorized: false, code: `${prefix}-TRUST-ANCHOR-MISSING` };
    }
    pinTrustAnchorOnFirstUse(anchorDir, trust.policy, "push", verified.signer);
  }

  return {
    authorized: true, code: `${prefix}-VERIFIED`,
    keyReference: verified.signer.keyReference, publicKeySha256: verified.signer.publicKeySha256,
  };
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
 *          artifact: string, environment: string, now: string, machinePlaneDeps?: object}} input
 *   `machinePlaneDeps` — see `authorizeRecordedPush`'s identical parameter.
 * @returns {{authorized: true, code: "DEPLOY-PROOF-VERIFIED", keyReference: string, publicKeySha256: string}
 *          | {authorized: false, code: string}}
 */
export function authorizeRecordedDeploy({
  projectDir, anchorDir = projectDir, state, candidate, artifact, environment, now, machinePlaneDeps = {},
} = {}) {
  const prefix = "DEPLOY-PROOF";
  if (typeof projectDir !== "string" || typeof anchorDir !== "string" || !object(state) || !validCandidate(candidate)
    || typeof artifact !== "string" || artifact === ""
    || typeof environment !== "string" || environment === "" || !validNow(now)) {
    return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  }

  const trust = trustAnchorsFor(anchorDir, prefix);
  if (!trust.ok) return { authorized: false, code: trust.code };

  // NARROWED (see `authorizeRecordedPush`): resolved before any deploy-approval entry is
  // even inspected — a genuinely anchor-less policy whose machine has no registered
  // operator key at all means the route is simply unavailable, independent of whatever
  // entries happen to be present.
  const localAnchor = localOperatorAnchorFor(trust, machinePlaneDeps);
  if (trust.pinOnSuccess && localAnchor === null) {
    return { authorized: false, code: `${prefix}-TRUST-ANCHOR-MISSING` };
  }

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
      anchors: trust.anchors, now, subject: { artifact, environment },
    });
    if (verified.ok) {
      // NARROWED (see `authorizeRecordedPush`): the open-verification posture is now also
      // conditioned on independent, machine-local provenance. A verifying key that is not
      // this machine's own registered operator key is treated as a failed candidate for
      // THIS entry (falls through to `lastCode`/the next entry), not an authorized deploy.
      if (trust.pinOnSuccess) {
        if (localAnchor.publicKeySha256 !== verified.signer.publicKeySha256) {
          lastCode = `${prefix}-TRUST-ANCHOR-MISSING`;
          continue;
        }
        pinTrustAnchorOnFirstUse(anchorDir, trust.policy, "deploy", verified.signer);
      }
      return {
        authorized: true, code: `${prefix}-VERIFIED`,
        keyReference: verified.signer.keyReference, publicKeySha256: verified.signer.publicKeySha256,
      };
    }
    lastCode = verified.code;
  }
  return { authorized: false, code: lastCode };
}
