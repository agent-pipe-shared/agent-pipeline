// WIN-AP-S5-D scratch probe: reproduce GMW50's fixture placement and call the hardener directly.
// Read-only toward the product; it only creates fixture repositories under two bases and removes them again.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname, tmpdir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureAgentPipelineRoot } from "../../../plugins/pipeline-core/lib/hardened-private-directory.mjs";
import { hardenWindowsPrivateDirectory } from "../../../plugins/pipeline-core/lib/windows-private-state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const outFile = join(here, "probe-output.txt");
const POWERSHELL = ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"].find(existsSync);

const lines = [];
const tokens = [];
for (const [value, token] of [[repoRoot, "<repo-root>"], [tmpdir(), "<tmpdir>"], [homedir(), "<home>"]]) {
  tokens.push([value, token]);
  try { tokens.push([realpathSync(value), token]); } catch { /* ignore */ }
}
function clean(text) {
  let out = String(text);
  for (const [value, token] of tokens) {
    out = out.split(value).join(token).split(value.replaceAll("\\", "/")).join(token);
    out = out.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), token);
  }
  out = out.replace(new RegExp(userInfo().username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<user>");
  out = out.replace(new RegExp(hostname().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<host>");
  out = out.replace(/\b[A-Za-z]:[\\/]/g, "<drive>:/");
  return out;
}
function say(text = "") { lines.push(clean(text)); }

function ps(script, path, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv, PIPELINE_PRIVATE_STATE_PATH: path };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "psmodulepath") delete env[key];
  const r = spawnSync(POWERSHELL, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", timeout: 20000, windowsHide: true, env });
  return `${r.stdout ?? ""}${r.stderr ? `[stderr] ${r.stderr}` : ""}[exit ${r.status}]`.trim();
}

const ACL_SCRIPT = [
  "$ErrorActionPreference='Continue'",
  "$p=$env:PIPELINE_PRIVATE_STATE_PATH",
  "$a=Get-Acl -LiteralPath $p",
  "'owner='+$a.Owner",
  "'accessRulesProtected='+$a.AreAccessRulesProtected",
  "$a.Access|ForEach-Object{'  ace '+$_.IdentityReference+' '+$_.AccessControlType+' '+$_.FileSystemRights+' inherited='+$_.IsInherited+' flags='+$_.InheritanceFlags}",
  "'attributes='+(Get-Item -LiteralPath $p -Force).Attributes",
].join(";");

const IDENTITY_SCRIPT = [
  "$id=[Security.Principal.WindowsIdentity]::GetCurrent()",
  "'identity='+$id.Name",
  "'elevatedAdmin='+([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
  "'volumeFormat='+[IO.DriveInfo]::new([IO.Path]::GetPathRoot($env:PIPELINE_PRIVATE_STATE_PATH)).DriveFormat",
  "'psVersion='+$PSVersionTable.PSVersion",
].join(";");

const STEPWISE = (skipOwner) => [
  "$ErrorActionPreference='Stop'",
  "$p=$env:PIPELINE_PRIVATE_STATE_PATH",
  "$step='start'",
  "try{" + [
    "$step='current-identity';$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
    `$step='GetAccessControl';$sections=[System.Security.AccessControl.AccessControlSections]'${skipOwner ? "Access" : "Access,Owner"}'`,
    "$a=[System.IO.Directory]::GetAccessControl($p,$sections)",
    "$step='SetAccessRuleProtection';$a.SetAccessRuleProtection($true,$false)",
    skipOwner ? "$step='SetOwner-SKIPPED'" : "$step='SetOwner';$a.SetOwner([System.Security.Principal.NTAccount]::new($me))",
    "$step='ResetAccessRule';$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($me,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)",
    "$a.ResetAccessRule($rule)",
    "$step='Directory.SetAccessControl';[System.IO.Directory]::SetAccessControl($p,$a)",
    "'STEPWISE-OK'",
  ].join(";") + "}catch{$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};'STEPWISE-FAIL step='+$step+' type='+$e.GetType().FullName+' hresult=0x'+('{0:X8}' -f $e.HResult)+' message='+$e.Message;exit 1}",
].join(";");

function freshRepo(base, prefix) {
  const root = mkdtempSync(join(base, prefix));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return { root, common: join(root, ".git") };
}

const bases = [
  ["TEMP volume (the S6-F pin placement: os.tmpdir())", tmpdir()],
  ["CHECKOUT volume (the GMW49/GMW50 placement: <repo-root>/scratch)", join(repoRoot, "scratch")],
];
mkdirSync(join(repoRoot, "scratch"), { recursive: true });
const created = [];

say("=== WIN-AP-S5-D probe ===");
say(`platform=${process.platform} node=${process.version}`);
say(`fixed powershell present=${POWERSHELL !== undefined}`);

for (const [label, base] of bases) {
  say(`\n##### BASE: ${label}`);
  say(`base=${base}`);
  say("-- identity / volume (as seen from a path on this base)");
  say(ps(IDENTITY_SCRIPT, base));
  say("-- ACL of the base directory itself");
  say(ps(ACL_SCRIPT, base));

  // Variant E: the exact entry point GMW50 reaches, on a fresh repository, nothing pre-created.
  {
    const { root, common } = freshRepo(base, "s5d-E-");
    created.push(root);
    say("\n-- variant E: ensureAgentPipelineRoot(<fresh .git>) -- what storagePaths now calls");
    try {
      const result = ensureAgentPipelineRoot(common);
      say(`E result: ${JSON.stringify(result)}`);
    } catch (error) {
      say(`E threw ${error?.name}/${error?.code}: ${String(error?.message).split("\n")[0]}`);
    }
  }

  // Variant H: pre-create like ensureHardenedPrivateDirectory does (mkdir mode 0o700), show owner/ACL before,
  // call the module's own hardener, show the result and the ACL after.
  {
    const { root, common } = freshRepo(base, "s5d-H-");
    created.push(root);
    const dir = join(common, "agent-pipeline");
    mkdirSync(dir, { mode: 0o700 });
    say("\n-- variant H: mkdir(agent-pipeline, 0o700) then hardenWindowsPrivateDirectory(dir)");
    say("ACL of .git (the parent) before:");
    say(ps(ACL_SCRIPT, common));
    say("ACL of agent-pipeline before:");
    say(ps(ACL_SCRIPT, dir));
    say(`H hardenWindowsPrivateDirectory => ${JSON.stringify(hardenWindowsPrivateDirectory(dir))}`);
    say("ACL of agent-pipeline after:");
    say(ps(ACL_SCRIPT, dir));
  }

  // Variants S / N: the hardener's script run step by step with a step marker, full and without SetOwner.
  for (const [tag, skipOwner] of [["S", false], ["N", true]]) {
    const { root, common } = freshRepo(base, `s5d-${tag}-`);
    created.push(root);
    const dir = join(common, "agent-pipeline");
    mkdirSync(dir, { mode: 0o700 });
    say(`\n-- variant ${tag}: stepwise hardener script${skipOwner ? " WITHOUT SetOwner and without the Owner section" : " (as shipped)"}`);
    say(ps(STEPWISE(skipOwner), dir));
  }
}

for (const root of created) rmSync(root, { recursive: true, force: true, maxRetries: 3 });
say("\n(fixtures removed)");
writeFileSync(outFile, `${lines.join("\n")}\n`, "utf8");
console.log(lines.join("\n"));
