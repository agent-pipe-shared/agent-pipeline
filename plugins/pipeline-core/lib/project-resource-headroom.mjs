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
