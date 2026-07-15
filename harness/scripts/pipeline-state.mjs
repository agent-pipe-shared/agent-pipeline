#!/usr/bin/env node
/**
 * pipeline-state.mjs -- the ONLY sanctioned writer for `.claude/pipeline-state.json`
 * (schema `pipeline.state.v0`).
 *
 * WHY THIS FILE EXISTS
 *   The Dev-Plan-Gate (guard-devplan.mjs) and the Push-Gate (guard-push.mjs) need a
 *   deterministic, git-committed record of "has the PO's plan approval already been
 *   recorded" and "was the push approved for THIS commit" -- not a chat memory, not a
 *   free-hand edit of the state file (which would be exactly the kind of silent,
 *   unauditable state change the whole gate exists to prevent). This CLI is the single
 *   choke point: every state transition is one subcommand, one audit-friendly JSON
 *   write, pretty-printed and meant to be git-committed (same audit-trail philosophy
 *   as `.claude/guard-override.log.jsonl`).
 *
 * SCHEMA (`pipeline.state.v0`) -- the file this CLI reads/writes:
 *   {
 *     "schema": "pipeline.state.v0",
 *     "activeFeature": { "id": "<string>", "planPath": "<string>", "phase": "<string>" } | absent,
 *     "planApproved": true | false,
 *     "planApproval": { "approvedBy": "<string>", "approvedAt": "<ISO-8601>" } | absent,
 *     "planRevocation": { "revokedBy": "<string>", "revokedAt": "<ISO-8601>" } | absent,
 *     "pushApproval": {
 *       "lastApproved": { "approvedBy": "<string>", "approvedAt": "<ISO-8601>", "forCommit": "<sha>" }
 *     } | absent,
 *     "closedFeatures": [
 *       { "id": "<string>", "planPath": "<string>", "phaseAtClose": "<string>|null",
 *         "closedAt": "<ISO-8601>", "closedBy": "<string>", "forCommit": "<sha>|null" }
 *     ] | absent,
 *     "deployApprovals": [
 *       { "forArtifact": "<tag-or-sha>", "forEnvironment": "<env>", "approvedBy": "<string>",
 *         "approvedAt": "<ISO-8601>", "usedAt": "<ISO-8601>"? }
 *     ] | absent,
 *     "continuity": <closed pipeline.continuity.v0 object> | absent,
 *     "updatedAt": "<ISO-8601>"
 *   }
 *   Every field beyond `schema` is optional -- consumers (the two gate hooks) treat an
 *   absent field the same as "not yet set" (fail-open per their own contracts).
 *
 *   `deployApprovals` (Release/Promotion phase): a LIST, NOT a single overwritable slot
 *   like `pushApproval` -- a slot would silently clobber an unconsumed approval for a
 *   different environment/artifact. Keyed by {forArtifact, forEnvironment}; consumed on
 *   use (`usedAt` set). The consuming READER is `guard-push.mjs`'s deploy branch, which
 *   is READ-ONLY against this field by family convention -- it never sets `usedAt`
 *   itself; marking consumption is this CLI's `consume-deploy` subcommand, run by the
 *   agent immediately after the triggering push succeeds. Additive within
 *   `pipeline.state.v0` -- no schema-id bump, same additive-optional discipline as
 *   every other field here.
 *
 *   DEVIATION NOTE (declared during the F1 fix, commit 1c0a181 -- see the `set-feature`/
 *   `set-phase` entries below for that fix itself, which moved `phase` INSIDE
 *   `activeFeature`): `planApproved` lives TOP-LEVEL, deliberately -- ADR-0027
 *   (`docs/adr/0027-gate-philosophy.md`, line ~15, translated: "...as long as an active
 *   feature (`activeFeature`) does not yet carry `planApproved: true`") reads as though
 *   `planApproved` sat INSIDE `activeFeature`; the plan sketch itself
 *   (`.claude/plans/2026-07-07-ap1-pipeline-tuning.md`) never says that -- it only
 *   names `planApproved`, without specifying placement. Unlike `phase`, `planApproved`
 *   is NOT being moved: all shipped readers (guard-devplan.mjs: `state.planApproved`)
 *   and every test fixture (guard-devplan.test.mjs, this file's own PS-suite) already
 *   depend on the top-level shape -- moving it now would recreate the exact
 *   writer/reader schema drift the F1 fix eliminated for `phase`, just in the opposite
 *   direction (there, the shipped writer was the deviant; here, the ADR-0027 WORDING
 *   is the deviant, and the wording loses).
 *
 * SUBCOMMANDS (argv[0])
 *   set-feature   --id <id> --plan-path <path>   Sets activeFeature={id,planPath,
 *                                                 phase:"design"}, planApproved=false.
 *                                                 Clears any prior planApproval/
 *                                                 planRevocation (a NEW feature starts
 *                                                 with a clean approval slate).
 *   set-phase     --phase <name>                 Sets activeFeature.phase=<name>.
 *                                                 Leaves everything else untouched
 *                                                 (F1 fix: phase lives INSIDE
 *                                                 activeFeature -- see stop-suggest.mjs,
 *                                                 which reads activeFeature.phase).
 *   approve-plan  --by <name>                     Sets planApproved=true, records
 *                                                 planApproval={approvedBy,approvedAt}.
 *                                                 Clears any prior planRevocation.
 *   revoke-plan   --by <name>                     Sets planApproved=false, records
 *                                                 planRevocation={revokedBy,revokedAt}.
 *   approve-push  --by <name>                     Records pushApproval.lastApproved =
 *                                                 {approvedBy, approvedAt, forCommit}
 *                                                 where forCommit is the CURRENT HEAD
 *                                                 (`git rev-parse HEAD`, spawned in the
 *                                                 target project dir).
 *   close-feature --by <name>                     Closes the current activeFeature:
 *                                                 appends {id, planPath, phaseAtClose,
 *                                                 closedAt, closedBy, forCommit} to
 *                                                 closedFeatures (existing entries kept,
 *                                                 append-only), deletes activeFeature,
 *                                                 sets planApproved=false, clears
 *                                                 planApproval/planRevocation.
 *                                                 pushApproval is left untouched. No
 *                                                 activeFeature present -> refused (English
 *                                                 error, exit 2, nothing written). Likewise
 *                                                 refused (F2 hardening): a blank
 *                                                 activeFeature.id/planPath, or an existing
 *                                                 closedFeatures that is present but NOT an
 *                                                 array (malformed -- never silently replaced
 *                                                 with []). See the forCommit DEVIATION note
 *                                                 in RULES below -- unlike approve-push, a git
 *                                                 failure here is NOT fatal. With active
 *                                                 continuity it additionally requires
 *                                                 --continuity-close-request <repo-relative-json>
 *                                                 bound to the exact close-head revision and
 *                                                 byte-verified Result/close-evidence files.
 *   approve-deploy --env <environment> --artifact <tag-or-sha> --by <name>
 *                                                 Appends a record {forArtifact,
 *                                                 forEnvironment, approvedBy, approvedAt}
 *                                                 to deployApprovals. Artifact is ALWAYS
 *                                                 explicit -- never auto-detected from
 *                                                 HEAD (build-once-promote rejects HEAD
 *                                                 binding). Refuses blank
 *                                                 --env/--artifact/--by, and a
 *                                                 pre-existing deployApprovals that is
 *                                                 present but NOT an array (malformed --
 *                                                 never silently replaced).
 *   consume-deploy --env <env> --artifact <ref> --by <name>
 *                                                 Sets `usedAt` on the matching
 *                                                 UNCONSUMED deployApprovals record
 *                                                 ({forArtifact, forEnvironment} match).
 *                                                 Fails LOUDLY (exit 2, nothing written)
 *                                                 if no matching record exists, or the
 *                                                 only match is already consumed -- never
 *                                                 a silent no-op (a silent success would
 *                                                 mask a broken runbook). Refuses blanks.
 *   clear-deploy   --env <env> [--artifact <ref>] --by <name>
 *                                                 Removes PENDING (unconsumed)
 *                                                 deployApprovals for the env (optionally
 *                                                 narrowed to one artifact) -- housekeeping
 *                                                 for approvals granted in error or
 *                                                 abandoned artifacts. Fails loudly if it
 *                                                 matches nothing. Refuses blank
 *                                                 --env/--by (--artifact stays optional).
 *   continuity-init|continuity-cas|continuity-integrate-final|
 *   continuity-apply-decision|continuity-clear-decision
 *                  --expected-revision <absent|integer>
 *                  --request-file <repo-relative-json>
 *                  --lock-token <opaque-token>
 *                                                 Coordinator-only continuity
 *                                                 transitions. `init` alone accepts
 *                                                 `absent`; every later transition
 *                                                 binds the exact persisted revision.
 *                                                 The request envelope is closed and
 *                                                 validated by continuity-state.mjs.
 *                                                 Accepted passive/duplicate outcomes
 *                                                 exit 0 with zero mutation.
 *
 * RULES (all seven `--by`-taking subcommands: approve-plan/revoke-plan/approve-push/
 * close-feature/approve-deploy/consume-deploy/clear-deploy)
 *   - `--by` MUST be present and non-blank -- REFUSED otherwise (English error, exit 2,
 *     nothing written). An unattributed approval/revocation would be exactly the kind
 *     of unauditable state change this CLI exists to prevent.
 *   - A pre-existing state file that is NOT valid JSON, NOT a JSON object, or carries
 *     a `schema` field other than "pipeline.state.v0" is treated as MALFORMED: the CLI
 *     refuses to write ANYTHING (clear English error, exit 2) -- NEVER a silent
 *     overwrite of data that might still matter. Fix or deliberately delete the file
 *     first (same "the guard binds agents, not humans" escape hatch as the git-guard
 *     family: the PO can always edit/delete the file directly, outside this CLI).
 *   - Timestamps are ISO-8601 (`Date.prototype.toISOString()`).
 *   - The file is written pretty-printed (`JSON.stringify(..., null, 2)` + trailing
 *     newline) and is meant to be git-committed by design -- it IS the audit trail
 *     (mirrors `.claude/guard-override.log.jsonl`'s philosophy: state changes belong
 *     in history, not just on disk).
 *   - Continuity writes additionally use an adjacent exclusive lock, a caller token
 *     plus internal ownership nonce, same-token-only stale recovery, a same-directory
 *     exclusive temp, file fsync, ownership re-check, atomic rename and directory
 *     fsync where supported. Foreign locks are never stolen. This serializes the
 *     Coordinator writer; it does not attest OS caller identity. Lock and recovery
 *     records are fully synced before exclusive hard-link publication. An interrupted
 *     recovery guard fails closed for explicit disposition instead of admitting a
 *     second recovery owner.
 *   - `set-feature` refuses to replace any active continuity feature. Only the
 *     revision/evidence-bound `close-feature` path removes continuity, and its exact
 *     request remains in the append-only closedFeatures audit entry.
 *   - All CLI user-facing output (stdout confirmations, stderr errors) is English.
 *   - DEVIATION (close-feature only, declared deliberately): unlike approve-push, a failed
 *     `git rev-parse HEAD` is NOT fatal for close-feature -- forCommit is set to `null`, a
 *     warning goes to stderr, and the close still writes and exits 0. Rationale: for
 *     approve-push, forCommit IS the gate payload (the entire point of that command); for
 *     close-feature it is audit metadata on a cleanup action -- a transient git failure must
 *     not block a feature from closing.
 *
 * PATH LOOKUP (same convention as the guard family -- guard-git.mjs/guard-testpath.mjs):
 *   `$CLAUDE_PROJECT_DIR/.claude/pipeline-state.json`, falling back to
 *   `process.cwd()/.claude/pipeline-state.json` when the env var is unset (the normal
 *   case for a human/Goldfish running this CLI directly from the repo root).
 *
 * EXIT CODES: 0 = written / success. 2 = refused (bad usage, malformed pre-existing
 * file, `git rev-parse HEAD` failed for `approve-push`, no `activeFeature` for
 * `close-feature`, a blank `activeFeature.id`/`planPath`, a non-array pre-existing
 * `closedFeatures`, a non-array pre-existing `deployApprovals`, or -- `consume-deploy`/
 * `clear-deploy` only -- no matching {env, artifact} record to act on) -- nothing
 * written. Note: a `git rev-parse HEAD` failure during close-feature does NOT produce
 * exit 2 -- see the DEVIATION note in RULES above.
 *
 * VERIFY: node harness/scripts/pipeline-state.test.mjs (this file's own behavior
 * suite, standalone-runnable; exit 0 = all cases pass). Running this CLI directly
 * without a subcommand exits 2 (usage error) -- see guard-devplan.test.mjs /
 * guard-push.test.mjs for the two hooks' own consumer-side coverage of this schema.
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  ftruncateSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyDecisionSelection,
  clearDecisionSelection,
  compareAndSwapContinuity,
  integrateContinuityFinal,
  validateContinuityState,
} from "../../plugins/pipeline-core/lib/continuity-state.mjs";

export const SCHEMA_ID = "pipeline.state.v0";
export const CONTINUITY_LOCK_SCHEMA_ID = "pipeline.continuity-lock.v0";
export const CONTINUITY_LOCK_STALE_MS = 30_000;
const CONTINUITY_REQUEST_MAX_BYTES = 32_768;
const CONTINUITY_RESULT_MAX_BYTES = 1_048_576;
const FINAL_INTEGRATION_MAX_BYTES = 8_192;
const POST_RESULT_SENTINEL = "$POST_RESULT_SHA256";
const NEXT_TRANSITION_KEYS = new Set(["queueHead", "blocker", "resume", "recovery", "decisionTxn", "capacity"]);
const RESULT_BINDING_KEYS = new Set(["path", "preResultSha256"]);
const FINAL_ENTRY_KEYS = new Set([
  "integrationId", "identity", "finalDigest", "finalOutcome", "preResultSha256",
  "nextTransition", "nextTransitionSha256", "integratedRevision",
]);
const CONTINUITY_SUBCOMMANDS = new Set([
  "continuity-init",
  "continuity-cas",
  "continuity-integrate-final",
  "continuity-apply-decision",
  "continuity-clear-decision",
]);
const LOCK_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const LEGACY_WRITER_LOCK_TOKEN = "pipeline-legacy-writer-v0";

/** Resolves the target project dir: $CLAUDE_PROJECT_DIR, else process.cwd(). */
export function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/** Path to the state file under a given project dir. */
export function statePath(dir = projectDir()) {
  return join(dir, ".claude", "pipeline-state.json");
}

