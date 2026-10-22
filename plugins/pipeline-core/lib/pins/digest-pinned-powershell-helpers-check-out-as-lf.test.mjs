// SPDX-License-Identifier: SUL-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Pin: a PowerShell helper whose bytes are digest-pinned in a production module must
// check out as LF on every host. `*.ps1 text eol=crlf` would otherwise rewrite it to
// CRLF on Windows, the pinned digest would never match, and the module would fail
// closed (WPO-HELPER-CAS / WIN-AUTH-HELPER-CAS) so native-Windows cases could not run.
const lib = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(lib, '..', '..', '..');
const HELPERS = [
  { module: 'windows-native-process-observer.mjs', helper: 'windows-native-process-observer.ps1' },
  { module: 'windows-owned-authority-backend.mjs', helper: 'windows-owned-authority-native.ps1' },
];

function pinned(moduleName) {
  const source = readFileSync(path.join(lib, moduleName), 'utf8');
  const match = /const HELPER_SHA256\s*=\s*'([0-9a-f]{64})'/u.exec(source);
  assert.ok(match, `${moduleName} declares a HELPER_SHA256 constant`);
  return match[1];
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const { module, helper } of HELPERS) {
  const file = path.join(lib, helper);
  const rel = `plugins/pipeline-core/lib/${helper}`;
  test(`${helper} working copy hashes to the pinned digest`, () => {
    assert.equal(sha256(readFileSync(file)), pinned(module));
  });
  test(`${helper} is attributed eol=lf`, () => {
    const out = execFileSync('git', ['check-attr', 'eol', '--', rel], { cwd: repoRoot, encoding: 'utf8' });
    assert.match(out, /: eol: lf\s*$/u);
  });
}

test('native observer is no longer refused by its helper digest on win32', async (t) => {
  if (process.platform !== 'win32') return t.skip('win32 only');
  const { observeNativeWindowsProcess } = await import('../windows-native-process-observer.mjs');
  const result = observeNativeWindowsProcess({ pid: process.pid });
  assert.notEqual(result?.reason, 'WPO-HELPER-CAS');
  t.diagnostic(`observer status=${result?.status} reason=${result?.reason}`);
});
