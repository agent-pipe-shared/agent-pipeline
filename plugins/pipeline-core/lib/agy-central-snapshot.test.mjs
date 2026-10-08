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

// ================================================================================================
// AM-T3: pins for the Critic findings AM-F1, AM-F3..F7 (specs/sprint-alfred-epic/evidence/critic-2026-10-07/am-full.md)
// and the dispatcher ruling 34 in its disposition. Test-only: the module is not touched, so every case that pins
// behavior the module does not have yet (F1 serialisation, F3 source hardening, F5 owner-file ordering) is RED by
// design (QG-04). F4, F6 and F7 close TEST gaps over behavior that already exists and are expected GREEN; F6 is a
// recorded skip on a host that cannot create a symlink. AM-1..AM-17 and their helpers are not edited.
//
// AM-T3 assumptions (for ratification) - the ruling fixes behavior, not these names; smallest shape chosen:
//  C1. Publish lock: ruling 34 names no file. Assumed `<anchor dir>/agy-snapshot/publish.lock`, a JSON file
//      { schema: 'pipeline.agy-snapshot-publish-lock.v1', pid, startedAt (ISO start time of the owner) }. Only the
//      live-owner and dead-owner cases pre-create it, so only they depend on the name and shape. Every other case
//      reads no lock name: it asserts only that nothing matching /lock/i (and no plugin-tmp-*) is left behind.
//      A live owner is written with the current pid and the current process start time; a dead one with a pid that
//      is asserted not alive (2147483646) first. The lock is released (file removed) when a publish ends, ok or not.
//  C2. F5 hook: no hook sits between the directory fsyncs and the rename (`beforeRename` fires before them).
//      Assumed `deps.afterDirectoryFsync(tempDir)`, called synchronously after the LAST directory fsync of the temp
//      tree and BEFORE the owner file is removed and the rename runs; it may throw or crash the process. The module's
//      own catch removes the temp on a thrown error, so the crash is a real one: a child process calls process.exit
//      from the hook. If the module never calls the hook the child completes (exit 0) and the case is RED.
//  C3. F1 moved pointer: the stale-read window is simulated by a writer outside the lock (copy of another home's
//      newer digest directory plus a pointer write) inside `betweenSourcePasses`, which fires after the copy. The
//      typed refusal is AGS-DOWNGRADE-REFUSED (ruling 34: the downgrade check uses the locked, re-read pointer).
//  C4. F1 same-version race: a racing publisher is simulated by copying an identical digest directory (same source,
//      other home) into place inside `beforeRename`. Converging means success: the result names the existing digest
//      directory, which verifies, the pointer names it and nothing is left behind.
//  C5. F3: a source file with nlink > 1 is AGS-SOURCE-UNSAFE; a single file strictly above 1 MiB is
//      AGS-SOURCE-TOO-LARGE. Both refuse before anything is published (no digest directory, no pointer). The exact
//      1 MiB boundary and the 32 MiB total are not pinned.
// ================================================================================================
import { linkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';

const T3_LOCK = 'publish.lock';
const T3_LOCK_SCHEMA = 'pipeline.agy-snapshot-publish-lock.v1';
const T3_OWNER_FILE = '.snapshot-temp-owner.json';
const T3_OWNER_SCHEMA = 'pipeline.agy-snapshot-temp-owner.v1';
const T3_DIGEST_DIR = /^plugin-[a-f0-9]{64}$/;
const T3_TEMP_DIR = /^plugin-tmp-[a-f0-9]{16}$/;
const T3_CRASH_STATUS = 86;
const T3_CHILD = [
  'const m = await import(process.env.AGS_MOD);',
  'm.publishAgySnapshot({ sourcePluginRoot: process.env.AGS_SRC, attestationSourceRoot: process.env.AGS_SRC,',
  `deps: { homedirFn: () => process.env.AGS_HOME, afterDirectoryFsync: () => process.exit(${T3_CRASH_STATUS}) } });`,
  'process.exit(0);',
].join(' ');

function t3DeadPid() {
  const pid = 2147483646;
  let alive = true;
  try { process.kill(pid, 0); } catch (e) { alive = e?.code !== 'ESRCH'; }
  assert.equal(alive, false, `pid ${pid} must not be alive for this fixture`);
  return pid;
}
function t3WriteLock(root, pid, startedAtMs) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, T3_LOCK), `${JSON.stringify({ schema: T3_LOCK_SCHEMA, pid, startedAt: new Date(startedAtMs).toISOString() })}\n`);
}
function t3WriteTemp(root, name, pid) {
  mkdirSync(join(root, name, 'lib'), { recursive: true });
  writeFileSync(join(root, name, 'lib', 'partial.mjs'), 'partial\n');
  writeFileSync(join(root, name, T3_OWNER_FILE), `${JSON.stringify({ schema: T3_OWNER_SCHEMA, pid, nonce: 'a'.repeat(32) })}\n`);
}
const t3Leftovers = (root) => entries(root).filter((n) => T3_TEMP_DIR.test(n) || /lock/i.test(n));
const t3Published = (root) => entries(root).filter((n) => T3_DIGEST_DIR.test(n) || n === 'current.json');
// Publishes `source` into its own fixture home: the source of "another publisher" state (same source, same digest).
function t3Elsewhere(mod, source) {
  const home = makeHome();
  const result = mod.publishAgySnapshot({ sourcePluginRoot: source, attestationSourceRoot: source, deps: { homedirFn: () => home } });
  return { home, result };
}