/**
 * Reads the state file. Never throws.
 * Returns one of:
 *   { status: "absent" }
 *   { status: "ok", state }
 *   { status: "malformed", error: "<English reason>" }
 */
export function readState(dir = projectDir()) {
  const p = statePath(dir);
  let raw;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    return { status: "absent" };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { status: "malformed", error: `invalid JSON (${e.message})` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "malformed", error: "content is not a top-level JSON object" };
  }
  if (parsed.schema !== undefined && parsed.schema !== SCHEMA_ID) {
    return { status: "malformed", error: `unknown schema "${parsed.schema}" (expected "${SCHEMA_ID}")` };
  }
  return { status: "ok", state: parsed };
}

function writeState(dir, state, expectedState) {
  const lock = acquireContinuityLock(dir, LEGACY_WRITER_LOCK_TOKEN);
  if (!lock.ok) return { ok: false, committed: false, code: lock.code };
  try {
    const observed = readState(dir);
    const observedBase = observed.status === "ok" ? observed.state : observed.status === "absent" ? { schema: SCHEMA_ID } : null;
    if (observedBase === null || JSON.stringify(observedBase) !== JSON.stringify(expectedState)) {
      return { ok: false, committed: false, code: "PS-STATE-STALE" };
    }
    if (state.continuity !== undefined) {
      const valid = validateContinuityState(state.continuity, state.activeFeature?.id);
      if (!valid.ok
        || (expectedState.continuity !== undefined
          && state.continuity.revision !== expectedState.continuity.revision)) {
        return { ok: false, committed: false, code: "PS-STATE-CONTINUITY" };
      }
    }
    return atomicWriteContinuityState(dir, state, lock);
  } finally {
    releaseContinuityLock(lock);
  }
}

function stateWriteSucceeded(result) {
  if (result.ok) return true;
  if (result.committed) {
    console.error(`Error: state replacement committed, but durability is indeterminate (${result.code}); mutation is NOT reported as zero.`);
  } else if (result.committed === null) {
    console.error(`Error: state replacement disposition is indeterminate (${result.code}); inspect persisted state before retry.`);
  } else {
    console.error(`Error: serialized state write failed before commit (${result.code}); zero mutation.`);
  }
  return false;
}

/** Adjacent continuity lock path. It is transient and must never be committed. */
export function continuityLockPath(dir = projectDir()) {
  return `${statePath(dir)}.lock`;
}

function lockRecoveryPath(dir = projectDir()) {
  return `${continuityLockPath(dir)}.recover`;
}

function canonicalLockRecord(record) {
  return JSON.stringify(record) + "\n";
}

function parseLockRecord(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 4 || !keys.every((key) => ["schema", "token", "ownerNonce", "acquiredAtMs"].includes(key))) return null;
  if (value.schema !== CONTINUITY_LOCK_SCHEMA_ID
    || !LOCK_TOKEN_RE.test(value.token)
    || !LOCK_TOKEN_RE.test(value.ownerNonce)
    || !Number.isSafeInteger(value.acquiredAtMs)
    || value.acquiredAtMs < 0) return null;
  return value;
}

