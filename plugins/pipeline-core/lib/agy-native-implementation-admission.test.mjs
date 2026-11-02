// SPDX-License-Identifier: SUL-1.0
// Criterion-bound cases for the native Antigravity implementation admission (AC-108 closest accepted criterion): deny by default, admit only
// under a stored v1 session consent whose SIGNED scope carries a nativeImplementation grant. All dependencies are injected; the hook payload's
// session id being the parent's is an UNMEASURED assumption (no real Antigravity run was made).
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNativeImplementationAdmission, NATIVE_IMPLEMENTATION_SCOPE_SCHEMA } from "./agy-native-implementation-admission.mjs";

const SHA = "a".repeat(64);
const IMPL = (extra = {}) => ({ TypeName: "pipeline-core:goldfish-implementor", Model: "flash", Prompt: "x", ...extra });
const grant = (models = ["flash"]) => ({ schema: NATIVE_IMPLEMENTATION_SCOPE_SCHEMA, models });
const record = ({ scope = { nativeImplementation: grant() }, roles = ["pipeline-core:goldfish-implementor"], schema = "pipeline.agy-session-consent.v1" } = {}) => ({
  schema, subjectSha256: "b".repeat(64), subject: { roles, scope },
});
function deps(overrides = {}) {
  return {
    loadSessionDescriptor: () => ({ descriptorSha256: SHA, repo: { primaryRoot: "r" } }),
    loadLiveSession: () => ({ ok: true, session: { id: "s1", descriptorSha256: SHA }, descriptor: { repo: { primaryRoot: "r" } } }),
    loadStoredConsent: () => ({ descriptor: { repo: { primaryRoot: "r" } }, record: record() }),
    validateConsentRecord: () => ({ ok: true, mode: "signature" }),
    ...overrides,
  };
}
const call = (args = {}, d = deps()) => evaluateNativeImplementationAdmission({ root: "/r", hookSessionId: "s1", subagents: [IMPL()], ...args }, d);

test("a call naming no implementation role needs no admission", () => {
  const result = call({ subagents: [{ TypeName: "pipeline-core:critic", Model: "pro" }] });
  assert.equal(result.ok, true);
  assert.equal(result.implementation, 0);
});

test("deny 1: a payload without a session is refused before any lookup", () => {
  const boom = () => { throw new Error("must not be reached"); };
  const d = deps({ loadSessionDescriptor: boom, loadLiveSession: boom, loadStoredConsent: boom });
  for (const hookSessionId of [undefined, "", null]) {
    const result = call({ hookSessionId }, d);
    assert.equal(result.ok, false);
    assert.equal(result.code, "AGY-NATIVE-SESSION-UNIDENTIFIED");
  }
  assert.equal(call({ root: null }).code, "AGY-NATIVE-SESSION-UNIDENTIFIED");
});

test("deny 2: an unknown session descriptor is refused", () => {
  const result = call({}, deps({ loadSessionDescriptor: () => { throw new Error("none"); } }));
  assert.deepEqual([result.ok, result.code], [false, "AGY-NATIVE-SESSION-UNKNOWN"]);
});

test("deny 3: a session whose owner is not live is refused with the owner code", () => {
  const dead = call({}, deps({ loadLiveSession: () => ({ ok: false, code: "AGY-SESSION-OWNER-DEAD" }) }));
  assert.deepEqual([dead.ok, dead.code], [false, "AGY-SESSION-OWNER-DEAD"]);
  const thrown = call({}, deps({ loadLiveSession: () => { throw new Error("x"); } }));
  assert.deepEqual([thrown.ok, thrown.code], [false, "AGY-SESSION-OWNER-UNAVAILABLE"]);
});

