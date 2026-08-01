// SPDX-License-Identifier: SUL-1.0
/**
 * Runner-neutral project-authority compatibility migration.
 *
 * Planning has no writes and exposes only paths and digests.  An in-process,
 * unchanged plan plus an explicit activation are required for a write.  The
 * legacy `.claude` authority is never moved or removed: consumers dual-read
 * it until the neutral `project/` authority has been committed and read back.
 */
import { createHash } from "node:crypto";
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const PROJECT_AUTHORITY_SCHEMA = "pipeline.project-authority.v1";
export const PROJECT_AUTHORITY_RECOVERY_SCHEMA = "pipeline.project-authority-recovery.v1";
export const PROJECT_AUTHORITY_STATE_RECONCILE_SCHEMA = "pipeline.project-authority-state-reconcile.v1";
export const PROJECT_AUTHORITY_STATE_SYNC_SCHEMA = "pipeline.project-authority-state-sync.v1";
export const NEUTRAL_MANIFEST = "project/pipeline.yaml";
export const NEUTRAL_STATE = "project/pipeline-state.json";
export const LEGACY_MANIFEST = ".claude/pipeline.yaml";
export const LEGACY_STATE = ".claude/pipeline-state.json";
export const PROJECT_AUTHORITY_TRANSACTION_DIR = ".pipeline-project-authority-migration";
export const PROJECT_AUTHORITY_STATE_SYNC_TRANSACTION_DIR = ".pipeline-project-authority-state-sync";
const JOURNAL_FILE = "journal.json";
const JOURNAL_SCHEMA = "pipeline.project-authority-journal.v1";
const STATE_SYNC_JOURNAL_SCHEMA = "pipeline.project-authority-state-sync-journal.v1";
const TARGETS = Object.freeze([
  { path: NEUTRAL_MANIFEST, legacy: LEGACY_MANIFEST, kind: "project-authority" },
  { path: NEUTRAL_STATE, legacy: LEGACY_STATE, kind: "project-state" },
]);
const PLANS = new WeakMap();
const RECOVERY_PLANS = new WeakMap();
const STATE_RECONCILE_PLANS = new WeakMap();
const STATE_SYNC_PLANS = new WeakMap();
const STATE_SYNC_RECOVERY_PLANS = new WeakMap();
const SHA256 = /^[0-9a-f]{64}$/u;

class IntentionalInterruption extends Error {}
const sha = (value) => createHash("sha256").update(value).digest("hex");
const stableJson = (value) => JSON.stringify(value);
const absent = () => ({ status: "absent", sha256: null, byteLength: 0 });
const present = (bytes) => ({ status: "present", sha256: sha(bytes), byteLength: bytes.length });

function realRoot(rootDir) {
  const requested = resolve(rootDir);
  const info = lstatSync(requested);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("root must be a real project directory");
  return realpathSync(requested);
}
function projectPath(root, path) {
  const candidate = resolve(root, path);
  if (relative(root, candidate).startsWith(`..${sep}`) || candidate === root) throw new Error("unsafe project-relative path");
  let cursor = root;
  for (const component of path.split("/")) {
    cursor = join(cursor, component);
    if (!existsSync(cursor)) continue;
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error(`project path contains a symbolic link: ${path}`);
    if (cursor !== candidate && !info.isDirectory()) throw new Error(`project path has a non-directory parent: ${path}`);
  }
  return candidate;
}
function image(root, path) {
  const full = projectPath(root, path);
  if (!existsSync(full)) return absent();
  const info = lstatSync(full);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`authority path is not a regular file: ${path}`);
  return present(readFileSync(full));
}
function bytes(root, path) {
  const full = projectPath(root, path);
  if (!existsSync(full)) return null;
  const info = lstatSync(full);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`authority path is not a regular file: ${path}`);
  return readFileSync(full);
}
function sameImage(left, right) {
  return left?.status === right?.status && left?.sha256 === right?.sha256 && left?.byteLength === right?.byteLength;
}
function readLayer(root, manifest, state, source) {
  const manifestImage = image(root, manifest);
  const stateImage = image(root, state);
  if (manifestImage.status === "absent") return { source, status: "absent", manifest: manifestImage, state: stateImage };
  return { source, status: "ready", manifest: manifestImage, state: stateImage };
}
function authority(root) {
  const neutral = readLayer(root, NEUTRAL_MANIFEST, NEUTRAL_STATE, "neutral");
  const legacy = readLayer(root, LEGACY_MANIFEST, LEGACY_STATE, "legacy");
  if (neutral.status === "ready") {
    // A state file from a different layer would make the reader dependent on
    // precedence rather than one authority boundary.  Stop instead of mixing.
    if (neutral.state.status === "absent" && legacy.state.status === "present") {
      return { status: "mixed", reason: "neutral authority has no neutral state while legacy state remains" };
    }
    return { status: "ready", source: "neutral", manifest: NEUTRAL_MANIFEST, state: neutral.state.status === "present" ? NEUTRAL_STATE : null, manifestSha256: neutral.manifest.sha256, stateSha256: neutral.state.sha256 };
  }
  if (legacy.status === "ready") {
    return { status: "ready", source: "legacy", manifest: LEGACY_MANIFEST, state: legacy.state.status === "present" ? LEGACY_STATE : null, manifestSha256: legacy.manifest.sha256, stateSha256: legacy.state.sha256 };
  }
  return { status: "missing", reason: "project authority manifest is missing" };
}
function result(status, extra = {}) { return { schema: PROJECT_AUTHORITY_SCHEMA, status, requiresExplicitActivation: true, ...extra }; }
function recoveryResult(status, extra = {}) { return { schema: PROJECT_AUTHORITY_RECOVERY_SCHEMA, status, requiresExplicitActivation: true, ...extra }; }
function transactionPaths(root) {
  const transaction = projectPath(root, PROJECT_AUTHORITY_TRANSACTION_DIR);
  return { transaction, journal: join(transaction, JOURNAL_FILE) };
}
function stateSyncTransactionPaths(root) {
  const transaction = projectPath(root, PROJECT_AUTHORITY_STATE_SYNC_TRANSACTION_DIR);
  return { transaction, journal: join(transaction, JOURNAL_FILE) };
}
function fsyncFile(path) { const fd = openSync(path, "r+"); try { fsyncSync(fd); } finally { closeSync(fd); } }
function fsyncDirectory(path) {
  try { const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
  catch (error) {
    // Windows does not consistently support directory fsync. The rename and
    // journal protocol remain recoverable; do not misclassify that platform
    // limitation as a successful durability claim.
    if (process.platform !== "win32") throw error;
  }
}
function durableWrite(path, value) { writeFileSync(path, value, { mode: 0o600 }); fsyncFile(path); }
function durableJournalAt(transaction, journal) {
  const path = join(transaction, JOURNAL_FILE);
  durableWrite(path, `${JSON.stringify(journal)}\n`); fsyncDirectory(transaction);
}
function durableJournal(root, journal) { durableJournalAt(transactionPaths(root).transaction, journal); }
function planSignature(plan) { return stableJson(plan); }
function remember(plan, internal) { PLANS.set(plan, { signature: planSignature(plan), ...internal }); return plan; }
function authenticated(plan) {
  try {
    const remembered = PLANS.get(plan);
    if (!remembered || planSignature(plan) !== remembered.signature) return null;
    return remembered;
  } catch { return null; }
}
function changedTargets(root) {
  return TARGETS.map((target) => {
    const source = image(root, target.legacy);
    const before = image(root, target.path);
    return { ...target, before, after: source, changed: !sameImage(before, source) };
  }).filter((target) => target.after.status === "present");
}
function stateReconcileResult(status, extra = {}) { return { schema: PROJECT_AUTHORITY_STATE_RECONCILE_SCHEMA, status, requiresExplicitActivation: true, ...extra }; }
function stateSyncResult(status, extra = {}) { return { schema: PROJECT_AUTHORITY_STATE_SYNC_SCHEMA, status, requiresExplicitActivation: true, ...extra }; }
function stateSyncRecoveryResult(status, extra = {}) { return { schema: PROJECT_AUTHORITY_STATE_SYNC_SCHEMA, status, requiresExplicitActivation: true, ...extra }; }
function stateProjection(root, path) {
  const before = image(root, path); if (before.status !== "present") throw new Error(`${path} is missing`);
  const value = JSON.parse(bytes(root, path).toString("utf8"));
  if (!value?.activeFeature || typeof value.activeFeature !== "object"
    || typeof value.activeFeature.id !== "string" || value.activeFeature.id.length === 0
    || typeof value.activeFeature.planPath !== "string" || value.activeFeature.planPath.length === 0
    || typeof value.activeFeature.phase !== "string" || value.activeFeature.phase.length === 0
    || typeof value.updatedAt !== "string" || value.updatedAt.length === 0) throw new Error(`${path} has an invalid active feature projection`);
  return { path, before, value };
}
function stateSyncTargets(legacy, neutral, after) {
  return [{ path: LEGACY_STATE, before: legacy.before, after }, { path: NEUTRAL_STATE, before: neutral.before, after }];
}
function validateStateSyncJournal(root, journal) {
  if (!journal || journal.schema !== STATE_SYNC_JOURNAL_SCHEMA || !["prepared", "applying", "complete"].includes(journal.state) || !Array.isArray(journal.targets) || journal.targets.length !== 2) throw new Error("state sync journal is corrupt");
  const { transaction } = stateSyncTransactionPaths(root); const expectedPaths = [LEGACY_STATE, NEUTRAL_STATE];
  for (const [index, entry] of journal.targets.entries()) {
    if (!entry || entry.path !== expectedPaths[index] || !["staged", "displacing", "displaced", "renamed"].includes(entry.state)
      || !entry.before || !entry.after || entry.before.status !== "present" || entry.after.status !== "present"
      || !SHA256.test(entry.before.sha256) || !SHA256.test(entry.after.sha256)
      || !Number.isInteger(entry.before.byteLength) || !Number.isInteger(entry.after.byteLength)
      || entry.stage !== `stage-${index}` || entry.preimage !== `preimage-${index}` || entry.displaced !== `displaced-${index}`) throw new Error("state sync journal has an invalid target proof");
    const stage = join(transaction, entry.stage); const preimage = join(transaction, entry.preimage); const displaced = join(transaction, entry.displaced); const current = image(root, entry.path);
    const expectsStage = entry.state === "staged" || entry.state === "displacing" || (entry.state === "displaced" && current.status === "absent");
    if (expectsStage && (!existsSync(stage) || !sameImage(present(readFileSync(stage)), entry.after))) throw new Error("state sync staged proof is missing or corrupt");
    if (!expectsStage && existsSync(stage)) throw new Error("state sync consumed stage unexpectedly remains");
    if (!existsSync(preimage) || !sameImage(present(readFileSync(preimage)), entry.before)) throw new Error("state sync preimage proof is missing or corrupt");
    if ((entry.state === "staged" || entry.state === "displacing") && sameImage(current, entry.before)) continue;
    if (entry.state === "displacing" && current.status === "absent" && existsSync(displaced)) continue;
    if (entry.state === "displaced" && current.status === "absent" && existsSync(displaced)) continue;
    if (entry.state === "displaced" && sameImage(current, entry.after) && existsSync(displaced)) continue;
    if (entry.state === "renamed" && !sameImage(current, entry.after)) throw new Error("state sync target changed after interruption");
    if (entry.state !== "renamed") throw new Error("state sync target changed during apply");
  }
}
function prepareStateSync(root, targets, afterBytes) {
  const { transaction } = stateSyncTransactionPaths(root); if (existsSync(transaction)) throw new Error("state sync recovery is required");
  mkdirSync(transaction, { mode: 0o700 }); fsyncDirectory(root);
  const entries = targets.map((target, index) => ({ ...target, stage: `stage-${index}`, preimage: `preimage-${index}`, displaced: `displaced-${index}`, state: "staged" }));
  try {
    for (const entry of entries) { durableWrite(join(transaction, entry.stage), afterBytes); durableWrite(join(transaction, entry.preimage), bytes(root, entry.path)); }
    const journal = { schema: STATE_SYNC_JOURNAL_SCHEMA, state: "prepared", targets: entries }; durableJournalAt(transaction, journal); return journal;
  } catch (error) { rmSync(transaction, { recursive: true, force: true }); throw error; }
}
function commitStateSyncTarget(root, journal, entry, { interruptAfterStageRename } = {}) {
  const { transaction } = stateSyncTransactionPaths(root); const destination = projectPath(root, entry.path);
  journal.state = "applying"; entry.state = "displacing"; durableJournalAt(transaction, journal);
  renameSync(destination, join(transaction, entry.displaced)); fsyncDirectory(dirname(destination)); fsyncDirectory(transaction);
  entry.state = "displaced"; durableJournalAt(transaction, journal);
  renameSync(join(transaction, entry.stage), destination); fsyncDirectory(dirname(destination)); fsyncDirectory(transaction);
  if (interruptAfterStageRename?.({ target: entry.path })) throw new IntentionalInterruption(`interrupted after staging ${entry.path}`);
  if (!sameImage(image(root, entry.path), entry.after)) throw new Error(`state sync readback failed: ${entry.path}`);
  entry.state = "renamed"; durableJournalAt(transaction, journal);
}
function restoreStateSync(root, journal) {
  validateStateSyncJournal(root, journal); const { transaction } = stateSyncTransactionPaths(root);
  journal.state = "applying"; durableJournalAt(transaction, journal);
  for (const entry of [...journal.targets].reverse()) {
    const destination = projectPath(root, entry.path); const current = image(root, entry.path);
    if (entry.state === "staged" || (entry.state === "displacing" && sameImage(current, entry.before))) continue;
    if ((entry.state === "displacing" || entry.state === "displaced") && current.status === "absent") {
      renameSync(join(transaction, entry.displaced), destination); fsyncDirectory(dirname(destination)); entry.state = "staged"; durableJournalAt(transaction, journal); continue;
    }
    if (!sameImage(current, entry.after)) throw new Error(`state sync destination changed during recovery: ${entry.path}`);
    const quarantine = join(transaction, `rollback-${entry.stage}`);
    renameSync(destination, quarantine); renameSync(join(transaction, entry.displaced), destination); unlinkSync(quarantine);
    fsyncDirectory(dirname(destination)); entry.state = "staged"; durableJournalAt(transaction, journal);
  }
  rmSync(transaction, { recursive: true, force: true }); fsyncDirectory(root);
}
/** Preview an exact two-projection alignment using neutral authority and the Legacy phase. */
export function planProjectAuthorityStateSynchronization({ rootDir = process.cwd() } = {}) {
  let root;
  try {
    root = realRoot(rootDir); if (authority(root).source !== "neutral") return stateSyncResult("rejected", { reason: "neutral authority is required" });
    if (existsSync(stateSyncTransactionPaths(root).transaction)) return stateSyncResult("recovery-required", { reason: "state sync recovery is required before a new plan" });
    const legacy = stateProjection(root, LEGACY_STATE); const neutral = stateProjection(root, NEUTRAL_STATE);
    if (legacy.value.activeFeature.id !== neutral.value.activeFeature.id || legacy.value.activeFeature.planPath !== neutral.value.activeFeature.planPath) throw new Error("state feature identities differ");
    const next = structuredClone(neutral.value); next.activeFeature = { ...next.activeFeature, phase: legacy.value.activeFeature.phase }; next.updatedAt = legacy.value.updatedAt;
    const bytesNext = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8"); const after = present(bytesNext);
    const targets = stateSyncTargets(legacy, neutral, after);
    if (sameImage(legacy.before, after) && sameImage(neutral.before, after)) {
      const plan = stateSyncResult("noop", { reason: "state projections already aligned", phase: next.activeFeature.phase, targets });
      STATE_SYNC_PLANS.set(plan, { root, signature: planSignature(plan), legacy, neutral, bytesNext, after, targets, status: "noop" }); return plan;
    }
    const plan = stateSyncResult("ready", { phase: next.activeFeature.phase, compatibility: "neutral-authority-with-legacy-phase", targets });
    STATE_SYNC_PLANS.set(plan, { root, signature: planSignature(plan), legacy, neutral, bytesNext, after, targets, status: "ready" }); return plan;
  } catch (error) { return stateSyncResult("rejected", { reason: error.message }); }
}
/** Apply only an unchanged explicit dual-state synchronization plan. */
export function applyProjectAuthorityStateSynchronization(plan, { rootDir = process.cwd(), activate = false, interruptAfterRename, interruptAfterStageRename } = {}) {
  const state = STATE_SYNC_PLANS.get(plan); if (!state || planSignature(plan) !== state.signature) return stateSyncResult("rejected", { reason: "unauthenticated or changed plan" });
  if (state.status === "noop") return stateSyncResult("noop", { reason: "state projections already aligned", phase: state.legacy.value.activeFeature.phase, targets: [LEGACY_STATE, NEUTRAL_STATE] });
  if (!activate) return stateSyncResult("activation-required", { reason: "explicit activation required" });
  try {
    const root = realRoot(rootDir); if (root !== state.root || !sameImage(image(root, LEGACY_STATE), state.legacy.before) || !sameImage(image(root, NEUTRAL_STATE), state.neutral.before)) throw new Error("state changed since planning");
    const journal = prepareStateSync(root, state.targets, state.bytesNext);
    try {
      for (const [index, entry] of journal.targets.entries()) {
        commitStateSyncTarget(root, journal, entry, { interruptAfterStageRename });
        if (interruptAfterRename?.({ index, target: entry.path })) throw new IntentionalInterruption(`interrupted after ${entry.path}`);
      }
      journal.state = "complete"; durableJournalAt(stateSyncTransactionPaths(root).transaction, journal); rmSync(stateSyncTransactionPaths(root).transaction, { recursive: true, force: true }); fsyncDirectory(root);
      if (!sameImage(image(root, LEGACY_STATE), state.after) || !sameImage(image(root, NEUTRAL_STATE), state.after)) throw new Error("state sync final readback failed");
      STATE_SYNC_PLANS.delete(plan); return stateSyncResult("applied", { phase: state.legacy.value.activeFeature.phase, targets: [LEGACY_STATE, NEUTRAL_STATE] });
    } catch (error) {
      if (error instanceof IntentionalInterruption) return stateSyncResult("interrupted", { reason: error.message });
      try { restoreStateSync(root, journal); } catch (recoveryError) { return stateSyncResult("recovery-required", { reason: recoveryError.message }); }
      return stateSyncResult("rolled-back", { reason: error.message });
    }
  } catch (error) { return stateSyncResult("rejected", { reason: error.message }); }
}
/** Preview recovery after an interrupted dual-state synchronization; it never writes. */
export function planPendingProjectAuthorityStateSynchronizationRecovery({ rootDir = process.cwd() } = {}) {
  let root;
  try {
    root = realRoot(rootDir); const { transaction, journal: journalPath } = stateSyncTransactionPaths(root);
    if (!existsSync(transaction)) return stateSyncRecoveryResult("none", { targets: [] });
    if (!existsSync(journalPath)) return stateSyncRecoveryResult("recovery-required", { reason: "state sync transaction has no journal" });
    const raw = readFileSync(journalPath); const journal = JSON.parse(raw); validateStateSyncJournal(root, journal);
    const plan = stateSyncRecoveryResult("ready", { transaction: { journalSha256: sha(raw), journalState: journal.state }, targets: journal.targets.map(({ path, before, after, state }) => ({ path, before, after, journalState: state, action: "restore-recorded-preimage" })) });
    STATE_SYNC_RECOVERY_PLANS.set(plan, { root, signature: planSignature(plan), journalSha256: sha(raw) }); return plan;
  } catch (error) { return stateSyncRecoveryResult("recovery-required", { reason: error.message }); }
}
/** Restore only an unchanged journaled preimage after an interrupted dual-state synchronization. */
export function applyPendingProjectAuthorityStateSynchronizationRecovery(plan, { rootDir = process.cwd(), activate = false } = {}) {
  const state = STATE_SYNC_RECOVERY_PLANS.get(plan); if (!state || planSignature(plan) !== state.signature) return stateSyncRecoveryResult("rejected", { reason: "unauthenticated or changed recovery plan" });
  if (!activate) return stateSyncRecoveryResult("activation-required", { reason: "explicit activation required" });
  try {
    const root = realRoot(rootDir); if (root !== state.root) throw new Error("recovery root differs from the authenticated plan root");
    const { journal: journalPath } = stateSyncTransactionPaths(root); const raw = readFileSync(journalPath);
    if (sha(raw) !== state.journalSha256) throw new Error("state sync journal changed since planning");
    restoreStateSync(root, JSON.parse(raw)); STATE_SYNC_RECOVERY_PLANS.delete(plan);
    return stateSyncRecoveryResult("recovered", { targets: [LEGACY_STATE, NEUTRAL_STATE] });
  } catch (error) { return stateSyncRecoveryResult("rejected", { reason: error.message }); }
}
function stateResultPathCorrection(root) {
  const before = image(root, NEUTRAL_STATE);
  if (before.status !== "present") throw new Error("neutral project state is missing");
  const value = JSON.parse(bytes(root, NEUTRAL_STATE).toString("utf8"));
  const result = value?.continuity?.authority?.result;
  if (!result || typeof result !== "object" || Array.isArray(result) || result.path !== "specs/sprint-phoenix-epic/Result.md" || !SHA256.test(result.sha256)) throw new Error("neutral project state has no recognized Result-path correction");
  result.path = "specs/sprint-phoenix-epic/result.md";
  const afterBytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  return { path: NEUTRAL_STATE, before, after: present(afterBytes), afterBytes };
}

/** Preview the sole PHX-0 neutral-state case correction; it never writes. */
export function planProjectAuthorityStateReconciliation({ rootDir = process.cwd() } = {}) {
  let root;
  try {
    root = realRoot(rootDir); const current = authority(root);
    if (current.status !== "ready" || current.source !== "neutral") return stateReconcileResult("rejected", { reason: "neutral project authority is required" });
    const target = stateResultPathCorrection(root);
    const plan = stateReconcileResult("ready", { target: { path: target.path, before: target.before, after: target.after }, correction: "result-path-case" });
    STATE_RECONCILE_PLANS.set(plan, { root, signature: planSignature(plan), target }); return plan;
  } catch (error) {
    return stateReconcileResult(error.message.includes("no recognized") ? "noop" : "rejected", { reason: error.message });
  }
}
function atomicReplace(root, target, before, afterBytes) {
  const path = projectPath(root, target); if (!sameImage(image(root, target), before)) throw new Error("neutral project state changed since planning");
  const temporary = join(dirname(path), `.${path.split(sep).at(-1)}.reconcile-${process.pid}-${Date.now()}`);
  durableWrite(temporary, afterBytes); renameSync(temporary, path); fsyncDirectory(dirname(path));
  if (!sameImage(image(root, target), present(afterBytes))) throw new Error("neutral project state readback failed");
}
/** Apply only an in-process, unchanged Result-path case-correction preview. */
export function applyProjectAuthorityStateReconciliation(plan, { rootDir = process.cwd(), activate = false } = {}) {
  const state = STATE_RECONCILE_PLANS.get(plan);
  if (!state || planSignature(plan) !== state.signature) return stateReconcileResult("rejected", { reason: "unauthenticated or changed plan" });
  if (!activate) return stateReconcileResult("activation-required", { reason: "explicit activation required" });
  try {
    const root = realRoot(rootDir); if (root !== state.root) throw new Error("apply root differs from the authenticated plan root");
    atomicReplace(root, state.target.path, state.target.before, state.target.afterBytes); STATE_RECONCILE_PLANS.delete(plan);
    return stateReconcileResult("applied", { target: state.target.path, correction: "result-path-case" });
  } catch (error) { return stateReconcileResult("rejected", { reason: error.message }); }
}

/** Read neutral authority first; legacy is a compatibility reader only. */
export function readProjectAuthority({ rootDir = process.cwd() } = {}) {
  try { return authority(realRoot(rootDir)); }
  catch { return { status: "invalid", reason: "project authority cannot be read" }; }
}

/** Create an exact, write-free legacy-to-neutral migration plan. */
export function planProjectAuthorityMigration({ rootDir = process.cwd() } = {}) {
  let root;
  try { root = realRoot(rootDir); } catch (error) { return result("invalid-root", { diagnostics: [error.message], targets: [] }); }
  try {
    const { transaction, journal } = transactionPaths(root);
    if (existsSync(transaction) || existsSync(journal)) return result("recovery-required", { diagnostics: ["project authority recovery is required"], targets: [] });
    const current = authority(root);
    if (current.status !== "ready") return result(current.status, { diagnostics: [current.reason], targets: [] });
    if (current.source === "neutral") return remember(result("noop", { source: "neutral", compatibility: "dual-read-one-write", targets: [] }), { root, status: "noop", targets: [] });
    const internalTargets = changedTargets(root);
    const publicTargets = internalTargets.map(({ path, kind, before, after, changed }) => ({ path, kind, before, after, changed }));
    return remember(result(publicTargets.some((target) => target.changed) ? "ready" : "noop", {
      source: "legacy", compatibility: "dual-read-one-write", targets: publicTargets,
      activation: { required: true, command: "apply --activate", legacyRetained: true },
    }), { root, status: publicTargets.some((target) => target.changed) ? "ready" : "noop", targets: internalTargets });
  } catch (error) { return result("invalid-source", { diagnostics: [error.message], targets: [] }); }
}
function validateBeforeApply(root, state) {
  if (authority(root).source !== "legacy") throw new Error("legacy source changed since planning");
  for (const target of state.targets) {
    if (!sameImage(image(root, target.path), target.before)) throw new Error(`neutral destination changed since planning: ${target.path}`);
    if (!sameImage(image(root, target.legacy), target.after)) throw new Error(`legacy source changed since planning: ${target.legacy}`);
  }
}
function prepare(root, targets) {
  const { transaction } = transactionPaths(root);
  if (existsSync(transaction)) throw new Error("project authority recovery is required");
  mkdirSync(transaction, { mode: 0o700 }); fsyncDirectory(root);
  const entries = [];
  try {
    for (const [index, target] of targets.entries()) {
      const stage = `stage-${index}`; const preimage = target.before.status === "present" ? `preimage-${index}` : null;
      durableWrite(join(transaction, stage), bytes(root, target.legacy));
      if (preimage) durableWrite(join(transaction, preimage), bytes(root, target.path));
      entries.push({ path: target.path, kind: target.kind, before: target.before, after: target.after, stage, preimage, displaced: preimage ? `displaced-${index}` : null, state: "staged" });
    }
    const journal = { schema: JOURNAL_SCHEMA, state: "prepared", targets: entries };
    durableJournal(root, journal); return journal;
  } catch (error) { rmSync(transaction, { recursive: true, force: true }); throw error; }
}
function commitTarget(root, journal, entry) {
  const { transaction } = transactionPaths(root); const destination = projectPath(root, entry.path);
  // The neutral layer may not exist yet.  It contains no authority bytes until
  // the already-journalled staged file is atomically renamed into it.
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 }); fsyncDirectory(dirname(destination));
  if (entry.before.status === "present") {
    journal.state = "applying"; entry.state = "displacing"; durableJournal(root, journal);
    renameSync(destination, join(transaction, entry.displaced)); fsyncDirectory(dirname(destination)); fsyncDirectory(transaction);
  }
  renameSync(join(transaction, entry.stage), destination); fsyncDirectory(dirname(destination)); fsyncDirectory(transaction);
  if (!sameImage(image(root, entry.path), entry.after)) throw new Error(`neutral write readback failed: ${entry.path}`);
  entry.state = "renamed"; durableJournal(root, journal);
}
function validateJournal(root, journal) {
  if (!journal || journal.schema !== JOURNAL_SCHEMA || !["prepared", "applying", "complete"].includes(journal.state) || !Array.isArray(journal.targets)) throw new Error("project authority journal is corrupt");
  if (journal.targets.length > TARGETS.length || new Set(journal.targets.map((entry) => entry.path)).size !== journal.targets.length) throw new Error("project authority journal has an invalid target boundary");
  const { transaction } = transactionPaths(root);
  for (const [index, entry] of journal.targets.entries()) {
    const expected = TARGETS[index];
    if (!expected || entry.path !== expected.path || entry.kind !== expected.kind || !["staged", "displacing", "renamed"].includes(entry.state)
      || !entry.before || !entry.after || !["present", "absent"].includes(entry.before.status) || entry.after.status !== "present"
      || !SHA256.test(entry.after.sha256) || !Number.isInteger(entry.after.byteLength)) throw new Error("project authority journal has an invalid target proof");
    if (entry.before.status === "present" && (!SHA256.test(entry.before.sha256) || !Number.isInteger(entry.before.byteLength) || !entry.preimage || !entry.displaced)) throw new Error("project authority journal has an invalid preimage proof");
    if (entry.before.status === "absent" && (entry.preimage !== null || entry.displaced !== null || entry.before.sha256 !== null || entry.before.byteLength !== 0)) throw new Error("project authority journal has an invalid absent preimage");
    const stage = join(transaction, entry.stage);
    if (entry.state !== "renamed" && (!existsSync(stage) || !sameImage(present(readFileSync(stage)), entry.after))) throw new Error("project authority staged proof is missing or corrupt");
    if (entry.before.status === "present" && (!existsSync(join(transaction, entry.preimage)) || !sameImage(present(readFileSync(join(transaction, entry.preimage))), entry.before))) throw new Error("project authority preimage proof is missing or corrupt");
    const destination = image(root, entry.path);
    if (!["staged", "displacing"].includes(entry.state) && !sameImage(destination, entry.after)) throw new Error("project authority target changed after interruption");
    if (entry.state === "displacing" && entry.before.status === "present" && !existsSync(join(transaction, entry.displaced))) throw new Error("project authority displaced proof is missing");
  }
}
function restore(root, journal) {
  const { transaction } = transactionPaths(root);
  journal.state = "applying"; durableJournal(root, journal);
  for (const entry of [...journal.targets].reverse()) {
    const destination = projectPath(root, entry.path); const actual = image(root, entry.path);
    if (entry.state === "staged") continue;
    if (entry.state === "displacing") {
      if (actual.status !== "absent") throw new Error(`destination changed during recovery: ${entry.path}`);
      renameSync(join(transaction, entry.displaced), destination); fsyncDirectory(dirname(destination));
      entry.state = "staged"; durableJournal(root, journal); continue;
    }
    if (!sameImage(actual, entry.after)) throw new Error(`destination changed during recovery: ${entry.path}`);
    if (entry.before.status === "absent") unlinkSync(destination);
    else {
      const quarantine = join(transaction, `rollback-${entry.stage}`);
      renameSync(destination, quarantine); renameSync(join(transaction, entry.displaced), destination); unlinkSync(quarantine);
    }
    fsyncDirectory(dirname(destination)); entry.state = "staged"; durableJournal(root, journal);
  }
  rmSync(transaction, { recursive: true, force: true }); fsyncDirectory(root);
}

