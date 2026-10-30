// SPDX-License-Identifier: SUL-1.0
/** Read-only final-candidate check: diagnostic Verify never asserts a Critic. */
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { readCriticVerifyLifecycle } from "./critic-verify-lifecycle.mjs";
import { authorizeRecordedResidualAcceptanceByMode } from "./critical-action-authorization.mjs";
import { canonicalJson, readConsumedCandidateReceipt, sha256 } from "../scripts/critic-packet-preflight.mjs";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const RECEIPT = /^[a-f0-9]{64}\.json$/u;
const SHA = /^[a-f0-9]{64}$/u;
const PACKET = /^[a-f0-9]{32}$/u;

export const RESIDUAL_ACCEPTANCE_PRIVATE_SCHEMA = "pipeline.critic-residual-acceptance-record.v1";

// N22: a PO acceptance of residual minor findings is a PRIVATE record, bound to the consumed Critic receipt's
// own candidate and kept under the git common directory next to the Critic packets. The tracked project state
// file is never written, so the checkout stays clean and the acceptance survives an evidence-only commit.
export function residualAcceptanceRecordPath(gitCommonDir, criticReceiptSha256) {
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0 || !SHA.test(criticReceiptSha256 ?? "")) {
    throw new Error("RESIDUAL-RECORD-INPUT");
  }
  return join(resolve(gitCommonDir), "agent-pipeline", "critic-residual-acceptance", `${criticReceiptSha256}.json`);
}

/**
 * Persist the acceptance record together with its proof consumption entry (null in chat mode), atomically,
 * file mode 0600 inside a 0700 directory. A proof already consumed by ANY private record is refused.
 */
export function writeResidualAcceptanceRecord({ gitCommonDir, criticReceiptSha256, record, consumption = null } = {}) {
  let tmp = null;
  try {
    const target = residualAcceptanceRecordPath(gitCommonDir, criticReceiptSha256);
    if (record === null || typeof record !== "object" || record.criticReceiptSha256 !== criticReceiptSha256) {
      return { ok: false, code: "RESIDUAL-RECORD-INPUT" };
    }
    const directory = join(target, "..");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (consumption !== null && consumption !== undefined) {
      if (typeof consumption.proofSha256 !== "string") return { ok: false, code: "CRITICAL-PROOF-CONSUMPTION-INVALID" };
      for (const name of readdirSync(directory).filter((entry) => RECEIPT.test(entry))) {
        let existing;
        try { existing = JSON.parse(readFileSync(join(directory, name), "utf8")); } catch { continue; }
        if (existing?.consumption?.proofSha256 === consumption.proofSha256) return { ok: false, code: "CRITICAL-PROOF-REPLAY" };
      }
    }
    const bytes = Buffer.from(`${canonicalJson({ schema: RESIDUAL_ACCEPTANCE_PRIVATE_SCHEMA, record, consumption: consumption ?? null })}\n`, "utf8");
    tmp = join(directory, `.${criticReceiptSha256}.${process.pid}.tmp`);
    const fd = openSync(tmp, "wx", 0o600);
    try { writeSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, target);
    tmp = null;
    return { ok: true, path: target };
  } catch {
    return { ok: false, code: "RESIDUAL-RECORD-WRITE" };
  } finally {
    if (tmp !== null) { try { unlinkSync(tmp); } catch { /* nothing to remove */ } }
  }
}

/**
 * The one loader: the lifecycle deps `{ residualAcceptance, verifyResidualAcceptanceFn }` for a Critic receipt
 * digest, or null when no private record exists (the passing-receipt path is then unchanged). The verifier
 * re-checks the record in the configured approval mode through a state-shaped object, so the authorizers in
 * critical-action-authorization.mjs stay as they are.
 */
export function loadResidualAcceptanceDeps({ gitCommonDir, projectDir = null, criticReceiptSha256,
  authorizeFn = authorizeRecordedResidualAcceptanceByMode, now = () => new Date().toISOString() } = {}) {
  try {
    const stored = JSON.parse(readFileSync(residualAcceptanceRecordPath(gitCommonDir, criticReceiptSha256), "utf8"));
    const record = stored?.record;
    if (stored?.schema !== RESIDUAL_ACCEPTANCE_PRIVATE_SCHEMA || record === null || typeof record !== "object"
      || record.criticReceiptSha256 !== criticReceiptSha256 || !OID.test(record.forCommit ?? "") || !OID.test(record.forTree ?? "")
      || !Array.isArray(record.findings)) return null;
    let projectState = {};
    if (typeof projectDir === "string" && projectDir.length > 0) {
      try { projectState = JSON.parse(readFileSync(join(projectDir, "project", "pipeline-state.json"), "utf8")); } catch { projectState = {}; }
    }
    const state = { ...projectState, residualAcceptance: { lastAccepted: record },
      criticalProofConsumption: stored.consumption === null || stored.consumption === undefined ? [] : [stored.consumption] };
    return {
      residualAcceptance: { candidate: { commit: record.forCommit, tree: record.forTree },
        criticReceiptSha256: record.criticReceiptSha256, findings: record.findings },
      verifyResidualAcceptanceFn: ({ candidate: bound, criticReceiptSha256: bondSha, findings }) =>
        authorizeFn({ projectDir, state, candidate: bound, criticReceiptSha256: bondSha, findings, now: now() }),
    };
  } catch { return null; }
}

