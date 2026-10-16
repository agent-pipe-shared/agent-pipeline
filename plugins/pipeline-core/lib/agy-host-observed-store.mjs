// SPDX-License-Identifier: SUL-1.0
/**
 * Private, exclusive byte store for host-observed Agy evidence. A successful
 * read proves only that the private bytes match the supplied authored record;
 * consent, result and Git history must still be independently re-read before
 * local authorship can be admitted. This file is never a portable export.
 */
import { randomBytes, createHash } from "node:crypto";
import { basename, join, resolve, isAbsolute } from "node:path";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeSync } from "node:fs";
import { isSafeTaskId } from "./dispatch-record.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { validateAgyHostObservedReceiptShape } from "./agy-host-observed-receipt.mjs";
import { canonical } from "./po-approval-proof.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { inspectSourceOwnedSessionAuthorityProducerRecord } from "./session-authority-registry.mjs";
import { withSourceOwnedAgyHostObservedPublication } from "./agy-session-dispatch.mjs";

const SUBDIRS = ["agent-pipeline", "run", "agy-host-observed"];
const MAX_BYTES = 16 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sameInode = (a, b) => String(a.dev) === String(b.dev) && String(a.ino) === String(b.ino);
const sameSnapshot = (a, b) => sameInode(a, b) && a.size === b.size
  && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const sameContentSnapshot = (a, b) => sameInode(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs;
function fail(code) { throw Object.assign(new Error(code), { code }); }

// Closed physical namespaces, not arbitrary host discovery. Missing roots are
// observed only after their existing ancestors have been checked physically.
const AUTHORITY_ROOTS = Object.freeze({
  "agy-session-consent": "agent-pipeline/run/agy-session-consent",
  "agy-session-consent-revocations": "agent-pipeline/run/agy-session-consent-revocations",
  "agy-host-observed": "agent-pipeline/run/agy-host-observed",
  "registered-opaque-context-lifetimes": "agent-pipeline/run/agy-authority-contexts",
});
const AUTHORITY_BYTES = 1024 * 1024;
let authorityTransaction = null;
export function withAgyAuthorityStoreTransaction({ repository, boundary, producerPort }, callback) {
  const actual = inspectAgyAuthorityRepository(repository);
  const inspected = inspectSourceOwnedSessionAuthorityProducerRecord({ boundary, producerPort });
  const allowed = inspected.record.producerId === "agy-session-consent"
    ? ["agy-session-consent", "agy-session-consent-revocations"]
    : inspected.record.producerId === "agy-family-dispatch" ? ["agy-host-observed", "registered-opaque-context-lifetimes"] : [];
  if (!allowed.length || authorityTransaction !== null || typeof callback !== "function") fail("AGY-AUTHORITY-TRANSACTION");
  authorityTransaction = { repository: actual, boundary, producerPort, allowed };
  try { const result = callback(); if (result && typeof result.then === "function") fail("AGY-AUTHORITY-TRANSACTION-ASYNC"); return result; }
  finally { authorityTransaction = null; }
}
function storeBoundary(repository, boundary, producerPort, namespaceId) {
  const transaction = authorityTransaction;
  if (!transaction || transaction.boundary !== boundary || transaction.producerPort !== producerPort
    || canonical(transaction.repository) !== canonical(inspectAgyAuthorityRepository(repository))
    || !transaction.allowed.includes(namespaceId)) fail("AGY-AUTHORITY-TRANSACTION");
}
const own = (stat, directory = false) => {
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())
    || (stat.mode & 0o777) !== (directory ? 0o700 : 0o600)
    || (!directory && stat.nlink !== 1)
    || (typeof process.getuid === "function" && stat.uid !== process.getuid())) fail("AGY-AUTHORITY-PRIVATE-PATH");
};
export function inspectAgyAuthorityRepository(repository) {
  if (!repository || Object.keys(repository).sort().join("\0") !== "candidate\0commonDir\0primaryRoot") fail("AGY-AUTHORITY-REPOSITORY");
  const actual = inspectSignedDescriptorCustodyRepository(repository.primaryRoot);
  if (canonical(actual) !== canonical(repository)) fail("AGY-AUTHORITY-REPOSITORY-CAS");
  return Object.freeze(structuredClone(actual));
}
function authorityRoot(repository, namespaceId, create = false) {
  const repo = inspectAgyAuthorityRepository(repository), suffix = AUTHORITY_ROOTS[namespaceId];
  if (!suffix) fail("AGY-AUTHORITY-NAMESPACE");
  let path = repo.commonDir;
  const common = lstatSync(path);
  if (!common.isDirectory() || common.isSymbolicLink() || realpathSync(path) !== path) fail("AGY-AUTHORITY-PRIVATE-PATH");
  const ancestors = [{ path, stat: common }];
  let absent = false;
  for (const part of suffix.split("/")) {
    path = join(path, part);
    if (create) { try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") throw error; } }
    if (absent || !existsSync(path)) { absent = true; continue; }
    const stat = lstatSync(path); own(stat, true); ancestors.push({ path, stat });
    if (realpathSync(path) !== path) fail("AGY-AUTHORITY-PRIVATE-PATH");
  }
  return { repo, suffix, path, absent, ancestors };
}
function verifyAuthorityParents(root) {
  for (let index = 0; index < root.ancestors.length; index++) {
    const entry = root.ancestors[index], stat = lstatSync(entry.path);
    if (index > 0) own(stat, true);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !sameSnapshot(entry.stat, stat) || realpathSync(entry.path) !== entry.path) fail("AGY-AUTHORITY-CAS");
  }
}
function authorityRead(path) {
  const before = lstatSync(path); own(before);
  if (!before.size || before.size > AUTHORITY_BYTES) fail("AGY-AUTHORITY-SIZE");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd); own(opened);
    if (!sameSnapshot(before, opened)) fail("AGY-AUTHORITY-CAS");
    const bytes = readFileSync(fd), after = fstatSync(fd), named = lstatSync(path);
    own(after); own(named);
    if (!sameSnapshot(opened, after) || !sameSnapshot(after, named) || bytes.length !== after.size) fail("AGY-AUTHORITY-CAS");
    const value = parseStrictJson(bytes);
    return { bytes, value, stat: after };
  } finally { closeSync(fd); }
}
export function readAgyAuthorityInventory({ repository, namespaceIds }) {
  if (!Array.isArray(namespaceIds) || new Set(namespaceIds).size !== namespaceIds.length || !namespaceIds.length) fail("AGY-AUTHORITY-NAMESPACE");
  let count = 0, total = 0;
  const entries = [], memberships = [];
  for (const namespaceId of namespaceIds) {
    const root = authorityRoot(repository, namespaceId), facts = [];
    if (!root.absent) {
      const directory = lstatSync(root.path), names = readdirSync(root.path).sort(); own(directory, true);
      // These producer stores are flat. Nested, temporary, lock and unknown
      // names remain unavailable rather than being silently ignored.
      for (const name of names) {
        verifyAuthorityParents(root);
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,220}\.json(?:\.revoked)?$/u.test(name) || ++count > 4096) fail("AGY-AUTHORITY-ENTRY");
        const loaded = authorityRead(join(root.path, name)); total += loaded.bytes.length;
        if (total > 16 * 1024 * 1024) fail("AGY-AUTHORITY-SIZE");
        const fact = { namespaceId, pathSha256: hash(`${root.suffix}/${name}`), sha256: hash(loaded.bytes), size: loaded.bytes.length,
          identity: { dev: String(loaded.stat.dev), ino: String(loaded.stat.ino), mode: loaded.stat.mode, nlink: loaded.stat.nlink }, semanticSha256: hash(canonical(loaded.value)) };
        facts.push(fact); entries.push({ namespaceId, name, value: loaded.value, fact });
        verifyAuthorityParents(root);
      }
      const after = lstatSync(root.path); own(after, true);
      if (!sameSnapshot(directory, after) || canonical(names) !== canonical(readdirSync(root.path).sort())) fail("AGY-AUTHORITY-CAS");
    }
    verifyAuthorityParents(root);
    facts.sort((a, b) => a.pathSha256.localeCompare(b.pathSha256));
    memberships.push({ namespaceId, rootSha256: hash(root.path), entrySetSha256: hash(canonical(facts)), entryCount: facts.length, sourceFacts: facts });
  }
  return { memberships, entries };
}
// The caller must possess the real live common-boundary token and the real
// owning producer port. Inspection validates both before any filesystem effect.
export function publishAgyAuthorityEntry({ repository, boundary, producerPort, namespaceId, name, value }) {
  storeBoundary(repository, boundary, producerPort, namespaceId);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,220}\.json(?:\.revoked)?$/u.test(name)) fail("AGY-AUTHORITY-ENTRY");
  const bytes = Buffer.from(`${canonical(value)}\n`);
  if (!bytes.length || bytes.length > AUTHORITY_BYTES) fail("AGY-AUTHORITY-SIZE");
  const parent = authorityRoot(repository, namespaceId, true);
  inPinnedParent(parent.path, () => {
    const fd = openSync(name, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { completeWrite(fd, bytes); fsyncSync(fd); own(fstatSync(fd)); } finally { closeSync(fd); }
    syncDirectory();
    if (!authorityRead(name).bytes.equals(bytes)) fail("AGY-AUTHORITY-CAS");
  });
  return readAgyAuthorityInventory({ repository, namespaceIds: [namespaceId] }).entries.find(entry => entry.name === name);
}
export function removeAgyAuthorityEntry({ repository, boundary, producerPort, namespaceId, name, expectedFact }) {
  storeBoundary(repository, boundary, producerPort, namespaceId);
  const current = readAgyAuthorityInventory({ repository, namespaceIds: [namespaceId] }).entries.find(entry => entry.name === name);
  if (!current || canonical(current.fact) !== canonical(expectedFact)) fail("AGY-AUTHORITY-CAS");
  const parent = authorityRoot(repository, namespaceId);
  inPinnedParent(parent.path, () => { const loaded = authorityRead(name); if (hash(loaded.bytes) !== expectedFact.sha256) fail("AGY-AUTHORITY-CAS"); unlinkSync(name); syncDirectory(); });
}

