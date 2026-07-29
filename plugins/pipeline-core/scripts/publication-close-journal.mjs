#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { validatePublication } from "../lib/publication-bundle.mjs";
import {
  assertPrivateRegularFile,
  ensurePrivateDirectory,
} from "../lib/private-boundary.mjs";

export const LIFECYCLE_SCHEMA = "pipeline.publication-lifecycle.v1";
export const JOURNAL_SCHEMA = "pipeline.publication-close-journal.v1";
export const JOURNAL_PHASES = Object.freeze(["pending", "implementation-result-bound", "feature-closed", "backlog-closed", "close-block-committed", "final-verify-green", "delivery-authorized"]);
// H5 close-coordinator phases.  The legacy journal phases above remain
// readable for AC-047-27 compatibility; new callers use this single state
// machine and never create a parallel lifecycle.
export const COORDINATOR_SCHEMA = "pipeline.close-coordinator.v1";
export const COORDINATOR_PHASES = Object.freeze(["active", "checkpointed", "feature-close-prepared", "tracked-close-finalized", "candidate-frozen", "final-verify-green", "publication-authorized", "published", "readback-confirmed", "cleanup-complete", "closed-local", "delivered", "release-eligible", "promoted"]);
const COORDINATOR_NEXT = Object.freeze({
  active: ["checkpointed"], checkpointed: ["feature-close-prepared"],
  "feature-close-prepared": ["tracked-close-finalized"],
  "tracked-close-finalized": ["candidate-frozen"],
  "candidate-frozen": ["final-verify-green"],
  "final-verify-green": ["publication-authorized", "cleanup-complete"],
  "publication-authorized": ["published"], published: ["readback-confirmed"],
  "readback-confirmed": ["cleanup-complete"],
  "cleanup-complete": ["closed-local", "delivered"],
  "closed-local": ["release-eligible"], delivered: ["release-eligible"],
  "release-eligible": ["promoted"], promoted: [],
});
export const coordinatorNextPhases = (phase) => [...(COORDINATOR_NEXT[phase] ?? [])];
const HEX40_64 = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const CHANNELS = ["private", "neutral-public"];
const LIFECYCLE_KEYS = ["schema", "lifecycleId", "epicId", "featureId", "revision", "priorStateSha256", "status", "channels", "blockedReason", "prerequisites", "cleanup"];
const JOURNAL_KEYS = ["schema", "lifecycleId", "revision", "priorStateSha256", "phase", "candidateOid", "candidateTree", "authority", "effects"];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const hash = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value)).digest("hex");
export const lifecycleDigest = hash;
const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;

function assertKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} invalid`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} keys invalid`);
}
function assertHex(value, label, exact64 = false) { if (!(exact64 ? HEX64 : HEX40_64).test(value ?? "")) throw new Error(`${label} invalid`); }
function assertId(value, label) { if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(value)) throw new Error(`${label} invalid`); }
function assertCas(state, expectedRevision, expectedStateSha256, label) { if (expectedRevision !== state.revision || expectedStateSha256 !== hash(state)) throw new Error(`stale ${label} CAS`); }

function validateAuthority(authority) {
  assertKeys(authority, ["implementationResultDigest", "prdDigest", "specDigests", "verifyDigest", "criticDigest", "d2ReceiptDigest", "privateIntentDigest", "publicIntentDigest"], "close authority");
  for (const key of ["implementationResultDigest", "prdDigest", "verifyDigest", "criticDigest", "d2ReceiptDigest", "privateIntentDigest", "publicIntentDigest"]) assertHex(authority[key], `authority.${key}`, true);
  if (!Array.isArray(authority.specDigests) || authority.specDigests.length !== 6) throw new Error("six spec digests required");
  authority.specDigests.forEach((value, index) => assertHex(value, `authority.specDigests[${index}]`, true));
}

export function validateCloseJournal(journal) {
  assertKeys(journal, JOURNAL_KEYS, "close journal");
  if (journal.schema !== JOURNAL_SCHEMA || !JOURNAL_PHASES.includes(journal.phase) || !Number.isInteger(journal.revision) || journal.revision < 0) throw new Error("close journal invalid");
  assertId(journal.lifecycleId, "lifecycleId");
  assertHex(journal.candidateOid, "candidateOid"); assertHex(journal.candidateTree, "candidateTree");
  if (journal.revision === 0 ? journal.priorStateSha256 !== null : !HEX64.test(journal.priorStateSha256 ?? "")) throw new Error("journal prior digest invalid");
  validateAuthority(journal.authority);
  if (!Array.isArray(journal.effects) || journal.effects.length !== journal.revision) throw new Error("journal effects/revision mismatch");
  let prior = "pending";
  for (const effect of journal.effects) {
    assertKeys(effect, ["phase", "inputDigest", "observedDigest"], "journal effect");
    const expected = JOURNAL_PHASES[JOURNAL_PHASES.indexOf(prior) + 1];
    if (effect.phase !== expected) throw new Error("journal effect order invalid");
    assertHex(effect.inputDigest, "effect.inputDigest", true); assertHex(effect.observedDigest, "effect.observedDigest", true);
    prior = effect.phase;
  }
  if (journal.phase !== prior) throw new Error("journal phase/effects mismatch");
  return true;
}

