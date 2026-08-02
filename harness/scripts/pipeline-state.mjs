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
 *                 --human-decision-file <path>    exact v3 planApproval including its
 *                                                 checkpoint-bound human decision and Spec
 *                                                 binding; PO and human authority are
 *                                                 revalidated under the writer lock.
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
  fsyncSync,
  ftruncateSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
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
  applyCourseDecisionIntent,
  applyDecisionSelection,
  clearCourseDecisionReceipt,
  clearDecisionSelection,
  compareAndSwapContinuity,
  integrateContinuityFinal,
  recordCourseDecisionBrief,
  validateContinuityState,
} from "../../plugins/pipeline-core/lib/continuity-state.mjs";
import {
  canonicalJson as canonicalDecisionJson,
  sha256Canonical,
  validateCourseDecisionBrief,
  validateCourseDecisionIntent,
  validateCourseDecisionReceipt,
} from "../../plugins/pipeline-core/lib/review-economy.mjs";
import { validatePoGateAuthorityForRepository } from "../../plugins/pipeline-core/lib/po-gate-authority.mjs";
import {
  bindPlanSpecApproval,
  bindPlanSpecApprovalWithHumanDecision,
  canonicalJson as canonicalPhxJson,
  revokePlanV2,
  sha256CanonicalJson,
} from "../lib/plan-spec-state-v2.mjs";
import {
  clearGateEstimateForMutation,
  prepareGateEstimateMutation,
  readGateEstimateEvidence,
} from "../../plugins/pipeline-core/lib/gate-estimate.mjs";
import { observeGitSource } from "../../plugins/pipeline-core/lib/source-observation.mjs";
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
} from "../../plugins/pipeline-core/lib/publication-authority.mjs";
import { publicationDigest } from "../../plugins/pipeline-core/lib/publication-bundle.mjs";
import {
  planFeaturePackageBootstrap,
  validateFeaturePackage,
} from "../../plugins/pipeline-core/lib/feature-package-topology.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  readProjectAuthority,
} from "../../plugins/pipeline-core/lib/project-authority.mjs";

export const SCHEMA_ID = "pipeline.state.v0";
export const CONTINUITY_LOCK_SCHEMA_ID = "pipeline.continuity-lock.v0";
export const CONTINUITY_LOCK_STALE_MS = 30_000;
/**
 * Closed Recovery Bridge decision contract. The sole executable consumer is
 * the Phoenix-only adapter below. Every new issuance is bound to the existing
 * repository-scoped PO gate; a local caller can never create PO authority by
 * choosing an attribution string. Legacy terminal records remain inspectable
 * solely for recovery/readback compatibility.
 */
export const RECOVERY_BRIDGE_DECISION_SCHEMA = "pipeline.recovery-bridge-decision.v1";
export const RECOVERY_BRIDGE_PUBLIC_COMMIT_REQUEST_SCHEMA = "pipeline.recovery-bridge-public-commit-request.v1";
export const RECOVERY_BRIDGE_CONSUME_RECEIPT_SCHEMA = "pipeline.recovery-bridge-consume-receipt.v1";
export const RECOVERY_BRIDGE_ISSUANCE_CUTOFF = "2026-10-31T00:00:00.000Z";
const RECOVERY_BRIDGE_PLAN_SCHEMA = "pipeline.recovery-bridge-plan.v1";
const RECOVERY_BRIDGE_TRANSACTION_SCHEMA = "pipeline.recovery-bridge-transaction.v1";
const GOVERNANCE_AUTHORITY_CLI = fileURLToPath(new URL("../../plugins/pipeline-core/scripts/governance-authority.mjs", import.meta.url));
const HUMAN_DECISION_REFERENCE_SCHEMA = "pipeline.human-decision-reference.v1";
const GOVERNANCE_AUTHORITY_READBACK_SCHEMA = "pipeline.governance-authority-readback.v1";
const GOVERNANCE_AUTHORITY_CONSUMPTION_READBACK_SCHEMA = "pipeline.governance-authority-consumption-readback.v1";
const HUMAN_DECISION_CONSUMPTION_SCHEMA = "pipeline.human-decision-consumption.v1";
const RECOVERY_BRIDGE_FEATURE_ID = "sprint-phoenix-epic";
const RECOVERY_BRIDGE_OPERATION = "reconcile-mutable-design";
const RECOVERY_BRIDGE_MANIFEST = "specs/sprint-phoenix-epic/lifecycle.json";
const RECOVERY_BRIDGE_ARTIFACT_PATH = "specs/sprint-phoenix-epic/RECOVERY.md";
const RECOVERY_BRIDGE_ASSURANCE = "po-gate-bound";
const RECOVERY_BRIDGE_ID_RE = /^rb-[a-f0-9]{16,64}$/u;
const RECOVERY_BRIDGE_STATUS_MAX_JOURNALS = 64;
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

function exactRecoveryBridgeRequest(value, schema) {
  const hasApproval = Object.hasOwn(value ?? {}, "approval");
  return exactObjectKeys(value, ["schema", "decisionSha256", ...RECOVERY_BRIDGE_BINDING_KEYS, ...(hasApproval ? ["approval"] : [])])
    && value.schema === schema && SHA256_RE.test(value.decisionSha256)
    && (!hasApproval || validRecoveryBridgeApproval(value.approval));
}

function exactRecoveryBridgeBinding(record, binding) {
  return recoveryBridgeBindingKeys(record).every((key) => samePhxJson(binding[key], record[key]));
}

function validateRecoveryBridgePublicCommit(record, request) {
  return exactRecoveryBridgeRequest(request, RECOVERY_BRIDGE_PUBLIC_COMMIT_REQUEST_SCHEMA)
    && request.decisionSha256 === record.decisionSha256
    && exactRecoveryBridgeBinding(record, request);
}

function validateRecoveryBridgeConsumeReceipt(record, receipt) {
  const hasApproval = Object.hasOwn(receipt ?? {}, "approval");
  return exactObjectKeys(receipt, ["schema", "decisionSha256", ...RECOVERY_BRIDGE_BINDING_KEYS, ...(hasApproval ? ["approval"] : []), "readback"])
    && receipt.schema === RECOVERY_BRIDGE_CONSUME_RECEIPT_SCHEMA && SHA256_RE.test(receipt.decisionSha256)
    && receipt.decisionSha256 === record.decisionSha256 && exactRecoveryBridgeBinding(record, receipt)
    && exactObjectKeys(receipt.readback, ["manifest", "artifactPath", "recoveryPostimageSha256"])
    && receipt.readback.manifest === record.manifest && receipt.readback.artifactPath === record.artifactPath
    && receipt.readback.recoveryPostimageSha256 === record.recoveryPostimageSha256;
}

/**
 * Applies one closed Recovery Bridge transition without mutating `record`.
 * `public-commit` accepts only the exact issued binding; `consume` accepts
 * only the exact committed receipt plus readback binding.
 */
export function transitionRecoveryBridgeDecision(record, action, binding, { now } = {}) {
  const checked = validateRecoveryBridgeDecision(record, { now });
  if (!checked.ok) return checked;
  if (action === "public-commit") {
    if (record.status !== "issued") return { ok: false, code: "RB-TRANSITION" };
    if (!validateRecoveryBridgePublicCommit(record, binding)) return { ok: false, code: "RB-PUBLIC-COMMIT-BINDING" };
    return { ok: true, value: { ...record, status: "public-committed" } };
  }
  if (action === "consume") {
    if (record.status !== "public-committed") return { ok: false, code: "RB-TRANSITION" };
    if (!validateRecoveryBridgeConsumeReceipt(record, binding)) return { ok: false, code: "RB-CONSUME-READBACK-BINDING" };
    return { ok: true, value: { ...record, status: "consumed" } };
  }
  return { ok: false, code: "RB-TRANSITION" };
}
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
]);
const FEATURE_PACKAGE_SUBCOMMANDS = new Set([
  "feature-package-inspect",
  "feature-package-plan",
  "feature-package-apply",
  "feature-package-status",
  "feature-package-recover",
]);
const RECOVERY_BRIDGE_SUBCOMMANDS = new Set([
  "recovery-bridge-plan",
]);
const CONTINUITY_AUTHORITY_REVISION_SUBCOMMANDS = new Set([
  "continuity-authority-revision-plan",
  "continuity-authority-revision-apply",
  "continuity-authority-revision-recover",
]);
const CONTINUITY_RESULT_RECONCILIATION_SUBCOMMANDS = new Set([
  "continuity-result-reconcile-plan",
  "continuity-result-reconcile-apply",
]);
const RESULT_RECONCILIATION_FENCE = Buffer.from("```pipeline-result\n{\"courseDecisionIntents\":[],\"courseDecisionReceipts\":[],\"decisionBriefs\":[],\"finalIntegrations\":[]}\n```\n", "utf8");
const RESULT_RECONCILIATION_SCHEMA = "pipeline.continuity-result-reconcile-plan.v1";
const FEATURE_PACKAGE_REQUEST_SCHEMA = "pipeline.feature-package-transition-request.v1";
const CONTINUITY_AUTHORITY_REVISION_REQUEST_SCHEMA = "pipeline.continuity-authority-revision-request.v1";
const FEATURE_PACKAGE_REQUEST_MAX_BYTES = 65_536;
const PUBLICATION_SUBCOMMANDS = new Set([
  "publication-prepare",
  "publication-approve",
  "publication-authorize",
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
  const authority = readProjectAuthority({ rootDir: dir });
  if (authority.status === "ready") {
    return join(dir, authority.state ?? (authority.source === "neutral" ? NEUTRAL_STATE : LEGACY_STATE));
  }
  return join(dir, authority.status === "missing" ? LEGACY_STATE : NEUTRAL_STATE);
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
    if (nextState.continuity !== undefined) {
      const valid = validateContinuityState(nextState.continuity, nextState.activeFeature?.id);
      if (!valid.ok
        || (expectedState.continuity !== undefined
          && nextState.continuity.revision !== expectedState.continuity.revision)) {
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

function readHumanDecisionReference(dir, requestFile) {
  const parsed = readContinuityRequest(dir, requestFile);
  return parsed.ok
    ? parsed
    : { ok: false, code: "PS-HUMAN-DECISION-FILE" };
}

function humanAuthorityRequest(reference, nowEpochMs) {
  if (!exactObjectKeys(reference, ["schema", "decisionId", "decisionDigest", "candidate", "checkpoint"])
    || reference.schema !== HUMAN_DECISION_REFERENCE_SCHEMA
    || !Number.isSafeInteger(nowEpochMs)) return null;
  return {
    schema: "pipeline.governance-authority-request.v1",
    repositoryFingerprint: reference.checkpoint?.repositoryFingerprint,
    decisionId: reference.decisionId,
    candidate: reference.candidate,
    checkpoint: reference.checkpoint,
    nowEpochMs,
  };
}

function defaultHumanAuthority({ repoRoot, request }) {
  const invoked = spawnSync(process.execPath, [
    GOVERNANCE_AUTHORITY_CLI,
    "--repo", repoRoot,
    "--request-json", canonicalPhxJson(request),
  ], { encoding: "utf8" });
  if (invoked.status !== 0) return { ok: false, code: "PS-HUMAN-AUTHORITY-READBACK" };
  try {
    const value = JSON.parse(invoked.stdout);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, code: "PS-HUMAN-AUTHORITY-READBACK" };
  } catch {
    return { ok: false, code: "PS-HUMAN-AUTHORITY-READBACK" };
  }
}

function humanConsumptionRequest(reference, action, observedAtEpochMs) {
  if (!exactObjectKeys(reference, ["schema", "decisionId", "decisionDigest", "candidate", "checkpoint"])
    || reference.schema !== HUMAN_DECISION_REFERENCE_SCHEMA
    || typeof action !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(action)
    || !Number.isSafeInteger(observedAtEpochMs)) return null;
  const suffix = sha256CanonicalJson({ schema: "pipeline.state-human-consumption.v1", action, reference }).slice(0, 40);
  return {
    schema: "pipeline.governance-authority-consume-request.v1",
    repositoryFingerprint: reference.checkpoint?.repositoryFingerprint,
    decisionId: reference.decisionId,
    decisionDigest: reference.decisionDigest,
    candidate: reference.candidate,
    checkpoint: reference.checkpoint,
    observedAtEpochMs,
    consumption: {
      decisionId: `consume-${suffix}`,
      eventId: `state-consume-${suffix}`,
      idempotencyKey: `state-consume-${suffix}`,
    },
  };
}

function defaultHumanConsumption({ repoRoot, request }) {
  const invoked = spawnSync(process.execPath, [
    GOVERNANCE_AUTHORITY_CLI,
    "--repo", repoRoot,
    "--consume-request-json", canonicalPhxJson(request),
  ], { encoding: "utf8" });
  if (invoked.status !== 0) return { ok: false, code: "PS-HUMAN-CONSUMPTION-READBACK" };
  try {
    const value = JSON.parse(invoked.stdout);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, code: "PS-HUMAN-CONSUMPTION-READBACK" };
  } catch {
    return { ok: false, code: "PS-HUMAN-CONSUMPTION-READBACK" };
  }
}

function matchesHumanAuthorityScope(readback, reference, { featureId, action, environment, candidate }) {
  return exactObjectKeys(readback, ["schema", "granted", "decisionId", "decisionDigest", "scope", "singleUse"])
    && readback.schema === GOVERNANCE_AUTHORITY_READBACK_SCHEMA
    && readback.granted === true
    && readback.decisionId === reference.decisionId
    && readback.decisionDigest === reference.decisionDigest
    && readback.singleUse === true
    && exactObjectKeys(readback.scope, ["repositoryFingerprint", "candidate", "packageId", "action", "environment", "artifacts"])
    && readback.scope.repositoryFingerprint === reference.checkpoint?.repositoryFingerprint
    && canonicalPhxJson(readback.scope.candidate) === canonicalPhxJson(candidate)
    && readback.scope.packageId === featureId
    && readback.scope.action === action
    && readback.scope.environment === environment
    && Array.isArray(readback.scope.artifacts)
    && readback.scope.artifacts.length > 0;
}

function matchesHumanConsumption(readback, request) {
  return exactObjectKeys(readback, ["schema", "consumed", "decisionId", "decisionDigest", "consumptionDecisionId", "checkpoint", "outcome"])
    && readback.schema === GOVERNANCE_AUTHORITY_CONSUMPTION_READBACK_SCHEMA
    && readback.consumed === true
    && readback.decisionId === request.decisionId
    && readback.decisionDigest === request.decisionDigest
    && readback.consumptionDecisionId === request.consumption.decisionId
    && (readback.outcome === "appended" || readback.outcome === "idempotent-replay")
    && exactObjectKeys(readback.checkpoint, ["repositoryFingerprint", "streamId", "sequence", "eventDigest", "candidateCommit", "candidateTree"])
    && readback.checkpoint.repositoryFingerprint === request.repositoryFingerprint
    && readback.checkpoint.streamId === "human"
    && readback.checkpoint.candidateCommit === request.candidate.commit
    && readback.checkpoint.candidateTree === request.candidate.tree;
}

function matchesPlanApprovalHumanAuthority(readback, reference, authority, featureId) {
  if (!exactObjectKeys(readback, ["schema", "granted", "decisionId", "decisionDigest", "scope", "singleUse"])
    || readback.schema !== GOVERNANCE_AUTHORITY_READBACK_SCHEMA
    || readback.granted !== true
    || readback.decisionId !== reference.decisionId
    || readback.decisionDigest !== reference.decisionDigest
    || readback.singleUse !== true
    || !exactObjectKeys(readback.scope, ["repositoryFingerprint", "candidate", "packageId", "action", "environment", "artifacts"])
    || readback.scope.repositoryFingerprint !== authority.repositoryFingerprint
    || canonicalPhxJson(readback.scope.candidate) !== canonicalPhxJson(reference.candidate)
    || readback.scope.packageId !== featureId
    || readback.scope.action !== "APPROVE_PLAN"
    || readback.scope.environment !== "local"
    || !Array.isArray(readback.scope.artifacts)) return false;
  const expectedArtifacts = [
    { path: authority.planPath, sha256: authority.planSha256 },
    { path: authority.specPath, sha256: authority.specSha256 },
  ];
  return expectedArtifacts.every((expected) => readback.scope.artifacts.some((artifact) => exactObjectKeys(artifact, ["path", "sha256"])
    && artifact.path === expected.path && artifact.sha256 === expected.sha256));
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

function readClosedJsonFile(dir, requestFile, maxBytes = FEATURE_PACKAGE_REQUEST_MAX_BYTES) {
  if (typeof requestFile !== "string" || requestFile.length < 1 || requestFile.length > 240
    || isAbsolute(requestFile) || requestFile.includes("\\") || requestFile.includes("\0")) return { ok: false, code: "PS-PHX-REQUEST-FILE" };
  const parts = requestFile.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return { ok: false, code: "PS-PHX-REQUEST-FILE" };
  const path = resolve(dir, requestFile);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > maxBytes) return { ok: false, code: "PS-PHX-REQUEST-FILE" };
    const real = realpathSync(path); const root = realpathSync(dir); const rel = relative(root, real);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return { ok: false, code: "PS-PHX-REQUEST-FILE" };
    const bytes = readFileSync(real, "utf8"); const value = JSON.parse(bytes);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value, bytes, sha256: sha256Bytes(bytes) }
      : { ok: false, code: "PS-PHX-REQUEST" };
  } catch { return { ok: false, code: "PS-PHX-REQUEST" }; }
}