export function applyProjectAuthorityMigration(plan, { rootDir = process.cwd(), activate = false, interruptAfterRename } = {}) {
  const state = authenticated(plan);
  if (!state) return result("rejected", { reason: "unauthenticated or changed plan" });
  if (state.status === "noop") return result("noop", { source: "neutral", targets: [] });
  if (!activate) return result("activation-required", { reason: "explicit activation required" });
  let root;
  try {
    root = realRoot(rootDir); if (root !== state.root) throw new Error("apply root differs from the authenticated plan root");
    const { transaction } = transactionPaths(root); if (existsSync(transaction)) throw new Error("project authority recovery is required");
    if (!authenticated(plan)) throw new Error("public plan changed since authentication");
    validateBeforeApply(root, state); const journal = prepare(root, state.targets);
    try {
      for (const [index, entry] of journal.targets.entries()) {
        commitTarget(root, journal, entry);
        if (interruptAfterRename?.({ index, target: entry.path })) throw new IntentionalInterruption(`interrupted after ${entry.path}`);
      }
      journal.state = "complete"; durableJournal(root, journal); rmSync(transaction, { recursive: true, force: true }); fsyncDirectory(root);
      const readback = authority(root); if (readback.status !== "ready" || readback.source !== "neutral") throw new Error("neutral authority readback failed");
      PLANS.delete(plan); return result("applied", { source: "neutral", targets: state.targets.map(({ path }) => path), legacyRetained: true });
    } catch (error) {
      if (error instanceof IntentionalInterruption) return result("interrupted", { reason: error.message });
      try { restore(root, journal); } catch (recoveryError) { return result("recovery-required", { reason: recoveryError.message }); }
      return result("rolled-back", { reason: error.message });
    }
  } catch (error) { return result("rejected", { reason: error.message }); }
}

