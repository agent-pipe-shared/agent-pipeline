// SPDX-License-Identifier: SUL-1.0
/**
 * Read half of scripts/critic-packet-preflight.mjs (D216 option A, D219): the canonical JSON and digest helpers and the readers of
 * a consumed Critic packet, result and receipt, with no filesystem-write API. The script imports and re-exports these symbols.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { revalidateHistoricalFreshReviewPacketBinding } from "./review-admission-read.mjs";
import { isSafeTaskId } from "./dispatch-record.mjs";
import { sha256Canonical } from "./review-economy.mjs";
import { assessWindowsPrivatePath } from "./windows-private-state.mjs";
import { CRITIC_DIAGNOSTIC_SCHEMA, diagnosticDigest, diagnosticPath } from "./critic-diagnostic-evidence.mjs";

export const PACKET_SCHEMA = "pipeline.critic-candidate-packet.v1";
export const STATE_SCHEMA = "pipeline.critic-candidate-state.v1";
export const RECORD_SCHEMA = "pipeline.critic-candidate-record.v1";
export const SESSION_PACKET_BINDING_SCHEMA = "pipeline.session-critic-packet-binding.v1";
export const SESSION_ADMISSION_SCHEMA = "pipeline.session-critic-admission.v1";
export const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
export const PACKET_ID = /^[a-f0-9]{32}$/;
export const SHA256 = /^[a-f0-9]{64}$/;
export const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SESSION_ASSURANCE = "functional-equivalent-read-only; OS isolation not asserted";
const SIGNED_IMPORT_ANCHOR_SCHEMA = "pipeline.signed-quality-import-review-anchor.v1";

export class CriticPacketError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CriticPacketError";
    this.code = code;
  }
}

export function fail(code, message) { throw new CriticPacketError(code, message); }
export function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function exactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
export function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function inside(root, child) {
  const rel = relative(root, child);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
export function assertRealPrivateDir(path, label) {
  const lexical = lstatSync(path);
  if (lexical.isSymbolicLink() || !lexical.isDirectory()) fail("CPP-CONTROL", `${label} must be a real directory.`);
  if (process.platform !== "win32" && (lexical.mode & 0o077) !== 0) fail("CPP-CONTROL", `${label} must deny group and other access.`);
  const physical = realpathSync(path);
  if (process.platform === "win32" && assessWindowsPrivatePath(physical).status !== "secure") fail("CPP-CONTROL", `${label} Windows assurance is unavailable or insecure.`);
  return physical;
}
export function assertNoSymlinkPath(path, root, label) {
  const realRoot = realpathSync(root);
  const absolute = resolve(path);
  if (!inside(realRoot, absolute)) fail("CPP-CONTROL", `${label} escapes the control root.`);
  let cursor = realRoot;
  for (const part of relative(realRoot, absolute).split(sep)) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) fail("CPP-CONTROL", `${label} crosses a symlink.`);
  }
  return absolute;
}
export function readJson(path, code = "CPP-RECORD") {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile() || info.size > 1024 * 1024 || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) {
    fail(code, `${path} is not a private bounded regular file.`);
  }
  if (process.platform === "win32" && (assessWindowsPrivatePath(path).status !== "secure" || assessWindowsPrivatePath(dirname(path)).status !== "secure")) fail(code, `${path} Windows assurance is unavailable or insecure.`);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code, `${path} is not valid JSON.`); }
}

export function normalizeSessionBinding(value, route) {
  const keys = ["schema", "sessionId", "preflightSha256", "assurance", "freshContext", "historyInherited", "mayDelegate"];
  const hasModelRole = isObject(value) && Object.hasOwn(value, "modelRole");
  if (!exactKeys(value, hasModelRole ? [...keys, "modelRole"] : keys) || value.schema !== SESSION_PACKET_BINDING_SCHEMA
    || typeof value.sessionId !== "string" || !SAFE_ID.test(value.sessionId)
    || typeof value.preflightSha256 !== "string" || !SHA256.test(value.preflightSha256)
    || value.assurance !== SESSION_ASSURANCE || value.freshContext !== true
    || value.historyInherited !== false || value.mayDelegate !== false) fail("CPP-SESSION-BINDING", "Session Critic binding is invalid.");
  if (hasModelRole) {
    const role = value.modelRole;
    if (!exactKeys(role, ["schema", "runner", "taskRoute", "modelId", "effort", "readbackSha256", "receiptSha256"])
      || role.schema !== "pipeline.session-critic-model-role.v1"
      || !["codex", "claude"].includes(role.runner)
      || !["duty.critic_normal", "duty.critic_high_risk"].includes(role.taskRoute)
      || typeof role.modelId !== "string" || role.modelId.length === 0 || role.modelId.length > 128
      || role.modelId.trim() !== role.modelId || typeof role.effort !== "string" || role.effort.length === 0
      || !SHA256.test(role.readbackSha256) || !SHA256.test(role.receiptSha256)
      || (route !== undefined && (role.runner !== route.runner || role.modelId !== route.modelTier
        || role.effort !== route.effortTier))) fail("CPP-SESSION-BINDING", "Session Critic model-role binding is invalid.");
  }
  return Object.freeze(Object.fromEntries((hasModelRole ? [...keys, "modelRole"] : keys).map((key) => [key, value[key]])));
}
export function bindingsFor(packet) {
  return {
    requestSha256: sha256(canonicalJson(packet.request)),
    diffPathsSha256: sha256(canonicalJson(packet.diffPaths)),
    governanceSha256: sha256(canonicalJson(packet.governance)),
    ...(packet.diagnostics === undefined ? {} : { diagnosticsSha256: sha256(canonicalJson(packet.diagnostics)) }),
    ...(packet.coordinatorOnly === undefined ? {} : { coordinatorOnlySha256: sha256(canonicalJson(packet.coordinatorOnly)) }),
  };
}
export function recordBody(packet, revision, priorStateDigest, phase, body, timestamp) {
  return { schema: STATE_SCHEMA, packetId: packet.packetId, packetDigest: sha256(canonicalJson(packet)), revision, priorStateDigest, timestamp, phase, body };
}
function validatePacketShape(packet, shapeOptions = {}) {
  if (!isObject(packet) || packet.schema !== PACKET_SCHEMA || !PACKET_ID.test(packet.packetId)
    || !SHA256.test(packet.bindings?.requestSha256) || !SHA256.test(packet.bindings?.diffPathsSha256)
    || !SHA256.test(packet.bindings?.governanceSha256)) fail("CPP-DIGEST", "Packet shape is invalid.");
  const expected = bindingsFor(packet);
  if (JSON.stringify(expected) !== JSON.stringify(packet.bindings)) fail("CPP-DIGEST", "Packet binding digest mismatch.");
  if (packet.request?.sessionBinding !== undefined) normalizeSessionBinding(packet.request.sessionBinding, packet.route);
  if (packet.coordinatorOnly !== undefined) {
    const coordinator = normalizeCoordinatorOnly(packet.coordinatorOnly, packet.candidate, shapeOptions);
    const taskId = coordinator.localDispatchEvidence?.taskId ?? coordinator.signedQualityImportAnchor?.taskId;
    if (taskId !== packet.request?.taskId) fail("CPP-COORDINATOR-BINDING", "Coordinator-only binding does not name the packet task.");
  }
  if (packet.diagnostics !== undefined && !validateDiagnosticBundleShape(packet.diagnostics)) fail("CPP-DIAGNOSTIC", "Invalid diagnostic bundle.");
}

export function normalizeCoordinatorOnly(value, candidate, { allowLegacyPreAssurance = false } = {}) {
  if (isObject(value) && Object.hasOwn(value,"historicalFreshReview")) {
    const {historicalFreshReview,...ordinary}=value;
    const normalized=normalizeCoordinatorOnly(ordinary,candidate,{allowLegacyPreAssurance});
    if(historicalFreshReview?.target?.baseCommit!==candidate.base
      || historicalFreshReview?.target?.candidateCommit!==candidate.commit
      || !revalidateHistoricalFreshReviewPacketBinding(historicalFreshReview)) fail("CPP-HISTORICAL-ADMISSION","Historical fresh-review binding is unavailable or drifted.");
    return Object.freeze({...normalized,historicalFreshReview:Object.freeze({...historicalFreshReview})});
  }
  if (exactKeys(value, ["signedQualityImportAnchor"])) {
    const anchor = value.signedQualityImportAnchor;
    if (!exactKeys(anchor, ["schema", "intentSha256", "integrationCommit", "baseCommit", "candidateCommit", "taskId"])
      || anchor.schema !== SIGNED_IMPORT_ANCHOR_SCHEMA
      || !SHA256.test(anchor.intentSha256 ?? "")
      || !OID.test(anchor.integrationCommit ?? "") || anchor.integrationCommit.length !== candidate.commit.length
      || !OID.test(anchor.baseCommit ?? "") || anchor.baseCommit.length !== candidate.commit.length
      || anchor.candidateCommit !== candidate.commit || anchor.baseCommit !== candidate.base
      || !isSafeTaskId(anchor.taskId) || anchor.taskId !== `signed-import-${anchor.intentSha256}`) {
      fail("CPP-COORDINATOR-BINDING", "Signed import anchor is not closed or does not bind this candidate range.");
    }
    return Object.freeze({ signedQualityImportAnchor: Object.freeze({ ...anchor }) });
  }
  // Only a packet ALREADY CLAIMED under the older version may be read in this form; a new claim or admission stays strict.
  if (allowLegacyPreAssurance === true && exactKeys(value, ["localDispatchEvidence"])
    && exactKeys(value.localDispatchEvidence, ["schema", "taskId", "recordPath", "recordSha256", "sourceCandidateCommit", "reviewCandidateCommit", "snapshotId"])) {
    // Pre-assurance form (claimed before the binding carried an assurance field): closed, exact old digest, read as assurance null.
    const legacy = value.localDispatchEvidence;
    const { snapshotId: legacySnapshotId, ...legacyBody } = legacy;
    if (legacy.schema !== "pipeline.local-dispatch-evidence.v1"
      || !isSafeTaskId(legacy.taskId) || legacy.recordPath !== `evidence/dispatch-record-${legacy.taskId}.json`
      || !SHA256.test(legacy.recordSha256 ?? "") || !OID.test(legacy.sourceCandidateCommit ?? "")
      || legacy.sourceCandidateCommit.length !== candidate.commit.length || legacy.reviewCandidateCommit !== candidate.commit
      || legacySnapshotId !== sha256Canonical(legacyBody)) {
      fail("CPP-COORDINATOR-BINDING", "Local dispatch evidence binding is not closed or candidate-bound.");
    }
    const view = { ...legacyBody, assurance: null };
    return Object.freeze({ localDispatchEvidence: Object.freeze({ ...view, snapshotId: sha256Canonical(view) }) });
  }
  if (exactKeys(value, ["localDispatchEvidence"])) {
    const binding = value.localDispatchEvidence;
    if (!exactKeys(binding, ["schema", "taskId", "recordPath", "recordSha256", "sourceCandidateCommit", "reviewCandidateCommit", "assurance", "snapshotId"])
      || (binding.assurance !== null && binding.assurance !== "orchestrator-attested")
      || binding.schema !== "pipeline.local-dispatch-evidence.v1"
      || !isSafeTaskId(binding.taskId) || binding.recordPath !== `evidence/dispatch-record-${binding.taskId}.json`
      || !SHA256.test(binding.recordSha256 ?? "") || !OID.test(binding.sourceCandidateCommit ?? "")
      || binding.sourceCandidateCommit.length !== candidate.commit.length || binding.reviewCandidateCommit !== candidate.commit
      || binding.snapshotId !== sha256Canonical({ schema: binding.schema, taskId: binding.taskId,
        recordPath: binding.recordPath, recordSha256: binding.recordSha256,
        sourceCandidateCommit: binding.sourceCandidateCommit, reviewCandidateCommit: binding.reviewCandidateCommit,
        assurance: binding.assurance })) {
      fail("CPP-COORDINATOR-BINDING", "Local dispatch evidence binding is not closed or candidate-bound.");
    }
    return Object.freeze({ localDispatchEvidence: Object.freeze({ ...binding }) });
  }
  fail("CPP-COORDINATOR-BINDING", "Coordinator-only packet binding is invalid.");
}
export function packetContext(controlRoot, packetId, shapeOptions = {}) {
  if (!PACKET_ID.test(packetId)) fail("CPP-ARGUMENT", "packetId must be 32 lowercase hex characters.");
  const root = assertRealPrivateDir(resolve(controlRoot), "control root");
  const packetDir = assertNoSymlinkPath(join(root, packetId), root, "packet directory");
  if (!existsSync(packetDir)) fail("CPP-ABSENT", "Packet does not exist.");
  const packet = readJson(join(packetDir, "packet.json"));
  validatePacketShape(packet, shapeOptions);
  if (packet.packetId !== packetId) fail("CPP-DIGEST", "Packet ID mismatch.");
  return { root, packetDir, packet };
}
export function currentState(packetDir, packet) {
  const state = readJson(join(packetDir, "state.json"));
  if (state.schema !== STATE_SCHEMA || state.packetId !== packet.packetId || state.packetDigest !== sha256(canonicalJson(packet))) {
    fail("CPP-STATE", "Packet state binding mismatch.");
  }
  return state;
}
/** The packet as a claimed-session reader sees it: a stored pre-assurance coordinator binding is shown in its normalized form. */
export function normalizedPacketView(packet) {
  return packet.coordinatorOnly?.localDispatchEvidence === undefined || packet.coordinatorOnly.historicalFreshReview !== undefined
    ? packet
    : { ...packet, coordinatorOnly: { ...packet.coordinatorOnly, localDispatchEvidence: normalizeCoordinatorOnly(packet.coordinatorOnly, packet.candidate, { allowLegacyPreAssurance: true }).localDispatchEvidence } };
}

