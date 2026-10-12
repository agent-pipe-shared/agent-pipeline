// SPDX-License-Identifier: SUL-1.0
// Independent closed reader regression: all commands below are inert strings.
// No Git/shell subprocess, authority store or actual stash is touched.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { isReadOnlyDiagnosticCommand } from './shell-grammar.mjs';
import { extractShellWriteTargets } from '../protected-test-paths.mjs';
import { parseGuardCommand } from '../../hooks/guard-command-grammar.mjs';
import { registerTestCaseCompletion } from '../test-case-completion.mjs';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const cases = [];
const check = (name, run) => cases.push({ id: 'GSR' + String(cases.length + 1).padStart(3, '0'), name, run });
// Existing intake explicitly prescribes list and show [<stash>], closed options,
// no output. Positive refs deliberately use only a plain numeric selector;
// braced Git refs and Q12's whole-command policy are not relaxed by this unit.
for (const command of ['git stash list', 'git stash show', 'git stash show 0']) {
  check('closed stash reader: ' + command, () => {
    const parsed = parseGuardCommand(command, root, { platform: 'linux' });
    assert.equal(parsed.parseStatus, 'accepted', 'positive is in the existing direct command syntax');
    assert.equal(isReadOnlyDiagnosticCommand(command, root), true, 'supported stash reader must be read-only');
    assert.deepEqual(extractShellWriteTargets({ command, root, platform: 'linux' }), [],
      'a supported stash reader must not name list/show/ref as a working-tree write');
  });
}
for (const verb of ['pop', 'drop', 'apply', 'push', 'save', 'clear', 'branch', 'create', 'store']) {
  const command = 'git stash ' + verb;
  check('stash write form remains outside reader: ' + verb, () => {
    assert.equal(isReadOnlyDiagnosticCommand(command, root), false);
    assert.ok(extractShellWriteTargets({ command, root, platform: 'linux' }).some(target => target.lane === 'git-working-tree-write'),
      'the explicit non-reader stash verb retains conservative write classification');
  });
}
for (const command of [
  'git stash',
  'git stash show --output result.patch',
  'git stash show --output=result.patch',
  'git stash show -o result.patch',
  'git stash show -oresult.patch',
  'git stash show > result.patch',
  'git stash show >> result.patch',
  'git stash show --ext-diff',
  'git stash show --textconv',
  'git stash show --no-index',
  'git stash show --unknown',
  'git stash list --unknown',
  'git stash list --output=result.txt',
  'git stash show 0 1',
]) check('unsupported/output stash spelling remains outside reader: ' + command, () => {
  assert.equal(isReadOnlyDiagnosticCommand(command, root), false);
});
for (const command of [
  'bash -c "git stash list"',
  'sh -c "git stash show"',
  'git stash list; git stash pop',
  'git stash show "$(printf injected)"',
  'git stash show `printf injected`',
  'git stash list | sh',
  'git stash list && git push origin HEAD:refs/heads/main',
  'git push origin HEAD:refs/heads/main',
]) check('hostile wrapper/substitution/publication remains outside reader: ' + command, () => {
  assert.equal(isReadOnlyDiagnosticCommand(command, root), false);
});
registerTestCaseCompletion({ cases, fd: 3, maxBytes: 16384 });
