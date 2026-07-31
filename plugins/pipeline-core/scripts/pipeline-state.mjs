#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
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
 *     "planApproval": { "approvedBy": "<string>", "approvedAt": "<ISO-8601>",
 *       "poGateAuthority": <pipeline.po-gate-authority-evidence.v1 object> } | absent,
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
 *   set-gate-estimate --id <safe-id>              Records the one evidence/source-bound
 *                 --expected-current-id <id|absent> next-gate estimate. The closed
 *                 --feature-id <id>               argument set is CAS-bound under the
 *                 --gate <prd|security|merge>     shared state lock; only literal
 *                 --object-format <sha1|sha256>   `--by coordinator` is accepted.
 *                 --source-oid <hex>
 *                 --evidence-path <repo-path>
 *                 --evidence-sha256 <sha256>
 *                 --min-minutes <integer>
 *                 --max-minutes <integer>
 *                 --by coordinator
 *   approve-plan  --by <name>                     Sets planApproved=true, records
 *                                                 exact v2 planApproval including its
 *                                                 Spec binding; the same profile/PRD/Spec
 *                                                 authority is revalidated under the
 *                                                 writer lock before commit.
 *                                                 Clears any prior planRevocation.
 *   revoke-plan   --by <name>                     Sets planApproved=false, records
 *                                                 the exact v2 revocation bound to the
 *                                                 approved Plan and Spec.
 *   bind-plan-spec --by <name>                     One-time migration of an exact legacy
 *                 --expected-plan-sha256 <sha>    approval to v2 under the writer lock.
 *                 --expected-spec-sha256 <sha>    The supplied digests and current
 *                                                 repository authority must agree.
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
 *   continuity-record-course-brief|continuity-select-course|
 *   continuity-apply-decision|continuity-clear-decision
 *                  --expected-revision <absent|integer>
 *                  --request-file <repo-relative-json>
 *                  --lock-token <opaque-token>
 *                                                 Coordinator-only continuity
 *                                                 transitions. `init` alone accepts
 *                                                 `absent`; every later transition
 *                                                 binds the exact persisted revision.
 *                                                 Course commands use Result-first,
 *                                                 idempotent evidence transactions;
 *                                                 the request envelope is closed and
 *                                                 validated by continuity-state.mjs.
 *                                                 Accepted passive/duplicate outcomes
 *                                                 exit 0 with zero mutation.
 *   continuity-result-close-plan                  Read-only approved-implementation
 *                 --feature-id <id>               Result binding plan. Requires the
 *                 --expected-revision <integer>   exact idle review head, null Result,
 *                 --result-path <repo-path>       zero retries and a physical regular
 *                 --result-sha256 <sha256>        single-link Result whose bytes match.
 *   continuity-result-close-apply <returned argv> Confirmed digest/CAS apply of that
 *                                                 plan. Changes only Continuity revision,
 *                                                 Result authority, review -> close and
 *                                                 resume, making the existing H5 close
 *                                                 coordinator reachable. Exact replay is
 *                                                 a zero-write success.
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
 *   - Every successful state mutation clears `gateEstimate` in the same atomic
 *     replacement. `set-gate-estimate` is the sole exception: its exact CAS
 *     replay is zero-write and its prepared replacement preserves the record.
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
  fchmodSync,
  fsyncSync,
  ftruncateSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyCourseDecisionIntent,
  applyDecisionSelection,
  clearCourseDecisionReceipt,
  clearDecisionSelection,
  bindContinuityResultForClose,
  compareAndSwapContinuity,
  planLegacyContinuityAdoption,
  applyLegacyContinuityAdoption,
  LEGACY_CONTINUITY_ADOPTION as LEGACY_ADOPTION,
  CONTINUITY_STATE_MAX_BYTES,
  integrateContinuityFinal,
  recordCourseDecisionBrief,
  validateContinuityState,
} from "../lib/continuity-state.mjs";
import {
  canonicalJson as canonicalDecisionJson,
  sha256Canonical,
  validateCourseDecisionBrief,
  validateCourseDecisionIntent,
  validateCourseDecisionReceipt,
} from "../lib/review-economy.mjs";
import {
  validatePoGateAuthorityForRepository,
  validatePoGateProfileForRepository,
} from "../lib/po-gate-authority.mjs";
import { inspectProjectOnboardingV3 } from "../lib/project-onboarding-v3.mjs";
import {
  approveSubmittedPlan,
  bindPlanSpecApproval,
  derivePlanLifecycle,
  enterPlanImplementation,
  reopenPlanDesign,
  revokePlanV2,
  sealCurrentPlanApproval,
  sha256CanonicalJson,
  submitPlan,
} from "../lib/plan-spec-state-v2.mjs";
import { validateFeaturePackage } from "../lib/feature-package-topology.mjs";
import {
  clearGateEstimateForMutation,
  prepareGateEstimateMutation,
  readGateEstimateEvidence,
} from "../lib/gate-estimate.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
  validatePortablePipelineState,
} from "../lib/project-authority.mjs";
import { observeGitSource } from "../lib/source-observation.mjs";
import { inspectSessionClosure } from "../lib/worktree-lifecycle.mjs";
import {
  PUBLICATION_AUTHORITY_REFERENCE_SCHEMA,
  approvePublicationAuthority,
  authorizePublicationAuthority,
  blockPublicationAuthority,
  closePublicationAuthority,
  observePublicationAuthority,
  preparePublicationAuthority,
  readPublicationAuthority,
  rearmPublicationAuthority,
  startPublicationReadback,
} from "../lib/publication-authority.mjs";
import { publicationDigest } from "../lib/publication-bundle.mjs";
import {
  lifecycleDigest as closeCoordinatorDigest,
  readCloseCoordinator,
} from "./publication-close-journal.mjs";

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
const RESULT_APPEND_COLLECTIONS = new Set([
  "decisionBriefs",
  "courseDecisionIntents",
  "courseDecisionReceipts",
  "finalIntegrations",
]);
const CONTINUITY_SUBCOMMANDS = new Set([
  "continuity-init",
  "continuity-cas",
  "continuity-integrate-final",
  "continuity-record-course-brief",
  "continuity-select-course",
  "continuity-apply-decision",
  "continuity-clear-decision",
  "continuity-adoption-plan",
  "continuity-adoption-apply",
]);
const PUBLICATION_SUBCOMMANDS = new Set([
  "publication-prepare",
  "publication-approve",
  "publication-authorize",
  "publication-reconcile",
  "publication-observe",
  "publication-start-readback",
  "publication-close",
  "publication-rearm",
  "publication-block",
]);
const PUBLICATION_COMMAND_SCHEMA = "pipeline.publication-command.v1";
const PUBLICATION_PROJECTION_SCHEMA = "pipeline.publication-projection.v1";
const PUBLICATION_AUTHORIZATION_SCHEMA = "pipeline.publication-authorization.v1";
const LOCK_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const LEGACY_WRITER_LOCK_TOKEN = "pipeline-legacy-writer-v0";
const RESULT_CLOSE_PLAN_SCHEMA = "pipeline.continuity-result-close-plan.v1";
const RESULT_CLOSE_APPLY_SCHEMA = "pipeline.continuity-result-close-apply.v1";
const RESULT_CLOSE_LOCK_TOKEN = "pipeline-result-close-v1";
const RESULT_BOOTSTRAP_PLAN_SCHEMA = "pipeline.continuity-result-bootstrap-plan.v1";
const RESULT_BOOTSTRAP_APPLY_SCHEMA = "pipeline.continuity-result-bootstrap-apply.v1";
const RESULT_BOOTSTRAP_LOCK_TOKEN = "pipeline-result-bootstrap-v1";
const RESULT_BOOTSTRAP_JOURNAL_SCHEMA = "pipeline.continuity-result-bootstrap-journal.v1";
const RESULT_REBIND_PLAN_SCHEMA = "pipeline.continuity-result-rebind-plan.v1";
const RESULT_REBIND_APPLY_SCHEMA = "pipeline.continuity-result-rebind-apply.v1";
const RESULT_REBIND_LOCK_TOKEN = "pipeline-result-rebind-v1";
const LEGACY_PLAN_APPROVAL_KEYS = ["approvedBy", "approvedAt", "poGateAuthority"];
const LEGACY_PO_GATE_AUTHORITY_KEYS = [
  "schema", "humanFacing", "sourceSha256", "runtimeSha256", "receiptSha256",
  "repositoryFingerprint", "planPath", "planSha256",
];

/** Resolves the target project dir: $CLAUDE_PROJECT_DIR, else process.cwd(). */
export function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/** Path to the state file under a given project dir. */
export function statePath(dir = projectDir()) {
  const authority = resolveProjectAuthorityPaths({ rootDir: dir });
  if (authority.status === "ready") return join(dir, authority.state);
  const neutral = join(dir, NEUTRAL_STATE);
  const legacy = join(dir, LEGACY_STATE);
  if (existsSync(neutral) || !existsSync(legacy)) return neutral;
  return legacy;
}

function stateRelativePath(dir) {
  return relative(resolve(dir), statePath(dir)).split(sep).join("/");
}

function stateDirectory(dir) {
  return dirname(statePath(dir));
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
  if (p === join(dir, NEUTRAL_STATE)) {
    const portability = validatePortablePipelineState(parsed);
    if (!portability.ok) {
      return { status: "malformed", error: `${portability.code}: ${portability.reason}` };
    }
  }
  return { status: "ok", state: parsed };
}

function writeState(dir, state, expectedState, options = {}) {
  const lock = acquireContinuityLock(dir, LEGACY_WRITER_LOCK_TOKEN);
  if (!lock.ok) return { ok: false, committed: false, code: lock.code };
  try {
    const observed = readState(dir);
    const observedBase = observed.status === "ok" ? observed.state : observed.status === "absent" ? { schema: SCHEMA_ID } : null;
    if (observedBase === null || JSON.stringify(observedBase) !== JSON.stringify(expectedState)) {
      return { ok: false, committed: false, code: "PS-STATE-STALE" };
    }
    let nextState = state;
    let transition;
    if (options.transition) {
      try {
        transition = options.transition(observedBase);
      } catch {
        return { ok: false, committed: false, code: "PS-STATE-TRANSITION" };
      }
      if (!transition?.ok) return { ok: false, committed: false, code: transition?.code ?? "PS-STATE-TRANSITION" };
      nextState = transition.state;
    }
    if (options.beforeCommit) {
      let gate;
      try {
        gate = options.beforeCommit();
      } catch {
        return { ok: false, committed: false, code: "PS-BEFORE-COMMIT" };
      }
      if (!gate?.ok) return { ok: false, committed: false, code: gate?.code ?? "PS-BEFORE-COMMIT" };
    }
    if (transition?.replay) return { ok: true, committed: true, code: "PS-STATE-REPLAY", replay: true, transition };
    if (statePath(dir) === join(dir, NEUTRAL_STATE)) {
      const portability = validatePortablePipelineState(nextState);
      if (!portability.ok) return { ok: false, committed: false, code: portability.code };
    }
    if (nextState.continuity !== undefined) {
      const valid = validateContinuityState(nextState.continuity, nextState.activeFeature?.id);
      const expectedRevision = expectedState.continuity?.revision;
      const revisionCurrent = expectedRevision === undefined
        || nextState.continuity.revision === expectedRevision;
      const revisionAdvancedOnce = options.allowContinuityAdvance === true
        && Number.isSafeInteger(expectedRevision)
        && nextState.continuity.revision === expectedRevision + 1;
      if (!valid.ok
        || (!revisionCurrent && !revisionAdvancedOnce)) {
        return { ok: false, committed: false, code: "PS-STATE-CONTINUITY" };
      }
    }
    const written = atomicWriteContinuityState(dir, nextState, lock, {
      preserveGateEstimate: options.preserveGateEstimate === true,
    });
    return transition === undefined ? written : { ...written, transition };
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
  const published = publishExclusiveRecord(path, record, stateDirectory(dir));
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
  const authorityDir = stateDirectory(dir);
  if (!existsSync(authorityDir)) mkdirSync(authorityDir, { recursive: true });
  const path = continuityLockPath(dir);
  const nowMs = deps.nowMs ?? Date.now;
  const staleMs = deps.lockStaleMs ?? CONTINUITY_LOCK_STALE_MS;
  const ownerNonce = deps.ownerNonce?.() ?? randomUUID();
  if (!LOCK_TOKEN_RE.test(ownerNonce)) return { ok: false, code: "PS-CONTINUITY-LOCK-NONCE" };
  const acquiredAtMs = nowMs();
  const record = { schema: CONTINUITY_LOCK_SCHEMA_ID, token, ownerNonce, acquiredAtMs };

  if (existsSync(lockRecoveryPath(dir))) return { ok: false, code: "PS-CONTINUITY-RECOVERY-IN-PROGRESS" };
  const published = publishExclusiveRecord(path, record, authorityDir);
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
    const recovered = publishExclusiveRecord(path, record, authorityDir);
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
  // A gate estimate is derived planning input, never durable lifecycle authority.
  // Every successful state replacement invalidates it unless its one dedicated
  // CAS producer has explicitly prepared the exact replacement below.
  const stateToWrite = deps.preserveGateEstimate === true ? state : clearGateEstimateForMutation(state);
  const text = JSON.stringify(stateToWrite, null, 2) + "\n";
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
    const synced = deps.syncDirectory?.(stateDirectory(dir)) ?? syncDirectory(stateDirectory(dir));
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
    const leftStack = new Set();
    const rightStack = new Set();
    const compare = (leftValue, rightValue) => {
      if (leftValue === null || rightValue === null) return leftValue === rightValue;
      if (typeof leftValue !== typeof rightValue) return false;
      if (typeof leftValue === "string" || typeof leftValue === "boolean") return leftValue === rightValue;
      if (typeof leftValue === "number") {
        return Number.isFinite(leftValue) && Number.isFinite(rightValue) && leftValue === rightValue;
      }
      if (typeof leftValue !== "object"
        || leftStack.has(leftValue) || rightStack.has(rightValue)) return false;
      const leftArray = Array.isArray(leftValue);
      if (leftArray !== Array.isArray(rightValue)) return false;
      const leftPrototype = Object.getPrototypeOf(leftValue);
      const rightPrototype = Object.getPrototypeOf(rightValue);
      if (!leftArray
        && (leftPrototype !== Object.prototype && leftPrototype !== null)) return false;
      if (!leftArray
        && (rightPrototype !== Object.prototype && rightPrototype !== null)) return false;
      leftStack.add(leftValue);
      rightStack.add(rightValue);
      try {
        if (leftArray) {
          if (leftValue.length !== rightValue.length
            || Reflect.ownKeys(leftValue).length !== leftValue.length + 1
            || Reflect.ownKeys(rightValue).length !== rightValue.length + 1) return false;
          for (let index = 0; index < leftValue.length; index += 1) {
            const leftDescriptor = Object.getOwnPropertyDescriptor(leftValue, String(index));
            const rightDescriptor = Object.getOwnPropertyDescriptor(rightValue, String(index));
            if (leftDescriptor === undefined || rightDescriptor === undefined
              || !Object.hasOwn(leftDescriptor, "value") || !Object.hasOwn(rightDescriptor, "value")
              || !compare(leftDescriptor.value, rightDescriptor.value)) return false;
          }
          return true;
        }
        const leftKeys = Reflect.ownKeys(leftValue);
        const rightKeys = Reflect.ownKeys(rightValue);
        if (leftKeys.some((key) => typeof key !== "string")
          || rightKeys.some((key) => typeof key !== "string")
          || leftKeys.length !== rightKeys.length) return false;
        leftKeys.sort();
        rightKeys.sort();
        for (let index = 0; index < leftKeys.length; index += 1) {
          if (leftKeys[index] !== rightKeys[index]) return false;
          const leftDescriptor = Object.getOwnPropertyDescriptor(leftValue, leftKeys[index]);
          const rightDescriptor = Object.getOwnPropertyDescriptor(rightValue, rightKeys[index]);
          if (leftDescriptor?.enumerable !== true || rightDescriptor?.enumerable !== true
            || !Object.hasOwn(leftDescriptor, "value") || !Object.hasOwn(rightDescriptor, "value")
            || !compare(leftDescriptor.value, rightDescriptor.value)) return false;
        }
        return true;
      } finally {
        leftStack.delete(leftValue);
        rightStack.delete(rightValue);
      }
    };
    return compare(left, right);
  } catch {
    return false;
  }
}

// Closed persisted encodings and their digests intentionally retain this
// stricter token alphabet. Structural readback comparison belongs in sameJson.
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
 * append-only collection token/entry ranges needed for byte-preserving splices. */
