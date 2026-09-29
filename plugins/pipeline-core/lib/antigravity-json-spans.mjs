// SPDX-License-Identifier: SUL-1.0
// Pure bounded JSON surgery. Untouched values and property text remain exact.
import {parseStrictJson} from './governance-event.mjs';
export function rewriteAntigravityJsonBytes(bytes,{replacements=[],deletions=[],appends=[]}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>262144)throw Error('ATR-JSON-BOUND');parseStrictJson(bytes);
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);let i=0,nodes=0;
 const whitespace=()=>{while(/\s/.test(text[i]??'')&&i<text.length)i++;};
 function quoted(){const start=i++;while(i<text.length){const c=text[i++];if(c==='\\'){i++;continue;}if(c==='"')return {start,end:i};}throw Error('ATR-JSON-SPAN');}
 function node(depth=0){if(depth>64||++nodes>4096)throw Error('ATR-JSON-BOUND');whitespace();const start=i,c=text[i],children=[];
  if(c==='['||c==='{'){i++;whitespace();const close=c==='['?']':'}';if(text[i]!==close)for(;;){
    let key=null,keyStart=i;if(c==='{'){const q=quoted();key=JSON.parse(text.slice(q.start,q.end));whitespace();if(text[i++]!==':')throw Error('ATR-JSON-SPAN');}
    const value=node(depth+1);children.push({key,keyStart,node:value});whitespace();if(text[i]===close)break;if(text[i++]!==',')throw Error('ATR-JSON-SPAN');whitespace();
   }if(text[i++]!==close)throw Error('ATR-JSON-SPAN');return {start,end:i,kind:c==='['?'array':'object',children};}
  if(c==='"')return {...quoted(),kind:'scalar'};
  while(i<text.length&&!/[\s,\]}]/.test(text[i]))i++;return {start,end:i,kind:'scalar'};
 }
 const root=node();whitespace();if(i!==text.length)throw Error('ATR-JSON-SPAN');
 const key=path=>JSON.stringify(path),replaces=new Map(replacements.map(c=>[key(c.path),c.value])),removes=new Set(deletions.map(key)),adds=new Map(appends.map(c=>[key(c.path),c.values]));const visited=new Set();
 function render(n,path){const id=key(path);
  if(removes.has(id)){visited.add(id);return null;}
  if(replaces.has(id)){visited.add(id);return JSON.stringify(replaces.get(id));}
  if(n.kind==='scalar')return text.slice(n.start,n.end);
  const pieces=[];let changed=false;
  n.children.forEach((entry,index)=>{const value=render(entry.node,[...path,n.kind==='array'?index:entry.key]);if(value===null){if(n.kind!=='array')throw Error('ATR-JSON-OBJECT-DELETE');changed=true;return;}
   const original=text.slice(entry.node.start,entry.node.end);if(value!==original)changed=true;
   const lead=(text.slice(n.start,entry.keyStart).match(/\s*$/)?.[0]??'');
   pieces.push({lead,text:(n.kind==='object'?text.slice(entry.keyStart,entry.node.start):'')+value});});
  if(adds.has(id)){if(n.kind!=='array')throw Error('ATR-JSON-APPEND');visited.add(id);for(const value of adds.get(id))pieces.push({lead:'',text:JSON.stringify(value)});changed=true;}
  if(!changed)return text.slice(n.start,n.end);
  const prefix=n.children.length?text.slice(n.start+1,n.children[0].keyStart):text.slice(n.start+1,n.end-1);
  const suffix=n.children.length?text.slice(n.children.at(-1).node.end,n.end-1):'';
  return text[n.start]+prefix+pieces.map((p,index)=>(index?',':'')+(index?p.lead:'')+p.text).join('')+suffix+text[n.end-1];
 }
 const result=render(root,[]);if(result===null)throw Error('ATR-JSON-ROOT-DELETE');
 for(const id of [...replaces.keys(),...removes,...adds.keys()])if(!visited.has(id))throw Error('ATR-JSON-PATH');
 const encoded=Buffer.from(text.slice(0,root.start)+result+text.slice(root.end));if(encoded.length>262144)throw Error('ATR-JSON-BOUND');parseStrictJson(encoded);return encoded;
}
