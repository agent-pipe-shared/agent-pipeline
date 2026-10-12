#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import {realpathSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {isDirectInvocation} from '../lib/entrypoint.mjs';
import {planCriticCourseAdoption,publishCriticCourseAdoption,readCriticCourseAdoptionSelection} from '../lib/critic-course-adoption.mjs';
export function runCriticCourseAdoptionCli(argv){
  try{const applying=argv?.[0]==='publish';if(!Array.isArray(argv)||(applying?argv.length!==7||argv[5]!=='--expected-plan-sha256':argv.length!==5)||!['plan','publish'].includes(argv[0])||argv[1]!=='--root'||argv[3]!=='--request'
    ||typeof argv[2]!=='string'||!isAbsolute(argv[2])||resolve(argv[2])!==argv[2]||realpathSync(argv[2])!==argv[2])return {exitCode:2,output:{status:'held',code:'CA-CLI',stateMutated:false,spawnAuthorized:false}};
    const selected=readCriticCourseAdoptionSelection({rootDir:argv[2],path:argv[4]});
    if(!selected.ok)return {exitCode:2,output:{status:'held',code:selected.code,stateMutated:false,spawnAuthorized:false}};
    const result=planCriticCourseAdoption({rootDir:argv[2],selection:selected.selection});
    if(applying){if(result.status!=='source-bound-preparation')return {exitCode:2,output:result};const publication=publishCriticCourseAdoption({rootDir:argv[2],handle:result.handle,expectedPlanSha256:argv[6]});return {exitCode:publication.status==='published'?0:2,output:publication};}
    const {handle,...output}=result;return {exitCode:result.status==='held'?2:0,output};
  }catch{return {exitCode:2,output:{status:'held',code:'CA-SOURCE-UNAVAILABLE',stateMutated:false,spawnAuthorized:false}};}
}
if(isDirectInvocation(import.meta.url)){const result=runCriticCourseAdoptionCli(process.argv.slice(2));process.stdout.write(JSON.stringify(result.output)+'\n');process.exitCode=result.exitCode;}
