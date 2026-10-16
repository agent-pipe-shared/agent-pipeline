// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.foreign-worktree-closes-the-implementation-gate (AC-174, ALF-C-P21-06).
// Each case exercises one acceptance point of the original backlog item against the real source.
// Cases that currently FAIL are the RED evidence that the point is not satisfied (see report).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
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

test('AC3 named read-only diagnosis (RED today): design-advisory-admission inspect is an admitted sanctioned script while the gate is closed',()=>{
  const sanctioned=src('guard/sanctioned-args-scripts.mjs');
  assert.match(sanctioned,/design-advisory-admission/u,
    'lib/guard/sanctioned-args-scripts.mjs does not admit the gate\'s own named diagnosis command');
});

test('AC5 ADR-0085 C2 legacy re-read removes the hot-path read (mode constant exists)',()=>{
  assert.match(src('design-workflow-package.mjs'),/DWP2-LEGACY-APPROVED-REREAD/u);
});

test('HOST-LIMITATION skip: WSL-registered foreign worktree fixture (/mnt gitdir) needs Linux/WSL',{skip:'host-limitation: native Windows host cannot register a WSL /mnt worktree; owner Coordinator, due 2026-10-19 (PO decision K7), Linux/WSL run'},()=>{});

test('sanity: the plugin tree exists',()=>{assert.ok(existsSync(join(lib,'design-workflow-package-v2.mjs')));});
