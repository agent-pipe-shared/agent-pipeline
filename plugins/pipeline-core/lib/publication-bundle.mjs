// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";

export const PUBLICATION_SCHEMA = "pipeline.publication-channel.v1";
export const CHANNELS = new Set(["private", "neutral-public"]);
export const PHASES = new Set([
  "prepared", "approved", "push-authorized", "pushed-observed",
  "readback-running", "closed", "reapproval-required", "blocked-recovery",
]);

const HEX40_64 = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const STATE_KEYS = [
  "schema", "channel", "transactionId", "revision", "priorStateSha256", "phase",
  "repositoryFingerprint", "sourceCommit", "sourceTree", "remoteFingerprint",
  "remoteName", "destinationRef", "remotePreimageOid", "candidateOid", "candidateTree",
  "ancestry", "identityProbe", "verifyEvidence", "securityEvidence", "neutralEvidence",
  "approval", "pushIntent", "observation", "readback", "reason", "receiptDigest",
];
const PREPARE_BASE_KEYS = [
  "channel", "transactionId", "repositoryFingerprint", "sourceCommit", "sourceTree",
  "remoteFingerprint", "remoteName", "destinationRef", "remotePreimageOid",
  "candidateOid", "candidateTree", "ancestry", "identityProbe", "verifyEvidence",
  "securityEvidence",
];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
export const publicationDigest = sha;

function assertKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} invalid`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} keys invalid`);
}
function assertHex(value, label, exact64 = false) {
  if (!(exact64 ? HEX64 : HEX40_64).test(value ?? "")) throw new Error(`${label} invalid`);
}
function assertId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:@/-]{1,200}$/.test(value)) throw new Error(`${label} invalid`);
}
function assertEvidence(value, label, commit, tree) {
  assertKeys(value, ["path", "rawDigest", "commit", "tree"], label);
  if (typeof value.path !== "string" || value.path === "" || value.path.startsWith("/") || value.path.split(/[\\/]/).includes("..")) throw new Error(`${label}.path invalid`);
  assertHex(value.rawDigest, `${label}.rawDigest`, true);
  if (value.commit !== commit || value.tree !== tree) throw new Error(`${label} candidate binding invalid`);
}
function approvalTuple(state) {
  return {
    schema: state.schema, channel: state.channel, transactionId: state.transactionId,
    repositoryFingerprint: state.repositoryFingerprint, sourceCommit: state.sourceCommit,
    sourceTree: state.sourceTree, remoteFingerprint: state.remoteFingerprint,
    remoteName: state.remoteName, destinationRef: state.destinationRef,
    remotePreimageOid: state.remotePreimageOid, candidateOid: state.candidateOid,
    candidateTree: state.candidateTree, ancestry: state.ancestry,
    identityProbe: state.identityProbe, verifyEvidence: state.verifyEvidence,
    securityEvidence: state.securityEvidence, neutralEvidence: state.neutralEvidence,
  };
}
function cas(state, revision, digest) {
  if (revision !== state.revision || digest !== sha(state)) throw new Error("stale publication CAS");
}
function next(state, expectedStateSha256, changes) {
  return { ...state, ...changes, revision: state.revision + 1, priorStateSha256: expectedStateSha256 };
}