function validateCoordinatorAuthority(value) {
  assertKeys(value, ["implementationResultSha256", "pipelineStateSha256", "planSha256", "prdSha256", "specSha256"], "coordinator authority");
  for (const key of ["pipelineStateSha256", "planSha256", "prdSha256", "specSha256"]) {
    assertHex(value[key], `coordinator authority.${key}`, true);
  }
  if (value.implementationResultSha256 !== null) {
    assertHex(value.implementationResultSha256, "coordinator authority.implementationResultSha256", true);
  }
}

function validateCoordinatorActiveFeature(value, featureId) {
  assertKeys(value, ["id", "phase", "planPath"], "coordinator activeFeature");
  if (value.id !== featureId || typeof value.planPath !== "string" || value.planPath.length === 0
    || isAbsolute(value.planPath) || value.planPath.split(/[\\/]/u).includes("..")
    || typeof value.phase !== "string" || value.phase.length === 0) {
    throw new Error("coordinator activeFeature invalid");
  }
}

function validateCoordinatorPublication(value, phase) {
  if (value === null) {
    if (["published", "readback-confirmed", "delivered"].includes(phase)) {
      throw new Error("coordinator publication missing");
    }
    return;
  }
  assertKeys(value, ["channel", "destinationDigest", "oid", "publicationReceiptDigest", "readbackReceiptDigest", "ref", "tree"], "coordinator publication");
  if (!["private", "neutral-public"].includes(value.channel)
    || typeof value.ref !== "string" || !/^refs\/heads\/[A-Za-z0-9._/-]+$/u.test(value.ref)) {
    throw new Error("coordinator publication invalid");
  }
  for (const key of ["destinationDigest", "publicationReceiptDigest"]) assertHex(value[key], `coordinator publication.${key}`, true);
  for (const key of ["oid", "tree"]) assertHex(value[key], `coordinator publication.${key}`);
  if (value.readbackReceiptDigest !== null) assertHex(value.readbackReceiptDigest, "coordinator publication.readbackReceiptDigest", true);
  if (["readback-confirmed", "delivered", "release-eligible", "promoted"].includes(phase)
    && value.readbackReceiptDigest === null) throw new Error("coordinator readback receipt missing");
}

function validateCoordinatorPublicationAuthorization(value, phase) {
  if (value === null) {
    if (["publication-authorized", "published", "readback-confirmed", "delivered"].includes(phase)) {
      throw new Error("coordinator publication authorization missing");
    }
    return;
  }
  assertKeys(value, ["channel", "destinationDigest", "evidenceSha256"], "coordinator publication authorization");
  if (!["private", "neutral-public"].includes(value.channel)) {
    throw new Error("coordinator publication authorization invalid");
  }
  assertHex(value.destinationDigest, "coordinator publication authorization.destinationDigest", true);
  assertHex(value.evidenceSha256, "coordinator publication authorization.evidenceSha256", true);
}

