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