/** Shared physical mechanics only. Owning modules brand the returned ports and
 * keep the operation constructors private; this helper grants no native lane. */
export function createAgyAuthorityJournalOwner({ repository, namespaceIds, journalNamespace, producerId, kinds, classifyLegacy }) {
  const repo = inspectAgyAuthorityRepository(repository), operations = new WeakMap(), terminals = new WeakMap();
  // Dispatch delivery retains ownership across the Main commit. v2 binds the
  // physical repository independently of its advancing candidate. v1 remains
  // readable only under its original candidate; it is never silently upgraded.
  const stable = ["agy-family-dispatch", "agy-session-consent"].includes(producerId);
  const schema = stable ? "pipeline.agy-authority-lifetime.v2" : "pipeline.agy-authority-lifetime.v1";
  const identity = value => ({primaryRoot:value.primaryRoot,commonDir:value.commonDir});
  const repoSha256 = hash(canonical(stable ? identity(repo) : repo));
  function currentRepository() {
    if (!stable) return inspectAgyAuthorityRepository(repo);
    const actual=inspectSignedDescriptorCustodyRepository(repo.primaryRoot);
    if(canonical(identity(actual))!==canonical(identity(repo)))fail("AGY-AUTHORITY-REPOSITORY-CAS");
    return actual;
  }
  const rank = { reserved: 0, armed: 1, running: 2, "terminal-observed": 3 };
  const equal = (a, b) => canonical(a) === canonical(b);
  const freeze = value => Object.freeze(structuredClone(value));
  function inventory() { return readAgyAuthorityInventory({ repository: currentRepository(), namespaceIds }); }
  function rows(observed) {
    const groups = new Map();
    for (const entry of observed.entries.filter(e => e.namespaceId === journalNamespace && e.name.startsWith("op."))) {
      const value = entry.value;
      if (!value || Object.keys(value).sort().join("\0") !== ["schema", "producerId", "repositorySha256", "operationId", "basis", "bindingSha256", "phase", "terminal", "terminalEvidence", "sourcePaths", ...(value.revision !== undefined ? ["revision"] : [])].sort().join("\0")
        || ![schema,...(stable?["pipeline.agy-authority-lifetime.v1"]:[])].includes(value.schema) || value.producerId !== producerId
        || value.repositorySha256 !== (value.schema === "pipeline.agy-authority-lifetime.v1" ? hash(canonical(currentRepository())) : repoSha256)
        || !/^[a-f0-9]{32}$/u.test(value.operationId ?? "") || value.bindingSha256 !== hash(canonical(value.basis))
        || !["armed", "running", "terminal-observed"].includes(value.phase)
        || (value.revision !== undefined && (!stable || value.schema !== schema || !Number.isSafeInteger(value.revision) || value.revision < 1))
        || entry.name !== `op.${value.operationId}.${rank[value.phase]}${value.revision !== undefined ? `.${value.revision}` : ""}.json`
        || !value.basis || !["bound", "unbound"].includes(value.basis.association?.state)
        || !Array.isArray(value.sourcePaths) || value.sourcePaths.length > 64
        || new Set(value.sourcePaths.map(p => `${p.namespaceId}:${p.pathSha256}`)).size !== value.sourcePaths.length
        || value.sourcePaths.some(p => !namespaceIds.includes(p.namespaceId) || !/^[a-f0-9]{64}$/u.test(p.pathSha256 ?? ""))
        || (value.phase === "terminal-observed" ? !["completed", "cancelled", "revoked"].includes(value.terminal) : value.terminal !== null
          || (value.terminalEvidence !== null && !(stable && value.phase === 'running' && value.terminalEvidence?.schema === 'pipeline.agy-item-delivery-checkpoint.v1' && value.terminalEvidence?.delivery?.schema === 'pipeline.agy-item-delivery.v1')))) fail("AGY-AUTHORITY-JOURNAL");
      const previous = groups.get(value.operationId);
      if (previous && (!equal(previous.value.basis, value.basis) || previous.value.bindingSha256 !== value.bindingSha256)) fail("AGY-AUTHORITY-JOURNAL-BINDING");
      if (!previous || rank[value.phase] > rank[previous.value.phase] || (rank[value.phase] === rank[previous.value.phase] && (value.revision ?? 0) > (previous.value.revision ?? 0))) groups.set(value.operationId, entry);
    }
    return [...groups.values()];
  }
  function factsFor(value, journal, observed) {
    const facts = [journal.fact];
    for (const path of value.sourcePaths) {
      const found = observed.entries.find(e => e.namespaceId === path.namespaceId && e.fact.pathSha256 === path.pathSha256);
      if (!found) fail("AGY-AUTHORITY-HELD");
      facts.push(found.fact);
    }
    return facts.sort((a, b) => a.namespaceId.localeCompare(b.namespaceId) || a.pathSha256.localeCompare(b.pathSha256));
  }
  function observation(handle) {
    const operation = operations.get(handle); if (!operation) fail("AGY-AUTHORITY-HANDLE");
    currentRepository();
    if (operation.legacy) {
      const actual = inventory().entries.find(e => e.namespaceId === operation.entry.namespaceId && e.name === operation.entry.name);
      if (!actual || !equal(actual.fact, operation.entry.fact)) fail("AGY-AUTHORITY-CAS");
      return freeze({ association: operation.association, kinds, phase: "armed", bindingSha256: operation.bindingSha256, sourceFacts: [actual.fact] });
    }
    if (!operation.journal) return freeze({ association: operation.basis.association, kinds, phase: "reserved", bindingSha256: operation.bindingSha256, sourceFacts: [] });
    const observed = inventory(), journal = rows(observed).find(e => e.value.operationId === operation.id);
    if (!journal || !equal(journal.value, operation.journal.value) || !equal(journal.fact, operation.journal.fact)) fail("AGY-AUTHORITY-CAS");
    return freeze({ association: operation.basis.association, kinds, phase: journal.value.phase, bindingSha256: operation.bindingSha256, sourceFacts: factsFor(journal.value, journal, observed) });
  }
  function restored(entry) {
    const handle = Object.freeze({}); operations.set(handle, { id: entry.value.operationId, basis: entry.value.basis, bindingSha256: entry.value.bindingSha256, journal: entry }); return handle;
  }
  function legacy(observed, current) {
    const covered = new Set(current.flatMap(e => e.value.sourcePaths.map(p => `${p.namespaceId}:${p.pathSha256}`)));
    const values = current.map(restored);
    for (const entry of observed.entries) {
      if (entry.name.startsWith("op.") || covered.has(`${entry.namespaceId}:${entry.fact.pathSha256}`)) continue;
      const association = classifyLegacy(entry);
      if (association === null) continue; // Historical evidence is not a capability.
      const handle = Object.freeze({}), bindingSha256 = hash(canonical({ producerId, repoSha256, namespaceId: entry.namespaceId, pathSha256: entry.fact.pathSha256, sha256: entry.fact.sha256 }));
      operations.set(handle, { legacy: true, entry, association, bindingSha256 }); values.push(handle);
    }
    return values;
  }
  const port = Object.freeze({
    readBaseline() { const observed = inventory(), current = rows(observed); return { memberships: observed.memberships, legacyOperations: legacy(observed, current) }; },
    observeOperation: observation,
    observeTerminal(handle) { const terminal = terminals.get(handle); if (!terminal) fail("AGY-AUTHORITY-TERMINAL-HANDLE"); const actual = observation(terminal.operationHandle); if (actual.phase !== "terminal-observed" || !equal(actual.sourceFacts, terminal.sourceFacts)) fail("AGY-AUTHORITY-CAS"); return freeze({ terminal: terminal.terminal, sourceFacts: actual.sourceFacts }); },
    reconcile({ producerRecord, memberRecords, releaseRecords }) {
      if (producerRecord?.producerId !== producerId || !Array.isArray(memberRecords) || !Array.isArray(releaseRecords)) fail("AGY-AUTHORITY-RECONCILE");
      const observed = inventory(), current = rows(observed);
      const represented = new Set();
      for (const journal of current) {
        const facts = factsFor(journal.value, journal, observed);
        const members = memberRecords.filter(m => m.bindingSha256 === journal.value.bindingSha256);
        if (members.length !== 1) fail("AGY-AUTHORITY-UNREGISTERED");
        const member = members[0];
        represented.add(member);
        if (!equal(member.association, journal.value.basis.association) || !equal(member.kinds, kinds)
          || !equal(member.sourceFacts, facts) || (member.phase === "released" ? journal.value.phase !== "terminal-observed" : member.phase !== journal.value.phase)) fail("AGY-AUTHORITY-CAS");
        if (member.phase === "released" && !releaseRecords.some(r => r.memberId === member.memberId && r.memberGeneration === member.memberGeneration && r.bindingSha256 === member.bindingSha256 && r.terminal === journal.value.terminal && equal(r.sourceFacts, facts))) fail("AGY-AUTHORITY-CAS");
      }
      const covered = new Set(current.flatMap(e => e.value.sourcePaths.map(p => `${p.namespaceId}:${p.pathSha256}`)));
      for (const entry of observed.entries) {
        if (entry.name.startsWith("op.") || covered.has(`${entry.namespaceId}:${entry.fact.pathSha256}`) || classifyLegacy(entry) === null) continue;
        const bindingSha256 = hash(canonical({ producerId, repoSha256, namespaceId: entry.namespaceId, pathSha256: entry.fact.pathSha256, sha256: entry.fact.sha256 }));
        const matching = memberRecords.filter(m => m.phase === "armed" && m.bindingSha256 === bindingSha256
          && equal(m.association, classifyLegacy(entry)) && equal(m.kinds, kinds) && equal(m.sourceFacts, [entry.fact]));
        if (matching.length !== 1) fail("AGY-AUTHORITY-UNREGISTERED");
        represented.add(matching[0]);
      }
      // Every retained fact must still physically exist. Missing a file never
      // proves that the corresponding live owner or capability ended.
      for (const member of memberRecords) for (const fact of member.sourceFacts) if (!observed.entries.some(e => equal(e.fact, fact))) fail("AGY-AUTHORITY-CAS");
      for (const member of memberRecords) if (!represented.has(member) && (member.phase !== "reserved" || member.sourceFacts.length !== 0)) fail("AGY-AUTHORITY-UNREGISTERED-MEMBER");
      return observed.memberships;
    },
    readAssurance() { const current = rows(inventory()); return current.some(e => e.value.basis.assurance === "controlled-unit-method") ? "controlled-unit-method" : "physical-readback"; },
  });
  return {
    port,
    create(basis) { currentRepository(); const handle = Object.freeze({}), value = { ...structuredClone(basis), operationNonce: randomBytes(32).toString("hex") }; operations.set(handle, { id: randomBytes(16).toString("hex"), basis: value, bindingSha256: hash(canonical(value)), journal: null }); return handle; },
    advance({ operationHandle, boundary, producerPort, phase, sourcePaths = [], terminal = null, terminalEvidence = null }) {
      const operation = operations.get(operationHandle); if (!operation || operation.legacy || !["armed", "running", "terminal-observed"].includes(phase)) fail("AGY-AUTHORITY-HANDLE");
      const previous = operation.journal?.value.phase ?? "reserved";
      const refresh = stable && phase === "running" && previous === "running";
      if ((!refresh && rank[phase] <= rank[previous]) || (phase === "terminal-observed" ? !["completed", "cancelled", "revoked"].includes(terminal) : terminal !== null)) fail("AGY-AUTHORITY-PHASE");
      const revision = stable ? (operation.journal?.value.revision ?? 0) + 1 : undefined;
      const value = { schema, producerId, repositorySha256: repoSha256, operationId: operation.id, basis: operation.basis, bindingSha256: operation.bindingSha256, phase, terminal, terminalEvidence, sourcePaths, ...(stable ? { revision } : {}) };
      operation.journal = publishAgyAuthorityEntry({ repository: currentRepository(), boundary, producerPort, namespaceId: journalNamespace, name: `op.${operation.id}.${rank[phase]}${stable ? `.${revision}` : ""}.json`, value });
      const observed = observation(operationHandle);
      if (phase !== "terminal-observed") return null;
      const handle = Object.freeze({}); terminals.set(handle, { operationHandle, terminal, sourceFacts: observed.sourceFacts }); return handle;
    },
    restore(bindingSha256) { const matches = rows(inventory()).filter(e => e.value.bindingSha256 === bindingSha256); if (matches.length !== 1) fail("AGY-AUTHORITY-CAS"); return restored(matches[0]); },
    restoreTerminal(operationHandle) {
      const operation=operations.get(operationHandle),observed=observation(operationHandle);
      if(!operation?.journal||observed.phase!=='terminal-observed')fail('AGY-AUTHORITY-TERMINAL-HANDLE');
      const handle=Object.freeze({});terminals.set(handle,{operationHandle,terminal:operation.journal.value.terminal,sourceFacts:observed.sourceFacts});return handle;
    },
  };
}

