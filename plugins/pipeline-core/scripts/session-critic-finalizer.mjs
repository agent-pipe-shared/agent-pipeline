#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Durable, runner-neutral acceptance boundary for the ordinary fresh-session Critic. */

import { randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";
import {
  GOVERNANCE_REVIEW_SOURCE_SCHEMA,
  buildGovernanceReviewAction,
  buildGovernanceReviewRetry,
  preflightGovernanceReviewActionOutput,
  writeGovernanceReviewAction,
} from "../lib/governance-review-action.mjs";
import { preflightCriticDispatch } from "./critic-dispatch-preflight.mjs";
import { selectModelRoleForTask } from "./model-role-dispatch-select.mjs";
import {
  SESSION_PACKET_BINDING_SCHEMA,
  canonicalJson,
  claimCandidatePacket,
  cleanupCandidatePacket,
  consumeCandidatePacket,
  inspectClaimedSessionAdmission,
  prepareCandidatePacket,
  publishClaimedSessionAdmission,
  recordCandidateResult,
  sha256,
} from "./critic-packet-preflight.mjs";

export const SESSION_CRITIC_RESULT_SCHEMA = "pipeline.session-critic-result.v1";
export const SESSION_CRITIC_ADMISSION_RESULT_SCHEMA = "pipeline.session-critic-prelaunch-admission.v1";
export const SESSION_CRITIC_RECEIPT_SCHEMA = "pipeline.session-critic-receipt.v1";
export const SESSION_CRITIC_FINALIZE_RESULT_SCHEMA = "pipeline.session-critic-finalization.v1";
export const SESSION_CRITIC_FINALIZE_REQUEST_SCHEMA = "pipeline.session-critic-finalization-request.v1";
export const SESSION_CRITIC_CLI_ERROR_SCHEMA = "pipeline.session-critic-finalization-error.v1";
export const SESSION_CRITIC_ASSURANCE = "functional-equivalent-read-only; OS isolation not asserted";
const CLI_HELP = [
  "Usage: session-critic-finalizer.mjs admit --root <repository-root> --request <repo-relative request.json>",
  "Usage: session-critic-finalizer.mjs finalize --root <repository-root> --request <repo-relative request.json>",
  "       session-critic-finalizer.mjs --help",
  "",
  "Admit and claim before the fresh Critic starts; finalize only the same preclaimed packet after return.",
].join("\n");

const HERE = dirname(fileURLToPath(import.meta.url));
const VERDICT_SCHEMA = JSON.parse(readFileSync(join(HERE, "critic-verdict.schema.json"), "utf8"));
const PACKET_ID = /^[a-f0-9]{32}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/u;
const RESULT_KEYS = Object.freeze(["schema", "packetId", "packetDigest", "session", "candidate", "reviewRange", "rulesetSha", "assurance", "verdict"]);
const RECEIPT_KEYS = Object.freeze(["schema", "packetId", "packetDigest", "session", "candidate", "reviewRange", "rulesetSha", "assurance", "verdictSha256", "findingCount", "reviewPass"]);
const ROUTE_KEYS = Object.freeze(["routeId", "runner", "adapter", "provider", "modelTier", "effortTier"]);
const REQUEST_KEYS = Object.freeze(["schema", "taskId", "projectId", "sessionId", "packetId", "trigger", "route", "review", "verdictPath", "event"]);
const REVIEW_KEYS = Object.freeze(["base", "candidate", "specPath", "guardrailPaths", "evidencePaths", "priorCriticEvidencePath"]);
const EVENT_KEYS = Object.freeze(["eventOutPath", "featureId"]);

export class SessionCriticFinalizerError extends Error {
  constructor(code) {
    super("Session Critic finalization is invalid.");
    this.name = "SessionCriticFinalizerError";
    this.code = code;
  }
}

function fail(code) { throw new SessionCriticFinalizerError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function gitText(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 5_000 });
  if (!isSuccessfulSpawn(result)) fail("SCF-GIT");
  return String(result.stdout).trim();
}
function controlRootFor(repoRoot) {
  const common = realpathSync(resolve(repoRoot, gitText(repoRoot, ["rev-parse", "--git-common-dir"])));
  const parent = join(common, "agent-pipeline");
  const controlRoot = join(parent, "critic-packets");
  mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    chmodSync(parent, 0o700);
    chmodSync(controlRoot, 0o700);
  }
  return controlRoot;
}
function routeFor(route, preflightSha256) {
  if (!exact(route, ROUTE_KEYS)) fail("SCF-ROUTE");
  return { ...route, assurance: SESSION_CRITIC_ASSURANCE, projectionDigest: preflightSha256 };
}
function selectedSessionCriticModelRole(root, trigger, route, deps) {
  const runner = route.runner;
  const env = deps.modelRoleEnvironment ?? process.env;
  const identityAvailable = runner === "codex"
    ? env.CODEX_SESSION_ID !== undefined || env.CODEX_THREAD_ID !== undefined
    : runner === "claude" ? env.CLAUDE_CODE_SESSION_ID !== undefined : false;
  if (!identityAvailable) return null;
  // T1 covers architecture/guardrail/security changes; T2 is the separate
  // high-risk-class row. Neither may be downgraded to the normal Critic duty.
  const taskRoute = trigger === "T1" || trigger === "T2"
    ? "duty.critic_high_risk" : "duty.critic_normal";
  let selected;
  try {
    selected = (deps.selectModelRoleForTaskFn ?? selectModelRoleForTask)({
      rootDir: root, runner, taskRoute, env });
  } catch { return null; }
  // Model-role admission is optional. Only a fully bound current-session
  // selection may replace the independently admitted V3 Critic route.
  if (!selected?.ok || selected.status !== "ready"
    || selected.runner !== runner || selected.taskRoute !== taskRoute) return null;
  if (route.effortTier !== selected.effort || typeof selected.modelId !== "string"
    || selected.modelId.trim() !== selected.modelId || selected.modelId.length === 0
    || !SHA256.test(selected.readbackSha256 ?? "")
    || !SHA256.test(selected.receiptSha256 ?? "")) return null;
  return { schema: "pipeline.session-critic-model-role.v1", runner, taskRoute,
    modelId: selected.modelId, effort: selected.effort,
    readbackSha256: selected.readbackSha256,
    receiptSha256: selected.receiptSha256 };
}
function sessionId(value) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail("SCF-SESSION");
  return value;
}
function actionIdentity(value) {
  return (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value))
    || (exact(value, ["state"]) && value.state === "not-applicable");
}
function repoPath(root, value, code) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || value.trim() !== value
    || value.includes("\\") || value.includes("\0") || isAbsolute(value) || value.startsWith("./") || value.endsWith("/")
    || value.split("/").some((part) => part === "" || part === "." || part === "..")) fail(code);
  const target = resolve(root, value);
  const rel = relative(root, target);
  if (target === root || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(code);
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) fail(code);
  }
  const info = lstatSync(target);
  if (!info.isFile() || info.size > 1024 * 1024) fail(code);
  return target;
}
function readBoundedJson(root, path, code) {
  try { return JSON.parse(readFileSync(repoPath(root, path, code), "utf8")); }
  catch (error) {
    if (error instanceof SessionCriticFinalizerError) throw error;
    fail(code);
  }
}
function validateCliRequest(value) {
  if (!exact(value, REQUEST_KEYS) || value.schema !== SESSION_CRITIC_FINALIZE_REQUEST_SCHEMA
    || !SAFE_ID.test(value.taskId ?? "") || !SAFE_ID.test(value.projectId ?? "")
    || !SAFE_ID.test(value.sessionId ?? "") || !PACKET_ID.test(value.packetId ?? "")
    || !["T0", "T1", "T2", "T3"].includes(value.trigger)
    || !exact(value.route, ROUTE_KEYS) || !exact(value.review, REVIEW_KEYS)
    || typeof value.review.base !== "string" || typeof value.review.candidate !== "string"
    || typeof value.review.specPath !== "string" || !Array.isArray(value.review.guardrailPaths)
    || !Array.isArray(value.review.evidencePaths)
    || !(value.review.priorCriticEvidencePath === null || typeof value.review.priorCriticEvidencePath === "string")
    || typeof value.verdictPath !== "string"
    || !(value.event === null || (exact(value.event, EVENT_KEYS)
      && typeof value.event.eventOutPath === "string"
      && (typeof value.event.featureId === "string" || value.event.featureId === null)))) fail("SCF-REQUEST");
  return value;
}
function assertVerdict(verdict) {
  const result = validateAgainstSchema(verdict, VERDICT_SCHEMA);
  if (!result.valid) fail("SCF-VERDICT-SCHEMA");
  const blocking = verdict.findings.some(({ severity }) => severity === "blocker" || severity === "major");
  if (verdict.pass && (blocking || verdict.briefing_violations.length > 0 || verdict.trajectory_verdict !== "consistent")) {
    fail("SCF-VERDICT-CONTRADICTION");
  }
  return verdict;
}
function candidateFor(preflight) {
  if (preflight.base === undefined) fail("SCF-RANGE");
  return {
    base: preflight.base?.commit ?? preflight.base?.tree,
    commit: preflight.candidate.commit,
    tree: preflight.candidate.tree,
  };
}
function referencesFor(preflight) {
  return [
    { kind: "spec", path: preflight.spec.path },
    ...preflight.guardrails.map(({ path }) => ({ kind: "guardrail", path })),
  ].filter((entry, index, all) => all.findIndex((candidate) => candidate.kind === entry.kind && candidate.path === entry.path) === index);
}
function courseDigestsFor(preflight) {
  const course = preflight.coordinatorOnly.courseAdmission;
  if (course !== null && course !== undefined) {
    if (!SHA256.test(course.sourceSha256) || !SHA256.test(course.decisionSha256)) fail("SCF-COURSE");
    return { courseSourceSha256: course.sourceSha256, courseDecisionSha256: course.decisionSha256 };
  }
  // Legacy non-feature-package reviews have no Nova A5 course authority.
  // Bind that explicit absence to this exact candidate; never call it PASS.
  const subject = { kind: "unversioned-review", candidate: preflight.candidate, base: preflight.base ?? null };
  return {
    courseSourceSha256: sha256(canonicalJson(subject)),
    courseDecisionSha256: sha256(canonicalJson({ ...subject, decision: "course-not-applicable" })),
  };
}

