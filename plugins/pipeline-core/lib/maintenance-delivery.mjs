/**
 * ADR-0097 (D249, K-28): the maintenance delivery. A Goldfish item binding names `maintenance` instead of a criterion locator when it
 * repairs a check that was red before the feature and that no criterion of the approved Spec covers. This module holds the parts the
 * binding generator, the host admission and the PO acknowledgement share:
 *
 *   validMaintenanceBinding         the closed `pipeline.maintenance-binding.v1` object (no criterion, no proof reference: the host
 *                                   derives the proof itself and never takes it from the briefing)
 *   maintenanceCheckSha256          the identity of the one red check (canonical JSON of the check object)
 *   maintenanceScopeRefusal         the narrow write scope: test- or tooling-shaped, never a gate-strength path, never under specs/
 *   maintenanceCheckIdentity        what runs: { verify: "configured" }, { command } or { path } -- the key of the three records below
 *   red observation                 written by maintenance-red-check.mjs observe after running the check on the clean HEAD of the real
 *                                   checkout, kept in private state under <git-common-dir>/agent-pipeline/maintenance/observations/
 *   preApprovalRedReceipt           a sealed red Verify suite receipt at or before the plan-approval commit (the mechanical route)
 *   maintenanceAcknowledgement      the PO's acknowledgement (kind acknowledge-maintenance-red-check), the fallback route
 *   maintenanceRedProof             receipt first, then acknowledgement, else null
 *
 * Nothing here runs a check; scripts/maintenance-red-check.mjs runs it and hands the result in.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, writeSync, constants } from "node:fs";
import { join } from "node:path";
import { GATE_STRENGTH_PATHS } from "../hooks/guard-gate-strength.mjs";
import { MAINTENANCE_RED_ACKNOWLEDGEMENT_KIND } from "./critical-action-approval-request.mjs";
import { readPrivateApprovals } from "./critical-action-authorization.mjs";
import { validateVerifySuiteReceipt } from "./verify-resume.mjs";
import { resolveAuthorityArtifactPath } from "./project-authority-read.mjs";
import { sha256CanonicalJson } from "./plan-spec-state-v2.mjs";

export { MAINTENANCE_RED_ACKNOWLEDGEMENT_KIND };
export const MAINTENANCE_BINDING_SCHEMA = "pipeline.maintenance-binding.v1";
export const MAINTENANCE_RED_OBSERVATION_SCHEMA = "pipeline.maintenance-red-observation.v1";
export const MAINTENANCE_ACK_SUBJECT_SCHEMA = "pipeline.maintenance-red-check-subject.v1";
/** The check form that names the project's top-level verify command; admitted only in a maintenance binding. */
export const CONFIGURED_VERIFY_CHECK = "verify:configured";
/** The label every acknowledged proof carries in the queue row, the Critic packet and the audit trail. */
export const MAINTENANCE_ACK_LABEL = "red before the feature acknowledged by the PO";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SAFE_SUITE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAX_RUNS = 512;

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** The closed maintenance binding of an item delivery: exactly `{ schema }`. */
export function validMaintenanceBinding(value) {
  return object(value) && Object.keys(value).length === 1 && value.schema === MAINTENANCE_BINDING_SCHEMA;
}

/** True when the check object is the maintenance-only configured-verify form `{ id, path, verify: "configured", dependencies }`. */
export function isConfiguredVerifyCheck(check) {
  return object(check) && Object.hasOwn(check, "verify") && check.verify === "configured";
}

/**
 * What runs when the check runs, without the dispatch-specific id and dependency list: `{ verify: "configured" }`, `{ command }` or
 * `{ path }` (a .test file). The observation, the receipt route and the acknowledgement all key on it, so a check observed red before a
 * binding exists is the same check the binding later names. A document check is never a maintenance check (null).
 */
