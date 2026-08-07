// SPDX-License-Identifier: SUL-1.0
import { CHANNELS, PHASES, publicationDigest } from "./publication-bundle.mjs";
import { validatePublicationCapabilityPreflight } from "./publication-capability-preflight.mjs";

export const PUBLICATION_SCHEMA_V2 = "pipeline.publication-channel.v2";
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const REF = /^refs\/heads\/[A-Za-z0-9._/-]+$/u;
const STATE_KEYS = [
  "schema", "channel", "transactionId", "revision", "priorStateSha256", "phase",
  "repositoryFingerprint", "sourceCommit", "sourceTree", "remoteFingerprint", "remoteName",
  "destinationRef", "remotePreimageOid", "candidateOid", "candidateTree", "ancestry",
  "identityProbe", "verifyEvidence", "securityEvidence", "criticEvidence",
  "releasePreflightEvidence", "capabilityPreflight", "fastForwardProof", "executorSha256",
  "neutralEvidence", "approval", "pushIntent", "observation", "readback", "reason", "receiptDigest",
];
const PREPARE_KEYS = STATE_KEYS.filter((key) => ![
  "schema", "revision", "priorStateSha256", "phase", "approval", "pushIntent",
  "observation", "readback", "reason", "receiptDigest",
].includes(key));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} invalid`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} keys invalid`);
}
function oid(value, label) { if (!OID.test(value ?? "")) throw new Error(`${label} invalid`); }
function digest(value, label) { if (!SHA256.test(value ?? "")) throw new Error(`${label} invalid`); }
function id(value, label) { if (typeof value !== "string" || !/^[A-Za-z0-9._:@/-]{1,200}$/u.test(value)) throw new Error(`${label} invalid`); }
function evidence(value, label, state) {
  exact(value, ["path", "rawDigest", "commit", "tree"], label);
  if (typeof value.path !== "string" || value.path === "" || value.path.startsWith("/") || value.path.split(/[\\/]/u).includes("..")) throw new Error(`${label}.path invalid`);
  digest(value.rawDigest, `${label}.rawDigest`);
  if (value.commit !== state.candidateOid || value.tree !== state.candidateTree) throw new Error(`${label} candidate binding invalid`);
}
function approvalTuple(state) {
  const tuple = {};
  for (const key of PREPARE_KEYS) tuple[key] = state[key];
  return { schema: state.schema, ...tuple };
}
export function publicationFastForwardProofDigest(state) {
  return publicationDigest({
    schema: "pipeline.publication-fast-forward-proof.v1",
    baseOid: state.remotePreimageOid,
    candidateOid: state.candidateOid,
    remoteFingerprint: state.remoteFingerprint,
    destinationRef: state.destinationRef,
  });
}
function cas(state, args) {
  if (args.expectedRevision !== state.revision || args.expectedStateSha256 !== publicationDigest(state)) throw new Error("stale publication CAS");
}
function next(state, expectedStateSha256, changes) {
  return { ...state, ...changes, revision: state.revision + 1, priorStateSha256: expectedStateSha256 };
}

export function preparePublicationV2(input) {
  exact(input, PREPARE_KEYS, "publication v2 prepare");
  const state = {
    schema: PUBLICATION_SCHEMA_V2, ...structuredClone(input), revision: 0,
    priorStateSha256: null, phase: "prepared", approval: null, pushIntent: null,
    observation: null, readback: null, reason: null, receiptDigest: null,
  };
  validatePublicationV2(state);
  return state;
}

export function approvePublicationV2(state, args) {
  validatePublicationV2(state);
  exact(args, ["expectedRevision", "expectedStateSha256", "approvalId", "attribution", "approvedAt", "expiresAt"], "publication v2 approval");
  cas(state, args);
  if (state.phase !== "prepared") throw new Error("approval requires prepared");
  id(args.approvalId, "approvalId");
  if (typeof args.attribution !== "string" || args.attribution.trim() !== args.attribution || args.attribution.length === 0
    || args.attribution.length > 200 || /[\u0000-\u001f\u007f]/u.test(args.attribution)) throw new Error("approval attribution invalid");
  if (!Number.isSafeInteger(args.approvedAt) || !Number.isSafeInteger(args.expiresAt)
    || args.expiresAt <= args.approvedAt || args.expiresAt - args.approvedAt > 900_000) throw new Error("approval window invalid");
  return next(state, args.expectedStateSha256, {
    phase: "approved",
    approval: { id: args.approvalId, attribution: args.attribution, approvedAt: args.approvedAt, expiresAt: args.expiresAt, tupleDigest: publicationDigest(approvalTuple(state)), consumedAt: null },
  });
}