function replaceFdContents(fd, text) {
  const bytes = Buffer.from(text, "utf8");
  ftruncateSync(fd, 0);
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset);
  fsyncSync(fd);
}

function safeUnlink(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function syncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    fsyncSync(fd);
    return { ok: true, supported: true };
  } catch (error) {
    if (["EINVAL", "ENOTSUP", "EBADF", "EPERM", "EISDIR"].includes(error?.code)) {
      return { ok: true, supported: false };
    }
    return { ok: false, supported: true };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function publishExclusiveRecord(path, record, directory) {
  const candidate = `${path}.candidate.${record.ownerNonce}`;
  let fd;
  let linked = false;
  try {
    fd = openSync(candidate, "wx", 0o600);
    replaceFdContents(fd, canonicalLockRecord(record));
    closeSync(fd);
    fd = undefined;
    linkSync(candidate, path);
    linked = true;
    const synced = syncDirectory(directory);
    return synced.ok
      ? { ok: true, code: "PS-CONTINUITY-LOCK-PUBLISHED" }
      : { ok: false, code: "PS-CONTINUITY-LOCK-PUBLISHED-DURABILITY-UNKNOWN", committed: true };
  } catch (error) {
    return { ok: false, code: error?.code === "EEXIST" ? "PS-CONTINUITY-LOCKED" : "PS-CONTINUITY-LOCK-IO", committed: linked };
  } finally {
    if (fd !== undefined) closeSync(fd);
    safeUnlink(candidate);
  }
}

function acquireRecoveryGuard(dir, record) {
  const path = lockRecoveryPath(dir);
  const published = publishExclusiveRecord(path, record, join(dir, ".claude"));
  return published.ok ? { ok: true, path, ...record } : published;
}

function releaseRecoveryGuard(guard) {
  if (!guard?.ok) return false;
  let current;
  try {
    current = parseLockRecord(readFileSync(guard.path, "utf8"));
  } catch {
    return false;
  }
  if (!current || current.token !== guard.token || current.ownerNonce !== guard.ownerNonce) return false;
  try {
    unlinkSync(guard.path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire an exclusive continuity writer lock. A stale lock may be recovered
 * only by the same caller-supplied token. A new internal nonce prevents the old
 * owner from releasing the recovered lock.
 */
export function acquireContinuityLock(dir, token, deps = {}) {
  if (!LOCK_TOKEN_RE.test(token ?? "")) return { ok: false, code: "PS-CONTINUITY-LOCK-TOKEN" };
  const claudeDir = join(dir, ".claude");
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
  const path = continuityLockPath(dir);
  const nowMs = deps.nowMs ?? Date.now;
  const staleMs = deps.lockStaleMs ?? CONTINUITY_LOCK_STALE_MS;
  const ownerNonce = deps.ownerNonce?.() ?? randomUUID();
  if (!LOCK_TOKEN_RE.test(ownerNonce)) return { ok: false, code: "PS-CONTINUITY-LOCK-NONCE" };
  const acquiredAtMs = nowMs();
  const record = { schema: CONTINUITY_LOCK_SCHEMA_ID, token, ownerNonce, acquiredAtMs };

  if (existsSync(lockRecoveryPath(dir))) return { ok: false, code: "PS-CONTINUITY-RECOVERY-IN-PROGRESS" };
  const published = publishExclusiveRecord(path, record, claudeDir);
  if (published.ok) {
    return { ok: true, code: "PS-CONTINUITY-LOCKED", path, token, ownerNonce, recovered: false };
  }
  if (published.code !== "PS-CONTINUITY-LOCKED") return published;

  let observed;
  try {
    observed = parseLockRecord(readFileSync(path, "utf8"));
  } catch {
    return { ok: false, code: "PS-CONTINUITY-LOCKED" };
  }
  const ageMs = observed ? acquiredAtMs - observed.acquiredAtMs : -1;
  if (!observed || observed.token !== token || ageMs < staleMs) {
    return { ok: false, code: "PS-CONTINUITY-LOCKED" };
  }

  const recoveryGuard = acquireRecoveryGuard(dir, record);
  if (!recoveryGuard.ok) return recoveryGuard;
  let recoveryComplete = false;

  try {
    const current = parseLockRecord(readFileSync(path, "utf8"));
    const currentAgeMs = current ? acquiredAtMs - current.acquiredAtMs : -1;
    if (!current
      || current.token !== token
      || current.ownerNonce !== observed.ownerNonce
      || currentAgeMs < staleMs) return { ok: false, code: "PS-CONTINUITY-LOCKED" };
    unlinkSync(path);
    const recovered = publishExclusiveRecord(path, record, claudeDir);
    if (!recovered.ok) return recovered;
    safeUnlink(`${statePath(dir)}.tmp.${observed.ownerNonce}`);
    recoveryComplete = true;
  } catch {
    return { ok: false, code: "PS-CONTINUITY-LOCK-IO" };
  } finally {
    if (recoveryComplete) releaseRecoveryGuard(recoveryGuard);
  }
  return { ok: true, code: "PS-CONTINUITY-LOCK-RECOVERED", path, token, ownerNonce, recovered: true };
}

/** Release only a lock whose caller token and internal nonce both still match. */
export function releaseContinuityLock(lock) {
  if (!lock?.ok) return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP" };
  let current;
  try {
    current = parseLockRecord(readFileSync(lock.path, "utf8"));
  } catch {
    return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP" };
  }
  if (!current || current.token !== lock.token || current.ownerNonce !== lock.ownerNonce) {
    return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP" };
  }
  try {
    unlinkSync(lock.path);
    return { ok: true, code: "PS-CONTINUITY-UNLOCKED" };
  } catch {
    return { ok: false, code: "PS-CONTINUITY-LOCK-IO" };
  }
}

function assertContinuityLockOwned(lock) {
  const current = parseLockRecord(readFileSync(lock.path, "utf8"));
  return current !== null && current.token === lock.token && current.ownerNonce === lock.ownerNonce;
}

/** Same-directory temp + file sync + ownership check + rename + directory sync. */
export function atomicWriteContinuityState(dir, state, lock, deps = {}) {
  const target = statePath(dir);
  const tmp = `${target}.tmp.${lock.ownerNonce}`;
  const text = JSON.stringify(state, null, 2) + "\n";
  let fd;
  let renamed = false;
  try {
    if (!assertContinuityLockOwned(lock)) return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP" };
    fd = openSync(tmp, "wx", 0o600);
    (deps.replaceStateFdContents ?? replaceFdContents)(fd, text);
    closeSync(fd);
    fd = undefined;
    if (!assertContinuityLockOwned(lock)) return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP" };
    (deps.renameSync ?? renameSync)(tmp, target);
    renamed = true;
    const synced = deps.syncDirectory?.(join(dir, ".claude")) ?? syncDirectory(join(dir, ".claude"));
    if (!synced.ok) {
      return { ok: false, committed: true, code: "PS-CONTINUITY-COMMITTED-DURABILITY-UNKNOWN" };
    }
    return { ok: true, committed: true, code: "PS-CONTINUITY-WRITTEN", directorySyncSupported: synced.supported };
  } catch {
    try {
      if (readFileSync(target, "utf8") === text) {
        return { ok: false, committed: true, code: "PS-CONTINUITY-COMMITTED-DURABILITY-UNKNOWN" };
      }
    } catch { /* disposition remains unknown */ }
    return renamed
      ? { ok: false, committed: null, code: "PS-CONTINUITY-COMMIT-INDETERMINATE" }
      : { ok: false, committed: false, code: "PS-CONTINUITY-WRITE-IO" };
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (!renamed) safeUnlink(tmp);
  }
}

function safeRequestFile(dir, requestFile) {
  if (typeof requestFile !== "string" || requestFile.length < 1 || requestFile.length > 240
    || isAbsolute(requestFile) || requestFile.includes("\\") || requestFile.includes("\0")) return null;
  const parts = requestFile.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  const candidate = resolve(dir, requestFile);
  const rel = relative(resolve(dir), candidate);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return null;
  try {
    const stat = lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > CONTINUITY_REQUEST_MAX_BYTES) return null;
    const real = realpathSync(candidate);
    const realRel = relative(realpathSync(dir), real);
    return realRel !== "" && !realRel.startsWith(`..${sep}`) && realRel !== ".." && !isAbsolute(realRel) ? real : null;
  } catch {
    return null;
  }
}

function readContinuityRequest(dir, requestFile) {
  const path = safeRequestFile(dir, requestFile);
  if (path === null) return { ok: false, code: "PS-CONTINUITY-REQUEST-FILE" };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, code: "PS-CONTINUITY-REQUEST" };
  } catch {
    return { ok: false, code: "PS-CONTINUITY-REQUEST" };
  }
}

function hashBoundRepoFile(dir, binding, maxBytes = 1_048_576) {
  if (!exactObjectKeys(binding, ["path", "sha256"])
    || typeof binding.path !== "string"
    || binding.path.length < 1
    || binding.path.length > 240
    || !SHA256_RE.test(binding.sha256)
    || isAbsolute(binding.path)
    || binding.path.includes("\\")
    || binding.path.includes("\0")) return false;
  const parts = binding.path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
  const candidate = resolve(dir, binding.path);
  try {
    const stat = lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maxBytes) return false;
    const real = realpathSync(candidate);
    const realRel = relative(realpathSync(dir), real);
    if (realRel === "" || realRel === ".." || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) return false;
    return createHash("sha256").update(readFileSync(real)).digest("hex") === binding.sha256;
  } catch {
    return false;
  }
}

