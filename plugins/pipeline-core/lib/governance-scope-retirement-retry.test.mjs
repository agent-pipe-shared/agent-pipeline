// SPDX-License-Identifier: SUL-1.0
// Source target: plugins/pipeline-core/lib/governance-scope-retirement-retry.test.mjs
//
// GS-RETRY-T (QG-04 test half): pins for the typed retry contract of
// `readGovernanceEnrollmentRetirement` when the nested enrollment-retirement
// reader returns no usable output.
//
// Backlog item: backlog/items/2026-09-29-reconnect-sandbox-empty-child-output-breaks-bootstrap.md
// Fix location (later slice, NOT this file): plugins/pipeline-core/lib/governance-scope.mjs, the
// child-readback block of `readGovernanceEnrollmentRetirement` (the `exec(...)` call, the empty
// check and the JSON.parse guard).
//
// WHAT EXISTS TODAY
// - `GS-RETIREMENT-READBACK-EMPTY` and `GS-RETIREMENT-READBACK-INVALID` are thrown (commit
//   d1a015ff5), and governance-scope.test.mjs already asserts the two codes on one input each.
// - The thrown Error carries only `{code, ownedGitTopology}`. No typed retry action exists, so no
//   consumer can tell "the host boundary returned nothing" from corrupt project state, and the
//   inspect command named in the error path cannot be retried mechanically.
//
// SEAM (no production change needed): `readGovernanceEnrollmentRetirement({rootDir, exec})`
// already takes an injectable `exec`. It is reached only on the plain-Git branch, so the
// fixture is one real temporary Git repository. That branch never touches the default
// controller or the host store. Git is isolated from the real home and system config, and
// nothing here uses the network.
//
// ASSUMPTIONS RECORDED BY THIS FILE (the briefing fixes the semantics, not the field names;
// the fix slice must implement exactly these or get the change agreed before touching this file):
// A1. The typed retry rides on the thrown Error as `error.nextAction`. The function throws; it
//     does not return a result object for this case.
// A2. `nextAction` mirrors `governanceEnrollmentRecoveryAction` (governance-scope.mjs):
//     `kind` is 'command' or 'external-operator', and `executable` is process.execPath.
//     `argv` is EXACTLY the readback command: [pipeline-state.mjs, 'inspect-enrollment-retirement',
//     '--root', <rootDir>]. `mutation === false` and `requiresConfirmation === false`.
//     `expected.schema` is 'pipeline.enrollment-retirement-inspection.v1'.
// A3. `nextAction.executionBoundary` is a non-empty string naming where the retry must run (the
//     item asks for "the required execution boundary"). The concrete value is left to the fix.
// A4. "Bounded" means `nextAction.retry.maxAttempts === 1`: exactly ONE retry. The bound is data
//     the host driver enforces, so this file adds NO new input parameter to the function.
// A5. The retry is executed by the host, not by this function. The function must call `exec`
//     exactly once per invocation and never run the retry itself. The "retry" in these tests is
//     a second invocation of the function. The scripted `exec` stands in for the host-boundary run.
// A6. INVALID output (unparseable JSON), a wrong-schema document (`GS-RETIREMENT-INSPECTION`)
//     and a child that fails outright all stay distinct errors with NO `nextAction`.
//     Only an empty readback is a transport/host-boundary condition.
// A7. "Never a loop": after the ONE retry, a second empty readback stays the typed
//     `GS-RETIREMENT-READBACK-EMPTY` failure. The host driver (see `hostDriver`) stops there and
//     reports it. It does not retry again, does not swallow it, and does not retype it.
// A8. Surfacing the retry changes no lifecycle state: the Git config and the project tree are
//     byte-identical before and after, and `exec` only ever receives the read-only inspect command.
//
// EXPECTED STATE BEFORE THE FIX (recorded in evidence/GS-RETRY-T-20261009/red.txt)
// - GREEN guards, behaviour already exists: valid result, wrong schema, invalid JSON, child
//   failure, empty variants raise the EMPTY code, exact inspect argv, one exec call per
//   invocation, no state change.
// - RED, `nextAction` missing: every test whose name starts with "RETRY".
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { readGovernanceEnrollmentRetirement } from './governance-scope.mjs';

const EMPTY = 'GS-RETIREMENT-READBACK-EMPTY';
const INVALID = 'GS-RETIREMENT-READBACK-INVALID';
const WRONG_SCHEMA = 'GS-RETIREMENT-INSPECTION';
const INSPECTION_SCHEMA = 'pipeline.enrollment-retirement-inspection.v1';
const INSPECT_COMMAND = 'inspect-enrollment-retirement';
const WRITER = fileURLToPath(new URL('../scripts/pipeline-state.mjs', import.meta.url));
const FIX = 'fix location: governance-scope.mjs readGovernanceEnrollmentRetirement child-readback block';
const VALID = JSON.stringify({ schema: INSPECTION_SCHEMA, journal: null });
const EMPTY_VARIANTS = [
  ['empty string', ''],
  ['whitespace only', '  \n\t '],
  ['undefined (no output at all)', undefined],
  ['null', null],
];
const ENV_KEYS = ['HOME', 'USERPROFILE', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'];

let base;
let root;
const savedEnv = {};

function runGit(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000, shell: false });
  assert.equal(result.status, 0, JSON.stringify({ args, stderr: result.stderr, error: result.error?.code }));
}

