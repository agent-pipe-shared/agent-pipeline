// SPDX-License-Identifier: SUL-1.0
/** Provider-neutral composed gate for local and external change control. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u; const SHA = /^[a-f0-9]{64}$/u; const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function fail(code) { const error = new Error("Change control input is invalid."); error.code = code; throw error; }
function candidate(value) { return exact(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree); }
function artifact(value) { return exact(value, ["path", "sha256"]) && typeof value.path === "string" && SHA.test(value.sha256); }
function window(value) { return exact(value, ["startsAtEpochMs", "endsAtEpochMs"]) && Number.isSafeInteger(value.startsAtEpochMs) && Number.isSafeInteger(value.endsAtEpochMs) && value.startsAtEpochMs >= 0 && value.endsAtEpochMs >= value.startsAtEpochMs; }
export function validateChangeControlProfile(profile) {
  if (!exact(profile, ["schema", "profileId", "policySha256", "changeClass", "candidate", "artifact", "environment", "scopeSha256", "window", "mandatory"]) || profile.schema !== "pipeline.change-control-profile.v1" || !ID.test(profile.profileId) || !SHA.test(profile.policySha256) || !new Set(["standard", "normal", "emergency", "not-required"]).has(profile.changeClass) || !candidate(profile.candidate) || !artifact(profile.artifact) || !ID.test(profile.environment) || !SHA.test(profile.scopeSha256) || !window(profile.window) || typeof profile.mandatory !== "boolean" || (profile.changeClass === "not-required") !== !profile.mandatory) fail("CC-PROFILE");
  return Object.freeze({ ...profile, candidate: Object.freeze({ ...profile.candidate }), artifact: Object.freeze({ ...profile.artifact }), window: Object.freeze({ ...profile.window }) });
}
export function validateChangeControlReceipt(receipt) {
  if (!exact(receipt, ["schema", "profileId", "candidate", "artifact", "environment", "scopeSha256", "window", "state", "authenticated"]) || receipt.schema !== "pipeline.change-control-receipt.v1" || !ID.test(receipt.profileId) || !candidate(receipt.candidate) || !artifact(receipt.artifact) || !ID.test(receipt.environment) || !SHA.test(receipt.scopeSha256) || !window(receipt.window) || !new Set(["draft", "approved", "rejected", "expired", "conflicting", "unknown", "unavailable"]).has(receipt.state) || typeof receipt.authenticated !== "boolean") fail("CC-RECEIPT");
  return Object.freeze({ ...receipt, candidate: Object.freeze({ ...receipt.candidate }), artifact: Object.freeze({ ...receipt.artifact }), window: Object.freeze({ ...receipt.window }) });
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
/** The gate never converts ITSM text/receipt into Pipeline or human authority. */
export function evaluateChangeControlGate({ profile, pipelineAuthority, externalReceipt, nowEpochMs } = {}) {
  const current = validateChangeControlProfile(profile); if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0 || !exact(pipelineAuthority, ["granted", "candidate", "artifact", "environment", "scopeSha256", "emergencyAuthorized"]) || typeof pipelineAuthority.granted !== "boolean" || !candidate(pipelineAuthority.candidate) || !artifact(pipelineAuthority.artifact) || !ID.test(pipelineAuthority.environment) || !SHA.test(pipelineAuthority.scopeSha256) || typeof pipelineAuthority.emergencyAuthorized !== "boolean") fail("CC-GATE");
  const matchesLocal = pipelineAuthority.granted && same(pipelineAuthority.candidate, current.candidate) && same(pipelineAuthority.artifact, current.artifact) && pipelineAuthority.environment === current.environment && pipelineAuthority.scopeSha256 === current.scopeSha256;
  if (!matchesLocal) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "pipeline-authority" });
  if (current.changeClass === "emergency" && !pipelineAuthority.emergencyAuthorized) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "emergency-authority" });
  if (!current.mandatory) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "not-required" });
  if (externalReceipt === null) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "external-unavailable" });
  const external = validateChangeControlReceipt(externalReceipt); const matchesExternal = external.profileId === current.profileId && same(external.candidate, current.candidate) && same(external.artifact, current.artifact) && external.environment === current.environment && external.scopeSha256 === current.scopeSha256 && same(external.window, current.window);
  if (!matchesExternal || !external.authenticated || external.state !== "approved") return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "external-authority" });
  if (nowEpochMs < current.window.startsAtEpochMs || nowEpochMs > current.window.endsAtEpochMs) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "outside-window" });
  return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "composed-authority" });
}