function validateContinuityCloseRequest(dir, base, request) {
  const continuity = base.continuity;
  if (!exactObjectKeys(request, ["schema", "featureId", "expectedRevision", "result", "closeEvidence"])
    || request.schema !== "pipeline.continuity-close.v0"
    || request.featureId !== base.activeFeature?.id
    || !Number.isSafeInteger(request.expectedRevision)
    || request.expectedRevision !== continuity?.revision
    || continuity.queueHead?.nextAction !== "close"
    || continuity.queueHead?.dispatch !== null
    || continuity.blocker !== null
    || continuity.decisionTxn !== null
    || continuity.authority.result === null
    || !exactObjectKeys(request.result, ["path", "sha256"])
    || request.result.path !== continuity.authority.result.path
    || request.result.sha256 !== continuity.authority.result.sha256
    || !hashBoundRepoFile(dir, request.result)
    || !hashBoundRepoFile(dir, request.closeEvidence)) return false;
  return validateContinuityState(continuity, base.activeFeature.id).ok;
}

function parseExpectedRevision(raw, allowAbsent = false) {
  if (allowAbsent && raw === "absent") return { ok: true, value: "absent" };
  if (!/^(0|[1-9][0-9]*)$/.test(raw ?? "")) return { ok: false };
  const value = Number(raw);
  return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false };
}

function exactObjectKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left, right) {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("unsafe number");
    return String(value);
  }
  if (typeof value === "string") {
    if (!/^[A-Za-z0-9$][A-Za-z0-9._:/$-]{0,511}$/.test(value)) throw new Error("unsafe string");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value === null || typeof value !== "object") throw new Error("unsupported value");
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

/* JSON parser used for the authority block. JSON.parse silently accepts duplicate
 * keys, so the Result codec owns this small closed parser and records the exact
 * finalIntegrations token/entry ranges needed for byte-preserving splices. */
function parseResultJsonStrict(source) {
  let i = 0;
  let arrayRange = null;
  let entryRanges = [];
  const ws = () => { while (i < source.length && /[ \t\n]/.test(source[i])) i++; };
  const string = () => {
    if (source[i] !== '"') throw new Error("string expected");
    const start = i++;
    while (i < source.length) {
      const ch = source[i++];
      if (ch === '"') return JSON.parse(source.slice(start, i));
      if (ch === "\\") {
        const esc = source[i++];
        if (esc === "u") {
          if (!/^[a-fA-F0-9]{4}$/.test(source.slice(i, i + 4))) throw new Error("bad escape");
          i += 4;
        } else if (!'"\\/bfnrt'.includes(esc ?? "")) throw new Error("bad escape");
      } else if (ch.charCodeAt(0) < 0x20) throw new Error("control character");
    }
    throw new Error("unterminated string");
  };
  const value = (path = []) => {
    ws();
    if (source[i] === '"') return string();
    if (source[i] === "{") {
      i++;
      const out = {};
      const seen = new Set();
      ws();
      if (source[i] === "}") { i++; return out; }
      while (true) {
        ws();
        const key = string();
        if (seen.has(key)) throw new Error("duplicate key");
        seen.add(key);
        ws();
        if (source[i++] !== ":") throw new Error("colon expected");
        ws();
        const childStart = i;
        out[key] = value([...path, key]);
        const childEnd = i;
        if (path.length === 0 && key === "finalIntegrations") {
          if (!Array.isArray(out[key])) throw new Error("finalIntegrations must be array");
          arrayRange = { start: childStart, end: childEnd };
        }
        ws();
        const separator = source[i++];
        if (separator === "}") return out;
        if (separator !== ",") throw new Error("comma expected");
      }
    }
    if (source[i] === "[") {
      const isFinal = path.length === 1 && path[0] === "finalIntegrations";
      i++;
      const out = [];
      const ranges = [];
      ws();
      if (source[i] === "]") { i++; if (isFinal) entryRanges = ranges; return out; }
      while (true) {
        ws();
        const start = i;
        out.push(value([...path, String(out.length)]));
        const end = i;
        ranges.push({ start, end });
        ws();
        const separator = source[i++];
        if (separator === "]") { if (isFinal) entryRanges = ranges; return out; }
        if (separator !== ",") throw new Error("comma expected");
      }
    }
    const tail = source.slice(i);
    const literal = /^(true|false|null)/.exec(tail);
    if (literal) {
      i += literal[0].length;
      return literal[0] === "true" ? true : literal[0] === "false" ? false : null;
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(tail);
    if (!number) throw new Error("value expected");
    i += number[0].length;
    const parsed = Number(number[0]);
    if (!Number.isFinite(parsed) || (Number.isInteger(parsed) && !Number.isSafeInteger(parsed))) throw new Error("unsafe number");
    return parsed;
  };
  const parsed = value();
  ws();
  if (i !== source.length || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
    || arrayRange === null) throw new Error("invalid result root");
  return { parsed, arrayRange, entryRanges };
}

const POST_RESULT_SENTINEL_PATHS = new Set([
  "queueHead.dispatch.authorityDigests.resultSha256",
]);

function sentinelPositionsAreClosed(value, path = []) {
  if (value === POST_RESULT_SENTINEL) return POST_RESULT_SENTINEL_PATHS.has(path.join("."));
  if (Array.isArray(value)) {
    return value.every((child, index) => sentinelPositionsAreClosed(child, [...path, String(index)]));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).every(([key, child]) => sentinelPositionsAreClosed(child, [...path, key]));
  }
  return true;
}

/* A historical Result entry is authority, not an opaque checksum tuple. Rebuild a
 * complete continuity state at the integrated revision and pass it through the
 * canonical closed-schema validator. The synthetic Result path is recoverable from
 * a decision brief when present; all other synthetic fields are fixed and inert. */
function validHistoricalFinalSemantics(entry) {
  const nextDispatch = entry.nextTransition?.queueHead?.dispatch ?? null;
  if (entry.integratedRevision !== entry.identity?.queueRevision + 1
    || entry.identity?.authorityDigests?.resultSha256 !== entry.preResultSha256
    || !sentinelPositionsAreClosed(entry.nextTransition)
    || (nextDispatch !== null
      && nextDispatch.authorityDigests?.resultSha256 !== POST_RESULT_SENTINEL)
    || (entry.finalOutcome === "failed" && entry.nextTransition?.blocker === null)) return false;
  const materialized = replaceSentinel(entry.nextTransition, "0".repeat(64));
  const resultPath = materialized.blocker?.decisionBrief?.resultPath ?? "Result.md";
  const synthetic = {
    schema: "pipeline.continuity.v0",
    featureId: entry.identity.featureId,
    revision: entry.integratedRevision,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: {
      prd: { path: "PRD.md", sha256: entry.identity.authorityDigests.prdSha256 },
      spec: { path: "Spec.md", sha256: entry.identity.authorityDigests.specSha256 },
      result: { path: resultPath, sha256: "0".repeat(64) },
    },
    queueHead: materialized.queueHead,
    blocker: materialized.blocker,
    acknowledgedFinal: {
      identity: entry.identity,
      resultDigest: entry.finalDigest,
      finalOutcome: entry.finalOutcome,
      integratedRevision: entry.integratedRevision,
    },
    resume: materialized.resume,
    recovery: materialized.recovery,
    decisionTxn: materialized.decisionTxn,
    capacity: materialized.capacity,
  };
  return validateContinuityState(synthetic, entry.identity.featureId).ok;
}

function validateFinalEntry(entry, raw) {
  try {
    if (!exactObjectKeys(entry, [...FINAL_ENTRY_KEYS])
      || !entry.integrationId?.startsWith("fi-")
      || entry.integrationId.length !== 67
      || !SHA256_RE.test(entry.integrationId.slice(3))
      || !SHA256_RE.test(entry.finalDigest)
      || !SHA256_RE.test(entry.preResultSha256)
      || !SHA256_RE.test(entry.nextTransitionSha256)
      || !new Set(["succeeded", "failed"]).has(entry.finalOutcome)
      || !Number.isSafeInteger(entry.integratedRevision)
      || !exactObjectKeys(entry.nextTransition, [...NEXT_TRANSITION_KEYS])
      || Buffer.byteLength(raw, "utf8") > FINAL_INTEGRATION_MAX_BYTES
      || canonicalJson(entry) !== raw
      || sha256Bytes(canonicalJson(entry.nextTransition)) !== entry.nextTransitionSha256
      || !validHistoricalFinalSemantics(entry)) return false;
    const tuple = {
      identity: entry.identity,
      finalDigest: entry.finalDigest,
      finalOutcome: entry.finalOutcome,
      preResultSha256: entry.preResultSha256,
      nextTransitionSha256: entry.nextTransitionSha256,
    };
    return entry.integrationId === `fi-${sha256Bytes(canonicalJson(tuple))}`;
  } catch {
    return false;
  }
}

