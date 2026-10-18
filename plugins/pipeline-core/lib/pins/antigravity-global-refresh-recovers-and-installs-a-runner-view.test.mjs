// SPDX-License-Identifier: SUL-1.0
// ALF-AGY4 / AC-112: a global Antigravity refresh recovers from the state a half-done earlier run leaves behind
// (an import manifest holding `imports: null`, plus a registry entry on the managed-copy location whose directory
// is gone) and installs a generated runner view that Antigravity 1.4.2 accepts. Drives the real modules on
// temporary fixture config roots with an injected CLI runner; the real agy CLI and the real config root are never
// reached. Every fixture lives under the OS temp directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeAntigravityLoadedTopology, observeAntigravityPluginTopology } from '../antigravity-plugin-topology.mjs';
import { createAntigravityRefreshHost, observeAntigravityLoadedTopologyWithWiring } from '../antigravity-topology-refresh-host.mjs';
import * as snap from '../agy-central-snapshot.mjs';
import * as installer from '../../install-agy.mjs';
import { observePublicCoreIdentity, observeRunnerPublicCoreIdentity } from '../public-core-observation.mjs';
import { verifyInstalledPluginAttestation } from '../installed-plugin-attestation.mjs';
import * as hostScript from '../../scripts/installed-plugin-attestation-host.mjs';

const NAME = 'agent-pipeline-core';
const HERE = dirname(fileURLToPath(import.meta.url));
const agentFile = (model, extra = '') => `---\nname: sample\ndescription: sample agent\nmodel: ${model}\n---\n${extra}Body of the agent.\nmodel: ${model}\n`;

function files(root) {
  const out = {};
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name), relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path, relPath); else out[relPath] = readFileSync(path);
    }
  };
  walk(root, '');
  return out;
}