function snapshot(dir, prefix = '') {
  const rows = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...snapshot(path, `${prefix}${entry.name}/`));
    else rows.push([`${prefix}${entry.name}`, readFileSync(path).toString('hex')]);
  }
  return rows;
}

before(() => {
  base = mkdtempSync(join(tmpdir(), 'governance-retry-'));
  const home = join(base, 'home');
  mkdirSync(home);
  writeFileSync(join(home, '.gitconfig'), '');
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.GIT_CONFIG_GLOBAL = join(home, '.gitconfig');
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  root = join(base, 'repo');
  mkdirSync(root);
  runGit(['init', '--initial-branch=main']);
  runGit(['config', 'user.name', 'Fixture']);
  runGit(['config', 'user.email', 'fixture@example.invalid']);
  runGit(['commit', '--allow-empty', '-m', 'fixture']);
});

after(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  rmSync(base, { recursive: true, force: true });
});

/** Scripted child: each call yields the next scripted output (the last one repeats); an Error entry is thrown. */
function scriptedExec(outputs) {
  const calls = [];
  const exec = (file, args, options) => {
    calls.push({ file, args: [...args], options });
    const step = outputs[Math.min(calls.length - 1, outputs.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  return { exec, calls };
}

function attempt(run) {
  try {
    return { value: run(), error: undefined };
  } catch (error) {
    return { value: undefined, error };
  }
}

function read(exec) {
  return attempt(() => readGovernanceEnrollmentRetirement({ rootDir: root, exec }));
}

/**
 * Simulates the host that receives the thrown error. It honours ONLY what the error's
 * `nextAction` says: it retries while `retry.maxAttempts` allows it and stops otherwise.
 * The retry is a second invocation of the function; the scripted exec stands for the readback
 * the host performs at the execution boundary. A hard turn cap keeps a broken implementation
 * from hanging the suite.
 */
function hostDriver(exec) {
  let attempts = 0;
  let outcome;
  for (let turn = 0; turn < 5; turn += 1) {
    outcome = read(exec);
    const action = outcome.error?.code === EMPTY ? outcome.error.nextAction : undefined;
    const limit = action?.retry?.maxAttempts;
    if (!action || !Number.isInteger(limit) || attempts >= limit) break;
    attempts += 1;
  }
  return { attempts, outcome };
}

function expectedArgv() {
  return [WRITER, INSPECT_COMMAND, '--root', root];
}

// ---- GREEN guards: behaviour that already exists and must not regress ----------------------

test('GUARD valid readback returns the journal and runs exactly the read-only inspect command', () => {
  for (const journal of [null, { phase: 'pending', by: 'fixture' }]) {
    const { exec, calls } = scriptedExec([JSON.stringify({ schema: INSPECTION_SCHEMA, journal })]);
    const { value, error } = read(exec);
    assert.equal(error, undefined);
    assert.deepEqual(value, journal);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, process.execPath);
    assert.deepEqual(calls[0].args, expectedArgv());
  }
});

test('GUARD a valid document with the wrong schema is its own error, distinct from empty and invalid, with no retry', () => {
  const { exec, calls } = scriptedExec([JSON.stringify({ schema: 'pipeline.something-else.v1', journal: null })]);
  const { error } = read(exec);
  assert.equal(error?.code, WRONG_SCHEMA);
  assert.notEqual(error.code, EMPTY);
  assert.notEqual(error.code, INVALID);
  assert.equal(error.nextAction, undefined, 'a wrong-schema readback is not a transport condition (A6)');
  assert.equal(calls.length, 1);
});

for (const [label, output] of [
  ['truncated object', '{'],
  ['plain text', 'not json'],
  ['truncated mid-document', `{"schema":"${INSPECTION_SCHEMA}"`],
]) {
  test(`GUARD malformed output (${label}) is INVALID, exec runs once, and no retry is offered`, () => {
    const { exec, calls } = scriptedExec([output]);
    const { error } = read(exec);
    assert.equal(error?.code, INVALID);
    assert.equal(error.nextAction, undefined, `invalid output is corrupt state, never a retry (A6; ${FIX})`);
    assert.equal(calls.length, 1);
  });
}

test('GUARD a child that fails outright propagates unchanged and is not retyped as a readback code or retry', () => {
  const failure = Object.assign(new Error('Command failed: inspect'), { status: 1, stderr: 'synthetic child failure' });
  const { exec, calls } = scriptedExec([failure]);
  const { error } = read(exec);
  assert.equal(error, failure);
  assert.notEqual(error.code, EMPTY);
  assert.notEqual(error.code, INVALID);
  assert.equal(error.nextAction, undefined, 'a failing child is not an empty readback (A6)');
  assert.equal(calls.length, 1);
});

for (const [label, output] of EMPTY_VARIANTS) {
  test(`GUARD empty readback (${label}) raises the EMPTY code after exactly one exec call and changes no state`, () => {
    const before = snapshot(base);
    const { exec, calls } = scriptedExec([output]);
    const { error } = read(exec);
    assert.equal(error?.code, EMPTY);
    assert.equal(calls.length, 1, 'the function surfaces the retry; it never runs it itself (A5)');
    assert.equal(calls[0].file, process.execPath);
    assert.deepEqual(calls[0].args, expectedArgv(), 'the only command ever executed is the read-only inspect (A8)');
    assert.deepEqual(snapshot(base), before, 'no lifecycle state or Git config may change (A8)');
  });
}

// ---- RED pins: the typed retry nextAction does not exist yet --------------------------------

for (const [label, output] of EMPTY_VARIANTS) {
  test(`RETRY empty readback (${label}) carries ONE exact, read-only, host-boundary nextAction`, () => {
    const { exec } = scriptedExec([output]);
    const { error } = read(exec);
    assert.equal(error?.code, EMPTY);
    const action = error.nextAction;
    assert.ok(action && typeof action === 'object' && !Array.isArray(action),
      `GS-RETRY-T: EMPTY must carry a single typed nextAction object (A1); ${FIX}`);
    assert.ok(['command', 'external-operator'].includes(action.kind), `kind: ${action.kind} (A2)`);
    assert.equal(action.executable, process.execPath);
    assert.deepEqual(action.argv, expectedArgv(), 'the retry is exactly the read-only inspect readback (A2)');
    assert.equal(action.mutation, false, 'the retry must not mutate (A2)');
    assert.equal(action.requiresConfirmation, false, 'the retry asks for no PO confirmation or signature (A2)');
    assert.equal(action.expected?.schema, INSPECTION_SCHEMA);
    assert.ok(typeof action.executionBoundary === 'string' && action.executionBoundary.length > 0,
      'the retry names the execution boundary it must run at (A3)');
  });
}

test('RETRY the nextAction is bounded to one attempt, plain serialisable data, and identical for every empty variant', () => {
  const actions = EMPTY_VARIANTS.map(([, output]) => read(scriptedExec([output]).exec).error?.nextAction);
  for (const action of actions) {
    assert.ok(action, `GS-RETRY-T: every empty variant needs the typed nextAction (A1); ${FIX}`);
    assert.equal(action.retry?.maxAttempts, 1, 'exactly ONE retry is offered (A4)');
    assert.deepEqual(JSON.parse(JSON.stringify(action)), action, 'plain data, no functions or class instances');
  }
  for (const action of actions.slice(1)) assert.deepEqual(action, actions[0]);
});

test('RETRY the host follows the nextAction once: a retry that returns valid output yields the journal', () => {
  const { exec, calls } = scriptedExec(['', VALID]);
  const { attempts, outcome } = hostDriver(exec);
  assert.equal(attempts, 1, `GS-RETRY-T: the host must be offered exactly one retry (A4/A5); ${FIX}`);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.value, null);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.deepEqual(call.args, expectedArgv());
});

test('RETRY a second empty readback after the retry stays the typed EMPTY refusal and never loops', () => {
  const { exec, calls } = scriptedExec(['']);
  const { attempts, outcome } = hostDriver(exec);
  assert.equal(attempts, 1, `GS-RETRY-T: one retry must be offered before the refusal (A4/A7); ${FIX}`);
  assert.equal(outcome.error?.code, EMPTY, 'the refusal keeps the typed code (A7)');
  assert.equal(calls.length, 2, 'initial readback plus exactly one retry, never more (A7)');
  for (const call of calls) assert.deepEqual(call.args, expectedArgv(), 'the retry never escalates beyond the inspect command (A8)');
});

test('RETRY invalid output after the retry is INVALID with no further retry', () => {
  const { exec, calls } = scriptedExec(['', '{']);
  const { attempts, outcome } = hostDriver(exec);
  assert.equal(attempts, 1, `GS-RETRY-T: one retry must be offered after the empty readback (A4); ${FIX}`);
  assert.equal(outcome.error?.code, INVALID);
  assert.equal(outcome.error.nextAction, undefined);
  assert.equal(calls.length, 2);
});

test('RETRY the retry flow changes no lifecycle state', () => {
  const before = snapshot(base);
  const { exec, calls } = scriptedExec(['']);
  const { attempts } = hostDriver(exec);
  assert.equal(attempts, 1, `GS-RETRY-T: the retry flow must exist before its state-safety can be pinned (A4); ${FIX}`);
  assert.equal(calls.length, 2);
  assert.deepEqual(snapshot(base), before, 'no config or tree change across the initial readback and the retry (A8)');
});
