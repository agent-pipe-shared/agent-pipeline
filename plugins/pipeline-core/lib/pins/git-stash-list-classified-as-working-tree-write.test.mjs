// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.git-stash-list-classified-as-working-tree-write (AC-181).
// Real modules, no mocks. All commands are inert strings: no Git/shell subprocess runs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isReadOnlyDiagnosticCommand } from '../guard/shell-grammar.mjs';
import { extractShellWriteTargets } from '../protected-test-paths.mjs';
import { parseGuardCommand } from '../../hooks/guard-command-grammar.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const targetsOf = command => extractShellWriteTargets({ command, root, platform: 'linux' });

// The acceptance predicates, parameterised on the classifier pair so a RED
// mirror (a naive "stash is always mutating" classifier) can be run against
// the very same assertions to prove they are able to fail.
function assertReadOnlyStash(command, { readOnly, targets }) {
  assert.equal(readOnly(command), true, 'must be read-only: ' + command);
  assert.deepEqual(targets(command), [], 'must not name any working-tree write target: ' + command);
}
function assertMutatingStash(command, { readOnly, targets }) {
  assert.equal(readOnly(command), false, 'must not be read-only: ' + command);
  assert.ok(targets(command).some(t => t.lane === 'git-working-tree-write'),
    'must stay in the git-working-tree-write lane: ' + command);
}
const real = {
  readOnly: command => isReadOnlyDiagnosticCommand(command, root),
  targets: targetsOf,
};
// RED mirror: the pre-fix behaviour described in the item (stash as a whole is a write).
const naive = {
  readOnly: command => !/^git stash\b/.test(command) && real.readOnly(command),
  targets: command => /^git stash\b/.test(command)
    ? [{ lane: 'git-working-tree-write', path: command.split(' ').pop() }]
    : real.targets(command),
};

const readers = ['git stash list', 'git stash show', 'git stash show 0'];
const mutators = ['pop', 'drop', 'apply', 'push', 'save', 'clear', 'branch', 'create', 'store'];
const outputNegatives = [
  'git stash show --output result.patch', 'git stash show --output=result.patch',
  'git stash show -o result.patch', 'git stash show -oresult.patch',
  'git stash show > result.patch', 'git stash show >> result.patch',
  'git stash show --ext-diff', 'git stash show --textconv', 'git stash show --no-index',
  'git stash show --unknown', 'git stash list --unknown', 'git stash list --output=result.txt',
  'git stash show 0 1', 'git stash',
];
const hostile = [
  'bash -c "git stash list"', 'git stash list; git stash pop', 'git stash show "$(printf injected)"',
  'git stash list | sh', 'git stash list && git push origin HEAD:refs/heads/main',
];

for (const command of readers) {
  test('AC-181 positive: ' + command + ' is parsed, read-only, and names no write target', () => {
    assert.equal(parseGuardCommand(command, root, { platform: 'linux' }).parseStatus, 'accepted');
    assertReadOnlyStash(command, real);
    assert.equal(targetsOf(command).some(t => t.path === 'list' || t.path === 'show'), false,
      'subcommand argument must not be reported as the written File');
  });
}
for (const verb of mutators) {
  test('AC-181 negative: git stash ' + verb + ' stays in the write lane', () => {
    assertMutatingStash('git stash ' + verb, real);
  });
}
for (const command of outputNegatives) {
  test('AC-181 negative: unsupported/output spelling is not read-only: ' + command, () => {
    assert.equal(real.readOnly(command), false);
  });
}
for (const command of hostile) {
  test('AC-181 negative: hostile wrapper stays out of the reader: ' + command, () => {
    assert.equal(real.readOnly(command), false);
  });
}
test('AC-181 no broadened stash set: only list/show spellings are readers', () => {
  const probes = ['git stash list', 'git stash show', 'git stash show 0', ...mutators.map(v => 'git stash ' + v)];
  const accepted = probes.filter(c => real.readOnly(c));
  assert.deepEqual(accepted, readers);
});
test('RED proof: the same assertions fail against the naive stash-is-a-write mirror', () => {
  for (const command of readers) assert.throws(() => assertReadOnlyStash(command, naive));
  // and the mirror still satisfies the mutating-side assertion, so only the reader side is discriminating
  assertMutatingStash('git stash pop', naive);
});