test('AM-T3: F1 lock held by a live owner - a second publish refuses AGS-PUBLISH-BUSY and changes nothing', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const src2 = makePlugin('1.1.0');
  try {
    const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
    t3WriteLock(root, process.pid, Date.now() - process.uptime() * 1000);
    const before = listTree(root);
    assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps }), fail('AGS-PUBLISH-BUSY'));
    assert.deepEqual(listTree(root), before, 'nothing changed: no temp, no new digest directory, pointer and the foreign lock untouched');
    assert.equal(pointer(root).snapshotSha256, v1.snapshotSha256);
  } finally { cleanup(home, src, src2); }
});

test('AM-T3: F1 lock held by a dead owner - reclaimed, the publish succeeds and releases the lock', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    t3WriteLock(root, t3DeadPid(), Date.now() - 3600000);
    const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
    assert.equal(pointer(root).snapshotSha256, v1.snapshotSha256);
    mod.verifyAgySnapshot({ root: v1.root, snapshotSha256: v1.snapshotSha256 });
    assert.deepEqual(t3Leftovers(root), [], 'the stale lock was reclaimed and the new one released: no lock file, no temp');
  } finally { cleanup(home, src); }
});

test('AM-T3: F1 a publish in flight holds the lock - a nested publish refuses AGS-PUBLISH-BUSY, and the lock is released afterwards', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const src2 = makePlugin('1.1.0');
  try {
    const nested = { ...deps, betweenSourcePasses: () => {
      assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps }), fail('AGS-PUBLISH-BUSY'));
    } };
    const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps: nested });
    assert.equal(pointer(root).snapshotSha256, v1.snapshotSha256, 'the outer publish was not disturbed by the refused one');
    assert.deepEqual(t3Leftovers(root), [], 'lock released');
    const v2 = mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps });
    assert.equal(pointer(root).snapshotSha256, v2.snapshotSha256, 'a later publish is not blocked');
  } finally { cleanup(home, src, src2); }
});

test('AM-T3: F1 pointer moved to a newer version after the first read - downgrade refused, the newer snapshot and its pointer survive', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const src2 = makePlugin('1.1.0');
  const src3 = makePlugin('3.0.0');
  const elsewhere = t3Elsewhere(mod, src3);
  try {
    mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
    const newest = elsewhere.result;
    const newerDir = join(root, `plugin-${newest.snapshotSha256}`);
    const racing = { ...deps, betweenSourcePasses: () => {
      cpSync(newest.root, newerDir, { recursive: true });
      writeFileSync(join(root, 'current.json'), `${JSON.stringify({ schema: 'pipeline.agy-snapshot-current.v1', snapshotSha256: newest.snapshotSha256, version: '3.0.0', publishedAt: new Date().toISOString() }, null, 2)}\n`);
    } };
    assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src2, attestationSourceRoot: src2, deps: racing }), fail('AGS-DOWNGRADE-REFUSED'));
    assert.ok(existsSync(newerDir), 'the newer snapshot directory was not pruned');
    mod.verifyAgySnapshot({ root: newerDir, snapshotSha256: newest.snapshotSha256 });
    assert.equal(pointer(root).snapshotSha256, newest.snapshotSha256, 'the pointer still names the newer snapshot');
    assert.equal(pointer(root).version, '3.0.0');
    assert.deepEqual(t3Leftovers(root), [], 'no temp, lock released');
  } finally { cleanup(home, elsewhere.home, src, src2, src3); }
});