/** Preview recovery only; it never writes or silently resumes a cutover. */
export function planPendingProjectAuthorityRecovery({ rootDir = process.cwd() } = {}) {
  let root;
  try { root = realRoot(rootDir); const { transaction, journal: journalPath } = transactionPaths(root);
    if (!existsSync(transaction)) return recoveryResult("none", { targets: [] });
    if (!existsSync(journalPath)) return recoveryResult("recovery-required", { diagnostics: ["transaction directory has no journal"], targets: [] });
    const raw = readFileSync(journalPath); const journal = JSON.parse(raw); validateJournal(root, journal);
    const plan = recoveryResult("ready", { transaction: { journalSha256: sha(raw), journalState: journal.state }, targets: journal.targets.map(({ path, kind, before, after, state }) => ({ path, kind, before, after, journalState: state, action: "restore-recorded-preimage" })) });
    RECOVERY_PLANS.set(plan, { root, signature: planSignature(plan), journalSha256: sha(raw) }); return plan;
  } catch (error) { return recoveryResult("recovery-required", { diagnostics: [error.message], targets: [] }); }
}
export function applyPendingProjectAuthorityRecovery(plan, { rootDir = process.cwd(), activate = false } = {}) {
  const state = RECOVERY_PLANS.get(plan);
  let authentic = false;
  try { authentic = Boolean(state && planSignature(plan) === state.signature); } catch { authentic = false; }
  if (!authentic) return recoveryResult("rejected", { reason: "unauthenticated or changed recovery plan" });
  if (!activate) return recoveryResult("activation-required", { reason: "explicit activation required" });
  try {
    const root = realRoot(rootDir); if (root !== state.root) throw new Error("recovery root differs from the authenticated plan root");
    const { journal: journalPath } = transactionPaths(root); const raw = readFileSync(journalPath);
    if (sha(raw) !== state.journalSha256) throw new Error("recovery journal changed since preview");
    const journal = JSON.parse(raw); validateJournal(root, journal); restore(root, journal); RECOVERY_PLANS.delete(plan);
    return recoveryResult("recovered", { restored: journal.targets.map(({ path }) => path) });
  } catch (error) { return recoveryResult("rejected", { reason: error.message }); }
}