const DEFAULT_HOOKS = '{"pipeline-core":{"PreInvocation":[{"type":"command","command":"node hooks/antigravity-start-hint.mjs"}]}}\n';
function world(t, { agents = { 'a.md': agentFile('sonnet'), 'b.md': agentFile('haiku') }, hooks = DEFAULT_HOOKS } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'agy-view-pin-')));
  const home = join(base, 'home'), configRoot = join(home, '.gemini'), workspaceRoot = join(base, 'workspace');
  const repo = join(base, 'source'), pluginRoot = join(repo, 'plugins', 'pipeline-core'), foreign = join(base, 'foreign-plugin');
  const managed = join(configRoot, 'config', 'plugins', NAME);
  const registryPath = join(configRoot, 'config', 'plugins.json'), importsPath = join(configRoot, 'config', 'import_manifest.json');
  for (const dir of [join(configRoot, 'config', 'plugins'), workspaceRoot, foreign, join(pluginRoot, 'hooks'), join(pluginRoot, 'skills', 'critic-review'), join(pluginRoot, 'scripts'), join(pluginRoot, 'agents'), join(pluginRoot, 'lib')]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(foreign, 'plugin.json'), '{"name":"foreign-plugin","version":"1.0.0"}\n');
  writeFileSync(join(pluginRoot, 'plugin.json'), `{"name":"${NAME}","version":"0.7.0","description":"Synthetic test plugin"}\n`);
  writeFileSync(join(pluginRoot, 'hooks.json'), hooks);
  for (const path of ['hooks/antigravity-pretool-guard.mjs', 'hooks/antigravity-start-hint.mjs', 'skills/critic-review/SKILL.md', 'scripts/pipeline-start-preflight.mjs', 'lib/example.test.mjs']) writeFileSync(join(pluginRoot, path), '// synthetic fixture\n');
  writeFileSync(join(pluginRoot, 'skills', 'critic-review', 'NOTES.md'), 'model: sonnet\nuntouched outside agents\n');
  for (const [name, body] of Object.entries(agents)) writeFileSync(join(pluginRoot, 'agents', name), body);
  execFileSync('git', ['-C', repo, 'init', '--initial-branch', 'main'], { stdio: 'ignore' });
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'https://example.invalid/synthetic-pipeline.git'], { stdio: 'ignore' });
  execFileSync('git', ['-C', repo, 'add', '.'], { stdio: 'ignore' });
  execFileSync('git', ['-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'fixture'], { stdio: 'ignore' });
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  t.after(() => { if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome; rmSync(base, { recursive: true, force: true }); });
  return { base, home, configRoot, workspaceRoot, repo, pluginRoot, foreign, managed, registryPath, importsPath, snapshotDeps: { homedirFn: () => home } };
}

// A new committed revision of the shared source (the receipt and installer observers need a clean Git source).
function reviseSource(w, line) {
  appendFileSync(join(w.pluginRoot, 'agents', 'a.md'), line);
  execFileSync('git', ['-C', w.repo, 'add', '.'], { stdio: 'ignore' });
  execFileSync('git', ['-C', w.repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'revise'], { stdio: 'ignore' });
}

const FOREIGN_ENTRY = (w) => `{ "path":${JSON.stringify(w.foreign)} , "keep":true }`;
function halfDone(w) {
  writeFileSync(w.importsPath, '{"imports":null}\n');
  writeFileSync(w.registryPath, `{\n "entries":[\n  ${FOREIGN_ENTRY(w)},\n  {"path":${JSON.stringify(w.managed)}}\n ]\n}\n`);
  assert.equal(existsSync(w.managed), false, 'the half-done state has no managed copy');
}

// What Antigravity 1.4.2 reads: the `model:` line of the agent FRONTMATTER (the block between the first two `---` lines), never a body line.
function frontmatterModel(text) {
  const lines = text.split('\n');
  if (lines[0].replace(/\r$/, '') !== '---') return null;
  const close = lines.findIndex((line, index) => index > 0 && line.replace(/\r$/, '') === '---');
  if (close === -1) return null;
  for (const line of lines.slice(1, close)) { const match = /^model:[ \t]*(.*?)[ \t]*\r?$/.exec(line); if (match) return match[1]; }
  return null;
}

// A fake agy: validate refuses the model tiers 1.4.2 refuses; install copies the root and records the import; imports of other plugins are kept.
function fakeCli(w, { failValidate = false } = {}) {
  const calls = [];
  const foreignImports = () => {
    try { const imports = JSON.parse(readFileSync(w.importsPath, 'utf8')).imports; return Array.isArray(imports) ? imports.filter((entry) => entry?.name !== NAME) : []; } catch { return []; }
  };
  const writeImports = (own) => {
    const all = [...foreignImports(), ...(own ? [{ name: NAME }] : [])];
    writeFileSync(w.importsPath, `${JSON.stringify({ imports: all.length > 0 ? all : null })}\n`);
  };
  const run = (argv) => {
    calls.push([...argv]);
    if (argv[0] === '--version') return { status: 'ok', version: '1.4.2' };
    if (argv[1] === 'validate') {
      if (failValidate) return { status: 'failed' };
      const dir = join(argv[2], 'agents');
      const rejected = existsSync(dir) && readdirSync(dir).some((name) => ['sonnet', 'haiku'].includes(frontmatterModel(readFileSync(join(dir, name), 'utf8'))));
      return rejected ? { status: 'failed' } : { status: 'ok' };
    }
    if (argv[1] === 'install') { cpSync(argv[2], w.managed, { recursive: true }); writeImports(true); }
    if (argv[1] === 'uninstall') { rmSync(w.managed, { recursive: true, force: true }); writeImports(false); }
    return { status: 'ok' };
  };
  return { run, calls };
}
const verbs = (calls) => calls.filter((argv) => argv[0] === 'plugin').map((argv) => argv[1]);
const observe = (w) => observeAntigravityPluginTopology({ configRoot: w.configRoot, workspaceRoot: w.workspaceRoot, approvedSourceRoot: w.pluginRoot });
const host = (w, runCli, extra = {}) => createAntigravityRefreshHost({ configRoot: w.configRoot, workspaceRoot: w.workspaceRoot, approvedSourceRoot: w.pluginRoot, scope: 'global', globalChangeApproved: true, runCli, writeInstalledReceipt: () => ({ status: 'written' }), ...extra });
const installOptions = (w) => ({ configRoot: w.configRoot, workspaceRoot: w.workspaceRoot, approvedSourceRoot: w.pluginRoot, attestationSourceRoot: w.pluginRoot, scope: 'global', globalChangeApproved: true });
const installView = (w, cli, extra = {}) => installer.refreshAntigravityGlobalFromRunnerView(installOptions(w), { runCli: cli.run, snapshotDeps: w.snapshotDeps, ...extra });
const viewBase = (w) => join(w.home, '.agent-pipeline', 'agy-runner-view');
const receiptDirectory = (w) => join(w.configRoot, 'agent-pipeline', 'installed-plugin-attestations');
// One extra changed byte in a file of a tree (the default file lies outside agents/ and outside the protected paths).
function addOneByte(root, rel = 'skills/critic-review/NOTES.md') { const path = join(root, rel); chmodSync(path, 0o600); appendFileSync(path, '\n'); }

// The real option-2 flow on a half-done world: the generated view is validated and installed, the receipt is written by the real writer.
function installedWorld(t) {
  const w = world(t);
  halfDone(w);
  const cli = fakeCli(w);
  const result = installView(w, cli);
  assert.equal(result.status, 'refreshed', JSON.stringify(result));
  return { w, cli, viewRoot: cli.calls.find((argv) => argv[1] === 'install')[2] };
}

test('imports: null (what Antigravity writes when no import remains) is observed with no entries', (t) => {
  const w = world(t);
  writeFileSync(w.importsPath, '{"imports":null}\n');
  const state = observe(w).importState;
  assert.equal(state.status, 'observed');
  assert.deepEqual(state.entries, []);
});

test('any other non-array imports value stays unavailable', (t) => {
  const w = world(t);
  for (const body of ['{"imports":{}}', '{"imports":"none"}', '{"imports":0}', '{"imports":true}', '{}', '[]']) {
    writeFileSync(w.importsPath, `${body}\n`);
    assert.equal(observe(w).importState.status, 'unavailable', body);
  }
});

test('a dangling managed global entry is observed as dangling, not as an unavailable registry', (t) => {
  const w = world(t);
  halfDone(w);
  const registry = observe(w).registries.global;
  assert.equal(registry.status, 'observed');
  assert.deepEqual(registry.entries.map((entry) => entry.status), ['foreign', 'dangling-managed']);
});

test('a missing root at any other path, or a non-ENOENT failure at the managed path, stays unavailable', (t) => {
  const w = world(t);
  writeFileSync(w.importsPath, '{"imports":null}\n');
  writeFileSync(w.registryPath, `{"entries":[{"path":${JSON.stringify(join(w.base, 'elsewhere', NAME))}}]}\n`);
  const elsewhere = observe(w).registries.global;
  assert.equal(elsewhere.status, 'unavailable');
  assert.equal(elsewhere.entries[0].status, 'unavailable');
  assert.equal(host(w, fakeCli(w).run).refresh().reason, 'ATR-TOPOLOGY-UNVERIFIABLE');
  // The managed path itself, but the failure is not ENOENT: a dangling symlink exists as an object.
  writeFileSync(w.registryPath, `{"entries":[{"path":${JSON.stringify(w.managed)}}]}\n`);
  try { symlinkSync(join(w.base, 'nowhere'), w.managed); } catch { return; }
  assert.equal(observe(w).registries.global.entries[0].status, 'unavailable');
  rmSync(w.managed, { force: true });
  // Not exactly the managed path (trailing separator spelling): still unavailable.
  writeFileSync(w.registryPath, `{"entries":[{"path":${JSON.stringify(`${w.managed}/`)}}]}\n`);
  assert.equal(observe(w).registries.global.entries[0].status, 'unavailable');
});

// This case drives the raw host (the option-1 path), which validates the SHARED source itself. Antigravity 1.4.2 refuses `sonnet`/`haiku`
// there, so the source of this case carries tiers the CLI accepts; the model rewrite is covered by the runner-view cases below.
test('half-done state: a global refresh no longer stops at ATR-TOPOLOGY-UNVERIFIABLE and rebinds the dangling entry, foreign bytes kept exactly', (t) => {
  const w = world(t, { agents: { 'a.md': agentFile('flash'), 'b.md': agentFile('pro') } });
  halfDone(w);
  const cli = fakeCli(w);
  const subject = host(w, cli.run);
  const plan = subject.prepare();
  assert.equal(plan.status, 'prepared', JSON.stringify(plan));
  const result = subject.apply(plan);
  assert.equal(result.status, 'refreshed', JSON.stringify(result));
  const raw = readFileSync(w.registryPath, 'utf8');
  assert.ok(raw.includes(FOREIGN_ENTRY(w)), 'the foreign entry bytes are kept exactly');
  const entries = JSON.parse(raw).entries;
  assert.equal(entries.length, 2);
  assert.equal(entries[0].keep, true);
  assert.equal(entries.some((entry) => entry.path === w.managed), false, 'the dangling managed entry is gone');
  assert.equal(entries[1].path, w.pluginRoot);
  assert.deepEqual(verbs(cli.calls), ['validate', 'install']);
});

test('the shared source with a model tier the CLI refuses is not installed by the raw host: validate refuses it before anything changes', (t) => {
  const w = world(t);
  halfDone(w);
  const before = files(w.configRoot);
  const cli = fakeCli(w);
  const result = host(w, cli.run).refresh();
  assert.equal(result.status, 'refused', JSON.stringify(result));
  assert.equal(result.reason, 'ATR-CLI-FAILED');
  assert.deepEqual(result.completed, []);
  assert.deepEqual(verbs(cli.calls), ['validate']);
  assert.deepEqual(files(w.configRoot), before);
});

test('half-done state through the runner view: validate and install the generated copy, complete, receipt written', (t) => {
  const w = world(t);
  halfDone(w);
  const cli = fakeCli(w);
  const result = installView(w, cli);
  assert.equal(result.status, 'refreshed', JSON.stringify(result));
  const viewRoot = join(realpathSync(w.home), '.agent-pipeline', 'agy-runner-view');
  const validated = cli.calls.filter((argv) => argv[1] === 'validate').map((argv) => argv[2]);
  assert.equal(validated.length, 1);
  assert.ok(validated[0].startsWith(`${viewRoot}/`), 'the CLI validates the generated view, not the shared source');
  assert.deepEqual(cli.calls.filter((argv) => argv[1] === 'install').map((argv) => argv[2]), validated);
  assert.equal(validated[0].startsWith(w.repo), false, 'the view lives outside every repository');
  const installedAgents = files(join(w.managed, 'agents'));
  assert.match(installedAgents['a.md'].toString(), /^model: flash$/m, 'sonnet runs on the flash tier (D13)');
  assert.match(installedAgents['b.md'].toString(), /^model: flash$/m, 'haiku runs on the flash tier (D13)');
  const raw = readFileSync(w.registryPath, 'utf8');
  assert.ok(raw.includes(FOREIGN_ENTRY(w)));
  assert.deepEqual(JSON.parse(raw).entries.map((entry) => entry.path), [w.foreign, validated[0]]);
  const receipts = readdirSync(join(w.configRoot, 'agent-pipeline', 'installed-plugin-attestations'));
  assert.equal(receipts.some((name) => name.endsWith('.source.json')), true);
  assert.equal(receipts.some((name) => name.endsWith('.json') && !name.endsWith('.source.json')), true);
});

test('the runner view differs from the shared source only in the mapped model lines', (t) => {
  const w = world(t);
  const view = snap.publishAgyRunnerView({ sourcePluginRoot: w.pluginRoot, deps: w.snapshotDeps });
  assert.equal(view.root.startsWith(w.repo), false);
  const source = files(w.pluginRoot), made = files(view.root);
  assert.deepEqual(Object.keys(made).sort(), Object.keys(source).sort(), 'the same file set, tests included');
  const changed = Object.keys(source).filter((path) => !source[path].equals(made[path])).sort();
  assert.deepEqual(changed, ['agents/a.md', 'agents/b.md']);
  assert.equal(made['agents/a.md'].toString(), source['agents/a.md'].toString().replace('\nmodel: sonnet\n', '\nmodel: flash\n'));
  assert.equal(made['agents/b.md'].toString(), source['agents/b.md'].toString().replace('\nmodel: haiku\n', '\nmodel: flash\n'));
  assert.match(made['agents/a.md'].toString(), /\nmodel: sonnet\n$/, 'a body line is not frontmatter and stays');
  assert.equal(made['skills/critic-review/NOTES.md'].toString(), 'model: sonnet\nuntouched outside agents\n');
  assert.deepEqual({ ...snap.AGY_RUNNER_MODEL_MAP }, { sonnet: 'flash', haiku: 'flash', opus: 'pro' }, 'PO decision D13: exactly this closed table');
  assert.equal(Object.isFrozen(snap.AGY_RUNNER_MODEL_MAP), true);
  const again = snap.publishAgyRunnerView({ sourcePluginRoot: w.pluginRoot, deps: w.snapshotDeps });
  assert.deepEqual(again, view, 'publishing the same source again converges on the same view');
  assert.doesNotThrow(() => snap.assertAgyRunnerViewMatchesSource({ sourcePluginRoot: w.pluginRoot, viewRoot: view.root }));
  writeFileSync(join(view.root, 'agents', 'a.md'), agentFile('sonnet'));
  assert.throws(() => snap.assertAgyRunnerViewMatchesSource({ sourcePluginRoot: w.pluginRoot, viewRoot: view.root }), { code: 'AGV-VIEW-MISMATCH' });
  assert.throws(() => snap.publishAgyRunnerView({ sourcePluginRoot: w.pluginRoot, deps: w.snapshotDeps }), { code: 'AGV-VIEW-FOREIGN' });
});

test('the transform is one closed table: frontmatter model line only, anything unmapped is refused with a typed code', () => {
  const mapped = (model) => snap.transformAgyRunnerAgent('agents/x.md', Buffer.from(`---\nname: x\nmodel: ${model}\n---\nbody\n`)).toString();
  assert.equal(mapped('sonnet'), '---\nname: x\nmodel: flash\n---\nbody\n');
  assert.equal(mapped('haiku'), '---\nname: x\nmodel: flash\n---\nbody\n');
  assert.equal(mapped('opus'), '---\nname: x\nmodel: pro\n---\nbody\n');
  for (const model of ['inherit', 'flash', 'pro', 'fast', 'claude-sonnet-4-5', 'Opus', '']) {
    assert.throws(() => mapped(model), { code: 'AGV-AGENT-MODEL-UNMAPPED' }, model);
  }
  const noModel = Buffer.from('---\nname: x\n---\nbody\n');
  assert.equal(snap.transformAgyRunnerAgent('agents/x.md', noModel), noModel, 'no model line: nothing to map, bytes untouched');
  const elsewhere = Buffer.from('---\nmodel: opus\n---\n');
  assert.equal(snap.transformAgyRunnerAgent('skills/s/SKILL.md', elsewhere), elsewhere, 'only agents/*.md is in scope');
  assert.equal(snap.transformAgyRunnerAgent('agents/nested/x.md', elsewhere), elsewhere);
  assert.throws(() => snap.transformAgyRunnerAgent('agents/x.md', Buffer.from('---\nmodel: sonnet\nmodel: haiku\n---\n')), { code: 'AGV-AGENT-MODEL-AMBIGUOUS' });
});

test('an agent with an unmapped model value refuses the global install before anything changes', (t) => {
  const w = world(t, { agents: { 'a.md': agentFile('sonnet'), 'c.md': agentFile('inherit') } });
  halfDone(w);
  const before = files(w.configRoot);
  const cli = fakeCli(w);
  const result = installView(w, cli);
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'AGV-AGENT-MODEL-UNMAPPED');
  assert.deepEqual(result.completed, []);
  assert.deepEqual(verbs(cli.calls), []);
  assert.deepEqual(files(w.configRoot), before);
  assert.equal(existsSync(join(w.home, '.agent-pipeline', 'agy-runner-view')), false, 'no partial view is left behind');
});

