// SPDX-License-Identifier: SUL-1.0
// Test-only process isolation. Never resolve the operator's account or home.
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { after } from 'node:test';
import { lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { validatePrivateParent, validateCreatedHome } from './codex-critic-private-parent-fixture.mjs';

const parent = join(process.cwd(), 'scratch', 'g17-enrollment-fixtures');
mkdirSync(parent, { recursive: true, mode: 0o700 });
const area = mkdtempSync(join(parent, 'owned-'));
const identity = lstatSync(area);
const privateParent = process.env.G17_PRIVATE_PARENT;
if (privateParent) validatePrivateParent(privateParent);
const home = privateParent ? mkdtempSync(join(privateParent, 'g17c-')) : join(area, 'home');
const temp = join(area, 'temp');
if (!privateParent) mkdirSync(home, { mode: 0o700 });
else validateCreatedHome(home);
const homeIdentity = lstatSync(home);
mkdirSync(temp, { mode: 0o700 });
os.userInfo = () => ({ uid: process.getuid?.() ?? 0, gid: process.getgid?.() ?? 0, username: 'fixture', homedir: home, shell: '/bin/sh' });
os.homedir = () => home;
os.tmpdir = () => temp;
syncBuiltinESMExports();
Object.assign(process.env, { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'),
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(home, 'gitconfig') });
after(() => {
  if (privateParent) {
    const present = lstatSync(home, { throwIfNoEntry: false });
    if (present?.isDirectory() && !present.isSymbolicLink() && present.dev === homeIdentity.dev && present.ino === homeIdentity.ino) {
      rmSync(home, { recursive: true, force: true });
    }
  }
  const present = lstatSync(area, { throwIfNoEntry: false });
  if (present?.isDirectory() && !present.isSymbolicLink() && present.dev === identity.dev && present.ino === identity.ino) {
    rmSync(area, { recursive: true, force: true });
  }
});