export function maintenanceCheckIdentity(check) {
  if (!object(check) || Object.hasOwn(check, "document")) return null;
  if (isConfiguredVerifyCheck(check)) return { verify: "configured" };
  if (typeof check.command === "string" && check.command !== "") return { command: check.command };
  if (Object.hasOwn(check, "verify") || Object.hasOwn(check, "command")) return null;
  return typeof check.path === "string" && CHECK_TEST_FILE.test(check.path) ? { path: check.path } : null;
}

export function maintenanceCheckSha256(check) {
  const identity = maintenanceCheckIdentity(check);
  return identity === null ? null : sha256(canonical(identity));
}

/** The Verify suite a check's red receipt is filed under, or null when the check form has no suite of its own. */
export function maintenanceReceiptSuite(check) {
  if (isConfiguredVerifyCheck(check)) return "configured-verify";
  if (object(check) && typeof check.command === "string" && SAFE_SUITE.test(`project-${check.command}`)) return `project-${check.command}`;
  return null;
}

const TEST_FILE = /(?:^|\/)[^/]+\.(?:test|spec)\.[A-Za-z0-9]+$/u;
/** A .test file a check can name: the forms dispatch-briefing.mjs binds and `node --test` runs. */
const CHECK_TEST_FILE = /\.test\.(?:mjs|cjs|js)$/u;
const TOOLING_SEGMENTS = new Set(["test", "tests", "__tests__", "fixtures", "scripts", "tools"]);

function gateStrengthRule(path) {
  const lower = path.toLowerCase();
  return GATE_STRENGTH_PATHS.find((rule) => (rule.path.endsWith("/*")
    ? lower.startsWith(rule.path.slice(0, -1).toLowerCase())
    : lower === rule.path.toLowerCase())) ?? null;
}

/**
 * The narrow write scope of a maintenance delivery (ADR-0097 Decision 2). Every path must be test- or tooling-shaped, outside the
 * gate-strength table (which holds the ADR-0096 gate-definition set) and outside specs/ (the approved PRD, Spec and addenda).
 * Being a dependency of the check is checked by the caller with the existing item-scope rule. `null` or a typed refusal.
 */
export function maintenanceScopeRefusal(writeScope) {
  const refuse = (path, why) => ({ code: "SQ-MAINTENANCE-SCOPE", path,
    reason: `${path} is outside a maintenance scope: ${why}`,
    repair: "a maintenance delivery writes only test- or tooling-shaped paths (a *.test.* or *.spec.* file, or a path with a test, tests, __tests__, fixtures, scripts or tools segment) that the check depends on; a fix elsewhere needs a Spec criterion (design route)" });
  if (!Array.isArray(writeScope) || writeScope.length === 0) return { code: "SQ-MAINTENANCE-SCOPE", path: null, reason: "the write scope is empty", repair: "name the test or tooling paths the fix changes" };
  for (const path of writeScope) {
    if (typeof path !== "string" || path === "") return refuse(String(path), "not a path");
    const rule = gateStrengthRule(path);
    if (rule !== null) return refuse(path, `it is the gate-strength path ${rule.id}, which decides how strong a gate is (ADR-0096)`);
    if (path.toLowerCase().startsWith("specs/")) return refuse(path, "the approved PRD, Spec and their addenda are never changed by a maintenance delivery (ADR-0095)");
    const segments = path.split("/").slice(0, -1);
    if (!TEST_FILE.test(path) && !segments.some((segment) => TOOLING_SEGMENTS.has(segment))) return refuse(path, "it is neither a test file nor under a test, fixtures, scripts or tools folder");
  }
  return null;
}

/* ---- red observation (private state) ---- */

export function maintenanceObservationDirectory(commonDir) {
  return join(commonDir, "agent-pipeline", "maintenance", "observations");
}

function observationName(checkSha256, commit) {
  return `${sha256(`${checkSha256}:${commit}`)}.json`;
}

