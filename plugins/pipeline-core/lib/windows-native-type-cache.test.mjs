// SPDX-License-Identifier: SUL-1.0
// Pins the per-user compiled-type cache that both native PowerShell helpers share (windows-owned-authority-native.ps1 and
// windows-native-process-observer.ps1). The loader block between the BEGIN/END markers is extracted from the helper and run
// in a real fixed Windows PowerShell with an isolated cache root and an isolated TEMP, both under the repository scratch/
// directory, so no test ever touches the real %LOCALAPPDATA% cache. The static pins run on every platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WINDOWS_POWERSHELL_PATHS, assessWindowsPrivatePath, hardenWindowsPrivateDirectory, sanitizeChildEnvironment } from './windows-private-state.mjs';

const lib = path.dirname(fileURLToPath(import.meta.url));
const HELPERS = {
  'owned-authority': { file: path.join(lib, 'windows-owned-authority-native.ps1'), type: 'PipelineOwnedAuthorityNative' },
  'process-observer': { file: path.join(lib, 'windows-native-process-observer.ps1'), type: 'PipelineProcessObserver' },
};
const BEGIN = '# BEGIN pipeline-native-type-cache v1';
const END = '# END pipeline-native-type-cache v1';
const read = (file) => readFileSync(file, 'utf8');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function loaderBlock(text) {
  assert.equal(text.split(BEGIN).length, 2, 'exactly one BEGIN marker');
  assert.equal(text.split(END).length, 2, 'exactly one END marker');
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END) + END.length;
  assert.ok(from >= 0 && to > from, 'BEGIN precedes END');
  return text.slice(from, to);
}

test('both native helpers carry the identical loader block and compile only through it', () => {
  const blocks = Object.values(HELPERS).map((helper) => loaderBlock(read(helper.file)));
  assert.equal(blocks[0], blocks[1], 'the two helper copies of the loader must stay byte-identical (drift pin)');
  for (const [tag, helper] of Object.entries(HELPERS)) {
    const text = read(helper.file);
    const outside = text.replace(loaderBlock(text), '');
    assert.equal(text.includes('\r'), false, `${tag}: LF only`);
    assert.equal(outside.split(`Import-PipelineNativeType $PipelineNativeSource '${tag}' '${helper.type}'`).length, 2, `${tag}: one loader call naming its own tag and type`);
    assert.doesNotMatch(outside, /Add-Type\s+-TypeDefinition/u, `${tag}: no direct compile outside the loader`);
    assert.ok(text.length < 32000, `${tag}: the helper travels as one -Command argument, which Windows caps near 32767 characters`);
  }
});

test('the loader loads only verified bytes and never uses the temp directory', () => {
  const block = loaderBlock(read(HELPERS['owned-authority'].file));
  assert.equal(block.split('[System.Reflection.Assembly]::Load($bytes)').length, 2, 'one load, from the verified byte array');
  assert.doesNotMatch(block, /Assembly\]::(?:LoadFrom|LoadFile|UnsafeLoadFrom|LoadWithPartialName)|Add-Type\s+-Path|Add-Type\s+-AssemblyName|\[Reflection\.Assembly\]/iu, 'no path-based assembly load');
  assert.doesNotMatch(block, /GetTempPath|GetTempFileName|\$env:TEMP|\$env:TMP|\$env:LOCALAPPDATA|\$PSScriptRoot/iu, 'cache root is the Known Folder, never a temp or environment-derived path');
  assert.match(block, /FileShare\]::Read/u, 'the entry is opened with a read-only share so it cannot be rewritten while it is read');
  assert.match(block, /\{Add-Type -TypeDefinition \$source\}\n\}\n# END/u, 'the in-memory compile stays as the last-resort fallback');
});

const powershell = process.platform === 'win32' ? WINDOWS_POWERSHELL_PATHS.find((candidate) => existsSync(candidate)) : undefined;
const live = { skip: powershell === undefined ? 'fixed Windows PowerShell is unavailable on this platform' : false };
const scratchBase = path.resolve(lib, '..', '..', '..', 'scratch', 'native-type-cache-tests');

function freshRoot() {
  mkdirSync(scratchBase, { recursive: true });
  const root = mkdtempSync(path.join(scratchBase, 't-'));
  mkdirSync(path.join(root, 'tmp'));
  return root;
}
const cacheDirOf = (root) => path.join(root, 'agent-pipeline-native-cache');
const ENTRY = /^cache-probe-[0-9a-f]{32}\.[0-9a-f]{64}\.dll$/u;
const entriesOf = (root) => readdirSync(cacheDirOf(root)).filter((name) => ENTRY.test(name));

