#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { assessTrustedExecutablePath, resolveTrustedSystemExecutable, windowsSystemToolRoots } from "./trusted-tool-resolution.mjs";
let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS TTR${String(passed).padStart(2, "0")} ${name}\n`); }
const ROOT = "C:\\Windows\\System32"; const file = { isFile: () => true, isSymbolicLink: () => false }; const link = { isFile: () => false, isSymbolicLink: () => true };
function missing(path) { const error = new Error(`missing ${path}`); error.code = "ENOENT"; return error; }
function fixture(entries, realpaths = {}) { return { lstatSync(path) { const entry = entries[path]; if (entry instanceof Error) throw entry; if (!entry) throw missing(path); return entry; }, realpathSync(path) { const entry = realpaths[path] ?? path; if (entry instanceof Error) throw entry; return entry; } }; }
check("accepts a direct .exe inside a named Windows system root", () => { const path = `${ROOT}\\gitleaks.exe`; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", windowsRoots: [ROOT], fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("accepts Git for Windows mingw64 direct executable from its named system root", () => { const root = "C:\\Program Files\\Git\\mingw64\\bin"; const path = `${root}\\git.exe`; assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [root], fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("resolves a non-Windows symlink to its regular executable target", () => { const path = "/usr/local/bin/codex"; const target = "/usr/bin/codex"; assert.deepEqual(resolveTrustedSystemExecutable("codex", { platform: "linux", fsOps: fixture({ [path]: link, [target]: file }, { [path]: target }) }), { ok: true, path: target }); });
check("uses POSIX fixture paths for explicitly mocked Linux resolution", () => { const path = "/usr/bin/gitleaks"; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "linux", fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("uses the fixed Homebrew system path for explicitly mocked macOS resolution", () => { const path = "/opt/homebrew/bin/gitleaks"; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "darwin", fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("uses only immutable Windows roots when environment-shaped input names a caller-controlled location", () => { const env = { ProgramFiles: "D:\\caller-controlled", SystemRoot: "E:\\caller-controlled", WINDIR: "F:\\caller-controlled", USERPROFILE: "Z:\\Users\\developer" }; const attackerPath = "D:\\caller-controlled\\Git\\cmd\\gitleaks.exe"; const probes = []; const fsOps = { lstatSync(path) { probes.push(path); if (path === attackerPath) return file; throw missing(path); }, realpathSync(path) { return path; } }; assert.deepEqual(windowsSystemToolRoots(env), ["C:\\Program Files\\Git\\cmd", "C:\\Program Files\\Git\\bin", "C:\\Program Files\\Git\\mingw64\\bin", "C:\\Program Files\\Gitleaks", "C:\\Program Files\\OSV-Scanner", "C:\\Program Files\\Semgrep", "C:\\Windows\\System32", "D:\\Program Files\\Git\\cmd", "D:\\Program Files\\Git\\bin", "D:\\Program Files\\Git\\mingw64\\bin", "D:\\Dev\\Git\\Git\\cmd", "D:\\Dev\\Git\\Git\\bin", "D:\\Dev\\Git\\Git\\mingw64\\bin", "D:\\Program Files\\Gitleaks", "D:\\Program Files\\OSV-Scanner", "D:\\Program Files\\Semgrep", "D:\\Windows\\System32"]); assert.equal(Object.isFrozen(windowsSystemToolRoots()), true); assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", env, fsOps }), { ok: false, status: "binary_missing" }); assert.equal(probes.includes(attackerPath), false); });
check("accepts a direct scanner executable from the immutable D drive system root", () => { const root = "D:\\Program Files\\Gitleaks"; const path = `${root}\\gitleaks.exe`; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("does not search user paths and still rejects wrappers in named Windows roots", () => { const userPath = "Z:\\Users\\developer\\gitleaks.exe"; const denied = new Error("user path touched"); denied.code = "EACCES"; const noUserSearch = { lstatSync(path) { if (path === userPath) throw denied; throw missing(path); }, realpathSync(path) { return path; } }; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", fsOps: noUserSearch }), { ok: false, status: "binary_missing" }); const wrapper = "C:\\Program Files\\Git\\cmd\\gitleaks.cmd"; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", fsOps: fixture({ [wrapper]: file }) }), { ok: false, status: "untrusted_path" }); });
check("rejects command, batch, and PowerShell wrappers as untrusted rather than missing", () => { for (const extension of [".cmd", ".bat", ".ps1"]) { const path = `${ROOT}\\gitleaks${extension}`; assert.deepEqual(resolveTrustedSystemExecutable("gitleaks", { platform: "win32", windowsRoots: [ROOT], fsOps: fixture({ [path]: file }) }), { ok: false, status: "untrusted_path" }); } });
check("rechecks a reparse target and rejects a user-writable final path", () => { const path = `${ROOT}\\semgrep.exe`; const userTarget = "C:\\Users\\developer\\AppData\\Local\\Temp\\semgrep.exe"; const fsOps = fixture({ [path]: link, [userTarget]: file }, { [path]: userTarget }); assert.deepEqual(resolveTrustedSystemExecutable("semgrep", { platform: "win32", windowsRoots: [ROOT], fsOps }), { ok: false, status: "untrusted_path" }); assert.deepEqual(assessTrustedExecutablePath(userTarget, { platform: "win32", windowsRoots: [ROOT], fsOps }), { ok: false, status: "untrusted_path" }); });
check("preserves probe errors separately from missing and rejected paths", () => { const denied = new Error("access denied"); denied.code = "EACCES"; assert.deepEqual(resolveTrustedSystemExecutable("osv-scanner", { platform: "win32", windowsRoots: [ROOT], fsOps: fixture({ [`${ROOT}\\osv-scanner.exe`]: denied }) }), { ok: false, status: "probe_error" }); assert.deepEqual(resolveTrustedSystemExecutable("osv-scanner", { platform: "win32", windowsRoots: [ROOT], fsOps: fixture({}) }), { ok: false, status: "binary_missing" }); });
check("accepts this host's PO-approved D:\\Dev\\Git\\Git direct executable from its named root", () => { const root = "D:\\Dev\\Git\\Git\\mingw64\\bin"; const path = `${root}\\git.exe`; assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [root], fsOps: fixture({ [path]: file }) }), { ok: true, path }); });
check("still rejects a wrapper inside the D:\\Dev\\Git\\Git host-approved root", () => { const root = "D:\\Dev\\Git\\Git\\cmd"; const path = `${root}\\git.bat`; assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: [root], fsOps: fixture({ [path]: file }) }), { ok: false, status: "untrusted_path" }); });
check("still rejects a neighboring sibling directory outside the exact D:\\Dev\\Git\\Git root", () => { const path = "D:\\Dev\\Git\\Git-other\\cmd\\git.exe"; assert.deepEqual(resolveTrustedSystemExecutable("git", { platform: "win32", windowsRoots: ["D:\\Dev\\Git\\Git\\cmd"], fsOps: fixture({ [path]: file }) }), { ok: false, status: "binary_missing" }); });
check("rejects a nested descendant below the PO-approved root", () => { const root = "D:\\Dev\\Git\\Git\\cmd"; const path = `${root}\\user-controlled\\git.exe`; assert.deepEqual(assessTrustedExecutablePath(path, { platform: "win32", windowsRoots: [root], fsOps: fixture({ [path]: file }) }), { ok: false, status: "untrusted_path" }); });
if (process.platform === "win32") {
  check("resolves this host's real, PO-approved Git install natively (no mocks)", () => { const resolved = resolveTrustedSystemExecutable("git"); assert.equal(resolved.ok, true, JSON.stringify(resolved)); assert.match(resolved.path.toLowerCase(), /^d:\\dev\\git\\git\\(cmd|bin|mingw64\\bin)\\git\.exe$/); });
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
process.stdout.write(`${passed}/${passed} checks passed.\n`);
