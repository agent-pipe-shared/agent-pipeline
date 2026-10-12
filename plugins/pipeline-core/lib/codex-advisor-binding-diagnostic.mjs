// SPDX-License-Identifier: SUL-1.0
// Closed diagnostic-only projection. No files, environment, identifiers or authority.
export const ADVISOR_BINDING_DIAGNOSTIC_SCHEMA='pipeline.codex-advisor-binding-diagnostic.v1';
const checks=Object.freeze([
 'store-create','store-receipt','store-roots-before','store-directory','store-intent','store-historical-executable',
 'store-finalization-readback','store-roots-after','store-initial-binding','store-exception','observation-handle',
 'projection-readback','report-outcome','report-contract','report-digest','answer-digest','proposal-digest','receipt-binding','report-exception',
 'binding-result','finalization-directory','finalization-file-identity','finalization-file-open','finalization-file-readback',
 'finalization-file-json','finalization-readback','finalization-contract','finalization-initial-binding','finalization-intent',
 'finalization-request','finalization-ownership','finalization-exception','ownership-expected','ownership-journal-readback',
 'ownership-recovery','ownership-intent','ownership-schemas','ownership-launcher','ownership-admission','ownership-worker',
 'ownership-child-execution','ownership-terminal','ownership-exception','source-provenance',
 'ownership-journal-intent','ownership-journal-launcher','ownership-journal-admission','ownership-journal-child-intent',
 'ownership-journal-worker','ownership-journal-child','ownership-journal-exec-admission','ownership-journal-execution','ownership-journal-terminal'
]);
const causes=Object.freeze([
 'host-journal-directory-unsafe','host-journal-file-unsafe','host-journal-file-changed','host-journal-noncanonical',
 'host-session-ownership-unverified','host-process-platform-unavailable','host-process-identity-changed',
 'advisor-store-root-invalid','advisor-store-trusted-executable-unavailable','advisor-store-private-root-invalid',
 'advisor-store-topology-drift','advisor-store-root-drift','advisor-store-executable-drift','host-executable-invalid',
 'advisor-initial-input-invalid','DAP-PHYSICAL-INPUT','DAP-PHYSICAL-PARENT','DAP-PHYSICAL-ESCAPE','DAP-PHYSICAL-FILE',
 'DAP-PHYSICAL-OPEN','DAP-PHYSICAL-BOUND','DAP-PHYSICAL-DRIFT','DAP-PHYSICAL-PARENT-DRIFT','DAP-UTF8'
]);
function causeOf(value){
 try{for(const candidate of [value,typeof value==='object'&&value!==null?value.code:null,typeof value==='object'&&value!==null?value.message:null])if(typeof candidate==='string'&&causes.includes(candidate))return candidate;}catch{}
 return null;
}
function diagnostic(subcheck,error){
 const check=checks.includes(subcheck)?subcheck:'binding-result',cause=causeOf(error)??'advisor-binding-'+check;
 const retry=cause==='DAP-PHYSICAL-PARENT-DRIFT'||cause==='host-journal-file-changed';
 return Object.freeze({schema:ADVISOR_BINDING_DIAGNOSTIC_SCHEMA,subcheck:check,cause,
  repair:Object.freeze({kind:retry?'repeat-bounded-read':'revalidate-owned-evidence',automatic:false,authority:'diagnostic-only'})});
}
/** Retains only the first failure within one synchronous verification operation. */
export function createAdvisorBindingDiagnosticRecorder(){let first=null;return Object.freeze({
 record(subcheck,error){if(first===null)first=diagnostic(subcheck,error);return null;},
 snapshot(){return first;}
});}
/** Reconstruct a closed projection; foreign objects never cross the boundary. */
export function projectAdvisorBindingDiagnostic(value){
 try{if(!value||value.schema!==ADVISOR_BINDING_DIAGNOSTIC_SCHEMA||!checks.includes(value.subcheck))return null;
  const projected=diagnostic(value.subcheck,value.cause);return projected.cause===value.cause?projected:null;
 }catch{return null;}
}
