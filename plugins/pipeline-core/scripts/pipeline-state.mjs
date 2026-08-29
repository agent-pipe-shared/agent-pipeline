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
 *       "lastApproved": { "approvedBy": "<string>", "approvedAt": "<ISO-8601>", "forCommit": "<sha>",
 *         "remote": "<safe-remote>", "destination": "<full-ref>", "criticalProof": <verified-proof> }
 *     } | absent,
 *     "criticalProofConsumption": [
 *       { "proofSha256": "<sha256>", "kind": "push" | "feature-package-reconcile", "consumedAt": "<ISO-8601>" }
 *     ] | absent,
 *     "featurePackageReconcileApproval": {
 *       "lastApproved": { "approvedBy": "<string>", "approvedAt": "<ISO-8601>", "forCommit": "<sha>",
 *         "criticalProof": <verified-proof>|null, "criticalProofWaiver": <waiver>? }
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
 *     "phoenixEpicHistory": <opaque preserved sprint-phoenix-epic continuity/authority
 *       record, own `note` field explains provenance> | absent,
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
 *   `featurePackageReconcileApproval` (PHX-WP-PAC08-APPROVAL-LEDGER, closing Critic
 *   finding F-B): the durable, attributed record of a PO-bound `feature-package-reconcile`
 *   approval, written by `defaultFeaturePackageReconcileApproval` into the GOVERNING
 *   session's own state (never `--root`'s) at the moment `verifyCriticalHumanProof`
 *   returns `ok:true` -- before the reconcile journal is published or any manifest byte
 *   is touched, so a verified proof is burned even if a later, unrelated step fails.
 *   `criticalProof` is `null` in chat mode (ADR-0056), but `approvedBy`/`approvedAt`/
 *   `forCommit` are always recorded, which is what binds a chat-cleared reconcile to an
 *   exact commit. `criticalProofConsumption` is SHARED with `push` (not kind-restricted --
 *   entries are told apart only by their `kind` field); a `proofSha256` already present
 *   there, of any `kind`, refuses a repeat `feature-package-reconcile` presentation of
 *   that same proof with `CRITICAL-PROOF-REPLAY`, mirroring `approve-push`'s own
 *   consumption-ledger shape (~6554-6576 as of this writing).
 *
 *   `phoenixEpicHistory` (added by the 2026-08-26 sprint_phoenix merge; RW2-STATEKEY):
 *   the sprint-phoenix-epic feature's own continuity/authority/approval history,
 *   preserved VERBATIM from `origin/sprint_phoenix` per explicit PO instruction that no
 *   Phoenix data be lost in the merge -- see the block's own `note` field for full
 *   provenance. HISTORICAL RECORD ONLY: no subcommand reads, writes or otherwise
 *   interprets its internals as active pipeline state (`activeFeature`/`continuity`/
 *   `planApproval` etc. above remain the only authoritative ones); it is opaque data
 *   carried alongside the schema, not a second copy of the schema. Its ONE reader is
 *   `inspect` (`summarizePhoenixEpicHistory` below), which surfaces a compact,
 *   read-only presence/identity projection so the block stays discoverable to every
 *   session that runs `inspect` instead of silently going stale -- that projection
 *   is descriptive only and never a basis for a state transition.
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
 *   present-plan  --by <name>                     NVA-R22-PLANSHOWN: records
 *                                                 planPresentation={schema,
 *                                                 submissionSha256,presentedBy,
 *                                                 presentedAt} bound to the exact
 *                                                 current submission (requires the
 *                                                 same "exact current submitted
 *                                                 plan" precondition approve-plan
 *                                                 itself checks). Run after
 *                                                 submit-plan and before
 *                                                 approve-plan -- the mechanical
 *                                                 record that the design was
 *                                                 actually shown before approval.
 *   approve-plan  --by <name>                     Sets planApproved=true, records
 *                                                 exact v2 planApproval including its
 *                                                 Spec binding; the same profile/PRD/Spec
 *                                                 authority is revalidated under the
 *                                                 writer lock before commit. Additionally
 *                                                 refused (NVA-R22-PLANSHOWN, no override)
 *                                                 when no planPresentation record bound to
 *                                                 the exact current submission exists --
 *                                                 run present-plan first.
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
 *   discard-feature --by <name>                   Discards the current activeFeature before
 *                 --reason <text>                 any Result exists: appends {id, planPath,
 *                                                 phaseAtDiscard, discardedAt, discardedBy,
 *                                                 reason, forCommit} to discardedFeatures
 *                                                 (existing entries kept, append-only),
 *                                                 deletes activeFeature, sets
 *                                                 planApproved=false, clears planApproval/
 *                                                 planRevocation/continuity. Admitted EXACTLY
 *                                                 where close-feature is structurally
 *                                                 unsatisfiable: refused when continuity is
 *                                                 absent (close-feature needs only --by
 *                                                 there) or when continuity.authority.result
 *                                                 already exists (close-feature is the route
 *                                                 that IS available) -- never a heuristic.
 *                                                 Likewise refused (same hardening as
 *                                                 close-feature): no activeFeature, a blank
 *                                                 activeFeature.id/planPath, an unattributed
 *                                                 or unexplained discard, or an existing
 *                                                 discardedFeatures present but NOT an array.
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
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, posix as posixPath, relative, resolve, sep, win32 as win32Path } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyCourseDecisionIntent,
  applyDecisionSelection,
  clearCourseDecisionReceipt,
  clearDecisionSelection,
  applyRunnerNativeContinuation,
  bindContinuityResultForClose,
  compareAndSwapContinuity,
  planLegacyContinuityAdoption,
  applyLegacyContinuityAdoption,
  LEGACY_CONTINUITY_ADOPTION as LEGACY_ADOPTION,
  integrateContinuityFinal,
  recordCourseDecisionBrief,
  validateContinuityState,
} from "../lib/continuity-state.mjs";
import { createControlExecutionExchange } from "../lib/control-execution-exchange.mjs";
import { buildLifecycleDispatchEvent, buildLifecycleStatusEvent } from "../lib/control-execution-lifecycle-event.mjs";
import {
  canonicalJson as canonicalDecisionJson,
  sha256Canonical,
  validateCourseDecisionBrief,
  validateCourseDecisionIntent,
  validateCourseDecisionReceipt,
} from "../lib/review-economy.mjs";
import {
  PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
  PRD_ACKNOWLEDGEMENT_MARKER,
  derivePoGateRepositoryFingerprint,
  validatePoGateAuthorityForRepository,
  validatePoGateProfileForRepository,
} from "../lib/po-gate-authority.mjs";
import {
  appendExternalPushLedgerConsumption,
  externalPushLedgerGate,
} from "../lib/external-push-ledger.mjs";
import { dualEvaluateDecisionReference } from "../lib/decision-reference-dual-evaluation.mjs";
import { inspectProjectOnboardingV3 } from "../lib/project-onboarding-v3.mjs";
import {
  applyLegacyV2RevocationRecovery,
  approveSubmittedPlan,
  bindPlanSpecApproval,
  canonicalJson as canonicalPhxJson,
  derivePlanLifecycle,
  enterPlanImplementation,
  LEGACY_V2_REVOCATION_RECOVERY_CLASS,
  planLegacyV2RevocationRecovery,
  reopenPlanDesign,
  revokePlanV2,
  sealCurrentPlanApproval,
  sha256CanonicalJson,
  submitPlan,
  validCurrentPlanApproval,
  validPlanSubmission,
} from "../lib/plan-spec-state-v2.mjs";
import {
  inventoryFeaturePackages,
  planFeaturePackageBootstrap,
  planFeaturePackageReconcile,
  planFeaturePackageTransition,
  validateFeaturePackage,
} from "../lib/feature-package-topology.mjs";
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
import { createAuthorityRevisionIntent } from "../lib/authority-revision-proof.mjs";
import { discoverRepository, inspectSessionClosure } from "../lib/worktree-lifecycle.mjs";
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
  CRITICAL_ACTION_KINDS,
  criticalActionSubjectSha256,
  verifyCriticalActionApprovalRequest,
} from "../lib/critical-action-approval-request.mjs";
import { criticalProofWaiverFor, readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { requireAttendedChatGateConfirmation } from "../lib/chat-gate-ceremony.mjs";
import {
  lifecycleDigest as closeCoordinatorDigest,
  readCloseCoordinator,
} from "./publication-close-journal.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { nextActionSection, readOnboardingIntakeCheckpoint, syncStateMdNextAction } from "../lib/onboarding-continuity.mjs";
import { assessWindowsPrivatePath } from "../lib/windows-private-state.mjs";
import { refusePlanAuthorityStagingPath } from "../lib/plan-authority-staging-guard.mjs";

export const SCHEMA_ID = "pipeline.state.v0";
export const CONTINUITY_LOCK_SCHEMA_ID = "pipeline.continuity-lock.v0";
export const CONTINUITY_LOCK_STALE_MS = 30_000;

// Restored verbatim from 5f8bf1d:harness/scripts/pipeline-state.mjs (the pre-merge
// home of this module), dropped by merge 75b8361 when the second-parent side of
// the file won. Only the closure the decision contract itself needs is restored;
// the Phoenix transaction adapter referenced by the block comment below is not
// part of this restoration.
/**
 * Closed Recovery Bridge decision contract. The sole executable consumer is
 * the Phoenix-only adapter below. Every new issuance is bound to the existing
 * repository-scoped PO gate; a local caller can never create PO authority by
 * choosing an attribution string. Legacy terminal records remain inspectable
 * solely for recovery/readback compatibility.
 */
export const RECOVERY_BRIDGE_DECISION_SCHEMA = "pipeline.recovery-bridge-decision.v1";
export const RECOVERY_BRIDGE_ISSUANCE_CUTOFF = "2026-10-31T00:00:00.000Z";
const RECOVERY_BRIDGE_FEATURE_ID = "sprint-phoenix-epic";
const RECOVERY_BRIDGE_OPERATION = "reconcile-mutable-design";
const RECOVERY_BRIDGE_MANIFEST = "specs/sprint-phoenix-epic/lifecycle.json";
const RECOVERY_BRIDGE_ARTIFACT_PATH = "specs/sprint-phoenix-epic/RECOVERY.md";
const RECOVERY_BRIDGE_ASSURANCE = "po-gate-bound";
const RECOVERY_BRIDGE_ID_RE = /^rb-[a-f0-9]{16,64}$/u;
const RECOVERY_BRIDGE_BINDING_KEYS = [
  "decisionId", "featureId", "operation", "manifest", "artifactPath", "assurance",
  "manifestPreimageSha256", "recoveryPostimageSha256", "prdSha256", "specSha256", "poApproval", "approvedBy", "approvedAt", "expiresAt",
];
const RECOVERY_BRIDGE_APPROVAL_KEYS = ["what", "why", "scope", "notAuthorized"];
const RECOVERY_BRIDGE_DECISION_KEYS = [
  "schema", "decisionId", "decisionSha256", "featureId", "operation", "manifest", "artifactPath", "assurance",
  "manifestPreimageSha256", "recoveryPostimageSha256", "prdSha256", "specSha256", "approvedBy", "approvedAt", "expiresAt", "status",
];

function recoveryBridgeBindingKeys(value) {
  const legacy = !Object.hasOwn(value ?? {}, "poApproval");
  return [
    ...RECOVERY_BRIDGE_BINDING_KEYS.filter((key) => key !== "poApproval" || !legacy),
    ...(Object.hasOwn(value ?? {}, "approval") ? ["approval"] : []),
  ];
}
function validRecoveryBridgeApproval(value) {
  return exactObjectKeys(value, RECOVERY_BRIDGE_APPROVAL_KEYS)
    && RECOVERY_BRIDGE_APPROVAL_KEYS.every((key) => typeof value[key] === "string"
      && value[key].trim().length >= 12 && value[key].length <= 1_000);
}
function recoveryBridgeBinding(value) {
  return Object.fromEntries(recoveryBridgeBindingKeys(value).map((key) => [key, value?.[key]]));
}
function safeIso(value) { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) && !Number.isNaN(Date.parse(value)); }
function exactPoDecision(value) {
  return exactObjectKeys(value, ["planPath", "planSha256", "specPath", "specSha256", "approvalSha256"])
    && typeof value.planPath === "string" && typeof value.specPath === "string"
    && SHA256_RE.test(value.planSha256) && SHA256_RE.test(value.specSha256) && SHA256_RE.test(value.approvalSha256);
}

/** Canonical digest for the immutable, exact Recovery Bridge decision binding. */
export function recoveryBridgeDecisionDigest(value) {
  return sha256Bytes(canonicalPhxJson({ schema: RECOVERY_BRIDGE_DECISION_SCHEMA, ...recoveryBridgeBinding(value) }));
}

function recoveryBridgeNow(now) {
  return safeIso(now) ? Date.parse(now) : null;
}

/**
 * Validates a public-safe Recovery Bridge decision. `now` is optional for
 * structural inspection; when supplied it also enforces expiry, and for an
 * uncommitted issuance it enforces the non-extendable issuance cutoff.
 */
export function validateRecoveryBridgeDecision(value, { now } = {}) {
  const hasApproval = Object.hasOwn(value ?? {}, "approval");
  const hasPoApproval = Object.hasOwn(value ?? {}, "poApproval");
  if (!exactObjectKeys(value, [...RECOVERY_BRIDGE_DECISION_KEYS, ...(hasPoApproval ? ["poApproval"] : []), ...(hasApproval ? ["approval"] : [])])
    || value.schema !== RECOVERY_BRIDGE_DECISION_SCHEMA || (hasApproval && !validRecoveryBridgeApproval(value.approval))) {
    return { ok: false, code: "RB-DECISION-SCHEMA" };
  }
  if (!RECOVERY_BRIDGE_ID_RE.test(value.decisionId) || !SHA256_RE.test(value.decisionSha256)
    || !SHA256_RE.test(value.manifestPreimageSha256) || !SHA256_RE.test(value.recoveryPostimageSha256)
    || !SHA256_RE.test(value.prdSha256) || !SHA256_RE.test(value.specSha256) || !safeIso(value.expiresAt)) {
    return { ok: false, code: "RB-DECISION-FIELDS" };
  }
  if (value.featureId !== RECOVERY_BRIDGE_FEATURE_ID || value.operation !== RECOVERY_BRIDGE_OPERATION
    || value.manifest !== RECOVERY_BRIDGE_MANIFEST || value.artifactPath !== RECOVERY_BRIDGE_ARTIFACT_PATH
    || value.assurance !== RECOVERY_BRIDGE_ASSURANCE) return { ok: false, code: "RB-DECISION-TARGET" };
  if (value.decisionSha256 !== recoveryBridgeDecisionDigest(value)) return { ok: false, code: "RB-DECISION-DIGEST" };
  if (hasPoApproval && (!exactPoDecision(value.poApproval)
    || value.poApproval.planPath !== "specs/sprint-phoenix-epic/prd_phoenix-epic.md"
    || value.poApproval.specPath !== "specs/sprint-phoenix-epic/spec.md"
    || value.poApproval.planSha256 !== value.prdSha256 || value.poApproval.specSha256 !== value.specSha256)) return { ok: false, code: "RB-DECISION-PO-AUTHORITY" };
  if (value.status === "issued" && !hasPoApproval) return { ok: false, code: "RB-DECISION-PO-AUTHORITY" };
  if (value.approvedBy !== "PO" || !safeIso(value.approvedAt)) return { ok: false, code: "RB-DECISION-ATTRIBUTION" };
  if (Date.parse(value.approvedAt) > Date.parse(value.expiresAt)) return { ok: false, code: "RB-DECISION-CHRONOLOGY" };
  if (!["issued", "public-committed", "consumed"].includes(value.status)) return { ok: false, code: "RB-DECISION-STATUS" };
  if (Date.parse(value.expiresAt) > Date.parse(RECOVERY_BRIDGE_ISSUANCE_CUTOFF)) return { ok: false, code: "RB-DECISION-CUTOFF" };
  if (now !== undefined) {
    const nowMs = recoveryBridgeNow(now);
    if (nowMs === null) return { ok: false, code: "RB-DECISION-NOW" };
    if (value.status === "issued" && nowMs >= Date.parse(RECOVERY_BRIDGE_ISSUANCE_CUTOFF)) return { ok: false, code: "RB-ISSUANCE-CUTOFF" };
    if (nowMs >= Date.parse(value.expiresAt)) return { ok: false, code: "RB-DECISION-EXPIRED" };
  }
  return { ok: true, value };
}
const CONTINUITY_REQUEST_MAX_BYTES = 32_768;
// `approve-push` binds a threat-model document into the signed subject (M-2,
// evidence/cb-1a-measurement.md). Until here that binding was a single path
// hardcoded into THIS repository's own sprint directory
// (`specs/sprint-nova-epic/implementation/critical-action-authorization-threat-model.md`)
// -- absent in any consumer project, so `boundRepositoryArtifact` always
// refused with CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE there and, combined
// with the fail-closed `signature` default (critical-human-proof-policy.mjs),
// a consumer had no agent-side push route at all
// (backlog/items/2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md).
//
// The artifact MUST be a project artifact, never a plugin one: M-1 (same
// evidence note) traces `boundRepositoryArtifact`'s containment rule --
// resolved and required to stay inside `realpathSync(resolve(dir))` -- and
// M-2 item 4 shows `authorizeRecordedPush`/`boundArtifactDigest` re-derives
// the same digest at push time rooted at the PUSHED repository. A path
// outside the project satisfies neither check, which would silently swap the
// M-4 property ("the human's signature is bound to a file that lives inside
// the pushed project's own tree") for one where it does not.
//
// There is exactly ONE path, `PUSH_THREAT_MODEL_DEFAULT_PATH` below, for
// every project including this one -- deliberately NOT configurable, and not
// merely because nobody asked for it yet. `guard-lifecycle-ready.mjs`'s
// doctrine comment above `claudeSessionMemoryDirectory` states the rule this
// follows: a security-relevant path is taken "never from tool input, an
// environment variable, or repository config -- only from a value the
// agent's own tool calls cannot set." An earlier version of this resolution
// read `PIPELINE_PUSH_THREAT_MODEL_PATH` from `process.env`; that made the
// bound artifact agent-choosable (any single command can be prefixed
// `env NAME=value`), which the original hardcoded constant this replaces was
// NOT. No configuration is better than agent-settable configuration here. If
// per-project paths are ever genuinely needed, they must come from COMMITTED
// project configuration read the way `readPushApprovalMode` reads
// `gates.push_approval` -- including its requirement that the working copy
// match the committed bytes at HEAD -- and that is a separate decision, not
// this one; do not re-add an environment-variable or ad hoc config read as
// an "obvious improvement" without that same tamper-evidence property.
//
// The path is `project/<name>.<ext>`, the same convention this repository
// already uses for its other project-owned Pipeline artifacts
// (`project/pipeline-state.json`, `project/critical-human-proof.json`,
// `project/guard-config.json`), rather than inventing a new one.
//
// The path starts absent in a fresh project -- including THIS repository,
// which materialized its own copy once (see the file itself: its bytes are
// an exact copy of `specs/sprint-nova-epic/implementation/critical-action-authorization-threat-model.md`,
// never a summary or rewrite, so this repository keeps binding the same
// CONTENT even though the bound PATH changed). Rather than leaving a
// consumer stuck reading a path they must create by hand, `approve-push`
// names the exact `materialize-push-threat-model` subcommand (below) when
// the artifact does not exist yet. That subcommand copies the plugin's
// shipped TEMPLATE (`DEFAULT_PUSH_THREAT_MODEL_DOC`, resolved relative to
// THIS FILE's own location via `PLUGIN_ROOT` -- a source document, never
// itself the bound artifact) into the project at the conventional path, and
// refuses to overwrite one that already exists: overwriting would change the
// bytes under an artifact path that may already back a recorded proof,
// invalidating it (M-2 item 4 again -- the push guard re-hashes current
// bytes against the recorded digest and refuses on any mismatch).
// One list, used by both the help output and the unknown-command refusal, so the
// two can never disagree about what this script accepts. The previous refusal
// carried the names as a hand-maintained literal and had already fallen behind:
// `materialize-push-threat-model` was absent from it while another refusal named
// that exact command as the way out of a stuck approval.
const PIPELINE_STATE_COMMANDS = Object.freeze([
  "inspect",
  "set-feature", "submit-plan", "present-plan", "approve-plan", "reopen-design", "seal-plan-approval",
  "set-phase", "set-gate-estimate", "revoke-plan", "bind-plan-spec", "approve-push",
  "materialize-push-threat-model", "prepare-push-subject", "close-feature", "discard-feature", "approve-deploy",
  "consume-deploy", "clear-deploy", "po-authority-rebind-plan", "po-authority-rebind-apply",
  "po-authority-acknowledge-plan", "po-authority-acknowledge-apply",
  "po-authority-decision-plan", "po-authority-decision-select", "po-authority-decision-apply",
  "continuity-init", "continuity-cas", "continuity-apply-native", "continuity-integrate-final",
  "continuity-record-course-brief", "continuity-select-course", "continuity-apply-decision",
  "continuity-clear-decision", "continuity-result-bootstrap-plan", "continuity-result-bootstrap-apply",
  "continuity-result-rebind-plan", "continuity-result-rebind-apply",
  "continuity-result-case-migration-plan", "continuity-result-case-migration-apply",
  "continuity-result-close-plan", "continuity-result-close-apply",
  "continuity-authority-revision-plan", "continuity-authority-revision-apply", "continuity-authority-revision-recover",
  "publication-prepare",
  "publication-approve", "publication-authorize", "publication-reconcile", "publication-observe",
  "publication-start-readback", "publication-close", "publication-rearm", "publication-block",
  "feature-package-inspect", "feature-package-status", "feature-package-plan", "feature-package-apply",
  "feature-package-reconcile", "feature-package-recover", "feature-package-rebind-mutable",
]);
const PUSH_THREAT_MODEL_DEFAULT_PATH = "project/push-threat-model.md";
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PUSH_THREAT_MODEL_DOC = join(PLUGIN_ROOT, "docs", "default-push-threat-model.md");
const EXTERNAL_PUBLIC_ARTIFACT_MAX_BYTES = 1_048_576;
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
  "continuity-apply-native",
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
const RESULT_CASE_MIGRATION_PLAN_SCHEMA = "pipeline.continuity-result-case-migration-plan.v1";
const RESULT_CASE_MIGRATION_APPLY_SCHEMA = "pipeline.continuity-result-case-migration-apply.v1";
const RESULT_CASE_MIGRATION_JOURNAL_SCHEMA = "pipeline.continuity-result-case-migration-journal.v1";
const RESULT_CASE_MIGRATION_LOCK_TOKEN = "pipeline-result-case-migration-v1";
const INSPECT_SCHEMA = "pipeline.inspect.v1";
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
  // `options.reuseLock`, when supplied, is an already-acquired, still-held lock on this
  // exact `dir` (PHX-WP-PAC08-LOCK-REENTRANCY): the caller verified the resolved paths
  // match before handing it in (see `defaultFeaturePackageReconcileApproval`). Reusing it
  // instead of acquiring a second lock avoids a self-collision on the same lock path; this
  // call then does not own the lock's lifecycle and must not release it.
  const reusedLock = options.reuseLock;
  const lock = reusedLock ?? acquireContinuityLock(dir, LEGACY_WRITER_LOCK_TOKEN);
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
    if (!reusedLock) releaseContinuityLock(lock);
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

/**
 * Best-effort resync of `docs/state.md`'s "## Next action" section after a
 * command has ALREADY committed its own State write (GF-090). This is
 * advisory, never authoritative: `syncStateMdNextAction` itself never
 * throws, but every call is wrapped again here so a defect in the sync path
 * can never surface as a command failure -- the caller has already returned
 * exit 0 by the time this runs.
 */