function admittedRouteFor(packet, requestedRoute, trigger, preflightSha256) {
  const binding = packet.request.sessionBinding;
  const role = binding?.modelRole;
  if (role === undefined) return routeFor(requestedRoute, preflightSha256);
  const taskRoute = trigger === "T1" || trigger === "T2"
    ? "duty.critic_high_risk" : "duty.critic_normal";
  if (!exact(role, ["schema", "runner", "taskRoute", "modelId", "effort", "readbackSha256", "receiptSha256"])
    || role.schema !== "pipeline.session-critic-model-role.v1"
    || role.runner !== requestedRoute.runner || role.taskRoute !== taskRoute
    || role.effort !== requestedRoute.effortTier
    || typeof role.modelId !== "string" || role.modelId.length === 0
    || !SHA256.test(role.readbackSha256) || !SHA256.test(role.receiptSha256)) fail("SCF-MODEL-ROLE");
  // The model was selected before launch and sealed in the claimed packet.
  // Finalization checks that admission; it must not reselect or compare the
  // exact admitted model with the older V3 selector in the caller's request.
  return routeFor({ ...requestedRoute, modelTier: role.modelId }, preflightSha256);
}

/** Prepare and claim the exact session packet before any fresh Critic spawn. */
export function admitSessionCriticReview(options, deps = {}) {
  const preflight = (deps.preflightCriticDispatchFn ?? preflightCriticDispatch)(options.preflightInput);
  if (preflight?.status !== "packet-ready" || preflight.dispatch?.requiredNextGate !== "session-critic-dispatch") fail("SCF-PREFLIGHT");
  const root = realpathSync(resolve(options.preflightInput.root));
  const id = sessionId(options.sessionId);
  if (options.eventOutPath !== undefined) {
    (deps.preflightGovernanceReviewActionOutputFn ?? preflightGovernanceReviewActionOutput)({ rootDir: root, eventOutPath: options.eventOutPath });
    if (!actionIdentity(options.featureId ?? { state: "not-applicable" })) fail("SCF-EVENT-FEATURE");
  }
  const packetId = options.packetId;
  if (!PACKET_ID.test(packetId ?? "")) fail("SCF-PACKET-ID");
  const preflightSha256 = sha256(canonicalJson(preflight));
  const modelRole = selectedSessionCriticModelRole(root, options.trigger ?? "T1", options.route, deps);
  const route = routeFor(modelRole === null ? options.route
    : { ...options.route, modelTier: modelRole.modelId }, preflightSha256);
  const controlRoot = controlRootFor(root);
  const prepared = (deps.prepareCandidatePacketFn ?? prepareCandidatePacket)({
    repoRoot: root,
    controlRoot,
    packetId,
    taskId: options.taskId,
    projectId: options.projectId,
    baseCommit: candidateFor(preflight).base,
    candidateCommit: preflight.candidate.commit,
    rulesetOid: preflight.dispatch.reviewerInput.rulesetSha,
    trigger: options.trigger ?? "T1",
    route,
    references: referencesFor(preflight),
    evidencePaths: options.preflightInput.evidencePaths,
    sessionBinding: {
      schema: SESSION_PACKET_BINDING_SCHEMA,
      sessionId: id,
      preflightSha256,
      assurance: SESSION_CRITIC_ASSURANCE,
      freshContext: true,
      historyInherited: false,
      mayDelegate: false,
      ...(modelRole === null ? {} : { modelRole }),
    },
  }, deps.packetDependencies);
  (deps.claimCandidatePacketFn ?? claimCandidatePacket)({
    controlRoot, packetId, adapter: prepared.packet.route.adapter,
    claimantNonce: (deps.randomBytesFn ?? randomBytes)(32).toString("hex"),
  }, deps.packetDependencies);
  const admission = (deps.publishClaimedSessionAdmissionFn ?? publishClaimedSessionAdmission)({
    controlRoot, packetId, preflightSha256, ...courseDigestsFor(preflight),
  }, deps.packetDependencies);
  return Object.freeze({ schema: SESSION_CRITIC_ADMISSION_RESULT_SCHEMA,
    status: "admitted", packetId, packetDigest: prepared.packetDigest,
    admissionSha256: sha256(canonicalJson(admission.admission)) });
}
function buildResult({ packet, packetDigest, session, verdict }) {
  return Object.freeze({
    schema: SESSION_CRITIC_RESULT_SCHEMA,
    packetId: packet.packetId,
    packetDigest,
    session: { id: session, freshContext: true, historyInherited: false, mayDelegate: false },
    candidate: { base: packet.candidate.base, commit: packet.candidate.commit, tree: packet.candidate.tree },
    reviewRange: { base: packet.diff.base, commit: packet.diff.commit, diffSha256: packet.diff.sha256 },
    rulesetSha: packet.ruleset.oid,
    assurance: SESSION_CRITIC_ASSURANCE,
    verdict: assertVerdict(verdict),
  });
}
function validateResult(result, packet) {
  const sessionBinding = packet.request.sessionBinding;
  if (!exact(result, RESULT_KEYS) || result.schema !== SESSION_CRITIC_RESULT_SCHEMA
    || result.packetId !== packet.packetId || result.packetDigest !== sha256(canonicalJson(packet))
    || !exact(sessionBinding, Object.hasOwn(sessionBinding ?? {}, "modelRole")
      ? ["schema", "sessionId", "preflightSha256", "assurance", "freshContext", "historyInherited", "mayDelegate", "modelRole"]
      : ["schema", "sessionId", "preflightSha256", "assurance", "freshContext", "historyInherited", "mayDelegate"])
    || sessionBinding.schema !== SESSION_PACKET_BINDING_SCHEMA
    || !exact(result.session, ["id", "freshContext", "historyInherited", "mayDelegate"])
    || result.session.id !== sessionBinding.sessionId || result.session.freshContext !== true
    || result.session.historyInherited !== false || result.session.mayDelegate !== false
    || packet.route.projectionDigest !== sessionBinding.preflightSha256
    || packet.route.assurance !== sessionBinding.assurance
    || canonicalJson(result.candidate) !== canonicalJson({ base: packet.candidate.base, commit: packet.candidate.commit, tree: packet.candidate.tree })
    || canonicalJson(result.reviewRange) !== canonicalJson({ base: packet.diff.base, commit: packet.diff.commit, diffSha256: packet.diff.sha256 })
    || result.rulesetSha !== packet.ruleset.oid || result.assurance !== SESSION_CRITIC_ASSURANCE) fail("SCF-RESULT-BINDING");
  assertVerdict(result.verdict);
  return result;
}
function receiptFor(result) {
  return Object.freeze({
    schema: SESSION_CRITIC_RECEIPT_SCHEMA,
    packetId: result.packetId,
    packetDigest: result.packetDigest,
    session: result.session,
    candidate: result.candidate,
    reviewRange: result.reviewRange,
    rulesetSha: result.rulesetSha,
    assurance: result.assurance,
    verdictSha256: sha256(canonicalJson(result.verdict)),
    findingCount: result.verdict.findings.length,
    reviewPass: result.verdict.pass,
  });
}

