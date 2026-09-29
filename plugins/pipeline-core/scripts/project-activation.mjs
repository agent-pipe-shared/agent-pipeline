#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/scripts/project-activation.mjs
import {observeGovernanceScope,planGovernanceScopeDecision,applyGovernanceScopeDecision} from '../lib/governance-scope.mjs';
import {isDirectInvocation} from '../lib/entrypoint.mjs';
export function main(argv,{write=value=>process.stdout.write(JSON.stringify(value)+'\n')}={}){
  try{
    const command=argv[0],values={};if(!['inspect','plan','apply'].includes(command))throw Error('GS-CLI-COMMAND');
    for(let i=1;i<argv.length;i++){
      const key=argv[i];if(!['--root','--decision','--by','--plan-sha256','--activate'].includes(key)||Object.hasOwn(values,key))throw Error('GS-CLI-FLAG');
      if(key==='--activate'){values[key]=true;continue;}
      const value=argv[++i];if(typeof value!=='string'||!value||value.startsWith('--'))throw Error('GS-CLI-VALUE');values[key]=value;
    }
    if(!values['--root'])throw Error('GS-CLI-ROOT');
    if(command==='inspect'){
      if(Object.keys(values).some(k=>k!=='--root'))throw Error('GS-CLI-FLAG');write(observeGovernanceScope({rootDir:values['--root']}));return 0;
    }
    if(!values['--decision']||!values['--by'])throw Error('GS-CLI-DECISION');
    if(command==='plan'&&(values['--plan-sha256']||values['--activate']))throw Error('GS-CLI-FLAG');
    const plan=planGovernanceScopeDecision({rootDir:values['--root'],decision:values['--decision'],by:values['--by']});
    if(command==='plan'){write(plan);return 0;}
    if(!values['--activate']||typeof values['--plan-sha256']!=='string'||!/^[a-f0-9]{64}$/.test(values['--plan-sha256']))throw Error('GS-CLI-ACTIVATION');
    write(applyGovernanceScopeDecision(plan,{activate:true,planSha256:values['--plan-sha256']}));return 0;
  }catch(error){write({schema:'pipeline.governance-decision-error.v1',code:typeof error.code==='string'?error.code:/^GS-/.test(error.message)?error.message:'GS-CLI-UNAVAILABLE'});return 2;}
}
if(isDirectInvocation(import.meta.url))process.exitCode=main(process.argv.slice(2));