function syncNextActionDocs(dir, state) {
  try {
    syncStateMdNextAction(dir, state);
  } catch {
    // Docs sync is best-effort; the State write above is what already
    // succeeded and is what this command reports.
  }
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

/**
 * H-AC-12's dual-evaluation for the two commands that GRANT human authority from this CLI
 * (`approve-push`, `approve-deploy`). ONE body rather than duplicated per command, mirroring
 * how `hooks/guard-devplan.mjs` keeps a single `resolveHumanDecisionReadback` for its own two
 * callers, and shaped exactly like `lib/change-control.mjs`'s optional `decisionReference`:
 * strictly opt-in, so an invocation that passes no `--decision-reference` never reaches this
 * function and both commands behave byte-for-byte as they did before.
 *
 * `legacyOk` is `true` because every caller invokes this only AFTER all of its pre-existing
 * checks have passed (policy, flags, candidate, proof verification, replay) and BEFORE its
 * first mutation -- the same "this point is only reached once the legacy verdict already
 * holds" contract guard-devplan.mjs's generalized path documents.
 *
 * The second, decision-anchored reader binds the canonical reference to what this process can
 * independently observe about the action actually being recorded: the candidate commit AND
 * tree, plus the repository fingerprint derived from the real Git topology. An unresolvable
 * topology returns `false` (disagreement -> fail closed), never a pass-through.
 */
function evaluateOptInDecisionReference(dir, requestFile, candidate) {
  const path = safeRequestFile(dir, requestFile);
  if (path === null) return { ok: false, code: "DECISION-REFERENCE-FILE" };
  let reference;
  try { reference = JSON.parse(readFileSync(path, "utf8")); } catch { return { ok: false, code: "DECISION-REFERENCE-UNREADABLE" }; }
  // A reference that cannot be read must NEVER degrade into "no reference was supplied": the
  // shared primitive treats null/undefined as "no second reader consulted" and returns the
  // legacy verdict unchanged, so an unreadable or non-object file is refused HERE -- otherwise
  // a broken file would silently buy back the exact single-evaluation path this criterion closes.
  if (reference === null || typeof reference !== "object" || Array.isArray(reference)) {
    return { ok: false, code: "DECISION-REFERENCE-UNREADABLE" };
  }
  const evaluation = dualEvaluateDecisionReference({
    legacyOk: true,
    reference,
    resolveReference: (ref) => {
      let fingerprint;
      try {
        const repository = discoverRepository(dir, { timeout: 5000 });
        fingerprint = derivePoGateRepositoryFingerprint({
          gitCommonDir: repository.commonDir,
          primaryRoot: repository.primaryRoot,
        });
      } catch {
        return false; // topology unresolved -> the second reader cannot confirm -> disagreement
      }
      return ref.candidate.commit === candidate.commit
        && ref.candidate.tree === candidate.tree
        && ref.checkpoint.repositoryFingerprint === fingerprint;
    },
  });
  if (!evaluation.ok) {
    return {
      ok: false,
      code: "DECISION-REFERENCE-DISAGREEMENT",
      // H-AC-12's second sentence: the shared compatibility owner and expiry are carried on
      // the evaluation result and surfaced to the operator, never left implicit in a comment.
      detail: `legacy=${evaluation.legacyOk}, decision-reference=${evaluation.ledgerOk}, `
        + `compatibility owner "${evaluation.compat.owner}", expiry `
        + `${new Date(evaluation.compat.expiresAtEpochMs).toISOString()}`,
    };
  }
  return { ok: true, reference };
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
  if (sub === "continuity-apply-native") {
    if (!exactObjectKeys(request, ["next"])) return { ok: false, code: "PS-CONTINUITY-REQUEST" };
    // Native-goal evidence is controller-produced and may be installed only
    // through this dedicated transition.  The generic CAS deliberately keeps
    // nativeContinuation protected from every other State mutation.
    return applyRunnerNativeContinuation(base.continuity, { expectedRevision, next: request.next }, featureId);
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

const LIFECYCLE_EVENT_FLAGS = ["lifecycle-event-out", "parent-orchestration-id", "worker-id", "correlation-id"];

/* PHX L-AC-01. A dispatch admission is a material lifecycle event, and this CAS
 * is the only transaction that installs a `queueHead.dispatch`. So the event is
 * produced HERE, from the exact continuity state about to be committed, rather
 * than reconstructed later from a log that would have to guess which revision
 * admitted which dispatch.
 *
 * It is opt-in for one honest reason: worker and correlation identity do not
 * exist in the continuity state at all -- they live in the coordinator that
 * dispatched the worker -- and the lifecycle schema requires both. Without them
 * no truthful event can be built, so an operator that cannot supply them keeps
 * this command's previous behaviour byte for byte. Asking for the event on a
 * transition that admits no dispatch is a refusal, not a silent no-op.
 *
 * Planning happens BEFORE the state write (a refusal here costs zero mutation);
 * only the file write happens after, once the admission it describes is durable.
 */
function planDispatchLifecycleEvent(sub, dir, previous, next, flags, deps) {
  const requested = LIFECYCLE_EVENT_FLAGS.filter((flag) => !isBlank(flags[flag]));
  if (requested.length === 0) return { ok: true, planned: null };
  if (sub !== "continuity-cas") return { ok: false, code: "PS-LIFECYCLE-EVENT-SCOPE" };
  if (requested.length !== LIFECYCLE_EVENT_FLAGS.length) return { ok: false, code: "PS-LIFECYCLE-EVENT-ARGUMENTS" };
  const before = previous?.queueHead?.dispatch ?? null;
  const dispatch = next?.queueHead?.dispatch ?? null;
  if (dispatch === null || before !== null) return { ok: false, code: "PS-LIFECYCLE-EVENT-NO-ADMISSION" };
  const target = boundLifecycleEventTarget(dir, flags["lifecycle-event-out"]);
  if (!target.ok) return target;
  const candidate = (deps.gitCandidate ?? defaultGitCandidate)(dir);
  if (!candidate.ok) return { ok: false, code: "PS-LIFECYCLE-EVENT-CANDIDATE" };
  try {
    const exchange = createControlExecutionExchange({
      continuityState: next,
      // At admission the worker has produced nothing yet: base and candidate are
      // the same observed tree. Claiming a distinct candidate here would assert a
      // commit that does not exist.
      gitBinding: { baseCommit: candidate.commit, candidateCommit: candidate.commit, candidateTree: candidate.tree },
      orchestrationAssignment: {
        parentOrchestrationId: flags["parent-orchestration-id"],
        workerId: flags["worker-id"],
        correlationId: flags["correlation-id"],
      },
      invalidation: { state: "valid", reasonCode: null, supersededByQueueRevision: null },
      event: {
        class: "admission",
        status: "admitted",
        observedAt: (deps.now ?? (() => new Date().toISOString()))(),
        // The evidence is the committed state itself, digested canonically.
        evidenceSha256: sha256Bytes(canonicalDecisionJson(next)),
      },
      extensions: {},
    });
    return { ok: true, planned: { path: target.path, event: buildLifecycleDispatchEvent({ exchange }) } };
  } catch {
    return { ok: false, code: "PS-LIFECYCLE-EVENT-PROJECTION" };
  }
}

/* The continuity acknowledgement vocabulary (`FINAL_OUTCOMES` in
 * `continuity-host-adapter.mjs`) has exactly two members, and both name a
 * status of the exchange's `terminal` class. The class's other three
 * (`cancelled`, `unknown`, `unavailable`) are deliberately unreachable from
 * here: no continuity transition can observe them today, and mapping something
 * onto them would fabricate an outcome the state machine never saw. */
const LIFECYCLE_TERMINAL_STATUS = Object.freeze({ succeeded: "succeeded", failed: "failed" });

/* PHX L-AC-01 (status kind). The mirror of the admission above: this transaction
 * is the only one that acknowledges a delivered final for the dispatch currently
 * at the queue head, so the terminal event is produced HERE, from the exact
 * dispatch identity that is about to stop being current.
 *
 * The exchange is built from the state BEFORE the transition, deliberately. The
 * post-transition state either carries no dispatch at all (the exchange shape
 * refuses that) or already carries the next one, so projecting from it would
 * attribute one worker's outcome to another. The identity is not taken on trust
 * either: it must be the exact identity the observation reports, which is the
 * same equality `continuity-host-adapter.mjs` enforces downstream before any
 * integration is admitted.
 *
 * Opt-in for the same honest reason as the admission event: worker and
 * correlation identity live in the coordinator, not in the continuity state.
 *
 * Planning happens BEFORE the Result and State writes; the event file is written
 * only after the transaction reports the terminal state itself as committed. A
 * replay, a duplicate final or a Result-only repair therefore emits nothing --
 * and, because a lifecycle event is append-only evidence whose target is refused
 * if it already exists, asking for the event again on such a retry is refused by
 * name rather than silently skipped. Retries that only repair the Result are run
 * without these flags. */
function planStatusLifecycleEvent(sub, dir, previous, request, flags, deps) {
  const requested = LIFECYCLE_EVENT_FLAGS.filter((flag) => !isBlank(flags[flag]));
  if (requested.length === 0) return { ok: true, planned: null };
  if (sub !== "continuity-integrate-final") return { ok: false, code: "PS-LIFECYCLE-EVENT-SCOPE" };
  if (requested.length !== LIFECYCLE_EVENT_FLAGS.length) return { ok: false, code: "PS-LIFECYCLE-EVENT-ARGUMENTS" };
  const dispatch = previous?.queueHead?.dispatch ?? null;
  const identity = request?.observation?.identity ?? null;
  const status = LIFECYCLE_TERMINAL_STATUS[request?.observation?.final?.outcome];
  if (dispatch === null || identity === null || status === undefined
    || canonicalJson(identity) !== canonicalJson(dispatch)) {
    return { ok: false, code: "PS-LIFECYCLE-EVENT-NO-TERMINAL" };
  }
  const target = boundLifecycleEventTarget(dir, flags["lifecycle-event-out"]);
  if (!target.ok) return target;
  const candidate = (deps.gitCandidate ?? defaultGitCandidate)(dir);
  if (!candidate.ok) return { ok: false, code: "PS-LIFECYCLE-EVENT-CANDIDATE" };
  try {
    const exchange = createControlExecutionExchange({
      continuityState: previous,
      // The State writer observes exactly one tree -- its own repository at
      // integration time. It has no separate knowledge of the worker's output
      // commit, so both bindings name the tree that was actually observed rather
      // than asserting a candidate commit nobody here has seen.
      gitBinding: { baseCommit: candidate.commit, candidateCommit: candidate.commit, candidateTree: candidate.tree },
      orchestrationAssignment: {
        parentOrchestrationId: flags["parent-orchestration-id"],
        workerId: flags["worker-id"],
        correlationId: flags["correlation-id"],
      },
      invalidation: { state: "valid", reasonCode: null, supersededByQueueRevision: null },
      event: {
        class: "terminal",
        status,
        observedAt: (deps.now ?? (() => new Date().toISOString()))(),
        // The evidence is the delivered final's own canonical digest, the same
        // digest the acknowledgement is about to bind into the state.
        evidenceSha256: request.observation.final.resultDigest,
      },
      extensions: {},
    });
    return { ok: true, planned: { path: target.path, event: buildLifecycleStatusEvent({ exchange }) } };
  } catch {
    return { ok: false, code: "PS-LIFECYCLE-EVENT-PROJECTION" };
  }
}

/* A lifecycle event is append-only evidence: an existing path is refused, never
 * overwritten, and the target may not leave the repository root. */
function boundLifecycleEventTarget(dir, relativePath) {
  if (isAbsolute(relativePath)) return { ok: false, code: "PS-LIFECYCLE-EVENT-PATH" };
  let root;
  try { root = realpathSync(resolve(dir)); } catch { return { ok: false, code: "PS-LIFECYCLE-EVENT-PATH" }; }
  const path = resolve(root, relativePath);
  if (!path.startsWith(`${root}${sep}`) || relative(root, path).startsWith(`..${sep}`)) return { ok: false, code: "PS-LIFECYCLE-EVENT-PATH" };
  try { lstatSync(path); return { ok: false, code: "PS-LIFECYCLE-EVENT-EXISTS" }; } catch { /* absent is the only admissible state */ }
  return { ok: true, path };
}

function writeLifecycleEventFile(planned) {
  let fd;
  try {
    mkdirSync(dirname(planned.path), { recursive: true });
    fd = openSync(planned.path, "wx", 0o600);
    writeSync(fd, `${JSON.stringify(planned.event, null, 2)}\n`);
    fsyncSync(fd);
    return { ok: true };
  } catch {
    return { ok: false, code: "PS-LIFECYCLE-EVENT-WRITE" };
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* the write result already decided the outcome */ } }
  }
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
      const lifecycle = planStatusLifecycleEvent(sub, dir, existing.state.continuity ?? null, request.value, flags, deps);
      if (!lifecycle.ok) {
        console.error(`Error: dispatch status lifecycle event refused (${lifecycle.code}); zero mutation.`);
        return 2;
      }
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
      // Only the transaction that committed the terminal state itself produces the
      // event; a duplicate final or a Result-only repair changed no dispatch state.
      if (lifecycle.planned !== null && transaction.code === "PS-CONTINUITY-FINAL-COMMITTED") {
        const emitted = writeLifecycleEventFile(lifecycle.planned);
        if (!emitted.ok) {
          console.error(`Error: continuity state committed at revision ${transaction.revision}, but the dispatch status lifecycle event could not be persisted (${emitted.code}); mutation is NOT reported as zero.`);
          return 2;
        }
        console.log(`PS-LIFECYCLE-EVENT-WRITTEN: status event ${lifecycle.planned.event.eventId} persisted.`);
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
    const lifecycle = planDispatchLifecycleEvent(sub, dir, existing.state.continuity ?? null, transition.state, flags, deps);
    if (!lifecycle.ok) {
      console.error(`Error: dispatch lifecycle event refused (${lifecycle.code}); zero mutation.`);
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
    if (lifecycle.planned !== null) {
      const emitted = writeLifecycleEventFile(lifecycle.planned);
      if (!emitted.ok) {
        console.error(`Error: continuity state committed at revision ${transition.state.revision}, but the dispatch lifecycle event could not be persisted (${emitted.code}); mutation is NOT reported as zero.`);
        return 2;
      }
      console.log(`PS-LIFECYCLE-EVENT-WRITTEN: dispatch event ${lifecycle.planned.event.eventId} persisted.`);
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
    let criticalProof = null;
    let criticalProofWaiver = null;
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
        if (sub === "publication-approve") {
          const policy = criticalHumanProofPolicy(dir);
          if (!policy.ok) throw new Error(policy.code);
          if (policy.requiredKinds.has("publication")) {
            if (prior === null) throw new Error("publication proof requires a prepared State projection");
            const candidate = { commit: prior.candidateOid, tree: prior.candidateTree };
            const verified = verifyCriticalHumanProof({
              dir, state: base, kind: "publication", candidate,
              subject: {
                transactionId: request.value.transactionId,
                channel: prior.channel,
                expectedRevision: expected.value,
                expectedStateSha256: request.value.expectedStateSha256,
                input,
              },
              flags,
              now: new Date().toISOString(),
            });
            if (!verified.ok) throw new Error(verified.code);
            criticalProof = verified.proof;
            criticalProofWaiver = verified.waived ?? null;
          }
        }
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
    // A waived publication is recorded as a waiver, never as an absent entry —
    // otherwise durable publication authority carries no statement of what backed it
    // (ADR-0055 decision 4).
    const proofEntry = criticalProof ?? (criticalProofWaiver === null ? null : { waiver: criticalProofWaiver });
    const proofProjection = proofEntry === null
      ? base.publicationCriticalProofs
      : { ...(base.publicationCriticalProofs ?? {}), [request.value.transactionId]: proofEntry };
    if (sameJson(base.publication, projection) && sameJson(base.publicationCriticalProofs, proofProjection)) {
      console.log(`${sub}: exact durable replay accepted; State projection already matches ${authority.record.publication.revision}.`);
      return 0;
    }
    const nextState = {
      ...base, schema: SCHEMA_ID, publication: projection,
      ...(proofEntry === null ? {} : { publicationCriticalProofs: proofProjection }),
      updatedAt: (deps.now ?? (() => new Date().toISOString()))(),
    };
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

const LEGACY_V2_REVOCATION_RECOVERY_PLAN_SCHEMA = "pipeline.plan-legacy-v2-revocation-recovery-plan.v1";
const LEGACY_V2_RECOVERY_PLAN_FLAGS = new Set(["by", "prepared-at", "preimage-sha256", "postimage-sha256", "plan-sha256", "activate"]);

function legacyV2RecoveryPlanRecord({ by, preparedAt, preimageSha256, postimageSha256 }) {
  return {
    schema: LEGACY_V2_REVOCATION_RECOVERY_PLAN_SCHEMA,
    recoveryClass: LEGACY_V2_REVOCATION_RECOVERY_CLASS,
    actor: by,
    preparedAt,
    preimageSha256,
    postimageSha256,
  };
}

function legacyV2RecoveryApplyAction({ by, preparedAt, preimageSha256, postimageSha256, planSha256 }) {
  return [
    "apply-legacy-v2-revocation-recovery",
    "--by", by,
    "--prepared-at", preparedAt,
    "--preimage-sha256", preimageSha256,
    "--postimage-sha256", postimageSha256,
    "--plan-sha256", planSha256,
    "--activate", "true",
  ];
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

function defaultGitCandidate(dir) {
  const commit = defaultGitHead(dir);
  if (!commit.ok) return commit;
  const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: dir, encoding: "utf8" });
  if (tree.error || tree.status !== 0 || !/^[0-9a-f]{40,64}$/u.test(tree.stdout?.trim() ?? "")) {
    return { ok: false, error: tree.error?.message ?? (tree.stderr || "git rev-parse HEAD^{tree} failed").trim() };
  }
  return { ok: true, commit: commit.commit, tree: tree.stdout.trim() };
}

/** ADR-0055: one shared implementation, so the push guard reads the same policy. */
const criticalHumanProofPolicy = (dir) => readCriticalHumanProofPolicy(dir);

function boundRepositoryArtifact(dir, relativePath) {
  const root = realpathSync(resolve(dir));
  const path = resolve(root, relativePath);
  if (relative(root, path).startsWith(`..${sep}`) || !path.startsWith(`${root}${sep}`)) {
    return { ok: false, code: "CRITICAL-PROOF-BOUND-ARTIFACT-PATH" };
  }
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > EXTERNAL_PUBLIC_ARTIFACT_MAX_BYTES) {
      return { ok: false, code: "CRITICAL-PROOF-BOUND-ARTIFACT-UNSAFE" };
    }
    return { ok: true, path: relativePath, sha256: sha256Bytes(readFileSync(path)) };
  } catch {
    return { ok: false, code: "CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE" };
  }
}

/**
 * Resolves the artifact `approve-push` binds into the signed subject. See the
 * comment above `PUSH_THREAT_MODEL_DEFAULT_PATH` for why this is the single
 * fixed path, for every project, and never configurable. Goes through
 * `boundRepositoryArtifact` unchanged, so the artifact's containment/shape
 * rules and the M-4 property they exist to guarantee are exactly the rules
 * every other bound artifact already has.
 */
function resolvePushThreatModelArtifact(dir) {
  return boundRepositoryArtifact(dir, PUSH_THREAT_MODEL_DEFAULT_PATH);
}

// NVA-I-ONEROUTE: the STRUCTURAL `nextAction` `inspect` publishes for the
// feature/push happy path (draft -> awaiting-approval -> approved ->
// implementing), in the SAME two shapes already established elsewhere in
// this plugin: `kind: "command"` with a ready-to-run `{ executable, argv }`
// (`intakeGenerateApplyAction()`, lib/onboarding-continuity.mjs) and
// `kind: "collect-input"` for a genuine human decision, carrying NO
// `input`/`inputs` when there is nothing an agent may fill in on the
// human's behalf (`collectPrdAcknowledgementAction()`,
// lib/project-onboarding-v3.mjs). A driver that only reads `nextAction`
// (onboarding-init.mjs's own contract) gets exactly one such step here,
// never the rendered prose `nextActionSection()` still returns under
// `nextActionText` below (see `case "inspect"`).
//
// Two of the four statuses are genuine human decisions and MUST NEVER gain
// a driver-executable satisfying action (backlog:
// 2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md):
//   - `awaiting-approval` -- plan approval is a judgement about a document;
//     the plan/spec are named by path and sha256, exactly
//     `collectPrdAcknowledgementAction()`'s own shape.
//   - `implementing` -- the push signature is a detached Ed25519 proof made
//     with a key kept outside this repository. Until the threat-model
//     artifact exists there is nothing yet to review, so this state first
//     offers the ordinary, agent-runnable `materialize-push-threat-model`
//     command; once the artifact exists, the collect-input names it and
//     points at the real ceremony (docs/push-release-flow.md), again with
//     no fillable input.
// `draft` needs two values this command genuinely cannot derive from
// `project/pipeline-state.json` -- who is submitting (`--by`) and which
// delivery profile applies (`--profile`, `epic|feature|mini`); neither is
// invented (onboarding-init.mjs's own "NEVER INVENTS A VALUE" contract),
// matching `intakeConsentAction()`'s "ask once, then call the apply command
// with the answers" shape.
/** Delivery profiles `submit-plan --profile` accepts; mirrors the case handler's own literal. */
const DRAFT_PLAN_PROFILES = new Set(["epic", "feature", "mini"]);

/**
 * NVA-Q2-DRAFTDERIVE: the `draft` gate previously always asked a human for
 * `--by`/`--profile`, even though onboarding already collected both and
 * recorded them -- the profile in the intake checkpoint's `values.profile`
 * (`applyOnboardingIntakeConsent`, lib/onboarding-continuity.mjs), the
 * submitter in this repository's own local Git config (onboarding applies the
 * PO's answer there). This derives both, NEVER inventing a value: a missing,
 * malformed, or out-of-vocabulary source resolves to `null` here, which the
 * caller below treats exactly like "onboarding never ran".
 *
 * The Git read is deliberately scoped to `dir`'s OWN local config, not
 * whatever repository a upward directory walk happens to land on:
 * `GIT_CEILING_DIRECTORIES` is set to `dir`'s parent so discovery stops
 * before ascending past `dir` itself. Without this, a `dir` that is not
 * itself a Git repository (an adopted project, a fixture nested inside a
 * larger checkout) would silently pick up an ENCLOSING repository's
 * unrelated `user.name` instead of correctly reporting the submitter absent.
 */
function resolveDraftPlanSubmissionDefaults(dir, deps = {}) {
  const spawn = deps.spawn ?? spawnSync;
  let by = null;
  const gitResult = spawn("git", ["config", "--local", "--get", "user.name"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) },
  });
  if (!gitResult.error && gitResult.status === 0 && typeof gitResult.stdout === "string") {
    const trimmed = gitResult.stdout.trim();
    if (trimmed !== "") by = trimmed;
  }
  let profile = null;
  try {
    const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: dir });
    const candidate = checkpoint.status === "present" ? checkpoint.value?.values?.profile : null;
    if (typeof candidate === "string" && DRAFT_PLAN_PROFILES.has(candidate)) profile = candidate;
  } catch {
    // A malformed checkpoint is not a value this command may invent a
    // reading from -- treat it exactly like "no checkpoint": ask.
    profile = null;
  }
  return { by, profile };
}

function buildInspectNextAction(dir, state, lifecycle) {
  if (!lifecycle.ok || lifecycle.status === null) return null;
  if (lifecycle.status === "draft") {
    const derived = resolveDraftPlanSubmissionDefaults(dir);
    const scriptPath = fileURLToPath(import.meta.url);
    if (derived.by !== null && derived.profile !== null) {
      return {
        kind: "command",
        executable: process.execPath,
        argv: [scriptPath, "submit-plan", "--by", derived.by, "--profile", derived.profile],
        mutation: true,
        requiresConfirmation: true,
      };
    }
    const inputs = [];
    if (derived.by === null) {
      inputs.push({ name: "by", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 128, singleLine: true, rejectNul: true });
    }
    if (derived.profile === null) {
      inputs.push({ name: "profile", encoding: "utf8", trim: true, minBytes: 4, maxBytes: 7, singleLine: true, rejectNul: true });
    }
    const byRender = derived.by === null ? "<submitter's name>" : derived.by;
    const profileRender = derived.profile === null ? "<epic|feature|mini>" : derived.profile;
    const command = `${process.execPath} ${scriptPath} submit-plan --by "${byRender}" --profile "${profileRender}"`;
    const askFor = inputs.map((input) => (input.name === "by" ? "who is submitting the plan" : "which delivery profile applies (epic, feature, or mini)")).join(" and ");
    return {
      kind: "collect-input",
      inputs,
      mutation: false,
      requiresConfirmation: false,
      guidance: "no plan has been submitted yet, and this command cannot derive every value it needs -- ask"
        + ` ${askFor}, then fill the missing placeholder(s) and run: ${command}`,
      expected: { schema: INSPECT_SCHEMA, statuses: ["draft"] },
    };
  }
  if (lifecycle.status === "awaiting-approval") {
    const submission = state.planSubmission && typeof state.planSubmission === "object" ? state.planSubmission : {};
    // NVA-V2B-APPROVERENDER: the command is RENDERED, exactly as the draft branch above
    // renders its own, and for the same reason -- naming a command without spelling it
    // leaves the caller to reconstruct an invocation from prose, which is how this
    // repository has previously handed a PO a subcommand that did not exist. Rendering
    // it is not a step toward making it agent-runnable: this stays `collect-input`, and
    // deliberately carries NO `executable` and NO `argv`, which are the two fields a
    // driver executes. `--by` stays a placeholder rather than a derived value even
    // though the local Git author is readable here (the draft gate derives exactly that,
    // one step earlier) -- filling it in would let a session run this on the PO's
    // behalf, and this is the approval the whole gate exists to reserve for them.
    const scriptPath = fileURLToPath(import.meta.url);
    const command = `${process.execPath} ${scriptPath} approve-plan --by "<the PO's own name>"`;
    return {
      kind: "collect-input",
      mutation: false,
      requiresConfirmation: false,
      guidance: "binding requires the PO's own judgement about the submitted plan and specification -- an"
        + " agent must never supply this on the PO's behalf. Ask the PO to read the plan at"
        + ` ${submission.planPath} (sha256 ${submission.planSha256}) and the specification at`
        + ` ${submission.specPath} (sha256 ${submission.specSha256}); if and only if satisfied, the PO`
        + ` approves it themselves by replacing the placeholder and running: ${command}`
        + " -- there is no command that records this approval on their behalf, and none should ever"
        + " be offered.",
      expected: { schema: INSPECT_SCHEMA, statuses: ["awaiting-approval"] },
    };
  }
  if (lifecycle.status === "approved") {
    return {
      kind: "command",
      executable: process.execPath,
      argv: [fileURLToPath(import.meta.url), "set-phase", "--phase", "implementation"],
      mutation: true,
      requiresConfirmation: true,
    };
  }
  if (lifecycle.status === "implementing") {
    const threatModel = resolvePushThreatModelArtifact(dir);
    if (!threatModel.ok) {
      return {
        kind: "command",
        executable: process.execPath,
        argv: [fileURLToPath(import.meta.url), "materialize-push-threat-model"],
        mutation: true,
        requiresConfirmation: false,
      };
    }
    return {
      kind: "collect-input",
      mutation: false,
      requiresConfirmation: false,
      guidance: "the push signature is a detached Ed25519 proof made with a key kept outside this repository"
        + " -- an agent must never produce or supply it. Ask the human to review the push threat-model at"
        + ` ${threatModel.path} (sha256 ${threatModel.sha256}), then follow the signing ceremony in`
        + " docs/push-release-flow.md (guard-human-override.mjs plan / prepare-authorization /"
        + " emit-signature-digest, signed outside this session, then authorize-by-signature). There is no"
        + " command that produces this signature on the human's behalf, and none should ever be offered.",
      expected: { schema: INSPECT_SCHEMA, statuses: ["implementing"] },
    };
  }
  return null;
}

/**
 * NVA-WINPATH-3 (backlog/items/2026-08-17-external-public-json-cross-drive-windows-paths-are-
 * not-recognized-as-outside-the-project-root.md): platform-aware containment check for
 * externalPublicJson()'s proof-path bound. `externalPublicJson()` itself resolves `root`/`path`
 * through `realpathSync` first (real filesystem symlink resolution, security-relevant), then
 * hands the two already-resolved absolute strings here for the platform-aware relative-path
 * test -- mirroring the same win32Path/posixPath + isAbsolute-fallback pattern already fixed in
 * po-human-approval.mjs's `outside()` (NVA-WINPATH-1/2) and guard-human-override.mjs's
 * `externalJson()`. Node's default (host-platform) `relative()` used here previously returns,
 * on win32, the unchanged absolute target path -- never a ".."-prefixed one -- when `root` and
 * `path` sit on DIFFERENT drive letters, so a bare `relative(root, path).startsWith("..")` test
 * silently misclassified a genuinely external cross-drive path as "inside". `platform` is
 * injected (default `process.platform`) so the win32 answer is provable from either host, same
 * seam as the two siblings above; the function is pure string logic with no filesystem access,
 * so it is testable with fabricated win32 path strings on a POSIX CI host.
 */
export function externalPathIsOutsideRoot(rootPath, targetPath, platform = process.platform) {
  const api = platform === "win32" ? win32Path : posixPath;
  const root = api.resolve(rootPath);
  const target = api.resolve(targetPath);
  const raw = api.relative(root, target);
  // Win32-only backslash normalization, exactly like the two sibling fixes: a backslash is an
  // ORDINARY filename character on POSIX, never a path separator, so unconditional
  // normalization would misclassify a legal POSIX name that merely CONTAINS a backslash.
  const rel = platform === "win32" ? raw.split("\\").join("/") : raw;
  return rel !== "" && (rel === ".." || rel.startsWith("../") || api.isAbsolute(rel));
}

function externalPublicJson(dir, value) {
  if (typeof value !== "string" || !isAbsolute(value)) return { ok: false, code: "CRITICAL-PROOF-EXTERNAL-PATH" };
  const root = realpathSync(resolve(dir));
  let path;
  try { path = realpathSync(value); } catch { return { ok: false, code: "CRITICAL-PROOF-EXTERNAL-PATH" }; }
  if (!externalPathIsOutsideRoot(root, path)) return { ok: false, code: "CRITICAL-PROOF-EXTERNAL-PATH" };
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > EXTERNAL_PUBLIC_ARTIFACT_MAX_BYTES) return { ok: false, code: "CRITICAL-PROOF-EXTERNAL-FILE" };
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) };
  } catch { return { ok: false, code: "CRITICAL-PROOF-EXTERNAL-FILE" }; }
}

/**
 * Kinds whose gate is always active, regardless of what `project/critical-human-proof.json`'s
 * `requiredKinds` list happens to say (PHX-WP-PAC08-RECONCILE-APPROVAL; ADR-0056's
 * 2026-08-11 Follow-up). `feature-package-reconcile` is never routed through the shared
 * `prepare-critical`/`approve-critical`/`verify-critical` command family that
 * `requiredKinds` governs -- it has its own always-on dependency injection point
 * (`deps.featurePackageReconcileApproval`) -- and the policy file is out of scope to edit
 * for this kind, so without this bypass the kind would either brick permanently
 * (`required: true` with the kind absent from `requiredKinds`) or verify nothing at all
 * (`required: false`). Bypassing the `requiredKinds` membership test here, for this one
 * kind only, is how the proof stays genuinely demanded either way. `push`/`deploy`/
 * `publication`/`governance-fork-disposition` are deliberately NOT in this set, so their
 * behaviour is byte-identical to before this addition.
 */
const ALWAYS_REQUIRED_KINDS = new Set(["feature-package-reconcile"]);

