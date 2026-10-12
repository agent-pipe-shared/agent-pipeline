import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const own=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(own,'../../..');
const paths=['lib/historical-fresh-review-admission.mjs','lib/critic-generic-batch.mjs','lib/critic-course-admission.mjs','scripts/check-critic-skip-coverage.mjs','scripts/critic-dispatch-preflight.mjs','scripts/session-critic-finalizer.mjs'];
const expected=['6ebd09bf6fc43ae78fa56724dd716b40851ec99771f0bfadaf6a39117a3cb204','27145a72a140f1c56aad17a292041352a8911892f22c4235d27206a667c73886','28bc89a4b4825082cfebfc7f00dda41c8a938cd6d088fcd55bbee919523a23e9','491ac5dae8ce53dda6be9133defab75c372538f38b7012c803477e79be0fab91','8aa3b98ec54545d966dd1a45f66902630e0b11ca11d441d6d0b1aa9840b4cb86','d07ffe67a485be83e00462457a1abf51b363bf40bebb2b589eddba9c10ac2168'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const selected=paths.map((p,i)=>{const absolute=path.join(root,'plugins/pipeline-core',p),s=fs.lstatSync(absolute),bytes=fs.readFileSync(absolute);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||sha(bytes)!==expected[i])throw Error('SELECTED-PREIMAGE-CONFLICT:'+p);return {path:'plugins/pipeline-core/'+p,sha256:sha(bytes),mode:s.mode&0o777,bytes:bytes.length};});
const target=path.join(own,'candidate/plugins/pipeline-core');
if(fs.existsSync(target))throw Error('PRIVATE-CANDIDATE-EXISTS');
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.cpSync(path.join(root,'plugins/pipeline-core'),target,{recursive:true,errorOnExist:true,force:false,dereference:false});
const inventory=[];
function scan(dir,rel=''){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const r=path.posix.join(rel,e.name),p=path.join(dir,e.name),s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('PACKAGE-ALIAS:'+r);if(s.isDirectory())scan(p,r);else if(s.isFile()){const b=fs.readFileSync(p);inventory.push({path:r,sha256:sha(b),mode:s.mode&0o777,bytes:b.length});}else throw Error('PACKAGE-SPECIAL:'+r);}}
scan(target);
fs.writeFileSync(path.join(own,'source-binding.json'),JSON.stringify({schema:'alfred.critic-adoption-private-binding.v1',selected,inventory,inventorySha256:sha(Buffer.from(JSON.stringify(inventory)))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'prepared',selected:selected.length,packageFiles:inventory.length,inventorySha256:sha(Buffer.from(JSON.stringify(inventory)))}));
