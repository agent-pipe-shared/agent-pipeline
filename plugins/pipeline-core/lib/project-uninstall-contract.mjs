// SPDX-License-Identifier: SUL-1.0
// Bounded validator for the exact uninstall schema keyword set; no unchecked
// unions or references delegated to the legacy limited schema validator.
import {readFileSync} from 'node:fs';
const contracts=new Map();
const types=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
function matches(value,schema){
 if(schema.anyOf)return schema.anyOf.some(branch=>matches(value,branch));
 if(Object.hasOwn(schema,'const')&&value!==schema.const)return false;
 if(schema.enum&&!schema.enum.includes(value))return false;
 if(schema.type){const actual=types(value);if(schema.type==='integer'?!Number.isInteger(value):actual!==schema.type)return false;}
 if(typeof value==='string'&&schema.pattern&&!new RegExp(schema.pattern).test(value))return false;
 if(typeof value==='number'&&(schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum))return false;
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  if((schema.required??[]).some(key=>!Object.hasOwn(value,key)))return false;
  if(schema.additionalProperties===false&&Object.keys(value).some(key=>!Object.hasOwn(schema.properties??{},key)))return false;
  for(const [key,child] of Object.entries(schema.properties??{}))if(Object.hasOwn(value,key)&&!matches(value[key],child))return false;
 }
 return !Array.isArray(value)||!schema.items||value.every(item=>matches(item,schema.items));
}
export function validateUninstallContract(kind,value){
 if(!['request','plan','journal'].includes(kind))return false;
 if(!contracts.has(kind))contracts.set(kind,JSON.parse(readFileSync(new URL('../schemas/project-uninstall-'+kind+'.schema.json',import.meta.url),'utf8')));
 return matches(value,contracts.get(kind));
}
