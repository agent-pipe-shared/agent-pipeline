// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/agy-central-snapshot.test.mjs
//
// RED pins for the per-user central agy snapshot (design note
// specs/sprint-alfred-epic/design/agy-snapshot-central-2026-10-08.md, section 3 contract,
// section 4 cases 1-13). The module lib/agy-central-snapshot.mjs does not exist yet: every case
// imports it dynamically and therefore fails at import until the F1 slice lands it.
// Fixture homes only: mkdtemp home under os.tmpdir(), injected homedirFn, fake runCli.
//
// Contract assumptions (for ratification) - the note leaves these undecided; smallest shape chosen:
//  A1. Typed failures are thrown Errors carrying `.code` (AGS-*). `agySnapshotRoot` never throws:
//      it returns null. `classifyAgySnapshot` never throws: it returns {status, code}.
//  A2. `deps` = { homedirFn, ...injected hooks }. Injected hooks (all optional, called synchronously):
//      deps.betweenSourcePasses(sourceRoot)   - runs after the copy, before the second source pass;
//      deps.beforeRename(tempDir)             - runs after verify + second pass, before rename; may throw (crash);
//      deps.beforePointerWrite(pointerPath)   - runs after the pointer preimage read, before its rename;
//      deps.readbackFn(pointerPath)           - replaces the pointer readback; its return value is the parsed pointer.
//  A3. `publishAgySnapshot` publishes the digest directory AND moves `current.json` to it (case 5
//      "pointer moved"); the downgrade check (case 12) runs against the version in the existing pointer,
//      numeric dotted-version compare, `version` read from the source plugin.json.
//  A4. The copy set is the whole plugin tree minus any `tests/` or `fixtures/` directory, minus
//      `*.test.mjs`, minus `.git`; a symlink in the source is refused (not silently skipped).
//  A5. Digest directory = `plugin-<snapshotSha256>`, snapshotSha256 = sha256 of the exact bytes of its
//      `snapshot.json`, which carries { schema, inventory:[{path,sha256}] } (as the git-hook precedent).
//      Any edit to that manifest (schema, owner or inventory field) changes its digest, so
//      `verifyAgySnapshot({root, snapshotSha256})` throws AGS-SNAPSHOT-FOREIGN for it.
//  A6. `classifyAgySnapshot({observation, deps})`, observation =
//      { attestedSourceSnapshotSha256?: string, managedCopySha256?: string }.
//      pointer digest != attested digest -> stale; managed-copy digest != pointer digest -> stale when it
//      equals a retained snapshot digest, foreign when it matches none (0.6.2-style hand import).
//      A current pointer whose directory fails verification -> foreign.
//  A7. Pruning keeps the pointed digest plus ONE previous digest (the digest the pointer held before
//      the latest move).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = join(HERE, 'agy-central-snapshot.mjs');
const load = () => import(pathToFileURL(MODULE_PATH).href);
const posix = process.platform !== 'win32';

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'ags-home-'));
  mkdirSync(join(home, '.agent-pipeline'), { recursive: true });
  return home;
}
function makePlugin(version = '1.0.0', extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ags-src-'));
  const put = (rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
  put('plugin.json', JSON.stringify({ name: 'pipeline-core', version }));
  put('skills/s/SKILL.md', `skill ${version}\n`);
  put('agents/a.md', 'agent\n');
  put('hooks.json', '{"hooks":[]}\n');
  put('hooks/h.mjs', 'export const h = 1;\n');
  put('lib/l.mjs', 'export const l = 1;\n');
  put('lib/l.test.mjs', 'test file\n');
  put('tests/t.mjs', 'excluded\n');
  put('fixtures/f.json', '{}\n');
  for (const [rel, body] of Object.entries(extra)) put(rel, body);
  return root;
}
function entries(dir) { return existsSync(dir) ? readdirSync(dir) : []; }
function fail(message) { return (e) => e?.code === message; }
function cleanup(...dirs) { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
async function setup(version) {
  const mod = await load();
  const home = makeHome();
  const src = makePlugin(version);
  return { mod, home, src, deps: { homedirFn: () => home }, root: join(realpathSync(home), '.agent-pipeline', 'agy-snapshot') };
}
const pointer = (root) => JSON.parse(readFileSync(join(root, 'current.json'), 'utf8'));

test('AM-1: anchor - root is <realpath home>/.agent-pipeline/agy-snapshot and nothing outside the fixture is read', async () => {
  const mod = await load();
  const home = makeHome();
  const touched = [];
  const deps = { homedirFn: () => { touched.push('homedirFn'); return home; } };
  const root = mod.agySnapshotRoot(deps);
  assert.equal(root, join(realpathSync(home), '.agent-pipeline', 'agy-snapshot'));
  assert.deepEqual(touched, ['homedirFn']);
  assert.equal(existsSync(root), false, 'computing the root must not create it');
  cleanup(home);
});

test('AM-2: anchor unresolved - empty, relative or throwing homedirFn gives null, AGS-ANCHOR-UNRESOLVED, nothing created', async () => {
  const mod = await load();
  const src = makePlugin();
  for (const homedirFn of [() => '', () => 'relative/home', () => { throw new Error('no home'); }]) {
    const deps = { homedirFn };
    assert.equal(mod.agySnapshotRoot(deps), null);
    assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps }), fail('AGS-ANCHOR-UNRESOLVED'));
    const verdict = mod.classifyAgySnapshot({ observation: {}, deps });
    assert.equal(verdict.code, 'AGS-ANCHOR-UNRESOLVED');
  }
  cleanup(src);
});