function parseResultJsonStrict(source) {
  let i = 0;
  const collectionRanges = Object.create(null);
  const collectionEntryRanges = Object.create(null);
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
        if (path.length === 0 && RESULT_APPEND_COLLECTIONS.has(key)) {
          if (!Array.isArray(out[key])) throw new Error(`${key} must be array`);
          collectionRanges[key] = { start: childStart, end: childEnd };
        }
        ws();
        const separator = source[i++];
        if (separator === "}") return out;
        if (separator !== ",") throw new Error("comma expected");
      }
    }
    if (source[i] === "[") {
      const collection = path.length === 1 && RESULT_APPEND_COLLECTIONS.has(path[0]) ? path[0] : null;
      i++;
      const out = [];
      const ranges = [];
      ws();
      if (source[i] === "]") { i++; if (collection !== null) collectionEntryRanges[collection] = ranges; return out; }
      while (true) {
        ws();
        const start = i;
        out.push(value([...path, String(out.length)]));
        const end = i;
        ranges.push({ start, end });
        ws();
        const separator = source[i++];
        if (separator === "]") { if (collection !== null) collectionEntryRanges[collection] = ranges; return out; }
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
    || collectionRanges.finalIntegrations === undefined) throw new Error("invalid result root");
  return {
    parsed,
    collectionRanges,
    collectionEntryRanges,
    // Backwards-compatible aliases for final-integration helpers below.
    arrayRange: collectionRanges.finalIntegrations,
    entryRanges: collectionEntryRanges.finalIntegrations ?? [],
  };
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

function collectionFormattingIsCanonical(strict, json, name) {
  const range = strict.collectionRanges[name];
  if (range === undefined) return true;
  const entries = strict.parsed[name];
  const ranges = strict.collectionEntryRanges[name] ?? [];
  if (!Array.isArray(entries) || entries.length !== ranges.length) return false;
  const arrayRaw = json.slice(range.start, range.end);
  return (entries.length === 0 && arrayRaw === "[]")
    || (entries.length > 0
      && arrayRaw === `[\n    ${ranges.map((entryRange) => json.slice(entryRange.start, entryRange.end)).join(",\n    ")}\n  ]`);
}

/* Course artifacts are Result-owned append-only evidence.  Validate the exact
 * canonical bytes first, then their semantic and cross-entry bindings; a State
 * pointer is checked by the transaction that consumes it. */
function validateCourseArtifacts(strict, json) {
  const names = ["decisionBriefs", "courseDecisionIntents", "courseDecisionReceipts"];
  if (names.some((name) => !collectionFormattingIsCanonical(strict, json, name))) return false;
  const briefs = strict.parsed.decisionBriefs ?? [];
  const intents = strict.parsed.courseDecisionIntents ?? [];
  const receipts = strict.parsed.courseDecisionReceipts ?? [];
  const briefById = new Map();
  const intentByDigest = new Map();
  const intentKeys = new Set();
  const receiptKeys = new Set();
  for (let index = 0; index < briefs.length; index++) {
    const raw = json.slice(strict.collectionEntryRanges.decisionBriefs[index].start, strict.collectionEntryRanges.decisionBriefs[index].end);
    const brief = briefs[index];
    let verdict;
    try { verdict = validateCourseDecisionBrief(brief); } catch { return false; }
    if (!verdict.ok || canonicalDecisionJson(brief) !== raw || briefById.has(brief.briefId)) return false;
    briefById.set(brief.briefId, { brief, sha256: verdict.sha256, raw });
  }
  for (let index = 0; index < intents.length; index++) {
    const raw = json.slice(strict.collectionEntryRanges.courseDecisionIntents[index].start, strict.collectionEntryRanges.courseDecisionIntents[index].end);
    const intent = intents[index];
    const brief = briefById.get(intent?.briefId);
    if (!brief || intent.briefSha256 !== brief.sha256 || intentKeys.has(intent.idempotencyKey)) return false;
    let verdict;
    try {
      verdict = validateCourseDecisionIntent(intent, {
        briefId: brief.brief.briefId,
        briefSha256: brief.sha256,
        blockerSignature: intent.blockerSignature,
        optionIds: brief.brief.alternatives.map(({ optionId }) => optionId),
      });
    } catch { return false; }
    if (!verdict.ok || canonicalDecisionJson(intent) !== raw) return false;
    intentKeys.add(intent.idempotencyKey);
    intentByDigest.set(verdict.sha256, { intent, sha256: verdict.sha256, raw });
  }
  for (let index = 0; index < receipts.length; index++) {
    const raw = json.slice(strict.collectionEntryRanges.courseDecisionReceipts[index].start, strict.collectionEntryRanges.courseDecisionReceipts[index].end);
    const receipt = receipts[index];
    const intent = intentByDigest.get(receipt?.intentSha256);
    if (!intent || receiptKeys.has(receipt.idempotencyKey)) return false;
    let verdict;
    try { verdict = validateCourseDecisionReceipt(receipt, intent.intent); } catch { return false; }
    if (!verdict.ok || canonicalDecisionJson(receipt) !== raw) return false;
    receiptKeys.add(receipt.idempotencyKey);
  }
  return true;
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
    if (!collectionFormattingIsCanonical(strict, json, "finalIntegrations")) {
      return { ok: false, code: "PS-CONTINUITY-RESULT-NONCANONICAL" };
    }
    if (!validateCourseArtifacts(strict, json)) return { ok: false, code: "PS-CONTINUITY-RESULT-NONCANONICAL" };
    return {
      ok: true, code: "PS-CONTINUITY-RESULT-VALID", path: resolved.path, bytes, text,
      sha256: sha256Bytes(bytes), json, jsonStart, strict, repoRoot: resolved.root,
      relativePath: resolved.relativePath,
      decisionBriefs: strict.parsed.decisionBriefs ?? [],
      courseDecisionIntents: strict.parsed.courseDecisionIntents ?? [],
      courseDecisionReceipts: strict.parsed.courseDecisionReceipts ?? [],
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

function spliceCourseArtifact(result, collection, artifact) {
  if (!new Set(["decisionBriefs", "courseDecisionIntents", "courseDecisionReceipts"]).has(collection)
    || result.strict.collectionRanges[collection] === undefined) {
    return { ok: false, code: "PS-CONTINUITY-DECISION-COLLECTION" };
  }
  let raw;
  try { raw = canonicalDecisionJson(artifact); } catch { return { ok: false, code: "PS-CONTINUITY-DECISION-ENTRY" }; }
  const entries = result.strict.parsed[collection];
  const key = collection === "decisionBriefs" ? artifact?.briefId : artifact?.idempotencyKey;
  if (typeof key !== "string") return { ok: false, code: "PS-CONTINUITY-DECISION-ENTRY" };
  const matching = entries.find((entry) => (collection === "decisionBriefs" ? entry.briefId : entry.idempotencyKey) === key);
  if (matching) {
    try {
      return canonicalDecisionJson(matching) === raw
        ? { ok: true, code: "PS-CONTINUITY-DECISION-ENTRY-EXISTS", bytes: result.bytes, duplicate: true, raw }
        : { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT" };
    } catch { return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT" }; }
  }
  const range = result.strict.collectionRanges[collection];
  const arrayRaw = result.json.slice(range.start, range.end);
  const nextArray = entries.length === 0
    ? `[\n    ${raw}\n  ]`
    : `${arrayRaw.slice(0, -4)},\n    ${raw}\n  ]`;
  const absoluteStart = result.jsonStart + range.start;
  const absoluteEnd = result.jsonStart + range.end;
  const bytes = Buffer.from(result.text.slice(0, absoluteStart) + nextArray + result.text.slice(absoluteEnd), "utf8");
  return bytes.length <= CONTINUITY_RESULT_MAX_BYTES
    ? { ok: true, code: "PS-CONTINUITY-RESULT-PREPARED", bytes, duplicate: false, raw }
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

function priorCourseArtifactBytes(result, collection, raw) {
  const range = result.strict.collectionRanges[collection];
  const ranges = result.strict.collectionEntryRanges[collection] ?? [];
  const entries = result.strict.parsed[collection] ?? [];
  if (range === undefined || entries.length === 0) return null;
  const lastRange = ranges.at(-1);
  if (!lastRange || result.json.slice(lastRange.start, lastRange.end) !== raw) return null;
  const arrayRaw = result.json.slice(range.start, range.end);
  const nextArray = entries.length === 1
    ? "[]"
    : `${arrayRaw.slice(0, lastRange.start - range.start - 6)}\n  ]`;
  const absoluteStart = result.jsonStart + range.start;
  const absoluteEnd = result.jsonStart + range.end;
  return Buffer.from(result.text.slice(0, absoluteStart) + nextArray + result.text.slice(absoluteEnd), "utf8");
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

function defaultGitBinding(dir) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
  const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: dir, encoding: "utf8" });
  if (head.error || tree.error || head.status !== 0 || tree.status !== 0
    || !/^[a-f0-9]{40}$/.test(head.stdout?.trim() ?? "") || !/^[a-f0-9]{40}$/.test(tree.stdout?.trim() ?? "")) {
    return { ok: false };
  }
  return { ok: true, commit: head.stdout.trim(), tree: tree.stdout.trim() };
}

function exactBriefForCurrentState(current, brief, blocker, gitBinding, expectedRevision) {
  let verdict;
  try { verdict = validateCourseDecisionBrief(brief); } catch { return { ok: false }; }
  if (!verdict.ok || !gitBinding.ok || brief.featureId !== current.featureId
    || brief.revision !== expectedRevision + 1
    || brief.commit !== gitBinding.commit || brief.tree !== gitBinding.tree
    || brief.authorityDigests.prd !== current.authority.prd.sha256
    || brief.authorityDigests.spec !== current.authority.spec.sha256
    || blocker?.type !== "course" || blocker.signature !== brief.normalizedFailureSignature
    || blocker.decisionBrief?.decisionBriefId !== brief.briefId
    || blocker.decisionBrief?.decisionBriefSha256 !== verdict.sha256
    || blocker.decisionBrief?.resultPath !== current.authority.result?.path) return { ok: false };
  return { ok: true, sha256: verdict.sha256 };
}

function committedCourseBriefStateMatches(current, request, expectedRevision, postResultSha256, briefSha256) {
  return current.revision === expectedRevision + 1
    && current.authority.result?.path === request.result.path
    && current.authority.result?.sha256 === postResultSha256
    && current.queueHead === null
    && current.decisionTxn === null
    && sameJson(current.blocker, request.blocker)
    && current.blocker?.decisionBrief?.decisionBriefSha256 === briefSha256
    && sameJson(current.resume, request.resume);
}

/* Result-first brief publication.  The Result entry is immutable evidence; the
 * State transition merely projects its ID/digest/path and becomes the CAS point.
 * An interrupted State write is resumed only when the exact post-Result bytes
 * reconstruct to the State's pre-write digest. */
function runCourseBriefTransaction(dir, existing, expectedRevision, request, lock, deps) {
  if (!exactObjectKeys(request, ["brief", "blocker", "resume", "result"])
    || !exactObjectKeys(request.result, [...RESULT_BINDING_KEYS])) {
    return { ok: false, code: "PS-CONTINUITY-REQUEST", mutated: false };
  }
  const current = existing.state.continuity;
  if (current === undefined || current.authority.result === null
    || !validateContinuityState(current, existing.state.activeFeature?.id).ok
    || current.authority.result.path !== request.result.path) {
    return { ok: false, code: "PS-CONTINUITY-RESULT-BINDING", mutated: false };
  }
  const binding = (deps.gitBinding ?? defaultGitBinding)(dir);
  const briefBinding = exactBriefForCurrentState(current, request.brief, request.blocker, binding, expectedRevision);
  if (!briefBinding.ok) return { ok: false, code: "PS-CONTINUITY-COURSE-BRIEF", mutated: false };
  const resultFile = readResultAuthority(dir, request.result);
  if (!resultFile.ok) return { ok: false, code: resultFile.code, mutated: false };
  const spliced = spliceCourseArtifact(resultFile, "decisionBriefs", request.brief);
  if (!spliced.ok) return { ok: false, code: spliced.code, mutated: false };

  if (current.revision === expectedRevision) {
    if (current.queueHead?.dispatch !== null || current.authority.result.sha256 !== request.result.preResultSha256) {
      return { ok: false, code: "PS-CONTINUITY-COURSE-BRIEF-STALE", mutated: false };
    }
    let preparedBytes;
    let resultAlreadyPrepared = false;
    if (resultFile.sha256 === request.result.preResultSha256) {
      if (spliced.duplicate) return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: false };
      preparedBytes = spliced.bytes;
    } else {
      const prior = priorCourseArtifactBytes(resultFile, "decisionBriefs", spliced.raw);
      if (!spliced.duplicate || prior === null || sha256Bytes(prior) !== request.result.preResultSha256) {
        return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: false };
      }
      preparedBytes = resultFile.bytes;
      resultAlreadyPrepared = true;
    }
    const postResultSha256 = sha256Bytes(preparedBytes);
    const transition = recordCourseDecisionBrief(current, {
      expectedRevision,
      result: { path: request.result.path, sha256: postResultSha256 },
      blocker: request.blocker,
      resume: request.resume,
    }, current.featureId);
    if (!transition.ok || !transition.mutated) return { ok: false, code: transition.code, mutated: resultAlreadyPrepared };
    if (!resultAlreadyPrepared) {
      const prepared = atomicWriteResult(resultFile, preparedBytes, lock, deps);
      if (!prepared.ok) return { ok: false, code: prepared.code, mutated: prepared.committed !== false, committed: prepared.committed };
    }
    deps.beforeStateWrite?.();
    if (!assertContinuityLockOwned(lock)) return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP", mutated: true, committed: false };
    const preparedProbe = readResultAuthority(dir, request.result);
    if (!preparedProbe.ok || preparedProbe.path !== resultFile.path || !preparedProbe.bytes.equals(preparedBytes)) {
      return { ok: false, code: preparedProbe.ok ? "PS-CONTINUITY-RESULT-CHANGED" : preparedProbe.code, mutated: true, committed: false };
    }
    const next = { ...existing.state, continuity: transition.state, updatedAt: (deps.now ?? (() => new Date().toISOString()))() };
    const written = atomicWriteContinuityState(dir, next, lock, deps);
    if (!written.ok) return { ok: false, code: written.code, mutated: true, committed: written.committed };
    return { ok: true, code: "PS-CONTINUITY-COURSE-BRIEF-COMMITTED", mutated: true, revision: transition.state.revision };
  }

  const postResultSha256 = resultFile.sha256;
  if (!committedCourseBriefStateMatches(current, request, expectedRevision, postResultSha256, briefBinding.sha256)) {
    return { ok: false, code: "PS-CONTINUITY-STALE", mutated: false };
  }
  const persisted = resultFile.decisionBriefs.find(({ briefId }) => briefId === request.brief.briefId);
  try {
    return persisted && canonicalDecisionJson(persisted) === spliced.raw
      ? { ok: true, code: "PS-CONTINUITY-DUPLICATE-COURSE-BRIEF", mutated: false, revision: current.revision }
      : { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: false };
  } catch { return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: false }; }
}

function decisionTxnForIntent(intent, intentSha256) {
  return {
    idempotencyKey: intent.idempotencyKey,
    briefSha256: intent.briefSha256,
    intentSha256,
    selectedOptionId: intent.optionId,
    preSelectionRevision: intent.expectedRevision,
    selectedRevision: intent.selectedRevision,
    dispatchableRevision: intent.dispatchableRevision,
    phase: "state-applied",
  };
}

function sameDecisionTxn(left, right) {
  return left !== null && right !== null
    && ["idempotencyKey", "briefSha256", "intentSha256", "selectedOptionId", "preSelectionRevision", "selectedRevision", "dispatchableRevision", "phase"]
      .every((key) => left[key] === right[key]);
}

function sameSelectedTransition(current, selectedTransition) {
  return sameJson(current.queueHead, selectedTransition.queueHead)
    && sameJson(current.blocker, selectedTransition.blocker)
    && sameJson(current.resume, selectedTransition.resume);
}

function resultEntryById(entries, key, value) {
  return entries.find((entry) => entry?.[key] === value) ?? null;
}

function selectedTransitionMatchesCourseOption(brief, intent, selectedTransition) {
  const option = brief.alternatives.find(({ optionId }) => optionId === intent.optionId);
  if (!option) return false;
  if (option.kind === "stop" || option.kind === "defer") {
    const dispositionDigest = sha256Canonical({
      schema: "pipeline.course-disposition.v1",
      kind: option.kind,
      idempotencyKey: intent.idempotencyKey,
      briefSha256: intent.briefSha256,
      optionId: option.optionId,
      blockerSignature: intent.blockerSignature,
      poEvidenceSha256: intent.poEvidenceSha256,
      preStateSha256: intent.preStateSha256,
      expectedRevision: intent.expectedRevision,
      selectedRevision: intent.selectedRevision,
      dispatchableRevision: intent.dispatchableRevision,
      resumePredicate: option.resumePredicate,
    });
    const retainsBoundBlocker = selectedTransition.queueHead === null
      && selectedTransition.blocker !== null
      && selectedTransition.blocker.type === "course"
      && selectedTransition.blocker.signature === `${option.kind}-${dispositionDigest.slice(0, 32)}`
      && selectedTransition.blocker.decisionBrief?.decisionBriefId === brief.briefId
      && selectedTransition.blocker.decisionBrief?.decisionBriefSha256 === intent.briefSha256;
    if (!retainsBoundBlocker) return false;
    return option.kind === "stop"
      ? selectedTransition.blocker.resumeCondition?.kind === "authority-update"
        && selectedTransition.blocker.resumeCondition?.evidenceSha256 === dispositionDigest
      : selectedTransition.blocker.resumeCondition?.kind === "po-decision"
        && selectedTransition.blocker.resumeCondition?.evidenceSha256 === dispositionDigest;
  }
  return selectedTransition.queueHead !== null
    && selectedTransition.queueHead.dispatch === null
    && selectedTransition.blocker === null
    && option.continuationTransitionSha256 === sha256Canonical(selectedTransition);
}

function resultAfterIntentMatchesPre(resultFile, intent, preResultSha256) {
  const spliced = spliceCourseArtifact(resultFile, "courseDecisionIntents", intent);
  if (!spliced.ok || !spliced.duplicate) return false;
  const prior = priorCourseArtifactBytes(resultFile, "courseDecisionIntents", spliced.raw);
  return prior !== null && sha256Bytes(prior) === preResultSha256;
}

function resultAfterReceiptMatchesIntent(resultFile, receipt, intentResultSha256) {
  const spliced = spliceCourseArtifact(resultFile, "courseDecisionReceipts", receipt);
  if (!spliced.ok || !spliced.duplicate) return false;
  const prior = priorCourseArtifactBytes(resultFile, "courseDecisionReceipts", spliced.raw);
  return prior !== null && sha256Bytes(prior) === intentResultSha256;
}

function persistedSelectionReceipt(resultFile, intentSha256, idempotencyKey) {
  return resultFile.courseDecisionReceipts.find((receipt) => receipt.intentSha256 === intentSha256
    && receipt.idempotencyKey === idempotencyKey && receipt.casOutcome === "applied") ?? null;
}

/* One locked write-ahead selection transaction: immutable intent, state-applied
 * marker, immutable receipt, then marker clear.  Each durable boundary is
 * recovered by its existing idempotency key; no stage derives a new identity. */
function runCourseSelectionTransaction(dir, existing, expectedRevision, request, lock, deps) {
  if (!exactObjectKeys(request, ["intent", "selectedTransition", "result"])
    || !exactObjectKeys(request.result, [...RESULT_BINDING_KEYS])
    || !exactObjectKeys(request.selectedTransition, ["queueHead", "blocker", "resume"])) {
    return { ok: false, code: "PS-CONTINUITY-REQUEST", mutated: false };
  }
  let current = existing.state.continuity;
  if (current === undefined || current.authority.result === null
    || !validateContinuityState(current, existing.state.activeFeature?.id).ok
    || current.authority.result.path !== request.result.path) {
    return { ok: false, code: "PS-CONTINUITY-RESULT-BINDING", mutated: false };
  }
  let resultFile = readResultAuthority(dir, request.result);
  if (!resultFile.ok) return { ok: false, code: resultFile.code, mutated: false };
  const brief = resultEntryById(resultFile.decisionBriefs, "briefId", request.intent?.briefId);
  if (!brief || brief.briefId !== request.intent.briefId || sha256Canonical(brief) !== request.intent.briefSha256) {
    return { ok: false, code: "PS-CONTINUITY-DECISION-BRIEF", mutated: false };
  }
  let intentVerdict;
  try {
    intentVerdict = validateCourseDecisionIntent(request.intent, {
      briefId: brief.briefId,
      briefSha256: request.intent.briefSha256,
      blockerSignature: request.intent.blockerSignature,
      optionIds: brief.alternatives.map(({ optionId }) => optionId),
    });
  } catch { return { ok: false, code: "PS-CONTINUITY-DECISION-INTENT", mutated: false }; }
  if (!intentVerdict.ok || request.intent.selectedTransitionSha256 !== sha256Canonical(request.selectedTransition)
    || !selectedTransitionMatchesCourseOption(brief, request.intent, request.selectedTransition)) {
    return { ok: false, code: "PS-CONTINUITY-DECISION-INTENT", mutated: false };
  }
  const txn = decisionTxnForIntent(request.intent, intentVerdict.sha256);

  if (current.revision === expectedRevision) {
    let preStateBytes;
    try { preStateBytes = readFileSync(statePath(dir)); } catch { return { ok: false, code: "PS-CONTINUITY-STATE-IO", mutated: false }; }
    if (current.decisionTxn !== null || current.blocker === null || current.blocker.type !== "course"
      || current.blocker.signature !== request.intent.blockerSignature
      || current.blocker.decisionBrief?.decisionBriefId !== brief.briefId
      || current.blocker.decisionBrief?.decisionBriefSha256 !== request.intent.briefSha256
      || brief.revision !== current.revision
      || current.authority.result.sha256 !== request.result.preResultSha256
      || sha256Bytes(preStateBytes) !== request.intent.preStateSha256
      || request.intent.expectedRevision !== expectedRevision) {
      return { ok: false, code: "PS-CONTINUITY-DECISION-STALE", mutated: false };
    }
    const splicedIntent = spliceCourseArtifact(resultFile, "courseDecisionIntents", request.intent);
    if (!splicedIntent.ok) return { ok: false, code: splicedIntent.code, mutated: false };
    let intentBytes;
    let intentAlreadyPrepared = false;
    if (resultFile.sha256 === request.result.preResultSha256) {
      if (splicedIntent.duplicate) return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: false };
      intentBytes = splicedIntent.bytes;
    } else {
      const prior = priorCourseArtifactBytes(resultFile, "courseDecisionIntents", splicedIntent.raw);
      if (!splicedIntent.duplicate || prior === null || sha256Bytes(prior) !== request.result.preResultSha256) {
        return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: false };
      }
      intentBytes = resultFile.bytes;
      intentAlreadyPrepared = true;
    }
    const intentResultSha256 = sha256Bytes(intentBytes);
    const selected = applyCourseDecisionIntent(current, {
      expectedRevision,
      result: { path: request.result.path, sha256: intentResultSha256 },
      decisionTxn: txn,
      ...request.selectedTransition,
    }, current.featureId);
    if (!selected.ok || !selected.mutated) return { ok: false, code: selected.code, mutated: intentAlreadyPrepared };
    if (!intentAlreadyPrepared) {
      const prepared = atomicWriteResult(resultFile, intentBytes, lock, deps);
      if (!prepared.ok) return { ok: false, code: prepared.code, mutated: prepared.committed !== false, committed: prepared.committed };
    }
    if (!assertContinuityLockOwned(lock)) return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP", mutated: true, committed: false };
    const intentProbe = readResultAuthority(dir, request.result);
    if (!intentProbe.ok || !intentProbe.bytes.equals(intentBytes)) {
      return { ok: false, code: intentProbe.ok ? "PS-CONTINUITY-RESULT-CHANGED" : intentProbe.code, mutated: true, committed: false };
    }
    const selectedRoot = { ...existing.state, continuity: selected.state, updatedAt: (deps.now ?? (() => new Date().toISOString()))() };
    const selectedBytes = Buffer.from(JSON.stringify(selectedRoot, null, 2) + "\n", "utf8");
    const stateWrite = atomicWriteContinuityState(dir, selectedRoot, lock, deps);
    if (!stateWrite.ok) return { ok: false, code: stateWrite.code, mutated: true, committed: stateWrite.committed };
    current = selected.state;
    resultFile = intentProbe;
    if (!readFileSync(statePath(dir)).equals(selectedBytes)) {
      return { ok: false, code: "PS-CONTINUITY-STATE-CHANGED", mutated: true, committed: false };
    }
  }

  if (current.revision === request.intent.selectedRevision) {
    let selectedStateBytes;
    try { selectedStateBytes = readFileSync(statePath(dir)); } catch { return { ok: false, code: "PS-CONTINUITY-STATE-IO", mutated: true }; }
    if (!sameDecisionTxn(current.decisionTxn, txn)
      || !sameSelectedTransition(current, request.selectedTransition)
      || sha256Bytes(selectedStateBytes) === request.intent.preStateSha256) {
      return { ok: false, code: "PS-CONTINUITY-DECISION-CONFLICT", mutated: true };
    }
    const receipt = {
      schema: "pipeline.course-decision-receipt.v1",
      idempotencyKey: request.intent.idempotencyKey,
      intentSha256: intentVerdict.sha256,
      briefSha256: request.intent.briefSha256,
      blockerSignature: request.intent.blockerSignature,
      optionId: request.intent.optionId,
      preStateSha256: request.intent.preStateSha256,
      postStateSha256: sha256Bytes(selectedStateBytes),
      preRevision: request.intent.expectedRevision,
      postRevision: request.intent.selectedRevision,
      casOutcome: "applied",
    };
    let receiptVerdict;
    try { receiptVerdict = validateCourseDecisionReceipt(receipt, request.intent); } catch { return { ok: false, code: "PS-CONTINUITY-DECISION-RECEIPT", mutated: true }; }
    if (!receiptVerdict.ok) return { ok: false, code: "PS-CONTINUITY-DECISION-RECEIPT", mutated: true };
    const splicedReceipt = spliceCourseArtifact(resultFile, "courseDecisionReceipts", receipt);
    if (!splicedReceipt.ok) return { ok: false, code: splicedReceipt.code, mutated: true };
    let receiptBytes;
    if (resultFile.sha256 === current.authority.result.sha256) {
      if (!resultAfterIntentMatchesPre(resultFile, request.intent, request.result.preResultSha256)
        || splicedReceipt.duplicate) return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: true };
      receiptBytes = splicedReceipt.bytes;
      const receiptWrite = atomicWriteResult(resultFile, receiptBytes, lock, deps);
      if (!receiptWrite.ok) return { ok: false, code: receiptWrite.code, mutated: receiptWrite.committed !== false, committed: receiptWrite.committed };
    } else {
      if (!resultAfterReceiptMatchesIntent(resultFile, receipt, current.authority.result.sha256)) {
        return { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: true };
      }
      receiptBytes = resultFile.bytes;
    }
    const receiptResultSha256 = sha256Bytes(receiptBytes);
    if (!assertContinuityLockOwned(lock)) return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP", mutated: true, committed: false };
    const receiptProbe = readResultAuthority(dir, request.result);
    if (!receiptProbe.ok || !receiptProbe.bytes.equals(receiptBytes)) {
      return { ok: false, code: receiptProbe.ok ? "PS-CONTINUITY-RESULT-CHANGED" : receiptProbe.code, mutated: true, committed: false };
    }
    const cleared = clearCourseDecisionReceipt(current, {
      expectedRevision: current.revision,
      result: { path: request.result.path, sha256: receiptResultSha256 },
      receipt: {
        idempotencyKey: receipt.idempotencyKey,
        briefSha256: receipt.briefSha256,
        intentSha256: receipt.intentSha256,
        selectedOptionId: receipt.optionId,
        receiptSha256: receiptVerdict.sha256,
        selectedRevision: receipt.postRevision,
        dispatchableRevision: request.intent.dispatchableRevision,
      },
    }, current.featureId);
    if (!cleared.ok || !cleared.mutated) return { ok: false, code: cleared.code, mutated: true };
    const clearedRoot = { ...existing.state, continuity: cleared.state, updatedAt: (deps.now ?? (() => new Date().toISOString()))() };
    const clearWrite = atomicWriteContinuityState(dir, clearedRoot, lock, deps);
    if (!clearWrite.ok) return { ok: false, code: clearWrite.code, mutated: true, committed: clearWrite.committed };
    return { ok: true, code: "PS-CONTINUITY-COURSE-SELECTION-COMMITTED", mutated: true, revision: cleared.state.revision };
  }

  if (current.revision === request.intent.dispatchableRevision && current.decisionTxn === null
    && current.authority.result.sha256 === resultFile.sha256
    && sameSelectedTransition(current, request.selectedTransition)) {
    const receipt = persistedSelectionReceipt(resultFile, intentVerdict.sha256, request.intent.idempotencyKey);
    return receipt && receipt.briefSha256 === request.intent.briefSha256 && receipt.optionId === request.intent.optionId
      ? { ok: true, code: "PS-CONTINUITY-DUPLICATE-COURSE-SELECTION", mutated: false, revision: current.revision }
      : { ok: false, code: "PS-CONTINUITY-RESULT-CONFLICT", mutated: false };
  }
  return { ok: false, code: "PS-CONTINUITY-STALE", mutated: false };
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
    if (sub === "continuity-record-course-brief") {
      const transaction = runCourseBriefTransaction(dir, existing, expected.value, request.value, lock, deps);
      if (!transaction.ok) {
        const disposition = transaction.committed === null
          ? "commit disposition is indeterminate"
          : transaction.mutated
            ? "Result prepare may be durable; mutation is NOT reported as zero"
            : "zero State and Result mutation";
        console.error(`Error: continuity course-brief transaction refused (${transaction.code}); ${disposition}.`);
        return 2;
      }
      console.log(`${transaction.code}: continuity revision ${transaction.revision}; ${transaction.mutated ? "transaction persisted" : "accepted with zero mutation"}.`);
      return 0;
    }
    if (sub === "continuity-select-course") {
      const transaction = runCourseSelectionTransaction(dir, existing, expected.value, request.value, lock, deps);
      if (!transaction.ok) {
        const disposition = transaction.committed === null
          ? "commit disposition is indeterminate"
          : transaction.mutated
            ? "a write-ahead stage may be durable; mutation is NOT reported as zero"
            : "zero State and Result mutation";
        console.error(`Error: continuity course-selection transaction refused (${transaction.code}); ${disposition}.`);
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

/* Publication adapter (BTM-E1/E3, PO decision 7A).  The canonical local
 * authority owns its own mode-0600 record, CAS and lock.  This State writer
 * holds its lock first and persists only the returned redacted reference. */
function defaultGitCommonDir(dir) {
  const result = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: dir, encoding: "utf8" });
  if (result.error || result.status !== 0 || !result.stdout?.trim()) return { ok: false, code: "PS-PUBLICATION-GIT-COMMON-DIR" };
  const raw = result.stdout.trim();
  return { ok: true, path: realpathSync(resolve(dir, raw)) };
}

function emptyPublicationProjection() {
  return {
    schema: PUBLICATION_PROJECTION_SCHEMA,
    channels: { private: null, "neutral-public": null },
    authorizedPushes: [],
  };
}

function publicationIdIsSafe(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:@/-]{1,200}$/.test(value) && !value.split("/").includes("..");
}

