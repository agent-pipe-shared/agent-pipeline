#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { validatePublication } from "../lib/publication-bundle.mjs";

export const LIFECYCLE_SCHEMA = "pipeline.publication-lifecycle.v1";
export const JOURNAL_SCHEMA = "pipeline.publication-close-journal.v1";
export const JOURNAL_PHASES = Object.freeze(["pending", "implementation-result-bound", "feature-closed", "backlog-closed", "close-block-committed", "final-verify-green", "delivery-authorized"]);
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
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("publication-close directory unsafe");
  }
  return current;
}
function syncDirectory(path) { const fd = openSync(path, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }
function assertContained(root, candidate) { const rel = relative(root, candidate); if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("publication-close path escaped"); }

export function publicationClosePaths(gitCommonDir, lifecycleId) {
  if (!isAbsolute(gitCommonDir)) throw new Error("gitCommonDir must be absolute");
  assertId(lifecycleId, "lifecycleId");
  const common = realpathSync(gitCommonDir);
  const directory = resolve(common, "agent-pipeline", "publication-close", lifecycleId);
  assertContained(common, directory);
  return { common, lifecycleId, directory, journal: join(directory, "journal.json"), lifecycle: join(directory, "lifecycle.json"), lock: join(directory, "writer.lock") };
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
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw new Error("publication state permissions invalid");
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
    renameSync(temporary, path); chmodSync(path, 0o600); syncDirectory(dirname(path));
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
