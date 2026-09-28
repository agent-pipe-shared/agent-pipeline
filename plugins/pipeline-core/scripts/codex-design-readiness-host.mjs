// SPDX-License-Identifier: SUL-1.0
/** Codex-only, host-observed tool-free readiness. Never a selected-sandbox fallback. */
import {execFileSync} from 'node:child_process';
import {lstatSync,realpathSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {isAbsolute,resolve,join} from 'node:path';
import {advisoryEvidenceBundleSha256,buildAdvisoryEvidenceBundle} from '../lib/advisory-lifecycle-v2.mjs';
import {canonicalJson} from '../lib/codex-sandbox-compatibility.mjs';
import {resolveV3DutyRoute} from '../lib/critic-route-v3.mjs';
import {resolvePoGateRepositoryTopology,derivePoGateRepositoryFingerprint} from '../lib/po-gate-authority.mjs';
import {validatePipelineUserV3} from '../lib/runner-profiles-v3.mjs';
import {parseYaml} from '../lib/yaml-lite.mjs';
import {createCodexDesignReadinessHostStore} from '../lib/codex-design-readiness-host-store.mjs';
import {runCodexToolFreeDesignReadiness,verifyCodexToolFreeBindingFromSources} from '../lib/codex-tool-free-design-readiness.mjs';

const NAMES=['input','prd','spec','design','traceability'];
const OID=/^[a-f0-9]{40}$/,SHA=/^[a-f0-9]{64}$/;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
const same=(left,right)=>canonicalJson(left)===canonicalJson(right);
function unavailable(code){return {status:'unavailable',code,readinessReceipt:null,assurance:{class:'no-usable-review',literal:null}};}
function currentCandidate(root){
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:524288,stdio:['ignore','pipe','pipe']}).trim();
  return {commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}'])};
}
export async function runCodexDesignReadinessHost({repoRoot,repoFingerprint,dispatchId,dispatch,sources,sandboxRuntime},dependencies={}){
  let inputDirectory=null;
  try{
    if(typeof repoRoot!=='string'||!isAbsolute(repoRoot)||resolve(repoRoot)!==repoRoot||realpathSync(repoRoot)!==repoRoot
      ||!lstatSync(repoRoot).isDirectory()||!SHA.test(repoFingerprint??'')||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(dispatchId??'')
      ||!exact(dispatch,['queueRevision','candidateCommit','candidateTree','referenceSetSha256'])
      ||!Number.isSafeInteger(dispatch.queueRevision)||dispatch.queueRevision<0||!OID.test(dispatch.candidateCommit??'')
      ||!OID.test(dispatch.candidateTree??'')||!SHA.test(dispatch.referenceSetSha256??'')||!exact(sources,NAMES))return unavailable('CODEX-READINESS-INPUT');
    // Both standalone host and bootstrap enforce export denial before store creation or provider startup.
    const config=validatePipelineUserV3(parseYaml(readFileSync(join(repoRoot,'pipeline.user.yaml'),'utf8')),{source:'pipeline.user.yaml'});
    if(!config.ok||config.advisoryExport?.consent==='declined')return unavailable('CODEX-READINESS-EXPORT-DENIED');
    const topology=(dependencies.resolveTopology??resolvePoGateRepositoryTopology)(repoRoot);
    if(derivePoGateRepositoryFingerprint({gitCommonDir:topology.gitCommonDir,primaryRoot:topology.primaryRoot})!==repoFingerprint)return unavailable('CODEX-READINESS-REPOSITORY-MISMATCH');
    const candidate={commit:dispatch.candidateCommit,tree:dispatch.candidateTree};
    const selected=(dependencies.resolveV3ReadinessRoute??resolveV3DutyRoute)({rootDir:repoRoot,dutyId:'readiness',runner:'codex',candidateCommit:candidate.commit});
    if(!exact(selected,['dutyId','runner','model','effort','state','sourceSha256','candidateCommit'])||selected.dutyId!=='readiness'
      ||selected.runner!=='codex'||selected.state!=='default'||selected.candidateCommit!==candidate.commit
      ||!SHA.test(selected.sourceSha256??'')||typeof selected.model!=='string'||!selected.model||typeof selected.effort!=='string'||!selected.effort)return unavailable('CODEX-READINESS-ROUTE-UNAVAILABLE');
    const route=Object.fromEntries(['model','effort','sourceSha256','candidateCommit'].map(key=>[key,selected[key]]));
    for(const name of NAMES){const source=sources[name];if(!exact(source,['path','sha256'])||typeof source.path!=='string'||!SHA.test(source.sha256??''))return unavailable('CODEX-READINESS-SOURCES');}
    const bundle=buildAdvisoryEvidenceBundle(repoRoot,NAMES.map(name=>sources[name].path).sort());
    if(advisoryEvidenceBundleSha256(bundle)!==dispatch.referenceSetSha256||bundle.references.some(entry=>!NAMES.some(name=>sources[name].path===entry.path&&sources[name].sha256===entry.sha256)))return unavailable('CODEX-READINESS-EVIDENCE-MISMATCH');
    if(sandboxRuntime?.schema!=='pipeline.codex-sandbox-runtime.v1'||sandboxRuntime.repoRoot!==repoRoot
      ||typeof sandboxRuntime.codexPath!=='string'||!isAbsolute(sandboxRuntime.codexPath))return unavailable('CODEX-READINESS-EXECUTABLE-UNAVAILABLE');
    const readCandidate=()=> (dependencies.readCandidate??currentCandidate)(repoRoot);
    if(!same(readCandidate(),candidate))return unavailable('CODEX-READINESS-CANDIDATE-DRIFT');
    const store=(dependencies.createHostStore??createCodexDesignReadinessHostStore)({gitCommonDir:topology.gitCommonDir,repoFingerprint,trustedExecutablePath:sandboxRuntime.codexPath});
    inputDirectory=mkdtempSync(join(store.processRoot,'input-'));
    const result=await (dependencies.runToolFreeReadiness??runCodexToolFreeDesignReadiness)({repoRoot,repoFingerprint,dispatchId,candidate,sources,route,
      codexPath:sandboxRuntime.codexPath,inputDirectory,store,readCandidate});
    if(result?.status!=='reviewed'||!result.report)return unavailable(result?.code??'CODEX-READINESS-HOST-UNAVAILABLE');
    const sourceBytes=Object.fromEntries(NAMES.map(name=>[name,{path:sources[name].path,bytes:readFileSync(join(repoRoot,sources[name].path))}]));
    const checked=(dependencies.verifyBinding??verifyCodexToolFreeBindingFromSources)({hostExecution:result.report.hostExecution,report:result.report,
      candidate,sources,route,sourceBytes,store,repoFingerprint});
    if(!checked.ok||!same(readCandidate(),candidate))return unavailable('CODEX-READINESS-READBACK-FAILED');
    // Only verified closed ownership authorizes removal of the empty input directory.
    rmSync(inputDirectory,{recursive:true,force:false});inputDirectory=null;
    return {status:'reviewed',readinessReceipt:result.report,assurance:{class:'host-observed-tool-free',literal:null}};
  }catch{return unavailable('CODEX-READINESS-HOST-FAILED');}
  // On unverified termination retain input and journal for registered recovery.
}
