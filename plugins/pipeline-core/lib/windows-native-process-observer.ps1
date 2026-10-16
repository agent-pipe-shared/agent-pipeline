$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$NativeUtf8=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=$NativeUtf8
[Console]::OutputEncoding=$NativeUtf8
$OutputEncoding=$NativeUtf8
# Fixed source-only read operations. Input can select only one bounded PID.
# BEGIN pipeline-native-type-cache v1 (byte-identical in both native helpers; a pin compares the copies)
# The C# type is compiled once per user and exact source, then loaded only from bytes verified in the same call.
function Test-PipelinePrivateAcl($acl,[string]$sid) {
 if($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid){return $false}
 $rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]))
 if($rules.Count -eq 0){return $false}
 foreach($rule in $rules){if($rule.IdentityReference.Value -ne $sid -or $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow){return $false}}
 return $true
}
function Get-PipelineSha256([byte[]]$bytes) {
 $hash=[System.Security.Cryptography.SHA256]::Create()
 try{return [System.BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
}
function Import-PipelineVerifiedAssembly([string]$dir,[string]$prefix,[string]$sid,[string]$typeName) {
 $names=@();try{$names=@([System.IO.Directory]::GetFiles($dir,$prefix+'.*.dll'))}catch{return}
 [System.Array]::Sort($names)
 $tried=0
 foreach($file in $names){
  if($tried -ge 8){break}
  $tried++
  $bytes=$null
  $expected=[regex]::Match([System.IO.Path]::GetFileName($file),'^'+[regex]::Escape($prefix)+'\.([0-9a-f]{64})\.dll$')
  if(-not $expected.Success){continue}
  $stream=$null
  try{
   if(([System.IO.File]::GetAttributes($file) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0){continue}
   $stream=[System.IO.FileStream]::new($file,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read)
   if(-not (Test-PipelinePrivateAcl ($stream.GetAccessControl()) $sid)){continue}
   if($stream.Length -lt 1024 -or $stream.Length -gt 4194304){continue}
   $buffer=[byte[]]::new([int]$stream.Length);$at=0
   while($at -lt $buffer.Length){$count=$stream.Read($buffer,$at,$buffer.Length-$at);if($count -le 0){break};$at+=$count}
   if($at -eq $buffer.Length -and (Get-PipelineSha256 $buffer) -eq $expected.Groups[1].Value){$bytes=$buffer}
  }catch{$bytes=$null}finally{if($null -ne $stream){$stream.Dispose()}}
  if($null -eq $bytes){continue}
  $assembly=$null
  try{$assembly=[System.Reflection.Assembly]::Load($bytes)}catch{continue}
  if($null -eq $assembly.GetType($typeName,$false)){throw 'PIPELINE-NATIVE-TYPE-MISSING'}
  $script:PipelineNativeTypeLoaded=$true
  return
 }
}
function Test-PipelinePrivateDirectory([string]$dir,[string]$sid) {
 try{
  $attributes=[System.IO.File]::GetAttributes($dir)
  $acl=[System.IO.Directory]::GetAccessControl($dir,[System.Security.AccessControl.AccessControlSections]'Access,Owner')
  if(($attributes -band [System.IO.FileAttributes]::Directory) -eq 0 -or ($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or -not $acl.AreAccessRulesProtected){return $false}
  return (Test-PipelinePrivateAcl $acl $sid)
 }catch{return $false}
}
function Import-PipelineNativeType([string]$source,[string]$tag,[string]$typeName,[string]$cacheRoot='') {
 $script:PipelineNativeTypeLoaded=$false
 $dir=$null;$prefix=$null;$sid=$null
 try{
  $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $runtime=[string]::Join('|',@('v1',$tag,$PSVersionTable.PSVersion.ToString(),$PSVersionTable.CLRVersion.ToString(),[System.Diagnostics.FileVersionInfo]::GetVersionInfo([object].Assembly.Location).FileVersion,[Environment]::Is64BitProcess.ToString(),[Environment]::Is64BitOperatingSystem.ToString(),[string]$env:PROCESSOR_ARCHITECTURE))
  $prefix=$tag+'-'+(Get-PipelineSha256 ([System.Text.Encoding]::UTF8.GetBytes($runtime+[string][char]10+$source))).Substring(0,32)
  $root=$cacheRoot
  if([string]::IsNullOrEmpty($root)){$root=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)}
  if([string]::IsNullOrEmpty($root)){throw 'PIPELINE-NATIVE-CACHE-ROOT'}
  $dir=[System.IO.Path]::Combine($root,'agent-pipeline-native-cache')
  if(-not [System.IO.Directory]::Exists($dir)){
   $account=[System.Security.Principal.SecurityIdentifier]::new($sid)
   $security=[System.Security.AccessControl.DirectorySecurity]::new()
   $security.SetOwner($account)
   $security.SetAccessRuleProtection($true,$false)
   $security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($account,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow))
   [void][System.IO.Directory]::CreateDirectory($dir,$security)
  }
  if(-not (Test-PipelinePrivateDirectory $dir $sid)){$dir=$null}
 }catch{$dir=$null}
 if($null -ne $dir){
  Import-PipelineVerifiedAssembly $dir $prefix $sid $typeName
  if(-not $script:PipelineNativeTypeLoaded){
   $build=[System.IO.Path]::Combine($dir,'b'+[Guid]::NewGuid().ToString('N')+'.dll')
   try{
    Add-Type -TypeDefinition $source -OutputAssembly $build
    $built=[System.IO.File]::ReadAllBytes($build)
    [System.IO.File]::Move($build,[System.IO.Path]::Combine($dir,$prefix+'.'+(Get-PipelineSha256 $built)+'.dll'))
   }catch{}finally{try{[System.IO.File]::Delete($build)}catch{}}
   Import-PipelineVerifiedAssembly $dir $prefix $sid $typeName
  }
 }
 if(-not $script:PipelineNativeTypeLoaded){Add-Type -TypeDefinition $source}
}
# END pipeline-native-type-cache v1
try {
$PipelineNativeSource=@'
using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Security.Principal;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class PipelineProcessObserver {
 [StructLayout(LayoutKind.Sequential)] public struct FileInfo { public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write; public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow; }
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr h,out long creation,out long exit,out long kernel,out long user);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ProcessIdToSessionId(uint pid,out uint session);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageNameW(IntPtr h,uint flags,StringBuilder path,ref uint count);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr h,uint access,out IntPtr token);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CommandLineToArgvW(string text,out int count);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint access,uint share,IntPtr sa,uint disposition,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out FileInfo info);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder path,uint count,uint flags);
 [DllImport("advapi32.dll",SetLastError=true)] static extern uint GetSecurityInfo(SafeFileHandle h,int type,uint parts,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
 [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr p);
 public sealed class ProcessFact { public uint pid,sessionId; public string start,principalSid,executable; }
 public sealed class ImageFact { public string sha256,factsSha256; }
 static Exception Refuse(string code) { return new InvalidOperationException(code); }
 // Fixed Windows servicing principal; no caller-provided account/ACL exceptions.
 static bool Trusted(string sid,string current) { return sid==current||sid=="S-1-5-18"||sid=="S-1-5-32-544"||sid=="S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"; }
 public static string Hash(byte[] bytes) { using(var sha=SHA256.Create())return String.Concat(sha.ComputeHash(bytes).Select(v=>v.ToString("x2"))); }
 public static string TextHash(string text) { return Hash(new UTF8Encoding(false,true).GetBytes(text)); }
 public static IntPtr Open(uint pid) { var h=OpenProcess(0x1000,false,pid);if(h==IntPtr.Zero)throw Refuse(Marshal.GetLastWin32Error()==87?"WPO-ABSENT":"WPO-PROCESS-ACCESS");return h; }
 public static ProcessFact Observe(IntPtr h,uint pid) {
  long creation,exit,kernel,user;uint code,session;var path=new StringBuilder(32768);uint length=32768;
  if(!GetProcessTimes(h,out creation,out exit,out kernel,out user)||!GetExitCodeProcess(h,out code)||code!=259||exit!=0||!ProcessIdToSessionId(pid,out session)||!QueryFullProcessImageNameW(h,0,path,ref length)||length==0||length>=32768)throw Refuse("WPO-PROCESS-CHANGED");
  IntPtr token;if(!OpenProcessToken(h,8,out token))throw Refuse("WPO-TOKEN-ACCESS");string sid;try{using(var identity=new WindowsIdentity(token)){if(identity.User==null)throw Refuse("WPO-TOKEN-SID");sid=identity.User.Value;}}finally{CloseHandle(token);}
  return new ProcessFact{pid=pid,start=DateTime.FromFileTimeUtc(creation).Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture),sessionId=session,principalSid=sid,executable=path.ToString()};
 }
 public static bool Same(ProcessFact a,ProcessFact b) { return a.pid==b.pid&&a.start==b.start&&a.sessionId==b.sessionId&&a.principalSid==b.principalSid&&String.Equals(a.executable,b.executable,StringComparison.OrdinalIgnoreCase); }
 // CIM_DATETIME has microsecond precision. Keep exact HANDLE ticks as identity;
 // compare only the independently supplied CIM timestamp at its actual precision.
 public static bool SameCimCreation(ProcessFact process,DateTime creation) { return Int64.Parse(process.start,System.Globalization.CultureInfo.InvariantCulture)/10==creation.ToUniversalTime().Ticks/10; }
 public static string[] Argv(string text) { if(String.IsNullOrEmpty(text)||text.Length>32768||text.IndexOf('\0')>=0)throw Refuse("WPO-COMMAND-LINE");int count;var p=CommandLineToArgvW(text,out count);if(p==IntPtr.Zero)throw Refuse("WPO-ARGV");try{if(count<1||count>256)throw Refuse("WPO-ARGV");var argv=new string[count];for(int n=0;n<count;n++){argv[n]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(p,n*IntPtr.Size));if(argv[n]==null||argv[n].Length>32768)throw Refuse("WPO-ARGV");}return argv;}finally{LocalFree(p);} }
 static string Canonical(string p) { if(String.IsNullOrEmpty(p)||p.Length>32768||p.IndexOf('\0')>=0||p.StartsWith(@"\\")||p.Length<3||p.Substring(2).Contains(":"))throw Refuse("WPO-IMAGE-PATH");string full=Path.GetFullPath(p);if(!String.Equals(full,p,StringComparison.OrdinalIgnoreCase))throw Refuse("WPO-IMAGE-PATH");return full.TrimEnd('\\'); }
 static string Facts(SafeFileHandle h,string p,bool directory) {
  FileInfo i;var final=new StringBuilder(32768);uint length=GetFinalPathNameByHandleW(h,final,32768,0);if(!GetFileInformationByHandle(h,out i)||length==0||length>=32768)throw Refuse("WPO-IMAGE-IDENTITY");string actual=final.ToString();if(actual.StartsWith(@"\\?\"))actual=actual.Substring(4);
  if((i.Attributes&0x400)!=0||((i.Attributes&0x10)!=0)!=directory||(!directory&&i.Links<1)||!String.Equals(actual.TrimEnd('\\'),Canonical(p),StringComparison.OrdinalIgnoreCase))throw Refuse("WPO-IMAGE-ALIAS");
  IntPtr owner,group,dacl,sacl,sd;if(GetSecurityInfo(h,1,5,out owner,out group,out dacl,out sacl,out sd)!=0||sd==IntPtr.Zero)throw Refuse("WPO-IMAGE-SECURITY");
  try{uint size=GetSecurityDescriptorLength(sd);if(size==0||size>65536)throw Refuse("WPO-IMAGE-SECURITY");var raw=new byte[size];Marshal.Copy(sd,raw,0,(int)size);var security=new RawSecurityDescriptor(raw,0);string current=WindowsIdentity.GetCurrent().User.Value;if(security.Owner==null||security.DiscretionaryAcl==null||security.DiscretionaryAcl.Count==0)throw Refuse("WPO-IMAGE-DACL");if(!Trusted(security.Owner.Value,current))throw Refuse("WPO-IMAGE-OWNER");foreach(GenericAce ace in security.DiscretionaryAcl){var a=ace as CommonAce;if(a==null||a.IsCallback)throw Refuse("WPO-IMAGE-DACL");if((a.AceFlags&AceFlags.InheritOnly)!=0)continue;string sid=a.SecurityIdentifier.Value;int mutation=unchecked((int)(directory?0x500D0040u:0x500D0116u));if(a.AceQualifier==AceQualifier.AccessAllowed&&(a.AccessMask&mutation)!=0&&!Trusted(sid,current))throw Refuse("WPO-IMAGE-MUTATION");}
   return i.Volume+":"+i.IndexHigh+":"+i.IndexLow+":"+i.Links+":"+i.Attributes+":"+i.SizeHigh+":"+i.SizeLow+":"+i.Creation.dwHighDateTime+":"+i.Creation.dwLowDateTime+":"+i.Write.dwHighDateTime+":"+i.Write.dwLowDateTime+":"+Hash(raw);
  }finally{LocalFree(sd);}
 }
 static SafeFileHandle File(string path,bool directory) { var h=CreateFileW(path,0x80020000,1,IntPtr.Zero,3,0x00200000u|(directory?0x02000000u:0u),IntPtr.Zero);if(h.IsInvalid){h.Dispose();throw Refuse("WPO-IMAGE-OPEN");}try{Facts(h,path,directory);return h;}catch{h.Dispose();throw;} }
 public static ImageFact Image(string path) {
  Canonical(path);var directories=new System.Collections.Generic.List<SafeFileHandle>();var names=new System.Collections.Generic.List<string>();var facts=new System.Collections.Generic.List<string>();
  try{string cursor=Path.GetDirectoryName(path);while(cursor!=null){if(names.Count>=64)throw Refuse("WPO-IMAGE-DEPTH");var h=File(cursor,true);directories.Add(h);names.Add(cursor);facts.Add(Facts(h,cursor,true));string parent=Path.GetDirectoryName(cursor);if(parent==null)break;cursor=parent;}
   using(var h=File(path,false)){string before=Facts(h,path,false);byte[] bytes;using(var stream=new FileStream(new SafeFileHandle(h.DangerousGetHandle(),false),FileAccess.Read,65536,false)){if(stream.Length<64||stream.Length>134217728)throw Refuse("WPO-IMAGE-SIZE");bytes=new byte[(int)stream.Length];int offset=0;while(offset<bytes.Length){int n=stream.Read(bytes,offset,bytes.Length-offset);if(n==0)throw Refuse("WPO-IMAGE-RACE");offset+=n;}}
    int pe=BitConverter.ToInt32(bytes,60);if(bytes[0]!=77||bytes[1]!=90||pe<64||pe>bytes.Length-4||bytes[pe]!=80||bytes[pe+1]!=69||bytes[pe+2]!=0||bytes[pe+3]!=0)throw Refuse("WPO-IMAGE-PE");if(before!=Facts(h,path,false))throw Refuse("WPO-IMAGE-RACE");using(var named=File(path,false)){if(before!=Facts(named,path,false))throw Refuse("WPO-IMAGE-RACE");}for(int n=0;n<names.Count;n++){if(facts[n]!=Facts(directories[n],names[n],true))throw Refuse("WPO-IMAGE-RACE");using(var named=File(names[n],true)){if(facts[n]!=Facts(named,names[n],true))throw Refuse("WPO-IMAGE-RACE");}}return new ImageFact{sha256=Hash(bytes),factsSha256=TextHash(before)};
   }
  }finally{foreach(var h in directories)h.Dispose();}
 }
}
'@
 Import-PipelineNativeType $PipelineNativeSource 'process-observer' 'PipelineProcessObserver'
 $raw=[Console]::In.ReadToEnd();if($raw.Length -gt 64){throw 'WPO-INPUT'}
 $request=ConvertFrom-Json -InputObject $raw
 if(@($request.PSObject.Properties.Name).Count -ne 1 -or $null -eq $request.pid -or ($request.pid -isnot [long] -and $request.pid -isnot [int]) -or $request.pid -lt 1 -or $request.pid -gt 2147483647){throw 'WPO-INPUT'}
 $id=[uint32]$request.pid;$handle=[PipelineProcessObserver]::Open($id);$parentHandle=[IntPtr]::Zero
 try {
  $first=[PipelineProcessObserver]::Observe($handle,$id)
  $cim=@(Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = '+$id));if($cim.Count -ne 1){throw 'WPO-CIM-UNAVAILABLE'};$cim=$cim[0]
  if(-not [PipelineProcessObserver]::SameCimCreation($first,$cim.CreationDate) -or [uint32]$cim.SessionId -ne $first.sessionId -or -not [string]::Equals([string]$cim.ExecutablePath,$first.executable,[StringComparison]::OrdinalIgnoreCase)){throw 'WPO-CIM-CHANGED'}
  $parentId=[uint32]$cim.ParentProcessId;if($parentId -eq 0 -or $parentId -eq $id){throw 'WPO-PARENT-UNAVAILABLE'};try{$parentHandle=[PipelineProcessObserver]::Open($parentId)}catch{throw 'WPO-PARENT-UNAVAILABLE'};$parent=[PipelineProcessObserver]::Observe($parentHandle,$parentId)
  $boot=@(Get-CimInstance -ClassName Win32_OperatingSystem);if($boot.Count -ne 1){throw 'WPO-BOOT-UNAVAILABLE'};$bootTicks=$boot[0].LastBootUpTime.ToUniversalTime().Ticks.ToString()
  if([long]$first.start -lt [long]$bootTicks -or [long]$parent.start -lt [long]$bootTicks -or [long]$parent.start -gt [long]$first.start){throw 'WPO-INCARNATION-CHANGED'}
  $line=[string]$cim.CommandLine;$argv=[PipelineProcessObserver]::Argv($line);$image=[PipelineProcessObserver]::Image($first.executable)
  $again=@(Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = '+$id));if($again.Count -ne 1){throw 'WPO-CIM-CHANGED'};$again=$again[0]
  $bootAgain=@(Get-CimInstance -ClassName Win32_OperatingSystem)
  if($bootAgain.Count -ne 1 -or $bootTicks -ne $bootAgain[0].LastBootUpTime.ToUniversalTime().Ticks.ToString() -or -not [PipelineProcessObserver]::SameCimCreation($first,$again.CreationDate) -or [uint32]$again.ParentProcessId -ne $parentId -or [uint32]$again.SessionId -ne $first.sessionId -or [string]$again.CommandLine -cne $line -or -not [string]::Equals([string]$again.ExecutablePath,$first.executable,[StringComparison]::OrdinalIgnoreCase) -or -not [PipelineProcessObserver]::Same($first,[PipelineProcessObserver]::Observe($handle,$id)) -or -not [PipelineProcessObserver]::Same($parent,[PipelineProcessObserver]::Observe($parentHandle,$parentId))){throw 'WPO-PROCESS-CHANGED'}
  $imageAgain=[PipelineProcessObserver]::Image($first.executable);if($image.sha256 -ne $imageAgain.sha256 -or $image.factsSha256 -ne $imageAgain.factsSha256 -or -not [PipelineProcessObserver]::Same($first,[PipelineProcessObserver]::Observe($handle,$id)) -or -not [PipelineProcessObserver]::Same($parent,[PipelineProcessObserver]::Observe($parentHandle,$parentId))){throw 'WPO-PROCESS-CHANGED'}
  [pscustomobject]@{status='present';pid=$id;parentPid=$parentId;start=$first.start;parentStart=$parent.start;sessionId=$first.sessionId;principalSid=$first.principalSid;parentPrincipalSid=$parent.principalSid;executable=$first.executable;executableSha256=$image.sha256;executableFactsSha256=$image.factsSha256;argv=@($argv);commandLineSha256=[PipelineProcessObserver]::TextHash($line);bootIdentity=('win32-boot-'+$bootTicks)}|ConvertTo-Json -Depth 4 -Compress
 } finally {if($parentHandle -ne [IntPtr]::Zero){[void][PipelineProcessObserver]::CloseHandle($parentHandle)};[void][PipelineProcessObserver]::CloseHandle($handle)}
} catch {
 $errorObject=$_.Exception;while($errorObject.InnerException){$errorObject=$errorObject.InnerException}
 $code='WPO-NATIVE-UNAVAILABLE';if($errorObject.Message -match '^WPO-[A-Z-]{1,64}$'){$code=$errorObject.Message}
 if($code -eq 'WPO-ABSENT'){[pscustomobject]@{status='absent';pid=$request.pid}|ConvertTo-Json -Compress}else{[pscustomobject]@{status='unavailable';reason=$code}|ConvertTo-Json -Compress}
}
