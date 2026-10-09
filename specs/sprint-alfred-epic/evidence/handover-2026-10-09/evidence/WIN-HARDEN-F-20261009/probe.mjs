// WIN-HARDEN-F mechanism probe. Run natively: node scratch/dispatch/win-harden-f-a1/probe.mjs [variants|real]
// Every emitted string is scrubbed of host paths, SIDs, user name, host name and e-mail-shaped text.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const evidenceDir = path.join(repoRoot, "evidence", "WIN-HARDEN-F-20261009");
mkdirSync(evidenceDir, { recursive: true });
try { copyFileSync(fileURLToPath(import.meta.url), path.join(evidenceDir, "probe.mjs")); } catch { /* best effort */ }
const mode = process.argv[2] ?? "all";

const labelled = [
  [repoRoot, "<repo-root>"], [os.tmpdir(), "<tmp>"], [os.homedir(), "<home>"],
  [os.userInfo().username, "<user>"], [os.hostname(), "<host>"],
].filter(([s]) => typeof s === "string" && s.length > 1).sort((a, b) => b[0].length - a[0].length);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
function scrub(input) {
  let out = String(input);
  for (const [secret, label] of labelled) {
    out = out.replace(new RegExp(esc(secret), "giu"), label);
    out = out.replace(new RegExp(esc(secret.replaceAll("\\", "/")), "giu"), label);
  }
  out = out.replace(/S-1-[0-9-]+/gu, "<sid>");
  out = out.replace(/[A-Za-z]:[\\/][^\s"'<>|]*/gu, "<abs-path>");
  return out.replace(/[^\s"'\\]+@[^\s"'\\]+/gu, "<email>");
}
function clean(value) {
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  return value;
}
const emit = (o) => console.log(JSON.stringify(clean(o)));

const wps = await import(pathToFileURL(path.join(repoRoot, "plugins", "pipeline-core", "lib", "windows-private-state.mjs")).href);
const exe = wps.WINDOWS_POWERSHELL_PATHS.find((p) => { try { return spawnSync(p, ["-NoLogo", "-NoProfile", "-Command", "exit 0"], { windowsHide: true }).status === 0; } catch { return false; } });
let spawnCount = 0;
const made = [];
const mk = (label) => { const d = mkdtempSync(path.join(os.tmpdir(), `wh-${label}-`)); made.push(d); return d; };

function runPs(script, dir, tag) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(exe, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8", timeout: 7000, shell: false, windowsHide: true,
    env: { ...wps.sanitizeChildEnvironment(process.env), PIPELINE_PRIVATE_STATE_PATH: dir },
  });
  spawnCount += 1;
  const ms = Number((process.hrtime.bigint() - t0) / 1_000_000n);
  const err = String(r.stderr ?? "");
  const fq = /FullyQualifiedErrorId\s*:\s*([^\r\n]+)/u.exec(err)?.[1] ?? null;
  emit({ ev: "spawn", tag, n: spawnCount, status: r.status, errorCode: r.error?.code ?? null, ms, fqErrorId: fq, stdout: String(r.stdout ?? "").slice(0, 400), stderrHead: fq ? null : err.slice(0, 300) });
  return r;
}

const HEAD = ["$ErrorActionPreference='Stop'", "$p=$env:PIPELINE_PRIVATE_STATE_PATH", "$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name"];
const RULE = "$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($me,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)";
const SECT = "[System.Security.AccessControl.AccessControlSections]'Access,Owner'";
const mods = (v) => [`$${v}.SetAccessRuleProtection($true,$false)`, `$${v}.SetOwner([System.Security.Principal.NTAccount]::new($me))`, RULE, `$${v}.ResetAccessRule($rule)`];
const join = (...parts) => [...HEAD, ...parts.flat()].join(";");

const variants = {
  V0_production_GetAcl_SetAcl: join("$a=Get-Acl -LiteralPath $p", mods("a"), "Set-Acl -LiteralPath $p -AclObject $a"),
  V1_GetAcl_then_DotNet_SetAccessControl: join("$a=Get-Acl -LiteralPath $p", mods("a"), "[System.IO.Directory]::SetAccessControl($p,$a)"),
  V2_AccessOwner_object_then_SetAcl: join(`$sec=[System.IO.Directory]::GetAccessControl($p,${SECT})`, mods("sec"), "Set-Acl -LiteralPath $p -AclObject $sec"),
  V3_AccessOwner_static_SetAccessControl: join(`$sec=[System.IO.Directory]::GetAccessControl($p,${SECT})`, mods("sec"), "[System.IO.Directory]::SetAccessControl($p,$sec)"),
  V4_AccessOwner_DirectoryInfo_SetAccessControl: join("$di=[System.IO.DirectoryInfo]::new($p)", `$sec=$di.GetAccessControl(${SECT})`, mods("sec"), "$di.SetAccessControl($sec)"),
};
const NOOP_SETACL = join("$a=Get-Acl -LiteralPath $p", "Set-Acl -LiteralPath $p -AclObject $a");
const SDDL_DIAG = join("$g=(Get-Acl -LiteralPath $p).Sddl", `$s=[System.IO.Directory]::GetAccessControl($p,${SECT})`, "'GETACL-SDDL:'+$g", "'ACCESSOWNER-SDDL:'+$s.GetSecurityDescriptorSddlForm(${SECT})".replace("${SECT}", SECT), "'PROTECTED:'+$s.AreAccessRulesProtected", "'ACE-COUNT:'+@($s.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])).Count");

try {
  emit({ ev: "env", platform: process.platform, node: process.version, powershellFound: Boolean(exe) });
  if (!exe) throw new Error("fixed powershell not found");
  if (mode === "all" || mode === "variants") {
    for (const [name, script] of Object.entries(variants)) {
      for (const withChild of (name.startsWith("V0") || name.startsWith("V1")) ? [false] : [false, true]) {
        const dir = mk("v");
        if (withChild) writeFileSync(path.join(dir, "child.json"), "{}\n");
        const outcomes = [1, 2, 3].map((n) => runPs(script, dir, `${name}${withChild ? "+child" : ""}#${n}`).status);
        const assessed = wps.assessWindowsPrivatePath(dir);
        emit({ ev: "variant-result", variant: name, withChild, callStatuses: outcomes, assessStatus: assessed.status, assessReason: assessed.reason });
        if (name.startsWith("V3") && !withChild) {
          const diag = runPs(SDDL_DIAG, dir, "diag-after-V3");
          emit({ ev: "diag", exit: diag.status });
          const noop = runPs(NOOP_SETACL, dir, "noop-Set-Acl-on-hardened-dir");
          emit({ ev: "noop-set-acl", exit: noop.status });
        }
      }
    }
  }
  if (mode === "all" || mode === "real") {
    // The production function, three calls on a fresh dir and on a dir with a child file, spawn-counted through options.run.
    for (const withChild of [false, true]) {
      const dir = mk("r");
      if (withChild) writeFileSync(path.join(dir, "child.json"), "{}\n");
      for (let call = 1; call <= 3; call += 1) {
        const before = spawnCount;
        const run = (e, argv, opts) => {
          const r = spawnSync(e, argv, opts);
          spawnCount += 1;
          const err = String(r.stderr ?? "");
          emit({ ev: "real-spawn", call, withChild, n: spawnCount, status: r.status, errorCode: r.error?.code ?? null, fqErrorId: /FullyQualifiedErrorId\s*:\s*([^\r\n]+)/u.exec(err)?.[1] ?? null, stderrTagLines: err.split(/\r?\n/u).filter((l) => l.startsWith("PIPELINE-")).slice(0, 2) });
          return r;
        };
        const res = wps.hardenWindowsPrivateDirectory(dir, { run });
        emit({ ev: "real-result", call, withChild, status: res.status, reason: res.reason, spawnsInCall: spawnCount - before });
      }
    }
    const missing = path.join(mk("m"), "does-not-exist");
    const before = spawnCount;
    const res = wps.hardenWindowsPrivateDirectory(missing, { run: (e, argv, opts) => { spawnCount += 1; return spawnSync(e, argv, opts); } });
    emit({ ev: "real-result", call: "missing-path", status: res.status, reason: res.reason, spawnsInCall: spawnCount - before });
  }
  emit({ ev: "done", totalSpawns: spawnCount });
} catch (e) {
  emit({ ev: "probe-fault", message: e?.message ?? String(e), stack: String(e?.stack ?? "").split("\n").slice(0, 4).join(" | ") });
  process.exitCode = 2;
} finally {
  for (const d of made) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
}