test('AM-T3: F1 same-version publish racing to the rename converges on the existing digest directory', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const elsewhere = t3Elsewhere(mod, src);
  try {
    const existing = elsewhere.result;
    const racing = { ...deps, beforeRename: () => cpSync(existing.root, join(root, `plugin-${existing.snapshotSha256}`), { recursive: true }) };
    let result;
    try { result = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps: racing }); } catch (e) {
      assert.fail(`a same-version publisher racing to the rename must converge, got ${e?.code ?? 'an untyped error'}: ${e?.message}`);
    }
    assert.equal(result.snapshotSha256, existing.snapshotSha256, 'the result equals the existing digest');
    assert.equal(result.root, join(root, `plugin-${existing.snapshotSha256}`));
    mod.verifyAgySnapshot({ root: result.root, snapshotSha256: result.snapshotSha256 });
    assert.equal(pointer(root).snapshotSha256, existing.snapshotSha256);
    assert.deepEqual(t3Leftovers(root), [], 'no temp, lock released');
  } finally { cleanup(home, elsewhere.home, src); }
});

test('AM-T3: F3 hardlinked source file - AGS-SOURCE-UNSAFE and nothing published', async (t) => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    try { linkSync(join(src, 'lib/l.mjs'), join(src, 'lib/hardlinked.mjs')); } catch (e) {
      if (e?.code === 'EPERM') { t.skip('hardlink EPERM on this host'); return; }
      throw e;
    }
    assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps }), fail('AGS-SOURCE-UNSAFE'));
    assert.deepEqual(t3Published(root), [], 'no digest directory, no pointer');
  } finally { cleanup(home, src); }
});

test('AM-T3: F3 source file above 1 MiB - AGS-SOURCE-TOO-LARGE and nothing published', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    writeFileSync(join(src, 'lib/big.bin'), Buffer.alloc(1024 * 1024 + 1, 97));
    assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps }), fail('AGS-SOURCE-TOO-LARGE'));
    assert.deepEqual(t3Published(root), [], 'no digest directory, no pointer');
  } finally { cleanup(home, src); }
});

test('AM-T3: F4 real stale temp - a plugin-tmp directory whose owner file names a dead pid is swept by the next publish; a live owner is retained', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    const dead = t3DeadPid();
    const stale = 'plugin-tmp-0123456789abcdef';
    const live = 'plugin-tmp-fedcba9876543210';
    t3WriteTemp(root, stale, dead);
    t3WriteTemp(root, live, process.pid);
    const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
    assert.equal(existsSync(join(root, stale)), false, 'the dead owner temp is swept (the publisher never created it, so only the sweep can have removed it)');
    assert.equal(existsSync(join(root, live)), true, 'a temp whose owner is alive is retained');
    assert.deepEqual(entries(root).filter((n) => T3_TEMP_DIR.test(n)), [live]);
    assert.equal(pointer(root).snapshotSha256, v1.snapshotSha256);
  } finally { cleanup(home, src); }
});

