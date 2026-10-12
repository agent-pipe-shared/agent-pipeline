// Real subprocess negative controls. This module does not issue an OSV context.
// It is evaluated only by Root in a coherent selected Source closure.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const GUARD_RELATIVE = 'plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs';
const GUARD_SHA = '2b6d85ab59df759326d24745cf582124c7188e32c131060ff580932b102bd8a2';
const FIXED_TAIL = Object.freeze(['--runner', 'codex', '--consume-owned-verification-guard', '--channel-fd', '4']);
const PUBLIC_CODES = Object.freeze(['OSV-GUARD-INVOCATION-INVALID', 'OSV-GUARD-EXCHANGE-FAILED']);
const MAX_CAPTURE = 65536;
const MAX_MS = 15000;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function inspectGuard(graphRoot) {
  assert.equal(typeof graphRoot, 'string');
  assert.equal(fs.realpathSync(graphRoot), path.resolve(graphRoot), 'Actual selected graph root must be canonical');
  const file = path.join(graphRoot, GUARD_RELATIVE);
  const before = fs.lstatSync(file);
  assert.ok(before.isFile() && !before.isSymbolicLink(), 'Actual guard must be a regular Source file');
  assert.equal(before.nlink, 1, 'Selected owned guard copy must be single-link');
  assert.equal(fs.realpathSync(file), file, 'Guard path must preserve physical Source identity');
  const bytes = fs.readFileSync(file);
  assert.equal(digest(bytes), GUARD_SHA, 'Bind exact independently declared guard Source');
  const after = fs.lstatSync(file);
  assert.equal(after.dev, before.dev);
  assert.equal(after.ino, before.ino);
  assert.equal(after.mode, before.mode);
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeMs, before.mtimeMs);
  return {file, dev: before.dev, ino: before.ino, mode: before.mode, sha256: GUARD_SHA};
}

export async function runActualUnauthenticatedGuard({graphRoot, repository, kind}) {
  assert.ok(['missing-channel', 'public-frame', 'extra-argv', 'ordinary-command'].includes(kind));
  const guard = inspectGuard(graphRoot);
  assert.equal(fs.realpathSync(repository), path.resolve(repository), 'Use the actual fixture repository');
  if (kind === 'ordinary-command' && process.env.CLAUDE_PROJECT_DIR !== undefined) {
    assert.equal(fs.realpathSync(process.env.CLAUDE_PROJECT_DIR), repository, 'Ordinary policy control must address the same actual owning repository; never override inherited environment');
  }
  const tail = kind === 'ordinary-command' ? ['--runner', 'codex'] : kind === 'extra-argv' ? [...FIXED_TAIL, '--unowned-extra'] : [...FIXED_TAIL];
  const stdio = kind === 'ordinary-command' ? ['pipe', 'pipe', 'pipe'] : kind === 'public-frame' ? ['ignore', 'pipe', 'pipe', 'ignore', 'pipe'] : ['ignore', 'pipe', 'pipe'];
  // This is the genuine test-owned ChildProcess. No Source backend/spawn is injected.
  const child = spawn(process.execPath, [...process.execArgv, guard.file, ...tail], {cwd: repository, env: process.env, stdio});
  const captured = {stdout: [], stderr: [], stdoutBytes: 0, stderrBytes: 0, overflow: false, timedOut: false, spawned: false, errorCode: null};
  child.once('spawn', () => { captured.spawned = true; });
  child.once('error', error => {
    const code = Object.getOwnPropertyDescriptor(error, 'code');
    captured.errorCode = code && Object.hasOwn(code, 'value') && ['ENOENT', 'EACCES', 'EPERM', 'EINVAL'].includes(code.value) ? code.value : 'UNCLASSIFIED';
  });
  for (const name of ['stdout', 'stderr']) {
    child[name].on('data', bytes => {
      const chunk = Buffer.from(bytes);
      captured[`${name}Bytes`] += chunk.length;
      if (captured[`${name}Bytes`] > MAX_CAPTURE) {
        captured.overflow = true;
        child.kill('SIGTERM');
      } else captured[name].push(chunk);
    });
  }
  if (kind === 'public-frame') {
    child.stdio[4].on('error', () => {});
    // This deliberately untrusted public frame is negative input, never a grant.
    child.stdio[4].end('{"schema":"unowned-public-context","ready":true}\n');
  }
  if (kind === 'ordinary-command') {
    const executor = path.join(graphRoot, 'plugins/pipeline-core/scripts/owned-continuity-verification.mjs');
    assert.equal(fs.realpathSync(executor), executor);
    const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
    const command = [fs.realpathSync(process.execPath), ...process.execArgv, executor, '--consume-owned-verification', '--channel-fd', '4'].map(quote).join(' ');
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({tool_name:'Bash',tool_input:{command}}));
  }
  const timer = setTimeout(() => { captured.timedOut = true; child.kill('SIGTERM'); }, MAX_MS);
  const terminal = await new Promise(resolve => child.once('close', (code, signal) => resolve({code, signal})));
  clearTimeout(timer);
  const output = Buffer.concat(captured.stdout);
  const errors = Buffer.concat(captured.stderr);
  const text = errors.toString('utf8');
  const codes = PUBLIC_CODES.filter(code => text.split('\n').some(line => line.startsWith(`${code}:`)));
  const after = inspectGuard(graphRoot);
  assert.equal(after.dev, guard.dev);
  assert.equal(after.ino, guard.ino);
  assert.equal(after.mode, guard.mode);
  // Only closed process facts and digests leave this private capture helper.
  return Object.freeze({kind, spawned: captured.spawned, code: terminal.code, signal: terminal.signal, errorCode: captured.errorCode, timedOut: captured.timedOut, overflow: captured.overflow, stdoutBytes: captured.stdoutBytes, stderrBytes: captured.stderrBytes, stdoutSha256: digest(output), stderrSha256: digest(errors), codes: Object.freeze(codes)});
}

export async function assertActualGuardRefusal({graphRoot, repository, kind}) {
  const actual = await runActualUnauthenticatedGuard({graphRoot, repository, kind});
  assert.equal(actual.spawned, true, 'The actual fixed guard process must execute');
  assert.equal(actual.errorCode, null, 'A setup/spawn error is not authenticated refusal evidence');
  assert.equal(actual.timedOut, false, 'A timed-out guard is not a passing negative');
  assert.equal(actual.overflow, false, 'Overflow is not a passing negative');
  assert.equal(actual.signal, null, 'A signaled guard is not a passing negative');
  assert.equal(actual.code, 2, 'Actual production guard must refuse without authority');
  assert.equal(actual.stdoutBytes, 0, 'Unauthenticated guard must not publish a success result');
  if (kind === 'ordinary-command') assert.ok(actual.stderrBytes > 0, 'Require an actual ordinary-policy denial, not silent non-enforcement');
  else {
    const expected = kind === 'extra-argv' ? 'OSV-GUARD-INVOCATION-INVALID' : 'OSV-GUARD-EXCHANGE-FAILED';
    assert.ok(actual.codes.includes(expected), 'The exact original guard refusal branch must be reached');
  }
  return actual;
}
