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

test('AC4 reopen-design (RED today): onboarding offers reopen-design only for a verified content-drift code, not for any !architecture.ok',()=>{
  const text=src('project-onboarding-v3.mjs');
  const at=text.indexOf('its architecture evidence is invalid');
  assert.ok(at>0,'guidance anchor present');
  const before=text.slice(Math.max(0,at-900),at);
  assert.match(text.slice(Math.max(0,at-2200),at),/code === "DWP2-ENVIRONMENT-UNAVAILABLE"[\s\S]*?kind: "architecture-design-required"/u);
  assert.match(before,/DRIFT|STALE|environment/iu,
    'branch `if (!architecture.ok)` in designToImplementationHandoverAction (lib/project-onboarding-v3.mjs) offers reopen-design for every failure code');
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