export function validateCloseCoordinator(state) {
  assertKeys(state, ["schema", "lifecycleId", "revision", "priorStateSha256", "phase", "featureId", "activeFeature", "authority", "candidateOid", "candidateTree", "effects", "publicationAuthorization", "publication", "cleanup"], "close coordinator");
  if (state.schema !== COORDINATOR_SCHEMA || !COORDINATOR_PHASES.includes(state.phase) || !Number.isInteger(state.revision) || state.revision < 0) throw new Error("close coordinator invalid");
  assertId(state.lifecycleId, "lifecycleId"); assertId(state.featureId, "featureId");
  validateCoordinatorActiveFeature(state.activeFeature, state.featureId);
  validateCoordinatorAuthority(state.authority);
  if (state.revision === 0 ? state.priorStateSha256 !== null : !HEX64.test(state.priorStateSha256 ?? "")) throw new Error("coordinator prior digest invalid");
  for (const key of ["candidateOid", "candidateTree"]) if (state[key] !== null) assertHex(state[key], `coordinator.${key}`);
  if (!Array.isArray(state.effects) || state.effects.length !== state.revision) throw new Error("coordinator effects/revision mismatch");
  let previous = "active";
  for (const effect of state.effects) {
    assertKeys(effect, ["phase", "inputDigest", "observedDigest", "operationSha256"], "coordinator effect");
    if (!(COORDINATOR_NEXT[previous]?.includes(effect.phase) || (previous === "cleanup-complete" && effect.phase === "cleanup-complete"))) throw new Error("coordinator effect order invalid");
    assertHex(effect.inputDigest, "coordinator inputDigest", true);
    assertHex(effect.observedDigest, "coordinator observedDigest", true);
    assertHex(effect.operationSha256, "coordinator operationSha256", true);
    previous = effect.phase;
  }
  if (state.phase !== previous) throw new Error("coordinator phase/effects mismatch");
  if (state.phase === "candidate-frozen" || COORDINATOR_PHASES.indexOf(state.phase) > COORDINATOR_PHASES.indexOf("candidate-frozen")) {
    if (!state.candidateOid || !state.candidateTree) throw new Error("candidate must be frozen");
  }
  validateCoordinatorPublicationAuthorization(state.publicationAuthorization, state.phase);
  validateCoordinatorPublication(state.publication, state.phase);
  assertKeys(state.cleanup, ["evidenceDigest", "status"], "coordinator cleanup");
  if (!["not-started", "complete", "uncertain"].includes(state.cleanup.status)
    || (state.cleanup.status === "not-started"
      ? state.cleanup.evidenceDigest !== null
      : !HEX64.test(state.cleanup.evidenceDigest ?? ""))) throw new Error("coordinator cleanup invalid");
  if (["closed-local", "delivered", "release-eligible", "promoted"].includes(state.phase) && state.cleanup.status !== "complete") throw new Error("cleanup incomplete");
  return true;
}

export function createCloseCoordinator(input) {
  if (!input || typeof input !== "object") throw new Error("create coordinator input invalid");
  const state = { schema: COORDINATOR_SCHEMA, lifecycleId: input.lifecycleId, revision: 0, priorStateSha256: null, phase: "active", featureId: input.featureId ?? input.lifecycleId, activeFeature: structuredClone(input.activeFeature ?? null), authority: structuredClone(input.authority ?? {}), candidateOid: input.candidateOid ?? null, candidateTree: input.candidateTree ?? null, effects: [], publicationAuthorization: null, publication: null, cleanup: { status: "not-started", evidenceDigest: null } };
  validateCloseCoordinator(state); return state;
}

