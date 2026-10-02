// SPDX-License-Identifier: SUL-1.0
/** Source and installed acceptance remain separate. Factory ports are trusted
 * evidence readers/verifiers; a caller's JSON never establishes native proof. */
import { EXECUTION_RUNNERS, own, sha, pass, fail, digest, freeze, hostCall } from "./model-family-execution.mjs";
const OID = /^[a-f0-9]{40}$/u;
const reason = (v) => typeof v === "string" && /^[A-Z][A-Z0-9_-]{0,95}$/u.test(v);
const candidate = (v) => own(v, ["candidateCommit", "candidateTree", "designSpecSha256", "familyAuthoritySha256"])
  && typeof v.candidateCommit === "string" && OID.test(v.candidateCommit)
  && typeof v.candidateTree === "string" && OID.test(v.candidateTree) && v.candidateCommit !== v.candidateTree
  && sha(v.designSpecSha256) && sha(v.familyAuthoritySha256);
const sameBinding = (a, b) => candidate(a) && candidate(b) && digest(a) === digest(b);
const shaList = (v) => Array.isArray(v) && v.length > 0 && v.length <= 128 && v.every(sha) && new Set(v).size === v.length;
const sourceValid = (v) => own(v, ["status", "contracts", "evidenceSha256"])
  && ["passed", "failed"].includes(v.status) && sha(v.evidenceSha256)
  && Array.isArray(v.contracts) && v.contracts.length === EXECUTION_RUNNERS.length
  && new Set(v.contracts.map((x) => x?.runner)).size === EXECUTION_RUNNERS.length
  && v.contracts.every((x) => own(x, ["runner", "adapterContractSha256", "testEvidenceSha256", "sourceEvidenceSha256", "providerQualification"])
    && EXECUTION_RUNNERS.includes(x.runner) && sha(x.adapterContractSha256) && sha(x.testEvidenceSha256) && sha(x.sourceEvidenceSha256)
    && ["qualified", "unqualified"].includes(x.providerQualification));
const installedValid = (v) => own(v, ["runner", "status", "evidenceSha256", "reasonCode"])
  && EXECUTION_RUNNERS.includes(v.runner) && ["passed", "failed", "not-installed", "unqualified"].includes(v.status)
  && sha(v.evidenceSha256) && reason(v.reasonCode);

/** Pure schema inspection is not host admission or installed qualification. */
export function validateModelFamilyAcceptance(receipt) {
  try {
    if (!own(receipt, ["schema", "candidateCommit", "candidateTree", "designSpecSha256", "familyAuthoritySha256", "sourceResult", "installedResults", "independentReviewSha256s"])
      || receipt.schema !== "pipeline.model-family-acceptance.v1"
      || !candidate(Object.fromEntries(["candidateCommit", "candidateTree", "designSpecSha256", "familyAuthoritySha256"].map((k) => [k, receipt[k]])))
      || !sourceValid(receipt.sourceResult) || !Array.isArray(receipt.installedResults) || receipt.installedResults.length !== EXECUTION_RUNNERS.length
      || new Set(receipt.installedResults.map((x) => x?.runner)).size !== EXECUTION_RUNNERS.length
      || !receipt.installedResults.every(installedValid) || !shaList(receipt.independentReviewSha256s)) return fail("ACCEPTANCE_INVALID");
    return pass("ACCEPTANCE_STRUCTURAL", freeze(receipt));
  } catch { return fail("ACCEPTANCE_INVALID"); }
}