/** The record the binding generator writes after running the check. Fields are validated; the file is created once (wx, 0600). */
export function writeMaintenanceRedObservation({ commonDir, featureId, check, candidate, exitCode, signal = null, outputSha256, observedAt }) {
  if (typeof commonDir !== "string" || commonDir === "" || typeof featureId !== "string" || featureId === "" || !object(check)
    || !object(candidate) || !OID.test(candidate.commit ?? "") || !OID.test(candidate.tree ?? "")
    || !(Number.isSafeInteger(exitCode) || exitCode === null) || !SHA.test(outputSha256 ?? "") || !Number.isFinite(Date.parse(observedAt ?? ""))) {
    return { ok: false, code: "MAINTENANCE-OBSERVATION-INPUT" };
  }
  const checkSha256 = maintenanceCheckSha256(check);
  if (checkSha256 === null) return { ok: false, code: "MAINTENANCE-OBSERVATION-CHECK" };
  const record = { schema: MAINTENANCE_RED_OBSERVATION_SCHEMA, featureId, check: maintenanceCheckIdentity(check), checkSha256, candidate: { commit: candidate.commit, tree: candidate.tree },
    exitCode, signal: typeof signal === "string" ? signal : null, red: exitCode !== 0 || typeof signal === "string", outputSha256, observedAt };
  const directory = maintenanceObservationDirectory(commonDir);
  const path = join(directory, observationName(checkSha256, candidate.commit));
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (lstatSync(directory).isSymbolicLink()) return { ok: false, code: "MAINTENANCE-OBSERVATION-UNSAFE" };
    let fd;
    try {
      // A later run at the same commit replaces nothing: the first observation stands, so a green rerun cannot hide a red one or the reverse.
      fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
      fsyncSync(fd);
    } finally { if (fd !== undefined) closeSync(fd); }
  } catch (error) {
    if (error?.code !== "EEXIST") return { ok: false, code: "MAINTENANCE-OBSERVATION-WRITE" };
    const existing = readMaintenanceRedObservation({ commonDir, check, candidate });
    return existing === null ? { ok: false, code: "MAINTENANCE-OBSERVATION-UNREADABLE" } : { ok: true, record: existing, existing: true };
  }
  return { ok: true, record, existing: false };
}

/** The observation of exactly this check at exactly this candidate (commit and tree), or null. */
export function readMaintenanceRedObservation({ commonDir, check, candidate }) {
  if (typeof commonDir !== "string" || !object(check) || !object(candidate) || !OID.test(candidate.commit ?? "")) return null;
  const checkSha256 = maintenanceCheckSha256(check);
  if (checkSha256 === null) return null;
  const path = join(maintenanceObservationDirectory(commonDir), observationName(checkSha256, candidate.commit));
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) return null;
    const record = JSON.parse(readFileSync(path, "utf8"));
    if (!object(record) || record.schema !== MAINTENANCE_RED_OBSERVATION_SCHEMA || record.checkSha256 !== checkSha256
      || maintenanceCheckSha256(record.check) !== checkSha256 || record.candidate?.commit !== candidate.commit
      || record.candidate?.tree !== candidate.tree || typeof record.red !== "boolean"
      || record.red !== (record.exitCode !== 0 || typeof record.signal === "string")) return null;
    return record;
  } catch { return null; }
}

/** Every observation of the feature at this candidate (the acknowledgement subject lists the red ones). */
export function listMaintenanceRedObservations({ commonDir, featureId, candidate }) {
  const found = [];
  let names = [];
  try { names = readdirSync(maintenanceObservationDirectory(commonDir)).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name)).sort(); } catch { return found; }
  for (const name of names.slice(0, 4096)) {
    let record;
    try { record = JSON.parse(readFileSync(join(maintenanceObservationDirectory(commonDir), name), "utf8")); } catch { continue; }
    if (!object(record) || record.featureId !== featureId || !object(record.check)) continue;
    const confirmed = readMaintenanceRedObservation({ commonDir, check: record.check, candidate });
    if (confirmed !== null && confirmed.featureId === featureId) found.push(confirmed);
  }
  return found;
}