test('AM-3: first publish - plugin-<sha> + snapshot.json, tests/fixtures excluded, private modes, no temp left', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const result = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  assert.match(result.snapshotSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.version, '1.0.0');
  assert.equal(result.root, join(root, `plugin-${result.snapshotSha256}`));
  assert.ok(existsSync(join(result.root, 'snapshot.json')));
  for (const wanted of ['plugin.json', 'skills/s/SKILL.md', 'agents/a.md', 'hooks.json', 'hooks/h.mjs', 'lib/l.mjs']) assert.ok(existsSync(join(result.root, wanted)), wanted);
  for (const excluded of ['tests', 'fixtures', 'lib/l.test.mjs']) assert.equal(existsSync(join(result.root, excluded)), false, excluded);
  if (posix) {
    assert.equal(statSync(result.root).mode & 0o777, 0o700);
    assert.equal(statSync(join(result.root, 'snapshot.json')).mode & 0o777, 0o600);
  }
  assert.deepEqual(entries(root).filter((n) => n !== 'current.json' && n !== result.root.split(/[\\/]/).pop()), []);
  mod.verifyAgySnapshot({ root: result.root, snapshotSha256: result.snapshotSha256 });
  cleanup(home, src);
});

test('AM-4: idempotent - same source twice gives same root and digest and rewrites nothing', async () => {
  const { mod, home, src, deps } = await setup('1.0.0');
  const first = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  const manifest = join(first.root, 'snapshot.json');
  const before = statSync(manifest);
  const second = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  const after = statSync(manifest);
  assert.equal(second.root, first.root);
  assert.equal(second.snapshotSha256, first.snapshotSha256);
  assert.equal(after.mtimeMs, before.mtimeMs);
  if (posix) assert.equal(after.ino, before.ino);
  cleanup(home, src);
});

test('AM-5: new version - new digest directory, pointer moved, previous kept; third publish prunes to current + 1 previous', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  const src2 = makePlugin('1.1.0');
  const v2 = mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps });
  assert.notEqual(v2.snapshotSha256, v1.snapshotSha256);
  assert.equal(pointer(root).snapshotSha256, v2.snapshotSha256);
  assert.equal(pointer(root).schema, 'pipeline.agy-snapshot-current.v1');
  assert.ok(existsSync(v1.root), 'previous kept');
  const src3 = makePlugin('1.2.0');
  const v3 = mod.publishAgySnapshot({ sourcePluginRoot: src3, attestationSourceRoot: src3, deps });
  assert.equal(pointer(root).snapshotSha256, v3.snapshotSha256);
  assert.ok(existsSync(v3.root), 'pointed one is never pruned');
  assert.ok(existsSync(v2.root), 'one previous retained');
  assert.equal(existsSync(v1.root), false, 'older pruned');
  assert.equal(entries(root).filter((n) => n.startsWith('plugin-')).length, 2);
  assert.deepEqual(mod.readCurrentAgySnapshot(deps).snapshotSha256, v3.snapshotSha256);
  cleanup(home, src, src2, src3);
});

test('AM-6: source drift between passes - AGS-SOURCE-DRIFT, no destination, temp removed, pointer unchanged', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  const src2 = makePlugin('1.1.0');
  const drifting = { ...deps, betweenSourcePasses: (sourceRoot) => writeFileSync(join(sourceRoot, 'lib/l.mjs'), 'export const l = 2;\n') };
  assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps: drifting }), fail('AGS-SOURCE-DRIFT'));
  assert.deepEqual(entries(root).filter((n) => n.startsWith('plugin-')), [`plugin-${v1.snapshotSha256}`]);
  assert.equal(pointer(root).snapshotSha256, v1.snapshotSha256);
  cleanup(home, src, src2);
});