function verifyCriticalHumanProof({ dir, state, kind, candidate, subject, flags, now, required = false }) {
  const policy = criticalHumanProofPolicy(dir);
  if (!policy.ok) return policy;
  // The cryptographic proof may be stood down for this kind — by `gates.push_approval:
  // chat` in pipeline.user.yaml for `push` (ADR-0056), or by an explicit reasoned
  // waiver in the policy file for the other kinds (ADR-0055). Never inferred, never
  // silent: it travels back to the caller so the recorded approval says on its face
  // that no proof backed it.
  //
  // ORDER (measured 2026-08-09, push-gate satisfiability): this stand-down is read
  // BEFORE the `requiredKinds` gate below, and the order is the whole point. For every
  // kind whose waiver comes from the policy file, the two orders are indistinguishable:
  // `readCriticalHumanProofPolicy` only admits a `waivedKinds` entry whose `kind` is
  // already in `requiredKinds`, so waived implies required there. `push` is the one kind
  // whose stand-down lives OUTSIDE this file — in `pipeline.user.yaml`, by ADR-0056 —
  // and with the old order it could never be exercised: a consumer project has no
  // `project/critical-human-proof.json` at all, so `requiredKinds` is empty and
  // `approve-push` refused with CRITICAL-PROOF-POLICY-KIND-REQUIRED, demanding that the
  // project declare push as proof-requiring in exactly the configuration where its
  // operator had committed the opposite. Chat mode was unreachable for every fresh
  // consumer, which is half of why the push gate could not be seeded at all.
  const configured = criticalProofWaiverFor(dir, kind);
  if (configured.code !== null && configured.code !== undefined) return { ok: false, code: configured.code };
  if (configured.waived) return { ok: true, proof: null, waived: configured.waiver };
  if (!policy.requiredKinds.has(kind) && !ALWAYS_REQUIRED_KINDS.has(kind)) {
    return required ? { ok: false, code: "CRITICAL-PROOF-POLICY-KIND-REQUIRED" } : { ok: true, proof: null };
  }
  const request = externalPublicJson(dir, flags["proof-request"]);
  const authority = externalPublicJson(dir, flags["proof-authority"]);
  const proof = externalPublicJson(dir, flags["proof"]);
  if (!request.ok || !authority.ok || !proof.ok) return { ok: false, code: request.code ?? authority.code ?? proof.code };
  // When the project has committed a trust anchor, the external authority handed in here
  // must BE that key. Checked at approval time rather than only at consumption time:
  // otherwise the operator records a proof that looks accepted and then discovers at the
  // push or deploy itself that the guard cannot verify it, with no indication why.
  if (policy.trustAnchor !== null
    && (authority.value?.keyReference !== policy.trustAnchor.keyReference
      || authority.value?.publicKeySha256 !== policy.trustAnchor.publicKeySha256)) {
    return { ok: false, code: "CRITICAL-PROOF-TRUST-ANCHOR-MISMATCH" };
  }
  const active = state.activeFeature;
  const gate = state.planApproval?.poGateAuthority;
  if (!active?.id || !gate?.planSha256 || !gate?.specSha256 || !candidate?.commit || !candidate?.tree) return { ok: false, code: "CRITICAL-PROOF-STATE" };
  const candidateIdentity = { commit: candidate.commit, tree: candidate.tree };
  const action = request.value?.action;
  const expectedSubject = criticalActionSubjectSha256({ kind, candidate: candidateIdentity, subject });
  if (!action || action.kind !== kind || action.subjectSha256 !== expectedSubject) return { ok: false, code: "CRITICAL-PROOF-SUBJECT" };
  // The shared trustPolicy contract (verifyPoApprovalProof et al.) checks an EXACT
  // {keyReference, publicKeySha256} shape; the external authority file may additionally
  // carry `humanName` (SETUP-1: `po-human-approval.mjs setup --human-name` writes it into
  // the local authority record, and that is also the shape of the external
  // `--proof-authority` file). Only the two key-identity fields travel into verification --
  // the same narrowing `po-human-approval.mjs`'s own `verify` subcommand already applies
  // to its local authority record (po-human-approval.mjs, ~line 447-453) before calling
  // this same shared contract. `authority.value` itself is left untouched here, so
  // `humanName` remains readable from it wherever this code records attribution.
  const trustPolicy = { keyReference: authority.value?.keyReference, publicKeySha256: authority.value?.publicKeySha256 };
  const result = verifyCriticalActionApprovalRequest({
    request: request.value,
    trustPolicy,
    proof: proof.value,
    expectedCandidate: candidateIdentity,
    expectedAction: action,
    now,
  });
  if (!result.verified) return { ok: false, code: result.code };
  const intent = request.value.approvalIntent?.value;
  if (intent?.featureId !== active.id || intent?.planSha256 !== gate.planSha256 || intent?.specSha256 !== gate.specSha256) {
    return { ok: false, code: "CRITICAL-PROOF-AUTHORITY" };
  }
  // The proof object itself travels into State alongside its digest. It is public data --
  // a key reference, a public key and a signature -- and recording it is what lets a
  // verifier holding no external directory (the push guard, the release branch) check the
  // signature instead of trusting this record's word. Before this, State kept only the
  // digest, so the only thing downstream could do with an approval was believe it.
  return {
    ok: true,
    proof: {
      proofSha256: result.proofSha256,
      intentSha256: request.value.approvalIntent.sha256,
      action: result.action,
      proof: proof.value,
    },
  };
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
    // The 8 KiB continuity budget applies to the nested continuity record,
    // not to the complete pipeline State which also retains closed-feature
    // history. Keep this raw reader aligned with readState() so a valid
    // historical root cannot make its own PO-authority recovery unavailable.
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

// ---- Closed Result.md/result.md case-collision migration (Phoenix recovery) ----

function caseMigrationArchivePath(prdPath, inactivePath, archivePath) {
  const base = dirname(prdPath).split(sep).join("/");
  const expected = `${base}/archive/${basename(inactivePath)}`;
  return archivePath === expected ? expected : null;
}

function readCaseLifecycle(dir, manifestPath, source, target, archive) {
  const manifest = physicalRebindFile(dir, manifestPath);
  if (manifest === null) return null;
  let value;
  try { value = JSON.parse(manifest.bytes.toString("utf8")); } catch { return null; }
  if (!Array.isArray(value?.artifacts) || !value?.feature || typeof value.feature.id !== "string") return null;
  const sourceEntries = value.artifacts.filter((entry) => entry?.class === "result" && entry.path === source.path && entry.authority === true && entry.sha256 === source.sha256);
  const targetEntries = value.artifacts.filter((entry) => entry?.class === "result" && entry.path === target.path);
  const allAuthorities = value.artifacts.filter((entry) => entry?.class === "result" && entry.authority === true);
  if (sourceEntries.length !== 1 || targetEntries.length > 1 || allAuthorities.length !== 1) return null;
  const next = structuredClone(value);
  const sourceIndex = next.artifacts.findIndex((entry) => entry?.class === "result" && entry.path === source.path && entry.authority === true && entry.sha256 === source.sha256);
  const targetIndex = next.artifacts.findIndex((entry) => entry?.class === "result" && entry.path === target.path);
  const archived = { ...next.artifacts[sourceIndex], path: archive, authority: false, retention: "archive", sha256: source.sha256 };
  if (targetIndex >= 0) next.artifacts[targetIndex] = { ...next.artifacts[targetIndex], authority: true, retention: "active", sha256: target.sha256 };
  else next.artifacts.push({ ...next.artifacts[sourceIndex], path: target.path, authority: true, retention: "active", sha256: target.sha256 });
  next.artifacts[sourceIndex] = archived;
  const postBytes = Buffer.from(JSON.stringify(next, null, 2) + "\n", "utf8");
  return { manifest, value, postBytes, postSha256: sha256Bytes(postBytes) };
}

function caseMigrationEligible(state, prd, spec, target, source) {
  const continuity = state?.continuity;
  const lifecycle = derivePlanLifecycle(state, { planSha256: prd.sha256, specSha256: spec.sha256 });
  return Boolean(state?.activeFeature && state.schema === SCHEMA_ID && state.gateEstimate === undefined
    && lifecycle.ok && lifecycle.status === "implementing"
    && validateContinuityState(continuity, state.activeFeature.id).ok
    && continuity.featureId === state.activeFeature.id && continuity.queueHead !== null
    && continuity.queueHead.dispatch === null && continuity.blocker === null
    && continuity.acknowledgedFinal === null && continuity.recovery === null
    && continuity.decisionTxn === null && continuity.closeTransition == null
    && continuity.revision < Number.MAX_SAFE_INTEGER && state.activeFeature.planPath === prd.path
    && continuity.authority.prd.path === prd.path && continuity.authority.prd.sha256 === prd.sha256
    && continuity.authority.spec.path === spec.path && continuity.authority.spec.sha256 === spec.sha256
    && continuity.authority.result?.path === target.path && continuity.authority.result.sha256 === target.sha256
    && target.path !== source.path);
}

function caseMigrationNextState(state, target, updatedAt) {
  return resultRebindNextState(state, target, updatedAt);
}

function buildResultCaseMigrationPlan(dir, existing, selectedPath, archivePath, updatedAt) {
  if (existing.status !== "ok" || !canonicalIso(updatedAt)) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-STATE" };
  const state = existing.state; const prd = physicalRebindFile(dir, state.continuity?.authority?.prd?.path); const spec = physicalRebindFile(dir, state.continuity?.authority?.spec?.path);
  if (prd === null || spec === null || prd.sha256 !== state.continuity.authority.prd.sha256 || spec.sha256 !== state.continuity.authority.spec.sha256) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-AUTHORITY" };
  let prdText; try { prdText = new TextDecoder("utf-8", { fatal: true }).decode(prd.bytes); } catch { return { ok: false, code: "PS-RESULT-CASE-MIGRATION-PRD" }; }
  if (rebindMarker(prdText)?.digest !== spec.sha256) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-PRD" };
  const candidates = resultRebindCandidates(dir, prd.path);
  if (candidates === null) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-CANDIDATES" };
  const target = selectedPath === candidates.upper.path ? candidates.upper : selectedPath === candidates.lower.path ? candidates.lower : null;
  const source = target?.path === candidates.upper.path ? candidates.lower : candidates.upper;
  const archive = target === null ? null : caseMigrationArchivePath(prd.path, source.path, archivePath);
  if (target === null || archive === null || physicalRebindFile(dir, archive) !== null) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-ARCHIVE" };
  try { if (existsSync(resolve(dir, archive))) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-ARCHIVE" }; } catch { return { ok: false, code: "PS-RESULT-CASE-MIGRATION-ARCHIVE" }; }
  if (!caseMigrationEligible(state, prd, spec, target, source)) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-CONTINUITY" };
  const lifecyclePath = `${dirname(prd.path).split(sep).join("/")}/lifecycle.json`;
  const lifecycle = readCaseLifecycle(dir, lifecyclePath, source, target, archive);
  if (lifecycle === null) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-LIFECYCLE" };
  const nextState = caseMigrationNextState(state, target, updatedAt);
  if (!validateContinuityState(nextState.continuity, state.activeFeature.id).ok) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-POSTIMAGE" };
  const nextStateBytes = Buffer.from(JSON.stringify(nextState, null, 2) + "\n", "utf8");
  const payload = {
    schema: RESULT_CASE_MIGRATION_PLAN_SCHEMA, root: realpathSync(resolve(dir)), featureId: state.activeFeature.id,
    selectedAuthorityTarget: { path: target.path, sha256: target.sha256, identity: target.identity },
    archive: { path: archive, preimage: "absent", source: { path: source.path, sha256: source.sha256, identity: source.identity } },
    preimage: { stateSha256: sha256Bytes(existing.raw), revision: state.continuity.revision, prd: { path: prd.path, sha256: prd.sha256, identity: prd.identity }, spec: { path: spec.path, sha256: spec.sha256, identity: spec.identity }, resultCandidates: [candidates.upper, candidates.lower].map((entry) => ({ path: entry.path, sha256: entry.sha256, identity: entry.identity })), lifecycle: { path: lifecycle.manifest.path, sha256: lifecycle.manifest.sha256, identity: lifecycle.manifest.identity } },
    postimage: { stateSha256: sha256Bytes(nextStateBytes), lifecycleSha256: lifecycle.postSha256, revision: nextState.continuity.revision, updatedAt, caseAliasEliminated: true },
  };
  return { ok: true, payload, planSha256: sha256Bytes(JSON.stringify(payload)), nextState, nextStateBytes, lifecycle, source, target, archive };
}

function caseMigrationPrivatePaths(dir, deps = {}) {
  const common = (deps.gitCommonDir ?? defaultGitCommonDir)(dir); if (!common?.ok || typeof common.path !== "string") return null;
  try { const root = realpathSync(common.path); if (root !== resolve(common.path) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) return null; const namespace = join(root, "agent-pipeline"); const base = join(namespace, "result-case-migration"); return { root, namespace, base, key: join(base, "key"), journal: join(base, "journal") }; } catch { return null; }
}
function ensureCaseMigrationDirectory(paths, deps = {}) {
  if (paths === null) return false;
  const platform = deps.platform ?? process.platform;
  const assessWindowsPrivate = deps.assessWindowsPrivate ?? assessWindowsPrivatePath;
  try {
    for (const path of [paths.namespace, paths.base]) {
      if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path) return false;
      const secure = platform === "win32" ? assessWindowsPrivate(path).status === "secure" : (info.mode & 0o077) === 0;
      if (!secure) return false;
    }
    return true;
  } catch { return false; }
}
function caseMigrationMac(key, value) { return createHmac("sha256", key).update(JSON.stringify(value)).digest("hex"); }
function loadCaseMigrationJournal(dir, deps = {}) {
  const paths = caseMigrationPrivatePaths(dir, deps); if (!ensureCaseMigrationDirectory(paths, deps)) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-JOURNAL" };
  const raw = readPrivateBootstrap(paths.journal, deps); if (raw === null) return { ok: true, paths, journal: null };
  const key = readPrivateBootstrap(paths.key, deps); if (key === null || key.byteLength !== 32) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-JOURNAL" };
  try { const value = JSON.parse(raw.toString("utf8")); const { mac, ...core } = value; if (value.schema !== RESULT_CASE_MIGRATION_JOURNAL_SCHEMA || !SHA256_RE.test(value.planSha256) || !SHA256_RE.test(value.stateSha256) || !SHA256_RE.test(value.postStateSha256) || !SHA256_RE.test(value.lifecycleSha256) || !SHA256_RE.test(value.postLifecycleSha256) || !value.source || !value.target || !value.archive || typeof value.postStateBase64 !== "string" || typeof value.postLifecycleBase64 !== "string" || !SHA256_RE.test(mac) || caseMigrationMac(key, core) !== mac) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-JOURNAL" }; return { ok: true, paths, journal: value }; } catch { return { ok: false, code: "PS-RESULT-CASE-MIGRATION-JOURNAL" }; }
}
function publishCaseMigrationJournal(dir, plan, deps = {}) {
  const paths = caseMigrationPrivatePaths(dir, deps); if (!ensureCaseMigrationDirectory(paths, deps)) return false;
  let key = readPrivateBootstrap(paths.key, deps); if (key === null) { key = randomBytes(32); if (!writePrivateBootstrap(paths.key, key)) return false; } if (key.byteLength !== 32) return false;
  const core = { schema: RESULT_CASE_MIGRATION_JOURNAL_SCHEMA, planSha256: plan.planSha256, stateSha256: plan.payload.preimage.stateSha256, postStateSha256: plan.payload.postimage.stateSha256, lifecycleSha256: plan.payload.preimage.lifecycle.sha256, postLifecycleSha256: plan.payload.postimage.lifecycleSha256, source: { path: plan.source.path, sha256: plan.source.sha256 }, target: { path: plan.target.path, sha256: plan.target.sha256 }, archive: plan.archive, postStateBase64: plan.nextStateBytes.toString("base64"), postLifecycleBase64: plan.lifecycle.postBytes.toString("base64") };
  return writePrivateBootstrap(paths.journal, Buffer.from(JSON.stringify({ ...core, mac: caseMigrationMac(key, core) }) + "\n", "utf8"), false);
}
function retireCaseMigrationJournal(paths) { try { unlinkSync(paths.journal); return syncDirectory(paths.base).ok; } catch { return false; } }
function atomicCaseMigrationWrite(path, bytes, lock, deps = {}) {
  const tmp = `${path}.tmp.${lock.ownerNonce}`; let fd;
  try { if (!assertContinuityLockOwned(lock)) return false; fd = openSync(tmp, "wx", 0o600); let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); fsyncSync(fd); closeSync(fd); fd = undefined; if (!assertContinuityLockOwned(lock)) return false; (deps.renameCaseMigration ?? renameSync)(tmp, path); return (deps.syncCaseMigrationDirectory ?? syncDirectory)(dirname(path)).ok; } catch { return false; } finally { if (fd !== undefined) closeSync(fd); safeUnlink(tmp); }
}
function moveCaseMigrationSource(dir, journal, lock, deps = {}) {
  const source = physicalRebindFile(dir, journal.source.path); const archive = physicalRebindFile(dir, journal.archive);
  if (source === null && archive !== null && archive.sha256 === journal.source.sha256) return true;
  if (source === null || archive !== null || source.sha256 !== journal.source.sha256 || !assertContinuityLockOwned(lock)) return false;
  const parent = dirname(resolve(dir, journal.archive));
  try { mkdirSync(parent, { recursive: true, mode: 0o700 }); const info = lstatSync(parent); if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(parent) !== parent) return false; (deps.renameCaseMigrationSource ?? renameSync)(source.absolute, resolve(dir, journal.archive)); return (deps.syncCaseMigrationDirectory ?? syncDirectory)(dirname(source.absolute)).ok && (deps.syncCaseMigrationDirectory ?? syncDirectory)(parent).ok; } catch { return false; }
}
function recoverCaseMigration(dir, journal, lock, deps = {}) {
  if (!moveCaseMigrationSource(dir, journal, lock, deps)) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-RECOVERY" };
  if (deps.afterCaseMigrationSource?.() === false) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-INTERRUPTED" };
  const lifecycle = physicalRebindFile(dir, `${dirname(journal.target.path)}/lifecycle.json`); if (lifecycle === null || ![journal.lifecycleSha256, journal.postLifecycleSha256].includes(lifecycle.sha256)) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-RECOVERY" };
  if (lifecycle.sha256 === journal.lifecycleSha256 && !atomicCaseMigrationWrite(lifecycle.absolute, Buffer.from(journal.postLifecycleBase64, "base64"), lock, deps)) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-RECOVERY" };
  if (deps.afterCaseMigrationLifecycle?.() === false) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-INTERRUPTED" };
  const current = readStateRaw(dir); if (current.status !== "ok" || ![journal.stateSha256, journal.postStateSha256].includes(sha256Bytes(current.raw))) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-RECOVERY" };
  if (sha256Bytes(current.raw) === journal.stateSha256 && !atomicWriteContinuityState(dir, JSON.parse(Buffer.from(journal.postStateBase64, "base64").toString("utf8")), lock, deps).ok) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-RECOVERY" };
  const doneState = readStateRaw(dir); const doneLifecycle = physicalRebindFile(dir, `${dirname(journal.target.path)}/lifecycle.json`); const doneArchive = physicalRebindFile(dir, journal.archive);
  if (doneState.status !== "ok" || sha256Bytes(doneState.raw) !== journal.postStateSha256 || doneLifecycle === null || doneLifecycle.sha256 !== journal.postLifecycleSha256 || doneArchive === null || doneArchive.sha256 !== journal.source.sha256 || physicalRebindFile(dir, journal.source.path) !== null) return { ok: false, code: "PS-RESULT-CASE-MIGRATION-RECOVERY" };
  return { ok: true };
}
function parseCaseMigrationPlan(argv) { return argv.length === 4 && argv[0] === "--result-path" && argv[2] === "--archive-path" && !isBlank(argv[1]) && !isBlank(argv[3]) ? { resultPath: argv[1], archivePath: argv[3] } : null; }
function parseCaseMigrationApply(argv) { if (argv.length !== 17 || argv[0] !== "--feature-id" || isBlank(argv[1]) || argv[2] !== "--result-path" || isBlank(argv[3]) || argv[4] !== "--archive-path" || isBlank(argv[5]) || argv[6] !== "--expected-revision" || !parseExpectedRevision(argv[7]).ok || argv[8] !== "--expected-state-sha256" || !SHA256_RE.test(argv[9]) || argv[10] !== "--expected-post-state-sha256" || !SHA256_RE.test(argv[11]) || argv[12] !== "--updated-at" || !canonicalIso(argv[13]) || argv[14] !== "--plan-sha256" || !SHA256_RE.test(argv[15]) || argv[16] !== "--activate") return null; return { featureId: argv[1], resultPath: argv[3], archivePath: argv[5], expectedRevision: Number(argv[7]), expectedStateSha256: argv[9], expectedPostStateSha256: argv[11], updatedAt: argv[13], planSha256: argv[15] }; }
function isCaseMigrationPostimage(dir, current, apply) {
  if (current.status !== "ok" || sha256Bytes(current.raw) !== apply.expectedPostStateSha256) return false;
  const state = current.state; const target = physicalRebindFile(dir, apply.resultPath); const archive = physicalRebindFile(dir, apply.archivePath);
  if (state.activeFeature?.id !== apply.featureId || state.updatedAt !== apply.updatedAt || state.continuity?.revision !== apply.expectedRevision + 1 || state.continuity?.authority?.result?.path !== apply.resultPath || target === null || archive === null || target.sha256 !== state.continuity.authority.result.sha256 || physicalRebindFile(dir, `${dirname(apply.resultPath)}/result.md`) !== null && physicalRebindFile(dir, `${dirname(apply.resultPath)}/Result.md`) !== null) return false;
  const manifest = physicalRebindFile(dir, `${dirname(apply.resultPath)}/lifecycle.json`); if (manifest === null) return false;
  try { const value = JSON.parse(manifest.bytes.toString("utf8")); const results = value.artifacts?.filter((entry) => entry?.class === "result") ?? []; return results.filter((entry) => entry.path === apply.resultPath && entry.authority === true && entry.sha256 === target.sha256 && entry.retention === "active").length === 1 && results.filter((entry) => entry.path === apply.archivePath && entry.authority === false && entry.sha256 === archive.sha256 && entry.retention === "archive").length === 1; } catch { return false; }
}
function runResultCaseMigrationCommand(sub, rest, deps) {
  if (sub === "continuity-result-case-migration-plan") { const request = parseCaseMigrationPlan(rest); if (request === null) { console.error("Error: Result case migration plan requires exact --result-path and --archive-path."); return 2; } const plan = buildResultCaseMigrationPlan(deps.dir, readStateRaw(deps.dir), request.resultPath, request.archivePath, deps.now()); if (!plan.ok) { console.error(`Error: Result case migration plan refused (${plan.code}); zero mutation.`); return 2; } const writer = fileURLToPath(import.meta.url); console.log(JSON.stringify({ ...plan.payload, planSha256: plan.planSha256, applyAction: { executable: process.execPath, argv: [writer, "continuity-result-case-migration-apply", "--feature-id", plan.payload.featureId, "--result-path", request.resultPath, "--archive-path", request.archivePath, "--expected-revision", String(plan.payload.preimage.revision), "--expected-state-sha256", plan.payload.preimage.stateSha256, "--expected-post-state-sha256", plan.payload.postimage.stateSha256, "--updated-at", plan.payload.postimage.updatedAt, "--plan-sha256", plan.planSha256, "--activate"], mutation: true, requiresConfirmation: true, executionBoundary: "host-authorized-wsl", expected: { schema: RESULT_CASE_MIGRATION_APPLY_SCHEMA, statuses: ["applied", "replayed"] } } }, null, 2)); return 0; }
  const apply = parseCaseMigrationApply(rest); if (apply === null) { console.error("Error: Result case migration apply requires the complete returned action and --activate confirmation."); return 2; }
  const lock = acquireContinuityLock(deps.dir, RESULT_CASE_MIGRATION_LOCK_TOKEN, deps); if (!lock.ok) { console.error(`Error: Result case migration refused (${lock.code}); zero mutation.`); return 2; }
  try { const current = readStateRaw(deps.dir); if (isCaseMigrationPostimage(deps.dir, current, apply)) { console.log(JSON.stringify({ schema: RESULT_CASE_MIGRATION_APPLY_SCHEMA, status: "replayed", featureId: apply.featureId, revision: current.state.continuity.revision, stateSha256: apply.expectedPostStateSha256, result: current.state.continuity.authority.result, archive: apply.archivePath, mutated: false })); return 0; } const freshPlan = buildResultCaseMigrationPlan(deps.dir, current, apply.resultPath, apply.archivePath, apply.updatedAt); const journal = loadCaseMigrationJournal(deps.dir, deps); if (!journal.ok) { console.error(`Error: Result case migration journal refused (${journal.code}); zero mutation.`); return 2; } let plan = null; if (journal.journal === null) { plan = freshPlan; if (!plan.ok || sha256Bytes(current.raw) !== apply.expectedStateSha256 || plan.planSha256 !== apply.planSha256 || plan.payload.featureId !== apply.featureId || plan.payload.preimage.revision !== apply.expectedRevision || plan.payload.postimage.stateSha256 !== apply.expectedPostStateSha256) { console.error("Error: Result case migration apply inputs are stale or conflicting; zero mutation."); return 2; } if (!publishCaseMigrationJournal(deps.dir, plan, deps)) { console.error("Error: Result case migration journal prepare failed; zero mutation."); return 2; } } else if (journal.journal.planSha256 !== apply.planSha256 || journal.journal.stateSha256 !== apply.expectedStateSha256 || journal.journal.postStateSha256 !== apply.expectedPostStateSha256 || journal.journal.target.path !== apply.resultPath || journal.journal.archive !== apply.archivePath) { console.error("Error: Result case migration journal conflicts; zero new mutation."); return 2; }
    const active = journal.journal ?? loadCaseMigrationJournal(deps.dir, deps).journal; const recovered = recoverCaseMigration(deps.dir, active, lock, deps); if (!recovered.ok) { console.error(`Error: Result case migration recovery unresolved (${recovered.code}); mutation disposition is not success.`); return 2; } if (!retireCaseMigrationJournal(journal.paths)) { console.error("Error: Result case migration committed but journal retirement is unresolved."); return 2; } const state = readStateRaw(deps.dir); console.log(JSON.stringify({ schema: RESULT_CASE_MIGRATION_APPLY_SCHEMA, status: plan === null ? "replayed" : "applied", featureId: apply.featureId, revision: state.state.continuity.revision, stateSha256: apply.expectedPostStateSha256, result: state.state.continuity.authority.result, archive: apply.archivePath, mutated: plan !== null })); return 0;
  } finally { releaseContinuityLock(lock); }
}

// ---- PHX-0B: continuity-authority PRD/Spec revision writer (Phoenix §7) ----
/**
 * `continuity-authority-revision-plan` / `-apply` / `-recover`.
 *
 * A scoped human design-revision decision replaces the active feature's PRD/Spec
 * authority bytes recorded at `continuity.authority.{prd,spec}` -- the same pair every
 * other continuity writer treats as immutable once initialized. `-plan` derives ONE
 * closed read-only request via `createAuthorityRevisionIntent` (../lib/authority-
 * revision-proof.mjs) and writes no State. `-apply` re-derives the identical request
 * fresh from CURRENT reality (closing the TOCTOU gap a planner leaves open), consumes
 * the caller-injected `authorityRevisionApproval` proof result rather than verifying a
 * signature itself, and commits the postimage as a transaction: a private, HMAC-
 * authenticated recovery journal (mirroring `feature-package-apply`'s git-common-dir
 * journal) is published BEFORE the State bytes are touched and retained -- never
 * deleted -- on every failure path; only a confirmed post-write readback retires it.
 * `-recover` never re-derives the plan and never re-reads a git candidate -- it replays
 * only the exact frozen postimage bytes the journal already carries, or confirms the
 * exact retained preimage, after a fresh byte-identical reread of the CURRENT State
 * file (never a temporary file).
 *
 * The plan's own stdout document IS the `--request-file` `-apply` consumes: it embeds
 * the fixed `postimage.updatedAt` the plan used, so apply never calls the clock again
 * for the postimage it writes -- only for the (separately, freshly re-checked) expiry.
 */
const AUTHORITY_REVISION_SUBCOMMANDS = new Set([
  "continuity-authority-revision-plan",
  "continuity-authority-revision-apply",
  "continuity-authority-revision-recover",
]);
const AUTHORITY_REVISION_REQUEST_INPUT_SCHEMA = "pipeline.continuity-authority-revision-request.v1";
const AUTHORITY_REVISION_PLAN_SCHEMA = "pipeline.continuity-authority-revision-plan.v1";
const AUTHORITY_REVISION_APPLY_SCHEMA = "pipeline.continuity-authority-revision-apply.v1";
const AUTHORITY_REVISION_RECOVER_SCHEMA = "pipeline.continuity-authority-revision-recover.v1";
const AUTHORITY_REVISION_RECEIPT_SCHEMA = "pipeline.continuity-authority-revision-receipt.v1";
// F2: `.v1` predates `expiresAt` (added for PX0-AC-06); a journal a prior build left
// pending across the upgrade must still load, not fail closed with AR-JOURNAL. Current
// code only ever WRITES `.v2` -- there is no path that writes a `.v1` journal anymore.
const AUTHORITY_REVISION_JOURNAL_SCHEMA_V1 = "pipeline.continuity-authority-revision-journal.v1";
const AUTHORITY_REVISION_JOURNAL_SCHEMA_V2 = "pipeline.continuity-authority-revision-journal.v2";
const AUTHORITY_REVISION_JOURNAL_SCHEMA = AUTHORITY_REVISION_JOURNAL_SCHEMA_V2;
const AUTHORITY_REVISION_JOURNAL_KEYS_V1 = ["schema", "intentSha256", "planSha256", "preStateSha256", "postStateSha256", "postStateBase64", "receipt", "mac"];
const AUTHORITY_REVISION_JOURNAL_KEYS_V2 = ["schema", "intentSha256", "planSha256", "preStateSha256", "postStateSha256", "postStateBase64", "expiresAt", "receipt", "mac"];
// Must match phoenix-authority-approval.mjs's `approval` object schema and key order
// EXACTLY: `deps.authorityRevisionApproval` performs a strict JSON.stringify comparison.
const AUTHORITY_REVISION_APPROVAL_SCHEMA = "pipeline.continuity-authority-revision-approval.v1";
const AUTHORITY_REVISION_PRD_PATH_RE = /^specs\/[A-Za-z0-9._:-]+\/prd_[A-Za-z0-9._:-]+\.md$/u;

function readAuthorityRevisionFile(dir, relativePath) {
  const path = safeRequestFile(dir, relativePath);
  if (path === null) return { ok: false, code: "AR-REQUEST-FILE" };
  let raw;
  try { raw = readFileSync(path); } catch { return { ok: false, code: "AR-REQUEST-FILE" }; }
  let value;
  try { value = JSON.parse(raw.toString("utf8")); } catch { return { ok: false, code: "AR-REQUEST-JSON" }; }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, code: "AR-REQUEST-JSON" };
  return { ok: true, raw, value };
}

/**
 * F5: dedup keyed on `intentSha256` alone would silently merge a hash COLLISION --
 * two DIFFERENT receipts that happen to share an `intentSha256` string -- into a
 * single retained entry, discarding one of them without a trace. A genuine duplicate
 * re-splice of the SAME closed intent is deterministic (every `durableReceipt` field
 * is derived from the same frozen intent value inside `buildAuthorityRevisionPlan`),
 * so it always produces a byte-for-byte identical receipt; anything that shares the
 * digest but not the content is therefore never a legitimate replay and must fail
 * closed rather than silently merge OR silently append a second entry under an
 * ambiguous, already-claimed correlation key. Exported (not inlined at the call site)
 * so this decision is directly unit-testable: a genuine SHA-256 collision cannot be
 * constructed in a test, but two hand-built receipt objects sharing an `intentSha256`
 * with different content can.
 */
export function mergeAuthorityRevisionReceipt(priorReceipts, durableReceipt) {
  const list = Array.isArray(priorReceipts) ? priorReceipts : [];
  const priorByIntent = list.find((entry) => entry?.intentSha256 === durableReceipt.intentSha256);
  if (priorByIntent === undefined) return { ok: true, receipts: [...list, durableReceipt] };
  if (!sameJson(priorByIntent, durableReceipt)) return { ok: false, code: "AR-RECEIPT-COLLISION" };
  return { ok: true, receipts: list };
}

/**
 * Re-derivable from either a `--proposal-file` (plan) or the intent embedded in a
 * previously-planned `--request-file` (apply): both are the same closed shape
 * `createAuthorityRevisionIntent` accepts, and every check below re-reads reality
 * fresh -- nothing here trusts a cached observation.
 */
function buildAuthorityRevisionPlan(dir, existing, proposal, updatedAt, deps = {}) {
  if (existing.status !== "ok") return { ok: false, code: "AR-STATE-UNAVAILABLE" };
  if (!canonicalIso(updatedAt)) return { ok: false, code: "AR-UPDATED-AT" };
  const state = existing.state;
  if (!state?.activeFeature || !state?.continuity || state.schema !== SCHEMA_ID || state.gateEstimate !== undefined) {
    return { ok: false, code: "AR-NO-ACTIVE-FEATURE" };
  }
  let intent;
  try { intent = createAuthorityRevisionIntent(proposal); } catch { return { ok: false, code: "AR-INTENT-INVALID" }; }
  const value = intent.value;
  const stateFile = physicalRebindFile(dir, stateRelativePath(dir));
  if (stateFile === null || stateFile.sha256 !== sha256Bytes(existing.raw)) return { ok: false, code: "AR-STATE-IDENTITY" };
  const continuity = state.continuity;
  if (!validateContinuityState(continuity, state.activeFeature.id).ok || continuity.featureId !== state.activeFeature.id) {
    return { ok: false, code: "AR-CONTINUITY-INVALID" };
  }
  if (continuity.queueHead?.dispatch !== null || continuity.blocker !== null || continuity.decisionTxn !== null
    || continuity.closeTransition != null || continuity.recovery !== null || continuity.acknowledgedFinal !== null) {
    return { ok: false, code: "AR-CONTINUITY-BUSY" };
  }
  if (state.activeFeature.id !== value.featureId) return { ok: false, code: "AR-FEATURE-MISMATCH" };
  if (state.activeFeature.phase !== "design" || value.decision.scope.phase !== "design"
    || value.decision.scope.featureId !== state.activeFeature.id) return { ok: false, code: "AR-DECISION-SCOPE" };
  if (continuity.revision !== value.expectedRevision || continuity.revision >= Number.MAX_SAFE_INTEGER) {
    return { ok: false, code: "AR-REVISION-STALE" };
  }
  if (sha256Bytes(existing.raw) !== value.preStateSha256) return { ok: false, code: "AR-PRESTATE-STALE" };
  const nowIso = (deps.now ?? (() => new Date().toISOString()))();
  if (!(Date.parse(value.expiresAt) > Date.parse(nowIso))) return { ok: false, code: "AR-EXPIRED" };
  const observedCandidate = (deps.gitCandidate ?? defaultGitCandidate)(dir);
  if (!observedCandidate.ok || observedCandidate.commit !== value.candidate.commit || observedCandidate.tree !== value.candidate.tree) {
    return { ok: false, code: "AR-CANDIDATE-STALE" };
  }
  if (continuity.authority.prd.path !== value.oldAuthority.prd.path || continuity.authority.prd.sha256 !== value.oldAuthority.prd.sha256
    || continuity.authority.spec.path !== value.oldAuthority.spec.path || continuity.authority.spec.sha256 !== value.oldAuthority.spec.sha256) {
    return { ok: false, code: "AR-OLD-AUTHORITY-STALE" };
  }
  if (!AUTHORITY_REVISION_PRD_PATH_RE.test(value.nextAuthority.prd.path)) return { ok: false, code: "AR-NEXT-PRD-PATH" };
  if (value.nextAuthority.spec.path !== `${dirname(value.nextAuthority.prd.path).split(sep).join("/")}/spec.md`) {
    return { ok: false, code: "AR-NEXT-SPEC-PATH" };
  }
  if (value.nextAuthority.prd.path === value.oldAuthority.prd.path && value.nextAuthority.prd.sha256 === value.oldAuthority.prd.sha256
    && value.nextAuthority.spec.path === value.oldAuthority.spec.path && value.nextAuthority.spec.sha256 === value.oldAuthority.spec.sha256) {
    return { ok: false, code: "AR-NO-CHANGE" };
  }
  const newPrd = physicalRebindFile(dir, value.nextAuthority.prd.path);
  const newSpec = physicalRebindFile(dir, value.nextAuthority.spec.path);
  if (newPrd === null || newSpec === null || newPrd.sha256 !== value.nextAuthority.prd.sha256 || newSpec.sha256 !== value.nextAuthority.spec.sha256) {
    return { ok: false, code: "AR-NEXT-AUTHORITY-STALE" };
  }
  let newPrdText;
  try { newPrdText = new TextDecoder("utf-8", { fatal: true }).decode(newPrd.bytes); } catch { return { ok: false, code: "AR-NEXT-PRD-TEXT" }; }
  const marker = rebindMarker(newPrdText);
  if (marker === null || marker.digest !== newSpec.sha256) return { ok: false, code: "AR-NEXT-PRD-MARKER" };

  // PX0-AC-05: a public-safe correlated receipt -- stable operation/reason classes,
  // public path+digest references, decision/candidate/evidence references, a typed
  // outcome. Deliberately excludes `dir`/`root`/any absolute path, any raw command,
  // any prompt text, and any user/account or machine identifier.
  //
  // F4/courseDecisionReceipts convention: `casOutcome`. This function runs exactly once
  // per revision -- only from `-apply`, always BEFORE it is known whether that same
  // invocation will finish the write itself or crash and leave it for a later
  // `-recover` roll-forward to complete. `-recover` never re-derives this object; it
  // replays the exact frozen bytes this call produces (PX0-AC-06's own "must not infer
  // success from a temporary file" / exact-byte-replay contract, which this file's own
  // AR05f test asserts by design: the SAME receipt is retained whichever path commits
  // it). So `casOutcome` records the one fact that's true and stable at build time
  // either way -- the revision is applied to State once this postimage is durably
  // written -- not which invocation physically performed that write; "applied fresh"
  // vs. "recovered via completing forward" remains visible instead in each command's
  // own (non-durable) response `status` (`applied` vs. `recovered-postimage`), unchanged
  // by this fix.
  const receipt = {
    schema: AUTHORITY_REVISION_RECEIPT_SCHEMA,
    operation: "continuity-authority-revision",
    reasonClass: "design-authority-revision",
    featureId: state.activeFeature.id,
    oldAuthority: { prd: value.oldAuthority.prd, spec: value.oldAuthority.spec },
    nextAuthority: { prd: value.nextAuthority.prd, spec: value.nextAuthority.spec },
    decision: value.decision,
    candidate: value.candidate,
    evidence: value.evidence,
    casOutcome: "applied",
  };

  const nextState = structuredClone(state);
  nextState.continuity.revision += 1;
  nextState.continuity.authority = {
    ...nextState.continuity.authority,
    prd: { path: value.nextAuthority.prd.path, sha256: value.nextAuthority.prd.sha256 },
    spec: { path: value.nextAuthority.spec.path, sha256: value.nextAuthority.spec.sha256 },
  };
  nextState.continuity.resume = { ...nextState.continuity.resume, sourceRevision: nextState.continuity.revision };
  nextState.updatedAt = updatedAt;
  if (!validateContinuityState(nextState.continuity, state.activeFeature.id).ok) return { ok: false, code: "AR-POSTIMAGE-INVALID" };

  // PX0-AC-05 (durable retention): a receipt correlated by `intentSha256` is spliced
  // into the SAME nextState object BEFORE it is written once -- no second write pass --
  // so it survives independently of the private recovery journal (retired on success)
  // and of stdout. Lives as a top-level sibling of `continuity` (not inside it): the
  // continuity record's own closed shape is validated by lib/continuity-state.mjs's
  // ROOT_KEYS, out of this change's scope. Append-only and idempotent by correlation
  // key so a receipt is never duplicated if this ever re-splices onto a State that
  // already carries it -- F5: `mergeAuthorityRevisionReceipt` re-derives/compares the
  // underlying content, not just the `intentSha256` string, before treating two
  // entries as the same duplicate (see its own doc comment).
  const priorReceipts = Array.isArray(state.authorityRevisionReceipts) ? state.authorityRevisionReceipts : [];
  const durableReceipt = { ...receipt, intentSha256: intent.sha256 };
  const merged = mergeAuthorityRevisionReceipt(priorReceipts, durableReceipt);
  if (!merged.ok) return { ok: false, code: merged.code };
  nextState.authorityRevisionReceipts = merged.receipts;

  const nextStateBytes = Buffer.from(`${JSON.stringify(nextState, null, 2)}\n`, "utf8");

  const payload = {
    schema: AUTHORITY_REVISION_PLAN_SCHEMA,
    intent: value,
    intentSha256: intent.sha256,
    preimage: { revision: continuity.revision, stateSha256: sha256Bytes(existing.raw), authority: { prd: continuity.authority.prd, spec: continuity.authority.spec } },
    postimage: {
      revision: nextState.continuity.revision,
      stateSha256: sha256Bytes(nextStateBytes),
      authority: { prd: nextState.continuity.authority.prd, spec: nextState.continuity.authority.spec },
      updatedAt,
    },
    receipt,
  };
  return { ok: true, payload, planSha256: sha256CanonicalJson(payload), intentSha256: intent.sha256, nextState, nextStateBytes, receipt };
}

function authorityRevisionPrivatePaths(dir, deps = {}) {
  const common = (deps.gitCommonDir ?? defaultGitCommonDir)(dir);
  if (!common?.ok || typeof common.path !== "string") return null;
  try {
    const root = realpathSync(common.path);
    if (root !== resolve(common.path) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) return null;
    const namespace = join(root, "agent-pipeline");
    const base = join(namespace, "continuity-authority-revision");
    return { root, namespace, base, key: join(base, "key"), journal: join(base, "journal") };
  } catch { return null; }
}

function loadAuthorityRevisionJournal(dir, deps = {}) {
  const paths = authorityRevisionPrivatePaths(dir, deps);
  if (paths === null || !observeBootstrapPrivateDirectory(paths)) return { ok: false, code: "AR-JOURNAL-GIT-COMMON-DIR" };
  const key = readPrivateBootstrap(paths.key);
  const raw = readPrivateBootstrap(paths.journal);
  if (raw === null) return { ok: true, journal: null, paths, key };
  if (key === null || key.byteLength !== 32) return { ok: false, code: "AR-JOURNAL" };
  try {
    const value = JSON.parse(raw.toString("utf8"));
    const isV2 = value?.schema === AUTHORITY_REVISION_JOURNAL_SCHEMA_V2;
    const isV1 = !isV2 && value?.schema === AUTHORITY_REVISION_JOURNAL_SCHEMA_V1;
    const keys = isV2 ? AUTHORITY_REVISION_JOURNAL_KEYS_V2 : AUTHORITY_REVISION_JOURNAL_KEYS_V1;
    if (!(isV1 || isV2)
      || !exactObjectKeys(value, keys)
      || !SHA256_RE.test(value.intentSha256)
      || !SHA256_RE.test(value.planSha256)
      || !SHA256_RE.test(value.preStateSha256)
      || !SHA256_RE.test(value.postStateSha256)
      || typeof value.postStateBase64 !== "string"
      || (isV2 && (typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))))
      || value.receipt === null || typeof value.receipt !== "object" || Array.isArray(value.receipt)
      || !SHA256_RE.test(value.mac)) return { ok: false, code: "AR-JOURNAL" };
    const { mac, ...core } = value;
    if (bootstrapJournalMac(key, core) !== mac) return { ok: false, code: "AR-JOURNAL" };
    // F2: a `.v1` journal never had a frozen `expiresAt` to check against -- `expiresAt:
    // null` here is the in-memory sentinel `runAuthorityRevisionRecoverCommand` reads to
    // preserve the OLD unconditional-roll-forward behavior for this ONE legacy case only,
    // never written back to disk.
    const journal = isV1 ? { ...value, expiresAt: null } : value;
    return { ok: true, journal, paths, key };
  } catch { return { ok: false, code: "AR-JOURNAL" }; }
}