/* ---- plan-approval anchor and the receipt route ---- */

function gitRunner(root) {
  return (args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
}
const gitOk = (result) => result && !result.error && result.status === 0;

/**
 * The commit that recorded the plan approval: the oldest first-parent commit of HEAD that added the approval's anchor file (the
 * accepted-contract envelope of a v9 approval, otherwise the design approval request). Null when it cannot be read.
 */
export function planApprovalCommit({ root, state, runGit = null }) {
  const anchor = state?.planApproval?.acceptedContract?.path ?? state?.planPresentation?.designApprovalRequestPath ?? null;
  if (typeof anchor !== "string" || anchor === "" || anchor.startsWith("/") || anchor.includes("..")) return null;
  const git = runGit ?? gitRunner(root);
  const listed = git(["log", "--first-parent", "--diff-filter=A", "--format=%H", "--", anchor]);
  if (!gitOk(listed)) return null;
  const commits = String(listed.stdout).trim().split("\n").filter((line) => OID.test(line));
  return commits.length === 0 ? null : commits[commits.length - 1];
}

/**
 * The mechanical route (ADR-0097 Decision 3): a sealed Verify suite receipt of the check's suite with a non-zero exit whose candidate
 * commit is the plan-approval commit or one of its ancestors. `{ kind: "verify-receipt", ref, runId, commit, suite }` or null.
 */
export function preApprovalRedReceipt({ commonDir, root, check, approvalCommit, runGit = null }) {
  const suite = maintenanceReceiptSuite(check);
  if (suite === null || typeof approvalCommit !== "string" || !OID.test(approvalCommit) || typeof commonDir !== "string") return null;
  const runsRoot = join(commonDir, "agent-pipeline", "verify", "runs");
  const artifact = sha256(suite);
  const git = runGit ?? gitRunner(root);
  let runs = [];
  try { runs = readdirSync(runsRoot).filter((name) => SAFE_SUITE.test(name)).sort().reverse().slice(0, MAX_RUNS); } catch { return null; }
  for (const runId of runs) {
    let receipt;
    try {
      const path = join(runsRoot, runId, "receipts", `${artifact}.json`);
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink()) continue;
      receipt = JSON.parse(readFileSync(path, "utf8"));
    } catch { continue; }
    if (!validateVerifySuiteReceipt(receipt).ok || receipt.suite !== suite || receipt.runId !== runId || receipt.exitCode === 0) continue;
    const commit = receipt.candidate?.commit;
    if (!OID.test(commit ?? "")) continue;
    const before = commit === approvalCommit || gitOk(git(["merge-base", "--is-ancestor", commit, approvalCommit]));
    if (before) return Object.freeze({ kind: "verify-receipt", ref: receipt.receiptSha256, runId, commit, suite });
  }
  return null;
}

/* ---- the acknowledgement route ---- */

function subjectChecksDigest(checks) {
  return sha256(canonical(checks));
}

/** The PO's acknowledgement covering this check of this feature and plan approval, or null. */
export function maintenanceAcknowledgement({ commonDir, featureId, approvalSha256, checkSha256, readApprovals = readPrivateApprovals }) {
  let envelopes = [];
  try { envelopes = readApprovals(commonDir, MAINTENANCE_RED_ACKNOWLEDGEMENT_KIND); } catch { envelopes = []; }
  for (const envelope of envelopes) {
    const approval = envelope?.approval;
    if (!object(approval) || approval.featureId !== featureId || approval.approvalSha256 !== approvalSha256 || !Array.isArray(approval.checks)) continue;
    if (subjectChecksDigest(approval.checks) !== approval.checksSha256) continue;
    if (!approval.checks.some((entry) => entry?.checkSha256 === checkSha256)) continue;
    return Object.freeze({ kind: "po-acknowledgement", ref: approval.criticalProof?.proofSha256 ?? `${approval.approvedBy}@${approval.approvedAt}`,
      mode: object(approval.criticalProof) ? "signature" : "chat-attributed-unattested", label: MAINTENANCE_ACK_LABEL });
  }
  return null;
}