export function advanceCloseCoordinator(state, args) {
  validateCloseCoordinator(state);
  if (!args || typeof args !== "object") throw new Error("coordinator advance arguments invalid");
  const required = ["expectedRevision", "expectedStateSha256", "phase", "inputDigest", "observedDigest", "operationSha256"];
  for (const key of required) if (!(key in args)) throw new Error(`coordinator advance argument ${key} missing`);
  const allowed = new Set([...required, "candidateOid", "candidateTree", "authorization", "publicationAuthorization", "publication", "cleanupStatus", "cleanupEvidenceDigest", "authority"]);
  if (Object.keys(args).some((key) => !allowed.has(key))) throw new Error("coordinator advance arguments invalid");
  assertCas(state, args.expectedRevision, args.expectedStateSha256, "coordinator");
  assertHex(args.inputDigest, "inputDigest", true); assertHex(args.observedDigest, "observedDigest", true);
  if (args.phase === state.phase) {
    if (state.phase === "cleanup-complete" && state.cleanup.status === "uncertain" && args.cleanupStatus === "complete") {
      const recovered = {
        ...state,
        cleanup: { status: "complete", evidenceDigest: args.cleanupEvidenceDigest ?? null },
        revision: state.revision + 1,
        priorStateSha256: args.expectedStateSha256,
        effects: [...state.effects, {
          phase: "cleanup-complete",
          inputDigest: args.inputDigest,
          observedDigest: args.observedDigest,
          operationSha256: args.operationSha256,
        }],
      };
      validateCloseCoordinator(recovered); return recovered;
    }
    const prior = state.effects.at(-1); if (prior && prior.inputDigest === args.inputDigest && prior.observedDigest === args.observedDigest) return state;
    throw new Error("conflicting coordinator replay");
  }
  if (!COORDINATOR_NEXT[state.phase]?.includes(args.phase)) throw new Error("coordinator transition invalid");
  let authority = state.authority;
  if (args.authority !== undefined) {
    if (args.phase !== "feature-close-prepared" || state.phase !== "checkpointed") throw new Error("coordinator authority update phase invalid");
    validateCoordinatorAuthority(args.authority);
    if (args.authority.prdSha256 !== state.authority.prdSha256
      || args.authority.specSha256 !== state.authority.specSha256
      || args.authority.planSha256 !== state.authority.planSha256
      || (state.authority.implementationResultSha256 !== null
        && args.authority.implementationResultSha256 !== state.authority.implementationResultSha256)) {
      throw new Error("coordinator authority replacement forbidden");
    }
    authority = structuredClone(args.authority);
  }
  if (args.phase === "feature-close-prepared" && authority.implementationResultSha256 === null) {
    throw new Error("feature close requires an implementation Result digest");
  }
  const candidateOid = args.phase === "candidate-frozen" ? (args.candidateOid ?? null) : state.candidateOid;
  const candidateTree = args.phase === "candidate-frozen" ? (args.candidateTree ?? null) : state.candidateTree;
  if (args.phase === "candidate-frozen") { assertHex(candidateOid, "candidateOid"); assertHex(candidateTree, "candidateTree"); }
  if (state.candidateOid && args.candidateOid !== undefined && args.phase !== "candidate-frozen" && args.candidateOid !== state.candidateOid) throw new Error("candidate replacement forbidden");
  if (state.candidateTree && args.candidateTree !== undefined && args.phase !== "candidate-frozen" && args.candidateTree !== state.candidateTree) throw new Error("candidate replacement forbidden");
  if (args.phase === "final-verify-green"
    && (args.candidateOid !== state.candidateOid || args.candidateTree !== state.candidateTree)) {
    throw new Error("final verification candidate mismatch");
  }
  if (args.phase === "publication-authorized") {
    if (args.authorization !== true) throw new Error("publication authorization required");
    validateCoordinatorPublicationAuthorization(args.publicationAuthorization, "publication-authorized");
  }
  if (["release-eligible", "promoted"].includes(args.phase) && args.authorization !== true) {
    throw new Error(`${args.phase} authorization required`);
  }
  if (args.phase === "published") {
    validateCoordinatorPublication(args.publication, "published");
    if (args.publication.oid !== state.candidateOid || args.publication.tree !== state.candidateTree
      || args.publication.channel !== state.publicationAuthorization?.channel
      || args.publication.destinationDigest !== state.publicationAuthorization?.destinationDigest
      || args.publication.readbackReceiptDigest !== null) throw new Error("publication candidate mismatch");
  }
  if (args.phase === "readback-confirmed") {
    validateCoordinatorPublication(args.publication, "readback-confirmed");
    if (state.publication === null
      || args.publication.oid !== state.candidateOid || args.publication.tree !== state.candidateTree
      || args.publication.channel !== state.publication.channel
      || args.publication.destinationDigest !== state.publication.destinationDigest
      || args.publication.ref !== state.publication.ref
      || args.publication.publicationReceiptDigest !== state.publication.publicationReceiptDigest) {
      throw new Error("publication readback mismatch");
    }
  }
  const cleanup = args.phase === "cleanup-complete" ? { status: args.cleanupStatus ?? "complete", evidenceDigest: args.cleanupEvidenceDigest ?? null } : state.cleanup;
  if (args.phase === "cleanup-complete") { if (!["complete", "uncertain"].includes(cleanup.status) || !HEX64.test(cleanup.evidenceDigest ?? "")) throw new Error("cleanup evidence required"); }
  const post = {
    ...state,
    revision: state.revision + 1,
    priorStateSha256: args.expectedStateSha256,
    phase: args.phase,
    authority,
    candidateOid,
    candidateTree,
    publicationAuthorization: args.publicationAuthorization ?? state.publicationAuthorization,
    publication: args.publication ?? state.publication,
    cleanup,
    effects: [...state.effects, {
      phase: args.phase,
      inputDigest: args.inputDigest,
      observedDigest: args.observedDigest,
      operationSha256: args.operationSha256,
    }],
  };
  validateCloseCoordinator(post); return post;
}

export function createCloseJournal(input) {
  assertKeys(input, ["lifecycleId", "candidateOid", "candidateTree", "authority", "afkComplete", "recoveryPending"], "create journal");
  if (input.afkComplete !== true || input.recoveryPending !== false) throw new Error("close blockers active");
  const journal = { schema: JOURNAL_SCHEMA, lifecycleId: input.lifecycleId, revision: 0, priorStateSha256: null, phase: "pending", candidateOid: input.candidateOid, candidateTree: input.candidateTree, authority: structuredClone(input.authority), effects: [] };
  validateCloseJournal(journal);
  return journal;
}