/**
 * True when `digest` is the digest of this exact packet: as it lies on disk (what the finalizer binds today) or as its normalized
 * view (what the build before bound for a pre-assurance packet). Any other digest, or a changed packet, is false.
 */
export function packetDigestMatches(packet, digest) {
  if (typeof digest !== "string") return false;
  if (digest === sha256(canonicalJson(packet))) return true;
  try { return digest === sha256(canonicalJson(normalizedPacketView(packet))); } catch { return false; }
}

function readConsumedCandidateSnapshot({ controlRoot, packetId }) {
  // A packet claimed in the pre-assurance form is consumed by the finalizer through the explicit legacy read; read it back the same way.
  const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
  const state = currentState(packetDir, packet);
  if (state.phase !== "consumed") fail("CPP-CONSUMED", "Packet is not consumed.");
  const receiptRecord = readJson(join(packetDir, "receipt.json"), "CPP-RECEIPT");
  // A physical receipt file is not authority on its own. The consume step
  // copied its exact body and journal position into the durable state; a
  // later edit of either side must not mint a different positive review.
  if (receiptRecord?.schema !== RECORD_SCHEMA || receiptRecord.phase !== "consumed"
    || receiptRecord.packetId !== packetId
    || receiptRecord.packetDigest !== sha256(canonicalJson(packet))
    || !Number.isSafeInteger(receiptRecord.revision) || receiptRecord.revision < 1
    || canonicalJson(recordBody(packet, receiptRecord.revision,
      receiptRecord.priorStateDigest, receiptRecord.phase,
      receiptRecord.body, receiptRecord.timestamp)) !== canonicalJson(state)) {
    fail("CPP-RECEIPT-DRIFT", "Consumed Critic receipt differs from its durable journal state.");
  }
  return { packetDir, packet, state, receiptRecord };
}
export function readConsumedCandidateReceipt({ controlRoot, packetId }) {
  const { packet, receiptRecord } = readConsumedCandidateSnapshot({ controlRoot, packetId });
  const receipt = receiptRecord?.body ?? receiptRecord;
  return Object.freeze({ packet, receipt });
}