export function preparePublication(input) {
  if (!CHANNELS.has(input?.channel)) throw new Error("channel invalid");
  assertKeys(input, input.channel === "neutral-public" ? [...PREPARE_BASE_KEYS, "neutralEvidence"] : PREPARE_BASE_KEYS, "prepare");
  assertId(input.transactionId, "transactionId");
  assertHex(input.repositoryFingerprint, "repositoryFingerprint", true);
  for (const key of ["sourceCommit", "sourceTree", "candidateOid", "candidateTree"]) assertHex(input[key], key);
  assertHex(input.remoteFingerprint, "remoteFingerprint", true);
  assertId(input.remoteName, "remoteName");
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(input.destinationRef) || input.destinationRef.includes("..")) throw new Error("destinationRef invalid");
  if (input.remotePreimageOid !== null) assertHex(input.remotePreimageOid, "remotePreimageOid");
  assertKeys(input.ancestry, ["baseOid", "candidateOid", "descends"], "ancestry");
  if (input.ancestry.baseOid !== input.remotePreimageOid || input.ancestry.candidateOid !== input.candidateOid || input.ancestry.descends !== true) throw new Error("candidate ancestry invalid");
  assertEvidence(input.identityProbe, "identityProbe", input.candidateOid, input.candidateTree);
  assertEvidence(input.verifyEvidence, "verifyEvidence", input.candidateOid, input.candidateTree);
  assertEvidence(input.securityEvidence, "securityEvidence", input.candidateOid, input.candidateTree);
  let neutralEvidence = null;
  if (input.channel === "neutral-public") {
    assertKeys(input.neutralEvidence, ["planDigest", "reviewDigest", "leakageDigest", "metadataDigest", "endpointProbeDigest", "candidateCommit", "candidateTree"], "neutralEvidence");
    for (const key of ["planDigest", "reviewDigest", "leakageDigest", "metadataDigest", "endpointProbeDigest"]) assertHex(input.neutralEvidence[key], `neutralEvidence.${key}`, true);
    if (input.neutralEvidence.candidateCommit !== input.candidateOid || input.neutralEvidence.candidateTree !== input.candidateTree) throw new Error("neutral evidence candidate mismatch");
    neutralEvidence = { ...input.neutralEvidence };
  }
  const state = {
    schema: PUBLICATION_SCHEMA, channel: input.channel, transactionId: input.transactionId,
    revision: 0, priorStateSha256: null, phase: "prepared",
    repositoryFingerprint: input.repositoryFingerprint, sourceCommit: input.sourceCommit,
    sourceTree: input.sourceTree, remoteFingerprint: input.remoteFingerprint,
    remoteName: input.remoteName, destinationRef: input.destinationRef,
    remotePreimageOid: input.remotePreimageOid, candidateOid: input.candidateOid,
    candidateTree: input.candidateTree, ancestry: { ...input.ancestry },
    identityProbe: { ...input.identityProbe }, verifyEvidence: { ...input.verifyEvidence },
    securityEvidence: { ...input.securityEvidence }, neutralEvidence,
    approval: null, pushIntent: null, observation: null, readback: null,
    reason: null, receiptDigest: null,
  };
  validatePublication(state);
  return state;
}

export function approvePublication(state, args) {
  validatePublication(state);
  assertKeys(args, ["expectedRevision", "expectedStateSha256", "approvalId", "attribution", "approvedAt", "expiresAt"], "approval arguments");
  cas(state, args.expectedRevision, args.expectedStateSha256);
  if (state.phase !== "prepared") throw new Error("approval requires prepared");
  assertId(args.approvalId, "approvalId");
  if (typeof args.attribution !== "string" || args.attribution.trim() === "") throw new Error("approval attribution invalid");
  if (!Number.isSafeInteger(args.approvedAt) || !Number.isSafeInteger(args.expiresAt) || args.expiresAt <= args.approvedAt || args.expiresAt - args.approvedAt > 900_000) throw new Error("approval window invalid");
  return next(state, args.expectedStateSha256, { phase: "approved", approval: { id: args.approvalId, attribution: args.attribution, approvedAt: args.approvedAt, expiresAt: args.expiresAt, tupleDigest: sha(approvalTuple(state)), consumedAt: null } });
}

export function authorizePublication(state, args) {
  validatePublication(state);
  assertKeys(args, ["expectedRevision", "expectedStateSha256", "now", "command"], "authorization arguments");
  cas(state, args.expectedRevision, args.expectedStateSha256);
  if (state.phase !== "approved" || !Number.isSafeInteger(args.now) || args.now < state.approval.approvedAt || args.now > state.approval.expiresAt) throw new Error("approval absent or expired");
  if (state.approval.tupleDigest !== sha(approvalTuple(state))) throw new Error("approval tuple drift");
  const expected = ["git", "push", "--porcelain", state.remoteName, `${state.candidateOid}:${state.destinationRef}`];
  if (!Array.isArray(args.command) || canonical(args.command) !== canonical(expected)) throw new Error("push command invalid");
  return next(state, args.expectedStateSha256, {
    phase: "push-authorized",
    approval: { ...state.approval, consumedAt: args.now },
    pushIntent: { command: [...args.command], authorizedAt: args.now, approvalId: state.approval.id, tupleDigest: state.approval.tupleDigest },
  });
}

