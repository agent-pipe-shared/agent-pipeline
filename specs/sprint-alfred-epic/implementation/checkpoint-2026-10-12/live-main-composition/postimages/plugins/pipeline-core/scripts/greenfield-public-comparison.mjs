#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readGreenfieldPublicComparisonInput,buildGreenfieldPublicComparison,publishGreenfieldPublicComparison} from '../lib/greenfield-public-comparison.mjs';
export function runGreenfieldPublicComparison(argv,{stdout=process.stdout,rootDir=process.cwd()}={}){
  const keys=['--input','--input-sha256','--output'];
  if(argv.length!==6||!keys.every((k,i)=>argv[i*2]===k&&typeof argv[i*2+1]==='string')){stdout.write(JSON.stringify({status:'held',code:'GPC-ARGS'})+'\n');return 2;}
  const input=readGreenfieldPublicComparisonInput({rootDir,inputPath:argv[1],inputSha256:argv[3]});
  if(input.status!=='read'){stdout.write(JSON.stringify(input)+'\n');return 2;}
  const built=buildGreenfieldPublicComparison({inputHandle:input.handle});
  const result=built.status==='built'?publishGreenfieldPublicComparison({rootDir,outputPath:argv[5],built}):built;
  stdout.write(JSON.stringify(result)+'\n');return result.status==='published'?0:2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=runGreenfieldPublicComparison(process.argv.slice(2));
