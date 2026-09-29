// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/runtime-projection-removal.mjs
import {createHash} from 'node:crypto';
import {parseYaml} from './yaml-lite.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code});}
function same(a,b){if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return a===b;if(Array.isArray(a)!==Array.isArray(b))return false;const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();return JSON.stringify(ka)===JSON.stringify(kb)&&ka.every(k=>same(a[k],b[k]));}
function valueAt(v,path){for(const k of path.split('.')){if(!v||typeof v!=='object'||!Object.hasOwn(v,k))return {present:false};v=v[k];}return {present:true,value:v};}
// Closed JSON scanner records physical property spans, rejects duplicate keys,
// and never serializes a user-owned object when removing an owned property.
function scanJson(text){let i=0;const ws=()=>{while(/\s/.test(text[i]??'')&&i<text.length)i++;};
 function string(){const a=i;if(text[i++]!=='"')fail('PRR-JSON');while(i<text.length){const c=text[i++];if(c==='\\'){i++;continue;}if(c==='"')return JSON.parse(text.slice(a,i));}fail('PRR-JSON');}
 function value(){ws();const start=i,c=text[i];if(c==='{'){i++;const props=[];ws();if(text[i]==='}')return {start,end:++i,props};while(true){ws();const propertyStart=i,key=string();if(props.some(p=>p.key===key))fail('PRR-DUPLICATE');ws();if(text[i++]!==':')fail('PRR-JSON');const child=value();ws();props.push({key,start:propertyStart,end:i,child});if(text[i]==='}'){i++;break;}if(text[i++]!==',')fail('PRR-JSON');}return {start,end:i,props};}if(c==='['){i++;ws();if(text[i]===']')return {start,end:++i};while(true){value();ws();if(text[i]===']'){i++;break;}if(text[i++]!==',')fail('PRR-JSON');}return {start,end:i};}if(c==='"'){string();return {start,end:i};}const m=text.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(!m)fail('PRR-JSON');i+=m[0].length;return {start,end:i};}
 const root=value();ws();if(i!==text.length)fail('PRR-JSON');JSON.parse(text);return root;
}
export function removeJsonOwnedPaths(bytes,paths){let text=bytes;
 for(const path of paths){let node=scanJson(text),property,parent;for(const key of path.split('.')){parent=node;if(!parent.props){property=null;break;}property=parent.props.find(p=>p.key===key);if(!property)break;node=property.child;}if(!property)continue;const index=parent.props.indexOf(property);let start=property.start,end=property.end;if(index+1<parent.props.length)end=parent.props[index+1].start;else if(index>0){start=parent.props[index-1].end;const comma=text.indexOf(',',start);if(comma>=property.start)fail('PRR-JSON');start=comma;}text=text.slice(0,start)+text.slice(end);}
 JSON.parse(text);return text;
}
function removeYamlPath(text,path){const lines=text.match(/[^\n]*\n|[^\n]+$/g)??[],keys=path.split('.');let range=[0,lines.length],indent=-1,start=-1;
 for(const key of keys){const hits=[];for(let i=range[0];i<range[1];i++){const m=lines[i].match(/^( *)([A-Za-z_][A-Za-z0-9_-]*)\s*:/);if(m&&m[2]===key&&m[1].length>indent){const candidateIndent=m[1].length;if(indent<0?candidateIndent===0:candidateIndent===indent+2)hits.push([i,candidateIndent]);}}if(hits.length===0)return text;if(hits.length!==1)fail('PRR-YAML-DUPLICATE');[start,indent]=hits[0];let end=start+1;while(end<range[1]){const m=lines[end].match(/^( *)(\S)/);if(m&&!/^\s*#/.test(lines[end])&&m[1].length<=indent)break;end++;}range=[start+1,end];}
 let end=range[1];while(end>start+1&&/^\s*(?:#.*)?(?:\r?\n)?$/.test(lines[end-1]))end--;
 return lines.slice(0,start).concat(lines.slice(end)).join('');
}
function removeTomlKeys(text,paths){if(paths.some(p=>p.includes('.')))fail('PRR-TOML-PATH');const lines=text.match(/[^\n]*\n|[^\n]+$/g)??[];let section=false;const seen=new Set(),out=[];for(const line of lines){if(/^\s*\[/.test(line))section=true;const m=!section?line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=/):null;if(m&&paths.includes(m[1])){if(seen.has(m[1]))fail('PRR-TOML-DUPLICATE');seen.add(m[1]);if(/'''|"""/.test(line))fail('PRR-TOML-MULTILINE');continue;}out.push(line);}return out.join('');}
export function planRuntimeProjectionOwnedRemoval({format,bytes,ownedKeys,expectedBytes}){
 if(typeof bytes!=='string'||typeof expectedBytes!=='string'||!Array.isArray(ownedKeys)||ownedKeys.length>32||new Set(ownedKeys).size!==ownedKeys.length||ownedKeys.some(p=>typeof p!=='string'||!/^\w+(?:\.\w+)*$/.test(p)))fail('PRR-INPUT');
 let after;
 if(format==='json'||format==='yaml'){const parse=format==='json'?JSON.parse:parseYaml,current=parse(bytes),expected=parse(expectedBytes);for(const key of ownedKeys){const actual=valueAt(current,key),want=valueAt(expected,key);if(actual.present&&(!want.present||!same(actual.value,want.value)))return {status:'conflict',code:'PRR-MODIFIED-OWNED-KEY',beforeSha256:sha(bytes),afterBytes:null,ownedKeys:[...ownedKeys]};}after=format==='json'?removeJsonOwnedPaths(bytes,ownedKeys):ownedKeys.reduce(removeYamlPath,bytes);}
 else if(format==='toml'){const values=text=>{const result={};let section=false;for(const line of text.split('\n')){if(/^\s*\[/.test(line))section=true;const m=!section?line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*?)\s*$/):null;if(m){if(Object.hasOwn(result,m[1]))fail('PRR-TOML-DUPLICATE');result[m[1]]=m[2];}}return result;};const a=values(bytes),b=values(expectedBytes);if(ownedKeys.some(k=>Object.hasOwn(a,k)&&a[k]!==b[k]))return {status:'conflict',code:'PRR-MODIFIED-OWNED-KEY',beforeSha256:sha(bytes),afterBytes:null,ownedKeys:[...ownedKeys]};after=removeTomlKeys(bytes,ownedKeys);}
 else fail('PRR-FORMAT');
 return Object.freeze({status:after===bytes?'absent':'ready',code:null,beforeSha256:sha(bytes),afterSha256:sha(after),afterBytes:after,ownedKeys:Object.freeze([...ownedKeys])});
}
