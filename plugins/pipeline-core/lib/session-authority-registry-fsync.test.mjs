// AC-127 (C18-6): a directory fsync that Windows refuses must not abort the registry write path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { syncRegistryDirectory } from './session-authority-registry.mjs';

function port(code) {
  const calls = [];
  return {
    calls,
    openSync: () => { calls.push('open'); return 7; },
    fsyncSync: () => { calls.push('fsync'); if (code) { const e = new Error(code); e.code = code; throw e; } },
    closeSync: () => { calls.push('close'); },
  };
}

for (const code of ['EPERM', 'EINVAL', 'EISDIR', 'EACCES', 'ENOTSUP']) {
  test(`win32 tolerates directory fsync ${code} and reports a bounded warning`, () => {
    const fs = port(code);
    const result = syncRegistryDirectory('/x', { platform: 'win32', fs });
    assert.deepEqual(result, { durability: 'unsupported', syncErrorCode: code });
    assert.deepEqual(fs.calls, ['open', 'fsync', 'close']);
  });
  test(`linux still throws directory fsync ${code}`, () => {
    const fs = port(code);
    assert.throws(() => syncRegistryDirectory('/x', { platform: 'linux', fs }), { code });
    assert.deepEqual(fs.calls, ['open', 'fsync', 'close']);
  });
}

test('win32 still throws any other error code', () => {
  const fs = port('EIO');
  assert.throws(() => syncRegistryDirectory('/x', { platform: 'win32', fs }), { code: 'EIO' });
});

test('a successful fsync reports synced on every platform', () => {
  for (const platform of ['win32', 'linux']) {
    assert.deepEqual(syncRegistryDirectory('/x', { platform, fs: port(null) }), { durability: 'synced' });
  }
});
