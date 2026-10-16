// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.design-workflow-package-v2-readiness-fixture-fails-on-windows (AC-158).
//
// Original acceptance (backlog item Description/Proposal):
//   A. Measure which field CRHS-INPUT names, then decide test-fixture vs production defect.
//   B. On a Windows host the suite must not fail on that fixture: the coverage loss is explicit
//      (typed skip naming the Linux/WSL route), not a red exit and not silent.
//   C. The Linux route still builds the store (the gate is not over-broad).
// Everything below runs the real module / real fixture / real existing test; the only "mirror"
// is the RED proof, which mutates an in-memory copy of the production predicate (never production).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCodexDesignReadinessHostStore } from '../codex-design-readiness-host-store.mjs';
import { readinessFixture } from '../codex-readiness-finalization.fixture.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const storePath = fileURLToPath(new URL('../codex-design-readiness-host-store.mjs', import.meta.url));
const existingTestPath = fileURLToPath(new URL('../design-workflow-package-v2.test.mjs', import.meta.url));
const scratchRoot = join(repoRoot, 'scratch');
const VALID_FP = 'a'.repeat(64);
const win = process.platform === 'win32';

// Typed host limitation (PO decision K7): needs POSIX directory modes / getuid / O_DIRECTORY.
const HOST_LIMITATION = {
  code: 'HOST-LIMITATION-NO-POSIX-DIRECTORY-MODES', owner: 'Coordinator', due: '2026-10-19', route: 'Linux/WSL run', decision: 'PO K7',
};
const hostLimitationReason = `${HOST_LIMITATION.code}: owner ${HOST_LIMITATION.owner}, due ${HOST_LIMITATION.due}, ${HOST_LIMITATION.route} (${HOST_LIMITATION.decision})`;

function codeOf(fn) {
  try { fn(); return null; } catch (error) { return error?.code ?? `no-code:${error?.message}`; }
}
// The single production line that raises CRHS-INPUT (read from the real source, not retyped).
function inputGateLine() {
  const lines = readFileSync(storePath, 'utf8').split(/\r?\n/).filter(l => l.includes("hostFault('CRHS-INPUT')"));
  assert.equal(lines.length, 1, 'exactly one CRHS-INPUT raise site expected');
  return lines[0];
}
// Evaluate the production predicate with an injected platform; `mutate` lets RED drop a clause.
function gatePredicate(platform, repoFingerprint, mutate = s => s) {
  const m = inputGateLine().match(/if \((.*)\) throw hostFault\('CRHS-INPUT'\);/);
  assert.ok(m, 'CRHS-INPUT guard has the expected `if (...) throw` shape');
  // eslint-disable-next-line no-new-func
  return new Function('process', 'repoFingerprint', `return Boolean(${mutate(m[1])});`)({ platform }, repoFingerprint);
}

