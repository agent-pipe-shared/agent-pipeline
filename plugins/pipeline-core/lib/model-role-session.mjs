// SPDX-License-Identifier: SUL-1.0
/**
 * Pure functional-role model selection for one host-identified session. The caller owns
 * the approved policy, the host catalog observation and the durable receipt
 * store. This module performs no provider call and grants no approval to a
 * merely discovered model.
 */
import { createHash } from "node:crypto";
import { canonicalizeJson } from "./governance-event.mjs";

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const RUNNERS = new Set(["claude", "codex", "antigravity"]);
const ROLES = new Set(["frontier", "worker", "efficient"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "not-applicable"]);
const CATALOGUE_EFFORT = /^[a-z][a-z0-9-]{0,31}$/u;

/**
 * Normalize the account-specific Codex app-server `model/list` response.
 * This is only availability evidence: descriptions, default status and model
 * names never assign a functional role or approve an exact model. The host
 * must still authenticate the app-server process and approved role policy.
 */
export function codexAvailableModelIds(catalogue, effort) {
  if (!EFFORTS.has(effort) || effort === "not-applicable"
    || catalogue === null || typeof catalogue !== "object" || Array.isArray(catalogue)
    || !Array.isArray(catalogue.data) || catalogue.nextCursor !== null) {
    return { ok: false, code: "MODEL-ROLE-CODEX-CATALOGUE-INVALID" };
  }
  const ids = [];
  const seen = new Set();
  for (const entry of catalogue.data) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || !id(entry.id) || entry.model !== entry.id || typeof entry.hidden !== "boolean"
      || !Array.isArray(entry.supportedReasoningEfforts)
      || entry.supportedReasoningEfforts.some((item) => item === null
        || typeof item !== "object" || !CATALOGUE_EFFORT.test(item.reasoningEffort ?? ""))) {
      return { ok: false, code: "MODEL-ROLE-CODEX-CATALOGUE-INVALID" };
    }
    if (seen.has(entry.id)) return { ok: false, code: "MODEL-ROLE-CODEX-CATALOGUE-DUPLICATE" };
    seen.add(entry.id);
    if (!entry.hidden && entry.supportedReasoningEfforts.some((item) => item.reasoningEffort === effort)) ids.push(entry.id);
  }
  return { ok: true, code: "MODEL-ROLE-CODEX-CATALOGUE-OBSERVED", availableModelIds: ids.sort() };
}

/** Parse bounded `agy models` stdout without trusting display names or rank. */
export function antigravityAvailableModelIds(stdout) {
  if (typeof stdout !== "string" || stdout.length > 65_536 || stdout.length === 0) {
    return { ok: false, code: "MODEL-ROLE-AGY-CATALOGUE-INVALID" };
  }
  const lines = stdout.trimEnd().split(/\r?\n/u);
  if (lines.length === 0 || lines.length > 256) return { ok: false, code: "MODEL-ROLE-AGY-CATALOGUE-INVALID" };
  const ids = [];
  for (const line of lines) {
    const match = /^([^\t\r\n]+)\t([^\t\r\n]+)$/u.exec(line);
    if (!match || !id(match[1]) || match[2].trim() === "") {
      return { ok: false, code: "MODEL-ROLE-AGY-CATALOGUE-INVALID" };
    }
    ids.push(match[1]);
  }
  if (new Set(ids).size !== ids.length) return { ok: false, code: "MODEL-ROLE-AGY-CATALOGUE-DUPLICATE" };
  return { ok: true, code: "MODEL-ROLE-AGY-CATALOGUE-OBSERVED", availableModelIds: ids.sort() };
}

/**
 * Normalize an authenticated Anthropic Models API cursor chain. Each item is
 * `{ requestAfterId, response }`; a caller must record the actual request
 * cursor rather than assembling arbitrary response pages. API availability
 * belongs to the API credential, not automatically to a Claude Code OAuth
 * session. The host must label that boundary and never treat documentation or
 * an empty/partial response as proof of installed Claude Code availability.
 */
