#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import {
  dirname, isAbsolute, join, relative, resolve, sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import { resolveTrustedSystemExecutable } from "../lib/trusted-tool-resolution.mjs";
import { planFeatureCloseAudit } from "../lib/feature-close-audit-preflight.mjs";
import { executeFeatureCloseAudit } from "../lib/feature-close-audit-executor.mjs";
import { CORE_BASELINE_PACK_ID, resolveNamedOrganizationPolicyPack } from "../lib/organization-policy.mjs";
import { physicalAuditPath, validateFeatureCloseAuditReceipt } from "../lib/feature-close-audit-receipt.mjs";
import { readCriticVerifyLifecycle } from "../lib/critic-verify-lifecycle.mjs";
import { requiresPublicationReview } from "../lib/publication-review-requirement.mjs";
import { SLICE_QUEUE_MAX_BYTES, validateSliceQueue } from "../lib/slice-queue.mjs";
import { isTerminalOutcome } from "../lib/dispatch-record.mjs";
import { collectAuditIndex, readAuditIndexEvidence, writeAuditIndexEvidence } from "./audit-index.mjs";
import { criticAddendumBindingFinding, evaluateRepositoryCriticSkipCoverage, walkDispatchRecords } from "./check-critic-skip-coverage.mjs";
import { writeCriticDispositionAddendumObject } from "./dispatch-record-write.mjs";
import { CRITIC_EVIDENCE_SCHEMA } from "../lib/critic-skip-decision.mjs";
import { CRITIC_DISPOSITION_ADDENDUM_SCHEMA, criticDispositionAddendumPath } from "../lib/critic-disposition-addendum.mjs";
import { canonicalJson as criticPacketCanonicalJson, readConsumedCandidateReceipt } from "../lib/critic-packet-preflight-read.mjs";
import { classifyCourseAuthorship } from "../lib/close-authorship-record.mjs";
import { validateFeaturePackage } from "../lib/feature-package-topology.mjs";
import {
  assertPrivateRegularFile,
  ensurePrivateDirectory,
} from "../lib/private-boundary.mjs";
import { assessWindowsPrivatePath } from "../lib/windows-private-state.mjs";
import { GIT_NULL_DEVICE } from "../lib/git-null-device.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";
import {
  advanceCloseCoordinator,
  coordinatorCompletion,
  coordinatorNextPhases,
  COORDINATOR_PHASES,
  createCloseCoordinator,
  lifecycleDigest,
  publicationClosePaths,
  readCloseCoordinator,
  storeCloseCoordinator,
} from "./publication-close-journal.mjs";
import {
  PUBLICATION_EXECUTOR_RESULT_SCHEMA,
  validatePublicationExecutorResult,
} from "./publication-executor.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const STATE_WRITER = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ID = /^[A-Za-z0-9._-]{1,100}$/u;
const CLOSE_INTENTS = new Set(["durable-stop", "runtime-transfer"]);
const ARCHITECTURE_IMPACTS = new Set([
  "architecture-conforms",
  "architecture-decision-added",
  "architecture-decision-superseded",
  "architecture-summary-updated",
  "no-architecture-impact",
]);
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const CLI_HELP = [
  "Usage: close-coordinator.mjs next <phase>",
  "       close-coordinator.mjs inspect --root <repository-root> --lifecycle <id>",
  "       close-coordinator.mjs plan-start --root <repository-root> --lifecycle <id> --actor <name> --close-intent <durable-stop|runtime-transfer>",
  "       close-coordinator.mjs apply-start <plan-start arguments> --plan-sha256 <sha256> --activate",
  "       close-coordinator.mjs plan-transition --root <repository-root> --lifecycle <id> --actor <name> --phase <phase> [phase evidence options]",
  "       close-coordinator.mjs apply-transition <plan-transition arguments> --plan-sha256 <sha256> --activate",
  "       close-coordinator.mjs --help",
  "",
  "Plans, applies, and inspects the durable feature-close coordinator lifecycle.",
].join("\n");

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const planDigest = (value) => sha256(canonical(value));

