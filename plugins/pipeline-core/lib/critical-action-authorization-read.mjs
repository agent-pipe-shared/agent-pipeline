// SPDX-License-Identifier: SUL-1.0
/**
 * Read half of lib/critical-action-authorization.mjs (D216 option A, D219): the authorization verdict readers, with no
 * filesystem-write API. The first-use trust-anchor pin is a write, so the signature route takes it as an optional hook
 * (`pinTrustAnchor`): a read-only caller passes none and the verdict is unchanged (the pin is best-effort and never part of the
 * verdict); the write-capable module passes its own pin. The old module imports and re-exports these symbols.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { criticalActionSha256, criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import { criticalProofWaiverFor, readCriticalHumanProofPolicy, verifyAgainstTrustAnchors } from "./critical-human-proof-policy-read.mjs";
import { createPoApprovalIntent } from "./po-approval-proof.mjs";
import { resolveLocalOperatorKeyAnchor } from "./po-human-approval-read.mjs";

const OID = /^[a-f0-9]{40,64}$/u;
export const SHA256 = /^[a-f0-9]{64}$/u;
export const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

export const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

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
export function trustAnchorsFor(anchorDir, prefix) {
  const policy = readCriticalHumanProofPolicy(anchorDir);
  if (!policy.ok) return { ok: false, code: policy.code };
  if (policy.trustAnchors !== null) return { ok: true, anchors: policy.trustAnchors, policy };
  if (policy.trustAnchor !== null) return { ok: true, anchors: [policy.trustAnchor], policy };
  return { ok: true, anchors: [], policy, pinOnSuccess: true };
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
export function localOperatorAnchorFor(trust, machinePlaneDeps) {
  return trust.pinOnSuccess ? resolveLocalOperatorKeyAnchor(machinePlaneDeps) : null;
}

const CLOSED_FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const CLOSED_PLAN_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/u;
const COMMIT_OID = /^[0-9a-f]{40,64}$/u;
const NO_AUTHORITY = Object.freeze({ source: "none", featureId: undefined, planSha256: undefined, specSha256: undefined });

/**
 * Candidate 16d (PO decision 2026-11-01): which feature identity, plan digest and spec digest a signed critical action is bound to.
 * With an ACTIVE feature this is exactly what it always was (the feature id and the digests of its approved plan authority in State).
 * A push after the feature close has no active feature and no plan authority in State, because the close clears both; for a PUSH
 * only, and only when there is no active feature, the most recently closed feature (`closedFeatures`, unique latest `closedAt`) carries
 * the push: its PRD and sibling `spec.md` are read from the PUSH CANDIDATE's own tree (`git show <candidate>:<path>`), so the signature
 * binds the exact bytes being pushed, and its `forCommit` must be an ancestor of the candidate (the push delivers that feature's
 * work). Anything missing, ambiguous, unsafe or not an ancestor yields no authority and the caller refuses exactly as before.
 */
