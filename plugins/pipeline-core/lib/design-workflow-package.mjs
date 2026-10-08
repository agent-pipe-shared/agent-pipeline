// SPDX-License-Identifier: SUL-1.0

/**
 * Closed pre-approval package validation for the design workflow.
 *
 * This is intentionally only an evidence validator. A valid result is not PO
 * approval and does not grant implementation authority. The caller must obtain
 * the single final approval over the returned physical package digest and then
 * re-read that approval at the implementation boundary.
 */
import { createHash } from "node:crypto";
import { readDesignWorkflowPackageV2FromRepository } from "./design-workflow-package-v2.mjs";
import { canonicalizeJson } from "./governance-event.mjs";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

import { validateAdvisoryAttemptTrail } from "./advisory-attempt-trail.mjs";
import { validateAdvisoryReceipt } from "./advisory-receipt.mjs";
import { ADVISORY_ROUTE_SELECTION_SCHEMA, validateAdvisoryRouteSelection } from "./advisory-route-selection.mjs";
import { designReadinessReportSha256, verifyDesignReadinessHostExecution } from "./design-readiness-host-evidence.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Runtime consumers execute from an installed plugin cache, not necessarily
// from this repository checkout. Keep the canonical root schemas mirrored in
// the plugin bundle and validate against those package-local copies.
const READINESS_SCHEMA_PATH = join(HERE, "../schemas/pipeline.design-readiness-receipt.v1.json");
const PACKAGE_SCHEMA_PATH = join(HERE, "../schemas/pipeline.design-workflow-package.v1.json");
export const DESIGN_READINESS_SCHEMA = "pipeline.design-readiness-receipt.v1";
export const DESIGN_WORKFLOW_PACKAGE_SCHEMA = "pipeline.design-workflow-package.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_OBJECT = /^[a-f0-9]{40,64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]+$/u;
const SOURCE_NAMES = Object.freeze(["input", "prd", "spec", "design", "traceability"]);
const RUNNERS = new Set(["claude", "codex", "antigravity"]);
const FAILURES = new Set(["capacity-unavailable", "permission-denied", "timeout", "invalid-output", "route-unavailable"]);
const MAX_PACKAGE_BYTES = 256 * 1024;
const MAX_RECEIPT_BYTES = 256 * 1024;
const MAX_READINESS_BYTES = 128 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_SOURCE_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_ATTEMPT_TRAIL_BYTES = 16 * 1024;
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function fail(code) { return { ok: false, code }; }
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function bytes(value) { return Buffer.isBuffer(value) || value instanceof Uint8Array ? Buffer.from(value) : null; }
function safeRepoPath(value) {
  return typeof value === "string" && value.length > 0 && SAFE_PATH.test(value)
    && !value.includes(":") && value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
function repositoryPathKey(value) {
  return process.platform === "win32" ? value.toLocaleLowerCase("en-US") : value;
}
function uniqueRepositoryPaths(paths) {
  const keys = paths.map(repositoryPathKey);
  return new Set(keys).size === keys.length;
}
function sameJsonBytes(value, raw) {
  const data = bytes(raw);
  if (!data) return false;
  try { return JSON.stringify(parseStrictJson(data)) === JSON.stringify(value); }
  catch { return false; }
}
function validCandidate(value) {
  return exact(value, ["commit", "tree"])
    && GIT_OBJECT.test(value.commit ?? "") && GIT_OBJECT.test(value.tree ?? "");
}
function validSource(value) {
  return exact(value, ["path", "sha256"])
    && value.path.length <= 240 && safeRepoPath(value.path)
    && SHA256.test(value.sha256 ?? "");
}
function validSources(value) {
  return exact(value, SOURCE_NAMES)
    && SOURCE_NAMES.every((name) => validSource(value[name]))
    && uniqueRepositoryPaths(SOURCE_NAMES.map((name) => value[name].path));
}
function equalSources(left, right) {
  return SOURCE_NAMES.every((name) => left[name].path === right[name].path
    && left[name].sha256 === right[name].sha256);
}
function sourceBytesMatch(sources, sourceBytes) {
  if (!exact(sourceBytes, SOURCE_NAMES)) return false;
  let total = 0;
  return SOURCE_NAMES.every((name) => {
    const entry = sourceBytes[name];
    const raw = bytes(entry?.bytes);
    if (!exact(entry, ["path", "bytes"]) || entry.path !== sources[name].path || raw === null
      || raw.length > MAX_SOURCE_BYTES) return false;
    total += raw.length;
    return total <= MAX_SOURCE_TOTAL_BYTES && sha(raw) === sources[name].sha256;
  });
}
function samePath(left, right) {
  return process.platform === "win32"
    ? left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US")
    : left === right;
}
function sameIdentity(left, right) {
  return left.isFile() === right.isFile() && left.isDirectory() === right.isDirectory()
    && left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.nlink === right.nlink && left.size === right.size && left.mtimeNs === right.mtimeNs;
}
function sameParentIdentity(left, right) {
  // Directory entry changes outside the admitted file do not change its parent
  // identity. Keep physical type, inode/device and mode checks; file metadata
  // and byte equality remain checked separately before/after every read.
  return left.isDirectory() && right.isDirectory()
    && left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}
function physicalBytes(root, repositoryPath, maxBytes) {
  if (!safeRepoPath(repositoryPath)) return null;
  const rootPath = resolve(root);
  let descriptor;
  try {
    const rootBefore = lstatSync(rootPath, { bigint: true });
    if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink() || !samePath(realpathSync(rootPath), rootPath)) return null;
    const target = resolve(rootPath, ...repositoryPath.split("/"));
    const fromRoot = relative(rootPath, target);
    if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return null;
    const parents = [{ path: rootPath, identity: rootBefore }];
    let cursor = rootPath;
    const parts = repositoryPath.split("/");
    for (const part of parts.slice(0, -1)) {
      cursor = join(cursor, part);
      const info = lstatSync(cursor, { bigint: true });
      if (!info.isDirectory() || info.isSymbolicLink() || !samePath(realpathSync(cursor), cursor)) return null;
      parents.push({ path: cursor, identity: info });
    }
    const before = lstatSync(target, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size > BigInt(maxBytes) || !samePath(realpathSync(target), target)) return null;
    descriptor = openSync(target, constants.O_RDONLY | (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0)));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(before, opened) || opened.nlink !== 1n) return null;
    const data = readFileSync(descriptor);
    const afterDescriptor = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(target, { bigint: true });
    if (!sameIdentity(opened, afterDescriptor) || !sameIdentity(afterDescriptor, afterPath)
      || afterPath.isSymbolicLink() || afterPath.nlink !== 1n || BigInt(data.length) !== afterDescriptor.size
      || !samePath(realpathSync(target), target)) return null;
    for (const parent of parents) {
      const after = lstatSync(parent.path, { bigint: true });
      if (!sameParentIdentity(parent.identity, after) || !after.isDirectory() || after.isSymbolicLink()
        || !samePath(realpathSync(parent.path), parent.path)) return null;
    }
    return Buffer.from(UTF8.decode(data), "utf8");
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) try { closeSync(descriptor); } catch { /* no further action */ }
  }
}
function strictJsonFile(root, path, maxBytes) {
  const data = physicalBytes(root, path, maxBytes);
  if (data === null) return null;
  try { return { bytes: data, value: parseStrictJson(data) }; }
  catch { return null; }
}
function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === (value.includes(".") ? value : value.replace("Z", ".000Z"));
}
function noBlockingFindings(receipt) {
  return Array.isArray(receipt.findings) && receipt.findings.every((finding) => finding.severity !== "blocking");
}