test('a view is only built inside an approved global change', (t) => {
  const w = world(t);
  const result = installer.refreshAntigravityGlobalFromRunnerView(
    { ...installOptions(w), globalChangeApproved: false },
    { runCli: fakeCli(w).run, snapshotDeps: w.snapshotDeps });
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'ATR-GLOBAL-SCOPE');
  assert.equal(existsSync(join(w.home, '.agent-pipeline')), false);
});

// The stale managed copy is a complete older copy (hooks manifest and scripts included): a copy without its hooks manifest is refused by the
// wiring ownership check (ATR-HOOK-MANIFEST) before any CLI step, which is a different refusal from the one this case pins.
test('a refused validate still changes nothing: the stale managed copy is neither uninstalled nor rebound', (t) => {
  const w = world(t);
  cpSync(w.pluginRoot, w.managed, { recursive: true });
  writeFileSync(join(w.managed, 'plugin.json'), `{"name":"${NAME}","version":"0.6.0","description":"Older synthetic copy"}\n`);
  writeFileSync(w.importsPath, `{"imports":[{"name":"${NAME}"}]}\n`);
  writeFileSync(w.registryPath, `{\n "entries":[\n  ${FOREIGN_ENTRY(w)},\n  {"path":${JSON.stringify(w.managed)}}\n ]\n}\n`);
  const before = files(w.configRoot);
  const cli = fakeCli(w, { failValidate: true });
  const result = installView(w, cli);
  assert.equal(result.status, 'refused', JSON.stringify(result));
  assert.equal(result.reason, 'ATR-CLI-FAILED');
  assert.deepEqual(result.completed, []);
  assert.deepEqual(verbs(cli.calls), ['validate'], 'the validate runs first and nothing follows it');
  assert.deepEqual(files(w.configRoot), before);
});

