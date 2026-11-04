// SPDX-License-Identifier: SUL-1.0
/**
 * Read-only trace of every human approval a gate consumed back to the human's detached proof (Q3, AC-108).
 *
 * For a candidate commit it enumerates the approval records the gates consume (private push and
 * feature-package-reconcile approvals, legacy tracked-state approvals, deploy approvals, the plan approval and its
 * design approval, human guard override capabilities) and gives each a typed verdict:
 *   - `traced`           the record names this candidate, a detached Ed25519 proof exists whose signed digest equals
 *                        the intent rebuilt from the record, the proof verifies against the project's committed trust
 *                        anchors, the signing key is a registered human key (committed anchor or this machine's
 *                        operator key), and the proof was consumed exactly once (replay journal);
 *   - `attribution-only` a chat-mode approval: an attribution record, never proof (the repository already labels it so);
 *   - `untraceable`      the exact break is named in `break`.
 * The trace never signs, never consumes a proof and never writes: the pin and the consumption marker belong to the
 * write half (`critical-action-authorization.mjs`), and only that module's pure readers are used here.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { criticalActionSha256, criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import { CRITICAL_APPROVAL_STORE_SCHEMA, criticalApprovalStoreRoot, readPrivateCriticalConsumption, resolveCriticalApprovalCommonDir } from "./critical-action-authorization.mjs";
import { canonical, criticalActionAuthority, object, SHA256, trustAnchorsFor, validCandidate } from "./critical-action-authorization-read.mjs";
import { verifyAgainstTrustAnchors } from "./critical-human-proof-policy-read.mjs";
import { createPoApprovalIntent } from "./po-approval-proof.mjs";
import { resolveLocalOperatorKeyAnchor } from "./po-human-approval-read.mjs";

export const HUMAN_APPROVAL_TRACE_SCHEMA = "pipeline.human-approval-trace.v1";
export const TRACE_VERDICTS = Object.freeze(["traced", "attribution-only", "untraceable"]);
/** What this trace does not enumerate; named in every result so a gap is never silent. */
export const TRACE_NOT_ENUMERATED = Object.freeze(["publication", "release-preflight", "briefed-test-authorization"]);
const STORE_KINDS = Object.freeze(["push", "feature-package-reconcile"]);
const MAX_RECORDS = 256;

const proofDigest = (proof) => createHash("sha256").update(canonical(proof)).digest("hex");
const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };
const isChat = (record) => (object(record?.criticalProofWaiver) && /chat/u.test(String(record.criticalProofWaiver.mode ?? "chat")))
  || (object(record?.humanApproval) && /chat/u.test(String(record.humanApproval.mode ?? "")));

function readTraceState(root) {
  for (const path of ["project/pipeline-state.json", ".claude/pipeline-state.json"]) {
    const value = readJson(join(root, path));
    if (object(value)) return value;
  }
  return {};
}

function gitCandidate(root) {
  const run = (args) => { const out = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10000, shell: false }); return out.status === 0 ? out.stdout.trim() : null; };
  const commit = run(["rev-parse", "HEAD"]); const tree = run(["rev-parse", "HEAD^{tree}"]);
  return commit && tree ? { commit, tree } : null;
}

function storeEnvelopes(common, kind) {
  const directory = join(criticalApprovalStoreRoot(common), "approvals", kind); const found = [];
  let names = [];
  try { names = readdirSync(directory).filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort().slice(0, MAX_RECORDS); } catch { return found; }
  for (const name of names) {
    const envelope = readJson(join(directory, name));
    if (object(envelope) && envelope.schema === CRITICAL_APPROVAL_STORE_SCHEMA && envelope.kind === kind && object(envelope.approval)) found.push({ source: `private-store:${kind}/${name}`, kind, approval: envelope.approval });
  }
  return found;
}