function cloneFrozenJson(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFrozenJson));
  if (object(value)) {
    const copy = {};
    for (const [key, child] of Object.entries(value)) copy[key] = cloneFrozenJson(child);
    return Object.freeze(copy);
  }
  return value;
}

function createApprovalReview({ workflowPackage, sourceBytes, readinessReceipt, advisorReceipt, attemptTrail, packageSha256 }) {
  const attempts = attemptTrail?.attempts ?? [];
  return cloneFrozenJson({
    schema: "pipeline.design-workflow-approval-review.v1",
    featureId: workflowPackage.featureId,
    candidate: workflowPackage.candidate,
    packageSha256,
    // The final reviewer must be able to inspect the actual material being
    // approved, not only filenames and hashes. These bounded bytes were
    // already physically read and digest-checked by validateDesignWorkflowPackage;
    // copying them into the detached projection makes the human readback
    // reproducible without granting authority or reopening repository paths.
    sources: SOURCE_NAMES.map((name) => {
      const source = sourceBytes[name];
      return {
        name,
        ...workflowPackage.sources[name],
        content: UTF8.decode(bytes(source.bytes)),
      };
    }),
    advisor: Object.freeze({
      status: workflowPackage.advisor.status,
      runner: workflowPackage.advisor.runner,
      nativeAvailable: workflowPackage.advisor.nativeAvailable,
      // Derived from the receipt's adapter, never read from the package: a
      // consult-adapter answer is the labelled, non-authorizing fallback.
      assurance: advisorReceipt.adapter === "consult" ? "fallback-self-dispatch" : "native",
      receipt: Object.freeze({
        path: workflowPackage.advisor.receipt.path,
        sha256: workflowPackage.advisor.receipt.sha256,
        dispatchId: advisorReceipt.dispatch.dispatchId,
        adapter: advisorReceipt.adapter,
        observedStatus: advisorReceipt.observed.status,
        observedIdentity: advisorReceipt.observed.identity === null ? null : {
          provider: advisorReceipt.observed.identity.provider ?? null,
          modelId: advisorReceipt.observed.identity.modelId ?? null,
          effort: advisorReceipt.observed.identity.effort ?? null,
        },
      }),
      attempts: Object.freeze(attempts.map((attempt) => Object.freeze({
        adapter: attempt.adapter,
        kind: attempt.kind,
        runner: attempt.runner,
        status: attempt.status,
      }))),
      routeSelection: attemptTrail?.schema === ADVISORY_ROUTE_SELECTION_SCHEMA
        ? { status: attemptTrail.status, code: attemptTrail.code,
          childStarted: false, attemptCount: 0 } : null,
      disposition: workflowPackage.advisor.disposition,
      exception: workflowPackage.advisor.exception,
    }),
    readiness: Object.freeze({
      path: workflowPackage.readiness.path,
      sha256: workflowPackage.readiness.sha256,
      dispatchId: readinessReceipt.dispatchId,
      runner: readinessReceipt.runner,
      hostExecution: Object.freeze({ ...readinessReceipt.hostExecution }),
      outcome: readinessReceipt.outcome,
      summary: readinessReceipt.summary,
      findings: readinessReceipt.findings,
      unresolvedChoices: readinessReceipt.unresolvedChoices,
    }),
    approvalStatus: "pending-po-approval",
    implementationAuthority: false,
  });
}
export function designWorkflowAdvisorQuestion(sources) {
  return [
    "Compare the original user input, PRD, Spec, revised design, and traceability mapping.",
    "Identify omitted requirements, contradictions, untested claims, and unresolved decisions.",
    ...SOURCE_NAMES.map((name) => `${name}: ${sources[name].path} sha256=${sources[name].sha256}`),
  ].join("\n");
}