test('AM-T3: F5 crash after the directory fsyncs, before the rename - the temp still carries its owner file, so the next publish sweeps it', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', T3_CHILD], {
      env: { ...process.env, AGS_MOD: pathToFileURL(MODULE_PATH).href, AGS_HOME: home, AGS_SRC: src },
      encoding: 'utf8',
      timeout: 120000,
    });
    assert.equal(child.status, T3_CRASH_STATUS, `deps.afterDirectoryFsync must fire after the last directory fsync and crash the child (exit ${child.status}; stderr: ${String(child.stderr).slice(0, 300)})`);
    const temps = entries(root).filter((n) => T3_TEMP_DIR.test(n));
    assert.equal(temps.length, 1, 'the crashed publisher left exactly one temp');
    assert.deepEqual(entries(root).filter((n) => T3_DIGEST_DIR.test(n)), [], 'no digest directory became visible');
    const ownerPath = join(root, temps[0], T3_OWNER_FILE);
    assert.ok(existsSync(ownerPath), 'the owner file is still present, so the temp is not an unsweepable ownerless leak');
    assert.equal(JSON.parse(readFileSync(ownerPath, 'utf8')).pid, child.pid, 'the owner file names the crashed publisher');
    const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
    assert.deepEqual(entries(root).filter((n) => T3_TEMP_DIR.test(n)), [], 'the next publish swept the crashed temp');
    assert.equal(pointer(root).snapshotSha256, v1.snapshotSha256);
    assert.deepEqual(t3Leftovers(root), [], 'a crashed publisher lock (dead owner) is reclaimed too');
  } finally { cleanup(home, src); }
});

test('AM-T3: F6 foreign - a symlink planted in a snapshot is refused (a recorded skip where the host cannot create one)', async (t) => {
  const { mod, home, src, deps } = await setup('1.0.0');
  try {
    const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
    try { symlinkSync(join(v1.root, 'plugin.json'), join(v1.root, 'lib/link.mjs')); } catch (e) {
      if (e?.code === 'EPERM') { t.skip('symlink EPERM on this host'); return; }
      throw e;
    }
    assert.throws(() => mod.verifyAgySnapshot({ root: v1.root, snapshotSha256: v1.snapshotSha256 }), fail('AGS-SNAPSHOT-FOREIGN'));
    const verdict = mod.classifyAgySnapshot({ observation: { attestedSourceSnapshotSha256: v1.snapshotSha256 }, deps });
    assert.equal(verdict.status, 'foreign');
    assert.equal(verdict.code, 'AGS-SNAPSHOT-FOREIGN');
  } finally { cleanup(home, src); }
});

test('AM-T3: F7 unresolved anchor - nothing is created in the working directory, the fixture home or the source', async () => {
  const mod = await load();
  const home = makeHome();
  const src = makePlugin();
  const cwdBefore = process.cwd();
  const scratchCwd = physicalTmp('ags-cwd-');
  try {
    process.chdir(scratchCwd);
    const unresolved = {
      empty: () => '',
      relative: () => 'relative/home',
      'relative path into the fixture home': () => relative(scratchCwd, home),
      throwing: () => { throw new Error('no home'); },
    };
    const watched = () => ({ cwd: listTree(scratchCwd), home: listTree(home), src: listTree(src) });
    for (const [label, homedirFn] of Object.entries(unresolved)) {
      const deps = { homedirFn };
      const before = watched();
      assert.equal(mod.agySnapshotRoot(deps), null, label);
      assert.equal(mod.readCurrentAgySnapshot(deps), null, label);
      assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps }), fail('AGS-ANCHOR-UNRESOLVED'), label);
      assert.throws(() => mod.setCurrentAgySnapshot({ snapshotSha256: 'a'.repeat(64) }, deps), fail('AGS-ANCHOR-UNRESOLVED'), label);
      assert.equal(mod.classifyAgySnapshot({ observation: {}, deps }).code, 'AGS-ANCHOR-UNRESOLVED', label);
      assert.deepEqual(watched(), before, `${label}: nothing created in the working directory, the fixture home or the source`);
    }
  } finally {
    process.chdir(cwdBefore);
    cleanup(home, src, scratchCwd);
  }
});