/** Receipt first, then the PO's acknowledgement; null when neither proves the check red before the feature. */
export function maintenanceRedProof({ commonDir, root, featureId, approvalSha256, approvalCommit, check, runGit = null, readApprovals }) {
  const receipt = preApprovalRedReceipt({ commonDir, root, check, approvalCommit, runGit });
  if (receipt !== null) return receipt;
  return maintenanceAcknowledgement({ commonDir, featureId, approvalSha256, checkSha256: maintenanceCheckSha256(check), ...(readApprovals ? { readApprovals } : {}) });
}

/**
 * The one subject builder of the PO's acknowledgement (the recording step and the signing terminal both call it): every red
 * observation of the feature at the clean candidate whose check has no receipt and no acknowledgement yet.
 * `{ ok: true, subject }` or `{ ok: false, code, detail }`.
 */
export function buildMaintenanceAcknowledgementSubject({ commonDir, root, featureId, approvalSha256, approvalCommit, candidate, runGit = null, readApprovals }) {
  if (typeof featureId !== "string" || featureId === "" || !SHA.test(approvalSha256 ?? "")) return { ok: false, code: "MRA-NO-APPROVAL", detail: "the active feature has no eligible plan approval" };
  const red = listMaintenanceRedObservations({ commonDir, featureId, candidate }).filter((record) => record.red);
  const open = red.filter((record) => maintenanceRedProof({ commonDir, root, featureId, approvalSha256, approvalCommit, check: record.check, runGit, ...(readApprovals ? { readApprovals } : {}) }) === null);
  if (open.length === 0) return { ok: false, code: "MRA-NOTHING-TO-ACKNOWLEDGE", detail: red.length === 0
    ? "no red maintenance check is observed at the clean HEAD; observe it first (maintenance-red-check.mjs observe), which runs the check and records the result"
    : "every red maintenance check observed at the clean HEAD already has a proof" };
  const checks = open.map((record) => ({ checkSha256: record.checkSha256, check: record.check, observedExitCode: record.exitCode }))
    .sort((a, b) => (a.checkSha256 < b.checkSha256 ? -1 : a.checkSha256 > b.checkSha256 ? 1 : 0));
  return { ok: true, subject: { schema: MAINTENANCE_ACK_SUBJECT_SCHEMA, featureId, approvalSha256, checksSha256: subjectChecksDigest(checks), checks } };
}

export function maintenanceChecksDigest(checks) { return subjectChecksDigest(checks); }

/**
 * The subject at the clean HEAD, read from the repository itself (the State, the plan approval and git): the one call the recording
 * step and the signing terminal share. `{ ok: true, subject, candidate, featureId }` or `{ ok: false, code, detail }`.
 */
