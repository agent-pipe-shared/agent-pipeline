// SPDX-License-Identifier: SUL-1.0
/** Closed PHX-4 agent assumptions/selection payload; observational only. */
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u, CODE=/^[A-Z][A-Z0-9._:-]{0,127}$/u, SHA=/^[a-f0-9]{64}$/u;
const KINDS=new Set(["assumption","selection","verification-scope","fallback","escalation"]), STATES=new Set(["declared","verified","contradicted","expired","invalidated","superseded"]);
export class AgentDecisionJournalError extends Error { constructor(code){super("Agent decision event is invalid.");this.code=code;} }
const rec=(v)=>v!==null&&typeof v==="object"&&!Array.isArray(v), exact=(v,k)=>rec(v)&&Object.keys(v).length===k.length&&k.every((x)=>Object.hasOwn(v,x)); const fail=(c)=>{throw new AgentDecisionJournalError(c);};
/** Admits only bounded reason codes/digests; this record can never grant authority. */
export function validateAgentDecisionEvent(value) {
  const keys=["eventId","kind","state","reasonCode","candidateDigest","relatedHumanDecisionId","supersedesEventId"];
  if(!exact(value,keys)||!ID.test(value.eventId)||!KINDS.has(value.kind)||!STATES.has(value.state)||!CODE.test(value.reasonCode)||!SHA.test(value.candidateDigest)||(value.relatedHumanDecisionId!==null&&(!ID.test(value.relatedHumanDecisionId)))||(value.supersedesEventId!==null&&!ID.test(value.supersedesEventId)))fail("ADJ-SHAPE");
  if(value.state==="superseded"&&value.supersedesEventId===null)fail("ADJ-SUPERSESSION");
  return Object.freeze({...value});
}
