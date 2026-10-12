// SPDX-License-Identifier: SUL-1.0
/** Persistent accounting for Coordinator-declared generic work. No native semantic attestation. */
import { randomBytes } from "node:crypto";
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, realpathSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";
import { admitReviewAttempt, sha256Canonical, CRITIC_DISPATCH_LIMITS } from "./review-economy.mjs";
import { isSuccessfulSpawn } from "./successful-spawn.mjs";
import { createDiagnosticBundle } from "./critic-diagnostic-packet.mjs";
import { isSafeTaskId } from "./dispatch-record.mjs";
import { createLocalDispatchEvidenceBinding, evaluateSignedQualityImportReviewAdmission } from "../scripts/check-critic-skip-coverage.mjs";
import { canonicalJson, sha256, normalizePacketPath, inspectCandidatePacket,
  inspectClaimedCandidatePacket, readConsumedSessionAdmission } from "../scripts/critic-packet-preflight.mjs";
import { readCriticCourseAdmission } from "./critic-course-admission.mjs";

export const GENERIC_CRITIC_BATCH_SCHEMA = "pipeline.critic-generic-batch.v1";
export const GENERIC_CRITIC_BATCH_V2_SCHEMA = "pipeline.critic-generic-batch.v2";
export const GENERIC_CRITIC_MEMBER_SCHEMA = "pipeline.critic-generic-batch-member.v1";
export const GENERIC_CRITIC_RESERVATION_SCHEMA = "pipeline.critic-generic-batch-reservation.v1";
const SHA = /^[a-f0-9]{64}$/u;
const ID = /^[a-f0-9]{32}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const DECLARATION = ["taskId", "baseCommit", "candidateCommit", "logicalWorkIds", "specPath", "guardrailPaths", "signedQualityImportAnchor"];
const CORRECTION = [...DECLARATION, "changedBehaviorClaims", "pathInvariantMap", "coordinatorImpactConfirmed", "trustBoundaryChanged", "impactAmbiguous", "evidencePaths"];
const MEMBER = ["schema", "batchId", "registrationSha256", "kind", "logicalWorkIds", "target", "parent", "range", "delta", "recordSha256"];
const REGISTRATION = ["schema", "batchId", "repositoryFingerprint", "declaredScope", "originTargets", "registrationSha256"];
const RESERVATION = ["schema", "batchId", "registrationSha256", "ordinal", "mode", "packetId", "packetDigest", "claimSha256", "preflightSha256", "memberSha256", "parent", "candidate", "range", "deltaEvidenceSha256", "sourceSha256", "decisionSha256"];
const eq = (a, b) => canonicalJson(a) === canonicalJson(b);
const packetDigest = value => sha256(canonicalJson(value));
let activeTransaction = null;
const exact = (v, keys) => v !== null && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export class GenericCriticBatchError extends Error {
  constructor(code) { super("Generic Critic batch is unavailable or refused."); this.name = "GenericCriticBatchError"; this.code = code; }
}
function fail(code) { throw new GenericCriticBatchError(code); }
function shape(v, keys) { if (!exact(v, keys)) fail("CGB-SHAPE"); }
function ref(v) { shape(v, ["batchId", "registrationSha256"]); if (!ID.test(v.batchId) || !SHA.test(v.registrationSha256)) fail("CGB-SHAPE"); return v; }
function paths(v, max = 128) {
  if (!Array.isArray(v) || v.length < 1 || v.length > max) fail("CGB-BOUND");
  const values = v.map(x => normalizePacketPath(x));
  if (new Set(values).size !== values.length) fail("CGB-SHAPE");
  return values.sort(compare);
}
function logical(v) {
  const values = paths(v);
  if (values.some(x => x.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(x))) fail("CGB-SHAPE");
  return values;
}
function samePhysical(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink
    && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function directory(p) {
  const s = lstatSync(p);
  if (!s.isDirectory() || s.isSymbolicLink() || realpathSync(p) !== resolve(p)
    || (process.platform !== "win32" && ((s.mode & 0o777) !== 0o700 || (process.getuid && s.uid !== process.getuid())))
    || (process.platform === "win32" && assessWindowsPrivatePath(p).status !== "secure")) fail("CGB-PHYSICAL");
  return s;
}
function createDirectory(p) {
  if (!existsSync(p)) {
    mkdirSync(p, { mode: 0o700 });
    if (activeTransaction) activeTransaction.dirty = true;
    if (process.platform === "win32" && hardenWindowsPrivateDirectory(p).status !== "secure") fail("CGB-PHYSICAL");
  }
  directory(p);
}
function stableJson(p) {
  directory(dirname(p));
  const before = lstatSync(p);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 8 * 1024 * 1024
    || (process.platform !== "win32" && ((before.mode & 0o777) !== 0o600 || (process.getuid && before.uid !== process.getuid())))
    || (process.platform === "win32" && assessWindowsPrivatePath(p).status !== "secure")) fail("CGB-PHYSICAL");
  const fd = openSync(p, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!samePhysical(before, fstatSync(fd))) fail("CGB-PHYSICAL");
    const bytes = readFileSync(fd);
    if (!samePhysical(before, fstatSync(fd)) || !samePhysical(before, lstatSync(p))) fail("CGB-STALE");
    const value = JSON.parse(bytes.toString("utf8"));
    if (!bytes.equals(Buffer.from(canonicalJson(value)))) fail("CGB-PHYSICAL");
    return value;
  } catch (error) { if (error instanceof GenericCriticBatchError) throw error; fail("CGB-PHYSICAL"); }
  finally { closeSync(fd); }
}
function durable(p, value) {
  directory(dirname(p));
  const fd = openSync(p, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  if (activeTransaction) activeTransaction.dirty = true;
  try { writeFileSync(fd, canonicalJson(value)); fsyncSync(fd); } finally { closeSync(fd); }
  if (!eq(stableJson(p), value)) fail("CGB-STALE");
  let parent;
  try { parent = openSync(dirname(p), constants.O_RDONLY); fsyncSync(parent); }
  catch { fail("CGB-PHYSICAL"); }
  finally { if (parent !== undefined) closeSync(parent); }
}
function git(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 5000, maxBuffer: 32 * 1024 * 1024 });
  if (!isSuccessfulSpawn(r)) fail("CGB-TARGET");
  return String(r.stdout);
}
function context(repoRoot, controlRoot, create = false) {
  const repo = discoverRepository(realpathSync(repoRoot));
  const canonical = join(realpathSync(repo.commonDir), "agent-pipeline", "critic-packets");
  if (resolve(controlRoot) !== canonical || realpathSync(controlRoot) !== canonical) fail("CGB-CONTROL");
  directory(dirname(canonical)); directory(canonical);
  const root = join(canonical, "generic-batches");
  if (create) createDirectory(root); else if (!existsSync(root)) fail("CGB-REGISTRATION-REQUIRED");
  directory(root);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
  const repository = { schema: "pipeline.critic-generic-repository.v1", repoRoot: realpathSync(repo.primaryRoot), commonDir: realpathSync(repo.commonDir), repositoryFingerprint: fingerprint };
  return { root, controlRoot: canonical, fingerprint, repository,
    namespace: [canonical, root].map(p => ({ p, dev: directory(p).dev, ino: directory(p).ino })) };
}
function assertNamespace(c) {
  for (const binding of c.namespace) {
    const current = directory(binding.p);
    if (current.dev !== binding.dev || current.ino !== binding.ino) fail("CGB-PHYSICAL");
  }
}
function readContext(controlRoot) {
  const p = resolve(controlRoot);
  directory(dirname(p)); directory(p); directory(join(p, "generic-batches"));
  const stored = stableJson(join(p, "generic-batches", "repository.json"));
  shape(stored, ["schema", "repoRoot", "commonDir", "repositoryFingerprint"]);
  if (stored.schema !== "pipeline.critic-generic-repository.v1") fail("CGB-CONTROL");
  const c = context(stored.repoRoot, p);
  if (!eq(stored, c.repository)) fail("CGB-CONTROL");
  return c;
}
function transaction(c, action) {
  const lock = join(c.root, "transaction.lock");
  try { mkdirSync(lock, { mode: 0o700 }); } catch (error) { if (error.code === "EEXIST") fail("CGB-HELD"); throw error; }
  const held = directory(lock);
  if (activeTransaction !== null) fail("CGB-HELD");
  const txn = { dirty: false, root:c.root }; activeTransaction = txn;
  let completed = false;
  try { const result = action(); completed = true; return result; }
  finally {
    // Failed/partial transactions retain the exact lock: no unsupported takeover or refund.
    activeTransaction = null;
    if (completed || !txn.dirty) {
      const current = directory(lock);
      if (current.dev !== held.dev || current.ino !== held.ino) fail("CGB-PHYSICAL");
      rmdirSync(lock);
    }
  }
}
function unlocked(c) { assertNamespace(c); if (existsSync(join(c.root, "transaction.lock"))) fail("CGB-HELD"); }
function ensureStore(c) {
  for (const name of ["logical", "origins"]) createDirectory(join(c.root, name));
  const p = join(c.root, "repository.json");
  if (existsSync(p)) { if (!eq(stableJson(p), c.repository)) fail("CGB-CONTROL"); }
  else durable(p, c.repository);
}
function reference(root, commit, p, role = "spec") {
  p = normalizePacketPath(p);
  if ((p.startsWith(".") && !(role === "guardrail" && p === ".claude/pipeline.yaml"))
    || p.startsWith("scratch/") || p.startsWith("evidence/")) fail("CGB-REFERENCE");
  const row = git(root, ["ls-tree", "-z", commit, "--", p]);
  const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)\0$/u.exec(row);
  if (!match || match[3] !== p) fail("CGB-REFERENCE");
  const bytes = git(root, ["show", `${commit}:${p}`]);
  return { path: p, commit, blobOid: match[2], sha256: sha256(bytes) };
}
function sourceTarget(root, declaration) {
  const anchor = declaration.signedQualityImportAnchor;
  if (anchor === null) {
    const b = createLocalDispatchEvidenceBinding({ root, taskId: declaration.taskId, baseCommit: declaration.baseCommit, reviewCandidateCommit: declaration.candidateCommit });
    return { kind: "authored-delivery", taskId: b.taskId, recordPath: b.recordPath, recordSha256: b.recordSha256, sourceCandidateCommit: b.sourceCandidateCommit };
  }
  shape(anchor, ["schema", "intentSha256", "integrationCommit"]);
  if (anchor.schema !== "pipeline.signed-quality-import-review-anchor.v1" || !SHA.test(anchor.intentSha256) || !OID.test(anchor.integrationCommit)
    || declaration.taskId !== `signed-import-${anchor.intentSha256}`) fail("CGB-TARGET");
  const admitted = evaluateSignedQualityImportReviewAdmission({ root, anchor: { ...anchor, baseCommit: declaration.baseCommit, candidateCommit: declaration.candidateCommit, taskId: declaration.taskId } });
  if (!admitted.ok || admitted.code !== "signed-quality-import-review-admitted") fail("CGB-TARGET");
  return { kind: "signed-quality-import", intentSha256: anchor.intentSha256, integrationCommit: anchor.integrationCommit };
}
function declarationSource(root, d, correction = false) {
  const keys = correction ? CORRECTION : DECLARATION;
  if (!Object.hasOwn(d ?? {}, "reviewUnitPath")) fail("CGB-REVIEW-UNIT-REQUIRED");
  shape(d, [...keys, "reviewUnitPath"]);
  if (!isSafeTaskId(d.taskId) || !OID.test(d.baseCommit) || !OID.test(d.candidateCommit)) fail("CGB-SHAPE");
  if (git(root, ["cat-file", "-t", d.candidateCommit]).trim() !== "commit") fail("CGB-TARGET");
  const work = logical(d.logicalWorkIds);
  const spec = reference(root, d.candidateCommit, d.specPath);
  const guards = paths(d.guardrailPaths).map(p => reference(root, d.candidateCommit, p, "guardrail"));
  const tree = git(root, ["rev-parse", `${d.candidateCommit}^{tree}`]).trim();
  if (!OID.test(tree)) fail("CGB-TARGET");
  const reviewUnit = reviewUnitSource(root, d, work);
  return { target: sourceTarget(root, d), scope: { logicalWorkIds: work, specification: spec, guardrails: guards, reviewUnit }, range: { base: d.baseCommit, commit: d.candidateCommit, tree } };
}
function reviewUnitSource(root, d, work) {
  // A committed declaration proves ordering and bindings, not semantic coherence.
  const before = reference(root, d.baseCommit, d.reviewUnitPath);
  const current = reference(root, d.candidateCommit, d.reviewUnitPath);
  if (before.blobOid !== current.blobOid) fail("CGB-REVIEW-UNIT-BINDING");
  let declaration;
  try { declaration = JSON.parse(git(root, ["show", `${d.baseCommit}:${before.path}`])); }
  catch { fail("CGB-REVIEW-UNIT-SHAPE"); }
  shape(declaration, ["schema", "kind", "purpose", "specPath", "logicalWorkIds", "criterionIds", "deliveryBoundary", "singletonRationale"]);
  if (declaration.schema !== "pipeline.critic-review-unit.v1"
    || !["feature-section", "related-fixes", "independent-delivery", "urgent-isolated-risk"].includes(declaration.kind)
    || typeof declaration.purpose !== "string" || declaration.purpose.trim().length === 0 || declaration.purpose.length > 2048
    || !eq(logical(declaration.logicalWorkIds), work) || declaration.specPath !== d.specPath) fail("CGB-REVIEW-UNIT-BINDING");
  const criteria = logical(declaration.criterionIds);
  const spec = git(root, ["show", `${d.baseCommit}:${normalizePacketPath(d.specPath)}`]);
  if (criteria.some(id => !spec.includes(id))) fail("CGB-REVIEW-UNIT-BINDING");
  const exception = ["independent-delivery", "urgent-isolated-risk"].includes(declaration.kind);
  if ((work.length === 1 && !exception) || (exception && (typeof declaration.singletonRationale !== "string"
    || declaration.singletonRationale.trim().length === 0 || declaration.singletonRationale.length > 2048))
    || (!exception && declaration.singletonRationale !== null)) fail("CGB-SINGLETON-RATIONALE");
  shape(declaration.deliveryBoundary, ["mainRef"]);
  const repo = discoverRepository(realpathSync(root));
  const primaryRef = git(repo.primaryRoot, ["symbolic-ref", "HEAD"]).trim();
  if (declaration.deliveryBoundary.mainRef !== primaryRef || !primaryRef.startsWith("refs/heads/")) fail("CGB-MAIN-INTEGRATION");
  git(root, ["merge-base", "--is-ancestor", d.baseCommit, d.candidateCommit]);
  try { git(root, ["merge-base", "--is-ancestor", d.candidateCommit, primaryRef]); }
  catch { fail("CGB-MAIN-INTEGRATION"); }
  return { reference: before, declaration };
}
function targetForPacket(packet) {
  const b = packet.coordinatorOnly?.localDispatchEvidence;
  if (b) return { kind: "authored-delivery", taskId: b.taskId, recordPath: b.recordPath, recordSha256: b.recordSha256, sourceCandidateCommit: b.sourceCandidateCommit };
  const a = packet.coordinatorOnly?.signedQualityImportAnchor;
  if (a) return { kind: "signed-quality-import", intentSha256: a.intentSha256, integrationCommit: a.integrationCommit };
  fail("CGB-TARGET");
}
function indexPath(c, kind, identity) { return join(c.root, kind, `${sha256Canonical(identity)}.json`); }
function indexValue(batchRef, kind, identity) { return { schema: "pipeline.critic-generic-index.v1", kind, identity, batchRef }; }
function boundIndex(c, kind, identity, batchRef) {
  const p = indexPath(c, kind, identity);
  if (!existsSync(p) || !eq(stableJson(p), indexValue(batchRef, kind, identity))) fail("CGB-MEMBER");
}
function publishIndex(c, kind, identity, batchRef) {
  const p = indexPath(c, kind, identity), value = indexValue(batchRef, kind, identity);
  if (existsSync(p)) { if (!eq(stableJson(p), value)) fail("CGB-CONFLICT"); }
  else durable(p, value);
}
function registration(c, batchRef) {
  ref(batchRef);
  const p = join(c.root, batchRef.batchId);
  directory(p); directory(join(p, "members"));
  const value = stableJson(join(p, "registration.json"));
  shape(value, REGISTRATION);
  const { registrationSha256, ...subject } = value;
  if (![GENERIC_CRITIC_BATCH_SCHEMA, GENERIC_CRITIC_BATCH_V2_SCHEMA].includes(value.schema) || !eq(batchRef, { batchId: value.batchId, registrationSha256 })
    || sha256Canonical(subject) !== registrationSha256 || value.repositoryFingerprint !== c.fingerprint
    || !exact(value.declaredScope, value.schema === GENERIC_CRITIC_BATCH_SCHEMA ? ["logicalWorkIds", "specification", "guardrails"] : ["logicalWorkIds", "specification", "guardrails", "reviewUnit"])
    || value.originTargets.length !== 1) fail("CGB-STALE");
  const complete = stableJson(join(p, "registration-complete.json"));
  if (!eq(complete, { schema: "pipeline.critic-generic-registration-complete.v1", batchRef })) fail("CGB-HELD");
  for (const identity of logical(value.declaredScope.logicalWorkIds)) boundIndex(c, "logical", identity, batchRef);
  for (const target of value.originTargets) boundIndex(c, "origins", target, batchRef);
  return { dir: p, value };
}
function member(c, batchRef, memberSha256) {
  if (!SHA.test(memberSha256)) fail("CGB-SHAPE");
  const r = registration(c, batchRef);
  const m = stableJson(join(r.dir, "members", `${memberSha256}.json`));
  shape(m, MEMBER);
  const { recordSha256, ...subject } = m;
  if (m.schema !== GENERIC_CRITIC_MEMBER_SCHEMA || m.batchId !== batchRef.batchId || m.registrationSha256 !== batchRef.registrationSha256
    || sha256Canonical(subject) !== recordSha256 || recordSha256 !== memberSha256 || !["origin", "correction"].includes(m.kind)
    || !eq(m.logicalWorkIds, r.value.declaredScope.logicalWorkIds)) fail("CGB-MEMBER");
  boundIndex(c, "origins", m.target, batchRef);
  if (!eq(stableJson(join(r.dir, "members", `${memberSha256}.complete.json`)), { schema: "pipeline.critic-generic-member-complete.v1", memberSha256 })) fail("CGB-HELD");
  return { registration: r.value, dir: r.dir, value: m };
}
function retainedUnadoptedPacket(c, target, taskId) {
  const rows = readdirSync(c.controlRoot);
  if (rows.length > 4096) fail("CGB-BOUND");
  for (const id of rows.filter(p => ID.test(p))) {
    const p = join(c.controlRoot, id, "packet.json");
    if (!existsSync(p)) continue;
    const packet = stableJson(p);
    if (packet.request?.taskId === taskId || eq(targetForPacket(packet), target)) return true;
  }
  return false;
}
function writeMember(c, batchRef, value) {
  const m = { ...value, recordSha256: sha256Canonical(value) };
  const dir = join(c.root, batchRef.batchId, "members");
  const p = join(dir, `${m.recordSha256}.json`);
  const replay = existsSync(p);
  if (replay) { if (!eq(stableJson(p), m)) fail("CGB-STALE"); }
  else durable(p, m);
  publishIndex(c, "origins", m.target, batchRef);
  const complete = join(dir, `${m.recordSha256}.complete.json`);
  const completion = { schema: "pipeline.critic-generic-member-complete.v1", memberSha256: m.recordSha256 };
  if (!existsSync(complete)) durable(complete, completion);
  else if (!eq(stableJson(complete), completion)) fail("CGB-STALE");
  return { batchRef, memberSha256: m.recordSha256, replay };
}
function registerBatch(input) {
  shape(input, ["repoRoot", "controlRoot", "declaration"]);
  const s = declarationSource(input.repoRoot, input.declaration);
  const c = context(input.repoRoot, input.controlRoot, true);
  return transaction(c, () => {
    const hits = [...s.scope.logicalWorkIds.map(id => indexPath(c, "logical", id)), indexPath(c, "origins", s.target)]
      .filter(p => existsSync(p)).map(p => stableJson(p));
    if (hits.length) {
      const batchRef = ref(hits[0].batchRef);
      if (!hits.every(h => eq(h.batchRef, batchRef))) fail("CGB-CONFLICT");
      const r = registration(c, batchRef);
      if (!eq(r.value.declaredScope, s.scope) || !eq(r.value.originTargets, [s.target])) fail("CGB-CONFLICT");
      const origin = { schema: GENERIC_CRITIC_MEMBER_SCHEMA, ...batchRef, kind: "origin", logicalWorkIds: s.scope.logicalWorkIds, target: s.target, parent: null, range: s.range, delta: null };
      const found = member(c, batchRef, sha256Canonical(origin));
      return { batchRef, memberSha256: found.value.recordSha256, replay: true };
    }
    if (retainedUnadoptedPacket(c, s.target, input.declaration.taskId)) fail("CGB-HELD");
    ensureStore(c);
    const batchId = randomBytes(16).toString("hex");
    const subject = { schema: GENERIC_CRITIC_BATCH_V2_SCHEMA, batchId, repositoryFingerprint: c.fingerprint, declaredScope: s.scope, originTargets: [s.target] };
    const batchRef = { batchId, registrationSha256: sha256Canonical(subject) };
    createDirectory(join(c.root, batchId)); createDirectory(join(c.root, batchId, "members"));
    durable(join(c.root, batchId, "registration.json"), { ...subject, registrationSha256: batchRef.registrationSha256 });
    for (const id of s.scope.logicalWorkIds) publishIndex(c, "logical", id, batchRef);
    const result = writeMember(c, batchRef, { schema: GENERIC_CRITIC_MEMBER_SCHEMA, ...batchRef, kind: "origin", logicalWorkIds: s.scope.logicalWorkIds, target: s.target, parent: null, range: s.range, delta: null });
    durable(join(c.root, batchId, "registration-complete.json"), { schema: "pipeline.critic-generic-registration-complete.v1", batchRef });
    if (!eq(s, declarationSource(input.repoRoot, input.declaration))) fail("CGB-STALE");
    return result;
  });
}
function reservationFile(mode, ordinal) { return mode === "full" || ordinal === 2 ? `${mode}-admission.json` : `delta-${ordinal}-admission.json`; }
function reservationAt(dir, mode, ordinal = mode === "full" ? 1 : 2) {
  const p = join(dir, reservationFile(mode, ordinal));
  if (!existsSync(p)) return null;
  const r = stableJson(p); shape(r, RESERVATION);
  if (r.schema !== GENERIC_CRITIC_RESERVATION_SCHEMA || r.mode !== mode || r.ordinal !== ordinal
    || !ID.test(r.packetId) || !SHA.test(r.packetDigest) || !SHA.test(r.claimSha256) || !SHA.test(r.preflightSha256)
    || !SHA.test(r.sourceSha256) || !SHA.test(r.decisionSha256)) fail("CGB-RESERVATION");
  return r;
}
function reservations(dir) {
  if (readdirSync(dir).some(name => /^delta-[0-9]+-admission\.json$/u.test(name)
    && Number(name.split("-")[1]) > CRITIC_DISPATCH_LIMITS.criticRounds)) fail("CGB-BUDGET");
  const full = reservationAt(dir, "full");
  const rows = full ? [full] : [];
  for (let ordinal = 2; ordinal <= CRITIC_DISPATCH_LIMITS.criticRounds; ordinal++) {
    const r = reservationAt(dir, "delta", ordinal);
    if (r) { if (rows.length !== ordinal - 1) fail("CGB-HELD"); rows.push(r); }
  }
  return rows;
}
function consumedParent(c, r, requested) {
  if (requested) {
    shape(requested, ["packetId", "packetDigest", "receiptSha256"]);
    if (requested.packetId !== r.packetId || requested.packetDigest !== r.packetDigest || !SHA.test(requested.receiptSha256)) fail("CGB-PARENT");
  }
  let p;
  try { p = readConsumedSessionAdmission({ controlRoot: c.controlRoot, packetId: r.packetId }); }
  catch { fail("CGB-HELD"); }
  const receiptSha256 = packetDigest(p.receipt);
  if (packetDigest(p.packet) !== r.packetDigest || p.admission.claimSha256 !== r.claimSha256
    || p.admission.preflightSha256 !== r.preflightSha256 || p.admission.courseSourceSha256 !== r.sourceSha256
    || p.admission.courseDecisionSha256 !== r.decisionSha256 || (requested && requested.receiptSha256 !== receiptSha256)
    || typeof p.result?.verdict?.pass !== "boolean" || p.receipt.reviewPass !== p.result.verdict.pass) fail("CGB-PARENT");
  return { ...p, parent: { packetId: r.packetId, packetDigest: r.packetDigest, receiptSha256 } };
}
function deltaSource(root, s, correction, parent, round) {
  if (s.range.base !== parent.packet.candidate.commit) fail("CGB-DELTA");
  git(root, ["merge-base", "--is-ancestor", s.range.base, s.range.commit]);
  const changedPaths = git(root, ["diff", "--name-only", "-z", s.range.base, s.range.commit, "--"]).split("\0").filter(Boolean).map(normalizePacketPath).sort(compare);
  const commits = git(root, ["rev-list", "--reverse", `${s.range.base}..${s.range.commit}`]).trim().split("\n").filter(Boolean);
  if (commits.length > CRITIC_DISPATCH_LIMITS.correctionCommits) fail("CGB-BUDGET");
  const attempt = { round, correctionCommits: commits.length, requestedMode: "delta", base: s.range.base, head: s.range.commit, tree: s.range.tree,
    changedPaths, changedBehaviorClaims: correction.changedBehaviorClaims, priorReceipt: { id: `critic-${parent.parent.packetId}`, sha256: parent.parent.receiptSha256 },
    pathInvariantMap: correction.pathInvariantMap, pathInvariantMapSha256: sha256Canonical(correction.pathInvariantMap),
    coordinatorImpactConfirmed: correction.coordinatorImpactConfirmed, trustBoundaryChanged: correction.trustBoundaryChanged, impactAmbiguous: correction.impactAmbiguous };
  const admitted = admitReviewAttempt(attempt);
  if (!admitted.ok || admitted.mode !== "delta") fail("CGB-DELTA");
  const diagnosticBundle = createDiagnosticBundle({ root, candidate: { commit: s.range.commit, tree: s.range.tree }, evidencePaths: correction.evidencePaths,
    spec: { path: s.scope.specification.path, sha256: s.scope.specification.sha256 }, guardrails: s.scope.guardrails.map(({ path, sha256 }) => ({ path, sha256 })) });
  if (diagnosticBundle.items.some(i => i.status.fullVerify === "failed" || i.status.targeted === "failed")
    || !diagnosticBundle.items.some(i => i.status.fullVerify === "passed" || i.status.targeted === "passed")) fail("CGB-DELTA");
  return { attempt, diagnosticBundle, sourceScope: s.scope };
}
function appendCorrection(input) {
  shape(input, ["repoRoot", "controlRoot", "batchRef", "parent", "correction"]);
  const c = context(input.repoRoot, input.controlRoot);
  const s = declarationSource(input.repoRoot, input.correction, true);
  return transaction(c, () => {
    const r = registration(c, ref(input.batchRef));
    if (!eq(s.scope.logicalWorkIds, r.value.declaredScope.logicalWorkIds)
      || r.value.schema !== GENERIC_CRITIC_BATCH_V2_SCHEMA
      || !eq(s.scope.reviewUnit.declaration, r.value.declaredScope.reviewUnit.declaration)
      || s.scope.reviewUnit.reference.path !== r.value.declaredScope.reviewUnit.reference.path
      || s.scope.reviewUnit.reference.blobOid !== r.value.declaredScope.reviewUnit.reference.blobOid
      || !eq(s.scope.guardrails.map(x => x.path), r.value.declaredScope.guardrails.map(x => x.path))) fail("CGB-CONFLICT");
    const retained = reservations(r.dir);
    if (!retained.length || retained.length >= CRITIC_DISPATCH_LIMITS.criticRounds) fail("CGB-BUDGET");
    const prior = retained.at(-1);
    const parent = consumedParent(c, prior, input.parent);
    if (parent.result.verdict.pass) fail("CGB-PASS-STOPS");
    // Delivery owner ends at integration; one fresh fix owner carries this same batch.
    if (s.target.kind !== "authored-delivery") fail("CGB-CORRECTION-OWNER");
    if (prior.ordinal === 1) {
      if (s.target.taskId === r.value.originTargets[0].taskId) fail("CGB-CORRECTION-OWNER");
    } else {
      const previous = member(c, input.batchRef, prior.memberSha256).value;
      if (s.target.taskId !== previous.target.taskId) fail("CGB-CORRECTION-OWNER");
    }
    const delta = deltaSource(input.repoRoot, s, input.correction, parent, prior.ordinal + 1);
    const result = writeMember(c, input.batchRef, { schema: GENERIC_CRITIC_MEMBER_SCHEMA, ...input.batchRef, kind: "correction", logicalWorkIds: s.scope.logicalWorkIds,
      target: s.target, parent: parent.parent, range: s.range, delta });
    if (!eq(s, declarationSource(input.repoRoot, input.correction, true)) || !eq(delta, deltaSource(input.repoRoot, s, input.correction, consumedParent(c, prior, input.parent), prior.ordinal + 1))) fail("CGB-STALE");
    return result;
  });
}
function actualPacket(c, packetId, claimed = false) {
  try {
    if (claimed) return inspectClaimedCandidatePacket({ controlRoot: c.controlRoot, packetId });
    try { return inspectClaimedCandidatePacket({ controlRoot: c.controlRoot, packetId }); }
    catch { return inspectCandidatePacket({ controlRoot: c.controlRoot, packetId }); }
  } catch { fail("CGB-PHYSICAL"); }
}
function admission(c, input, packet) {
  const m = member(c, ref(input.batchRef), input.memberSha256);
  if (m.registration.schema !== GENERIC_CRITIC_BATCH_V2_SCHEMA || !m.registration.declaredScope.reviewUnit) fail("CGB-REVIEW-UNIT-REQUIRED");
  currentReviewUnit(c, m);
  if (!eq(m.value.target, targetForPacket(packet)) || !eq(m.value.range, packet.candidate)) fail("CGB-MEMBER");
  const spec = packet.references.filter(r => r.kind === "spec");
  const originSpec = m.registration.declaredScope.specification.path;
  if (spec.length !== 1 || spec[0].path !== originSpec) fail("CGB-REFERENCE");
  const sourceScope = m.value.kind === "origin" ? m.registration.declaredScope : m.value.delta?.sourceScope;
  if (!exact(sourceScope, ["logicalWorkIds", "specification", "guardrails", "reviewUnit"]) || sourceScope.specification.path !== originSpec
    || !eq(sourceScope.logicalWorkIds, m.registration.declaredScope.logicalWorkIds)) fail("CGB-REFERENCE");
  for (const [kind, references] of [["spec", [sourceScope.specification]], ["guardrail", sourceScope.guardrails]]) {
    for (const r of references) {
      if (!packet.references.some(p => p.kind === kind && p.path === r.path && p.candidateBlobOid === r.blobOid)
        || r.commit !== packet.candidate.commit) fail("CGB-REFERENCE");
    }
  }
  const retained = reservations(m.dir), full = retained[0] ?? null;
  let parent = null, ordinal = 1, mode = "full", code = "CGB-FULL-ADMITTED";
  if (full) {
    parent = consumedParent(c, retained.at(-1));
    if (parent.result.verdict.pass) fail("CGB-PASS-STOPS");
    if (retained.length >= CRITIC_DISPATCH_LIMITS.criticRounds) fail("CGB-BUDGET");
    if (m.value.kind !== "correction" || !eq(m.value.parent, parent.parent) || !m.value.delta
      || !eq(m.value.delta.diagnosticBundle, packet.diagnostics)) fail("CGB-DELTA");
    const attempt = admitReviewAttempt(m.value.delta.attempt);
    if (!attempt.ok || attempt.mode !== "delta" || !eq(m.value.delta.attempt.changedPaths, packet.diffPaths)) fail("CGB-DELTA");
    ordinal = retained.at(-1).ordinal + 1;
    if (m.value.delta.attempt.round !== ordinal) fail("CGB-DELTA");
    mode = "delta"; code = "CGB-DELTA-ADMITTED";
  } else if (m.value.kind !== "origin" || m.value.parent !== null || m.value.delta !== null) fail("CGB-MEMBER");
  const subject = { registration: m.registration, member: m.value, full, parent: parent?.parent ?? null, packetDigest: packetDigest(packet) };
  const decision = { status: "admitted", mode, code };
  return { schema: "pipeline.critic-generic-batch-admission.v1", batchRef: input.batchRef, memberSha256: input.memberSha256,
    sourceSha256: sha256Canonical(subject), decisionSha256: sha256Canonical(decision), decision, ordinal, parent: parent?.parent ?? null };
}
function readAdmission(input) {
  shape(input, ["controlRoot", "packetId", "batchRef", "memberSha256"]);
  const c = readContext(input.controlRoot); unlocked(c);
  const before = admission(c, input, actualPacket(c, input.packetId).packet);
  const after = admission(c, input, actualPacket(c, input.packetId).packet); unlocked(c);
  if (!eq(before, after)) fail("CGB-STALE");
  return before;
}
function retainedReservation(c, input, observed) {
  const m = member(c, ref(input.batchRef), input.memberSha256);
  if (m.registration.schema === GENERIC_CRITIC_BATCH_V2_SCHEMA) currentReviewUnit(c, m);
  const retained = reservations(m.dir);
  for (const r of retained) {
    const mode = r.mode;
    if (r.packetId !== input.packetId) continue;
    if (r.batchId !== input.batchRef.batchId || r.registrationSha256 !== input.batchRef.registrationSha256
      || r.memberSha256 !== input.memberSha256 || r.preflightSha256 !== input.preflightSha256
      || r.packetDigest !== packetDigest(observed.packet) || r.claimSha256 !== packetDigest(observed.claim)
      || !eq(r.candidate, observed.packet.candidate) || !eq(r.range, observed.packet.candidate)) fail("CGB-RESERVATION");
    const full = mode === "delta" ? reservationAt(m.dir, "full") : null;
    const parent = mode === "delta" && full ? consumedParent(c, retained[r.ordinal - 2]) : null;
    const subject = { registration: m.registration, member: m.value, full, parent: parent?.parent ?? null, packetDigest: packetDigest(observed.packet) };
    const decision = { status: "admitted", mode, code: mode === "full" ? "CGB-FULL-ADMITTED" : "CGB-DELTA-ADMITTED" };
    if ((mode === "full" ? m.value.kind !== "origin" : m.value.kind !== "correction" || parent === null || parent.result.verdict.pass)
      || r.sourceSha256 !== sha256Canonical(subject) || r.decisionSha256 !== sha256Canonical(decision)
      || !eq(r.parent, parent?.parent ?? null)
      || r.deltaEvidenceSha256 !== (m.value.delta === null ? null : sha256Canonical(m.value.delta))) fail("CGB-RESERVATION");
    return { reservation: r, replay: true };
  }
  return null;
}
function currentReviewUnit(c, m) {
  const scope = m.registration.declaredScope;
  const unit = scope.reviewUnit;
  const current = reviewUnitSource(c.repository.repoRoot, {baseCommit:unit.reference.commit, candidateCommit:m.value.range.commit,
    specPath:scope.specification.path, reviewUnitPath:unit.reference.path}, scope.logicalWorkIds);
  if (!eq(unit, current)) fail("CGB-REVIEW-UNIT-BINDING");
}
function readReservedAdmission(input) {
  shape(input, ["controlRoot", "packetId", "batchRef", "memberSha256", "preflightSha256"]);
  const c = readContext(input.controlRoot); unlocked(c);
  const observed = actualPacket(c, input.packetId, true);
  const retained = retainedReservation(c, input, observed);
  if (!retained) fail("CGB-RESERVATION");
  const after = retainedReservation(c, input, actualPacket(c, input.packetId, true)); unlocked(c);
  if (!eq(retained, after)) fail("CGB-STALE");
  return retained;
}
function reserveAdmission(input) {
  shape(input, ["controlRoot", "packetId", "batchRef", "memberSha256", "preflightSha256"]);
  if (!SHA.test(input.preflightSha256)) fail("CGB-SHAPE");
  const c = readContext(input.controlRoot);
  return transaction(c, () => {
    const observed = actualPacket(c, input.packetId, true);
    if (observed.packet.request.sessionBinding?.preflightSha256 !== input.preflightSha256) fail("CGB-RESERVATION");
    const retained = retainedReservation(c, input, observed);
    if (retained) return retained;
    const a = admission(c, input, observed.packet);
    const m = member(c, input.batchRef, input.memberSha256);
    const r = { schema: GENERIC_CRITIC_RESERVATION_SCHEMA, ...input.batchRef, ordinal: a.ordinal, mode: a.decision.mode,
      packetId: input.packetId, packetDigest: packetDigest(observed.packet), claimSha256: packetDigest(observed.claim),
      preflightSha256: input.preflightSha256, memberSha256: input.memberSha256, parent: a.parent,
      candidate: observed.packet.candidate, range: observed.packet.candidate,
      deltaEvidenceSha256: m.value.delta === null ? null : sha256Canonical(m.value.delta), sourceSha256: a.sourceSha256, decisionSha256: a.decisionSha256 };
    durable(join(m.dir, reservationFile(r.mode, r.ordinal)), r);
    const after = actualPacket(c, input.packetId, true);
    if (!eq(observed, after)) fail("CGB-STALE");
    return { reservation: r, replay: false };
  });
}
function invoke(action) {
  try { return action(); }
  catch (error) { if (error instanceof GenericCriticBatchError) throw error; fail("CGB-PHYSICAL"); }
}
export function registerGenericCriticBatch(input) { return invoke(() => registerBatch(input)); }
export function appendGenericCriticBatchCorrection(input) { return invoke(() => appendCorrection(input)); }
export function readGenericCriticBatchAdmission(input) { return invoke(() => readAdmission(input)); }
export function reserveGenericCriticBatchAdmission(input) { return invoke(() => reserveAdmission(input)); }
export function readReservedGenericCriticBatchAdmission(input) { return invoke(() => readReservedAdmission(input)); }
/** Shared source-bound declaration reader; presence/bindings do not attest semantic coherence. */
export function readCriticReviewUnit(input) {
  return invoke(() => {
    shape(input, ["repoRoot", "baseCommit", "candidateCommit", "specPath", "logicalWorkIds", "reviewUnitPath"]);
    if (!OID.test(input.baseCommit) || !OID.test(input.candidateCommit)) fail("CGB-SHAPE");
    return reviewUnitSource(input.repoRoot, input, logical(input.logicalWorkIds));
  });
}
function featureOwnership(c, courseKey, work) {
  const hits = work.map(id => indexPath(c, "logical", id)).filter(p => existsSync(p)).map(p => stableJson(p));
  const origin=indexPath(c,"origins",{kind:"feature-course",courseKey});
  if (!hits.length) { if(existsSync(origin))fail("CGB-CONFLICT");return null; }
  const batchRef = ref(hits[0].batchRef);
  if (hits.length !== work.length || !hits.every(h => eq(h.batchRef, batchRef))) fail("CGB-CONFLICT");
  const registered = registration(c, batchRef);
  if (registered.value.schema !== GENERIC_CRITIC_BATCH_V2_SCHEMA
    || !eq(registered.value.declaredScope.logicalWorkIds, work)
    || !eq(registered.value.originTargets, [{kind:"feature-course",courseKey}])) fail("CGB-CONFLICT");
  return { ...registered, batchRef };
}
/** Read-only shared work-identity check; absence grants no packet or child authority. */
export function assertFeatureCriticReviewUnitOwnership(input) {
  return invoke(() => {
    shape(input, ["repoRoot", "courseKey", "logicalWorkIds"]);
    if (!SHA.test(input.courseKey)) fail("CGB-SHAPE");
    const work = logical(input.logicalWorkIds);
    const repo = discoverRepository(realpathSync(input.repoRoot));
    const controlRoot = join(realpathSync(repo.commonDir), "agent-pipeline", "critic-packets");
    if (!existsSync(join(controlRoot, "generic-batches"))) return { claimed:false };
    const c = context(input.repoRoot, controlRoot);
    const boundary = () => activeTransaction?.root === c.root ? assertNamespace(c) : unlocked(c);
    boundary();
    const owned = featureOwnership(c, input.courseKey, work); boundary();
    return { claimed:owned !== null, batchRef:owned?.batchRef ?? null };
  });
}
/** Actual claimed feature packets reserve the same logical/origin namespace and round slots. */
export function reserveFeatureCriticReviewUnitOwnership(input) {
  return invoke(() => {
    shape(input, ["repoRoot", "controlRoot", "packetId", "preflightSha256", "courseInput", "sourceSha256", "decisionSha256"]);
    if (![input.preflightSha256,input.sourceSha256,input.decisionSha256].every(x => SHA.test(x))) fail("CGB-SHAPE");
    const projection = readCriticCourseAdmission(input.courseInput);
    const {decision,...subject} = projection;
    if (projection.decision?.status !== "admitted" || sha256Canonical(subject) !== input.sourceSha256
      || sha256Canonical(decision) !== input.decisionSha256 || realpathSync(input.courseInput.repoRoot) !== realpathSync(input.repoRoot)) fail("CGB-FEATURE-COURSE");
    const identity = projection.courseIdentity, unitRef = projection.source.reviewUnit;
    const declared = JSON.parse(git(input.repoRoot, ["show", `${identity.genesisCandidate.base}:${normalizePacketPath(unitRef.path)}`]));
    const work = logical(declared.logicalWorkIds);
    const unit = readCriticReviewUnit({repoRoot:input.repoRoot,baseCommit:identity.genesisCandidate.base,candidateCommit:input.courseInput.candidateCommit,
      specPath:unitRef.specPath,logicalWorkIds:work,reviewUnitPath:unitRef.path});
    if (unit.reference.sha256 !== unitRef.sha256) fail("CGB-REVIEW-UNIT-BINDING");
    const c = context(input.repoRoot,input.controlRoot,true);
    return transaction(c, () => {
      const observed = actualPacket(c,input.packetId,true), packet = observed.packet;
      if (packet.request.sessionBinding?.preflightSha256 !== input.preflightSha256 || !eq(packet.candidate,projection.source.candidate)
        || !packet.references.some(r => r.kind === "spec" && r.path === unitRef.specPath)) fail("CGB-FEATURE-COURSE");
      const courseKey = identity.courseKey, target = {kind:"feature-course",courseKey};
      let owned = featureOwnership(c,courseKey,work);
      const deliveryIndex=indexPath(c,"origins",targetForPacket(packet));
      if(existsSync(deliveryIndex) && (!owned || !eq(stableJson(deliveryIndex).batchRef,owned.batchRef)))fail("CGB-CONFLICT");
      if (!owned) {
        if (projection.budgets.reviewRound !== 1) fail("CGB-REGISTRATION-REQUIRED");
        ensureStore(c);
        const batchId=randomBytes(16).toString("hex");
        const declaredScope={logicalWorkIds:work,specification:reference(input.repoRoot,packet.candidate.commit,unitRef.specPath),
          guardrails:packet.references.filter(r=>r.kind==="guardrail").map(r=>reference(input.repoRoot,packet.candidate.commit,r.path,"guardrail")),reviewUnit:unit};
        const value={schema:GENERIC_CRITIC_BATCH_V2_SCHEMA,batchId,repositoryFingerprint:c.fingerprint,declaredScope,originTargets:[target]};
        const batchRef={batchId,registrationSha256:sha256Canonical(value)};
        createDirectory(join(c.root,batchId));createDirectory(join(c.root,batchId,"members"));
        durable(join(c.root,batchId,"registration.json"),{...value,registrationSha256:batchRef.registrationSha256});
        for(const id of work)publishIndex(c,"logical",id,batchRef);
        publishIndex(c,"origins",target,batchRef);
        durable(join(c.root,batchId,"registration-complete.json"),{schema:"pipeline.critic-generic-registration-complete.v1",batchRef});
        owned={dir:join(c.root,batchId),value,batchRef};
      } else if (!eq(owned.value.declaredScope.reviewUnit,unit)) fail("CGB-CONFLICT");
      const ordinal=projection.budgets.reviewRound,mode=projection.decision.mode;
      const prior=reservations(owned.dir);
      const retained=reservationAt(owned.dir,mode,ordinal);
      if(retained) {
        if(retained.packetId!==input.packetId || retained.packetDigest!==packetDigest(packet)
          || retained.claimSha256!==packetDigest(observed.claim) || retained.preflightSha256!==input.preflightSha256
          || retained.sourceSha256!==input.sourceSha256 || retained.decisionSha256!==input.decisionSha256)fail("CGB-BUDGET");
        return {reservation:retained,replay:true};
      }
      if(prior.length!==ordinal-1 || ordinal>CRITIC_DISPATCH_LIMITS.criticRounds)fail("CGB-BUDGET");
      const parent=prior.length?consumedParent(c,prior.at(-1)):null;
      if(parent?.result.verdict.pass)fail("CGB-PASS-STOPS");
      if(parent && (projection.parent?.packetId!==parent.parent.packetId || projection.parent.receiptSha256!==parent.parent.receiptSha256))fail("CGB-PARENT");
      const member=writeMember(c,owned.batchRef,{schema:GENERIC_CRITIC_MEMBER_SCHEMA,...owned.batchRef,kind:ordinal===1?"origin":"correction",logicalWorkIds:work,
        target:targetForPacket(packet),parent:parent?.parent??null,range:packet.candidate,delta:ordinal===1?null:projection});
      const reservation={schema:GENERIC_CRITIC_RESERVATION_SCHEMA,...owned.batchRef,ordinal,mode,packetId:input.packetId,packetDigest:packetDigest(packet),claimSha256:packetDigest(observed.claim),
        preflightSha256:input.preflightSha256,memberSha256:member.memberSha256,parent:parent?.parent??null,candidate:packet.candidate,range:packet.candidate,
        deltaEvidenceSha256:ordinal===1?null:sha256Canonical(projection),sourceSha256:input.sourceSha256,decisionSha256:input.decisionSha256};
      durable(join(owned.dir,reservationFile(mode,ordinal)),reservation);
      const after=readCriticCourseAdmission(input.courseInput);
      if(!eq(projection,after) || !eq(observed,actualPacket(c,input.packetId,true)))fail("CGB-STALE");
      return {reservation,replay:false};
    });
  });
}