/** Publishes the journal BEFORE any State byte is touched. `wx`-only: never overwrites a pending one. */
function publishAuthorityRevisionJournal(dir, record, deps = {}) {
  const paths = authorityRevisionPrivatePaths(dir, deps);
  if (!ensureBootstrapPrivateDirectory(paths)) return false;
  let key = readPrivateBootstrap(paths.key);
  if (key === null) { key = randomBytes(32); if (!writePrivateBootstrap(paths.key, key)) return false; }
  if (key.byteLength !== 32) return false;
  const core = {
    schema: AUTHORITY_REVISION_JOURNAL_SCHEMA,
    intentSha256: record.intentSha256,
    planSha256: record.planSha256,
    preStateSha256: record.preStateSha256,
    postStateSha256: record.postStateSha256,
    postStateBase64: record.postStateBytes.toString("base64"),
    // PX0-AC-06: the frozen intent's own expiry, carried through so `-recover` can run
    // its one fresh binding check (expiry against `deps.now`) without re-deriving the
    // plan or re-reading a git candidate. Inside `core` -> MAC-protected exactly like
    // every other journal field.
    expiresAt: record.expiresAt,
    receipt: record.receipt,
  };
  const bytes = Buffer.from(`${JSON.stringify({ ...core, mac: bootstrapJournalMac(key, core) })}\n`, "utf8");
  return writePrivateBootstrap(paths.journal, bytes, false);
}

/** Retires the journal. Only ever called after a confirmed, matching postimage readback. */
function retireAuthorityRevisionJournal(paths) {
  try { return ensureBootstrapPrivateDirectory(paths) && (unlinkSync(paths.journal), syncDirectory(paths.base).ok); } catch { return false; }
}

function parseAuthorityRevisionApplyFlags(rest) {
  const parsed = parseExactFlags(rest, new Set(["request-file", "request-sha256", "lock-token"]));
  if (!parsed.ok || !SHA256_RE.test(parsed.value["request-sha256"])) return null;
  return { requestFile: parsed.value["request-file"], requestSha256: parsed.value["request-sha256"], lockToken: parsed.value["lock-token"] };
}

function runAuthorityRevisionPlanCommand(dir, rest, deps) {
  const parsed = parseExactFlags(rest, new Set(["proposal-file"]));
  if (!parsed.ok) { console.error("Error: continuity-authority-revision-plan requires exactly --proposal-file <repo-relative-json>."); return 2; }
  const read = readAuthorityRevisionFile(dir, parsed.value["proposal-file"]);
  if (!read.ok) { console.error(`Error: continuity-authority-revision-plan refused (${read.code}); zero mutation.`); return 2; }
  const updatedAt = deps.now();
  const built = buildAuthorityRevisionPlan(dir, readStateRaw(dir), read.value, updatedAt, deps);
  if (!built.ok) { console.error(`Error: continuity-authority-revision-plan refused (${built.code}); zero mutation.`); return 2; }
  console.log(JSON.stringify({ ...built.payload, planSha256: built.planSha256 }, null, 2));
  return 0;
}

function authorityRevisionRequestDocValid(requestDoc) {
  return requestDoc?.schema === AUTHORITY_REVISION_PLAN_SCHEMA
    && requestDoc.intent && typeof requestDoc.intent === "object" && !Array.isArray(requestDoc.intent)
    && typeof requestDoc.intentSha256 === "string" && SHA256_RE.test(requestDoc.intentSha256)
    && typeof requestDoc.planSha256 === "string" && SHA256_RE.test(requestDoc.planSha256)
    && requestDoc.postimage && typeof requestDoc.postimage.updatedAt === "string"
    && requestDoc.receipt && typeof requestDoc.receipt === "object" && !Array.isArray(requestDoc.receipt);
}

function runAuthorityRevisionApplyCommand(dir, rest, deps) {
  const parsed = parseAuthorityRevisionApplyFlags(rest);
  if (parsed === null) {
    console.error("Error: continuity-authority-revision-apply requires exactly --request-file <repo-relative-json> --request-sha256 <sha256> --lock-token <token>.");
    return 2;
  }
  const readRaw = readAuthorityRevisionFile(dir, parsed.requestFile);
  if (!readRaw.ok) { console.error(`Error: continuity-authority-revision-apply refused (${readRaw.code}); zero mutation.`); return 2; }
  if (sha256Bytes(readRaw.raw) !== parsed.requestSha256) { console.error("Error: continuity-authority-revision-apply refused (AR-REQUEST-DIGEST-MISMATCH); zero mutation."); return 2; }
  const requestDoc = readRaw.value;
  if (!authorityRevisionRequestDocValid(requestDoc)) { console.error("Error: continuity-authority-revision-apply refused (AR-REQUEST-SHAPE); zero mutation."); return 2; }
  const intentValue = requestDoc.intent;

  if (typeof deps.authorityRevisionApproval !== "function") {
    console.error("Error: continuity-authority-revision-apply refused (AR-APPROVAL-UNAVAILABLE); zero mutation.");
    return 2;
  }
  const approvalCheck = deps.authorityRevisionApproval({
    repoRoot: dir,
    schema: AUTHORITY_REVISION_APPROVAL_SCHEMA,
    featureId: intentValue.featureId,
    phase: intentValue.decision?.scope?.phase,
    oldAuthority: intentValue.oldAuthority,
    nextAuthority: intentValue.nextAuthority,
    decision: intentValue.decision,
    candidate: intentValue.candidate,
    evidence: intentValue.evidence,
    expiresAt: intentValue.expiresAt,
  });
  if (!approvalCheck?.ok) { console.error("Error: continuity-authority-revision-apply refused (AR-PROOF-REJECTED); zero mutation."); return 2; }

  const lock = acquireContinuityLock(dir, parsed.lockToken, deps);
  if (!lock.ok) { console.error(`Error: continuity-authority-revision-apply refused (${lock.code}); zero mutation.`); return 2; }
  try {
    const current = readStateRaw(dir);
    if (current.status !== "ok") { console.error("Error: continuity-authority-revision-apply refused (AR-STATE-UNAVAILABLE); zero mutation."); return 2; }

    // PX0-AC-07: the exact same completed request, replayed -- verified zero-write.
    if (sha256Bytes(current.raw) === requestDoc.postimage.stateSha256) {
      if (current.state?.activeFeature?.id !== intentValue.featureId
        || current.state?.continuity?.revision !== requestDoc.postimage.revision
        || !sameJson(current.state?.continuity?.authority?.prd, requestDoc.postimage.authority?.prd)
        || !sameJson(current.state?.continuity?.authority?.spec, requestDoc.postimage.authority?.spec)) {
        console.error("Error: continuity-authority-revision-apply refused (AR-REPLAY-POSTIMAGE-INVALID); zero mutation.");
        return 2;
      }
      console.log(JSON.stringify({ schema: AUTHORITY_REVISION_APPLY_SCHEMA, status: "replayed", mutated: false, featureId: intentValue.featureId, revision: current.state.continuity.revision, receipt: requestDoc.receipt }, null, 2));
      return 0;
    }

    const pending = loadAuthorityRevisionJournal(dir, deps);
    if (!pending.ok) { console.error(`Error: continuity-authority-revision-apply refused (${pending.code}); run continuity-authority-revision-recover.`); return 2; }
    if (pending.journal !== null) {
      console.error(pending.journal.intentSha256 === requestDoc.intentSha256
        ? "Error: continuity-authority-revision-apply refused (AR-JOURNAL-PENDING); a recovery journal is already retained for this exact revision; run continuity-authority-revision-recover before retrying. Zero new mutation; recovery journal retained."
        : "Error: continuity-authority-revision-apply refused (AR-JOURNAL-CONFLICT); a different revision is already pending; run continuity-authority-revision-recover before retrying. Zero new mutation; recovery journal retained.");
      return 2;
    }

    // Fresh -- closes the TOCTOU window a planner leaves open: re-derive against
    // CURRENT reality using the SAME `updatedAt` the plan fixed, never a fresh clock.
    const proposal = { ...intentValue, schema: AUTHORITY_REVISION_REQUEST_INPUT_SCHEMA };
    const rebuilt = buildAuthorityRevisionPlan(dir, current, proposal, requestDoc.postimage.updatedAt, deps);
    if (!rebuilt.ok || rebuilt.planSha256 !== requestDoc.planSha256 || rebuilt.intentSha256 !== requestDoc.intentSha256) {
      console.error(`Error: continuity-authority-revision-apply refused (${rebuilt.ok ? "AR-REQUEST-STALE" : rebuilt.code}); zero mutation.`);
      return 2;
    }

    const published = publishAuthorityRevisionJournal(dir, {
      intentSha256: rebuilt.intentSha256, planSha256: rebuilt.planSha256,
      preStateSha256: sha256Bytes(current.raw), postStateSha256: sha256Bytes(rebuilt.nextStateBytes),
      postStateBytes: rebuilt.nextStateBytes, expiresAt: intentValue.expiresAt, receipt: rebuilt.receipt,
    }, deps);
    if (!published) { console.error("Error: continuity-authority-revision-apply refused (AR-JOURNAL-PREPARE-FAILED); zero mutation."); return 2; }
    if (deps.afterAuthorityRevisionJournal?.() === false) {
      console.error("Error: continuity-authority-revision-apply interrupted after journal preparation; recovery journal retained.");
      return 2;
    }

    const written = atomicWriteContinuityState(dir, rebuilt.nextState, lock, deps);
    if (!written.ok) { console.error(`Error: continuity-authority-revision-apply refused (${written.code}); recovery journal retained.`); return 2; }
    if (deps.afterAuthorityRevisionWrite?.() === false) {
      console.error("Error: continuity-authority-revision-apply interrupted after State write; recovery journal retained.");
      return 2;
    }

    const persisted = readStateRaw(dir);
    if (persisted.status !== "ok" || sha256Bytes(persisted.raw) !== sha256Bytes(rebuilt.nextStateBytes) || !sameJson(persisted.state, rebuilt.nextState)) {
      console.error("Error: continuity-authority-revision-apply refused (AR-POSTIMAGE-READBACK); recovery journal retained.");
      return 2;
    }
    const paths = authorityRevisionPrivatePaths(dir, deps);
    if (!retireAuthorityRevisionJournal(paths)) {
      console.error("Error: continuity-authority-revision-apply committed but journal retirement is unresolved; recovery journal retained.");
      return 2;
    }
    console.log(JSON.stringify({ schema: AUTHORITY_REVISION_APPLY_SCHEMA, status: "applied", mutated: true, featureId: intentValue.featureId, revision: persisted.state.continuity.revision, receipt: rebuilt.receipt }, null, 2));
    return 0;
  } finally { releaseContinuityLock(lock); }
}

/**
 * Never re-derives the plan and never re-reads a git candidate -- "must not select a
 * new candidate". Never infers success from the presence/absence of a `.tmp.*` file --
 * "must not infer success from a temporary file" -- it re-reads the CURRENT State file
 * itself and compares its exact bytes to the two values the journal already froze.
 */
function runAuthorityRevisionRecoverCommand(dir, rest, deps) {
  const parsed = parseExactFlags(rest, new Set(["lock-token"]));
  if (!parsed.ok) { console.error("Error: continuity-authority-revision-recover requires exactly --lock-token <token>."); return 2; }
  const lockToken = parsed.value["lock-token"];
  const loaded = loadAuthorityRevisionJournal(dir, deps);
  if (!loaded.ok) { console.error(`Error: continuity-authority-revision-recover refused (${loaded.code}); manual repository inspection is required.`); return 2; }
  if (loaded.journal === null) {
    console.log(JSON.stringify({ schema: AUTHORITY_REVISION_RECOVER_SCHEMA, status: "clean", retained: false }, null, 2));
    return 0;
  }
  const journal = loaded.journal;
  const observedBefore = readStateRaw(dir);
  if (observedBefore.status !== "ok") { console.error("Error: continuity-authority-revision-recover refused (AR-STATE-UNAVAILABLE); recovery journal retained."); return 2; }
  const observedSha256 = sha256Bytes(observedBefore.raw);

  if (observedSha256 === journal.postStateSha256) {
    // Durable stage already reached; only the journal retirement is outstanding.
    const paths = authorityRevisionPrivatePaths(dir, deps);
    if (!retireAuthorityRevisionJournal(paths)) {
      console.error("Error: continuity-authority-revision-recover refused (AR-JOURNAL-RETIREMENT-UNRESOLVED); recovery journal retained.");
      return 2;
    }
    console.log(JSON.stringify({ schema: AUTHORITY_REVISION_RECOVER_SCHEMA, status: "recovered-postimage", retained: false, mutated: false, receipt: journal.receipt }, null, 2));
    return 0;
  }

  if (observedSha256 !== journal.preStateSha256) {
    console.log(JSON.stringify({ schema: AUTHORITY_REVISION_RECOVER_SCHEMA, status: "diverged", retained: true }, null, 2));
    return 2;
  }

  // F3: the expiry decision below (and the journal deletion it can trigger) must not run
  // unlocked -- `-apply` holds this SAME lock across its entire publish-journal -> write-
  // State -> retire-journal sequence, so acquiring it here first is what actually closes
  // the race: a concurrent in-flight `-apply` either still holds the lock (this call fails
  // closed with a lock-contention code, journal retained, no delete) or has already fully
  // finished-or-failed-and-released it (in which case the fresh recheck below observes
  // reality as it now stands). Either way the expiry decision never acts on a stale,
  // unlocked read.
  const lock = acquireContinuityLock(dir, lockToken, deps);
  if (!lock.ok) { console.error(`Error: continuity-authority-revision-recover refused (${lock.code}); recovery journal retained.`); return 2; }
  try {
    const recheck = readStateRaw(dir);
    if (recheck.status !== "ok" || sha256Bytes(recheck.raw) !== journal.preStateSha256) {
      console.error("Error: continuity-authority-revision-recover refused (AR-RECOVERY-PREIMAGE-DRIFT); recovery journal retained.");
      return 2;
    }

    // PX0-AC-06: the ONE fresh binding check recovery performs before completing forward --
    // the frozen intent's own expiry against the injected clock. No candidate re-derivation,
    // no re-check of AR-DECISION-SCOPE or any other buildAuthorityRevisionPlan check. If the
    // decision's approval window has since lapsed, do not complete the write; retire the
    // journal and report a genuine preimage-recovery outcome instead. `expiresAt === null`
    // is F2's legacy-`.v1`-journal sentinel (no expiry was ever frozen for it to check
    // against) -- treated as always still valid, never taking this branch.
    const nowIso = (deps.now ?? (() => new Date().toISOString()))();
    if (journal.expiresAt !== null && !(Date.parse(journal.expiresAt) > Date.parse(nowIso))) {
      const expiredPaths = authorityRevisionPrivatePaths(dir, deps);
      if (!retireAuthorityRevisionJournal(expiredPaths)) {
        console.error("Error: continuity-authority-revision-recover refused (AR-JOURNAL-RETIREMENT-UNRESOLVED); recovery journal retained.");
        return 2;
      }
      // F4/courseDecisionReceipts convention (see buildAuthorityRevisionPlan above):
      // `casOutcome` is the typed, closed enum {applied, stale, conflict, io-error} --
      // "applied" means the CAS write landed (postRevision advanced from preRevision).
      // On THIS branch it never did: State stays exactly at the preimage (no
      // atomicWriteContinuityState call happens here), so echoing the frozen
      // `journal.receipt` unmodified -- whose `casOutcome` was fixed to "applied" at
      // apply-build time under the opposite assumption -- would contradict this same
      // response's own `status: "recovered-preimage"` / `mutated: false`. The frozen
      // journal object itself (and the durable receipt an eventual successful apply/
      // recover would splice into State) is left untouched -- only this one echoed,
      // non-durable CLI response gets a shallow-copied receipt with the outcome
      // corrected to "stale": the decision's approval window aged out before the CAS
      // could complete, which is exactly the courseDecisionReceipts sense of "stale"
      // (an expired precondition, not a concurrent-state "conflict" or an "io-error").
      const staleReceipt = { ...journal.receipt, casOutcome: "stale" };
      console.log(JSON.stringify({ schema: AUTHORITY_REVISION_RECOVER_SCHEMA, status: "recovered-preimage", retained: false, mutated: false, receipt: staleReceipt }, null, 2));
      return 0;
    }

    // Preimage confirmed byte-identical to the frozen journal's own preimage, and the
    // decision's approval window is still valid -- then replays the frozen postimage bytes
    // exactly as journaled. No plan re-derivation, no new candidate.
    let postState;
    try { postState = JSON.parse(Buffer.from(journal.postStateBase64, "base64").toString("utf8")); }
    catch { console.error("Error: continuity-authority-revision-recover refused (AR-JOURNAL); recovery journal retained."); return 2; }

    // F6: the journal's MAC privately seals `postStateBase64`'s own bytes, but the PRD/
    // Spec artifact FILES it references are never sealed by that MAC -- only their frozen
    // digest is, inside `postState.continuity.authority`. Between the interrupted apply
    // that froze this journal and this recovery run completing it forward, those files
    // could have been mutated out-of-band (a stray edit, a checkout, a bug) without
    // touching State at all. Blindly replaying `postState` would then certify a State
    // authority binding that no longer matches what is actually on disk. Same
    // `physicalRebindFile`-based re-validation `buildAuthorityRevisionPlan` performs at
    // build time (AR-NEXT-AUTHORITY-STALE), re-run here fresh, immediately before the
    // write completes -- never trusting the frozen digest alone.
    const postPrd = physicalRebindFile(dir, postState?.continuity?.authority?.prd?.path);
    const postSpec = physicalRebindFile(dir, postState?.continuity?.authority?.spec?.path);
    if (postPrd === null || postSpec === null
      || postPrd.sha256 !== postState?.continuity?.authority?.prd?.sha256
      || postSpec.sha256 !== postState?.continuity?.authority?.spec?.sha256) {
      console.error("Error: continuity-authority-revision-recover refused (AR-RECOVER-ARTIFACT-STALE); recovery journal retained.");
      return 2;
    }

    const written = atomicWriteContinuityState(dir, postState, lock, deps);
    if (!written.ok) { console.error(`Error: continuity-authority-revision-recover refused (${written.code}); recovery journal retained.`); return 2; }
    const persisted = readStateRaw(dir);
    if (persisted.status !== "ok" || sha256Bytes(persisted.raw) !== journal.postStateSha256) {
      console.error("Error: continuity-authority-revision-recover refused (AR-POSTIMAGE-READBACK); recovery journal retained.");
      return 2;
    }
    const paths = authorityRevisionPrivatePaths(dir, deps);
    if (!retireAuthorityRevisionJournal(paths)) {
      console.error("Error: continuity-authority-revision-recover committed but journal retirement is unresolved; recovery journal retained.");
      return 2;
    }
    console.log(JSON.stringify({ schema: AUTHORITY_REVISION_RECOVER_SCHEMA, status: "recovered-postimage", retained: false, mutated: true, receipt: journal.receipt }, null, 2));
    return 0;
  } finally { releaseContinuityLock(lock); }
}

function runAuthorityRevisionCommand(sub, rest, deps) {
  const dir = deps.dir;
  const now = deps.now ?? (() => new Date().toISOString());
  const boundDeps = { ...deps, now };
  if (sub === "continuity-authority-revision-plan") return runAuthorityRevisionPlanCommand(dir, rest, boundDeps);
  if (sub === "continuity-authority-revision-recover") return runAuthorityRevisionRecoverCommand(dir, rest, boundDeps);
  return runAuthorityRevisionApplyCommand(dir, rest, boundDeps);
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
    // The injectable writer used by crash tests is not itself a durability
    // boundary.  Sync the descriptor here, immediately before publication.
    fsyncSync(fd);
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

function resultBootstrapEligible(state, prd, spec) {
  const continuity = state?.continuity;
  const lifecycle = derivePlanLifecycle(state, { planSha256: prd.sha256, specSha256: spec.sha256 });
  return Boolean(state?.activeFeature && lifecycle.ok && lifecycle.status === "implementing"
    && validateContinuityState(continuity, state.activeFeature.id).ok
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
  if (existing.status !== "ok" || !canonicalIso(updatedAt)) return { ok: false, code: "PS-RESULT-BOOTSTRAP-STATE" };
  const state = existing.state;
  const authority = state?.continuity?.authority;
  const prd = physicalRebindFile(dir, authority?.prd?.path);
  const spec = physicalRebindFile(dir, authority?.spec?.path);
  if (prd === null || spec === null || prd.sha256 !== authority?.prd?.sha256 || spec.sha256 !== authority?.spec?.sha256) return { ok: false, code: "PS-RESULT-BOOTSTRAP-AUTHORITY" };
  if (!resultBootstrapEligible(state, prd, spec)) return { ok: false, code: "PS-RESULT-BOOTSTRAP-STATE" };
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

function bootstrapPrivateDirectorySecure(path, info, deps) {
  const platform = deps.platform ?? process.platform;
  const assessWindowsPrivate = deps.assessWindowsPrivate ?? assessWindowsPrivatePath;
  return platform === "win32" ? assessWindowsPrivate(path).status === "secure" : (info.mode & 0o077) === 0;
}

function ensureBootstrapPrivateDirectory(paths, deps = {}) {
  if (paths === null) return false;
  try {
    for (const path of [paths.namespace, paths.base]) {
      if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path) return false;
      if (!bootstrapPrivateDirectorySecure(path, info, deps)) return false;
    }
    return true;
  } catch { return false; }
}

function observeBootstrapPrivateDirectory(paths, deps = {}) {
  if (paths === null) return false;
  try {
    for (const path of [paths.namespace, paths.base]) {
      if (!existsSync(path)) continue;
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path) return false;
      if (!bootstrapPrivateDirectorySecure(path, info, deps)) return false;
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

function readPrivateBootstrap(path, deps = {}) {
  const platform = deps.platform ?? process.platform;
  const assessWindowsPrivate = deps.assessWindowsPrivate ?? assessWindowsPrivatePath;
  try {
    const s = lstatSync(path);
    if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) return null;
    const secure = platform === "win32" ? assessWindowsPrivate(path).status === "secure" : (s.mode & 0o077) === 0;
    return secure ? readFileSync(path) : null;
  } catch { return null; }
}

function bootstrapJournalMac(key, record) { return createHmac("sha256", key).update(JSON.stringify(record)).digest("hex"); }

function loadBootstrapJournal(dir, deps = {}) {
  const paths = resultBootstrapPrivatePaths(dir, deps);
  if (paths === null || !observeBootstrapPrivateDirectory(paths, deps)) return { ok: false, code: "PS-RESULT-BOOTSTRAP-GIT-COMMON-DIR" };
  const key = readPrivateBootstrap(paths.key, deps);
  const raw = readPrivateBootstrap(paths.journal, deps);
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
  if (!ensureBootstrapPrivateDirectory(paths, deps)) return false;
  let key = readPrivateBootstrap(paths.key, deps);
  if (key === null) { key = randomBytes(32); if (!writePrivateBootstrap(paths.key, key)) return false; }
  if (key.byteLength !== 32) return false;
  const core = { schema: RESULT_BOOTSTRAP_JOURNAL_SCHEMA, planSha256: plan.planSha256, stateSha256: plan.payload.preimage.stateSha256, postStateSha256: plan.payload.postimage.stateSha256, result: { path: plan.payload.result.path, sha256: plan.payload.result.sha256 } };
  const bytes = Buffer.from(JSON.stringify({ ...core, mac: bootstrapJournalMac(key, core) }) + "\n", "utf8");
  return writePrivateBootstrap(paths.journal, bytes, false);
}

function retireBootstrapJournal(paths, deps = {}) {
  try { return ensureBootstrapPrivateDirectory(paths, deps) && (unlinkSync(paths.journal), syncDirectory(paths.base).ok); } catch { return false; }
}

function parseResultBootstrapApply(argv) {
  if (argv.length !== 13 || argv[0] !== "--feature-id" || isBlank(argv[1]) || argv[2] !== "--expected-revision" || !parseExpectedRevision(argv[3]).ok
    || argv[4] !== "--expected-state-sha256" || !SHA256_RE.test(argv[5]) || argv[6] !== "--expected-post-state-sha256" || !SHA256_RE.test(argv[7])
    || argv[8] !== "--updated-at" || !canonicalIso(argv[9]) || argv[10] !== "--plan-sha256" || !SHA256_RE.test(argv[11]) || argv[12] !== "--activate") return null;
  return { featureId: argv[1], expectedRevision: parseExpectedRevision(argv[3]).value, expectedStateSha256: argv[5], expectedPostStateSha256: argv[7], updatedAt: argv[9], planSha256: argv[11] };
}

function featureClosureProgress(nextAction) {
  return {
    scope: "feature-closure",
    state: "in-progress",
    nextAction,
    workflowTerminal: false,
  };
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
    const prd = physicalRebindFile(deps.dir, current.state.continuity?.authority?.prd?.path);
    const spec = physicalRebindFile(deps.dir, current.state.continuity?.authority?.spec?.path);
    if (sha256Bytes(current.raw) === apply.expectedPostStateSha256) {
      if (prd === null || spec === null
        || !resultBootstrapEligible({ ...current.state, continuity: { ...current.state.continuity, authority: { ...current.state.continuity.authority, result: null }, revision: current.state.continuity.revision - 1, resume: { ...current.state.continuity.resume, sourceRevision: current.state.continuity.revision - 1 } } }, prd, spec)
        || current.state.activeFeature.id !== apply.featureId || current.state.updatedAt !== apply.updatedAt || current.state.continuity.authority.result?.path !== resultPath
        || resultObserved === null || resultObserved.sha256 !== current.state.continuity.authority.result.sha256) { console.error("Error: Result bootstrap replay postimage is invalid; zero mutation."); return 2; }
      if (journal.journal !== null && (journal.journal.planSha256 !== apply.planSha256 || !retireBootstrapJournal(journal.paths, deps))) { console.error("Error: Result bootstrap journal recovery is unresolved."); return 2; }
      console.log(JSON.stringify({ schema: RESULT_BOOTSTRAP_APPLY_SCHEMA, status: "replayed", featureId: apply.featureId, revision: current.state.continuity.revision, stateSha256: apply.expectedPostStateSha256, result: current.state.continuity.authority.result, mutated: false, completion: featureClosureProgress("review") })); return 0;
    }
    // A durable Result may legitimately exist while State is still at the exact
    // preimage.  The authenticated journal is the only authority that may resume
    // that Result-before-State window; rebuilding an "absent Result" plan would
    // correctly refuse and must not turn recovery into a false conflict.
    if (!planned.ok && journal.journal !== null && sha256Bytes(current.raw) === apply.expectedStateSha256
      && prd !== null && spec !== null && resultBootstrapEligible(current.state, prd, spec) && current.state.activeFeature.id === apply.featureId
      && current.state.continuity.revision === apply.expectedRevision && resultObserved !== null
      && resultObserved.sha256 === journal.journal.result.sha256
      && journal.journal.planSha256 === apply.planSha256 && journal.journal.stateSha256 === apply.expectedStateSha256
      && journal.journal.postStateSha256 === apply.expectedPostStateSha256) {
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
    if (!recovered.ok || recovered.journal === null || recovered.journal.planSha256 !== apply.planSha256 || !retireBootstrapJournal(recovered.paths, deps)) { console.error("Error: Result bootstrap journal retirement is unresolved."); return 2; }
    console.log(JSON.stringify({ schema: RESULT_BOOTSTRAP_APPLY_SCHEMA, status: "applied", featureId: apply.featureId, revision: persisted.state.continuity.revision, stateSha256: apply.expectedPostStateSha256, result: persisted.state.continuity.authority.result, mutated: true, completion: featureClosureProgress("review") })); return 0;
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
        completion: featureClosureProgress("close"),
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
      completion: featureClosureProgress("close"),
    }));
    return 0;
  } finally {
    releaseContinuityLock(lock);
  }
}

// ---- AC-047-28: deliberately narrow stale PRD-marker / PO authority rebind ----

const PO_REBIND_PLAN_SCHEMA = "pipeline.po-authority-rebind-plan.v1";
const PO_ACK_PLAN_SCHEMA = "pipeline.po-authority-acknowledge-plan.v1";
const PO_ACK_APPLY_SCHEMA = "pipeline.po-authority-acknowledge-apply.v1";
const PO_DECISION_PLAN_SCHEMA = "pipeline.po-authority-decision-plan.v1";
const PO_DECISION_SELECTION_SCHEMA = "pipeline.po-authority-selection.v1";
const PO_REBIND_LOCK_TOKEN = "pipeline-po-authority-rebind-v1";
const PO_REBIND_TXN_SCHEMA = "pipeline.po-authority-rebind-transaction.v1";
const PO_REBIND_RUNNERS = new Set(["claude", "codex", "antigravity"]);
const TECHNICAL_SPEC_MARKER_RE = /^<!-- technical-spec-sha256: ([a-f0-9]{64}) -->$/gmu;
const PO_LANGUAGE_MARKER_RE = /^<!-- po-language: ([a-z]{2}) -->$/gmu;
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
  if (!exactObjectKeys(authority, authorityKeys)
    || authority.schema !== "pipeline.po-gate-authority.v2" || authority.planPath !== state.activeFeature?.planPath
    || authority.planSha256 !== prd.sha256 || authority.specPath !== spec.path
    || !SHA256_RE.test(authority.specSha256) || !profile?.ok) return null;
  const profileValue = profile.value;
  if (!profileValue || authority.humanFacing !== profileValue.humanFacing
    || authority.sourceSha256 !== profileValue.sourceSha256 || authority.runtimeSha256 !== profileValue.runtimeSha256
    || authority.receiptSha256 !== profileValue.receiptSha256 || authority.repositoryFingerprint !== profileValue.repositoryFingerprint) return null;
  if (exactObjectKeys(approval, approvalKeys) && approval.schema === "pipeline.plan-approval.v2"
    && !isBlank(approval.approvedBy) && !isBlank(approval.specBoundBy)
    && canonicalIso(approval.approvedAt) && canonicalIso(approval.specBoundAt)) return authority;
  // v4-schema fallback (mirrors validPriorAuthority's dual-handling, ~line 4786):
  // the v4 planApproval carries no specBoundBy/specBoundAt of its own -- its
  // authority binding is validated via the submission it was approved against.
  const submission = state?.planSubmission;
  if (!validCurrentPlanApproval(approval) || !validPlanSubmission(submission)
    || approval.submissionSha256 !== sha256CanonicalJson(submission)
    || approval.profileSha256 !== submission.profileSha256
    || submission.featureId !== state.activeFeature?.id
    || submission.planPath !== authority.planPath || submission.planSha256 !== authority.planSha256
    || submission.specPath !== authority.specPath || submission.specSha256 !== authority.specSha256) return null;
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
  return languages.length === 1 && languages[0] === (state.continuity?.runtime?.documentLanguage ?? profile.humanFacing);
}