export function advanceCloseJournal(journal, args) {
  validateCloseJournal(journal);
  assertKeys(args, ["expectedRevision", "expectedStateSha256", "phase", "inputDigest", "observedDigest"], "advance arguments");
  assertCas(journal, args.expectedRevision, args.expectedStateSha256, "close-journal");
  assertHex(args.inputDigest, "inputDigest", true); assertHex(args.observedDigest, "observedDigest", true);
  if (args.phase === journal.phase && journal.phase !== "pending") {
    const prior = journal.effects.at(-1);
    if (prior.inputDigest === args.inputDigest && prior.observedDigest === args.observedDigest) return journal;
    throw new Error("conflicting close phase replay");
  }
  const nextPhase = JOURNAL_PHASES[JOURNAL_PHASES.indexOf(journal.phase) + 1];
  if (args.phase !== nextPhase) throw new Error("close phase invalid");
  const post = { ...journal, revision: journal.revision + 1, priorStateSha256: args.expectedStateSha256, phase: args.phase, effects: [...journal.effects, { phase: args.phase, inputDigest: args.inputDigest, observedDigest: args.observedDigest }] };
  validateCloseJournal(post);
  return post;
}

function validatePrerequisites(value) {
  assertKeys(value, ["d2", "closePostimageDigest", "afk", "recoveryPending"], "publication prerequisites");
  assertKeys(value.d2, ["phase", "receiptDigest", "closePostimageDigest"], "D2 prerequisite");
  assertKeys(value.afk, ["status", "receiptDigest"], "AFK prerequisite");
  if (value.d2.phase !== "verified" || value.d2.closePostimageDigest !== value.closePostimageDigest || value.afk.status !== "complete" || value.recoveryPending !== false) throw new Error("publication prerequisites incomplete");
  for (const digest of [value.d2.receiptDigest, value.d2.closePostimageDigest, value.closePostimageDigest, value.afk.receiptDigest]) assertHex(digest, "prerequisite digest", true);
}

function validateChannelRecord(value, channel) {
  if (value === null) return;
  assertKeys(value, ["schema", "channel", "transactionId", "receiptDigest", "receiptRawDigest", "receiptLocator", "endpointFingerprint", "destinationRef", "oid", "tree", "completedAt", "observationPath", "observationRawDigest"], `${channel} channel record`);
  if (value.schema !== "pipeline.publication-channel.v1" || value.channel !== channel) throw new Error("channel record type substitution");
  assertId(value.transactionId, "channel transactionId");
  for (const key of ["receiptDigest", "receiptRawDigest", "endpointFingerprint", "observationRawDigest"]) assertHex(value[key], `channel.${key}`, true);
  for (const key of ["oid", "tree"]) assertHex(value[key], `channel.${key}`);
  for (const key of ["receiptLocator", "observationPath"]) if (typeof value[key] !== "string" || value[key] === "" || isAbsolute(value[key]) || value[key].split(/[\\/]/).includes("..")) throw new Error(`channel.${key} invalid`);
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(value.destinationRef) || !Number.isSafeInteger(value.completedAt)) throw new Error("channel destination/completion invalid");
}

export function validatePublicationLifecycle(state) {
  assertKeys(state, LIFECYCLE_KEYS, "publication lifecycle");
  if (state.schema !== LIFECYCLE_SCHEMA || !Number.isInteger(state.revision) || state.revision < 0 || !new Set(["preparing", "private-complete", "public-complete", "complete", "blocked"]).has(state.status)) throw new Error("publication lifecycle invalid");
  assertId(state.lifecycleId, "lifecycleId"); assertId(state.epicId, "epicId"); assertId(state.featureId, "featureId");
  if (state.revision === 0 ? state.priorStateSha256 !== null : !HEX64.test(state.priorStateSha256 ?? "")) throw new Error("lifecycle prior digest invalid");
  assertKeys(state.channels, CHANNELS, "channels");
  for (const channel of CHANNELS) validateChannelRecord(state.channels[channel], channel);
  validatePrerequisites(state.prerequisites);
  assertKeys(state.cleanup, ["status", "evidenceDigest"], "cleanup");
  if (!new Set(["not-started", "complete", "uncertain"]).has(state.cleanup.status) || (state.cleanup.status === "not-started" ? state.cleanup.evidenceDigest !== null : !HEX64.test(state.cleanup.evidenceDigest ?? ""))) throw new Error("cleanup invalid");
  const derived = deriveStatus(state.channels, state.blockedReason);
  if (state.status !== derived) throw new Error("caller-selected aggregate status");
  return true;
}

export function createPublicationLifecycle(input) {
  assertKeys(input, ["lifecycleId", "epicId", "featureId", "prerequisites"], "create lifecycle");
  const state = { schema: LIFECYCLE_SCHEMA, lifecycleId: input.lifecycleId, epicId: input.epicId, featureId: input.featureId, revision: 0, priorStateSha256: null, status: "preparing", channels: { private: null, "neutral-public": null }, blockedReason: null, prerequisites: structuredClone(input.prerequisites), cleanup: { status: "not-started", evidenceDigest: null } };
  validatePublicationLifecycle(state);
  return state;
}