export function designWorkflowAdvisorQuestionSha256(sources) {
  return sha(Buffer.from(designWorkflowAdvisorQuestion(sources), "utf8"));
}

function validateReadiness(receipt) {
  if (!object(receipt)) return fail("DWP-READINESS-SHAPE");
  const structural = validateAgainstSchema(receipt, JSON.parse(readFileSync(READINESS_SCHEMA_PATH, "utf8")));
  if (!structural.valid) return fail("DWP-READINESS-SCHEMA");
  if (receipt.schema !== DESIGN_READINESS_SCHEMA
    || !ID.test(receipt.dispatchId ?? "") || !RUNNERS.has(receipt.runner)
    || !object(receipt.hostExecution) || receipt.hostExecution.runner !== receipt.runner || !validCandidate(receipt.candidate)
    || !validSources(receipt.sources)
    || !["ready-for-po-review", "not-ready"].includes(receipt.outcome)
    || !Array.isArray(receipt.findings) || receipt.findings.length > 32
    || !Array.isArray(receipt.unresolvedChoices) || receipt.unresolvedChoices.length > 32
    || typeof receipt.summary !== "string" || receipt.summary.trim().length === 0 || receipt.summary.length > 2000) return fail("DWP-READINESS-INVALID");
  try {
    if (receipt.hostExecution.dutyReceiptSha256 !== designReadinessReportSha256(receipt)) return fail("DWP-READINESS-REPORT-DIGEST");
  } catch { return fail("DWP-READINESS-REPORT-DIGEST"); }
  for (const finding of receipt.findings) {
    if (!exact(finding, ["code", "severity", "summary"]) || !ID.test(finding.code ?? "")
      || !["blocking", "non-blocking"].includes(finding.severity)
      || typeof finding.summary !== "string" || finding.summary.trim().length === 0 || finding.summary.length > 1000) return fail("DWP-READINESS-FINDING");
  }
  for (const choice of receipt.unresolvedChoices) {
    if (!exact(choice, ["id", "question", "impact"]) || !ID.test(choice.id ?? "")
      || typeof choice.question !== "string" || choice.question.trim().length === 0 || choice.question.length > 500
      || typeof choice.impact !== "string" || choice.impact.trim().length === 0 || choice.impact.length > 1000) return fail("DWP-READINESS-CHOICE");
  }
  return { ok: true };
}