function parentFor(commonDir, create) {
  if (typeof commonDir !== "string" || !isAbsolute(commonDir)) fail("AGY-HOST-STORE-ROOT");
  let path = resolve(commonDir);
  const root = lstatSync(path);
  if (!root.isDirectory() || root.isSymbolicLink() || realpathSync(path) !== path) fail("AGY-HOST-STORE-ROOT");
  for (const part of SUBDIRS) {
    path = join(path, part);
    if (create) {
      try { mkdirSync(path, { mode: 0o700 }); }
      catch (error) { if (error?.code !== "EEXIST") throw error; }
    }
    const entry = lstatSync(path);
    if (!entry.isDirectory() || entry.isSymbolicLink() || realpathSync(path) !== path) fail("AGY-HOST-STORE-PARENT");
  }
  return path;
}

function inPinnedParent(parent, action) {
  const before = lstatSync(parent);
  if (!before.isDirectory() || before.isSymbolicLink()) fail("AGY-HOST-STORE-PARENT");
  const prior = process.cwd();
  process.chdir(parent);
  try {
    if (!sameInode(before, statSync("."))) fail("AGY-HOST-STORE-PARENT-RACE");
    return action();
  } finally { process.chdir(prior); }
}

function syncDirectory() {
  let fd;
  try { fd = openSync(".", constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); fsyncSync(fd); }
  catch (error) {
    if (!["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP", "EBADF"].includes(error?.code)) throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}

function completeWrite(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset, offset);
    if (!Number.isSafeInteger(written) || written <= 0) fail("AGY-HOST-STORE-WRITE");
    offset += written;
  }
}