test('workspace scope keeps registering the shared source, never a generated view', (t) => {
  const w = world(t);
  const cli = fakeCli(w);
  const result = installer.refreshAntigravityInstallation(
    { configRoot: w.configRoot, workspaceRoot: w.workspaceRoot, approvedSourceRoot: w.pluginRoot, attestationSourceRoot: w.pluginRoot, scope: 'workspace', globalChangeApproved: false },
    { runCli: cli.run });
  assert.equal(result.status, 'refreshed', JSON.stringify(result));
  assert.deepEqual(JSON.parse(readFileSync(join(w.workspaceRoot, '.agents', 'plugins.json'), 'utf8')).entries.map((entry) => entry.path), [w.pluginRoot]);
  assert.deepEqual(verbs(cli.calls), []);
  assert.equal(existsSync(join(w.home, '.agent-pipeline')), false, 'no view is generated for a workspace registration');
});

test('the interactive installer routes option 2 through the runner view and option 1 through the shared source', () => {
  const code = readFileSync(join(HERE, '..', '..', 'install-agy.mjs'), 'utf8');
  assert.match(code, /answer\.trim\(\) === "2" \? refreshAntigravityGlobalFromRunnerView\(refreshOptions\) : refreshAntigravityInstallation\(refreshOptions\)/u);
  assert.match(code, /export function refreshAntigravityGlobalFromRunnerView\(/u);
});

// ---- read-time verifiers: an installed runner view verifies; the same view with one extra changed byte does not ----------------------

test('public-core-observation: an installed runner view is the exact transform of its source, one extra changed byte is a content mismatch', (t) => {
  const { w, viewRoot } = installedWorld(t);
  const observeAgy = (installedPluginRoot) => observeRunnerPublicCoreIdentity('antigravity', { sourcePluginRoot: w.pluginRoot, installedPluginRoot });
  for (const root of [viewRoot, w.managed]) {
    const seen = observeAgy(root);
    assert.equal(seen.status, 'ready', JSON.stringify(seen));
    assert.equal(seen.plugin.name, 'pipeline-core');
    assert.equal(seen.plugin.version, '0.7.0');
  }
  const raw = join(w.base, 'raw-copy');
  cpSync(w.pluginRoot, raw, { recursive: true });
  assert.equal(observeAgy(raw).status, 'ready', 'a registered copy of the source itself still verifies by raw equality');
  const mismatch = { schema: 'pipeline.public-core-observation.v1', status: 'rejected', reasonCodes: ['SNT-A2-CONTENT-MISMATCH'] };
  for (const rel of ['skills/critic-review/NOTES.md', 'agents/a.md', 'hooks.json']) {
    const copy = join(w.base, `changed-${rel.replaceAll('/', '-')}`);
    cpSync(viewRoot, copy, { recursive: true });
    addOneByte(copy, rel);
    assert.deepEqual(observeAgy(copy), mismatch, `one extra byte in ${rel}`);
  }
  const partial = join(w.base, 'partial-view');
  cpSync(viewRoot, partial, { recursive: true });
  writeFileSync(join(partial, 'agents', 'b.md'), agentFile('haiku'));
  assert.deepEqual(observeAgy(partial), mismatch, 'a view whose second agent was not transformed is neither the source nor its transform');
});

test('installed-plugin-attestation: its default observer verifies an Antigravity view install; one extra changed byte is refused before any receipt is read', (t) => {
  const { w } = installedWorld(t);
  const input = {
    provider: 'antigravity', plugin: { name: 'pipeline-core', version: '0.7.0' }, installedPluginRoot: w.managed,
    source: { class: 'local-development', sourcePluginRoot: w.pluginRoot },
    protectedPaths: [...hostScript.INSTALLED_PLUGIN_PROTECTED_PATHS_BY_PROVIDER.antigravity],
  };
  let reads = 0;
  const readExternalReceipt = (request) => { reads += 1; return hostScript.readExternalInstalledPluginReceipt(request, { receiptDirectory: receiptDirectory(w) }); };
  const verified = verifyInstalledPluginAttestation(input, { readExternalReceipt });
  assert.equal(verified.status, 'verified', JSON.stringify(verified));
  assert.equal(reads, 1);
  const generic = verifyInstalledPluginAttestation(input, { readExternalReceipt, observeLocal: observePublicCoreIdentity });
  assert.deepEqual(generic.reasonCodes, ['IPA-LOCAL-SOURCE-UNVERIFIED'], 'the generic Codex-profile observer cannot observe this tree, so the default must not be it');
  reads = 0;
  addOneByte(w.managed);
  const changed = verifyInstalledPluginAttestation(input, { readExternalReceipt });
  assert.equal(changed.status, 'rejected');
  assert.deepEqual(changed.reasonCodes, ['IPA-LOCAL-SOURCE-UNVERIFIED']);
  assert.equal(reads, 0, 'the observer refuses before the receipt is read');
});

test('installed-plugin-attestation-host readback: a view install verifies; the view and its copy carrying one extra byte are refused by the observer alone', (t) => {
  const { w, viewRoot } = installedWorld(t);
  const readback = () => hostScript.verifyLocalDevelopmentInstalledPluginReceipt(
    { provider: 'antigravity', plugin: { name: 'pipeline-core', version: '0.7.0' }, installedPluginRoot: w.managed, registryInstalledPluginRoot: w.managed },
    { antigravityConfigRoot: w.configRoot, antigravityWorkspaceRoot: w.workspaceRoot, receiptDirectory: receiptDirectory(w) });
  const verified = readback();
  assert.equal(verified.status, 'verified', JSON.stringify(verified));
  // Both carry the same extra byte, so the loaded topology still calls the copy current: only the shared observer can refuse.
  addOneByte(viewRoot);
  addOneByte(w.managed);
  const loaded = observeAntigravityLoadedTopology({ loadedPluginRoot: w.managed, configRoot: w.configRoot, workspaceRoot: w.workspaceRoot });
  assert.equal(loaded.status, 'current', JSON.stringify(loaded));
  const refused = readback();
  assert.equal(refused.status, 'unavailable', JSON.stringify(refused));
  assert.deepEqual(refused.reasonCodes, ['IPA-HOST-LOCATOR-UNAVAILABLE']);
});

// ---- option 3: the central snapshot ----------------------------------------------------------------------------------------------

test('option 3: the central snapshot carries the mapped model lines and its own verify stays honest', (t) => {
  const w = world(t);
  const published = snap.publishAgySnapshot({ sourcePluginRoot: w.pluginRoot, attestationSourceRoot: w.pluginRoot, deps: w.snapshotDeps });
  assert.equal(readFileSync(join(published.root, 'agents', 'a.md'), 'utf8'), agentFile('sonnet').replace('\nmodel: sonnet\n', '\nmodel: flash\n'));
  assert.equal(readFileSync(join(published.root, 'agents', 'b.md'), 'utf8'), agentFile('haiku').replace('\nmodel: haiku\n', '\nmodel: flash\n'));
  assert.equal(readFileSync(join(published.root, 'skills', 'critic-review', 'NOTES.md'), 'utf8'), 'model: sonnet\nuntouched outside agents\n', 'outside agents/ nothing is mapped');
  const verified = snap.verifyAgySnapshot({ root: published.root, snapshotSha256: published.snapshotSha256 });
  assert.equal(verified.status, 'verified');
  // The inventory describes the mapped bytes: the raw source bytes, or any other byte, are a mismatch.
  const target = join(published.root, 'agents', 'a.md');
  chmodSync(target, 0o600);
  writeFileSync(target, agentFile('sonnet'));
  assert.throws(() => snap.verifyAgySnapshot({ root: published.root, snapshotSha256: published.snapshotSha256 }), (error) => typeof error?.code === 'string' && /^AGS-/.test(error.code));
  writeFileSync(target, agentFile('sonnet').replace('\nmodel: sonnet\n', '\nmodel: flash\n') + '\n');
  assert.throws(() => snap.verifyAgySnapshot({ root: published.root, snapshotSha256: published.snapshotSha256 }), (error) => typeof error?.code === 'string' && /^AGS-/.test(error.code));
});

test('option 3: an unmapped model value is refused AGV-AGENT-MODEL-UNMAPPED and nothing is published', (t) => {
  const w = world(t, { agents: { 'a.md': agentFile('sonnet'), 'c.md': agentFile('inherit') } });
  assert.throws(() => snap.publishAgySnapshot({ sourcePluginRoot: w.pluginRoot, attestationSourceRoot: w.pluginRoot, deps: w.snapshotDeps }), { code: 'AGV-AGENT-MODEL-UNMAPPED' });
  const root = snap.agySnapshotRoot(w.snapshotDeps);
  assert.equal(root === null || !existsSync(root) || readdirSync(root).length === 0, true, 'no snapshot, pointer or temporary tree exists');
  assert.equal(existsSync(join(w.home, '.agent-pipeline', 'agy-runner-view')), false);
});

// ---- bounded storage -----------------------------------------------------------------------------------------------------------

// A second plugin source, an unrelated view of it (valid, so only a reference can keep it) and the decoys the prune must never touch.
function storageWorld(t) {
  const w = world(t);
  writeFileSync(w.importsPath, '{"imports":null}\n');
  const other = join(w.base, 'other-source');
  mkdirSync(join(other, 'agents'), { recursive: true });
  writeFileSync(join(other, 'plugin.json'), '{"name":"other-plugin","version":"1.0.0"}\n');
  writeFileSync(join(other, 'agents', 'x.md'), agentFile('opus'));
  return { w, other };
}
const names = (w) => readdirSync(viewBase(w)).sort();

test('bounded storage: after two installs the older view is removed; foreign view-<sha> directories, view-tmp-*, notes and a view an import source names stay', (t) => {
  const { w, other } = storageWorld(t);
  const referenced = snap.publishAgyRunnerView({ sourcePluginRoot: other, deps: w.snapshotDeps });
  writeFileSync(w.importsPath, `${JSON.stringify({ imports: [{ name: 'foreign-plugin', source: referenced.root }] })}\n`);
  writeFileSync(w.registryPath, `{\n "entries":[\n  ${FOREIGN_ENTRY(w)}\n ]\n}\n`);
  const foreignView = `view-${'a'.repeat(64)}`, tmpView = 'view-tmp-0123456789abcdef', note = 'NOTES.md';
  mkdirSync(join(viewBase(w), foreignView));
  writeFileSync(join(viewBase(w), foreignView, 'keep.txt'), 'not a view this module published\n');
  mkdirSync(join(viewBase(w), tmpView));
  writeFileSync(join(viewBase(w), tmpView, 'partial.txt'), 'an interrupted publish\n');
  writeFileSync(join(viewBase(w), note), 'operator note\n');

  const first = installView(w, fakeCli(w));
  assert.equal(first.status, 'refreshed', JSON.stringify(first));
  assert.deepEqual(first.runnerView.removed, [], 'the first install has no older view to remove');
  assert.deepEqual(names(w), [note, foreignView, `view-${first.runnerView.viewSha256}`, `view-${referenced.viewSha256}`, tmpView].sort());

  reviseSource(w, 'A second revision of the shared source.\n');
  const second = installView(w, fakeCli(w));
  assert.equal(second.status, 'refreshed', JSON.stringify(second));
  assert.notEqual(second.runnerView.viewSha256, first.runnerView.viewSha256);
  assert.deepEqual(second.runnerView.removed, [`view-${first.runnerView.viewSha256}`], 'only the older view is removed');
  assert.deepEqual(names(w), [note, foreignView, `view-${second.runnerView.viewSha256}`, `view-${referenced.viewSha256}`, tmpView].sort());
  assert.equal(readFileSync(join(viewBase(w), foreignView, 'keep.txt'), 'utf8'), 'not a view this module published\n');
  assert.equal(readFileSync(join(viewBase(w), tmpView, 'partial.txt'), 'utf8'), 'an interrupted publish\n');
  assert.equal(readFileSync(join(viewBase(w), note), 'utf8'), 'operator note\n');
});

test('bounded storage: a view nothing references any more is removed, a view an import source names is not', (t) => {
  const { w, other } = storageWorld(t);
  const unreferenced = snap.publishAgyRunnerView({ sourcePluginRoot: other, deps: w.snapshotDeps });
  assert.deepEqual(snap.pruneAgyRunnerViews({ keepPaths: [], keepDigests: [], deps: w.snapshotDeps }), { removed: [`view-${unreferenced.viewSha256}`], retained: [] });
  const again = snap.publishAgyRunnerView({ sourcePluginRoot: other, deps: w.snapshotDeps });
  assert.deepEqual(snap.pruneAgyRunnerViews({ keepPaths: [join(again.root, 'agents', 'x.md')], deps: w.snapshotDeps }), { removed: [], retained: [`view-${again.viewSha256}`] }, 'a path inside the view keeps it');
  assert.deepEqual(snap.pruneAgyRunnerViews({ keepDigests: [again.viewSha256], deps: w.snapshotDeps }), { removed: [], retained: [`view-${again.viewSha256}`] }, 'the digest of an installed copy keeps it');
});

test('bounded storage: a refused validate prunes nothing', (t) => {
  const { w, other } = storageWorld(t);
  writeFileSync(w.registryPath, `{\n "entries":[\n  ${FOREIGN_ENTRY(w)}\n ]\n}\n`);
  const first = installView(w, fakeCli(w));
  assert.equal(first.status, 'refreshed', JSON.stringify(first));
  const unreferenced = snap.publishAgyRunnerView({ sourcePluginRoot: other, deps: w.snapshotDeps });
  const before = names(w);
  assert.deepEqual(before, [`view-${first.runnerView.viewSha256}`, `view-${unreferenced.viewSha256}`].sort());
  reviseSource(w, 'A second revision of the shared source.\n');
  const cli = fakeCli(w, { failValidate: true });
  const result = installView(w, cli);
  assert.equal(result.status, 'refused', JSON.stringify(result));
  assert.equal(result.reason, 'ATR-CLI-FAILED');
  assert.equal(result.runnerView, undefined, 'no prune report: the prune never ran');
  assert.deepEqual(verbs(cli.calls), ['validate']);
  const after = names(w);
  assert.equal(after.length, before.length + 1, 'only the newly generated view was added');
  assert.deepEqual(before.filter((name) => !after.includes(name)), [], 'the older view and the unreferenced view are both still there');
});

// ---- dangling hook wiring: hook commands that point into a managed copy an earlier uninstall removed ------------------------------
// The state the installer's option 2 met on a real configuration: the managed copy is gone, the global registry still names it (next to
// a developer checkout of the same plugin), and the global hook wiring still runs scripts from the removed directory. Those scripts
// cannot exist any more, so the Pipeline owns the commands; they follow the same rewrite as any other owned command.

// The real source's hook manifest lists both scripts; the fixture default lists only the start hint.
const BOTH_HOOKS = '{"pipeline-core":{"PreToolUse":[{"type":"command","command":"node hooks/antigravity-pretool-guard.mjs"}],"PreInvocation":[{"type":"command","command":"node hooks/antigravity-start-hint.mjs"}]}}\n';
const FLASH_PRO = { 'a.md': agentFile('flash'), 'b.md': agentFile('pro') };
const hookCommand = (root, name, arg = '') => `node "${join(root, 'hooks', `${name}.mjs`)}"${arg}`;
const hookLine = (command) => `{"type":"command","command":${JSON.stringify(command)}}`;
const danglingHooks = (w) => `{\n "hooks": {\n  "PreToolUse": [\n   { "type": "command", "command": ${JSON.stringify(hookCommand(w.managed, 'antigravity-pretool-guard'))} },\n   {"type":"command","command":"foreign-check --safe"}\n  ],\n  "PreInvocation": [ {"type":"command", "command":${JSON.stringify(hookCommand(w.managed, 'antigravity-start-hint'))}} ]\n },\n "foreign": { "keep": true }\n}\n`;

function poState(t, { hooks = danglingHooks, agents = FLASH_PRO } = {}) {
  const w = world(t, { agents, hooks: BOTH_HOOKS });
  const developer = join(w.base, 'developer-checkout', 'plugins', 'pipeline-core');
  mkdirSync(dirname(developer), { recursive: true });
  cpSync(w.pluginRoot, developer, { recursive: true });
  writeFileSync(w.importsPath, '{"imports":null}\n');
  writeFileSync(w.registryPath, `{\n "entries":[\n  {"path":${JSON.stringify(w.managed)}},\n  ${FOREIGN_ENTRY(w)},\n  {"path":${JSON.stringify(developer)}}\n ]\n}\n`);
  w.developer = developer;
  w.hooksPath = join(w.configRoot, 'config', 'hooks.json');
  writeFileSync(w.hooksPath, hooks(w));
  assert.equal(existsSync(w.managed), false, 'the managed copy is gone');
  return w;
}
const registryPaths = (w) => JSON.parse(readFileSync(w.registryPath, 'utf8')).entries.map((entry) => entry.path);

test('PO state: hook commands into the removed managed copy are rewritten together with the registry rebind and the install, foreign bytes kept', (t) => {
  const w = poState(t);
  const before = readFileSync(w.hooksPath, 'utf8');
  const cli = fakeCli(w);
  const subject = host(w, cli.run);
  const plan = subject.prepare();
  assert.equal(plan.status, 'prepared', JSON.stringify(plan));
  assert.deepEqual(plan.actions.map((action) => (action.kind === 'cli' ? `cli:${action.argv[1]}` : `${action.kind}:${action.scope}`)),
    ['cli:validate', 'cli:install', 'owned-wiring-rebind:global', 'owned-registry-rebind:global']);
  const rebind = plan.actions.find((action) => action.kind === 'owned-wiring-rebind');
  assert.equal(rebind.path, w.hooksPath);
  assert.equal(rebind.changes, 2);
  assert.equal(rebind.preserveForeignBytes, true);
  assert.equal(readFileSync(w.hooksPath, 'utf8'), before, 'prepare changes nothing');
  assert.deepEqual(verbs(cli.calls), []);

  const result = subject.refresh();
  assert.equal(result.status, 'refreshed', JSON.stringify(result));
  assert.deepEqual(result.completed, ['validate', 'install', 'wiring-rebind', 'global-registry-rebind']);
  const after = readFileSync(w.hooksPath, 'utf8');
  assert.equal(after, before.replaceAll(join(w.managed, 'hooks'), join(w.pluginRoot, 'hooks')), 'only the two command strings changed; every other byte is the original');
  assert.equal(after.includes(w.managed), false, 'no hook points into the removed location any more');
  assert.equal(after.includes('foreign-check --safe'), true);
  assert.deepEqual(registryPaths(w), [w.foreign, w.pluginRoot], 'the dangling entry and the developer checkout are replaced by exactly the source entry');
  assert.ok(readFileSync(w.registryPath, 'utf8').includes(FOREIGN_ENTRY(w)), 'the foreign registry entry bytes are kept exactly');
  assert.equal(readFileSync(w.importsPath, 'utf8').includes('foreign'), false, 'no foreign import was invented');
  assert.deepEqual(verbs(cli.calls), ['validate', 'install']);
  const again = subject.refresh();
  assert.equal(again.status, 'refreshed', JSON.stringify(again));
  assert.equal(again.changed, false, 'the converged state needs no further change');
});

test('PO state through the runner view (option 2): the hooks end up inside the installed view and none in the removed location', (t) => {
  const w = poState(t, { agents: { 'a.md': agentFile('sonnet'), 'b.md': agentFile('haiku') } });
  const before = readFileSync(w.hooksPath, 'utf8');
  const cli = fakeCli(w);
  const result = installView(w, cli);
  assert.equal(result.status, 'refreshed', JSON.stringify(result));
  const viewRoot = cli.calls.find((argv) => argv[1] === 'install')[2];
  const after = readFileSync(w.hooksPath, 'utf8');
  assert.equal(after, before.replaceAll(join(w.managed, 'hooks'), join(viewRoot, 'hooks')));
  assert.equal(after.includes(w.managed), false);
  assert.deepEqual(registryPaths(w), [w.foreign, viewRoot]);
});

test('a hook command into the removed managed location that no template covers is deleted from its array, foreign commands stay', (t) => {
  const w = poState(t, {
    hooks: (state) => `{\n "hooks": [\n  ${hookLine(hookCommand(state.managed, 'antigravity-start-hint'))},\n  ${hookLine(hookCommand(state.managed, 'antigravity-retired-hook'))},\n  ${hookLine(hookCommand(state.managed, 'antigravity-start-hint', ' deliver'))},\n  {"type":"command","command":"foreign-check --safe"}\n ],\n "foreign": {"keep":true}\n}\n`,
  });
  const cli = fakeCli(w);
  const subject = host(w, cli.run);
  const plan = subject.prepare();
  assert.equal(plan.status, 'prepared', JSON.stringify(plan));
  assert.equal(plan.actions.find((action) => action.kind === 'owned-wiring-rebind').changes, 3, 'one rewrite and two deletions');
  const result = subject.refresh();
  assert.equal(result.status, 'refreshed', JSON.stringify(result));
  const parsed = JSON.parse(readFileSync(w.hooksPath, 'utf8'));
  assert.deepEqual(parsed.hooks, [JSON.parse(hookLine(hookCommand(w.pluginRoot, 'antigravity-start-hint'))), { type: 'command', command: 'foreign-check --safe' }]);
  assert.deepEqual(parsed.foreign, { keep: true });
  assert.equal(readFileSync(w.hooksPath, 'utf8').includes(w.managed), false);
});

test('a template-less hook command into the removed managed location outside an array stays the typed refusal, nothing changes', (t) => {
  const w = poState(t, { hooks: (state) => `{"hooks":{"PreToolUse":${hookLine(hookCommand(state.managed, 'antigravity-retired-hook'))}}}\n` });
  const before = files(w.configRoot);
  const cli = fakeCli(w);
  const subject = host(w, cli.run);
  const plan = subject.prepare();
  assert.deepEqual({ status: plan.status, reason: plan.reason }, { status: 'refused', reason: 'ATR-WIRING-OWNERSHIP-UNVERIFIABLE' });
  const result = subject.refresh();
  assert.deepEqual({ status: result.status, reason: result.reason, completed: result.completed }, { status: 'refused', reason: 'ATR-WIRING-OWNERSHIP-UNVERIFIABLE', completed: [] });
  assert.deepEqual(verbs(cli.calls), []);
  assert.deepEqual(files(w.configRoot), before);
});

test('a pipeline-shaped hook command into any other absent location is still refused: elsewhere, a sibling of the managed location, an escape from it, the location itself', (t) => {
  const w = poState(t);
  const cli = fakeCli(w);
  const scripts = {
    elsewhere: join(w.base, 'elsewhere', NAME, 'hooks', 'antigravity-start-hint.mjs'),
    'sibling whose name starts with the managed name': join(w.configRoot, 'config', 'plugins', `${NAME}x`, 'hooks', 'antigravity-start-hint.mjs'),
    'escape through the managed location': `${w.managed}/../other-plugin/hooks/antigravity-start-hint.mjs`,
    'the managed location itself': w.managed,
  };
  for (const [label, script] of Object.entries(scripts)) {
    writeFileSync(w.hooksPath, `{"hooks":[${hookLine(`node "${script}"`)}]}\n`);
    const before = files(w.configRoot);
    const plan = host(w, cli.run).prepare();
    assert.deepEqual({ status: plan.status, reason: plan.reason }, { status: 'refused', reason: 'ATR-WIRING-OWNERSHIP-UNVERIFIABLE' }, label);
    const result = host(w, cli.run).refresh();
    assert.deepEqual({ status: result.status, reason: result.reason, completed: result.completed }, { status: 'refused', reason: 'ATR-WIRING-OWNERSHIP-UNVERIFIABLE', completed: [] }, label);
    assert.deepEqual(files(w.configRoot), before, label);
  }
  assert.deepEqual(verbs(cli.calls), []);
});

test('a hook command into the managed location while it exists keeps the old rule: owned only through the copy\'s own template set', (t) => {
  const w = world(t, { agents: FLASH_PRO, hooks: BOTH_HOOKS });
  cpSync(w.pluginRoot, w.managed, { recursive: true });
  writeFileSync(join(w.managed, 'plugin.json'), `{"name":"${NAME}","version":"0.6.0","description":"Older synthetic copy"}\n`);
  writeFileSync(w.importsPath, `{"imports":[{"name":"${NAME}"}]}\n`);
  writeFileSync(w.registryPath, `{\n "entries":[\n  ${FOREIGN_ENTRY(w)},\n  {"path":${JSON.stringify(w.managed)}}\n ]\n}\n`);
  const hooksPath = join(w.configRoot, 'config', 'hooks.json');
  writeFileSync(hooksPath, `{"hooks":[${hookLine(hookCommand(w.managed, 'antigravity-start-hint'))},${hookLine(hookCommand(w.managed, 'antigravity-retired-hook'))}]}\n`);
  const before = files(w.configRoot);
  const cli = fakeCli(w);
  const result = host(w, cli.run).refresh();
  assert.deepEqual({ status: result.status, reason: result.reason, completed: result.completed }, { status: 'refused', reason: 'ATR-WIRING-OWNERSHIP-UNVERIFIABLE', completed: [] });
  assert.deepEqual(verbs(cli.calls), []);
  assert.deepEqual(files(w.configRoot), before);
});

test('the loaded-topology wiring observation stays fail-closed and surfaces the inner typed ATR reason, any other failure keeps the generic one', (t) => {
  const w = world(t);
  writeFileSync(w.importsPath, '{"imports":null}\n');
  writeFileSync(w.registryPath, `{"entries":[{"path":${JSON.stringify(w.pluginRoot)}}]}\n`);
  const loaded = () => observeAntigravityLoadedTopologyWithWiring({ loadedPluginRoot: w.pluginRoot, configRoot: w.configRoot, workspaceRoot: w.workspaceRoot });
  const current = loaded();
  assert.equal(current.status, 'current', JSON.stringify(current));
  assert.equal(current.wiringStatus, 'current-or-foreign');
  const unverifiable = (reason) => {
    const seen = loaded();
    assert.equal(seen.status, 'unavailable', JSON.stringify(seen));
    assert.equal(seen.wiringStatus, 'unverifiable');
    assert.equal(seen.reason, reason, JSON.stringify(seen));
  };
  // A typed inner reason is surfaced.
  const manifest = join(w.pluginRoot, 'hooks.json');
  writeFileSync(manifest, '{"pipeline-core":{"PreInvocation":[{"type":"command","command":"node scripts/not-a-hook.mjs"}]}}\n');
  unverifiable('ATR-HOOK-TEMPLATE');
  rmSync(manifest);
  unverifiable('ATR-HOOK-MANIFEST');
  // An error that is not a typed ATR code keeps the generic reason (here: a template names a script that does not exist).
  writeFileSync(manifest, '{"pipeline-core":{"PreInvocation":[{"type":"command","command":"node hooks/antigravity-missing-script.mjs"}]}}\n');
  unverifiable('ATR-WIRING-OWNERSHIP-UNVERIFIABLE');
  // An unproved pipeline-shaped command is itself the generic typed reason.
  writeFileSync(manifest, DEFAULT_HOOKS);
  writeFileSync(join(w.configRoot, 'config', 'hooks.json'), `{"hooks":[${hookLine(`node "${join(w.base, 'elsewhere', NAME, 'hooks', 'antigravity-start-hint.mjs')}"`)}]}\n`);
  unverifiable('ATR-WIRING-OWNERSHIP-UNVERIFIABLE');
});
