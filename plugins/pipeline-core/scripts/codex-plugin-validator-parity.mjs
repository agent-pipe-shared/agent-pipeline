#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import process from 'node:process';

const OBSERVATION_SCHEMA = 'pipeline.codex-plugin-validator-observation.v1';
const OUTCOME_SCHEMA = 'pipeline.codex-plugin-validator-parity.v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STATUSES = new Set(['accepted', 'rejected', 'unavailable']);

function hasExactKeys(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

function isValidatorObservation(value) {
  if (!hasExactKeys(value, ['status', 'version', 'evidenceSha256'])
    || !STATUSES.has(value.status)) {
    return false;
  }

  if (value.status === 'unavailable') {
    return value.version === null && value.evidenceSha256 === null;
  }

  return typeof value.version === 'string'
    && value.version.length > 0
    && typeof value.evidenceSha256 === 'string'
    && SHA256_PATTERN.test(value.evidenceSha256);
}

function outcome(status, code) {
  return Object.freeze({
    schema: OUTCOME_SCHEMA,
    status,
    code,
    mutation: 'none',
  });
}

/**
 * Classifies parity between generic and native Codex plugin validators.
 *
 * @param {unknown} input
 * @returns {Readonly<{schema: string, status: string, code: string, mutation: string}>}
 */
export function classifyCodexPluginValidatorParity(input) {
  if (!hasExactKeys(input, ['schema', 'fixtureSha256', 'generic', 'native'])
    || input.schema !== OBSERVATION_SCHEMA
    || typeof input.fixtureSha256 !== 'string'
    || !SHA256_PATTERN.test(input.fixtureSha256)
    || !isValidatorObservation(input.generic)
    || !isValidatorObservation(input.native)) {
    return outcome('unavailable', 'VALIDATOR-OBSERVATION-INVALID');
  }

  if (input.generic.status === 'unavailable') {
    return outcome('unavailable', 'GENERIC-VALIDATOR-UNAVAILABLE');
  }

  if (input.native.status === 'unavailable') {
    return outcome('unavailable', 'NATIVE-VALIDATOR-UNAVAILABLE');
  }

  return input.generic.status === input.native.status
    ? outcome('aligned', 'VALIDATOR-PARITY-ALIGNED')
    : outcome('mismatch', 'VALIDATOR-PARITY-MISMATCH');
}

async function main() {
  let input;

  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    input = undefined;
  }

  const result = classifyCodexPluginValidatorParity(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === 'aligned' ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
