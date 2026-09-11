// SPDX-License-Identifier: SUL-1.0
/** Runner-neutral Critic disposition primitives for dispatch-record v3. */

export const CRITIC_SKIP_SCHEMA = "pipeline.critic-skip-decision.v1";
export const CRITIC_REQUIRED_SCHEMA = "pipeline.critic-required-decision.v1";
export const CRITIC_EVIDENCE_SCHEMA = "pipeline.critic-evidence-reference.v1";
export const CRITIC_TRIGGER_INPUT_SCHEMA = "pipeline.critic-trigger-input.v1";
export const CRITIC_DISPOSITION_WIRING_MARKER = "pipeline.critic-skip-wired-into-real-dispatch";

const RISK_CLASSES = Object.freeze(["low", "medium", "high"]);
const TRIGGER_ROWS = Object.freeze(["T0", "T1", "T2", "T3", "T4", "T5"]);

const LOCKFILE_NAMES = new Set([
  "bun.lock", "bun.lockb", "cargo.lock", "composer.lock", "gemfile.lock", "go.sum",
  "package-lock.json", "packages.lock.json", "pipfile.lock", "pnpm-lock.yaml",
  "poetry.lock", "uv.lock", "yarn.lock",
]);

function pathSegments(path) {
  return String(path ?? "").replaceAll("\\", "/").replace(/^\.\//u, "").toLowerCase().split("/").filter(Boolean);
}

function hasSegment(segments, names) {
  return segments.some((segment) => names.has(segment));
}

/**
 * Infer only the path-level facts that a dispatch cannot safely self-declare away.
 * This deliberately prefers false positives over allowing a T0/T5 fast path over
 * architecture, guardrail, or security authority surfaces.
 */
export function classifyCriticChangedPaths(paths) {
  if (!Array.isArray(paths)) throw new TypeError("changed paths must be an array");
  const normalized = paths.map((path) => String(path ?? "").replaceAll("\\", "/").replace(/^\.\//u, "")).filter(Boolean);
  let architecture = false;
  let guardrails = false;
  let security = false;
  let mechanical = normalized.length > 0;

  for (const path of normalized) {
    const segments = pathSegments(path);
    const basename = segments.at(-1) ?? "";
    const joined = segments.join("/");
    if (hasSegment(segments, new Set(["agents", "agent", "architecture", "architectures", "adr", "adrs"]))
      || /(?:^|[-_.])(architecture|architectural|adr|design-authority)(?:[-_.]|$)/u.test(basename)
      || joined.includes("design-authority")) architecture = true;
    if (hasSegment(segments, new Set(["hooks", "hook", "guardrails", "guardrail", "policies", "policy"]))
      || /^\.claude\/settings(?:\.|$)/u.test(joined)) guardrails = true;
    if (segments.some((segment) => /(?:^|[-_.])(security|secure|auth|authentication|authorization|credential|credentials|secret|secrets)(?:[-_.]|$)/u.test(segment))
      || /(?:^|[-_.])(security|auth|authentication|authorization|credential|credentials|secret|secrets)(?:[-_.]|$)/u.test(basename)) security = true;

    const isLockfile = LOCKFILE_NAMES.has(basename) || basename.endsWith(".lock");
    const isGenerated = hasSegment(segments, new Set(["generated", "codegen"]))
      || /(?:^|[-_.])(generated|codegen)(?:[-_.]|$)/u.test(basename);
    mechanical &&= isLockfile || isGenerated;
  }
  return { mechanical, architecture, guardrails, security };
}

/** Validate a declared trigger against paths independently observed from git. */
export function criticDecisionPathFinding(decision, paths) {
  const actual = classifyCriticChangedPaths(paths);
  if (!decision || typeof decision !== "object") return { code: "critic-trigger-missing", actual, reason: "critic decision is missing" };
  const declared = decision.trigger?.diff;
  if (!declared || typeof declared !== "object") return { code: "critic-trigger-missing", actual, reason: "critic decision has no diff trigger" };
  const missing = ["architecture", "guardrails", "security"].filter((flag) => actual[flag] && declared[flag] !== true);
  if (missing.length > 0) {
    return { code: "critic-trigger-underdeclared", actual, missing, reason: `actual changed paths imply undeclared ${missing.join(", ")} trigger(s)` };
  }
  if (declared.mechanical === true && !actual.mechanical) {
    return { code: "critic-mechanical-path-mismatch", actual, reason: "T0 mechanical disposition includes a path outside conservative generated/lockfile surfaces" };
  }
  return null;
}

function closedObject(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)));
}

export function validateCriticTriggerInput(value) {
  if (!closedObject(value, ["schema", "rigorLevel", "riskClass", "riskFlag", "diff"])) {
    throw new TypeError("critic trigger input must be a closed object");
  }
  if (value.schema !== CRITIC_TRIGGER_INPUT_SCHEMA) throw new TypeError(`critic trigger input schema must be ${CRITIC_TRIGGER_INPUT_SCHEMA}`);
  if (![0, 1, 2].includes(value.rigorLevel)) throw new TypeError("critic trigger rigorLevel must be 0, 1 or 2");
  if (!RISK_CLASSES.includes(value.riskClass)) throw new TypeError("critic trigger riskClass must be low, medium or high");
  if (typeof value.riskFlag !== "boolean") throw new TypeError("critic trigger riskFlag must be boolean");
  if (!closedObject(value.diff, ["mechanical", "architecture", "guardrails", "security"])
    || Object.values(value.diff).some((entry) => typeof entry !== "boolean")) {
    throw new TypeError("critic trigger diff must be a closed boolean matrix");
  }
  return structuredClone(value);
}