export function createModelFamilyAcceptanceHost({ readSourceResult, readInstalledResult,
  verifyIndependentReviews, verifyInstalledQualification = () => fail("INSTALLED_QUALIFICATION_UNAVAILABLE") } = {}) {
  const admitted = new WeakMap();
  return Object.freeze({
    async assessModelFamilyAcceptance({ candidateCommit, candidateTree, designSpecSha256, familyAuthoritySha256,
      independentReviewSha256s } = {}) {
      try {
        const binding = { candidateCommit, candidateTree, designSpecSha256, familyAuthoritySha256 };
        if (!candidate(binding) || !shaList(independentReviewSha256s)) return fail("ACCEPTANCE_BINDING_INVALID");
        const reviews = await hostCall(verifyIndependentReviews, { binding: freeze(binding), independentReviewSha256s: freeze(independentReviewSha256s) });
        if (!reviews.ok) return reviews;
        if (!own(reviews.value, ["bindingSha256", "independentReviewSha256s"]) || reviews.value.bindingSha256 !== digest(binding)
          || digest(reviews.value.independentReviewSha256s) !== digest(independentReviewSha256s)) return fail("INDEPENDENT_REVIEW_UNVERIFIED");
        const read = await hostCall(readSourceResult, { binding: freeze(binding) }); if (!read.ok) return read;
        if (!own(read.value, ["binding", "sourceResult"]) || !sameBinding(read.value.binding, binding) || !sourceValid(read.value.sourceResult))
          return fail("SOURCE_ACCEPTANCE_UNVERIFIED");
        if (read.value.sourceResult.status !== "passed") return fail("SOURCE_ACCEPTANCE_FAILED");
        const source = freeze(read.value.sourceResult), installed = [];
        for (const runner of EXECUTION_RUNNERS) {
          const r = await hostCall(readInstalledResult, { binding: freeze(binding), runner }); if (!r.ok) return r;
          if (!own(r.value, ["binding", "result", "evidenceKind"]) || !sameBinding(r.value.binding, binding)
            || !installedValid(r.value.result) || r.value.result.runner !== runner
            || !["native", "synthetic", "absent", "unqualified"].includes(r.value.evidenceKind)) return fail("INSTALLED_EVIDENCE_UNVERIFIED");
          let row = freeze(r.value.result);
          if (row.status === "passed") {
            if (r.value.evidenceKind !== "native") row = freeze({ ...row, status: "unqualified", reasonCode: "SYNTHETIC_OR_UNQUALIFIED_EVIDENCE" });
            else if (source.contracts.find((x) => x.runner === runner).providerQualification !== "qualified")
              row = freeze({ ...row, status: "unqualified", reasonCode: "ADAPTER_CONTRACT_UNQUALIFIED" });
            else {
              const q = await hostCall(verifyInstalledQualification, { binding: freeze(binding), runner, result: row,
                adapterContractSha256: source.contracts.find((x) => x.runner === runner).adapterContractSha256 });
              if (!q.ok) row = freeze({ ...row, status: "unqualified", reasonCode: "INSTALLED_QUALIFICATION_UNAVAILABLE" });
              else if (!own(q.value, ["runner", "bindingSha256", "evidenceSha256", "adapterContractSha256"])
                || q.value.runner !== runner || q.value.bindingSha256 !== digest(binding)
                || q.value.evidenceSha256 !== row.evidenceSha256
                || q.value.adapterContractSha256 !== source.contracts.find((x) => x.runner === runner).adapterContractSha256)
                return fail("INSTALLED_QUALIFICATION_UNVERIFIED");
            }
          }
          if (row.status === "not-installed" && r.value.evidenceKind !== "absent") return fail("INSTALLATION_ABSENCE_UNVERIFIED");
          installed.push(row);
        }
        const receipt = freeze({ schema: "pipeline.model-family-acceptance.v1", ...binding, sourceResult: source,
          installedResults: installed, independentReviewSha256s });
        const valid = validateModelFamilyAcceptance(receipt); if (!valid.ok) return valid;
        const handle = Object.freeze(Object.create(null)); admitted.set(handle, receipt);
        return pass("SOURCE_AND_INSTALLED_ACCEPTANCE_RECORDED", handle);
      } catch { return fail("ACCEPTANCE_INPUT_INVALID"); }
    },
    readAcceptance(handle) { const receipt = admitted.get(handle);
      return receipt ? pass("ACCEPTANCE_READ", receipt) : fail("ACCEPTANCE_HANDLE_REQUIRED"); },
  });
}