function deriveStatus(channels, blockedReason) {
  if (blockedReason) return "blocked";
  const privateComplete = channels.private !== null, publicComplete = channels["neutral-public"] !== null;
  return privateComplete && publicComplete ? "complete" : privateComplete ? "private-complete" : publicComplete ? "public-complete" : "preparing";
}

export function importPublicationChannel(state, args) {
  validatePublicationLifecycle(state);
  assertKeys(args, ["expectedRevision", "expectedStateSha256", "channel", "receipt", "receiptRawBytes", "receiptRawDigest", "receiptLocator", "observation"], "import arguments");
  assertCas(state, args.expectedRevision, args.expectedStateSha256, "lifecycle");
  validatePrerequisites(state.prerequisites);
  if (!CHANNELS.includes(args.channel)) throw new Error("channel invalid");
  validatePublication(args.receipt);
  if (typeof args.receiptRawBytes !== "string" || hash(args.receiptRawBytes) !== args.receiptRawDigest) throw new Error("receipt raw digest mismatch");
  let parsedReceipt;
  try { parsedReceipt = JSON.parse(args.receiptRawBytes); } catch { throw new Error("receipt raw bytes invalid"); }
  if (canonical(parsedReceipt) !== canonical(args.receipt) || args.receipt.channel !== args.channel || args.receipt.phase !== "closed") throw new Error("typed receipt mismatch");
  if (typeof args.receiptLocator !== "string" || args.receiptLocator === "" || isAbsolute(args.receiptLocator) || args.receiptLocator.split(/[\\/]/).includes("..")) throw new Error("receipt locator invalid");
  assertKeys(args.observation, ["path", "rawDigest", "endpointFingerprint", "ref", "oid", "tree", "observedAt"], "exact-ref observation");
  if (typeof args.observation.path !== "string" || args.observation.path === "" || isAbsolute(args.observation.path) || args.observation.path.split(/[\\/]/).includes("..")) throw new Error("observation path invalid");
  assertHex(args.observation.rawDigest, "observation.rawDigest", true); assertHex(args.observation.endpointFingerprint, "observation.endpointFingerprint", true);
  if (args.receipt.remoteFingerprint !== args.observation.endpointFingerprint || args.receipt.destinationRef !== args.observation.ref || args.receipt.candidateOid !== args.observation.oid || args.receipt.candidateTree !== args.observation.tree || args.receipt.readback?.oid !== args.observation.oid || args.receipt.readback?.tree !== args.observation.tree || !Number.isSafeInteger(args.observation.observedAt)) throw new Error("receipt observation mismatch");
  const value = { schema: args.receipt.schema, channel: args.channel, transactionId: args.receipt.transactionId, receiptDigest: args.receipt.receiptDigest, receiptRawDigest: args.receiptRawDigest, receiptLocator: args.receiptLocator, endpointFingerprint: args.observation.endpointFingerprint, destinationRef: args.observation.ref, oid: args.observation.oid, tree: args.observation.tree, completedAt: args.observation.observedAt, observationPath: args.observation.path, observationRawDigest: args.observation.rawDigest };
  const current = state.channels[args.channel];
  if (current !== null) {
    if (canonical(current) === canonical(value)) return state;
    throw new Error("conflicting receipt replay");
  }
  const channels = { ...state.channels, [args.channel]: value };
  const post = { ...state, revision: state.revision + 1, priorStateSha256: args.expectedStateSha256, channels, status: deriveStatus(channels, state.blockedReason) };
  validatePublicationLifecycle(post);
  return post;
}

export function recordCleanup(state, args) {
  validatePublicationLifecycle(state);
  assertKeys(args, ["expectedRevision", "expectedStateSha256", "status", "evidenceDigest"], "cleanup arguments");
  assertCas(state, args.expectedRevision, args.expectedStateSha256, "lifecycle");
  if (state.status !== "complete" || state.cleanup.status !== "not-started") throw new Error("cleanup requires complete publication");
  if (!new Set(["complete", "uncertain"]).has(args.status)) throw new Error("cleanup invalid");
  assertHex(args.evidenceDigest, "cleanup evidence", true);
  const blockedReason = args.status === "uncertain" ? "cleanup-uncertain" : null;
  const post = { ...state, revision: state.revision + 1, priorStateSha256: args.expectedStateSha256, cleanup: { status: args.status, evidenceDigest: args.evidenceDigest }, blockedReason, status: deriveStatus(state.channels, blockedReason) };
  validatePublicationLifecycle(post);
  return post;
}

function ensureDirectoryChain(root, components) {
  let current = root;
  for (const component of components) {
    current = join(current, component);
    ensurePrivateDirectory(current);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()
      || (process.platform !== "win32" && (stat.mode & 0o777) !== 0o700)) {
      throw new Error("publication-close directory unsafe");
    }
  }
  return current;
}
function unsupportedDirectoryDurability(error, platform) {
  return platform === "win32"
    && ["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"].includes(error?.code);
}

