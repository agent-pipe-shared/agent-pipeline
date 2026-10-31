// SPDX-License-Identifier: SUL-1.0
// Test-only: install before any fixture imports; never resolve the host account.
import os from 'node:os';
import {syncBuiltinESMExports} from 'node:module';
import {lstatSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePrivateParent,validateCreatedHome} from '../scripts/codex-critic-private-parent-fixture.mjs';
const source=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const parent=join(source,'scratch/po-discard-isolation');
mkdirSync(parent,{recursive:true,mode:0o700});
const area=mkdtempSync(join(parent,'owned-')),temp=join(area,'temp');
const privateParent=process.env.PO_DISCARD_PRIVATE_PARENT;
if(privateParent)validatePrivateParent(privateParent);
// Without an explicit private parent the synthetic home must still hold a Linux socket address (the session power address
// namespace lives under it: 107 bytes in all, and no group/world-writable ancestor), which a home inside any realistic
// checkout never does and a directory under a sticky temporary directory cannot. Take a short directory under the process's
// own private HOME (the Full Verify gives one; a shell has its own), captured before HOME is replaced below. With no usable
// HOME the previous in-checkout location is kept.
const hostHome=process.env.HOME;
const shortHomeParent=privateParent||!hostHome||!isAbsolute(hostHome)||Buffer.byteLength(hostHome)>40?null:mkdtempSync(join(hostHome,'p-'));
const home=privateParent?mkdtempSync(join(privateParent,'g17c-')):shortHomeParent??join(area,'home');
if(privateParent)validateCreatedHome(home);else if(!shortHomeParent)mkdirSync(home,{mode:0o700});
mkdirSync(temp,{mode:0o700});
const areaIdentity=lstatSync(area),homeIdentity=lstatSync(home);
os.userInfo=()=>({uid:process.getuid?.()??0,gid:process.getgid?.()??0,username:'synthetic-fixture',homedir:home,shell:'/bin/sh'});
os.homedir=()=>home;os.tmpdir=()=>temp;syncBuiltinESMExports();
Object.assign(process.env,{HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:join(home,'config'),XDG_STATE_HOME:join(home,'state'),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:join(home,'gitconfig')});
process.on('exit',()=>{
 const removeOwned=(path,identity)=>{const present=lstatSync(path,{throwIfNoEntry:false});if(present?.isDirectory()&&!present.isSymbolicLink()&&present.dev===identity.dev&&present.ino===identity.ino)rmSync(path,{recursive:true,force:true});};
 if(privateParent)removeOwned(home,homeIdentity);
 if(shortHomeParent)removeOwned(home,homeIdentity);
 removeOwned(area,areaIdentity);
});
