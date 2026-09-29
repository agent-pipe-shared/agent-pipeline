// SPDX-License-Identifier: SUL-1.0
/** Source-owned no-child capability for the unsupported native initial contract.
 * The existing native bridge remains a historical v1 transport. It has no
 * independently observed answer/proposal store for initial-five-sources.v1.
 * This capability never invokes it, exports a prompt, or asserts host identity.
 */
import {freezeCourseJson,designAdvisorValueSha256} from './design-advisor-course.mjs';
import {loadRunnerProfilesV3Registry} from './runner-profiles-v3.mjs';
const brands=new WeakMap();
export const isNativeInitialAdvisorExecution=value=>brands.has(value);
export const nativeInitialAdvisorRunner=value=>brands.get(value)?.runner??null;
export function nativeInitialAdvisorNoChildRoute({runner,registry=loadRunnerProfilesV3Registry()}={}){
 if(!['claude','antigravity'].includes(runner))throw new TypeError('NIA-RUNNER');
 return freezeCourseJson({slot:0,routeStepSha256:designAdvisorValueSha256({runner,kind:'initial-provenance-unavailable',registrySha256:designAdvisorValueSha256(registry)})});
}
export function createNativeInitialAdvisorExecution({runner}={}){
 nativeInitialAdvisorNoChildRoute({runner});
 const state={runner,lastAdmission:null,noChild:null};
 const execution=Object.freeze({
  getAdmission:()=>state.lastAdmission,
  async admitSourceMetadata(args){
   const route=args?.route,registrySha256=designAdvisorValueSha256(loadRunnerProfilesV3Registry());
   const valid=route?.model===null&&route?.effort===null&&route?.sourceSha256===registrySha256&&route?.candidateCommit===args?.candidate?.commit;
   return state.lastAdmission=freezeCourseJson({status:valid?'admitted':'refused',code:valid?'native-initial-local-metadata-only':'native-initial-route-drift'});
  },
  async prepareInitial(args){state.noChild=freezeCourseJson({courseBinding:{courseId:args.courseBinding.courseId,initialContextSha256:args.courseBinding.initialContextSha256,reservationId:args.courseBinding.reservationId},outcome:'unavailable',code:'native-initial-answer-provenance-unavailable',childStarted:false,inputSubmitted:false,attemptCount:0});return {ok:false,code:state.noChild.code,preparedRequest:null};},
  observeNoChild(binding){return state.noChild&&designAdvisorValueSha256(binding)===designAdvisorValueSha256(state.noChild.courseBinding)?state.noChild:null;},
 });
 brands.set(execution,state);return execution;
}
