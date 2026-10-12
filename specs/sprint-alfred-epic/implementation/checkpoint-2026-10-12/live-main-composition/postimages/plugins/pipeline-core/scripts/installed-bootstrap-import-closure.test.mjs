#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {registerTestCaseCompletion} from '../lib/test-case-completion.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';

// An alternate COMPLETE plugin package lets the same regression qualify an
// assembled candidate. No dependency overlays, text replacements or stubs.
const sourcePluginRoot=resolve(process.env.PIPELINE_INSTALLED_IMPORT_SOURCE_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)),'..'));
const scratchRoot=resolve(process.cwd(),'scratch');

function inventory(root,rel='') {
  const rows=[];
  for(const name of readdirSync(join(root,rel)).sort()) {
    const path=join(rel,name),absolute=join(root,path),stat=lstatSync(absolute);
    assert.notEqual(name,'.git','standalone package must contain no Git metadata');
    assert.equal(stat.isSymbolicLink(),false,`package link could escape isolation: ${path}`);
    if(stat.isDirectory())rows.push(...inventory(root,path));
    else {
      assert.equal(stat.isFile(),true,`unsupported package entry: ${path}`);
      rows.push({path,sha256:createHash('sha256').update(readFileSync(absolute)).digest('hex')});
    }
  }
  return rows;
}

registerTestCaseCompletion({fd:3,maxBytes:8192,cases:[{id:'IBIC001',
  name:'installed bootstrap links the actual standalone plugin without an external harness',run:()=>{
  mkdirSync(scratchRoot,{recursive:true});
  const fixture=mkdtempSync(join(scratchRoot,'installed-bootstrap-import-'));
  try {
    const packageRoot=join(fixture,'package');
    const pluginRoot=join(packageRoot,'plugins','pipeline-core');
    const sourceInventory=inventory(sourcePluginRoot);
    cpSync(sourcePluginRoot,pluginRoot,{recursive:true,errorOnExist:true,force:false});
    assert.deepEqual(inventory(pluginRoot),sourceInventory,'copied package must match the actual production source bytes');
    assert.deepEqual(readdirSync(packageRoot),['plugins']);
    assert.deepEqual(readdirSync(join(packageRoot,'plugins')),['pipeline-core']);
    assert.equal(existsSync(join(packageRoot,'.git')),false);
    assert.equal(existsSync(join(packageRoot,'harness')),false,'no external harness overlay is permitted');
    // This is the exact target of the historical ../../../harness import.
    assert.equal(existsSync(resolve(pluginRoot,'lib','../../../harness/scripts/check-verify-suite-registration.mjs')),false);
    const moduleUrl=pathToFileURL(join(pluginRoot,'scripts','pipeline-start-preflight.mjs')).href;
    const childEnv={...process.env};
    for(const key of Object.keys(childEnv)) {
      if(['NODE_OPTIONS','NODE_PATH'].includes(key.toUpperCase()))delete childEnv[key];
    }
    // -e leaves argv[1] absent. Importing cannot accidentally select preflight's
    // direct-invocation branch; no bootstrap/onboarding action is requested.
    const code=`const loaded=await import(${JSON.stringify(moduleUrl)}); if(typeof loaded.observePipelineStartPreflight!=='function')throw new Error('missing bootstrap export'); console.log('standalone-bootstrap-import-ok');`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',code],{
      cwd:packageRoot,env:childEnv,encoding:'utf8',shell:false,timeout:30000,maxBuffer:1024*1024,
    });
    assert.ifError(result.error);
    assert.equal(result.signal,null,`bootstrap import was terminated: ${result.signal}`);
    assert.equal(result.status,0,`standalone bootstrap module linking failed:\n${result.stderr}`);
    assert.equal(result.stdout.trim(),'standalone-bootstrap-import-ok');
    assert.equal(result.stderr,'');
    assert.equal(existsSync(join(packageRoot,'harness')),false);
    assert.equal(existsSync(join(packageRoot,'.git')),false);
    assert.deepEqual(inventory(pluginRoot),sourceInventory,'module import must preserve the copied package bytes');
  } finally {
    rmSync(fixture,{recursive:true,force:true});
  }
}}]});
