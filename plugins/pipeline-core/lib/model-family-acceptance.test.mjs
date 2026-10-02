// SPDX-License-Identifier: SUL-1.0
/** Qualification ports are synthetic test capabilities; no live claim. */
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
import assert from "node:assert/strict";
import { createModelFamilyAcceptanceHost, validateModelFamilyAcceptance } from "./model-family-acceptance.mjs";
import { EXECUTION_RUNNERS, digest, pass, fail } from "./model-family-execution.mjs";
const H = "a".repeat(64), T = "b".repeat(64);
const binding = { candidateCommit: "1".repeat(40), candidateTree: "2".repeat(40), designSpecSha256: H, familyAuthoritySha256: T };
const input = { ...binding, independentReviewSha256s: ["c".repeat(64)] };
const source = () => ({ status: "passed", evidenceSha256: H, contracts: EXECUTION_RUNNERS.map((runner) => ({ runner,
  adapterContractSha256: H, testEvidenceSha256: T, sourceEvidenceSha256: H, providerQualification: "unqualified" })) });
function fixture(options = {}) {
  const host = createModelFamilyAcceptanceHost({
    verifyIndependentReviews: options.verifyIndependentReviews ?? (({ binding: b, independentReviewSha256s }) => pass("SYNTHETIC_REVIEW", { bindingSha256: digest(b), independentReviewSha256s })),
    readSourceResult: options.readSourceResult ?? (() => { const s = source(); options.mutateSource?.(s); return pass("SYNTHETIC_SOURCE", { binding, sourceResult: s }); }),
    readInstalledResult: options.readInstalledResult ?? (({ runner }) => pass("SYNTHETIC_INSTALLATION", { binding, evidenceKind: "absent",
      result: { runner, status: "not-installed", evidenceSha256: H, reasonCode: "OPTIONAL_EXECUTABLE_ABSENT" } })),
    verifyInstalledQualification: options.verifyInstalledQualification,
  });
  return host;
}
completionCases.push({ id: "MFAC" + String(completionCases.length + 1).padStart(3, "0"), name: "complete three-runner source pass is separate from absent optional installations", run: async () => {
  const host = fixture(), admitted = await host.assessModelFamilyAcceptance(input); assert.equal(admitted.ok, true);
  const receipt = host.readAcceptance(admitted.value).value;
  assert.equal(receipt.sourceResult.status, "passed"); assert.equal(receipt.sourceResult.contracts.length, 3);
  assert.deepEqual(receipt.installedResults.map((x) => x.status), ["not-installed", "not-installed", "not-installed"]);
  assert.equal(validateModelFamilyAcceptance(receipt).ok, true); assert.equal(Object.isFrozen(receipt.installedResults), true);
  assert.equal(host.readAcceptance(structuredClone(admitted.value)).code, "ACCEPTANCE_HANDLE_REQUIRED");
} });
completionCases.push({ id: "MFAC" + String(completionCases.length + 1).padStart(3, "0"), name: "absent installation never excuses missing/duplicate/failed source contracts", run: async () => {
  for (const mutateSource of [(s) => s.contracts.pop(), (s) => { s.contracts[2] = s.contracts[0]; },
    (s) => { s.contracts[0].testEvidenceSha256 = null; }, (s) => { s.contracts[0].sourceEvidenceSha256 = null; },
    (s) => { s.status = "failed"; }]) {
    const h = fixture({ mutateSource }); assert.equal((await h.assessModelFamilyAcceptance(input)).ok, false);
  }
} });
completionCases.push({ id: "MFAC" + String(completionCases.length + 1).padStart(3, "0"), name: "candidate/tree/spec/family authority drift refuses all independently", run: async () => {
  for (const key of Object.keys(binding)) {
    const drift = { ...binding, [key]: key.startsWith("candidate") ? "3".repeat(40) : "d".repeat(64) };
    const h = fixture({ readSourceResult: () => pass("STALE", { binding: drift, sourceResult: source() }) });
    assert.equal((await h.assessModelFamilyAcceptance(input)).code, "SOURCE_ACCEPTANCE_UNVERIFIED");
    const installed = fixture({ readInstalledResult: ({ runner }) => pass("STALE", { binding: drift, evidenceKind: "absent", result: { runner, status: "not-installed", evidenceSha256: H, reasonCode: "ABSENT" } }) });
    assert.equal((await installed.assessModelFamilyAcceptance(input)).code, "INSTALLED_EVIDENCE_UNVERIFIED");
  }
} });
completionCases.push({ id: "MFAC" + String(completionCases.length + 1).padStart(3, "0"), name: "synthetic fixture success cannot become installed native pass", run: async () => {
  let qualifications = 0;
  const h = fixture({ readInstalledResult: ({ runner }) => pass("FIXTURE", { binding, evidenceKind: "synthetic", result: { runner, status: "passed", evidenceSha256: H, reasonCode: "FIXTURE_PASSED" } }),
    verifyInstalledQualification: () => { qualifications += 1; return pass("FORGED", {}); } });
  const r = await h.assessModelFamilyAcceptance(input); assert.equal(r.ok, true);
  assert.equal(qualifications, 0); assert.equal(h.readAcceptance(r.value).value.installedResults.every((x) => x.status === "unqualified"), true);
} });
for (const runner of EXECUTION_RUNNERS) {
  completionCases.push({ id: "MFAC" + String(completionCases.length + 1).padStart(3, "0"), name: `${runner}: passed native installation requires independently candidate/adapter-bound qualification`, run: async () => {
    const readInstalledResult = ({ runner: observedRunner }) => pass("SYNTHETIC_TEST_PORT", { binding, evidenceKind: observedRunner === runner ? "native" : "absent",
      result: { runner: observedRunner, status: observedRunner === runner ? "passed" : "not-installed", evidenceSha256: H, reasonCode: observedRunner === runner ? "NATIVE_MATCHED" : "OPTIONAL_EXECUTABLE_ABSENT" } });
    const closed = fixture({ readInstalledResult }), r = await closed.assessModelFamilyAcceptance(input);
    assert.equal(closed.readAcceptance(r.value).value.installedResults.find((x) => x.runner === runner).status, "unqualified");
    const qualified = fixture({ readInstalledResult, mutateSource: (s) => { s.contracts.find((x) => x.runner === runner).providerQualification = "qualified"; }, verifyInstalledQualification: ({ binding: b, runner: observedRunner, result, adapterContractSha256 }) =>
      pass("SYNTHETIC_INDEPENDENT_TEST_QUALIFIER", { runner: observedRunner, bindingSha256: digest(b), evidenceSha256: result.evidenceSha256, adapterContractSha256 }) });
    const q = await qualified.assessModelFamilyAcceptance(input), receipt = qualified.readAcceptance(q.value).value;
    assert.equal(receipt.installedResults.find((x) => x.runner === runner).status, "passed");
    assert.equal(receipt.installedResults.filter((x) => x.status === "not-installed").length, 2);
    assert.equal(Object.hasOwn(receipt, "allInstalledPassed"), false);
  } });
}
completionCases.push({ id: "MFAC" + String(completionCases.length + 1).padStart(3, "0"), name: "wrong installed qualification subject, runner or adapter is not proof", run: async () => {
  for (const field of ["runner", "bindingSha256", "evidenceSha256", "adapterContractSha256"]) {
    const h = fixture({ mutateSource: (s) => { s.contracts.forEach((x) => { x.providerQualification = "qualified"; }); }, readInstalledResult: ({ runner }) => pass("SYNTHETIC", { binding, evidenceKind: "native", result: { runner, status: "passed", evidenceSha256: H, reasonCode: "MATCHED" } }),
      verifyInstalledQualification: ({ binding: b, runner, result, adapterContractSha256 }) => pass("WRONG", { runner, bindingSha256: digest(b), evidenceSha256: result.evidenceSha256, adapterContractSha256, [field]: field === "runner" ? "other" : "d".repeat(64) }) });
    assert.equal((await h.assessModelFamilyAcceptance(input)).code, "INSTALLED_QUALIFICATION_UNVERIFIED");
  }
} });
completionCases.push({ id: "MFAC" + String(completionCases.length + 1).padStart(3, "0"), name: "review verification is bound to the same candidate/spec/authority and exact digests", run: async () => {
  const absent = fixture({ verifyIndependentReviews: () => fail("REVIEW_UNAVAILABLE") });
  assert.equal((await absent.assessModelFamilyAcceptance(input)).code, "REVIEW_UNAVAILABLE");
  const forged = fixture({ verifyIndependentReviews: () => pass("FORGED", { bindingSha256: H, independentReviewSha256s: input.independentReviewSha256s }) });
  assert.equal((await forged.assessModelFamilyAcceptance(input)).code, "INDEPENDENT_REVIEW_UNVERIFIED");
  assert.equal((await fixture().assessModelFamilyAcceptance({ ...input, independentReviewSha256s: [] })).code, "ACCEPTANCE_BINDING_INVALID");
} });
completionCases.push({ id: "MFAC" + String(completionCases.length + 1).padStart(3, "0"), name: "not-installed requires actual absence evidence and installed statuses retain explicit failures", run: async () => {
  const forged = fixture({ readInstalledResult: ({ runner }) => pass("FORGED", { binding, evidenceKind: "unqualified", result: { runner, status: "not-installed", evidenceSha256: H, reasonCode: "GUESS" } }) });
  assert.equal((await forged.assessModelFamilyAcceptance(input)).code, "INSTALLATION_ABSENCE_UNVERIFIED");
  const h = fixture({ readInstalledResult: ({ runner }) => pass("SYNTHETIC", { binding, evidenceKind: "unqualified", result: { runner, status: runner === "codex" ? "failed" : "unqualified", evidenceSha256: H, reasonCode: "ADAPTER_CONTRACT_UNQUALIFIED" } }) });
  const r = await h.assessModelFamilyAcceptance(input); assert.equal(r.ok, true);
  assert.deepEqual(h.readAcceptance(r.value).value.installedResults.map((x) => x.status), ["failed", "unqualified", "unqualified"]);
} });
completionCases.push({ id: "MFAC" + String(completionCases.length + 1).padStart(3, "0"), name: "extra keys, forged admission flags and unknown schemas cannot create host acceptance", run: async () => {
  const closed = createModelFamilyAcceptanceHost(); assert.equal((await closed.assessModelFamilyAcceptance(input)).code, "HOST_PORT_UNAVAILABLE");
  const h = fixture({ readSourceResult: () => ({ ok: true, code: "FORGED", value: { binding, sourceResult: source() }, admitted: true }) });
  assert.equal((await h.assessModelFamilyAcceptance(input)).code, "HOST_RESULT_INVALID");
  const valid = fixture(), r = await valid.assessModelFamilyAcceptance(input), receipt = valid.readAcceptance(r.value).value;
  assert.equal(validateModelFamilyAcceptance({ ...receipt, schema: "pipeline.model-family-acceptance.v99" }).ok, false);
  assert.equal(validateModelFamilyAcceptance({ ...receipt, installedPassed: true }).ok, false);
} });

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