test('AM-7: crash after copy, before rename - no visible digest directory; next publish sweeps the temp; pointer unchanged', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  const src2 = makePlugin('1.1.0');
  const crashing = { ...deps, beforeRename: () => { throw Object.assign(new Error('injected crash'), { code: 'INJECTED-CRASH' }); } };
  assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps: crashing }), fail('INJECTED-CRASH'));
  assert.deepEqual(entries(root).filter((n) => /^plugin-[a-f0-9]{64}$/.test(n)), [`plugin-${v1.snapshotSha256}`], 'no visible new digest directory');
  assert.equal(pointer(root).snapshotSha256, v1.snapshotSha256);
  const v2 = mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps });
  assert.equal(entries(root).filter((n) => n.startsWith('plugin-') && !/^plugin-[a-f0-9]{64}$/.test(n)).length, 0, 'stale temp swept');
  assert.equal(pointer(root).snapshotSha256, v2.snapshotSha256);
  cleanup(home, src, src2);
});

test('AM-8: pointer atomicity - concurrent change gives AGS-POINTER-DRIFT; readback mismatch fails typed, old pointer intact', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  const src2 = makePlugin('1.1.0');
  const v2 = mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps });
  const original = readFileSync(join(root, 'current.json'), 'utf8');
  const racing = { ...deps, beforePointerWrite: (path) => writeFileSync(path, JSON.stringify({ schema: 'pipeline.agy-snapshot-current.v1', snapshotSha256: 'f'.repeat(64), version: '9.9.9', publishedAt: new Date().toISOString() })) };
  assert.throws(() => mod.setCurrentAgySnapshot({ snapshotSha256: v1.snapshotSha256 }, racing), fail('AGS-POINTER-DRIFT'));
  assert.notEqual(pointer(root).snapshotSha256, v1.snapshotSha256, 'the racing writer wins, we do not overwrite it');
  writeFileSync(join(root, 'current.json'), original);
  const lying = { ...deps, readbackFn: () => ({ schema: 'pipeline.agy-snapshot-current.v1', snapshotSha256: 'e'.repeat(64) }) };
  assert.throws(() => mod.setCurrentAgySnapshot({ snapshotSha256: v1.snapshotSha256 }, lying), (e) => /^AGS-/.test(e?.code ?? ''));
  assert.equal(readFileSync(join(root, 'current.json'), 'utf8'), original, 'old pointer intact');
  assert.equal(pointer(root).snapshotSha256, v2.snapshotSha256);
  cleanup(home, src, src2);
});

test('AM-9: missing - no directory, and a pointer without its directory, both classify missing with AGS-SNAPSHOT-MISSING', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  assert.deepEqual({ ...mod.classifyAgySnapshot({ observation: {}, deps }) }, { status: 'missing', code: 'AGS-SNAPSHOT-MISSING' });
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  rmSync(v1.root, { recursive: true, force: true });
  assert.ok(existsSync(join(root, 'current.json')));
  const verdict = mod.classifyAgySnapshot({ observation: { attestedSourceSnapshotSha256: v1.snapshotSha256 }, deps });
  assert.equal(verdict.status, 'missing');
  assert.equal(verdict.code, 'AGS-SNAPSHOT-MISSING');
  cleanup(home, src);
});

test('AM-10: stale - pointer digest differs from the attested source; managed-copy digest differs from the pointer', async () => {
  const { mod, home, src, deps } = await setup('1.0.0');
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  const fresh = mod.classifyAgySnapshot({ observation: { attestedSourceSnapshotSha256: v1.snapshotSha256, managedCopySha256: v1.snapshotSha256 }, deps });
  assert.deepEqual({ ...fresh }, { status: 'current', code: null });
  const otherAttested = mod.classifyAgySnapshot({ observation: { attestedSourceSnapshotSha256: 'a'.repeat(64) }, deps });
  assert.equal(otherAttested.status, 'stale');
  assert.equal(otherAttested.code, 'AGS-SNAPSHOT-STALE');
  const src2 = makePlugin('1.1.0');
  const v2 = mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps });
  const lagging = mod.classifyAgySnapshot({ observation: { attestedSourceSnapshotSha256: v2.snapshotSha256, managedCopySha256: v1.snapshotSha256 }, deps });
  assert.equal(lagging.status, 'stale');
  assert.equal(lagging.code, 'AGS-SNAPSHOT-STALE');
  cleanup(home, src, src2);
});

