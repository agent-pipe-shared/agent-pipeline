// SPDX-License-Identifier: SUL-1.0
// Independent accepted-contract regression. All identities/content are synthetic.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isAllowedPassiveReadTarget } from './passive-read-policy.mjs';
import { isBoundedSingleRg, parseGuardCommand } from '../hooks/guard-command-grammar.mjs';
import { registerTestCaseCompletion } from './test-case-completion.mjs';

const cases = [];
function add(name, run) { cases.push({ id: `PCF${String(cases.length + 1).padStart(3, '0')}`, name, run }); }
const root = '/workspace/synthetic-project';
const home = '/home/synthetic-owner';
const fileStat = () => ({ isFile: () => true, isDirectory: () => false });
function admitted(raw, aliases = {}) {
  return isAllowedPassiveReadTarget(raw, {
    rootDir: root, homeDir: home,
    machinePlaneRead: () => ({ status: 'absent' }),
    repoKeyDirectory: () => ({ status: 'absent' }),
    stat: fileStat,
    realpath: value => aliases[resolve(value)] ?? resolve(value),
  });
}
for (const name of ['.git-credentials', '.pypirc', '.netrc', '.npmrc']) {
  for (const [shape, raw] of [
    ['home absolute', `${home}/${name}`],
    ['home shorthand', `~/${name}`],
    ['WSL mounted host spelling', `/mnt/c/Users/synthetic-owner/${name}`],
  ]) add(`${name}: refuse ${shape}`, () => assert.equal(admitted(raw), false));
  add(`${name}: refuse physical public-name alias`, () => assert.equal(
    admitted(`${root}/public-alias.md`, { [`${root}/public-alias.md`]: `${home}/${name}` }), false));
  // On POSIX this is an unsupported Windows operand, not native WSL proof.
  add(`${name}: refuse WSL UNC operand`, () => assert.equal(
    admitted(`\\\\wsl.localhost\\SyntheticDistro\\home\\synthetic-owner\\${name}`), false));
}
add('shadow: refuse POSIX system path', () => assert.equal(admitted('/etc/shadow'), false));
add('shadow: refuse physical system alias', () => assert.equal(
  admitted(`${root}/public-shadow.md`, { [`${root}/public-shadow.md`]: '/etc/shadow' }), false));
add('shadow: refuse unsupported WSL UNC system spelling', () => assert.equal(
  admitted('\\\\wsl.localhost\\SyntheticDistro\\etc\\shadow'), false));
add('retain project public exact markdown', () => assert.equal(admitted(`${root}/README.md`), true));
add('retain user-visible external public exact markdown', () => assert.equal(admitted('/home/synthetic-neighbour/README.md'), true));
add('retain safe public symlink identity', () => assert.equal(
  admitted(`${root}/safe-link.md`, { [`${root}/safe-link.md`]: `${root}/README.md` }), true));
add('retain environment example public file', () => assert.equal(admitted(`${root}/.env.example`), true));
// PO decision D109 (2026-10-22; QG-04 restatement): this alias used to point at ~/.ssh/config, which D109 lists as a named
// exception (client configuration, no key material; owner PO, expires 2027-04-22). The pin's intent is the SSH IDENTITY, so
// the alias now targets the private key itself and stays refused; the former target is the positive control.
add('refuse protected SSH identity alias', () => assert.equal(
  admitted(`${root}/public-ssh.md`, { [`${root}/public-ssh.md`]: `${home}/.ssh/id_ed25519` }), false));
add('D109 control: an alias to the named-exception ~/.ssh/config is admitted, its sibling private key is not', () => {
  assert.equal(admitted(`${root}/public-ssh.md`, { [`${root}/public-ssh.md`]: `${home}/.ssh/config` }), true);
  assert.equal(admitted(`${home}/.ssh/id_ed25519`), false);
});
add('refuse protected cloud credential root', () => assert.equal(admitted(`${home}/.aws/credentials`), false));

// This tree is exclusively owned and outside any Git discovery boundary.
// The policy may run its names-only rg inventory here; no credential contents
// are read, and no command string or substitution is executed.
if (!process.env.PCF_SYNTHETIC_FIXTURE) process.env.PCF_SYNTHETIC_FIXTURE = mkdtempSync(join(tmpdir(), 'pcf-'));
if (!process.env.GIT_CEILING_DIRECTORIES) process.env.GIT_CEILING_DIRECTORIES = dirname(process.env.PCF_SYNTHETIC_FIXTURE);
const fixture = process.env.PCF_SYNTHETIC_FIXTURE;
assert.ok(fixture && process.env.GIT_CEILING_DIRECTORIES, 'owned fixture and Git ceiling required');
const project = join(fixture, 'project');
const secret = join(fixture, 'synthetic-private');
mkdirSync(project, { recursive: true }); mkdirSync(secret, { recursive: true });
writeFileSync(join(project, 'README.md'), 'synthetic public marker\n', { flag: 'wx' });
writeFileSync(join(secret, '.netrc'), 'SYNTHETIC PLACEHOLDER ONLY\n', { flag: 'wx' });
// The no-follow alias exists to prove that the names-only rg inventory does not follow a link to a credential
// name. That inventory is only the primary engine: when no `rg` binary can be spawned (a host whose `rg` is a
// shell function, e.g. an interactive agent shell), safeRecursiveTree in passive-read-policy.mjs falls back to
// a filesystem walk that by design inspects every entry and refuses a link whose physical target is a
// credential name. The alias therefore belongs to this fixture exactly where the engine that implements
// no-follow is present; without it the fixture must not contain a credential-named link in the searched tree.
const rgInventoryEngine = spawnSync('rg', ['--version'], { encoding: 'utf8', timeout: 10000 });
if (rgInventoryEngine.status === 0) symlinkSync(join(secret, '.netrc'), join(project, 'alias.md'));
add('retain no-follow bounded public search', () => assert.equal(isBoundedSingleRg(['marker', project], project), true));
add('refuse short follow search reaching forbidden synthetic target', () => assert.equal(isBoundedSingleRg(['-L', 'marker', project], project), false));
add('refuse long follow search reaching forbidden synthetic target', () => assert.equal(isBoundedSingleRg(['--follow', 'marker', project], project), false));
add('refuse execution option in read grammar', () => assert.equal(isBoundedSingleRg(['--pre', 'arbitrary', 'marker', project], project), false));
add('refuse unsupported hidden traversal option', () => assert.equal(isBoundedSingleRg(['--hidden', 'marker', project], project), false));
add('refuse shell substitution without authoritative argv', () => {
  const parsed = parseGuardCommand('rg marker $(cat synthetic-file)', project);
  assert.equal(parsed.parseStatus, 'denied'); assert.deepEqual(parsed.segments, []);
});
add('refuse composed output mutation as single read', () => assert.equal(isBoundedSingleRg(['--output', 'result.txt', 'marker', project], project), false));

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 16384 });
