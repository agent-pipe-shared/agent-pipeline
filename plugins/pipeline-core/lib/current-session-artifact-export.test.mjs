// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { antigravityArtifactHostContext, isCurrentSessionArtifactExport, crossRepositoryDenialReason, ARTIFACT_COPY_ROUTE_HINT } from './current-session-artifact-export.mjs';
import { registerTestCaseCompletion } from './test-case-completion.mjs';
const cases = [];
function test(name, run) { cases.push({ id: `G13A${String(cases.length + 1).padStart(3, '0')}`, name, run }); }
const checkout = fileURLToPath(new URL('../../..', import.meta.url));

export function fixture() {
  mkdirSync(join(checkout, 'scratch'), { recursive: true });
  const base = mkdtempSync(join(checkout, 'scratch/g13-artifact-'));
  const root = join(base, 'project');
  const id = '11111111-2222-4333-8444-555555555555';
  const brain = join(base, 'synthetic-home', '.gemini', 'synthetic-appdata', 'brain');
  const artifacts = join(brain, id);
  const other = join(brain, '11111111-2222-4333-8444-666666666666');
  mkdirSync(join(root, 'public', 'gallery'), { recursive: true });
  mkdirSync(artifacts, { recursive: true });
  mkdirSync(other, { recursive: true });
  // A real one-pixel PNG fixture, held entirely below this checkout's scratch.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=', 'base64');
  const source = join(root, 'public/gallery/image.png');
  writeFileSync(source, png);
  const target = join(artifacts, 'gallery.png');
  const host = { conversationId: id, artifactDirectoryPath: artifacts,
    transcriptPath: join(artifacts, '.system_generated/logs/transcript.jsonl'), workspacePaths: [root] };
  const envelope = { ...host, toolCall: { name: 'run_command', args: { Cwd: root,
    CommandLine: `cp -- ${JSON.stringify(source)} ${JSON.stringify(target)}` } } };
  const input = { tool_name: 'Bash', tool_input: { command: envelope.toolCall.args.CommandLine },
    antigravity_artifact_host: antigravityArtifactHostContext(envelope) };
  return { base, root, artifacts, other, source, target, host, envelope, input, png,
    clean: () => rmSync(base, { recursive: true, force: true }) };
}
function withFixture(run) { const f = fixture(); try { run(f); } finally { f.clean(); } }
const allowed = (input, root) => isCurrentSessionArtifactExport(input, root, { runner: 'antigravity' });

