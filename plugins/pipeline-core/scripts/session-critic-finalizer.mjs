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
import {
  GOVERNANCE_REVIEW_SOURCE_SCHEMA,
  buildGovernanceReviewAction,
  buildGovernanceReviewRetry,
  preflightGovernanceReviewActionOutput,
  writeGovernanceReviewAction,
} from "../lib/governance-review-action.mjs";
import { preflightCriticDispatch } from "./critic-dispatch-preflight.mjs";
import {
  SESSION_PACKET_BINDING_SCHEMA,
  canonicalJson,
  claimCandidatePacket,
  cleanupCandidatePacket,
  consumeCandidatePacket,
  prepareCandidatePacket,
  recordCandidateResult,
  sha256,
} from "./critic-packet-preflight.mjs";

export const SESSION_CRITIC_RESULT_SCHEMA = "pipeline.session-critic-result.v1";
export const SESSION_CRITIC_RECEIPT_SCHEMA = "pipeline.session-critic-receipt.v1";
export const SESSION_CRITIC_FINALIZE_RESULT_SCHEMA = "pipeline.session-critic-finalization.v1";
export const SESSION_CRITIC_FINALIZE_REQUEST_SCHEMA = "pipeline.session-critic-finalization-request.v1";
export const SESSION_CRITIC_CLI_ERROR_SCHEMA = "pipeline.session-critic-finalization-error.v1";
export const SESSION_CRITIC_ASSURANCE = "functional-equivalent-read-only; OS isolation not asserted";

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
  if (result.error || result.status !== 0) fail("SCF-GIT");
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
    || !exact(sessionBinding, ["schema", "sessionId", "preflightSha256", "assurance", "freshContext", "historyInherited", "mayDelegate"])
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

/**
 * Complete the normal lane after its fresh session returns. Preflight stays
 * read-only; packet preparation and claim are internal and need no PO action.
 */
export function finalizeSessionCriticReview(options, deps = {}) {
  const preflight = (deps.preflightCriticDispatchFn ?? preflightCriticDispatch)(options.preflightInput);
  if (preflight?.status !== "packet-ready" || preflight.dispatch?.requiredNextGate !== "session-critic-dispatch") fail("SCF-PREFLIGHT");
  const root = realpathSync(resolve(options.preflightInput.root));
  const id = sessionId(options.sessionId);
  assertVerdict(options.verdict);
  const preflightSha256 = sha256(canonicalJson(preflight));
  const packetId = options.packetId ?? (deps.randomBytesFn ?? randomBytes)(16).toString("hex");
  if (!PACKET_ID.test(packetId)) fail("SCF-PACKET-ID");
  const eventRequested = options.eventOutPath !== undefined;
  if (eventRequested) {
    (deps.preflightGovernanceReviewActionOutputFn ?? preflightGovernanceReviewActionOutput)({ rootDir: root, eventOutPath: options.eventOutPath });
    const featureId = options.featureId ?? { state: "not-applicable" };
    if (!actionIdentity(featureId)) fail("SCF-EVENT-FEATURE");
    if (!options.verdict.pass && options.verdict.findings.length === 0) fail("SCF-EVENT-VERDICT");
  }
  const references = [
    { kind: "spec", path: preflight.spec.path },
    ...preflight.guardrails.map(({ path }) => ({ kind: "guardrail", path })),
  ].filter((entry, index, all) => all.findIndex((candidate) => candidate.kind === entry.kind && candidate.path === entry.path) === index);
  const prepared = (deps.prepareCandidatePacketFn ?? prepareCandidatePacket)({
    repoRoot: root,
    controlRoot: controlRootFor(root),
    packetId,
    taskId: options.taskId,
    projectId: options.projectId,
    baseCommit: candidateFor(preflight).base,
    candidateCommit: preflight.candidate.commit,
    rulesetOid: preflight.dispatch.reviewerInput.rulesetSha,
    trigger: options.trigger ?? "T1",
    route: routeFor(options.route, preflightSha256),
    references,
    sessionBinding: {
      schema: SESSION_PACKET_BINDING_SCHEMA,
      sessionId: id,
      preflightSha256,
      assurance: SESSION_CRITIC_ASSURANCE,
      freshContext: true,
      historyInherited: false,
      mayDelegate: false,
    },
  }, deps.packetDependencies);
  const claimantNonce = (deps.randomBytesFn ?? randomBytes)(32).toString("hex");
  (deps.claimCandidatePacketFn ?? claimCandidatePacket)({
    controlRoot: controlRootFor(root), packetId, adapter: prepared.packet.route.adapter, claimantNonce,
  }, deps.packetDependencies);

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
    if (!Array.isArray(argv) || argv.length !== 5 || argv[0] !== "finalize" || argv[1] !== "--root" || argv[3] !== "--request") fail("SCF-USAGE");
    const root = realpathSync(resolve(argv[2]));
    const request = validateCliRequest(readBoundedJson(root, argv[4], "SCF-REQUEST-FILE"));
    const verdict = readBoundedJson(root, request.verdictPath, "SCF-VERDICT-FILE");
    const result = finalizeSessionCriticReview({
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
      verdict,
      ...(request.event === null ? {} : {
        eventOutPath: request.event.eventOutPath,
        featureId: request.event.featureId ?? { state: "not-applicable" },
      }),
    }, deps);
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
  const result = runSessionCriticFinalizerCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}