function publicationAuthorization(value) {
  return {
    schema: PUBLICATION_AUTHORIZATION_SCHEMA,
    channel: value.channel,
    transactionId: value.transactionId,
    revision: value.revision,
    stateDigest: publicationDigest(value),
    command: [...value.pushIntent.command],
    authorization: {
      approvalId: value.approval.id,
      consumedAt: value.approval.consumedAt,
      tupleDigest: value.approval.tupleDigest,
    },
    status: "push-authorized",
  };
}

function validPublicationProjection(value) {
  if (!exactObjectKeys(value, ["schema", "channels", "authorizedPushes"])
    || value.schema !== PUBLICATION_PROJECTION_SCHEMA
    || !exactObjectKeys(value.channels, ["private", "neutral-public"])
    || !Array.isArray(value.authorizedPushes)) return false;
  for (const channel of ["private", "neutral-public"]) {
    const ref = value.channels[channel];
    if (ref === null) continue;
    if (!exactObjectKeys(ref, ["schema", "transactionId", "channel", "phase", "candidateOid", "candidateTree", "destinationRef", "projectionRawSha256", "publicationStateSha256", "receiptDigest"])
      || ref.schema !== PUBLICATION_AUTHORITY_REFERENCE_SCHEMA || ref.channel !== channel
      || !publicationIdIsSafe(ref.transactionId) || !SHA256_RE.test(ref.projectionRawSha256 ?? "")
      || !SHA256_RE.test(ref.publicationStateSha256 ?? "") || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref.candidateOid ?? "")
      || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref.candidateTree ?? "")
      || typeof ref.destinationRef !== "string" || (ref.receiptDigest !== null && !SHA256_RE.test(ref.receiptDigest ?? ""))) return false;
  }
  return value.authorizedPushes.every((entry) => {
    const ref = value.channels[entry?.channel];
    return exactObjectKeys(entry, ["schema", "channel", "transactionId", "revision", "stateDigest", "command", "authorization", "status"])
      && entry.schema === PUBLICATION_AUTHORIZATION_SCHEMA && ["private", "neutral-public"].includes(entry.channel)
      && publicationIdIsSafe(entry.transactionId) && Number.isInteger(entry.revision) && entry.revision >= 0
      && SHA256_RE.test(entry.stateDigest ?? "") && Array.isArray(entry.command) && entry.status === "push-authorized"
      && ref !== null && ref !== undefined && ref.transactionId === entry.transactionId && ref.publicationStateSha256 === entry.stateDigest
      && entry.command.length === 5 && entry.command[0] === "git" && entry.command[1] === "push" && entry.command[2] === "--porcelain"
      && typeof entry.command[3] === "string" && entry.command[3] !== "" && entry.command[4] === `${ref.candidateOid}:${ref.destinationRef}`
      && exactObjectKeys(entry.authorization, ["approvalId", "consumedAt", "tupleDigest"])
      && publicationIdIsSafe(entry.authorization.approvalId) && Number.isSafeInteger(entry.authorization.consumedAt)
      && SHA256_RE.test(entry.authorization.tupleDigest ?? "");
  });
}

function projectPublication(base, authority) {
  const value = authority.record.publication;
  const prior = base.publication;
  if (prior !== undefined && !validPublicationProjection(prior)) throw new Error("publication State projection invalid");
  const projection = prior === undefined ? emptyPublicationProjection() : structuredClone(prior);
  if (!Object.prototype.hasOwnProperty.call(projection.channels, value.channel)) throw new Error("publication channel projection invalid");
  if (projection.authorizedPushes.some((entry) => entry?.channel === value.channel && entry?.transactionId !== value.transactionId)) {
    throw new Error("publication channel has an unconsumed authorization");
  }
  projection.channels[value.channel] = authority.reference;
  projection.authorizedPushes = projection.authorizedPushes.filter((entry) => entry?.transactionId !== value.transactionId);
  if (authority.record.status === "active" && value.phase === "push-authorized") projection.authorizedPushes.push(publicationAuthorization(value));
  return projection;
}

function parsePublicationExpected(value) {
  if (value === "absent") return { ok: true, value: "absent" };
  return Number.isInteger(value) && value >= 0 ? { ok: true, value } : { ok: false };
}

function publicationReplayMatches(sub, current, expectedRevision, expectedDigest, input) {
  if (current === null || current.revision !== expectedRevision + 1 || current.priorStateSha256 !== expectedDigest) return false;
  if (sub === "publication-approve") {
    return exactObjectKeys(input, ["approvalId", "attribution", "approvedAt", "expiresAt"])
      && current.phase === "approved" && current.approval?.id === input.approvalId
      && current.approval?.attribution === input.attribution && current.approval?.approvedAt === input.approvedAt
      && current.approval?.expiresAt === input.expiresAt && current.approval?.consumedAt === null;
  }
  if (sub === "publication-authorize") {
    return exactObjectKeys(input, ["now", "command"]) && current.phase === "push-authorized"
      && current.pushIntent?.authorizedAt === input.now && sameJson(current.pushIntent?.command, input.command)
      && current.approval?.consumedAt === input.now;
  }
  if (sub === "publication-observe") {
    return exactObjectKeys(input, ["observedOid", "observedAt", "status"])
      && current.observation?.status === input.status && current.observation?.oid === input.observedOid
      && current.observation?.observedAt === input.observedAt;
  }
  if (sub === "publication-block") {
    return false; // block is an authority envelope, handled separately below.
  }
  if (sub === "publication-start-readback") {
    return exactObjectKeys(input, ["repositoryKind", "alternatesDisabled", "destinationRef"])
      && current.phase === "readback-running" && sameJson(current.readback, {
        repositoryKind: input.repositoryKind, alternatesDisabled: input.alternatesDisabled,
        destinationRef: input.destinationRef, oid: null, tree: null, completedAt: null,
      });
  }
  if (sub === "publication-close") {
    return exactObjectKeys(input, ["fetchedRef", "fetchedOid", "fetchedTree", "completedAt"])
      && current.phase === "closed" && current.readback?.destinationRef === input.fetchedRef
      && current.readback?.oid === input.fetchedOid && current.readback?.tree === input.fetchedTree
      && current.readback?.completedAt === input.completedAt;
  }
  if (sub === "publication-rearm") {
    return exactObjectKeys(input, ["freshPreimageOid", "candidateDescendsFromFreshPreimage", "attended", "priorUncertaintyDigest"])
      && current.phase === "prepared" && current.remotePreimageOid === input.freshPreimageOid
      && current.ancestry?.baseOid === input.freshPreimageOid && current.approval === null
      && current.pushIntent === null && current.observation === null && current.readback === null;
  }
  return false;
}

function runPublicationCommand(sub, flags, deps) {
  const dir = deps.dir ?? projectDir();
  const request = readContinuityRequest(dir, flags["request-file"]);
  if (!request.ok || !exactObjectKeys(request.value, ["schema", "transactionId", "expectedRevision", "expectedStateSha256", "input"])
    || request.value.schema !== PUBLICATION_COMMAND_SCHEMA
    || !publicationIdIsSafe(request.value.transactionId)
    || !Object.prototype.hasOwnProperty.call(request.value, "expectedRevision")
    || !Object.prototype.hasOwnProperty.call(request.value, "expectedStateSha256")
    || !Object.prototype.hasOwnProperty.call(request.value, "input")) {
    console.error(`Error: ${sub} requires a closed ${PUBLICATION_COMMAND_SCHEMA} --request-file.`);
    return 2;
  }
  const expected = parsePublicationExpected(request.value.expectedRevision);
  if (!expected.ok || (expected.value === "absent") !== (request.value.expectedStateSha256 === null)
    || (expected.value !== "absent" && !SHA256_RE.test(request.value.expectedStateSha256 ?? ""))) {
    console.error(`Error: ${sub} publication CAS tuple is invalid.`);
    return 2;
  }
  const lock = acquireContinuityLock(dir, LEGACY_WRITER_LOCK_TOKEN, deps);
  if (!lock.ok) { console.error(`Error: publication writer refused (${lock.code}).`); return 2; }
  try {
    const existing = readState(dir);
    if (existing.status === "malformed") { console.error("Error: publication writer requires valid State."); return 2; }
    const common = (deps.gitCommonDir ?? defaultGitCommonDir)(dir);
    if (!common?.ok) { console.error(`Error: publication common directory unavailable (${common?.code ?? "PS-PUBLICATION-GIT-COMMON-DIR"}).`); return 2; }
    const base = existing.status === "ok" ? existing.state : { schema: SCHEMA_ID };
    let prior;
    try {
      if (base.publication !== undefined && !validPublicationProjection(base.publication)) throw new Error("State publication projection invalid");
      prior = base.publication?.channels
        ? (Object.values(base.publication.channels).find((reference) => reference?.transactionId === request.value.transactionId) ?? null)
        : null;
    } catch (error) { console.error(`Error: publication writer refused (${error.message}).`); return 2; }
    const input = request.value.input;
    let authority;
    let replay = false;
    try {
      if (sub === "publication-prepare") {
        if (expected.value !== "absent" || input?.transactionId !== request.value.transactionId) throw new Error("prepare stale");
        if (base.publication?.authorizedPushes?.some((entry) => entry?.channel === input.channel && entry?.transactionId !== request.value.transactionId)) {
          throw new Error("publication channel has an unconsumed authorization");
        }
        let priorAuthority = null;
        try { priorAuthority = readPublicationAuthority({ gitCommonDir: common.path, transactionId: request.value.transactionId }); } catch { /* first prepare */ }
        authority = preparePublicationAuthority({ gitCommonDir: common.path, input,
          expectedRawSha256: priorAuthority?.rawDigest ?? null, heldLocks: ["pipeline-state"] });
        replay = authority.written === false;
      } else if (sub === "publication-reconcile") {
        if (expected.value === "absent" || prior === null
          || !exactObjectKeys(input, ["authorityRawSha256"])
          || !SHA256_RE.test(input.authorityRawSha256 ?? "")) {
          throw new Error("publication reconciliation tuple invalid");
        }
        const observed = readPublicationAuthority({
          gitCommonDir: common.path,
          transactionId: request.value.transactionId,
          channel: prior.channel,
        });
        if (observed.rawDigest !== input.authorityRawSha256
          || !new Set(["executing", "consumed"]).has(observed.record.status)) {
          throw new Error("publication executor authority is not reconcilable");
        }
        const alreadyProjected = sameJson(prior, observed.reference)
          && !base.publication.authorizedPushes.some((entry) => entry?.transactionId === request.value.transactionId);
        if (!alreadyProjected
          && (prior.phase !== "push-authorized"
            || prior.publicationStateSha256 !== request.value.expectedStateSha256
            || observed.record.publication.revision < expected.value)) {
          throw new Error("State publication reference stale");
        }
        authority = observed;
        replay = alreadyProjected;
      } else {
        if (expected.value === "absent") throw new Error("stale publication CAS");
        if (prior !== null) {
          if (prior.publicationStateSha256 !== request.value.expectedStateSha256) throw new Error("State publication reference stale");
          const observed = readPublicationAuthority({ gitCommonDir: common.path, transactionId: request.value.transactionId, channel: prior.channel });
          if (observed.rawDigest !== prior.projectionRawSha256) {
            if (sub === "publication-block") {
              if (observed.record.status !== "blocked" || observed.record.publication.revision !== expected.value
                || publicationDigest(observed.record.publication) !== request.value.expectedStateSha256
                || !exactObjectKeys(input, ["reason", "reasonDigest", "blockedAt"])
                || observed.record.block?.reason !== input.reason || observed.record.block?.reasonDigest !== input.reasonDigest
                || observed.record.block?.blockedAt !== input.blockedAt) throw new Error("State recovery tuple mismatch");
            } else if (observed.record.status !== "active" || !publicationReplayMatches(sub, observed.record.publication, expected.value, request.value.expectedStateSha256, input)) {
              throw new Error("State recovery tuple mismatch");
            }
            authority = observed; replay = true;
          }
          if (authority !== undefined) {
            // The local authority durably advanced before State; only repair its
            // redacted projection.  Never attempt a second local transition.
          } else {
          const operation = {
            "publication-approve": approvePublicationAuthority,
            "publication-authorize": authorizePublicationAuthority,
            "publication-observe": observePublicationAuthority,
            "publication-start-readback": startPublicationReadback,
            "publication-close": closePublicationAuthority,
            "publication-rearm": rearmPublicationAuthority,
          }[sub];
          if (sub === "publication-block") {
            authority = blockPublicationAuthority({ gitCommonDir: common.path, transactionId: request.value.transactionId, channel: prior.channel,
              expectedRawSha256: prior.projectionRawSha256, expectedRevision: expected.value, expectedStateSha256: request.value.expectedStateSha256,
              ...input, heldLocks: ["pipeline-state"] });
          } else if (operation) {
            authority = operation({ gitCommonDir: common.path, transactionId: request.value.transactionId, channel: prior.channel,
              expectedRawSha256: prior.projectionRawSha256, expectedRevision: expected.value, expectedStateSha256: request.value.expectedStateSha256,
              ...input, heldLocks: ["pipeline-state"] });
          } else throw new Error("command invalid");
          }
        } else {
          const recovered = readPublicationAuthority({ gitCommonDir: common.path, transactionId: request.value.transactionId });
          if (sub === "publication-block") {
            if (recovered.record.status !== "blocked" || recovered.record.publication.revision !== expected.value
              || publicationDigest(recovered.record.publication) !== request.value.expectedStateSha256
              || !exactObjectKeys(input, ["reason", "reasonDigest", "blockedAt"])
              || recovered.record.block?.reason !== input.reason || recovered.record.block?.reasonDigest !== input.reasonDigest
              || recovered.record.block?.blockedAt !== input.blockedAt) throw new Error("State recovery tuple mismatch");
          } else if (recovered.record.status !== "active" || !publicationReplayMatches(sub, recovered.record.publication, expected.value, request.value.expectedStateSha256, input)) {
            throw new Error("State recovery tuple mismatch");
          }
          authority = recovered; replay = true;
        }
      }
    } catch (error) {
      console.error(`Error: ${sub} refused (${error?.message ?? "publication authority transition invalid"}); zero State mutation.`);
      return 2;
    }
    let projection;
    try { projection = projectPublication(base, authority); } catch { console.error("Error: State publication projection invalid."); return 2; }
    if (sameJson(base.publication, projection)) {
      console.log(`${sub}: exact durable replay accepted; State projection already matches ${authority.record.publication.revision}.`);
      return 0;
    }
    const nextState = { ...base, schema: SCHEMA_ID, publication: projection, updatedAt: (deps.now ?? (() => new Date().toISOString()))() };
    const written = atomicWriteContinuityState(dir, nextState, lock, deps);
    if (!written.ok) {
      console.error(`Error: local publication authority is durable but State projection is unresolved (${written.code}); retry only with the exact same CAS tuple to repair State.`);
      return 2;
    }
    const value = authority.record.publication;
    console.log(`${sub}: ${value.channel}/${value.transactionId} revision ${value.revision} is ${value.phase}${replay ? " (State projection repaired)" : ""}.`);
    return 0;
  } finally { releaseContinuityLock(lock); }
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

/** Closed parser for commands whose entire argument surface is part of their CAS tuple. */
function parseExactFlags(argv, names) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (typeof raw !== "string" || !raw.startsWith("--")) return { ok: false };
    const name = raw.slice(2);
    const value = argv[i + 1];
    if (!names.has(name) || Object.prototype.hasOwnProperty.call(out, name)
      || value === undefined || (typeof value === "string" && value.startsWith("--"))) return { ok: false };
    out[name] = value;
    i++;
  }
  return Object.keys(out).length === names.size ? { ok: true, value: out } : { ok: false };
}

const GATE_ESTIMATE_ID_RE = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const GATE_ESTIMATE_SET_FLAGS = new Set([
  "id", "expected-current-id", "feature-id", "gate", "object-format", "source-oid",
  "evidence-path", "evidence-sha256", "min-minutes", "max-minutes", "by",
]);