export function claudeApiAvailableModelIds(pages) {
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > 32) {
    return { ok: false, code: "MODEL-ROLE-CLAUDE-API-CATALOGUE-INVALID" };
  }
  const ids = [];
  let expectedAfterId = null;
  for (let index = 0; index < pages.length; index += 1) {
    const item = pages[index];
    const page = item?.response;
    if (item === null || typeof item !== "object" || Array.isArray(item)
      || item.requestAfterId !== expectedAfterId
      || page === null || typeof page !== "object" || Array.isArray(page)
      || !Array.isArray(page.data) || page.data.length > 1000
      || typeof page.has_more !== "boolean" || page.has_more !== (index < pages.length - 1)
      || (page.data.length === 0 && page.has_more)
      || page.first_id !== (page.data[0]?.id ?? null)
      || page.last_id !== (page.data.at(-1)?.id ?? null)
      || page.data.some((entry) => entry === null || typeof entry !== "object"
        || Array.isArray(entry) || entry.type !== "model" || !id(entry.id))) {
      return { ok: false, code: "MODEL-ROLE-CLAUDE-API-CATALOGUE-INVALID" };
    }
    ids.push(...page.data.map((entry) => entry.id));
    expectedAfterId = page.last_id;
  }
  if (new Set(ids).size !== ids.length) return { ok: false, code: "MODEL-ROLE-CLAUDE-API-CATALOGUE-DUPLICATE" };
  return { ok: true, code: "MODEL-ROLE-CLAUDE-API-CATALOGUE-OBSERVED",
    assurance: "api-credential-only", availableModelIds: ids.sort() };
}

/** Actual Claude Code model usage from one completed, successful JSON result. */
export function claudeCodeObservedModelIds(result) {
  if (result === null || typeof result !== "object" || Array.isArray(result)
    || result.type !== "result" || result.is_error !== false
    || result.terminal_reason === "api_error"
    || result.modelUsage === null || typeof result.modelUsage !== "object"
    || Array.isArray(result.modelUsage)) {
    return { ok: false, code: "MODEL-ROLE-CLAUDE-HOST-RESULT-INVALID" };
  }
  const ids = Object.keys(result.modelUsage);
  if (ids.length === 0 || ids.some((modelId) => !id(modelId))) {
    return { ok: false, code: "MODEL-ROLE-CLAUDE-HOST-MODEL-UNOBSERVED" };
  }
  return { ok: true, code: "MODEL-ROLE-CLAUDE-HOST-MODEL-OBSERVED",
    availableModelIds: ids.sort() };
}

function digest(value) {
  return createHash("sha256").update(canonicalizeJson(value)).digest("hex");
}

function id(value) {
  return typeof value === "string" && MODEL_ID.test(value);
}

function validSessionId(value) {
  return typeof value === "string" && SESSION_ID.test(value);
}

function utcTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function validEntry(entry) {
  return entry !== null && typeof entry === "object" && !Array.isArray(entry)
    && Object.keys(entry).sort().join(",") === "compatibilityEvidenceSha256,efforts,modelId,rank"
    && id(entry.modelId)
    && Number.isSafeInteger(entry.rank) && entry.rank > 0
    && SHA.test(entry.compatibilityEvidenceSha256 ?? "")
    && Array.isArray(entry.efforts) && entry.efforts.length > 0
    && entry.efforts.every((effort) => EFFORTS.has(effort))
    && new Set(entry.efforts).size === entry.efforts.length;
}

function validInputs(input) {
  const { runner, sessionId, role, effort, candidateCommit, policy, availableModelIds, observedAt } = input;
  if (!RUNNERS.has(runner) || !validSessionId(sessionId) || !ROLES.has(role)
    || !EFFORTS.has(effort) || !OID.test(candidateCommit ?? "")
    || !Array.isArray(availableModelIds)
    || availableModelIds.some((modelId) => !id(modelId))
    || new Set(availableModelIds).size !== availableModelIds.length
    || !utcTime(observedAt)
    || policy?.schema !== "pipeline.model-role-policy.v1"
    || Object.keys(policy).sort().join(",") !== "approved,role,runner,schema"
    || policy.runner !== runner || policy.role !== role
    || !Array.isArray(policy.approved) || policy.approved.length === 0
    || !policy.approved.every(validEntry)) return false;
  const ids = policy.approved.map((entry) => entry.modelId);
  const ranks = policy.approved.map((entry) => entry.rank);
  return new Set(ids).size === ids.length && new Set(ranks).size === ranks.length;
}