export function buildMaintenanceAcknowledgementSubjectAtHead({ root, commonDir, runGit = null, readApprovals, readState = null }) {
  let state;
  try { state = readState ? readState(root) : JSON.parse(readFileSync(resolveAuthorityArtifactPath("state", { rootDir: root }).path, "utf8")); }
  catch { return { ok: false, code: "MRA-STATE-UNAVAILABLE", detail: "the project State could not be read" }; }
  const featureId = state?.activeFeature?.id;
  if (typeof featureId !== "string" || featureId === "") return { ok: false, code: "MRA-NO-FEATURE", detail: "the acknowledgement covers checks of the active feature; there is none" };
  if (!object(state.planApproval)) return { ok: false, code: "MRA-NO-APPROVAL", detail: "the active feature has no plan approval" };
  const git = runGit ?? gitRunner(root);
  const status = git(["status", "--porcelain=v1", "--untracked-files=no"]);
  if (!gitOk(status) || String(status.stdout).trim() !== "") return { ok: false, code: "MRA-DIRTY", detail: "the acknowledgement binds the clean HEAD; commit or restore the tracked changes first" };
  const commit = git(["rev-parse", "--verify", "--quiet", "HEAD"]), tree = git(["rev-parse", "--verify", "--quiet", "HEAD^{tree}"]);
  if (!gitOk(commit) || !gitOk(tree)) return { ok: false, code: "MRA-HEAD-UNAVAILABLE", detail: "HEAD could not be read" };
  const candidate = { commit: String(commit.stdout).trim(), tree: String(tree.stdout).trim() };
  const approvalSha256 = sha256CanonicalJson(state.planApproval);
  const built = buildMaintenanceAcknowledgementSubject({ commonDir, root, featureId, approvalSha256, approvalCommit: planApprovalCommit({ root, state, runGit: git }), candidate, runGit: git, ...(readApprovals ? { readApprovals } : {}) });
  return built.ok ? { ...built, candidate, featureId } : built;
}

/** The lines the signing terminal shows the PO before the signature. */
export function maintenanceAcknowledgementConfirmationLines(subject) {
  if (!object(subject) || !Array.isArray(subject.checks)) return [];
  return [
    `feature: ${subject.featureId}`,
    ...subject.checks.slice(0, 16).map((entry) => `red check without a Spec criterion: ${describeMaintenanceCheck(entry.check)} (exit ${entry.observedExitCode ?? "signal"} at the clean HEAD)`),
    "this acknowledgement states that these checks were already red before the feature; a maintenance dispatch may then repair them in test or tooling paths only. It is recorded as \"red before the feature acknowledged by the PO\"; the Critic still reviews the fix.",
    "scope: it holds for each listed check for the rest of this feature under this plan approval, also when the check turns red again later, so a later red of the same check needs no new acknowledgement; every repair still has to turn the check green (the configured verify at the feature close).",
  ];
}

/** One short line naming a check. */
export function describeMaintenanceCheck(check) {
  if (isConfiguredVerifyCheck(check)) return "the configured verify command";
  if (object(check) && typeof check.command === "string") return `command:${check.command}`;
  if (object(check) && typeof check.document === "string") return `document:${check.document}`;
  return object(check) && typeof check.path === "string" ? check.path : "unknown check";
}

/** The --check spelling of a check (the one dispatch-briefing.mjs and maintenance-red-check.mjs take): verify:configured, command:<id> or the path. */
export function maintenanceCheckSpelling(check) {
  const identity = maintenanceCheckIdentity(check);
  if (identity === null) return "<check>";
  if (identity.verify === "configured") return CONFIGURED_VERIFY_CHECK;
  return identity.command !== undefined ? `command:${identity.command}` : identity.path;
}

/** Parse a --check spelling into a check identity, or null. */
export function parseMaintenanceCheckSpelling(spelling) {
  if (typeof spelling !== "string" || spelling === "" || spelling.length > 1024) return null;
  if (spelling === CONFIGURED_VERIFY_CHECK) return { verify: "configured" };
  if (spelling.startsWith("command:")) return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(spelling.slice(8)) ? { command: spelling.slice(8) } : null;
  if (spelling.includes(":") || spelling.startsWith("/") || spelling.includes("\\") || spelling.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return CHECK_TEST_FILE.test(spelling) ? { path: spelling } : null;
}

export function maintenanceAcknowledgementRepair({ stateWriter = "pipeline-state.mjs" } = {}) {
  return `no Verify receipt shows this check red at or before the plan approval; the PO acknowledges it once: run node ${stateWriter} approve-maintenance-red-check --by <the label the PO gives for this command>, `
    + "which prints the PO's signing command (or records it at once in chat mode), then generate the binding again";
}
