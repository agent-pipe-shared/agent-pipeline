#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionStartDecision } from './codex-session-start-hint.mjs';
import { resolvePluginManifestVersion } from '../scripts/pipeline-start-preflight.mjs';

const PLUGIN_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Failure-visibility note (backlog item
// 2026-08-23-antigravity-start-hint-fail-open-swallows-bootstrap-lock-write-failures.md,
// QG-06): a failure in this hook must stay VISIBLE to the operator, but
// spec.md sec.3 says a non-zero PreInvocation exit cancels the whole tool
// invocation for the session — so this hook always exits 0 (stdout `{}\n`
// at minimum) and instead reports failure via stderr plus the hook's own
// `injectSteps`/`ephemeralMessage` channel (the same channel the success
// path already uses to reach the agent).
function reportFailure(code, error) {
  const detail = error && (error.code || error.name) ? ` ${error.code || error.name}` : '';
  const message =
    `pipeline-core: antigravity-start-hint failed (${code}${detail}) and could not write the ` +
    'session bootstrap lock. The mandatory-bootstrap hard block in antigravity-pretool-guard.mjs ' +
    'will NOT fire this session as a result — run pipeline-start manually before doing any ' +
    'implementation work. See GEMINI.md Prerequisites for the known daemon/node-resolution cause.';
  try {
    process.stderr.write(message + '\n');
  } catch {
    // stderr unavailable; nothing further we can do here.
  }
  process.stdout.write(JSON.stringify({
    injectSteps: [
      { ephemeralMessage: message }
    ]
  }) + '\n');
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch (e) {
    reportFailure('input-parse-failed', e);
    return;
  }

  if (input.invocationNum !== 1 && input.invocationNum !== 0) {
    process.stdout.write('{}\n');
    return;
  }

  let decision;
  try {
    const rootDir = (input.workspacePaths && input.workspacePaths.length > 0)
        ? input.workspacePaths[0]
        : process.cwd();
    decision = sessionStartDecision(rootDir);

    // Create session bootstrap lock
    const sessionId = input.conversationId || input.session_id || 'default';
    const sessionDir = join(rootDir, '.git', 'agent-pipeline', 'run', `session-${sessionId}`);
    mkdirSync(sessionDir, { recursive: true });
    // NVA-ARMEDPROOF-1: bind the lock to the exact plugin build that wrote
    // it, using the SAME manifest-version resolution
    // pipeline-start-preflight.mjs already uses for this runner (Antigravity
    // ships no manifest of its own, so it reads the Codex-shaped
    // `.codex-plugin/plugin.json` -- see resolvePluginManifestVersion's own
    // runner branch) rather than a second, independently-derived one. A
    // version this hook cannot resolve (manifest missing/unreadable) is
    // written as `null`, which the observer treats exactly like a lock with
    // no version field at all.
    const version = resolvePluginManifestVersion(PLUGIN_ROOT, 'antigravity');
    writeFileSync(
      join(sessionDir, 'requires-bootstrap.lock'),
      `${JSON.stringify({ locked: true, version })}\n`,
      'utf8',
    );
  } catch (e) {
    reportFailure('bootstrap-lock-not-written', e);
    return;
  }

  process.stdout.write(JSON.stringify({
    injectSteps: [
      {
        ephemeralMessage: decision.context
      }
    ]
  }) + '\n');
}

main();