function validReuseInput(input) {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    && RUNNERS.has(input.runner) && validSessionId(input.sessionId) && ROLES.has(input.role)
    && EFFORTS.has(input.effort) && OID.test(input.candidateCommit ?? "");
}

export function validateModelRoleSessionReceipt(receipt) {
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  const { receiptSha256, ...subject } = receipt;
  return Object.keys(subject).sort().join(",") === "candidateAtBootstrap,compatibilityEvidenceSha256,effort,modelId,observedAt,policySha256,role,runner,schema,sessionId"
    && subject.schema === "pipeline.model-role-session.v1"
    && RUNNERS.has(subject.runner) && validSessionId(subject.sessionId)
    && ROLES.has(subject.role) && id(subject.modelId)
    && EFFORTS.has(subject.effort) && OID.test(subject.candidateAtBootstrap ?? "")
    && SHA.test(subject.compatibilityEvidenceSha256 ?? "")
    && SHA.test(subject.policySha256 ?? "")
    && utcTime(subject.observedAt)
    && SHA.test(receiptSha256 ?? "") && receiptSha256 === digest(subject);
}

/**
 * An existing caller-held receipt wins over a changed catalog or policy:
 * same-session bootstrap and Compact do not refresh the selected model.
 * A receipt digest detects accidental corruption, not hostile replacement;
 * durable-store trust and dispatch-time binding belong to the host adapter.
 */
export function resolveModelRoleSession(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, code: "MODEL-ROLE-INPUT-INVALID" };
  const { runner, sessionId, role, effort, candidateCommit, policy, availableModelIds, observedAt, existingReceipt } = input;
  if (existingReceipt !== undefined && existingReceipt !== null) {
    if (!validReuseInput(input) || !validateModelRoleSessionReceipt(existingReceipt)
      || existingReceipt.runner !== runner || existingReceipt.sessionId !== sessionId
      || existingReceipt.role !== role || existingReceipt.effort !== effort) {
      return { ok: false, code: "MODEL-ROLE-RECEIPT-CONFLICT" };
    }
    return { ok: true, code: "MODEL-ROLE-SESSION-REUSED", receipt: existingReceipt };
  }
  if (!validInputs(input)) return { ok: false, code: "MODEL-ROLE-INPUT-INVALID" };
  const available = new Set(availableModelIds);
  const compatible = policy.approved
    .filter((entry) => available.has(entry.modelId) && entry.efforts.includes(effort))
    .sort((left, right) => right.rank - left.rank);
  if (compatible.length === 0) return { ok: false, code: "MODEL-ROLE-APPROVED-MODEL-UNAVAILABLE" };
  const selected = compatible[0];
  const subject = {
    schema: "pipeline.model-role-session.v1",
    runner,
    sessionId,
    role,
    effort,
    modelId: selected.modelId,
    compatibilityEvidenceSha256: selected.compatibilityEvidenceSha256,
    policySha256: digest(policy),
    observedAt,
    candidateAtBootstrap: candidateCommit,
  };
  return {
    ok: true,
    code: "MODEL-ROLE-SESSION-SELECTED",
    receipt: { ...subject, receiptSha256: digest(subject) },
    unapprovedAvailableModelIds: availableModelIds.filter((id) => !policy.approved.some((entry) => entry.modelId === id)),
  };
}

/**
 * Compare a dispatch request with a caller-supplied, validated session
 * receipt. This is a binding check, not proof that the caller loaded the
 * receipt from the trusted host store or that its policy was approved.
 */
export function validateModelRoleDispatchBinding(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)
    || Object.keys(request).sort().join(",") !== "effort,modelId,receipt,role,runner,sessionId"
    || !RUNNERS.has(request.runner) || !ROLES.has(request.role)
    || !EFFORTS.has(request.effort) || !validSessionId(request.sessionId)
    || !id(request.modelId) || !validateModelRoleSessionReceipt(request.receipt)) {
    return { ok: false, code: "MODEL-ROLE-DISPATCH-INVALID" };
  }
  if (request.receipt.runner !== request.runner
    || request.receipt.sessionId !== request.sessionId
    || request.receipt.role !== request.role
    || request.receipt.effort !== request.effort
    || request.receipt.modelId !== request.modelId) {
    return { ok: false, code: "MODEL-ROLE-DISPATCH-MISMATCH" };
  }
  return { ok: true, code: "MODEL-ROLE-DISPATCH-BOUND", receiptSha256: request.receipt.receiptSha256 };
}