export function authorizePublicationV2(state, args) {
  validatePublicationV2(state);
  exact(args, ["expectedRevision", "expectedStateSha256", "now", "command"], "publication v2 authorization");
  cas(state, args);
  if (state.phase !== "approved" || !Number.isSafeInteger(args.now)
    || args.now < state.approval.approvedAt || args.now > state.approval.expiresAt) throw new Error("approval absent or expired");
  if (state.approval.tupleDigest !== publicationDigest(approvalTuple(state))) throw new Error("approval tuple drift");
  const command = ["git", "push", "--porcelain", state.remoteName, `${state.candidateOid}:${state.destinationRef}`];
  if (!Array.isArray(args.command) || canonical(args.command) !== canonical(command)) throw new Error("push command invalid");
  return next(state, args.expectedStateSha256, {
    phase: "push-authorized", approval: { ...state.approval, consumedAt: args.now },
    pushIntent: { command, authorizedAt: args.now, approvalId: state.approval.id, tupleDigest: state.approval.tupleDigest },
  });
}

export function observePublicationV2(state, args) {
  validatePublicationV2(state);
  exact(args, ["expectedRevision", "expectedStateSha256", "observedOid", "observedAt", "status"], "publication v2 observation");
  cas(state, args);
  if (state.phase !== "push-authorized" || !Number.isSafeInteger(args.observedAt)
    || !["observed", "unknown", "authentication", "multiple"].includes(args.status)) throw new Error("observation invalid");
  if (args.status !== "observed") return next(state, args.expectedStateSha256, { phase: "blocked-recovery", reason: `remote-observation-${args.status}`, observation: { status: args.status, outcome: "uncertain", oid: null, observedAt: args.observedAt } });
  if (args.observedOid !== null) oid(args.observedOid, "observedOid");
  if (args.observedOid === state.candidateOid) return next(state, args.expectedStateSha256, { phase: "pushed-observed", observation: { status: "observed", outcome: "candidate", oid: args.observedOid, observedAt: args.observedAt } });
  const outcome = args.observedOid === state.remotePreimageOid ? "preimage" : "conflict";
  return next(state, args.expectedStateSha256, { phase: "reapproval-required", reason: outcome === "preimage" ? "remote-still-preimage" : "remote-preimage-changed", observation: { status: "observed", outcome, oid: args.observedOid, observedAt: args.observedAt } });
}

export function startReadbackV2(state, args) {
  validatePublicationV2(state);
  exact(args, ["expectedRevision", "expectedStateSha256", "repositoryKind", "alternatesDisabled", "destinationRef"], "publication v2 readback");
  cas(state, args);
  if (state.phase !== "pushed-observed" || args.repositoryKind !== "fresh-disposable"
    || args.alternatesDisabled !== true || args.destinationRef !== state.destinationRef) throw new Error("readback out of order or untrusted");
  return next(state, args.expectedStateSha256, { phase: "readback-running", readback: { repositoryKind: "fresh-disposable", alternatesDisabled: true, destinationRef: state.destinationRef, oid: null, tree: null, completedAt: null } });
}

export function closePublicationV2(state, args) {
  validatePublicationV2(state);
  exact(args, ["expectedRevision", "expectedStateSha256", "fetchedRef", "fetchedOid", "fetchedTree", "completedAt"], "publication v2 close");
  cas(state, args);
  if (state.phase !== "readback-running" || args.fetchedRef !== state.destinationRef
    || args.fetchedOid !== state.candidateOid || args.fetchedTree !== state.candidateTree
    || !Number.isSafeInteger(args.completedAt)) throw new Error("readback mismatch");
  const result = next(state, args.expectedStateSha256, { phase: "closed", readback: { ...state.readback, oid: args.fetchedOid, tree: args.fetchedTree, completedAt: args.completedAt } });
  result.receiptDigest = publicationDigest(result);
  validatePublicationV2(result);
  return result;
}