test('AM-11: foreign - edited file, extra file, symlink, wrong schema, owner mismatch, and an unmatched managed copy', async () => {
  const mod = await load();
  const tamper = {
    'edited file': (r) => writeFileSync(join(r, 'lib/l.mjs'), 'export const l = 666;\n'),
    'extra file': (r) => writeFileSync(join(r, 'lib/extra.mjs'), 'export {};\n'),
    symlink: (r) => symlinkSync(join(r, 'plugin.json'), join(r, 'lib/link.mjs')),
    'wrong schema': (r) => writeFileSync(join(r, 'snapshot.json'), JSON.stringify({ schema: 'pipeline.other.v1', inventory: [] })),
    'owner mismatch': (r) => writeFileSync(join(r, 'snapshot.json'), JSON.stringify({ schema: 'pipeline.agy-snapshot.v1', owner: 'someone-else', inventory: [] })),
  };
  for (const [name, mutate] of Object.entries(tamper)) {
    const home = makeHome();
    const src = makePlugin('1.0.0');
    const deps = { homedirFn: () => home };
    const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
    try { mutate(v1.root); } catch (e) { if (name === 'symlink') { cleanup(home, src); continue; } throw e; }
    assert.throws(() => mod.verifyAgySnapshot({ root: v1.root, snapshotSha256: v1.snapshotSha256 }), fail('AGS-SNAPSHOT-FOREIGN'), name);
    const verdict = mod.classifyAgySnapshot({ observation: { attestedSourceSnapshotSha256: v1.snapshotSha256 }, deps });
    assert.equal(verdict.status, 'foreign', name);
    assert.equal(verdict.code, 'AGS-SNAPSHOT-FOREIGN', name);
    cleanup(home, src);
  }
  const home = makeHome();
  const src = makePlugin('1.0.0');
  const deps = { homedirFn: () => home };
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
  const handImported = mod.classifyAgySnapshot({ observation: { attestedSourceSnapshotSha256: v1.snapshotSha256, managedCopySha256: 'd'.repeat(64) }, deps });
  assert.equal(handImported.status, 'foreign');
  assert.equal(handImported.code, 'AGS-SNAPSHOT-FOREIGN');
  cleanup(home, src);
});

test('AM-12: downgrade - publishing an older version over a newer pointer gives AGS-DOWNGRADE-REFUSED and changes nothing', async () => {
  const { mod, home, deps, root } = await setup('1.0.0');
  const newer = makePlugin('2.0.0');
  const v2 = mod.publishAgySnapshot({ sourcePluginRoot: newer, attestationSourceRoot: newer, deps });
  const older = makePlugin('1.5.0');
  const pointerBefore = readFileSync(join(root, 'current.json'), 'utf8');
  const dirsBefore = entries(root).sort();
  assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: older, attestationSourceRoot: older, deps }), fail('AGS-DOWNGRADE-REFUSED'));
  assert.equal(readFileSync(join(root, 'current.json'), 'utf8'), pointerBefore);
  assert.deepEqual(entries(root).sort(), dirsBefore);
  assert.equal(pointer(root).snapshotSha256, v2.snapshotSha256);
  cleanup(home, newer, older);
});