// ================================================================================================
// AM-T4: pins for the Critic findings AM-D2..AM-D5 and the dispatcher ruling 50 in its disposition
// (specs/sprint-alfred-epic/evidence/critic-2026-10-07/am-delta.md). Test-only: the modules are not touched, so every case
// that pins behavior they do not have yet is RED by design (QG-04). AM-D1 (wiring the three callers) is a separate slice and
// is NOT pinned here. AM-1..AM-T3 and their helpers are not edited; the wrapper case (D2) lives here because no separate
// refresh test file exists and AM-14..AM-17 live in this file.
// Expected today: RED = D2, D3 marker, D4 (aged directory lock, fresh-lock message, live-owner message), the D5 seam cases;
// todo = D3 interleave (missing seam); GREEN = the D5 uncertain-ownership aging case (closes a test gap over :295).
//
// No conflict with the ratified assumptions in the headers above: ruling 33 / B5 says the workspace Pipeline entry is retired
// BEFORE the refresh, and ruling 50 / AM-D2 keeps that order (retirement still precedes the refresh) while moving it after the
// host check, so a refused refresh mutates nothing. Ruling 34 (publish lock, C1) is extended, not contradicted, by D3/D4.
//
// AM-T4 assumptions (for ratification) - ruling 50 fixes behavior, not these names; smallest shape chosen:
//  E1. Reclaim marker (ruling 50): `<anchor dir>/agy-snapshot/publish.lock.reclaim`, exclusively created by the one reclaimer
//      that acts. Its content is not pinned: a FRESH marker of any content (the case writes an empty file) means another
//      reclaimer is acting, so this publisher yields AGS-PUBLISH-BUSY without moving, parking or rewriting the stale lock.
//  E2. Interleave seam (todo): `deps.afterLockObserved(lockPath)`, called synchronously in the lock acquisition after the lock
//      was judged stale and before any reclaim step. No seam of that kind exists, so the interleave case is a todo.
//  E3. Unreadable lock (ruling 50 / AM-D4): a directory at the lock path follows the unknown-shape age rule (older than twice
//      the 80 s publish budget is reclaimed, anything younger is held). AGS-PUBLISH-BUSY carries the lock path relative to the
//      snapshot root (never absolute) and the owner pid when it is known (a lock file naming a live owner).
//  E4. Source hook: `deps.afterSourceOpen(absolutePath, relativePath)`, called synchronously once per source file after the
//      descriptor was opened and fstat-ed and BEFORE the first read (readSourceInventory has no deps today, so it must take them).
//  E5. Rename hook: `deps.beforeRenameCall(tempDir)`, called synchronously immediately before renameSync(temp, destination),
//      i.e. after the pre-rename convergence check found no destination. A destination that appears there makes the real
//      rename fail, and the publish must converge on the existing digest instead of throwing.
//  E6. Directory fsync injection: `deps.fsyncDirectoryFn(directory)` replaces fsyncDirectoryDurable at every publish call site
//      and returns its outcome. 'confirmed' and 'unsupported' (the win32 tolerance in fs-durability.mjs) are success; any other
//      outcome fails the publish with a typed AGS-* error, and a pointer is never moved over an unconfirmed directory flush.
// ================================================================================================
import { renameSync, utimesSync } from 'node:fs';

const T4_MARKER = 'publish.lock.reclaim';
const T4_AGED_MS = 10 * 60 * 1000; // well past twice the 80 s publish budget
function t4Age(path, ms) { const when = new Date(Date.now() - ms); utimesSync(path, when, when); }
const t4Parked = (root) => entries(root).filter((n) => n.startsWith('publish.lock.') && n !== T4_MARKER);
function t4Attempt(mod, src, deps) {
  try { return { result: mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps }), error: null }; } catch (error) { return { result: null, error }; }
}

test('AM-T4: D3 a reclaim marker held by another reclaimer - the stale lock is left untouched and the publish yields AGS-PUBLISH-BUSY; once the marker is gone the lock is reclaimed', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    t3WriteLock(root, t3DeadPid(), Date.now() - 3600000);
    const lockPath = join(root, T3_LOCK);
    const marker = join(root, T4_MARKER);
    writeFileSync(marker, '');
    const lockBefore = readFileSync(lockPath, 'utf8');
    assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps }), fail('AGS-PUBLISH-BUSY'));
    assert.equal(readFileSync(lockPath, 'utf8'), lockBefore, 'the stale lock was not parked, moved or rewritten by a reclaimer that lost the marker');
    assert.equal(existsSync(marker), true, 'the marker belongs to the other reclaimer: it is not removed');
    assert.deepEqual(t4Parked(root), [], 'no parked copy of the lock is left behind');
    assert.deepEqual(t3Published(root), [], 'nothing was published');
    rmSync(marker);
    const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
    assert.equal(pointer(root).snapshotSha256, v1.snapshotSha256, 'with the marker gone the stale lock is reclaimed and the publish proceeds');
    assert.deepEqual(t3Leftovers(root), [], 'the reclaim marker and the lock are both released');
  } finally { cleanup(home, src); }
});

