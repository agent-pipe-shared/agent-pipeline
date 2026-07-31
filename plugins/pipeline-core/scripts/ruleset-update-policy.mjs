// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const RULESET_UPDATE_POLICY_SCHEMA = "pipeline.ruleset-update-policy.v1";
export const RULESET_UPDATE_POLICY_DISPOSITION_SCHEMA =
  "pipeline.ruleset-update-policy-disposition.v1";

const OID = /^[a-f0-9]{40}$/u;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function rulesetUpdatePolicyDigest(policy) {
  return createHash("sha256").update(canonicalJson(policy)).digest("hex");
}

function validVersion(value) {
  return typeof value === "string" && VERSION.test(value);
}

function validateMatch(match, label) {
  const errors = [];
  if (match?.type === "exact-loaded-builds") {
    if (!exactKeys(match, ["type", "builds"])) return [`${label}.match must contain only type and builds`];
    if (!Array.isArray(match.builds) || match.builds.length === 0) return [`${label}.match.builds must be non-empty`];
    for (const [index, build] of match.builds.entries()) {
      if (!exactKeys(build, ["version", "commit"])) errors.push(`${label}.match.builds[${index}] must contain version and commit`);
      else {
        if (!validVersion(build.version)) errors.push(`${label}.match.builds[${index}].version is invalid`);
        if (!OID.test(build.commit ?? "")) errors.push(`${label}.match.builds[${index}].commit is invalid`);
      }
    }
    return errors;
  }
  if (match?.type === "minimum-safe-version") {
    if (!exactKeys(match, ["type", "version"])) return [`${label}.match must contain only type and version`];
    if (!validVersion(match.version)) errors.push(`${label}.match.version is invalid`);
    return errors;
  }
  return [`${label}.match.type is invalid`];
}

export function validateRulesetUpdatePolicy(policy) {
  const errors = [];
  if (!exactKeys(policy, ["schema", "policyId", "policyVersion", "entries"])) {
    return ["policy must contain exactly schema, policyId, policyVersion, and entries"];
  }
  if (policy.schema !== RULESET_UPDATE_POLICY_SCHEMA) errors.push(`schema must equal ${RULESET_UPDATE_POLICY_SCHEMA}`);
  if (!IDENTIFIER.test(policy.policyId ?? "")) errors.push("policyId is invalid");
  if (!Number.isSafeInteger(policy.policyVersion) || policy.policyVersion < 1) errors.push("policyVersion must be a positive integer");
  if (!Array.isArray(policy.entries)) errors.push("entries must be an array");
  if (!Array.isArray(policy.entries)) return errors;
  const ids = new Set();
  for (const [index, entry] of policy.entries.entries()) {
    const label = `entries[${index}]`;
    if (!exactKeys(entry, ["id", "disposition", "publicSecurityReason", "match"])) {
      errors.push(`${label} must contain exactly id, disposition, publicSecurityReason, and match`);
      continue;
    }
    if (!IDENTIFIER.test(entry.id ?? "")) errors.push(`${label}.id is invalid`);
    else if (ids.has(entry.id)) errors.push(`${label}.id is duplicated`);
    else ids.add(entry.id);
    if (entry.disposition !== "blocking") errors.push(`${label}.disposition must equal blocking`);
    if (typeof entry.publicSecurityReason !== "string" || entry.publicSecurityReason.trim().length < 12) {
      errors.push(`${label}.publicSecurityReason must be a non-empty public explanation`);
    }
    errors.push(...validateMatch(entry.match, label));
  }
  return errors;
}

function numericCore(version) {
  const match = String(version ?? "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/u);
  if (!match) return null;
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4] === undefined ? [] : match[4].split("."),
    build: match[5] === undefined ? [] : match[5].split("."),
  };
}

function compareIdentifiers(left, right, { absentIsNewer }) {
  if (left.length === 0 || right.length === 0) {
    if (left.length === right.length) return 0;
    return left.length === 0 ? (absentIsNewer ? 1 : -1) : (absentIsNewer ? -1 : 1);
  }
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const av = left[index];
    const bv = right[index];
    if (av === undefined || bv === undefined) return av === bv ? 0 : av === undefined ? -1 : 1;
    if (av === bv) continue;
    const an = /^\d+$/u.test(av);
    const bn = /^\d+$/u.test(bv);
    if (an && bn) return Number(av) < Number(bv) ? -1 : 1;
    if (an !== bn) return an ? -1 : 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}

/**
 * Compare Pipeline distribution versions. SemVer precedence comes first; the
 * Pipeline cache-buster build identifiers are then a deterministic tie-breaker.
 */
export function comparePipelineVersions(left, right) {
  const a = numericCore(left);
  const b = numericCore(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1;
  }
  const prerelease = compareIdentifiers(a.prerelease, b.prerelease, { absentIsNewer: true });
  if (prerelease !== 0) return prerelease;
  return compareIdentifiers(a.build, b.build, { absentIsNewer: false });
}

function disposition(fields = {}) {
  return {
    schema: RULESET_UPDATE_POLICY_DISPOSITION_SCHEMA,
    status: fields.status ?? "not-configured",
    policyId: fields.policyId ?? null,
    policyVersion: fields.policyVersion ?? null,
    policySha256: fields.policySha256 ?? null,
    entryId: fields.entryId ?? null,
    disposition: fields.blocking ? "blocking" : "advisory",
    blocking: fields.blocking ?? false,
    publicSecurityReason: fields.publicSecurityReason ?? null,
    reason: fields.reason ?? null,
  };
}

export function evaluateRulesetUpdatePolicy(policy, loaded = {}) {
  if (policy === null || policy === undefined) return disposition();
  const errors = validateRulesetUpdatePolicy(policy);
  if (errors.length > 0) {
    return disposition({ status: "invalid", reason: "invalid-plugin-shipped-policy" });
  }
  const base = {
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policySha256: rulesetUpdatePolicyDigest(policy),
  };
  for (const entry of policy.entries) {
    let matched = false;
    if (entry.match.type === "exact-loaded-builds") {
      matched = entry.match.builds.some((build) =>
        build.version === loaded.version && build.commit === loaded.commit);
    } else {
      const compared = comparePipelineVersions(loaded.version, entry.match.version);
      matched = compared !== null && compared < 0;
    }
    if (matched) {
      return disposition({
        ...base,
        status: "matched",
        entryId: entry.id,
        blocking: true,
        publicSecurityReason: entry.publicSecurityReason,
        reason: "exact-security-policy-match",
      });
    }
  }
  return disposition({ ...base, status: "not-matched", reason: "no-security-policy-match" });
}

export function readRulesetUpdatePolicy(path, { read = readFileSync } = {}) {
  let raw;
  try {
    raw = read(path, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
