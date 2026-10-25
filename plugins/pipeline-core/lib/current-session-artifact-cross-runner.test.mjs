// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { antigravityGuardPayload, normalizeAntigravityToolInput } from '../hooks/antigravity-pretool-guard.mjs';
import { evaluateLifecycleReadyGuard } from './guard/evaluate.mjs';
import { isCurrentSessionArtifactExport } from './current-session-artifact-export.mjs';
import { registerTestCaseCompletion } from './test-case-completion.mjs';
const cases = [];
function test(name, run) { cases.push({ id: `G13R${String(cases.length + 1).padStart(3, '0')}`, name, run }); }
function fixture() {
  const checkout = fileURLToPath(new URL('../../..', import.meta.url));
  mkdirSync(join(checkout, 'scratch'), { recursive: true });
  const base = mkdtempSync(join(checkout, 'scratch/g13-runners-'));
  const root = join(base, 'project');
  const id = '11111111-2222-4333-8444-555555555555';
  const artifacts = join(base, 'synthetic-home', 'brain', id);
  const other = join(base, 'synthetic-home', 'brain', '11111111-2222-4333-8444-666666666666');
  mkdirSync(join(root, 'gallery'), { recursive: true });
  mkdirSync(artifacts, { recursive: true }); mkdirSync(other, { recursive: true });
  const source = join(root, 'gallery/image.png');
  writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=', 'base64'));
  const envelope = { conversationId: id, workspacePaths: [root], artifactDirectoryPath: artifacts,
    transcriptPath: join(artifacts, '.system_generated/logs/transcript.jsonl'),
    toolCall: { name: 'run_command', args: { Cwd: root, CommandLine: `cp ${JSON.stringify(source)} ${JSON.stringify(join(artifacts, 'gallery.png'))}` } } };
  const input = JSON.parse(JSON.stringify(antigravityGuardPayload(envelope, normalizeAntigravityToolInput(envelope), root)));
  return { root, artifacts, other, source, input, envelope, clean: () => rmSync(base, { recursive: true, force: true }) };
}
function dependencies(root, runner) { return { projectDir: root, runner,
  observeGovernanceScopeFn: () => ({ requiresEnforcement: true }),
  inspectProjectOnboardingV3Fn: () => ({ status: 'ready', lifecycle: { status: 'ready' } }),
  requireProjectOnboardingReadyFn: () => ({ schema: 'pipeline.project-onboarding-ready-gate.v1', status: 'ready', intent: 'session' }),
}; }
test('AGY shared evaluation admits only the exact current-session export', () => {
  const f = fixture(); try {
    const result = evaluateLifecycleReadyGuard(f.input, dependencies(f.root, 'antigravity'));
    assert.equal(result.exitCode, 0, result.stderr);
    for (const input of [{ ...f.input, antigravity_artifact_host: undefined },
      { ...f.input, tool_input: { command: `cp ${f.source} ${f.other}/image.png` } }]) {
      const denied = evaluateLifecycleReadyGuard(input, dependencies(f.root, 'antigravity'));
      assert.equal(denied.exitCode, 2); assert.match(denied.stderr, /GUARD-CROSS-REPO-MUTATION/u);
    }
  } finally { f.clean(); }
});
test('Claude and Codex cannot acquire artifact authority through supplied AGY metadata', () => {
  const f = fixture(); try {
    for (const runner of ['claude', 'codex', undefined]) {
      assert.equal(isCurrentSessionArtifactExport(f.input, f.root, { runner }), false);
      const denied = evaluateLifecycleReadyGuard(f.input, dependencies(f.root, runner));
      assert.equal(denied.exitCode, 2); assert.match(denied.stderr, /GUARD-CROSS-REPO-MUTATION/u);
    }
  } finally { f.clean(); }
});
test('artifact containment does not bypass the live lifecycle gate', () => {
  const f = fixture(); try {
    const deps = dependencies(f.root, 'antigravity');
    deps.requireProjectOnboardingReadyFn = () => { throw new Error('synthetic not ready'); };
    const denied = evaluateLifecycleReadyGuard(f.input, deps);
    assert.equal(denied.exitCode, 2); assert.doesNotMatch(denied.stderr, /GUARD-CROSS-REPO-MUTATION/u);
  } finally { f.clean(); }
});
test('actual AGY adapter drops argument-forged metadata and refuses plugin cache destinations', () => {
  const f = fixture(); try {
    const forged = { toolCall: { ...f.envelope.toolCall, args: { ...f.envelope.toolCall.args,
      ...f.envelope, antigravity_artifact_host: f.input.antigravity_artifact_host } } };
    const payload = antigravityGuardPayload(forged, normalizeAntigravityToolInput(forged), f.root);
    assert.equal(evaluateLifecycleReadyGuard(payload, dependencies(f.root, 'antigravity')).exitCode, 2);
    const cache = join(f.artifacts, '..', '..', 'cache', 'brain', f.envelope.conversationId);
    mkdirSync(cache, { recursive: true });
    const input = { ...f.input, antigravity_artifact_host: { ...f.input.antigravity_artifact_host,
      artifactDirectoryPath: cache, transcriptPath: join(cache, '.system_generated/logs/transcript.jsonl') },
      tool_input: { command: `cp ${JSON.stringify(f.source)} ${JSON.stringify(join(cache, 'image.png'))}` } };
    const denied = evaluateLifecycleReadyGuard(input, dependencies(f.root, 'antigravity'));
    assert.equal(denied.exitCode, 2); assert.match(denied.stderr, /GUARD-CROSS-REPO-MUTATION/u);
  } finally { f.clean(); }
});
if (cases.length !== 4) throw new Error('g13 runner case count drift');
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? '3'), maxBytes: 65536 });