test('AM-T4: D3 interleaved reclaimers - a lock swapped in after the stale judgement is never parked: the publish yields and the live lock survives byte-identical', async (t) => {
  t.todo('missing seam: deps.afterLockObserved(lockPath) (E2) - nothing in the lock acquisition lets a test interleave between judging the lock stale and reclaiming it');
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    const lockPath = join(root, T3_LOCK);
    t3WriteLock(root, t3DeadPid(), Date.now() - 3600000);
    let fired = 0;
    let liveRaw = null;
    const interleaving = { ...deps, afterLockObserved: () => {
      fired += 1;
      t3WriteLock(root, process.pid, Date.now() - process.uptime() * 1000); // a third publisher acquired after the other reclaimer finished
      liveRaw = readFileSync(lockPath, 'utf8');
    } };
    const { error } = t4Attempt(mod, src, interleaving);
    assert.equal(fired, 1, 'deps.afterLockObserved must fire once, after the lock was judged stale and before any reclaim step');
    assert.equal(error?.code, 'AGS-PUBLISH-BUSY', `a lock that was not read as stale must make this publisher yield (got ${error?.code ?? 'success'})`);
    assert.equal(readFileSync(lockPath, 'utf8'), liveRaw, 'the live lock was never replaced');
    assert.deepEqual(t4Parked(root), [], 'the live lock was never parked');
    assert.deepEqual(t3Published(root), [], 'nothing was published');
  } finally { cleanup(home, src); }
});

test('AM-T4: D4 an unreadable lock (a directory at the lock path) older than twice the publish budget is reclaimed', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    const lockPath = join(root, T3_LOCK);
    mkdirSync(lockPath, { recursive: true });
    t4Age(lockPath, T4_AGED_MS);
    const { result, error } = t4Attempt(mod, src, deps);
    assert.equal(error, null, `an aged unreadable lock must be reclaimed, got ${error?.code}: ${error?.message}`);
    assert.equal(pointer(root).snapshotSha256, result.snapshotSha256);
    assert.deepEqual(t3Leftovers(root), [], 'the aged lock is gone and the publish released its own');
  } finally { cleanup(home, src); }
});

test('AM-T4: D4 a fresh unreadable lock refuses AGS-PUBLISH-BUSY and the message carries the lock path relative to the snapshot root', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    const lockPath = join(root, T3_LOCK);
    mkdirSync(lockPath, { recursive: true });
    const { error } = t4Attempt(mod, src, deps);
    assert.equal(error?.code, 'AGS-PUBLISH-BUSY');
    assert.ok(String(error?.message).includes(T3_LOCK), `the message must name the lock path relative to the snapshot root, got: ${error?.message}`);
    assert.equal(String(error?.message).includes(root), false, 'relative to the snapshot root: never the absolute path');
    assert.equal(statSync(lockPath).isDirectory(), true, 'a fresh unreadable lock is retained');
    assert.deepEqual(t3Published(root), [], 'nothing was published');
  } finally { cleanup(home, src); }
});

test('AM-T4: D4 a lock held by a live owner refuses AGS-PUBLISH-BUSY naming the lock path relative to the snapshot root and the owner pid', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    t3WriteLock(root, process.pid, Date.now() - process.uptime() * 1000);
    const { error } = t4Attempt(mod, src, deps);
    assert.equal(error?.code, 'AGS-PUBLISH-BUSY');
    assert.ok(String(error?.message).includes(T3_LOCK), `the message must name the lock path, got: ${error?.message}`);
    assert.ok(String(error?.message).includes(String(process.pid)), `the message must name the owner pid when it is known, got: ${error?.message}`);
    assert.equal(String(error?.message).includes(root), false, 'relative to the snapshot root: never the absolute path');
  } finally { cleanup(home, src); }
});