function resolveResultPathWithoutSymlinks(dir, relativePath) {
  const root = realpathSync(dir);
  let current = root;
  const parts = relativePath.split("/");
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()
      || (index < parts.length - 1 && !stat.isDirectory())
      || (index === parts.length - 1 && !stat.isFile())) return null;
    const real = realpathSync(current);
    const rel = relative(root, real);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)
      || real !== current) return null;
  }
  return { root, path: current, parent: dirname(current), relativePath };
}

function readResultAuthority(dir, binding) {
  if (!exactObjectKeys(binding, [...RESULT_BINDING_KEYS])
    || !SHA256_RE.test(binding.preResultSha256 ?? "")
    || typeof binding.path !== "string" || binding.path.length < 1 || binding.path.length > 240
    || isAbsolute(binding.path) || binding.path.includes("\\") || binding.path.includes("\0")
    || binding.path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return { ok: false, code: "PS-CONTINUITY-RESULT-BINDING" };
  }
  try {
    const resolved = resolveResultPathWithoutSymlinks(dir, binding.path);
    if (resolved === null) return { ok: false, code: "PS-CONTINUITY-RESULT-PATH" };
    const stat = lstatSync(resolved.path);
    if (stat.size < 1 || stat.size > CONTINUITY_RESULT_MAX_BYTES) {
      return { ok: false, code: "PS-CONTINUITY-RESULT-PATH" };
    }
    const bytes = readFileSync(resolved.path);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes) || text.startsWith("\uFEFF") || text.includes("\r")) {
      return { ok: false, code: "PS-CONTINUITY-RESULT-CODEC" };
    }
    const matches = [...text.matchAll(/^```pipeline-result\n([\s\S]*?)\n```$/gm)];
    if (matches.length !== 1) return { ok: false, code: "PS-CONTINUITY-RESULT-FENCE" };
    const json = matches[0][1];
    const jsonStart = matches[0].index + "```pipeline-result\n".length;
    const strict = parseResultJsonStrict(json);
    const integrations = strict.parsed.finalIntegrations;
    const integrationIds = new Set();
    const identities = new Set();
    for (let index = 0; index < integrations.length; index++) {
      const range = strict.entryRanges[index];
      const raw = json.slice(range.start, range.end);
      const entry = integrations[index];
      if (!validateFinalEntry(entry, raw)) return { ok: false, code: "PS-CONTINUITY-RESULT-NONCANONICAL" };
      const identityKey = canonicalJson(entry.identity);
      if (integrationIds.has(entry.integrationId) || identities.has(identityKey)) {
        return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT" };
      }
      integrationIds.add(entry.integrationId);
      identities.add(identityKey);
    }
    const arrayRaw = json.slice(strict.arrayRange.start, strict.arrayRange.end);
    if ((integrations.length === 0 && arrayRaw !== "[]")
      || (integrations.length > 0
        && arrayRaw !== `[\n    ${strict.entryRanges.map((range) => json.slice(range.start, range.end)).join(",\n    ")}\n  ]`)) {
      return { ok: false, code: "PS-CONTINUITY-RESULT-NONCANONICAL" };
    }
    return {
      ok: true, code: "PS-CONTINUITY-RESULT-VALID", path: resolved.path, bytes, text,
      sha256: sha256Bytes(bytes), json, jsonStart, strict, repoRoot: resolved.root,
      relativePath: resolved.relativePath,
    };
  } catch {
    return { ok: false, code: "PS-CONTINUITY-RESULT-INVALID" };
  }
}

function replaceSentinel(value, digest) {
  if (value === POST_RESULT_SENTINEL) return digest;
  if (Array.isArray(value)) return value.map((child) => replaceSentinel(child, digest));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceSentinel(child, digest)]));
  }
  return value;
}

function buildFinalEntry(identity, finalDigest, finalOutcome, preResultSha256, nextTransition, integratedRevision) {
  if (!exactObjectKeys(nextTransition, [...NEXT_TRANSITION_KEYS])) return { ok: false, code: "PS-CONTINUITY-NEXT-TRANSITION" };
  try {
    const nextTransitionSha256 = sha256Bytes(canonicalJson(nextTransition));
    const tuple = { identity, finalDigest, finalOutcome, preResultSha256, nextTransitionSha256 };
    const entry = {
      integrationId: `fi-${sha256Bytes(canonicalJson(tuple))}`,
      identity: structuredClone(identity), finalDigest, finalOutcome, preResultSha256,
      nextTransition: structuredClone(nextTransition), nextTransitionSha256, integratedRevision,
    };
    const raw = canonicalJson(entry);
    return validateFinalEntry(entry, raw)
      ? { ok: true, entry, raw }
      : { ok: false, code: "PS-CONTINUITY-FINAL-ENTRY" };
  } catch {
    return { ok: false, code: "PS-CONTINUITY-FINAL-ENTRY" };
  }
}

