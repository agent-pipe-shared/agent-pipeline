// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Root-executed METHOD constructors. The real denial writer creates expiry;
// the real initialized project is bound only after those inputs exist.
// No fixture writes a request, capability, hold, consumed event, or READY state.
export async function sweepCases({fixtureRoot,sourceRoot}) {
  assert.equal(resolve(sourceRoot),resolve(fixtureRoot,'../../../..'),'all constructors and readers must load one graph instance');
  const owner=await import(pathToFileURL(join(fixtureRoot,'state-owner.fixture.mjs')));
  const hgo=await import(pathToFileURL(join(sourceRoot,'plugins/pipeline-core/lib/human-guard-override.mjs')));
  const pluginRoot=join(sourceRoot,'plugins/pipeline-core');
  const scriptPath=join(pluginRoot,'scripts/guard-human-override.mjs');
  const digest=b=>createHash('sha256').update(b).digest('hex');
  const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value!==null&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
  async function setup(rows) {
    const f=owner.staged.makeFixture('signature',{stage:'initialized'});
    const records=rows.map((expired,index)=>{
      const record=hgo.recordHumanGuardDenial({rootDir:f.dir,pluginRoot,scriptPath,
        toolName:'Write',toolInput:{file_path:`method-sweep-${index}.md`,content:`METHOD ${index}\n`},
        denials:[{guard:'guard-lifecycle-ready.mjs',reason:'GUARD-DEVPLAN-SHELL'}],
        nowMs:expired?1000:Date.now(),ttlMs:86400000});
      assert.equal(record.status,'planned','genuine denial producer must succeed before any sweep');
      assert.match(record.requestSha256,/^[a-f0-9]{64}$/);
      return record;
    });
    await owner.bindActualStateOwner(f);
    return {f,records};
  }
  function locate(f,sha) {
    // Discover by authenticated request content, never basename-as-authority.
    const root=join(f.repository.commonDir,'agent-pipeline');
    const matches=[];let entries=0;
    function visit(path,depth=0) {
      assert(depth<=8,'bounded owned request discovery');
      for(const name of readdirSync(path)) {
        assert(++entries<=4096,'bounded owned namespace membership');
        const child=join(path,name),info=lstatSync(child);
        assert(!info.isSymbolicLink(),'no symlink traversal');
        if(info.isDirectory())visit(child,depth+1);
        else if(info.isFile()&&name.endsWith('.json')&&info.size<=1048576) {
          const bytes=readFileSync(child);let record;try{record=JSON.parse(bytes);}catch{continue;}
          if(digest(canonical(record))===sha&&/^pipeline\.human-guard-override-request\./.test(record.schema??''))matches.push({path:child,sha256:digest(bytes)});
        }
      }
    }
    visit(root);assert.equal(matches.length,1,'exact Source-produced request record');return matches[0];
  }
  return [
    {id:'SDS001',scope:'controlled-expiry-with-current-all12',async run(){
      const {f,records}=await setup([true,false]);
      const expired=locate(f,records[0].requestSha256),active=locate(f,records[1].requestSha256);
      const result=f.runtime.run(()=>hgo.sweepHumanGuardOverrideRequests({rootDir:f.dir}));
      assert.equal(result.status,'swept');assert.equal(result.removed,1);
      assert.equal(existsSync(expired.path),false,'actual expired request removed');
      assert.equal(digest(readFileSync(active.path)),active.sha256,'actual unexpired unconsumed request conserved');
      assert.equal(lstatSync(active.path).nlink,1);
    }},
    {id:'SDS002',scope:'controlled-unconsumed-retention',async run(){
      const {f,records}=await setup([false]);const request=locate(f,records[0].requestSha256);
      const result=f.runtime.run(()=>hgo.sweepHumanGuardOverrideRequests({rootDir:f.dir}));
      assert.equal(result.status,'absent');assert.equal(result.removed,0);assert.equal(result.remainingEligible,0);
      assert.equal(digest(readFileSync(request.path)),request.sha256,'zero matching capabilities must not count as authentic consumption');
    }},
    {id:'SDS003',scope:'controlled-one-use-effect-followup',async run(){
      const {f,records}=await setup([true]);const request=locate(f,records[0].requestSha256);
      const first=f.runtime.run(()=>hgo.sweepHumanGuardOverrideRequests({rootDir:f.dir}));
      assert.equal(first.status,'swept');assert.equal(first.removed,1);assert(!existsSync(request.path));
      const second=f.runtime.run(()=>hgo.sweepHumanGuardOverrideRequests({rootDir:f.dir}));
      assert.equal(second.status,'absent');assert.equal(second.removed,0);assert.equal(second.remainingEligible,0);
    }}
  ];
}
