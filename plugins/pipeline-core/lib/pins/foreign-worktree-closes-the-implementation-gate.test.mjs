// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.foreign-worktree-closes-the-implementation-gate (AC-174, ALF-C-P21-06).
// Each case exercises one acceptance point of the original backlog item against the real source.
// Cases that currently FAIL are the RED evidence that the point is not satisfied (see report).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDesignWorkflowPackageV2FromRepository} from '../design-workflow-package-v2.mjs';
import {resolvePoGateRepositoryTopology} from '../po-gate-authority.mjs';

const lib=join(dirname(fileURLToPath(import.meta.url)),'..');
const pluginRoot=join(lib,'..');
const repoRoot=join(pluginRoot,'..','..');
const src=p=>readFileSync(join(lib,p),'utf8');
// A root that git cannot enter: the same failure class a foreign worktree produces (git/physical failure, not DWP2-*).
const unreachable=()=>join(repoRoot,'scratch','foreign-worktree-pin-no-such-root-'+process.pid);

test('AC1 reader: DWP2-* exceptions keep their own code (no catch-all collapse)',()=>{
  const text=src('design-workflow-package-v2.mjs');
  assert.match(text,/e\.message\.startsWith\('DWP2-'\)\?e\.message:'DWP2-PHYSICAL-OR-GIT'/u);
});

test('AC1 reader: a non-DWP2 git/physical failure still yields a bounded, typed, schema-tagged diagnostic',()=>{
  const r=readDesignWorkflowPackageV2FromRepository({repoRoot:unreachable(),packagePath:'x.json'});
  assert.equal(r.ok,false);
  assert.equal(r.diagnostic?.schema,'pipeline.codex-advisor-binding-diagnostic.v1');
  assert.equal(r.diagnostic.subcheck,'source-provenance');
});

test('AC1 reader (RED today): the original cause of a git failure is retained as a fixed enum, not collapsed to a generic cause',()=>{
  const r=readDesignWorkflowPackageV2FromRepository({repoRoot:unreachable(),packagePath:'x.json'});
  // Today: cause === 'advisor-binding-source-provenance' for every non-listed error, so the underlying cause is lost.
  assert.notEqual(r.diagnostic?.cause,'advisor-binding-source-provenance',
    'underlying cause lost: fix needed in lib/codex-advisor-binding-diagnostic.mjs (causes enum + causeOf) and the catch in lib/design-workflow-package-v2.mjs readDesignWorkflowPackageV2FromRepository');
});

test('AC2 typed environment condition: an unresolvable registered worktree throws DWP2-ENVIRONMENT-UNAVAILABLE / foreign-worktree',()=>{
  const git=args=>{
    const a=args.join(' ');
    if(a==='rev-parse --show-toplevel')return repoRoot+'\n';
    if(a.includes('--git-common-dir'))return join(repoRoot,'.git')+'\n';
    const h='a'.repeat(40);
    return `worktree ${repoRoot}\0HEAD ${h}\0branch refs/heads/main\0\0worktree ${join(repoRoot,'scratch','foreign-worktree-pin-gone')}\0HEAD ${h}\0branch refs/heads/other\0\0`;
  };
  assert.throws(()=>resolvePoGateRepositoryTopology(repoRoot,{spawn:(_c,args)=>({status:0,stdout:git(args)})}),
    e=>e.code==='DWP2-ENVIRONMENT-UNAVAILABLE'&&e.cause==='foreign-worktree');
});

test('AC2 reader: the typed environment condition keeps its own code and a closed foreign-worktree cause',()=>{
  const text=src('design-workflow-package-v2.mjs');
  assert.match(text,/e\?\.code==='DWP2-ENVIRONMENT-UNAVAILABLE'/u);
  const r=readDesignWorkflowPackageV2FromRepository({repoRoot:unreachable(),packagePath:'x.json'});
  assert.equal(r.diagnostic.cause,'git-unavailable');
});

// AC4 behavioural fixture (ALF-C-C6G3-CORR F1): a real approved-PRD state file observed by the real
// persistedPoAuthority, driven through the real designToImplementationHandoverAction. Only the
// architecture inspection result is injected through the module's existing `fs.inspectArchitectureDesign` seam.
const sha64=c=>c.repeat(64);
const REOPEN='"reopen-design"';
async function approvedHandover(inspect){
  const nodeFs=(await import('node:fs')).default;
  const {designToImplementationHandoverAction}=await import('../project-onboarding-v3.mjs');
  const dir=join(repoRoot,'scratch','foreign-worktree-pin-ac4-'+process.pid+'-'+Math.random().toString(36).slice(2,8));
  mkdirSync(dir,{recursive:true});
  const root=nodeFs.realpathSync(dir);
  const authority={schema:'pipeline.po-gate-authority.v2',humanFacing:'en',sourceSha256:sha64('a'),runtimeSha256:sha64('b'),
    receiptSha256:sha64('c'),repositoryFingerprint:sha64('d'),planPath:'prd.md',planSha256:sha64('e'),specPath:'spec.md',specSha256:sha64('f')};
  const state={schema:'pipeline.state.v0',activeFeature:{id:'f1',planPath:'prd.md',phase:'design'},planApproved:true,
    planApproval:{schema:'pipeline.plan-approval.v2',approvedBy:'po',approvedAt:'2026-01-01T00:00:00.000Z',
      specBoundBy:'po',specBoundAt:'2026-01-01T00:00:00.000Z',poGateAuthority:authority},
    continuity:{authority:{prd:{path:'prd.md',sha256:authority.planSha256},spec:{path:'spec.md',sha256:authority.specSha256}}}};
  writeFileSync(join(root,'state.json'),JSON.stringify(state));
  try{
    const fs={...nodeFs,resolveProjectAuthorityPaths:()=>({status:'ready',state:'state.json'}),inspectArchitectureDesign:inspect};
    return designToImplementationHandoverAction(root,fs);
  }finally{rmSync(dir,{recursive:true,force:true});}
}
const isDiagnosis=a=>a?.kind==='architecture-design-required'&&a.applyAction===undefined&&!JSON.stringify(a).includes(REOPEN);