function validPriorAuthority(state, prd, spec) {
  const approval = state?.planApproval;
  const authority = approval?.poGateAuthority;
  const approvalKeys = ["schema", "approvedBy", "approvedAt", "specBoundBy", "specBoundAt", "poGateAuthority"];
  const authorityKeys = ["schema","humanFacing","sourceSha256","runtimeSha256","receiptSha256","repositoryFingerprint","planPath","planSha256","specPath","specSha256"];
  if (!exactObjectKeys(authority, authorityKeys)
    || authority.schema !== "pipeline.po-gate-authority.v2"
    || authority.planPath !== prd.path || authority.specPath !== spec.path
    || !SHA256_RE.test(authority.planSha256) || !SHA256_RE.test(authority.specSha256)
    || !new Set(["de", "en"]).has(authority.humanFacing)
    || !SHA256_RE.test(authority.sourceSha256)
    || !SHA256_RE.test(authority.runtimeSha256)
    || !SHA256_RE.test(authority.receiptSha256)
    || !SHA256_RE.test(authority.repositoryFingerprint)) return null;
  if (exactObjectKeys(approval, approvalKeys)
    && approval.schema === "pipeline.plan-approval.v2"
    && !isBlank(approval.approvedBy) && !isBlank(approval.specBoundBy)
    && canonicalIso(approval.approvedAt) && canonicalIso(approval.specBoundAt)) return authority;
  const submission = state?.planSubmission;
  if (!validCurrentPlanApproval(approval) || !validPlanSubmission(submission)
    || approval.submissionSha256 !== sha256CanonicalJson(submission)
    || approval.profileSha256 !== submission.profileSha256
    || submission.featureId !== state.activeFeature?.id
    || submission.planPath !== authority.planPath || submission.planSha256 !== authority.planSha256
    || submission.specPath !== authority.specPath || submission.specSha256 !== authority.specSha256) return null;
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
  const v4Approval = state.planApproval?.schema === "pipeline.plan-approval.v4";
  const reopened = v4Approval
    ? reopenPlanDesign({ state, expectedStateSha256: sha256CanonicalJson(state), by: "PO", at: plannedAt })
    : null;
  if (v4Approval && (!reopened?.ok || reopened.replay)) return { ok: false, code: "PO-DECISION-PRIOR-AUTHORITY" };
  const nextState = v4Approval ? structuredClone(reopened.state) : structuredClone(state);
  nextState.activeFeature.phase = "design";
  if (!v4Approval) {
    nextState.planApproval.specBoundAt = plannedAt;
    nextState.planApproval.poGateAuthority = nextAuthority;
  }
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
  const stateSha256 = sha256Bytes(existing.raw);
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
  const v4Approval = state.planApproval?.schema === "pipeline.plan-approval.v4";
  const reopened = v4Approval
    ? reopenPlanDesign({ state, expectedStateSha256: sha256CanonicalJson(state), by: "PO", at: plannedAt })
    : null;
  if (v4Approval && (!reopened?.ok || reopened.replay)) return { ok: false, code: "PO-DECISION-PRIOR-AUTHORITY" };
  const nextState = v4Approval ? structuredClone(reopened.state) : structuredClone(state);
  nextState.activeFeature.phase = "design";
  if (!v4Approval) {
    nextState.planApproval.specBoundAt = plannedAt;
    nextState.planApproval.poGateAuthority = nextAuthority;
  }
  nextState.continuity = nextContinuity;
  nextState.updatedAt = plannedAt;
  if (nextState.gateEstimate !== undefined) return { ok: false, code: "PO-DECISION-STATE" };
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

/**
 * `--runner claude|codex` is optional and, unlike planSha256/plannedAt, is
 * never part of the CAS/transaction digest tuple: it only tells this apply
 * which lifecycle the in-transaction V4 readback observes (ADR-0051 class),
 * never what the recovery writes. Absent, the caller falls back to its own
 * CLI-entry-boundary environment read (mirrors worktree-create.mjs); present,
 * an invalid value fails closed here rather than silently defaulting.
 */
function parsePoRebindApply(argv) {
  if (argv.length !== 5 && argv.length !== 7) return null;
  if (argv[0] !== "--plan-sha256" || !SHA256_RE.test(argv[1])
    || argv[2] !== "--updated-at" || !canonicalIso(argv[3]) || argv[4] !== "--activate") return null;
  if (argv.length === 5) return { planSha256: argv[1], plannedAt: argv[3] };
  if (argv[5] !== "--runner" || !PO_REBIND_RUNNERS.has(argv[6])) return null;
  return { planSha256: argv[1], plannedAt: argv[3], runner: argv[6] };
}

// Dedicated to po-authority-acknowledge-apply (Critic finding F1, 2026-08-19):
// parsePoRebindApply() above is shared with rebind-apply/decision-apply,
// neither of which take --by; adding it there would loosen those two
// unrelated commands. --by must match exactly what po-authority-acknowledge-
// plan recorded -- enforced structurally, not by a separate comparison: `by`
// is part of the hashed plan payload (see buildPoAuthorityAcknowledgePlan),
// so a mismatched --by here makes the recomputed planSha256 disagree with
// the caller-supplied one, and the existing stale-plan refusal in
// runPoAuthorityRebindApply() catches it -- the same mechanism every other
// preimage/postimage field already relies on.
function parsePoAcknowledgeApply(argv) {
  if (argv.length !== 7 && argv.length !== 9) return null;
  if (argv[0] !== "--plan-sha256" || !SHA256_RE.test(argv[1])
    || argv[2] !== "--updated-at" || !canonicalIso(argv[3])
    || argv[4] !== "--by" || isBlank(argv[5])
    || argv[6] !== "--activate") return null;
  if (argv.length === 7) return { planSha256: argv[1], plannedAt: argv[3], by: argv[5] };
  if (argv[7] !== "--runner" || !PO_REBIND_RUNNERS.has(argv[8])) return null;
  return { planSha256: argv[1], plannedAt: argv[3], by: argv[5], runner: argv[8] };
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

/**
 * Resolve the invoking runner for the rebind-apply recovery (ADR-0051 class)
 * at this CLI entry boundary: an explicit --runner (already validated by
 * parsePoRebindApply) always wins; absent one, the ambient CLAUDECODE marker
 * is the legitimate source here, mirroring worktree-create.mjs's
 * resolveRunner. The in-transaction V4 inspection itself never reads the
 * environment -- it only receives this already-resolved value.
 */
function resolvePoRebindRunner(explicitRunner, env) {
  return explicitRunner ?? (env.CLAUDECODE === "1" ? "claude" : (env.ANTIGRAVITY_AGENT === "1" || env.AI_AGENT === "antigravity") ? "antigravity" : "codex");
}

// ---- NVA-W4-2B: atomic PO-plan-acknowledgement without PRD mutation ----
//
// A kickoff promotion binds the PRD's bytes (continuity.authority.prd) before
// submit-plan is ever reached; guard-lifecycle-ready.mjs's
// protectedAuthorityDocumentWriteOnly() then refuses any direct edit to that
// bound file. If the PRD never carried PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER
// before it was bound (onboarding-continuity.mjs's promotionArtifacts() now
// refuses a NEW promotion in that state, but a PRD promoted before that check
// existed, or bound by any other route, has no way back), the PO plan gate's
// requireAcknowledgement precondition can never be satisfied and the feature
// is stuck. This gives that PRD the same shape of sanctioned, transactional,
// lock-and-journal-protected route the Spec-drift rebind above already has --
// deliberately built ON that machinery (physicalRebindFile, writeRebindFile,
// publishRebindTransaction/recoverRebindTransaction/clearRebindTransaction,
// PO_REBIND_LOCK_TOKEN, rebindTransactionPath, runPoAuthorityRebindApply), never
// a second copy of it. The marker itself carries no computed value (ADR-0061
// Decision 3), so unlike the Spec digest there is nothing to REPLACE -- this
// only ever INSERTS the one sanctioned literal line, once. Deliberately does
// NOT merge with approve-plan or touch activeFeature.phase/planApproval: this
// stays a narrow, additive fix for exactly the acknowledgement marker, mirroring
// the rebind/decision family's own "one concern per route" shape.
//
// CORRECTED 2026-08-19 (Critic finding F1, dispatch W4-CRITIC-2B): unlike
// rebind-apply/decision-apply, this route DOES insert the marker itself --
// it runs exactly when the marker is NOT already present (see the refusal at
// PO-ACK-ALREADY-ACKNOWLEDGED below) and writes it on the caller's behalf.
// The marker text is therefore no longer sufficient proof of PO authorship by
// itself; this route REQUIRES an explicit `--by <name>` at plan time,
// recorded in the plan payload and covered by planSha256's digest (so the
// apply step cannot silently apply a plan attributed to someone else). This
// is not a cryptographic proof -- it is the same attribution discipline
// close-feature/approve-push already use -- and an agent must still only
// call this route after the PO has actually reviewed the content and named
// themself; the attribution field exists so that instruction is recorded,
// not merely trusted.
function eligibleAcknowledgeContinuity(state, prd, spec) {
  const continuity = state?.continuity;
  if (!continuity || !validateContinuityState(continuity, state.activeFeature?.id).ok
    || continuity.authority.prd.path !== prd.path || continuity.authority.spec.path !== spec.path
    || continuity.authority.prd.sha256 !== prd.sha256 || continuity.authority.spec.sha256 !== spec.sha256
    || continuity.queueHead?.dispatch !== null || continuity.blocker !== null
    || continuity.decisionTxn !== null || continuity.closeTransition != null
    || continuity.revision === Number.MAX_SAFE_INTEGER) return null;
  return continuity;
}

/**
 * Appends PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER as its own trailing line. Returns
 * null on non-UTF-8 bytes or when the marker is already present -- the caller
 * must already have refused that case, but insertion stays defensive rather
 * than ever risking a silent duplicate.
 */
function appendAcknowledgementMarker(prdBytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(prdBytes); } catch { return null; }
  if ([...text.matchAll(PRD_ACKNOWLEDGEMENT_MARKER)].length !== 0) return null;
  const trimmed = text.replace(/\n+$/u, "");
  const separator = trimmed.length === 0 ? "" : "\n\n";
  const nextBytes = Buffer.from(`${trimmed}${separator}${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n`, "utf8");
  let confirm;
  try { confirm = new TextDecoder("utf-8", { fatal: true }).decode(nextBytes); } catch { return null; }
  return [...confirm.matchAll(PRD_ACKNOWLEDGEMENT_MARKER)].length === 1 ? nextBytes : null;
}

// `by` travels via `deps.acknowledgeBy`, never as a positional parameter:
// this function is invoked through the SAME generic `buildPlan(dir, deps,
// existing, plannedAt)` call shape runPoAuthorityRebindApply() shares across
// rebind/decision/acknowledge (pipeline-state.mjs ~4845/4853) -- adding a
// positional `by` here would silently misalign those two other callers'
// `plannedAt` argument instead of failing loudly. Routing it through `deps`
// (already threaded uniformly to every buildPlan call) keeps the shared
// signature intact.
function buildPoAuthorityAcknowledgePlan(dir, deps, existing, plannedAt = deps.now?.() ?? new Date().toISOString()) {
  const by = deps.acknowledgeBy;
  if (isBlank(by)) return { ok: false, code: "PO-ACK-BY-REQUIRED" };
  if (existing.status !== "ok" || !existing.state) return { ok: false, code: "PO-ACK-STATE" };
  const state = existing.state;
  if (state.schema !== SCHEMA_ID || !state.activeFeature || typeof state.activeFeature.planPath !== "string"
    || state.planApproved === true || state.planSubmission != null) return { ok: false, code: "PO-ACK-STATE" };
  const prd = physicalRebindFile(dir, state.activeFeature.planPath);
  if (prd === null) return { ok: false, code: "PO-ACK-PRD-IDENTITY" };
  const stateFile = physicalRebindFile(dir, stateRelativePath(dir));
  if (stateFile === null || stateFile.sha256 !== sha256Bytes(existing.raw)) return { ok: false, code: "PO-ACK-STATE-IDENTITY" };
  const specPath = `${dirname(state.activeFeature.planPath).split(sep).join("/")}/spec.md`;
  const spec = physicalRebindFile(dir, specPath);
  if (spec === null) return { ok: false, code: "PO-ACK-SPEC-IDENTITY" };
  let prdText;
  try { prdText = new TextDecoder("utf-8", { fatal: true }).decode(prd.bytes); } catch { return { ok: false, code: "PO-ACK-PRD-MARKER" }; }
  const acknowledgementMarkers = [...prdText.matchAll(PRD_ACKNOWLEDGEMENT_MARKER)];
  if (acknowledgementMarkers.length > 1) return { ok: false, code: "PO-ACK-MARKER-DUPLICATE" };
  if (acknowledgementMarkers.length === 1) return { ok: false, code: "PO-ACK-ALREADY-ACKNOWLEDGED" };
  const continuity = eligibleAcknowledgeContinuity(state, prd, spec);
  if (continuity === null) return { ok: false, code: "PO-ACK-CONTINUITY" };
  const profile = (deps.poGateProfile ?? ((request) => validatePoGateProfileForRepository(request)))({ repoRoot: dir });
  const currentProfile = validCurrentPoProfile(profile);
  if (currentProfile === null) return { ok: false, code: "PO-ACK-PROFILE" };
  const nextPrdBytes = appendAcknowledgementMarker(prd.bytes);
  if (nextPrdBytes === null) return { ok: false, code: "PO-ACK-PRD-MARKER" };
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
  if (!canonicalIso(plannedAt)) return { ok: false, code: "PO-ACK-TIMESTAMP" };
  const nextContinuity = structuredClone(continuity);
  nextContinuity.revision += 1;
  nextContinuity.authority.prd.sha256 = nextPrdSha256;
  if (!validateContinuityState(nextContinuity, state.activeFeature.id).ok) return { ok: false, code: "PO-ACK-CONTINUITY" };
  const nextState = structuredClone(state);
  nextState.continuity = nextContinuity;
  nextState.updatedAt = plannedAt;
  // Critic finding F-A, 2026-08-19 (dispatch W4-CRITIC-2B round 2): --by was
  // required and digest-bound (round-1 fix) but never reached a persisted
  // artifact -- accepted at the CLI, then discarded. `planApproval` (the
  // sibling attribution field for approve-plan/bind-plan-spec) is not
  // reusable here: it does not exist yet at acknowledgement time (this route
  // refuses if state.planApproved === true) and its own exactObjectKeys
  // validator is closed to a fixed key set that predates this route. A new,
  // separate top-level field records it durably instead -- `state` itself
  // carries no exact-keys validator in this file (confirmed: only
  // `state.schema` is checked at each call site, never the full key set),
  // so this is additive, not a schema change to anything already validated.
  nextState.poGateAcknowledgement = { by, at: plannedAt };
  if (nextState.gateEstimate !== undefined) return { ok: false, code: "PO-ACK-STATE" };
  const payload = {
    schema: PO_ACK_PLAN_SCHEMA,
    root: realpathSync(resolve(dir)),
    by,
    plannedAt,
    preimage: {
      state: { sha256: sha256Bytes(existing.raw), identity: stateFile.identity, updatedAt: state.updatedAt ?? null, continuityRevision: continuity.revision },
      prd: { path: prd.path, sha256: prd.sha256, identity: prd.identity },
      spec: { path: spec.path, sha256: spec.sha256, identity: spec.identity },
      continuityAuthority: continuity.authority,
    },
    postimage: {
      prd: { path: prd.path, sha256: nextPrdSha256 },
      state: { sha256: sha256Bytes(JSON.stringify(nextState, null, 2) + "\n"), updatedAt: nextState.updatedAt, continuityRevision: nextContinuity.revision },
      poGateAuthority: nextAuthority,
      continuityAuthority: nextContinuity.authority,
    },
    assurance: { regularFilesOnly: true, linksRejected: true },
  };
  return { ok: true, payload, planSha256: sha256CanonicalJson(payload), nextPrdBytes, nextState };
}

function runPoAuthorityAcknowledgeCommand(sub, rest, deps) {
  const planBy = sub === "po-authority-acknowledge-plan"
    ? (rest.length === 2 && rest[0] === "--by" && !isBlank(rest[1]) ? rest[1] : null)
    : null;
  if (sub === "po-authority-acknowledge-plan" && planBy === null) {
    console.error("Error: PO authority acknowledge plan requires --by <name> (non-empty) -- an unattributed acknowledgement is refused.");
    return 2;
  }
  const apply = sub === "po-authority-acknowledge-apply" ? parsePoAcknowledgeApply(rest) : null;
  if (sub === "po-authority-acknowledge-apply" && apply === null) { console.error("Error: PO authority acknowledge apply requires --plan-sha256 <sha256> --updated-at <ISO-8601> --by <name> --activate [--runner claude|codex]."); return 2; }
  if (sub === "po-authority-acknowledge-plan" && existsSync(rebindTransactionPath(deps.dir))) {
    console.error("Error: PO authority acknowledge recovery is pending; replay the exact previously confirmed apply action.");
    return 2;
  }
  if (sub === "po-authority-acknowledge-apply") {
    // AGY-PRDGATE-1 (docs/adr/0021-prd-po-gate.md addendum; ADR-0061 Decision 2:
    // a new gate must not invent its own ritual). This is an ORDINARY command a
    // ready agent session could otherwise run itself, with --by supplied only by
    // the agent's own claim about what the PO said in chat -- exactly the
    // "gate held != gate fulfilled" risk ADR-0021's R-M14 addendum named but
    // never mechanically enforced. No mode branching: unlike approve-push there
    // is no signature/chat alternative for this gate, so the ceremony applies
    // unconditionally. Stateless, single-call design (mirrors
    // project-onboarding-v3.mjs's kickoff --language/--profile gate,
    // AGY-CHATADAPTER-2) rather than approve-push's persisted
    // pendingPushChallenge: ADR-0061 Decision 1 forbids "a hash pasted from one
    // output into another input", which rules out planSha256 as the confirmed
    // value; --by is already the value the PO must personally attest to, so
    // there is nothing to generate and no state to hold between calls. Placed
    // as the first statement in this branch, before the lock/transaction below,
    // so an unattended or mismatched attempt touches no lock and no rebind
    // transaction file.
    const confirmation = requireAttendedChatGateConfirmation({
      summaryLines: [
        "PO PLAN ACKNOWLEDGEMENT CONFIRMATION -- read before you type the value:",
        `  by: ${apply.by}`,
        `  plan-sha256: ${apply.planSha256}`,
        `  updated-at: ${apply.plannedAt}`,
      ],
      expected: apply.by,
      dependencies: deps,
    });
    if (!confirmation.ok) {
      if (confirmation.code === "CHAT-GATE-NOT-ATTENDED") {
        console.error(`Error: po-authority-acknowledge-apply refused (CHAT-GATE-NOT-ATTENDED); a human must confirm --by ${apply.by} directly, in their own attended terminal -- an agent's own tool call cannot complete this step.`);
        console.error("Re-run this EXACT command yourself and type the value shown above when prompted:");
        console.error(`node plugins/pipeline-core/scripts/pipeline-state.mjs po-authority-acknowledge-apply --plan-sha256 ${apply.planSha256} --updated-at ${apply.plannedAt} --by ${JSON.stringify(apply.by)} --activate${apply.runner ? ` --runner ${apply.runner}` : ""}`);
      } else {
        console.error(`Error: po-authority-acknowledge-apply refused (${confirmation.code}); the typed value did not match --by ${apply.by}.`);
      }
      return 1;
    }
    const runner = resolvePoRebindRunner(apply.runner, deps.env ?? process.env);
    const ackDeps = { ...deps, acknowledgeBy: apply.by };
    const lock = acquireContinuityLock(ackDeps.dir, PO_REBIND_LOCK_TOKEN, ackDeps);
    if (!lock.ok) { console.error(`Error: PO authority acknowledge refused (${lock.code}); zero mutation.`); return 2; }
    try {
      const io = { replace: ackDeps.replaceRebindPrdFdContents ?? ((fd, bytes) => { ftruncateSync(fd, 0); let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset); fsyncSync(fd); }), rename: ackDeps.renameRebindPrd ?? renameSync, sync: ackDeps.syncRebindDirectory ?? syncDirectory };
      const stateIo = { replace: ackDeps.replaceRebindStateFdContents ?? io.replace, rename: ackDeps.renameRebindState ?? renameSync, sync: ackDeps.syncRebindDirectory ?? syncDirectory };
      const recovered = recoverRebindTransaction(ackDeps.dir, apply.planSha256, lock.ownerNonce, io, stateIo);
      if (!recovered.ok) { console.error(`Error: PO authority acknowledge recovery refused (${recovered.code}); zero new mutation.`); return 2; }
      if (recovered.kind === "rolled-back") { console.error("Error: PO authority acknowledge recovered its interrupted transaction; regenerate and confirm a new plan."); return 2; }
      return runPoAuthorityRebindApply(apply, ackDeps, lock, io, stateIo, {
        buildPlan: buildPoAuthorityAcknowledgePlan,
        resultSchema: PO_ACK_APPLY_SCHEMA,
        resultCode: "PO-ACK-APPLIED",
        runner,
      });
    } finally { releaseContinuityLock(lock); }
  }
  const existing = readStateRaw(deps.dir);
  const ackDeps = { ...deps, acknowledgeBy: planBy };
  const planned = buildPoAuthorityAcknowledgePlan(ackDeps.dir, ackDeps, existing);
  if (!planned.ok) {
    console.error(`Error: PO authority acknowledge refused (${planned.code}); zero mutation.`);
    return 2;
  }
  console.log(JSON.stringify({ ...planned.payload, planSha256: planned.planSha256, applyAction: {
    executable: process.execPath,
    argv: [fileURLToPath(import.meta.url), "po-authority-acknowledge-apply", "--plan-sha256", planned.planSha256, "--updated-at", planned.payload.plannedAt, "--by", planBy, "--activate"],
    mutation: true, requiresConfirmation: true, requiresHostBoundary: true,
  } }, null, 2));
  return 0;
}

function runPoAuthorityRebindCommand(sub, rest, deps) {
  if (sub === "po-authority-rebind-plan" && rest.length !== 0) { console.error("Error: PO authority rebind plan takes no arguments."); return 2; }
  const apply = sub === "po-authority-rebind-apply" ? parsePoRebindApply(rest) : null;
  if (sub === "po-authority-rebind-apply" && apply === null) { console.error("Error: PO authority rebind apply requires --plan-sha256 <sha256> --updated-at <ISO-8601> --activate [--runner claude|codex]."); return 2; }
  if (sub === "po-authority-rebind-plan" && existsSync(rebindTransactionPath(deps.dir))) {
    console.error("Error: PO authority rebind recovery is pending; replay the exact previously confirmed apply action.");
    return 2;
  }
  if (sub === "po-authority-rebind-apply") {
    const runner = resolvePoRebindRunner(apply.runner, deps.env ?? process.env);
    const lock = acquireContinuityLock(deps.dir, PO_REBIND_LOCK_TOKEN, deps);
    if (!lock.ok) { console.error(`Error: PO authority rebind refused (${lock.code}); zero mutation.`); return 2; }
    try {
      const io = { replace: deps.replaceRebindPrdFdContents ?? ((fd, bytes) => { ftruncateSync(fd, 0); let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset); fsyncSync(fd); }), rename: deps.renameRebindPrd ?? renameSync, sync: deps.syncRebindDirectory ?? syncDirectory };
      const stateIo = { replace: deps.replaceRebindStateFdContents ?? io.replace, rename: deps.renameRebindState ?? renameSync, sync: deps.syncRebindDirectory ?? syncDirectory };
      const recovered = recoverRebindTransaction(deps.dir, apply.planSha256, lock.ownerNonce, io, stateIo);
      if (!recovered.ok) { console.error(`Error: PO authority rebind recovery refused (${recovered.code}); zero new mutation.`); return 2; }
      if (recovered.kind === "rolled-back") { console.error("Error: PO authority rebind recovered its interrupted transaction; regenerate and confirm a new plan."); return 2; }
      return runPoAuthorityRebindApply(apply, deps, lock, io, stateIo, { runner });
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
    // The decision-apply caller has no CLI-level --runner flag of its own
    // (parsePoDecisionApply never returns a `runner` field), so this mirrors
    // the rebind path's own absent-flag case exactly: resolvePoRebindRunner
    // falls through to the CLAUDECODE env marker, never to a literal default
    // here. This closes the residue tracked in backlog/items/2026-08-08-the-
    // authority-decision-apply-path-still-defaults-to-codex.md -- the in-
    // transaction V4 readback (bootstrap/session/dispatch) is runner-
    // dependent (sourceEnablesRunner admission, requiresNativeRuntimeReadback,
    // RUNNERS_WITHOUT_APP_SERVER) and gates the postimage readback that must
    // be `ready` for the apply to succeed, so an implicit Codex identity here
    // was reachable and consequential for a Claude-rooted project.
    const runner = resolvePoRebindRunner(apply.runner, deps.env ?? process.env);
    return runPoAuthorityRebindApply(apply, deps, lock, io, stateIo, {
      buildPlan: buildPoAuthorityDecisionPlan,
      resultSchema: "pipeline.po-authority-decision-apply.v1",
      resultCode: "PO-DECISION-APPLIED",
      runner,
    });
  } finally {
    releaseContinuityLock(lock);
  }
}

// Renders the failing predicate(s) from a
// pipeline.po-authority-postimage-readback.v1 evidence object for a stderr
// diagnostic. Only predicate names, sha256 digests, status codes and short
// fixed labels are emitted here -- never file contents, never absolute host
// paths (backlog/items/2026-08-28-a-fail-closed-rollback-names-no-predicate-
// so-a-consumer-cannot-fix-it.md), and never the readback's own diagnostic
// codes: PS53j (harness/scripts/pipeline-state.test.mjs, standing since
// 2026-08-01) forbids the readback payload from reaching the log. The
// diagnostic codes remain available in the structured evidence object
// (observeRebindPostimageEvidence) for machine consumers -- only this
// human-facing stderr rendering omits them.
function describeFailedPostimagePredicates(postimageEvidence) {
  const predicates = postimageEvidence?.predicates ?? {};
  const failures = [];
  if (predicates.prdDigest && predicates.prdDigest.ok !== true) {
    failures.push(`prdDigest (expected=${predicates.prdDigest.expected ?? "unknown"} observed=${predicates.prdDigest.observed ?? "unknown"})`);
  }
  if (predicates.stateFile && predicates.stateFile.ok !== true) {
    failures.push(`stateFile (expected=regular observed=${predicates.stateFile.observed ?? "unknown"})`);
  }
  if (predicates.stateValue && predicates.stateValue.ok !== true) {
    failures.push(`stateValue (expected=ok observed=${predicates.stateValue.observed ?? "unknown"})`);
  }
  if (predicates.poAuthority && predicates.poAuthority.ok !== true) {
    failures.push(`poAuthority (expected=ready observed=${predicates.poAuthority.observed ?? "unknown"})`);
  }
  for (const readback of predicates.v4Intents ?? []) {
    if (readback?.ok !== true) {
      failures.push(`v4Intents.${readback?.intent ?? "unknown"} (expected=ready observed=${readback?.status ?? "unknown"})`);
    }
  }
  return failures.length > 0 ? failures.join("; ") : "no failing predicate identified";
}

function runPoAuthorityRebindApply(apply, deps, lock, io, stateIo, {
  buildPlan = buildPoAuthorityRebindPlan,
  resultSchema = "pipeline.po-authority-rebind-apply.v1",
  resultCode = "PO-REBIND-APPLIED",
  // Both callers (po-authority-rebind-apply and po-authority-decision-apply)
  // now resolve this explicitly via resolvePoRebindRunner before reaching
  // here; there is no longer a caller that leaves this undefined so a
  // default two layers down (inspectProjectOnboardingV3's own "codex"
  // default) silently applies. See backlog/items/2026-08-08-the-authority-
  // decision-apply-path-still-defaults-to-codex.md.
  runner,
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
      .map((intent) => inspectV4({ rootDir: deps.dir, intent, runner, deps: inTransactionV4Deps }));
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
      const predicateSummary = describeFailedPostimagePredicates(postimageEvidence);
      console.error(`Error: PO authority rebind postimage readback failed (${predicateSummary}); ${stateRollback && prdRollback && cleared ? "rollback verified" : "rollback unresolved"}.`);
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

// ---- PHX-0 slice A: the READ-ONLY half of the #22 lifecycle writer family -----------------
/**
 * `feature-package-inspect|status|plan` (P-AC-08).
 *
 * These three open no file for writing, take no lock, touch neither the state file nor
 * any manifest, and are routed BEFORE `readState()` on purpose: a read-only report must
 * not depend on -- or be refused by -- the operator's local state file.
 *
 * Every verdict below comes from the accepted topology validator/transition planner in
 * `../lib/feature-package-topology.mjs`. This layer parses arguments, refuses fail-closed
 * naming the argument at fault, and serialises what that planner returned; it re-derives
 * no package rule of its own, and `feature-package-plan` prints the planner's preview
 * object verbatim as its whole document rather than a rewrite of it.
 *
 * The transactional half (`feature-package-apply` / `feature-package-recover`) is
 * deliberately ABSENT rather than stubbed -- a stub is precisely the thing a caller
 * mistakes for a gate.
 */
const FEATURE_PACKAGE_READ_SUBCOMMANDS = new Set([
  "feature-package-inspect",
  "feature-package-status",
  "feature-package-plan",
]);
const FEATURE_PACKAGE_INSPECT_SCHEMA = "pipeline.feature-package-inspect.v1";
const FEATURE_PACKAGE_STATUS_SCHEMA = "pipeline.feature-package-status.v1";
const FEATURE_PACKAGE_READ_FLAGS = new Map([
  ["feature-package-inspect", new Set(["root"])],
  ["feature-package-status", new Set(["root", "manifest"])],
  ["feature-package-plan", new Set(["root", "manifest", "next-state", "proposal"])],
]);

function refuseFeaturePackageRead(sub, message) {
  console.error(`Error: ${sub} refused: ${message}.`);
  return 2;
}

/**
 * Closed parser: an unknown, repeated or value-less flag is a refusal that NAMES the
 * offending argument, not a silently ignored token.
 */
function parseFeaturePackageReadFlags(argv, allowed) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (typeof raw !== "string" || !raw.startsWith("--")) {
      return { ok: false, error: `unexpected argument "${typeof raw === "string" ? raw : String(raw)}"` };
    }
    const name = raw.slice(2);
    if (!allowed.has(name)) return { ok: false, error: `unknown argument "--${name}"` };
    if (Object.prototype.hasOwnProperty.call(out, name)) return { ok: false, error: `duplicate argument "--${name}"` };
    const value = argv[i + 1];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      return { ok: false, error: `argument "--${name}" requires a value` };
    }
    out[name] = value;
    i++;
  }
  return { ok: true, value: out };
}

/**
 * Minimal containment check for the paths THIS layer opens itself. It is not a second
 * copy of the topology's path contract -- the planner re-checks every package path it
 * uses -- it exists so a refusal can name the bad argument before any read happens.
 */
function featurePackageReadRelative(root, value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\")) return null;
  if (value.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  const rel = relative(root, resolve(root, value));
  return rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? null : value;
}

function featurePackageReadArtifactView(artifact) {
  if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
    return { class: null, path: null, sha256: null, authority: null, mutability: null, retention: null };
  }
  return {
    class: artifact.class ?? null,
    path: artifact.path ?? null,
    sha256: artifact.sha256 ?? null,
    authority: artifact.authority ?? null,
    mutability: artifact.mutability ?? null,
    retention: artifact.retention ?? null,
  };
}

function runFeaturePackageReadCommand(sub, argv) {
  const parsed = parseFeaturePackageReadFlags(argv, FEATURE_PACKAGE_READ_FLAGS.get(sub));
  if (!parsed.ok) return refuseFeaturePackageRead(sub, parsed.error);
  const flags = parsed.value;
  if (flags.root === undefined) return refuseFeaturePackageRead(sub, 'argument "--root <dir>" is required');
  const root = resolve(flags.root);
  let rootStat = null;
  try { rootStat = statSync(root); } catch { rootStat = null; }
  if (rootStat === null || !rootStat.isDirectory()) {
    return refuseFeaturePackageRead(sub, `argument "--root" does not name a readable directory: ${flags.root}`);
  }

  if (sub === "feature-package-inspect") {
    const inventory = inventoryFeaturePackages(root);
    const packages = inventory.packages.map((manifest) => {
      const checked = validateFeaturePackage(root, manifest);
      return {
        manifest,
        ok: checked.ok,
        featureId: checked.receipt?.featureId ?? null,
        state: checked.receipt?.state ?? null,
        candidate: checked.receipt?.candidate ?? null,
        manifestSha256: checked.receipt?.manifestSha256 ?? null,
        artifactCount: checked.receipt?.artifactCount ?? 0,
        findings: checked.findings,
      };
    });
    const invalidCount = packages.filter((entry) => !entry.ok).length;
    console.log(JSON.stringify({
      schema: FEATURE_PACKAGE_INSPECT_SCHEMA,
      ok: invalidCount === 0,
      packageCount: packages.length,
      invalidCount,
      packages,
      legacy: inventory.legacy,
      unknown: inventory.unknown,
    }, null, 2));
    return invalidCount === 0 ? 0 : 2;
  }

  if (flags.manifest === undefined) {
    return refuseFeaturePackageRead(sub, 'argument "--manifest <repo-relative-path>" is required');
  }
  const manifest = featurePackageReadRelative(root, flags.manifest);
  if (manifest === null) {
    return refuseFeaturePackageRead(sub, `argument "--manifest" must be a canonical path inside --root: ${flags.manifest}`);
  }

  if (sub === "feature-package-status") {
    const checked = validateFeaturePackage(root, manifest);
    if (checked.receipt === null) {
      return refuseFeaturePackageRead(sub, `argument "--manifest" names an unreadable or malformed manifest: ${manifest} (${checked.findings.join("; ")})`);
    }
    let value = null;
    try { value = JSON.parse(readFileSync(join(root, checked.receipt.manifest), "utf8")); }
    catch { return refuseFeaturePackageRead(sub, `argument "--manifest" names an unreadable or malformed manifest: ${manifest}`); }
    console.log(JSON.stringify({
      schema: FEATURE_PACKAGE_STATUS_SCHEMA,
      ok: checked.ok,
      manifest: checked.receipt.manifest,
      featureId: checked.receipt.featureId,
      state: checked.receipt.state,
      candidate: checked.receipt.candidate,
      manifestSha256: checked.receipt.manifestSha256,
      artifactCount: checked.receipt.artifactCount,
      artifacts: (Array.isArray(value?.artifacts) ? value.artifacts : []).map(featurePackageReadArtifactView),
      receipt: checked.receipt,
      findings: checked.findings,
    }, null, 2));
    return checked.ok ? 0 : 2;
  }

  const nextState = flags["next-state"];
  if (existsSync(join(root, manifest))) {
    if (nextState === undefined) {
      return refuseFeaturePackageRead(sub, 'argument "--next-state <state>" is required for an existing manifest');
    }
    if (flags.proposal !== undefined) {
      return refuseFeaturePackageRead(sub, `argument "--proposal" applies only to an absent manifest, and ${manifest} exists`);
    }
    const plan = planFeaturePackageTransition(root, manifest, nextState);
    console.log(JSON.stringify(plan, null, 2));
    return plan.status === "preview" || plan.status === "noop" ? 0 : 2;
  }
  if (flags.proposal === undefined) {
    return refuseFeaturePackageRead(sub, `argument "--proposal <repo-relative-path>" is required because ${manifest} is absent; the bootstrap preview validates the proposed manifest bytes in memory and creates nothing`);
  }
  const proposalPath = featurePackageReadRelative(root, flags.proposal);
  if (proposalPath === null) {
    return refuseFeaturePackageRead(sub, `argument "--proposal" must be a canonical path inside --root: ${flags.proposal}`);
  }
  try {
    const stat = lstatSync(join(root, proposalPath));
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return refuseFeaturePackageRead(sub, `argument "--proposal" must name a regular non-symlink file: ${proposalPath}`);
    }
  } catch { return refuseFeaturePackageRead(sub, `argument "--proposal" names an unreadable file: ${proposalPath}`); }
  let manifestBytes = null;
  try { manifestBytes = readFileSync(join(root, proposalPath), "utf8"); }
  catch { return refuseFeaturePackageRead(sub, `argument "--proposal" names an unreadable file: ${proposalPath}`); }
  const plan = planFeaturePackageBootstrap(root, manifest, { manifestBytes, targetState: nextState ?? "draft" });
  console.log(JSON.stringify(plan, null, 2));
  return plan.status === "bootstrap-preview" ? 0 : 2;
}

