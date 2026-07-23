// SPDX-License-Identifier: SUL-1.0

import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";

export const HOST_ADVISOR_STATUS_SCHEMA = "pipeline.host-advisor-status.v1";
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const KEYS = ["schema", "candidate", "launch", "questionSha256", "answerSha256", "attempt", "boundary", "outcome"];
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const freeze = (v) => { if (v && typeof v === "object") { Object.freeze(v); Object.values(v).forEach(freeze); } return v; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function valid(v) {
  if (!exact(v, KEYS) || v.schema !== HOST_ADVISOR_STATUS_SCHEMA || !exact(v.candidate,["commit","tree"]) || !SHA.test(v.candidate.commit) || !SHA.test(v.candidate.tree)
    || !exact(v.launch,["sessionId","launchId"]) || typeof v.launch.sessionId !== "string" || !SHA256.test(v.launch.launchId)
    || !SHA256.test(v.questionSha256) || !(v.answerSha256 === null || SHA256.test(v.answerSha256))
    || !exact(v.attempt,["agentName","count","terminal"]) || v.attempt.agentName !== "consult-advisor" || v.attempt.count !== 1 || !["answered","failed","unavailable"].includes(v.attempt.terminal)
    || !exact(v.boundary,["sandboxMode","workspaceBeforeSha256","workspaceAfterSha256","selectedSandboxAttempts","nativeAdapterAttempts"])
    || v.boundary.sandboxMode !== "read-only" || !SHA256.test(v.boundary.workspaceBeforeSha256) || !SHA256.test(v.boundary.workspaceAfterSha256)
    || v.boundary.selectedSandboxAttempts !== 0 || v.boundary.nativeAdapterAttempts !== 0 || !["answered","failed","unavailable"].includes(v.outcome)) return false;
  if (v.attempt.terminal !== v.outcome) return false;
  if (v.outcome === "answered") return v.answerSha256 !== null && v.boundary.workspaceBeforeSha256 === v.boundary.workspaceAfterSha256;
  return v.answerSha256 === null;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function createHostAdvisorStatus(input, deps = {}) {
  if (!input || typeof input !== "object") throw new Error("invalid input");
  const allowed = ["candidate","launch","questionSha256","answerSha256","workspaceBeforeSha256","workspaceAfterSha256","outcome"];
  if (Object.keys(input).some(k => !allowed.includes(k)) || !input.launch) throw new Error("invalid input");
  const launch = input.launch;
  const status = { schema: HOST_ADVISOR_STATUS_SCHEMA, candidate: { ...input.candidate }, launch: { ...launch }, questionSha256: input.questionSha256, answerSha256: input.answerSha256 ?? null, attempt: { agentName: "consult-advisor", count: 1, terminal: input.outcome }, boundary: { sandboxMode: "read-only", workspaceBeforeSha256: input.workspaceBeforeSha256, workspaceAfterSha256: input.workspaceAfterSha256, selectedSandboxAttempts: 0, nativeAdapterAttempts: 0 }, outcome: input.outcome };
  if (!valid(status)) throw new Error("invalid status");
  return freeze(status);
}

export function createHostAdvisorLaunch(sessionId, deps = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) throw new Error("invalid session id");
  const random = deps.randomBytes ?? nodeRandomBytes;
  const launchId = random(32).toString("hex");
  if (!SHA256.test(launchId)) throw new Error("invalid launch id");
  return freeze({ sessionId, launchId });
}

export function validateHostAdvisorStatus(status, expectedCandidate, expectedLaunch, expectedQuestionSha256) {
  if (!valid(status) || !same(status.candidate, expectedCandidate) || !same(status.launch, expectedLaunch) || status.questionSha256 !== expectedQuestionSha256) throw new Error("invalid or replayed host advisor status");
  return freeze(status);
}

export function sha256Canonical(value) { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }
