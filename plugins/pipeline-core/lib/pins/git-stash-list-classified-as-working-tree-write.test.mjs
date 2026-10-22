// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.git-stash-list-classified-as-working-tree-write (AC-181).
// Real modules, no mocks. All commands are inert strings: no Git/shell subprocess runs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devPlanShellRefusalHit } from '../guard/devplan-shell-lane.mjs';
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

// ---------------------------------------------------------------------------------------------------------------
// PF-16 (observed 2026-10-18, real greenfield project): the write-target extraction of `sed -i` named the sed SCRIPT
// (or the value of -e / -f) as the written file, so GUARD-DEVPLAN-SHELL reported `File: s/^...` for a command whose real
// target was under specs/. GNU sed: the first non-option operand is the script unless -e/-f/--expression/--file gives
// one, then every non-option operand is a file. `-i[SUFFIX]` / `--in-place[=SUFFIX]` take a glued suffix only.
// Each case lists the EXACT write-command candidates; nothing but the real file operand(s) may appear.
// ---------------------------------------------------------------------------------------------------------------
const writeCommandCandidates = command => targetsOf(command).filter(t => t.lane === 'write-command').map(t => t.candidate);
const F = 'specs/f/x.md';
const sedShapes = [
  [`sed -i 's/a/b/' ${F}`, [F]],
  [`sed -i '1d' ${F}`, [F]],
  [`sed -i -n '1p' ${F}`, [F]],
  [`sed -i -E 's/(a)/b/' ${F}`, [F]],
  [`sed -Ei 's/(a)/b/' ${F}`, [F]],
  [`sed -ri 's/(a)/b/' ${F}`, [F]],
  [`sed -s -i 's/a/b/' a.md b.md`, ['a.md', 'b.md']],
  [`sed -i -- 's/a/b/' ${F}`, [F]],
  [`sed -ni 's/a/b/p' ${F}`, [F]],
  [`sed -i.bak 's/a/b/' ${F}`, [F]],
  [`sed -ie 's/a/b/' ${F}`, [F]], // GNU: suffix `e`, the script is still the first operand
  [`sed --in-place 's/a/b/' ${F}`, [F]],
  [`sed --in-place=.bak 's/a/b/' ${F} specs/f/y.md`, [F, 'specs/f/y.md']],
  [`sed --in=.bak 's/a/b/' ${F}`, [F]],
  // script by option: every operand is a file (the PF-16 shape is the first of these)
  [`sed -i -e 's/^a/b/' -e 's/c/d/' ${F}`, [F]],
  [`sed -i -e 's/a/b/' ${F}`, [F]],
  [`sed -i -es/a/b/ ${F}`, [F]],
  [`sed -ni -e 'p' ${F}`, [F]],
  [`sed -i --expression='s/a/b/' ${F}`, [F]],
  [`sed -i --expression 's/a/b/' ${F}`, [F]],
  [`sed -i --expr='s/a/b/' ${F}`, [F]],
  [`sed -i -f fix.sed ${F}`, [F]],
  [`sed -i --file=fix.sed ${F} specs/f/y.md`, [F, 'specs/f/y.md']],
  [`sed -i --file fix.sed ${F}`, [F]],
  [`sed -nf fix.sed -i ${F}`, [F]],
  [`sed -i ${F} -e 's/a/b/'`, [F]], // options may follow operands
  [`sed -l 70 -i 's/a/b/' ${F}`, [F]],
  [`sed -i --line-length=70 's/a/b/' ${F}`, [F]],
  // the stash reader in the same command line contributes no candidate at all
  [`git stash list | sed -i 's/a/b/' ${F}`, [F]],
  [`git stash show | sed -i -e 's/a/b/' ${F}`, [F]],
  // sed `w` command and `s///w` flag write a second file with -i: a real target, not mis-attributed
  [`sed -i 'w out/side.txt' ${F}`, [F, 'out/side.txt']],
  [`sed -i 's/a/b/w out/flag.txt' ${F}`, [F, 'out/flag.txt']],
  // sed without an in-place option never was a writer here
  [`sed -n 's/a/b/p' ${F}`, []],
  [`sed -e 's/a/b/' ${F}`, []],
];
for (const [command, expected] of sedShapes) {
  test('PF-16 sed -i: the write targets of `' + command + '` are exactly the file operands', () => {
    assert.deepEqual(writeCommandCandidates(command), expected);
  });
}
test('PF-16 sed -i: a detached empty suffix (BSD) or empty script (GNU) keeps both readings as candidates', () => {
  const candidates = writeCommandCandidates(`sed -i '' 's/a/b/' ${F}`);
  assert.ok(candidates.includes(F), 'the real file stays a candidate');
  assert.ok(candidates.every(c => c === F || c === 's/a/b/'));
});
test('PF-16 sed -i: a protected file is still a candidate, whichever spelling the in-place option takes', () => {
  const protectedFile = 'plugins/pipeline-core/hooks/guard-git.test.mjs';
  for (const command of [`sed -i 's/a/b/' ${protectedFile}`, `sed -i.bak 's/a/b/' ${protectedFile}`,
    `sed --in-place=.bak -e 's/a/b/' ${protectedFile}`, `sed -ni 's/a/b/p' ${protectedFile}`, `sed -i -f fix.sed ${protectedFile}`]) {
    assert.ok(writeCommandCandidates(command).includes(protectedFile), command);
  }
});
test('PF-16 sed -i: the unparsed-command fallback now recognises a suffixed in-place option', () => {
  // `&&` after a writer is outside the closed grammar, so the raw-token fallback runs; -i.bak used to name no writer there.
  const candidates = targetsOf(`sed -i.bak 's/a/b/' ${F} && echo hi`).map(t => t.candidate);
  assert.ok(candidates.includes(F));
});