// ---- PHX-WP-MUTABLE-REBIND-EXPLICIT-CLI: the deliberate, out-of-band rebind trigger --------
/**
 * `feature-package-rebind-mutable` (PHX-WP-MUTABLE-ARTIFACT-AUTOREBIND's own remaining design
 * question, per backlog/items/2026-08-17-acceptance-md-edits-repeatedly-drift-lifecycle-json-
 * bound-digest.md: "a dedicated CLI verb an operator or Elephant invokes explicitly").
 *
 * This is the ONLY place in this script that ever passes `autoRebindMutable: true` to
 * `validateFeaturePackage`. It is a deliberate, standalone, operator/Elephant-INITIATED
 * command -- never a silent side effect of `feature-package-apply` / `-reconcile` / `-plan` /
 * `-inspect` / `-status`, which stay exactly as unwired as PHX-WP-AUTOREBIND-WRITEPATH-
 * INVESTIGATE-FINISH left them (see the comment on `runFeaturePackageApplyCommand` above for
 * why: an internal recompute inside a write path that also consumes an approval-bound preview
 * digest cannot distinguish a routine edit from deliberate tampering). Called here, with no
 * preview digest to defeat and no approval gate to bypass, that risk does not apply: the
 * caller sees exactly what was rebound (or that nothing was) in the printed result, same as
 * running the command IS the audit signal.
 *
 * Routed ahead of `readState()`, like the read-only three: this verb's authority is the
 * `--root` repository's own topology, never the operator's local state file. It takes no
 * writer lock and keeps no recovery journal -- `validateFeaturePackage`'s own rebind write is
 * a single atomic `writeFileSync`, not a multi-step transaction, and `immutable`/`append-only`
 * artifacts are never touched by it (the mutability class test lives once, in
 * `autoRebindMutableArtifact`, and is never made configurable from here or anywhere else).
 */
const FEATURE_PACKAGE_REBIND_MUTABLE_SUBCOMMAND = "feature-package-rebind-mutable";
const FEATURE_PACKAGE_REBIND_MUTABLE_SCHEMA = "pipeline.feature-package-rebind-mutable.v1";
const FEATURE_PACKAGE_REBIND_MUTABLE_FLAGS = new Set(["root", "manifest"]);

function runFeaturePackageRebindMutableCommand(argv) {
  const sub = FEATURE_PACKAGE_REBIND_MUTABLE_SUBCOMMAND;
  const parsed = parseFeaturePackageReadFlags(argv, FEATURE_PACKAGE_REBIND_MUTABLE_FLAGS);
  if (!parsed.ok) return refuseFeaturePackageRead(sub, parsed.error);
  const flags = parsed.value;
  if (flags.root === undefined) return refuseFeaturePackageRead(sub, 'argument "--root <dir>" is required');
  const root = resolve(flags.root);
  let rootStat = null;
  try { rootStat = statSync(root); } catch { rootStat = null; }
  if (rootStat === null || !rootStat.isDirectory()) {
    return refuseFeaturePackageRead(sub, `argument "--root" does not name a readable directory: ${flags.root}`);
  }
  if (flags.manifest === undefined) {
    return refuseFeaturePackageRead(sub, 'argument "--manifest <repo-relative-path>" is required');
  }
  const manifest = featurePackageReadRelative(root, flags.manifest);
  if (manifest === null) {
    return refuseFeaturePackageRead(sub, `argument "--manifest" must be a canonical path inside --root: ${flags.manifest}`);
  }

  const checked = validateFeaturePackage(root, manifest, null, { autoRebindMutable: true });
  if (checked.receipt === null) {
    return refuseFeaturePackageRead(sub, `argument "--manifest" names an unreadable or malformed manifest: ${manifest} (${checked.findings.join("; ")})`);
  }
  const rebinds = Array.isArray(checked.rebinds) ? checked.rebinds : [];
  for (const rebind of rebinds) {
    console.log(`Rebound ${rebind.path} (${rebind.class}): ${rebind.from} -> ${rebind.to}`);
  }
  if (rebinds.length === 0) console.log(`No mutable-class artifact needed rebinding in ${manifest}.`);
  console.log(JSON.stringify({
    schema: FEATURE_PACKAGE_REBIND_MUTABLE_SCHEMA,
    ok: checked.ok,
    manifest: checked.receipt.manifest,
    featureId: checked.receipt.featureId,
    manifestSha256: checked.receipt.manifestSha256,
    rebindCount: rebinds.length,
    rebinds,
    findings: checked.findings,
  }, null, 2));
  return checked.ok ? 0 : 2;
}

// ---- PHX-0A-WRITE: the transactional half of the #22 lifecycle writer family (P-AC-08) ----
/**
 * `feature-package-apply` / `feature-package-recover`.
 *
 * Neither subcommand re-derives a package rule: every verdict below still comes from
 * `planFeaturePackageTransition` / `planFeaturePackageBootstrap` / `validateFeaturePackage`
 * in `../lib/feature-package-topology.mjs`. This layer only (a) refuses fail-closed unless
 * the caller's `--plan-sha256` matches a FRESH recompute of that exact preview object, (b)
 * mechanically turns the planner's non-mutating verdict into the one deterministic byte
 * sequence it implies (either the exact bootstrap proposal bytes, or the current manifest
 * with only its `state` field replaced), and (c) commits that write as a transaction: a
 * private, HMAC-authenticated recovery journal (mirroring `continuity-result-bootstrap-*`'s
 * git-common-dir journal, never inside the working tree) is published BEFORE the manifest
 * bytes are touched and is retained -- never deleted -- on every failure path; only a
 * confirmed post-write readback (byte-for-byte plus a fresh `validateFeaturePackage` pass)
 * retires it. `feature-package-recover` only ever reads that journal back; it never writes.
 *
 * Routed ahead of `readState()`, like the read-only three: this family's authority is the
 * `--root` repository's own topology and its own private journal, never the operator's
 * local state file.
 *
 * `feature-package-reconcile` (PHX-WP-GATE, P-AC-08) is a THIRD, separate write
 * subcommand added alongside these two: it shares this exact journal (a `kind: "reconcile"`
 * record, retained/retired/recovered by the SAME helpers below and by the unmodified
 * `feature-package-recover`), the same writer lock, and the same digest-bound-preview /
 * write / readback shape -- but it is additionally PO-bound (a caller-injected approval
 * check, bound to the exact candidate and the plan digest) because a reconcile changes
 * authority-bearing artifact digests, which the other two kinds never do. It is the one
 * write kind that reads Continuity State (never the operator's local file in general --
 * only the `--root` repository's OWN `authority.result` binding, and only to satisfy the
 * Result fence precondition on the plan itself).
 */
const FEATURE_PACKAGE_WRITE_SUBCOMMANDS = new Set(["feature-package-apply", "feature-package-reconcile", "feature-package-recover"]);
const FEATURE_PACKAGE_APPLY_SCHEMA = "pipeline.feature-package-apply.v1";
const FEATURE_PACKAGE_RECONCILE_SCHEMA = "pipeline.feature-package-reconcile.v1";
const FEATURE_PACKAGE_RECONCILE_APPROVAL_SCHEMA = "pipeline.feature-package-reconcile-approval.v1";
const FEATURE_PACKAGE_RECOVER_SCHEMA = "pipeline.feature-package-recover.v1";
const FEATURE_PACKAGE_APPLY_JOURNAL_SCHEMA = "pipeline.feature-package-apply-journal.v1";
const FEATURE_PACKAGE_APPLY_LOCK_TOKEN = "pipeline-feature-package-apply-v1";
const FEATURE_PACKAGE_APPLY_FLAGS = new Set(["root", "manifest", "next-state", "proposal", "plan-sha256"]);
// PHX-WP-PAC08-RECONCILE-APPROVAL: widened to admit the PO-bound approval transport
// (--by/--proof-request/--proof-authority/--proof) as OPTIONAL flags at this parse
// stage. Whether a given flag is actually REQUIRED depends on the resolved approval
// mode (chat vs. signature, ADR-0056's 2026-08-11 Follow-up) and is enforced inside
// `defaultFeaturePackageReconcileApproval`, not here -- refusing an unknown flag here
// would make the approval flags unreachable before the check that needs them ever runs.
const FEATURE_PACKAGE_RECONCILE_FLAGS = new Set(["root", "manifest", "plan-sha256", "by", "proof-request", "proof-authority", "proof"]);

function featurePackageApplyPrivatePaths(dir, deps = {}) {
  const common = (deps.gitCommonDir ?? defaultGitCommonDir)(dir);
  if (!common?.ok || typeof common.path !== "string") return null;
  try {
    const root = realpathSync(common.path);
    if (root !== resolve(common.path) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) return null;
    const namespace = join(root, "agent-pipeline");
    const base = join(namespace, "feature-package-apply");
    return { root, namespace, base, key: join(base, "key"), journal: join(base, "journal") };
  } catch { return null; }
}

/** Reads and MAC-verifies the retained journal, if any. Never mutates. */
function loadFeaturePackageApplyJournal(dir, deps = {}) {
  const paths = featurePackageApplyPrivatePaths(dir, deps);
  if (paths === null || !observeBootstrapPrivateDirectory(paths)) return { ok: false, code: "FTP-APPLY-JOURNAL-GIT-COMMON-DIR" };
  const key = readPrivateBootstrap(paths.key);
  const raw = readPrivateBootstrap(paths.journal);
  if (raw === null) return { ok: true, journal: null, paths, key };
  if (key === null || key.byteLength !== 32) return { ok: false, code: "FTP-APPLY-JOURNAL" };
  try {
    const value = JSON.parse(raw.toString("utf8"));
    const keys = ["schema", "planSha256", "manifestPath", "kind", "preSha256", "postSha256", "postBytesBase64", "mode", "mac"];
    if (!exactObjectKeys(value, keys)
      || value.schema !== FEATURE_PACKAGE_APPLY_JOURNAL_SCHEMA
      || !SHA256_RE.test(value.planSha256)
      || typeof value.manifestPath !== "string"
      || !["transition", "bootstrap", "reconcile"].includes(value.kind)
      || !(value.preSha256 === null || SHA256_RE.test(value.preSha256))
      || !SHA256_RE.test(value.postSha256)
      || typeof value.postBytesBase64 !== "string"
      || !Number.isSafeInteger(value.mode) || value.mode < 0 || value.mode > 0o777
      || !SHA256_RE.test(value.mac)) return { ok: false, code: "FTP-APPLY-JOURNAL" };
    const { mac, ...core } = value;
    if (bootstrapJournalMac(key, core) !== mac) return { ok: false, code: "FTP-APPLY-JOURNAL" };
    return { ok: true, journal: value, paths, key };
  } catch { return { ok: false, code: "FTP-APPLY-JOURNAL" }; }
}

/** Publishes the journal BEFORE any manifest byte is touched. `wx`-only: never overwrites a pending one. */
function publishFeaturePackageApplyJournal(dir, record, deps = {}) {
  const paths = featurePackageApplyPrivatePaths(dir, deps);
  if (!ensureBootstrapPrivateDirectory(paths)) return false;
  let key = readPrivateBootstrap(paths.key);
  if (key === null) { key = randomBytes(32); if (!writePrivateBootstrap(paths.key, key)) return false; }
  if (key.byteLength !== 32) return false;
  const core = {
    schema: FEATURE_PACKAGE_APPLY_JOURNAL_SCHEMA,
    planSha256: record.planSha256,
    manifestPath: record.manifestPath,
    kind: record.kind,
    preSha256: record.preSha256,
    postSha256: record.postSha256,
    postBytesBase64: record.postBytes.toString("base64"),
    mode: record.mode,
  };
  const bytes = Buffer.from(`${JSON.stringify({ ...core, mac: bootstrapJournalMac(key, core) })}\n`, "utf8");
  return writePrivateBootstrap(paths.journal, bytes, false);
}

/** Retires the journal. Only ever called after a confirmed, matching postimage readback. */
function retireFeaturePackageApplyJournal(paths) {
  try { return ensureBootstrapPrivateDirectory(paths) && (unlinkSync(paths.journal), syncDirectory(paths.base).ok); } catch { return false; }
}

/**
 * Parses the shared root/manifest/next-state/proposal contract (identical to the read
 * half) plus `--plan-sha256`, then recomputes the exact preview from the SAME accepted
 * planner `feature-package-plan` uses, and refuses fail-closed on any drift: a stale
 * manifest, a stale proposal, or a changed `--next-state` all change the recomputed plan
 * object and therefore its digest. Returns a refusal message (never printed here) or the
 * resolved, digest-bound request.
 */
function buildFeaturePackageApplyPreview(flags) {
  if (flags.root === undefined) return { ok: false, error: 'argument "--root <dir>" is required' };
  const root = resolve(flags.root);
  let rootStat = null;
  try { rootStat = statSync(root); } catch { rootStat = null; }
  if (rootStat === null || !rootStat.isDirectory()) {
    return { ok: false, error: `argument "--root" does not name a readable directory: ${flags.root}` };
  }
  if (flags.manifest === undefined) return { ok: false, error: 'argument "--manifest <repo-relative-path>" is required' };
  const manifest = featurePackageReadRelative(root, flags.manifest);
  if (manifest === null) return { ok: false, error: `argument "--manifest" must be a canonical path inside --root: ${flags.manifest}` };
  if (!SHA256_RE.test(flags["plan-sha256"] ?? "")) {
    return { ok: false, error: 'argument "--plan-sha256 <sha256>" is required and must be a sha256 hex digest' };
  }
  const suppliedPlanSha256 = flags["plan-sha256"];
  const nextState = flags["next-state"];
  const manifestExists = existsSync(join(root, manifest));
  let plan; let kind; let manifestBytes = null;
  if (manifestExists) {
    if (nextState === undefined) return { ok: false, error: 'argument "--next-state <state>" is required for an existing manifest' };
    if (flags.proposal !== undefined) return { ok: false, error: `argument "--proposal" applies only to an absent manifest, and ${manifest} exists` };
    plan = planFeaturePackageTransition(root, manifest, nextState);
    kind = "transition";
  } else {
    if (flags.proposal === undefined) return { ok: false, error: `argument "--proposal <repo-relative-path>" is required because ${manifest} is absent; the bootstrap preview validates the proposed manifest bytes in memory and creates nothing` };
    const proposalPath = featurePackageReadRelative(root, flags.proposal);
    if (proposalPath === null) return { ok: false, error: `argument "--proposal" must be a canonical path inside --root: ${flags.proposal}` };
    try {
      const stat = lstatSync(join(root, proposalPath));
      if (!stat.isFile() || stat.isSymbolicLink()) return { ok: false, error: `argument "--proposal" must name a regular non-symlink file: ${proposalPath}` };
    } catch { return { ok: false, error: `argument "--proposal" names an unreadable file: ${proposalPath}` }; }
    try { manifestBytes = readFileSync(join(root, proposalPath), "utf8"); }
    catch { return { ok: false, error: `argument "--proposal" names an unreadable file: ${proposalPath}` }; }
    plan = planFeaturePackageBootstrap(root, manifest, { manifestBytes, targetState: nextState ?? "draft" });
    kind = "bootstrap";
  }
  const recomputedPlanSha256 = sha256CanonicalJson(plan);
  if (recomputedPlanSha256 !== suppliedPlanSha256) {
    return { ok: false, error: `argument "--plan-sha256" does not match the freshly recomputed preview digest for ${manifest}; the manifest, proposal, or --next-state drifted since the preview was taken` };
  }
  const actionable = kind === "transition" ? plan.status === "preview" : plan.status === "bootstrap-preview";
  if (!actionable) {
    return { ok: false, error: `the recomputed preview for ${manifest} is not an applicable transition (status: ${plan.status}${plan.reason ? `, reason: ${plan.reason}` : ""}); zero mutation` };
  }
  return { ok: true, root, manifest, kind, plan, planSha256: suppliedPlanSha256, manifestBytes };
}

/**
 * Turns the planner's non-mutating verdict into the one deterministic postimage it
 * implies. For a bootstrap, that is the exact proposal bytes (already digest-bound to
 * `plan.receipt.manifestSha256`). For a transition, that is the CURRENT manifest object
 * re-read fresh (closing the TOCTOU window against the earlier preview) with only its
 * `state` field replaced -- no other key is ever touched, and a fresh
 * `validateFeaturePackage` call must still agree the preimage is exactly what `plan.from`
 * assumed before any byte is written.
 */
function computeFeaturePackagePostimage(root, manifest, kind, plan, manifestBytes) {
  if (kind === "bootstrap") {
    if (existsSync(join(root, manifest))) return { ok: false, code: "FTP-APPLY-BOOTSTRAP-RACE" };
    const postBytes = Buffer.from(manifestBytes, "utf8");
    const postSha256 = sha256Bytes(postBytes);
    if (postSha256 !== plan.receipt?.manifestSha256) return { ok: false, code: "FTP-APPLY-BOOTSTRAP-DIGEST" };
    return { ok: true, preSha256: null, postBytes, postSha256, mode: 0o644 };
  }
  const preFile = physicalRebindFile(root, manifest);
  if (preFile === null) return { ok: false, code: "FTP-APPLY-TRANSITION-IDENTITY" };
  const revalidated = validateFeaturePackage(root, manifest);
  if (!revalidated.ok || revalidated.receipt.manifestSha256 !== preFile.sha256 || revalidated.receipt.state !== plan.from) {
    return { ok: false, code: "FTP-APPLY-TRANSITION-DRIFT" };
  }
  let value;
  try { value = JSON.parse(preFile.bytes.toString("utf8")); } catch { return { ok: false, code: "FTP-APPLY-TRANSITION-JSON" }; }
  const nextValue = { ...value, state: plan.to };
  const postBytes = Buffer.from(`${JSON.stringify(nextValue, null, 2)}\n`, "utf8");
  const postSha256 = sha256Bytes(postBytes);
  const mode = Number(preFile.identity.mode) & 0o777;
  return { ok: true, preSha256: preFile.sha256, postBytes, postSha256, mode };
}

function runFeaturePackageApplyCommand(argv, deps) {
  const sub = "feature-package-apply";
  const parsed = parseFeaturePackageReadFlags(argv, FEATURE_PACKAGE_APPLY_FLAGS);
  if (!parsed.ok) return refuseFeaturePackageRead(sub, parsed.error);
  if (parsed.value.root === undefined) return refuseFeaturePackageRead(sub, 'argument "--root <dir>" is required');
  const root = resolve(parsed.value.root);
  let rootStat = null;
  try { rootStat = statSync(root); } catch { rootStat = null; }
  if (rootStat === null || !rootStat.isDirectory()) {
    return refuseFeaturePackageRead(sub, `argument "--root" does not name a readable directory: ${parsed.value.root}`);
  }
  const lock = acquireContinuityLock(root, FEATURE_PACKAGE_APPLY_LOCK_TOKEN, deps);
  if (!lock.ok) return refuseFeaturePackageRead(sub, `writer lock unavailable (${lock.code})`);
  try {
    // Deliberately unwired for autoRebindMutable (PHX-WP-AUTOREBIND-WRITEPATH-INVESTIGATE-
    // FINISH): wiring it here was tried and reverted after testing showed it defeats the
    // --plan-sha256 freshness/anti-tamper contract for ANY manifest with a mutable+authority
    // artifact (routinely the PRD/acceptance -- see feature-package-topology.mjs's own
    // PHX-WP-MUTABLE-ARTIFACT-AUTOREBIND note). An internal recompute that silently self-heals
    // a mutable digest cannot distinguish a routine edit from deliberate tampering, and the
    // caller's own preview digest (from feature-package-plan, which stays unwired) never
    // reflects the healed state either way -- so WRc (a routine drift between plan and apply
    // must still be refused) and WRg (a manually tampered digest must be refused, not silently
    // "corrected") both regressed when this was wired. autoRebindMutable remains a safe,
    // tested LIBRARY capability (planFeaturePackageTransition/planFeaturePackageReconcile,
    // feature-package-topology.mjs) for a deliberate, out-of-band invocation -- never
    // hardwired into a CLI write path that also consumes an approval-bound preview digest.
    const preview = buildFeaturePackageApplyPreview(parsed.value);
    if (!preview.ok) return refuseFeaturePackageRead(sub, preview.error);
    const { manifest, kind, plan, planSha256, manifestBytes } = preview;
    const nextState = kind === "transition" ? plan.to : (parsed.value["next-state"] ?? "draft");

    const pending = loadFeaturePackageApplyJournal(root, deps);
    if (!pending.ok) return refuseFeaturePackageRead(sub, `a prior recovery journal is unreadable or tampered (${pending.code}); run feature-package-recover`);
    if (pending.journal !== null) {
      return refuseFeaturePackageRead(sub, `a recovery journal is already pending for ${pending.journal.manifestPath}; run feature-package-recover before retrying. Zero new mutation; recovery journal retained`);
    }

    const postimage = computeFeaturePackagePostimage(root, manifest, kind, plan, manifestBytes);
    if (!postimage.ok) return refuseFeaturePackageRead(sub, `the preimage drifted since the preview was recomputed (${postimage.code}); zero mutation`);

    const published = publishFeaturePackageApplyJournal(root, {
      planSha256, manifestPath: manifest, kind,
      preSha256: postimage.preSha256, postSha256: postimage.postSha256,
      postBytes: postimage.postBytes, mode: postimage.mode,
    }, deps);
    if (!published) return refuseFeaturePackageRead(sub, "journal prepare failed; zero mutation");
    if (deps.afterFeaturePackageApplyJournal?.() === false) {
      return refuseFeaturePackageRead(sub, "interrupted after journal preparation; recovery journal retained");
    }

    const target = join(root, manifest);
    const replace = deps.replaceFeaturePackageApplyFdContents ?? ((fd, bytes) => { ftruncateSync(fd, 0); let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset); fsyncSync(fd); });
    const rename = deps.renameFeaturePackageApply ?? renameSync;
    const sync = deps.syncFeaturePackageApplyDirectory ?? syncDirectory;
    const written = writeRebindFile(target, postimage.postBytes, postimage.mode, lock.ownerNonce, replace, rename, sync);
    if (!written.ok) return refuseFeaturePackageRead(sub, `manifest write failed (${written.code}); recovery journal retained`);
    if (deps.afterFeaturePackageApplyWrite?.() === false) {
      return refuseFeaturePackageRead(sub, "interrupted after manifest write; recovery journal retained");
    }

    const observed = physicalRebindFile(root, manifest);
    if (observed === null || observed.sha256 !== postimage.postSha256 || !observed.bytes.equals(postimage.postBytes)) {
      return refuseFeaturePackageRead(sub, "postimage readback did not match the predicted digest; recovery journal retained");
    }
    const revalidated = validateFeaturePackage(root, manifest);
    if (!revalidated.ok) {
      return refuseFeaturePackageRead(sub, `postimage failed package validation (${revalidated.findings.join("; ")}); recovery journal retained`);
    }

    const paths = featurePackageApplyPrivatePaths(root, deps);
    if (!retireFeaturePackageApplyJournal(paths)) {
      return refuseFeaturePackageRead(sub, "journal retirement is unresolved; recovery journal retained");
    }

    console.log(JSON.stringify({
      schema: FEATURE_PACKAGE_APPLY_SCHEMA,
      status: "applied",
      kind,
      manifest,
      from: kind === "transition" ? plan.from : "absent",
      to: nextState,
      planSha256,
      manifestSha256: postimage.postSha256,
    }, null, 2));
    return 0;
  } finally { releaseContinuityLock(lock); }
}

/**
 * Re-derives the reconcile plan FRESH against current on-disk reality AND the CURRENT
 * Continuity State binding (closing the TOCTOU window the earlier preview leaves open --
 * exactly what DoD 3 requires: "recomputes the preview fresh and refuses on drift"), and
 * turns it into a postimage IFF the re-derived plan still matches the digest the caller's
 * preview bound. Deliberately a SEPARATE function from `computeFeaturePackagePostimage`
 * rather than a third branch inside it: `feature-package-apply`'s transition/bootstrap
 * paths are left byte-for-byte untouched.
 */
function computeFeaturePackageReconcilePostimage(root, manifest, planSha256, resultAuthority) {
  const rebuilt = planFeaturePackageReconcile(root, manifest, resultAuthority);
  if (rebuilt.status !== "reconcile-preview" || sha256CanonicalJson(rebuilt) !== planSha256) {
    return { ok: false, code: "FTP-RECONCILE-DRIFT" };
  }
  const preFile = physicalRebindFile(root, manifest);
  if (preFile === null) return { ok: false, code: "FTP-RECONCILE-IDENTITY" };
  const postBytes = Buffer.from(`${JSON.stringify(rebuilt.postimage, null, 2)}\n`, "utf8");
  const postSha256 = sha256Bytes(postBytes);
  const mode = Number(preFile.identity.mode) & 0o777;
  return { ok: true, preSha256: preFile.sha256, postBytes, postSha256, mode, changes: rebuilt.changes };
}

/**
 * `feature-package-reconcile` -- the third plan kind's transactional half (PHX-WP-GATE,
 * P-AC-08). Consumes `planFeaturePackageReconcile` under the identical `--plan-sha256`
 * preview-digest binding `feature-package-apply` uses, is additionally PO-bound (a
 * caller-injected `deps.featurePackageReconcileApproval` proof check, bound to the exact
 * observed candidate and the plan digest -- the same shape `continuity-authority-
 * revision-apply` uses for `deps.authorityRevisionApproval`), and reuses the SAME private
 * journal, writer lock, and readback-before-retirement machinery `feature-package-apply`
 * already uses (a `kind: "reconcile"` record; `feature-package-recover` reads it back
 * unmodified). A reconcile without a valid bound decision fails closed and writes nothing.
 */
function runFeaturePackageReconcileCommand(argv, deps) {
  const sub = "feature-package-reconcile";
  const parsed = parseFeaturePackageReadFlags(argv, FEATURE_PACKAGE_RECONCILE_FLAGS);
  if (!parsed.ok) return refuseFeaturePackageRead(sub, parsed.error);
  const flags = parsed.value;
  if (flags.root === undefined) return refuseFeaturePackageRead(sub, 'argument "--root <dir>" is required');
  const root = resolve(flags.root);
  let rootStat = null;
  try { rootStat = statSync(root); } catch { rootStat = null; }
  if (rootStat === null || !rootStat.isDirectory()) {
    return refuseFeaturePackageRead(sub, `argument "--root" does not name a readable directory: ${flags.root}`);
  }
  if (flags.manifest === undefined) return refuseFeaturePackageRead(sub, 'argument "--manifest <repo-relative-path>" is required');
  const manifest = featurePackageReadRelative(root, flags.manifest);
  if (manifest === null) return refuseFeaturePackageRead(sub, `argument "--manifest" must be a canonical path inside --root: ${flags.manifest}`);
  if (!SHA256_RE.test(flags["plan-sha256"] ?? "")) {
    return refuseFeaturePackageRead(sub, 'argument "--plan-sha256 <sha256>" is required and must be a sha256 hex digest');
  }
  const planSha256 = flags["plan-sha256"];

  const lock = acquireContinuityLock(root, FEATURE_PACKAGE_APPLY_LOCK_TOKEN, deps);
  if (!lock.ok) return refuseFeaturePackageRead(sub, `writer lock unavailable (${lock.code})`);
  try {
    const stateNow = (deps.readStateRaw ?? readStateRaw)(root);
    const resultAuthority = stateNow.status === "ok" ? (stateNow.state?.continuity?.authority?.result ?? null) : null;
    const plan = planFeaturePackageReconcile(root, manifest, resultAuthority);
    if (plan.status !== "reconcile-preview" || sha256CanonicalJson(plan) !== planSha256) {
      return refuseFeaturePackageRead(sub, `argument "--plan-sha256" does not match the freshly recomputed reconcile preview digest for ${manifest}; the manifest, an artifact, or the Continuity State Result binding drifted since the preview was taken`);
    }

    if (typeof deps.featurePackageReconcileApproval !== "function") {
      return refuseFeaturePackageRead(sub, "PO-bound approval is unavailable (FTP-RECONCILE-APPROVAL-UNAVAILABLE); zero mutation");
    }
    const observedCandidate = (deps.gitCandidate ?? defaultGitCandidate)(root);
    if (!observedCandidate.ok) {
      return refuseFeaturePackageRead(sub, "the current candidate identity is unavailable (FTP-RECONCILE-CANDIDATE-UNAVAILABLE); zero mutation");
    }
    // `holderLock`/`holderRoot` let the approval closure recognize and reuse the
    // exclusive lock THIS call already holds on `root`, rather than acquiring a second,
    // colliding one on the same resolved path when the approving governing session's own
    // `dir` happens to coincide with `root` (PHX-WP-PAC08-LOCK-REENTRANCY, closing Critic
    // finding F1). It is inert for every other caller/topology: an injected test double
    // that destructures only `{ manifest, planSha256, candidate }` never sees it, and
    // `defaultFeaturePackageReconcileApproval` only acts on it when the resolved lock
    // paths actually match.
    const approvalCheck = deps.featurePackageReconcileApproval({
      repoRoot: root,
      schema: FEATURE_PACKAGE_RECONCILE_APPROVAL_SCHEMA,
      manifest,
      planSha256,
      candidate: { commit: observedCandidate.commit, tree: observedCandidate.tree },
      holderLock: lock,
      holderRoot: root,
    });
    if (!approvalCheck?.ok) {
      // F3 (Critic pac08-fb-critic-review-5420c5e7.md): a replayed proof already verified
      // and was already consumed -- the generic "not confirmed for this exact candidate and
      // plan digest" text is false for this one cause. Every other refusal code keeps the
      // existing generic message unchanged (RGk/RGl/RGm depend on it).
      const message = approvalCheck?.code === "CRITICAL-PROOF-REPLAY"
        ? "external proof was already consumed (CRITICAL-PROOF-REPLAY); zero mutation"
        : "PO-bound approval was not confirmed for this exact candidate and plan digest (FTP-RECONCILE-APPROVAL-REJECTED); zero mutation";
      return refuseFeaturePackageRead(sub, message);
    }

    const pending = loadFeaturePackageApplyJournal(root, deps);
    if (!pending.ok) return refuseFeaturePackageRead(sub, `a prior recovery journal is unreadable or tampered (${pending.code}); run feature-package-recover`);
    if (pending.journal !== null) {
      return refuseFeaturePackageRead(sub, `a recovery journal is already pending for ${pending.journal.manifestPath}; run feature-package-recover before retrying. Zero new mutation; recovery journal retained`);
    }

    const postimage = computeFeaturePackageReconcilePostimage(root, manifest, planSha256, resultAuthority);
    if (!postimage.ok) return refuseFeaturePackageRead(sub, `the preimage drifted since the preview was recomputed (${postimage.code}); zero mutation`);

    const published = publishFeaturePackageApplyJournal(root, {
      planSha256, manifestPath: manifest, kind: "reconcile",
      preSha256: postimage.preSha256, postSha256: postimage.postSha256,
      postBytes: postimage.postBytes, mode: postimage.mode,
    }, deps);
    if (!published) return refuseFeaturePackageRead(sub, "journal prepare failed; zero mutation");
    if (deps.afterFeaturePackageReconcileJournal?.() === false) {
      return refuseFeaturePackageRead(sub, "interrupted after journal preparation; recovery journal retained");
    }

    const target = join(root, manifest);
    const replace = deps.replaceFeaturePackageApplyFdContents ?? ((fd, bytes) => { ftruncateSync(fd, 0); let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset); fsyncSync(fd); });
    const rename = deps.renameFeaturePackageApply ?? renameSync;
    const sync = deps.syncFeaturePackageApplyDirectory ?? syncDirectory;
    const written = writeRebindFile(target, postimage.postBytes, postimage.mode, lock.ownerNonce, replace, rename, sync);
    if (!written.ok) return refuseFeaturePackageRead(sub, `manifest write failed (${written.code}); recovery journal retained`);
    if (deps.afterFeaturePackageReconcileWrite?.() === false) {
      return refuseFeaturePackageRead(sub, "interrupted after manifest write; recovery journal retained");
    }

    const observed = physicalRebindFile(root, manifest);
    if (observed === null || observed.sha256 !== postimage.postSha256 || !observed.bytes.equals(postimage.postBytes)) {
      return refuseFeaturePackageRead(sub, "postimage readback did not match the predicted digest; recovery journal retained");
    }
    const revalidated = validateFeaturePackage(root, manifest);
    if (!revalidated.ok) {
      return refuseFeaturePackageRead(sub, `postimage failed package validation (${revalidated.findings.join("; ")}); recovery journal retained`);
    }

    const paths = featurePackageApplyPrivatePaths(root, deps);
    if (!retireFeaturePackageApplyJournal(paths)) {
      return refuseFeaturePackageRead(sub, "journal retirement is unresolved; recovery journal retained");
    }

    console.log(JSON.stringify({
      schema: FEATURE_PACKAGE_RECONCILE_SCHEMA,
      status: "applied",
      kind: "reconcile",
      manifest,
      changes: postimage.changes,
      planSha256,
      manifestSha256: postimage.postSha256,
    }, null, 2));
    return 0;
  } finally { releaseContinuityLock(lock); }
}

