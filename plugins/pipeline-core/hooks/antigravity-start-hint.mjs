#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionStartDecision } from './codex-session-start-hint.mjs';
import { resolvePluginManifestVersion } from '../scripts/pipeline-start-preflight.mjs';
import { nativeHookSessionId } from '../lib/native-hook-failure-memory.mjs';

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

export function antigravityRepositoryRoot(input) {
  const candidate = Array.isArray(input?.workspacePaths) ? input.workspacePaths[0] : null;
  return typeof candidate === 'string' && isAbsolute(candidate) ? resolve(candidate) : null;
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
    const rootDir = antigravityRepositoryRoot(input);
    if (!rootDir) {
      reportFailure('AGY-REPOSITORY-CONTEXT-UNAVAILABLE');
      return;
    }
    const sessionId = nativeHookSessionId(input, {});
    decision = sessionStartDecision(rootDir, undefined, sessionId, 'antigravity');

    // Workspace-local installation does not itself activate governance in an
    // arbitrary Git repository. An optional onboarding hint must not arm a
    // mandatory implementation block before the repository opts in.
    if (!decision.governed) {
      process.stdout.write(JSON.stringify({
        injectSteps: [{ ephemeralMessage: decision.context }],
      }) + '\n');
      return;
    }

    // A first-run directory is not yet a Git repository.  Never manufacture
    // `.git/agent-pipeline/...` there: creating `.git` before `git init`
    // turns Git's future control directory into a malformed repository and
    // strands onboarding in repository-control-path-invalid.  A real local
    // checkout has `.git/HEAD`; only then does this hook own its private lock.
    // Use the exact validated identity the pretool guard uses to locate this
    // lock. An unchecked conversationId can contain separators and escape the
    // private run directory; a missing/invalid identity cannot be armed.
    if (!sessionId) {
      reportFailure('AGY-SESSION-IDENTITY-UNAVAILABLE');
      return;
    }
    const gitHead = join(rootDir, '.git', 'HEAD');
    if (!existsSync(gitHead)) {
      process.stdout.write(JSON.stringify({
        injectSteps: [
          {
            ephemeralMessage: `${decision.context}\nPipeline note: this directory has no initialized Git control path yet; no session bootstrap lock was created. Run pipeline-start after onboarding initializes Git.`,
          },
        ],
      }) + '\n');
      return;
    }
    const sessionDir = join(rootDir, '.git', 'agent-pipeline', 'run', `session-${sessionId}`);
    mkdirSync(sessionDir, { recursive: true });
    // NVA-ARMEDPROOF-1: bind the lock to the exact plugin build that wrote
    // it, using the SAME manifest-version resolution
    // pipeline-start-preflight.mjs already uses for this runner (Antigravity
    // owns `plugin.json` -- see resolvePluginManifestVersion's own runner
    // branch) rather than a second, independently-derived one. A
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
