#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {transitionReaderCourse} from '../lib/doc-reader-course.mjs';
import {parseStrictJson} from '../lib/governance-event.mjs';
import {createReaderCourseDefaultDependencies} from '../lib/doc-reader-default-observers.mjs';
const operations=new Set(['create','reserve-stage','observe-attempt','recover','complete-stage','begin-batch','record-correction','close-batch','justify-third','close-course']);
/** Defaults observe public method evidence; this CLI never launches a host. */
export async function runDocReaderCourse(argv,{stdout=process.stdout,deps={}}={}){
 try{
  const inspect=argv[0]==='inspect';if(!(inspect||operations.has(argv[0]))||argv.length!==(inspect?7:9)||argv[1]!=='--repo'||argv[3]!=='--store'||argv[5]!== (inspect?'--course-id':'--request')||(!inspect&&argv[7]!=='--request-sha256'))return 2;
  const root=argv[2],storePath=argv[4];if(!isAbsolute(root)||resolve(root)!==root||realpathSync(root)!==root||!lstatSync(root).isDirectory()||typeof storePath!=='string'||!storePath.endsWith('/course-state.json')||/[\\:\x00-\x1f\x7f]/u.test(storePath)||storePath.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))return 2;
  let request;if(inspect){if(!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(argv[6]))return 2;request={courseId:argv[6]};}else{const path=argv[6];if(!isAbsolute(path)||resolve(path)!==path||!path.startsWith(root+sep)||!/^[a-f0-9]{64}$/u.test(argv[8]))return 2;let at=root;for(const part of path.slice(root.length+1).split(sep)){if(!part||part==='.'||part==='..')return 2;at=resolve(at,part);const st=lstatSync(at);if(st.isSymbolicLink()||realpathSync(at)!==at)return 2;}const st=lstatSync(path);if(!st.isFile()||st.nlink!==1||st.size>262144)return 2;const bytes=readFileSync(path);if(createHash('sha256').update(bytes).digest('hex')!==argv[8])return 2;request=JSON.parse(JSON.stringify(parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes))));}
  const result=await transitionReaderCourse({root,storePath,operation:argv[0],request},{...createReaderCourseDefaultDependencies({root}),...deps});stdout.write(`${JSON.stringify(result)}\n`);return result.ok?0:1;
 }catch{return 2;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await runDocReaderCourse(process.argv.slice(2));