export function criticalActionAuthority({ state, kind, candidate, projectDir, gitFn = spawnSync }) {
  if (object(state?.activeFeature)) {
    const gate = state?.planApproval?.poGateAuthority;
    return { source: "active", featureId: state.activeFeature.id, planSha256: gate?.planSha256, specSha256: gate?.specSha256 };
  }
  if (kind !== "push" || typeof projectDir !== "string" || !validCandidate(candidate) || !Array.isArray(state?.closedFeatures)) return NO_AUTHORITY;
  try {
    const rows = state.closedFeatures
      .filter((entry) => object(entry) && CLOSED_FEATURE_ID.test(entry.id ?? "") && CLOSED_PLAN_PATH.test(entry.planPath ?? "")
        && !entry.planPath.split("/").some((part) => part === "." || part === "..") && COMMIT_OID.test(entry.forCommit ?? "")
        && Number.isFinite(Date.parse(entry.closedAt)))
      .map((entry) => ({ entry, at: Date.parse(entry.closedAt) }));
    const latest = Math.max(...rows.map((row) => row.at));
    const chosen = rows.filter((row) => row.at === latest);
    if (rows.length === 0 || chosen.length !== 1) return NO_AUTHORITY;
    const { id, planPath, forCommit } = chosen[0].entry;
    const git = (args) => gitFn("git", ["-C", projectDir, ...args], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, shell: false });
    if (git(["merge-base", "--is-ancestor", forCommit, candidate.commit]).status !== 0) return NO_AUTHORITY;
    const sha = (path) => {
      const shown = git(["show", `${candidate.commit}:${path}`]);
      return shown.status === 0 && Buffer.isBuffer(shown.stdout) ? createHash("sha256").update(shown.stdout).digest("hex") : undefined;
    };
    const specPath = `${planPath.includes("/") ? planPath.slice(0, planPath.lastIndexOf("/") + 1) : ""}spec.md`;
    const planSha256 = sha(planPath);
    const specSha256 = sha(specPath);
    return planSha256 && specSha256 ? { source: "closed", featureId: id, planPath, specPath, planSha256, specSha256 } : NO_AUTHORITY;
  } catch { return NO_AUTHORITY; }
}

/**
 * The half both routes share: a recorded proof is accepted only if the signature
 * verifies against the committed anchor SET (or against any well-formed key, in the
 * absent-set posture) over an intent rebuilt from the OBSERVED subject. `subject` is the
 * caller's route-specific object; everything else is uniform.
 */