/** The same loader keyed by consumed Critic packet id (the digest is that of the packet's consumed receipt). */
export function loadResidualAcceptanceDepsForPacket({ gitCommonDir, projectDir = null, criticPacketId,
  readConsumedCandidateReceiptFn = readConsumedCandidateReceipt, authorizeFn, now } = {}) {
  try {
    if (typeof gitCommonDir !== "string" || !PACKET.test(criticPacketId ?? "")) return null;
    const { receipt } = readConsumedCandidateReceiptFn({
      controlRoot: join(resolve(gitCommonDir), "agent-pipeline", "critic-packets"), packetId: criticPacketId });
    return loadResidualAcceptanceDeps({ gitCommonDir, projectDir, criticReceiptSha256: sha256(canonicalJson(receipt)),
      ...(authorizeFn === undefined ? {} : { authorizeFn }), ...(now === undefined ? {} : { now }) });
  } catch { return null; }
}

function lifecycleReceiptDigest(directory, id) {
  try { return JSON.parse(readFileSync(join(directory, `${id}.json`), "utf8"))?.critic?.receiptSha256 ?? null; }
  catch { return null; }
}

export function inspectCriticBoundVerify({ repoRoot = null, gitCommonDir, head, tree, worktreeState,
  evidencePath = "evidence/verify-latest.json", evidence, requireClean = true,
  readLifecycle = readCriticVerifyLifecycle, residualAuthorizeFn } = {}) {
  const base = { headEvidenceOk: false, currentCheckoutOk: false,
    privateLifecycleBound: false, receiptId: null };
  const candidate = { commit: head, tree };
  if (!OID.test(head ?? "") || !OID.test(tree ?? "")
    || evidence?.schema !== "pipeline.verify-evidence.v0"
    || evidence?.exitCode !== 0 || evidence?.commit !== head || evidence?.tree !== tree
    || evidence?.candidate?.commit !== head || evidence?.candidate?.tree !== tree
    || evidence?.verifyRun?.status !== "passed"
    || !/^[a-f0-9]{64}$/u.test(evidence?.verifyRun?.terminalSha256 ?? "")
    || !Array.isArray(evidence?.steps) || evidence.steps.length === 0
    || evidence.steps.some((step) => step?.exitCode !== 0)) {
    return { ...base, code: "verify-evidence-not-exact-green" };
  }
  const exact = { ...base, headEvidenceOk: true };
  // An actual push can name a commit other than checkout HEAD. Its source tree
  // is supplied explicitly; checkout cleanliness is a preparation constraint.
  if (requireClean && worktreeState !== "clean") return { ...exact, code: "checkout-not-clean" };
  if (typeof gitCommonDir !== "string" || gitCommonDir.length === 0) {
    return { ...exact, code: "git-common-dir-unavailable" };
  }
  const directory = join(gitCommonDir, "agent-pipeline", "critic-verify-lifecycle");
  let ids;
  try {
    if (!lstatSync(directory).isDirectory()) throw new Error("not-directory");
    const entries = readdirSync(directory);
    if (entries.length > 4096) return { ...exact, code: "private-receipt-inventory-too-large" };
    ids = entries.filter((name) => RECEIPT.test(name)).map((name) => name.slice(0, -5));
  } catch {
    return { ...exact, code: "private-critic-binding-unavailable" };
  }
  for (const id of ids) {
    try {
      // N22: the acceptance is read from the private record of THIS lifecycle receipt's Critic receipt.
      const digest = lifecycleReceiptDigest(directory, id);
      const residualDeps = digest === null ? null : loadResidualAcceptanceDeps({ gitCommonDir, projectDir: repoRoot,
        criticReceiptSha256: digest, ...(residualAuthorizeFn === undefined ? {} : { authorizeFn: residualAuthorizeFn }) });
      if (residualDeps === null) readLifecycle({ repoRoot, gitCommonDir, id, candidate, evidencePath, evidence });
      else readLifecycle({ repoRoot, gitCommonDir, id, candidate, evidencePath, evidence }, residualDeps);
      return { ...exact, currentCheckoutOk: true, privateLifecycleBound: true,
        receiptId: id, code: "critic-bound-verify-valid" };
    } catch { /* Other candidates and invalid private records are not admission. */ }
  }
  return { ...exact, code: "private-critic-binding-unavailable" };
}