export function validateSessionCriticReceipt(receipt) {
  if (!exact(receipt, RECEIPT_KEYS) || receipt.schema !== SESSION_CRITIC_RECEIPT_SCHEMA
    || !PACKET_ID.test(receipt.packetId) || !SHA256.test(receipt.packetDigest)
    || !exact(receipt.session, ["id", "freshContext", "historyInherited", "mayDelegate"])
    || !SAFE_ID.test(receipt.session.id) || receipt.session.freshContext !== true
    || receipt.session.historyInherited !== false || receipt.session.mayDelegate !== false
    || !OID.test(receipt.rulesetSha)
    || receipt.assurance !== SESSION_CRITIC_ASSURANCE || !SHA256.test(receipt.verdictSha256)
    || !Number.isSafeInteger(receipt.findingCount) || receipt.findingCount < 0
    || typeof receipt.reviewPass !== "boolean"
    || !exact(receipt.candidate, ["base", "commit", "tree"])
    || !exact(receipt.reviewRange, ["base", "commit", "diffSha256"])
    || receipt.candidate.base !== receipt.reviewRange.base || receipt.candidate.commit !== receipt.reviewRange.commit
    || !OID.test(receipt.candidate.base) || !OID.test(receipt.candidate.commit) || !OID.test(receipt.candidate.tree)
    || !SHA256.test(receipt.reviewRange.diffSha256)) fail("SCF-RECEIPT");
  return receipt;
}