const EVIDENCE_BINDING_FIELDS = Object.freeze(["templateSha256", "sentPromptSha256", "subagentId", "resultSha256"]);
function validEvidenceBinding(value) {
  return exact(value, EVIDENCE_BINDING_FIELDS)
    && SHA256.test(value.templateSha256 ?? "") && SHA256.test(value.sentPromptSha256 ?? "") && SHA256.test(value.resultSha256 ?? "")
    && typeof value.subagentId === "string" && value.subagentId.trim().length > 0 && value.subagentId.length <= 256;
}
// Self-review: the evidence dispatch is the authoring dispatch when the whole
// binding is equal or when both ran as the same native subagent.
function reviewsItself(authoring, evidence) {
  return authoring.subagentId === evidence.subagentId
    || EVIDENCE_BINDING_FIELDS.every((field) => authoring[field] === evidence[field]);
}

/**
 * The only Advisor-exception rationale the validator can back: built solely
 * from fields of the Advisor receipt and its attempt trail / route selection,
 * so it can state no fact the receipt does not contain. Deterministic.
 */
export function designWorkflowAdvisorExceptionRationale({ advisorReceipt, attemptTrail = null } = {}) {
  if (!object(advisorReceipt) || !object(advisorReceipt.configuredRoute) || !object(advisorReceipt.observed)
    || !object(advisorReceipt.fallback)) throw new TypeError("DWP-RATIONALE-INPUT");
  const trail = object(attemptTrail) ? attemptTrail : null;
  let route = "no attempt trail was recorded";
  if (trail !== null && trail.schema === ADVISORY_ROUTE_SELECTION_SCHEMA) {
    route = `route selection ${trail.status} (${trail.code}) and no child was started`;
  } else if (trail !== null && Array.isArray(trail.attempts)) {
    route = `attempts ${trail.attempts.length === 0 ? "none" : trail.attempts
      .map((attempt) => `${attempt?.kind}/${attempt?.adapter}/${attempt?.runner}:${attempt?.status}`).join(", ")}`;
  }
  return `Advisor receipt ${advisorReceipt.receiptId} records no usable answer: configured runner `
    + `${advisorReceipt.configuredRoute.runner}, adapter ${advisorReceipt.adapter}, observed status `
    + `${advisorReceipt.observed.status}, fallback reason ${advisorReceipt.fallback.reason}, error class `
    + `${advisorReceipt.fallback.redactedErrorClass ?? "none"}; ${route}.`;
}

/**
 * Validate the complete pre-approval package and its referenced bytes.
 * `sourceBytes` must be read by the caller from the physical, non-symlink
 * repository files named in the package; `candidate` must be the dispatch-time
 * Git identity. The package bytes are hashed exactly as persisted.
 *
 * Optional route inputs (absent or null keeps the earlier behaviour exactly):
 * `roleRoutePreflight` is a role-route preflight result; only
 * `roles.readiness.state` is read and anything but `native` refuses.
 * `evidenceBindings` is `{ authoring, advisor, readiness }`, each
 * `{ templateSha256, sentPromptSha256, subagentId, resultSha256 }`.
 */
