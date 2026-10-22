// SPDX-License-Identifier: SUL-1.0
import { after } from 'node:test';
import { mkdtempSync, chmodSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { userInfo } from 'node:os';
import { registerTestCaseCompletion } from '../lib/test-case-completion.mjs';
import { cases } from './existing-public-anchor-fixtures/cases.mjs';

// Fixture transport only. Product constructors/callbacks and inherited policies
// are unchanged. A safe home matches the already-qualified Root fixture recipe;
// this does not claim EPA reaches Registry's separate /tmp ancestry refusal.
const previousParent = process.env.EPA_FIXTURE_PARENT;
function identity(s) { return [String(s.dev), String(s.ino), s.mode, s.uid, s.gid]; }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function chain(home) {
  const rows = [];
  for (let p = home; ; p = dirname(p)) {
    const s = lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink() || realpathSync(p) !== p || (s.mode & 0o022) !== 0)
      throw Error('EPA-FIXTURE-ANCESTRY');
    try { lstatSync(join(p, '.git')); throw Error('EPA-FIXTURE-INSIDE-GIT'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    rows.push({ path: p, identity: identity(s) });
    if (dirname(p) === p) return rows;
  }
}
const user = userInfo(), home = resolve(user.homedir);
if (home !== user.homedir || realpathSync(home) !== home) throw Error('EPA-FIXTURE-HOME-CANONICAL');
const ancestors = chain(home), homeStat = lstatSync(home);
if ((typeof process.getuid === 'function' && (user.uid !== process.getuid() || homeStat.uid !== process.getuid()))
    || homeStat.uid !== user.uid) throw Error('EPA-FIXTURE-HOME-OWNER');
const parent = mkdtempSync(join(home, '.pipeline-existing-public-anchor-'));
chmodSync(parent, 0o700);
const owned = lstatSync(parent);
if (!owned.isDirectory() || owned.isSymbolicLink() || realpathSync(parent) !== parent
    || (owned.mode & 0o777) !== 0o700 || owned.uid !== user.uid
    || !same(ancestors, chain(home))) throw Error('EPA-FIXTURE-CREATION-CAS');
process.env.EPA_FIXTURE_PARENT = parent;
after(() => {
  if (previousParent === undefined) delete process.env.EPA_FIXTURE_PARENT;
  else process.env.EPA_FIXTURE_PARENT = previousParent;
  const current = lstatSync(parent);
  if (!current.isDirectory() || current.isSymbolicLink() || realpathSync(parent) !== parent
      || !same(identity(owned), identity(current)) || !same(ancestors, chain(home)))
    throw Error('EPA-FIXTURE-CLEANUP-CAS');
  const beforeRemove = lstatSync(parent);
  if (!same(identity(current), identity(beforeRemove))) throw Error('EPA-FIXTURE-CLEANUP-CAS');
  rmSync(parent, { recursive: true });
});
registerTestCaseCompletion({ cases, fd: 3, maxBytes: 65536 });