test("deny 4: a missing or unreadable stored consent is refused", () => {
  const none = call({}, deps({ loadStoredConsent: () => ({ record: null }) }));
  assert.deepEqual([none.ok, none.code], [false, "AGY-SESSION-CONSENT-REQUIRED"]);
  const thrown = call({}, deps({ loadStoredConsent: () => { throw new Error("x"); } }));
  assert.deepEqual([thrown.ok, thrown.code], [false, "AGY-SESSION-CONSENT-UNAVAILABLE"]);
});

test("deny 5: a model-family (v2) consent is refused", () => {
  const result = call({}, deps({ loadStoredConsent: () => ({ record: record({ schema: "pipeline.agy-session-consent.v2" }) }) }));
  assert.deepEqual([result.ok, result.code], [false, "AGY-NATIVE-CONSENT-FAMILY-UNSUPPORTED"]);
});

test("deny 6: a consent that does not validate is refused with the validator code", () => {
  const result = call({}, deps({ validateConsentRecord: () => ({ ok: false, code: "AGY-CONSENT-PROOF-MISSING" }) }));
  assert.deepEqual([result.ok, result.code], [false, "AGY-CONSENT-PROOF-MISSING"]);
});

test("deny 7: a signed scope without a valid nativeImplementation grant is refused", () => {
  const scopes = [
    {},
    { nativeImplementation: { schema: "wrong", models: ["flash"] } },
    { nativeImplementation: { schema: NATIVE_IMPLEMENTATION_SCOPE_SCHEMA, models: [] } },
    { nativeImplementation: { schema: NATIVE_IMPLEMENTATION_SCOPE_SCHEMA, models: ["gemini-3.8-flash-high"] } },
    { nativeImplementation: { schema: NATIVE_IMPLEMENTATION_SCOPE_SCHEMA } },
  ];
  for (const scope of scopes) {
    const result = call({}, deps({ loadStoredConsent: () => ({ record: record({ scope }) }) }));
    assert.deepEqual([result.ok, result.code], [false, "AGY-NATIVE-SCOPE-NOT-GRANTED"], JSON.stringify(scope));
  }
});

test("deny 8: a role outside the signed role list is refused", () => {
  const result = call({ subagents: [IMPL({ TypeName: "pipeline-core:goldfish-mechanic" })] });
  assert.deepEqual([result.ok, result.code], [false, "AGY-CONSENT-ROLE-MISMATCH"]);
});

test("deny 9: a Model alias outside the grant is refused", () => {
  for (const Model of ["pro", undefined]) {
    const result = call({ subagents: [IMPL({ Model })] });
    assert.deepEqual([result.ok, result.code], [false, "AGY-NATIVE-MODEL-NOT-GRANTED"]);
  }
});

test("deny order: the first failing reason wins when several fail", () => {
  const d = deps({ loadSessionDescriptor: () => { throw new Error("none"); }, loadStoredConsent: () => ({ record: null }) });
  assert.equal(call({}, d).code, "AGY-NATIVE-SESSION-UNKNOWN");
});

test("admit: a live session with a valid v1 consent carrying a grant for the role and Model", () => {
  const seen = [];
  const d = deps({ validateConsentRecord: (rec, opts) => { seen.push(opts.session.id); return { ok: true }; } });
  const result = call({ subagents: [IMPL(), { TypeName: "pipeline-core:critic", Model: "pro" }] }, d);
  assert.equal(result.ok, true);
  assert.equal(result.implementation, 1);
  assert.equal(result.assurance, "unmeasured-hook-session-id");
  assert.equal(result.sessionId, "s1");
  assert.equal(result.consentSubjectSha256, "b".repeat(64));
  assert.deepEqual(seen, ["s1"]);
});

test("admit: the bare role name and a granted second alias are accepted", () => {
  const rec = record({ scope: { nativeImplementation: grant(["flash", "pro"]) } });
  const result = call({ subagents: [IMPL({ TypeName: "goldfish-implementor", Model: "pro" })] }, deps({ loadStoredConsent: () => ({ record: rec }) }));
  assert.equal(result.ok, true);
});