export function observePublication(state, args) {
  validatePublication(state);
  assertKeys(args, ["expectedRevision", "expectedStateSha256", "observedOid", "observedAt", "status"], "observation arguments");
  cas(state, args.expectedRevision, args.expectedStateSha256);
  if (state.phase !== "push-authorized") throw new Error("observation requires authorization");
  if (!Number.isSafeInteger(args.observedAt) || !new Set(["observed", "unknown", "authentication", "multiple"]).has(args.status)) throw new Error("observation invalid");
  if (args.status !== "observed") return next(state, args.expectedStateSha256, { phase: "blocked-recovery", reason: `remote-observation-${args.status}`, observation: { status: args.status, outcome: "uncertain", oid: null, observedAt: args.observedAt } });
  if (args.observedOid !== null) assertHex(args.observedOid, "observedOid");
  if (args.observedOid === state.candidateOid) return next(state, args.expectedStateSha256, { phase: "pushed-observed", observation: { status: "observed", outcome: "candidate", oid: args.observedOid, observedAt: args.observedAt } });
  if (state.remotePreimageOid === args.observedOid) return next(state, args.expectedStateSha256, { phase: "reapproval-required", reason: "remote-still-preimage", observation: { status: "observed", outcome: "preimage", oid: args.observedOid, observedAt: args.observedAt } });
  return next(state, args.expectedStateSha256, { phase: "blocked-recovery", reason: "remote-observation-conflict", observation: { status: "observed", outcome: "conflict", oid: args.observedOid, observedAt: args.observedAt } });
}

export function startReadback(state, args) {
  validatePublication(state);
  assertKeys(args, ["expectedRevision", "expectedStateSha256", "repositoryKind", "alternatesDisabled", "destinationRef"], "readback arguments");
  cas(state, args.expectedRevision, args.expectedStateSha256);
  if (state.phase !== "pushed-observed" || args.repositoryKind !== "fresh-disposable" || args.alternatesDisabled !== true || args.destinationRef !== state.destinationRef) throw new Error("readback out of order or untrusted");
  return next(state, args.expectedStateSha256, { phase: "readback-running", readback: { repositoryKind: args.repositoryKind, alternatesDisabled: true, destinationRef: args.destinationRef, oid: null, tree: null, completedAt: null } });
}

export function closePublication(state, args) {
  validatePublication(state);
  assertKeys(args, ["expectedRevision", "expectedStateSha256", "fetchedRef", "fetchedOid", "fetchedTree", "completedAt"], "close arguments");
  cas(state, args.expectedRevision, args.expectedStateSha256);
  if (state.phase !== "readback-running") throw new Error("close out of order");
  if (args.fetchedRef !== state.destinationRef || args.fetchedOid !== state.candidateOid || args.fetchedTree !== state.candidateTree || !Number.isSafeInteger(args.completedAt)) throw new Error("readback mismatch");
  const post = next(state, args.expectedStateSha256, { phase: "closed", readback: { ...state.readback, oid: args.fetchedOid, tree: args.fetchedTree, completedAt: args.completedAt } });
  post.receiptDigest = sha(post);
  validatePublication(post);
  return post;
}

export function rearmPublication(state, args) {
  validatePublication(state);
  assertKeys(args, ["expectedRevision", "expectedStateSha256", "freshPreimageOid", "candidateDescendsFromFreshPreimage", "attended", "priorUncertaintyDigest"], "rearm arguments");
  cas(state, args.expectedRevision, args.expectedStateSha256);
  if (!new Set(["reapproval-required", "blocked-recovery"]).has(state.phase) || args.attended !== true || args.candidateDescendsFromFreshPreimage !== true || args.priorUncertaintyDigest !== sha({ phase: state.phase, reason: state.reason, observation: state.observation })) throw new Error("rearm unavailable or unbound");
  if (args.freshPreimageOid !== null) assertHex(args.freshPreimageOid, "freshPreimageOid");
  return next(state, args.expectedStateSha256, { phase: "prepared", remotePreimageOid: args.freshPreimageOid, ancestry: { ...state.ancestry, baseOid: args.freshPreimageOid }, approval: null, pushIntent: null, observation: null, readback: null, reason: null, receiptDigest: null });
}

export function publicationUncertaintyDigest(state) {
  validatePublication(state);
  return sha({ phase: state.phase, reason: state.reason, observation: state.observation });
}

export function validatePublication(state) {
  assertKeys(state, STATE_KEYS, "publication state");
  if (state.schema !== PUBLICATION_SCHEMA || !CHANNELS.has(state.channel) || !PHASES.has(state.phase) || !Number.isInteger(state.revision) || state.revision < 0) throw new Error("publication state invalid");
  if (state.revision === 0 ? state.priorStateSha256 !== null : !HEX64.test(state.priorStateSha256 ?? "")) throw new Error("prior state digest invalid");
  assertId(state.transactionId, "transactionId");
  assertHex(state.repositoryFingerprint, "repositoryFingerprint", true);
  for (const key of ["sourceCommit", "sourceTree", "candidateOid", "candidateTree"]) assertHex(state[key], key);
  assertHex(state.remoteFingerprint, "remoteFingerprint", true);
  assertId(state.remoteName, "remoteName");
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(state.destinationRef) || state.destinationRef.includes("..")) throw new Error("destinationRef invalid");
  if (state.remotePreimageOid !== null) assertHex(state.remotePreimageOid, "remotePreimageOid");
  assertKeys(state.ancestry, ["baseOid", "candidateOid", "descends"], "ancestry");
  if (state.ancestry.baseOid !== state.remotePreimageOid || state.ancestry.candidateOid !== state.candidateOid || state.ancestry.descends !== true) throw new Error("candidate ancestry invalid");
  assertEvidence(state.identityProbe, "identityProbe", state.candidateOid, state.candidateTree);
  assertEvidence(state.verifyEvidence, "verifyEvidence", state.candidateOid, state.candidateTree);
  assertEvidence(state.securityEvidence, "securityEvidence", state.candidateOid, state.candidateTree);
  if (state.channel === "private" ? state.neutralEvidence !== null : state.neutralEvidence === null) throw new Error("channel evidence substitution");
  if (state.neutralEvidence !== null) {
    assertKeys(state.neutralEvidence, ["planDigest", "reviewDigest", "leakageDigest", "metadataDigest", "endpointProbeDigest", "candidateCommit", "candidateTree"], "neutralEvidence");
    for (const key of ["planDigest", "reviewDigest", "leakageDigest", "metadataDigest", "endpointProbeDigest"]) assertHex(state.neutralEvidence[key], `neutralEvidence.${key}`, true);
    if (state.neutralEvidence.candidateCommit !== state.candidateOid || state.neutralEvidence.candidateTree !== state.candidateTree) throw new Error("neutral evidence candidate mismatch");
  }
  if (state.approval !== null) {
    assertKeys(state.approval, ["id", "attribution", "approvedAt", "expiresAt", "tupleDigest", "consumedAt"], "approval");
    assertHex(state.approval.tupleDigest, "approval.tupleDigest", true);
    if (state.approval.tupleDigest !== sha(approvalTuple(state))) throw new Error("approval tuple drift");
    if (["push-authorized", "pushed-observed", "readback-running", "closed", "reapproval-required", "blocked-recovery"].includes(state.phase) && !Number.isSafeInteger(state.approval.consumedAt)) throw new Error("approval not consumed");
  }
  if (["prepared"].includes(state.phase) && (state.approval !== null || state.pushIntent !== null || state.observation !== null || state.readback !== null || state.reason !== null)) throw new Error("prepared state contaminated");
  if (state.phase === "approved" && (state.approval === null || state.approval.consumedAt !== null || state.pushIntent !== null || state.observation !== null || state.readback !== null)) throw new Error("approved state invalid");
  if (["push-authorized", "pushed-observed", "readback-running", "closed", "reapproval-required", "blocked-recovery"].includes(state.phase)) {
    if (state.approval === null || state.pushIntent === null) throw new Error("publication authorization history missing");
    assertKeys(state.pushIntent, ["command", "authorizedAt", "approvalId", "tupleDigest"], "pushIntent");
    const expectedCommand = ["git", "push", "--porcelain", state.remoteName, `${state.candidateOid}:${state.destinationRef}`];
    if (canonical(state.pushIntent.command) !== canonical(expectedCommand) || state.pushIntent.approvalId !== state.approval.id || state.pushIntent.tupleDigest !== state.approval.tupleDigest) throw new Error("push intent drift");
  }
  if (["pushed-observed", "readback-running", "closed", "reapproval-required", "blocked-recovery"].includes(state.phase)) {
    assertKeys(state.observation, ["status", "outcome", "oid", "observedAt"], "observation");
    if (!Number.isSafeInteger(state.observation.observedAt)) throw new Error("observation invalid");
  }
  if (["readback-running", "closed"].includes(state.phase)) {
    assertKeys(state.readback, ["repositoryKind", "alternatesDisabled", "destinationRef", "oid", "tree", "completedAt"], "readback");
    if (state.readback.repositoryKind !== "fresh-disposable" || state.readback.alternatesDisabled !== true || state.readback.destinationRef !== state.destinationRef) throw new Error("readback authority invalid");
  }
  if (state.phase === "closed") {
    if (!state.readback || state.readback.oid !== state.candidateOid || state.readback.tree !== state.candidateTree || state.receiptDigest !== sha({ ...state, receiptDigest: null })) throw new Error("closed receipt invalid");
  } else if (state.receiptDigest !== null) throw new Error("premature receipt digest");
  return true;
}