/** Read-only diagnosis of any retained journal. Never writes; never retires. */
function runFeaturePackageRecoverCommand(argv, deps) {
  const sub = "feature-package-recover";
  const parsed = parseFeaturePackageReadFlags(argv, new Set(["root"]));
  if (!parsed.ok) return refuseFeaturePackageRead(sub, parsed.error);
  if (parsed.value.root === undefined) return refuseFeaturePackageRead(sub, 'argument "--root <dir>" is required');
  const root = resolve(parsed.value.root);
  let rootStat = null;
  try { rootStat = statSync(root); } catch { rootStat = null; }
  if (rootStat === null || !rootStat.isDirectory()) {
    return refuseFeaturePackageRead(sub, `argument "--root" does not name a readable directory: ${parsed.value.root}`);
  }
  const loaded = loadFeaturePackageApplyJournal(root, deps);
  if (!loaded.ok) return refuseFeaturePackageRead(sub, `a retained journal is unreadable or tampered (${loaded.code}); manual repository inspection is required`);
  if (loaded.journal === null) {
    console.log(JSON.stringify({ schema: FEATURE_PACKAGE_RECOVER_SCHEMA, status: "clean", retained: false }, null, 2));
    return 0;
  }
  const journal = loaded.journal;
  const observed = physicalRebindFile(root, journal.manifestPath);
  const observedSha256 = observed === null ? null : observed.sha256;
  const diagnosis = observedSha256 === journal.postSha256
    ? "applied-pending-retirement"
    : observedSha256 === journal.preSha256
      ? "not-yet-applied"
      : "diverged";
  console.log(JSON.stringify({
    schema: FEATURE_PACKAGE_RECOVER_SCHEMA,
    status: "retained",
    transaction: {
      planSha256: journal.planSha256,
      manifest: journal.manifestPath,
      kind: journal.kind,
      expectedPreSha256: journal.preSha256,
      expectedPostSha256: journal.postSha256,
    },
    observed: { present: observed !== null, sha256: observedSha256 },
    diagnosis,
  }, null, 2));
  return 2;
}

/**
 * Default `deps.featurePackageReconcileApproval` for a real operator invocation -- no
 * test-injected override present (PHX-WP-PAC08-RECONCILE-APPROVAL). Mirrors
 * `approve-push`'s PO-bound proof-check shape (ADR-0056's 2026-08-11 Follow-up:
 * `gates.reconcile_approval`, identical fail-closed rules), but reads from the
 * GOVERNING SESSION's own local pipeline-state.json (`dir = deps.dir ?? projectDir()`)
 * -- never from `--root`, which names the repository being reconciled, not the approving
 * operator's own session (ADR-0056: "read from the governing session, not from the
 * pushed repository").
 *
 * `argv` is re-parsed here (idempotent/pure, safe to call twice -- the reconcile command
 * already parsed it once to reach this point) only to recover the `--by`/`--proof-*`
 * flags; the fixed `{repoRoot, schema, manifest, planSha256, candidate}` call shape
 * `runFeaturePackageReconcileCommand` already uses to invoke this closure is untouched,
 * so an existing or future test injection of `deps.featurePackageReconcileApproval` keeps
 * working unmodified.
 *
 * PHX-WP-PAC08-APPROVAL-LEDGER (closing Critic finding F-B): once `verifyCriticalHumanProof`
 * returns `ok:true`, this closure ALSO persists a durable attribution record --
 * `featurePackageReconcileApproval.lastApproved` -- into the governing `dir`'s own state, and
 * refuses (`CRITICAL-PROOF-REPLAY`, zero mutation) a `proofSha256` already present in the
 * SAME `criticalProofConsumption` ledger `approve-push` writes (shared, not kind-restricted).
 * The proof is consumed HERE, at verification time -- before the caller publishes the journal
 * or touches the manifest -- a deliberate fail-closed choice: a proof that verifies but is
 * followed by an unrelated later failure is still burned, and a retry needs a fresh proof.
 *
 * PHX-WP-PAC08-LOCK-REENTRANCY (closing Critic finding F1): `dir` (this closure's own
 * governing-session directory, `deps.dir ?? projectDir()`) can resolve to the exact same
 * directory as `holderRoot` -- the mandated Phoenix self-governance topology, where this
 * repository reconciles its own manifest from within its own governing session. In that
 * case the write below (via `writeState`) would try to acquire a SECOND exclusive
 * continuity lock on the identical resolved path `runFeaturePackageReconcileCommand`
 * already holds via `holderLock` across its whole body, colliding with itself
 * (PS-CONTINUITY-LOCKED) every time. Reusing the caller's already-held lock instead of
 * acquiring a new one is safe precisely because it is the SAME writer, still inside the
 * SAME critical section that already excluded every other writer (in-process or
 * cross-process) from this exact path -- not a new contender admitted past the lock. This
 * is a narrow, explicit hand-off (only from this one call site, only when the resolved
 * paths genuinely match) rather than a generic "same process already holds this path"
 * rule: a genuinely separate contender (e.g. a different token, not handed the lock
 * explicitly) still goes through the normal file-based `acquireContinuityLock` and is
 * still correctly refused -- see PS44Vc, which this design deliberately leaves intact.
 */
function defaultFeaturePackageReconcileApproval(argv, deps) {
  return ({ manifest, planSha256, candidate, holderLock, holderRoot }) => {
    const dir = deps.dir ?? projectDir();
    const kind = "feature-package-reconcile";
    const parsedArgv = parseFeaturePackageReadFlags(argv, FEATURE_PACKAGE_RECONCILE_FLAGS);
    const flags = parsedArgv.ok ? parsedArgv.value : {};
    const configured = criticalProofWaiverFor(dir, kind);
    if (configured.code !== null && configured.code !== undefined) return { ok: false, code: configured.code };
    const waived = configured.waived === true;
    // Mode-appropriate flag presence, the same shape `approve-push` enforces via
    // `parseExactFlags` there (chat needs only the attribution flag; signature needs the
    // full detached-proof transport too). Enforced here instead of at the earlier parse
    // stage because that parse is deliberately permissive across both modes (BLOCKER 1).
    if (isBlank(flags.by)) return { ok: false, code: "CRITICAL-PROOF-FLAGS-BY-REQUIRED" };
    if (!waived && (isBlank(flags["proof-request"]) || isBlank(flags["proof-authority"]) || isBlank(flags.proof))) {
      return { ok: false, code: "CRITICAL-PROOF-FLAGS-PROOF-REQUIRED" };
    }
    const stateResult = readState(dir);
    const state = stateResult.status === "ok" ? stateResult.state : { schema: SCHEMA_ID };
    const now = (deps.now ?? (() => new Date().toISOString()))();
    const verified = verifyCriticalHumanProof({
      dir, state, kind, candidate,
      subject: { manifest, planSha256, candidate },
      flags, now, required: true,
    });
    if (!verified.ok) return { ok: false, code: verified.code };
    // Consume-at-verify, mirroring `approve-push`'s own consumption-ledger/attribution
    // shape (~6554-6576 as of this writing): a malformed consumption array fails closed,
    // and a `proofSha256` already present in `criticalProofConsumption` (any `kind` -- the
    // array is not kind-restricted) is refused as a replay. Both checks run BEFORE the
    // write below, so a replayed proof causes zero mutation here and the caller never
    // reaches the journal/manifest write.
    const priorConsumption = state.criticalProofConsumption;
    if (priorConsumption !== undefined && (!Array.isArray(priorConsumption)
      || priorConsumption.some((entry) => !entry || typeof entry !== "object" || typeof entry.proofSha256 !== "string"))) {
      return { ok: false, code: "CRITICAL-PROOF-CONSUMPTION-INVALID" };
    }
    const consumed = Array.isArray(priorConsumption) ? priorConsumption : [];
    if (verified.proof !== null && consumed.some((entry) => entry.proofSha256 === verified.proof.proofSha256)) {
      return { ok: false, code: "CRITICAL-PROOF-REPLAY" };
    }
    // The record states on its face what backed it, mirroring `approve-push`'s own
    // `approvalRecord` -- chat mode still binds `approvedBy`/`approvedAt`/`forCommit` even
    // though `criticalProof` is null, which is what closes F-B's "chat mode nothing is
    // commit-bound" half.
    const approvalRecord = { approvedBy: flags.by, approvedAt: now, forCommit: candidate.commit, criticalProof: verified.proof };
    if (verified.waived !== undefined) approvalRecord.criticalProofWaiver = verified.waived;
    const next = {
      ...state,
      schema: SCHEMA_ID,
      featurePackageReconcileApproval: { lastApproved: approvalRecord },
      criticalProofConsumption: verified.proof === null
        ? consumed
        : [...consumed, { proofSha256: verified.proof.proofSha256, kind, consumedAt: now }],
      updatedAt: now,
    };
    // Reuse the caller's already-held lock only when it is genuinely for THIS same
    // path on disk -- comparing REAL (symlink-resolved) paths via `realpathSync`, not
    // lexical `resolve()`, so a `--root` reached through a symlink still counts as the
    // same path as the caller's already-held lock. The caller's held-lock path comes
    // from `holderLock.path` (the field `acquireContinuityLock` already returns on
    // success) rather than being recomputed via `continuityLockPath(holderRoot)`, since
    // that recomputation depends on `statePath()`'s existence-dependent branching and
    // can in principle diverge from the path actually locked. Both `realpathSync` calls
    // are wrapped so a resolution failure (e.g. a dangling symlink) is treated as "not
    // the same path" rather than thrown -- `reuseLock` stays `undefined` and `writeState`
    // falls back to acquiring its own lock exactly as before (untouched, fail-closed
    // behavior). In the ordinary `dir !== root` topology `reuseLock` likewise stays
    // undefined and `writeState` acquires its own lock exactly as before.
    const reuseLock = (() => {
      if (holderLock?.ok !== true || holderRoot === undefined || typeof holderLock.path !== "string") return undefined;
      try {
        const heldReal = realpathSync(holderLock.path);
        const candidateReal = realpathSync(continuityLockPath(dir));
        return heldReal === candidateReal ? holderLock : undefined;
      } catch {
        return undefined;
      }
    })();
    const writeResult = writeState(dir, next, state, reuseLock ? { reuseLock } : {});
    if (!stateWriteSucceeded(writeResult)) return { ok: false, code: writeResult.code };
    return { ok: true };
  };
}

function runFeaturePackageWriteCommand(sub, argv, deps) {
  if (sub === "feature-package-apply") return runFeaturePackageApplyCommand(argv, deps);
  if (sub === "feature-package-reconcile") {
    // `Object.hasOwn` rather than `??`: a test that explicitly injects
    // `featurePackageReconcileApproval: undefined` means "no approval function is
    // available" (RGe's FTP-RECONCILE-APPROVAL-UNAVAILABLE case) and must NOT receive
    // the default in its place. Only an absent key -- the real, no-injection operator
    // invocation -- gets the default closure.
    return runFeaturePackageReconcileCommand(argv, {
      ...deps,
      featurePackageReconcileApproval: Object.hasOwn(deps, "featurePackageReconcileApproval")
        ? deps.featurePackageReconcileApproval
        : defaultFeaturePackageReconcileApproval(argv, deps),
    });
  }
  return runFeaturePackageRecoverCommand(argv, deps);
}

/**
 * PHX-WP-HUMANLEGIBLE-APPROVAL: a closed, bounded vocabulary for the
 * human-legible briefing presented and persisted at the plan-approval gate
 * (backlog/items/2026-08-06-human-legible-approval-record.md, PO decision
 * 2026-08-18: structured/bounded, kept portable -- not free prose, not
 * confined to the restricted profile). Every field is a repository-relative
 * path, a sha256 digest, or a value drawn from one of the small fixed enums
 * below -- never free text -- so the record stays safe under H-AC-13's
 * portable-ledger prohibition on free-form rationale while still answering,
 * in words, the three things H-AC-11's gap named: the scope being released,
 * what changed since the last approved binding, and what this approval does
 * and does not authorize.
 *
 * Persisted as `state.planApprovalBriefing`, a sibling of `planSubmission`/
 * `planApproval` (not nested inside either): `plan-spec-state-v2.mjs` owns
 * the closed key sets of those two records and is out of this task's scope,
 * so the briefing travels alongside them in the same State envelope instead
 * of inside them. `derivePlanLifecycle`'s structural checks only ever look
 * at the specific keys they name, so an additional top-level sibling field
 * changes nothing about its own validation, and `validatePortablePipelineState`
 * (project-authority.mjs) accepts any top-level field that is not the
 * machine-local `sessionCleanup` binding.
 */
const PLAN_APPROVAL_BRIEFING_SCHEMA = "pipeline.plan-approval-briefing.v1";
const PLAN_APPROVAL_BRIEFING_KEYS = ["schema", "scope", "change", "authorizes", "excludes"];
const PLAN_APPROVAL_BRIEFING_SCOPE_KEYS = ["featureId", "planPath", "planSha256", "specPath", "specSha256", "profile"];
const PLAN_APPROVAL_BRIEFING_CHANGE_KEYS = ["kind", "previousApprovalSha256"];
const PLAN_APPROVAL_BRIEFING_CHANGE_KINDS = new Set([
  "initial-submission",
  "identical-binding",
  "plan-changed",
  "spec-changed",
  "profile-changed",
  "plan-and-spec-changed",
  "plan-and-profile-changed",
  "spec-and-profile-changed",
  "plan-spec-and-profile-changed",
]);
// Fixed, closed content: what a Plan approval ever authorizes and never
// authorizes in this system does not vary per submission, so these two lists
// are constants rather than being derived per-record.
const PLAN_APPROVAL_BRIEFING_AUTHORIZES = Object.freeze(["design-to-implementation-transition"]);
const PLAN_APPROVAL_BRIEFING_EXCLUDES = Object.freeze([
  "push", "deploy", "publication", "scope-beyond-bound-plan-and-spec",
]);
const PROFILES_ENUM = new Set(["epic", "feature", "mini"]);

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactBriefingKeys(value, keys) {
  return isPlainRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function validPlanApprovalBriefing(value) {
  return hasExactBriefingKeys(value, PLAN_APPROVAL_BRIEFING_KEYS)
    && value.schema === PLAN_APPROVAL_BRIEFING_SCHEMA
    && hasExactBriefingKeys(value.scope, PLAN_APPROVAL_BRIEFING_SCOPE_KEYS)
    && typeof value.scope.featureId === "string" && value.scope.featureId.length > 0
    && typeof value.scope.planPath === "string" && value.scope.planPath.length > 0
    && SHA256_RE.test(value.scope.planSha256)
    && typeof value.scope.specPath === "string" && value.scope.specPath.length > 0
    && SHA256_RE.test(value.scope.specSha256)
    && PROFILES_ENUM.has(value.scope.profile)
    && hasExactBriefingKeys(value.change, PLAN_APPROVAL_BRIEFING_CHANGE_KEYS)
    && PLAN_APPROVAL_BRIEFING_CHANGE_KINDS.has(value.change.kind)
    && (value.change.previousApprovalSha256 === null || SHA256_RE.test(value.change.previousApprovalSha256))
    && Array.isArray(value.authorizes) && value.authorizes.length > 0
    && value.authorizes.every((entry) => PLAN_APPROVAL_BRIEFING_AUTHORIZES.includes(entry))
    && Array.isArray(value.excludes) && value.excludes.length > 0
    && value.excludes.every((entry) => PLAN_APPROVAL_BRIEFING_EXCLUDES.includes(entry));
}

/**
 * NVA-R22-PLANSHOWN: closes the gap named in
 * backlog/items/2026-08-29-plan-approval-is-recorded-without-a-check-that-the-design-was-shown.md
 * -- `approve-plan` previously checked WHO approved (`--by`) and WHICH plan
 * (lifecycle-match) but never WHETHER the plan/design content was actually
 * rendered to the human first. `present-plan` is the new, separate CLI step
 * (mirroring EL-19's "present readably + wait for 'approved'") that records
 * this fact; it must run after `submit-plan` and before `approve-plan`.
 *
 * Bound to `submissionSha256` (the same digest `derivePlanLifecycle` already
 * computes from `state.planSubmission`, and the same one `approve-plan`
 * already requires to be current) rather than to raw plan/spec digests
 * directly: this ties the presentation record to the EXACT submission (plan
 * + spec + profile, as bound at submit time) that is later approved, so a
 * resubmission (new plan, new spec, or even just a new profile) invalidates
 * any prior presentation and forces a fresh `present-plan` call -- exactly
 * the "was THIS content shown" question, not "was something once shown".
 *
 * Deliberately a top-level sibling of `planApproval`/`planSubmission`
 * (mirrors `planApprovalBriefing` immediately above) rather than a field
 * inside either: `plan-spec-state-v2.mjs` owns the closed key sets of those
 * two records and stays untouched by this change.
 *
 * Deliberately a session-side ATTESTATION (an explicit "I rendered this"
 * claim by the caller, like `--by` is an explicit "I am this person" claim)
 * rather than a hash of literally-rendered bytes or a passive flag some
 * other step sets as a side effect: this CLI has no channel to observe what
 * actually appeared on a human's screen, so the strongest available
 * mechanism is the same one `--by` already relies on -- a caller-supplied,
 * non-blank, exactly-bound claim, refused unattributed exactly like every
 * other `--by`-taking mutation in this file.
 */
const PLAN_PRESENTATION_SCHEMA = "pipeline.plan-presentation.v1";
const PLAN_PRESENTATION_KEYS = ["schema", "submissionSha256", "presentedBy", "presentedAt"];

function validPlanPresentation(value) {
  return hasExactBriefingKeys(value, PLAN_PRESENTATION_KEYS)
    && value.schema === PLAN_PRESENTATION_SCHEMA
    && SHA256_RE.test(value.submissionSha256)
    && typeof value.presentedBy === "string" && value.presentedBy.length > 0
    && typeof value.presentedAt === "string" && value.presentedAt.length > 0;
}

/**
 * The prior approved binding this submission's briefing diffs against, read
 * from whatever valid current (v4) approval the state still carries at
 * submit time -- the last binding a PO actually approved, not merely the
 * last thing submitted. An approval in an older schema shape (no
 * `profileSha256`) or no approval at all reads as "no prior binding": the
 * change is then always reported as `initial-submission`, a deliberately
 * conservative simplification rather than guessing at an unrecorded profile.
 */
function priorApprovedBriefingBinding(state) {
  const approval = state?.planApproval;
  if (!validCurrentPlanApproval(approval)) return null;
  return {
    planSha256: approval.poGateAuthority.planSha256,
    specSha256: approval.poGateAuthority.specSha256,
    profileSha256: approval.profileSha256,
    approvalSha256: sha256CanonicalJson(approval),
  };
}

function classifyPlanApprovalBriefingChange(prior, { planSha256, specSha256, profileSha256 }) {
  if (prior === null) return "initial-submission";
  const planChanged = prior.planSha256 !== planSha256;
  const specChanged = prior.specSha256 !== specSha256;
  const profileChanged = prior.profileSha256 !== profileSha256;
  if (!planChanged && !specChanged && !profileChanged) return "identical-binding";
  if (planChanged && specChanged && profileChanged) return "plan-spec-and-profile-changed";
  if (planChanged && specChanged) return "plan-and-spec-changed";
  if (planChanged && profileChanged) return "plan-and-profile-changed";
  if (specChanged && profileChanged) return "spec-and-profile-changed";
  if (planChanged) return "plan-changed";
  if (specChanged) return "spec-changed";
  return "profile-changed";
}

/** Pure derivation from bound artifacts only -- never from caller/approver-typed text. */
function derivePlanApprovalBriefing({ state, featureId, planPath, planSha256, specPath, specSha256, profile, profileSha256 }) {
  const prior = priorApprovedBriefingBinding(state);
  return {
    schema: PLAN_APPROVAL_BRIEFING_SCHEMA,
    scope: { featureId, planPath, planSha256, specPath, specSha256, profile },
    change: {
      kind: classifyPlanApprovalBriefingChange(prior, { planSha256, specSha256, profileSha256 }),
      previousApprovalSha256: prior === null ? null : prior.approvalSha256,
    },
    authorizes: [...PLAN_APPROVAL_BRIEFING_AUTHORIZES],
    excludes: [...PLAN_APPROVAL_BRIEFING_EXCLUDES],
  };
}

function summarizePlanApprovalBriefing(briefing) {
  return `scope=${briefing.scope.planPath}(${briefing.scope.planSha256.slice(0, 12)}...)+${briefing.scope.specPath}(${briefing.scope.specSha256.slice(0, 12)}...) profile=${briefing.scope.profile} change=${briefing.change.kind} authorizes=${briefing.authorizes.join(",")} excludes=${briefing.excludes.join(",")}`;
}

/**
 * H-AC-11 reviewer reconstruction: exposes the persisted briefing alongside
 * the existing digests it must match. Recomputes the closed `scope` (plus
 * the fixed `authorizes`/`excludes`) from the current bound artifacts
 * (`planApproval.poGateAuthority` + the matching `planSubmission.profile`)
 * and fails, rather than trusting the stored bytes, when a persisted
 * briefing does not match what the bound artifacts actually say. The
 * point-in-time `change` comparison is not independently recomputable after
 * the fact (its "prior" state no longer exists once superseded) and is
 * exposed as recorded, not re-verified here.
 */
export function reconstructPlanApprovalBriefing(state) {
  const approval = state?.planApproval;
  const submission = state?.planSubmission;
  const briefing = state?.planApprovalBriefing;
  if (!validCurrentPlanApproval(approval)) return { ok: false, code: "PLAN-APPROVAL-BRIEFING-NO-APPROVAL" };
  if (!validPlanSubmission(submission) || approval.submissionSha256 !== sha256CanonicalJson(submission)) {
    return { ok: false, code: "PLAN-APPROVAL-BRIEFING-SUBMISSION-STALE" };
  }
  if (!validPlanApprovalBriefing(briefing)) return { ok: false, code: "PLAN-APPROVAL-BRIEFING-INVALID" };
  const expectedScope = {
    featureId: submission.featureId,
    planPath: approval.poGateAuthority.planPath,
    planSha256: approval.poGateAuthority.planSha256,
    specPath: approval.poGateAuthority.specPath,
    specSha256: approval.poGateAuthority.specSha256,
    profile: submission.profile,
  };
  if (JSON.stringify(briefing.scope) !== JSON.stringify(expectedScope)
    || JSON.stringify(briefing.authorizes) !== JSON.stringify(PLAN_APPROVAL_BRIEFING_AUTHORIZES)
    || JSON.stringify(briefing.excludes) !== JSON.stringify(PLAN_APPROVAL_BRIEFING_EXCLUDES)) {
    return { ok: false, code: "PLAN-APPROVAL-BRIEFING-MISMATCH" };
  }
  return {
    ok: true,
    briefing,
    submissionSha256: approval.submissionSha256,
    approvalSha256: sha256CanonicalJson(approval),
    planSha256: approval.poGateAuthority.planSha256,
    specSha256: approval.poGateAuthority.specSha256,
  };
}

/**
 * `inspect`'s ONE reader of `state.phoenixEpicHistory` (RW2-STATEKEY): the field
 * itself is opaque, preserved-verbatim historical data (see the SCHEMA doc above),
 * never interpreted as active state by any writer subcommand. This projects a
 * compact, read-only presence/identity summary so the block stays visible to every
 * session that runs `inspect` rather than being silently forgotten -- it derives
 * nothing that feeds a state transition. Returns `null` when the field is absent.
 */
function summarizePhoenixEpicHistory(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    present: true,
    featureId: typeof value.activeFeature?.id === "string" ? value.activeFeature.id : null,
    continuityRevision: Number.isSafeInteger(value.continuity?.revision) ? value.continuity.revision : null,
    note: typeof value.note === "string" ? value.note : null,
  };
}

/**
 * Runs the CLI logic. Never calls process.exit itself (testable); returns the exit
 * code. `deps` allows tests to inject `dir`, `now`, `gitHead`, and `env` without
 * touching the real filesystem/clock/git/environment.
 */