// RED mirror: the pre-fix extraction took every non-flag argv entry as a target.
const legacySedTargets = command => command.split(/\s+/).slice(1).filter(w => !w.startsWith('-')).map(w => w.replace(/^'|'$/g, ''));
test('PF-16 RED proof: the legacy every-operand extraction fails the same expectations', () => {
  const failing = sedShapes.filter(([command, expected]) => {
    try { assert.deepEqual(legacySedTargets(command.split('|').at(-1).trim()), expected); return false; } catch { return true; }
  });
  assert.ok(failing.length > 10, 'the legacy mirror must be discriminated by most script-bearing shapes: ' + failing.length);
});

// End to end through the real draft-phase shell lane: the denial must name the REAL file as `File:`.
mkdirSync(join(root, 'scratch'), { recursive: true });
const fixture = mkdtempSync(join(root, 'scratch', 'pf16-fixture-'));
test.after(() => rmSync(fixture, { recursive: true, force: true }));
mkdirSync(join(fixture, '.claude'), { recursive: true });
writeFileSync(join(fixture, '.claude/pipeline.yaml'), 'schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n');
writeFileSync(join(fixture, '.claude/pipeline-state.json'), JSON.stringify({ schema: 'pipeline.state.v0',
  activeFeature: { id: 'f', planPath: '.claude/plans/p.md', phase: 'design' }, planApproved: false }));
const deps = { inspectProjectOnboardingV3Fn() { throw new Error('fixture: no onboarding observation'); }, platform: 'linux' };
test('PF-16 end to end: a draft-phase sed -i on a specs/ file is admitted, whatever the script looks like', () => {
  for (const command of [`sed -i -e 's/^## a/## b/' -e 's/c/d/' specs/f/x.md`, `sed -i.bak 's/^x/y/' specs/f/x.md`,
    `sed -i -f fix.sed specs/f/x.md`, `sed -ni 's/^q/r/p' specs/f/x.md`, `git stash list | sed -i 's/^q/r/' specs/f/x.md`]) {
    assert.equal(devPlanShellRefusalHit(command, fixture, deps), null, command);
  }
});
test('PF-16 end to end: a draft-phase sed -i on an implementation file is refused and names THAT file', () => {
  for (const command of [`sed -i -e 's/^a/b/' -e 's/c/d/' src/app.js`, `sed -i.bak 's/^a/b/' src/app.js`, `sed -i 's/^a/b/' src/app.js`,
    `sed -i -f fix.sed src/app.js`, `git stash list | sed -i 's/^a/b/' src/app.js`]) {
    const hit = devPlanShellRefusalHit(command, fixture, deps);
    assert.equal(hit?.verdict, 'block', command);
    assert.equal(hit.candidate, 'src/app.js', command);
    assert.equal(hit.lane, 'write-command', command);
  }
});