test('AM-13: static - module has no .gemini, homedir or drive-letter literal outside the injected anchor', async () => {
  const source = readFileSync(MODULE_PATH, 'utf8');
  assert.equal(/\.gemini/.test(source), false, 'no .gemini literal');
  assert.equal(/\bhomedir\b/.test(source.replace(/homedirFn/g, '')), false, 'no homedir use except the injected homedirFn passed through machinePlaneFilePath');
  assert.equal(/['"`][A-Za-z]:[\\/]/.test(source), false, 'no drive-letter literal');
  assert.match(source, /machinePlaneFilePath/, 'anchor derives from machinePlaneFilePath, never a second home derivation');
});

// ================================================================================================
// AM-T2: refresh wiring pins, cases AM-14..AM-17 (design note section 3 "Refresh wiring" and
// "Stays per project / Retired per project", section 4 cases 14-17, slice F2). RED by design where a
// wiring entry point does not exist yet; the cases drive the REAL createAntigravityRefreshHost and the
// REAL topology observers with a fake agy CLI (`runCli`) and a fixture configRoot, so the real CLI and
// the real home are never reached (refresh-host:89 only spawns when configRoot is the real agy home).
//
// AM-T2 assumptions (for ratification) - names and signatures chosen here, the note leaves them open:
//  B1. NEW module lib/agy-central-refresh.mjs (F2): a thin host-boundary orchestrator over
//      createAntigravityRefreshHost. The installer source kind `central-snapshot` and the update verb
//      are its two callers. Chosen as a new lib module, not as an export of an existing script, so that
//      importing it can never run an installer or updater main().
//      installAgyFromCentralSnapshot({ sourcePluginRoot, attestationSourceRoot, configRoot, workspaceRoot,
//        deps, runCli, writeInstalledReceipt }) -> Promise<{ status, reason, snapshot, refresh }>
//        = publishAgySnapshot({ sourcePluginRoot, attestationSourceRoot, deps }), then
//          createAntigravityRefreshHost({ configRoot, workspaceRoot, approvedSourceRoot: snapshot.root,
//          scope: 'global', globalChangeApproved: true, runCli, writeInstalledReceipt }).refresh().
//        status is the host status ('refreshed' | 'refused' | 'partial'); reason is the host ATR-* code or null;
//        snapshot = { root, snapshotSha256, version } as returned by publishAgySnapshot.
//        The injected writeInstalledReceipt receives the host receipt (sourcePluginRoot = SNAPSHOT root,
//        installedPluginRoot = managed copy, plugin.version) plus attestationSourceRoot = the clean Git
//        source (the installer's attestation split, install-agy.mjs:204-207).
//  B2. applyAgyCentralSnapshotAfterUpdate({ ...B1 options, resolveCliPath }) (the update verb's call after apply):
//        same result as B1; but when resolveCliPath() (default: resolveAntigravityCliPath, refresh-host:62)
//        returns null it resolves { status: 'skipped', reason: <string>, snapshot: null } WITHOUT publishing and
//        without calling runCli. Publish precedes refresh. A refused refresh surfaces the host code unchanged in
//        `reason` and does not throw; a snapshot published before a refused refresh is kept (not pinned).
//  B3. NEW module lib/agy-start-hint.mjs: observeAgyStartHint({ workspaceRoot, configRoot, loadedPluginRoot,
//        deps }) -> Promise<{ governed: boolean, loaded }>, loaded = observeAntigravityLoadedTopology(...) result.
//        Read-only: it writes nothing in workspaceRoot, the anchor dir or configRoot (no bootstrap lock, no state).
//        The lock file name is deliberately not pinned (the note gives none): any path matching /lock/i is refused.
//  B4. The fake agy implements `--version` (1.2.12), `plugin validate <root>`, `plugin install <root>` (copies the
//      tree to <configRoot>/config/plugins/agent-pipeline-core and records config/import_manifest.json) and
//      `plugin uninstall agent-pipeline-core`. Source fixtures carry plugin.json name `agent-pipeline-core`,
//      the plugin name the topology observer matches (topology:84-85); AM-1..13 fixtures use another name.
//  B5. Observation, NOT pinned (for the Elephant): in scope 'global' the host always writes a global
//      config/plugins.json entry for the source root (its final readback requires one, refresh-host:153-156),
//      and with globalChangeApproved it rebinds an existing WORKSPACE Pipeline entry to the source root
//      instead of retiring it (refresh-host:131,151). Item option A says "no plugins.json entry" and the note
//      retires workspace entries. AM-15 therefore retires explicitly through removeAntigravityWorkspaceRegistration
//      BEFORE the refresh and pins "no Pipeline entry in any workspace afterwards"; it does not pin the global
//      plugins.json content.
// ================================================================================================
import { cpSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';

const AGY_NAME = 'agent-pipeline-core';
const digestOf = (bytes) => createHash('sha256').update(bytes).digest('hex');
const loadEntry = () => import(pathToFileURL(join(HERE, 'agy-central-refresh.mjs')).href);
const loadStart = () => import(pathToFileURL(join(HERE, 'agy-start-hint.mjs')).href);
async function loadSeams() {
  return {
    host: await import(pathToFileURL(join(HERE, 'antigravity-topology-refresh-host.mjs')).href),
    topo: await import(pathToFileURL(join(HERE, 'antigravity-plugin-topology.mjs')).href),
  };
}
function physicalTmp(prefix) { return realpathSync(mkdtempSync(join(tmpdir(), prefix))); }
function agyPlugin(version) { return makePlugin(version, { 'plugin.json': JSON.stringify({ name: AGY_NAME, version }) }); }
function listTree(dir) {
  const out = {};
  const walk = (current, prefix) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const rel = `${prefix}${name}`;
      const st = lstatSync(full);
      if (st.isDirectory()) { out[`${rel}/`] = 'dir'; walk(full, `${rel}/`); }
      else out[rel] = st.isSymbolicLink() ? 'symlink' : digestOf(readFileSync(full));
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}
function makeFakeAgy() {
  const configRoot = physicalTmp('ags-agyhome-');
  mkdirSync(join(configRoot, 'config'), { recursive: true });
  const plugins = join(configRoot, 'config', 'plugins');
  const importManifest = join(configRoot, 'config', 'import_manifest.json');
  const managedRoot = join(plugins, AGY_NAME);
  const calls = [];
  const runCli = (argv) => {
    calls.push([...argv]);
    if (argv[0] === '--version') return { status: 'ok', version: '1.2.12' };
    if (argv[0] === 'plugin' && argv[1] === 'validate') return { status: 'ok' };
    if (argv[0] === 'plugin' && argv[1] === 'uninstall' && argv[2] === AGY_NAME) {
      rmSync(managedRoot, { recursive: true, force: true });
      writeFileSync(importManifest, JSON.stringify({ imports: [] }));
      return { status: 'ok' };
    }
    if (argv[0] === 'plugin' && argv[1] === 'install' && typeof argv[2] === 'string') {
      mkdirSync(plugins, { recursive: true });
      cpSync(argv[2], managedRoot, { recursive: true });
      writeFileSync(importManifest, JSON.stringify({ imports: [{ name: AGY_NAME, source: argv[2] }] }));
      return { status: 'ok' };
    }
    return { status: 'failed' };
  };
  return { configRoot, managedRoot, calls, runCli, mutating: () => calls.filter((argv) => argv[0] !== '--version') };
}
function makeReceipts() {
  const written = [];
  return { written, writeInstalledReceipt: (receipt) => { written.push(receipt); return { status: 'written' }; } };
}
// Pre-state helper: install an already published snapshot through the REAL host and the fake CLI.
function seedManagedCopy(seams, { configRoot, workspaceRoot, snapshotRoot, agy, receipts }) {
  const host = seams.host.createAntigravityRefreshHost({ configRoot, workspaceRoot, approvedSourceRoot: snapshotRoot, scope: 'global', globalChangeApproved: true, runCli: agy.runCli, writeInstalledReceipt: receipts.writeInstalledReceipt });
  const result = host.refresh();
  assert.equal(result.status, 'refreshed', `seeding the managed copy through the real host failed: ${result.reason ?? ''}`);
}

test('AM-14: refresh uses the snapshot - uninstall, validate <snapshot>, install <snapshot> in order; receipt bound to the Git source; fixture config root only', async () => {
  const seams = await loadSeams();
  const mod = await load();
  const home = makeHome();
  const deps = { homedirFn: () => home };
  const root = join(realpathSync(home), '.agent-pipeline', 'agy-snapshot');
  const agy = makeFakeAgy();
  const ws = physicalTmp('ags-ws-');
  const receipts = makeReceipts();
  assert.ok(agy.configRoot.startsWith(realpathSync(tmpdir())), 'the agy config root is a fixture under the temp dir, so the real CLI is never reached');
  const git1 = agyPlugin('1.0.0');
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: git1, attestationSourceRoot: git1, deps });
  seedManagedCopy(seams, { configRoot: agy.configRoot, workspaceRoot: ws, snapshotRoot: v1.root, agy, receipts });
  assert.deepEqual(agy.mutating(), [['plugin', 'validate', v1.root], ['plugin', 'install', v1.root]], 'pre-state: v1 installed from its snapshot');
  const git2 = agyPlugin('1.1.0');
  const seededCalls = agy.calls.length;
  const { installAgyFromCentralSnapshot } = await loadEntry();
  const result = await installAgyFromCentralSnapshot({ sourcePluginRoot: git2, attestationSourceRoot: git2, configRoot: agy.configRoot, workspaceRoot: ws, deps, runCli: agy.runCli, writeInstalledReceipt: receipts.writeInstalledReceipt });
  assert.equal(result.status, 'refreshed', result.reason ?? '');
  const snap = result.snapshot;
  assert.notEqual(snap.snapshotSha256, v1.snapshotSha256);
  assert.equal(snap.root, join(root, `plugin-${snap.snapshotSha256}`));
  const issued = agy.calls.slice(seededCalls);
  assert.deepEqual(issued.filter((argv) => argv[0] !== '--version'), [['plugin', 'uninstall', AGY_NAME], ['plugin', 'validate', snap.root], ['plugin', 'install', snap.root]]);
  assert.equal(issued.flat().includes(git2), false, 'the Git source is attested, never handed to agy');
  const managedDigest = digestOf(readFileSync(join(agy.managedRoot, 'snapshot.json')));
  assert.equal(managedDigest, snap.snapshotSha256, 'the managed copy is the snapshot');
  assert.equal(pointer(root).snapshotSha256, snap.snapshotSha256);
  const verdict = mod.classifyAgySnapshot({ observation: { attestedSourceSnapshotSha256: snap.snapshotSha256, managedCopySha256: managedDigest }, deps });
  assert.deepEqual({ ...verdict }, { status: 'current', code: null });
  const receipt = receipts.written.at(-1);
  assert.equal(receipt.sourcePluginRoot, snap.root);
  assert.equal(receipt.installedPluginRoot, agy.managedRoot);
  assert.equal(receipt.attestationSourceRoot, git2);
  assert.equal(receipt.plugin.version, '1.1.0');
  cleanup(home, agy.configRoot, ws, git1, git2);
});

test('AM-15: several projects - a workspace entry to a source checkout holds the plan; after retirement it is prepared; both workspaces observe one loaded digest; per-project state stays', async () => {
  const seams = await loadSeams();
  const mod = await load();
  const home = makeHome();
  const deps = { homedirFn: () => home };
  const agy = makeFakeAgy();
  const wsA = physicalTmp('ags-wsa-');
  const wsB = physicalTmp('ags-wsb-');
  const receipts = makeReceipts();
  const git = agyPlugin('1.0.0');
  const checkout = agyPlugin('1.0.0');
  const foreign = physicalTmp('ags-foreign-');
  writeFileSync(join(foreign, 'plugin.json'), JSON.stringify({ name: 'someone-elses-plugin', version: '1.0.0' }));
  const stays = { 'project/pipeline.json': '{"calibration":true}\n', 'pipeline.user.yaml': 'gates:\n  push_approval: signature\n', '.git/agent-pipeline/state.json': '{"state":"per-project"}\n' };
  for (const ws of [wsA, wsB]) for (const [rel, body] of Object.entries(stays)) { mkdirSync(dirname(join(ws, rel)), { recursive: true }); writeFileSync(join(ws, rel), body); }
  const stayDigests = (ws) => Object.fromEntries(Object.keys(stays).map((rel) => [rel, digestOf(readFileSync(join(ws, rel)))]));
  const staysBefore = { A: stayDigests(wsA), B: stayDigests(wsB) };
  mkdirSync(join(wsA, '.agents'), { recursive: true });
  writeFileSync(join(wsA, '.agents', 'plugins.json'), JSON.stringify({ entries: [{ path: checkout }, { path: foreign }] }));
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: git, attestationSourceRoot: git, deps });
  const planFor = (ws) => seams.topo.planAntigravityTopologyRefresh({ observation: seams.topo.observeAntigravityPluginTopology({ configRoot: agy.configRoot, workspaceRoot: ws, approvedSourceRoot: v1.root }), scope: 'global', globalChangeApproved: true, cliVersion: '1.2.12' });
  const held = planFor(wsA);
  assert.equal(held.status, 'held');
  assert.equal(held.reason, 'AT-OTHER-SCOPE-PIPELINE-CONFLICT');
  const bindings = seams.host.observeAntigravityWorkspaceBindings({ workspaceRoot: wsA });
  assert.deepEqual([bindings.ownedIndexes, bindings.foreignIndexes], [[0], [1]]);
  assert.deepEqual(seams.host.removeAntigravityWorkspaceRegistration({ workspaceRoot: wsA, expectedSha256: bindings.sha256 }), { status: 'removed' });
  assert.deepEqual(JSON.parse(readFileSync(join(wsA, '.agents', 'plugins.json'), 'utf8')).entries, [{ path: foreign }], 'only the Pipeline entry is retired');
  assert.equal(planFor(wsA).status, 'prepared');
  assert.equal(planFor(wsB).status, 'prepared');
  const { installAgyFromCentralSnapshot } = await loadEntry();
  const result = await installAgyFromCentralSnapshot({ sourcePluginRoot: git, attestationSourceRoot: git, configRoot: agy.configRoot, workspaceRoot: wsA, deps, runCli: agy.runCli, writeInstalledReceipt: receipts.writeInstalledReceipt });
  assert.equal(result.status, 'refreshed', result.reason ?? '');
  assert.equal(result.snapshot.snapshotSha256, v1.snapshotSha256, 'same source, same snapshot');
  const loadedFor = (ws) => seams.topo.observeAntigravityLoadedTopology({ loadedPluginRoot: agy.managedRoot, configRoot: agy.configRoot, workspaceRoot: ws });
  const a = loadedFor(wsA);
  const b = loadedFor(wsB);
  for (const loaded of [a, b]) {
    assert.equal(loaded.status, 'current');
    assert.equal(loaded.loadedKind, 'managed-copy');
    assert.equal(loaded.sourcePluginRoot, result.snapshot.root);
  }
  assert.equal(a.loadedContentSha256, b.loadedContentSha256, 'both workspaces observe the same loaded digest');
  assert.equal(a.loadedContentSha256, a.sourceContentSha256);
  for (const ws of [wsA, wsB]) assert.deepEqual(seams.host.observeAntigravityWorkspaceBindings({ workspaceRoot: ws }).ownedIndexes, [], 'no workspace registers its own Pipeline copy');
  assert.equal(existsSync(join(wsB, '.agents')), false, 'B never gains agy workspace state');
  assert.deepEqual({ A: stayDigests(wsA), B: stayDigests(wsB) }, staysBefore, 'calibration, user config and .git/agent-pipeline state stay per project and untouched');
  cleanup(home, agy.configRoot, wsA, wsB, git, checkout, foreign);
});