function probeSource(marker) {
  return `using System;\npublic static class PipelineCacheProbe { public static string Ping() { return "${marker}"; } }`;
}
// Counts the compiles the loader performs by shadowing Add-Type; the shadow forwards to the real cmdlet.
const SHIM = 'function Add-Type {\n $script:AddTypeCalls++\n Microsoft.PowerShell.Utility\\Add-Type @args\n}\n$script:AddTypeCalls=0\n';

function probeScript(marker) {
  const loader = loaderBlock(read(HELPERS['owned-authority'].file));
  return `$ErrorActionPreference='Stop'\n${loader}\n${SHIM}$source=@'\n${probeSource(marker)}\n'@\n`
    + `Import-PipelineNativeType $source 'cache-probe' 'PipelineCacheProbe' $env:PIPELINE_TEST_CACHE_ROOT\n`
    + `[pscustomobject]@{loaded=$script:PipelineNativeTypeLoaded;addTypeCalls=$script:AddTypeCalls;result=[PipelineCacheProbe]::Ping()}|ConvertTo-Json -Compress\n`;
}

function run(script, root, extraEnvironment = {}) {
  const environment = sanitizeChildEnvironment({ ...process.env, TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), PIPELINE_TEST_CACHE_ROOT: root, ...extraEnvironment });
  return new Promise((resolve, reject) => {
    const seen = [];
    const watcher = watch(path.join(root, 'tmp'), (eventType, name) => { if (name) seen.push(String(name)); });
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 90000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      setTimeout(() => {
        watcher.close();
        resolve({ code, stdout: stdout.trim(), stderr, tempNames: seen });
      }, 400);
    });
  });
}
const probe = async (root, marker = 'pong') => {
  const outcome = await run(probeScript(marker), root);
  assert.equal(outcome.code, 0, `probe exited 0 (stderr: ${outcome.stderr.slice(0, 300)})`);
  return { ...JSON.parse(outcome.stdout), tempNames: outcome.tempNames };
};
const compileArtifacts = (names) => names.filter((name) => /\.(?:dll|cs|cmdline)$/iu.test(name));