export function validateDesignWorkflowPackage({
  workflowPackage,
  packageBytes,
  readinessReceipt,
  readinessBytes,
  advisorReceipt,
  advisorReceiptBytes,
  attemptTrail = null,
  attemptTrailBytes = null,
  sourceBytes,
  candidate,
  repoRoot,
  verifyReadinessExecution,
  requireReadinessExecution = true,
  roleRoutePreflight,
  evidenceBindings,
} = {}) {
  if (!object(workflowPackage)) return fail("DWP-PACKAGE-SHAPE");
  const packageSchema = JSON.parse(readFileSync(PACKAGE_SCHEMA_PATH, "utf8"));
  const structural = validateAgainstSchema(workflowPackage, packageSchema);
  if (!structural.valid) return fail("DWP-PACKAGE-SCHEMA");
  const rawPackage = bytes(packageBytes);
  if (workflowPackage.schema !== DESIGN_WORKFLOW_PACKAGE_SCHEMA
    || !ID.test(workflowPackage.featureId ?? "")
    || !ID.test(workflowPackage.authoringDispatchId ?? "")
    || !validCandidate(workflowPackage.candidate)
    || !validSources(workflowPackage.sources)
    || !validIsoDate(workflowPackage.createdAt)
    || rawPackage === null || rawPackage.length > MAX_PACKAGE_BYTES
    || !sameJsonBytes(workflowPackage, packageBytes)
    || !sourceBytesMatch(workflowPackage.sources, sourceBytes)) return fail("DWP-PACKAGE-INVALID");

  const advisor = workflowPackage.advisor;
  if (!exact(advisor, ["status", "runner", "nativeAvailable", "receipt", "attemptTrail", "disposition", "exception"])
    || !["answered", "unavailable"].includes(advisor.status)
    || !RUNNERS.has(advisor.runner) || typeof advisor.nativeAvailable !== "boolean"
    || !exact(advisor.receipt, ["path", "sha256"]) || !safeRepoPath(advisor.receipt.path)
    || !SHA256.test(advisor.receipt.sha256 ?? "")) return fail("DWP-ADVISOR-SHAPE");
  const evidencePaths = [advisor.receipt.path, workflowPackage.readiness?.path,
    ...(advisor.attemptTrail === null ? [] : [advisor.attemptTrail?.path])];
  const sourcePaths = SOURCE_NAMES.map((name) => workflowPackage.sources[name].path);
  if (evidencePaths.some((path) => !safeRepoPath(path))
    || !uniqueRepositoryPaths([...sourcePaths, ...evidencePaths])) return fail("DWP-PATH-ALIASES");
  const advisorRaw = bytes(advisorReceiptBytes);
  if (!advisorRaw || advisorRaw.length > MAX_RECEIPT_BYTES
    || sha(advisorRaw) !== advisor.receipt.sha256 || !sameJsonBytes(advisorReceipt, advisorRaw)) return fail("DWP-ADVISOR-BYTES");
  const advisorReceiptValidation = validateAdvisoryReceipt(advisorReceipt);
  if (!advisorReceiptValidation.ok) return {
    ok: false,
    code: `DWP-ADVISOR-RECEIPT-${String(advisorReceiptValidation.reason).toUpperCase()}`,
    detail: advisorReceiptValidation.errors ?? advisorReceiptValidation.reason,
  };
  if (advisorReceipt.configuredRoute.runner !== advisor.runner
    || advisorReceipt.dispatch.candidateCommit !== workflowPackage.candidate.commit
    || advisorReceipt.dispatch.candidateTree !== workflowPackage.candidate.tree
    || advisorReceipt.dispatch.dispatchId === workflowPackage.authoringDispatchId) return fail("DWP-ADVISOR-RECEIPT-BINDING");
  const noChildRouteSelection = attemptTrail?.schema === ADVISORY_ROUTE_SELECTION_SCHEMA;
  const expectedQuestionSha256 = noChildRouteSelection
    ? workflowPackage.sources.design.sha256
    : designWorkflowAdvisorQuestionSha256(workflowPackage.sources);
  if (advisorReceipt.questionSha256 !== expectedQuestionSha256) return fail("DWP-ADVISOR-QUESTION");

  const readiness = workflowPackage.readiness;
  if (!exact(readiness, ["path", "sha256", "dispatchId"]) || !safeRepoPath(readiness.path)
    || !SHA256.test(readiness.sha256 ?? "") || !ID.test(readiness.dispatchId ?? "")) return fail("DWP-READINESS-REFERENCE");
  const readinessRaw = bytes(readinessBytes);
  if (!readinessRaw || readinessRaw.length > MAX_READINESS_BYTES
    || sha(readinessRaw) !== readiness.sha256 || !sameJsonBytes(readinessReceipt, readinessRaw)) return fail("DWP-READINESS-BYTES");
  const readinessValidation = validateReadiness(readinessReceipt);
  if (!readinessValidation.ok) return readinessValidation;
  if (readinessReceipt.dispatchId !== readiness.dispatchId
    || readinessReceipt.dispatchId === workflowPackage.authoringDispatchId
    || readinessReceipt.dispatchId === advisorReceipt.dispatch.dispatchId
    || readinessReceipt.outcome !== "ready-for-po-review"
    || !noBlockingFindings(readinessReceipt)
    || JSON.stringify(readinessReceipt.candidate) !== JSON.stringify(workflowPackage.candidate)
    || !equalSources(readinessReceipt.sources, workflowPackage.sources)) return fail("DWP-READINESS-BINDING");

  // Optional route verdict (AC-29 / R4-1). Absent keeps today's behaviour (BD:
  // report-only without an observation); a SUPPLIED verdict that does not prove
  // a native readiness route refuses, and a malformed one never counts as native.
  if (roleRoutePreflight !== undefined && roleRoutePreflight !== null) {
    const readinessRoute = object(roleRoutePreflight?.roles) && object(roleRoutePreflight.roles.readiness)
      ? roleRoutePreflight.roles.readiness.state : undefined;
    if (readinessRoute === "fallback-self-dispatch") return fail("DWP-READINESS-FALLBACK-EVIDENCE");
    if (readinessRoute !== "native") return fail("DWP-READINESS-ROUTE-UNAVAILABLE");
  }
  // Optional self-review binding check (AC-29 / R4-2), on top of the dispatch-id
  // inequality above. A supplied but malformed set never counts as independent.
  if (evidenceBindings !== undefined && evidenceBindings !== null) {
    if (!exact(evidenceBindings, ["authoring", "advisor", "readiness"])
      || !["authoring", "advisor", "readiness"].every((name) => validEvidenceBinding(evidenceBindings[name]))) {
      return fail("DWP-EVIDENCE-BINDINGS-INVALID");
    }
    if (reviewsItself(evidenceBindings.authoring, evidenceBindings.advisor)
      || reviewsItself(evidenceBindings.authoring, evidenceBindings.readiness)) return fail("DWP-EVIDENCE-SELF-REVIEW");
  }

  if (requireReadinessExecution) {
    if (typeof verifyReadinessExecution !== "function") return fail("DWP-READINESS-HOST-VERIFIER-UNAVAILABLE");
    let readinessHost;
    try {
      readinessHost = verifyReadinessExecution({ repoRoot, hostExecution: readinessReceipt.hostExecution,
        readinessReceipt, candidate: workflowPackage.candidate, sources: workflowPackage.sources, sourceBytes,
        advisorObservationRefs: noChildRouteSelection
          ? { receiptRef: advisor.receipt, routeRef: advisor.attemptTrail } : null });
    } catch { readinessHost = null; }
    if (!readinessHost?.ok) return readinessHost && typeof readinessHost.code === "string"
      ? readinessHost : fail("DWP-READINESS-HOST-UNVERIFIED");
  }

  if (advisor.status === "answered") {
    if (advisorReceipt.observed.status !== "answered"
      || !exact(advisor.disposition, ["decision", "rationale"])
      || !["accept", "decline"].includes(advisor.disposition.decision)
      || typeof advisor.disposition.rationale !== "string" || advisor.disposition.rationale.trim().length === 0
      || advisor.exception !== null) return fail("DWP-ADVISOR-DISPOSITION");
    if (advisor.attemptTrail !== null) {
      const trailRaw = bytes(attemptTrailBytes);
      if (!exact(advisor.attemptTrail, ["path", "sha256"]) || !safeRepoPath(advisor.attemptTrail.path)
        || !SHA256.test(advisor.attemptTrail.sha256 ?? "") || !trailRaw || trailRaw.length > MAX_ATTEMPT_TRAIL_BYTES
        || sha(trailRaw) !== advisor.attemptTrail.sha256 || !sameJsonBytes(attemptTrail, trailRaw)
        || !validateAdvisoryAttemptTrail({ trail: attemptTrail, receipt: advisorReceipt, receiptBytes: advisorRaw,
          requireNativeThenConsult: advisor.runner === "claude" && advisor.nativeAvailable && advisorReceipt.adapter === "consult" }).ok) {
        return fail("DWP-ADVISOR-ATTEMPTS");
      }
    } else if (attemptTrail !== null || attemptTrailBytes !== null
      || (advisor.runner === "claude" && advisor.nativeAvailable && advisorReceipt.adapter === "consult")) {
      return fail("DWP-ADVISOR-ATTEMPTS-MISSING");
    }
  } else {
    if (!["unavailable", "failed", "timed-out", "permission-denied"].includes(advisorReceipt.observed.status)
      || advisor.disposition !== null
      || !exact(advisor.exception, ["status", "failureCode", "rationale"])
      || advisor.exception.status !== "proposed" || !FAILURES.has(advisor.exception.failureCode)
      || typeof advisor.exception.rationale !== "string" || advisor.exception.rationale.trim().length === 0
      || !exact(advisor.attemptTrail, ["path", "sha256"]) || !safeRepoPath(advisor.attemptTrail.path)
      || !SHA256.test(advisor.attemptTrail.sha256 ?? "")) return fail("DWP-ADVISOR-EXCEPTION");
    const trailRaw = bytes(attemptTrailBytes);
    if (!trailRaw || trailRaw.length > MAX_ATTEMPT_TRAIL_BYTES
      || sha(trailRaw) !== advisor.attemptTrail.sha256 || !sameJsonBytes(attemptTrail, trailRaw)) return fail("DWP-ADVISOR-ATTEMPTS");
    const trailChecked = noChildRouteSelection
      ? validateAdvisoryRouteSelection({ selection: attemptTrail, receipt: advisorReceipt, receiptBytes: advisorRaw })
      : validateAdvisoryAttemptTrail({ trail: attemptTrail, receipt: advisorReceipt, receiptBytes: advisorRaw,
        requireNativeThenConsult: advisor.runner === "claude" && advisor.nativeAvailable });
    if (!trailChecked.ok) return fail("DWP-ADVISOR-ATTEMPTS");
    const failureClass = noChildRouteSelection && attemptTrail.status === "unavailable" ? "route-unavailable"
      : advisorReceipt.observed.status === "timed-out" ? "timeout"
      : advisorReceipt.observed.status === "permission-denied" ? "permission-denied"
        : advisorReceipt.observed.status === "unavailable" ? "capacity-unavailable" : "invalid-output";
    if (advisor.exception.failureCode !== failureClass) return fail("DWP-ADVISOR-FAILURE-CODE");
    // The proposed rationale may state only facts the receipt and trail contain:
    // the single admitted text is the deterministic one generated from them.
    if (advisor.exception.rationale !== designWorkflowAdvisorExceptionRationale({ advisorReceipt, attemptTrail })) {
      return fail("DWP-ADVISOR-EXCEPTION-RATIONALE-UNBACKED");
    }
  }

  if (candidate !== undefined && (!validCandidate(candidate)
    || JSON.stringify(candidate) !== JSON.stringify(workflowPackage.candidate))) return fail("DWP-CANDIDATE-DRIFT");
  const packageSha256 = sha(rawPackage);
  return {
    ok: true,
    status: "ready-for-single-final-approval",
    packageSha256,
    candidate: workflowPackage.candidate,
    workflowPackage: cloneFrozenJson(workflowPackage),
    readinessDispatchId: readinessReceipt.dispatchId,
    advisorDispatchId: advisorReceipt.dispatch.dispatchId,
    approvalReview: createApprovalReview({ workflowPackage, sourceBytes, readinessReceipt, advisorReceipt, attemptTrail, packageSha256 }),
    implementationAuthority: false,
  };
}