function safePhxId(value) { return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{7,79}$/u.test(value); }
function safeIso(value) { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) && !Number.isNaN(Date.parse(value)); }
function safeOid(value) { return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value); }
function safeRepoArtifact(dir, value) { return hashBoundRepoFile(dir, value, 1_048_576); }
function featureArtifactSetSha256(artifacts) {
  return sha256Bytes(canonicalPhxJson(artifacts.map(({ class: artifactClass, path, authority, mutability, retention }) => ({ class: artifactClass, path, authority, mutability, retention }))));
}
function currentRepoArtifact(dir, path) {
  if (typeof path !== "string" || path.length < 1 || path.length > 240 || isAbsolute(path) || path.includes("\\") || path.includes("\0")) return null;
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  try {
    const root = realpathSync(dir); const candidate = resolve(root, path); const rel = relative(root, candidate);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    const stat = lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 1_048_576) return null;
    const real = realpathSync(candidate); const realRel = relative(root, real);
    if (realRel === "" || realRel === ".." || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) return null;
    return { path, sha256: sha256Bytes(readFileSync(real)) };
  } catch { return null; }
}
function poApprovalDecision(dir, manifest, deps) {
  const state = readState(dir);
  const approval = state.status === "ok" ? state.state.planApproval : null;
  const authority = approval?.poGateAuthority;
  const v2Approval = exactObjectKeys(approval, ["schema", "approvedBy", "approvedAt", "specBoundBy", "specBoundAt", "poGateAuthority"])
    && approval.schema === "pipeline.plan-approval.v2";
  const v3Approval = exactObjectKeys(approval, ["schema", "approvedBy", "approvedAt", "specBoundBy", "specBoundAt", "poGateAuthority", "humanDecision"])
    && approval.schema === "pipeline.plan-approval.v3";
  if (state.status !== "ok" || state.state.planApproved !== true || state.state.activeFeature?.id === undefined
    || state.state.activeFeature.id !== manifest.feature.id || state.state.activeFeature.planPath !== authority?.planPath
    || (!v2Approval && !v3Approval)
    || !exactObjectKeys(authority, ["schema", "humanFacing", "sourceSha256", "runtimeSha256", "receiptSha256", "repositoryFingerprint", "planPath", "planSha256", "specPath", "specSha256"])) return null;
  const observed = (deps.poGateAuthority ?? ((request) => validatePoGateAuthorityForRepository(request)))({ repoRoot: dir, expectedPlanSha256: authority.planSha256, expectedSpecSha256: authority.specSha256 });
  if (!observed?.ok || !samePhxJson(observed.value, authority)) return null;
  if (v3Approval) {
    const request = humanAuthorityRequest(approval.humanDecision, Date.now());
    const resolved = request === null
      ? { ok: false }
      : (deps.humanAuthority ?? defaultHumanAuthority)({ repoRoot: dir, request });
    if (!resolved?.ok || !matchesPlanApprovalHumanAuthority(resolved.value, approval.humanDecision, authority, manifest.feature.id)) return null;
  }
  return { planPath: authority.planPath, planSha256: authority.planSha256, specPath: authority.specPath, specSha256: authority.specSha256, approvalSha256: sha256CanonicalJson(approval) };
}
function exactPoDecision(value) {
  return exactObjectKeys(value, ["planPath", "planSha256", "specPath", "specSha256", "approvalSha256"])
    && typeof value.planPath === "string" && typeof value.specPath === "string"
    && SHA256_RE.test(value.planSha256) && SHA256_RE.test(value.specSha256) && SHA256_RE.test(value.approvalSha256);
}
/** Returns the current, independently revalidated existing PO-gate decision for Phoenix. */
export function recoveryBridgePoApprovalDecision(dir, deps = {}) {
  return poApprovalDecision(dir, { feature: { id: RECOVERY_BRIDGE_FEATURE_ID } }, deps);
}
function isRecoveryBridgeTarget(value) {
  return value?.operation === RECOVERY_BRIDGE_OPERATION
    && value.manifest === RECOVERY_BRIDGE_MANIFEST
    && value.artifactPath === RECOVERY_BRIDGE_ARTIFACT_PATH;
}
function exactRecoveryBridgeAuthority(value) {
  return exactObjectKeys(value, ["class", "decision"])
    && value.class === "recovery-bridge"
    && validateRecoveryBridgeDecision(value.decision).ok;
}
function exactFeatureRequest(value) {
  const mutableDesign = value?.operation === "reconcile-mutable-design";
  const shared = exactObjectKeys(value, mutableDesign
    ? ["schema", "operation", "manifest", "manifestPreimage", "targetState", "manifestBytes", "planReceipt", "authority", "candidate", "evidence", "idempotencyKey", "expiresAt", "artifactSetSha256", "artifactPath"]
    : ["schema", "operation", "manifest", "manifestPreimage", "targetState", "manifestBytes", "planReceipt", "authority", "candidate", "evidence", "idempotencyKey", "expiresAt", "artifactSetSha256"])
    && value.schema === FEATURE_PACKAGE_REQUEST_SCHEMA && value.targetState === "draft"
    && currentRepoArtifactPath(value.manifest) && typeof value.manifestBytes === "string"
    && SHA256_RE.test(value.artifactSetSha256) && value.candidate === null && value.evidence === null
    && safePhxId(value.idempotencyKey) && safeIso(value.expiresAt)
    && (!mutableDesign || currentRepoArtifactPath(value.artifactPath));
  if (!shared || value.authority === null || typeof value.authority !== "object" || Array.isArray(value.authority)) return false;
  return (value.operation === "bootstrap-draft" && value.manifestPreimage === "absent"
    && exactObjectKeys(value.authority, ["class", "decision"])
    && value.authority.class === "lifecycle-bootstrap" && value.authority.decision === null)
    || (isRecoveryBridgeTarget(value) && SHA256_RE.test(value.manifestPreimage)
      && exactRecoveryBridgeAuthority(value.authority))
    || (!isRecoveryBridgeTarget(value) && ["reconcile-draft", "readback-replay", "reconcile-mutable-design"].includes(value.operation)
      && SHA256_RE.test(value.manifestPreimage) && exactObjectKeys(value.authority, ["class", "decision"])
      && value.authority.class === "po-plan-approval" && exactPoDecision(value.authority.decision));
}
function samePhxJson(left, right) { return canonicalPhxJson(left) === canonicalPhxJson(right); }
function currentRepoArtifactPath(path) {
  return typeof path === "string" && path.length > 0 && path.length <= 240
    && !isAbsolute(path) && !path.includes("\\") && !path.includes("\0")
    && !path.split("/").some((part) => part === "" || part === "." || part === "..");
}
function featureJournalPath(dir) { return join(dir, ".claude", "feature-package-transaction.json"); }
function writeBoundFile(path, bytes, lock, directory, deps = {}) {
  const tmp = `${path}.tmp.${lock.ownerNonce}`; let fd; let renamed = false;
  try {
    if (!assertContinuityLockOwned(lock)) return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP" };
    mkdirSync(directory, { recursive: true });
    fd = openSync(tmp, "wx", 0o600); (deps.replaceFdContents ?? replaceFdContents)(fd, bytes); closeSync(fd); fd = undefined;
    if (!assertContinuityLockOwned(lock)) return { ok: false, code: "PS-CONTINUITY-LOCK-OWNERSHIP" };
    (deps.renameSync ?? renameSync)(tmp, path); renamed = true;
    const synced = deps.syncDirectory?.(directory) ?? syncDirectory(directory);
    return synced.ok ? { ok: true } : { ok: false, code: "PS-PHX-DURABILITY-UNKNOWN", committed: true };
  } catch {
    return renamed ? { ok: false, code: "PS-PHX-COMMIT-INDETERMINATE", committed: null } : { ok: false, code: "PS-PHX-WRITE-IO", committed: false };
  } finally { if (fd !== undefined) closeSync(fd); if (!renamed) safeUnlink(tmp); }
}
function featureReceiptPath(request) {
  const base = request.manifest.slice(0, -"lifecycle.json".length);
  return `${base}evidence/lifecycle/feature-package-${request.idempotencyKey}.json`;
}
function featureReceipt(request, outcome) {
  return {
    schema: "pipeline.feature-package-lifecycle-receipt.v1", operation: request.operation, outcome,
    featureId: request.planReceipt.featureId, idempotencyKey: request.idempotencyKey,
    correlation: `fp-${sha256Bytes(canonicalPhxJson({ manifest: request.manifest, postimage: request.manifestBytes, authority: request.authority })).slice(0, 16)}`,
    candidate: null, evidence: null,
  };
}
function lifecycleArtifactDigestRanges(source) {
  let at = 0; const ranges = [];
  const ws = () => { while (/[ \t\r\n]/.test(source[at] ?? "")) at += 1; };
  const string = () => {
    if (source[at] !== '"') throw new Error("string expected");
    const start = at++;
    while (at < source.length) {
      const char = source[at++];
      if (char === '"') return { value: JSON.parse(source.slice(start, at)), start, end: at };
      if (char === "\\") { const escaped = source[at++]; if (escaped === "u") at += 4; }
    }
    throw new Error("unterminated string");
  };
  const value = (path = []) => {
    ws(); const start = at;
    if (source[at] === '"') return string().value;
    if (source[at] === "{") {
      at += 1; const object = {}; const seen = new Set(); ws(); if (source[at] === "}") { at += 1; return object; }
      while (true) {
        ws(); const key = string().value; if (seen.has(key)) throw new Error("duplicate key"); seen.add(key); ws(); if (source[at++] !== ":") throw new Error("colon expected"); ws();
        const childStart = at; object[key] = value([...path, key]); const childEnd = at;
        if (path.length === 2 && path[0] === "artifacts" && /^[0-9]+$/.test(path[1]) && key === "sha256") ranges[Number(path[1])] = { start: childStart, end: childEnd };
        ws(); const separator = source[at++]; if (separator === "}") return object; if (separator !== ",") throw new Error("object separator expected");
      }
    }
    if (source[at] === "[") {
      at += 1; const array = []; ws(); if (source[at] === "]") { at += 1; return array; }
      while (true) { array.push(value([...path, String(array.length)])); ws(); const separator = source[at++]; if (separator === "]") return array; if (separator !== ",") throw new Error("array separator expected"); }
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(source.slice(at));
    if (!literal) throw new Error("value expected"); at += literal[0].length; return JSON.parse(literal[0]);
  };
  value(); ws(); if (at !== source.length) throw new Error("trailing JSON content"); return ranges;
}
function reconcileDraftPreview(dir, manifestPath) {
  const manifest = typeof manifestPath === "string" ? manifestPath : "";
  if (isAbsolute(manifest) || manifest.includes("\\") || manifest.includes("\0") || manifest.split("/").some((part) => part === "" || part === "." || part === "..")) return { ok: false, code: "PS-FEATURE-PREIMAGE" };
  const target = resolve(dir, manifest);
  let bytes; let value; let digestRanges;
  try { bytes = readFileSync(target, "utf8"); value = JSON.parse(bytes); digestRanges = lifecycleArtifactDigestRanges(bytes); } catch { return { ok: false, code: "PS-FEATURE-PREIMAGE" }; }
  const id = manifest.slice("specs/".length, -"/lifecycle.json".length);
  if (!manifest.startsWith("specs/") || !manifest.endsWith("/lifecycle.json") || !safePhxId(id)
    || !exactObjectKeys(value, ["schema", "feature", "state", "artifacts", "candidate", "supersedes"])
    || !exactObjectKeys(value.feature, ["id", "rigor"]) || value.feature.id !== id || value.state !== "draft"
    || !Array.isArray(value.artifacts) || value.candidate !== null || value.supersedes !== null) return { ok: false, code: "PS-FEATURE-PREIMAGE" };
  const expected = [
    ["prd", `${manifest.slice(0, -"lifecycle.json".length)}prd_phoenix-epic.md`],
    ["spec", `${manifest.slice(0, -"lifecycle.json".length)}spec.md`],
    ["acceptance", `${manifest.slice(0, -"lifecycle.json".length)}acceptance.md`],
    ["design", `${manifest.slice(0, -"lifecycle.json".length)}design/architecture.md`],
    ["result", `${manifest.slice(0, -"lifecycle.json".length)}result.md`],
  ];
  const replacements = [];
  for (const [artifactClass, path] of expected) {
    const matches = value.artifacts.filter((artifact) => artifact?.class === artifactClass && artifact.path === path);
    if (matches.length !== 1 || !exactObjectKeys(matches[0], ["class", "path", "sha256", "authority", "mutability", "retention"]) || !SHA256_RE.test(matches[0].sha256)) return { ok: false, code: "PS-FEATURE-RECONCILE-SHAPE" };
    if (artifactClass === "result" && (matches[0].authority !== true || matches[0].mutability !== "append-only" || matches[0].retention !== "active")) return { ok: false, code: "PS-FEATURE-RECONCILE-SHAPE" };
    const current = currentRepoArtifact(dir, path);
    if (!current) return { ok: false, code: "PS-FEATURE-RECONCILE-SOURCE" };
    if (artifactClass === "result" && current.sha256 !== matches[0].sha256) {
      const historical = observeHistoricalResultForReconciliation(dir, path);
      const state = readState(dir); const continuity = state.status === "ok" ? state.state.continuity : null;
      const bound = continuity ? continuityResultMatchesState(dir, continuity) : { ok: false };
      if (!historical?.postimage || sha256Bytes(historical.historical) !== matches[0].sha256
        || !bound.ok || continuity.authority.result?.path !== path || continuity.authority.result.sha256 !== current.sha256) return { ok: false, code: "PS-FEATURE-RECONCILE-RESULT-PROOF" };
    }
    if (current.sha256 !== matches[0].sha256) replacements.push({ index: value.artifacts.indexOf(matches[0]), old: matches[0].sha256, next: current.sha256 });
  }
  if (replacements.length === 0) return { ok: false, code: "PS-FEATURE-RECONCILE-NOOP" };
  let nextBytes = bytes;
  for (const replacement of [...replacements].sort((left, right) => right.index - left.index)) {
    const range = digestRanges[replacement.index];
    if (!range || JSON.parse(bytes.slice(range.start, range.end)) !== replacement.old) return { ok: false, code: "PS-FEATURE-RECONCILE-BYTES" };
    nextBytes = `${nextBytes.slice(0, range.start)}${JSON.stringify(replacement.next)}${nextBytes.slice(range.end)}`;
  }
  let next;
  try { next = JSON.parse(nextBytes); } catch { return { ok: false, code: "PS-FEATURE-RECONCILE-BYTES" }; }
  const changed = value.artifacts.map((artifact, index) => artifact.sha256 === next.artifacts[index]?.sha256 ? 0 : 1).reduce((total, count) => total + count, 0);
  if (changed !== replacements.length || !replacements.every(({ index, next: digest }) => next.artifacts[index]?.sha256 === digest) || featureArtifactSetSha256(value.artifacts) !== featureArtifactSetSha256(next.artifacts)) return { ok: false, code: "PS-FEATURE-RECONCILE-BYTES" };
  return { ok: true, manifest, bytes, value, nextBytes, next, preimage: sha256Bytes(bytes), artifactSetSha256: featureArtifactSetSha256(value.artifacts), receipt: { schema: "pipeline.feature-package-receipt.v1", manifest, manifestSha256: sha256Bytes(nextBytes), featureId: id, state: "draft", candidate: null, artifactCount: next.artifacts.length, findingCount: 0 } };
}
function reconcileMutableDesignPreview(dir, manifestPath, artifactPath) {
  const manifest = typeof manifestPath === "string" ? manifestPath : "";
  if (!currentRepoArtifactPath(manifest) || !currentRepoArtifactPath(artifactPath)) return { ok: false, code: "PS-FEATURE-MUTABLE-DESIGN-PREIMAGE" };
  const target = resolve(dir, manifest);
  let bytes; let value;
  try { bytes = readFileSync(target, "utf8"); value = JSON.parse(bytes); } catch { return { ok: false, code: "PS-FEATURE-MUTABLE-DESIGN-PREIMAGE" }; }
  const id = manifest.slice("specs/".length, -"/lifecycle.json".length);
  if (!manifest.startsWith("specs/") || !manifest.endsWith("/lifecycle.json") || !safePhxId(id)
    || !exactObjectKeys(value, ["schema", "feature", "state", "artifacts", "candidate", "supersedes"])
    || !exactObjectKeys(value.feature, ["id", "rigor"]) || value.feature.id !== id || value.state !== "draft"
    || !Array.isArray(value.artifacts) || value.candidate !== null || value.supersedes !== null) return { ok: false, code: "PS-FEATURE-MUTABLE-DESIGN-PREIMAGE" };
  const matches = value.artifacts.filter((artifact) => artifact?.path === artifactPath);
  if (matches.length !== 1 || !exactObjectKeys(matches[0], ["class", "path", "sha256", "authority", "mutability", "retention"])
    || matches[0].class !== "design" || matches[0].authority !== false || matches[0].mutability !== "mutable" || !SHA256_RE.test(matches[0].sha256)) return { ok: false, code: "PS-FEATURE-MUTABLE-DESIGN-ARTIFACT" };
  const current = currentRepoArtifact(dir, artifactPath);
  if (!current) return { ok: false, code: "PS-FEATURE-MUTABLE-DESIGN-ARTIFACT" };
  if (current.sha256 === matches[0].sha256) return { ok: false, code: "PS-FEATURE-MUTABLE-DESIGN-NOOP" };
  const token = `"sha256": "${matches[0].sha256}"`;
  if (bytes.split(token).length !== 2) return { ok: false, code: "PS-FEATURE-MUTABLE-DESIGN-BYTES" };
  const nextBytes = bytes.replace(matches[0].sha256, current.sha256);
  let next;
  try { next = JSON.parse(nextBytes); } catch { return { ok: false, code: "PS-FEATURE-MUTABLE-DESIGN-BYTES" }; }
  const changed = value.artifacts.map((artifact, index) => artifact.sha256 === next.artifacts[index]?.sha256 ? 0 : 1);
  const targetIndex = value.artifacts.indexOf(matches[0]);
  if (changed.reduce((total, count) => total + count, 0) !== 1 || changed[targetIndex] !== 1
    || featureArtifactSetSha256(value.artifacts) !== featureArtifactSetSha256(next.artifacts)
    || !samePhxJson(value.feature, next.feature) || value.state !== next.state || value.candidate !== next.candidate || value.supersedes !== next.supersedes) return { ok: false, code: "PS-FEATURE-MUTABLE-DESIGN-BYTES" };
  return { ok: true, manifest, artifactPath, bytes, value, nextBytes, next, preimage: sha256Bytes(bytes), artifactSetSha256: featureArtifactSetSha256(value.artifacts), receipt: { schema: "pipeline.feature-package-receipt.v1", manifest, manifestSha256: sha256Bytes(nextBytes), featureId: id, state: "draft", candidate: null, artifactCount: next.artifacts.length, findingCount: 0 } };
}
function mutableDesignPostimage(dir, request) {
  if (!exactFeatureRequest(request) || request.operation !== "reconcile-mutable-design") return false;
  let value;
  try { value = JSON.parse(request.manifestBytes); } catch { return false; }
  const id = request.manifest.slice("specs/".length, -"/lifecycle.json".length);
  if (!request.manifest.startsWith("specs/") || !request.manifest.endsWith("/lifecycle.json") || !safePhxId(id)
    || !exactObjectKeys(value, ["schema", "feature", "state", "artifacts", "candidate", "supersedes"])
    || !exactObjectKeys(value.feature, ["id", "rigor"]) || value.feature.id !== id || value.state !== "draft"
    || !Array.isArray(value.artifacts) || value.candidate !== null || value.supersedes !== null) return false;
  const matches = value.artifacts.filter((artifact) => artifact?.path === request.artifactPath);
  const current = currentRepoArtifact(dir, request.artifactPath);
  return matches.length === 1 && exactObjectKeys(matches[0], ["class", "path", "sha256", "authority", "mutability", "retention"])
    && matches[0].class === "design" && matches[0].authority === false && matches[0].mutability === "mutable"
    && current !== null && current.sha256 === matches[0].sha256 && featureArtifactSetSha256(value.artifacts) === request.artifactSetSha256
    && samePhxJson({ schema: "pipeline.feature-package-receipt.v1", manifest: request.manifest, manifestSha256: sha256Bytes(request.manifestBytes), featureId: id, state: "draft", candidate: null, artifactCount: value.artifacts.length, findingCount: 0 }, request.planReceipt);
}
function existingDraftReadbackPreview(dir, manifestPath) {
  const checked = validateFeaturePackage(dir, manifestPath);
  if (!checked.ok || checked.receipt?.state !== "draft") return { ok: false, code: "PS-FEATURE-READBACK-PREIMAGE" };
  try {
    const bytes = readFileSync(join(dir, checked.receipt.manifest), "utf8"); const value = JSON.parse(bytes);
    return { ok: true, manifest: checked.receipt.manifest, bytes, value, preimage: sha256Bytes(bytes), artifactSetSha256: featureArtifactSetSha256(value.artifacts), receipt: checked.receipt };
  } catch { return { ok: false, code: "PS-FEATURE-READBACK-PREIMAGE" }; }
}
function recoveryBridgeFeatureRequest(dir, decision, deps = {}) {
  const now = deps.now?.() ?? new Date().toISOString();
  const checked = validateRecoveryBridgeDecision(decision, { now });
  if (!checked.ok || decision.status !== "issued") return { ok: false, code: checked.ok ? "RB-ISSUANCE-STATE" : checked.code };
  const prd = currentRepoArtifact(dir, "specs/sprint-phoenix-epic/prd_phoenix-epic.md");
  const spec = currentRepoArtifact(dir, "specs/sprint-phoenix-epic/spec.md");
  const recovery = currentRepoArtifact(dir, RECOVERY_BRIDGE_ARTIFACT_PATH);
  if (!prd || !spec || !recovery || prd.sha256 !== decision.prdSha256 || spec.sha256 !== decision.specSha256
    || recovery.sha256 !== decision.recoveryPostimageSha256) return { ok: false, code: "RB-ARTIFACT-DRIFT" };
  const poApproval = recoveryBridgePoApprovalDecision(dir, deps);
  if (!poApproval || !samePhxJson(poApproval, decision.poApproval)) return { ok: false, code: "RB-PO-AUTHORITY-DRIFT" };
  const preview = reconcileMutableDesignPreview(dir, decision.manifest, decision.artifactPath);
  if (!preview.ok || preview.preimage !== decision.manifestPreimageSha256) return { ok: false, code: "RB-MANIFEST-DRIFT" };
  const request = {
    schema: FEATURE_PACKAGE_REQUEST_SCHEMA, operation: RECOVERY_BRIDGE_OPERATION,
    manifest: decision.manifest, manifestPreimage: preview.preimage, targetState: "draft",
    manifestBytes: preview.nextBytes, planReceipt: preview.receipt,
    artifactSetSha256: preview.artifactSetSha256,
    authority: { class: "recovery-bridge", decision: structuredClone(decision) },
    candidate: null, evidence: null, idempotencyKey: decision.decisionId,
    expiresAt: decision.expiresAt, artifactPath: decision.artifactPath,
  };
  return exactFeatureRequest(request) ? { ok: true, request, preview } : { ok: false, code: "RB-REQUEST-SHAPE" };
}
function exactRecoveryBridgeTransaction(value) {
  return exactObjectKeys(value, ["schema", "decision", "requestSha256"])
    && value.schema === RECOVERY_BRIDGE_TRANSACTION_SCHEMA && SHA256_RE.test(value.requestSha256)
    && validateRecoveryBridgeDecision(value.decision).ok;
}
function recoveryBridgePrivateStore(dir, decisionId, deps = {}, { create = false } = {}) {
  if (!RECOVERY_BRIDGE_ID_RE.test(decisionId)) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
  let common;
  try { common = (deps.gitCommonDir ?? defaultGitCommonDir)(dir); } catch { return { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" }; }
  if (!common?.ok || typeof common.path !== "string" || !isAbsolute(common.path)) return { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" };
  let physical;
  try {
    const declared = lstatSync(common.path);
    if (!declared.isDirectory() || declared.isSymbolicLink()) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
    physical = realpathSync(common.path);
    const stat = lstatSync(physical);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
  } catch { return { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" }; }
  const directory = resolve(physical, "agent-pipeline", "recovery-bridge", decisionId);
  const rel = relative(physical, directory);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
  const parents = [join(physical, "agent-pipeline"), join(physical, "agent-pipeline", "recovery-bridge"), directory];
  if (create) {
    try {
      for (const path of parents) {
        mkdirSync(path, { recursive: true, mode: 0o700 });
        const stat = lstatSync(path);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
      }
    } catch { return { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" }; }
  } else {
    for (const path of parents) {
      try {
        const stat = lstatSync(path);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
      } catch (error) {
        if (error?.code === "ENOENT") return { ok: true, directory, journal: join(directory, "journal.json"), absent: true };
        return { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" };
      }
    }
  }
  return { ok: true, directory, journal: join(directory, "journal.json") };
}
function recoveryBridgeCommitBinding(decision) {
  return { schema: RECOVERY_BRIDGE_PUBLIC_COMMIT_REQUEST_SCHEMA, decisionSha256: decision.decisionSha256, ...recoveryBridgeBinding(decision) };
}
function recoveryBridgeConsumeBinding(decision) {
  return {
    schema: RECOVERY_BRIDGE_CONSUME_RECEIPT_SCHEMA, decisionSha256: decision.decisionSha256,
    ...recoveryBridgeBinding(decision),
    readback: { manifest: decision.manifest, artifactPath: decision.artifactPath, recoveryPostimageSha256: decision.recoveryPostimageSha256 },
  };
}
function recoveryBridgeTransaction(dir, decisionId, deps = {}) {
  const store = recoveryBridgePrivateStore(dir, decisionId, deps);
  if (!store.ok) return store;
  if (store.absent) return { ok: true, value: null, store };
  const journal = readRecoveryBridgeJournal(store);
  if (!journal.ok) return { ...journal, store };
  return exactRecoveryBridgeTransaction(journal.value)
    ? { ok: true, value: journal.value, store }
    : { ok: false, code: "RB-PRIVATE-STORE-INVALID", store };
}

/** Read a journal only after proving its local private-store file invariants. */
function readRecoveryBridgeJournal(store) {
  let stat;
  try { stat = lstatSync(store.journal); } catch (error) {
    return error?.code === "ENOENT" ? { ok: true, value: null } : { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" };
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > FEATURE_PACKAGE_REQUEST_MAX_BYTES) {
    return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
  }
  try {
    const value = JSON.parse(readFileSync(store.journal, "utf8"));
    return { ok: true, value };
  } catch { return { ok: false, code: "RB-PRIVATE-STORE-INVALID" }; }
}

/**
 * Historical Recovery Bridge journals used the predecessor assurance label
 * `operator-local-attested`. A consumed journal cannot authorize a new
 * transition, but its terminal record must not keep the status projection
 * permanently unavailable after the assurance label was strengthened.
 */
function isConsumedLegacyRecoveryBridgeTransaction(value, decisionId) {
  if (!exactObjectKeys(value, ["schema", "decision", "requestSha256"])
    || value.schema !== RECOVERY_BRIDGE_TRANSACTION_SCHEMA
    || !SHA256_RE.test(value.requestSha256)) return false;
  const decision = value.decision;
  if (decision?.decisionId !== decisionId
    || decision?.status !== "consumed"
    || decision?.assurance !== "operator-local-attested"
    || decision?.decisionSha256 !== recoveryBridgeDecisionDigest(decision)) return false;

  // Validate every other target, identity, time, and digest field against the
  // current schema. Recomputing only the replaced assurance proves that this
  // is the exact predecessor terminal form, not a relaxed live authority.
  const normalized = { ...decision, assurance: RECOVERY_BRIDGE_ASSURANCE };
  normalized.decisionSha256 = recoveryBridgeDecisionDigest(normalized);
  return validateRecoveryBridgeDecision(normalized).ok;
}

function recoveryBridgeStatusProjection(dir, deps = {}) {
  let common;
  try { common = (deps.gitCommonDir ?? defaultGitCommonDir)(dir); } catch { return { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" }; }
  if (!common?.ok || typeof common.path !== "string" || !isAbsolute(common.path)) return { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" };
  let physical;
  try {
    const declared = lstatSync(common.path);
    if (!declared.isDirectory() || declared.isSymbolicLink()) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
    physical = realpathSync(common.path);
    const stat = lstatSync(physical);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
  } catch { return { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" }; }
  const root = resolve(physical, "agent-pipeline", "recovery-bridge");
  const rel = relative(physical, root);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
  try {
    const parent = lstatSync(join(physical, "agent-pipeline"));
    if (!parent.isDirectory() || parent.isSymbolicLink()) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
  } catch (error) {
    return error?.code === "ENOENT" ? { ok: true, outstanding: false } : { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" };
  }
  let entries;
  try {
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    return error?.code === "ENOENT" ? { ok: true, outstanding: false } : { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" };
  }
  if (entries.length > RECOVERY_BRIDGE_STATUS_MAX_JOURNALS) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
  let outstanding = false;
  for (const entry of entries) {
    if (!RECOVERY_BRIDGE_ID_RE.test(entry.name)) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
    try {
      const stat = lstatSync(join(root, entry.name));
      if (!stat.isDirectory() || stat.isSymbolicLink()) return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
    } catch { return { ok: false, code: "RB-PRIVATE-STORE-UNAVAILABLE" }; }
    const transaction = recoveryBridgeTransaction(dir, entry.name, deps);
    if (!transaction.ok) {
      const legacy = transaction.store ? readRecoveryBridgeJournal(transaction.store) : null;
      if (legacy?.ok && isConsumedLegacyRecoveryBridgeTransaction(legacy.value, entry.name)) continue;
      return { ok: false, code: transaction.code ?? "RB-PRIVATE-STORE-INVALID" };
    }
    if (transaction.value === null || transaction.value.decision.decisionId !== entry.name) {
      return { ok: false, code: "RB-PRIVATE-STORE-INVALID" };
    }
    if (transaction.value.decision.status === "consumed") continue;
    const checked = validateRecoveryBridgeDecision(transaction.value.decision, { now: deps.now?.() });
    if (!checked.ok) return checked;
    const planned = recoveryBridgeFeatureRequest(dir, { ...transaction.value.decision, status: "issued" }, deps);
    if (!planned.ok || transaction.value.requestSha256 !== sha256Bytes(canonicalPhxJson(planned.request))) {
      return { ok: false, code: planned.code ?? "RB-TRANSACTION-CONFLICT" };
    }
    outstanding = true;
  }
  return { ok: true, outstanding };
}
function recoveryBridgePrepareApply(dir, request, lock, deps = {}) {
  const current = recoveryBridgeTransaction(dir, request.authority.decision.decisionId, deps);
  if (!current.ok) return current;
  const requestSha256 = sha256Bytes(canonicalPhxJson(request));
  if (current.value !== null) {
    if (current.value.requestSha256 !== requestSha256 || current.value.decision.decisionSha256 !== request.authority.decision.decisionSha256) {
      return { ok: false, code: "RB-TRANSACTION-CONFLICT" };
    }
    if (current.value.decision.status === "consumed") return { ok: false, code: "RB-REPLAY" };
    const checked = validateRecoveryBridgeDecision(current.value.decision, { now: deps.now?.() });
    if (!checked.ok) return checked;
    return current.value.decision.status === "public-committed"
      ? { ok: true, decision: current.value.decision }
      : { ok: false, code: "RB-TRANSACTION-STATE" };
  }
  const committed = transitionRecoveryBridgeDecision(request.authority.decision, "public-commit", recoveryBridgeCommitBinding(request.authority.decision), { now: deps.now?.() });
  if (!committed.ok) return committed;
  const transaction = { schema: RECOVERY_BRIDGE_TRANSACTION_SCHEMA, decision: committed.value, requestSha256 };
  const store = recoveryBridgePrivateStore(dir, request.authority.decision.decisionId, deps, { create: true });
  if (!store.ok) return store;
  const wrote = writeBoundFile(store.journal, `${canonicalPhxJson(transaction)}\n`, lock, store.directory, deps);
  return wrote.ok ? { ok: true, decision: committed.value } : { ok: false, code: wrote.code };
}
function recoveryBridgeConsumeApply(dir, request, lock, deps = {}) {
  const current = recoveryBridgeTransaction(dir, request.authority.decision.decisionId, deps);
  if (!current.ok || current.value === null || current.value.requestSha256 !== sha256Bytes(canonicalPhxJson(request))) return { ok: false, code: "RB-TRANSACTION-CONFLICT" };
  if (current.value.decision.status === "consumed") return { ok: true, consumed: true };
  const consumed = transitionRecoveryBridgeDecision(current.value.decision, "consume", recoveryBridgeConsumeBinding(current.value.decision), { now: deps.now?.() });
  if (!consumed.ok) return consumed;
  const transaction = { ...current.value, decision: consumed.value };
  const wrote = writeBoundFile(current.store.journal, `${canonicalPhxJson(transaction)}\n`, lock, current.store.directory, deps);
  return wrote.ok ? { ok: true, consumed: true } : { ok: false, code: wrote.code };
}
function validateFeatureRequest(dir, request, deps = {}) {
  if (!exactFeatureRequest(request)) return { ok: false, code: "PS-FEATURE-REQUEST" };
  if (request.operation === "bootstrap-draft") {
    const preview = planFeaturePackageBootstrap(dir, request.manifest, { targetState: request.targetState, manifestBytes: request.manifestBytes });
    if (preview.status !== "bootstrap-preview" || !samePhxJson(preview.receipt, request.planReceipt) || featureArtifactSetSha256(JSON.parse(request.manifestBytes).artifacts) !== request.artifactSetSha256) return { ok: false, code: "PS-FEATURE-PLAN-BINDING" };
    return { ok: true, preview };
  }
  if (request.operation === "readback-replay") {
    const preview = existingDraftReadbackPreview(dir, request.manifest);
    if (!preview.ok || preview.preimage !== request.manifestPreimage || preview.bytes !== request.manifestBytes
      || preview.artifactSetSha256 !== request.artifactSetSha256 || !samePhxJson(preview.receipt, request.planReceipt)
      || !samePhxJson(poApprovalDecision(dir, preview.value, deps) ?? {}, request.authority.decision)) return { ok: false, code: "PS-FEATURE-PLAN-BINDING" };
    return { ok: true, preview };
  }
  if (request.operation === "reconcile-mutable-design") {
    if (isRecoveryBridgeTarget(request)) {
      const bridged = recoveryBridgeFeatureRequest(dir, request.authority.decision, deps);
      if (!bridged.ok || !samePhxJson(bridged.request, request)) return { ok: false, code: "PS-FEATURE-PLAN-BINDING" };
      return { ok: true, preview: bridged.preview };
    }
    const preview = reconcileMutableDesignPreview(dir, request.manifest, request.artifactPath);
    if (!preview.ok || preview.preimage !== request.manifestPreimage || preview.nextBytes !== request.manifestBytes
      || preview.artifactSetSha256 !== request.artifactSetSha256 || !samePhxJson(preview.receipt, request.planReceipt)
      || !samePhxJson(poApprovalDecision(dir, preview.value, deps) ?? {}, request.authority.decision)) return { ok: false, code: "PS-FEATURE-PLAN-BINDING" };
    return { ok: true, preview };
  }
  const preview = reconcileDraftPreview(dir, request.manifest);
  if (!preview.ok || preview.preimage !== request.manifestPreimage || preview.nextBytes !== request.manifestBytes
    || preview.artifactSetSha256 !== request.artifactSetSha256 || !samePhxJson(preview.receipt, request.planReceipt)
    || !samePhxJson(poApprovalDecision(dir, preview.value, deps) ?? {}, request.authority.decision)) return { ok: false, code: "PS-FEATURE-PLAN-BINDING" };
  return { ok: true, preview };
}
function runRecoveryBridgeCommand(sub, argv, deps) {
  const dir = deps.dir ?? projectDir();
  if (sub !== "recovery-bridge-plan") return 2;
  const parsed = parseExactFlags(argv, new Set(["decision-file"]));
  if (!parsed.ok) return 2;
  const loaded = readClosedJsonFile(dir, parsed.value["decision-file"]);
  if (!loaded.ok) return 2;
  const planned = recoveryBridgeFeatureRequest(dir, loaded.value, deps);
  if (!planned.ok) { console.error(`Error: Recovery Bridge plan refused (${planned.code}).`); return 2; }
  console.log(JSON.stringify({
    schema: RECOVERY_BRIDGE_PLAN_SCHEMA,
    status: "ready",
    request: planned.request,
    requestSha256: sha256Bytes(canonicalPhxJson(planned.request)),
  }));
  return 0;
}
function runFeaturePackageCommand(sub, argv, deps) {
  const dir = deps.dir ?? projectDir();
  if (sub === "feature-package-inspect") {
    const parsed = parseExactFlags(argv, new Set(["manifest"]));
    if (!parsed.ok) return 2;
    const checked = validateFeaturePackage(dir, parsed.value.manifest);
    console.log(JSON.stringify({ schema: "pipeline.feature-package-inspection.v1", status: checked.ok ? "valid" : "rejected", receipt: checked.receipt, findings: checked.findings }));
    return checked.ok ? 0 : 2;
  }
  if (sub === "feature-package-plan") {
    const parsed = parseExactFlags(argv, new Set(["manifest", "proposal-file", "idempotency-key", "expires-at"]));
    if (!parsed.ok || !safePhxId(parsed.value["idempotency-key"]) || !safeIso(parsed.value["expires-at"])) return 2;
    const source = readClosedJsonFile(dir, parsed.value["proposal-file"]);
    if (!source.ok || source.value.targetState !== "draft") return 2;
    let request;
    if (source.value.operation === "bootstrap-draft") {
      if (!exactObjectKeys(source.value, ["operation", "targetState", "manifestBytes"]) || typeof source.value.manifestBytes !== "string") return 2;
      const preview = planFeaturePackageBootstrap(dir, parsed.value.manifest, { targetState: source.value.targetState, manifestBytes: source.value.manifestBytes });
      if (preview.status !== "bootstrap-preview") { console.error(`Error: feature package plan refused (${preview.reason}).`); return 2; }
      let proposed; try { proposed = JSON.parse(source.value.manifestBytes); } catch { return 2; }
      request = { schema: FEATURE_PACKAGE_REQUEST_SCHEMA, operation: "bootstrap-draft", manifest: preview.manifest, manifestPreimage: "absent", targetState: "draft", manifestBytes: source.value.manifestBytes, planReceipt: preview.receipt, artifactSetSha256: featureArtifactSetSha256(proposed.artifacts), authority: { class: "lifecycle-bootstrap", decision: null }, candidate: null, evidence: null, idempotencyKey: parsed.value["idempotency-key"], expiresAt: parsed.value["expires-at"] };
    } else if (source.value.operation === "reconcile-draft") {
      if (!exactObjectKeys(source.value, ["operation", "targetState"])) return 2;
      const preview = reconcileDraftPreview(dir, parsed.value.manifest);
      if (!preview.ok) { console.error(`Error: feature package plan refused (${preview.code}).`); return 2; }
      const decision = poApprovalDecision(dir, preview.value, deps);
      if (decision === null) { console.error("Error: feature package plan refused (PS-FEATURE-PO-APPROVAL)."); return 2; }
      request = { schema: FEATURE_PACKAGE_REQUEST_SCHEMA, operation: "reconcile-draft", manifest: preview.manifest, manifestPreimage: preview.preimage, targetState: "draft", manifestBytes: preview.nextBytes, planReceipt: preview.receipt, artifactSetSha256: preview.artifactSetSha256, authority: { class: "po-plan-approval", decision }, candidate: null, evidence: null, idempotencyKey: parsed.value["idempotency-key"], expiresAt: parsed.value["expires-at"] };
    } else if (source.value.operation === "reconcile-mutable-design") {
      if (!exactObjectKeys(source.value, ["operation", "targetState", "artifactPath"]) || !currentRepoArtifactPath(source.value.artifactPath)) return 2;
      if (parsed.value.manifest === RECOVERY_BRIDGE_MANIFEST && source.value.artifactPath === RECOVERY_BRIDGE_ARTIFACT_PATH) {
        console.error("Error: feature package plan refused (RB-BRIDGE-REQUIRED)."); return 2;
      }
      const preview = reconcileMutableDesignPreview(dir, parsed.value.manifest, source.value.artifactPath);
      if (!preview.ok) { console.error(`Error: feature package plan refused (${preview.code}).`); return 2; }
      const decision = poApprovalDecision(dir, preview.value, deps);
      if (decision === null) { console.error("Error: feature package plan refused (PS-FEATURE-PO-APPROVAL)."); return 2; }
      request = { schema: FEATURE_PACKAGE_REQUEST_SCHEMA, operation: "reconcile-mutable-design", manifest: preview.manifest, manifestPreimage: preview.preimage, targetState: "draft", manifestBytes: preview.nextBytes, planReceipt: preview.receipt, artifactSetSha256: preview.artifactSetSha256, authority: { class: "po-plan-approval", decision }, candidate: null, evidence: null, idempotencyKey: parsed.value["idempotency-key"], expiresAt: parsed.value["expires-at"], artifactPath: preview.artifactPath };
    } else if (source.value.operation === "readback-replay") {
      if (!exactObjectKeys(source.value, ["operation", "targetState"])) return 2;
      const preview = existingDraftReadbackPreview(dir, parsed.value.manifest);
      if (!preview.ok) { console.error(`Error: feature package plan refused (${preview.code}).`); return 2; }
      const decision = poApprovalDecision(dir, preview.value, deps);
      if (decision === null) { console.error("Error: feature package plan refused (PS-FEATURE-PO-APPROVAL)."); return 2; }
      request = { schema: FEATURE_PACKAGE_REQUEST_SCHEMA, operation: "readback-replay", manifest: preview.manifest, manifestPreimage: preview.preimage, targetState: "draft", manifestBytes: preview.bytes, planReceipt: preview.receipt, artifactSetSha256: preview.artifactSetSha256, authority: { class: "po-plan-approval", decision }, candidate: null, evidence: null, idempotencyKey: parsed.value["idempotency-key"], expiresAt: parsed.value["expires-at"] };
    } else return 2;
    console.log(JSON.stringify({ schema: "pipeline.feature-package-plan.v1", status: "ready", request, requestSha256: sha256Bytes(canonicalPhxJson(request)) }));
    return 0;
  }
  if (sub === "feature-package-status") {
    const journal = featureJournalPath(dir);
    const recovery = existsSync(journal);
    if (recovery) {
      console.log(JSON.stringify({ schema: "pipeline.feature-package-status.v1", status: "recovery-required" }));
      return 2;
    }
    const bridge = recoveryBridgeStatusProjection(dir, deps);
    if (!bridge.ok) {
      console.log(JSON.stringify({ schema: "pipeline.feature-package-status.v1", status: "rejected", code: bridge.code }));
      return 2;
    }
    console.log(JSON.stringify({ schema: "pipeline.feature-package-status.v1", status: bridge.outstanding ? "recovery-required" : "ready" }));
    return bridge.outstanding ? 2 : 0;
  }
  const parsed = parseExactFlags(argv, new Set(["request-file", "request-sha256", "lock-token"]));
  if (!parsed.ok || !SHA256_RE.test(parsed.value["request-sha256"]) || !LOCK_TOKEN_RE.test(parsed.value["lock-token"])) return 2;
  const loaded = readClosedJsonFile(dir, parsed.value["request-file"]);
  if (!loaded.ok || sha256Bytes(canonicalPhxJson(loaded.value)) !== parsed.value["request-sha256"]) return 2;
  const request = loaded.value;
  if (!exactFeatureRequest(request)) return 2;
  const bridge = isRecoveryBridgeTarget(request) && request.authority?.class === "recovery-bridge";
  let resumeBridgeWithoutFeatureJournal = false;
  if (sub === "feature-package-recover") {
    const journal = readClosedJsonFile(dir, ".claude/feature-package-transaction.json");
    if (!journal.ok || !samePhxJson(journal.value.request, request)) {
      // This is deliberately narrower than generic recovery: a Bridge may
      // resume only the crash window after its durable private public-commit
      // and before the ordinary public journal exists.  A malformed or
      // foreign journal is not treated as that missing-journal window.
      if (!bridge || existsSync(featureJournalPath(dir))) return 2;
      resumeBridgeWithoutFeatureJournal = true;
    }
  }
  const lock = acquireContinuityLock(dir, parsed.value["lock-token"], deps);
  if (!lock.ok) return 2;
  try {
    if (resumeBridgeWithoutFeatureJournal) {
      const journal = readClosedJsonFile(dir, ".claude/feature-package-transaction.json");
      if (journal.ok && samePhxJson(journal.value.request, request)) {
        resumeBridgeWithoutFeatureJournal = false;
      } else if (existsSync(featureJournalPath(dir))) {
        return 2;
      }
    }
    const target = resolve(dir, request.manifest ?? "");
    const existing = existsSync(target);
    if (bridge) {
      const transaction = recoveryBridgeTransaction(dir, request.authority.decision.decisionId, deps);
      if (!transaction.ok) { console.error(`Error: Recovery Bridge private store refused (${transaction.code}).`); return 2; }
      if (resumeBridgeWithoutFeatureJournal && (transaction.value === null
        || transaction.value.requestSha256 !== sha256Bytes(canonicalPhxJson(request))
        || transaction.value.decision.decisionSha256 !== request.authority.decision.decisionSha256
        || transaction.value.decision.status !== "public-committed")) return 2;
      const consumedRecovery = transaction.value?.decision.status === "consumed";
      if (consumedRecovery && (sub !== "feature-package-recover"
        || transaction.value.requestSha256 !== sha256Bytes(canonicalPhxJson(request)))) return 2;
      let postimage = false;
      try { postimage = existing && readFileSync(target, "utf8") === request.manifestBytes; } catch { return 2; }
      if (postimage && transaction.value === null) return 2;
      if (consumedRecovery && !postimage) return 2;
      if (!postimage) {
        const valid = validateFeatureRequest(dir, request, deps);
        if (!valid.ok || Date.parse(request.expiresAt) < Date.now()) return 2;
      }
      if (!consumedRecovery) {
        const prepared = recoveryBridgePrepareApply(dir, request, lock, deps);
        if (!prepared.ok) { console.error(`Error: Recovery Bridge writer refused (${prepared.code}).`); return 2; }
      }
    }
    if (existing) {
      try {
        const postimage = readFileSync(target, "utf8") === request.manifestBytes
          && (request.operation === "reconcile-mutable-design" ? mutableDesignPostimage(dir, request) : validateFeaturePackage(dir, request.manifest).ok);
        const poCurrent = bridge
          ? true
          : !["reconcile-draft", "reconcile-mutable-design"].includes(request.operation)
            || samePhxJson(poApprovalDecision(dir, JSON.parse(readFileSync(target, "utf8")), deps) ?? {}, request.authority?.decision);
        if (postimage && poCurrent) {
          const receiptPath = resolve(dir, featureReceiptPath(request));
          const receiptBytes = `${canonicalPhxJson(featureReceipt(request, "committed"))}\n`;
          let currentReceipt = null;
          try { currentReceipt = readFileSync(receiptPath, "utf8"); } catch { /* exact replay repairs a missing receipt */ }
          if (currentReceipt !== receiptBytes) {
            const repaired = writeBoundFile(receiptPath, receiptBytes, lock, dirname(receiptPath), deps);
            if (!repaired.ok) return 2;
          }
          if (bridge) {
            const consumed = recoveryBridgeConsumeApply(dir, request, lock, deps);
            if (!consumed.ok) { console.error(`Error: Recovery Bridge consume refused (${consumed.code}).`); return 2; }
          }
          safeUnlink(featureJournalPath(dir));
          console.log(bridge
            ? "RB-CONSUMED: existing writer postimage and exact receipt read back."
            : "PS-FEATURE-DUPLICATE: accepted with zero manifest mutation and exact receipt readback.");
          return 0;
        }
      } catch { /* fall through to conflict */ }
      if (!["reconcile-draft", "reconcile-mutable-design"].includes(request.operation)) return 2;
    }
    const valid = validateFeatureRequest(dir, request, deps);
    if (!valid.ok || Date.parse(request.expiresAt) < Date.now()) return 2;
    const journal = { schema: "pipeline.feature-package-transaction.v1", request: structuredClone(request), requestSha256: sha256Bytes(canonicalPhxJson(request)) };
    const journalWrite = writeBoundFile(featureJournalPath(dir), `${canonicalPhxJson(journal)}\n`, lock, join(dir, ".claude"), deps);
    if (!journalWrite.ok) return 2;
    const manifestWrite = writeBoundFile(target, request.manifestBytes, lock, dirname(target), deps);
    if (!manifestWrite.ok) return 2;
    const readbackOk = request.operation === "reconcile-mutable-design"
      ? mutableDesignPostimage(dir, request)
      : validateFeaturePackage(dir, request.manifest).ok;
    if (!readbackOk) return 2;
    const receiptPath = resolve(dir, featureReceiptPath(request));
    const receiptWrite = writeBoundFile(receiptPath, `${canonicalPhxJson(featureReceipt(request, "committed"))}\n`, lock, dirname(receiptPath), deps);
    if (!receiptWrite.ok) return 2;
    if (bridge) {
      const consumed = recoveryBridgeConsumeApply(dir, request, lock, deps);
      if (!consumed.ok) { console.error(`Error: Recovery Bridge consume refused (${consumed.code}).`); return 2; }
    }
    safeUnlink(featureJournalPath(dir));
    console.log(bridge
      ? "RB-CONSUMED: existing writer manifest and exact receipt read back."
      : "PS-FEATURE-COMMITTED: manifest and public-safe receipt read back.");
    return 0;
  } finally { releaseContinuityLock(lock); }
}

function exactAuthorityRevisionRequest(value) {
  return exactObjectKeys(value, ["schema", "featureId", "expectedRevision", "preStateSha256", "oldAuthority", "nextAuthority", "decision", "candidate", "evidence", "idempotencyKey", "expiresAt"])
    && value.schema === CONTINUITY_AUTHORITY_REVISION_REQUEST_SCHEMA && typeof value.featureId === "string"
    && Number.isSafeInteger(value.expectedRevision) && SHA256_RE.test(value.preStateSha256 ?? "")
    && exactObjectKeys(value.oldAuthority, ["prd", "spec"]) && exactObjectKeys(value.nextAuthority, ["prd", "spec"])
    && exactObjectKeys(value.decision, ["id", "sha256", "scope"]) && safePhxId(value.decision.id) && SHA256_RE.test(value.decision.sha256)
    && exactObjectKeys(value.decision.scope, ["featureId", "phase"]) && value.decision.scope.featureId === value.featureId && value.decision.scope.phase === "design"
    && exactObjectKeys(value.candidate, ["commit", "tree"]) && safeOid(value.candidate.commit) && safeOid(value.candidate.tree)
    && exactObjectKeys(value.evidence, ["sha256"]) && SHA256_RE.test(value.evidence.sha256)
    && safePhxId(value.idempotencyKey) && safeIso(value.expiresAt);
}
function authorityRevisionJournalPath(dir) { return join(dir, ".claude", "continuity-authority-revision-transaction.json"); }
function authorityRevisionApproval(dir, request, deps) {
  const binding = (deps.gitBinding ?? defaultGitBinding)(dir);
  if (!binding?.ok || binding.commit !== request.candidate.commit || binding.tree !== request.candidate.tree) return false;
  // The proposal's decision fields are identifiers, never authority.  Phoenix
  // deliberately has no local fallback: until the human ledger lands, callers
  // must supply the selected candidate-bound PO authority verifier.
  if (typeof deps.authorityRevisionApproval !== "function") return false;
  const expected = {
    schema: "pipeline.continuity-authority-revision-approval.v1",
    featureId: request.featureId, phase: "design", oldAuthority: request.oldAuthority,
    nextAuthority: request.nextAuthority, decision: request.decision,
    candidate: request.candidate, evidence: request.evidence, expiresAt: request.expiresAt,
  };
  let observed;
  try { observed = deps.authorityRevisionApproval({ repoRoot: dir, ...expected }); } catch { return false; }
  return observed?.ok === true && samePhxJson(observed.value, expected);
}
function authorityRevisionCommonBindings(dir, state, request, deps) {
  return state.activeFeature?.id === request.featureId && state.activeFeature?.phase === "design" && state.planApproved !== true
    && safeRepoArtifact(dir, request.oldAuthority.prd) && safeRepoArtifact(dir, request.oldAuthority.spec)
    && safeRepoArtifact(dir, request.nextAuthority.prd) && safeRepoArtifact(dir, request.nextAuthority.spec)
    && Date.parse(request.expiresAt) >= Date.parse((deps.now ?? (() => new Date().toISOString()))()) && authorityRevisionApproval(dir, request, deps);
}
function authorityRevisionLiveBindings(dir, state, current, request, deps, authority = request.oldAuthority) {
  return authorityRevisionCommonBindings(dir, state, request, deps)
    && samePhxJson({ prd: current.authority.prd, spec: current.authority.spec }, authority);
}
function authorityRevisionTransactionAt(preStateBytes, request) {
  try {
    const state = JSON.parse(preStateBytes);
    return safeIso(state?.updatedAt) ? state.updatedAt : request.expiresAt;
  } catch { return null; }
}
function authorityRevisionExpectedPostStateBytes(preStateBytes, request) {
  try {
    const previous = JSON.parse(preStateBytes); const current = previous?.continuity;
    const updatedAt = authorityRevisionTransactionAt(preStateBytes, request);
    if (!current || !safeIso(updatedAt) || !samePhxJson({ prd: current.authority?.prd, spec: current.authority?.spec }, request.oldAuthority)) return null;
    const nextContinuity = structuredClone(current); nextContinuity.revision++;
    nextContinuity.authority.prd = structuredClone(request.nextAuthority.prd); nextContinuity.authority.spec = structuredClone(request.nextAuthority.spec);
    if (nextContinuity.queueHead?.dispatch) {
      nextContinuity.queueHead.dispatch.queueRevision = nextContinuity.revision;
      nextContinuity.queueHead.dispatch.authorityDigests.prdSha256 = request.nextAuthority.prd.sha256;
      nextContinuity.queueHead.dispatch.authorityDigests.specSha256 = request.nextAuthority.spec.sha256;
    }
    if (!validateContinuityState(nextContinuity, request.featureId).ok) return null;
    const receipts = [...(previous.continuityAuthorityRevisionReceipts ?? []), authorityReceipt(request, "committed")];
    return JSON.stringify(clearGateEstimateForMutation({ ...previous, continuity: nextContinuity, continuityAuthorityRevisionReceipts: receipts, updatedAt }), null, 2) + "\n";
  } catch { return null; }
}
function authorityRevisionJournal(request, preStateBytes, postStateBytes) {
  return {
    schema: "pipeline.continuity-authority-revision-transaction.v2", request: structuredClone(request),
    requestSha256: sha256Bytes(canonicalPhxJson(request)), preStateSha256: request.preStateSha256,
    preStateBytesSha256: sha256Bytes(preStateBytes), preStateBytes,
    postStateSha256: sha256CanonicalJson(JSON.parse(postStateBytes)), postStateBytesSha256: sha256Bytes(postStateBytes), postStateBytes,
  };
}
function authorityRevisionJournalKind(value) {
  const core = ["schema", "request", "requestSha256", "preStateSha256", "preStateBytesSha256", "preStateBytes", "postStateSha256", "postStateBytesSha256", "postStateBytes"];
  if (value?.schema === "pipeline.continuity-authority-revision-transaction.v1"
    && (exactObjectKeys(value, core) || (exactObjectKeys(value, [...core, "updatedAt"]) && safeIso(value.updatedAt)))) return "legacy-v1";
  if (value?.schema === "pipeline.continuity-authority-revision-transaction.v2" && exactObjectKeys(value, core)) return "v2";
  return null;
}
function exactAuthorityRevisionJournal(value) {
  return authorityRevisionJournalKind(value) !== null
    && exactAuthorityRevisionRequest(value.request) && value.requestSha256 === sha256Bytes(canonicalPhxJson(value.request))
    && value.preStateSha256 === value.request.preStateSha256 && SHA256_RE.test(value.preStateBytesSha256)
    && SHA256_RE.test(value.postStateSha256) && SHA256_RE.test(value.postStateBytesSha256)
    && typeof value.preStateBytes === "string" && typeof value.postStateBytes === "string"
    && sha256Bytes(value.preStateBytes) === value.preStateBytesSha256 && sha256Bytes(value.postStateBytes) === value.postStateBytesSha256
    && (() => { try { return sha256CanonicalJson(JSON.parse(value.preStateBytes)) === value.preStateSha256 && sha256CanonicalJson(JSON.parse(value.postStateBytes)) === value.postStateSha256; } catch { return false; } })();
}
function authorityReceipt(request, outcome) {
  return { schema: "pipeline.continuity-authority-revision-receipt.v1", operation: "design-revision", outcome,
    oldArtifactDigests: { prd: request.oldAuthority.prd.sha256, spec: request.oldAuthority.spec.sha256 },
    newArtifactDigests: { prd: request.nextAuthority.prd.sha256, spec: request.nextAuthority.spec.sha256 },
    decision: { id: request.decision.id, sha256: request.decision.sha256 }, candidate: request.candidate, evidence: request.evidence,
    idempotencyKey: request.idempotencyKey };
}
function runContinuityAuthorityRevisionCommand(sub, argv, deps) {
  const dir = deps.dir ?? projectDir();
  if (sub === "continuity-authority-revision-plan") {
    const parsed = parseExactFlags(argv, new Set(["proposal-file"]));
    const proposal = parsed.ok ? readClosedJsonFile(dir, parsed.value["proposal-file"]) : null;
    const existing = readState(dir);
    if (!proposal?.ok || existing.status !== "ok" || !exactAuthorityRevisionRequest(proposal.value)) return 2;
    const request = proposal.value; const current = existing.state.continuity;
    if (!current || current.revision !== request.expectedRevision || sha256CanonicalJson(existing.state) !== request.preStateSha256
      || !authorityRevisionLiveBindings(dir, existing.state, current, request, deps)
    ) return 2;
    console.log(JSON.stringify({ schema: "pipeline.continuity-authority-revision-plan.v1", status: "ready", request, requestSha256: sha256Bytes(canonicalPhxJson(request)) }));
    return 0;
  }
  if (sub === "continuity-authority-revision-recover" && argv.length === 0) {
    const journalPath = authorityRevisionJournalPath(dir); const exists = existsSync(journalPath);
    const journal = exists ? readClosedJsonFile(dir, ".claude/continuity-authority-revision-transaction.json") : null;
    const pending = journal?.ok && exactAuthorityRevisionJournal(journal.value);
    const kind = pending ? authorityRevisionJournalKind(journal.value) : null;
    console.log(JSON.stringify({ schema: "pipeline.continuity-authority-revision-recovery.v1", status: !exists ? "no-recovery" : kind === "legacy-v1" ? "recovery-legacy-restore-only" : pending ? "recovery-required" : "recovery-invalid", requestSha256: pending ? journal.value.requestSha256 : null }));
    return exists ? 2 : 0;
  }
  const names = sub === "continuity-authority-revision-recover"
    ? new Set(["request-file", "request-sha256", "lock-token", "mode"])
    : new Set(["request-file", "request-sha256", "lock-token"]);
  const parsed = parseExactFlags(argv, names);
  const loaded = parsed.ok ? readClosedJsonFile(dir, parsed.value["request-file"]) : null;
  if (!parsed.ok || !SHA256_RE.test(parsed.value["request-sha256"]) || !LOCK_TOKEN_RE.test(parsed.value["lock-token"])
    || !loaded?.ok || sha256Bytes(canonicalPhxJson(loaded.value)) !== parsed.value["request-sha256"] || !exactAuthorityRevisionRequest(loaded.value)) return 2;
  const request = loaded.value; const lock = acquireContinuityLock(dir, parsed.value["lock-token"], deps);
  if (!lock.ok) return 2;
  try {
    const journalPath = authorityRevisionJournalPath(dir);
    const journal = readClosedJsonFile(dir, ".claude/continuity-authority-revision-transaction.json");
    if (sub === "continuity-authority-revision-recover") {
      if (!(["complete", "restore"].includes(parsed.value.mode)) || !journal.ok || !exactAuthorityRevisionJournal(journal.value)
        || !samePhxJson(journal.value.request, request)) return 2;
      const journalKind = authorityRevisionJournalKind(journal.value);
      const expectedPostStateBytes = journalKind === "v2" ? authorityRevisionExpectedPostStateBytes(journal.value.preStateBytes, request) : null;
      if (journalKind === "v2" && (expectedPostStateBytes === null || expectedPostStateBytes !== journal.value.postStateBytes
        || sha256Bytes(expectedPostStateBytes) !== journal.value.postStateBytesSha256
        || sha256CanonicalJson(JSON.parse(expectedPostStateBytes)) !== journal.value.postStateSha256)) return 2;
      if (journalKind === "legacy-v1" && parsed.value.mode !== "restore") return 2;
      let observedBytes;
      try { observedBytes = readFileSync(statePath(dir), "utf8"); } catch { return 2; }
      const existing = readState(dir); const current = existing.status === "ok" ? existing.state.continuity : null;
      if (!current || !authorityRevisionCommonBindings(dir, existing.state, request, deps)) return 2;
      const atPreimage = observedBytes === journal.value.preStateBytes && current.revision === request.expectedRevision
        && sha256CanonicalJson(existing.state) === request.preStateSha256;
      const atPostimage = journalKind === "v2" && observedBytes === journal.value.postStateBytes && current.revision === request.expectedRevision + 1
        && sha256CanonicalJson(existing.state) === journal.value.postStateSha256;
      if (!atPreimage && !atPostimage) return 2;
      if ((atPreimage && !authorityRevisionLiveBindings(dir, existing.state, current, request, deps))
        || (atPostimage && !authorityRevisionLiveBindings(dir, existing.state, current, request, deps, request.nextAuthority))) return 2;
      if (parsed.value.mode === "restore") {
        if (atPostimage) {
          const written = atomicWriteContinuityState(dir, JSON.parse(journal.value.preStateBytes), lock, { ...deps, preserveGateEstimate: true });
          if (!written.ok) return 2;
          try { if (readFileSync(statePath(dir), "utf8") !== journal.value.preStateBytes) return 2; } catch { return 2; }
        }
      } else if (atPreimage) {
        const written = atomicWriteContinuityState(dir, JSON.parse(journal.value.postStateBytes), lock, deps);
        if (!written.ok) return 2;
        try { if (readFileSync(statePath(dir), "utf8") !== journal.value.postStateBytes) return 2; } catch { return 2; }
      }
      try { unlinkSync(journalPath); } catch { return 2; }
      console.log(`PS-CONTINUITY-AUTHORITY-RECOVERED: ${parsed.value.mode} retained bound state.`);
      return 0;
    }
    if (existsSync(journalPath)) return 2;
    const existing = readState(dir); const current = existing.status === "ok" ? existing.state.continuity : null;
    if (existing.status !== "ok" || !current) return 2;
    if (!authorityRevisionCommonBindings(dir, existing.state, request, deps)) return 2;
    const receipt = authorityReceipt(request, "committed");
    if (current.revision === request.expectedRevision + 1 && samePhxJson({ prd: current.authority.prd, spec: current.authority.spec }, request.nextAuthority)
      && existing.state.continuityAuthorityRevisionReceipts?.some((entry) => samePhxJson(entry, receipt))) { console.log("PS-CONTINUITY-AUTHORITY-REPLAY: accepted with zero mutation."); return 0; }
    if (current.revision !== request.expectedRevision || sha256CanonicalJson(existing.state) !== request.preStateSha256
      || !authorityRevisionLiveBindings(dir, existing.state, current, request, deps)) return 2;
    const nextContinuity = structuredClone(current); nextContinuity.revision++;
    nextContinuity.authority.prd = structuredClone(request.nextAuthority.prd); nextContinuity.authority.spec = structuredClone(request.nextAuthority.spec);
    if (nextContinuity.queueHead?.dispatch) {
      nextContinuity.queueHead.dispatch.queueRevision = nextContinuity.revision;
      nextContinuity.queueHead.dispatch.authorityDigests.prdSha256 = request.nextAuthority.prd.sha256;
      nextContinuity.queueHead.dispatch.authorityDigests.specSha256 = request.nextAuthority.spec.sha256;
    }
    if (!validateContinuityState(nextContinuity, request.featureId).ok) return 2;
    const receipts = [...(existing.state.continuityAuthorityRevisionReceipts ?? []), receipt];
    const updatedAt = authorityRevisionTransactionAt(readFileSync(statePath(dir), "utf8"), request);
    if (updatedAt === null) return 2;
    const next = clearGateEstimateForMutation({ ...existing.state, continuity: nextContinuity, continuityAuthorityRevisionReceipts: receipts, updatedAt });
    const preStateBytes = readFileSync(statePath(dir), "utf8"); const postStateBytes = JSON.stringify(next, null, 2) + "\n";
    const transaction = authorityRevisionJournal(request, preStateBytes, postStateBytes);
    const journalWrite = writeBoundFile(journalPath, `${canonicalPhxJson(transaction)}\n`, lock, join(dir, ".claude"), deps);
    if (!journalWrite.ok) return 2;
    const written = atomicWriteContinuityState(dir, next, lock, deps);
    if (!written.ok) return 2;
    try { if (readFileSync(statePath(dir), "utf8") !== postStateBytes) return 2; } catch { return 2; }
    try { unlinkSync(journalPath); } catch { return 2; }
    console.log("PS-CONTINUITY-AUTHORITY-COMMITTED: public-safe receipt read back.");
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

/** Current commit/tree tuple for candidate-bound human authority; never guesses a tree. */
function defaultGitCandidate(dir) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
  const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: dir, encoding: "utf8" });
  if (head.error || tree.error || head.status !== 0 || tree.status !== 0
    || !/^[a-f0-9]{40}$/.test(head.stdout?.trim() ?? "") || !/^[a-f0-9]{40}$/.test(tree.stdout?.trim() ?? "")) {
    return { ok: false, error: (head.stderr || tree.stderr || head.error?.message || tree.error?.message || "git candidate unavailable").trim() };
  }
  return { ok: true, candidate: { commit: head.stdout.trim(), tree: tree.stdout.trim() } };
}

function observeHistoricalResultForReconciliation(dir, relativePath) {
  const resolved = resolveResultPathWithoutSymlinks(dir, relativePath);
  if (resolved === null) return null;
  try {
    const bytes = readFileSync(resolved.path);
    const text = bytes.toString("utf8");
    if (bytes.byteLength < 1 || bytes.byteLength > CONTINUITY_RESULT_MAX_BYTES
      || !Buffer.from(text, "utf8").equals(bytes) || text.startsWith("\uFEFF") || text.includes("\r")) return null;
    const postimage = bytes.subarray(Math.max(0, bytes.byteLength - RESULT_RECONCILIATION_FENCE.byteLength)).equals(RESULT_RECONCILIATION_FENCE);
    const historical = postimage ? bytes.subarray(0, bytes.byteLength - RESULT_RECONCILIATION_FENCE.byteLength) : bytes;
    const historicalText = historical.toString("utf8");
    if (historical.byteLength < 1 || /^```pipeline-result(?:\n|$)/mu.test(historicalText)) return null;
    return { ...resolved, bytes, historical, postimage };
  } catch { return null; }
}

function buildResultReconciliationPlan(dir, updatedAt) {
  const existing = readState(dir);
  if (existing.status !== "ok" || typeof updatedAt !== "string") return { ok: false, code: "PS-RESULT-RECONCILE-STATE" };
  const state = existing.state; const continuity = state.continuity;
  if (state.planApproved !== true || state.activeFeature?.phase !== "implementation"
    || !validateContinuityState(continuity, state.activeFeature?.id).ok
    || continuity.queueHead === null || continuity.queueHead.dispatch !== null || continuity.blocker !== null
    || continuity.acknowledgedFinal !== null || continuity.recovery !== null || continuity.decisionTxn !== null
    || continuity.revision >= Number.MAX_SAFE_INTEGER || continuity.authority.result === null) {
    return { ok: false, code: "PS-RESULT-RECONCILE-STATE" };
  }
  const prd = continuity.authority.prd; const spec = continuity.authority.spec;
  if (!hashBoundRepoFile(dir, prd) || !hashBoundRepoFile(dir, spec) || state.activeFeature.planPath !== prd.path) {
    return { ok: false, code: "PS-RESULT-RECONCILE-AUTHORITY" };
  }
  const expectedPath = `${dirname(prd.path).split(sep).join("/")}/result.md`;
  if (continuity.authority.result.path !== expectedPath || !SHA256_RE.test(continuity.authority.result.sha256)) {
    return { ok: false, code: "PS-RESULT-RECONCILE-RESULT" };
  }
  const result = observeHistoricalResultForReconciliation(dir, expectedPath);
  if (result === null) return { ok: false, code: "PS-RESULT-RECONCILE-RESULT" };
  const postBytes = result.postimage ? result.bytes : Buffer.concat([result.historical, RESULT_RECONCILIATION_FENCE]);
  if (postBytes.byteLength > CONTINUITY_RESULT_MAX_BYTES) return { ok: false, code: "PS-RESULT-RECONCILE-SIZE" };
  const stateBytes = readFileSync(statePath(dir));
  const next = clearGateEstimateForMutation({ ...structuredClone(state), continuity: {
    ...structuredClone(continuity), revision: continuity.revision + 1,
    authority: { ...structuredClone(continuity.authority), result: { path: expectedPath, sha256: sha256Bytes(postBytes) } },
    resume: { ...structuredClone(continuity.resume), sourceRevision: continuity.revision + 1 },
  }, updatedAt });
  if (!validateContinuityState(next.continuity, state.activeFeature.id).ok) return { ok: false, code: "PS-RESULT-RECONCILE-POSTIMAGE" };
  const payload = { schema: RESULT_RECONCILIATION_SCHEMA, featureId: state.activeFeature.id,
    expectedRevision: continuity.revision, preStateSha256: sha256Bytes(stateBytes),
    preResult: { path: expectedPath, sha256: sha256Bytes(result.historical) },
    result: { path: expectedPath, sha256: sha256Bytes(postBytes) },
    postStateSha256: sha256Bytes(Buffer.from(JSON.stringify(next, null, 2) + "\n", "utf8")), updatedAt };
  return { ok: true, payload, planSha256: sha256Bytes(canonicalPhxJson(payload)), result, postBytes, next };
}

function atomicWriteReconciledResult(result, bytes, lock) {
  const tmp = `${result.path}.tmp.${lock.ownerNonce}`; let fd;
  try {
    if (!assertContinuityLockOwned(lock)) return false;
    fd = openSync(tmp, "wx", 0o600); replaceFdContents(fd, bytes); closeSync(fd); fd = undefined;
    if (!assertContinuityLockOwned(lock)) return false;
    renameSync(tmp, result.path);
    return syncDirectory(result.parent).ok && readFileSync(result.path).equals(bytes);
  } catch { return false; } finally { if (fd !== undefined) closeSync(fd); safeUnlink(tmp); }
}

function runResultReconciliationCommand(sub, rest, deps) {
  if (sub === "continuity-result-reconcile-plan") {
    if (rest.length !== 0) return 2;
    const planned = buildResultReconciliationPlan(deps.dir, deps.now());
    if (!planned.ok) { console.error(`Error: Result reconciliation plan refused (${planned.code}); zero mutation.`); return 2; }
    console.log(JSON.stringify({ ...planned.payload, planSha256: planned.planSha256 })); return 0;
  }
  const flags = parseExactFlags(rest, new Set(["expected-revision", "expected-state-sha256", "expected-post-state-sha256", "updated-at", "plan-sha256", "activate"]));
  if (!flags.ok || flags.value.activate !== "true" || !SHA256_RE.test(flags.value["expected-state-sha256"] ?? "")
    || !SHA256_RE.test(flags.value["expected-post-state-sha256"] ?? "") || !SHA256_RE.test(flags.value["plan-sha256"] ?? "")) return 2;
  const lock = acquireContinuityLock(deps.dir, "pipeline-result-reconcile-v1", deps);
  if (!lock.ok) return 2;
  try {
    const replayBytes = readFileSync(statePath(deps.dir));
    if (sha256Bytes(replayBytes) === flags.value["expected-post-state-sha256"]) {
      const replay = readState(deps.dir);
      if (replay.status === "ok" && replay.state.continuity?.revision === Number(flags.value["expected-revision"]) + 1
        && replay.state.continuity.authority.result?.sha256 !== undefined) {
        console.log(`PS-RESULT-RECONCILE-REPLAY: continuity revision ${replay.state.continuity.revision}; zero mutation.`); return 0;
      }
      return 2;
    }
    const planned = buildResultReconciliationPlan(deps.dir, flags.value["updated-at"]);
    if (!planned.ok || String(planned.payload.expectedRevision) !== flags.value["expected-revision"]
      || planned.payload.preStateSha256 !== flags.value["expected-state-sha256"]
      || planned.payload.postStateSha256 !== flags.value["expected-post-state-sha256"] || planned.planSha256 !== flags.value["plan-sha256"]) return 2;
    if (!planned.result.postimage && !atomicWriteReconciledResult(planned.result, planned.postBytes, lock)) return 2;
    const written = atomicWriteContinuityState(deps.dir, planned.next, lock, deps);
    if (!written.ok || sha256Bytes(readFileSync(statePath(deps.dir))) !== planned.payload.postStateSha256) return 2;
    console.log(`PS-RESULT-RECONCILED: continuity revision ${planned.next.continuity.revision}; Result and State read back.`); return 0;
  } finally { releaseContinuityLock(lock); }
}

/**
 * Runs the CLI logic. Never calls process.exit itself (testable); returns the exit
 * code. `deps` allows tests to inject `dir`, `now`, and `gitHead` without touching the
 * real filesystem/clock/git.
 */
export function run(argv = process.argv.slice(2), deps = {}) {
  const dir = deps.dir ?? projectDir();
  const now = deps.now ?? (() => new Date().toISOString());
  const nowEpochMs = deps.nowEpochMs ?? (() => Date.now());
  const gitHead = deps.gitHead ?? defaultGitHead;
  const gitCandidate = deps.gitCandidate ?? defaultGitCandidate;
  const poGateAuthority = deps.poGateAuthority ?? ((request) => validatePoGateAuthorityForRepository(request));
  const humanAuthority = deps.humanAuthority ?? defaultHumanAuthority;
  const humanConsumption = deps.humanConsumption ?? defaultHumanConsumption;

  const [sub, ...rest] = argv;
  const flags = parseFlags(rest);

  if (RECOVERY_BRIDGE_SUBCOMMANDS.has(sub)) return runRecoveryBridgeCommand(sub, rest, { ...deps, dir, now });
  if (FEATURE_PACKAGE_SUBCOMMANDS.has(sub)) return runFeaturePackageCommand(sub, rest, { ...deps, dir, now });
  if (CONTINUITY_AUTHORITY_REVISION_SUBCOMMANDS.has(sub)) return runContinuityAuthorityRevisionCommand(sub, rest, { ...deps, dir, now });
  if (CONTINUITY_RESULT_RECONCILIATION_SUBCOMMANDS.has(sub)) return runResultReconciliationCommand(sub, rest, { ...deps, dir, now });
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
      // Cyborg integration point: this writer is the consumer boundary for a
      // `po-approval-proof`-verified decision reference. Its detached proof
      // and trust policy stay outside the repository and must bind this exact
      // plan, Spec, candidate, and policy revision before the ledger reference
      // is accepted as externally attested. `--by` is display attribution only,
      // never proof of a real human authority.
      const authority = poGateAuthority({ repoRoot: dir });
      if (
        !authority?.ok
        || typeof authority.value?.planPath !== "string"
        || authority.value.planPath !== base.activeFeature?.planPath
      ) {
        console.error(`Error: approve-plan blocked by ${authority?.code ?? "PO-GATE-AUTHORITY-INVALID"}; repair the repository-scoped PO profile and single-PRD authority first.`);
        return 2;
      }
      const expectedPlanSha256 = authority.value.planSha256;
      const expectedSpecSha256 = authority.value.specSha256;
      const humanDecision = readHumanDecisionReference(dir, flags["human-decision-file"]);
      const authorityRequest = humanDecision.ok ? humanAuthorityRequest(humanDecision.value, nowEpochMs()) : null;
      const resolvedHumanAuthority = authorityRequest === null
        ? { ok: false, code: "PS-HUMAN-DECISION-INVALID" }
        : humanAuthority({ repoRoot: dir, request: authorityRequest });
      if (!humanDecision.ok || !resolvedHumanAuthority?.ok || !matchesPlanApprovalHumanAuthority(
        resolvedHumanAuthority.value,
        humanDecision.value,
        authority.value,
        base.activeFeature?.id,
      )) {
        console.error("Error: approve-plan requires a verified, checkpoint-bound --human-decision-file scoped to this plan and Spec; no approval was recorded.");
        return 2;
      }
      let approvedAt;
      const written = writeState(dir, undefined, base, {
        transition: (observed) => {
          approvedAt = now();
          const legacyApproval = {
            ...observed,
            schema: SCHEMA_ID,
            planApproved: true,
            planApproval: { approvedBy: by, approvedAt },
            updatedAt: approvedAt,
          };
          delete legacyApproval.planRevocation;
          return bindPlanSpecApprovalWithHumanDecision({
            state: legacyApproval,
            expectedStateSha256: sha256CanonicalJson(legacyApproval),
            poGateAuthority: authority.value,
            expectedPlanSha256,
            expectedSpecSha256,
            humanDecision: humanDecision.value,
            by,
            at: approvedAt,
          });
        },
        beforeCommit: () => {
          const observed = poGateAuthority({ repoRoot: dir, expectedPlanSha256, expectedSpecSha256 });
          if (!observed?.ok || JSON.stringify(observed.value) !== JSON.stringify(authority.value)) {
            return { ok: false, code: observed?.code ?? "PO-GATE-AUTHORITY-STALE" };
          }
          const reread = humanAuthority({ repoRoot: dir, request: authorityRequest });
          return reread?.ok && matchesPlanApprovalHumanAuthority(
            reread.value,
            humanDecision.value,
            authority.value,
            base.activeFeature?.id,
          )
            ? { ok: true }
            : { ok: false, code: reread?.code ?? "PS-HUMAN-AUTHORITY-STALE" };
        },
      });
      if (!stateWriteSucceeded(written)) {
        console.error(`Error: approve-plan authority or v2 transition failed before commit (${written.code}); no approval was recorded.`);
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
        console.error(`Error: revoke-plan requires a current exact v2 or v3 approval (${written.code}); no revocation was recorded.`);
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
      const candidate = gitCandidate(dir);
      if (!candidate.ok) {
        console.error(`Error: current commit/tree could not be determined: ${candidate.error}`);
        console.error("Push approval NOT recorded -- a human decision must bind an exact candidate.");
        return 2;
      }
      const humanDecision = readHumanDecisionReference(dir, flags["human-decision-file"]);
      const authorityRequest = humanDecision.ok ? humanAuthorityRequest(humanDecision.value, nowEpochMs()) : null;
      const resolvedHumanAuthority = authorityRequest === null
        ? { ok: false, code: "PS-HUMAN-DECISION-INVALID" }
        : humanAuthority({ repoRoot: dir, request: authorityRequest });
      const featureId = base.activeFeature?.id;
      if (!humanDecision.ok || typeof featureId !== "string" || !resolvedHumanAuthority?.ok
        || !matchesHumanAuthorityScope(resolvedHumanAuthority.value, humanDecision.value, {
          featureId,
          action: "APPROVE_PUSH",
          environment: "local",
          candidate: candidate.candidate,
        })) {
        console.error("Error: approve-push requires a verified, checkpoint-bound --human-decision-file scoped to this exact candidate; no approval was recorded.");
        return 2;
      }
      const consumptionRequest = humanConsumptionRequest(humanDecision.value, "APPROVE_PUSH", nowEpochMs());
      const consumed = consumptionRequest === null
        ? { ok: false, code: "PS-HUMAN-CONSUMPTION-INVALID" }
        : humanConsumption({ repoRoot: dir, request: consumptionRequest });
      if (!consumed?.ok || !matchesHumanConsumption(consumed.value, consumptionRequest)) {
        console.error("Error: approve-push could not record the immutable one-shot human-decision consumption; no mutable approval was recorded.");
        return 2;
      }
      const approvedAt = now();
      const next = {
        ...base,
        schema: SCHEMA_ID,
        pushApproval: {
          schema: "pipeline.push-approval.v2",
          lastApproved: {
            approvedBy: by,
            approvedAt,
            candidate: candidate.candidate,
            humanDecision: humanDecision.value,
            consumption: {
              schema: HUMAN_DECISION_CONSUMPTION_SCHEMA,
              decisionId: consumptionRequest.consumption.decisionId,
              decisionDigest: humanDecision.value.decisionDigest,
              checkpoint: consumed.value.checkpoint,
            },
          },
        },
        updatedAt: approvedAt,
      };
      if (!stateWriteSucceeded(writeState(dir, next, base))) {
        return 2;
      }
      console.log(`Push approved by "${by}" for candidate ${candidate.candidate.commit} (${approvedAt}).`);
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
        `Error: unknown command "${sub ?? ""}". Allowed: set-feature, set-phase, set-gate-estimate, approve-plan, revoke-plan, bind-plan-spec, approve-push, close-feature, approve-deploy, consume-deploy, clear-deploy, recovery-bridge-plan, feature-package-inspect, feature-package-plan, feature-package-apply, feature-package-status, feature-package-recover, continuity-init, continuity-cas, continuity-authority-revision-plan, continuity-authority-revision-apply, continuity-authority-revision-recover, continuity-integrate-final, continuity-record-course-brief, continuity-select-course, continuity-apply-decision, continuity-clear-decision, publication-prepare, publication-approve, publication-authorize, publication-observe, publication-start-readback, publication-close, publication-rearm, publication-block.`,
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
