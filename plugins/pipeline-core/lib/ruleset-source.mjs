// SPDX-License-Identifier: SUL-1.0
/**
 * Closed, runner-neutral ruleset-source contract for PHX-0B.
 *
 * This module is deliberately pure: runner adapters discover native state,
 * while later bootstrap/freshness callers supply those observations here.  No
 * filesystem, environment, subprocess, network or runner-specific path is a
 * dependency of the common contract.
 */

export const RULESET_SOURCE_SCHEMA = "pipeline.ruleset-source.v1";

const RUNNERS = new Set(["claude", "codex", "agy"]);
const SOURCE_CLASSES = new Set([
  "marketplace-public",
  "marketplace-private",
  "self-application",
  "local-development",
  "unavailable",
]);
const IDENTITY_ALGORITHMS = new Map([
  ["git-sha1", /^[0-9a-f]{40}$/u],
  ["git-sha256", /^[0-9a-f]{64}$/u],
  ["content-sha256", /^[0-9a-f]{64}$/u],
]);
const PLUGIN_ID = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,159}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function closedKeys(value, expected, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path}-invalid`);
    return false;
  }
  const expectedKeys = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedKeys.has(key)) errors.push(`${path}-unknown-field`);
  }
  return true;
}

function requireKeys(value, required, path, errors) {
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}-${key}-missing`);
  }
}

function validateIdentity(value, path, errors) {
  if (!closedKeys(value, ["status", "algorithm", "value"], path, errors)) return;
  if (value.status === "unavailable") {
    if (Object.keys(value).length !== 1) errors.push(`${path}-unavailable-not-closed`);
    return;
  }
  requireKeys(value, ["status", "algorithm", "value"], path, errors);
  if (value.status !== "available") errors.push(`${path}-status-invalid`);
  const matcher = IDENTITY_ALGORITHMS.get(value.algorithm);
  if (!matcher || typeof value.value !== "string" || !matcher.test(value.value)) {
    errors.push(`${path}-identity-invalid`);
  }
}

/**
 * Validate the exact public-safe v1 shape.  Error codes intentionally never
 * echo untrusted values, so a caller can safely render them as diagnostics.
 */
export function validateRulesetSource(value) {
  const errors = [];
  if (!closedKeys(value, ["schema", "runner", "selectedPlugin", "source", "loadedIdentity", "installedIdentity"], "observation", errors)) {
    return { valid: false, errors };
  }
  requireKeys(value, ["schema", "runner", "selectedPlugin", "source", "loadedIdentity", "installedIdentity"], "observation", errors);
  if (value.schema !== RULESET_SOURCE_SCHEMA) errors.push("schema-invalid");
  if (!RUNNERS.has(value.runner)) errors.push("runner-invalid");

  if (closedKeys(value.selectedPlugin, ["id", "version"], "selected-plugin", errors)) {
    requireKeys(value.selectedPlugin, ["id", "version"], "selected-plugin", errors);
    if (typeof value.selectedPlugin.id !== "string" || !PLUGIN_ID.test(value.selectedPlugin.id)) errors.push("selected-plugin-id-invalid");
    if (typeof value.selectedPlugin.version !== "string" || !VERSION.test(value.selectedPlugin.version)) errors.push("selected-plugin-version-invalid");
  }

  if (closedKeys(value.source, ["class"], "source", errors)) {
    requireKeys(value.source, ["class"], "source", errors);
    if (!SOURCE_CLASSES.has(value.source.class)) errors.push("source-class-invalid");
  }

  validateIdentity(value.loadedIdentity, "loaded-identity", errors);
  validateIdentity(value.installedIdentity, "installed-identity", errors);
  return { valid: errors.length === 0, errors };
}

function copyIdentity(identity) {
  return identity.status === "available"
    ? { status: "available", algorithm: identity.algorithm, value: identity.value }
    : { status: "unavailable" };
}

function sanitizedObservation(value) {
  return {
    schema: RULESET_SOURCE_SCHEMA,
    runner: value.runner,
    selectedPlugin: { id: value.selectedPlugin.id, version: value.selectedPlugin.version },
    source: { class: value.source.class },
    loadedIdentity: copyIdentity(value.loadedIdentity),
    installedIdentity: copyIdentity(value.installedIdentity),
  };
}

/**
 * Return a canonical public-safe observation or a typed non-equality state.
 * Private source coordinates and all unknown adapter fields are rejected rather
 * than preserved, redacted late, or made available to freshness consumers.
 */
export function normalizeRulesetSource(value) {
  const validation = validateRulesetSource(value);
  if (!validation.valid) return { status: "invalid-source-observation", observation: null, diagnostics: validation.errors };

  const observation = sanitizedObservation(value);
  if (observation.source.class === "unavailable") return { status: "source-unavailable", observation, diagnostics: [] };
  if (observation.loadedIdentity.status === "unavailable") return { status: "loaded-identity-unavailable", observation, diagnostics: [] };
  if (observation.installedIdentity.status === "unavailable") return { status: "installed-identity-unavailable", observation, diagnostics: [] };
  if (
    observation.loadedIdentity.algorithm !== observation.installedIdentity.algorithm
    || observation.loadedIdentity.value !== observation.installedIdentity.value
  ) return { status: "loaded-installed-mismatch", observation, diagnostics: [] };
  return { status: "ready", observation, diagnostics: [] };
}

/**
 * Pure comparison primitive for a later freshness transport.  The caller can
 * claim equality only from exact public identities; this function never sees a
 * URL, registry location, account, token, cache path, or remote coordinate.
 */
export function compareLoadedRulesetIdentity(sourceValue, remoteIdentity) {
  const normalized = normalizeRulesetSource(sourceValue);
  if (normalized.status !== "ready") return { status: normalized.status, observation: normalized.observation, remoteIdentity: null };

  const remoteErrors = [];
  validateIdentity(remoteIdentity, "remote-identity", remoteErrors);
  if (remoteErrors.length > 0 || remoteIdentity.status !== "available") {
    return { status: "remote-identity-unavailable", observation: normalized.observation, remoteIdentity: null };
  }
  const publicRemote = copyIdentity(remoteIdentity);
  const same = normalized.observation.loadedIdentity.algorithm === publicRemote.algorithm
    && normalized.observation.loadedIdentity.value === publicRemote.value;
  return {
    status: same ? "equal" : "loaded-remote-mismatch",
    observation: normalized.observation,
    remoteIdentity: publicRemote,
  };
}
