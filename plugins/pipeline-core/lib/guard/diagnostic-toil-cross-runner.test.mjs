// SPDX-License-Identifier: SUL-1.0
// Controlled source transports; no installed-runner or native platform attestation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after } from 'node:test';
import { registerTestCaseCompletion } from '../test-case-completion.mjs';

const self = fileURLToPath(import.meta.url);
const hooks = resolve(dirname(self), '../../hooks');
if (process.argv[2] === '--fixture-worker') {
  // All production imports that may resolve policy/private state occur only
  // after a fresh process has received the owned synthetic HOME and cwd.
  const request = JSON.parse(process.argv[3]);
  const { createGovernanceScopeController } = await import('../governance-scope.mjs');
  const controller = createGovernanceScopeController();
  if (request.enroll) {
    const plan = controller.planDecision({ rootDir: request.root, decision: 'enroll', by: 'synthetic-fixture-owner' });
    controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  }
  const scope = controller.observe({ rootDir: request.root });
  assert.equal(scope.state, 'active');
  assert.equal(scope.provenance.kind, 'explicit-local-decision');
  const grammar = await import('./shell-grammar.mjs');
  const result = request.command === undefined ? { state: scope.state }
    : { allowed: grammar.isReadOnlyDiagnosticCommand(request.command, request.root),
      remediation: grammar.grammarRemediation(request.command) };
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

const base = resolve('scratch/diagnostic-toil-cross-runner');
mkdirSync(base, { recursive: true });
const area = realpathSync(mkdtempSync(join(base, 'fixture-')));
const root = join(area, 'repo');
const home = join(area, 'home');
const cache = join(home, '.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64');
const external = join(area, 'external');
for (const directory of [root, home, cache, external, join(root, 'scratch'), join(root, 'project'), join(root, '.claude'), join(root, 'vault')]) mkdirSync(directory, { recursive: true });
const binary = join(cache, 'chrome-headless-shell');
const local = join(root, 'scratch/library.so');
// Binary-like inert files: never run either one, never read an actual browser cache.
for (const path of [binary, local, join(external, 'library.so')]) writeFileSync(path, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0]));
writeFileSync(join(root, 'scratch/browser-probe.mjs'), 'console.log("synthetic browser probe");\n');
const cleanEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
  HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'),
  CLAUDE_PROJECT_DIR: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(home, 'gitconfig'), RIPGREP_CONFIG_PATH: '' };
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
function launch(script, args = [], input) {
  const child = spawnSync(process.execPath, [script, ...args], { cwd: root, env: cleanEnv,
    input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null);
  return child;
}
function inspect(command, enroll = false) {
  const child = launch(self, ['--fixture-worker', JSON.stringify({ root, enroll, command })]);
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
const routes = ['claude', 'codex', 'antigravity'];
let activeCase = null;
const observations = [];
function transportDecision(route, command) {
  assert.equal(inspect().state, 'active', 'silent unenrolled transport cannot qualify admission');
  if (route === 'claude') {
    const child = launch(join(hooks, 'guard-lifecycle-ready.mjs'), ['--runner', 'claude'],
      { tool_name: 'Bash', tool_input: { command, cwd: root } });
    assert.ok([0, 2].includes(child.status), child.stderr);
    return { allowed: child.status === 0, text: child.stderr };
  }
  const child = launch(join(hooks, `${route === 'codex' ? 'codex' : 'antigravity'}-pretool-guard.mjs`), [],
    route === 'codex' ? { cwd: root, session_id: 'diagnostic-fixture', tool_name: 'Bash', tool_input: { command, cwd: root } }
      : { cwd: root, toolCall: { name: 'run_command', args: { CommandLine: command, Cwd: root } } });
  if (route === 'codex') {
    assert.equal(child.status, 0, child.stderr);
    if (child.stdout.trim() === '') {
      assert.equal(inspect(command).allowed, true, 'silent admission requires the actual shared policy');
      return { allowed: true, text: '' };
    }
    const output = JSON.parse(child.stdout.trim().split('\n')[0]).hookSpecificOutput;
    assert.ok(['allow', 'deny'].includes(output?.permissionDecision), child.stdout);
    return { allowed: output.permissionDecision === 'allow', text: output.permissionDecisionReason ?? '' };
  }
  assert.ok([0, 2].includes(child.status), child.stderr);
  const output = JSON.parse(child.stdout.trim().split('\n')[0]);
  assert.ok(['allow', 'deny'].includes(output.decision), child.stdout);
  return { allowed: output.decision === 'allow', text: output.reason ?? '' };
}
function decide(route, command) {
  const result = transportDecision(route, command);
  observations.push({ caseId: activeCase, route, allowed: result.allowed,
    code: result.allowed ? null : result.text.match(/\bGUARD-[A-Z-]+\b/u)?.[0]
      ?? (result.text.includes('Hardening Layer') ? 'AGY-HARDENING-LAYER' : 'OTHER-REFUSAL') });
  return result;
}
function allow(command) {
  const classified = inspect(command);
  const decisions = routes.map(route => ({ route, result: decide(route, command) }));
  assert.equal(classified.allowed, true, command);
  for (const { route, result } of decisions) assert.equal(result.allowed, true, `${route}: ${result.text}`);
}
function deny(command, code) {
  assert.equal(inspect(command).allowed, false, command);
  for (const route of routes) {
    const result = decide(route, command);
    assert.equal(result.allowed, false, `${route}: ${command}`);
    if (code) assert.match(result.text, code, `${route}: ${result.text}`);
  }
}
const initialized = spawnSync('git', ['init', '-q', root], { cwd: root, env: cleanEnv, encoding: 'utf8' });
assert.equal(initialized.status, 0, initialized.stderr);
assert.equal(inspect(undefined, true).state, 'active');
after(() => rmSync(area, { recursive: true, force: true }));
after(() => process.stdout.write(`controlled-transport-observations: ${JSON.stringify({ schema: 'pipeline.diagnostic-toil-controlled-transports.v1', observations })}\n`));
const cases = [];
function test(id, name, run) { cases.push({ id, name, run(context) { activeCase = id; return run(context); } }); }

test('DTC001', 'original objdump and grep shape qualifies all three actual transports', () => {
  allow(`objdump -T ${quote(binary)} | grep -E "snd_|ALSA"`);
});
test('DTC002', 'exact dynamic-symbols file operands include absolute, relative and external', () => {
  for (const path of ['scratch/library.so', local, join(external, 'library.so')]) allow(`objdump --dynamic-syms ${quote(path)}`);
});
test('DTC003', 'existing closed head counts and grep pattern sinks qualify', () => {
  for (const sink of ['head -n 1', 'head -500', 'grep -i -- snd_']) allow(`objdump -T ${quote(local)} | ${sink}`);
});
test('DTC004', 'plugin loaders, executable options, output flags and extra operands stay refused', () => {
  for (const args of [`--plugin ${quote(local)} -T ${quote(local)}`, `-T ${quote(local)} --dwarf=follow-links`,
    `-T ${quote(local)} --output scratch/out`, `-d ${quote(local)}`, `-T ${quote(local)} ${quote(binary)}`,
    `-T @scratch/args`, '-T -', '-T', `--dynamic-syms=${quote(local)}`]) {
    // Only the second-file case names the genuinely external browser cache.
    // Preserve the existing scope cause; every other control is in-root.
    deny(`objdump ${args}`, args === `-T ${quote(local)} ${quote(binary)}`
      ? /GUARD-READ-SCOPE-OUTSIDE-ROOT/u : /GUARD-READ-COMMAND-UNSUPPORTED/u);
  }
  deny('scratch/objdump -T scratch/library.so', /GUARD-READ-COMMAND-UNSUPPORTED/u);
});
test('DTC005', 'credential spelling, foreign profiles, missing files and directories never qualify', () => {
  for (const path of [join(root, 'vault/id_rsa'), join(home, '.ssh/fixture'), '/home/diagnostic-other/.aws/config',
    join(root, 'scratch/missing.so'), join(root, 'scratch')]) deny(`objdump -T ${quote(path)}`);
});
test('DTC006', 'physical aliases reuse passive policy for benign and credential targets', context => {
  if (process.platform === 'win32') { context.skip('DTC-SYMLINK: native Windows privilege qualification pending'); return; }
  writeFileSync(join(root, 'vault/id_rsa'), '');
  symlinkSync(binary, join(root, 'scratch/cache-link.so'));
  symlinkSync(join(root, 'vault/id_rsa'), join(root, 'scratch/credential-link.so'));
  allow('objdump -T scratch/cache-link.so');
  deny('objdump -T scratch/credential-link.so');
});
test('DTC007', 'extra stages, unsafe sinks, substitutions and literal redirects stay refused', () => {
  for (const suffix of ['| grep ALSA | head -n 1', '| tee scratch/out', '| grep -f scratch/args',
    '| scratch/grep ALSA', '| scratch/head -n 1',
    '| head -n 501', '> scratch/out', '2>/dev/null', '| head -n 1 > scratch/out', '&& touch scratch/out', '&& pwd', '\npwd', '; pwd']) {
    deny(`objdump -T ${quote(local)} ${suffix}`);
  }
  deny('objdump -T "$(pwd)/scratch/library.so"');
  allow('pwd && pwd');
});
test('DTC008', 'literal browser inline-code request stays denied and scratch file route is concrete', () => {
  const command = `node -e "import('playwright').then(async p => { for (const name of ['firefox', 'webkit']) { try { const b = await p[name].launch(); console.log(name, 'OK'); await b.close(); } catch (e) { console.log(name, 'ERR', e.message.split('\\n')[0]); } } })"`;
  deny(command);
  for (const inline of ['node -e 1', 'node --eval=1', 'node -p 1']) deny(inline);
  assert.match(inspect(command).remediation ?? '', /scratch\/.*\.mjs/u);
  for (const route of routes) {
    const result = decide(route, 'node scratch/browser-probe.mjs');
    // Scratch scripting does not waive the ordinary readiness gate. This
    // active but partial consumer must return its real lifecycle cause.
    assert.equal(result.allowed, false);
    assert.match(result.text, /GUARD-LIFECYCLE-NOT-READY/u);
  }
  const consumed = launch(join(root, 'scratch/browser-probe.mjs'));
  assert.equal(consumed.status, 0, consumed.stderr);
  assert.equal(consumed.stdout, 'synthetic browser probe\n');
});
test('DTC009', 'global-root find with stderr suppression retains a truthful refusal', () => {
  deny('find / -name "libnspr4.so" 2>/dev/null', /GUARD-REDIRECT-UNAPPROVED/u);
});
test('DTC010', 'calibration checkout is still protected on all three transports', () => {
  deny('git checkout HEAD -- project/pipeline.json .claude/pipeline.json', /GUARD-GATE-STRENGTH-SHELL/u);
});
test('DTC011', 'ldconfig retains refusal because fixed system cache policy is unchanged', () => {
  // /etc belongs to PASSIVE_READ_CREDENTIAL_ROOTS.systemPseudoRoots. Optional
  // print-cache qualification cannot override that rule; never inspect it here.
  for (const args of ['-p', '--print-cache', '', '-v', '-p -N', '-C scratch/cache -p', '-r scratch', '--print-cache --ignore-aux-cache']) deny(`ldconfig ${args}`, /GUARD-READ-COMMAND-UNSUPPORTED/u);
});
test('DTC012', 'real objdump parses an owned benign binary without executing its target', context => {
  const capability = spawnSync('objdump', ['--version'], { cwd: root, env: cleanEnv, encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
  if (capability.error?.code === 'ENOENT') { context.skip('DTC-OBJDUMP: host binary unavailable'); return; }
  assert.equal(capability.status, 0, capability.stderr);
  if (process.platform !== 'linux' || !existsSync('/usr/bin/true')) { context.skip('DTC-ELF: public benign ELF fixture unavailable'); return; }
  // A public system executable is copied into the owned fixture. Neither the
  // copy nor any inspected ELF is ever executed; no home binary is read.
  const benign = join(root, 'scratch/benign-binary');
  copyFileSync('/usr/bin/true', benign);
  allow(`objdump -T ${quote(benign)}`);
  const child = spawnSync('objdump', ['-T', benign], { cwd: root, env: cleanEnv, encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /DYNAMIC SYMBOL TABLE/u);
});
registerTestCaseCompletion({ cases, fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? '3'), maxBytes: 65536 });