export function validatePublicationV2(state) {
  exact(state, STATE_KEYS, "publication v2 state");
  if (state.schema !== PUBLICATION_SCHEMA_V2 || !CHANNELS.has(state.channel) || !PHASES.has(state.phase)
    || !Number.isInteger(state.revision) || state.revision < 0) throw new Error("publication v2 state invalid");
  if (state.revision === 0 ? state.priorStateSha256 !== null : !SHA256.test(state.priorStateSha256 ?? "")) throw new Error("publication v2 prior state invalid");
  id(state.transactionId, "transactionId"); digest(state.repositoryFingerprint, "repositoryFingerprint");
  for (const key of ["sourceCommit", "sourceTree", "candidateOid", "candidateTree"]) oid(state[key], key);
  digest(state.remoteFingerprint, "remoteFingerprint"); id(state.remoteName, "remoteName");
  if (!REF.test(state.destinationRef ?? "") || state.destinationRef.includes("..") || state.destinationRef.includes("*")) throw new Error("destinationRef invalid");
  if (state.remotePreimageOid !== null) oid(state.remotePreimageOid, "remotePreimageOid");
  exact(state.ancestry, ["baseOid", "candidateOid", "descends"], "ancestry");
  if (state.ancestry.baseOid !== state.remotePreimageOid || state.ancestry.candidateOid !== state.candidateOid || state.ancestry.descends !== true) throw new Error("ancestry invalid");
  for (const key of ["identityProbe", "verifyEvidence", "securityEvidence", "criticEvidence", "releasePreflightEvidence"]) evidence(state[key], key, state);
  validatePublicationCapabilityPreflight(state.capabilityPreflight);
  if (state.capabilityPreflight.status !== "ready" || state.capabilityPreflight.candidate.commit !== state.candidateOid
    || state.capabilityPreflight.candidate.tree !== state.candidateTree
    || state.capabilityPreflight.remote.name !== state.remoteName
    || state.capabilityPreflight.remote.fingerprint !== state.remoteFingerprint
    || state.capabilityPreflight.destinationRef !== state.destinationRef
    || state.capabilityPreflight.remotePreimage !== state.remotePreimageOid) throw new Error("capability preflight binding invalid");
  exact(state.fastForwardProof, ["baseOid", "candidateOid", "descends", "proofSha256"], "fastForwardProof");
  if (state.fastForwardProof.baseOid !== state.remotePreimageOid || state.fastForwardProof.candidateOid !== state.candidateOid || state.fastForwardProof.descends !== true) throw new Error("fast-forward proof binding invalid");
  digest(state.fastForwardProof.proofSha256, "fastForwardProof.proofSha256");
  if (state.fastForwardProof.proofSha256 !== publicationFastForwardProofDigest(state)) throw new Error("fast-forward proof digest invalid");
  digest(state.executorSha256, "executorSha256");
  if (state.capabilityPreflight.executor.evidenceSha256 !== state.executorSha256) throw new Error("executor preflight binding invalid");
  if (state.channel === "private" ? state.neutralEvidence !== null : state.neutralEvidence === null) throw new Error("channel evidence substitution");
  if (state.neutralEvidence !== null) {
    exact(state.neutralEvidence, ["planDigest", "reviewDigest", "leakageDigest", "metadataDigest", "endpointProbeDigest", "candidateCommit", "candidateTree"], "neutralEvidence");
    for (const key of ["planDigest", "reviewDigest", "leakageDigest", "metadataDigest", "endpointProbeDigest"]) digest(state.neutralEvidence[key], `neutralEvidence.${key}`);
    if (state.neutralEvidence.candidateCommit !== state.candidateOid || state.neutralEvidence.candidateTree !== state.candidateTree) throw new Error("neutral evidence binding invalid");
  }
  if (state.approval !== null) {
    exact(state.approval, ["id", "attribution", "approvedAt", "expiresAt", "tupleDigest", "consumedAt"], "approval");
    id(state.approval.id, "approval.id");
    if (typeof state.approval.attribution !== "string" || state.approval.attribution.trim() !== state.approval.attribution
      || state.approval.attribution.length === 0 || state.approval.attribution.length > 200 || /[\u0000-\u001f\u007f]/u.test(state.approval.attribution)
      || !Number.isSafeInteger(state.approval.approvedAt) || !Number.isSafeInteger(state.approval.expiresAt)
      || state.approval.expiresAt <= state.approval.approvedAt || state.approval.expiresAt - state.approval.approvedAt > 900_000
      || (state.approval.consumedAt !== null && (!Number.isSafeInteger(state.approval.consumedAt)
        || state.approval.consumedAt < state.approval.approvedAt || state.approval.consumedAt > state.approval.expiresAt))) throw new Error("approval invariants invalid");
    digest(state.approval.tupleDigest, "approval.tupleDigest");
    if (state.approval.tupleDigest !== publicationDigest(approvalTuple(state))) throw new Error("approval tuple drift");
  }
  if (state.phase === "prepared" && [state.approval, state.pushIntent, state.observation, state.readback, state.reason].some((value) => value !== null)) throw new Error("prepared state contaminated");
  if (state.phase === "approved" && (!state.approval || state.approval.consumedAt !== null || state.pushIntent !== null || state.observation !== null || state.readback !== null)) throw new Error("approved state invalid");
  if (["push-authorized", "pushed-observed", "readback-running", "closed", "reapproval-required", "blocked-recovery"].includes(state.phase)) {
    if (!state.approval || !Number.isSafeInteger(state.approval.consumedAt) || !state.pushIntent) throw new Error("publication v2 authorization history missing");
    exact(state.pushIntent, ["command", "authorizedAt", "approvalId", "tupleDigest"], "pushIntent");
    const expected = ["git", "push", "--porcelain", state.remoteName, `${state.candidateOid}:${state.destinationRef}`];
    if (canonical(state.pushIntent.command) !== canonical(expected) || state.pushIntent.approvalId !== state.approval.id
      || state.pushIntent.tupleDigest !== state.approval.tupleDigest || state.pushIntent.authorizedAt !== state.approval.consumedAt) throw new Error("push intent drift");
  }
  if (["pushed-observed", "readback-running", "closed", "reapproval-required", "blocked-recovery"].includes(state.phase)) {
    exact(state.observation, ["status", "outcome", "oid", "observedAt"], "observation");
    if (!Number.isSafeInteger(state.observation.observedAt) || state.observation.observedAt < state.approval.consumedAt
      || !["observed", "unknown", "authentication", "multiple"].includes(state.observation.status)
      || !["candidate", "preimage", "conflict", "uncertain"].includes(state.observation.outcome)) throw new Error("observation invariants invalid");
  }
  if (["readback-running", "closed"].includes(state.phase)) {
    exact(state.readback, ["repositoryKind", "alternatesDisabled", "destinationRef", "oid", "tree", "completedAt"], "readback");
    if (state.readback.repositoryKind !== "fresh-disposable" || state.readback.alternatesDisabled !== true || state.readback.destinationRef !== state.destinationRef) throw new Error("readback authority invalid");
    if (state.phase === "closed" && (!Number.isSafeInteger(state.readback.completedAt) || state.readback.completedAt < state.observation.observedAt)) throw new Error("readback completion invalid");
  }
  const reasonExpected = state.phase === "reapproval-required"
    ? new Set(["remote-still-preimage", "remote-preimage-changed"])
    : state.phase === "blocked-recovery"
      ? new Set(["remote-observation-unknown", "remote-observation-authentication", "remote-observation-multiple"])
      : new Set([null]);
  if (!reasonExpected.has(state.reason)) throw new Error("publication reason invariant invalid");
  if (state.phase === "closed") {
    if (!state.readback || state.readback.oid !== state.candidateOid || state.readback.tree !== state.candidateTree
      || state.receiptDigest !== publicationDigest({ ...state, receiptDigest: null })) throw new Error("closed receipt invalid");
  } else if (state.receiptDigest !== null) throw new Error("premature receipt digest");
  return true;
}