/** Evaluate every row in strictness order; a mechanical label never masks T1-T4. */
export function evaluateCriticTriggerRow(value) {
  const input = validateCriticTriggerInput(value);
  if (input.diff.architecture || input.diff.guardrails || input.diff.security) return "T1";
  if (input.riskClass === "high") return "T2";
  if (input.rigorLevel === 2) return "T3";
  if (input.riskClass === "medium" || input.rigorLevel === 1 || input.riskFlag) return "T4";
  if (input.diff.mechanical) return "T0";
  return "T5";
}

export function validateCriticDecision(value, { required }) {
  const label = required ? "criticRequired" : "criticSkip";
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const allowed = ["schema", "trigger", "appliedRow", "reason"];
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key)) || !["schema", "trigger", "appliedRow"].every((key) => Object.hasOwn(value, key))) {
    throw new TypeError(`${label} must be closed and include schema, trigger and appliedRow`);
  }
  const expectedSchema = required ? CRITIC_REQUIRED_SCHEMA : CRITIC_SKIP_SCHEMA;
  if (value.schema !== expectedSchema) throw new TypeError(`${label} schema must be ${expectedSchema}`);
  const trigger = validateCriticTriggerInput(value.trigger);
  const row = evaluateCriticTriggerRow(trigger);
  if (!TRIGGER_ROWS.includes(value.appliedRow) || value.appliedRow !== row) throw new TypeError(`${label} appliedRow must equal evaluated row ${row}`);
  if (required ? !["T1", "T2", "T3", "T4"].includes(row) : !["T0", "T5"].includes(row)) {
    throw new TypeError(`${label} is not valid for trigger row ${row}`);
  }
  if (Object.hasOwn(value, "reason") && (typeof value.reason !== "string" || value.reason.trim() !== value.reason || value.reason.length === 0 || value.reason.length > 1024 || /[\0\r\n]/u.test(value.reason))) {
    throw new TypeError(`${label}.reason is invalid`);
  }
  return { ...structuredClone(value), trigger };
}

export function hasCriticSkipDecision(record) {
  return Boolean(record && typeof record === "object" && record.criticSkip && typeof record.criticSkip === "object" && !Array.isArray(record.criticSkip));
}

export function hasCriticRequiredDecision(record) {
  return Boolean(record && typeof record === "object" && record.criticRequired && typeof record.criticRequired === "object" && !Array.isArray(record.criticRequired));
}

export function hasCriticEvidenceReference(record) {
  return Boolean(record && typeof record === "object" && record.criticEvidence && typeof record.criticEvidence === "object" && !Array.isArray(record.criticEvidence));
}

export function criticDisposition(record) {
  const present = [
    ["skipped", hasCriticSkipDecision(record)],
    ["required", hasCriticRequiredDecision(record)],
    ["evidenced", hasCriticEvidenceReference(record)],
  ].filter(([, exists]) => exists);
  if (present.length !== 1) return present.length === 0 ? "missing" : "conflicting";
  return present[0][0];
}

export function countCriticSkipDecisions(records) {
  return Array.isArray(records) ? records.filter(hasCriticSkipDecision).length : 0;
}

export function evaluateCriticSkipCoverage({ dispatchedWorkCount, criticArtifactCount, skipRecordCount, requiredRecordCount = 0 }) {
  const total = Number(dispatchedWorkCount) || 0;
  const evidenced = Number(criticArtifactCount) || 0;
  const skipped = Number(skipRecordCount) || 0;
  const required = Number(requiredRecordCount) || 0;
  const covered = evidenced + skipped;
  if (total === 0) return { finding: false, reason: "no applicable dispatch records to evaluate" };
  if (covered === total) return { finding: false, reason: `${evidenced} evidenced and ${skipped} skipped dispatch record(s) cover all ${total} applicable record(s)` };
  return {
    finding: true,
    reason: `critic disposition missing or invalid: ${total - Math.min(covered, total)} of ${total} applicable dispatch record(s) are uncovered${required > 0 ? ` (${required} explicitly require Critic evidence)` : ""}`,
  };
}

export function evaluateCriticSkipCoverageFromRecords({ records }) {
  const applicable = (Array.isArray(records) ? records : []).filter((record) => record?.schema === "pipeline.dispatch-record.v3");
  const skipRecordCount = applicable.filter((record) => criticDisposition(record) === "skipped").length;
  const requiredRecordCount = applicable.filter((record) => criticDisposition(record) === "required").length;
  const criticArtifactCount = applicable.filter((record) => criticDisposition(record) === "evidenced").length;
  return evaluateCriticSkipCoverage({ dispatchedWorkCount: applicable.length, criticArtifactCount, skipRecordCount, requiredRecordCount });
}