test('A1 measured field: a malformed fingerprint raises CRHS-INPUT on every platform', () => {
  for (const bad of [undefined, null, '', 'abc', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
    assert.equal(codeOf(() => createCodexDesignReadinessHostStore({ gitCommonDir: join(scratchRoot, 'x'), repoFingerprint: bad })), 'CRHS-INPUT', `fingerprint ${String(bad)}`);
  }
  assert.equal(codeOf(() => createCodexDesignReadinessHostStore()), 'CRHS-INPUT', 'no arguments');
});

test('A2 measured field: a VALID fingerprint is rejected with CRHS-INPUT only because of the platform gate', { skip: !win && 'platform-specific measurement; non-win32 hosts are covered by C1' }, () => {
  assert.equal(codeOf(() => createCodexDesignReadinessHostStore({ gitCommonDir: join(scratchRoot, 'x'), repoFingerprint: VALID_FP })), 'CRHS-INPUT');
  // Same predicate, evaluated from the production source text: fails closed off linux, admits linux.
  assert.equal(gatePredicate('win32', VALID_FP), true);
  assert.equal(gatePredicate('darwin', VALID_FP), true);
  assert.equal(gatePredicate('linux', VALID_FP), false);
  assert.equal(gatePredicate('linux', 'bad'), true);
});

test('A3 decision evidence: the platform gate is deliberate production design (POSIX-only primitives), so the fix is on the fixture/test side', () => {
  const source = readFileSync(storePath, 'utf8');
  for (const posix of ['process.getuid()', 'O_DIRECTORY', 'O_NOFOLLOW', '0o022']) {
    assert.ok(source.includes(posix), `store relies on POSIX primitive ${posix}`);
  }
});

test('A4 RED mirror: dropping the platform clause from an in-memory copy of the predicate lets win32 through, so A2 can fail', () => {
  const dropPlatform = s => s.replace("process.platform !== 'linux'", 'false');
  assert.notEqual(dropPlatform(inputGateLine()), inputGateLine(), 'mutation actually changes the predicate');
  assert.equal(gatePredicate('win32', VALID_FP, dropPlatform), false, 'mutant admits win32 (A2 expectation would be RED)');
  assert.equal(gatePredicate('win32', VALID_FP), true, 'production predicate rejects win32');
});

test('B1 the real readinessFixture surfaces CRHS-INPUT on a Windows host (reproduces the item)', { skip: !win && 'reproduction is win32-specific' }, t => {
  mkdirSync(scratchRoot, { recursive: true });
  const tempDir = mkdtempSync(join(scratchRoot, 'dwp2-readiness-'));
  const saved = { TEMP: process.env.TEMP, TMP: process.env.TMP };
  process.env.TEMP = tempDir; process.env.TMP = tempDir; // fixture roots stay under scratch/, not the OS temp dir
  try {
    assert.equal(codeOf(() => readinessFixture(t)), 'CRHS-INPUT');
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('B2 the existing suite skips (does not fail) the readiness case on win32, with a reason naming the linux gate and the WSL route', { skip: !win && 'win32-specific behavior' }, () => {
  const source = readFileSync(existingTestPath, 'utf8');
  assert.match(source, /if\(process\.platform==='win32'\)\{t\.skip\('win32: readinessFixture needs the linux-only codex-design-readiness-host-store \(CRHS-INPUT\); run via WSL: wsl\.exe -e bash/);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  let out;
  try {
    out = execFileSync(process.execPath, ['--test', '--test-reporter=tap', existingTestPath], { cwd: repoRoot, env, encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    assert.fail(`existing suite must exit 0 on win32; status ${error.status}\n${String(error.stdout ?? '').slice(-2000)}`);
  }
  assert.match(out, /^# fail 0$/m);
  assert.match(out, /^ok \d+ - RC12C001 genuine initial consultation .*# SKIP.*CRHS-INPUT.*wsl\.exe/m, 'RC12C001 is reported as an explicit SKIP naming CRHS-INPUT and WSL');
  assert.doesNotMatch(out, /^not ok /m);
});

test('C1 Linux route: a valid fingerprint passes the input gate (the gate is not over-broad)', { skip: win && `win32: ${hostLimitationReason}` }, () => {
  assert.equal(gatePredicate(process.platform, VALID_FP), process.platform !== 'linux');
  if (process.platform === 'linux') {
    const code = codeOf(() => createCodexDesignReadinessHostStore({ gitCommonDir: join(scratchRoot, 'does-not-exist'), repoFingerprint: VALID_FP }));
    assert.notEqual(code, 'CRHS-INPUT', 'past the input gate, later checks (common dir) decide');
  }
});

test('C2 Linux route: the real readinessFixture builds a host store (owner Coordinator, Linux/WSL run)', { skip: process.platform !== 'linux' && `${process.platform}: ${hostLimitationReason}` }, t => {
  const fixture = readinessFixture(t);
  assert.ok(fixture.store, 'fixture returns a host store');
  assert.match(fixture.repoFingerprint, /^[a-f0-9]{64}$/);
});