function parseGateEstimateSetFlags(argv) {
  const parsed = parseExactFlags(argv, GATE_ESTIMATE_SET_FLAGS);
  if (!parsed.ok) return { ok: false };
  const value = parsed.value;
  const min = Number(value["min-minutes"]);
  const max = Number(value["max-minutes"]);
  if (value.by !== "coordinator" || value.id === "absent" || !GATE_ESTIMATE_ID_RE.test(value.id)
    || !(value["expected-current-id"] === "absent" || GATE_ESTIMATE_ID_RE.test(value["expected-current-id"]))
    || !Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return { ok: false };
  return {
    ok: true,
    value: {
      id: value.id,
      expectedCurrentId: value["expected-current-id"],
      featureId: value["feature-id"],
      gate: value.gate,
      objectFormat: value["object-format"],
      sourceOid: value["source-oid"],
      evidencePath: value["evidence-path"],
      evidenceSha256: value["evidence-sha256"],
      rangeMinutes: { min, max },
      recordedBy: "coordinator",
    },
  };
}

function observeGateEstimateInputs(dir, request, deps) {
  const observation = (deps.observeGitSource ?? observeGitSource)(dir);
  if (!observation?.ok) return { ok: false, code: "PS-GATE-ESTIMATE-SOURCE" };
  let evidence;
  try {
    evidence = (deps.readGateEstimateEvidence ?? readGateEstimateEvidence)(dir, request.evidencePath);
  } catch {
    return { ok: false, code: "PS-GATE-ESTIMATE-EVIDENCE" };
  }
  if (!evidence?.ok) return { ok: false, code: "PS-GATE-ESTIMATE-EVIDENCE" };
  return { ok: true, observation, evidence };
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === "";
}

/**
 * HAW-0's frozen transition accepts the pre-authority two-field approval. The
 * prior writer also persisted its now-superseded v1 PO snapshot, so recognize
 * only that exact historical envelope and project its original attribution for
 * the one-time replacement. The lock/CAS still binds the unprojected State.
 */
function projectV1LegacyApprovalForSpecBind(state, expectedPlanSha256) {
  const approval = state?.planApproval;
  const authority = approval?.poGateAuthority;
  if (
    !exactObjectKeys(approval, LEGACY_PLAN_APPROVAL_KEYS)
    || !exactObjectKeys(authority, LEGACY_PO_GATE_AUTHORITY_KEYS)
    || authority.schema !== "pipeline.po-gate-authority-evidence.v1"
    || (authority.humanFacing !== "de" && authority.humanFacing !== "en")
    || !SHA256_RE.test(authority.sourceSha256)
    || !SHA256_RE.test(authority.runtimeSha256)
    || !SHA256_RE.test(authority.receiptSha256)
    || !SHA256_RE.test(authority.repositoryFingerprint)
    || authority.planPath !== state?.activeFeature?.planPath
    || authority.planSha256 !== expectedPlanSha256
  ) return state;
  return {
    ...state,
    planApproval: { approvedBy: approval.approvedBy, approvedAt: approval.approvedAt },
  };
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

function legacyRegularArtifact(dir, artifact, expectedPath, expectedSha) {
  if (!artifact || artifact.path !== expectedPath || artifact.sha256 !== expectedSha) return false;
  const absolute = resolve(dir, artifact.path);
  if (relative(resolve(dir), absolute).startsWith(`..${sep}`) || !absolute.startsWith(`${resolve(dir)}${sep}`)) return false;
  try {
    const st = lstatSync(absolute);
    if (!st.isFile()) return false;
    return sha256Bytes(readFileSync(absolute)) === expectedSha;
  } catch { return false; }
}

function exactLegacyRequest(request) {
  return request && typeof request === "object" && !Array.isArray(request)
    && Object.keys(request).length === 6
    && ["expectedRevision", "currentPrd", "spec", "result", "closeEvidence", "history"]
      .every((key) => Object.prototype.hasOwnProperty.call(request, key));
}

function legacyGitObservation(dir, deps = {}) {
  if (deps.legacyGitObservation) return deps.legacyGitObservation(dir);
  const runGit = (args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: args[0] === "ls-remote" ? 30_000 : 5_000 });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const tagObject = runGit(["rev-parse", "v0.4.6^{tag}"]);
  const head = runGit(["rev-parse", "HEAD"]);
  const commit = runGit(["rev-parse", "v0.4.6^{}"]);
  const tree = commit ? runGit(["rev-parse", `${commit}^{tree}`]) : null;
  const remote = runGit(["ls-remote", "origin", "refs/heads/main"]);
  const remoteTag = runGit(["ls-remote", "origin", "refs/tags/v0.4.6"]);
  const remoteTagDeref = runGit(["ls-remote", "origin", "refs/tags/v0.4.6^{}"]);
  const historicalRaw = spawnSync("git", ["show", "7a62a4ef9febba844cf5be8a659177b37c6a5:specs/2026-07-25-codex-onboarding-0.4.5/prd_codex-onboarding-0.4.5.md"], { cwd: dir, encoding: null, timeout: 5_000 });
  return { tagObject, head, commit, tree, remoteCommit: remote ? remote.split(/\s+/)[0] : null,
    remoteTagObject: remoteTag ? remoteTag.split(/\s+/)[0] : null,
    remoteTagCommit: remoteTagDeref ? remoteTagDeref.split(/\s+/)[0] : null,
    historicalPrdSha256: historicalRaw.status === 0 ? sha256Bytes(historicalRaw.stdout) : null };
}

function validateLegacyAdoptionEnvironment(dir, state, request, deps = {}) {
  const authority = state.planApproval?.poGateAuthority;
  const af = state.activeFeature;
  const a = LEGACY_ADOPTION;
  const authorityKeys = ["schema","humanFacing","sourceSha256","runtimeSha256","receiptSha256","repositoryFingerprint","planPath","planSha256","specPath","specSha256"];
  const rootKeys = ["schema","activeFeature","planApproved","updatedAt","planApproval","continuity"];
  if (Object.keys(state).length !== rootKeys.length || !rootKeys.every((key) => Object.hasOwn(state, key))) return { ok: false, code: "CS-LEGACY-ROOT" };
  if (!exactObjectKeys(af, ["id","planPath","phase"])
    || !exactObjectKeys(state.planApproval, ["schema","approvedBy","approvedAt","specBoundBy","specBoundAt","poGateAuthority"])) return { ok: false, code: "CS-LEGACY-ROOT" };
  if (state.schema !== SCHEMA_ID || !af || af.id !== a.featureId
    || af.planPath !== a.currentPrdPath || af.phase !== "implementation" || state.planApproved !== true
    || !authority || Object.keys(authority).length !== authorityKeys.length || !authorityKeys.every((key) => Object.hasOwn(authority, key))
    || state.updatedAt !== "2026-07-26T14:08:37.500Z"
    || state.planApproval.schema !== "pipeline.plan-approval.v2"
    || state.planApproval.approvedBy !== "PO" || state.planApproval.approvedAt !== "2026-07-26T14:08:37.500Z"
    || state.planApproval.specBoundBy !== "PO" || state.planApproval.specBoundAt !== "2026-07-26T14:08:37.500Z"
    || authority.schema !== "pipeline.po-gate-authority.v2" || authority.humanFacing !== "en"
    || authority.sourceSha256 !== "2a0f69551b46963d6d49ef0faaf9db5c28d27c4f681a9d4dd0be1a81b297da10"
    || authority.runtimeSha256 !== "071b0236f6054bbeea2140830320a88d1c6a9e733d7294ad0bb976fd2e28c897"
    || authority.receiptSha256 !== "c4fc5171dc507a81908b30137bbf537355626f957d1ccbb9bee3a8ae9db02aa2"
    || authority.repositoryFingerprint !== "6af2655d04c85a0e2faff67dedc2116a845874502dbe31c20e4c28372ea7885f"
    || authority.planPath !== af.planPath || authority.planSha256 !== a.currentPrdSha256
    || authority.specPath !== a.specPath
    || authority.specSha256 !== a.specSha256
    || ![authority.sourceSha256, authority.runtimeSha256, authority.receiptSha256, authority.repositoryFingerprint, authority.planSha256, authority.specSha256].every((v) => SHA256_RE.test(v))) return { ok: false, code: "CS-LEGACY-ROOT" };
  const req = request || {};
  if (!exactLegacyRequest(req)) return { ok: false, code: "CS-LEGACY-REQUEST" };
  if (!legacyRegularArtifact(dir, req.currentPrd, a.currentPrdPath, a.currentPrdSha256)
    || !legacyRegularArtifact(dir, req.spec, a.specPath, a.specSha256)
    || !legacyRegularArtifact(dir, req.result, a.resultPath, a.resultSha256)
    || !legacyRegularArtifact(dir, req.closeEvidence, a.closeEvidencePath, a.closeEvidenceSha256)) return { ok: false, code: "CS-LEGACY-ARTIFACT" };
  const historical = req.history;
  if (!exactObjectKeys(historical, ["commit", "path", "sha256"])
    || historical.commit !== a.historicalPrdCommit || historical.path !== a.currentPrdPath || historical.sha256 !== a.prdSha256) return { ok: false, code: "CS-LEGACY-HISTORY" };
  const observed = legacyGitObservation(dir, deps);
  // The candidate checkout may legitimately be ahead of the released v0.4.6
  // commit.  The adoption proof binds the tag, dereferenced tag, tree, remote
  // branch/tag observations and historical PRD -- not the candidate HEAD.
  if (!observed || observed.tagObject !== a.releaseTagObject || observed.commit !== a.releaseCommit || observed.tree !== a.releaseTree || observed.remoteCommit !== a.releaseCommit || observed.remoteTagObject !== a.releaseTagObject || observed.remoteTagCommit !== a.releaseCommit || observed.historicalPrdSha256 !== a.prdSha256) return { ok: false, code: "CS-LEGACY-RELEASE" };
  return { ok: true, observed };
}

function readStateRaw(dir) {
  try {
    const raw = readFileSync(statePath(dir));
    if (raw.byteLength > CONTINUITY_STATE_MAX_BYTES) return { status: "malformed" };
    const state = JSON.parse(raw.toString("utf8"));
    if (!state || typeof state !== "object" || Array.isArray(state)
      || (state.schema !== undefined && state.schema !== SCHEMA_ID)) return { status: "malformed" };
    return { status: "ok", state, raw };
  } catch { return { status: "absent" }; }
}

function buildLegacyAdoptionPlan(dir, request, deps, existing) {
  const proposal = planLegacyContinuityAdoption(existing.state.continuity, request);
  if (!proposal.ok) return proposal;
  const environment = validateLegacyAdoptionEnvironment(dir, existing.state, request, deps);
  if (!environment.ok) return environment;
  const payload = {
    schema: "pipeline.continuity-result-adoption-plan.v0",
    root: realpathSync(dir),
    stateSha256: sha256Bytes(existing.raw),
    stateUpdatedAt: existing.state.updatedAt ?? null,
    expectedRevision: existing.state.continuity.revision,
    request,
    artifacts: { currentPrd: request.currentPrd, spec: request.spec, result: request.result, closeEvidence: request.closeEvidence, history: request.history },
    release: environment.observed,
  };
  return { ok: true, payload, planSha256: sha256Bytes(JSON.stringify(payload)) };
}

function runLegacyAdoptionCommand(sub, flags, deps) {
  const dir = deps.dir;
  const existing = readStateRaw(dir);
  if (existing.status !== "ok" || !existing.state.continuity) {
    console.error("Error: legacy continuity adoption requires a valid active continuity state.");
    return 2;
  }
  if (isBlank(flags["request-file"])) {
    console.error(`Error: ${sub} requires --request-file <repo-relative-json>.`);
    return 2;
  }
  const request = readContinuityRequest(dir, flags["request-file"]);
  if (!request.ok || !request.value || typeof request.value !== "object") {
    console.error("Error: legacy adoption request refused.");
    return 2;
  }
  const planned = buildLegacyAdoptionPlan(dir, request.value, deps, existing);
  if (!planned.ok) { console.error(`Error: legacy adoption refused (${planned.code}); zero mutation.`); return 2; }
  const planPayload = planned.payload;
  const planSha256 = planned.planSha256;
  if (sub === "continuity-adoption-plan") {
    console.log(JSON.stringify({ ...planPayload, planSha256, applyAction: {
      executable: process.execPath, argv: [fileURLToPath(import.meta.url), "continuity-adoption-apply", "--request-file", flags["request-file"], "--plan-sha256", planSha256, "--activate"], mutation: true, requiresConfirmation: true, requiresHostBoundary: true,
    } }, null, 2));
    return 0;
  }
  if (!Object.hasOwn(flags, "activate") || flags["plan-sha256"] !== planSha256) {
    console.error("Error: legacy adoption apply requires the exact plan digest and --activate confirmation.");
    return 2;
  }
  const lock = acquireContinuityLock(dir, flags["lock-token"] ?? LEGACY_WRITER_LOCK_TOKEN, deps);
  if (!lock.ok) { console.error(`Error: continuity writer refused (${lock.code}).`); return 2; }
  try {
    const current = readStateRaw(dir);
    if (current.status !== "ok" || !current.state.continuity) { console.error("Error: state changed during adoption; zero mutation."); return 2; }
    const rebuilt = buildLegacyAdoptionPlan(dir, request.value, deps, current);
    if (!rebuilt.ok || rebuilt.planSha256 !== planSha256) { console.error("Error: legacy adoption plan is stale; zero mutation."); return 2; }
    const applied = applyLegacyContinuityAdoption(current.state.continuity, request.value, current.state.activeFeature?.id);
    if (!applied.ok) { console.error(`Error: legacy adoption refused (${applied.code}); zero mutation.`); return 2; }
    const writeUpdatedAt = deps.now?.() ?? new Date().toISOString();
    const expectedPostimage = clearGateEstimateForMutation({ ...current.state, continuity: applied.state, updatedAt: writeUpdatedAt });
    const written = atomicWriteContinuityState(dir, expectedPostimage, lock, deps);
    if (!written.ok) {
      if (written.committed === false) console.error(`Error: legacy adoption refused before commit (${written.code}); zero mutation.`);
      else if (written.committed === true) console.error(`Error: legacy adoption committed but directory durability is indeterminate (${written.code}); inspect before retry.`);
      else console.error(`Error: legacy adoption commit disposition is indeterminate (${written.code}); inspect before retry.`);
      return 2;
    }
    const persisted = deps.readLegacyAdoptionPostimage?.(dir) ?? readStateRaw(dir);
    if (persisted.status !== "ok" || !sameJson(persisted.state, expectedPostimage)) {
      console.error("Error: legacy adoption postimage could not be freshly validated; persisted outcome is unresolved. Inspect before retry.");
      return 2;
    }
    console.log(`${applied.code}: continuity revision ${applied.state.revision} written.`);
    return 0;
  } finally { releaseContinuityLock(lock); }
}

// ---- Closed lossless Result.md/result.md authority rebind (AC-047-151--154) ----

function resultRebindCandidates(dir, prdPath) {
  if (typeof prdPath !== "string" || !/^specs\/[A-Za-z0-9._:-]+\/prd_[A-Za-z0-9._:-]+\.md$/u.test(prdPath)) return null;
  const base = dirname(prdPath).split(sep).join("/");
  const upper = physicalRebindFile(dir, `${base}/Result.md`);
  const lower = physicalRebindFile(dir, `${base}/result.md`);
  if (upper === null || lower === null || upper.path === lower.path
    || upper.identity.dev === lower.identity.dev && upper.identity.ino === lower.identity.ino) return null;
  return { upper, lower };
}

function resultRebindInventory(dir, state, prd, spec) {
  const continuity = state.continuity;
  const bindings = [];
  const add = (artifact, status, detail = undefined) => bindings.push({ artifact, status, ...(detail === undefined ? {} : { detail }) });
  const submission = state.planSubmission;
  if (submission === undefined) add("planSubmission", "not-present");
  else if (submission?.planPath === prd.path && submission?.planSha256 === prd.sha256 && submission?.specPath === spec.path && submission?.specSha256 === spec.sha256) add("planSubmission", "validated-immutable");
  else add("planSubmission", "rejected", "direct PRD/Spec binding is stale or unknown");
  const approval = state.planApproval;
  if (approval === undefined) add("planApproval", "not-present");
  else if (approval?.poGateAuthority?.planPath === prd.path && approval?.poGateAuthority?.planSha256 === prd.sha256 && approval?.poGateAuthority?.specPath === spec.path && approval?.poGateAuthority?.specSha256 === spec.sha256) add("planApproval", "validated-immutable");
  else add("planApproval", "rejected", "direct PRD/Spec binding is stale or unknown");
  if (continuity.authority.prd.path === prd.path && continuity.authority.prd.sha256 === prd.sha256 && continuity.authority.spec.path === spec.path && continuity.authority.spec.sha256 === spec.sha256) add("continuity.authority.prd-spec", "validated-immutable");
  else add("continuity.authority.prd-spec", "rejected", "direct PRD/Spec binding is stale or unknown");
  const manifestPath = `${dirname(prd.path).split(sep).join("/")}/lifecycle.json`;
  const manifest = physicalRebindFile(dir, manifestPath);
  if (manifest === null) {
    try { lstatSync(resolve(dir, manifestPath)); add("lifecycle.json", "rejected", "optional direct package binding is unsafe"); }
    catch { add("lifecycle.json", "not-present"); }
  } else {
    const checked = validateFeaturePackage(dir, manifestPath);
    add("lifecycle.json", "rejected", checked.ok ? "case collision is incompatible with package topology" : "optional direct package binding is invalid");
  }
  return bindings;
}

function resultRebindEligible(state, prd, spec, target, candidates) {
  const continuity = state?.continuity;
  const lifecycle = derivePlanLifecycle(state, { planSha256: prd.sha256, specSha256: spec.sha256 });
  if (!state?.activeFeature || state.schema !== SCHEMA_ID || state.gateEstimate !== undefined || !lifecycle.ok || lifecycle.status !== "implementing" || !validateContinuityState(continuity, state.activeFeature.id).ok || continuity.featureId !== state.activeFeature.id || continuity.queueHead === null || continuity.queueHead.dispatch !== null || continuity.blocker !== null || continuity.acknowledgedFinal !== null || continuity.recovery !== null || continuity.decisionTxn !== null || continuity.closeTransition != null || continuity.revision >= Number.MAX_SAFE_INTEGER || continuity.authority.result === null || state.activeFeature.planPath !== prd.path || target.path === continuity.authority.result.path) return false;
  const current = continuity.authority.result.path === candidates.upper.path ? candidates.upper : continuity.authority.result.path === candidates.lower.path ? candidates.lower : null;
  return current !== null && continuity.authority.result.sha256 === current.sha256;
}

function resultRebindNextState(state, target, updatedAt) {
  const next = structuredClone(state);
  next.continuity.revision += 1;
  next.continuity.authority.result = { path: target.path, sha256: target.sha256 };
  next.continuity.resume = { ...next.continuity.resume, sourceRevision: next.continuity.revision };
  next.updatedAt = updatedAt;
  return next;
}

function buildResultRebindPlan(dir, existing, selectedPath, updatedAt) {
  if (existing.status !== "ok" || !canonicalIso(updatedAt) || typeof selectedPath !== "string") return { ok: false, code: "PS-RESULT-REBIND-STATE" };
  const state = existing.state;
  const stateFile = physicalRebindFile(dir, stateRelativePath(dir));
  if (stateFile === null || stateFile.sha256 !== sha256Bytes(existing.raw)) return { ok: false, code: "PS-RESULT-REBIND-STATE-IDENTITY" };
  const prd = physicalRebindFile(dir, state?.continuity?.authority?.prd?.path);
  const spec = physicalRebindFile(dir, state?.continuity?.authority?.spec?.path);
  if (prd === null || spec === null) return { ok: false, code: "PS-RESULT-REBIND-AUTHORITY" };
  let prdText;
  try { prdText = new TextDecoder("utf-8", { fatal: true }).decode(prd.bytes); } catch { return { ok: false, code: "PS-RESULT-REBIND-PRD-MARKER" }; }
  const marker = rebindMarker(prdText);
  if (marker === null || marker.digest !== spec.sha256) return { ok: false, code: "PS-RESULT-REBIND-PRD-MARKER" };
  const candidates = resultRebindCandidates(dir, prd.path);
  if (candidates === null) return { ok: false, code: "PS-RESULT-REBIND-COLLISION" };
  const target = selectedPath === candidates.upper.path ? candidates.upper : selectedPath === candidates.lower.path ? candidates.lower : null;
  if (target === null) return { ok: false, code: "PS-RESULT-REBIND-TARGET" };
  const inventory = resultRebindInventory(dir, state, prd, spec);
  if (inventory.some((entry) => entry.status === "rejected")) return { ok: false, code: "PS-RESULT-REBIND-AUTHORITY-CLOSURE", inventory };
  if (!resultRebindEligible(state, prd, spec, target, candidates)) return { ok: false, code: "PS-RESULT-REBIND-CONTINUITY", inventory };
  const nextState = resultRebindNextState(state, target, updatedAt);
  if (!validateContinuityState(nextState.continuity, state.activeFeature.id).ok) return { ok: false, code: "PS-RESULT-REBIND-POSTIMAGE", inventory };
  const payload = {
    schema: RESULT_REBIND_PLAN_SCHEMA, root: realpathSync(resolve(dir)), featureId: state.activeFeature.id,
    selectedAuthorityTarget: { path: target.path, sha256: target.sha256, identity: target.identity }, authorityClosure: inventory,
    preimage: { state: { sha256: sha256Bytes(existing.raw), identity: stateFile.identity, updatedAt: state.updatedAt ?? null }, continuity: { revision: state.continuity.revision, authority: state.continuity.authority, resume: state.continuity.resume }, prd: { path: prd.path, sha256: prd.sha256, identity: prd.identity, technicalSpecSha256: marker.digest }, spec: { path: spec.path, sha256: spec.sha256, identity: spec.identity }, resultCandidates: [candidates.upper, candidates.lower].map((candidate) => ({ path: candidate.path, sha256: candidate.sha256, identity: candidate.identity })) },
    postimage: { stateSha256: sha256Bytes(Buffer.from(JSON.stringify(nextState, null, 2) + "\n", "utf8")), revision: nextState.continuity.revision, updatedAt, authorityResult: nextState.continuity.authority.result, resume: nextState.continuity.resume },
    assurance: { regularFilesOnly: true, singleLinkOnly: true, resultFilesUntouched: true, archiveMoveDelete: false },
  };
  return { ok: true, payload, planSha256: sha256CanonicalJson(payload), nextState };
}

function parseResultRebindPlan(argv) {
  const parsed = parseExactFlags(argv, new Set(["result-path"]));
  return parsed.ok && typeof parsed.value["result-path"] === "string" && !isBlank(parsed.value["result-path"]) ? parsed.value["result-path"] : null;
}

function parseResultRebindApply(argv) {
  if (argv.length !== 15 || argv[0] !== "--feature-id" || isBlank(argv[1]) || argv[2] !== "--result-path" || isBlank(argv[3]) || argv[4] !== "--expected-revision" || !parseExpectedRevision(argv[5]).ok || argv[6] !== "--expected-state-sha256" || !SHA256_RE.test(argv[7]) || argv[8] !== "--expected-post-state-sha256" || !SHA256_RE.test(argv[9]) || argv[10] !== "--updated-at" || !canonicalIso(argv[11]) || argv[12] !== "--plan-sha256" || !SHA256_RE.test(argv[13]) || argv[14] !== "--activate") return null;
  return { featureId: argv[1], resultPath: argv[3], expectedRevision: Number(argv[5]), expectedStateSha256: argv[7], expectedPostStateSha256: argv[9], updatedAt: argv[11], planSha256: argv[13] };
}

function runResultRebindCommand(sub, rest, deps) {
  if (sub === "continuity-result-rebind-plan") {
    const selectedPath = parseResultRebindPlan(rest);
    if (selectedPath === null) { console.error("Error: Result rebind plan requires exactly --result-path <explicit Result.md|result.md target>."); return 2; }
    const planned = buildResultRebindPlan(deps.dir, readStateRaw(deps.dir), selectedPath, deps.now());
    if (!planned.ok) { console.error(`Error: Result rebind plan refused (${planned.code}); zero mutation.`); return 2; }
    const writer = fileURLToPath(import.meta.url);
    console.log(JSON.stringify({ ...planned.payload, planSha256: planned.planSha256, applyAction: { executable: process.execPath, argv: [writer, "continuity-result-rebind-apply", "--feature-id", planned.payload.featureId, "--result-path", selectedPath, "--expected-revision", String(planned.payload.preimage.continuity.revision), "--expected-state-sha256", planned.payload.preimage.state.sha256, "--expected-post-state-sha256", planned.payload.postimage.stateSha256, "--updated-at", planned.payload.postimage.updatedAt, "--plan-sha256", planned.planSha256, "--activate"], mutation: true, requiresConfirmation: true, executionBoundary: "host-authorized-wsl", expected: { schema: RESULT_REBIND_APPLY_SCHEMA, statuses: ["applied", "replayed"] } } }, null, 2));
    return 0;
  }
  const apply = parseResultRebindApply(rest);
  if (apply === null) { console.error("Error: Result rebind apply requires the complete returned action and --activate confirmation."); return 2; }
  const lock = acquireContinuityLock(deps.dir, RESULT_REBIND_LOCK_TOKEN, deps);
  if (!lock.ok) { console.error(`Error: Result rebind apply refused (${lock.code}); zero mutation.`); return 2; }
  try {
    const current = readStateRaw(deps.dir);
    if (current.status !== "ok") { console.error("Error: Result rebind State is unavailable or malformed; zero mutation."); return 2; }
    if (sha256Bytes(current.raw) === apply.expectedPostStateSha256) {
      const prd = physicalRebindFile(deps.dir, current.state.continuity?.authority?.prd?.path);
      const candidates = prd === null ? null : resultRebindCandidates(deps.dir, prd.path);
      if (current.state.activeFeature?.id !== apply.featureId || current.state.updatedAt !== apply.updatedAt || current.state.continuity?.revision !== apply.expectedRevision + 1 || current.state.continuity?.authority?.result?.path !== apply.resultPath || candidates === null || ![candidates.upper, candidates.lower].some((candidate) => candidate.path === apply.resultPath && candidate.sha256 === current.state.continuity.authority.result.sha256)) { console.error("Error: Result rebind replay postimage is invalid; zero mutation."); return 2; }
      console.log(JSON.stringify({ schema: RESULT_REBIND_APPLY_SCHEMA, status: "replayed", featureId: apply.featureId, revision: current.state.continuity.revision, stateSha256: apply.expectedPostStateSha256, result: current.state.continuity.authority.result, mutated: false })); return 0;
    }
    const planned = buildResultRebindPlan(deps.dir, current, apply.resultPath, apply.updatedAt);
    if (sha256Bytes(current.raw) !== apply.expectedStateSha256 || !planned.ok || planned.planSha256 !== apply.planSha256 || planned.payload.featureId !== apply.featureId || planned.payload.preimage.continuity.revision !== apply.expectedRevision || planned.payload.postimage.stateSha256 !== apply.expectedPostStateSha256) { console.error("Error: Result rebind apply inputs are stale or conflicting; zero mutation."); return 2; }
    const before = planned.payload.preimage.resultCandidates;
    const written = atomicWriteContinuityState(deps.dir, planned.nextState, lock, deps);
    if (!written.ok) { console.error(`Error: Result rebind State write unresolved (${written.code}); mutation disposition is not success.`); return 2; }
    const persisted = readStateRaw(deps.dir);
    const prd = physicalRebindFile(deps.dir, current.state.continuity.authority.prd.path);
    const after = prd === null ? null : resultRebindCandidates(deps.dir, prd.path);
    const unchanged = after !== null && before.every((entry) => [after.upper, after.lower].some((candidate) => candidate.path === entry.path && candidate.sha256 === entry.sha256 && sameJson(candidate.identity, entry.identity)));
    if (persisted.status !== "ok" || sha256Bytes(persisted.raw) !== apply.expectedPostStateSha256 || !sameJson(persisted.state, planned.nextState) || !unchanged) { console.error("Error: Result rebind postimage readback is unresolved; inspect persisted State before retry."); return 2; }
    console.log(JSON.stringify({ schema: RESULT_REBIND_APPLY_SCHEMA, status: "applied", featureId: apply.featureId, revision: persisted.state.continuity.revision, stateSha256: apply.expectedPostStateSha256, result: persisted.state.continuity.authority.result, mutated: true })); return 0;
  } finally { releaseContinuityLock(lock); }
}

// ---- Elephant-owned first Result-authority bootstrap (AC-047-143--148) ----

function resultBootstrapPath(dir, prdPath) {
  if (typeof prdPath !== "string" || !/^specs\/[A-Za-z0-9._:-]+\/prd_[A-Za-z0-9._:-]+\.md$/u.test(prdPath)) return null;
  return `${dirname(prdPath).split(sep).join("/")}/result.md`;
}

function canonicalResultBootstrapBytes() {
  return Buffer.from("```pipeline-result\n{\"courseDecisionIntents\":[],\"courseDecisionReceipts\":[],\"decisionBriefs\":[],\"finalIntegrations\":[]}\n```\n", "utf8");
}

function observeCanonicalResultBootstrap(dir, relativePath) {
  const observed = physicalRebindFile(dir, relativePath);
  if (observed === null || observed.bytes.byteLength > CONTINUITY_RESULT_MAX_BYTES) return null;
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(observed.bytes); } catch { return null; }
  if (!Buffer.from(text, "utf8").equals(observed.bytes) || text.startsWith("\uFEFF") || text.includes("\r") || !text.endsWith("\n")) return null;
  if (/^```pipeline-result(?:\n|$)/mu.test(text)) return null;
  return { ...observed, root: realpathSync(resolve(dir)), parent: dirname(observed.absolute), historicalBytes: observed.bytes };
}

function sameBootstrapResultPreimage(left, right) {
  return left !== null && right !== null && left.path === right.path && left.sha256 === right.sha256
    && sameJson(left.identity, right.identity) && left.historicalBytes.equals(right.historicalBytes);
}

function atomicAppendResultBootstrap(result, bytes, lock, deps = {}) {
  const tmp = `${result.absolute}.tmp.${lock.ownerNonce}`;
  let fd;
  try {
    const before = observeCanonicalResultBootstrap(result.root, result.path);
    if (!sameBootstrapResultPreimage(before, result)) return { ok: false, code: "PS-RESULT-BOOTSTRAP-RESULT-PATH" };
    fd = openSync(tmp, "wx", 0o600);
    (deps.replaceResultFdContents ?? replaceFdContents)(fd, bytes);
    closeSync(fd); fd = undefined;
    const rechecked = observeCanonicalResultBootstrap(result.root, result.path);
    if (!sameBootstrapResultPreimage(rechecked, result)) return { ok: false, code: "PS-RESULT-BOOTSTRAP-RESULT-RACE" };
    (deps.renameResultSync ?? renameSync)(tmp, result.absolute);
    const synced = deps.syncResultDirectory?.(result.parent) ?? syncDirectory(result.parent);
    const observed = physicalRebindFile(result.root, result.path);
    return synced.ok && observed !== null && observed.bytes.equals(bytes)
      ? { ok: true, code: "PS-RESULT-BOOTSTRAP-RESULT-WRITTEN" }
      : { ok: false, code: "PS-RESULT-BOOTSTRAP-RESULT-READBACK" };
  } catch { return { ok: false, code: "PS-RESULT-BOOTSTRAP-RESULT-IO" }; }
  finally { if (fd !== undefined) closeSync(fd); safeUnlink(tmp); }
}

function resultBootstrapEligible(state) {
  const continuity = state?.continuity;
  return Boolean(state?.activeFeature && validateContinuityState(continuity, state.activeFeature.id).ok
    && continuity.featureId === state.activeFeature.id
    && continuity.authority.result === null
    && continuity.queueHead !== null && continuity.queueHead.dispatch === null
    && continuity.blocker === null && continuity.acknowledgedFinal === null
    && continuity.recovery === null && continuity.decisionTxn === null
    && (continuity.closeTransition === null || continuity.closeTransition === undefined)
    && continuity.revision < Number.MAX_SAFE_INTEGER);
}

function resultBootstrapNextState(state, result, updatedAt) {
  const next = structuredClone(state);
  next.continuity.revision += 1;
  next.continuity.authority.result = result;
  next.continuity.resume = { ...next.continuity.resume, sourceRevision: next.continuity.revision };
  next.updatedAt = updatedAt;
  return next;
}

function resultBootstrapPayload(root, stateRaw, state, prd, spec, resultPath, resultBytes, nextState, updatedAt) {
  const appendedFence = canonicalResultBootstrapBytes();
  return {
    schema: RESULT_BOOTSTRAP_PLAN_SCHEMA,
    root,
    featureId: state.activeFeature.id,
    expectedRevision: state.continuity.revision,
    preimage: {
      stateSha256: sha256Bytes(stateRaw),
      authorityResult: null,
      prd: { path: prd.path, sha256: prd.sha256, identity: prd.identity },
      spec: { path: spec.path, sha256: spec.sha256, identity: spec.identity },
      result: { path: resultPath.path, sha256: resultPath.sha256, identity: resultPath.identity },
      historicalMarkdown: { sha256: sha256Bytes(resultPath.historicalBytes), bytesBase64: resultPath.historicalBytes.toString("base64") },
    },
    append: { sha256: sha256Bytes(appendedFence), bytesBase64: appendedFence.toString("base64") },
    result: { path: resultPath.path, sha256: sha256Bytes(resultBytes), bytesBase64: resultBytes.toString("base64") },
    postimage: { stateSha256: sha256Bytes(Buffer.from(JSON.stringify(nextState, null, 2) + "\n", "utf8")), revision: nextState.continuity.revision, updatedAt },
  };
}

function buildResultBootstrapPlan(dir, existing, updatedAt) {
  if (existing.status !== "ok" || !resultBootstrapEligible(existing.state) || !canonicalIso(updatedAt)) return { ok: false, code: "PS-RESULT-BOOTSTRAP-STATE" };
  const state = existing.state;
  const prd = physicalRebindFile(dir, state.continuity.authority.prd.path);
  const spec = physicalRebindFile(dir, state.continuity.authority.spec.path);
  if (prd === null || spec === null || prd.sha256 !== state.continuity.authority.prd.sha256 || spec.sha256 !== state.continuity.authority.spec.sha256) return { ok: false, code: "PS-RESULT-BOOTSTRAP-AUTHORITY" };
  if (state.activeFeature.planPath !== prd.path) return { ok: false, code: "PS-RESULT-BOOTSTRAP-FEATURE" };
  const resultPath = observeCanonicalResultBootstrap(dir, resultBootstrapPath(dir, prd.path));
  if (resultPath === null) return { ok: false, code: "PS-RESULT-BOOTSTRAP-RESULT-PATH" };
  const resultBytes = Buffer.concat([resultPath.historicalBytes, canonicalResultBootstrapBytes()]);
  if (resultBytes.byteLength > CONTINUITY_RESULT_MAX_BYTES) return { ok: false, code: "PS-RESULT-BOOTSTRAP-RESULT-SIZE" };
  const result = { path: resultPath.path, sha256: sha256Bytes(resultBytes) };
  const nextState = resultBootstrapNextState(state, result, updatedAt);
  if (!validateContinuityState(nextState.continuity, nextState.activeFeature.id).ok) return { ok: false, code: "PS-RESULT-BOOTSTRAP-POSTIMAGE" };
  const payload = resultBootstrapPayload(realpathSync(resolve(dir)), existing.raw, state, prd, spec, resultPath, resultBytes, nextState, updatedAt);
  return { ok: true, payload, planSha256: sha256Bytes(JSON.stringify(payload)), resultPath, resultBytes, nextState };
}

function resultBootstrapPrivatePaths(dir, deps = {}) {
  const common = (deps.gitCommonDir ?? defaultGitCommonDir)(dir);
  if (!common?.ok || typeof common.path !== "string") return null;
  try {
    const root = realpathSync(common.path);
    if (root !== resolve(common.path) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) return null;
    const namespace = join(root, "agent-pipeline");
    const base = join(namespace, "result-bootstrap");
    return { root, namespace, base, key: join(base, "key"), journal: join(base, "journal") };
  } catch { return null; }
}

function ensureBootstrapPrivateDirectory(paths) {
  if (paths === null) return false;
  try {
    for (const path of [paths.namespace, paths.base]) {
      if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path || (info.mode & 0o077) !== 0) return false;
    }
    return true;
  } catch { return false; }
}

function observeBootstrapPrivateDirectory(paths) {
  if (paths === null) return false;
  try {
    for (const path of [paths.namespace, paths.base]) {
      if (!existsSync(path)) continue;
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path || (info.mode & 0o077) !== 0) return false;
    }
    return true;
  } catch { return false; }
}

function writePrivateBootstrap(path, bytes, replace = false) {
  let fd;
  try {
    fd = openSync(path, replace ? "w" : "wx", 0o600);
    fchmodSync(fd, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    return syncDirectory(dirname(path)).ok;
  } catch { return false; } finally { if (fd !== undefined) closeSync(fd); }
}

function readPrivateBootstrap(path) {
  try { const s = lstatSync(path); return s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && (s.mode & 0o077) === 0 ? readFileSync(path) : null; } catch { return null; }
}

function bootstrapJournalMac(key, record) { return createHmac("sha256", key).update(JSON.stringify(record)).digest("hex"); }

function loadBootstrapJournal(dir, deps = {}) {
  const paths = resultBootstrapPrivatePaths(dir, deps);
  if (paths === null || !observeBootstrapPrivateDirectory(paths)) return { ok: false, code: "PS-RESULT-BOOTSTRAP-GIT-COMMON-DIR" };
  const key = readPrivateBootstrap(paths.key);
  const raw = readPrivateBootstrap(paths.journal);
  if (raw === null) return { ok: true, journal: null, paths, key };
  if (key === null || key.byteLength !== 32) return { ok: false, code: "PS-RESULT-BOOTSTRAP-JOURNAL" };
  try {
    const value = JSON.parse(raw.toString("utf8"));
    if (!exactObjectKeys(value, ["schema", "planSha256", "stateSha256", "postStateSha256", "result", "mac"])
      || value.schema !== RESULT_BOOTSTRAP_JOURNAL_SCHEMA || !SHA256_RE.test(value.planSha256) || !SHA256_RE.test(value.stateSha256)
      || !SHA256_RE.test(value.postStateSha256) || !exactObjectKeys(value.result, ["path", "sha256"]) || !SHA256_RE.test(value.result.sha256)
      || typeof value.result.path !== "string" || !SHA256_RE.test(value.mac)) return { ok: false, code: "PS-RESULT-BOOTSTRAP-JOURNAL" };
    const { mac, ...core } = value;
    if (bootstrapJournalMac(key, core) !== mac) return { ok: false, code: "PS-RESULT-BOOTSTRAP-JOURNAL" };
    return { ok: true, journal: value, paths, key };
  } catch { return { ok: false, code: "PS-RESULT-BOOTSTRAP-JOURNAL" }; }
}

function publishBootstrapJournal(dir, plan, deps = {}) {
  const paths = resultBootstrapPrivatePaths(dir, deps);
  if (!ensureBootstrapPrivateDirectory(paths)) return false;
  let key = readPrivateBootstrap(paths.key);
  if (key === null) { key = randomBytes(32); if (!writePrivateBootstrap(paths.key, key)) return false; }
  if (key.byteLength !== 32) return false;
  const core = { schema: RESULT_BOOTSTRAP_JOURNAL_SCHEMA, planSha256: plan.planSha256, stateSha256: plan.payload.preimage.stateSha256, postStateSha256: plan.payload.postimage.stateSha256, result: { path: plan.payload.result.path, sha256: plan.payload.result.sha256 } };
  const bytes = Buffer.from(JSON.stringify({ ...core, mac: bootstrapJournalMac(key, core) }) + "\n", "utf8");
  return writePrivateBootstrap(paths.journal, bytes, false);
}

function retireBootstrapJournal(paths) {
  try { return ensureBootstrapPrivateDirectory(paths) && (unlinkSync(paths.journal), syncDirectory(paths.base).ok); } catch { return false; }
}

function parseResultBootstrapApply(argv) {
  if (argv.length !== 13 || argv[0] !== "--feature-id" || isBlank(argv[1]) || argv[2] !== "--expected-revision" || !parseExpectedRevision(argv[3]).ok
    || argv[4] !== "--expected-state-sha256" || !SHA256_RE.test(argv[5]) || argv[6] !== "--expected-post-state-sha256" || !SHA256_RE.test(argv[7])
    || argv[8] !== "--updated-at" || !canonicalIso(argv[9]) || argv[10] !== "--plan-sha256" || !SHA256_RE.test(argv[11]) || argv[12] !== "--activate") return null;
  return { featureId: argv[1], expectedRevision: parseExpectedRevision(argv[3]).value, expectedStateSha256: argv[5], expectedPostStateSha256: argv[7], updatedAt: argv[9], planSha256: argv[11] };
}

function runResultBootstrapCommand(sub, rest, deps) {
  if (sub === "continuity-result-bootstrap-plan") {
    if (rest.length !== 0) { console.error("Error: Result bootstrap plan accepts no caller bindings."); return 2; }
    const planned = buildResultBootstrapPlan(deps.dir, readStateRaw(deps.dir), deps.now());
    if (!planned.ok) { console.error(`Error: Result bootstrap plan refused (${planned.code}); zero mutation.`); return 2; }
    const writer = fileURLToPath(import.meta.url);
    console.log(JSON.stringify({ ...planned.payload, planSha256: planned.planSha256, applyAction: { executable: process.execPath, argv: [writer, "continuity-result-bootstrap-apply", "--feature-id", planned.payload.featureId, "--expected-revision", String(planned.payload.expectedRevision), "--expected-state-sha256", planned.payload.preimage.stateSha256, "--expected-post-state-sha256", planned.payload.postimage.stateSha256, "--updated-at", planned.payload.postimage.updatedAt, "--plan-sha256", planned.planSha256, "--activate"], mutation: true, requiresConfirmation: true, executionBoundary: "host-authorized-wsl", expected: { schema: RESULT_BOOTSTRAP_APPLY_SCHEMA, statuses: ["applied", "replayed"] } } }, null, 2));
    return 0;
  }
  const apply = parseResultBootstrapApply(rest);
  if (apply === null) { console.error("Error: Result bootstrap apply requires the complete returned action and --activate confirmation."); return 2; }
  const lock = acquireContinuityLock(deps.dir, RESULT_BOOTSTRAP_LOCK_TOKEN, deps);
  if (!lock.ok) { console.error(`Error: Result bootstrap apply refused (${lock.code}); zero mutation.`); return 2; }
  try {
    const current = readStateRaw(deps.dir);
    const journal = loadBootstrapJournal(deps.dir, deps);
    if (!journal.ok) { console.error(`Error: Result bootstrap journal refused (${journal.code}); zero mutation.`); return 2; }
    if (current.status !== "ok") { console.error("Error: Result bootstrap State is unavailable or malformed; zero mutation."); return 2; }
    let planned = buildResultBootstrapPlan(deps.dir, current, apply.updatedAt);
    const resultPath = resultBootstrapPath(deps.dir, current.state.continuity?.authority?.prd?.path);
    const resultObserved = resultPath ? physicalRebindFile(deps.dir, resultPath) : null;
    if (sha256Bytes(current.raw) === apply.expectedPostStateSha256) {
      if (!resultBootstrapEligible({ ...current.state, continuity: { ...current.state.continuity, authority: { ...current.state.continuity.authority, result: null }, revision: current.state.continuity.revision - 1, resume: { ...current.state.continuity.resume, sourceRevision: current.state.continuity.revision - 1 } } })
        || current.state.activeFeature.id !== apply.featureId || current.state.updatedAt !== apply.updatedAt || current.state.continuity.authority.result?.path !== resultPath
        || resultObserved === null || resultObserved.sha256 !== current.state.continuity.authority.result.sha256) { console.error("Error: Result bootstrap replay postimage is invalid; zero mutation."); return 2; }
      if (journal.journal !== null && (journal.journal.planSha256 !== apply.planSha256 || !retireBootstrapJournal(journal.paths))) { console.error("Error: Result bootstrap journal recovery is unresolved."); return 2; }
      console.log(JSON.stringify({ schema: RESULT_BOOTSTRAP_APPLY_SCHEMA, status: "replayed", featureId: apply.featureId, revision: current.state.continuity.revision, stateSha256: apply.expectedPostStateSha256, result: current.state.continuity.authority.result, mutated: false })); return 0;
    }
    // A durable Result may legitimately exist while State is still at the exact
    // preimage.  The authenticated journal is the only authority that may resume
    // that Result-before-State window; rebuilding an "absent Result" plan would
    // correctly refuse and must not turn recovery into a false conflict.
    if (!planned.ok && journal.journal !== null && sha256Bytes(current.raw) === apply.expectedStateSha256
      && resultBootstrapEligible(current.state) && current.state.activeFeature.id === apply.featureId
      && current.state.continuity.revision === apply.expectedRevision && resultObserved !== null
      && resultObserved.sha256 === journal.journal.result.sha256
      && journal.journal.planSha256 === apply.planSha256 && journal.journal.stateSha256 === apply.expectedStateSha256
      && journal.journal.postStateSha256 === apply.expectedPostStateSha256) {
      const prd = physicalRebindFile(deps.dir, current.state.continuity.authority.prd.path);
      const spec = physicalRebindFile(deps.dir, current.state.continuity.authority.spec.path);
      const result = { path: journal.journal.result.path, sha256: journal.journal.result.sha256 };
      const nextState = resultBootstrapNextState(current.state, result, apply.updatedAt);
      if (prd !== null && spec !== null && prd.sha256 === current.state.continuity.authority.prd.sha256
        && spec.sha256 === current.state.continuity.authority.spec.sha256
        && sha256Bytes(Buffer.from(JSON.stringify(nextState, null, 2) + "\n", "utf8")) === apply.expectedPostStateSha256) {
        planned = { ok: true, payload: { featureId: apply.featureId, result, postimage: { stateSha256: apply.expectedPostStateSha256 } }, planSha256: apply.planSha256, nextState, resultBytes: resultObserved.bytes, resultPath: null };
      }
    }
    if (sha256Bytes(current.raw) !== apply.expectedStateSha256 || !planned.ok || planned.payload.featureId !== apply.featureId || planned.planSha256 !== apply.planSha256 || planned.payload.postimage.stateSha256 !== apply.expectedPostStateSha256) { console.error("Error: Result bootstrap apply inputs are stale or conflicting; zero mutation."); return 2; }
    if (journal.journal !== null && (journal.journal.planSha256 !== apply.planSha256 || journal.journal.stateSha256 !== apply.expectedStateSha256 || journal.journal.postStateSha256 !== apply.expectedPostStateSha256)) { console.error("Error: Result bootstrap journal conflicts; zero mutation."); return 2; }
    if (journal.journal === null && !publishBootstrapJournal(deps.dir, planned, deps)) { console.error("Error: Result bootstrap journal prepare failed; zero mutation."); return 2; }
    if (deps.afterResultBootstrapJournal?.() === false) { console.error("Error: Result bootstrap interrupted after journal preparation; recovery journal retained."); return 2; }
    const existingResult = physicalRebindFile(deps.dir, planned.payload.result.path);
    if (existingResult === null) {
      console.error("Error: Result bootstrap Result is absent; recovery journal retained."); return 2;
    } else if (existingResult.sha256 !== planned.payload.result.sha256) {
      if (planned.resultPath === null || !atomicAppendResultBootstrap(planned.resultPath, planned.resultBytes, lock, deps).ok) { console.error("Error: Result bootstrap Result write unresolved; recovery journal retained."); return 2; }
    }
    const verifiedResult = physicalRebindFile(deps.dir, planned.payload.result.path);
    if (verifiedResult === null || verifiedResult.sha256 !== planned.payload.result.sha256) { console.error("Error: Result bootstrap Result readback failed; recovery journal retained."); return 2; }
    if (deps.afterResultBootstrapResult?.() === false) { console.error("Error: Result bootstrap interrupted after Result publication; recovery journal retained."); return 2; }
    const written = atomicWriteContinuityState(deps.dir, planned.nextState, lock, deps);
    if (!written.ok) { console.error(`Error: Result bootstrap State write unresolved (${written.code}); recovery journal retained.`); return 2; }
    const persisted = readStateRaw(deps.dir);
    if (persisted.status !== "ok" || sha256Bytes(persisted.raw) !== apply.expectedPostStateSha256 || persisted.state.continuity.authority.result?.sha256 !== planned.payload.result.sha256) { console.error("Error: Result bootstrap postimage readback is unresolved; recovery journal retained."); return 2; }
    if (deps.afterResultBootstrapState?.() === false) { console.error("Error: Result bootstrap interrupted after State commit; recovery journal retained."); return 2; }
    const recovered = loadBootstrapJournal(deps.dir, deps);
    if (!recovered.ok || recovered.journal === null || recovered.journal.planSha256 !== apply.planSha256 || !retireBootstrapJournal(recovered.paths)) { console.error("Error: Result bootstrap journal retirement is unresolved."); return 2; }
    console.log(JSON.stringify({ schema: RESULT_BOOTSTRAP_APPLY_SCHEMA, status: "applied", featureId: apply.featureId, revision: persisted.state.continuity.revision, stateSha256: apply.expectedPostStateSha256, result: persisted.state.continuity.authority.result, mutated: true })); return 0;
  } finally { releaseContinuityLock(lock); }
}

// ---- Dedicated approved implementation Result -> close readiness writer ----

const RESULT_CLOSE_PLAN_FLAGS = new Set([
  "feature-id", "expected-revision", "result-path", "result-sha256",
]);

function parseResultClosePlan(argv) {
  const parsed = parseExactFlags(argv, RESULT_CLOSE_PLAN_FLAGS);
  const revision = parsed.ok ? parseExpectedRevision(parsed.value["expected-revision"]) : { ok: false };
  if (!parsed.ok || !revision.ok || isBlank(parsed.value["feature-id"])
    || !SHA256_RE.test(parsed.value["result-sha256"])) return null;
  return {
    featureId: parsed.value["feature-id"],
    expectedRevision: revision.value,
    result: {
      path: parsed.value["result-path"],
      sha256: parsed.value["result-sha256"],
    },
  };
}

function parseResultCloseApply(argv) {
  if (argv.length !== 17
    || argv[0] !== "--feature-id" || isBlank(argv[1])
    || argv[2] !== "--expected-revision" || !parseExpectedRevision(argv[3]).ok
    || argv[4] !== "--result-path" || isBlank(argv[5])
    || argv[6] !== "--result-sha256" || !SHA256_RE.test(argv[7])
    || argv[8] !== "--expected-state-sha256" || !SHA256_RE.test(argv[9])
    || argv[10] !== "--expected-post-state-sha256" || !SHA256_RE.test(argv[11])
    || argv[12] !== "--updated-at" || !canonicalIso(argv[13])
    || argv[14] !== "--plan-sha256" || !SHA256_RE.test(argv[15])
    || argv[16] !== "--activate") return null;
  return {
    featureId: argv[1],
    expectedRevision: parseExpectedRevision(argv[3]).value,
    result: { path: argv[5], sha256: argv[7] },
    expectedStateSha256: argv[9],
    expectedPostStateSha256: argv[11],
    updatedAt: argv[13],
    planSha256: argv[15],
  };
}

function observeResultCloseArtifact(dir, binding) {
  const observed = physicalRebindFile(dir, binding?.path);
  return observed !== null
    && binding?.sha256 === observed.sha256
    && observed.bytes.byteLength > 0
    && observed.bytes.byteLength <= CONTINUITY_RESULT_MAX_BYTES
    ? observed
    : null;
}

function resultClosePlanPayload(root, request, resultFile, expectedStateSha256,
  expectedPostStateSha256, updatedAt) {
  return {
    schema: RESULT_CLOSE_PLAN_SCHEMA,
    root,
    featureId: request.featureId,
    expectedRevision: request.expectedRevision,
    preimage: {
      stateSha256: expectedStateSha256,
      authorityResult: null,
      nextAction: "review",
    },
    result: {
      path: request.result.path,
      sha256: request.result.sha256,
      identity: resultFile.identity,
    },
    postimage: {
      stateSha256: expectedPostStateSha256,
      revision: request.expectedRevision + 1,
      authorityResult: request.result,
      nextAction: "close",
      resume: {
        mode: "immediate",
        sourceRevision: request.expectedRevision + 1,
        reasonCode: "active-turn",
      },
      updatedAt,
    },
  };
}

function approvedResultCloseRoot(state, request) {
  const lifecycle = derivePlanLifecycle(state);
  return lifecycle.ok
    && lifecycle.status === "implementing"
    && state.planApproved === true
    && state.activeFeature?.id === request.featureId
    && state.activeFeature?.phase === "implementation"
    && state.continuity?.featureId === request.featureId;
}

function buildResultClosePlan(dir, request, existing, updatedAt) {
  if (existing.status !== "ok" || !approvedResultCloseRoot(existing.state, request)
    || !canonicalIso(updatedAt)) return { ok: false, code: "PS-RESULT-CLOSE-STATE" };
  const resultFile = observeResultCloseArtifact(dir, request.result);
  if (resultFile === null
    || request.result.path === existing.state.continuity.authority.prd.path
    || request.result.path === existing.state.continuity.authority.spec.path) {
    return { ok: false, code: "PS-RESULT-CLOSE-RESULT" };
  }
  const transition = bindContinuityResultForClose(
    existing.state.continuity,
    { expectedRevision: request.expectedRevision, result: request.result },
    request.featureId,
  );
  if (!transition.ok || transition.code !== "CS-RESULT-CLOSE-APPLIED") {
    return { ok: false, code: transition.code };
  }
  const nextState = clearGateEstimateForMutation({
    ...existing.state,
    continuity: transition.state,
    updatedAt,
  });
  const expectedStateSha256 = sha256Bytes(existing.raw);
  const expectedPostStateSha256 = sha256Bytes(JSON.stringify(nextState, null, 2) + "\n");
  const payload = resultClosePlanPayload(
    realpathSync(resolve(dir)),
    request,
    resultFile,
    expectedStateSha256,
    expectedPostStateSha256,
    updatedAt,
  );
  return {
    ok: true,
    payload,
    planSha256: sha256Bytes(JSON.stringify(payload)),
    resultFile,
    nextState,
  };
}

function resultCloseApplyPayload(dir, request, apply, resultFile) {
  return resultClosePlanPayload(
    realpathSync(resolve(dir)),
    request,
    resultFile,
    apply.expectedStateSha256,
    apply.expectedPostStateSha256,
    apply.updatedAt,
  );
}

function exactResultCloseReplay(state, request, apply) {
  if (!approvedResultCloseRoot(state, request) || state.updatedAt !== apply.updatedAt) return false;
  const replay = bindContinuityResultForClose(
    state.continuity,
    { expectedRevision: request.expectedRevision, result: request.result },
    request.featureId,
  );
  return replay.ok && replay.code === "CS-RESULT-CLOSE-REPLAY";
}

function runResultCloseCommand(sub, rest, deps) {
  const plannedRequest = sub === "continuity-result-close-plan" ? parseResultClosePlan(rest) : null;
  const apply = sub === "continuity-result-close-apply" ? parseResultCloseApply(rest) : null;
  if (sub === "continuity-result-close-plan" && plannedRequest === null) {
    console.error("Error: Result-close plan requires exact --feature-id, --expected-revision, --result-path and --result-sha256 bindings.");
    return 2;
  }
  if (sub === "continuity-result-close-apply" && apply === null) {
    console.error("Error: Result-close apply requires the complete returned action and --activate confirmation.");
    return 2;
  }
  if (plannedRequest !== null) {
    const updatedAt = deps.now();
    const planned = buildResultClosePlan(deps.dir, plannedRequest, readStateRaw(deps.dir), updatedAt);
    if (!planned.ok) {
      console.error(`Error: Result-close plan refused (${planned.code}); zero mutation.`);
      return 2;
    }
    const writer = fileURLToPath(import.meta.url);
    console.log(JSON.stringify({
      ...planned.payload,
      planSha256: planned.planSha256,
      applyAction: {
        executable: process.execPath,
        argv: [
          writer,
          "continuity-result-close-apply",
          "--feature-id", plannedRequest.featureId,
          "--expected-revision", String(plannedRequest.expectedRevision),
          "--result-path", plannedRequest.result.path,
          "--result-sha256", plannedRequest.result.sha256,
          "--expected-state-sha256", planned.payload.preimage.stateSha256,
          "--expected-post-state-sha256", planned.payload.postimage.stateSha256,
          "--updated-at", planned.payload.postimage.updatedAt,
          "--plan-sha256", planned.planSha256,
          "--activate",
        ],
        mutation: true,
        requiresConfirmation: true,
        requiresHostBoundary: true,
        expected: { schema: RESULT_CLOSE_APPLY_SCHEMA, statuses: ["applied", "replayed"] },
      },
    }, null, 2));
    return 0;
  }

  const request = {
    featureId: apply.featureId,
    expectedRevision: apply.expectedRevision,
    result: apply.result,
  };
  const lock = acquireContinuityLock(deps.dir, RESULT_CLOSE_LOCK_TOKEN, deps);
  if (!lock.ok) {
    console.error(`Error: Result-close apply refused (${lock.code}); zero mutation.`);
    return 2;
  }
  try {
    const resultFile = observeResultCloseArtifact(deps.dir, request.result);
    if (resultFile === null) {
      console.error("Error: Result-close apply refused (PS-RESULT-CLOSE-RESULT); zero mutation.");
      return 2;
    }
    const payload = resultCloseApplyPayload(deps.dir, request, apply, resultFile);
    if (sha256Bytes(JSON.stringify(payload)) !== apply.planSha256) {
      console.error("Error: Result-close apply plan digest is stale or conflicting; zero mutation.");
      return 2;
    }
    const current = readStateRaw(deps.dir);
    if (current.status !== "ok") {
      console.error("Error: Result-close apply State is unavailable or malformed; zero mutation.");
      return 2;
    }
    const currentSha256 = sha256Bytes(current.raw);
    if (currentSha256 === apply.expectedPostStateSha256) {
      if (!exactResultCloseReplay(current.state, request, apply)) {
        console.error("Error: Result-close replay postimage is invalid; zero mutation.");
        return 2;
      }
      console.log(JSON.stringify({
        schema: RESULT_CLOSE_APPLY_SCHEMA,
        status: "replayed",
        featureId: request.featureId,
        revision: current.state.continuity.revision,
        stateSha256: currentSha256,
        result: request.result,
        nextAction: "close",
      }));
      return 0;
    }
    if (currentSha256 !== apply.expectedStateSha256) {
      console.error("Error: Result-close apply preimage is stale; zero mutation.");
      return 2;
    }
    const rebuilt = buildResultClosePlan(deps.dir, request, current, apply.updatedAt);
    if (!rebuilt.ok || rebuilt.planSha256 !== apply.planSha256
      || rebuilt.payload.postimage.stateSha256 !== apply.expectedPostStateSha256
      || !sameJson(rebuilt.resultFile.identity, resultFile.identity)) {
      console.error("Error: Result-close apply inputs drifted; zero mutation.");
      return 2;
    }
    const finalResultProbe = observeResultCloseArtifact(deps.dir, request.result);
    if (finalResultProbe === null || !sameJson(finalResultProbe.identity, resultFile.identity)) {
      console.error("Error: Result-close Result bytes or physical identity drifted; zero mutation.");
      return 2;
    }
    const written = atomicWriteContinuityState(deps.dir, rebuilt.nextState, lock, deps);
    if (!written.ok) {
      console.error(`Error: Result-close State write unresolved (${written.code}); inspect before retry.`);
      return 2;
    }
    const persisted = readStateRaw(deps.dir);
    const persistedResult = observeResultCloseArtifact(deps.dir, request.result);
    if (persisted.status !== "ok"
      || sha256Bytes(persisted.raw) !== apply.expectedPostStateSha256
      || !exactResultCloseReplay(persisted.state, request, apply)
      || persistedResult === null
      || !sameJson(persistedResult.identity, resultFile.identity)) {
      console.error("Error: Result-close postimage readback is unresolved; inspect before retry.");
      return 2;
    }
    console.log(JSON.stringify({
      schema: RESULT_CLOSE_APPLY_SCHEMA,
      status: "applied",
      featureId: request.featureId,
      revision: persisted.state.continuity.revision,
      stateSha256: apply.expectedPostStateSha256,
      result: request.result,
      nextAction: "close",
    }));
    return 0;
  } finally {
    releaseContinuityLock(lock);
  }
}

// ---- AC-047-28: deliberately narrow stale PRD-marker / PO authority rebind ----

const PO_REBIND_PLAN_SCHEMA = "pipeline.po-authority-rebind-plan.v1";
const PO_DECISION_PLAN_SCHEMA = "pipeline.po-authority-decision-plan.v1";
const PO_DECISION_SELECTION_SCHEMA = "pipeline.po-authority-selection.v1";
const PO_REBIND_LOCK_TOKEN = "pipeline-po-authority-rebind-v1";
const PO_REBIND_TXN_SCHEMA = "pipeline.po-authority-rebind-transaction.v1";
const TECHNICAL_SPEC_MARKER_RE = /^<!-- technical-spec-sha256: ([a-f0-9]{64}) -->$/gmu;
const PO_LANGUAGE_MARKER_RE = /^<!-- po-language: (de|en) -->$/gmu;
const PO_PROFILE_SCHEMA = "pipeline.po-gate-authority-evidence.v1";
const PO_PROFILE_KEYS = ["schema", "humanFacing", "sourceSha256", "runtimeSha256", "receiptSha256", "repositoryFingerprint"];

function rebindTransactionPath(dir) { return `${statePath(dir)}.po-authority-rebind.v1`; }

function physicalRebindFile(dir, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length < 1 || relativePath.length > 240
    || isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.includes("\0")) return null;
  const parts = relativePath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  let root;
  try {
    root = realpathSync(resolve(dir));
    if (root !== resolve(dir) || !lstatSync(root).isDirectory()) return null;
    let cursor = root;
    for (const part of parts) {
      cursor = join(cursor, part);
      const info = lstatSync(cursor);
      if (info.isSymbolicLink()) return null;
    }
    const info = lstatSync(cursor);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(cursor) !== cursor) return null;
    const bytes = readFileSync(cursor);
    const after = lstatSync(cursor);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
      || info.dev !== after.dev || info.ino !== after.ino || info.mode !== after.mode
      || info.size !== after.size || info.mtimeMs !== after.mtimeMs || realpathSync(cursor) !== cursor) return null;
    return {
      path: relativePath,
      absolute: cursor,
      bytes,
      sha256: sha256Bytes(bytes),
      // Canonical plan JSON accepts safe integers only; filesystem identity
      // values are platform-width values and mtimeMs may be fractional.
      identity: { dev: String(info.dev), ino: String(info.ino), mode: String(info.mode), size: String(info.size), mtimeMs: String(info.mtimeMs) },
    };
  } catch { return null; }
}

function rebindMarker(text) {
  const markers = [...text.matchAll(TECHNICAL_SPEC_MARKER_RE)];
  return markers.length === 1 ? { digest: markers[0][1], index: markers[0].index, length: markers[0][0].length } : null;
}

function replaceRebindMarker(prdBytes, marker, specSha256) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(prdBytes); } catch { return null; }
  const observed = rebindMarker(text);
  if (observed === null || observed.digest !== marker.digest || observed.index !== marker.index || observed.length !== marker.length) return null;
  const replacement = `<!-- technical-spec-sha256: ${specSha256} -->`;
  return Buffer.from(`${text.slice(0, marker.index)}${replacement}${text.slice(marker.index + marker.length)}`, "utf8");
}

function validRebindApproval(state, prd, spec, profile) {
  const approval = state?.planApproval;
  const authority = approval?.poGateAuthority;
  const approvalKeys = ["schema", "approvedBy", "approvedAt", "specBoundBy", "specBoundAt", "poGateAuthority"];
  const authorityKeys = ["schema", "humanFacing", "sourceSha256", "runtimeSha256", "receiptSha256", "repositoryFingerprint", "planPath", "planSha256", "specPath", "specSha256"];
  if (!exactObjectKeys(approval, approvalKeys) || !exactObjectKeys(authority, authorityKeys)
    || approval.schema !== "pipeline.plan-approval.v2"
    || isBlank(approval.approvedBy) || isBlank(approval.specBoundBy)
    || !canonicalIso(approval.approvedAt) || !canonicalIso(approval.specBoundAt)
    || authority.schema !== "pipeline.po-gate-authority.v2" || authority.planPath !== state.activeFeature?.planPath
    || authority.planSha256 !== prd.sha256 || authority.specPath !== spec.path
    || !SHA256_RE.test(authority.specSha256) || !profile?.ok) return null;
  const profileValue = profile.value;
  if (!profileValue || authority.humanFacing !== profileValue.humanFacing
    || authority.sourceSha256 !== profileValue.sourceSha256 || authority.runtimeSha256 !== profileValue.runtimeSha256
    || authority.receiptSha256 !== profileValue.receiptSha256 || authority.repositoryFingerprint !== profileValue.repositoryFingerprint) return null;
  return authority;
}

function validCurrentPoProfile(profile) {
  const value = profile?.value;
  return profile?.ok === true
    && exactObjectKeys(value, PO_PROFILE_KEYS)
    && value.schema === PO_PROFILE_SCHEMA
    && new Set(["de", "en"]).has(value.humanFacing)
    && SHA256_RE.test(value.sourceSha256)
    && SHA256_RE.test(value.runtimeSha256)
    && SHA256_RE.test(value.receiptSha256)
    && SHA256_RE.test(value.repositoryFingerprint)
    ? value
    : null;
}

function validCurrentDecisionDocuments(state, prd, spec, prdText, profile) {
  if (state.activeFeature?.planPath !== prd.path
    || !/^prd_[^/\\]+\.md$/u.test(basename(prd.path))
    || spec.path !== `${dirname(prd.path).split(sep).join("/")}/spec.md`) return false;
  let prds;
  try {
    prds = readdirSync(dirname(prd.absolute), { withFileTypes: true })
      .filter(({ name }) => /^prd_[^/\\]+\.md$/u.test(name));
  } catch {
    return false;
  }
  if (prds.length !== 1 || prds[0].name !== basename(prd.path)
    || !prds[0].isFile() || prds[0].isSymbolicLink()) return false;
  const languages = [...prdText.matchAll(PO_LANGUAGE_MARKER_RE)].map((match) => match[1]);
  return languages.length === 1 && languages[0] === profile.humanFacing;
}

function validPriorAuthority(state, prd, spec) {
  const approval = state?.planApproval;
  const authority = approval?.poGateAuthority;
  const approvalKeys = ["schema", "approvedBy", "approvedAt", "specBoundBy", "specBoundAt", "poGateAuthority"];
  const authorityKeys = ["schema","humanFacing","sourceSha256","runtimeSha256","receiptSha256","repositoryFingerprint","planPath","planSha256","specPath","specSha256"];
  if (!exactObjectKeys(approval, approvalKeys) || !exactObjectKeys(authority, authorityKeys)
    || approval.schema !== "pipeline.plan-approval.v2"
    || isBlank(approval.approvedBy) || isBlank(approval.specBoundBy)
    || authority.schema !== "pipeline.po-gate-authority.v2"
    || !canonicalIso(approval.approvedAt) || !canonicalIso(approval.specBoundAt)
    || authority.planPath !== prd.path || authority.specPath !== spec.path
    || !SHA256_RE.test(authority.planSha256) || !SHA256_RE.test(authority.specSha256)
    || !new Set(["de", "en"]).has(authority.humanFacing)
    || !SHA256_RE.test(authority.sourceSha256)
    || !SHA256_RE.test(authority.runtimeSha256)
    || !SHA256_RE.test(authority.receiptSha256)
    || !SHA256_RE.test(authority.repositoryFingerprint)) return null;
  return authority;
}

function eligibleRebindContinuity(state, prd, spec, oldAuthority) {
  const continuity = state?.continuity;
  if (!continuity || !validateContinuityState(continuity, state.activeFeature?.id).ok
    || continuity.authority.prd.path !== prd.path || continuity.authority.spec.path !== spec.path
    || continuity.authority.prd.sha256 !== oldAuthority.planSha256
    || continuity.authority.spec.sha256 !== oldAuthority.specSha256
    || continuity.queueHead?.dispatch !== null || continuity.blocker !== null
    || continuity.decisionTxn !== null || continuity.closeTransition != null
    || continuity.revision === Number.MAX_SAFE_INTEGER) return null;
  return continuity;
}

function eligibleDecisionContinuity(state, prd, spec) {
  const continuity = state?.continuity;
  if (!continuity || !validateContinuityState(continuity, state.activeFeature?.id).ok
    || continuity.authority.prd.path !== prd.path
    || continuity.authority.spec.path !== spec.path
    || continuity.queueHead?.dispatch !== null || continuity.blocker !== null
    || continuity.decisionTxn !== null || continuity.closeTransition != null
    || continuity.revision === Number.MAX_SAFE_INTEGER) return null;
  return continuity;
}

function canonicalIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function buildPoAuthorityRebindPlan(dir, deps, existing, plannedAt = deps.now?.() ?? new Date().toISOString()) {
  if (existing.status !== "ok" || !existing.state) return { ok: false, code: "PO-REBIND-STATE" };
  const state = existing.state;
  if (state.schema !== SCHEMA_ID || state.planApproved !== true || !state.activeFeature
    || state.activeFeature.phase !== "implementation" || typeof state.activeFeature.planPath !== "string") return { ok: false, code: "PO-REBIND-STATE" };
  const prd = physicalRebindFile(dir, state.activeFeature.planPath);
  if (prd === null) return { ok: false, code: "PO-REBIND-PRD-IDENTITY" };
  const stateFile = physicalRebindFile(dir, stateRelativePath(dir));
  if (stateFile === null || stateFile.sha256 !== sha256Bytes(existing.raw)) return { ok: false, code: "PO-REBIND-STATE-IDENTITY" };
  const specPath = `${dirname(state.activeFeature.planPath).split(sep).join("/")}/spec.md`;
  const spec = physicalRebindFile(dir, specPath);
  if (spec === null) return { ok: false, code: "PO-REBIND-SPEC-IDENTITY" };
  let prdText;
  try { prdText = new TextDecoder("utf-8", { fatal: true }).decode(prd.bytes); } catch { return { ok: false, code: "PO-REBIND-PRD-MARKER" }; }
  const marker = rebindMarker(prdText);
  if (marker === null || marker.digest === spec.sha256) return { ok: false, code: "PO-REBIND-NOT-STALE" };
  const profile = (deps.poGateProfile ?? ((request) => validatePoGateProfileForRepository(request)))({ repoRoot: dir });
  const oldAuthority = validRebindApproval(state, prd, spec, profile);
  if (oldAuthority === null || oldAuthority.specSha256 !== marker.digest || oldAuthority.specSha256 === spec.sha256) return { ok: false, code: "PO-REBIND-APPROVAL" };
  const continuity = eligibleRebindContinuity(state, prd, spec, oldAuthority);
  if (continuity === null) return { ok: false, code: "PO-REBIND-CONTINUITY" };
  const nextPrdBytes = replaceRebindMarker(prd.bytes, marker, spec.sha256);
  if (nextPrdBytes === null) return { ok: false, code: "PO-REBIND-PRD-MARKER" };
  const nextPrdSha256 = sha256Bytes(nextPrdBytes);
  const nextAuthority = {
    schema: "pipeline.po-gate-authority.v2",
    humanFacing: profile.value.humanFacing,
    sourceSha256: profile.value.sourceSha256,
    runtimeSha256: profile.value.runtimeSha256,
    receiptSha256: profile.value.receiptSha256,
    repositoryFingerprint: profile.value.repositoryFingerprint,
    planPath: prd.path,
    planSha256: nextPrdSha256,
    specPath: spec.path,
    specSha256: spec.sha256,
  };
  if (!canonicalIso(plannedAt)) return { ok: false, code: "PO-REBIND-TIMESTAMP" };
  const nextContinuity = structuredClone(continuity);
  nextContinuity.revision += 1;
  nextContinuity.authority.prd.sha256 = nextPrdSha256;
  nextContinuity.authority.spec.sha256 = spec.sha256;
  if (!validateContinuityState(nextContinuity, state.activeFeature.id).ok) return { ok: false, code: "PO-REBIND-CONTINUITY" };
  const nextState = structuredClone(state);
  nextState.activeFeature.phase = "design";
  nextState.planApproval.specBoundAt = plannedAt;
  nextState.planApproval.poGateAuthority = nextAuthority;
  nextState.continuity = nextContinuity;
  nextState.updatedAt = plannedAt;
  if (nextState.gateEstimate !== undefined) return { ok: false, code: "PO-REBIND-STATE" };
  const payload = {
    schema: PO_REBIND_PLAN_SCHEMA,
    root: realpathSync(resolve(dir)),
    plannedAt,
    preimage: {
      state: { sha256: sha256Bytes(existing.raw), identity: stateFile.identity, updatedAt: state.updatedAt ?? null, continuityRevision: continuity.revision },
      prd: { path: prd.path, sha256: prd.sha256, identity: prd.identity, technicalSpecSha256: marker.digest },
      spec: { path: spec.path, sha256: spec.sha256, identity: spec.identity },
      planApproval: state.planApproval,
      continuityAuthority: continuity.authority,
    },
    postimage: {
      prd: { path: prd.path, sha256: nextPrdSha256, technicalSpecSha256: spec.sha256 },
      state: { sha256: sha256Bytes(JSON.stringify(nextState, null, 2) + "\n"), updatedAt: nextState.updatedAt, continuityRevision: nextContinuity.revision, phase: "design" },
      poGateAuthority: nextAuthority,
      continuityAuthority: nextContinuity.authority,
    },
    assurance: { regularFilesOnly: true, linksRejected: true, privatePoProfile: true, windowsDacl: "required-by-po-profile" },
  };
  return { ok: true, payload, planSha256: sha256CanonicalJson(payload), nextPrdBytes, nextState };
}

function buildPoAuthorityDecisionPlan(dir, deps, existing, plannedAt = deps.now?.() ?? new Date().toISOString()) {
  if (existing.status !== "ok" || !existing.state) return { ok: false, code: "PO-DECISION-STATE" };
  const state = existing.state;
  if (state.schema !== SCHEMA_ID || state.planApproved !== true || !state.activeFeature
    || !new Set(["design", "implementation"]).has(state.activeFeature.phase)
    || typeof state.activeFeature.planPath !== "string") return { ok: false, code: "PO-DECISION-STATE" };
  const prd = physicalRebindFile(dir, state.activeFeature.planPath);
  const stateFile = physicalRebindFile(dir, stateRelativePath(dir));
  if (prd === null) return { ok: false, code: "PO-DECISION-PRD-IDENTITY" };
  if (stateFile === null || stateFile.sha256 !== sha256Bytes(existing.raw)) return { ok: false, code: "PO-DECISION-STATE-IDENTITY" };
  const specPath = `${dirname(state.activeFeature.planPath).split(sep).join("/")}/spec.md`;
  const spec = physicalRebindFile(dir, specPath);
  if (spec === null) return { ok: false, code: "PO-DECISION-SPEC-IDENTITY" };
  let prdText;
  try { prdText = new TextDecoder("utf-8", { fatal: true }).decode(prd.bytes); }
  catch { return { ok: false, code: "PO-DECISION-PRD-MARKER" }; }
  const marker = rebindMarker(prdText);
  if (marker === null) return { ok: false, code: "PO-DECISION-PRD-MARKER" };
  const profile = (deps.poGateProfile ?? ((request) => validatePoGateProfileForRepository(request)))({ repoRoot: dir });
  const currentProfile = validCurrentPoProfile(profile);
  if (currentProfile === null || !validCurrentDecisionDocuments(state, prd, spec, prdText, currentProfile)) {
    return { ok: false, code: "PO-DECISION-CURRENT-AUTHORITY" };
  }
  const priorAuthority = validPriorAuthority(state, prd, spec);
  if (priorAuthority === null) {
    return { ok: false, code: "PO-DECISION-PRIOR-AUTHORITY" };
  }
  const continuity = eligibleDecisionContinuity(state, prd, spec);
  if (continuity === null) return { ok: false, code: "PO-DECISION-CONTINUITY" };
  const documentDrift = marker.digest !== spec.sha256;
  const bindingDrift = priorAuthority.planSha256 !== prd.sha256
    || priorAuthority.specSha256 !== spec.sha256
    || continuity.authority.prd.sha256 !== prd.sha256
    || continuity.authority.spec.sha256 !== spec.sha256;
  if (!documentDrift && !bindingDrift) return { ok: false, code: "PO-DECISION-NOT-DRIFTED" };
  if (!canonicalIso(plannedAt)) return { ok: false, code: "PO-DECISION-TIMESTAMP" };
  const nextPrdBytes = documentDrift
    ? replaceRebindMarker(prd.bytes, marker, spec.sha256)
    : prd.bytes;
  if (nextPrdBytes === null) return { ok: false, code: "PO-DECISION-PRD-MARKER" };
  const nextPrdSha256 = sha256Bytes(nextPrdBytes);
  const nextAuthority = {
    schema: "pipeline.po-gate-authority.v2",
    humanFacing: currentProfile.humanFacing,
    sourceSha256: currentProfile.sourceSha256,
    runtimeSha256: currentProfile.runtimeSha256,
    receiptSha256: currentProfile.receiptSha256,
    repositoryFingerprint: currentProfile.repositoryFingerprint,
    planPath: prd.path,
    planSha256: nextPrdSha256,
    specPath: spec.path,
    specSha256: spec.sha256,
  };
  const nextContinuity = structuredClone(continuity);
  nextContinuity.revision += 1;
  nextContinuity.authority.prd.sha256 = nextPrdSha256;
  nextContinuity.authority.spec.sha256 = spec.sha256;
  if (!validateContinuityState(nextContinuity, state.activeFeature.id).ok) return { ok: false, code: "PO-DECISION-CONTINUITY" };
  const nextState = structuredClone(state);
  nextState.activeFeature.phase = "design";
  nextState.planApproval.specBoundAt = plannedAt;
  nextState.planApproval.poGateAuthority = nextAuthority;
  nextState.continuity = nextContinuity;
  nextState.updatedAt = plannedAt;
  if (nextState.gateEstimate !== undefined) return { ok: false, code: "PO-DECISION-STATE" };
  const stateSha256 = sha256Bytes(existing.raw);
  const basePayload = {
    schema: PO_DECISION_PLAN_SCHEMA,
    status: "planned",
    root: realpathSync(resolve(dir)),
    plannedAt,
    preimage: {
      state: { sha256: stateSha256, identity: stateFile.identity, updatedAt: state.updatedAt ?? null, continuityRevision: continuity.revision },
      planApproval: state.planApproval,
      continuityAuthority: continuity.authority,
      currentPoProfile: currentProfile,
      currentPrdMarker: { path: prd.path, technicalSpecSha256: marker.digest },
    },
    authoritySurfaces: {
      currentDocuments: {
        prd: { path: prd.path, sha256: prd.sha256, technicalSpecSha256: marker.digest },
        spec: { path: spec.path, sha256: spec.sha256 },
      },
      persistedPoGateAuthority: priorAuthority,
      continuityAuthority: continuity.authority,
      profileProvenance: {
        historical: {
          humanFacing: priorAuthority.humanFacing,
          sourceSha256: priorAuthority.sourceSha256,
          runtimeSha256: priorAuthority.runtimeSha256,
          receiptSha256: priorAuthority.receiptSha256,
          repositoryFingerprint: priorAuthority.repositoryFingerprint,
        },
        current: currentProfile,
      },
    },
    transition: {
      kind: "po-authority-design-review",
      fromPhase: state.activeFeature.phase,
      toPhase: "design",
      documentMutationRequired: documentDrift,
      bindingMutationRequired: bindingDrift,
    },
    candidates: [
      {
        id: "prd",
        role: "product-requirements",
        path: prd.path,
        provenance: "current-physical-worktree",
        sha256: prd.sha256,
        identity: prd.identity,
        technicalSpecSha256: marker.digest,
        referencedBinding: { planApprovalSha256: priorAuthority.planSha256, continuitySha256: continuity.authority.prd.sha256 },
        selection: { status: "unavailable", code: "PO-DECISION-REFERENCED-SPEC-BYTES-UNAVAILABLE" },
      },
      {
        id: "spec",
        role: "technical-specification",
        path: spec.path,
        provenance: "current-physical-worktree",
        sha256: spec.sha256,
        identity: spec.identity,
        referencedBinding: { planApprovalSha256: priorAuthority.specSha256, continuitySha256: continuity.authority.spec.sha256 },
        selection: { status: "available" },
      },
    ],
    assurance: { regularFilesOnly: true, linksRejected: true, privatePoProfile: true, windowsDacl: "required-by-po-profile" },
  };
  const planSha256 = sha256CanonicalJson(basePayload);
  const selectionPayload = {
    schema: PO_DECISION_SELECTION_SCHEMA,
    planSha256,
    selectedCandidate: "spec",
    preimage: {
      stateSha256,
      continuityRevision: continuity.revision,
      prdSha256: prd.sha256,
      specSha256: spec.sha256,
    },
    postimage: {
      prdSha256: nextPrdSha256,
      stateSha256: sha256Bytes(JSON.stringify(nextState, null, 2) + "\n"),
      continuityRevision: nextContinuity.revision,
      phase: "design",
      authority: nextAuthority,
    },
  };
  const selectionDigest = sha256CanonicalJson(selectionPayload);
  return {
    ok: true,
    payload: { ...basePayload, planSha256 },
    planSha256,
    selectionPayload,
    selectionDigest,
    nextPrdBytes,
    nextState,
    postimage: selectionPayload.postimage,
  };
}

function parsePoRebindApply(argv) {
  if (argv.length !== 5 || argv[0] !== "--plan-sha256" || !SHA256_RE.test(argv[1])
    || argv[2] !== "--updated-at" || !canonicalIso(argv[3]) || argv[4] !== "--activate") return null;
  return { planSha256: argv[1], plannedAt: argv[3] };
}

function parsePoDecisionSelection(argv) {
  if (argv.length !== 6 || argv[0] !== "--plan-sha256" || !SHA256_RE.test(argv[1])
    || argv[2] !== "--planned-at" || !canonicalIso(argv[3])
    || argv[4] !== "--selection" || !new Set(["prd", "spec"]).has(argv[5])) return null;
  return { planSha256: argv[1], plannedAt: argv[3], selection: argv[5] };
}

function parsePoDecisionApply(argv) {
  if (argv.length !== 9 || argv[0] !== "--plan-sha256" || !SHA256_RE.test(argv[1])
    || argv[2] !== "--selection-digest" || !SHA256_RE.test(argv[3])
    || argv[4] !== "--planned-at" || !canonicalIso(argv[5])
    || argv[6] !== "--selection" || argv[7] !== "spec" || argv[8] !== "--activate") return null;
  return { planSha256: argv[1], selectionDigest: argv[3], plannedAt: argv[5], selection: argv[7] };
}

function writeRebindFile(target, bytes, mode, nonce, replace, rename, sync) {
  const tmp = `${target}.rebind.${nonce}`;
  let fd;
  let renamed = false;
  try {
    fd = openSync(tmp, "wx", mode & 0o777);
    replace(fd, bytes);
    try { fchmodSync(fd, mode & 0o777); } catch { /* Windows has no POSIX mode contract */ }
    closeSync(fd); fd = undefined;
    rename(tmp, target); renamed = true;
    const durable = sync(dirname(target));
    if (!durable.ok) return { ok: false, committed: true, code: "PO-REBIND-DURABILITY" };
    return { ok: true, committed: true };
  } catch {
    // A rename wrapper may throw *after* it has replaced the target.  Never
    // classify that ambiguous outcome as pre-commit: the caller must restore
    // the observed postimage before it can report a failed transaction.
    try {
      if (Buffer.compare(readFileSync(target), bytes) === 0) return { ok: false, committed: null, code: "PO-REBIND-WRITE" };
    } catch { /* target did not become the requested postimage */ }
    return { ok: false, committed: renamed ? null : false, code: "PO-REBIND-WRITE" };
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (!renamed) { try { unlinkSync(tmp); } catch { /* cleanup only */ } }
  }
}

function restoreRebindFile(target, bytes, mode, nonce, deps) {
  const result = writeRebindFile(target, bytes, mode, `${nonce}.rollback`, deps.replace, deps.rename, deps.sync);
  if (!result.ok) return false;
  try { return Buffer.compare(readFileSync(target), bytes) === 0; } catch { return false; }
}

function parseRebindTransaction(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  const fileKeys = ["path", "sha256", "postSha256", "bytesBase64", "mode", "identity"];
  const identityKeys = ["dev", "ino", "mode", "size", "mtimeMs"];
  if (!exactObjectKeys(value, ["schema", "planSha256", "prd", "state"])
    || value.schema !== PO_REBIND_TXN_SCHEMA || !SHA256_RE.test(value.planSha256)
    || !exactObjectKeys(value.prd, fileKeys) || !exactObjectKeys(value.state, fileKeys)) return null;
  for (const file of [value.prd, value.state]) {
    if (typeof file.path !== "string" || !SHA256_RE.test(file.sha256) || !SHA256_RE.test(file.postSha256) || typeof file.bytesBase64 !== "string"
      || !Number.isSafeInteger(file.mode) || file.mode < 0 || file.mode > 0o777
      || !exactObjectKeys(file.identity, identityKeys)
      || identityKeys.some((key) => typeof file.identity[key] !== "string")
      || !Number.isSafeInteger(Number(file.identity.mode))
      || (Number(file.identity.mode) & 0o777) !== file.mode) return null;
    let bytes; try { bytes = Buffer.from(file.bytesBase64, "base64"); } catch { return null; }
    if (sha256Bytes(bytes) !== file.sha256 || bytes.toString("base64") !== file.bytesBase64) return null;
  }
  return value;
}

function publishRebindTransaction(dir, transaction, nonce) {
  const target = rebindTransactionPath(dir);
  if (existsSync(target)) return { ok: false, code: "PO-REBIND-RECOVERY-PENDING" };
  const bytes = Buffer.from(JSON.stringify(transaction) + "\n", "utf8");
  const replace = (fd, content) => { ftruncateSync(fd, 0); let offset = 0; while (offset < content.length) offset += writeSync(fd, content, offset, content.length - offset, offset); fsyncSync(fd); };
  const result = writeRebindFile(target, bytes, 0o600, `${nonce}.txn`, replace, renameSync, syncDirectory);
  return result.ok ? { ok: true, path: target } : { ok: false, code: result.code };
}

function clearRebindTransaction(dir) {
  const target = rebindTransactionPath(dir);
  try {
    if (existsSync(target)) unlinkSync(target);
    return syncDirectory(dirname(target)).ok;
  } catch { return false; }
}

function recoverRebindTransaction(dir, planSha256, nonce, io, stateIo) {
  const target = rebindTransactionPath(dir);
  if (!existsSync(target)) return { ok: true, kind: "none" };
  const journal = physicalRebindFile(dir, `${stateRelativePath(dir)}.po-authority-rebind.v1`);
  const transaction = journal === null ? null : parseRebindTransaction(journal.bytes.toString("utf8"));
  if (transaction === null || transaction.planSha256 !== planSha256) return { ok: false, code: "PO-REBIND-RECOVERY-PENDING" };
  const prd = physicalRebindFile(dir, transaction.prd.path);
  const state = physicalRebindFile(dir, transaction.state.path);
  if (prd === null || state === null) return { ok: false, code: "PO-REBIND-RECOVERY-IDENTITY" };
  const prdPre = Buffer.from(transaction.prd.bytesBase64, "base64");
  const statePre = Buffer.from(transaction.state.bytesBase64, "base64");
  const prdAtPreimage = prd.sha256 === transaction.prd.sha256;
  const stateAtPreimage = state.sha256 === transaction.state.sha256;
  const prdAtPostimage = prd.sha256 === transaction.prd.postSha256;
  const stateAtPostimage = state.sha256 === transaction.state.postSha256;
  if ((!prdAtPreimage && !prdAtPostimage) || (!stateAtPreimage && !stateAtPostimage)) {
    return { ok: false, code: "PO-REBIND-RECOVERY-DRIFT" };
  }
  if ((prdAtPreimage && !sameJson(prd.identity, transaction.prd.identity))
    || (stateAtPreimage && !sameJson(state.identity, transaction.state.identity))) {
    return { ok: false, code: "PO-REBIND-RECOVERY-IDENTITY" };
  }
  // The prepared record is not success. Clear it durably, then let the same
  // confirmed action revalidate, republish, and perform the transition.
  if (prdAtPreimage && stateAtPreimage) {
    return clearRebindTransaction(dir)
      ? { ok: true, kind: "prepared" }
      : { ok: false, code: "PO-REBIND-RECOVERY-ROLLBACK" };
  }
  // No interrupted postimage is accepted as a committed replay. The journal
  // binds only the preimage identities: after a crash, an attacker or another
  // process can replace either pathname with a different inode containing the
  // same postimage bytes. Byte equality therefore cannot prove that the
  // writer-owned objects survived. Restore both bound preimage byte/mode
  // surfaces, retire the journal durably, and require a freshly observed plan.
  const stateBack = stateAtPreimage || restoreRebindFile(state.absolute, statePre, transaction.state.mode, nonce, stateIo);
  const prdBack = prdAtPreimage || restoreRebindFile(prd.absolute, prdPre, transaction.prd.mode, nonce, io);
  if (!stateBack || !prdBack || !clearRebindTransaction(dir)) return { ok: false, code: "PO-REBIND-RECOVERY-ROLLBACK" };
  return { ok: true, kind: "rolled-back" };
}

function runPoAuthorityRebindCommand(sub, rest, deps) {
  if (sub === "po-authority-rebind-plan" && rest.length !== 0) { console.error("Error: PO authority rebind plan takes no arguments."); return 2; }
  const apply = sub === "po-authority-rebind-apply" ? parsePoRebindApply(rest) : null;
  if (sub === "po-authority-rebind-apply" && apply === null) { console.error("Error: PO authority rebind apply requires --plan-sha256 <sha256> --updated-at <ISO-8601> --activate."); return 2; }
  if (sub === "po-authority-rebind-plan" && existsSync(rebindTransactionPath(deps.dir))) {
    console.error("Error: PO authority rebind recovery is pending; replay the exact previously confirmed apply action.");
    return 2;
  }
  if (sub === "po-authority-rebind-apply") {
    const lock = acquireContinuityLock(deps.dir, PO_REBIND_LOCK_TOKEN, deps);
    if (!lock.ok) { console.error(`Error: PO authority rebind refused (${lock.code}); zero mutation.`); return 2; }
    try {
      const io = { replace: deps.replaceRebindPrdFdContents ?? ((fd, bytes) => { ftruncateSync(fd, 0); let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset); fsyncSync(fd); }), rename: deps.renameRebindPrd ?? renameSync, sync: deps.syncRebindDirectory ?? syncDirectory };
      const stateIo = { replace: deps.replaceRebindStateFdContents ?? io.replace, rename: deps.renameRebindState ?? renameSync, sync: deps.syncRebindDirectory ?? syncDirectory };
      const recovered = recoverRebindTransaction(deps.dir, apply.planSha256, lock.ownerNonce, io, stateIo);
      if (!recovered.ok) { console.error(`Error: PO authority rebind recovery refused (${recovered.code}); zero new mutation.`); return 2; }
      if (recovered.kind === "rolled-back") { console.error("Error: PO authority rebind recovered its interrupted transaction; regenerate and confirm a new plan."); return 2; }
      return runPoAuthorityRebindApply(apply, deps, lock, io, stateIo);
    } finally { releaseContinuityLock(lock); }
  }
  const existing = readStateRaw(deps.dir);
  const planned = buildPoAuthorityRebindPlan(deps.dir, deps, existing, apply?.plannedAt);
  if (!planned.ok) {
    console.error(`Error: PO authority rebind refused (${planned.code}); zero mutation.`);
    return 2;
  }
  if (sub === "po-authority-rebind-plan") {
    console.log(JSON.stringify({ ...planned.payload, planSha256: planned.planSha256, applyAction: {
      executable: process.execPath,
      argv: [fileURLToPath(import.meta.url), "po-authority-rebind-apply", "--plan-sha256", planned.planSha256, "--updated-at", planned.payload.plannedAt, "--activate"],
      mutation: true, requiresConfirmation: true, requiresHostBoundary: true,
    } }, null, 2));
    return 0;
  }
}

function runPoAuthorityDecisionCommand(sub, rest, deps) {
  if (sub === "po-authority-decision-plan" && rest.length !== 0) {
    console.error("Error: PO authority decision plan takes no arguments.");
    return 2;
  }
  const selection = sub === "po-authority-decision-select" ? parsePoDecisionSelection(rest) : null;
  const apply = sub === "po-authority-decision-apply" ? parsePoDecisionApply(rest) : null;
  if (sub === "po-authority-decision-select" && selection === null) {
    console.error("Error: PO authority selection requires --plan-sha256 <sha256> --planned-at <ISO-8601> --selection <prd|spec>.");
    return 2;
  }
  if (sub === "po-authority-decision-apply" && apply === null) {
    console.error("Error: PO authority decision apply requires --plan-sha256 <sha256> --selection-digest <sha256> --planned-at <ISO-8601> --selection spec --activate.");
    return 2;
  }
  if (sub !== "po-authority-decision-apply") {
    if (existsSync(rebindTransactionPath(deps.dir))) {
      console.error("Error: PO authority decision recovery is pending; replay the exact previously confirmed apply action.");
      return 2;
    }
    const existing = readStateRaw(deps.dir);
    const planned = buildPoAuthorityDecisionPlan(deps.dir, deps, existing, selection?.plannedAt);
    if (!planned.ok) {
      console.error(`Error: PO authority decision refused (${planned.code}); zero mutation.`);
      return 2;
    }
    if (selection && selection.planSha256 !== planned.planSha256) {
      console.error("Error: PO authority decision plan is stale; zero mutation.");
      return 2;
    }
    const writer = fileURLToPath(import.meta.url);
    if (sub === "po-authority-decision-plan") {
      console.log(JSON.stringify({
        ...planned.payload,
        selectionActions: [
          {
            selectedCandidate: "prd",
            status: "unavailable",
            code: "PO-DECISION-REFERENCED-SPEC-BYTES-UNAVAILABLE",
            mutation: false,
          },
          {
            selectedCandidate: "spec",
            status: "available",
            executable: process.execPath,
            argv: [
              writer,
              "po-authority-decision-select",
              "--plan-sha256",
              planned.planSha256,
              "--planned-at",
              planned.payload.plannedAt,
              "--selection",
              "spec",
            ],
            mutation: false,
            requiresConfirmation: true,
          },
        ],
      }, null, 2));
      return 0;
    }
    if (selection.selection === "prd") {
      console.error("Error: PO authority PRD selection is not safely formable because the referenced Spec bytes are unavailable; zero mutation.");
      return 2;
    }
    console.log(JSON.stringify({
      schema: PO_DECISION_SELECTION_SCHEMA,
      status: "selected",
      root: planned.payload.root,
      planSha256: planned.planSha256,
      selectionDigest: planned.selectionDigest,
      selectedCandidate: "spec",
      applyAction: {
        executable: process.execPath,
        argv: [
          writer,
          "po-authority-decision-apply",
          "--plan-sha256",
          planned.planSha256,
          "--selection-digest",
          planned.selectionDigest,
          "--planned-at",
          planned.payload.plannedAt,
          "--selection",
          "spec",
          "--activate",
        ],
        mutation: true,
        requiresConfirmation: true,
        requiresHostBoundary: true,
      },
    }, null, 2));
    return 0;
  }
  const lock = acquireContinuityLock(deps.dir, PO_REBIND_LOCK_TOKEN, deps);
  if (!lock.ok) {
    console.error(`Error: PO authority decision refused (${lock.code}); zero mutation.`);
    return 2;
  }
  try {
    const io = {
      replace: deps.replaceRebindPrdFdContents ?? ((fd, bytes) => {
        ftruncateSync(fd, 0);
        let offset = 0;
        while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset);
        fsyncSync(fd);
      }),
      rename: deps.renameRebindPrd ?? renameSync,
      sync: deps.syncRebindDirectory ?? syncDirectory,
    };
    const stateIo = {
      replace: deps.replaceRebindStateFdContents ?? io.replace,
      rename: deps.renameRebindState ?? renameSync,
      sync: deps.syncRebindDirectory ?? syncDirectory,
    };
    const recovered = recoverRebindTransaction(
      deps.dir,
      apply.selectionDigest,
      lock.ownerNonce,
      io,
      stateIo,
    );
    if (!recovered.ok) {
      console.error(`Error: PO authority decision recovery refused (${recovered.code}); zero new mutation.`);
      return 2;
    }
    if (recovered.kind === "rolled-back") {
      console.error("Error: PO authority decision recovered its interrupted transaction; regenerate and confirm a new plan.");
      return 2;
    }
    return runPoAuthorityRebindApply(apply, deps, lock, io, stateIo, {
      buildPlan: buildPoAuthorityDecisionPlan,
      resultSchema: "pipeline.po-authority-decision-apply.v1",
      resultCode: "PO-DECISION-APPLIED",
    });
  } finally {
    releaseContinuityLock(lock);
  }
}

function runPoAuthorityRebindApply(apply, deps, lock, io, stateIo, {
  buildPlan = buildPoAuthorityRebindPlan,
  resultSchema = "pipeline.po-authority-rebind-apply.v1",
  resultCode = "PO-REBIND-APPLIED",
} = {}) {
  const existing = readStateRaw(deps.dir);
  const planned = buildPlan(deps.dir, deps, existing, apply.plannedAt);
  if (!planned.ok || apply.planSha256 !== planned.planSha256
    || (apply.selectionDigest !== undefined && apply.selectionDigest !== planned.selectionDigest)) {
    console.error("Error: PO authority rebind plan is stale; zero mutation."); return 2;
  }
  const transactionDigest = apply.selectionDigest ?? apply.planSha256;
  try {
    const current = readStateRaw(deps.dir);
    const rebuilt = buildPlan(deps.dir, deps, current, apply.plannedAt);
    if (!rebuilt.ok || rebuilt.planSha256 !== apply.planSha256
      || (apply.selectionDigest !== undefined && rebuilt.selectionDigest !== apply.selectionDigest)) {
      console.error("Error: PO authority rebind preimage drifted; zero mutation."); return 2;
    }
    const prdPath = rebuilt.payload.preimage.prd?.path
      ?? rebuilt.payload.candidates?.find((candidate) => candidate.id === "prd")?.path;
    const prePrdSha256 = rebuilt.payload.preimage.prd?.sha256
      ?? rebuilt.payload.candidates?.find((candidate) => candidate.id === "prd")?.sha256;
    const prePrdIdentity = rebuilt.payload.preimage.prd?.identity
      ?? rebuilt.payload.candidates?.find((candidate) => candidate.id === "prd")?.identity;
    const postimage = rebuilt.payload.postimage ?? rebuilt.postimage;
    const prd = physicalRebindFile(deps.dir, prdPath);
    const stateRelative = stateRelativePath(deps.dir);
    const stateFile = physicalRebindFile(deps.dir, stateRelative);
    if (prd === null || stateFile === null || prd.sha256 !== prePrdSha256
      || !sameJson(prd.identity, prePrdIdentity)
      || stateFile.sha256 !== rebuilt.payload.preimage.state.sha256
      || !sameJson(stateFile.identity, rebuilt.payload.preimage.state.identity)) {
      console.error("Error: PO authority rebind preimage identity drifted; zero mutation."); return 2;
    }
    const transaction = { schema: PO_REBIND_TXN_SCHEMA, planSha256: transactionDigest,
      prd: { path: prd.path, sha256: prd.sha256, postSha256: postimage.prd?.sha256 ?? postimage.prdSha256, bytesBase64: prd.bytes.toString("base64"), mode: Number(prd.identity.mode) & 0o777, identity: prd.identity },
      state: { path: stateRelative, sha256: stateFile.sha256, postSha256: postimage.state?.sha256 ?? postimage.stateSha256, bytesBase64: stateFile.bytes.toString("base64"), mode: Number(stateFile.identity.mode) & 0o777, identity: stateFile.identity } };
    const published = publishRebindTransaction(deps.dir, transaction, lock.ownerNonce);
    if (!published.ok) { console.error(`Error: PO authority rebind transaction prepare failed (${published.code}); zero authority mutation.`); return 2; }
    deps.afterRebindTransactionPrepared?.();
    const prdWriteRequired = Buffer.compare(rebuilt.nextPrdBytes, prd.bytes) !== 0;
    const wrotePrd = prdWriteRequired
      ? writeRebindFile(prd.absolute, rebuilt.nextPrdBytes, prd.identity.mode, lock.ownerNonce, io.replace, io.rename, io.sync)
      : { ok: true, committed: false };
    if (!wrotePrd.ok) {
      const rolledBack = wrotePrd.committed === false || restoreRebindFile(prd.absolute, prd.bytes, prd.identity.mode, lock.ownerNonce, io);
      const cleared = rolledBack && clearRebindTransaction(deps.dir);
      console.error(`Error: PO authority rebind PRD write failed (${wrotePrd.code}); ${rolledBack && cleared ? "rollback verified" : "rollback unresolved"}.`);
      return 2;
    }
    deps.afterRebindPrdWritten?.();
    const stateBytes = Buffer.from(JSON.stringify(rebuilt.nextState, null, 2) + "\n", "utf8");
    const wroteState = writeRebindFile(stateFile.absolute, stateBytes, stateFile.identity.mode, lock.ownerNonce, stateIo.replace, stateIo.rename, stateIo.sync);
    if (!wroteState.ok) {
      const stateRolledBack = wroteState.committed === false || restoreRebindFile(stateFile.absolute, stateFile.bytes, stateFile.identity.mode, lock.ownerNonce, stateIo);
      const prdRolledBack = !prdWriteRequired || restoreRebindFile(prd.absolute, prd.bytes, prd.identity.mode, lock.ownerNonce, io);
      const cleared = stateRolledBack && prdRolledBack && clearRebindTransaction(deps.dir);
      console.error(`Error: PO authority rebind State write failed (${wroteState.code}); ${stateRolledBack && prdRolledBack && cleared ? "rollback verified" : "rollback unresolved"}.`);
      return 2;
    }
    deps.afterRebindStateWritten?.();
    const postPrd = physicalRebindFile(deps.dir, prd.path);
    const postState = readStateRaw(deps.dir);
    const postStateFile = physicalRebindFile(deps.dir, stateRelativePath(deps.dir));
    const authority = (deps.poGateAuthority ?? ((request) => validatePoGateAuthorityForRepository(request)))({
      repoRoot: deps.dir,
      expectedPlanSha256: postimage.prd?.sha256 ?? postimage.prdSha256,
      expectedSpecSha256: postimage.poGateAuthority?.specSha256 ?? postimage.authority.specSha256,
    });
    // This transaction deliberately retains the sanctioned State lock through
    // postimage validation. The generic cleanup-recovery planner cannot
    // distinguish that live, caller-owned lock from unavailable cleanup
    // evidence, so exclude only that planner from this in-transaction readback.
    // All repository, runtime, Continuity, PO-authority, App Server and intent
    // predicates remain the real V4 inspection.
    const inTransactionV4Deps = {
      planSessionCleanupRecovery: () => ({
        schema: "pipeline.session-cleanup-recovery-plan.v1",
        status: "not-needed",
      }),
    };
    const inspectV4 = deps.v4Inspection
      ?? ((request) => inspectProjectOnboardingV3({ ...request, deps: inTransactionV4Deps }));
    const v4Readbacks = ["bootstrap", "session", "dispatch"]
      .map((intent) => inspectV4({ rootDir: deps.dir, intent, deps: inTransactionV4Deps }));
    const expectedAuthority = postimage.poGateAuthority ?? postimage.authority;
    const postimageEvidence = {
      schema: "pipeline.po-authority-postimage-readback.v1",
      predicates: {
        prdDigest: {
          ok: postPrd?.sha256 === (postimage.prd?.sha256 ?? postimage.prdSha256),
          expected: postimage.prd?.sha256 ?? postimage.prdSha256,
          observed: postPrd?.sha256 ?? null,
        },
        stateFile: { ok: postStateFile !== null, observed: postStateFile === null ? "unavailable" : "regular" },
        stateValue: {
          ok: postState.status === "ok" && sameJson(postState.state, rebuilt.nextState),
          observed: postState.status,
        },
        poAuthority: {
          ok: authority?.ok === true && sameJson(authority.value, expectedAuthority),
          observed: authority?.ok === true ? "ready" : authority?.code ?? "unavailable",
        },
        v4Intents: v4Readbacks.map((readback, index) => ({
          intent: ["bootstrap", "session", "dispatch"][index],
          ok: readback?.status === "ready",
          status: readback?.status ?? "unavailable",
          diagnostics: Array.isArray(readback?.diagnostics)
            ? readback.diagnostics.map((diagnostic) => diagnostic?.code ?? "unknown")
            : [],
        })),
      },
    };
    deps.observeRebindPostimageEvidence?.(postimageEvidence);
    const postOk = postimageEvidence.predicates.prdDigest.ok
      && postimageEvidence.predicates.stateFile.ok
      && postimageEvidence.predicates.stateValue.ok
      && postimageEvidence.predicates.poAuthority.ok
      && postimageEvidence.predicates.v4Intents.every((readback) => readback.ok);
    if (!postOk) {
      const stateRollback = restoreRebindFile(stateFile.absolute, stateFile.bytes, stateFile.identity.mode, lock.ownerNonce, stateIo);
      const prdRollback = !prdWriteRequired || restoreRebindFile(prd.absolute, prd.bytes, prd.identity.mode, lock.ownerNonce, io);
      const cleared = stateRollback && prdRollback && clearRebindTransaction(deps.dir);
      console.error(`Error: PO authority rebind postimage readback failed (${JSON.stringify(postimageEvidence)}); ${stateRollback && prdRollback && cleared ? "rollback verified" : "rollback unresolved"}.`);
      return 2;
    }
    if (!clearRebindTransaction(deps.dir)) {
      const stateRollback = restoreRebindFile(stateFile.absolute, stateFile.bytes, stateFile.identity.mode, lock.ownerNonce, stateIo);
      const prdRollback = !prdWriteRequired || restoreRebindFile(prd.absolute, prd.bytes, prd.identity.mode, lock.ownerNonce, io);
      console.error(`Error: PO authority rebind transaction close failed; ${stateRollback && prdRollback && clearRebindTransaction(deps.dir) ? "rollback verified" : "rollback unresolved"}.`);
      return 2;
    }
    console.log(JSON.stringify({
      schema: resultSchema,
      status: "applied",
      code: resultCode,
      root: rebuilt.payload.root,
      planSha256: rebuilt.planSha256,
      ...(apply.selectionDigest ? { selectionDigest: apply.selectionDigest, selectedCandidate: apply.selection } : {}),
      continuityRevision: rebuilt.nextState.continuity.revision,
      phase: rebuilt.nextState.activeFeature.phase,
    }));
    return 0;
  } catch { console.error("Error: PO authority rebind transaction failed; recovery journal retained."); return 2; }
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
  const poGateAuthority = deps.poGateAuthority ?? ((request) => validatePoGateAuthorityForRepository(request));

  const [sub, ...rest] = argv;
  const flags = parseFlags(rest);

  if (sub === "po-authority-rebind-plan" || sub === "po-authority-rebind-apply") {
    return runPoAuthorityRebindCommand(sub, rest, {
      ...deps,
      dir,
      now,
      poGateAuthority,
      poGateProfile: deps.poGateProfile ?? ((request) => validatePoGateProfileForRepository(request)),
    });
  }
  if (new Set(["po-authority-decision-plan", "po-authority-decision-select", "po-authority-decision-apply"]).has(sub)) {
    return runPoAuthorityDecisionCommand(sub, rest, {
      ...deps,
      dir,
      now,
      poGateAuthority,
      poGateProfile: deps.poGateProfile ?? ((request) => validatePoGateProfileForRepository(request)),
    });
  }
  if (sub === "continuity-adoption-plan" || sub === "continuity-adoption-apply") {
    return runLegacyAdoptionCommand(sub, flags, { ...deps, dir, now });
  }
  if (sub === "continuity-result-close-plan" || sub === "continuity-result-close-apply") {
    return runResultCloseCommand(sub, rest, { ...deps, dir, now });
  }
  if (sub === "continuity-result-bootstrap-plan" || sub === "continuity-result-bootstrap-apply") {
    return runResultBootstrapCommand(sub, rest, { ...deps, dir, now });
  }
  if (sub === "continuity-result-rebind-plan" || sub === "continuity-result-rebind-apply") {
    return runResultRebindCommand(sub, rest, { ...deps, dir, now });
  }
  if (CONTINUITY_SUBCOMMANDS.has(sub)) return runContinuityCommand(sub, flags, { ...deps, dir, now });
  if (PUBLICATION_SUBCOMMANDS.has(sub)) return runPublicationCommand(sub, flags, { ...deps, dir, now });

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
      delete next.planSubmission;
      delete next.planInvalidation;
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
      if (!new Set(["design", "implementation"]).has(phase)) {
        console.error('Error: set-phase requires --phase <design|implementation>.');
        return 2;
      }
      const lifecycle = derivePlanLifecycle(base);
      if (!lifecycle.ok || lifecycle.status === null) {
        console.error(`Error: set-phase rejected invalid lifecycle state (${lifecycle.code}).`);
        return 2;
      }
      if (phase === "design") {
        if (base.activeFeature.phase !== "design" || !new Set(["draft", "awaiting-approval"]).has(lifecycle.status)) {
          console.error("Error: use reopen-design --by <name> before leaving an approved or implementing lifecycle.");
          return 2;
        }
        console.log('Phase already "design"; zero-write replay accepted.');
        return 0;
      }
      const written = writeState(dir, undefined, base, {
        transition: (observed) => {
          const transition = enterPlanImplementation({
            state: observed,
            expectedStateSha256: sha256CanonicalJson(observed),
          });
          return transition.ok
            ? { ...transition, state: { ...transition.state, updatedAt: now() } }
            : transition;
        },
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: set-phase implementation requires an exact approved submission (${written.code}).`);
        return 2;
      }
      console.log('Phase set: "implementation"; lifecycle="implementing".');
      return 0;
    }

    case "submit-plan": {
      const by = flags.by;
      const profileName = flags.profile;
      if (isBlank(by) || !new Set(["epic", "feature", "mini"]).has(profileName)) {
        console.error("Error: submit-plan requires --by <name> --profile <epic|feature|mini>.");
        return 2;
      }
      const authority = poGateAuthority({ repoRoot: dir });
      const profile = (deps.poGateProfile ?? ((request) => validatePoGateProfileForRepository(request)))({ repoRoot: dir });
      if (!authority?.ok || authority.value?.planPath !== base.activeFeature?.planPath || !profile?.ok) {
        console.error(`Error: submit-plan blocked by ${authority?.code ?? profile?.code ?? "PO-GATE-AUTHORITY-INVALID"}.`);
        return 2;
      }
      const profileSha256 = sha256CanonicalJson(profile.value);
      const expectedPlanSha256 = authority.value.planSha256;
      const expectedSpecSha256 = authority.value.specSha256;
      let submittedAt;
      const written = writeState(dir, undefined, base, {
        transition: (observed) => {
          submittedAt = now();
          const transition = submitPlan({
            state: observed,
            expectedStateSha256: sha256CanonicalJson(observed),
            poGateAuthority: authority.value,
            profile: profileName,
            profileSha256,
            by,
            at: submittedAt,
          });
          return transition.ok
            ? { ...transition, state: { ...transition.state, updatedAt: submittedAt } }
            : transition;
        },
        beforeCommit: () => {
          const nextAuthority = poGateAuthority({ repoRoot: dir, expectedPlanSha256, expectedSpecSha256 });
          const nextProfile = (deps.poGateProfile ?? ((request) => validatePoGateProfileForRepository(request)))({ repoRoot: dir });
          return nextAuthority?.ok
            && JSON.stringify(nextAuthority.value) === JSON.stringify(authority.value)
            && nextProfile?.ok
            && sha256CanonicalJson(nextProfile.value) === profileSha256
            ? { ok: true }
            : { ok: false, code: nextAuthority?.code ?? nextProfile?.code ?? "PLAN-SUBMIT-AUTHORITY-STALE" };
        },
        allowContinuityAdvance: true,
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: submit-plan failed before commit (${written.code}); no submission was recorded.`);
        return 2;
      }
      console.log(`Plan submitted by "${by}" on ${submittedAt}; lifecycle="awaiting-approval".`);
      return 0;
    }

    case "reopen-design": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error("Error: reopen-design requires --by <name>.");
        return 2;
      }
      let reopenedAt;
      const written = writeState(dir, undefined, base, {
        transition: (observed) => {
          // Only an already-open exact replay may retain the persisted audit
          // timestamp.  A successor approval reopened after a prior audit must
          // bind this invocation's timestamp and current authority objects.
          reopenedAt = observed.activeFeature?.phase === "design" && observed.planApproved === false
            ? observed.planInvalidation?.invalidatedAt ?? now()
            : now();
          const transition = reopenPlanDesign({
            state: observed,
            expectedStateSha256: sha256CanonicalJson(observed),
            by,
            at: reopenedAt,
          });
          return transition.ok && !transition.replay
            ? { ...transition, state: { ...transition.state, updatedAt: reopenedAt } }
            : transition;
        },
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: reopen-design failed before commit (${written.code}); approval authority was not changed.`);
        return 2;
      }
      console.log(written.replay
        ? "Design is already open; zero-write replay accepted."
        : `Design reopened by "${by}" on ${reopenedAt}; lifecycle="draft".`);
      return 0;
    }

    case "seal-plan-approval": {
      if (!parseExactFlags(rest, new Set()).ok) {
        console.error("Error: seal-plan-approval accepts no caller arguments.");
        return 2;
      }
      const authority = poGateAuthority({ repoRoot: dir });
      const submission = base.planSubmission;
      if (!authority?.ok || !submission
        || authority.value.planPath !== submission.planPath
        || authority.value.planSha256 !== submission.planSha256
        || authority.value.specPath !== submission.specPath
        || authority.value.specSha256 !== submission.specSha256) {
        console.error(`Error: seal-plan-approval blocked by ${authority?.code ?? "PLAN-APPROVAL-SEAL-AUTHORITY-STALE"}.`);
        return 2;
      }
      const expectedAuthority = authority.value;
      let sealedAt;
      const written = writeState(dir, undefined, base, {
        transition: (observed) => {
          sealedAt = now();
          const transition = sealCurrentPlanApproval({
            state: observed,
            expectedStateSha256: sha256CanonicalJson(observed),
          });
          return transition.ok
            ? { ...transition, state: { ...transition.state, updatedAt: sealedAt } }
            : transition;
        },
        beforeCommit: () => {
          const current = poGateAuthority({ repoRoot: dir, expectedPlanSha256: expectedAuthority.planSha256, expectedSpecSha256: expectedAuthority.specSha256 });
          return current?.ok && sameJson(current.value, expectedAuthority)
            ? { ok: true }
            : { ok: false, code: current?.code ?? "PLAN-APPROVAL-SEAL-AUTHORITY-STALE" };
        },
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: seal-plan-approval refused (${written.code}); PO approval was not changed.`);
        return 2;
      }
      const persisted = readState(dir);
      if (persisted.status !== "ok" || !sameJson(persisted.state, written.transition?.state)) {
        console.error("Error: seal-plan-approval postimage readback failed; inspect persisted State before retry.");
        return 2;
      }
      console.log(`Plan approval audit seal written on ${sealedAt}; current PO approval retained.`);
      return 0;
    }

    case "set-gate-estimate": {
      const parsed = parseGateEstimateSetFlags(rest);
      if (!parsed.ok) {
        console.error("Error: set-gate-estimate requires exactly --id <safe-id> --expected-current-id <absent|safe-id> --feature-id <id> --gate <gate> --object-format <sha1|sha256> --source-oid <hex> --evidence-path <repo-relative-path> --evidence-sha256 <64-lowercase-hex> --min-minutes <integer> --max-minutes <integer> --by coordinator.");
        return 2;
      }
      const request = parsed.value;
      const written = writeState(dir, undefined, base, {
        preserveGateEstimate: true,
        transition: (observed) => {
          const inputs = observeGateEstimateInputs(dir, request, deps);
          if (!inputs.ok) return inputs;
          const prepared = prepareGateEstimateMutation(observed, request, {
            observation: inputs.observation,
            evidence: inputs.evidence,
            now: new Date(now()),
          });
          return prepared.ok
            ? { ok: true, state: prepared.state, replay: prepared.zeroWrite === true, code: prepared.code }
            : prepared;
        },
        beforeCommit: () => {
          const inputs = observeGateEstimateInputs(dir, request, deps);
          if (!inputs.ok) return inputs;
          return inputs.observation.objectFormat === request.objectFormat
            && inputs.observation.sourceOid === request.sourceOid
            && inputs.evidence.path === request.evidencePath
            && inputs.evidence.sha256 === request.evidenceSha256
            ? { ok: true }
            : { ok: false, code: "PS-GATE-ESTIMATE-INPUT-DRIFT" };
        },
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: set-gate-estimate refused (${written.code}); no estimate was recorded.`);
        return 2;
      }
      console.log(written.replay
        ? `Gate estimate "${request.id}" already recorded; zero-write replay accepted.`
        : `Gate estimate "${request.id}" recorded for feature "${request.featureId}".`);
      return 0;
    }

    case "approve-plan": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Error: approve-plan requires --by <name> (non-empty) -- an unattributed approval is refused.');
        return 2;
      }
      const lifecycle = derivePlanLifecycle(base);
      if (!lifecycle.ok || lifecycle.status !== "awaiting-approval"
        || !SHA256_RE.test(lifecycle.submissionSha256 ?? "")) {
        console.error(`Error: approve-plan requires an exact current submitted plan (${lifecycle.code}); run submit-plan first.`);
        return 2;
      }
      const authority = poGateAuthority({ repoRoot: dir });
      const profile = (deps.poGateProfile ?? ((request) => validatePoGateProfileForRepository(request)))({ repoRoot: dir });
      if (
        !authority?.ok
        || typeof authority.value?.planPath !== "string"
        || authority.value.planPath !== base.activeFeature?.planPath
        || !profile?.ok
      ) {
        console.error(`Error: approve-plan blocked by ${authority?.code ?? "PO-GATE-AUTHORITY-INVALID"}; repair the repository-scoped PO profile and single-PRD authority first.`);
        return 2;
      }
      const expectedPlanSha256 = authority.value.planSha256;
      const expectedSpecSha256 = authority.value.specSha256;
      const profileSha256 = sha256CanonicalJson(profile.value);
      const expectedSubmissionSha256 = lifecycle.submissionSha256;
      let approvedAt;
      const written = writeState(dir, undefined, base, {
        transition: (observed) => {
          approvedAt = now();
          const transition = approveSubmittedPlan({
            state: observed,
            expectedStateSha256: sha256CanonicalJson(observed),
            expectedSubmissionSha256,
            poGateAuthority: authority.value,
            profileSha256,
            by,
            at: approvedAt,
          });
          return transition.ok
            ? { ...transition, state: { ...transition.state, updatedAt: approvedAt } }
            : transition;
        },
        beforeCommit: () => {
          const observed = poGateAuthority({ repoRoot: dir, expectedPlanSha256, expectedSpecSha256 });
          const observedProfile = (deps.poGateProfile ?? ((request) => validatePoGateProfileForRepository(request)))({ repoRoot: dir });
          return observed?.ok
            && JSON.stringify(observed.value) === JSON.stringify(authority.value)
            && observedProfile?.ok
            && sha256CanonicalJson(observedProfile.value) === profileSha256
            ? { ok: true }
            : { ok: false, code: observed?.code ?? "PO-GATE-AUTHORITY-STALE" };
        },
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: approve-plan authority or v2 transition failed before commit (${written.code}); no approval was recorded.`);
        return 2;
      }
      console.log(`Plan approved by "${by}" on ${approvedAt}; lifecycle="approved".`);
      return 0;
    }

    case "revoke-plan": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Error: revoke-plan requires --by <name> (non-empty) -- an unattributed revocation is refused.');
        return 2;
      }
      const expectedPlanSha256 = base.planApproval?.poGateAuthority?.planSha256;
      const expectedSpecSha256 = base.planApproval?.poGateAuthority?.specSha256;
      let revokedAt;
      const written = writeState(dir, undefined, base, {
        transition: (observed) => {
          revokedAt = observed.planRevocation?.revokedAt ?? now();
          const transition = revokePlanV2({
            state: observed,
            expectedStateSha256: sha256CanonicalJson(observed),
            expectedPlanSha256,
            expectedSpecSha256,
            by,
            at: revokedAt,
          });
          return transition.replay
            ? transition
            : { ...transition, state: { ...transition.state, schema: SCHEMA_ID, updatedAt: revokedAt } };
        },
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: revoke-plan requires a current exact v2 approval (${written.code}); no revocation was recorded.`);
        return 2;
      }
      console.log(written.replay
        ? `Plan revocation by "${by}" on ${revokedAt} already recorded.`
        : `Plan approval revoked by "${by}" on ${revokedAt}.`);
      return 0;
    }

    case "bind-plan-spec": {
      const parsed = parseExactFlags(rest, new Set(["by", "expected-plan-sha256", "expected-spec-sha256"]));
      if (!parsed.ok) {
        console.error("Error: bind-plan-spec requires exactly --by <name> --expected-plan-sha256 <64 lowercase hex> --expected-spec-sha256 <64 lowercase hex>.");
        return 2;
      }
      const by = parsed.value.by;
      const expectedPlanSha256 = parsed.value["expected-plan-sha256"];
      const expectedSpecSha256 = parsed.value["expected-spec-sha256"];
      if (isBlank(by) || !SHA256_RE.test(expectedPlanSha256) || !SHA256_RE.test(expectedSpecSha256)) {
        console.error("Error: bind-plan-spec requires non-blank --by and lowercase SHA-256 Plan and Spec digests.");
        return 2;
      }
      const authority = poGateAuthority({ repoRoot: dir, expectedPlanSha256, expectedSpecSha256 });
      if (
        !authority?.ok
        || typeof authority.value?.planPath !== "string"
        || authority.value.planPath !== base.activeFeature?.planPath
      ) {
        console.error(`Error: bind-plan-spec blocked by ${authority?.code ?? "PO-GATE-AUTHORITY-INVALID"}; repair the repository-scoped PO profile and matching PRD/Spec authority first.`);
        return 2;
      }
      let boundAt;
      const written = writeState(dir, undefined, base, {
        transition: (observed) => {
          boundAt = observed.planApproval?.specBoundAt ?? now();
          const transitionState = projectV1LegacyApprovalForSpecBind(observed, expectedPlanSha256);
          const transition = bindPlanSpecApproval({
            state: transitionState,
            expectedStateSha256: sha256CanonicalJson(transitionState),
            poGateAuthority: authority.value,
            expectedPlanSha256,
            expectedSpecSha256,
            by,
            at: boundAt,
          });
          return transition.replay
            ? transition
            : { ...transition, state: { ...transition.state, updatedAt: boundAt } };
        },
        beforeCommit: () => {
          const observed = poGateAuthority({ repoRoot: dir, expectedPlanSha256, expectedSpecSha256 });
          return observed?.ok && JSON.stringify(observed.value) === JSON.stringify(authority.value)
            ? { ok: true }
            : { ok: false, code: observed?.code ?? "PO-GATE-AUTHORITY-STALE" };
        },
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: bind-plan-spec refused (${written.code}); no approval migration was recorded.`);
        return 2;
      }
      console.log(written.replay
        ? `Plan approval is already spec-bound for "${by}" on ${boundAt}.`
        : `Plan approval spec-bound by "${by}" on ${boundAt}.`);
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
      let coordinatorClose;
      const coordinatorLifecycle = flags["coordinator-lifecycle"];
      const coordinatorSha256 = flags["coordinator-sha256"];
      if (coordinatorLifecycle !== undefined || coordinatorSha256 !== undefined) {
        if (isBlank(coordinatorLifecycle) || !/^[A-Za-z0-9._-]{1,100}$/u.test(coordinatorLifecycle)
          || !/^[0-9a-f]{64}$/u.test(coordinatorSha256 ?? "")) {
          console.error("Error: close-feature coordinator binding requires exact --coordinator-lifecycle and --coordinator-sha256 values.");
          return 2;
        }
        const common = (deps.gitCommonDir ?? defaultGitCommonDir)(dir);
        if (!common?.ok) {
          console.error("Error: close-feature coordinator Git common directory is unavailable.");
          return 2;
        }
        let stored;
        try { stored = (deps.readCloseCoordinator ?? readCloseCoordinator)(common.path, coordinatorLifecycle); }
        catch {
          console.error("Error: close-feature coordinator state is unavailable or unsafe.");
          return 2;
        }
        const coordinator = stored?.coordinator;
        if (coordinator?.phase !== "feature-close-prepared"
          || coordinator.lifecycleId !== coordinatorLifecycle
          || coordinator.featureId !== activeFeature.id
          || coordinator.activeFeature?.id !== activeFeature.id
          || coordinator.activeFeature?.planPath !== activeFeature.planPath
          || coordinator.authority?.pipelineStateSha256
            !== sha256Bytes(readFileSync(statePath(dir)))
          || closeCoordinatorDigest(coordinator) !== coordinatorSha256) {
          console.error("Error: close-feature coordinator is not bound to this exact feature-close-prepared State transition.");
          return 2;
        }
        coordinatorClose = {
          schema: "pipeline.close-coordinator-reference.v1",
          lifecycleId: coordinatorLifecycle,
          stateSha256: coordinatorSha256,
          revision: coordinator.revision,
          phase: coordinator.phase,
        };
      }
      let continuityClose;
      if (base.continuity !== undefined) {
        const closeRequest = readContinuityRequest(dir, flags["continuity-close-request"]);
        if (!closeRequest.ok || !validateContinuityCloseRequest(dir, base, closeRequest.value)) {
          console.error("Error: active continuity requires --continuity-close-request <repo-relative-json> bound to the exact revision, Result and close evidence.");
          return 2;
        }
        continuityClose = structuredClone(closeRequest.value);
        const sessionCleanup = base.continuity.runtime?.sessionCleanup ?? null;
        if (sessionCleanup !== null) {
          let closure;
          try {
            const inspectClosure = deps.inspectSessionClosureFn ?? inspectSessionClosure;
            closure = inspectClosure(dir, sessionCleanup.sessionId, {
              expectedDescriptorSha256: sessionCleanup.descriptorSha256,
            });
          } catch {
            console.error("Error: continuity-bound feature close could not prove the exact cleanup closure; zero mutation.");
            return 2;
          }
          if (closure?.status !== "closed") {
            console.error("Error: continuity-bound feature close requires the exact cleanup descriptor to be closed before continuity removal.");
            return 2;
          }
        }
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
      if (coordinatorClose !== undefined) closedEntry.coordinatorClose = coordinatorClose;
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
      delete next.planSubmission;
      delete next.planInvalidation;
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
        `Error: unknown command "${sub ?? ""}". Allowed: set-feature, submit-plan, approve-plan, reopen-design, seal-plan-approval, set-phase, set-gate-estimate, revoke-plan, bind-plan-spec, approve-push, close-feature, approve-deploy, consume-deploy, clear-deploy, po-authority-rebind-plan, po-authority-rebind-apply, po-authority-decision-plan, po-authority-decision-select, po-authority-decision-apply, continuity-init, continuity-cas, continuity-integrate-final, continuity-record-course-brief, continuity-select-course, continuity-apply-decision, continuity-clear-decision, continuity-result-bootstrap-plan, continuity-result-bootstrap-apply, continuity-result-rebind-plan, continuity-result-rebind-apply, continuity-result-close-plan, continuity-result-close-apply, publication-prepare, publication-approve, publication-authorize, publication-reconcile, publication-observe, publication-start-readback, publication-close, publication-rearm, publication-block.`,
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
