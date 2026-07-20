// SPDX-License-Identifier: Apache-2.0

/**
 * Runner-neutral advisory coordinator.
 *
 * Host adapters are injected deliberately: Claude's native advisor and the
 * runner-specific subagent dispatch are host capabilities, while route order,
 * isolation inputs, fail-closed handling and receipt creation belong here.
 */
import { createHash, randomUUID } from "node:crypto";

import { validateAdvisoryReceipt } from "./advisory-receipt.mjs";
import { loadRunnerProfilesV3Registry, validateRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";

const SUCCESS = "answered";
const FAILURE_STATUSES = new Set(["unavailable", "failed", "timed-out", "permission-denied"]);
const PROVIDER = Object.freeze({ claude: "anthropic", codex: "openai" });
const CONSULT_TOOLS = Object.freeze(["Read", "Grep", "Glob"]);
const SELECTED_CODEX_CONSULT_TOOLS = Object.freeze([...CONSULT_TOOLS, "Bash"]);

export const ADVISORY_FABLE_ATTEMPTS = 2;
export const ADVISORY_CONSULT_AGENT = "consult-advisor";

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function copy(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validQuestion(question) {
  return typeof question === "string" && question.trim().length > 0 && !question.includes("\0");
}

function statusFromThrown(error) {
  const token = `${error?.code ?? ""} ${error?.name ?? ""}`.toLowerCase();
  if (token.includes("timeout") || token.includes("timedout") || token.includes("timed-out")) return "timed-out";
  if (token.includes("permission") || token.includes("denied") || token.includes("eperm")) return "permission-denied";
  if (token.includes("unavailable") || token.includes("unsupported") || token.includes("enoent")) return "unavailable";
  return "failed";
}

function failureReason(adapter, status) {
  const suffix = status === "timed-out" ? "timeout" : status;
  return `${adapter}-${suffix}`;
}

function redactedErrorClass(status) {
  if (status === "timed-out") return "timeout";
  if (status === "permission-denied") return "permission-denied";
  if (status === "unavailable") return "unavailable";
  return "failure";
}

function identityMatchesRoute(identity, step) {
  if (identity?.provider !== PROVIDER[step.runner]) return false;
  if (identity.effort !== step.effort) return false;
  const configured = step.selector?.value;
  if (step.selector?.kind === "model-id") return identity.modelId === configured;
  const acceptedAliases = {
    fable: new Set(["fable", "claude-fable"]),
    opus: new Set(["opus", "claude-opus"]),
    sonnet: new Set(["sonnet", "claude-sonnet"]),
  };
  return acceptedAliases[configured]?.has(identity.modelId) === true;
}

function normalizeResult(value, step) {
  if (!value || typeof value !== "object" || ![SUCCESS, ...FAILURE_STATUSES].includes(value.status)) {
    return { status: "failed", identity: null, answer: null, code: "adapter_protocol" };
  }
  if (value.status !== SUCCESS) {
    return { status: value.status, identity: null, answer: null, code: `adapter_${value.status}` };
  }
  if (typeof value.answer !== "string" || value.answer.length === 0
    || !value.identity || !identityMatchesRoute(value.identity, step)
    || typeof value.identity.modelId !== "string" || value.identity.modelId.length === 0
    || typeof value.identity.effort !== "string") {
    return { status: "failed", identity: null, answer: null, code: "adapter_protocol" };
  }
  return { status: SUCCESS, identity: copy(value.identity), answer: value.answer, code: SUCCESS };
}

async function invoke(adapter, payload, step) {
  try {
    return normalizeResult(await adapter(deepFreeze(copy(payload))), step);
  } catch (error) {
    const status = statusFromThrown(error);
    return { status, identity: null, answer: null, code: `adapter_${status}` };
  }
}

function receiptRoute(step) {
  return {
    runner: step.runner,
    selector: copy(step.selector),
    effort: step.effort,
  };
}

function makeReceipt({ input, step, result, fallbackReason, emittedAtMs, receiptId }) {
  const receipt = {
    schema: "pipeline.advisory-receipt.v1",
    receiptId,
    dispatch: copy(input.dispatch),
    duty: "advisory",
    profile: input.profile,
    configuredRoute: receiptRoute(step),
    adapter: step.kind,
    observed: {
      status: result.status,
      identity: result.identity,
    },
    questionSha256: digest(input.question),
    answerSha256: result.answer === null ? null : digest(result.answer),
    fallback: {
      reason: fallbackReason,
      redactedErrorClass: fallbackReason === "none" ? null : redactedErrorClass(
        fallbackReason.endsWith("timeout") ? "timed-out"
          : fallbackReason.endsWith("permission-denied") ? "permission-denied"
            : fallbackReason.endsWith("unavailable") ? "unavailable" : "failed",
      ),
    },
    emittedAtMs,
  };
  const checked = validateAdvisoryReceipt(receipt);
  if (!checked.ok) throw new Error(`advisory coordinator produced an invalid receipt: ${checked.reason}`);
  return receipt;
}

function consultPayload(input, step) {
  return {
    role: ADVISORY_CONSULT_AGENT,
    subagentType: ADVISORY_CONSULT_AGENT,
    runner: step.runner,
    model: step.selector.value,
    selector: copy(step.selector),
    effort: step.effort,
    question: input.question,
    dispatch: copy(input.dispatch),
    oneQuestion: true,
    freshContext: true,
    contextPolicy: "fresh-no-handover-no-chat-history-no-implementor-rationale",
    tools: [...(step.runner === "codex" && input.sandbox !== undefined ? SELECTED_CODEX_CONSULT_TOOLS : CONSULT_TOOLS)],
    memory: false,
    autoApply: false,
    ...(input.sandbox === undefined ? {} : { sandbox: copy(input.sandbox) }),
  };
}

function nativePayload(input, step, attempt) {
  return {
    role: "native-advisor",
    runner: step.runner,
    adapter: step.adapter,
    selector: copy(step.selector),
    effort: step.effort,
    question: input.question,
    dispatch: copy(input.dispatch),
    attempt,
    oneQuestion: true,
    autoApply: false,
  };
}

function routeSteps(contract, runner) {
  const route = contract[runner];
  if (!route || route.state !== "default") return [];
  if (runner === "codex") {
    return [{ kind: "consult", adapter: route.adapter, runner, selector: route.selector, effort: route.effort, attempts: 1 }];
  }
  const nativeOpus = route.fallbacks?.find((entry) => entry.adapter === "native-opus");
  const consult = route.fallbacks?.find((entry) => entry.adapter === "consult");
  return [
    { kind: "native", adapter: route.adapter, runner, selector: route.selector, effort: route.effort, attempts: ADVISORY_FABLE_ATTEMPTS },
    nativeOpus && { kind: "native", ...nativeOpus, effort: nativeOpus.effort ?? route.effort, attempts: 1 },
    consult && { kind: "consult", ...consult, effort: consult.effort ?? route.effort, attempts: 1 },
  ].filter(Boolean);
}

function validateInput(input) {
  if (!input || typeof input !== "object") return "invalid_input";
  if (!validQuestion(input.question)) return "invalid_question";
  if (!["epic", "feature", "mini"].includes(input.profile)) return "invalid_profile";
  if (!Object.hasOwn(PROVIDER, input.runner)) return "invalid_runner";
  if (!input.dispatch || typeof input.dispatch !== "object"
    || typeof input.dispatch.dispatchId !== "string"
    || !Number.isSafeInteger(input.dispatch.queueRevision) || input.dispatch.queueRevision < 0
    || !/^[a-f0-9]{40,64}$/.test(input.dispatch.candidateCommit ?? "")
    || !/^[a-f0-9]{40,64}$/.test(input.dispatch.candidateTree ?? "")) return "invalid_dispatch";
  if (input.sandbox !== undefined) {
    const sandbox = input.sandbox;
    if (!sandbox || typeof sandbox !== "object" || Array.isArray(sandbox)
      || JSON.stringify(Object.keys(sandbox).sort()) !== JSON.stringify(["assurance", "requestSha256", "selectionId", "selectionSha256"].sort())
      || !/^css_[a-z2-7]{25}[aeimquy4]$/.test(sandbox.selectionId ?? "")
      || !/^[a-f0-9]{64}$/.test(sandbox.selectionSha256 ?? "")
      || !/^[a-f0-9]{64}$/.test(sandbox.requestSha256 ?? "")
      || sandbox.assurance?.class !== "sandbox-read-only-except-coordinator-scratch-network-open"
      || sandbox.assurance?.literal !== "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted") return "invalid_sandbox_boundary";
  }
  return null;
}

/**
 * Executes one advisory question through the registered V3 route.
 *
 * The returned `answer` is runtime-only input to Elephant judgment. Only the
 * separate `receipt` is suitable for persistence; it contains content digests
 * and redacted failure classes, never the question, answer or adapter errors.
 */
export async function coordinateAdvisory(input, {
  invokeNative,
  invokeConsult,
  advisorExport = null,
  now = () => Date.now(),
  makeReceiptId = () => `advisory-${randomUUID()}`,
  registry = loadRunnerProfilesV3Registry(),
} = {}) {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, code: invalid, answer: null, receipt: null, attempts: [] };

  if (!validateRunnerProfilesV3Registry(registry, { source: "advisory coordinator route" }).ok) {
    return { ok: false, code: "route_contract_invalid", answer: null, receipt: null, attempts: [] };
  }

  const approvedExport = advisorExport && typeof advisorExport === "object" && !Array.isArray(advisorExport)
    && Object.keys(advisorExport).length === 1 && advisorExport.consent === "approved";
  if (!approvedExport) {
    return { ok: false, code: "advisory_disabled_no_consent", answer: null, receipt: null, attempts: [] };
  }

  const contract = registry?.duties?.advisory;
  const eligibility = contract?.eligibility?.[input.profile];
  if (eligibility !== "required") {
    return { ok: false, code: "advisory_disabled", answer: null, receipt: null, attempts: [] };
  }
  const steps = routeSteps(contract, input.runner);
  if (steps.length === 0) {
    return { ok: false, code: "route_unavailable", answer: null, receipt: null, attempts: [] };
  }
  if (steps.some((step) => step.runner !== input.runner)) {
    return { ok: false, code: "runner_switch_forbidden", answer: null, receipt: null, attempts: [] };
  }
  if (steps.some((step) => step.kind === "native" && typeof invokeNative !== "function")
    || steps.some((step) => step.kind === "consult" && typeof invokeConsult !== "function")) {
    return { ok: false, code: "adapter_unavailable", answer: null, receipt: null, attempts: [] };
  }

  const attempts = [];
  let priorNativeFailure = null;
  let last = null;
  let lastStep = null;
  for (const step of steps) {
    for (let attempt = 1; attempt <= step.attempts; attempt += 1) {
      const payload = step.kind === "consult" ? consultPayload(input, step) : nativePayload(input, step, attempt);
      const result = await invoke(step.kind === "consult" ? invokeConsult : invokeNative, payload, step);
      attempts.push({ adapter: step.adapter, kind: step.kind, runner: step.runner, status: result.status });
      last = result;
      lastStep = step;
      if (result.status === SUCCESS) {
        const fallbackReason = priorNativeFailure === null ? "none" : failureReason("native", priorNativeFailure);
        return {
          ok: true,
          code: SUCCESS,
          answer: result.answer,
          receipt: makeReceipt({ input, step, result, fallbackReason, emittedAtMs: now(), receiptId: makeReceiptId() }),
          attempts,
        };
      }
      if (step.kind === "native") priorNativeFailure = result.status;
    }
  }

  const fallbackReason = failureReason(lastStep.kind, last.status);
  return {
    ok: false,
    code: last.code,
    answer: null,
    receipt: makeReceipt({ input, step: lastStep, result: last, fallbackReason, emittedAtMs: now(), receiptId: makeReceiptId() }),
    attempts,
  };
}