test('AC4 reopen-design (F1): an unexpected inspection exception yields a typed diagnosis, never a reopen-design action',async()=>{
  const {inspectArchitectureDesign}=await import('../architecture-design.mjs');
  // A root no filesystem call accepts: the real inspection raises a non-typed (system) exception.
  const badRoot=join(repoRoot,'scratch','foreign-worktree-pin-nul\0root');
  const direct=inspectArchitectureDesign(badRoot,null,{});
  assert.equal(direct.ok,false);
  assert.match(String(direct.code),/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u,'the code field must be a typed code, never exception text');
  const action=await approvedHandover((_r,scope,deps)=>inspectArchitectureDesign(badRoot,scope,deps));
  assert.ok(isDiagnosis(action),'no reopen-design for an unexplained exception: '+JSON.stringify(action));
  assert.match(String(action.code),/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u);
});

test('AC4 architecture-design (F1): failure codes are closed and typed; exception text never reaches the code field',async()=>{
  const m=await import('../architecture-design.mjs');
  assert.equal(m.ARCHITECTURE_DESIGN_INSPECTION_FAILED,'ARCHITECTURE-DESIGN-INSPECTION-FAILED');
  const msg="ENOENT: no such file or directory, open 'C:\\some\\private\\prd.md'";
  assert.equal(m.architectureDesignFailureCode(new Error(msg)),'ARCHITECTURE-DESIGN-INSPECTION-FAILED');
  assert.equal(m.architectureDesignFailureCode(new TypeError('x'.repeat(200))),'ARCHITECTURE-DESIGN-INSPECTION-FAILED');
  assert.equal(m.architectureDesignFailureCode(null),'ARCHITECTURE-DESIGN-INSPECTION-FAILED');
  for(const code of m.ARCHITECTURE_DESIGN_REOPEN_CODES)assert.equal(m.architectureDesignFailureCode(new Error(code)),code);
  assert.equal(m.architectureDesignFailureCode(new Error('DAA-PUBLIC-UNAVAILABLE')),'DAA-PUBLIC-UNAVAILABLE');
});

test('AC4 reopen-design (F1): a typed content-drift code still offers the exact reopen-design action',async()=>{
  const action=await approvedHandover(()=>({ok:false,status:'design-required',code:'ARCHITECTURE-DESIGN-APPROVAL-STALE'}));
  assert.equal(action?.kind,'collect-input');
  assert.ok(JSON.stringify(action).includes(REOPEN),'reopen-design applyAction present for verified drift');
});

test('AC4 reopen-design (F1): a typed non-drift code (setup/availability) gets a diagnosis, not reopen-design',async()=>{
  for(const code of ['DAA-PUBLIC-UNAVAILABLE','DAA-PO-APPROVAL-TRUST-ANCHOR-SETUP','ARCHITECTURE-DESIGN-LOCK-REQUIRED','ARCHITECTURE-DESIGN-INSPECTION-FAILED']){
    const action=await approvedHandover(()=>({ok:false,status:'design-required',code}));
    assert.ok(isDiagnosis(action),code+': '+JSON.stringify(action));
    assert.equal(action.code,code);
  }
});

test('AC4 reopen-design (F1): environment-unavailable is unchanged (typed environment diagnosis, no reopen-design)',async()=>{
  const action=await approvedHandover(()=>({ok:false,status:'environment-unavailable',code:'DWP2-ENVIRONMENT-UNAVAILABLE',cause:'foreign-worktree'}));
  assert.ok(isDiagnosis(action));
  assert.equal(action.code,'DWP2-ENVIRONMENT-UNAVAILABLE');
  assert.match(action.guidance,/not content drift/u);
});