/**
 * Flush the publication-close parent directory where the host supports it.
 *
 * Native Windows does not expose a portable Node directory-fsync primitive:
 * opening or syncing a directory can reject an otherwise durable regular-file
 * replacement.  Only that narrow, typed platform limitation is tolerated.
 * POSIX and unrelated Windows I/O failures remain fail-closed.
 */
export function syncPublicationCloseDirectory(path, {
  platform = process.platform,
  open = openSync,
  fsync = fsyncSync,
  close = closeSync,
} = {}) {
  let fd;
  try {
    fd = open(path, constants.O_RDONLY);
  } catch (error) {
    if (unsupportedDirectoryDurability(error, platform)) {
      return { status: "unsupported", stage: "open", code: error.code };
    }
    throw error;
  }
  try {
    fsync(fd);
    return { status: "synced" };
  } catch (error) {
    if (unsupportedDirectoryDurability(error, platform)) {
      return { status: "unsupported", stage: "fsync", code: error.code };
    }
    throw error;
  } finally {
    close(fd);
  }
}
function assertContained(root, candidate) { const rel = relative(root, candidate); if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("publication-close path escaped"); }

export function publicationClosePaths(gitCommonDir, lifecycleId) {
  if (!isAbsolute(gitCommonDir)) throw new Error("gitCommonDir must be absolute");
  assertId(lifecycleId, "lifecycleId");
  const common = realpathSync(gitCommonDir);
  const directory = resolve(common, "agent-pipeline", "publication-close", lifecycleId);
  assertContained(common, directory);
  return { common, lifecycleId, directory, journal: join(directory, "journal.json"), coordinator: join(directory, "coordinator.json"), lifecycle: join(directory, "lifecycle.json"), lock: join(directory, "writer.lock") };
}

function withLock(paths, action) {
  ensureDirectoryChain(paths.common, ["agent-pipeline", "publication-close", paths.lifecycleId]);
  let fd;
  let acquired = false;
  let ownerBytes = null;
  try {
    fd = openSync(paths.lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    acquired = true;
    ownerBytes = `${JSON.stringify({ pid: process.pid, nonce: randomBytes(16).toString("hex") })}\n`;
    writeFileSync(fd, ownerBytes);
    fsyncSync(fd); closeSync(fd); fd = undefined;
    return action();
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (acquired && existsSync(paths.lock) && readFileSync(paths.lock, "utf8") === ownerBytes) unlinkSync(paths.lock);
  }
}

function readMode0600(path, validator) {
  assertPrivateRegularFile(path, "publication state");
  const raw = readFileSync(path);
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("publication state torn or invalid JSON"); }
  validator(value);
  return { value, rawDigest: hash(raw), raw };
}