/**
 * A compact, non-authorizing display contract for one new host session. The
 * host must supply receipts from its trusted store; this formatter neither
 * approves a model nor turns a bootstrap acknowledgement into authority.
 */
export function modelRoleBootstrapReadback({ sessionId, receipts, previousReceipts = [] } = {}) {
  if (!validSessionId(sessionId) || !Array.isArray(receipts) || receipts.length === 0
    || !Array.isArray(previousReceipts)
    || ![...receipts, ...previousReceipts].every(validateModelRoleSessionReceipt)
    || receipts.some((receipt) => receipt.sessionId !== sessionId)
    || previousReceipts.some((receipt) => receipt.sessionId === sessionId)
    || new Set(previousReceipts.map((receipt) => receipt.sessionId)).size > 1) {
    return { ok: false, code: "MODEL-ROLE-READBACK-INVALID" };
  }
  const routeKey = (receipt) => `${receipt.runner}:${receipt.role}:${receipt.effort}`;
  const currentKeys = receipts.map(routeKey);
  const previousKeys = previousReceipts.map(routeKey);
  if (new Set(currentKeys).size !== currentKeys.length || new Set(previousKeys).size !== previousKeys.length) {
    return { ok: false, code: "MODEL-ROLE-READBACK-DUPLICATE" };
  }
  const previous = new Map(previousReceipts.map((receipt) => [routeKey(receipt), receipt]));
  const hadPrevious = previousReceipts.length > 0;
  const mappings = receipts.map((receipt) => {
    const before = previous.get(routeKey(receipt));
    return {
      runner: receipt.runner, role: receipt.role, effort: receipt.effort,
      modelId: receipt.modelId, policySha256: receipt.policySha256,
      compatibilityEvidenceSha256: receipt.compatibilityEvidenceSha256,
      candidateAtBootstrap: receipt.candidateAtBootstrap,
      receiptSha256: receipt.receiptSha256,
      previousModelId: before?.modelId ?? null,
      previousPolicySha256: before?.policySha256 ?? null,
      change: before === undefined ? hadPrevious ? "added" : "initial" : before.modelId === receipt.modelId
        && before.policySha256 === receipt.policySha256 ? "unchanged" : "changed",
    };
  }).sort((left, right) => routeKey(left).localeCompare(routeKey(right)));
  const removedMappings = previousReceipts.filter((receipt) => !currentKeys.includes(routeKey(receipt)))
    .map((receipt) => ({ runner: receipt.runner, role: receipt.role, effort: receipt.effort,
      modelId: receipt.modelId, policySha256: receipt.policySha256 }))
    .sort((left, right) => routeKey(left).localeCompare(routeKey(right)));
  const subject = { schema: "pipeline.model-role-bootstrap-readback.v1", sessionId, mappings, removedMappings,
    acknowledgementRequired: mappings.some((mapping) => ["initial", "changed", "added"].includes(mapping.change))
      || removedMappings.length > 0 };
  return { ok: true, code: "MODEL-ROLE-BOOTSTRAP-READBACK", ...subject, readbackSha256: digest(subject) };
}

/**
 * Second phase of a new-session bootstrap. A changed mapping cannot be used
 * until the human has confirmed the exact readback shown by the host. This
 * check does not approve a model or prove that the acknowledgement came from
 * a human: the host owns the trusted UI event, complete configured route set,
 * policy and receipt storage.
 */
export function admitModelRoleBootstrap({ sessionId, configuredRoutes, receipts, previousReceipts = [], acknowledgement = null } = {}) {
  if (!validConfiguredRoutes(configuredRoutes) || !Array.isArray(receipts)
    || receipts.length !== configuredRoutes.length
    || receipts.some((receipt) => receipt === null || typeof receipt !== "object" || Array.isArray(receipt)
      || !configuredRoutes.some((route) => configuredRouteKey(route) === configuredRouteKey(receipt)))) {
    return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-ADMISSION-ROUTE-SET-MISMATCH" };
  }
  const readback = modelRoleBootstrapReadback({ sessionId, receipts, previousReceipts });
  if (!readback.ok) return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-ADMISSION-INVALID",
    reasonCode: readback.code };
  if (readback.acknowledgementRequired && (acknowledgement === null
    || typeof acknowledgement !== "object" || Array.isArray(acknowledgement)
    || Object.keys(acknowledgement).sort().join(",") !== "confirmed,readbackSha256,sessionId"
    || acknowledgement.confirmed !== true
    || acknowledgement.sessionId !== sessionId
    || acknowledgement.readbackSha256 !== readback.readbackSha256)) {
    return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-ACKNOWLEDGEMENT-REQUIRED",
      readbackSha256: readback.readbackSha256 };
  }
  return { ok: true, code: "MODEL-ROLE-BOOTSTRAP-ADMITTED", readbackSha256: readback.readbackSha256,
    receiptSha256s: receipts.map((receipt) => receipt.receiptSha256) };
}