/** Read the exact durable result preceding a consumed receipt; no verdict authority. */
export function readConsumedCandidateResult({ controlRoot, packetId }) {
  const initial = readConsumedCandidateSnapshot({ controlRoot, packetId });
  const { packetDir, packet, state, receiptRecord } = initial;
  const resultRecord = readJson(join(packetDir, "result.json"), "CPP-RESULT");
  if (!exactKeys(resultRecord, ["schema", "packetId", "packetDigest", "revision", "priorStateDigest", "timestamp", "phase", "body"])
    || resultRecord.schema !== RECORD_SCHEMA || resultRecord.phase !== "result-recorded"
    || resultRecord.packetId !== packet.packetId || resultRecord.packetDigest !== sha256(canonicalJson(packet))
    || !Number.isSafeInteger(resultRecord.revision) || resultRecord.revision < 1
    || resultRecord.revision !== receiptRecord.revision - 1 || !SHA256.test(resultRecord.priorStateDigest ?? "")
    || typeof resultRecord.timestamp !== "string" || !Number.isFinite(Date.parse(resultRecord.timestamp))
    || !isObject(resultRecord.body)) fail("CPP-RESULT-DRIFT", "Consumed Critic result record is invalid.");
  const predecessor = recordBody(packet, resultRecord.revision, resultRecord.priorStateDigest,
    resultRecord.phase, resultRecord.body, resultRecord.timestamp);
  if (sha256(canonicalJson(predecessor)) !== receiptRecord.priorStateDigest) {
    fail("CPP-RESULT-DRIFT", "Consumed Critic result differs from its journal predecessor.");
  }
  const current = readConsumedCandidateSnapshot({ controlRoot, packetId });
  const resultReadback = readJson(join(packetDir, "result.json"), "CPP-RESULT");
  if (canonicalJson(current.packet) !== canonicalJson(packet)
    || canonicalJson(current.state) !== canonicalJson(state)
    || canonicalJson(current.receiptRecord) !== canonicalJson(receiptRecord)
    || canonicalJson(resultReadback) !== canonicalJson(resultRecord)) {
    fail("CPP-RESULT-DRIFT", "Consumed Critic snapshot changed during readback.");
  }
  return Object.freeze({ packet, receipt: receiptRecord.body, result: resultRecord.body });
}