export function run(argv = process.argv.slice(2), deps = {}) {
  const dir = deps.dir ?? projectDir();
  const now = deps.now ?? (() => new Date().toISOString());
  const gitHead = deps.gitHead ?? defaultGitHead;
  const gitCandidate = deps.gitCandidate ?? defaultGitCandidate;
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
  if (sub === "po-authority-acknowledge-plan" || sub === "po-authority-acknowledge-apply") {
    return runPoAuthorityAcknowledgeCommand(sub, rest, {
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
  if (sub === "continuity-result-case-migration-plan" || sub === "continuity-result-case-migration-apply") {
    return runResultCaseMigrationCommand(sub, rest, { ...deps, dir, now });
  }
  if (AUTHORITY_REVISION_SUBCOMMANDS.has(sub)) {
    return runAuthorityRevisionCommand(sub, rest, { ...deps, dir, now, gitCandidate });
  }
  if (CONTINUITY_SUBCOMMANDS.has(sub)) return runContinuityCommand(sub, flags, { ...deps, dir, now });
  if (PUBLICATION_SUBCOMMANDS.has(sub)) return runPublicationCommand(sub, flags, { ...deps, dir, now });
  // Routed ahead of readState(): these three are read-only reports over a repository
  // topology and must not be gated by the operator's local state file.
  if (FEATURE_PACKAGE_READ_SUBCOMMANDS.has(sub)) return runFeaturePackageReadCommand(sub, rest);
  // Routed ahead of readState() too: a deliberate, standalone, non-PO-gated rebind trigger
  // (PHX-WP-MUTABLE-REBIND-EXPLICIT-CLI) -- never a silent side effect of any other verb.
  if (sub === FEATURE_PACKAGE_REBIND_MUTABLE_SUBCOMMAND) return runFeaturePackageRebindMutableCommand(rest);
  // Routed ahead of readState() too: this transaction's authority is the --root
  // repository's own topology and its own private journal, never the operator's
  // local state file (PHX-0A-WRITE, P-AC-08).
  if (FEATURE_PACKAGE_WRITE_SUBCOMMANDS.has(sub)) return runFeaturePackageWriteCommand(sub, rest, deps);

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
      syncNextActionDocs(dir, next);
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
            at: now(),
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
      syncNextActionDocs(dir, written.transition.state);
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
      // NVA-STAGINGBOLT-1: a plan or spec path still resolving inside the
      // onboarding staging directory carries its own "not yet bound as
      // project authority" banner -- submit-plan must not bind it as
      // authority regardless of what else checks out.
      const submitStagingRefusal = refusePlanAuthorityStagingPath({ rootDir: dir, planPath: authority.value.planPath, specPath: authority.value.specPath });
      if (!submitStagingRefusal.ok) {
        console.error(`Error: submit-plan blocked by ${submitStagingRefusal.code}: ${submitStagingRefusal.message}`);
        return 2;
      }
      const profileSha256 = sha256CanonicalJson(profile.value);
      const expectedPlanSha256 = authority.value.planSha256;
      const expectedSpecSha256 = authority.value.specSha256;
      let submittedAt;
      let submittedBriefing;
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
          if (!transition.ok) return transition;
          // H-AC-11 human-legible briefing (PHX-WP-HUMANLEGIBLE-APPROVAL): derived
          // here from the just-bound submission plus the prior approved binding,
          // never from caller-supplied text -- see the closed vocabulary above.
          submittedBriefing = derivePlanApprovalBriefing({
            state: observed,
            featureId: transition.submission.featureId,
            planPath: transition.submission.planPath,
            planSha256: transition.submission.planSha256,
            specPath: transition.submission.specPath,
            specSha256: transition.submission.specSha256,
            profile: transition.submission.profile,
            profileSha256: transition.submission.profileSha256,
          });
          return { ...transition, state: { ...transition.state, updatedAt: submittedAt, planApprovalBriefing: submittedBriefing } };
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
      syncNextActionDocs(dir, written.transition.state);
      console.log(`Plan submitted by "${by}" on ${submittedAt}; lifecycle="awaiting-approval".`);
      console.log(`Briefing: ${summarizePlanApprovalBriefing(submittedBriefing)}`);
      return 0;
    }

    // NVA-R22-PLANSHOWN: the mechanical record that the plan/design content was
    // actually rendered to the human before approval -- run after submit-plan,
    // before approve-plan. See the PLAN_PRESENTATION_SCHEMA doc comment above for
    // why this is a caller attestation bound to the exact current submission
    // rather than a hash of rendered bytes or a passive side-effect flag.
    case "present-plan": {
      const by = flags.by;
      if (isBlank(by)) {
        console.error('Error: present-plan requires --by <name> (non-empty) -- an unattributed presentation is refused.');
        return 2;
      }
      const lifecycle = derivePlanLifecycle(base);
      if (!lifecycle.ok || lifecycle.status !== "awaiting-approval"
        || !SHA256_RE.test(lifecycle.submissionSha256 ?? "")) {
        console.error(`Error: present-plan requires an exact current submitted plan (${lifecycle.code}); run submit-plan first.`);
        return 2;
      }
      const submissionSha256 = lifecycle.submissionSha256;
      let presentedAt;
      const written = writeState(dir, undefined, base, {
        transition: (observed) => {
          presentedAt = now();
          return {
            ok: true,
            state: {
              ...observed,
              planPresentation: {
                schema: PLAN_PRESENTATION_SCHEMA,
                submissionSha256,
                presentedBy: by,
                presentedAt,
              },
              updatedAt: presentedAt,
            },
          };
        },
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: present-plan failed before commit (${written.code}); no presentation was recorded.`);
        return 2;
      }
      syncNextActionDocs(dir, written.transition.state);
      console.log(`Plan presentation recorded by "${by}" on ${presentedAt}; bound to submission ${submissionSha256.slice(0, 12)}....`);
      console.log('Next: run `approve-plan --by <name>` once the PO has confirmed \'approved\'.');
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
      syncNextActionDocs(dir, written.transition.state);
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
      // NVA-STAGINGBOLT-1: independent of submit-plan's own gate (defense in
      // depth -- a submission bound before this bolt existed, or written by
      // any other path, must not be approvable while its authority still
      // resolves inside the onboarding staging directory).
      const approveStagingRefusal = refusePlanAuthorityStagingPath({ rootDir: dir, planPath: authority.value.planPath, specPath: authority.value.specPath });
      if (!approveStagingRefusal.ok) {
        console.error(`Error: approve-plan blocked by ${approveStagingRefusal.code}: ${approveStagingRefusal.message}`);
        return 2;
      }
      // NVA-R22-PLANSHOWN: attribution, lifecycle-match and authority (above)
      // answer WHO approved, WHICH plan, and whether it is otherwise a valid
      // candidate for approval; this last precondition answers WHETHER it was
      // actually shown to the human first. Checked last (not alongside
      // attribution/lifecycle) so a request invalid for another reason still
      // reports THAT reason, not this one. No override flag -- the PO's
      // universal escape hatch (edit/delete the state file directly, outside
      // this CLI) already covers the case this check must never itself
      // provide a bypass for.
      if (!validPlanPresentation(base.planPresentation)
        || base.planPresentation.submissionSha256 !== lifecycle.submissionSha256) {
        console.error("Error: approve-plan requires a prior present-plan record bound to this exact submission -- an approval of unseen content is refused; run present-plan --by <name> first.");
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
      syncNextActionDocs(dir, written.transition.state);
      console.log(`Plan approved by "${by}" on ${approvedAt}; lifecycle="approved".`);
      console.log('Next: implementation writes remain refused until you run `set-phase --phase implementation` -- approval and implementation-start are separate deliberate acts.');
      // H-AC-11 human-legible briefing (PHX-WP-HUMANLEGIBLE-APPROVAL): the
      // gate presentation shows the same closed-vocabulary briefing derived
      // and persisted at submit-plan time -- never raw digests/paths alone --
      // so the approver sees, in words, exactly what this approval binds.
      const approvedBriefing = written.transition?.state?.planApprovalBriefing;
      console.log(validPlanApprovalBriefing(approvedBriefing)
        ? `Briefing: ${summarizePlanApprovalBriefing(approvedBriefing)}`
        : "Briefing: not available (submission predates the human-legible approval briefing).");
      return 0;
    }

    case "plan-legacy-v2-revocation-recovery": {
      const parsed = parseExactFlags(rest, new Set(["by"]));
      if (!parsed.ok || isBlank(parsed.value.by)) {
        console.error("Error: plan-legacy-v2-revocation-recovery requires exactly --by <human-actor>.");
        return 2;
      }
      const preparedAt = now();
      const planned = planLegacyV2RevocationRecovery({
        state: base,
        expectedStateSha256: sha256CanonicalJson(base),
        by: parsed.value.by,
        at: preparedAt,
      });
      if (!planned.ok) {
        console.error(`Error: legacy V2 revocation recovery is unavailable (${planned.code}); no state was changed.`);
        return 2;
      }
      const record = legacyV2RecoveryPlanRecord({
        by: parsed.value.by,
        preparedAt,
        preimageSha256: planned.preimageSha256,
        postimageSha256: planned.postimageSha256,
      });
      const planSha256 = sha256CanonicalJson(record);
      console.log(JSON.stringify({
        ...record,
        planSha256,
        nextAction: {
          kind: "command",
          executable: "node",
          argv: ["plugins/pipeline-core/scripts/pipeline-state.mjs", ...legacyV2RecoveryApplyAction({
            by: parsed.value.by,
            preparedAt,
            preimageSha256: planned.preimageSha256,
            postimageSha256: planned.postimageSha256,
            planSha256,
          })],
          mutation: true,
          requiresConfirmation: true,
          requiresAttendedHumanOverride: true,
          humanAuthority: {
            kind: "one-time-guard-override",
            admission: "the exact non-ready apply remains guard-denied until the central adapter consumes a fresh Human-authorized capability",
            replay: "the capability is consumed before execution; the State writer separately accepts only the matching zero-write replay",
          },
        },
      }));
      return 0;
    }

    case "apply-legacy-v2-revocation-recovery": {
      const parsed = parseExactFlags(rest, LEGACY_V2_RECOVERY_PLAN_FLAGS);
      if (!parsed.ok || parsed.value.activate !== "true" || isBlank(parsed.value.by)) {
        console.error("Error: apply-legacy-v2-revocation-recovery requires the exact planned --by, --prepared-at, --preimage-sha256, --postimage-sha256, --plan-sha256 and --activate true arguments.");
        return 2;
      }
      const value = parsed.value;
      const record = legacyV2RecoveryPlanRecord({
        by: value.by,
        preparedAt: value["prepared-at"],
        preimageSha256: value["preimage-sha256"],
        postimageSha256: value["postimage-sha256"],
      });
      if (sha256CanonicalJson(record) !== value["plan-sha256"]) {
        console.error("Error: legacy V2 revocation recovery plan digest is invalid; no state was changed.");
        return 2;
      }
      const written = writeState(dir, undefined, base, {
        transition: (observed) => applyLegacyV2RevocationRecovery({
          state: observed,
          expectedPreimageSha256: value["preimage-sha256"],
          expectedPostimageSha256: value["postimage-sha256"],
          by: value.by,
          at: value["prepared-at"],
        }),
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: legacy V2 revocation recovery failed before commit (${written.code}); no recovery was recorded.`);
        return 2;
      }
      const persisted = readState(dir);
      if (persisted.status !== "ok" || sha256CanonicalJson(persisted.state) !== value["postimage-sha256"]) {
        console.error("Error: legacy V2 revocation recovery postimage readback failed; inspect State before retry.");
        return 2;
      }
      syncNextActionDocs(dir, written.transition.state);
      console.log(written.replay
        ? "Legacy V2 revocation recovery already applied; zero-write replay accepted."
        : `Legacy V2 revocation recovery applied by "${value.by}"; lifecycle=\"draft\".`);
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
      syncNextActionDocs(dir, written.transition.state);
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
      const policy = criticalHumanProofPolicy(dir);
      if (!policy.ok) { console.error(`Error: approve-push refused (${policy.code}).`); return 2; }
      // A push cleared in chat mode (ADR-0056) must not demand proof paths the operator
      // deliberately stood down; every other binding stays exactly as strict as before.
      const pushMode = criticalProofWaiverFor(dir, "push");
      if (pushMode.code !== null && pushMode.code !== undefined) {
        console.error(`Error: approve-push refused (${pushMode.code}).`);
        return 2;
      }
      const pushWaived = pushMode.waived === true;
      // H-AC-12: `--decision-reference` is an OPTIONAL flag, admitted into the exact-flag set
      // ONLY when the caller actually passed it. `parseExactFlags` requires every named flag to
      // be PRESENT (`Object.keys(out).length === names.size`), so admitting it unconditionally
      // would break every existing invocation -- presence detection keeps the absent case's
      // flag set, parse result, approval record and state write byte-for-byte unchanged.
      const decisionReferenceRequested = rest.includes("--decision-reference");
      const pushBaseFlags = pushWaived
        ? ["by", "remote", "destination"]
        : ["by", "remote", "destination", "proof-request", "proof-authority", "proof"];
      const expectedFlags = new Set(decisionReferenceRequested ? [...pushBaseFlags, "decision-reference"] : pushBaseFlags);
      const parsed = parseExactFlags(rest, expectedFlags);
      const by = parsed.value?.by;
      if (!parsed.ok || isBlank(by)) {
        console.error(pushWaived
          ? 'Error: approve-push requires --by, --remote and --destination (gates.push_approval is "chat"; no external proof is demanded).'
          // The alternative is named here, not only in an ADR. `signature` is the
          // fail-closed default, so this refusal is what a fresh consumer meets
          // first, and a six-flag ceremony with no stated alternative reads as the
          // only route -- the 2026-08-09 greenfield session hit exactly this, went
          // looking for the route in the plugin's source, and pushed unapproved.
          : 'Error: approve-push requires --by, --remote, --destination, --proof-request, --proof-authority and --proof. '
            + 'The three proof flags are demanded because gates.push_approval is "signature" (its default). '
            + 'To let a human clear a push in-session instead, commit gates.push_approval: chat in pipeline.user.yaml '
            + '(ADR-0056); this command then takes --by, --remote and --destination alone.');
        return 2;
      }
      const head = gitHead(dir);
      if (!head.ok) {
        console.error(`Error: current commit (git rev-parse HEAD) could not be determined: ${head.error}`);
        console.error("Push approval NOT recorded -- forCommit is meaningless without a known commit.");
        return 2;
      }
      const approvedAt = now();
      const remote = parsed.value.remote;
      const destination = parsed.value.destination;
      if (typeof remote !== "string" || !/^[A-Za-z0-9._-]{1,80}$/u.test(remote)
        || typeof destination !== "string" || !/^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/u.test(destination)) {
        console.error("Error: approve-push requires a safe --remote and full --destination ref.");
        return 2;
      }
      if (pushWaived) {
        // AGY-CHATADAPTER-1: closes a confirmed self-approval hole
        // (backlog/items/2026-08-25-chat-mode-push-approval-has-no-enforced-
        // human-turn-boundary.md). The OLD shape took a `--challenge <code>`
        // CLI flag on this same call -- nothing stopped the same automated
        // actor that read the code from this command's own first-run stderr
        // from immediately supplying it back on a second, still fully
        // non-interactive, invocation. There is now no `--challenge` flag at
        // all: a pending challenge is only ever confirmed by re-running this
        // EXACT command (`--by`/`--remote`/`--destination` unchanged, ADR-0056)
        // from a real attended terminal, which `requireAttendedChatGateConfirmation`
        // (`lib/chat-gate-ceremony.mjs`) verifies via `isAttendedTerminal()`
        // BEFORE it ever reads anything -- an agent's own tool-calling harness
        // has no TTY on fd 0, so it cannot complete this step no matter what
        // it pipes into stdin.
        const pending = base?.pendingPushChallenge;
        const hasValidPending = pending && typeof pending.code === "string"
          && pending.forCommit === head.commit
          && pending.remote === remote
          && pending.destination === destination
          && pending.expiresAt && new Date(pending.expiresAt).getTime() > Date.now();
        if (!hasValidPending) {
          const code = `PO-${randomBytes(2).toString("hex").toUpperCase()}`;
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          const challengeState = {
            ...base,
            schema: SCHEMA_ID,
            pendingPushChallenge: { code, forCommit: head.commit, remote, destination, expiresAt },
            updatedAt: approvedAt,
          };
          writeState(dir, challengeState, base);
          console.error(`[PO-CHALLENGE] Human confirmation required for push approval in chat mode.`);
          console.error(`The confirmation code is: ${code}`);
          console.error(`A human must now re-run this EXACT command themselves, directly in their own attended terminal (not through an agent's tool call), and type the code above when prompted:`);
          console.error(`node plugins/pipeline-core/scripts/pipeline-state.mjs approve-push --by ${JSON.stringify(by)} --remote ${JSON.stringify(remote)} --destination ${JSON.stringify(destination)}`);
          return 1;
        }
        const confirmation = requireAttendedChatGateConfirmation({
          summaryLines: [
            "PO PUSH APPROVAL CONFIRMATION -- read before you type the code:",
            `  approved by: ${by}`,
            `  remote/destination: ${remote} -> ${destination}`,
            `  commit: ${head.commit}`,
            `  code: ${pending.code}`,
          ],
          expected: pending.code,
          dependencies: deps,
        });
        if (!confirmation.ok) {
          console.error(confirmation.code === "CHAT-GATE-NOT-ATTENDED"
            ? "Error: approve-push refused (CHAT-GATE-NOT-ATTENDED); this command must be run by the PO directly in their own attended terminal -- an agent's own tool call cannot complete this step."
            : "Error: approve-push refused (CHAT-GATE-CONFIRMATION-MISMATCH); the typed value did not match the confirmation code shown above.");
          return 1;
        }
      }
      const observed = gitCandidate(dir);
      if (!observed.ok || observed.commit !== head.commit) {
        console.error("Error: current candidate commit/tree could not be determined; push proof was not recorded.");
        return 2;
      }
      const threatModel = resolvePushThreatModelArtifact(dir);
      if (!threatModel.ok) {
        // AC-3b: a refusal that only names the code leaves a consumer exactly as
        // stuck as they were before this could be materialized at all -- there is
        // exactly one path now, so there is exactly one refusal that means "it does
        // not exist yet", and it names the exact command that creates it. Any other
        // code (an unsafe file already sitting at that path, for instance) gets the
        // plain code: `materialize-push-threat-model` would only refuse again there.
        console.error(threatModel.code === "CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE"
          ? `Error: approve-push refused (${threatModel.code}); no push threat-model artifact exists yet at ` +
            `${PUSH_THREAT_MODEL_DEFAULT_PATH}. Run the "materialize-push-threat-model" subcommand of this ` +
            "script (from the same project directory as this command) to create it, review it, then retry approve-push."
          : `Error: approve-push refused (${threatModel.code}).`);
        return 2;
      }
      const threatModelBinding = { path: threatModel.path, sha256: threatModel.sha256 };
      const verified = verifyCriticalHumanProof({
        dir, state: base, kind: "push", candidate: observed,
        subject: { sourceCommit: observed.commit, remote, destination, threatModel: threatModelBinding }, flags: parsed.value, now: approvedAt, required: true,
      });
      if (!verified.ok) { console.error(`Error: approve-push refused (${verified.code}); external proof was not consumed.`); return 2; }
      const priorConsumption = base.criticalProofConsumption;
      if (priorConsumption !== undefined && (!Array.isArray(priorConsumption)
        || priorConsumption.some((entry) => !entry || typeof entry !== "object" || typeof entry.proofSha256 !== "string"))) {
        console.error("Error: approve-push refused (CRITICAL-PROOF-CONSUMPTION-INVALID).");
        return 2;
      }
      const consumed = Array.isArray(priorConsumption) ? priorConsumption : [];
      if (verified.proof !== null && consumed.some((entry) => entry.proofSha256 === verified.proof.proofSha256)) {
        console.error("Error: approve-push refused (CRITICAL-PROOF-REPLAY); external proof was already consumed.");
        return 2;
      }
      // H-AC-12: the canonical decision ID is referenced and validated HERE -- after every
      // pre-existing check has passed and before the first mutation, since the grant becomes
      // effective only at `writeState` below. Refusing at this point leaves zero mutation.
      let decisionReference;
      if (decisionReferenceRequested) {
        const decision = evaluateOptInDecisionReference(dir, parsed.value["decision-reference"], observed);
        if (!decision.ok) {
          console.error(`Error: approve-push refused (${decision.code})${decision.detail === undefined ? "" : `; ${decision.detail}`}; human authority was NOT recorded.`);
          return 2;
        }
        decisionReference = decision.reference;
      }
      // The record states on its face what backed it: a consumed proof, or the waiver
      // and its reason. There is no third, unlabelled state.
      const approvalRecord = { approvedBy: by, approvedAt, forCommit: head.commit, criticalProof: verified.proof, remote, destination, threatModel: threatModelBinding };
      if (verified.waived !== undefined) approvalRecord.criticalProofWaiver = verified.waived;
      // Written only when one was supplied and validated, so `hooks/guard-push.mjs`'s own
      // opt-in dual-evaluation (its check (c)) has the reference to re-validate at read time.
      // Absent, the record is byte-identical to what this command wrote before.
      if (decisionReference !== undefined) approvalRecord.decisionReference = decisionReference;
      // NVA-PUSHFOLD-1: this record is written strictly AFTER the signed subject was computed,
      // so it structurally can never be part of the commit it records (backlog/items/2026-08-26-
      // push-approval-record-always-trails-the-signed-commit.md). `pendingAuditWrite: true` is
      // the upfront, immediately-visible hint the PO decision (2026-08-29) asked for: a session
      // reading this file locally -- on the SAME machine, before anything folds this write into
      // a commit -- can tell a push was approved and this exact record has not yet been
      // committed. `push-prepare.mjs`'s `foldPendingPushApprovalWrite()` clears it to `false`
      // the moment it actually commits the record, so the flag is only ever `true` while
      // genuinely uncommitted -- never stale once folded.
      approvalRecord.pendingAuditWrite = true;
      const next = {
        ...base,
        schema: SCHEMA_ID,
        pushApproval: { lastApproved: approvalRecord },
        criticalProofConsumption: verified.proof === null
          ? consumed
          : [...consumed, { proofSha256: verified.proof.proofSha256, kind: "push", consumedAt: approvedAt }],
        updatedAt: approvedAt,
      };
      delete next.pendingPushChallenge;
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      // PHX-2 additive external ledger (opt-in, see design doc §2/§5). Placed immediately
      // after the local write succeeds, and only when there is a real proof to bind (a
      // `chat`-mode waiver has no `criticalProof`, so `verified.proof` is null and there is
      // nothing to externally consume -- see the design's coverage-boundary note). `dir` is
      // passed to `externalPushLedgerGate`/`discoverRepository` for the same reason as the
      // read side: worktree-invariant roots, not the CLI's worktree-local cwd.
      if (verified.proof !== null && externalPushLedgerGate(dir) !== "off") {
        let repository;
        try {
          repository = discoverRepository(dir, { timeout: 5000 });
        } catch {
          // Same >=7-path throw surface as the read side. This can only fire AFTER the local
          // write above has already succeeded, so `pushApproval.lastApproved` and
          // `criticalProofConsumption` for this `proofSha256` are already persisted -- a naive
          // retry with the same proof hits the pre-existing CRITICAL-PROOF-REPLAY guard above.
          // Recovery is a fresh signing ceremony, not a retry (design §4).
          console.error("Error: approve-push refused (PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED).");
          return 2;
        }
        const appended = appendExternalPushLedgerConsumption({
          repositoryFingerprint: derivePoGateRepositoryFingerprint({
            gitCommonDir: repository.commonDir,
            primaryRoot: repository.primaryRoot,
          }),
          proofSha256: verified.proof.proofSha256,
          consumedAt: approvedAt,
        });
        if (!appended.ok) {
          console.error(`Error: approve-push refused (${appended.code}).`);
          return 2;
        }
      }
      console.log(`Push approved by "${by}" for commit ${head.commit} (${approvedAt}).`);
      return 0;
    }

    // AC-3/AC-3b/AC-3c: materializes the plugin's shipped TEMPLATE
    // (`DEFAULT_PUSH_THREAT_MODEL_DOC`) into the project at the conventional
    // default path (`PUSH_THREAT_MODEL_DEFAULT_PATH`), so a consumer that has
    // configured nothing has something to review and `approve-push` has
    // something to bind. Never overwrites: an existing artifact at that path
    // may already back a recorded proof, and changing its bytes would
    // invalidate that proof (M-2 item 4, evidence/cb-1a-measurement.md) --
    // this command therefore refuses outright rather than offering a
    // --force, so there is no accidental route to that outcome.
    case "materialize-push-threat-model": {
      const parsed = parseExactFlags(rest, new Set());
      if (!parsed.ok) {
        // This used to name a `--dir` flag. There is no such flag anywhere in this
        // script -- the project directory comes from CLAUDE_PROJECT_DIR or the cwd
        // (`projectDir()`) -- and `parseExactFlags` is closed, so a consumer who
        // followed the message got this same refusal back for obeying it.
        console.error("Error: materialize-push-threat-model takes no flags; run it from the project directory (or with CLAUDE_PROJECT_DIR set).");
        return 2;
      }
      const target = resolve(dir, PUSH_THREAT_MODEL_DEFAULT_PATH);
      if (existsSync(target)) {
        console.error(
          `Error: materialize-push-threat-model refused -- ${PUSH_THREAT_MODEL_DEFAULT_PATH} already exists. ` +
          "Overwriting it would invalidate every recorded push proof bound to its current bytes; move or " +
          "remove it yourself first if you mean to replace it.",
        );
        return 2;
      }
      let templateBytes;
      try {
        templateBytes = readFileSync(DEFAULT_PUSH_THREAT_MODEL_DOC);
      } catch (err) {
        console.error(`Error: materialize-push-threat-model refused -- the plugin's shipped template could not be read (${err.message}).`);
        return 2;
      }
      let fd;
      try {
        mkdirSync(dirname(target), { recursive: true });
        fd = openSync(target, "wx", 0o644);
        let offset = 0;
        while (offset < templateBytes.length) offset += writeSync(fd, templateBytes, offset, templateBytes.length - offset);
        fsyncSync(fd);
      } catch (err) {
        console.error(`Error: materialize-push-threat-model refused -- could not write ${PUSH_THREAT_MODEL_DEFAULT_PATH} (${err.message}).`);
        return 2;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
      console.log(
        `Created ${PUSH_THREAT_MODEL_DEFAULT_PATH} from the plugin's shipped template. Review it, then commit it ` +
        `(git add ${PUSH_THREAT_MODEL_DEFAULT_PATH}; git commit) BEFORE running approve-push -- the human's ` +
        "signature is meant to bind a file that actually lives inside the pushed project's own tree (M-4); an " +
        "uncommitted file sits only in the working copy and is never part of what git push transmits.",
      );
      return 0;
    }

    // READ-ONLY. Computes and prints the exact `--subject-sha256` an
    // `authorize-critical`/`prepare-critical` call for a push needs, from the SAME
    // inputs `approve-push` itself verifies against (git HEAD/tree via `gitCandidate`,
    // the committed threat-model artifact via `resolvePushThreatModelArtifact`) and the
    // SAME subject shape (`case "approve-push"` above) and candidate narrowing
    // (`{ commit, tree }`, matching `criticalActionSubjectSha256`'s own validator) -- so
    // the printed digest is guaranteed to match what `approve-push` verifies later. This
    // exists because an agent hand-wrote a throwaway script calling
    // `criticalActionSubjectSha256` itself, after ~10 tool calls hunting for the
    // function, rather than being handed this in one call. Never writes state.
    case "prepare-push-subject": {
      const parsed = parseExactFlags(rest, new Set(["by", "remote", "destination"]));
      const by = parsed.value?.by;
      if (!parsed.ok || isBlank(by)) {
        console.error("Error: prepare-push-subject requires --by, --remote and --destination.");
        return 2;
      }
      const remote = parsed.value.remote;
      const destination = parsed.value.destination;
      if (typeof remote !== "string" || !/^[A-Za-z0-9._-]{1,80}$/u.test(remote)
        || typeof destination !== "string" || !/^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/u.test(destination)) {
        console.error("Error: prepare-push-subject requires a safe --remote and full --destination ref.");
        return 2;
      }
      const observed = gitCandidate(dir);
      if (!observed.ok) {
        console.error("Error: prepare-push-subject refused -- current candidate commit/tree could not be determined (git rev-parse failed).");
        return 2;
      }
      const threatModel = resolvePushThreatModelArtifact(dir);
      if (!threatModel.ok) {
        console.error(threatModel.code === "CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE"
          ? `Error: prepare-push-subject refused (${threatModel.code}); no push threat-model artifact exists yet at ` +
            `${PUSH_THREAT_MODEL_DEFAULT_PATH}. Run the "materialize-push-threat-model" subcommand of this ` +
            "script (from the same project directory as this command), commit it, then retry."
          : `Error: prepare-push-subject refused (${threatModel.code}).`);
        return 2;
      }
      const threatModelBinding = { path: threatModel.path, sha256: threatModel.sha256 };
      const candidate = { commit: observed.commit, tree: observed.tree };
      const subject = { sourceCommit: observed.commit, remote, destination, threatModel: threatModelBinding };
      let subjectSha256;
      try {
        subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject });
      } catch (err) {
        console.error(`Error: prepare-push-subject refused -- the subject could not be hashed (${err.message}).`);
        return 2;
      }
      console.log(JSON.stringify({
        schema: "pipeline.push-subject-preview.v1",
        by,
        kind: "push",
        candidate,
        subject,
        subjectSha256,
      }, null, 2));
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
      syncNextActionDocs(dir, next);
      console.log(
        `Feature "${activeFeature.id}" closed by "${by}" (commit ${forCommit ?? "—"}, ${closedAt}). activeFeature removed, planApproved=false.`,
      );
      return 0;
    }

    case "discard-feature": {
      const by = flags.by;
      const reason = flags.reason;
      if (isBlank(by)) {
        console.error('Error: discard-feature requires --by <name> (non-empty) -- an unattributed discard is refused.');
        return 2;
      }
      if (isBlank(reason)) {
        console.error('Error: discard-feature requires --reason <text> (non-empty) -- an unexplained discard is refused.');
        return 2;
      }
      const activeFeature = base.activeFeature;
      if (!activeFeature || typeof activeFeature !== "object") {
        console.error('Error: no active feature present -- nothing to discard.');
        return 2;
      }
      if (isBlank(activeFeature.id) || isBlank(activeFeature.planPath)) {
        console.error('Error: activeFeature.id and activeFeature.planPath must both be non-empty -- discard-feature refused (no unattributed audit entry).');
        return 2;
      }
      if (base.discardedFeatures !== undefined && !Array.isArray(base.discardedFeatures)) {
        console.error('Error: existing discardedFeatures is not an array -- aborting WITHOUT changes (no silent overwrite).');
        return 2;
      }
      // Admitted EXACTLY where close-feature is structurally unsatisfiable
      // (validateContinuityCloseRequest's own gate, :903 -- continuity.authority.result ===
      // null). No continuity at all means close-feature needs only --by and succeeds
      // unconditionally, so this refuses and names it; continuity present with a Result
      // already means the close ceremony is available, so this refuses for the same reason.
      // Never widen this to a heuristic ("was anything implemented").
      if (base.continuity === undefined) {
        console.error('Error: discard-feature refused -- no active continuity gates this feature; close-feature is the route that is available (no Result requirement blocks it).');
        return 2;
      }
      if (base.continuity.authority.result !== null) {
        console.error('Error: discard-feature refused -- continuity.authority.result already exists; close-feature is the route that is available.');
        return 2;
      }
      const discardHead = gitHead(dir);
      let discardForCommit = null;
      if (discardHead.ok) {
        discardForCommit = discardHead.commit;
      } else {
        console.error(`Warning: current commit (git rev-parse HEAD) could not be determined: ${discardHead.error}.`);
        console.error("discard-feature proceeds anyway -- forCommit is recorded as null.");
      }
      const discardedAt = now();
      const priorDiscarded = Array.isArray(base.discardedFeatures) ? base.discardedFeatures : [];
      const discardedEntry = {
        id: activeFeature.id,
        planPath: activeFeature.planPath,
        phaseAtDiscard: activeFeature.phase ?? null,
        discardedAt,
        discardedBy: by,
        reason,
        forCommit: discardForCommit,
      };
      const discardNext = {
        ...base,
        schema: SCHEMA_ID,
        discardedFeatures: [...priorDiscarded, discardedEntry],
        planApproved: false,
        updatedAt: discardedAt,
      };
      delete discardNext.activeFeature;
      delete discardNext.planApproval;
      delete discardNext.planRevocation;
      delete discardNext.planSubmission;
      delete discardNext.planInvalidation;
      delete discardNext.continuity;
      if (!stateWriteSucceeded(writeState(dir, discardNext, base))) {
        return 2;
      }
      syncNextActionDocs(dir, discardNext);
      console.log(
        `Feature "${activeFeature.id}" discarded by "${by}" (commit ${discardForCommit ?? "—"}, ${discardedAt}). Reason: ${reason}. activeFeature removed, planApproved=false.`,
      );
      return 0;
    }

    case "approve-deploy": {
      const policy = criticalHumanProofPolicy(dir);
      if (!policy.ok) { console.error(`Error: approve-deploy refused (${policy.code}).`); return 2; }
      // ADR-0055: a waived kind STAYS in requiredKinds, so `has("deploy")` is not the
      // question — "is the proof still demanded" is. Keying off requiredKinds alone
      // would force the operator to pass three proof paths that are never read.
      const deployProofDemanded = policy.requiredKinds.has("deploy") && !policy.waivers?.has("deploy");
      // H-AC-12: optional `--decision-reference`, admitted only when actually passed -- see
      // approve-push's identical note on why `parseExactFlags` makes unconditional admission a
      // breaking change, and `evaluateOptInDecisionReference` for the dual-evaluation itself.
      const decisionReferenceRequested = rest.includes("--decision-reference");
      const deployBaseFlags = deployProofDemanded
        ? ["env", "artifact", "by", "proof-request", "proof-authority", "proof"]
        : ["env", "artifact", "by"];
      const expectedFlags = new Set(decisionReferenceRequested ? [...deployBaseFlags, "decision-reference"] : deployBaseFlags);
      const parsed = parseExactFlags(rest, expectedFlags);
      const env = parsed.value?.env;
      const artifact = parsed.value?.artifact;
      const by = parsed.value?.by;
      if (!parsed.ok || isBlank(env) || isBlank(artifact) || isBlank(by)) {
        console.error(
          'Error: approve-deploy requires --env, --artifact and --by and, when critical proof is enabled, exactly --proof-request/--proof-authority/--proof.',
        );
        return 2;
      }
      if (base.deployApprovals !== undefined && !Array.isArray(base.deployApprovals)) {
        console.error('Error: existing deployApprovals is not an array -- aborting WITHOUT changes (no silent overwrite).');
        return 2;
      }
      const approvedAt = now();
      let proof = null;
      let waiver = null;
      if (policy.requiredKinds.has("deploy")) {
        const candidate = gitCandidate(dir);
        if (!candidate.ok) { console.error("Error: current candidate commit/tree could not be determined; deploy proof was not recorded."); return 2; }
        const verified = verifyCriticalHumanProof({
          dir, state: base, kind: "deploy", candidate,
          subject: { artifact, environment: env }, flags: parsed.value, now: approvedAt,
        });
        if (!verified.ok) { console.error(`Error: approve-deploy refused (${verified.code}); external proof was not consumed.`); return 2; }
        proof = verified.proof;
        waiver = verified.waived ?? null;
      }
      // H-AC-12: same consumption point as approve-push -- after every pre-existing check,
      // before the first mutation (`writeState` below is where the grant becomes effective).
      let decisionReference;
      if (decisionReferenceRequested) {
        const deployCandidate = gitCandidate(dir);
        if (!deployCandidate.ok) {
          console.error("Error: approve-deploy refused (DECISION-REFERENCE-CANDIDATE-UNRESOLVED); human authority was NOT recorded.");
          return 2;
        }
        const decision = evaluateOptInDecisionReference(dir, parsed.value["decision-reference"], deployCandidate);
        if (!decision.ok) {
          console.error(`Error: approve-deploy refused (${decision.code})${decision.detail === undefined ? "" : `; ${decision.detail}`}; human authority was NOT recorded.`);
          return 2;
        }
        decisionReference = decision.reference;
      }
      const priorApprovals = Array.isArray(base.deployApprovals) ? base.deployApprovals : [];
      // Labelled, exactly as the push record is: a consumed proof, or the waiver that
      // stood it down. A waived approval must never be byte-identical to one recorded
      // under a policy where the kind was never required (ADR-0055 decision 4).
      const entry = {
        forArtifact: artifact, forEnvironment: env, approvedBy: by, approvedAt,
        ...(proof === null ? {} : { criticalProof: proof }),
        ...(waiver === null ? {} : { criticalProofWaiver: waiver }),
        // Absent unless one was supplied and validated -- the entry stays byte-identical then.
        ...(decisionReference === undefined ? {} : { decisionReference }),
      };
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

    // `inspect` -- the ONE consolidated read-only subcommand (NVA-W4-07). Every
    // one of the ~14 mutating writer subcommands above prints a terse,
    // human-prose one-liner (its own contract, left untouched here); a caller
    // that wants CURRENT phase/approval/next-action structured together has had
    // to re-read `docs/state.md`'s "## Next action" section separately (the
    // exact section `syncNextActionDocs` keeps in sync after every mutation)
    // instead of getting it back from the CLI. `inspect` fixes that by reusing
    // the `continuity-result-rebind`/`continuity-result-bootstrap` family's
    // richer structured-JSON pattern (a `schema` field plus nested detail)
    // rather than the terse pattern -- it performs ZERO writes: no lock, no
    // `writeState`, no `syncNextActionDocs` call. `nextActionSection(base)` is
    // the SAME pure renderer those mutating commands call before writing to
    // `docs/state.md`, so the returned text is byte-identical to what a fresh
    // read of that file's section would show, without a second read.
    case "inspect": {
      const lifecycle = derivePlanLifecycle(base);
      const payload = {
        schema: INSPECT_SCHEMA,
        generatedAt: now(),
        // NVA-I-ONEROUTE: `status` and the STRUCTURAL `nextAction` are the fix for
        // backlog/items/2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md
        // -- a blind session following only `nextAction` (onboarding-init.mjs's own
        // contract) previously received the rendered markdown prose here, which is
        // neither a `command` nor a `collect-input` action and carries unfilled
        // placeholders. `nextAction` is now RESERVED for that one protocol meaning;
        // the prose keeps its own field, `nextActionText`, byte-identical to what it
        // always was (`syncStateMdNextAction` writes the SAME prose into the
        // handover -- unchanged).
        status: lifecycle.status,
        activeFeature: base.activeFeature ?? null,
        phase: base.activeFeature?.phase ?? null,
        planApproved: base.planApproved === true,
        lifecycle: { ok: lifecycle.ok, code: lifecycle.code, status: lifecycle.status },
        pushApproval: base.pushApproval ?? null,
        closedFeaturesCount: Array.isArray(base.closedFeatures) ? base.closedFeatures.length : 0,
        phoenixEpicHistory: summarizePhoenixEpicHistory(base.phoenixEpicHistory ?? null),
        nextAction: buildInspectNextAction(dir, base, lifecycle),
        nextActionText: nextActionSection(base),
      };
      console.log(JSON.stringify(payload, null, 2));
      return 0;
    }

    // `--help` is a QUESTION, not an error. Both 2026-08-09 greenfield runs asked
    // it and were told `unknown command "--help"`, which is true and useless: a
    // reader who does not already know the verbs cannot ask for them without first
    // guessing one wrong. The answer is the same list either way; what changes is
    // that asking is no longer a failure. `materialize-push-threat-model` was also
    // missing from that list entirely, while another refusal sends a stuck operator
    // to exactly that command.
    case "--help":
    case "-h":
    case "help": {
      console.log(`Usage: node pipeline-state.mjs <command> [flags]

The project directory comes from CLAUDE_PROJECT_DIR, or the current working
directory. There is no --dir flag.

Commands: ${PIPELINE_STATE_COMMANDS.join(", ")}.

Each command validates its own flags and names what it needs when one is missing.`);
      return 0;
    }

    default: {
      console.error(
        `Error: unknown command "${sub ?? ""}". Allowed: ${PIPELINE_STATE_COMMANDS.join(", ")}. Run "--help" for usage.`,
      );
      return 2;
    }
  }
}

const isDirectRun = (() => {
  try {
    return isDirectInvocation(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  process.exit(run());
}
