// SPDX-License-Identifier: SUL-1.0
// Supplemental observations, not normative sources or approval authority.
import {verifyReadinessAdvisorObservationV2} from './design-workflow-package-v2.mjs';
export function rereadReadinessAdvisorContextV2(repoRoot,observation,sources,trustedAdvisorExecutablePath=null,requireCurrentCandidate=true){
 const checked=verifyReadinessAdvisorObservationV2({repoRoot,observation,sources,trustedAdvisorExecutablePath,requireCurrentCandidate});
 if(!checked.ok)throw Error(checked.code??'readiness-advisor-context-v2-invalid');
 return checked.advisorObservation;
}
