// SPDX-License-Identifier: SUL-1.0
/**
 * Report arithmetic over declared project observations. This helper neither
 * authenticates source digests nor runs measurements or grants compliance.
 * Limits come from the project's existing criterion, never a pipeline profile.
 */
export class ResourceHeadroomError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResourceHeadroomError';
    this.code = 'RESOURCE-HEADROOM-INPUT';
  }
}

const fail = (message) => { throw new ResourceHeadroomError(message); };
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const CONTROL = /[\x00-\x1f\x7f]/u;
const IDENTIFIER = /^[A-Za-z0-9._-]+$/u;

function keys(value, expected, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value);
  if (actual.length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) fail(`${label} has invalid keys.`);
}

function text(value, maximum, label, identifier = false) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximum
    || CONTROL.test(value) || (identifier && !IDENTIFIER.test(value))) fail(`${label} is invalid.`);
}

function path(value) {
  text(value, 500, 'Source reference path');
  if (/[\\:]/u.test(value) || value.split('/').some(part => part === '' || part === '.' || part === '..')) fail('Source reference path must be repository-relative.');
}

function candidate(value) {
  keys(value, ['commit', 'tree'], 'Candidate');
  if (!OID.test(value.commit ?? '') || !OID.test(value.tree ?? '')
    || typeof value.commit !== 'string' || typeof value.tree !== 'string') fail('Candidate identifiers are invalid.');
}

function ref(value, withLocator) {
  keys(value, withLocator ? ['path', 'sha256', 'locator'] : ['path', 'sha256'], 'Source reference');
  path(value.path);
  if (typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)) fail('Source reference digest is invalid.');
  if (withLocator) text(value.locator, 500, 'Criterion locator');
}

function numeric(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail('Resource value must be a nonnegative finite number.');
}

function validateResource(value) {
  keys(value, ['id', 'limit', 'measurement'], 'Resource');
  text(value.id, 80, 'Resource identifier', true);
  if (value.limit !== null) {
    keys(value.limit, ['value', 'unit', 'sourceRef'], 'Limit');
    numeric(value.limit.value);
    text(value.limit.unit, 32, 'Limit unit', true);
    ref(value.limit.sourceRef, true);
  }
  if (value.measurement !== null) {
    const measurement = value.measurement;
    keys(measurement, ['value', 'unit', 'candidate', 'limitSourceSha256', 'command', 'artifactRef', 'exitCode'], 'Measurement');
    numeric(measurement.value);
    text(measurement.unit, 32, 'Measurement unit', true);
    candidate(measurement.candidate);
    if (typeof measurement.limitSourceSha256 !== 'string' || !SHA256.test(measurement.limitSourceSha256)) fail('Measured limit-source digest is invalid.');
    text(measurement.command, 2048, 'Measurement command');
    ref(measurement.artifactRef, false);
    if (!Number.isFinite(measurement.exitCode) || !Number.isInteger(measurement.exitCode)) fail('Measurement exit must be an integer.');
  }
}

/** Pure reporting: no file access, subprocess, authority or input mutation. */
export function reportProjectResourceHeadroom(input) {
  keys(input, ['schema', 'candidate', 'resources'], 'Observation input');
  if (input.schema !== 'pipeline.project-resource-observations.v1') fail('Observation schema is invalid.');
  candidate(input.candidate);
  if (!Array.isArray(input.resources)) fail('Resources must be an array.');
  // Validate the whole input before returning any partial-looking result.
  for (const resource of input.resources) validateResource(resource);
  return {
    schema: 'pipeline.project-resource-headroom-report.v1',
    candidate: { ...input.candidate },
    assurance: 'declared-observations',
    compliance: 'not-certified',
    resources: input.resources.map(resource => {
      const { limit, measurement } = resource;
      let status = 'unknown';
      let headroom = null;
      if (limit !== null && measurement !== null) {
        if (measurement.candidate.commit !== input.candidate.commit
          || measurement.candidate.tree !== input.candidate.tree
          || measurement.limitSourceSha256 !== limit.sourceRef.sha256) status = 'stale';
        else if (measurement.unit !== limit.unit) status = 'incompatible-units';
        else if (measurement.exitCode !== 0) status = 'measurement-failed';
        else {
          headroom = limit.value - measurement.value;
          status = headroom >= 0 ? 'within-limit' : 'exceeded';
        }
      }
      return {
        id: resource.id,
        status,
        unit: limit?.unit ?? measurement?.unit ?? null,
        limit: limit?.value ?? null,
        measured: measurement?.value ?? null,
        headroom,
        limitSourceRef: limit === null ? null : { ...limit.sourceRef },
        measurementRef: measurement === null ? null : { ...measurement.artifactRef },
        measurementCommand: measurement?.command ?? null,
        measurementExitCode: measurement?.exitCode ?? null,
      };
    }),
  };
}

