// WIN-AP-S5-D scratch probe 2: confirm the mechanism (WRITE_OWNER on the Owner section), reproduce HEAD behaviour of
// storagePaths (GMW50 without the S5 edit), and prototype the minimal fix. Fixture repositories only; removed again.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname, tmpdir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { guardMaintenanceWindowInternals } from "../../../plugins/pipeline-core/lib/guard-maintenance-window.mjs";
import { assessWindowsPrivatePath } from "../../../plugins/pipeline-core/lib/windows-private-state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const POWERSHELL = ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"].find(existsSync);
const lines = [];
const tokens = [];
for (const [value, token] of [[repoRoot, "<repo-root>"], [tmpdir(), "<tmpdir>"], [homedir(), "<home>"]]) {
  tokens.push([value, token]);
  try { tokens.push([realpathSync(value), token]); } catch { /* ignore */ }
}
const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function clean(text) {
  let out = String(text);
  for (const [value, token] of tokens) out = out.replace(new RegExp(esc(value), "gi"), token).replace(new RegExp(esc(value.replaceAll("\\", "/")), "gi"), token);
  out = out.replace(new RegExp(esc(userInfo().username), "gi"), "<user>").replace(new RegExp(esc(hostname()), "gi"), "<host>");
  return out.replace(/\b[A-Za-z]:[\\/]/g, "<drive>:/");
}
const say = (t = "") => lines.push(clean(t));
function ps(script, path) {
  const env = { ...process.env, PIPELINE_PRIVATE_STATE_PATH: path };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "psmodulepath") delete env[key];
  const r = spawnSync(POWERSHELL, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", timeout: 20000, windowsHide: true, env });
  return `${r.stdout ?? ""}${r.stderr ? `[stderr] ${r.stderr}` : ""}[exit ${r.status}]`.trim();
}
const CATCH = "}catch{$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};'FAIL step='+$step+' type='+$e.GetType().FullName+' hresult=0x'+('{0:X8}' -f $e.HResult);exit 1}";
const HEAD_PS = ["$ErrorActionPreference='Stop'", "$p=$env:PIPELINE_PRIVATE_STATE_PATH", "$step='start'", "try{"];
const RULE = "$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($me,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)";

// SHIPPED: verbatim step sequence of HARDEN_DIRECTORY_SCRIPT with step markers.
const SHIPPED = [...HEAD_PS, [
  "$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
  "$step='GetAccessControl(Access,Owner)';$a=[System.IO.Directory]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]'Access,Owner')",
  "$step='SetAccessRuleProtection';$a.SetAccessRuleProtection($true,$false)",
  "$step='SetOwner';$a.SetOwner([System.Security.Principal.NTAccount]::new($me))",
  `$step='ResetAccessRule';${RULE};$a.ResetAccessRule($rule)`,
  "$step='Directory.SetAccessControl';[System.IO.Directory]::SetAccessControl($p,$a)",
  "'OK'",
].join(";") + CATCH].join(";");

// OWNER-ONLY: touch nothing but the Owner section (new owner = the current owner).
const OWNER_ONLY = [...HEAD_PS, [
  "$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
  "$step='GetAccessControl(Owner)';$a=[System.IO.Directory]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]'Owner')",
  "$step='SetOwner';$a.SetOwner([System.Security.Principal.NTAccount]::new($me))",
  "$step='Directory.SetAccessControl(owner only)';[System.IO.Directory]::SetAccessControl($p,$a)",
  "'OK'",
].join(";") + CATCH].join(";");

// GRANT: give the current user an explicit FullControl ACE through the Access section only (the owner holds WRITE_DAC implicitly).
const GRANT = [...HEAD_PS, [
  "$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
  "$step='GetAccessControl(Access)';$a=[System.IO.Directory]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]'Access')",
  `$step='AddAccessRule';${RULE};$a.AddAccessRule($rule)`,
  "$step='Directory.SetAccessControl(grant)';[System.IO.Directory]::SetAccessControl($p,$a)",
  "'GRANT-OK'",
].join(";") + CATCH].join(";");

// PROTOTYPE FIX: same sequence, but SetOwner only when the observed owner SID is not already the current user's SID.
const FIXED = [...HEAD_PS, [
  "$meId=[System.Security.Principal.WindowsIdentity]::GetCurrent();$me=$meId.Name;$mySid=$meId.User.Value",
  "$step='GetAccessControl(Access,Owner)';$a=[System.IO.Directory]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]'Access,Owner')",
  "$ownerIsSelf=($a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $mySid)",
  "$step='SetAccessRuleProtection';$a.SetAccessRuleProtection($true,$false)",
  "$step='SetOwner(skipped when already self)';if(-not $ownerIsSelf){$a.SetOwner([System.Security.Principal.NTAccount]::new($me))}",
  `$step='ResetAccessRule';${RULE};$a.ResetAccessRule($rule)`,
  "$step='Directory.SetAccessControl';[System.IO.Directory]::SetAccessControl($p,$a)",
  "'OK ownerWasSelf='+$ownerIsSelf",
].join(";") + CATCH].join(";");

function freshRepo(base, prefix) {
  const root = mkdtempSync(join(base, prefix));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return { root, common: join(root, ".git") };
}
mkdirSync(join(repoRoot, "scratch"), { recursive: true });
const bases = [["TEMP volume (os.tmpdir())", tmpdir()], ["CHECKOUT volume (<repo-root>/scratch)", join(repoRoot, "scratch")]];
const created = [];
say("=== WIN-AP-S5-D probe 2 ===");
for (const [label, base] of bases) {
  say(`\n##### BASE: ${label}`);
  // HEAD behaviour: the library's own storagePaths (secureDirectory on the leaf; the S5 edit is NOT applied in this tree).
  {
    const { root, common } = freshRepo(base, "s5d2-head-");
    created.push(root);
    try {
      const paths = guardMaintenanceWindowInternals.storagePaths(common);
      say(`HEAD storagePaths(<fresh .git>) => ok, base=${paths.base}`);
    } catch (error) {
      say(`HEAD storagePaths(<fresh .git>) threw ${error?.name}/${error?.code}: ${String(error?.message).split("\n")[0]}`);
    }
  }
  for (const [tag, scripts] of [
    ["owner-section-only (SetOwner to the SAME owner, nothing else)", [OWNER_ONLY]],
    ["grant explicit user FullControl via Access section, THEN the shipped script", [GRANT, SHIPPED]],
    ["PROTOTYPE FIX (skip SetOwner when the owner is already the current user)", [FIXED]],
  ]) {
    const { root, common } = freshRepo(base, "s5d2-var-");
    created.push(root);
    const dir = join(common, "agent-pipeline");
    mkdirSync(dir, { mode: 0o700 });
    say(`\n-- ${tag}`);
    for (const script of scripts) say(ps(script, dir));
    say(`assessWindowsPrivatePath after => ${JSON.stringify(assessWindowsPrivatePath(dir))}`);
  }
}
for (const root of created) rmSync(root, { recursive: true, force: true, maxRetries: 3 });
say("\n(fixtures removed)");
writeFileSync(join(here, "probe2-output.txt"), `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