function configuredRouteKey(route) {
  return `${route.runner}:${route.role}:${route.effort}`;
}

function validConfiguredRoutes(configuredRoutes) {
  return Array.isArray(configuredRoutes) && configuredRoutes.length > 0
    && configuredRoutes.every((route) => route !== null && typeof route === "object" && !Array.isArray(route)
      && Object.keys(route).sort().join(",") === "effort,role,runner"
      && RUNNERS.has(route.runner) && ROLES.has(route.role) && EFFORTS.has(route.effort))
    && new Set(configuredRoutes.map(configuredRouteKey)).size === configuredRoutes.length;
}

/**
 * Resolve exactly the host's complete configured route set as one bootstrap
 * proposal. The caller must derive and authenticate configuredRoutes from the
 * approved source; this check prevents accidental omission, not a malicious
 * caller from supplying a smaller invented source. The caller still owns
 * policy, catalogue and storage trust. A failed route returns no receipts.
 */
export function resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes, previousReceipts = [] } = {}) {
  if (!validSessionId(sessionId) || !Array.isArray(routes) || routes.length === 0
    || !validConfiguredRoutes(configuredRoutes)
    || !Array.isArray(previousReceipts)
    || routes.some((route) => route === null || typeof route !== "object" || Array.isArray(route)
      || route.sessionId !== sessionId)) {
    return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-INVALID" };
  }
  const keys = routes.map(configuredRouteKey);
  if (new Set(keys).size !== keys.length) return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-DUPLICATE" };
  const expectedKeys = new Set(configuredRoutes.map(configuredRouteKey));
  if (keys.length !== expectedKeys.size || keys.some((key) => !expectedKeys.has(key))) {
    return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-ROUTE-SET-MISMATCH" };
  }
  const reusedCount = routes.filter((route) => route.existingReceipt !== undefined && route.existingReceipt !== null).length;
  if (reusedCount !== 0 && reusedCount !== routes.length) {
    return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-MIXED-SESSION" };
  }
  const receipts = [];
  const reviewCandidates = new Map();
  for (let index = 0; index < routes.length; index += 1) {
    const selected = resolveModelRoleSession(routes[index]);
    if (!selected.ok) return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-ROUTE-FAILED",
      routeIndex: index, reasonCode: selected.code };
    receipts.push(selected.receipt);
    for (const modelId of selected.unapprovedAvailableModelIds ?? []) {
      const key = `${routes[index].runner}:${modelId}`;
      if (!reviewCandidates.has(key)) reviewCandidates.set(key, {
        runner: routes[index].runner, modelId, affectedRoutes: [],
      });
      reviewCandidates.get(key).affectedRoutes.push({ role: routes[index].role, effort: routes[index].effort });
    }
  }
  const readback = modelRoleBootstrapReadback({ sessionId, receipts, previousReceipts });
  if (!readback.ok) return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-READBACK-FAILED",
    reasonCode: readback.code };
  return { ok: true, code: reusedCount === routes.length
    ? "MODEL-ROLE-BOOTSTRAP-REUSED" : "MODEL-ROLE-BOOTSTRAP-RESOLVED", receipts, readback,
    reviewCandidates: [...reviewCandidates.values()].map((candidate) => ({
      ...candidate,
      affectedRoutes: candidate.affectedRoutes.sort((left, right) =>
        configuredRouteKey({ runner: candidate.runner, ...left }).localeCompare(
          configuredRouteKey({ runner: candidate.runner, ...right }))),
    })).sort((left, right) => `${left.runner}:${left.modelId}`.localeCompare(`${right.runner}:${right.modelId}`)) };
}