function admittedName(taskId) {
  if (!isSafeTaskId(taskId)) fail("AGY-HOST-STORE-TASK");
  return `${taskId}.json`;
}

/** The commonDir must come from the host's physical repository descriptor. */
export function persistAgyHostObservedReceipt({ root, commonDir, receipt, record, recordBytes } = {}) {
  if (typeof root !== "string" || root.length === 0) return { ok: false, code: "AGY-HOST-STORE-ROOT" };
  if (!validateAgyHostObservedReceiptShape(receipt, { record, recordBytes })) return { ok: false, code: "AGY-HOST-STORE-BINDING" };
  try {
    return withSourceOwnedAgyHostObservedPublication({ root, commonDir, receipt }, () =>
      persistReceiptBytes({ commonDir, receipt, record, recordBytes }));
  } catch (error) { return { ok: false, code: error?.code ?? "AGY-HOST-STORE-AUTHORITY-UNAVAILABLE" }; }
}
function persistReceiptBytes({ commonDir, receipt, record, recordBytes }) {
  if (!validateAgyHostObservedReceiptShape(receipt, { record, recordBytes })) {
    return { ok: false, code: "AGY-HOST-STORE-BINDING" };
  }
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (bytes.length > MAX_BYTES) return { ok: false, code: "AGY-HOST-STORE-SIZE" };
  let target;
  try {
    target = admittedName(receipt.dispatchId);
    const parent = parentFor(commonDir, true);
    inPinnedParent(parent, () => {
      if (existsSync(target)) fail("AGY-HOST-STORE-EXISTS");
      const temporary = `.${receipt.dispatchId}.${randomBytes(16).toString("hex")}.tmp`;
      let temporaryFd;
      let targetFd;
      try {
        temporaryFd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
          | (constants.O_NOFOLLOW ?? 0), 0o600);
        completeWrite(temporaryFd, bytes);
        fsyncSync(temporaryFd);
        const written = fstatSync(temporaryFd);
        linkSync(temporary, target);
        targetFd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const linked = fstatSync(targetFd);
        if (!sameInode(written, linked) || linked.size !== bytes.length) fail("AGY-HOST-STORE-RACE");
        closeSync(temporaryFd); temporaryFd = undefined;
        unlinkSync(temporary);
        syncDirectory();
        const readback = readFileSync(targetFd);
        const after = fstatSync(targetFd);
        const pathStat = lstatSync(target);
        // Unlinking the temporary hard link changes ctime without changing
        // the published content. A descriptor read still checks size/mtime.
        if (!sameContentSnapshot(linked, after) || !sameInode(pathStat, after)
          || pathStat.isSymbolicLink() || !readback.equals(bytes)) fail("AGY-HOST-STORE-READBACK");
      } finally {
        if (temporaryFd !== undefined) closeSync(temporaryFd);
        if (targetFd !== undefined) closeSync(targetFd);
        try { if (existsSync(temporary)) unlinkSync(temporary); } catch {}
      }
    });
    return { ok: true, code: "AGY-HOST-RECEIPT-STORED", taskId: receipt.dispatchId,
      sha256: hash(bytes), relativePath: join(...SUBDIRS, basename(target)) };
  } catch (error) {
    return { ok: false, code: error?.code?.startsWith("AGY-HOST-") ? error.code : "AGY-HOST-STORE-UNAVAILABLE" };
  }
}