test('first call compiles and publishes a verified cache entry; the second call loads it without compiling', live, async () => {
  const root = freshRoot();
  try {
    const first = await probe(root);
    assert.deepEqual({ loaded: first.loaded, addTypeCalls: first.addTypeCalls, result: first.result }, { loaded: true, addTypeCalls: 1, result: 'pong' });
    assert.ok(compileArtifacts(first.tempNames).length > 0, 'the temp watcher must see the first compile, otherwise a quiet second run proves nothing');
    const entries = entriesOf(root);
    assert.equal(entries.length, 1, 'exactly one published entry');
    assert.equal(readdirSync(cacheDirOf(root)).length, 1, 'no leftover build file');
    const bytes = readFileSync(path.join(cacheDirOf(root), entries[0]));
    assert.equal(entries[0].split('.')[1], sha256(bytes), 'the entry name carries the sha256 of its own bytes');
    assert.equal(assessWindowsPrivatePath(cacheDirOf(root), { environment: { ...process.env } }).status, 'secure');

    const second = await probe(root);
    assert.deepEqual({ loaded: second.loaded, addTypeCalls: second.addTypeCalls, result: second.result }, { loaded: true, addTypeCalls: 0, result: 'pong' });
    assert.deepEqual(compileArtifacts(second.tempNames), [], 'the cached call creates no DLL, source or command-line file in TEMP');
    assert.deepEqual(entriesOf(root), entries, 'the second call publishes nothing new');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a cached DLL whose bytes do not match its name is refused, the call falls back, and the result is unchanged', live, async () => {
  const root = freshRoot();
  try {
    await probe(root);
    const [entry] = entriesOf(root);
    const entryPath = path.join(cacheDirOf(root), entry);
    // A genuine, loadable assembly exposing the same type but answering differently, written over the entry in place (the
    // file keeps its private ACL), so only the hash-to-name binding stands between this payload and Assembly.Load.
    const alternate = path.join(root, 'alternate.dll');
    const build = await run(`$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${probeSource('tampered')}\n'@ -OutputAssembly $env:PIPELINE_TEST_OUT\n`, root, { PIPELINE_TEST_OUT: alternate });
    assert.equal(build.code, 0, `alternate build exited 0 (stderr: ${build.stderr.slice(0, 300)})`);
    const payload = readFileSync(alternate);
    assert.ok(payload.length >= 1024 && sha256(payload) !== entry.split('.')[1], 'the payload is plausible but not the named bytes');
    writeFileSync(entryPath, payload);

    const after = await probe(root);
    assert.equal(after.result, 'pong', 'the tampered assembly was never loaded');
    assert.deepEqual({ loaded: after.loaded, addTypeCalls: after.addTypeCalls }, { loaded: true, addTypeCalls: 1 }, 'fell back to a fresh compile');
    assert.deepEqual(readFileSync(entryPath), payload, 'the refused file is left as found, not trusted and not repaired in place');
    const healthy = entriesOf(root).filter((name) => name !== entry);
    assert.equal(healthy.length, 1, 'a new verified entry was published next to it');
    assert.equal(healthy[0].split('.')[1], sha256(readFileSync(path.join(cacheDirOf(root), healthy[0]))));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an insecure cache directory is never trusted or written to; the call falls back to the in-memory compile', live, async () => {
  const root = freshRoot();
  try {
    mkdirSync(cacheDirOf(root));
    const grant = spawnSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe'), [cacheDirOf(root), '/grant', '*S-1-1-0:(OI)(CI)R'], { windowsHide: true, encoding: 'utf8' });
    assert.equal(grant.status, 0, 'precondition: a world-readable ACE was added to the cache directory');
    assert.equal(assessWindowsPrivatePath(cacheDirOf(root), { environment: { ...process.env } }).status, 'insecure', 'precondition: the existing policy also calls this directory insecure');

    const outcome = await probe(root);
    assert.deepEqual({ loaded: outcome.loaded, addTypeCalls: outcome.addTypeCalls, result: outcome.result }, { loaded: false, addTypeCalls: 1, result: 'pong' });
    assert.deepEqual(readdirSync(cacheDirOf(root)), [], 'nothing was written into the insecure directory');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the PowerShell directory policy agrees with assessWindowsPrivatePath on secure and insecure directories', live, async () => {
  const root = freshRoot();
  try {
    const icacls = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe');
    const cases = { secure: path.join(root, 'secure'), inherited: path.join(root, 'inherited'), extraPrincipal: path.join(root, 'extra') };
    for (const dir of Object.values(cases)) mkdirSync(dir);
    assert.equal(hardenWindowsPrivateDirectory(cases.secure).status, 'secure');
    assert.equal(hardenWindowsPrivateDirectory(cases.extraPrincipal).status, 'secure');
    for (const dir of [cases.inherited, cases.extraPrincipal]) {
      assert.equal(spawnSync(icacls, [dir, '/grant', '*S-1-1-0:(OI)(CI)R'], { windowsHide: true, encoding: 'utf8' }).status, 0);
    }
    const js = Object.fromEntries(Object.entries(cases).map(([name, dir]) => [name, assessWindowsPrivatePath(dir, { environment: { ...process.env } }).status === 'secure']));
    assert.deepEqual(js, { secure: true, inherited: false, extraPrincipal: false }, 'preconditions as seen by the existing JavaScript policy');

    const script = `$ErrorActionPreference='Stop'\n${loaderBlock(read(HELPERS['owned-authority'].file))}\n`
      + `$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value\n`
      + `$rows=@(foreach($d in ($env:PIPELINE_TEST_DIRS -split '[|]')){[pscustomobject]@{dir=$d;secure=[bool](Test-PipelinePrivateDirectory $d $sid)}})\n`
      + `ConvertTo-Json -InputObject $rows -Compress\n`;
    const outcome = await run(script, root, { PIPELINE_TEST_DIRS: Object.values(cases).join('|') });
    assert.equal(outcome.code, 0, `policy probe exited 0 (stderr: ${outcome.stderr.slice(0, 300)})`);
    const ps = Object.fromEntries(JSON.parse(outcome.stdout).map((row) => [Object.keys(cases).find((name) => cases[name] === row.dir), row.secure]));
    assert.deepEqual(ps, js, 'PowerShell and JavaScript reach the same verdict for every directory');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('two parallel first calls both succeed and leave only verified entries and no build files', live, async () => {
  const root = freshRoot();
  try {
    const [left, right] = await Promise.all([probe(root), probe(root)]);
    assert.deepEqual([left.result, right.result, left.loaded, right.loaded], ['pong', 'pong', true, true]);
    const names = readdirSync(cacheDirOf(root));
    const entries = entriesOf(root);
    assert.ok(entries.length >= 1 && entries.length === names.length, 'every file left behind is a published, named entry');
    for (const entry of entries) assert.equal(entry.split('.')[1], sha256(readFileSync(path.join(cacheDirOf(root), entry))));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