/** Read the immutable prelaunch admission only after genuine journal consumption. */
export function readConsumedSessionAdmission({ controlRoot, packetId }) {
  const consumed = readConsumedCandidateResult({ controlRoot, packetId });
  const { packetDir, packet } = packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true });
  const admissionPath = join(packetDir, "session-admission.json");
  if (!existsSync(admissionPath) || packet.request.sessionBinding === undefined) {
    fail("CPP-CONSUMED-ADMISSION-UNAVAILABLE", "Consumed session admission is unavailable.");
  }
  const admission = readJson(admissionPath, "CPP-SESSION-ADMISSION");
  if (!Object.hasOwn(admission ?? {}, "courseSourceSha256") || !Object.hasOwn(admission ?? {}, "courseDecisionSha256")) {
    fail("CPP-CONSUMED-ADMISSION-UNAVAILABLE", "Historical admission has no course digest slots.");
  }
  const claim = readJson(join(packetDir, "claim.json"), "CPP-CLAIM-READ");
  const resultRecord = readJson(join(packetDir, "result.json"), "CPP-RESULT");
  const preparedState = recordBody(packet, 1, null, "prepared", { code: "CPP-PREPARED" }, packet.createdAt);
  if (!exactKeys(claim, ["schema", "packetId", "packetDigest", "revision", "priorStateDigest", "timestamp", "phase", "body"])
    || claim.schema !== RECORD_SCHEMA || claim.packetId !== packetId || claim.phase !== "claimed" || claim.revision !== 2
    || claim.packetDigest !== sha256(canonicalJson(packet)) || claim.priorStateDigest !== sha256(canonicalJson(preparedState))
    || typeof claim.timestamp !== "string" || !Number.isFinite(Date.parse(claim.timestamp))
    || !(exactKeys(claim.body, ["adapter", "claimantNonce"]) || exactKeys(claim.body, ["adapter", "claimantNonce", "criticReviewLineageSha256"]))
    || claim.body.adapter !== packet.route.adapter || !SHA256.test(claim.body.claimantNonce ?? "")
    || (Object.hasOwn(claim.body, "criticReviewLineageSha256") && !SHA256.test(claim.body.criticReviewLineageSha256 ?? ""))
    || resultRecord.revision !== 3
    || resultRecord.priorStateDigest !== sha256(canonicalJson(recordBody(packet, 2, claim.priorStateDigest, "claimed", claim.body, claim.timestamp)))
    || canonicalJson(resultRecord.body) !== canonicalJson(consumed.result)) fail("CPP-CLAIM-READ", "Consumed journal claim binding differs.");
  const binding = packet.request.sessionBinding;
  if (!exactKeys(admission, ["schema", "packetId", "packetDigest", "claimSha256", "sessionId", "preflightSha256", "courseSourceSha256", "courseDecisionSha256", "createdAt"])
    || admission.schema !== SESSION_ADMISSION_SCHEMA || admission.packetId !== packetId
    || admission.packetDigest !== sha256(canonicalJson(packet))
    || admission.claimSha256 !== sha256(canonicalJson(claim))
    || admission.sessionId !== binding.sessionId
    || admission.preflightSha256 !== binding.preflightSha256
    || admission.preflightSha256 !== packet.route.projectionDigest
    || !SHA256.test(admission.courseSourceSha256) || !SHA256.test(admission.courseDecisionSha256)
    || typeof admission.createdAt !== "string" || !Number.isFinite(Date.parse(admission.createdAt))) {
    fail("CPP-SESSION-ADMISSION", "Consumed session admission is drifted.");
  }
  const readback = readConsumedCandidateResult({ controlRoot, packetId });
  if (canonicalJson(readback) !== canonicalJson(consumed)
    || canonicalJson(readJson(admissionPath, "CPP-SESSION-ADMISSION")) !== canonicalJson(admission)
    || canonicalJson(readJson(join(packetDir, "claim.json"), "CPP-CLAIM-READ")) !== canonicalJson(claim)
    || canonicalJson(readJson(join(packetDir, "result.json"), "CPP-RESULT")) !== canonicalJson(resultRecord)) {
    fail("CPP-SESSION-ADMISSION", "Consumed admission changed during readback.");
  }
  return Object.freeze({ packet, receipt: consumed.receipt, result: consumed.result, admission });
}

