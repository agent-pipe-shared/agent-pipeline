// Controlled module fixtures execute exact Source adapter bytes. They are not native proof.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import * as crypto from 'node:crypto';
import * as paths from 'node:path';
import * as urls from 'node:url';
import {readFileSync as realRead} from 'node:fs';
const root=process.argv[2]?paths.resolve(process.argv[2]):paths.dirname(urls.fileURLToPath(import.meta.url));
const sha='a'.repeat(64),nativePs=realRead(paths.join(root,'windows-native-process-observer.ps1'));
const authorityPs=realRead(paths.join(root,'windows-owned-authority-native.ps1'));
const stat=(name)=>({dev:1,ino:1,size:100,mtimeMs:1,ctimeMs:1,mode:name==='/usr/bin/clang'?0o755:0o700,uid:name==='/usr/bin/clang'?0:501,nlink:1,isFile:()=>!['/fixture','/fixture/build','C:\\repo'].includes(name),isDirectory:()=>['/fixture','/fixture/build','C:\\repo'].includes(name),isSymbolicLink:()=>false});
const darwinRow=()=>{const argc=Buffer.alloc(4);argc.writeInt32LE(1);return JSON.stringify({pid:42,parentPid:41,group:40,session:40,uid:501,gid:20,ruid:501,rgid:20,svuid:501,svgid:20,start:'2000000000:123456',boot:'12345678-1234-1234-1234-123456789abc',executableHex:Buffer.from('/native/node').toString('hex'),cwdHex:Buffer.from('/repo').toString('hex'),procargsHex:Buffer.concat([argc,Buffer.from('/native/node\0\0/native/node\0')]).toString('hex')})+'\n';};
const winRow=()=>({status:'present',pid:42,parentPid:41,start:'638000000000000000',parentStart:'637900000000000000',sessionId:1,principalSid:'S-1-5-21',parentPrincipalSid:'S-1-5-21',executable:'C:\\node.exe',executableSha256:sha,executableFactsSha256:sha,argv:['C:\\node.exe'],commandLineSha256:sha,bootIdentity:'win32-boot-637000000000000000'});
async function fixture(platform,{advance=0,deny=false}={}){
 let clock=100,fd=1;const calls=[],files=new Map();
 const context=createContext({Buffer,TextDecoder,URL,console,process:{platform,pid:42,env:{},cwd:()=>platform==='win32'?'C:\\repo':'/repo',getuid:()=>501,once:()=>{}}});
 const fs={lstatSync:name=>stat(name),realpathSync:name=>name,readFileSync:name=>typeof name==='number'?authorityPs:files.get(name)??(String(name).endsWith('windows-native-process-observer.ps1')?nativePs:authorityPs),mkdtempSync:()=>'/fixture/build',chmodSync:()=>{},rmSync:()=>{},writeFileSync:(name,bytes)=>files.set(name,bytes),openSync:()=>fd++,fstatSync:()=>stat('source'),closeSync:()=>{},constants:{O_RDONLY:0,O_NOFOLLOW:0}};
 // Backend source() validates stat.size against read buffers only via inode CAS.
 const spawnSync=(executable,args,options)=>{
  calls.push({executable,args,options,clock});clock+=advance;
  if(deny)return {status:1,stdout:JSON.stringify({ok:false,code:'WIN-AUTH-PRINCIPAL',committed:false}),stderr:''};
  if(platform==='darwin')return {status:0,stdout:executable==='/usr/bin/xcode-select'?'/developer\n':executable==='/usr/bin/clang'?'':darwinRow(),stderr:''};
  if(options.input?.includes('"operation"')){
   const req=JSON.parse(options.input),facts='1:2:3:1:4:0:13949:5:6:0:7:'+sha;
   return {status:0,stderr:'',stdout:JSON.stringify({ok:true,facts,bytes:req.operation==='read-source'?nativePs.toString('base64'):null,committed:false})};
  }
  return {status:0,stderr:'',stdout:JSON.stringify(winRow())};
 };
 const supplied={'node:crypto':crypto,'node:fs':fs,'node:child_process':{spawnSync},'node:os':{tmpdir:()=>'/fixture'},'node:path':platform==='win32'?paths.win32:paths,'node:url':platform==='win32'?{...urls,fileURLToPath:value=>'C:\\fixture\\'+paths.basename(urls.fileURLToPath(value))}:urls,'node:perf_hooks':{performance:{now:()=>clock}},'./windows-private-state.mjs':{WINDOWS_POWERSHELL_PATHS:['C:\\Windows\\powershell.exe'],sanitizeChildEnvironment:()=>({})},'./successful-spawn.mjs':{isSuccessfulSpawn:r=>r.status===0},'./governance-event.mjs':{parseStrictJson:JSON.parse},'./codex-sandbox-compatibility.mjs':{canonicalJson:JSON.stringify}};
 const cache=new Map();
 async function load(name){
  if(cache.has(name))return cache.get(name);
  if(supplied[name]){const obj=supplied[name],mod=new SyntheticModule(Object.keys(obj),function(){for(const [k,v]of Object.entries(obj))this.setExport(k,v);},{context});cache.set(name,mod);return mod;}
  const file=paths.join(root,name.replace(/^\.\//,'')),mod=new SourceTextModule(realRead(file,'utf8'),{context,identifier:urls.pathToFileURL(file).href,initializeImportMeta:meta=>meta.url=urls.pathToFileURL(file).href});cache.set(name,mod);await mod.link(load);return mod;
 }
 const name=platform==='darwin'?'./darwin-native-process-observer.mjs':'./windows-native-process-observer.mjs';
 const mod=await load(name);await mod.evaluate();
 return {observer:mod.namespace[platform==='darwin'?'observeNativeDarwinProcess':'observeNativeWindowsProcess'],calls,get clock(){return clock;},load};
}
test('Darwin cold SDK/build/query stages clamp to one shared deadline (controlled)',async()=>{const f=await fixture('darwin',{advance:200});const r=f.observer({pid:42},{deadlineMs:1100});assert.equal(r.status,'present');assert.deepEqual(f.calls.map(x=>x.options.timeout),[1000,800,600]);assert.equal(f.clock,700);});
test('Darwin cold build exhausts remaining deadline; no query starts (controlled)',async()=>{const f=await fixture('darwin',{advance:500});const r=f.observer({pid:42},{deadlineMs:1100});assert.equal(r.code,'darwin-observer-deadline');assert.equal(f.calls.length,2);assert.deepEqual(f.calls.map(x=>x.options.timeout),[1000,500]);});
test('Darwin default callers keep original stage limits (controlled)',async()=>{const f=await fixture('darwin');assert.equal(f.observer({pid:42}).status,'present');assert.deepEqual(f.calls.map(x=>x.options.timeout),[2000,30000,2000]);});
test('Darwin expired deadline starts no compiler/SDK/query (controlled)',async()=>{const f=await fixture('darwin');assert.equal(f.observer({pid:42},{deadlineMs:100}).code,'darwin-observer-deadline');assert.equal(f.calls.length,0);});
test('Windows custody/native/custody stages consume shared remaining deadline (controlled)',async()=>{const f=await fixture('win32',{advance:100});assert.equal(f.observer({pid:42},{deadlineMs:1100}).status,'present');assert.deepEqual(f.calls.map(x=>x.options.timeout),[1000,900,800,700,600]);assert.equal(f.clock,600);});
test('Windows custody read exhaustion forbids next native child (controlled)',async()=>{const f=await fixture('win32',{advance:500});assert.equal(f.observer({pid:42},{deadlineMs:1100}).reason,'WPO-DEADLINE');assert.equal(f.calls.length,2);assert.deepEqual(f.calls.map(x=>x.options.timeout),[1000,500]);});
test('Windows default custody/native limits and principal refusal stay unchanged (controlled)',async()=>{const f=await fixture('win32');assert.equal(f.observer({pid:42}).status,'present');assert.deepEqual(f.calls.map(x=>x.options.timeout),[15000,15000,15000,15000,15000]);const denied=await fixture('win32',{deny:true});assert.equal(denied.observer({pid:42},{deadlineMs:1100}).reason,'WPO-OBSERVATION-UNAVAILABLE');assert.equal(denied.calls.length,1);});
test('Windows expired deadline starts no custody/native child (controlled)',async()=>{const f=await fixture('win32');assert.equal(f.observer({pid:42},{deadlineMs:100}).reason,'WPO-DEADLINE');assert.equal(f.calls.length,0);});
