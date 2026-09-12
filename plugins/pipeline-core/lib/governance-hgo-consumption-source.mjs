// SPDX-License-Identifier: SUL-1.0
/** Closed bridge from HGO's private authenticated records to a public-safe source. */

import { canonicalSha256 } from "./governance-event.mjs";

export const HGO_GOVERNANCE_CONSUMPTION_SOURCE_SCHEMA = "pipeline.human-guard-override-governance-consumption-source.v1";
export const HGO_GOVERNANCE_CONSUMPTION_DIGEST_DOMAIN = `${HGO_GOVERNANCE_CONSUMPTION_SOURCE_SCHEMA}:digest`;

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SOURCE_KEYS = Object.freeze(["schema", "status", "consumptionSha256", "candidate"]);
const BUILD_KEYS = Object.freeze(["planSha256", "requestSha256", "candidate"]);

export class GovernanceHgoConsumptionSourceError extends Error {
  constructor(code) {
    super("Governance HGO consumption source is invalid.");
    this.name = "GovernanceHgoConsumptionSourceError";
    this.code = code;
  }
}

function fail(code) { throw new GovernanceHgoConsumptionSourceError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function checkedCandidate(value) {
  if (!exact(value, ["commit", "tree"]) || !OID.test(value.commit ?? "") || !OID.test(value.tree ?? "")) {
    fail("GHCS-CANDIDATE");
  }
  return Object.freeze({ commit: value.commit, tree: value.tree });
}

export function validateGovernanceHgoConsumptionSource(source) {
  if (!exact(source, SOURCE_KEYS) || source.schema !== HGO_GOVERNANCE_CONSUMPTION_SOURCE_SCHEMA
    || source.status !== "consumed") fail("GHCS-SHAPE");
  if (!SHA256.test(source.consumptionSha256 ?? "")) fail("GHCS-DIGEST");
  return Object.freeze({
    schema: HGO_GOVERNANCE_CONSUMPTION_SOURCE_SCHEMA,
    status: "consumed",
    consumptionSha256: source.consumptionSha256,
    candidate: checkedCandidate(source.candidate),
  });
}

/** Hash private record identifiers behind one domain-separated public handle. */
export function buildGovernanceHgoConsumptionSource(input) {
  if (!exact(input, BUILD_KEYS)) fail("GHCS-BUILD-SHAPE");
  if (!SHA256.test(input.planSha256 ?? "") || !SHA256.test(input.requestSha256 ?? "")) fail("GHCS-BUILD-DIGEST");
  const candidate = checkedCandidate(input.candidate);
  return validateGovernanceHgoConsumptionSource({
    schema: HGO_GOVERNANCE_CONSUMPTION_SOURCE_SCHEMA,
    status: "consumed",
    consumptionSha256: canonicalSha256({
      domain: HGO_GOVERNANCE_CONSUMPTION_DIGEST_DOMAIN,
      planSha256: input.planSha256,
      requestSha256: input.requestSha256,
      candidate,
    }),
    candidate,
  });
}