const diagnosticExact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const DIAGNOSTIC_PREFIX = ".git/agent-pipeline-diagnostics/";
export function validateDiagnosticBundleShape(bundle) {
  try {
    if (!diagnosticExact(bundle, ["schema", "items", "artifacts"]) || bundle.schema !== "pipeline.critic-diagnostic-bundle.v1" || !Array.isArray(bundle.items) || bundle.items.length === 0 || bundle.items.length > 8 || !Array.isArray(bundle.artifacts) || bundle.artifacts.length > 24) return false;
    let size = 0;
    const artifacts = new Map();
    for (const a of bundle.artifacts) {
      if (!diagnosticExact(a, ["sourcePath", "path", "sha256", "content"]) || typeof a.content !== "string" || !/^[a-f0-9]{64}$/u.test(a.sha256) || a.path !== `${DIAGNOSTIC_PREFIX}${a.sha256}.txt` || diagnosticDigest(a.content) !== a.sha256 || artifacts.has(a.sourcePath)) return false;
      diagnosticPath(a.sourcePath); size += Buffer.byteLength(a.content); artifacts.set(a.sourcePath, a);
    }
    if (size > 4 * 1024 * 1024 || new Set(bundle.items.map(i => i?.sourcePath)).size !== bundle.items.length) return false;
    const referenced = new Set();
    for (const i of bundle.items) {
      if (!diagnosticExact(i, ["sourcePath", "path", "sha256", "status"]) || !diagnosticExact(i.status, ["fullVerify", "targeted"]) || !["passed", "failed", "not-run", "not-established"].includes(i.status.fullVerify) || !["passed", "failed", "not-applicable"].includes(i.status.targeted)) return false;
      const a = artifacts.get(i.sourcePath);
      if (!a || i.path !== a.path || i.sha256 !== a.sha256) return false;
      referenced.add(i.sourcePath);
      const value = JSON.parse(a.content);
      if (value.schema === CRITIC_DIAGNOSTIC_SCHEMA) {
        referenced.add(value.targeted?.log?.path);
        if (value.fullVerify?.evidence) referenced.add(value.fullVerify.evidence.path);
      } else if (value.schema !== "pipeline.verify-evidence.v0") return false;
    }
    if (referenced.size !== artifacts.size || [...referenced].some(path => !artifacts.has(path))) return false;
    return true;
  } catch { return false; }
}