test('AM-16: update verb - publishes then refreshes; no agy CLI means no snapshot and no error; an unverifiable surface is refused with the host code and mutates nothing', async () => {
  const mod = await load();
  const home = makeHome();
  const deps = { homedirFn: () => home };
  const root = join(realpathSync(home), '.agent-pipeline', 'agy-snapshot');
  const agy = makeFakeAgy();
  const ws = physicalTmp('ags-ws-');
  const receipts = makeReceipts();
  const git = agyPlugin('1.0.0');
  const atValidate = [];
  const spy = (argv) => {
    if (argv[0] === 'plugin' && argv[1] === 'validate') atValidate.push({ target: argv[2], manifest: existsSync(join(argv[2], 'snapshot.json')), pointer: existsSync(join(root, 'current.json')) ? pointer(root).snapshotSha256 : null });
    return agy.runCli(argv);
  };
  const cliFound = () => join(agy.configRoot, 'agy-stub');
  const { applyAgyCentralSnapshotAfterUpdate } = await loadEntry();
  const common = { sourcePluginRoot: git, attestationSourceRoot: git, workspaceRoot: ws, writeInstalledReceipt: receipts.writeInstalledReceipt };

  const applied = await applyAgyCentralSnapshotAfterUpdate({ ...common, configRoot: agy.configRoot, deps, runCli: spy, resolveCliPath: cliFound });
  assert.equal(applied.status, 'refreshed', applied.reason ?? '');
  assert.equal(atValidate.length, 1);
  assert.equal(atValidate[0].target, applied.snapshot.root, 'agy validates the snapshot');
  assert.equal(atValidate[0].manifest, true, 'the snapshot is published when agy first sees it');
  assert.equal(atValidate[0].pointer, applied.snapshot.snapshotSha256, 'the pointer moved before the refresh');

  const homeNoCli = makeHome();
  const agyNoCli = makeFakeAgy();
  const skipped = await applyAgyCentralSnapshotAfterUpdate({ ...common, configRoot: agyNoCli.configRoot, deps: { homedirFn: () => homeNoCli }, runCli: agyNoCli.runCli, resolveCliPath: () => null });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.snapshot ?? null, null);
  assert.deepEqual(entries(join(realpathSync(homeNoCli), '.agent-pipeline')), [], 'no CLI: nothing published');
  assert.deepEqual(agyNoCli.calls, [], 'no CLI: no call');

  const homeBroken = makeHome();
  const agyBroken = makeFakeAgy();
  const receiptsBroken = makeReceipts();
  writeFileSync(join(agyBroken.configRoot, 'config', 'plugins.json'), '{"entries":"not-an-array"}\n');
  const before = listTree(agyBroken.configRoot);
  const refused = await applyAgyCentralSnapshotAfterUpdate({ ...common, writeInstalledReceipt: receiptsBroken.writeInstalledReceipt, configRoot: agyBroken.configRoot, deps: { homedirFn: () => homeBroken }, runCli: agyBroken.runCli, resolveCliPath: cliFound });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason, 'ATR-TOPOLOGY-UNVERIFIABLE', 'the host code, unchanged');
  assert.deepEqual(agyBroken.mutating(), [], 'no agy lifecycle command ran');
  assert.deepEqual(listTree(agyBroken.configRoot), before, 'agy state is byte-identical');
  assert.equal(receiptsBroken.written.length, 0);
  cleanup(home, homeNoCli, homeBroken, agy.configRoot, agyNoCli.configRoot, agyBroken.configRoot, ws, git);
});