/*
 * Run-time budget headroom (ALF-C-P5-04B, AC-233; PO decisions 2026-10-16 #26/#29).
 *
 * The budget is a RUN-TIME budget per run: an optional calibration field
 *   "resourceBudget": { "quickSeconds": <seconds>, "verifySeconds": <seconds> }
 * compared with the measured wall-clock seconds of that Quick or Verify run.
 * No (valid) budget -> "unknown". INFORMATION ONLY: nothing here returns or
 * accepts an exit code, and runHeadroomInfoLine() never throws, so wiring it
 * after a run cannot block, fail or change that run's result.
 */
export const RUN_TIME_BUDGET_KEYS = Object.freeze({ quick: 'quickSeconds', verify: 'verifySeconds' });
const RUN_PREFIX = 'Resource headroom (run time): ';
const INFO_ONLY = 'information only';
const positiveSeconds = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const measuredOk = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const seconds = (value) => String(Number(value.toFixed(3)));
const budgetKey = (kind) => (typeof kind === 'string' && Object.hasOwn(RUN_TIME_BUDGET_KEYS, kind) ? RUN_TIME_BUDGET_KEYS[kind] : null);

/** Pure: budget minus measured seconds; "unknown" whenever either side is absent or invalid. */
export function headroomForRun(input) {
  const given = input !== null && typeof input === 'object' ? input : {};
  const budget = given.budgetSeconds;
  const measured = given.measuredSeconds;
  if (!positiveSeconds(budget) || !measuredOk(measured)) {
    return {
      status: 'unknown',
      budgetSeconds: positiveSeconds(budget) ? budget : null,
      measuredSeconds: measuredOk(measured) ? measured : null,
      headroomSeconds: null,
    };
  }
  const headroomSeconds = budget - measured;
  return { status: headroomSeconds >= 0 ? 'within' : 'exceeded', budgetSeconds: budget, measuredSeconds: measured, headroomSeconds };
}

/** Pure: read the declared run-time budget for `kind` from a parsed calibration; undefined when none. */
export function readRunBudgetSeconds(calibration, kind) {
  const key = budgetKey(kind);
  if (key === null || calibration === null || typeof calibration !== 'object' || !Object.hasOwn(calibration, 'resourceBudget')) return undefined;
  const budget = calibration.resourceBudget;
  if (budget === null || typeof budget !== 'object' || !Object.hasOwn(budget, key)) return undefined;
  return budget[key];
}

/** Pure: one single-line, information-only rendering of a headroomForRun() result. */
export function formatRunHeadroomLine(result, kind) {
  if (result !== null && typeof result === 'object'
    && [result.budgetSeconds, result.measuredSeconds, result.headroomSeconds].every(Number.isFinite)) {
    const { budgetSeconds: b, measuredSeconds: m, headroomSeconds: h } = result;
    if (result.status === 'within' && h >= 0) return `${RUN_PREFIX}within - budget ${seconds(b)} s, measured ${seconds(m)} s, headroom ${seconds(h)} s (${INFO_ONLY})`;
    if (result.status === 'exceeded' && h < 0) return `${RUN_PREFIX}exceeded - budget ${seconds(b)} s, measured ${seconds(m)} s, over by ${seconds(-h)} s (${INFO_ONLY}; result and exit code unchanged)`;
  }
  const key = budgetKey(kind);
  return key === null
    ? `${RUN_PREFIX}unknown - run kind not recognised (${INFO_ONLY})`
    : `${RUN_PREFIX}unknown - no valid run-time budget declared (resourceBudget.${key}) or no valid measurement (${INFO_ONLY})`;
}

/**
 * The one call a Quick or Verify summary makes after its result. Never throws:
 * any error (including a throwing injected `headroom` reporter) prints "unknown".
 */
export function runHeadroomInfoLine(options) {
  try {
    const { kind, measuredSeconds, calibration, headroom = headroomForRun } = options ?? {};
    const result = headroom({ budgetSeconds: readRunBudgetSeconds(calibration, kind), measuredSeconds });
    return formatRunHeadroomLine(result, kind);
  } catch {
    return `${RUN_PREFIX}unknown - headroom could not be computed (${INFO_ONLY})`;
  }
}
