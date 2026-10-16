#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { assessTrustedExecutablePath, resolveTrustedSystemExecutable, trustedToolRepairHint, windowsSystemToolRoots } from "./trusted-tool-resolution.mjs";let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS TTR${String(passed).padStart(2, "0")} ${name}\n`); }
const ROOT = "C:\\Windows\\System32"; const file = { isFile: () => true, isSymbolicLink: () => false }; const link = { isFile: () => false, isSymbolicLink: () => true };
function missing(path) { const error = new Error(`missing ${path}`); error.code = "ENOENT"; return error; }
function fixture(entries, realpaths = {}) { return { lstatSync(path) { const entry = entries[path]; if (entry instanceof Error) throw entry; if (!entry) throw missing(path); return entry; }, realpathSync(path) { const entry = realpaths[path] ?? path; if (entry instanceof Error) throw entry; return entry; } }; }
check("accepts a direct .exe inside a named Windows system root", () => { const path = `${ROOT}\\gitleaks.exe`; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", windowsRoots: [ROOT], fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("accepts Git for Windows mingw64 direct executable from its named system root", () => { const root = "C:\\Program Files\\Git\\mingw64\\bin"; const path = `${root}\\git.exe`; assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [root], fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("resolves a non-Windows symlink to its regular executable target", () => { const path = "/usr/local/bin/codex"; const target = "/usr/bin/codex"; assert.deepEqual(resolveTrustedSystemExecutable("codex", { platform: "linux", fsOps: fixture({ [path]: link, [target]: file }, { [path]: target }) }), { ok: true, path: target }); });
check("uses POSIX fixture paths for explicitly mocked Linux resolution", () => { const path = "/usr/bin/gitleaks"; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "linux", fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("uses the fixed Homebrew system path for explicitly mocked macOS resolution", () => { const path = "/opt/homebrew/bin/gitleaks"; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "darwin", fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("uses only immutable Windows roots when environment-shaped input names a caller-controlled location", () => { const env = { ProgramFiles: "D:\\caller-controlled", SystemRoot: "E:\\caller-controlled", WINDIR: "F:\\caller-controlled", USERPROFILE: "Z:\\Users\\developer" }; const attackerPath = "D:\\caller-controlled\\Git\\cmd\\gitleaks.exe"; const probes = []; const fsOps = { lstatSync(path) { probes.push(path); if (path === attackerPath) return file; throw missing(path); }, realpathSync(path) { return path; } }; assert.deepEqual(windowsSystemToolRoots(env), ["C:\\Program Files\\Git\\cmd", "C:\\Program Files\\Git\\bin", "C:\\Program Files\\Git\\mingw64\\bin", "C:\\Program Files\\Gitleaks", "C:\\Program Files\\OSV-Scanner", "C:\\Program Files\\Semgrep", "C:\\Windows\\System32", "D:\\Program Files\\Git\\cmd", "D:\\Program Files\\Git\\bin", "D:\\Program Files\\Git\\mingw64\\bin", "D:\\Program Files\\Gitleaks", "D:\\Program Files\\OSV-Scanner", "D:\\Program Files\\Semgrep", "D:\\Windows\\System32"]); assert.equal(Object.isFrozen(windowsSystemToolRoots()), true); assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", env, fsOps }), { ok: false, status: "binary_missing" }); assert.equal(probes.includes(attackerPath), false); });
check("accepts a direct scanner executable from the immutable D drive system root", () => { const root = "D:\\Program Files\\Gitleaks"; const path = `${root}\\gitleaks.exe`; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("does not search user paths and still rejects wrappers in named Windows roots", () => { const userPath = "Z:\\Users\\developer\\gitleaks.exe"; const denied = new Error("user path touched"); denied.code = "EACCES"; const noUserSearch = { lstatSync(path) { if (path === userPath) throw denied; throw missing(path); }, realpathSync(path) { return path; } }; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", fsOps: noUserSearch }), { ok: false, status: "binary_missing" }); const wrapper = "C:\\Program Files\\Git\\cmd\\gitleaks.cmd"; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", fsOps: fixture({ [wrapper]: file }) }), { ok: false, status: "untrusted_path" }); });
check("rejects command, batch, and PowerShell wrappers as untrusted rather than missing", () => { for (const extension of [".cmd", ".bat", ".ps1"]) { const path = `${ROOT}\\gitleaks${extension}`; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", windowsRoots: [ROOT], fsOps: fixture({ [path]: file }) }), { ok: false, status: "untrusted_path" }); } });
check("rechecks a reparse target and rejects a user-writable final path", () => { const path = `${ROOT}\\semgrep.exe`; const userTarget = "C:\\Users\\developer\\AppData\\Local\\Temp\\semgrep.exe"; const fsOps = fixture({ [path]: link, [userTarget]: file }, { [path]: userTarget }); assert.deepEqual(resolveTrustedSystemExecutable("semgrep", { platform: "win32", windowsRoots: [ROOT], fsOps }), { ok: false, status: "untrusted_path" }); assert.deepEqual(assessTrustedExecutablePath(userTarget, { platform: "win32", windowsRoots: [ROOT], fsOps }), { ok: false, status: "untrusted_path" }); });
check("preserves probe errors separately from missing and rejected paths", () => { const denied = new Error("access denied"); denied.code = "EACCES"; assert.deepEqual(resolveTrustedSystemExecutable("osv-scanner", { platform: "win32", windowsRoots: [ROOT], fsOps: fixture({ [`${ROOT}\\osv-scanner.exe`]: denied }) }), { ok: false, status: "probe_error" }); assert.deepEqual(resolveTrustedSystemExecutable("osv-scanner", { platform: "win32", windowsRoots: [ROOT], fsOps: fixture({}) }), { ok: false, status: "binary_missing" }); });
check("accepts a direct executable from an explicitly named neutral example root (D:\\Tools\\Git)", () => { const root = "D:\\Tools\\Git\\mingw64\\bin"; const path = `${root}\\git.exe`; assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [root], fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("still rejects a wrapper inside the D:\\Tools\\Git example root", () => { const root = "D:\\Tools\\Git\\cmd"; const path = `${root}\\git.bat`; assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [root], fsOps: fixture({ [path]: file }) }), { ok: false, status: "untrusted_path" }); });
check("still rejects a neighboring sibling directory outside the exact D:\\Tools\\Git root", () => { const path = "D:\\Tools\\Git-other\\cmd\\git.exe"; assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: ["D:\\Tools\\Git\\cmd"], fsOps: fixture({ [path]: file }) }), { ok: false, status: "binary_missing" }); });
check("rejects a nested descendant below a named root", () => { const root = "D:\\Tools\\Git\\cmd"; const path = `${root}\\user-controlled\\git.exe`; assert.deepEqual(assessTrustedExecutablePath(path, { platform: "win32", windowsRoots: [root], fsOps: fixture({ [path]: file }) }), { ok: false, status: "untrusted_path" }); });
check("a git.exe under the removed D:\\Dev\\Git\\Git\\cmd root is untrusted by default and trusted again via extraRoots (the user-file route)", () => { const dir = "D:\\Dev\\Git\\Git\\cmd"; const path = `${dir}\\git.exe`; const fsOps = fixture({ [path]: file }); const base = { platform: "win32", homeDir: "C:\\Users\\none", fsOps }; assert.equal(windowsSystemToolRoots().some((root) => root.toLowerCase().startsWith("d:\\dev\\git\\git")), false); assert.deepEqual(assessTrustedExecutablePath(path, { ...base, extraRoots: [] }), { ok: false, status: "untrusted_path" }); assert.deepEqual(assessTrustedExecutablePath(path, { ...base, extraRoots: [dir] }), { ok: true, path }); });
if (process.platform === "win32") {
  // Host-limitation (owner Coordinator, due 2026-10-19): a host whose Git lives outside the built-in roots resolves binary_missing until its per-machine
  // trusted-tool-roots.json exists (ALF-C-P14-03C); that is a typed skip, not a failure. A configured D:\Dev\Git root is accepted besides the PO-approved built-ins.
  const nativeGit = resolveTrustedSystemExecutable("git");
  if (nativeGit.status === "binary_missing") process.stdout.write(`SKIP TTR-NATIVE host-limitation: git is outside the built-in trusted roots and no per-machine trusted-tool-roots.json lists it; owner Coordinator, due 2026-10-19; ${trustedToolRepairHint("git")}\n`);
  else check("resolves this host's real, PO-approved Git install natively (no mocks)", () => {
    const resolved = resolveTrustedSystemExecutable("git");
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    const norm = (p) => winPath.normalize(p).replace(/[\\/]+$/, "").toLowerCase();
    const trustedRoots = [...windowsSystemToolRoots(), ...loadUserTrustedRoots().roots].map(norm);
    assert.ok(trustedRoots.includes(norm(winPath.dirname(resolved.path))), `resolved git ${resolved.path} is not directly under a built-in or accepted per-machine trusted root`);
    assert.equal(winPath.basename(resolved.path).toLowerCase(), "git.exe");
  });
}
// ---------- Operator hotfix 6: win32 trusts <home>\.local\bin for direct .exe tools ----------
// Defect (pre-hotfix): on native Windows a direct .exe installed under the user's own `<home>\.local\bin` (where per-user tool installers put
// their binaries) was never searched, so resolution reported binary_missing / untrusted_path. The hotfix adds exactly that one directory, for
// direct .exe files only (wrappers and extensionless files stay untrusted_path), only when a home directory is known, and leaves the POSIX
// branch and the immutable system roots untouched. Fixtures are injected (platform + homeDir + fsOps) so the cases run on every host.
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, win32 as winPath } from "node:path";
const HF6_NAME = `pipeline-hotfix-probe-${randomUUID().slice(0, 8)}`;
const HF6_HOME = "C:\\Users\\hotfix-probe";
const hf6Bin = winPath.join(HF6_HOME, ".local", "bin");
const hf6Win = (extra = {}) => ({ platform: "win32", homeDir: HF6_HOME, windowsRoots: [], ...extra });
const HF6_MISSING = { ok: false, status: "binary_missing" };
const HF6_UNTRUSTED = { ok: false, status: "untrusted_path" };
check("hotfix 6: a direct .exe in <home>\\.local\\bin resolves and assesses ok on win32 (pre-hotfix: binary_missing / untrusted_path)", () => {
  const exe = winPath.join(hf6Bin, `${HF6_NAME}.exe`);
  const fsOps = fixture({ [exe]: file });
  for (const name of [HF6_NAME, `${HF6_NAME}.exe`]) assert.deepEqual(resolveTrustedSystemExecutable(name, hf6Win({ fsOps })), { ok: true, path: exe }, name);
  assert.deepEqual(assessTrustedExecutablePath(exe, hf6Win({ fsOps })), { ok: true, path: exe });
});
check("hotfix 6: .cmd/.bat/.ps1 wrappers and extensionless files in <home>\\.local\\bin stay untrusted_path", () => {
  for (const extension of [".cmd", ".bat", ".ps1"]) {
    const wrapper = winPath.join(hf6Bin, `${HF6_NAME}${extension}`);
    const fsOps = fixture({ [wrapper]: file });
    assert.deepEqual(resolveTrustedSystemExecutable(HF6_NAME, hf6Win({ fsOps })), HF6_UNTRUSTED, extension);
    assert.deepEqual(assessTrustedExecutablePath(wrapper, hf6Win({ fsOps })), HF6_UNTRUSTED, extension);
  }
  const bare = winPath.join(hf6Bin, HF6_NAME);
  assert.deepEqual(assessTrustedExecutablePath(bare, hf6Win({ fsOps: fixture({ [bare]: file }) })), HF6_UNTRUSTED);
});
check("hotfix 6: an .exe elsewhere in the home directory is not trusted (only the exact <home>\\.local\\bin directory)", () => {
  const elsewhere = [winPath.join(HF6_HOME, `${HF6_NAME}.exe`), winPath.join(HF6_HOME, ".local", `${HF6_NAME}.exe`), winPath.join(hf6Bin, "nested", `${HF6_NAME}.exe`), winPath.join(HF6_HOME, "go", "bin", `${HF6_NAME}.exe`)];
  const fsOps = fixture(Object.fromEntries(elsewhere.map((path) => [path, file])));
  for (const path of elsewhere) assert.deepEqual(assessTrustedExecutablePath(path, hf6Win({ fsOps })), HF6_UNTRUSTED, path);
  assert.deepEqual(resolveTrustedSystemExecutable(HF6_NAME, hf6Win({ fsOps })), HF6_MISSING);
});
check("hotfix 6: a link in <home>\\.local\\bin whose resolved target is outside it (or is not an .exe) is refused by the resolved-path recheck", () => {
  const candidate = winPath.join(hf6Bin, `${HF6_NAME}.exe`);
  for (const target of [winPath.join(HF6_HOME, "Downloads", `${HF6_NAME}.exe`), winPath.join(hf6Bin, `${HF6_NAME}.dat`)]) {
    const fsOps = fixture({ [candidate]: link, [target]: file }, { [candidate]: target });
    assert.deepEqual(resolveTrustedSystemExecutable(HF6_NAME, hf6Win({ fsOps })), HF6_UNTRUSTED, target);
    assert.deepEqual(assessTrustedExecutablePath(candidate, hf6Win({ fsOps })), HF6_UNTRUSTED, target);
  }
});
check("hotfix 6: without an injected homeDir a caller-named home is never trusted implicitly, and a POSIX ~/.local/bin file resolves as before", () => {
  const exe = winPath.join(hf6Bin, `${HF6_NAME}.exe`);
  const fsOps = fixture({ [exe]: file });
  assert.deepEqual(resolveTrustedSystemExecutable(HF6_NAME, { platform: "win32", windowsRoots: [], fsOps }), HF6_MISSING);
  assert.deepEqual(assessTrustedExecutablePath(exe, { platform: "win32", windowsRoots: [], fsOps }), HF6_UNTRUSTED);
  const posixPath = `/home/dev/.local/bin/${HF6_NAME}`;
  for (const platform of ["linux", "darwin"]) assert.deepEqual(resolveTrustedSystemExecutable(HF6_NAME, { platform, homeDir: "/home/dev", fsOps: fixture({ [posixPath]: file }) }), { ok: true, path: posixPath }, platform);
});
check("hotfix 6: an injected win32 platform inherits the host home only on a win32 host (it probes the four candidates in that home's .local\\bin)", () => {
  const probes = [];
  const fsOps = { lstatSync(path) { probes.push(path); throw missing(path); }, realpathSync(path) { return path; } };
  assert.deepEqual(resolveTrustedSystemExecutable(HF6_NAME, { platform: "win32", windowsRoots: [], fsOps }), HF6_MISSING);
  if (process.platform === "win32") assert.deepEqual(probes, [`${HF6_NAME}.exe`, `${HF6_NAME}.cmd`, `${HF6_NAME}.bat`, `${HF6_NAME}.ps1`].map((name) => winPath.join(homedir(), ".local", "bin", name)));
  else assert.deepEqual(probes, [], "a mocked foreign-platform resolution must not inherit this host's home directory");
});
if (process.platform === "win32") {
  check("hotfix 6 (real files, native Windows): an .exe in a temp <home>\\.local\\bin resolves through the real filesystem, but only for that homeDir", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "hotfix-win32-userbin-")));
    try {
      const exe = winPath.join(home, ".local", "bin", `${HF6_NAME}.exe`);
      mkdirSync(dirname(exe), { recursive: true }); writeFileSync(exe, "MZ");
      assert.deepEqual(resolveTrustedSystemExecutable(HF6_NAME, { platform: "win32", homeDir: home }), { ok: true, path: realpathSync(exe) });
      assert.deepEqual(assessTrustedExecutablePath(exe, { platform: "win32", homeDir: home }), { ok: true, path: realpathSync(exe) });
      assert.deepEqual(resolveTrustedSystemExecutable(HF6_NAME, { platform: "win32" }), HF6_MISSING, "a temp home is not trusted implicitly");
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
}
// ---------- ALF-C-P14-03C: per-machine, user-profile trusted tool roots (pipeline.trusted-tool-roots.v1) ----------
// The file lives at <home>/.config/agent-pipeline/trusted-tool-roots.json, outside every repository, and is ADDITIVE to the built-in roots. Any defect fails
// closed (typed diagnostic, built-ins only). Mocked cases run on every host; real-filesystem cases use temp homes (a configured root may not sit inside a
// git repository, so a root fixture under the repository's scratch/ directory is itself refused: that is the refusal case below).
import { symlinkSync } from "node:fs";
import { dirname as pathDirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadUserTrustedRoots, TRUSTED_TOOL_ROOTS_SCHEMA, trustedToolRootsFilePath } from "./trusted-tool-resolution.mjs";
const CFG_FILE = "/cfg/trusted-tool-roots.json";
const cfgJson = (roots, extra = {}) => JSON.stringify({ schema: TRUSTED_TOOL_ROOTS_SCHEMA, roots, ...extra });
function cfgFs(entries, contents) {
  const info = (entry) => ({ isFile: () => entry.kind === "file", isDirectory: () => entry.kind === "dir", isSymbolicLink: () => entry.kind === "link", uid: entry.uid ?? 1000, mode: entry.mode ?? 0o755 });
  return {
    lstatSync(path) { const entry = entries[path]; if (!entry) throw missing(path); return info(entry); },
    realpathSync(path) { const entry = entries[path]; if (!entry) throw missing(path); return entry.real ?? path; },
    readFileSync(path) { if (!(path in contents)) throw missing(path); return contents[path]; },
  };
}
const cfgEntry = { kind: "file", uid: 1000, mode: 0o600 };
check("trusted roots: the location is fixed under the home directory and ignores environment input", () => {
  assert.equal(trustedToolRootsFilePath({ homeDirectory: "/h" }), join("/h", ".config", "agent-pipeline", "trusted-tool-roots.json"));
  assert.equal(trustedToolRootsFilePath({ trustedRootsFile: CFG_FILE }), CFG_FILE);
  assert.equal(trustedToolRootsFilePath({ env: { TRUSTED_TOOL_ROOTS: "/evil", HOME: "/evil" } }), join(homedir(), ".config", "agent-pipeline", "trusted-tool-roots.json"));
});
check("trusted roots: an absent file is silent, built-ins still apply and binary_missing carries a repair hint naming the file and schema", () => {
  const fsOps = fixture({}); const configFsOps = cfgFs({}, {});
  const result = resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [ROOT], trustedRootsFile: CFG_FILE, configFsOps, fsOps });
  assert.equal(result.ok, false); assert.equal(result.status, "binary_missing"); assert.equal(result.diagnostics, undefined);
  assert.ok(result.hint.includes(CFG_FILE) && result.hint.includes(TRUSTED_TOOL_ROOTS_SCHEMA), result.hint);
  const builtin = `${ROOT}\\git.exe`;
  assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [ROOT], trustedRootsFile: CFG_FILE, configFsOps, fsOps: fixture({ [builtin]: file }) }), { ok: true, path: builtin });
});
check("trusted roots: a valid file adds D:-style roots on win32 (forward slashes accepted, several roots) and POSIX roots on linux", () => {
  const roots = ["D:/Tools/Fixture/cmd", "D:/Tools/Fixture/ucrt64/bin"];
  const entries = { [CFG_FILE]: cfgEntry, "D:/Tools/Fixture/cmd": { kind: "dir", real: "D:\\Tools\\Fixture\\cmd" }, "D:/Tools/Fixture/ucrt64/bin": { kind: "dir", real: "D:\\Tools\\Fixture\\ucrt64\\bin" } };
  const configFsOps = cfgFs(entries, { [CFG_FILE]: cfgJson(roots) });
  const exe = "D:\\Tools\\Fixture\\ucrt64\\bin\\git.exe";
  assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [], homeDir: "C:\\Users\\none", trustedRootsFile: CFG_FILE, configFsOps, fsOps: fixture({ [exe]: file }) }), { ok: true, path: exe });
  assert.deepEqual(assessTrustedExecutablePath(exe, { platform: "win32", windowsRoots: [], homeDir: "C:\\Users\\none", trustedRootsFile: CFG_FILE, configFsOps, fsOps: fixture({ [exe]: file }) }), { ok: true, path: exe });
  const posixEntries = { [CFG_FILE]: cfgEntry, "/opt/tools/bin": { kind: "dir" } };
  const posixCfg = cfgFs(posixEntries, { [CFG_FILE]: cfgJson(["/opt/tools/bin"]) });
  const tool = "/opt/tools/bin/mytool";
  assert.deepEqual(resolveTrustedSystemExecutable("mytool", { platform: "linux", homeDir: "/home/none", uid: 1000, trustedRootsFile: CFG_FILE, configFsOps: posixCfg, fsOps: fixture({ [tool]: file }) }), { ok: true, path: tool });
});
check("trusted roots: a configured root still applies every executable check (wrapper, nested directory, wrong extension stay untrusted)", () => {
  const entries = { [CFG_FILE]: cfgEntry, "D:/Tools": { kind: "dir", real: "D:\\Tools" } };
  const configFsOps = cfgFs(entries, { [CFG_FILE]: cfgJson(["D:/Tools"]) });
  const base = { platform: "win32", windowsRoots: [], homeDir: "C:\\Users\\none", trustedRootsFile: CFG_FILE, configFsOps };
  assert.deepEqual(resolveTrustedSystemExecutable("git", { ...base, fsOps: fixture({ "D:\\Tools\\git.cmd": file }) }).status, "untrusted_path");
  assert.equal(assessTrustedExecutablePath("D:\\Tools\\nested\\git.exe", { ...base, fsOps: fixture({ "D:\\Tools\\nested\\git.exe": file }) }).status, "untrusted_path");
  assert.equal(assessTrustedExecutablePath("D:\\Tools\\git", { ...base, fsOps: fixture({ "D:\\Tools\\git": file }) }).status, "untrusted_path");
});
check("trusted roots: a malformed, extra-key, wrong-schema or oversized file is ignored with TTR-CONFIG-INVALID, never widens trust, and built-ins still resolve", () => {
  const roots = ["D:/Tools"]; const tooMany = Array.from({ length: 17 }, (_, index) => `D:/Tools${index}`);
  const variants = [["malformed-json", "{not json"], ["not-an-object", "[]"], ["unexpected-keys", cfgJson(roots, { extra: 1 })], ["wrong-schema", JSON.stringify({ schema: "other", roots })], ["roots-not-an-array", JSON.stringify({ schema: TRUSTED_TOOL_ROOTS_SCHEMA, roots: "D:/Tools" })], ["too-many-roots", cfgJson(tooMany)]];
  for (const [reason, text] of variants) {
    const configFsOps = cfgFs({ [CFG_FILE]: cfgEntry, "D:/Tools": { kind: "dir", real: "D:\\Tools" } }, { [CFG_FILE]: text });
    const builtin = `${ROOT}\\git.exe`; const injected = "D:\\Tools\\git.exe";
    const base = { platform: "win32", windowsRoots: [ROOT], homeDir: "C:\\Users\\none", trustedRootsFile: CFG_FILE, configFsOps };
    const ok = resolveTrustedSystemExecutable("git", { ...base, fsOps: fixture({ [builtin]: file }) });
    assert.equal(ok.ok, true, reason); assert.equal(ok.path, builtin, reason);
    assert.deepEqual(ok.diagnostics.map((d) => [d.code, d.reason]), [["TTR-CONFIG-INVALID", reason]], reason);
    const widened = resolveTrustedSystemExecutable("git", { ...base, fsOps: fixture({ [injected]: file }) });
    assert.equal(widened.ok, false, reason); assert.equal(widened.status, "binary_missing", reason);
  }
});
check("trusted roots: an individual relative, missing, non-directory or symlinked root is rejected with TTR-ROOT-REJECTED while a valid sibling stays accepted", () => {
  const entries = { [CFG_FILE]: cfgEntry, "D:/Ok": { kind: "dir", real: "D:\\Ok" }, "D:/File": { kind: "file" }, "D:/Link": { kind: "link" }, "D:/Alias": { kind: "dir", real: "E:\\Elsewhere" } };
  const configFsOps = cfgFs(entries, { [CFG_FILE]: cfgJson(["relative\\dir", "D:/Missing", "D:/File", "D:/Link", "D:/Alias", "D:/Ok", 7]) });
  const loaded = loadUserTrustedRoots({ platform: "win32", trustedRootsFile: CFG_FILE, configFsOps });
  assert.deepEqual(loaded.roots, ["D:\\Ok"]);
  assert.deepEqual(loaded.diagnostics.map((d) => [d.code, d.reason]), [["TTR-ROOT-REJECTED", "not-absolute"], ["TTR-ROOT-REJECTED", "missing"], ["TTR-ROOT-REJECTED", "not-a-directory"], ["TTR-ROOT-REJECTED", "symlinked-root"], ["TTR-ROOT-REJECTED", "symlinked-root"], ["TTR-ROOT-REJECTED", "not-a-string"]]);
});
check("trusted roots: a root inside a git repository (a .git entry on its ancestor chain) is rejected", () => {
  const entries = { [CFG_FILE]: cfgEntry, "D:/repo/bin": { kind: "dir", real: "D:\\repo\\bin" }, "D:\\repo\\.git": { kind: "dir" } };
  const loaded = loadUserTrustedRoots({ platform: "win32", trustedRootsFile: CFG_FILE, configFsOps: cfgFs(entries, { [CFG_FILE]: cfgJson(["D:/repo/bin"]) }) });
  assert.deepEqual(loaded.roots, []); assert.deepEqual(loaded.diagnostics.map((d) => d.reason), ["inside-git-repository"]);
});
check("trusted roots: on POSIX a group/world-writable or foreign-owned root or config file is rejected", () => {
  const roots = ["/opt/a", "/opt/b", "/opt/c"];
  const entries = { [CFG_FILE]: cfgEntry, "/opt/a": { kind: "dir", mode: 0o775 }, "/opt/b": { kind: "dir", uid: 0 }, "/opt/c": { kind: "dir" } };
  const loaded = loadUserTrustedRoots({ platform: "linux", uid: 1000, trustedRootsFile: CFG_FILE, configFsOps: cfgFs(entries, { [CFG_FILE]: cfgJson(roots) }) });
  assert.deepEqual(loaded.roots, ["/opt/c"]); assert.deepEqual(loaded.diagnostics.map((d) => d.reason), ["unsafe-ownership-or-mode", "unsafe-ownership-or-mode"]);
  for (const bad of [{ kind: "file", uid: 1000, mode: 0o666 }, { kind: "file", uid: 0, mode: 0o600 }, { kind: "link" }]) {
    const result = loadUserTrustedRoots({ platform: "linux", uid: 1000, trustedRootsFile: CFG_FILE, configFsOps: cfgFs({ [CFG_FILE]: bad, "/opt/c": { kind: "dir" } }, { [CFG_FILE]: cfgJson(["/opt/c"]) }) });
    assert.deepEqual(result.roots, []); assert.equal(result.diagnostics[0].code, "TTR-CONFIG-INVALID");
  }
});
check("trusted roots: a hermetic mocked filesystem never reads the host's real profile file and adds no hint", () => {
  assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [ROOT], fsOps: fixture({}) }), { ok: false, status: "binary_missing" });
});
// Real-filesystem cases (any host): temp home and root outside every repository; repository/symlink fixtures under scratch/.
const TTR_REPO_ROOT = pathResolve(pathDirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TTR_EXE = process.platform === "win32" ? "ttrprobe.exe" : "ttrprobe";
function realFixture(base, rootsOf) {
  mkdirSync(join(base, "home", ".config", "agent-pipeline"), { recursive: true, mode: 0o700 });
  const tools = join(base, "tools"); mkdirSync(tools, { mode: 0o755 }); writeFileSync(join(tools, TTR_EXE), "MZ");
  const configFile = join(base, "home", ".config", "agent-pipeline", "trusted-tool-roots.json");
  writeFileSync(configFile, cfgJson(rootsOf({ tools })), { mode: 0o600 });
  return { tools, configFile, homeDirectory: join(base, "home") };
}
check("trusted roots (real files): a configured temp root resolves through homeDirectory, and not without the file", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "ttr-real-")));
  try {
    const f = realFixture(base, ({ tools }) => [tools]);
    const noHome = join(base, "nohome");
    const resolved = resolveTrustedSystemExecutable("ttrprobe", { homeDirectory: f.homeDirectory, ...(process.platform === "win32" ? { homeDir: join(base, "nohome") } : {}) });
    assert.equal(resolved.ok, true, JSON.stringify(resolved)); assert.equal(resolved.path.toLowerCase(), join(f.tools, TTR_EXE).toLowerCase());
    const without = resolveTrustedSystemExecutable("ttrprobe", { homeDirectory: noHome });
    assert.equal(without.status, "binary_missing"); assert.ok(without.hint.includes("trusted-tool-roots.json"));
  } finally { rmSync(base, { recursive: true, force: true }); }
});
check("trusted roots (real files): a root inside a git repository under scratch/ is refused", () => {
  const scratch = join(TTR_REPO_ROOT, "scratch", "ttr"); mkdirSync(scratch, { recursive: true });
  const base = realpathSync(mkdtempSync(join(scratch, "repo-")));
  try {
    mkdirSync(join(base, ".git")); mkdirSync(join(base, "home", ".config", "agent-pipeline"), { recursive: true }); mkdirSync(join(base, "bin"));
    const configFile = join(base, "home", ".config", "agent-pipeline", "trusted-tool-roots.json");
    writeFileSync(configFile, cfgJson([join(base, "bin")]), { mode: 0o600 });
    writeFileSync(join(base, "bin", TTR_EXE), "MZ");
    const loaded = loadUserTrustedRoots({ trustedRootsFile: configFile });
    assert.deepEqual(loaded.roots, []); assert.deepEqual(loaded.diagnostics.map((d) => [d.code, d.reason]), [["TTR-ROOT-REJECTED", "inside-git-repository"]]);
    assert.equal(resolveTrustedSystemExecutable("ttrprobe", { trustedRootsFile: configFile }).ok, false);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
function symlinkOrSkip(label, target, path, type) {
  try { symlinkSync(target, path, type); return true; } catch (error) {
    process.stdout.write(`SKIP TTR-SYMLINK ${label} host-limitation: cannot create a symlink here (${error.code}); owner Coordinator, due 2026-10-19\n`); return false;
  }
}
check("trusted roots (real files): a symlinked root or a symlinked config file is refused (typed host skip where symlinks cannot be created)", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "ttr-link-")));
  try {
    const f = realFixture(base, ({ tools }) => [tools]);
    const linkRoot = join(base, "toolslink");
    if (symlinkOrSkip("root", f.tools, linkRoot, "junction")) {
      writeFileSync(f.configFile, cfgJson([linkRoot]));
      const loaded = loadUserTrustedRoots({ trustedRootsFile: f.configFile });
      assert.deepEqual(loaded.roots, []); assert.deepEqual(loaded.diagnostics.map((d) => d.reason), ["symlinked-root"]);
      assert.equal(resolveTrustedSystemExecutable("ttrprobe", { trustedRootsFile: f.configFile }).ok, false);
    }
    const real = join(base, "real-config.json"); writeFileSync(real, cfgJson([f.tools]), { mode: 0o600 });
    const linkFile = join(base, "linked-config.json");
    if (symlinkOrSkip("file", real, linkFile, "file")) {
      const loaded = loadUserTrustedRoots({ trustedRootsFile: linkFile });
      assert.deepEqual(loaded.roots, []); assert.deepEqual(loaded.diagnostics.map((d) => [d.code, d.reason]), [["TTR-CONFIG-INVALID", "symlinked-file"]]);
    }
  } finally { rmSync(base, { recursive: true, force: true }); }
});
process.stdout.write(`${passed}/${passed} checks passed.\n`);