test('AM-T4: D5 uncertain ownership - a lock file of unknown shape is retained while fresh and reclaimed once older than twice the publish budget', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    const lockPath = join(root, T3_LOCK);
    mkdirSync(root, { recursive: true });
    writeFileSync(lockPath, 'not a lock\n');
    assert.throws(() => mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps }), fail('AGS-PUBLISH-BUSY'));
    assert.equal(readFileSync(lockPath, 'utf8'), 'not a lock\n', 'a fresh lock of uncertain ownership is retained untouched');
    t4Age(lockPath, T4_AGED_MS);
    const v1 = mod.publishAgySnapshot({ sourcePluginRoot: src, attestationSourceRoot: src, deps });
    assert.equal(pointer(root).snapshotSha256, v1.snapshotSha256);
    assert.deepEqual(t3Leftovers(root), [], 'the aged lock was reclaimed and the publish released its own');
  } finally { cleanup(home, src); }
});

function t4IdentityCase(label, mutate) {
  test(`AM-T4: D5 a source file whose identity changes between open and read (${label}) is refused AGS-SOURCE-UNSAFE and nothing is published`, async (t) => {
    const { mod, home, src, deps, root } = await setup('1.0.0');
    try {
      let fired = 0;
      let mutateError = null;
      const hooked = { ...deps, afterSourceOpen: (absolutePath, relativePath) => {
        if (relativePath !== 'lib/l.mjs') return;
        fired += 1;
        try { mutate(absolutePath); } catch (e) { mutateError = e; }
      } };
      const { error } = t4Attempt(mod, src, hooked);
      if (mutateError !== null && ['EPERM', 'EBUSY', 'EACCES'].includes(mutateError.code)) { t.skip(`${label}: ${mutateError.code} on this host`); return; }
      assert.equal(mutateError, null, `the fixture mutation itself failed: ${mutateError?.message}`);
      assert.ok(fired >= 1, 'deps.afterSourceOpen (E4) must fire for lib/l.mjs after the descriptor was opened and before the first read');
      assert.equal(error?.code, 'AGS-SOURCE-UNSAFE', `got ${error?.code ?? 'success'}`);
      assert.deepEqual(t3Published(root), [], 'no digest directory, no pointer');
      assert.deepEqual(t3Leftovers(root), [], 'no temp, lock released');
    } finally { cleanup(home, src); }
  });
}
t4IdentityCase('a second hard link appears', (absolutePath) => linkSync(absolutePath, `${absolutePath}.alias`));
t4IdentityCase('the path is replaced by another file', (absolutePath) => { writeFileSync(`${absolutePath}.swap`, readFileSync(absolutePath)); renameSync(`${absolutePath}.swap`, absolutePath); });

test('AM-T4: D5 a rename that fails after a same-version publisher won converges on the existing digest directory', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  const elsewhere = t3Elsewhere(mod, src);
  try {
    const existing = elsewhere.result;
    let fired = 0;
    const racing = { ...deps, beforeRenameCall: () => {
      fired += 1;
      cpSync(existing.root, join(root, `plugin-${existing.snapshotSha256}`), { recursive: true });
    } };
    const { result, error } = t4Attempt(mod, src, racing);
    assert.ok(fired >= 1, 'deps.beforeRenameCall (E5) must fire immediately before the rename call');
    assert.equal(error, null, `a rename that fails because the digest directory now exists must converge, got ${error?.code ?? 'an untyped error'}: ${error?.message}`);
    assert.equal(result.snapshotSha256, existing.snapshotSha256, 'the result equals the existing digest');
    assert.equal(result.root, join(root, `plugin-${existing.snapshotSha256}`));
    mod.verifyAgySnapshot({ root: result.root, snapshotSha256: result.snapshotSha256 });
    assert.equal(pointer(root).snapshotSha256, existing.snapshotSha256);
    assert.deepEqual(t3Leftovers(root), [], 'no temp, lock released');
  } finally { cleanup(home, elsewhere.home, src); }
});

test('AM-T4: D5 a directory fsync that reports a failure outcome fails the publish with a typed error before anything becomes visible', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    const seen = [];
    const failing = { ...deps, fsyncDirectoryFn: (directory) => { seen.push(directory); return 'failed'; } };
    const { error } = t4Attempt(mod, src, failing);
    assert.ok(seen.length > 0, 'deps.fsyncDirectoryFn (E6) must replace fsyncDirectoryDurable at the publish call sites');
    assert.match(error?.code ?? '', /^AGS-/, `a failure outcome must fail the publish with a typed error, got ${error?.code ?? 'success'}`);
    assert.deepEqual(t3Published(root), [], 'no digest directory, no pointer');
    assert.deepEqual(t3Leftovers(root), [], 'no temp, lock released');
  } finally { cleanup(home, src); }
});

