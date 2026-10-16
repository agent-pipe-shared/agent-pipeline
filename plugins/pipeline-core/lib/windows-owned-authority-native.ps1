$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# This helper is invoked only by the source-hash-bound JS backend. No shell path
# or command text comes from a record. All filesystem operations use native handles.
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
$PipelineNativeSource=@'
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class PipelineOwnedAuthorityNative {
 [StructLayout(LayoutKind.Sequential)] public struct Info { public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write; public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow; }
 [StructLayout(LayoutKind.Sequential)] struct SA { public int Length; public IntPtr Descriptor; public bool Inherit; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint access,uint share,IntPtr sa,uint disposition,uint flags,IntPtr template);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true,EntryPoint="CreateFileW")] static extern SafeFileHandle CreatePrivateFile(string p,uint access,uint share,ref SA sa,uint disposition,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info info);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder b,uint size,uint flags);
 [DllImport("advapi32.dll",SetLastError=true)] static extern uint GetSecurityInfo(SafeFileHandle h,int type,uint parts,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
 [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr p);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string text,uint rev,out IntPtr descriptor,out uint size);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool FlushFileBuffers(SafeFileHandle h);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileTime(SafeFileHandle h,ref System.Runtime.InteropServices.ComTypes.FILETIME creation,IntPtr access,IntPtr write);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool MoveFileExW(string from,string to,uint flags);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectoryW(string p,ref SA sa);
 [StructLayout(LayoutKind.Sequential)] struct Disposition { public byte Delete; }
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle h,int type,ref Disposition info,uint size);
 public static string CurrentSid { get { return WindowsIdentity.GetCurrent().User.Value; } }
 static Exception Refuse(string code) { return new InvalidOperationException(code); }
 public static string Hash(byte[] b) { using(var h=SHA256.Create())return String.Concat(h.ComputeHash(b).Select(v=>v.ToString("x2"))); }
 static string Canonical(string p) { if(String.IsNullOrEmpty(p)||p.Length>32768||p.IndexOf('\0')>=0)throw Refuse("WIN-AUTH-PATH"); string full=Path.GetFullPath(p); if(!String.Equals(full,p,StringComparison.OrdinalIgnoreCase)||p.StartsWith(@"\\")||p.Substring(2).Contains(":"))throw Refuse("WIN-AUTH-PATH"); return full.TrimEnd('\\'); }
 static string Final(SafeFileHandle h) { var b=new StringBuilder(32768);uint n=GetFinalPathNameByHandleW(h,b,32768,0);if(n==0||n>=32768)throw Refuse("WIN-AUTH-FINAL-PATH");string p=b.ToString();if(p.StartsWith(@"\\?\"))p=p.Substring(4);return p.TrimEnd('\\'); }
 public static SafeFileHandle Open(string p,bool directory,bool write=false,bool privateOnly=true) { Canonical(p);var h=CreateFileW(p,0x80000000u|0x00020000u|(write?0x40000000u:0u),1,IntPtr.Zero,3,0x00200000u|(directory?0x02000000u:0u),IntPtr.Zero);if(h.IsInvalid){h.Dispose();throw Refuse("WIN-AUTH-OPEN");}try{Verify(h,p,directory,privateOnly);return h;}catch{h.Dispose();throw;} }
 // Publication keeps one live, write-capable directory custody handle through move and flush.
 // Compatible WRITE sharing is restricted to this parent; DELETE sharing remains refused.
 // Private-file and temp handles retain their original exclusive sharing/custody checks.
 static SafeFileHandle OpenPublicationParent(string p) { Canonical(p);var h=CreateFileW(p,0xC0020000u,3,IntPtr.Zero,3,0x02200000u,IntPtr.Zero);if(h.IsInvalid){h.Dispose();throw Refuse("WIN-AUTH-OPEN");}try{Verify(h,p,true,true);return h;}catch{h.Dispose();throw;} }
 public static string Verify(SafeFileHandle h,string p,bool directory,bool privateOnly,bool sourceImage=false) {
  if(sourceImage&&(directory||privateOnly))throw Refuse("WIN-AUTH-INPUT");
  Info i;if(!GetFileInformationByHandle(h,out i))throw Refuse("WIN-AUTH-FILE-ID");
  if((i.Attributes&0x400)!=0||((i.Attributes&0x10)!=0)!=directory||(!directory&&(sourceImage?i.Links<1:i.Links!=1))||!String.Equals(Final(h),Canonical(p),StringComparison.OrdinalIgnoreCase))throw Refuse("WIN-AUTH-ALIAS");
  IntPtr owner,group,dacl,sacl,sd;uint rc=GetSecurityInfo(h,1,5,out owner,out group,out dacl,out sacl,out sd);if(rc!=0||sd==IntPtr.Zero)throw Refuse("WIN-AUTH-SECURITY");
  try{uint length=GetSecurityDescriptorLength(sd);if(length==0||length>65536)throw Refuse("WIN-AUTH-SECURITY");byte[] raw=new byte[length];Marshal.Copy(sd,raw,0,(int)length);var security=new RawSecurityDescriptor(raw,0);if(security.Owner==null||security.DiscretionaryAcl==null||security.DiscretionaryAcl.Count==0)throw Refuse("WIN-AUTH-DACL");if(privateOnly){if(security.Owner.Value!=CurrentSid)throw Refuse("WIN-AUTH-OWNER");if((security.ControlFlags&ControlFlags.DiscretionaryAclProtected)==0)throw Refuse("WIN-AUTH-DACL");foreach(GenericAce ace in security.DiscretionaryAcl){var known=ace as CommonAce;if(known==null||known.IsCallback||known.SecurityIdentifier.Value!=CurrentSid)throw Refuse("WIN-AUTH-DACL");}}
   if(!privateOnly){string sid=security.Owner.Value;if(sid!=CurrentSid&&sid!="S-1-5-18"&&sid!="S-1-5-32-544")throw Refuse("WIN-AUTH-ANCESTOR-OWNER");foreach(GenericAce ace in security.DiscretionaryAcl){var common=ace as CommonAce;if(common==null||common.IsCallback)throw Refuse("WIN-AUTH-ANCESTOR-ACL");string principal=common.SecurityIdentifier.Value;if(common.AceQualifier==AceQualifier.AccessAllowed&&(common.AccessMask&unchecked((int)0x500D0156))!=0&&principal!=CurrentSid&&principal!="S-1-5-18"&&principal!="S-1-5-32-544")throw Refuse("WIN-AUTH-ANCESTOR-MUTATION");}}
   return i.Volume+":"+i.IndexHigh+":"+i.IndexLow+":"+i.Links+":"+i.Attributes+":"+(directory?"directory":i.SizeHigh+":"+i.SizeLow)+":"+unchecked((uint)i.Creation.dwHighDateTime)+":"+unchecked((uint)i.Creation.dwLowDateTime)+":"+(directory?"directory":unchecked((uint)i.Write.dwHighDateTime)+":"+unchecked((uint)i.Write.dwLowDateTime))+":"+Hash(raw);
  }finally{LocalFree(sd);}
 }
 static byte[] Once(SafeFileHandle h,int max) { using(var f=new FileStream(h,FileAccess.Read,65536,false)){f.Position=0;if(f.Length>max)throw Refuse("WIN-AUTH-SIZE");var b=new byte[(int)f.Length];int at=0;while(at<b.Length){int n=f.Read(b,at,b.Length-at);if(n==0)throw Refuse("WIN-AUTH-RACE");at+=n;}return b;} }
 // FileStream owns its handle. Each pass uses a non-owning wrapper for the same
 // live native HANDLE; the original custody handle remains open throughout.
 static byte[] Pass(SafeFileHandle h,int max) { return Once(new SafeFileHandle(h.DangerousGetHandle(),false),max); }
 public static byte[] Read(string p,int max,out string facts,bool privateOnly=true) { using(var h=Open(p,false,false,privateOnly)){string before=Verify(h,p,false,privateOnly);byte[] first=Pass(h,max);string middle=Verify(h,p,false,privateOnly);byte[] second=Pass(h,max);string after=Verify(h,p,false,privateOnly);if(before!=middle||middle!=after||!first.SequenceEqual(second))throw Refuse("WIN-AUTH-RACE");facts=after;return first;} }
 // Executable image references never return binary bytes or relax private-file custody.
 const long ImageMaximum=134217728;
 static string ImagePass(SafeFileHandle h,out long size) {
  using(var f=new FileStream(new SafeFileHandle(h.DangerousGetHandle(),false),FileAccess.Read,65536,false)){
   f.Position=0;if(f.Length>ImageMaximum)throw Refuse("WIN-AUTH-IMAGE-SIZE");long length=f.Length;size=0;
   using(var digest=SHA256.Create()){byte[] buffer=new byte[65536];int count;
    while((count=f.Read(buffer,0,buffer.Length))!=0){size+=count;if(size>ImageMaximum||size>length)throw Refuse("WIN-AUTH-IMAGE-SIZE");digest.TransformBlock(buffer,0,count,buffer,0);}
    if(size!=length||f.Length!=length)throw Refuse("WIN-AUTH-RACE");digest.TransformFinalBlock(new byte[0],0,0);return String.Concat(digest.Hash.Select(v=>v.ToString("x2")));
   }
  }
 }
 public static string InspectSourceImage(string p,out string facts,out long size) {
  Canonical(p);var h=CreateFileW(p,0x80020000u,1,IntPtr.Zero,3,0x00200000u,IntPtr.Zero);
  if(h.IsInvalid){h.Dispose();throw Refuse("WIN-AUTH-OPEN");}
  using(h){string before=Verify(h,p,false,false,true);long firstSize,secondSize;
   string first=ImagePass(h,out firstSize),middle=Verify(h,p,false,false,true),second=ImagePass(h,out secondSize),after=Verify(h,p,false,false,true);
   if(before!=middle||middle!=after||firstSize!=secondSize||first!=second)throw Refuse("WIN-AUTH-RACE");facts=after;size=secondSize;return second;
  }
 }
 static SA PrivateAttributes(out IntPtr sd) { uint size;if(!ConvertStringSecurityDescriptorToSecurityDescriptorW("O:"+CurrentSid+"D:P(A;OICI;FA;;;"+CurrentSid+")",1,out sd,out size))throw Refuse("WIN-AUTH-CREATE-DACL");return new SA{Length=Marshal.SizeOf(typeof(SA)),Descriptor=sd,Inherit=false}; }
 public static string CreateDirectory(string p) { using(var parent=Open(Path.GetDirectoryName(p),true,true,false)){if(!FlushFileBuffers(parent))throw Refuse("WIN-AUTH-DIRECTORY-FLUSH-UNAVAILABLE");IntPtr sd;SA sa=PrivateAttributes(out sd);try{if(!CreateDirectoryW(p,ref sa))throw Refuse("WIN-AUTH-EXCLUSIVE-CREATE");Published=true;}finally{LocalFree(sd);}if(!FlushFileBuffers(parent))throw Refuse("WIN-AUTH-DIRECTORY-FLUSH-UNAVAILABLE");using(var h=Open(p,true))return Verify(h,p,true,true);} }
 public static string Inspect(string p,bool directory) { using(var h=Open(p,directory))return Verify(h,p,directory,true); }
 public static string Ancestor(string p) { using(var h=Open(p,true,false,false))return Verify(h,p,true,false); }
 public static bool Published=false;
 public static string Remove(string p,string expected,string expectedFacts) {
  using(var parent=Open(Path.GetDirectoryName(p),true,true)){
   if(!FlushFileBuffers(parent))throw Refuse("WIN-AUTH-DIRECTORY-FLUSH-UNAVAILABLE");
   var h=CreateFileW(p,0x80030000u,1,IntPtr.Zero,3,0x00200000u,IntPtr.Zero);if(h.IsInvalid){h.Dispose();throw Refuse("WIN-AUTH-OPEN");}
   using(h){string facts=Verify(h,p,false,true);if(facts!=expectedFacts||Hash(Pass(h,1048576))!=expected)throw Refuse("WIN-AUTH-CAS");var d=new Disposition{Delete=1};if(!SetFileInformationByHandle(h,4,ref d,1))throw Refuse("WIN-AUTH-REMOVE");Published=true;}
   if(!FlushFileBuffers(parent))throw Refuse("WIN-AUTH-DIRECTORY-FLUSH-UNAVAILABLE");if(File.Exists(p)||Directory.Exists(p))throw Refuse("WIN-AUTH-REMOVE-READBACK");return "removed";
  }
 }
 public static string Publish(string p,byte[] bytes,string expected,string expectedFacts) {
  if((expected==null)!=(expectedFacts==null))throw Refuse("WIN-AUTH-INPUT");
  Published=false;string parentPath=Path.GetDirectoryName(p),temporary=Path.Combine(parentPath,".authority-"+Guid.NewGuid().ToString("N")+".tmp");
  using(var parent=OpenPublicationParent(parentPath)){
   // Probe required directory flush BEFORE creating any authority-bearing bytes.
   if(!FlushFileBuffers(parent))throw Refuse("WIN-AUTH-DIRECTORY-FLUSH-UNAVAILABLE");
   string parentBefore=Verify(parent,parentPath,true,true);string prior=null;
   if(expected!=null){string fact;byte[] old=Read(p,1048576,out fact);if(Hash(old)!=expected||fact!=expectedFacts)throw Refuse("WIN-AUTH-CAS");prior=fact;}else if(File.Exists(p)||Directory.Exists(p))throw Refuse("WIN-AUTH-EXPECTED-ABSENT");
   IntPtr sd;SA sa=PrivateAttributes(out sd);SafeFileHandle temp;
   try{temp=CreatePrivateFile(temporary,0xC0020000u,0,ref sa,1,0x80200000u,IntPtr.Zero);}finally{LocalFree(sd);}
   if(temp.IsInvalid){temp.Dispose();throw Refuse("WIN-AUTH-EXCLUSIVE-CREATE");}
   string tempFacts=null;Info tempInfo;
   try{using(temp){using(var f=new FileStream(new SafeFileHandle(temp.DangerousGetHandle(),false),FileAccess.Write)){f.Write(bytes,0,bytes.Length);f.Flush();}tempFacts=Verify(temp,temporary,false,true);if(!GetFileInformationByHandle(temp,out tempInfo))throw Refuse("WIN-AUTH-FILE-ID");string[] captured=tempFacts.Split(':');if(captured.Length!=12||captured[7]!=unchecked((uint)tempInfo.Creation.dwHighDateTime).ToString()||captured[8]!=unchecked((uint)tempInfo.Creation.dwLowDateTime).ToString())throw Refuse("WIN-AUTH-TEMP-CAS");if(!FlushFileBuffers(temp))throw Refuse("WIN-AUTH-DATA-FLUSH");}
    // Closing our writer may settle its last-write time; every other original native fact must remain exact.
    string settled;byte[] settledBytes=Read(temporary,1048576,out settled);string[] createdParts=tempFacts.Split(':'),settledParts=settled.Split(':');if(createdParts.Length!=12||settledParts.Length!=12||!bytes.SequenceEqual(settledBytes))throw Refuse("WIN-AUTH-TEMP-CAS");for(int i=0;i<12;i++){if(i!=9&&i!=10&&createdParts[i]!=settledParts[i])throw Refuse("WIN-AUTH-TEMP-CAS");}tempFacts=settled;
    if(expected!=null){string fact;byte[] old=Read(p,1048576,out fact);if(Hash(old)!=expected||fact!=prior||fact!=expectedFacts)throw Refuse("WIN-AUTH-CAS");}else if(File.Exists(p)||Directory.Exists(p))throw Refuse("WIN-AUTH-EXPECTED-ABSENT");
    if(parentBefore!=Verify(parent,parentPath,true,true))throw Refuse("WIN-AUTH-PARENT-CAS");
    if(!MoveFileExW(temporary,p,8u|(expected==null?0u:1u)))throw Refuse("WIN-AUTH-PUBLISH");Published=true;
    // Authenticate the published inode before repairing only NTFS-tunneled creation metadata.
    // Keep the same no-DELETE-share handle through byte/fact checks, setter and file flush.
    using(var published=Open(p,false,true)){
     string before=Verify(published,p,false,true);string[] publishedParts=before.Split(':'),expectedParts=tempFacts.Split(':');
     if(publishedParts.Length!=12||expectedParts.Length!=12)throw Refuse("WIN-AUTH-READBACK");
     for(int i=0;i<12;i++){if(i!=7&&i!=8&&publishedParts[i]!=expectedParts[i])throw Refuse("WIN-AUTH-READBACK");}
     byte[] first=Pass(published,1048576);string middle=Verify(published,p,false,true);byte[] second=Pass(published,1048576);string after=Verify(published,p,false,true);
     if(before!=middle||middle!=after||!bytes.SequenceEqual(first)||!bytes.SequenceEqual(second))throw Refuse("WIN-AUTH-READBACK");
     if(before!=tempFacts&&!SetFileTime(published,ref tempInfo.Creation,IntPtr.Zero,IntPtr.Zero))throw Refuse("WIN-AUTH-CREATION-TIME");
     if(Verify(published,p,false,true)!=tempFacts||!bytes.SequenceEqual(Pass(published,1048576))||Verify(published,p,false,true)!=tempFacts)throw Refuse("WIN-AUTH-READBACK");
     if(!FlushFileBuffers(published))throw Refuse("WIN-AUTH-DATA-FLUSH");
     if(Verify(published,p,false,true)!=tempFacts||!bytes.SequenceEqual(Pass(published,1048576))||Verify(published,p,false,true)!=tempFacts)throw Refuse("WIN-AUTH-READBACK");
    }
    if(!FlushFileBuffers(parent))throw Refuse("WIN-AUTH-DIRECTORY-FLUSH-UNAVAILABLE");string result;byte[] actual=Read(p,1048576,out result);if(result!=tempFacts||!bytes.SequenceEqual(actual))throw Refuse("WIN-AUTH-READBACK");return result;
   }finally{if(!Published&&tempFacts!=null){try{Remove(temporary,Hash(bytes),tempFacts);}catch{/* Keep an unverified orphan; never pathname-delete a foreign replacement. */}finally{Published=false;}}}
  }
 }
}
'@
Import-PipelineNativeType $PipelineNativeSource 'owned-authority' 'PipelineOwnedAuthorityNative'
try {
  $raw = [Console]::In.ReadToEnd()
  if ($raw.Length -gt 1500000) { throw 'WIN-AUTH-INPUT' }
  $request = ConvertFrom-Json -InputObject $raw
  $facts = $null; $bytes = $null; $imageSha256=$null; [long]$imageSize=0
  switch ($request.operation) {
    'inspect' { $facts = [PipelineOwnedAuthorityNative]::Inspect([string]$request.path,[bool]$request.directory) }
    'ancestor' { $facts = [PipelineOwnedAuthorityNative]::Ancestor([string]$request.path) }
    'read' { $bytes = [PipelineOwnedAuthorityNative]::Read([string]$request.path,[int]$request.maxBytes,[ref]$facts) }
    'inspect-source-image' { $imageSha256=[PipelineOwnedAuthorityNative]::InspectSourceImage([string]$request.path,[ref]$facts,[ref]$imageSize) }
    'read-source' { $bytes = [PipelineOwnedAuthorityNative]::Read([string]$request.path,[int]$request.maxBytes,[ref]$facts,$false) }
    'create-directory' { $facts = [PipelineOwnedAuthorityNative]::CreateDirectory([string]$request.path) }
    'publish' { $b = [Convert]::FromBase64String([string]$request.bytes); if($b.Length -gt 1048576){throw 'WIN-AUTH-SIZE'}; $expected = [System.Management.Automation.Language.NullString]::Value; if($null -ne $request.expectedSha256){$expected=[string]$request.expectedSha256}; $expectedFacts=[System.Management.Automation.Language.NullString]::Value;if($null -ne $request.expectedFacts){$expectedFacts=[string]$request.expectedFacts}; $facts=[PipelineOwnedAuthorityNative]::Publish([string]$request.path,$b,$expected,$expectedFacts) }
    'remove' { $facts=[PipelineOwnedAuthorityNative]::Remove([string]$request.path,[string]$request.expectedSha256,[string]$request.expectedFacts) }
    default { throw 'WIN-AUTH-OPERATION' }
  }
  $encoded=$null;if($null -ne $bytes){$encoded=[Convert]::ToBase64String($bytes)}
  if($request.operation -eq 'inspect-source-image'){[pscustomobject]@{ok=$true;facts=$facts;size=$imageSize;sha256=$imageSha256;committed=$false}|ConvertTo-Json -Compress}
  else {[pscustomobject]@{ok=$true;facts=$facts;bytes=$encoded;committed=[PipelineOwnedAuthorityNative]::Published}|ConvertTo-Json -Compress}
} catch {
  $e=$_.Exception;while($e.InnerException){$e=$e.InnerException}
  $code='WIN-AUTH-NATIVE-UNAVAILABLE';if($e.Message -match '^WIN-AUTH-[A-Z-]{1,64}$'){$code=$e.Message}
  [pscustomobject]@{ok=$false;code=$code;committed=[PipelineOwnedAuthorityNative]::Published}|ConvertTo-Json -Compress
  exit 1
}