/** Complete one fresh session against its *pre-existing* prelaunch admission. */
export function finalizeSessionCriticReview(options, deps = {}) {
  const preflight = (deps.preflightCriticDispatchFn ?? preflightCriticDispatch)(options.preflightInput);
  if (preflight?.status !== "packet-ready" || preflight.dispatch?.requiredNextGate !== "session-critic-dispatch") fail("SCF-PREFLIGHT");
  const root = realpathSync(resolve(options.preflightInput.root));
  const id = sessionId(options.sessionId);
  assertVerdict(options.verdict);
  const preflightSha256 = sha256(canonicalJson(preflight));
  const packetId = options.packetId;
  if (!PACKET_ID.test(packetId)) fail("SCF-PACKET-ID");
  const eventRequested = options.eventOutPath !== undefined;
  if (eventRequested) {
    (deps.preflightGovernanceReviewActionOutputFn ?? preflightGovernanceReviewActionOutput)({ rootDir: root, eventOutPath: options.eventOutPath });
    const featureId = options.featureId ?? { state: "not-applicable" };
    if (!actionIdentity(featureId)) fail("SCF-EVENT-FEATURE");
    if (!options.verdict.pass && options.verdict.findings.length === 0) fail("SCF-EVENT-VERDICT");
  }
  const controlRoot = controlRootFor(root);
  let admitted;
  try {
    admitted = (deps.inspectClaimedSessionAdmissionFn ?? inspectClaimedSessionAdmission)({ controlRoot, packetId }, deps.packetDependencies);
  } catch { fail("SCF-PRELAUNCH-ADMISSION"); }
  const packet = admitted.packet;
  const expectedReferences = referencesFor(preflight).sort((left, right) => {
    const a = `${left.kind}:${left.path}`;
    const b = `${right.kind}:${right.path}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const actualReferences = packet.references.map(({ kind, path }) => ({ kind, path }));
  const expectedCourse = courseDigestsFor(preflight);
  if (admitted.admission.preflightSha256 !== preflightSha256
    || admitted.admission.courseSourceSha256 !== expectedCourse.courseSourceSha256
    || admitted.admission.courseDecisionSha256 !== expectedCourse.courseDecisionSha256
    || packet.request.taskId !== options.taskId || packet.request.projectId !== options.projectId
    || packet.request.trigger !== (options.trigger ?? "T1")
    || packet.request.sessionBinding?.sessionId !== id
    || packet.candidate.base !== candidateFor(preflight).base
    || packet.candidate.commit !== preflight.candidate.commit
    || packet.candidate.tree !== preflight.candidate.tree
    || packet.ruleset.oid !== preflight.dispatch.reviewerInput.rulesetSha
    || canonicalJson(packet.route) !== canonicalJson(admittedRouteFor(packet, options.route,
      options.trigger ?? "T1", preflightSha256))
    || canonicalJson(actualReferences) !== canonicalJson(expectedReferences)) fail("SCF-PRELAUNCH-BINDING");
  const prepared = { packet, packetDigest: sha256(canonicalJson(packet)) };

  let event = null;
  const result = buildResult({ packet: prepared.packet, packetDigest: prepared.packetDigest, session: id, verdict: options.verdict });
  validateResult(result, prepared.packet);
  const expectedReceipt = validateSessionCriticReceipt(receiptFor(result));
  const recorded = (deps.recordCandidateResultFn ?? recordCandidateResult)({ controlRoot: controlRootFor(root), packetId, result }, deps.packetDependencies);
  const receipt = validateSessionCriticReceipt(receiptFor(recorded.record.body));
  if (canonicalJson(receipt) !== canonicalJson(expectedReceipt)) fail("SCF-RECEIPT-BINDING");
  const consumed = (deps.consumeCandidatePacketFn ?? consumeCandidatePacket)({ controlRoot: controlRootFor(root), packetId, receipt }, deps.packetDependencies);
  if (consumed.replay === true) fail("SCF-FIRST-CONSUME-REPLAY");
  const readback = (deps.consumeCandidatePacketFn ?? consumeCandidatePacket)({ controlRoot: controlRootFor(root), packetId, receipt }, deps.packetDependencies);
  if (readback.replay !== true || canonicalJson(readback.record.body) !== canonicalJson(receipt)) fail("SCF-RECEIPT-READBACK");

  if (eventRequested) {
    event = (deps.buildGovernanceReviewActionFn ?? buildGovernanceReviewAction)({
      schema: GOVERNANCE_REVIEW_SOURCE_SCHEMA,
      receiptSha256: sha256(canonicalJson(readback.record.body)),
      verdictSha256: receipt.verdictSha256,
      candidate: { commit: receipt.candidate.commit, tree: receipt.candidate.tree },
      featureId: options.featureId ?? { state: "not-applicable" },
      sessionId: receipt.session.id,
      reviewPass: receipt.reviewPass,
      findingCount: receipt.findingCount,
    });
    try {
      (deps.writeGovernanceReviewActionFn ?? writeGovernanceReviewAction)({ rootDir: root, eventOutPath: options.eventOutPath, event });
    } catch (error) {
      try { (deps.cleanupCandidatePacketFn ?? cleanupCandidatePacket)({ controlRoot: controlRootFor(root), packetId, cleanupCapability: prepared.packet.cleanupCapability }, deps.packetDependencies); } catch { /* receipt and retry remain authoritative */ }
      return Object.freeze({
        schema: SESSION_CRITIC_FINALIZE_RESULT_SCHEMA,
        status: "source-complete/event-unavailable",
        receipt,
        code: error?.code ?? "GRA-OUTPUT-UNAVAILABLE",
        retry: buildGovernanceReviewRetry({ eventOutPath: options.eventOutPath, event }),
      });
    }
  }
  try {
    (deps.cleanupCandidatePacketFn ?? cleanupCandidatePacket)({ controlRoot: controlRootFor(root), packetId, cleanupCapability: prepared.packet.cleanupCapability }, deps.packetDependencies);
  } catch { fail("SCF-CLEANUP"); }
  return Object.freeze({
    schema: SESSION_CRITIC_FINALIZE_RESULT_SCHEMA,
    status: "completed",
    receipt,
    ...(event === null ? {} : { event }),
  });
}

/** Closed CLI adapter. The request and verdict stay as bounded local files. */
export function runSessionCriticFinalizerCli(argv, deps = {}) {
  try {
    if (!Array.isArray(argv) || argv.length !== 5 || !["admit", "finalize"].includes(argv[0]) || argv[1] !== "--root" || argv[3] !== "--request") fail("SCF-USAGE");
    const root = realpathSync(resolve(argv[2]));
    const request = validateCliRequest(readBoundedJson(root, argv[4], "SCF-REQUEST-FILE"));
    const common = {
      preflightInput: {
        root,
        base: request.review.base,
        candidate: request.review.candidate,
        specPath: request.review.specPath,
        guardrailPaths: request.review.guardrailPaths,
        evidencePaths: request.review.evidencePaths,
        priorCriticEvidencePath: request.review.priorCriticEvidencePath,
      },
      taskId: request.taskId,
      projectId: request.projectId,
      sessionId: request.sessionId,
      packetId: request.packetId,
      trigger: request.trigger,
      route: request.route,
      ...(request.event === null ? {} : {
        eventOutPath: request.event.eventOutPath,
        featureId: request.event.featureId ?? { state: "not-applicable" },
      }),
    };
    if (argv[0] === "admit") {
      return Object.freeze({ exitCode: 0, output: admitSessionCriticReview(common, deps) });
    }
    const verdict = readBoundedJson(root, request.verdictPath, "SCF-VERDICT-FILE");
    const result = finalizeSessionCriticReview({ ...common, verdict }, deps);
    return Object.freeze({ exitCode: result.status === "completed" ? 0 : 2, output: result });
  } catch (error) {
    return Object.freeze({
      exitCode: 2,
      output: Object.freeze({
        schema: SESSION_CRITIC_CLI_ERROR_SCHEMA,
        status: "rejected",
        code: error instanceof SessionCriticFinalizerError ? error.code : "SCF-INTERNAL",
      }),
    });
  }
}

export const __test = Object.freeze({ buildResult, receiptFor, validateResult });

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--help") {
    process.stdout.write(`${CLI_HELP}\n`);
  } else {
    const result = runSessionCriticFinalizerCli(argv);
    process.stdout.write(`${JSON.stringify(result.output)}\n`);
    process.exitCode = result.exitCode;
  }
}