/**
 * Read a complete design-workflow package and every referenced artifact from
 * physical repository files, then validate their exact bytes. This proves only
 * package integrity/readiness; it does not write or infer human approval.
 * `readCandidate` must be a trusted Git identity reader; it is sampled before
 * and after the bounded file reads to reject candidate drift.
 */
export function readDesignWorkflowPackageFromRepository({
  repoRoot,
  packagePath,
  readCandidate,
  requireCurrentCandidate = true,
  requireReadinessExecution = true,
  verifyReadinessExecution = verifyDesignReadinessHostExecution,
  trustedAdvisorExecutablePath,
  roleRoutePreflight = null,
  evidenceBindings = null,
} = {}) {
  if (typeof readCandidate !== "function" || !safeRepoPath(packagePath)) {
    return fail("DWP-READER-INPUT");
  }
  const beforeCandidate = readCandidate();
  if (!validCandidate(beforeCandidate)) return fail("DWP-CANDIDATE-UNAVAILABLE");
  const packageFile = strictJsonFile(repoRoot, packagePath, MAX_PACKAGE_BYTES);
  if (!packageFile || !object(packageFile.value)) return fail("DWP-PACKAGE-PHYSICAL");
  const workflowPackage = packageFile.value;
  if (workflowPackage.schema === "pipeline.design-workflow-package.v2") {
    return readDesignWorkflowPackageV2FromRepository({ repoRoot, packagePath, requireCurrentCandidate, requireReadinessExecution, verifyReadinessExecution, trustedAdvisorExecutablePath });
  }
  if (!validSources(workflowPackage.sources) || !object(workflowPackage.advisor)
    || !exact(workflowPackage.advisor.receipt, ["path", "sha256"])
    || !exact(workflowPackage.readiness, ["path", "sha256", "dispatchId"])) return fail("DWP-PACKAGE-REFERENCES");

  const sourceBytes = {};
  for (const name of SOURCE_NAMES) {
    const entry = workflowPackage.sources[name];
    const file = physicalBytes(repoRoot, entry.path, MAX_SOURCE_BYTES);
    if (!file) return fail("DWP-SOURCE-PHYSICAL");
    sourceBytes[name] = { path: entry.path, bytes: file };
  }
  const advisorFile = strictJsonFile(repoRoot, workflowPackage.advisor.receipt.path, MAX_RECEIPT_BYTES);
  const readinessFile = strictJsonFile(repoRoot, workflowPackage.readiness.path, MAX_READINESS_BYTES);
  if (!advisorFile || !readinessFile) return fail("DWP-EVIDENCE-PHYSICAL");
  let attemptTrail = null;
  let attemptTrailBytes = null;
  if (workflowPackage.advisor.attemptTrail !== null) {
    if (!exact(workflowPackage.advisor.attemptTrail, ["path", "sha256"])) return fail("DWP-ATTEMPT-REFERENCE");
    const attemptFile = strictJsonFile(repoRoot, workflowPackage.advisor.attemptTrail.path, MAX_ATTEMPT_TRAIL_BYTES);
    if (!attemptFile) return fail("DWP-ATTEMPTS-PHYSICAL");
    attemptTrail = attemptFile.value;
    attemptTrailBytes = attemptFile.bytes;
  }
  const result = validateDesignWorkflowPackage({
    workflowPackage,
    packageBytes: packageFile.bytes,
    readinessReceipt: readinessFile.value,
    readinessBytes: readinessFile.bytes,
    advisorReceipt: advisorFile.value,
    advisorReceiptBytes: advisorFile.bytes,
    attemptTrail,
    attemptTrailBytes,
    sourceBytes,
    repoRoot,
    verifyReadinessExecution,
    requireReadinessExecution,
    roleRoutePreflight,
    evidenceBindings,
    // At package creation/presentation the exact Git candidate must match.
    // After an approval, consumers may re-read the same immutable package
    // following unrelated commits; the observed HEAD is still sampled twice
    // below to reject a moving read, but it is no longer required to equal the
    // package's provenance candidate. Such consumers must separately compare
    // packageSha256 with the digest recorded by the approved authority.
    ...(requireCurrentCandidate ? { candidate: beforeCandidate } : {}),
  });
  if (!result.ok) return result;

  // Reopen every admitted path so a mutation between independently read
  // references cannot produce an internally mixed snapshot.
  const paths = [packagePath, ...SOURCE_NAMES.map((name) => workflowPackage.sources[name].path),
    workflowPackage.advisor.receipt.path, workflowPackage.readiness.path,
    ...(workflowPackage.advisor.attemptTrail === null ? [] : [workflowPackage.advisor.attemptTrail.path])];
  const expected = [packageFile.bytes, ...SOURCE_NAMES.map((name) => sourceBytes[name].bytes),
    advisorFile.bytes, readinessFile.bytes, ...(attemptTrailBytes === null ? [] : [attemptTrailBytes])];
  if (paths.some((path, index) => !physicalBytes(repoRoot, path, expected[index].length)?.equals(expected[index]))) {
    return fail("DWP-PHYSICAL-DRIFT");
  }
  const afterCandidate = readCandidate();
  if (!validCandidate(afterCandidate) || JSON.stringify(afterCandidate) !== JSON.stringify(beforeCandidate)) return fail("DWP-CANDIDATE-DRIFT");
  return { ...result, packagePath };
}