function spliceFinalEntry(result, built) {
  const { strict, json, jsonStart, text } = result;
  const integrations = strict.parsed.finalIntegrations;
  const identityKey = canonicalJson(built.entry.identity);
  const sameIdentityEntry = integrations.find((entry) => canonicalJson(entry.identity) === identityKey);
  if (sameIdentityEntry) {
    return sameIdentityEntry.integrationId === built.entry.integrationId && canonicalJson(sameIdentityEntry) === built.raw
      ? { ok: true, code: "PS-CONTINUITY-RESULT-ENTRY-EXISTS", bytes: result.bytes, duplicate: true }
      : { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT" };
  }
  const arrayRaw = json.slice(strict.arrayRange.start, strict.arrayRange.end);
  const nextArray = integrations.length === 0
    ? `[\n    ${built.raw}\n  ]`
    : `${arrayRaw.slice(0, -4)},\n    ${built.raw}\n  ]`;
  const absoluteStart = jsonStart + strict.arrayRange.start;
  const absoluteEnd = jsonStart + strict.arrayRange.end;
  const nextText = text.slice(0, absoluteStart) + nextArray + text.slice(absoluteEnd);
  const bytes = Buffer.from(nextText, "utf8");
  return bytes.length <= CONTINUITY_RESULT_MAX_BYTES
    ? { ok: true, code: "PS-CONTINUITY-RESULT-PREPARED", bytes, duplicate: false }
    : { ok: false, code: "PS-CONTINUITY-RESULT-SIZE" };
}

function priorResultBytes(result) {
  const { strict, json, jsonStart, text } = result;
  const count = strict.parsed.finalIntegrations.length;
  if (count === 0) return null;
  const arrayRaw = json.slice(strict.arrayRange.start, strict.arrayRange.end);
  const nextArray = count === 1
    ? "[]"
    : `${arrayRaw.slice(0, strict.entryRanges.at(-1).start - strict.arrayRange.start - 6)}\n  ]`;
  const absoluteStart = jsonStart + strict.arrayRange.start;
  const absoluteEnd = jsonStart + strict.arrayRange.end;
  return Buffer.from(text.slice(0, absoluteStart) + nextArray + text.slice(absoluteEnd), "utf8");
}

function atomicWriteResult(result, bytes, lock, deps = {}) {
  const tmp = `${result.path}.tmp.${lock.ownerNonce}`;
  let fd;
  let renamed = false;
  try {
    if (!assertContinuityLockOwned(lock)) return { ok: false, committed: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP" };
    let resolved = resolveResultPathWithoutSymlinks(result.repoRoot, result.relativePath);
    if (resolved === null || resolved.path !== result.path || resolved.parent !== dirname(tmp)) {
      return { ok: false, committed: false, code: "PS-CONTINUITY-RESULT-PATH" };
    }
    fd = openSync(tmp, "wx", 0o600);
    (deps.replaceResultFdContents ?? replaceFdContents)(fd, bytes);
    closeSync(fd);
    fd = undefined;
    if (!assertContinuityLockOwned(lock)) return { ok: false, committed: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP" };
    resolved = resolveResultPathWithoutSymlinks(result.repoRoot, result.relativePath);
    if (resolved === null || resolved.path !== result.path || resolved.parent !== dirname(tmp)) {
      return { ok: false, committed: false, code: "PS-CONTINUITY-RESULT-PATH" };
    }
    (deps.renameResultSync ?? renameSync)(tmp, result.path);
    renamed = true;
    const synced = deps.syncResultDirectory?.(dirname(result.path)) ?? syncDirectory(dirname(result.path));
    return synced.ok
      ? { ok: true, committed: true, code: "PS-CONTINUITY-RESULT-WRITTEN" }
      : { ok: false, committed: true, code: "PS-CONTINUITY-RESULT-DURABILITY-UNKNOWN" };
  } catch {
    try {
      if (readFileSync(result.path).equals(bytes)) {
        return { ok: false, committed: true, code: "PS-CONTINUITY-RESULT-DURABILITY-UNKNOWN" };
      }
    } catch { /* disposition remains unknown */ }
    return renamed
      ? { ok: false, committed: null, code: "PS-CONTINUITY-RESULT-COMMIT-INDETERMINATE" }
      : { ok: false, committed: false, code: "PS-CONTINUITY-RESULT-WRITE-IO" };
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (!renamed) safeUnlink(tmp);
  }
}

function continuityResultMatchesState(dir, continuity) {
  if (continuity.authority.result === null) return { ok: true };
  const result = readResultAuthority(dir, {
    path: continuity.authority.result.path,
    preResultSha256: continuity.authority.result.sha256,
  });
  return result.ok && result.sha256 === continuity.authority.result.sha256
    ? { ok: true, result }
    : { ok: false, code: result.ok ? "PS-CONTINUITY-RESULT-DIGEST" : result.code };
}

function expectedFinalEntry(request, expectedRevision) {
  const observation = request.observation;
  return buildFinalEntry(
    observation?.identity,
    observation?.final?.resultDigest,
    observation?.final?.outcome,
    request.result?.preResultSha256,
    request.nextTransition,
    expectedRevision + 1,
  );
}

function proposedFinalState(current, request, postResultSha256) {
  const next = structuredClone(current);
  next.revision = current.revision + 1;
  next.authority.result = { path: current.authority.result.path, sha256: postResultSha256 };
  const materialized = replaceSentinel(request.nextTransition, postResultSha256);
  for (const key of NEXT_TRANSITION_KEYS) next[key] = materialized[key];
  next.acknowledgedFinal = {
    identity: structuredClone(request.observation?.identity),
    resultDigest: request.observation?.final?.resultDigest,
    finalOutcome: request.observation?.final?.outcome,
    integratedRevision: next.revision,
  };
  return integrateContinuityFinal(current, {
    expectedRevision: current.revision,
    observation: request.observation,
    next,
  }, current.featureId);
}

function committedFinalStateMatches(current, request, expectedRevision) {
  if (current.revision !== expectedRevision + 1
    || current.authority.result === null
    || current.authority.result.path !== request.result.path
    || current.acknowledgedFinal === null
    || current.acknowledgedFinal.integratedRevision !== current.revision
    || current.acknowledgedFinal.resultDigest !== request.observation?.final?.resultDigest
    || current.acknowledgedFinal.finalOutcome !== request.observation?.final?.outcome
    || !sameJson(current.acknowledgedFinal.identity, request.observation?.identity)
    || current.acknowledgedFinal.identity.authorityDigests.resultSha256 !== request.result.preResultSha256) return false;
  const materialized = replaceSentinel(request.nextTransition, current.authority.result.sha256);
  return [...NEXT_TRANSITION_KEYS].every((key) => sameJson(current[key], materialized[key]));
}

function runFinalIntegrationTransaction(dir, existing, expectedRevision, request, lock, deps) {
  if (!exactObjectKeys(request, ["observation", "nextTransition", "result"])
    || !exactObjectKeys(request.result, [...RESULT_BINDING_KEYS])
    || !exactObjectKeys(request.nextTransition, [...NEXT_TRANSITION_KEYS])) {
    return { ok: false, code: "PS-CONTINUITY-REQUEST", mutated: false };
  }
  const current = existing.state.continuity;
  if (current === undefined || current.authority.result === null
    || !validateContinuityState(current, existing.state.activeFeature?.id).ok
    || current.authority.result.path !== request.result.path) {
    return { ok: false, code: "PS-CONTINUITY-RESULT-BINDING", mutated: false };
  }
  const resultFile = readResultAuthority(dir, request.result);
  if (!resultFile.ok) return { ok: false, code: resultFile.code, mutated: false };
  const built = expectedFinalEntry(request, expectedRevision);
  if (!built.ok) return { ok: false, code: built.code, mutated: false };

  // Normal path or Result-before-State recovery: the persisted State still owns
  // the old revision and old Result digest.
  if (current.revision === expectedRevision) {
    if (current.authority.result.sha256 !== request.result.preResultSha256) {
      return { ok: false, code: "PS-CONTINUITY-RESULT-DIGEST", mutated: false };
    }
    let preparedBytes;
    let resultAlreadyPrepared = false;
    if (resultFile.sha256 === request.result.preResultSha256) {
      const spliced = spliceFinalEntry(resultFile, built);
      if (!spliced.ok || spliced.duplicate) {
        return { ok: false, code: spliced.ok ? "PS-CONTINUITY-RESULT-CONFLICT" : spliced.code, mutated: false };
      }
      preparedBytes = spliced.bytes;
    } else {
      const prior = priorResultBytes(resultFile);
      const last = resultFile.strict.parsed.finalIntegrations.at(-1);
      const lastRange = resultFile.strict.entryRanges.at(-1);
      const lastRaw = lastRange ? resultFile.json.slice(lastRange.start, lastRange.end) : null;
      if (prior === null || sha256Bytes(prior) !== request.result.preResultSha256
        || lastRaw !== built.raw || canonicalJson(last) !== built.raw) {
        return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: false };
      }
      preparedBytes = resultFile.bytes;
      resultAlreadyPrepared = true;
    }
    const postResultSha256 = sha256Bytes(preparedBytes);
    const transition = proposedFinalState(current, request, postResultSha256);
    if (!transition.ok || !transition.mutated) {
      return { ok: false, code: transition.code, mutated: resultAlreadyPrepared };
    }
    if (!resultAlreadyPrepared) {
      const prepared = atomicWriteResult(resultFile, preparedBytes, lock, deps);
      if (!prepared.ok) return { ok: false, code: prepared.code, mutated: prepared.committed !== false, committed: prepared.committed };
    }
    /* Node cannot provide an OS-identity/isolation assertion here. Under the
     * contractual single-Coordinator lock, re-check the complete non-symlink
     * component chain and the exact prepared bytes immediately before State CAS.
     * A hostile component swap outside that contract remains explicitly unclaimed. */
    deps.beforeStateWrite?.();
    if (!assertContinuityLockOwned(lock)) {
      return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP", mutated: true, committed: false };
    }
    const preparedProbe = readResultAuthority(dir, request.result);
    if (!preparedProbe.ok
      || preparedProbe.path !== resultFile.path
      || !preparedProbe.bytes.equals(preparedBytes)) {
      return { ok: false, code: preparedProbe.ok ? "PS-CONTINUITY-RESULT-CHANGED" : preparedProbe.code, mutated: true, committed: false };
    }
    const next = { ...existing.state, continuity: transition.state, updatedAt: (deps.now ?? (() => new Date().toISOString()))() };
    const written = atomicWriteContinuityState(dir, next, lock, deps);
    if (!written.ok) return { ok: false, code: written.code, mutated: true, committed: written.committed };
    return { ok: true, code: "PS-CONTINUITY-FINAL-COMMITTED", mutated: true, revision: transition.state.revision };
  }

  // State-before-Result reconstruction and exact committed duplicate.  This is
  // admitted only by the old digest in the acknowledgement identity and by an
  // exact hash of the reconstructed post-Result bytes.
  if (!committedFinalStateMatches(current, request, expectedRevision)) {
    return { ok: false, code: "PS-CONTINUITY-STALE", mutated: false };
  }
  const duplicateProbe = integrateContinuityFinal(current, {
    expectedRevision: current.revision,
    observation: request.observation,
    next: current,
  }, current.featureId);
  if (!duplicateProbe.ok || duplicateProbe.code !== "CS-DUPLICATE-FINAL") {
    return { ok: false, code: "PS-CONTINUITY-FINAL-REJECTED", mutated: false };
  }
  if (resultFile.sha256 === current.authority.result.sha256) {
    const matching = resultFile.strict.parsed.finalIntegrations.find((entry) => entry.integrationId === built.entry.integrationId);
    return matching && canonicalJson(matching) === built.raw
      ? { ok: true, code: "PS-CONTINUITY-DUPLICATE-FINAL", mutated: false, revision: current.revision }
      : { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: false };
  }
  if (resultFile.sha256 !== request.result.preResultSha256
    || resultFile.sha256 !== current.acknowledgedFinal.identity.authorityDigests.resultSha256) {
    return { ok: false, code: "PS-CONTINUITY-RESULT-DIGEST", mutated: false };
  }
  const repaired = spliceFinalEntry(resultFile, built);
  if (!repaired.ok || repaired.duplicate || sha256Bytes(repaired.bytes) !== current.authority.result.sha256) {
    return { ok: false, code: repaired.ok ? "PS-CONTINUITY-RESULT-CONFLICT" : repaired.code, mutated: false };
  }
  const writeRepair = atomicWriteResult(resultFile, repaired.bytes, lock, deps);
  if (!writeRepair.ok) return { ok: false, code: writeRepair.code, mutated: writeRepair.committed !== false, committed: writeRepair.committed };
  return { ok: true, code: "PS-CONTINUITY-RESULT-REPAIRED", mutated: true, revision: current.revision };
}

function continuityTransition(sub, base, expectedRevision, request) {
  const featureId = base.activeFeature?.id;
  if (typeof featureId !== "string" || featureId.trim() === "") return { ok: false, code: "PS-CONTINUITY-NO-ACTIVE-FEATURE" };
  if (sub === "continuity-init") {
    if (expectedRevision !== "absent" || base.continuity !== undefined) return { ok: false, code: "PS-CONTINUITY-STALE" };
    const valid = validateContinuityState(request, featureId);
    return valid.ok && request.revision === 0
      ? { ok: true, code: "PS-CONTINUITY-INITIALIZED", state: structuredClone(request), mutated: true }
      : { ok: false, code: valid.ok ? "PS-CONTINUITY-REVISION" : valid.code };
  }
  if (base.continuity === undefined) return { ok: false, code: "PS-CONTINUITY-ABSENT" };
  if (expectedRevision === "absent") return { ok: false, code: "PS-CONTINUITY-REVISION" };
  if (sub === "continuity-cas") {
    return compareAndSwapContinuity(base.continuity, { expectedRevision, next: request }, featureId);
  }
  if (sub === "continuity-integrate-final") {
    if (!exactObjectKeys(request, ["observation", "next"])) return { ok: false, code: "PS-CONTINUITY-REQUEST" };
    return integrateContinuityFinal(base.continuity, { expectedRevision, observation: request.observation, next: request.next }, featureId);
  }
  if (sub === "continuity-apply-decision") {
    if (!exactObjectKeys(request, ["decisionTxn", "queueHead", "blocker", "resume"])) return { ok: false, code: "PS-CONTINUITY-REQUEST" };
    return applyDecisionSelection(base.continuity, { expectedRevision, ...request }, featureId);
  }
  if (!exactObjectKeys(request, ["receipt"])) return { ok: false, code: "PS-CONTINUITY-REQUEST" };
  return clearDecisionSelection(base.continuity, { expectedRevision, receipt: request.receipt }, featureId);
}

function runContinuityCommand(sub, flags, deps) {
  const dir = deps.dir ?? projectDir();
  const expected = parseExpectedRevision(flags["expected-revision"], sub === "continuity-init");
  if (!expected.ok || isBlank(flags["request-file"]) || !LOCK_TOKEN_RE.test(flags["lock-token"] ?? "")) {
    console.error(`Error: ${sub} requires --expected-revision <absent|integer>, --request-file <repo-relative-json> and --lock-token <opaque-token>.`);
    return 2;
  }
  const request = readContinuityRequest(dir, flags["request-file"]);
  if (!request.ok) {
    console.error(`Error: continuity request refused (${request.code}).`);
    return 2;
  }
  const lock = acquireContinuityLock(dir, flags["lock-token"], deps);
  if (!lock.ok) {
    console.error(`Error: continuity writer refused (${lock.code}).`);
    return 2;
  }
  try {
    const existing = readState(dir);
    if (existing.status !== "ok") {
      console.error(`Error: continuity writer requires an existing valid ${SCHEMA_ID} state.`);
      return 2;
    }
    if (sub === "continuity-integrate-final") {
      const transaction = runFinalIntegrationTransaction(dir, existing, expected.value, request.value, lock, deps);
      if (!transaction.ok) {
        const disposition = transaction.committed === null
          ? "commit disposition is indeterminate"
          : transaction.mutated
            ? "Result prepare or repair may be durable; mutation is NOT reported as zero"
            : "zero State and Result mutation";
        console.error(`Error: continuity final transaction refused (${transaction.code}); ${disposition}.`);
        return 2;
      }
      console.log(`${transaction.code}: continuity revision ${transaction.revision}; ${transaction.mutated ? "transaction persisted" : "accepted with zero mutation"}.`);
      return 0;
    }
    const authorityState = sub === "continuity-init" ? request.value : existing.state.continuity;
    if (authorityState?.authority?.result !== null) {
      const coherent = continuityResultMatchesState(dir, authorityState);
      if (!coherent.ok) {
        console.error(`Error: continuity Result authority mismatch (${coherent.code}); zero mutation.`);
        return 2;
      }
    }
    const transition = continuityTransition(sub, existing.state, expected.value, request.value);
    if (!transition.ok) {
      console.error(`Error: continuity transition refused (${transition.code}); zero mutation.`);
      return 2;
    }
    if (!transition.mutated) {
      console.log(`${transition.code}: accepted with zero mutation.`);
      return 0;
    }
    const next = { ...existing.state, continuity: transition.state, updatedAt: (deps.now ?? (() => new Date().toISOString()))() };
    const written = atomicWriteContinuityState(dir, next, lock, deps);
    if (!written.ok) {
      if (written.committed) {
        console.error(`Error: continuity state committed, but durability is indeterminate (${written.code}); mutation is NOT reported as zero.`);
      } else if (written.committed === null) {
        console.error(`Error: continuity commit disposition is indeterminate (${written.code}); inspect the exact persisted revision before retry.`);
      } else {
        console.error(`Error: continuity write refused before commit (${written.code}); zero mutation.`);
      }
      return 2;
    }
    console.log(`${transition.code}: continuity revision ${transition.state.revision} written.`);
    return 0;
  } finally {
    const released = releaseContinuityLock(lock);
    if (!released.ok) console.error(`Warning: continuity lock release failed (${released.code}).`);
  }
}

/** Minimal `--flag value` argv parser (subcommand already stripped by the caller). */
function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      out[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === "";
}

/** Default `git rev-parse HEAD` runner; injectable for tests. Never throws. */
function defaultGitHead(dir) {
  const res = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
  if (res.error) return { ok: false, error: res.error.message };
  if (res.status !== 0 || !res.stdout || res.stdout.trim() === "") {
    return { ok: false, error: (res.stderr || `git rev-parse HEAD exited ${res.status}`).trim() };
  }
  return { ok: true, commit: res.stdout.trim() };
}

/**
 * Runs the CLI logic. Never calls process.exit itself (testable); returns the exit
 * code. `deps` allows tests to inject `dir`, `now`, and `gitHead` without touching the
 * real filesystem/clock/git.
 */
export function run(argv = process.argv.slice(2), deps = {}) {
  const dir = deps.dir ?? projectDir();
  const now = deps.now ?? (() => new Date().toISOString());
  const gitHead = deps.gitHead ?? defaultGitHead;

  const [sub, ...rest] = argv;
  const flags = parseFlags(rest);

  if (CONTINUITY_SUBCOMMANDS.has(sub)) return runContinuityCommand(sub, flags, { ...deps, dir, now });

  const existing = readState(dir);
  if (existing.status === "malformed") {
    console.error(`Error: existing state file is invalid (${existing.error}) -- aborting WITHOUT changes.`);
    console.error(`File: ${statePath(dir)}`);
    console.error(`Fix the file manually (or deliberately delete it) before pipeline-state.mjs writes again.`);
    return 2;
  }
  const base = existing.status === "ok" ? existing.state : { schema: SCHEMA_ID };

  switch (sub) {
    case "set-feature": {
      const id = flags.id;
      const planPath = flags["plan-path"];
      if (isBlank(id) || isBlank(planPath)) {
        console.error('Error: set-feature requires --id <id> and --plan-path <path> (both non-empty).');
        return 2;
      }
      if (base.continuity !== undefined) {
        console.error("Error: set-feature cannot replace an active continuity feature; close it through the revision/evidence-bound close gate first.");
        return 2;
      }
      const timestamp = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        activeFeature: { id, planPath, phase: "design" },
        planApproved: false,
        updatedAt: timestamp,
      };
      delete next.planApproval;
      delete next.planRevocation;
      delete next.phase; // F1 fix: strip any legacy top-level `phase` left over from a
      // pre-fix file -- phase now lives exclusively at activeFeature.phase.
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(`Feature "${id}" set. Plan path: ${planPath}. planApproved=false, phase="design".`);
      return 0;
    }

    case "set-phase": {
      const phase = flags.phase;
      if (isBlank(phase)) {
        console.error('Error: set-phase requires --phase <name> (non-empty).');
        return 2;
      }
      const baseActiveFeature = base.activeFeature && typeof base.activeFeature === "object" ? base.activeFeature : {};
      const next = {
        ...base,
        schema: SCHEMA_ID,
        activeFeature: { ...baseActiveFeature, phase },
        updatedAt: now(),
      };
      delete next.phase; // F1 fix: strip any legacy top-level `phase` left over from a
      // pre-fix file -- phase now lives exclusively at activeFeature.phase.
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(`Phase set: "${phase}".`);
      return 0;
    }

    case "approve-plan": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Error: approve-plan requires --by <name> (non-empty) -- an unattributed approval is refused.');
        return 2;
      }
      const approvedAt = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        planApproved: true,
        planApproval: { approvedBy: by, approvedAt },
        updatedAt: approvedAt,
      };
      delete next.planRevocation;
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(`Plan approved by "${by}" on ${approvedAt}.`);
      return 0;
    }

    case "revoke-plan": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Error: revoke-plan requires --by <name> (non-empty) -- an unattributed revocation is refused.');
        return 2;
      }
      const revokedAt = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        planApproved: false,
        planRevocation: { revokedBy: by, revokedAt },
        updatedAt: revokedAt,
      };
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(`Plan approval revoked by "${by}" on ${revokedAt}.`);
      return 0;
    }

    case "approve-push": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Error: approve-push requires --by <name> (non-empty) -- an unattributed approval is refused.');
        return 2;
      }
      const head = gitHead(dir);
      if (!head.ok) {
        console.error(`Error: current commit (git rev-parse HEAD) could not be determined: ${head.error}`);
        console.error("Push approval NOT recorded -- forCommit is meaningless without a known commit.");
        return 2;
      }
      const approvedAt = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        pushApproval: { lastApproved: { approvedBy: by, approvedAt, forCommit: head.commit } },
        updatedAt: approvedAt,
      };
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(`Push approved by "${by}" for commit ${head.commit} (${approvedAt}).`);
      return 0;
    }

    case "close-feature": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Error: close-feature requires --by <name> (non-empty) -- an unattributed close is refused.');
        return 2;
      }
      const activeFeature = base.activeFeature;
      if (!activeFeature || typeof activeFeature !== "object") {
        console.error('Error: no active feature present -- nothing to close.');
        return 2;
      }
      if (isBlank(activeFeature.id) || isBlank(activeFeature.planPath)) {
        console.error('Error: activeFeature.id and activeFeature.planPath must both be non-empty -- close-feature refused (no unattributed audit entry).');
        return 2;
      }
      if (base.closedFeatures !== undefined && !Array.isArray(base.closedFeatures)) {
        console.error('Error: existing closedFeatures is not an array -- aborting WITHOUT changes (no silent overwrite).');
        return 2;
      }
      let continuityClose;
      if (base.continuity !== undefined) {
        const closeRequest = readContinuityRequest(dir, flags["continuity-close-request"]);
        if (!closeRequest.ok || !validateContinuityCloseRequest(dir, base, closeRequest.value)) {
          console.error("Error: active continuity requires --continuity-close-request <repo-relative-json> bound to the exact revision, Result and close evidence.");
          return 2;
        }
        continuityClose = structuredClone(closeRequest.value);
      }
      // DEVIATION vs. approve-push (declared in the header): a git failure here is NOT fatal --
      // forCommit becomes null, a warning goes to stderr, and the close proceeds (exit 0).
      const head = gitHead(dir);
      let forCommit = null;
      if (head.ok) {
        forCommit = head.commit;
      } else {
        console.error(`Warning: current commit (git rev-parse HEAD) could not be determined: ${head.error}.`);
        console.error("close-feature proceeds anyway -- forCommit is recorded as null.");
      }
      const closedAt = now();
      const priorClosed = Array.isArray(base.closedFeatures) ? base.closedFeatures : [];
      const closedEntry = {
        id: activeFeature.id,
        planPath: activeFeature.planPath,
        phaseAtClose: activeFeature.phase ?? null,
        closedAt,
        closedBy: by,
        forCommit,
      };
      if (continuityClose !== undefined) closedEntry.continuityClose = continuityClose;
      const next = {
        ...base,
        schema: SCHEMA_ID,
        closedFeatures: [...priorClosed, closedEntry],
        planApproved: false,
        updatedAt: closedAt,
      };
      delete next.activeFeature;
      delete next.planApproval;
      delete next.planRevocation;
      delete next.continuity;
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(
        `Feature "${activeFeature.id}" closed by "${by}" (commit ${forCommit ?? "—"}, ${closedAt}). activeFeature removed, planApproved=false.`,
      );
      return 0;
    }

    case "approve-deploy": {
      const env = flags.env;
      const artifact = flags.artifact;
      const by = flags.by;
      if (isBlank(env) || isBlank(artifact) || isBlank(by)) {
        console.error(
          'Error: approve-deploy requires --env <environment>, --artifact <tag-or-sha> and --by <name> (all three non-empty).',
        );
        return 2;
      }
      if (base.deployApprovals !== undefined && !Array.isArray(base.deployApprovals)) {
        console.error('Error: existing deployApprovals is not an array -- aborting WITHOUT changes (no silent overwrite).');
        return 2;
      }
      const approvedAt = now();
      const priorApprovals = Array.isArray(base.deployApprovals) ? base.deployApprovals : [];
      const entry = { forArtifact: artifact, forEnvironment: env, approvedBy: by, approvedAt };
      const next = {
        ...base,
        schema: SCHEMA_ID,
        deployApprovals: [...priorApprovals, entry],
        updatedAt: approvedAt,
      };
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(`Deploy approval granted by "${by}" for artifact "${artifact}" / environment "${env}" (${approvedAt}).`);
      return 0;
    }

    case "consume-deploy": {
      const env = flags.env;
      const artifact = flags.artifact;
      const by = flags.by;
      if (isBlank(env) || isBlank(artifact) || isBlank(by)) {
        console.error('Error: consume-deploy requires --env <env>, --artifact <ref> and --by <name> (all three non-empty).');
        return 2;
      }
      if (base.deployApprovals !== undefined && !Array.isArray(base.deployApprovals)) {
        console.error('Error: existing deployApprovals is not an array -- aborting WITHOUT changes (no silent overwrite).');
        return 2;
      }
      const approvals = Array.isArray(base.deployApprovals) ? base.deployApprovals : [];
      const idx = approvals.findIndex(
        (a) => a && a.forArtifact === artifact && a.forEnvironment === env && a.usedAt === undefined,
      );
      if (idx === -1) {
        console.error(
          `Error: no open deploy approval found for artifact "${artifact}" / environment "${env}" (absent or already consumed) -- consume-deploy refused (no silent no-op).`,
        );
        return 2;
      }
      const usedAt = now();
      const nextApprovals = approvals.map((a, i) => (i === idx ? { ...a, usedAt } : a));
      const next = {
        ...base,
        schema: SCHEMA_ID,
        deployApprovals: nextApprovals,
        updatedAt: usedAt,
      };
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(`Deploy approval consumed by "${by}" for artifact "${artifact}" / environment "${env}" (${usedAt}).`);
      return 0;
    }

    case "clear-deploy": {
      const env = flags.env;
      const artifact = flags.artifact; // optional
      const by = flags.by;
      if (isBlank(env) || isBlank(by)) {
        console.error('Error: clear-deploy requires --env <env> and --by <name> (both non-empty); --artifact is optional.');
        return 2;
      }
      if (base.deployApprovals !== undefined && !Array.isArray(base.deployApprovals)) {
        console.error('Error: existing deployApprovals is not an array -- aborting WITHOUT changes (no silent overwrite).');
        return 2;
      }
      const approvals = Array.isArray(base.deployApprovals) ? base.deployApprovals : [];
      const matchesTarget = (a) =>
        a && a.forEnvironment === env && a.usedAt === undefined && (isBlank(artifact) || a.forArtifact === artifact);
      const toRemove = approvals.filter(matchesTarget);
      if (toRemove.length === 0) {
        console.error(
          `Error: no open deploy approval found for environment "${env}"${isBlank(artifact) ? "" : ` / artifact "${artifact}"`} -- clear-deploy refused (nothing to remove).`,
        );
        return 2;
      }
      const remaining = approvals.filter((a) => !matchesTarget(a));
      const clearedAt = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        deployApprovals: remaining,
        updatedAt: clearedAt,
      };
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(
        `${toRemove.length} open deploy approval(s) for environment "${env}"${isBlank(artifact) ? "" : ` / artifact "${artifact}"`} removed by "${by}" (${clearedAt}).`,
      );
      return 0;
    }

    default: {
      console.error(
        `Error: unknown command "${sub ?? ""}". Allowed: set-feature, set-phase, approve-plan, revoke-plan, approve-push, close-feature, approve-deploy, consume-deploy, clear-deploy, continuity-init, continuity-cas, continuity-integrate-final, continuity-apply-decision, continuity-clear-decision.`,
      );
      return 2;
    }
  }
}

const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  process.exit(run());
}