function boundFileDigest(root, path) {
  try {
    if (typeof path !== "string" || path === "" || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
    const target = join(root, path); if (!lstatSync(target).isFile()) return null;
    return createHash("sha256").update(readFileSync(target)).digest("hex");
  } catch { return null; }
}

/** One signed record -> `null` (traced) or the first break, plus the signer. The same rebuild `verifySignedAction` performs, without its write hooks. */
function chainBreak({ kind, recorded, candidate, subject, state, root, trust, localAnchor }) {
  if (!object(recorded) || !object(recorded.proof) || !object(recorded.action) || !SHA256.test(recorded.proofSha256 ?? "") || !SHA256.test(recorded.intentSha256 ?? "")) return { code: "RECORD-INCOMPLETE" };
  if (recorded.action.kind !== kind) return { code: "KIND" };
  if (subject !== undefined) {
    let expected;
    try { expected = criticalActionSubjectSha256({ kind, candidate: { commit: candidate.commit, tree: candidate.tree }, subject }); } catch { return { code: "RECORD-INCOMPLETE" }; }
    if (recorded.action.subjectSha256 !== expected) return { code: "SUBJECT-MISMATCH" };
  }
  const authority = criticalActionAuthority({ state, kind, candidate, projectDir: root });
  let intent;
  try {
    intent = createPoApprovalIntent({ kind: "critical-action", featureId: authority.featureId, planSha256: authority.planSha256, specSha256: authority.specSha256,
      candidate: { commit: candidate.commit, tree: candidate.tree }, policyRevision: "critical-human-proof-v1", subjectSha256: criticalActionSha256(recorded.action), decision: "approved" });
  } catch { return { code: "STATE-AUTHORITY" }; }
  if (intent.sha256 !== recorded.intentSha256) return { code: "INTENT-MISMATCH" };
  return verifyProofAndKey({ intent, proof: recorded.proof, proofSha256: recorded.proofSha256, trust, localAnchor });
}

function verifyProofAndKey({ intent, proof, proofSha256, trust, localAnchor }) {
  const verified = verifyAgainstTrustAnchors({ intent, anchors: trust.anchors, proof });
  if (!verified.verified) return { code: verified.code === "PO-APPROVAL-TRUST-MISMATCH" ? "TRUST-MISMATCH" : verified.code === "PO-APPROVAL-PROOF-MISMATCH" ? "SIGNATURE-MISMATCH" : "PROOF-INVALID" };
  if (verified.proofSha256 !== proofSha256 || proofDigest(proof) !== proofSha256) return { code: "DIGEST-MISMATCH" };
  const key = verified.signer.publicKeySha256;
  const registered = trust.anchors.some((anchor) => anchor.publicKeySha256 === key) || localAnchor?.publicKeySha256 === key;
  return registered ? { code: null, signer: verified.signer } : { code: "KEY-NOT-REGISTERED", signer: verified.signer };
}

function baseRow({ kind, source, approval, mode }) {
  return { kind, source, mode, forCommit: approval?.forCommit ?? null, approvedAt: approval?.approvedAt ?? approval?.grantedAt ?? null, by: approval?.approvedBy ?? null,
    intentSha256: null, proofSha256: null, keyReference: null, publicKeySha256: null, proof: null, verdict: "untraceable", break: null };
}

/**
 * @param {{repositoryRoot: string, candidate?: {commit: string, tree: string}, state?: object, machinePlaneDeps?: object, gitCommonDir?: string}} input
 */
export function traceHumanApprovals({ repositoryRoot, candidate, state, machinePlaneDeps = {}, gitCommonDir } = {}) {
  const root = resolve(repositoryRoot ?? "");
  const audited = candidate ?? gitCandidate(root);
  if (!validCandidate(audited)) { const error = new Error("The audited candidate is not a valid commit and tree."); error.code = "HAT-CANDIDATE"; throw error; }
  const tracked = object(state) ? state : readTraceState(root);
  const common = gitCommonDir ?? resolveCriticalApprovalCommonDir(root);
  const trust = trustAnchorsFor(root, "TRACE");
  const localAnchor = resolveLocalOperatorKeyAnchor(machinePlaneDeps);
  const consumed = new Set([...(common ? readPrivateCriticalConsumption(common) : []), ...(Array.isArray(tracked.criticalProofConsumption) ? tracked.criticalProofConsumption.filter(object) : [])].map((entry) => `${entry.kind}:${entry.proofSha256}`));

  const records = [];
  if (common) for (const kind of STORE_KINDS) records.push(...storeEnvelopes(common, kind));
  const privateKeys = new Set(records.map((entry) => `${entry.kind}:${entry.approval.forCommit}:${entry.approval.approvedAt}`));
  for (const [kind, slot] of [["push", "pushApproval"], ["feature-package-reconcile", "featurePackageReconcileApproval"]]) {
    const legacy = tracked[slot]?.lastApproved;
    if (object(legacy) && !privateKeys.has(`${kind}:${legacy.forCommit}:${legacy.approvedAt}`)) records.push({ source: `tracked-state:${slot}`, kind, approval: legacy });
  }
  const seen = new Map();
  for (const entry of records) { const digest = entry.approval.criticalProof?.proofSha256; if (typeof digest === "string") seen.set(digest, (seen.get(digest) ?? 0) + 1); }

  const rows = []; let outOfCandidate = 0;
  for (const entry of records) {
    const approval = entry.approval;
    if (approval.forCommit !== audited.commit) { outOfCandidate += 1; continue; }
    const recorded = approval.criticalProof;
    if (recorded === null || recorded === undefined) {
      const row = baseRow({ kind: entry.kind, source: entry.source, approval, mode: isChat(approval) ? "chat" : "none" });
      if (isChat(approval)) rows.push({ ...row, verdict: "attribution-only" }); else rows.push({ ...row, break: "PROOF-MISSING" });
      continue;
    }
    const row = { ...baseRow({ kind: entry.kind, source: entry.source, approval, mode: "signature" }), intentSha256: recorded.intentSha256 ?? null, proofSha256: recorded.proofSha256 ?? null, proof: object(recorded.proof) ? recorded.proof : null };
    let outcome;
    if (!trust.ok) outcome = { code: trust.code };
    else {
      const subject = entry.kind === "push" ? { sourceCommit: audited.commit, remote: approval.remote, destination: approval.destination, threatModel: { path: approval.threatModel?.path, sha256: approval.threatModel?.sha256 } } : undefined;
      outcome = entry.kind === "push" && (boundFileDigest(root, approval.threatModel?.path) !== approval.threatModel?.sha256) ? { code: "THREAT-MODEL" }
        : chainBreak({ kind: entry.kind, recorded, candidate: audited, subject, state: tracked, root, trust, localAnchor });
      if (outcome.code === null && (seen.get(recorded.proofSha256) ?? 0) > 1) outcome = { ...outcome, code: "REPLAYED" };
      if (outcome.code === null && !consumed.has(`${entry.kind}:${recorded.proofSha256}`)) outcome = { ...outcome, code: "NOT-CONSUMED" };
    }
    rows.push({ ...row, keyReference: outcome.signer?.keyReference ?? null, publicKeySha256: outcome.signer?.publicKeySha256 ?? null, verdict: outcome.code === null ? "traced" : "untraceable", break: outcome.code });
  }

  for (const [index, entry] of (Array.isArray(tracked.deployApprovals) ? tracked.deployApprovals.filter(object).slice(0, MAX_RECORDS) : []).entries()) {
    const recorded = entry.criticalProof; const row = { ...baseRow({ kind: "deploy", source: `tracked-state:deployApprovals[${index}]`, approval: entry, mode: "signature" }), intentSha256: recorded?.intentSha256 ?? null, proofSha256: recorded?.proofSha256 ?? null, proof: object(recorded?.proof) ? recorded.proof : null };
    const outcome = !trust.ok ? { code: trust.code } : chainBreak({ kind: "deploy", recorded, candidate: audited, subject: { artifact: entry.forArtifact, environment: entry.forEnvironment }, state: tracked, root, trust, localAnchor });
    rows.push({ ...row, keyReference: outcome.signer?.keyReference ?? null, publicKeySha256: outcome.signer?.publicKeySha256 ?? null, verdict: outcome.code === null ? "traced" : "untraceable", break: outcome.code });
  }

  const plan = tracked.planApproval;
  if (tracked.planApproved === true && object(plan)) {
    const design = plan.designApproval; const row = baseRow({ kind: "plan-approval", source: "tracked-state:planApproval", approval: plan, mode: "chat" });
    if (object(design) && design.mode === "signature") {
      const proof = design.proof;
      const intent = { sha256: design.intentSha256 };
      const outcome = !trust.ok ? { code: trust.code } : !object(proof) || !SHA256.test(design.proofSha256 ?? "") || !SHA256.test(design.intentSha256 ?? "") ? { code: "RECORD-INCOMPLETE" }
        : verifyProofAndKey({ intent, proof, proofSha256: design.proofSha256, trust, localAnchor });
      // The design intent's content is only rebuildable from the scratch approval request inside pipeline-state.mjs
      // (observeDesignApprovalRequest), which this read-only trace does not import: the signature, the key and the
      // digest are proven, the link from the intent to the plan binding is reported as the exact break.
      rows.push({ ...row, mode: "signature", intentSha256: design.intentSha256 ?? null, proofSha256: design.proofSha256 ?? null, proof: object(proof) ? proof : null, keyReference: outcome.signer?.keyReference ?? null, publicKeySha256: outcome.signer?.publicKeySha256 ?? null, verdict: "untraceable", break: outcome.code ?? "DESIGN-INTENT-NOT-RECONSTRUCTIBLE" });
    } else if (object(design) && design.mode === "chat") rows.push({ ...row, verdict: "attribution-only" });
    else if (String(plan.by ?? plan.approvedBy ?? "").startsWith("verified:")) rows.push({ ...row, mode: "signature", break: "PLAN-PROOF-NOT-RETAINED" });
    else rows.push({ ...row, verdict: "attribution-only" });
  }

  if (common) {
    const directory = join(common, "agent-pipeline", "human-guard-overrides", "capabilities"); let names = [];
    try { names = readdirSync(directory).filter((name) => name.endsWith(".json")).sort().slice(0, MAX_RECORDS); } catch { names = []; }
    for (const name of names) {
      const capability = readJson(join(directory, name)); const mode = capability?.humanApproval?.mode;
      if (!object(capability) || typeof mode !== "string") continue;
      const row = { ...baseRow({ kind: "human-guard-override", source: `override-capability:${name}`, approval: { approvedAt: capability.authorizedAt }, mode }), forCommit: capability.signedCandidate?.commit ?? null };
      if (mode === "chat-attributed-unattested") rows.push({ ...row, verdict: "attribution-only" });
      else rows.push({ ...row, break: "PROOF-NOT-RETAINED-IN-CAPABILITY" });
    }
  }

  if (rows.length === 0) rows.push({ ...baseRow({ kind: "none", source: "none", approval: null, mode: "none" }), break: "NO-APPROVAL-RECORD" });
  const counts = Object.fromEntries(TRACE_VERDICTS.map((verdict) => [verdict, rows.filter((row) => row.verdict === verdict).length]));
  const status = counts.untraceable > 0 ? "untraceable" : counts["attribution-only"] > 0 ? "attribution-only" : "traced";
  return { schema: HUMAN_APPROVAL_TRACE_SCHEMA, candidate: { commit: audited.commit, tree: audited.tree }, status, counts, rows, outOfCandidate, notEnumerated: [...TRACE_NOT_ENUMERATED] };
}

/** A fixed-width table plus the typed verdict, for the operator command. */
export function formatHumanApprovalTrace(result) {
  const cell = (value, width) => String(value ?? "-").slice(0, width).padEnd(width);
  const lines = [`candidate ${result.candidate.commit}`, `${cell("kind", 22)} ${cell("verdict", 16)} ${cell("mode", 10)} ${cell("key", 18)} break`];
  for (const row of result.rows) lines.push(`${cell(row.kind, 22)} ${cell(row.verdict, 16)} ${cell(row.mode, 10)} ${cell(row.keyReference, 18)} ${row.break ?? "-"}`);
  lines.push(`not enumerated: ${result.notEnumerated.join(", ")}`, `verdict: ${result.status}`);
  return `${lines.join("\n")}\n`;
}
