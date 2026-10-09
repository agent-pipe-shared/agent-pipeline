// WIN-AP-S5-D scratch probe 3: does the PRE-5a72c9b61 hardener (Get-Acl + Set-Acl) work on the checkout volume, and is the
// prototype fix repeatable? Fixture repositories only; removed again.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname, tmpdir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assessWindowsPrivatePath } from "../../../plugins/pipeline-core/lib/windows-private-state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const POWERSHELL = ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"].find(existsSync);
const lines = [];
const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tokens = [[repoRoot, "<repo-root>"], [tmpdir(), "<tmpdir>"], [homedir(), "<home>"]];
const clean = (text) => {
  let out = String(text);
  for (const [value, token] of tokens) out = out.replace(new RegExp(esc(value), "gi"), token);
  out = out.replace(new RegExp(esc(userInfo().username), "gi"), "<user>").replace(new RegExp(esc(hostname()), "gi"), "<host>");
  return out.replace(/\b[A-Za-z]:[\\/]/g, "<drive>:/");
};
const say = (t = "") => lines.push(clean(t));
function ps(script, path) {
  const env = { ...process.env, PIPELINE_PRIVATE_STATE_PATH: path };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "psmodulepath") delete env[key];
  const r = spawnSync(POWERSHELL, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", timeout: 20000, windowsHide: true, env });
  return `${(r.stdout ?? "").trim()}${r.stderr ? ` [stderr: ${String(r.stderr).split("\n")[0].trim().slice(0, 160)}]` : ""} [exit ${r.status}]`;
}
const RULE = "$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($me,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)";
// The hardener script as it was before 5a72c9b61 (cmdlet pair), verbatim from the diff.
const OLD = ["$ErrorActionPreference='Stop'", "$p=$env:PIPELINE_PRIVATE_STATE_PATH", "$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name", "$a=Get-Acl -LiteralPath $p", "$a.SetAccessRuleProtection($true,$false)", "$a.SetOwner([System.Security.Principal.NTAccount]::new($me))", RULE, "$a.ResetAccessRule($rule)", "Set-Acl -LiteralPath $p -AclObject $a", "'OLD-OK'"].join(";");
const FIXED = ["$ErrorActionPreference='Stop'", "$p=$env:PIPELINE_PRIVATE_STATE_PATH", "try{" + [
  "$meId=[System.Security.Principal.WindowsIdentity]::GetCurrent();$me=$meId.Name;$mySid=$meId.User.Value",
  "$a=[System.IO.Directory]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]'Access,Owner')",
  "$ownerIsSelf=($a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $mySid)",
  "$a.SetAccessRuleProtection($true,$false)",
  "if(-not $ownerIsSelf){$a.SetOwner([System.Security.Principal.NTAccount]::new($me))}",
  RULE, "$a.ResetAccessRule($rule)", "[System.IO.Directory]::SetAccessControl($p,$a)", "'FIXED-OK ownerWasSelf='+$ownerIsSelf",
].join(";") + "}catch{$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};'FIXED-FAIL '+$e.GetType().Name;exit 1}"].join(";");

mkdirSync(join(repoRoot, "scratch"), { recursive: true });
const created = [];
say("=== WIN-AP-S5-D probe 3 ===");
for (const [label, base] of [["TEMP volume", tmpdir()], ["CHECKOUT volume (<repo-root>/scratch)", join(repoRoot, "scratch")]]) {
  say(`\n##### BASE: ${label}`);
  for (const [tag, script, times] of [["OLD hardener script (Get-Acl + Set-Acl), first call", OLD, 1], ["PROTOTYPE FIX, called twice on the same directory", FIXED, 2]]) {
    const root = mkdtempSync(join(base, "s5d3-"));
    created.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    const dir = join(root, ".git", "agent-pipeline");
    mkdirSync(dir, { mode: 0o700 });
    say(`-- ${tag}`);
    for (let i = 0; i < times; i += 1) say(`   call ${i + 1}: ${ps(script, dir)}`);
    say(`   assess after => ${JSON.stringify(assessWindowsPrivatePath(dir))}`);
  }
}
for (const root of created) rmSync(root, { recursive: true, force: true, maxRetries: 3 });
say("\n(fixtures removed)");
writeFileSync(join(here, "probe3-output.txt"), `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