test('AM-T4: D5 a failure outcome on the final root flush fails the publish and the pointer never moves', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    const seen = [];
    const rootOnly = { ...deps, fsyncDirectoryFn: (directory) => { seen.push(directory); return directory === root ? 'failed' : 'confirmed'; } };
    const { error } = t4Attempt(mod, src, rootOnly);
    assert.ok(seen.includes(root), 'the snapshot root must be flushed through deps.fsyncDirectoryFn after the rename');
    assert.match(error?.code ?? '', /^AGS-/, `an unconfirmed root flush must fail the publish, got ${error?.code ?? 'success'}`);
    assert.equal(existsSync(join(root, 'current.json')), false, 'the pointer is never moved over an unconfirmed directory flush');
    assert.deepEqual(t3Leftovers(root), [], 'no temp, lock released');
  } finally { cleanup(home, src); }
});

test('AM-T4: D5 an unsupported directory fsync (the win32 tolerance) is not a failure - the publish succeeds', async () => {
  const { mod, home, src, deps, root } = await setup('1.0.0');
  try {
    const seen = [];
    const tolerant = { ...deps, fsyncDirectoryFn: (directory) => { seen.push(directory); return 'unsupported'; } };
    const { result, error } = t4Attempt(mod, src, tolerant);
    assert.ok(seen.length > 0, 'deps.fsyncDirectoryFn (E6) must be called at the publish call sites');
    assert.equal(error, null, `unsupported is tolerated, got ${error?.code}: ${error?.message}`);
    assert.equal(pointer(root).snapshotSha256, result.snapshotSha256);
  } finally { cleanup(home, src); }
});

test('AM-T4: D2 broken global surface plus an existing workspace entry - the wrapper returns refused with the host code and the workspace entry is still present', async () => {
  const seams = await loadSeams();
  const home = makeHome();
  const agy = makeFakeAgy();
  const ws = physicalTmp('ags-ws-');
  const receipts = makeReceipts();
  const git = agyPlugin('1.0.0');
  const checkout = agyPlugin('1.0.0');
  try {
    mkdirSync(join(ws, '.agents'), { recursive: true });
    const wsIndex = join(ws, '.agents', 'plugins.json');
    writeFileSync(wsIndex, JSON.stringify({ entries: [{ path: checkout }] }));
    assert.deepEqual(seams.host.observeAntigravityWorkspaceBindings({ workspaceRoot: ws }).ownedIndexes, [0], 'pre-state: the workspace entry is a Pipeline registration');
    writeFileSync(join(agy.configRoot, 'config', 'plugins.json'), '{"entries":"not-an-array"}\n');
    const wsBefore = readFileSync(wsIndex, 'utf8');
    const wsTreeBefore = listTree(ws);
    const agyBefore = listTree(agy.configRoot);
    const { installAgyFromCentralSnapshot } = await loadEntry();
    const result = await installAgyFromCentralSnapshot({ sourcePluginRoot: git, attestationSourceRoot: git, configRoot: agy.configRoot, workspaceRoot: ws, deps: { homedirFn: () => home }, runCli: agy.runCli, writeInstalledReceipt: receipts.writeInstalledReceipt });
    assert.equal(result.status, 'refused');
    assert.match(result.reason ?? '', /^ATR-[A-Z-]+$/, 'the host code, unchanged');
    assert.equal(readFileSync(wsIndex, 'utf8'), wsBefore, 'the workspace entry is still present and byte-identical: retirement runs only after the host check succeeded');
    assert.deepEqual(seams.host.observeAntigravityWorkspaceBindings({ workspaceRoot: ws }).ownedIndexes, [0]);
    assert.deepEqual(listTree(ws), wsTreeBefore, 'nothing else moved in the workspace');
    assert.deepEqual(agy.mutating(), [], 'no agy lifecycle command ran');
    assert.deepEqual(listTree(agy.configRoot), agyBefore, 'agy state is byte-identical');
    assert.equal(receipts.written.length, 0);
  } finally { cleanup(home, agy.configRoot, ws, git, checkout); }
});