// F4 (ALF-C-C6G3-CORR): only a registered NON-primary worktree failure is foreign-worktree.
const topologyGit=(primaryRoot,foreignRoot)=>args=>{
  const a=args.join(' ');
  if(a==='rev-parse --show-toplevel')return repoRoot+'\n';
  if(a.includes('--git-common-dir'))return join(repoRoot,'.git')+'\n';
  const h='a'.repeat(40);
  return `worktree ${primaryRoot}\0HEAD ${h}\0branch refs/heads/main\0\0worktree ${foreignRoot}\0HEAD ${h}\0branch refs/heads/other\0\0`;
};
test('AC2 primary root (F4): a failure resolving the PRIMARY worktree is its own typed error, not foreign-worktree, with the original error kept',()=>{
  const gone=join(repoRoot,'scratch','foreign-worktree-pin-primary-gone');
  const git=topologyGit(gone,repoRoot);
  assert.throws(()=>resolvePoGateRepositoryTopology(repoRoot,{spawn:(_c,args)=>({status:0,stdout:git(args)})}),
    e=>e.code==='PO-GATE-PRIMARY-ROOT-UNAVAILABLE'&&e.cause!=='foreign-worktree'&&e.underlyingError instanceof Error);
});
test('AC2 foreign root (F4): a non-primary registered worktree failure keeps the original error alongside the closed foreign-worktree cause',()=>{
  const git=topologyGit(repoRoot,join(repoRoot,'scratch','foreign-worktree-pin-gone-2'));
  assert.throws(()=>resolvePoGateRepositoryTopology(repoRoot,{spawn:(_c,args)=>({status:0,stdout:git(args)})}),
    e=>e.code==='DWP2-ENVIRONMENT-UNAVAILABLE'&&e.cause==='foreign-worktree'&&e.underlyingError instanceof Error);
});

test('AC3 named diagnosis: the closed-gate denial names only admitted recovery commands, never the retired inspect script',async()=>{
  // AC-148 course (PO decision 2026-10-16): design-advisory-admission.mjs is retired and stays refused;
  // the denial must not name it, and every recovery verb it does name must be admitted in the denying state.
  const {designAdvisoryRemediation}=await import('../guard-devplan-policy.mjs');
  const {devPlanShellRefusalHit}=await import('../guard/devplan-shell-lane.mjs');
  const {isSanctionedLifecycleCommand}=await import('../guard/command-catalogue.mjs');
  const script=join(pluginRoot,'scripts','pipeline-state.mjs');
  const blockedDraft={devPlanGateVerdictFn:()=>({verdict:'block',reason:'fixture',lifecycleStatus:'implementing'})};
  const retired=`node "${join(pluginRoot,'scripts','design-advisory-admission.mjs')}" inspect --repo-root ${repoRoot} --feature f --plan p --spec s`;
  const namesRetired=t=>/design-advisory-admission|\binspect\b|\.mjs\b|\bnode\b/u.test(t);
  const receiptRel='scratch/foreign-worktree-pin-ac3-receipt.json';
  const shapes={'reopen-design':'--by tester','present-plan':`--by tester --review-receipt ${receiptRel}`,'approve-plan':'--by tester','set-phase':'--phase implementation'};
  const codes=['DAA-DESIGN-APPROVAL-BINDING-DRIFT','DAA-DESIGN-SOURCE-DRIFT','DAA-PUBLIC-UNAVAILABLE','DAA-PO-APPROVAL-TRUST-ANCHOR-SETUP'];
  // Precondition: the guard really refuses the retired command in the denying state.
  assert.equal(devPlanShellRefusalHit(retired,repoRoot,blockedDraft)?.lane,'opaque-script-execution');
  assert.equal(isSanctionedLifecycleCommand(retired,repoRoot,{}),false);
  mkdirSync(join(repoRoot,'scratch'),{recursive:true});
  writeFileSync(join(repoRoot,receiptRel),'{}');
  try{
    let named=0;
    for(const code of codes){
      const text=designAdvisoryRemediation(code);
      assert.ok(!namesRetired(text),`${code}: denial names the retired inspect command`);
      for(const verb of Object.keys(shapes).filter(v=>text.includes(v))){
        named+=1;
        const command=`node "${script}" ${verb} ${shapes[verb]}`;
        assert.equal(isSanctionedLifecycleCommand(command,repoRoot,{}),true,`${code}: named "${verb}" not admitted`);
        assert.equal(devPlanShellRefusalHit(command,repoRoot,blockedDraft),null,`${code}: named "${verb}" refused by lane`);
      }
    }
    assert.ok(named>=codes.length,'each denial must name at least one admitted recovery verb');
  }finally{rmSync(join(repoRoot,receiptRel),{force:true});}
});

test('AC5 ADR-0085 C2 legacy re-read removes the hot-path read (mode constant exists)',()=>{
  assert.match(src('design-workflow-package.mjs'),/DWP2-LEGACY-APPROVED-REREAD/u);
});

test('HOST-LIMITATION skip: WSL-registered foreign worktree fixture (/mnt gitdir) needs Linux/WSL',{skip:'host-limitation: native Windows host cannot register a WSL /mnt worktree; owner Coordinator, due 2026-10-19 (PO decision K7), Linux/WSL run'},()=>{});

test('sanity: the plugin tree exists',()=>{assert.ok(existsSync(join(lib,'design-workflow-package-v2.mjs')));});
