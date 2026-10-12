// SPDX-License-Identifier: SUL-1.0
// Committed-state course validation; no claim of reader identity or semantic completeness.
import {parseStrictJson} from '../../plugins/pipeline-core/lib/governance-event.mjs';
export const TERMINAL_READER_SCHEMA='pipeline.doc-reader-terminal-record.v1';
export const parseTerminalReaderRecord=bytes=>JSON.parse(JSON.stringify(parseStrictJson(bytes)));
const sha=/^[a-f0-9]{64}$/,oid=/^[a-f0-9]{40}$/,id=/^[a-z0-9][a-z0-9-]{0,62}$/;
const findingId=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
export function verifyTerminalReaderCourse({root,candidateCommit,featureId,record,api}){
  const fail=message=>{throw new api.ReaderBindingError('binding','terminal Reader: '+message);};
  const closed=(value,keys,label)=>{if(!exact(value,keys))fail(label+' field set');};
  const ancestor=(before,after)=>{if(!oid.test(before??'')||!oid.test(after??'')||api.git(root,['merge-base','--is-ancestor',before,after],'utf8').status!==0)fail('commit ancestry');};
  const snapshot=(value,historical=false)=>{
    closed(value,['commit','tree','coverage','inputs','docsetSha256'],'snapshot');
    if(!oid.test(value.commit??'')||!oid.test(value.tree??''))fail('snapshot identity');
    const actual=(historical?api.snapshotHistoricalReaderDocumentation:api.snapshotReaderDocumentation)({root,candidate:value.commit,featureId});
    if(api.gitTree(root,value.commit)!==value.tree||!api.sameJson(actual.coverage,value.coverage)
      ||!api.sameJson(actual.inputs,value.inputs)||actual.docsetSha256!==value.docsetSha256)fail('snapshot digest mismatch');
    return actual;
  };
  const blobRef=(ref,path,limit,label)=>{
    closed(ref,['path','sha256'],label);if(ref.path!==path||!sha.test(ref.sha256??''))fail(label+' reference');
    const bytes=api.readBlob(root,candidateCommit,path,limit);if(api.sha256(bytes)!==ref.sha256)fail(label+' digest mismatch');
    return bytes;
  };
  const jsonRef=(ref,path,limit,label)=>{
    const bytes=blobRef(ref,path,limit,label);
    try{return parseTerminalReaderRecord(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(label+' JSON');}
  };
  const report=(ref,path,label,reviewedCommit,upper)=>{
    closed(ref,['path','sha256','publication'],label);
    closed(ref.publication,['kind','rawSha256'],label+' publication');
    if(!['raw','path-normalized'].includes(ref.publication.kind)||!sha.test(ref.publication.rawSha256??''))fail(label+' provenance');
    if(ref.publication.kind==='raw'&&ref.publication.rawSha256!==ref.sha256)fail(label+' raw digest');
    const bytes=blobRef({path:ref.path,sha256:ref.sha256},path,1024*1024,label);
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail(label+' UTF-8');}
    if(!text.trim())fail(label+' empty');
    const introduced=api.git(root,['log','--format=%H','--diff-filter=A',candidateCommit,'--',path],'utf8');
    const commits=introduced.stdout.trim()?introduced.stdout.trim().split('\n'):[];
    if(introduced.status!==0||commits.length!==1)fail(label+' immutable publication history');
    // Endpoint equality cannot erase a committed overwrite followed by a
    // restoration. Inspect every reachable change, including side branches.
    const changes=api.git(root,['log','--full-history','--no-renames','--format=%H',candidateCommit,'--',path],'utf8');
    const changeCommits=changes.stdout.trim()?changes.stdout.trim().split('\n'):[];
    if(changes.status!==0||changeCommits.length!==1||changeCommits[0]!==commits[0])fail(label+' immutable report changed');
    ancestor(reviewedCommit,commits[0]);ancestor(commits[0],upper);
    if(commits[0]===reviewedCommit||!api.readBlob(root,commits[0],path,1024*1024).equals(bytes))fail(label+' immutable report changed');
  };
  closed(record,['schema','courseId','rounds','correctionBatches','ownerDecision','final','policyTransition'],'record');
  if(record.schema!==TERMINAL_READER_SCHEMA||!id.test(record.courseId??'')||!Array.isArray(record.rounds)||record.rounds.length!==4
    ||!Array.isArray(record.correctionBatches)||record.correctionBatches.length!==4)fail('bounded 2+2 course');
  const prefix=`specs/${featureId}/evidence/reader-review/`;
  const owner=jsonRef(record.ownerDecision,prefix+'owner-decision.json',65536,'owner decision');
  closed(owner,['schema','courseId','authority','by','decision','maxRounds','maxCorrectionBatches','prohibitFifthReview','fourthReviewedCommit','acceptedFindingIds','source'],'owner decision');
  if(owner.schema!=='pipeline.doc-reader-terminal-owner-decision.v1'||owner.courseId!==record.courseId||owner.authority!=='documentation-owner'
    ||typeof owner.by!=='string'||!owner.by.trim()||owner.by.length>120||owner.decision!=='authorize-terminal-correction'
    ||owner.maxRounds!==4||owner.maxCorrectionBatches!==4||owner.prohibitFifthReview!==true
    ||!Array.isArray(owner.acceptedFindingIds)||owner.acceptedFindingIds.length>256
    ||new Set(owner.acceptedFindingIds).size!==owner.acceptedFindingIds.length)fail('owner course authority');
  const policySources=['harness/reader-review-protocol.md','plugins/pipeline-core/skills/reader-review/SKILL.md'];
  if(typeof owner.source?.path!=='string'||!(policySources.includes(owner.source.path)||(owner.source.path.startsWith(prefix)
    &&/^[a-z0-9][a-z0-9-]{0,95}\.md$/.test(owner.source.path.slice(prefix.length)))))fail('owner decision source path');
  blobRef(owner.source,owner.source.path,65536,'owner decision source');
  const roundIds=new Set(),expectedPaths=new Set(),allCommits=new Set(),accepted=new Set();
  snapshot(record.final);ancestor(record.final.commit,candidateCommit);
  const finalNow=api.snapshotReaderDocumentation({root,candidate:candidateCommit,featureId});
  if(record.final.docsetSha256!==finalNow.docsetSha256||!api.sameJson(record.final.coverage,finalNow.coverage)
    ||!api.sameJson(record.final.inputs,finalNow.inputs))fail('post-closure document or input drift');
  for(let index=0;index<4;index++){
    const round=record.rounds[index],batch=record.correctionBatches[index];
    closed(round,['id','mode','reviewed','phaseOne','phaseTwo','disposition'],'round');
    if(!id.test(round.id??'')||roundIds.has(round.id)||!(index%2===0?['complete']:['complete','corrections-only']).includes(round.mode))fail('round ordering or mode');
    roundIds.add(round.id);snapshot(round.reviewed,true);
    closed(batch,['afterRound','commits'],'correction batch');
    if(batch.afterRound!==index+1||!Array.isArray(batch.commits)||batch.commits.length<1||batch.commits.length>32)fail('correction batch bound');
    const upper=index===3?record.final.commit:record.rounds[index+1].reviewed.commit;
    ancestor(round.reviewed.commit,upper);let previous=round.reviewed.commit;
    for(const commit of batch.commits){
      if(commit===previous||allCommits.has(commit))fail('duplicate or pre-review correction');
      ancestor(previous,commit);ancestor(commit,upper);allCommits.add(commit);previous=commit;
    }
    const changed=api.git(root,['log','--format=%H',`${round.reviewed.commit}..${upper}`,'--',...api.READER_REVIEW_PATHS,...api.READER_REVIEW_INPUT_PATHS],'utf8');
    if(changed.status!==0)fail('correction history unavailable');
    const changeCommits=changed.stdout.trim()?changed.stdout.trim().split('\n'):[];
    if(changeCommits.length>32||!api.sameJson([...new Set(changeCommits)].sort(),[...batch.commits].sort()))fail('unlisted correction or input change');
    for(const [field,phase] of [['phaseOne','phase-one'],['phaseTwo','phase-two']]){
      const path=prefix+phase+'/'+round.id+'.md';expectedPaths.add(path);report(round[field],path,field,round.reviewed.commit,upper);
    }
    const path=prefix+'disposition/'+round.id+'.json';expectedPaths.add(path);
    const disposition=jsonRef(round.disposition,path,256*1024,'disposition');
    closed(disposition,['schema','round','status','findings'],'disposition');
    if(disposition.schema!=='pipeline.doc-reader-terminal-disposition.v1'||disposition.round!==round.id
      ||disposition.status!=='resolved'||!Array.isArray(disposition.findings)||disposition.findings.length<1||disposition.findings.length>256)fail('disposition or early closure');
    const ids=new Set();
    for(const finding of disposition.findings){
      closed(finding,['id','class','status','resolutionCommit'],'finding');
      if(!findingId.test(finding.id??'')||ids.has(finding.id)||!['cut','fileline','reordering'].includes(finding.class))fail('finding identity');ids.add(finding.id);
      if(finding.status==='resolved'){
        if(!batch.commits.includes(finding.resolutionCommit))fail('finding resolution outside its correction batch');
      }else if(finding.status==='accepted'){
        const key=round.id+'/'+finding.id;
        if(finding.resolutionCommit!==null||!owner.acceptedFindingIds.includes(key))fail('unaccepted finding');accepted.add(key);
      }else fail('unresolved finding');
    }
  }
  if(!api.sameJson([...accepted].sort(),[...owner.acceptedFindingIds].sort())||owner.fourthReviewedCommit!==record.rounds[3].reviewed.commit)fail('owner finding or fourth-round binding');
  // Include added-then-deleted reports: changing round IDs cannot erase a fifth committed round.
  const history=api.git(root,['log','--format=','--name-only','--diff-filter=A',candidateCommit,'--',prefix+'phase-one/',prefix+'phase-two/',prefix+'disposition/'],'utf8');
  if(history.status!==0||history.stdout.length>1024*1024)fail('course evidence history unavailable');
  for(const path of history.stdout.split('\n').filter(Boolean))if(!expectedPaths.has(path))fail('unlisted fifth or renamed committed round');
  const tree=api.git(root,['ls-tree','-r','--name-only',candidateCommit,'--',prefix+'phase-one/',prefix+'phase-two/',prefix+'disposition/'],'utf8');
  if(tree.status!==0||!api.sameJson(tree.stdout.trim().split('\n').sort(),[...expectedPaths].sort()))fail('missing or extra round evidence');
  const fourth=record.rounds[3].reviewed.inputs,final=record.final.inputs;
  if(fourth.capabilityInventorySha256!==final.capabilityInventorySha256||fourth.governanceSha256!==final.governanceSha256)fail('unreviewed inventory or governance transition');
  if(fourth.readerProtocolSha256===final.readerProtocolSha256){if(record.policyTransition!==null)fail('spurious policy transition');}
  else{
    const transition=record.policyTransition;
    closed(transition,['fromSha256','toSha256','commit'],'policy transition');
    if(transition.fromSha256!==fourth.readerProtocolSha256||transition.toSha256!==final.readerProtocolSha256
      ||!record.correctionBatches[3].commits.includes(transition.commit))fail('unbound policy transition');
    if(api.sha256(api.readBlob(root,transition.commit,'harness/reader-review-protocol.md',1024*1024))!==transition.toSha256)fail('policy transition commit');
  }
  return {reviewedCommit:record.rounds[3].reviewed.commit,docsetSha256:finalNow.docsetSha256};
}