test('exact original top-level metadata admits absolute and relative project PNG source', () => withFixture((f) => {
  assert.equal(allowed(f.input, f.root), true);
  assert.equal(allowed({ ...f.input, tool_input: { command: `cp public/gallery/image.png ${JSON.stringify(f.target)}` } }, f.root), true);
}));
test('tool arguments and canonical envelopes cannot supply host metadata', () => withFixture((f) => {
  assert.deepEqual(antigravityArtifactHostContext({ toolCall: { name: 'run_command', args: f.host } }), {
    conversationId: undefined, artifactDirectoryPath: undefined, transcriptPath: undefined, workspacePaths: undefined });
  assert.equal(antigravityArtifactHostContext({ tool_name: 'Bash', ...f.host }), undefined);
  const forged = { ...f.input, antigravity_artifact_host: undefined, tool_input: { ...f.input.tool_input, ...f.host } };
  assert.equal(allowed(forged, f.root), false);
}));
test('other sessions, logs and metadata mismatch refuse', () => withFixture((f) => {
  for (const target of [join(f.other, 'image.png'), join(f.artifacts, '.system_generated/logs/image.png'), f.artifacts]) {
    assert.equal(allowed({ ...f.input, tool_input: { command: `cp ${JSON.stringify(f.source)} ${JSON.stringify(target)}` } }, f.root), false);
  }
  for (const delta of [{ conversationId: 'bad' }, { workspacePaths: [f.other] }, { transcriptPath: '/unread/transcript.jsonl' }, { artifactDirectoryPath: f.other }]) {
    assert.equal(allowed({ ...f.input, antigravity_artifact_host: { ...f.host, ...delta } }, f.root), false);
  }
}));
test('symlink and lexical aliases, existing destination and hardlink source refuse', () => withFixture((f) => {
  const alias = join(f.base, 'alias'); symlinkSync(f.artifacts, alias);
  for (const target of [join(alias, 'image.png'), `${f.artifacts}/../${f.host.conversationId}/image.png`]) {
    assert.equal(allowed({ ...f.input, tool_input: { command: `cp ${JSON.stringify(f.source)} ${JSON.stringify(target)}` } }, f.root), false);
  }
  symlinkSync(f.source, join(f.root, 'public/gallery/alias.png'));
  assert.equal(allowed({ ...f.input, tool_input: { command: `cp public/gallery/alias.png ${JSON.stringify(f.target)}` } }, f.root), false);
  const fakeRoot = join(f.base, 'alias-brain', 'brain', f.host.conversationId);
  mkdirSync(join(fakeRoot, '..'), { recursive: true }); symlinkSync(f.artifacts, fakeRoot);
  assert.equal(allowed({ ...f.input, antigravity_artifact_host: { ...f.host,
    artifactDirectoryPath: fakeRoot, transcriptPath: join(fakeRoot, '.system_generated/logs/transcript.jsonl') },
    tool_input: { command: `cp ${JSON.stringify(f.source)} ${JSON.stringify(join(fakeRoot, 'image.png'))}` } }, f.root), false);
  writeFileSync(f.target, f.png); assert.equal(allowed(f.input, f.root), false);
  rmSync(f.target); linkSync(f.source, join(f.root, 'public/gallery/link.png'));
  assert.equal(allowed(f.input, f.root), false);
}));
test('credentials, source text, plugin paths, multiple sources, options and commands refuse', () => withFixture((f) => {
  const external = join(f.base, 'other-project.png'); writeFileSync(external, f.png);
  assert.equal(allowed({ ...f.input, tool_input: { command: `cp ${JSON.stringify(external)} ${JSON.stringify(f.target)}` } }, f.root), false);
  for (const path of ['.ssh/key.png', 'plugins/gallery.png', 'logs/image.png', 'public/source.png']) {
    const source = join(f.root, path); mkdirSync(join(source, '..'), { recursive: true });
    writeFileSync(source, path.endsWith('source.png') ? 'export const secret = 1;' : f.png);
    assert.equal(allowed({ ...f.input, tool_input: { command: `cp ${JSON.stringify(source)} ${JSON.stringify(f.target)}` } }, f.root), false);
  }
  for (const command of [`cp -r ${f.source} ${f.target}`, `cp ${f.source} ${f.source} ${f.target}`, `cp ${f.source} ${f.target} && echo done`, `mv ${f.source} ${f.target}`, `cp public/gallery/*.png ${f.target}`]) {
    assert.equal(allowed({ ...f.input, tool_input: { command } }, f.root), false);
  }
}));
test('cross-repository denial transport preserves the authoritative recovery verbatim', () => {
  const reason = 'GUARD-CROSS-REPO-MUTATION\nHGO-EXTERNAL-PROJECT-BOUNDARY';
  assert.equal(crossRepositoryDenialReason([{ reason }]), reason);
  assert.equal(crossRepositoryDenialReason([{ reason }]).includes('PLUGIN-CACHE'), false);
});
test('a refused copy into an artifact directory names the one admitted shape after the recovery (G13)', () => {
  const reason = 'GUARD-CROSS-REPO-MUTATION\nHGO-EXTERNAL-PROJECT-BOUNDARY';
  const brain = '/synthetic-home/.gemini/synthetic-appdata/brain/11111111-2222-4333-8444-555555555555';
  const bash = (command) => ({ tool_name: 'Bash', tool_input: { command }, cwd: '/synthetic-project' });
  const aimed = crossRepositoryDenialReason([{ reason }], bash(`cp -r public/gallery ${brain}/gallery`));
  assert.equal(aimed, `${reason}\n${ARTIFACT_COPY_ROUTE_HINT}`);
  assert.equal(crossRepositoryDenialReason([{ reason }], bash(`cp notes.md /synthetic-home/other/notes.md`)), reason);
  assert.equal(crossRepositoryDenialReason([{ reason }], { tool_name: 'Write', tool_input: { file_path: `${brain}/x.png` } }), reason);
});
if (cases.length !== 7) throw new Error('g13 artifact case count drift');
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? '3'), maxBytes: 65536 });