/** Physical local readback only; this is not a signature or provider attestation. */
export function readAgyHostObservedReceipt({ commonDir, taskId, record, recordBytes } = {}) {
  try {
    const target = admittedName(taskId);
    const parent = parentFor(commonDir, false);
    return inPinnedParent(parent, () => {
      const entry = lstatSync(target);
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size === 0 || entry.size > MAX_BYTES) fail("AGY-HOST-STORE-TARGET");
      const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const before = fstatSync(fd);
        if (!sameInode(entry, before) || before.size !== entry.size) fail("AGY-HOST-STORE-RACE");
        const bytes = readFileSync(fd);
        const after = fstatSync(fd);
        if (!sameSnapshot(before, after) || bytes.length !== before.size) fail("AGY-HOST-STORE-RACE");
        const receipt = parseStrictJson(bytes);
        if (receipt.dispatchId !== taskId
          || !validateAgyHostObservedReceiptShape(receipt, { record, recordBytes })) fail("AGY-HOST-STORE-BINDING");
        return { ok: true, code: "AGY-HOST-RECEIPT-LOCAL-BYTES-BOUND", receipt,
          sha256: hash(bytes), authority: "not-yet-independently-verified" };
      } finally { closeSync(fd); }
    });
  } catch (error) {
    return { ok: false, code: error?.code?.startsWith("AGY-HOST-") ? error.code : "AGY-HOST-STORE-UNAVAILABLE" };
  }
}