function durableReplace(path, value) {
  const bytes = jsonBytes(value);
  const temporary = join(dirname(path), `.journal.${process.pid}.${randomBytes(12).toString("hex")}.tmp`);
  try {
    const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, path); chmodSync(path, 0o600);
    assertPrivateRegularFile(path, "publication state");
    syncPublicationCloseDirectory(dirname(path));
    return { rawDigest: hash(bytes), bytes };
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

export function storeCloseJournal({ gitCommonDir, journal, expectedRawSha256 }) {
  validateCloseJournal(journal);
  const paths = publicationClosePaths(gitCommonDir, journal.lifecycleId);
  return withLock(paths, () => {
    const exists = existsSync(paths.journal);
    if (!exists && expectedRawSha256 !== null) throw new Error("close journal missing for CAS");
    if (exists) {
      const current = readMode0600(paths.journal, validateCloseJournal);
      if (current.rawDigest !== expectedRawSha256) throw new Error("stale close journal raw CAS");
      const wanted = jsonBytes(journal);
      if (current.raw.equals(Buffer.from(wanted))) return { path: paths.journal, rawDigest: current.rawDigest, written: false };
      if (journal.revision !== current.value.revision + 1 || journal.priorStateSha256 !== hash(current.value) || journal.lifecycleId !== current.value.lifecycleId || journal.candidateOid !== current.value.candidateOid || journal.candidateTree !== current.value.candidateTree || canonical(journal.authority) !== canonical(current.value.authority)) throw new Error("close journal transition invalid");
    } else if (expectedRawSha256 !== null) throw new Error("stale close journal raw CAS");
    else if (journal.revision !== 0) throw new Error("initial close journal revision invalid");
    const stored = durableReplace(paths.journal, journal);
    return { path: paths.journal, rawDigest: stored.rawDigest, written: true };
  });
}

export function readCloseJournal(gitCommonDir, lifecycleId) {
  const paths = publicationClosePaths(gitCommonDir, lifecycleId);
  const stored = readMode0600(paths.journal, validateCloseJournal);
  return { journal: stored.value, rawDigest: stored.rawDigest, path: paths.journal, nextPhase: JOURNAL_PHASES[JOURNAL_PHASES.indexOf(stored.value.phase) + 1] ?? null };
}

/** Durable CAS persistence for the H5 coordinator (same private authority). */
export function storeCloseCoordinator({ gitCommonDir, coordinator, expectedRawSha256 }) {
  validateCloseCoordinator(coordinator);
  const paths = publicationClosePaths(gitCommonDir, coordinator.lifecycleId);
  return withLock(paths, () => {
    const exists = existsSync(paths.coordinator);
    if (!exists && expectedRawSha256 !== null) throw new Error("close coordinator missing for CAS");
    if (exists) {
      const current = readMode0600(paths.coordinator, validateCloseCoordinator);
      if (current.rawDigest !== expectedRawSha256) throw new Error("stale close coordinator raw CAS");
      const wanted = jsonBytes(coordinator);
      if (current.raw.equals(Buffer.from(wanted))) return { path: paths.coordinator, rawDigest: current.rawDigest, written: false };
      if (coordinator.revision !== current.value.revision + 1
        || coordinator.priorStateSha256 !== hash(current.value)
        || coordinator.lifecycleId !== current.value.lifecycleId
        || coordinator.featureId !== current.value.featureId
        || canonical(coordinator.activeFeature) !== canonical(current.value.activeFeature)
        || (canonical(coordinator.authority) !== canonical(current.value.authority)
          && !(current.value.phase === "checkpointed"
            && coordinator.phase === "feature-close-prepared"
            && coordinator.authority.prdSha256 === current.value.authority.prdSha256
            && coordinator.authority.specSha256 === current.value.authority.specSha256
            && coordinator.authority.planSha256 === current.value.authority.planSha256
            && (current.value.authority.implementationResultSha256 === null
              || coordinator.authority.implementationResultSha256 === current.value.authority.implementationResultSha256)))) {
        throw new Error("close coordinator transition invalid");
      }
    } else if (coordinator.revision !== 0) throw new Error("initial close coordinator revision invalid");
    const stored = durableReplace(paths.coordinator, coordinator);
    return { path: paths.coordinator, rawDigest: stored.rawDigest, written: true };
  });
}

export function readCloseCoordinator(gitCommonDir, lifecycleId) {
  const paths = publicationClosePaths(gitCommonDir, lifecycleId);
  const stored = readMode0600(paths.coordinator, validateCloseCoordinator);
  return { coordinator: stored.value, rawDigest: stored.rawDigest, path: paths.coordinator, nextPhase: COORDINATOR_NEXT[stored.value.phase]?.[0] ?? null };
}

export function storePublicationLifecycle({ gitCommonDir, lifecycle, expectedRawSha256 }) {
  validatePublicationLifecycle(lifecycle);
  const paths = publicationClosePaths(gitCommonDir, lifecycle.lifecycleId);
  return withLock(paths, () => {
    const exists = existsSync(paths.lifecycle);
    if (!exists && expectedRawSha256 !== null) throw new Error("publication lifecycle missing for CAS");
    if (exists) {
      const current = readMode0600(paths.lifecycle, validatePublicationLifecycle);
      if (current.rawDigest !== expectedRawSha256) throw new Error("stale publication lifecycle raw CAS");
      const wanted = jsonBytes(lifecycle);
      if (current.raw.equals(Buffer.from(wanted))) return { path: paths.lifecycle, rawDigest: current.rawDigest, written: false };
      if (lifecycle.revision !== current.value.revision + 1 || lifecycle.priorStateSha256 !== hash(current.value) || lifecycle.lifecycleId !== current.value.lifecycleId || lifecycle.epicId !== current.value.epicId || lifecycle.featureId !== current.value.featureId || canonical(lifecycle.prerequisites) !== canonical(current.value.prerequisites)) throw new Error("publication lifecycle transition invalid");
    }
    else if (lifecycle.revision !== 0) throw new Error("initial publication lifecycle revision invalid");
    const stored = durableReplace(paths.lifecycle, lifecycle);
    return { path: paths.lifecycle, rawDigest: stored.rawDigest, written: true };
  });
}

export function readPublicationLifecycle(gitCommonDir, lifecycleId) {
  const paths = publicationClosePaths(gitCommonDir, lifecycleId);
  const stored = readMode0600(paths.lifecycle, validatePublicationLifecycle);
  return { lifecycle: stored.value, rawDigest: stored.rawDigest, path: paths.lifecycle };
}