export function verifySignedAction({ state, kind, prefix, candidate, subject, recorded, anchors, now, projectDir }) {
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
  const authority = criticalActionAuthority({ state, kind, candidate, projectDir });
  let intent;
  try {
    intent = createPoApprovalIntent({
      kind: "critical-action",
      featureId: authority.featureId,
      planSha256: authority.planSha256,
      specSha256: authority.specSha256,
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

export function validCandidate(candidate) {
  return object(candidate) && OID.test(candidate.commit ?? "") && OID.test(candidate.tree ?? "")
    && candidate.commit !== candidate.tree;
}

export const validNow = (now) => typeof now === "string" && Number.isFinite(Date.parse(now));

const RESIDUAL_KIND = "accept-residual-critic-findings";
const RESIDUAL_SEVERITIES = new Set(["blocker", "major", "minor"]);

// Sorted, minimal copy of a finding list, or null when it is not a well-formed non-empty list.
function residualFindingList(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return null;
  const list = [];
  for (const finding of findings) {
    if (!object(finding) || !SHA256.test(finding.id ?? "") || !RESIDUAL_SEVERITIES.has(finding.severity)) return null;
    list.push({ id: finding.id, severity: finding.severity });
  }
  return list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const residualInputValid = ({ projectDir, anchorDir, state, candidate, criticReceiptSha256, findings }) =>
  typeof projectDir === "string" && typeof anchorDir === "string" && object(state) && validCandidate(candidate)
  && SHA256.test(criticReceiptSha256 ?? "") && residualFindingList(findings) !== null;

// The recorded acceptance must bind exactly this commit, tree, Critic receipt and finding list, and (D227) the reason class the caller names.
function residualBindingCode(recorded, { candidate, criticReceiptSha256, findings, reasonClass }, prefix) {
  if (!object(recorded) || recorded.forCommit !== candidate.commit) return `${prefix}-COMMIT-MISMATCH`;
  const observed = residualFindingList(findings);
  const bound = residualFindingList(recorded.findings);
  if (recorded.forTree !== candidate.tree || recorded.criticReceiptSha256 !== criticReceiptSha256
    || bound === null || JSON.stringify(bound) !== JSON.stringify(observed)
    || (reasonClass !== undefined && recorded.reasonClass !== reasonClass)) {
    return `${prefix}-BINDING-MISMATCH`;
  }
  return null;
}

/**
 * D227 (N45): the one reason class under which a MAJOR finding can be accepted, and the one rule for it. A blocker is never
 * accepted; a major only with exactly this class; a list without a major never carries a class. Returns null when the
 * (findings, class) pair is acceptable, else the typed suffix: SEVERITY (blocker, or a major without a class) or CLASS (an unknown
 * value, or a class on a list that has no major). `findings` need only carry a `severity` each; `undefined` means "no class named".
 */
export const RESIDUAL_REASON_CLASS = "uncorrectable-past-authorship";
export function residualReasonClassRefusal(findings, reasonClass) {
  const list = Array.isArray(findings) ? findings : [];
  if (list.length === 0 || list.some((finding) => finding?.severity === "blocker" || !["minor", "major"].includes(finding?.severity))) return "SEVERITY";
  if (list.some((finding) => finding.severity === "major")) {
    if (reasonClass === undefined) return "SEVERITY";
    return reasonClass === RESIDUAL_REASON_CLASS ? null : "CLASS";
  }
  return reasonClass === undefined ? null : "CLASS";
}

// The class in force for a call: the one the caller names, else the one the recorded acceptance carries.
const residualEffectiveClass = (reasonClass, state) => reasonClass !== undefined ? reasonClass : state?.residualAcceptance?.lastAccepted?.reasonClass;

/**
 * D190: authorize the acceptance of residual Critic findings by a detached signature, modelled on `authorizeRecordedPush`.
 * A blocker is refused here, never accepted; D227: a major is accepted only when the signed acceptance names the reason class
 * `uncorrectable-past-authorship`, which then is part of the signed subject. A minor-only subject carries no class key at all.
 * The record lives at `state.residualAcceptance.lastAccepted`.
 */
export function authorizeRecordedResidualAcceptance({
  projectDir, anchorDir = projectDir, state, candidate, criticReceiptSha256, findings, reasonClass, now, machinePlaneDeps = {}, pinTrustAnchor = null,
} = {}) {
  const prefix = "RESIDUAL-PROOF";
  const input = { projectDir, anchorDir, state, candidate, criticReceiptSha256, findings, reasonClass };
  if (!residualInputValid(input) || !validNow(now)) return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  const earlyRefusal = residualReasonClassRefusal(findings, residualEffectiveClass(reasonClass, state));
  if (earlyRefusal !== null) return { authorized: false, code: `${prefix}-${earlyRefusal}` };

  const trust = trustAnchorsFor(anchorDir, prefix);
  if (!trust.ok) return { authorized: false, code: trust.code };
  const localAnchor = localOperatorAnchorFor(trust, machinePlaneDeps);
  if (trust.pinOnSuccess && localAnchor === null) return { authorized: false, code: `${prefix}-TRUST-ANCHOR-MISSING` };

  const approval = state?.residualAcceptance?.lastAccepted;
  const recorded = approval?.criticalProof;
  if (!object(approval) || !object(recorded)) return { authorized: false, code: `${prefix}-RECORD-INCOMPLETE` };
  const binding = residualBindingCode(approval, input, prefix);
  if (binding !== null) return { authorized: false, code: binding };
  const recordRefusal = residualReasonClassRefusal(approval.findings, approval.reasonClass);
  if (recordRefusal !== null) return { authorized: false, code: `${prefix}-${recordRefusal}` };

  const verified = verifySignedAction({
    state, kind: RESIDUAL_KIND, prefix, candidate, recorded, anchors: trust.anchors, now,
    subject: { criticReceiptSha256, findings: residualFindingList(findings), ...(approval.reasonClass === undefined ? {} : { reasonClass: approval.reasonClass }) },
  });
  if (!verified.ok) return { authorized: false, code: verified.code };

  const ledger = state?.criticalProofConsumption;
  if (!Array.isArray(ledger)
    || !ledger.some((entry) => object(entry) && entry.proofSha256 === recorded.proofSha256 && entry.kind === RESIDUAL_KIND)) {
    return { authorized: false, code: `${prefix}-NOT-CONSUMED` };
  }
  if (trust.pinOnSuccess) {
    if (localAnchor.publicKeySha256 !== verified.signer.publicKeySha256) {
      return { authorized: false, code: `${prefix}-TRUST-ANCHOR-MISSING` };
    }
    // The first-use pin is a write: a read-only caller passes no hook, the write-capable module passes its own pin.
    if (typeof pinTrustAnchor === "function") pinTrustAnchor(anchorDir, trust.policy, RESIDUAL_KIND, verified.signer);
  }
  return { authorized: true, code: `${prefix}-VERIFIED`, mode: "signature",
    keyReference: verified.signer.keyReference, publicKeySha256: verified.signer.publicKeySha256 };
}

/** Chat route of the same acceptance, modelled on `authorizeRecordedChatPush`; follows `gates.push_approval`. */
export function authorizeRecordedChatResidualAcceptance({
  projectDir, anchorDir = projectDir, state, candidate, criticReceiptSha256, findings, reasonClass,
} = {}) {
  const prefix = "RESIDUAL-PROOF";
  const input = { projectDir, anchorDir, state, candidate, criticReceiptSha256, findings, reasonClass };
  if (!residualInputValid(input)) return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  const earlyRefusal = residualReasonClassRefusal(findings, residualEffectiveClass(reasonClass, state));
  if (earlyRefusal !== null) return { authorized: false, code: `${prefix}-${earlyRefusal}` };
  let waiver;
  try { waiver = criticalProofWaiverFor(anchorDir, RESIDUAL_KIND); }
  catch { return { authorized: false, code: `${prefix}-CHAT-POLICY-UNREADABLE` }; }
  if (waiver?.waived !== true || !waiver.waiver) {
    return { authorized: false, code: waiver?.code ?? `${prefix}-CHAT-NOT-WAIVED` };
  }
  // A residual acceptance is always an attribution record: the per-kind chat setting (waiver mode
  // "chat") is recorded as chat-attributed-unattested with a humanApproval block.
  const mode = waiver.waiver.mode === "chat" ? "chat-attributed-unattested" : waiver.waiver.mode;
  const approval = state?.residualAcceptance?.lastAccepted;
  if (!object(approval)) return { authorized: false, code: `${prefix}-RECORD-INCOMPLETE` };
  const binding = residualBindingCode(approval, input, prefix);
  if (binding !== null) return { authorized: false, code: binding };
  const recordRefusal = residualReasonClassRefusal(approval.findings, approval.reasonClass);
  if (recordRefusal !== null) return { authorized: false, code: `${prefix}-${recordRefusal}` };
  if (approval.criticalProof !== null) return { authorized: false, code: `${prefix}-CHAT-RECORD-MISMATCH` };
  const recordedWaiver = approval.criticalProofWaiver;
  if (!object(recordedWaiver) || recordedWaiver.kind !== RESIDUAL_KIND
    || recordedWaiver.mode !== mode || recordedWaiver.source !== waiver.waiver.source) {
    return { authorized: false, code: `${prefix}-CHAT-ATTRIBUTION-MISSING` };
  }
  if (mode !== "chat-attributed-unattested") return { authorized: false, code: `${prefix}-CHAT-NOT-WAIVED` };
  if (!object(approval.humanApproval) || approval.humanApproval.kind !== RESIDUAL_KIND
    || approval.humanApproval.mode !== "chat-attributed-unattested") {
    return { authorized: false, code: `${prefix}-CHAT-ATTRIBUTION-MISSING` };
  }
  return { authorized: true, code: `${prefix}-WAIVED`, mode };
}

/** Picks the chat route when the configured mode waives the proof, otherwise the signature route. */
export function authorizeRecordedResidualAcceptanceByMode(input = {}) {
  let waiver = null;
  try { waiver = criticalProofWaiverFor(input.anchorDir ?? input.projectDir, RESIDUAL_KIND); } catch { waiver = null; }
  return waiver?.waived === true
    ? authorizeRecordedChatResidualAcceptance(input)
    : authorizeRecordedResidualAcceptance(input);
}