function emit(value, code = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = code;
}
function fail(code, message, { criticAddenda } = {}) {
  const error = new Error(message);
  error.code = code;
  if (criticAddenda !== undefined) error.criticAddenda = criticAddenda;
  throw error;
}
function exactArgs(argv, valueNames, booleanNames = new Set()) {
  const values = {}; const booleans = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (typeof raw !== "string" || !raw.startsWith("--")) return null;
    const name = raw.slice(2);
    if (booleanNames.has(name)) {
      if (Object.hasOwn(booleans, name)) return null;
      booleans[name] = true;
      continue;
    }
    if (!valueNames.has(name) || Object.hasOwn(values, name)) return null;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) return null;
    values[name] = value;
    index += 1;
  }
  return { values, booleans };
}
function physicalRoot(input) {
  const root = resolve(input);
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(root) !== root) fail("CLOSE-ROOT", "root must be one physical directory");
  return root;
}
function safeFile(root, path, label) {
  if (typeof path !== "string" || !SAFE_RELATIVE.test(path)) fail("CLOSE-PATH", `${label} path is unsafe`);
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) fail("CLOSE-PATH", `${label} escaped root`);
  let cursor = root;
  for (const component of path.split("/")) {
    cursor = join(cursor, component);
    let info;
    try { info = lstatSync(cursor); }
    catch (error) {
      if (error?.code === "ENOENT") fail("CLOSE-PATH-MISSING", `${label} does not exist at ${path}; write it there, or pass the path where it is`);
      throw error;
    }
    if (info.isSymbolicLink()) fail("CLOSE-PATH", `${label} contains a symbolic link`);
  }
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()) fail("CLOSE-PATH", `${label} is not a regular file`);
  return { path, absolute, bytes: readFileSync(absolute), sha256: sha256(readFileSync(absolute)) };
}
function readJsonFile(root, path, label) {
  const file = safeFile(root, path, label);
  let value;
  try { value = JSON.parse(file.bytes); } catch { fail("CLOSE-JSON", `${label} is not valid JSON`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CLOSE-JSON", `${label} is not one JSON object`);
  return { ...file, value };
}
function stateSnapshot(root) {
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  const statePath = authority.status === "ready"
    ? authority.state
    : (existsSync(join(root, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
  const file = readJsonFile(root, statePath, "Pipeline State");
  if (file.value.schema !== "pipeline.state.v0") fail("CLOSE-STATE", "Pipeline State schema is invalid");
  return { ...file, state: file.value };
}
function gitExecutable() {
  const resolved = resolveTrustedSystemExecutable("git");
  if (!resolved.ok) fail("CLOSE-GIT", `trusted Git is unavailable (${resolved.status})`);
  return resolved.path;
}
function git(root, args, { accept = [0] } = {}) {
  const executable = gitExecutable();
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: dirname(executable),
      LANG: "C",
      LC_ALL: "C",
      GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE,
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  if (result.error || !accept.includes(result.status)) fail("CLOSE-GIT", `git ${args[0]} failed`);
  return String(result.stdout ?? "").trim();
}
function gitCommonDir(root) {
  const observed = git(root, ["rev-parse", "--git-common-dir"]);
  const common = realpathSync(resolve(root, observed));
  const info = lstatSync(common);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("CLOSE-GIT", "Git common directory is unsafe");
  return common;
}
function gitCandidate(root) {
  const oid = git(root, ["rev-parse", "HEAD"]);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  if (!OID.test(oid) || !OID.test(tree)) fail("CLOSE-GIT", "candidate OID/tree are invalid");
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") fail("CLOSE-CANDIDATE-DRIFT", "tracked or untracked worktree drift blocks candidate freeze/readback");
  return { oid, tree };
}
function activeFeature(state) {
  const value = state.activeFeature;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !ID.test(value.id ?? "") || typeof value.planPath !== "string"
    || typeof value.phase !== "string" || value.phase === "") {
    fail("CLOSE-FEATURE", "active feature identity is unavailable");
  }
  return { id: value.id, planPath: value.planPath, phase: value.phase };
}
function authorityFromState(root, snapshot, { requireResult = false } = {}) {
  const feature = activeFeature(snapshot.state);
  const prd = safeFile(root, feature.planPath, "PRD/Plan");
  const approval = snapshot.state.planApproval?.poGateAuthority;
  const specPath = approval?.specPath ?? snapshot.state.continuity?.authority?.spec?.path;
  const spec = safeFile(root, specPath, "Spec");
  if (approval?.planSha256 !== prd.sha256 || approval?.specSha256 !== spec.sha256) {
    fail("CLOSE-AUTHORITY", "current PRD/Spec bytes are not the approved authority");
  }
  const resultPath = snapshot.state.continuity?.authority?.result?.path ?? null;
  const result = resultPath === null ? null : safeFile(root, resultPath, "Implementation Result");
  if (requireResult && result === null) {
    fail("CLOSE-RESULT", `feature close requires a bound Implementation Result: Continuity authority.result is null. Bind it first with the Result bootstrap: run \`node ${STATE_WRITER} continuity-result-bootstrap-plan\` in the project root ${root} (working directory or CLAUDE_PROJECT_DIR; that verb takes no --root flag), apply the action it returns and, when its completion names a feature-package-reconcile plan, apply that too; then run this feature-close-prepared transition again on the same lifecycle (plan-start is not restarted)`);
  }
  return {
    feature,
    authority: {
      implementationResultSha256: result?.sha256 ?? null,
      pipelineStateSha256: snapshot.sha256,
      planSha256: approval.planSha256,
      prdSha256: prd.sha256,
      specSha256: spec.sha256,
    },
  };
}
function action(command, values, planSha256) {
  const argv = [
    SCRIPT, command,
    "--root", values.root,
    "--lifecycle", values.lifecycle,
    "--actor", values.actor,
  ];
  if (values.closeIntent) argv.push("--close-intent", values.closeIntent);
  if (values.phase) argv.push("--phase", values.phase);
  if (values.architectureImpact) argv.push("--architecture-impact", values.architectureImpact);
  if (values.auditRequest) argv.push("--audit-request", values.auditRequest);
  if (values.criticVerifyLifecycle) argv.push("--critic-verify-lifecycle", values.criticVerifyLifecycle);
  if (values.evidence) argv.push("--evidence", values.evidence);
  if (values.publication) argv.push("--publication", values.publication);
  if (values.continuityCloseRequest) {
    argv.push("--continuity-close-request", values.continuityCloseRequest);
  }
  if (values.authorized) argv.push("--authorized");
  argv.push("--plan-sha256", planSha256, "--activate");
  return {
    executable: process.execPath,
    argv,
    mutation: true,
    requiresConfirmation: true,
    expected: { schema: "pipeline.close-coordinator.apply.v1", statuses: ["applied", "replayed"] },
  };
}

function auditRequest(root, path) {
  const request = readJsonFile(root, path, "feature-close audit request");
  const expected = ["schema", "manifestPath", "coreVersion", "packs", "criticVerifyLifecycleId"].sort().join("\0");
  if (request.value.schema !== "pipeline.feature-close-audit-request.v1"
    || Object.keys(request.value).sort().join("\0") !== expected
    || !SAFE_RELATIVE.test(request.value.manifestPath ?? "")
    || typeof request.value.coreVersion !== "string" || request.value.coreVersion.length === 0
    || !Array.isArray(request.value.packs) || !SHA256.test(request.value.criticVerifyLifecycleId ?? "")) {
    fail("CLOSE-AUDIT-REQUEST", "feature-close audit request has an invalid exact shape");
  }
  // D229: an element of `packs` is a full organization policy pack object (passed on unchanged) or the NAME of the
  // pack the pipeline ships. The name is resolved here, once, so the plan, its stored options and the apply path see
  // only objects; the request file keeps the name and its digest (request.sha256) is the digest of those bytes.
  const packs = request.value.packs.map((entry) => {
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) return entry;
    if (entry === CORE_BASELINE_PACK_ID) return resolveNamedOrganizationPolicyPack(entry);
    fail("CLOSE-AUDIT-REQUEST", `feature-close audit request packs must each be a full organization policy pack object or the shipped pack name "${CORE_BASELINE_PACK_ID}"`);
  });
  return { ...request, value: { ...request.value, packs } };
}

function auditLifecycleReadback({ root, common, request, auditPlan }) {
  const evidence = readJsonFile(root, auditPlan.qualification.path, "candidate Verify evidence");
  let lifecycle;
  try {
    lifecycle = readCriticVerifyLifecycle({
      repoRoot: root,
      gitCommonDir: common,
      id: request.value.criticVerifyLifecycleId,
      candidate: auditPlan.candidate,
      evidencePath: auditPlan.qualification.path,
      evidence: evidence.value,
    });
  } catch (error) {
    fail(error?.code ?? "CLOSE-CRITIC-VERIFY-UNAVAILABLE", `feature close requires the exact private Critic/Verify lifecycle receipt (${error?.message ?? "unavailable"})`);
  }
  return { evidence, lifecycle };
}
function startPlan(values) {
  const root = physicalRoot(values.root);
  if (!ID.test(values.lifecycle ?? "") || typeof values.actor !== "string" || values.actor.trim() === "") fail("CLOSE-ARGS", "start identity is invalid");
  if (!CLOSE_INTENTS.has(values.closeIntent)) {
    fail("CLOSE-INTENT", "close coordinator requires --close-intent durable-stop or runtime-transfer; normal same-topic restarts are handover-only");
  }
  const snapshot = stateSnapshot(root);
  const observed = authorityFromState(root, snapshot);
  const coordinator = createCloseCoordinator({
    lifecycleId: values.lifecycle,
    featureId: observed.feature.id,
    activeFeature: observed.feature,
    authority: observed.authority,
  });
  const payload = {
    schema: "pipeline.close-coordinator.start-plan.v1",
    root,
    lifecycleId: values.lifecycle,
    actor: values.actor.trim(),
    closeIntent: values.closeIntent,
    stateSha256: snapshot.sha256,
    coordinator,
  };
  const digest = planDigest(payload);
  return { ...payload, planSha256: digest, nextAction: action("apply-start", { ...values, root }, digest) };
}
function privateEvidence(common, lifecycle, path, label) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    fail("CLOSE-EVIDENCE-PATH", `${label} must use the coordinator-private evidence directory`);
  }
  const directory = join(publicationClosePaths(common, lifecycle).directory, "evidence");
  const requested = resolve(path);
  if (dirname(requested) !== directory
    || !/^[A-Za-z0-9._-]{1,160}\.json$/u.test(requested.slice(directory.length + 1))) {
    fail("CLOSE-EVIDENCE-PATH", `${label} escaped the coordinator-private evidence directory`);
  }
  const directoryInfo = lstatSync(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()
    || realpathSync(directory) !== directory
    || (process.platform !== "win32" && (directoryInfo.mode & 0o077) !== 0)) {
    fail("CLOSE-EVIDENCE-PATH", `${label} private directory is unsafe`);
  }
  if (process.platform === "win32"
    && assessWindowsPrivatePath(directory).status !== "secure") {
    fail("CLOSE-EVIDENCE-PATH", `${label} Windows directory assurance is unavailable`);
  }
  assertPrivateRegularFile(requested, label);
  const info = lstatSync(requested);
  if (info.size < 2 || info.size > 1024 * 1024) {
    fail("CLOSE-EVIDENCE-PATH", `${label} size is invalid`);
  }
  return {
    path: requested,
    absolute: requested,
    bytes: readFileSync(requested),
    sha256: sha256(readFileSync(requested)),
  };
}
function evidence(root, common, lifecycle, path, schema, keys, { privateOnly = false } = {}) {
  if (!path) fail("CLOSE-EVIDENCE", `${schema} evidence is required`);
  const file = privateOnly
    ? privateEvidence(common, lifecycle, path, schema)
    : safeFile(root, path, schema);
  let value;
  try { value = JSON.parse(file.bytes); } catch { fail("CLOSE-JSON", `${schema} is not valid JSON`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("CLOSE-JSON", `${schema} is not one JSON object`);
  }
  const observed = { ...file, value };
  if (observed.value.schema !== schema || Object.keys(observed.value).sort().join("\0") !== [...keys].sort().join("\0")) {
    fail("CLOSE-EVIDENCE", `${schema} evidence shape is invalid`);
  }
  return observed;
}
function continuityCloseRequest(root, snapshot, path) {
  if (snapshot.state.continuity === undefined) {
    if (path !== undefined) fail("CLOSE-CONTINUITY", "continuity close request is unexpected");
    return null;
  }
  if (!path) fail("CLOSE-CONTINUITY", "active Continuity requires an exact close request (--continuity-close-request <repo-relative-json>; its keys, the closeEvidence rules and the whole order are in the close-feature skill, section \"Closing a feature with active Continuity: the ordered route\")");
  const request = readJsonFile(root, path, "Continuity close request");
  const value = request.value;
  const continuity = snapshot.state.continuity;
  const result = continuity?.authority?.result;
  if (Object.keys(value).sort().join("\0") !== [
    "closeEvidence", "expectedRevision", "featureId", "result", "schema",
  ].sort().join("\0")
    || value.schema !== "pipeline.continuity-close.v0"
    || value.featureId !== snapshot.state.activeFeature?.id
    || value.expectedRevision !== continuity?.revision
    || continuity?.queueHead?.nextAction !== "close"
    || continuity?.queueHead?.dispatch !== null
    || continuity?.blocker !== null
    || continuity?.decisionTxn !== null
    || result === null
    || canonical(value.result) !== canonical(result)
    || canonical(value.closeEvidence) === canonical(value.result)) {
    fail("CLOSE-CONTINUITY", "Continuity close request is not bound to the exact close-ready State: the request keys are schema (pipeline.continuity-close.v0), featureId, expectedRevision, result and closeEvidence; "
      + "result must equal the State's Result binding; closeEvidence is a { path, sha256 } binding of a regular repository-relative file, different from `result`, whose path is unique across closed features "
      + "(the combined Verify/Critic receipt is the usual choice); and the State must be close-ready (queue head nextAction close, no dispatch, blocker or decision transaction). "
      + "The whole order is in the close-feature skill, section \"Closing a feature with active Continuity: the ordered route\"");
  }
  for (const [label, binding] of [["Result", value.result], ["close evidence", value.closeEvidence]]) {
    if (!binding || Object.keys(binding).sort().join("\0") !== "path\0sha256"
      || !SHA256.test(binding.sha256 ?? "")) {
      fail("CLOSE-CONTINUITY", `${label} binding is invalid`);
    }
    const observed = safeFile(root, binding.path, label);
    if (observed.sha256 !== binding.sha256) fail("CLOSE-CONTINUITY", `${label} bytes drifted`);
  }
  return request;
}
/**
 * A feature cannot reach `feature-close-prepared` while one of ITS OWN delivery-course dispatch records
 * requires a Critic and has no matching Critic evidence (the evaluator's own decision, not a second one).
 * Scope is the slice ids of the course beside the approved plan, the file resolveGovernedItemQueue reads;
 * records of other or earlier features never block. No course file means nothing to scope in
 * this per-slice check; the whole-candidate qualification below still applies.
 * An unreadable, oversized, invalid or foreign course fails closed.
 * D27/D55 (Q1): a slice recorded only by its orchestrator commit (no dispatch record) is accepted as
 * authored, but only on the audit route, whose candidate-bound Verify and Critic receipt stand in for
 * the record's Critic decision (lib/close-authorship-record.mjs).
 */
function hasTerminalRecord(root, taskId) {
  let value;
  try { value = readJsonFile(root, `evidence/dispatch-record-${taskId}.json`, "dispatch record").value; }
  catch { return false; }
  return isTerminalOutcome(value.outcome);
}
const ADDENDA_COMMIT_SUBJECT = "chore(evidence): bind the Critic course to the delivery records";
const CRITIC_PACKET_ID = /^[a-f0-9]{32}$/u;
const criticDispositionEvidencePath = (taskId) => `evidence/critic-disposition-evidence-${taskId}.md`;
/** The evidence file the derived addendum points at: a pointer to the consumed receipt that binds the record, never a second verdict. */
const criticDispositionEvidenceText = ({ taskId, recordPath, recordSha256, candidateCommit, criticPacketId, reviewCandidateCommit, criticReceiptSha256 }) => [
  `Critic disposition evidence for ${taskId} (derived by the close coordinator, D223)`,
  "",
  `Record: ${recordPath} (sha256 ${recordSha256})`,
  `Record commit: ${candidateCommit}`,
  `Critic packet: ${criticPacketId}`,
  `Review candidate: ${reviewCandidateCommit}`,
  `Critic receipt sha256: ${criticReceiptSha256}`,
  "",
  "Exactly one passed (or PO-residual-accepted), consumed Critic receipt or registered Critic course binds this record under the coverage rules",
  "of check-critic-skip-coverage. This file only points at that receipt; the review itself is the consumed receipt, which every read of the",
  `addendum (${criticDispositionAddendumPath(taskId)}) proves again.`,
  "",
].join("\n");
/** Every consumed Critic receipt of the repository's private packet store, as the facts an addendum names; an unreadable packet covers nothing. */
function consumedCriticReceipts(root) {
  const controlRoot = join(gitCommonDir(root), "agent-pipeline", "critic-packets");
  let names;
  try { names = readdirSync(controlRoot); } catch { return []; }
  const receipts = [];
  for (const packetId of names.filter((name) => CRITIC_PACKET_ID.test(name)).sort()) {
    try {
      const { receipt } = readConsumedCandidateReceipt({ controlRoot, packetId });
      const reviewCandidateCommit = receipt?.candidate?.commit;
      if (typeof reviewCandidateCommit === "string" && OID.test(reviewCandidateCommit)) {
        receipts.push({ packetId, reviewCandidateCommit, criticReceiptSha256: sha256(criticPacketCanonicalJson(receipt)) });
      }
    } catch { /* not a consumed packet: it covers nothing */ }
  }
  return receipts;
}
/**
 * D223 (slice 2): for each uncovered record, write the byte-bound addendum when EXACTLY ONE consumed receipt binds it. The deciding rule is
 * the existing one, not a copy: a draft addendum naming the receipt is asked of criticAddendumBindingFinding (the function the sanctioned
 * `dispatch-record-write --critic-addendum` verb verifies with), which applies the receipt of the record's own task id, the receipt whose
 * reviewed range contains the record's commit, the registered course chain named by its last round, and the rule that a failed receipt
 * binds only through a recorded PO residual acceptance (the coordinator never creates or infers one). Zero covers, two or more covers, an
 * addendum already present, or any read that fails: nothing is written for that record and the refusal stays today's. The writer is the
 * exported one of the verb (writeCriticDispositionAddendumObject, verifying the binding again before its exclusive publication).
 * Nothing is staged or committed. A write failure removes every file this call created and refuses with its typed code.
 */
function deriveCriticAddenda(root, uncoveredIds) {
  const plans = [];
  try {
    const receipts = consumedCriticReceipts(root);
    if (receipts.length === 0) return { written: [], commitPaths: [] };
    const entries = walkDispatchRecords(root).records;
    for (const taskId of [...uncoveredIds].sort()) {
      try {
        const recordPath = `evidence/dispatch-record-${taskId}.json`;
        const entry = entries.find(({ path }) => path === recordPath);
        const addendumPath = criticDispositionAddendumPath(taskId);
        if (entry === undefined || entry.record?.taskId !== taskId || existsSync(join(root, addendumPath))) continue;
        const draft = (receipt, path, digest) => ({ schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA, recordPath, recordSha256: entry.sha256, taskId,
          candidateCommit: entry.record.candidateCommit, reviewCandidateCommit: receipt.reviewCandidateCommit, criticPacketId: receipt.packetId,
          criticReceiptSha256: receipt.criticReceiptSha256,
          criticEvidence: { schema: CRITIC_EVIDENCE_SCHEMA, taskId, candidateCommit: entry.record.candidateCommit, path, sha256: digest } });
        // The probe's evidence reference is the record itself (an existing file under evidence/): the binding finding never depends on it.
        const covers = receipts.filter((receipt) => {
          try { return criticAddendumBindingFinding({ root, addendum: draft(receipt, recordPath, entry.sha256), record: entry.record, recordBytes: entry.bytes }) === null; }
          catch { return false; }
        });
        if (covers.length !== 1) continue;
        const [cover] = covers;
        const evidencePath = criticDispositionEvidencePath(taskId);
        const evidenceBytes = Buffer.from(criticDispositionEvidenceText({ taskId, recordPath, recordSha256: entry.sha256, candidateCommit: entry.record.candidateCommit,
          criticPacketId: cover.packetId, reviewCandidateCommit: cover.reviewCandidateCommit, criticReceiptSha256: cover.criticReceiptSha256 }), "utf8");
        if (existsSync(join(root, evidencePath)) && !readFileSync(join(root, evidencePath)).equals(evidenceBytes)) continue;
        plans.push({ taskId, addendumPath, evidencePath, evidenceBytes, cover, addendum: draft(cover, evidencePath, sha256(evidenceBytes)) });
      } catch { /* this record is not derivable */ }
    }
  } catch { return { written: [], commitPaths: [] }; }
  const created = [];
  const written = [];
  let current = null;
  try {
    for (const plan of plans) {
      current = plan.taskId;
      if (!existsSync(join(root, plan.evidencePath))) {
        writeFileSync(join(root, plan.evidencePath), plan.evidenceBytes, { flag: "wx" });
        created.push(join(root, plan.evidencePath));
      }
      const receipt = writeCriticDispositionAddendumObject({ repoRoot: root, addendum: plan.addendum }, { verifyBinding: criticAddendumBindingFinding });
      created.push(join(root, receipt.target));
      written.push({ taskId: plan.taskId, addendumPath: plan.addendumPath, evidencePath: plan.evidencePath, addendumSha256: receipt.sha256,
        criticPacketId: plan.cover.packetId, reviewCandidateCommit: plan.cover.reviewCandidateCommit, criticReceiptSha256: plan.cover.criticReceiptSha256 });
    }
  } catch (error) {
    for (const path of created.reverse()) { try { unlinkSync(path); } catch { /* already gone */ } }
    fail("CLOSE-CRITIC-ADDENDA-WRITE-FAILED", `feature close preparation could not write the Critic addendum for ${current} (${error?.code ?? "write-failed"}); every file this attempt created was removed again and nothing was staged or committed; repair: remove what blocks the path or write the addendum by hand with node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <repo-root> --critic-addendum <request.json>, then plan the transition again`);
  }
  return { written, commitPaths: written.flatMap((entry) => [entry.addendumPath, entry.evidencePath]).sort() };
}
function assertCourseCriticEvidence(root, feature, { audited, deriveAddenda = false }) {
  const directory = dirname(feature.planPath);
  const coursePath = directory === "." ? "slice-queue.json" : `${directory}/slice-queue.json`;
  let size;
  try { size = lstatSync(join(root, coursePath)).size; }
  catch (error) {
    if (error?.code === "ENOENT") return;
    fail("CLOSE-DELIVERY-COURSE-INVALID", "the feature's delivery course is unreadable; the Critic evidence gate fails closed");
  }
  let ids, slices, legacyCourse = false;
  try {
    if (size > SLICE_QUEUE_MAX_BYTES) throw new Error("delivery course exceeds the slice-queue size bound");
    const course = readJsonFile(root, coursePath, "delivery course").value;
    if (!validateSliceQueue(course).ok || course.feature !== feature.id) throw new Error("delivery course is invalid or belongs to another feature");
    slices = course.slices;
    legacyCourse = course.schema === "pipeline.slice-queue.v1";
    ids = slices.map((slice) => slice.id);
  } catch {
    fail("CLOSE-DELIVERY-COURSE-INVALID", "the feature's delivery course is invalid, oversized or belongs to another feature; the Critic evidence gate fails closed");
  }
  let coverage;
  try { coverage = evaluateRepositoryCriticSkipCoverage({ root, taskIds: ids }); }
  catch { fail("CLOSE-CRITIC-EVIDENCE-UNAVAILABLE", "Critic evidence coverage for the feature's delivery course could not be evaluated"); }
  if (coverage.requiredTaskIds.length > 0) {
    // D212 (N33): name WHY an addendum that exists does not bind (only findings about the uncovered ids), the route that writes the
    // addendum, and the current rule. The round cap this text used to state was removed by D190/D199.
    const missingMessage = (ids) => {
      const reasons = coverage.readFindings.filter((finding) => ids.some((id) => finding.includes(id))).slice(0, 3)
        .map((finding) => (finding.length > 300 ? `${finding.slice(0, 300)}...` : finding));
      const why = reasons.length > 0 ? ` (${reasons.join("; ")})` : "";
      return (`feature close preparation is blocked: ${ids.join(", ")} require a Critic and carry no matching Critic evidence${why}; repair: if a passed, consumed Critic receipt already covers the record (its own task id, or a feature-wide Critic course whose reviewed range contains the record's commit), write the byte-bound addendum with node <plugin-root>/scripts/dispatch-record-write.mjs --repo-root <repo-root> --critic-addendum <request.json> once for EACH uncovered record (one addendum file per record; the request file is the pipeline.critic-disposition-addendum.v1 object; see the close-feature skill), then plan the transition again; a failed receipt never binds without a PO residual acceptance of its minor findings (the PO's own attended step: node <plugin-root>/scripts/pipeline-state.mjs approve-residual-acceptance --by <name> --critic-packet <packet-id>), and a course closed by a residual acceptance covers the records of all its registered rounds when the addendum names the course's last round (its criticPacketId and reviewCandidateCommit are that round's); otherwise run the Critic dispatch for each of them, then write the addendum the same way; follow-up = correction-diff Critic only, over the previously reviewed commit to the new candidate; no round cap since D190/D199; a further correction-diff Critic round is always allowed`);
    };
    // D223 (slice 2): only plan-transition derives; apply-transition re-runs this check and must stay a pure check.
    const derived = deriveAddenda ? deriveCriticAddenda(root, coverage.requiredTaskIds) : { written: [], commitPaths: [] };
    if (derived.written.length > 0) {
      const remaining = coverage.requiredTaskIds.filter((id) => !derived.written.some((entry) => entry.taskId === id));
      const commitInstruction = `The Critic disposition addenda and their evidence files were written into the working tree and nothing was staged or committed. Commit exactly these paths in one evidence-only commit: git add -f -- ${derived.commitPaths.join(" ")}; then git commit (suggested subject: ${ADDENDA_COMMIT_SUBJECT}), and plan this transition again after that commit.`;
      const covered = derived.written.map((entry) => `${entry.taskId} (Critic packet ${entry.criticPacketId})`).join(", ");
      fail("CLOSE-CRITIC-ADDENDA-WRITTEN", `feature close preparation wrote the byte-bound Critic addendum for ${covered}, because exactly one passed, consumed Critic receipt (or one registered Critic course) covers each of these records and no other does. ${commitInstruction}${remaining.length > 0 ? ` Still uncovered after that commit: ${missingMessage(remaining)}` : ""}`,
        { criticAddenda: { schema: "pipeline.close-critic-addenda-written.v1", written: derived.written, commitPaths: derived.commitPaths, commitInstruction, planAgain: true } });
    }
    fail("CLOSE-CRITIC-EVIDENCE-MISSING", missingMessage(coverage.requiredTaskIds));
  }
  // D52: a Critic slice of THIS course that is still scheduled (ready, no terminal dispatch record) means the
  // independent review has not happened; the close must not reach feature-close-prepared past it. Legacy v1
  // courses only: an item-owned course takes its done state from integration readiness, not from records.
  if (legacyCourse) {
    const scheduled = slices.filter((slice) => slice.tier === "critic" && slice.state === "ready" && !hasTerminalRecord(root, slice.id)).map((slice) => slice.id);
    if (scheduled.length > 0) {
      fail("CLOSE-CRITIC-SLICE-SCHEDULED", `feature close preparation is blocked: Critic slice ${scheduled.join(", ")} of the delivery course is still scheduled (no terminal dispatch record); repair: run the Critic review and record its evidence in the slice's dispatch record, or cancel the Critic slice through the sanctioned slice-queue route, then plan the transition again`);
    }
  }
  let authorship;
  try { authorship = classifyCourseAuthorship({ root, slices, candidateCommit: git(root, ["rev-parse", "HEAD"]) }); }
  catch { fail("CLOSE-AUTHORSHIP-UNAVAILABLE", "the authorship record of the feature's delivery course could not be read"); }
  if (authorship.orchestratorCommit.length > 0 && !audited) {
    fail("CLOSE-AUTHORSHIP-COMMIT-ONLY", `feature close preparation is blocked: ${authorship.orchestratorCommit.join(", ")} carry no dispatch record, only their \`Dispatch: <slice> (goldfish)\` commit (D27); repair: record the candidate's passing Verify and its Critic review as a Critic/Verify lifecycle, then plan the transition again with --audit-request <path> --critic-verify-lifecycle <id>, which binds them to this exact candidate`);
  }
  return authorship;
}
async function transitionPlan(values, { deriveCriticAddenda = false } = {}) {
  const root = physicalRoot(values.root);
  if (!ID.test(values.lifecycle ?? "") || !COORDINATOR_PHASES.includes(values.phase)
    || typeof values.actor !== "string" || values.actor.trim() === "") fail("CLOSE-ARGS", "transition identity is invalid");
  if (values.phase === "feature-close-prepared" && !ARCHITECTURE_IMPACTS.has(values.architectureImpact)) {
    fail("CLOSE-ARCHITECTURE-IMPACT", "feature close preparation requires one typed architecture impact");
  }
  if (values.phase !== "feature-close-prepared" && values.architectureImpact !== undefined) {
    fail("CLOSE-ARCHITECTURE-IMPACT", "architecture impact is accepted only for feature-close-prepared");
  }
  if (values.phase !== "feature-close-prepared" && values.auditRequest !== undefined) {
    fail("CLOSE-AUDIT-ARGS", "--audit-request is accepted only for feature-close-prepared");
  }
  if (values.phase !== "feature-close-prepared" && values.criticVerifyLifecycle !== undefined) {
    fail("CLOSE-CRITIC-VERIFY-ARGS", "--critic-verify-lifecycle is accepted only for feature-close-prepared");
  }
  const common = gitCommonDir(root);
  const stored = readCloseCoordinator(common, values.lifecycle);
  if (!coordinatorNextPhases(stored.coordinator.phase).includes(values.phase)
    && !(stored.coordinator.phase === "cleanup-complete" && values.phase === "cleanup-complete")) {
    fail("CLOSE-ORDER", "transition is not reachable");
  }
  if (["closed-local", "delivered", "release-eligible", "promoted"].includes(values.phase)
    && stored.coordinator.cleanup.status !== "complete") {
    fail("CLOSE-CLEANUP", "a clean terminal/release transition requires confirmed cleanup");
  }
  if (values.phase === "delivered"
    && !SHA256.test(stored.coordinator.publication?.readbackReceiptDigest ?? "")) {
    fail("CLOSE-PUBLICATION", "delivery requires exact publication readback");
  }
  const advance = {
    expectedRevision: stored.coordinator.revision,
    expectedStateSha256: lifecycleDigest(stored.coordinator),
    phase: values.phase,
    inputDigest: null,
    observedDigest: null,
  };
  const snapshot = stateSnapshot(root);
  if (stored.coordinator.candidateOid !== null
    && values.phase !== "candidate-frozen") {
    const candidate = gitCandidate(root);
    if (candidate.oid !== stored.coordinator.candidateOid
      || candidate.tree !== stored.coordinator.candidateTree) {
      fail("CLOSE-CANDIDATE-DRIFT", "the frozen candidate changed before the requested transition");
    }
  }
  let boundEvidenceSha256 = null;
  let audit = null;
  let courseAuthorship = null;
  if (values.phase === "checkpointed") {
    const feature = activeFeature(snapshot.state);
    if (feature.id !== stored.coordinator.featureId) fail("CLOSE-FEATURE", "checkpoint feature drifted");
    advance.inputDigest = snapshot.sha256;
    advance.observedDigest = snapshot.sha256;
  } else if (values.phase === "feature-close-prepared") {
    const observed = authorityFromState(root, snapshot, { requireResult: true });
    const closeRequest = continuityCloseRequest(root, snapshot, values.continuityCloseRequest);
    if (canonical(observed.feature) !== canonical(stored.coordinator.activeFeature)) fail("CLOSE-FEATURE", "feature-close identity drifted");
    const registeredManifest = `${dirname(observed.feature.planPath).split(sep).join("/")}/lifecycle.json`;
    let hasRegisteredManifest = false;
    try { lstatSync(join(root, registeredManifest)); hasRegisteredManifest = true; }
    catch (error) { if (error?.code !== "ENOENT") fail("CLOSE-PACKAGE", "registered feature package path is unreadable"); }
    if (hasRegisteredManifest) {
      const checked = validateFeaturePackage(root, registeredManifest);
      if (!checked.ok) {
        const digestOnly = checked.findings.every((finding) => /: digest does not bind file bytes$/u.test(finding));
        fail("CLOSE-PACKAGE", `registered feature package is inconsistent: ${checked.findings.join("; ")}${digestOnly ? `; the package only lags its bytes: apply the PO-bound feature-package-reconcile plan for ${registeredManifest} (the Result bootstrap completion names its --plan-sha256), then plan this transition again on the same lifecycle` : ""}`);
      }
      const packageValue = readJsonFile(root, registeredManifest, "feature package").value;
      for (const [kind, path, digest] of [
        ["prd", observed.feature.planPath, observed.authority.prdSha256],
        ["spec", snapshot.state.planApproval?.poGateAuthority?.specPath, observed.authority.specSha256],
        ["result", snapshot.state.continuity?.authority?.result?.path, observed.authority.implementationResultSha256],
      ]) {
        // Result is a required package artifact even when its metadata marks it
        // non-authoritative; Continuity State still binds its exact current bytes.
        const entries = packageValue.artifacts?.filter((item) => item?.class === kind
          && (kind === "result" || item.authority === true)) ?? [];
        if (entries.length !== 1 || entries[0].path !== path || entries[0].sha256 !== digest) fail("CLOSE-PACKAGE-AUTHORITY", `registered package ${kind} does not bind current State authority`);
      }
    }
    courseAuthorship = assertCourseCriticEvidence(root, observed.feature, { audited: values.auditRequest !== undefined, deriveAddenda: deriveCriticAddenda });
    // A missing slice queue says nothing about whether the whole candidate
    // received independent review. Resolve the State and package contracts.
    // The audit route below reads the consumed Critic packet and exact Verify
    // lifecycle; a self-authored design receipt cannot stand in for either.
    if (requiresPublicationReview(snapshot.state, { rootDir: root }) && values.auditRequest === undefined) {
      fail("CLOSE-QUALIFICATION-REQUIRED", "rigor >= 1 feature close requires the candidate-bound Critic/Verify audit route: record the candidate's passing Verify and its Critic review as a Critic/Verify lifecycle, then plan this transition again with --audit-request <path> --critic-verify-lifecycle <id> (the request file has schema pipeline.feature-close-audit-request.v1 and names the same lifecycle id)");
    }
    if (values.auditRequest !== undefined) {
      const request = auditRequest(root, values.auditRequest);
      if (!SHA256.test(values.criticVerifyLifecycle ?? "") || values.criticVerifyLifecycle !== request.value.criticVerifyLifecycleId) {
        fail("CLOSE-CRITIC-VERIFY-ARGS", "coordinator request and audit request must name the same exact Critic/Verify lifecycle ID");
      }
      const options = {
        repositoryRoot: root,
        featureId: observed.feature.id,
        candidate: { commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) },
        manifestPath: request.value.manifestPath,
        coreVersion: request.value.coreVersion,
        packs: request.value.packs,
      };
      const auditPlan = await planFeatureCloseAudit(options);
      if (auditPlan.status === "blocked") fail(auditPlan.code, auditPlan.remedy ?? "feature-close audit preflight refused");
      if (auditPlan.result.sha256 !== observed.authority.implementationResultSha256) fail("CLOSE-AUDIT-RESULT", "audit Result differs from active feature authority");
      const packageValue = readJsonFile(root, options.manifestPath, "audit package").value;
      const specPath = snapshot.state.planApproval?.poGateAuthority?.specPath;
      for (const [kind, path, digest] of [["prd", observed.feature.planPath, observed.authority.prdSha256], ["spec", specPath, observed.authority.specSha256]]) {
        const artifact = packageValue.artifacts?.find((item) => item?.class === kind);
        if (artifact?.path !== path || artifact?.sha256 !== digest) fail("CLOSE-AUDIT-AUTHORITY", "audit package must bind the exact approved PRD and Spec");
      }
      const lifecycle = auditLifecycleReadback({ root, common, request, auditPlan });
      audit = {
        options,
        planSha256: auditPlan.planSha256,
        requestSha256: request.sha256,
        criticVerifyLifecycleId: request.value.criticVerifyLifecycleId,
        criticVerifyLifecycleReceiptSha256: lifecycle.lifecycle.receiptSha256,
        verifyEvidencePath: auditPlan.qualification.path,
        verifyEvidenceSha256: auditPlan.qualification.sha256,
      };
      advance.featureCloseAudit = {
        auditPlanSha256: audit.planSha256,
        auditReceiptSha256: lifecycle.lifecycle.receiptSha256,
        criticVerifyLifecycleId: audit.criticVerifyLifecycleId,
        criticVerifyLifecycleReceiptSha256: audit.criticVerifyLifecycleReceiptSha256,
        outputPath: auditPlan.qualification.path,
      };
      advance.inputDigest = sha256(canonical({
        pipelineStateSha256: snapshot.sha256,
        continuityCloseRequestSha256: closeRequest?.sha256 ?? null,
        auditPlanSha256: audit.planSha256,
        criticVerifyLifecycleId: audit.criticVerifyLifecycleId,
        criticVerifyLifecycleReceiptSha256: audit.criticVerifyLifecycleReceiptSha256,
        verifyEvidenceSha256: audit.verifyEvidenceSha256,
      }));
    } else {
      advance.featureCloseAudit = null;
      advance.inputDigest = sha256(canonical({
        pipelineStateSha256: snapshot.sha256,
        continuityCloseRequestSha256: closeRequest?.sha256 ?? null,
      }));
    }
    advance.authority = observed.authority;
    advance.architectureImpact = values.architectureImpact;
    advance.observedDigest = observed.authority.implementationResultSha256;
  } else if (values.phase === "tracked-close-finalized") {
    const tracked = evidence(root, common, values.lifecycle, values.evidence, "pipeline.close-tracked-effects.v1", [
      "schema", "resultSha256", "backlogSha256", "handoverSha256", "historySha256",
      "telemetrySha256", "retrospectiveSha256", "pipelineStateSha256",
    ]);
    for (const [key, value] of Object.entries(tracked.value)) if (key !== "schema" && !SHA256.test(value ?? "")) fail("CLOSE-EVIDENCE", "tracked effect digest is invalid");
    const closed = snapshot.state.closedFeatures?.at(-1);
    if (snapshot.state.activeFeature !== undefined
      || closed?.id !== stored.coordinator.featureId
      || closed?.coordinatorClose?.lifecycleId !== stored.coordinator.lifecycleId
      || closed?.coordinatorClose?.stateSha256 !== lifecycleDigest(stored.coordinator)
      || tracked.value.pipelineStateSha256 !== snapshot.sha256
      || tracked.value.resultSha256 !== stored.coordinator.authority.implementationResultSha256) {
      fail("CLOSE-TRACKED", "tracked close postimage is incomplete or drifted");
    }
    boundEvidenceSha256 = tracked.sha256;
    advance.inputDigest = tracked.sha256;
    advance.observedDigest = snapshot.sha256;
  } else if (values.phase === "candidate-frozen") {
    const candidate = gitCandidate(root);
    advance.candidateOid = candidate.oid;
    advance.candidateTree = candidate.tree;
    advance.inputDigest = snapshot.sha256;
    advance.observedDigest = sha256(canonical(candidate));
  } else if (values.phase === "final-verify-green") {
    const verified = evidence(root, common, values.lifecycle, values.evidence, "pipeline.close-final-verification.v1", [
      "schema", "candidateOid", "candidateTree", "verifyStatus", "verifySha256",
      "securityStatus", "securitySha256",
    ], { privateOnly: true });
    if (verified.value.candidateOid !== stored.coordinator.candidateOid
      || verified.value.candidateTree !== stored.coordinator.candidateTree
      || verified.value.verifyStatus !== "green" || !SHA256.test(verified.value.verifySha256 ?? "")
      || verified.value.securityStatus !== "green" || !SHA256.test(verified.value.securitySha256 ?? "")) {
      fail("CLOSE-VERIFY", "final Verify/Security evidence is not green for the frozen candidate");
    }
    const candidate = gitCandidate(root);
    if (candidate.oid !== stored.coordinator.candidateOid || candidate.tree !== stored.coordinator.candidateTree) fail("CLOSE-CANDIDATE-DRIFT", "candidate changed after freeze");
    boundEvidenceSha256 = verified.sha256;
    advance.candidateOid = candidate.oid;
    advance.candidateTree = candidate.tree;
    advance.inputDigest = verified.sha256;
    advance.observedDigest = sha256(canonical(verified.value));
  } else if (values.phase === "publication-authorized") {
    if (!values.authorized) fail("CLOSE-AUTHORIZATION", "publication requires separate authorization");
    const authorization = evidence(root, common, values.lifecycle, values.evidence, "pipeline.close-publication-authorization.v1", [
      "schema", "candidateOid", "candidateTree", "channel", "destinationDigest", "authorizedBy", "authorizedAt",
    ], { privateOnly: true });
    if (authorization.value.candidateOid !== stored.coordinator.candidateOid
      || authorization.value.candidateTree !== stored.coordinator.candidateTree
      || !["private", "neutral-public"].includes(authorization.value.channel)
      || !SHA256.test(authorization.value.destinationDigest ?? "")
      || typeof authorization.value.authorizedBy !== "string" || authorization.value.authorizedBy === ""
      || typeof authorization.value.authorizedAt !== "string" || authorization.value.authorizedAt === "") {
      fail("CLOSE-AUTHORIZATION", "publication authorization is invalid");
    }
    boundEvidenceSha256 = authorization.sha256;
    advance.authorization = true;
    advance.publicationAuthorization = {
      channel: authorization.value.channel,
      destinationDigest: authorization.value.destinationDigest,
      evidenceSha256: authorization.sha256,
    };
    advance.inputDigest = authorization.sha256;
    advance.observedDigest = sha256(canonical(authorization.value));
  } else if (values.phase === "published" || values.phase === "readback-confirmed") {
    const keys = [
      "schema", "status", "code", "channel", "transactionId", "destinationDigest",
      "destinationRef", "candidateOid", "candidateTree", "authorityRawSha256",
      "publicationReceiptDigest", "executorSha256", "pushAttempted", "readback",
      "receiptSha256",
    ];
    const publication = evidence(root, common, values.lifecycle, values.publication, PUBLICATION_EXECUTOR_RESULT_SCHEMA, keys, { privateOnly: true });
    try { validatePublicationExecutorResult(publication.value); } catch {
      fail("CLOSE-PUBLICATION", "fixed publication executor receipt is invalid");
    }
    if (publication.value.status !== "closed"
      || publication.value.candidateOid !== stored.coordinator.candidateOid
      || publication.value.candidateTree !== stored.coordinator.candidateTree) {
      fail("CLOSE-PUBLICATION", "fixed publication executor did not close the frozen candidate");
    }
    if (values.phase === "published"
      && (publication.value.channel !== stored.coordinator.publicationAuthorization?.channel
        || publication.value.destinationDigest
          !== stored.coordinator.publicationAuthorization?.destinationDigest)) {
      fail("CLOSE-PUBLICATION", "publication does not match the durable authorization");
    }
    if (values.phase === "readback-confirmed"
      && (publication.value.channel !== stored.coordinator.publication?.channel
        || publication.value.destinationDigest !== stored.coordinator.publication?.destinationDigest
        || publication.value.destinationRef !== stored.coordinator.publication?.ref
        || publication.value.publicationReceiptDigest
          !== stored.coordinator.publication?.publicationReceiptDigest)) {
      fail("CLOSE-PUBLICATION", "readback does not match the durable publication");
    }
    advance.publication = {
      channel: publication.value.channel,
      destinationDigest: publication.value.destinationDigest,
      ref: publication.value.destinationRef,
      oid: publication.value.candidateOid,
      tree: publication.value.candidateTree,
      publicationReceiptDigest: publication.value.publicationReceiptDigest,
      readbackReceiptDigest: values.phase === "readback-confirmed" ? publication.value.receiptSha256 : null,
    };
    boundEvidenceSha256 = publication.sha256;
    advance.inputDigest = publication.sha256;
    advance.observedDigest = sha256(canonical(publication.value));
  } else if (values.phase === "cleanup-complete") {
    const cleanup = evidence(root, common, values.lifecycle, values.evidence, "pipeline.close-cleanup-receipt.v1", [
      "schema", "status", "evidenceDigest", "candidateOid", "candidateTree",
    ], { privateOnly: true });
    if (!["complete", "uncertain"].includes(cleanup.value.status)
      || !SHA256.test(cleanup.value.evidenceDigest ?? "")
      || cleanup.value.candidateOid !== stored.coordinator.candidateOid
      || cleanup.value.candidateTree !== stored.coordinator.candidateTree) fail("CLOSE-CLEANUP", "cleanup evidence is invalid");
    boundEvidenceSha256 = cleanup.sha256;
    advance.cleanupStatus = cleanup.value.status;
    advance.cleanupEvidenceDigest = cleanup.value.evidenceDigest;
    advance.inputDigest = cleanup.sha256;
    advance.observedDigest = cleanup.value.evidenceDigest;
  } else if (["release-eligible", "promoted"].includes(values.phase)) {
    if (!values.authorized) fail("CLOSE-AUTHORIZATION", `${values.phase} requires a separate authorization`);
    const gate = evidence(root, common, values.lifecycle, values.evidence, `pipeline.close-${values.phase}-authorization.v1`, [
      "schema", "candidateOid", "candidateTree", "authorizedBy", "authorizedAt", "authorizationDigest",
    ], { privateOnly: true });
    if (gate.value.candidateOid !== stored.coordinator.candidateOid || gate.value.candidateTree !== stored.coordinator.candidateTree
      || !SHA256.test(gate.value.authorizationDigest ?? "")) fail("CLOSE-AUTHORIZATION", `${values.phase} authorization is invalid`);
    boundEvidenceSha256 = gate.sha256;
    advance.authorization = true;
    advance.inputDigest = gate.sha256;
    advance.observedDigest = gate.value.authorizationDigest;
  } else {
    advance.inputDigest = lifecycleDigest(stored.coordinator);
    advance.observedDigest = snapshot.sha256;
  }
  if (!SHA256.test(advance.inputDigest ?? "") || !SHA256.test(advance.observedDigest ?? "")) fail("CLOSE-DIGEST", "transition digests are invalid");
  const payload = {
    schema: "pipeline.close-coordinator.transition-plan.v1",
    root,
    lifecycleId: values.lifecycle,
    actor: values.actor.trim(),
    expectedRevision: stored.coordinator.revision,
    expectedStateSha256: lifecycleDigest(stored.coordinator),
    expectedRawSha256: stored.rawDigest,
    phase: values.phase,
    architectureImpact: values.architectureImpact ?? null,
    evidenceSha256: boundEvidenceSha256,
    audit,
    advance,
  };
  const digest = planDigest(payload);
  // D55 Q1: the course's authorship classification is reported beside the plan, outside its digest. It names the
  // `unrecorded` slices the gate does not refuse, so the close states them instead of passing them silently.
  return { ...payload, planSha256: digest, ...(courseAuthorship ? { courseAuthorship } : {}),
    nextAction: action("apply-transition", { ...values, root }, digest) };
}

function applyStart(values, suppliedDigest) {
  const plan = startPlan(values);
  if (plan.planSha256 !== suppliedDigest) fail("CLOSE-PLAN", "start plan digest drifted");
  const common = gitCommonDir(plan.root);
  if (existsSync(join(common, "agent-pipeline", "publication-close", plan.lifecycleId, "coordinator.json"))) {
    const prior = readCloseCoordinator(common, plan.lifecycleId);
    if (lifecycleDigest(prior.coordinator) === lifecycleDigest(plan.coordinator)) {
      const evidenceDirectory = ensurePrivateDirectory(join(publicationClosePaths(common, plan.lifecycleId).directory, "evidence"));
      const completion = coordinatorCompletion(prior.coordinator.phase);
      return {
        schema: "pipeline.close-coordinator.apply.v1",
        status: "replayed",
        phase: prior.coordinator.phase,
        completion,
        identity: { lifecycleId: prior.coordinator.lifecycleId, featureId: prior.coordinator.featureId },
        integrity: { coordinatorStateSha256: lifecycleDigest(prior.coordinator), persistedRecordSha256: prior.rawDigest },
        stateSha256: lifecycleDigest(prior.coordinator),
        rawSha256: prior.rawDigest,
        evidenceDirectory,
      };
    }
    fail("CLOSE-EXISTS", "a different coordinator already owns this lifecycle");
  }
  const stored = storeCloseCoordinator({ gitCommonDir: common, coordinator: plan.coordinator, expectedRawSha256: null });
  const evidenceDirectory = ensurePrivateDirectory(join(publicationClosePaths(common, plan.lifecycleId).directory, "evidence"));
  const completion = coordinatorCompletion(plan.coordinator.phase);
  return {
    schema: "pipeline.close-coordinator.apply.v1",
    status: "applied",
    phase: plan.coordinator.phase,
    completion,
    identity: { lifecycleId: plan.coordinator.lifecycleId, featureId: plan.coordinator.featureId },
    integrity: { coordinatorStateSha256: lifecycleDigest(plan.coordinator), persistedRecordSha256: stored.rawDigest },
    stateSha256: lifecycleDigest(plan.coordinator),
    rawSha256: stored.rawDigest,
    evidenceDirectory,
  };
}
function featureCloseAction(values, coordinator) {
  const audit = coordinator.featureCloseAudit;
  const argv = [
    STATE_WRITER, "close-feature", "--by", values.actor,
    "--architecture-impact", coordinator.architectureImpact,
    "--coordinator-lifecycle", coordinator.lifecycleId,
    "--coordinator-sha256", lifecycleDigest(coordinator),
  ];
  if (audit !== null && audit !== undefined) {
    argv.push("--critic-verify-lifecycle", audit.criticVerifyLifecycleId);
  }
  if (values.continuityCloseRequest !== undefined) argv.push("--continuity-close-request", values.continuityCloseRequest);
  return { executable: process.execPath, argv, mutation: true, requiresConfirmation: true,
    expected: { exitCode: 0, coordinatorPhase: "feature-close-prepared" } };
}

function preparedAuditReadback(root, common, coordinator, continuityRequest) {
  const audit = coordinator.featureCloseAudit;
  if (audit === null || audit === undefined) return null;
  try {
    const receiptPath = physicalAuditPath(common, `agent-pipeline/publication-close/${coordinator.lifecycleId}/evidence/feature-close-audit.json`);
    assertPrivateRegularFile(receiptPath);
    const saved = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (Object.keys(saved).sort().join("\0") !== "plan\0receipt") throw new Error("receipt shape");
    const checked = validateFeatureCloseAuditReceipt({ repositoryRoot: root, lifecycleId: coordinator.lifecycleId,
      expectedPlanSha256: audit.auditPlanSha256, plan: saved.plan, receipt: saved.receipt });
    if (!checked.ok || checked.receiptSha256 !== audit.auditReceiptSha256) throw new Error(checked.code ?? "receipt binding");
    const verify = readJsonFile(root, saved.plan.qualification.path, "candidate Verify evidence");
    const lifecycle = readCriticVerifyLifecycle({ repoRoot: root, gitCommonDir: common, id: audit.criticVerifyLifecycleId,
      candidate: saved.plan.candidate, evidencePath: saved.plan.qualification.path, evidence: verify.value });
    if (lifecycle.receiptSha256 !== audit.criticVerifyLifecycleReceiptSha256) throw new Error("lifecycle receipt drift");
    const expectedInput = sha256(canonical({
      pipelineStateSha256: stateSnapshot(root).sha256,
      continuityCloseRequestSha256: continuityRequest?.sha256 ?? null,
      auditPlanSha256: audit.auditPlanSha256,
      criticVerifyLifecycleId: audit.criticVerifyLifecycleId,
      criticVerifyLifecycleReceiptSha256: audit.criticVerifyLifecycleReceiptSha256,
      verifyEvidenceSha256: saved.plan.qualification.sha256,
    }));
    if (coordinator.effects.at(-1)?.inputDigest !== expectedInput) throw new Error("coordinator input drift");
    return { saved, checked, lifecycle };
  } catch (error) {
    fail(error?.code ?? "CLOSE-AUDIT-READBACK", "prepared feature close audit or Critic/Verify lifecycle changed; zero State mutation");
  }
}

/**
 * AC-175 part A (D209/D210): the generated audit index is written next to the close evidence on the feature-close-prepared
 * transition and named in the close result. It is evidence only: a missing source is a missing step INSIDE the index, and any
 * fault here becomes `{ status: "unavailable" }` in the result. It can never refuse, delay or change the close.
 */
function closeAuditIndex(root, common, coordinator, { replay = false } = {}) {
  try {
    const directory = join(publicationClosePaths(common, coordinator.lifecycleId).directory, "evidence");
    // A replay reports the index the first apply wrote; it never overwrites earlier evidence from a later State.
    if (replay) {
      const existing = readAuditIndexEvidence({ directory });
      if (existing !== null) return existing;
    }
    let commit;
    try { commit = git(root, ["rev-parse", "HEAD"]); } catch { commit = undefined; }
    const index = collectAuditIndex({ rootDir: root, featureId: coordinator.featureId, state: stateSnapshot(root).state, commit });
    return writeAuditIndexEvidence({ directory, index });
  } catch {
    return { status: "unavailable", code: "CLOSE-AUDIT-INDEX-UNAVAILABLE" };
  }
}

async function applyTransition(values, suppliedDigest) {
  const root = physicalRoot(values.root);
  const common = gitCommonDir(root);
  const prior = readCloseCoordinator(common, values.lifecycle);
  const priorEffect = prior.coordinator.effects.at(-1);
  if (prior.coordinator.phase === values.phase) {
    if (priorEffect?.operationSha256 === suppliedDigest) {
      const completion = coordinatorCompletion(prior.coordinator.phase);
      const result = {
        schema: "pipeline.close-coordinator.apply.v1",
        status: "replayed",
        phase: prior.coordinator.phase,
        completion,
        identity: { lifecycleId: prior.coordinator.lifecycleId, featureId: prior.coordinator.featureId },
        integrity: { coordinatorStateSha256: lifecycleDigest(prior.coordinator), persistedRecordSha256: prior.rawDigest },
        stateSha256: lifecycleDigest(prior.coordinator),
        rawSha256: prior.rawDigest,
      };
      if (prior.coordinator.phase === "feature-close-prepared") {
        const request = continuityCloseRequest(root, stateSnapshot(root), values.continuityCloseRequest);
        preparedAuditReadback(root, common, prior.coordinator, request);
        result.nextAction = featureCloseAction(values, prior.coordinator);
        result.auditIndex = closeAuditIndex(root, common, prior.coordinator, { replay: true });
      }
      return result;
    }
    if (!(values.phase === "cleanup-complete"
      && prior.coordinator.cleanup.status === "uncertain")) {
      fail("CLOSE-REPLAY", "transition conflicts with the durable phase");
    }
  }
  const plan = await transitionPlan(values);
  if (plan.planSha256 !== suppliedDigest) fail("CLOSE-PLAN", "transition plan digest drifted");
  const stored = readCloseCoordinator(common, plan.lifecycleId);
  if (stored.rawDigest !== plan.expectedRawSha256 || lifecycleDigest(stored.coordinator) !== plan.expectedStateSha256) fail("CLOSE-CAS", "coordinator changed after planning");
  let auditBinding;
  if (plan.audit !== null) {
    const executed = await executeFeatureCloseAudit({ options: plan.audit.options, lifecycleId: plan.lifecycleId,
      expectedPlanSha256: plan.audit.planSha256, activate: true });
    if (!new Set(["verified-pending-close", "replayed"]).has(executed.status)) fail(executed.code ?? "CLOSE-AUDIT-FAILED", `audit bundle did not verify; feature remains open${typeof executed.detail === "string" ? ` (${executed.detail})` : ""}`);
    const lifecycle = auditLifecycleReadback({ root, common, request: { value: { criticVerifyLifecycleId: plan.audit.criticVerifyLifecycleId } }, auditPlan: executed.receipt ? { ...((JSON.parse(readFileSync(executed.receiptPath, "utf8"))).plan) } : null });
    if (lifecycle.lifecycle.receiptSha256 !== plan.audit.criticVerifyLifecycleReceiptSha256) fail("CLOSE-CRITIC-VERIFY-DRIFT", "Critic/Verify lifecycle changed while audit bundle was built");
    if (readCloseCoordinator(common, plan.lifecycleId).rawDigest !== stored.rawDigest || stateSnapshot(root).sha256 !== plan.advance.authority.pipelineStateSha256) fail("CLOSE-CAS", "State changed while audit bundle was built; bundle is preserved for reconciliation");
    auditBinding = {
      auditPlanSha256: plan.audit.planSha256,
      auditReceiptSha256: executed.receiptSha256,
      criticVerifyLifecycleId: plan.audit.criticVerifyLifecycleId,
      criticVerifyLifecycleReceiptSha256: plan.audit.criticVerifyLifecycleReceiptSha256,
      outputPath: executed.receipt.outputPath,
    };
  }
  const next = advanceCloseCoordinator(stored.coordinator, {
    ...plan.advance,
    ...(auditBinding === undefined ? {} : { featureCloseAudit: auditBinding }),
    operationSha256: suppliedDigest,
  });
  const saved = storeCloseCoordinator({ gitCommonDir: common, coordinator: next, expectedRawSha256: stored.rawDigest });
  const result = {
    schema: "pipeline.close-coordinator.apply.v1",
    status: saved.written ? "applied" : "replayed",
    phase: next.phase,
    completion: coordinatorCompletion(next.phase),
    identity: { lifecycleId: next.lifecycleId, featureId: next.featureId },
    integrity: { coordinatorStateSha256: lifecycleDigest(next), persistedRecordSha256: saved.rawDigest },
    stateSha256: lifecycleDigest(next),
    rawSha256: saved.rawDigest,
  };
  if (next.phase === "feature-close-prepared") {
    result.nextAction = featureCloseAction(values, next);
    result.auditIndex = closeAuditIndex(root, common, next);
  }
  return result;
}

const [command, ...argv] = process.argv.slice(2);
try {
  if (command === "--help" && argv.length === 0) {
    process.stdout.write(`${CLI_HELP}\n`);
  } else if (command === "next" && argv.length === 1 && COORDINATOR_PHASES.includes(argv[0])) {
    const completion = coordinatorCompletion(argv[0]);
    emit({
      schema: "pipeline.close-coordinator.next.v2",
      phase: argv[0],
      next: completion.next,
      terminal: completion.workflowTerminal,
      completion,
    });
  } else if (command === "inspect") {
    const parsed = exactArgs(argv, new Set(["root", "lifecycle"]));
    if (!parsed || !parsed.values.root || !ID.test(parsed.values.lifecycle ?? "")) fail("CLOSE-ARGS", "inspect arguments invalid");
    const root = physicalRoot(parsed.values.root);
    const common = gitCommonDir(root);
    const stored = readCloseCoordinator(common, parsed.values.lifecycle);
    emit({
      schema: "pipeline.close-coordinator.inspect.v1",
      coordinator: stored.coordinator,
      completion: coordinatorCompletion(stored.coordinator.phase),
      identity: { lifecycleId: stored.coordinator.lifecycleId, featureId: stored.coordinator.featureId },
      integrity: { coordinatorStateSha256: lifecycleDigest(stored.coordinator), persistedRecordSha256: stored.rawDigest },
      stateSha256: lifecycleDigest(stored.coordinator),
      rawSha256: stored.rawDigest,
      evidenceDirectory: join(publicationClosePaths(common, parsed.values.lifecycle).directory, "evidence"),
      next: coordinatorNextPhases(stored.coordinator.phase),
    });
  } else if (command === "plan-start" || command === "apply-start") {
    const parsed = exactArgs(argv, new Set(["root", "lifecycle", "actor", "close-intent", "plan-sha256"]), new Set(["activate"]));
    if (!parsed || !parsed.values.root || !parsed.values.lifecycle || !parsed.values.actor || !CLOSE_INTENTS.has(parsed.values["close-intent"])) fail("CLOSE-INTENT", `${command} requires --close-intent durable-stop or runtime-transfer`);
    const values = { root: parsed.values.root, lifecycle: parsed.values.lifecycle, actor: parsed.values.actor, closeIntent: parsed.values["close-intent"] };
    if (command === "plan-start") {
      if (parsed.values["plan-sha256"] || parsed.booleans.activate) fail("CLOSE-ARGS", "plan-start is read-only");
      emit(startPlan(values));
    } else {
      if (!parsed.booleans.activate || !SHA256.test(parsed.values["plan-sha256"] ?? "")) fail("CLOSE-ACTIVATE", "apply-start requires exact digest and activation");
      emit(applyStart(values, parsed.values["plan-sha256"]));
    }
  } else if (command === "plan-transition" || command === "apply-transition") {
    const parsed = exactArgs(argv, new Set([
      "root", "lifecycle", "actor", "phase", "evidence", "publication",
      "continuity-close-request", "architecture-impact", "audit-request", "critic-verify-lifecycle", "plan-sha256",
    ]), new Set(["activate", "authorized"]));
    if (!parsed || !parsed.values.root || !parsed.values.lifecycle || !parsed.values.actor || !parsed.values.phase) fail("CLOSE-ARGS", `${command} arguments invalid`);
    const values = {
      root: parsed.values.root,
      lifecycle: parsed.values.lifecycle,
      actor: parsed.values.actor,
      phase: parsed.values.phase,
      architectureImpact: parsed.values["architecture-impact"],
      evidence: parsed.values.evidence,
      publication: parsed.values.publication,
      continuityCloseRequest: parsed.values["continuity-close-request"],
      auditRequest: parsed.values["audit-request"],
      criticVerifyLifecycle: parsed.values["critic-verify-lifecycle"],
      authorized: parsed.booleans.authorized === true,
    };
    if (command === "plan-transition") {
      if (parsed.values["plan-sha256"] || parsed.booleans.activate) fail("CLOSE-ARGS", "plan-transition is read-only");
      emit(await transitionPlan(values, { deriveCriticAddenda: true }));
    } else {
      if (!parsed.booleans.activate || !SHA256.test(parsed.values["plan-sha256"] ?? "")) fail("CLOSE-ACTIVATE", "apply-transition requires exact digest and activation");
      emit(await applyTransition(values, parsed.values["plan-sha256"]));
    }
  } else {
    fail("CLOSE-COMMAND", "unsupported close-coordinator command");
  }
} catch (error) {
  emit({
    schema: "pipeline.close-coordinator.error.v1",
    status: "refused",
    code: error?.code ?? "CLOSE-FAILED",
    message: error instanceof Error ? error.message : "close coordinator failed",
    ...(error?.criticAddenda === undefined ? {} : { criticAddenda: error.criticAddenda }),
  }, 2);
}