test('AM-17: ungoverned directory - the managed copy loads and is current there, and the start hint writes no bootstrap lock or state', async () => {
  const seams = await loadSeams();
  const mod = await load();
  const home = makeHome();
  const deps = { homedirFn: () => home };
  const agy = makeFakeAgy();
  const seedWs = physicalTmp('ags-seed-');
  const receipts = makeReceipts();
  const git = agyPlugin('1.0.0');
  const v1 = mod.publishAgySnapshot({ sourcePluginRoot: git, attestationSourceRoot: git, deps });
  seedManagedCopy(seams, { configRoot: agy.configRoot, workspaceRoot: seedWs, snapshotRoot: v1.root, agy, receipts });
  const ungoverned = physicalTmp('ags-ungoverned-');
  const loaded = seams.topo.observeAntigravityLoadedTopology({ loadedPluginRoot: agy.managedRoot, configRoot: agy.configRoot, workspaceRoot: ungoverned });
  assert.equal(loaded.status, 'current', 'pre-state: the central copy is current in a directory that never registered it');
  assert.equal(loaded.loadedKind, 'managed-copy');
  const anchor = join(realpathSync(home), '.agent-pipeline');
  const watched = () => ({ workspace: listTree(ungoverned), anchor: listTree(anchor), agyConfig: listTree(agy.configRoot) });
  const before = watched();
  const { observeAgyStartHint } = await loadStart();
  const hint = await observeAgyStartHint({ workspaceRoot: ungoverned, configRoot: agy.configRoot, loadedPluginRoot: agy.managedRoot, deps });
  assert.equal(hint.governed, false);
  assert.equal(hint.loaded.status, 'current');
  const after = watched();
  assert.deepEqual(after, before, 'the start hint is read-only');
  for (const [where, tree] of Object.entries(after)) assert.deepEqual(Object.keys(tree).filter((rel) => /lock/i.test(rel)), [], `no lock file under ${where}`);
  assert.deepEqual(entries(ungoverned), [], 'the ungoverned directory stays empty: no .git, no .agent-pipeline');
  cleanup(home, agy.configRoot, seedWs, ungoverned, git);
});