/**
 * Re-read a package already named by a PO-bound plan approval. Package
 * validity alone is insufficient: the persisted approval must name the same
 * bytes, feature, PRD and Spec. The original package candidate remains
 * provenance, while the reader still requires live repository identity to
 * remain stable across all reads.
 */
export function readApprovedDesignWorkflowPackage({
  repoRoot,
  packagePath,
  packageSha256,
  featureId,
  planPath,
  planSha256,
  specPath,
  specSha256,
  readCandidate,
  trustedAdvisorExecutablePath,
  advisorExceptionBinding = null,
} = {}) {
  if (!SHA256.test(packageSha256 ?? "") || !ID.test(featureId ?? "")
    || !safeRepoPath(planPath) || !SHA256.test(planSha256 ?? "")
    || !safeRepoPath(specPath) || !SHA256.test(specSha256 ?? "")) return fail("DWP-APPROVAL-BINDING");
  const result = readDesignWorkflowPackageFromRepository({
    repoRoot, packagePath, readCandidate, requireCurrentCandidate: false, requireReadinessExecution: false, trustedAdvisorExecutablePath,
  });
  if (!result.ok) return result;
  const workflowPackage = result.workflowPackage;
  if (result.packageSha256 !== packageSha256) return fail("DWP-APPROVAL-DIGEST-DRIFT");
  if (workflowPackage.featureId !== featureId) return fail("DWP-APPROVAL-FEATURE-MISMATCH");
  if (workflowPackage.sources.prd.path !== planPath || workflowPackage.sources.prd.sha256 !== planSha256
    || workflowPackage.sources.spec.path !== specPath || workflowPackage.sources.spec.sha256 !== specSha256) {
    return fail("DWP-APPROVAL-PLAN-SPEC-MISMATCH");
  }
  const expectedException = designWorkflowAdvisorExceptionBinding(result);
  if (canonicalizeJson(expectedException) !== canonicalizeJson(advisorExceptionBinding)) return fail("DWP-APPROVAL-ADVISOR-EXCEPTION-BINDING");
  return { ...result, approvedBinding: true };
}

/** Only v2 unavailable evidence adds a narrow exception to the exact final PO decision. */
export function designWorkflowAdvisorExceptionBinding(packageRead) {
  const pkg = packageRead?.workflowPackage;
  if (pkg?.schema !== "pipeline.design-workflow-package.v2" || pkg.advisor?.status !== "unavailable") return null;
  return { kind: "advisor-unavailable", oneTime: true, packageSha256: packageRead.packageSha256,
    courseId: pkg.advisor.courseBinding.courseId, initialContextSha256: pkg.advisor.courseBinding.initialContextSha256,
    failureEvidenceSha256: pkg.advisor.failureEvidence.sha256, rationale: pkg.advisor.proposedException.rationale };
}

/** Structural readiness contract reused by explicit v2 package validation. */
export function validateDesignReadinessReceipt(receipt) { return validateReadiness(receipt); }
