import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function identity(stat) {
  return {dev: String(stat.dev), ino: String(stat.ino), mode: String(stat.mode), uid: String(stat.uid), gid: String(stat.gid), nlink: String(stat.nlink)};
}
function contained(root, file) {
  const relative = path.relative(root, file);
  assert.ok(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative), 'Fault/snapshot path must belong to this actual exclusively owned fixture');
  assert.equal(fs.realpathSync(root), path.resolve(root));
  assert.equal(fs.realpathSync(file), path.resolve(file));
}
export function readOwnedPhysicalFile({root, file}) {
  contained(root, file);
  const named = fs.lstatSync(file, {bigint: true});
  assert.ok(named.isFile() && !named.isSymbolicLink(), 'Actual fixture resource must be a regular file');
  assert.equal(named.nlink, 1n, 'Actual fixture resource must be single-link');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd, {bigint: true});
    assert.deepEqual(identity(opened), identity(named));
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, {bigint: true});
    const last = fs.lstatSync(file, {bigint: true});
    assert.deepEqual(identity(after), identity(opened));
    assert.deepEqual(identity(last), identity(opened));
    assert.equal(after.size, opened.size);
    assert.equal(after.mtimeNs, opened.mtimeNs);
    assert.equal(after.ctimeNs, opened.ctimeNs);
    assert.equal(BigInt(bytes.length), opened.size);
    return {file, bytes, sha256: sha(bytes), identity: identity(opened)};
  } finally { fs.closeSync(fd); }
}
export function captureOwnedPhysicalFiles({root, files}) {
  assert.ok(Array.isArray(files) && files.length > 0, 'Use actual declared authority/resource paths');
  assert.equal(new Set(files).size, files.length);
  return files.map(file => readOwnedPhysicalFile({root, file}));
}
export function assertOwnedPhysicalConservation({root, before}) {
  for (const row of before) {
    const current = readOwnedPhysicalFile({root, file: row.file});
    assert.deepEqual(current.identity, row.identity, 'Conserve actual physical inode/mode/ownership/link identity');
    assert.equal(current.sha256, row.sha256, 'Conserve actual authority/resource bytes');
    assert.equal(current.bytes.length, row.bytes.length);
  }
}
function writeSameOwnedInode({root, file, expected, replacement}) {
  const current = readOwnedPhysicalFile({root, file});
  assert.deepEqual(current.identity, expected.identity, 'Never mutate or restore a foreign replacement');
  assert.equal(current.sha256, expected.sha256, 'Physical write CAS must match the actual expected bytes');
  const fd = fs.openSync(file, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    assert.deepEqual(identity(fs.fstatSync(fd, {bigint: true})), expected.identity);
    let offset = 0;
    while (offset < replacement.length) {
      const written = fs.writeSync(fd, replacement, offset, replacement.length - offset, offset);
      assert.ok(written > 0);
      offset += written;
    }
    fs.ftruncateSync(fd, replacement.length);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  const written = readOwnedPhysicalFile({root, file});
  assert.deepEqual(written.identity, expected.identity);
  assert.equal(written.sha256, sha(replacement));
  return written;
}
export function changeActualOwnedFileBytes({root, file, replacement}) {
  assert.ok(Buffer.isBuffer(replacement));
  const original = readOwnedPhysicalFile({root, file});
  assert.ok(!replacement.equals(original.bytes), 'The independently specified drift must change actual bytes');
  const fault = writeSameOwnedInode({root, file, expected: original, replacement});
  let restored = false;
  return Object.freeze({
    original, fault,
    restore() {
      assert.equal(restored, false, 'Restore this own physical fault once');
      writeSameOwnedInode({root, file, expected: fault, replacement: original.bytes});
      restored = true;
    }
  });
}
