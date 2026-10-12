#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, statfsSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBoundArtifactTransfer, verifyTransferredArtifact } from '../lib/bound-artifact-transfer.mjs';

// Explicit local runtime-transfer producer. No Git, network, lifecycle writes,
// signatures, private-state discovery, guessed bindings, or in-place redaction.
// Descriptor anchoring is currently Linux-only; other hosts get a typed hold.
const anchor = (fd) => `/proc/self/fd/${fd}`;
const same = (left, right) => left.dev === right.dev && left.ino === right.ino;
const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
function openChildDirectory(parent, name) {
  const path = `${anchor(parent)}/${name}`;
  const before = lstatSync(path);
  if (!before.isDirectory() || before.isSymbolicLink()) throw new Error('BT-DIRECTORY');
  const fd = openSync(path, directoryFlags);
  if (!same(before, fstatSync(fd))) { closeSync(fd); throw new Error('BT-DRIFT'); }
  return fd;
}
function openRoot(root) {
  let fd = openSync('/', directoryFlags);
  try {
    for (const part of root.split('/').filter(Boolean)) {
      const child = openChildDirectory(fd, part);
      closeSync(fd); fd = child;
    }
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}
function readBytes(fd, cap) {
  const buffer = Buffer.alloc(cap + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const count = readSync(fd, buffer, offset, buffer.length - offset, offset);
    if (!count) break;
    offset += count;
  }
  if (offset > cap) throw new Error('BT-LIMIT');
  return buffer.subarray(0, offset);
}
function boundedRead(rootFd, root, name, limit) {
  const path = resolve(root, name);
  const rel = relative(root, path);
  if (!rel || isAbsolute(rel) || rel.split('/').some((part) => part === '..' || !part || part.startsWith('.'))
    || /[\\\x00-\x1f]/u.test(name)) throw new Error('BT-PATH');
  const parts = rel.split('/');
  let dir = openSync(`${anchor(rootFd)}/.`, directoryFlags);
  let fd = null;
  try {
    for (const part of parts.slice(0, -1)) { const child = openChildDirectory(dir, part); closeSync(dir); dir = child; }
    const filePath = `${anchor(dir)}/${parts.at(-1)}`;
    const pathStat = lstatSync(filePath);
    if (!pathStat.isFile() || pathStat.isSymbolicLink()) throw new Error('BT-SOURCE');
    fd = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd);
    if (!same(pathStat, before) || !before.isFile() || before.nlink !== 1 || before.size > limit) throw new Error('BT-SOURCE');
    const bytes = readBytes(fd, limit);
    const after = fstatSync(fd);
    const now = lstatSync(filePath);
    if (!same(before, now) || bytes.length !== before.size || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('BT-DRIFT');
    return bytes;
  } finally { if (fd !== null) closeSync(fd); closeSync(dir); }
}

export function runTransferCli(argv) {
  const refusal = (code) => ({ schema: 'pipeline.bound-artifact-transfer-cli.v1', status: 'refused', code });
  if (argv.length !== 7 || argv[0] !== 'prepare' || argv[1] !== '--root' || argv[3] !== '--manifest' || argv[5] !== '--output') return refusal('BT-ARGV');
  if (process.platform !== 'linux' || !constants.O_NOFOLLOW || !constants.O_DIRECTORY) return refusal('BT-HOST-CAPABILITY');
  let rootFd = null;
  let scratchFd = null;
  let outputFd = null;
  let outputCreated = false;
  try {
    if (statfsSync('/proc').type !== 0x9fa0) return refusal('BT-HOST-CAPABILITY');
    const root = realpathSync(argv[2]);
    rootFd = openRoot(root);
    // A root-relative local manifest stays in custody; no paths enter the projection.
    if (!/^scratch\/[A-Za-z0-9_./-]+\.json$/u.test(argv[4])) return refusal('BT-MANIFEST');
    const request = JSON.parse(boundedRead(rootFd, root, argv[4], 128 * 1024).toString('utf8'));
    const outputName = argv[6];
    if (!/^scratch\/[a-zA-Z0-9_-]{1,80}$/u.test(outputName)) return refusal('BT-OUTPUT');
    const outcome = prepareBoundArtifactTransfer(request, (name, cap) => boundedRead(rootFd, root, name, cap));
    if (outcome.status === 'refused') return refusal(outcome.code);
    scratchFd = openChildDirectory(rootFd, 'scratch');
    const basename = outputName.slice('scratch/'.length);
    // Exclusive creation prevents replacing existing export/source/custody files.
    mkdirSync(`${anchor(scratchFd)}/${basename}`, { mode: 0o700 });
    outputCreated = true;
    outputFd = openChildDirectory(scratchFd, basename);
    for (const payload of outcome.payloads) {
      const target = `${anchor(outputFd)}/${payload.id}.artifact`;
      writeFileSync(target, payload.bytes, { mode: 0o600, flag: 'wx' });
      const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!verifyTransferredArtifact(readBytes(fd, payload.bytes.length), payload.sha256)) throw new Error('BT-READBACK');
        fsyncSync(fd);
      } finally { closeSync(fd); }
    }
    writeFileSync(`${anchor(outputFd)}/witness.json`, JSON.stringify({ schema: 'pipeline.bound-artifact-transfer-witness.v1',
      publicProjectionSha256: outcome.publicProjectionSha256,
      artifacts: outcome.payloads.map(({ id, sha256, bytes }) => ({ id, sha256, bytes: bytes.length })) }) + '\n', { mode: 0o600, flag: 'wx' });
    // Published last: an incomplete directory is never a successful bundle.
    writeFileSync(`${anchor(outputFd)}/public-projection.json`, JSON.stringify(outcome.publicProjection) + '\n', { mode: 0o600, flag: 'wx' });
    fsyncSync(outputFd);
    return { schema: 'pipeline.bound-artifact-transfer-cli.v1', status: outcome.status, code: null,
      publicProjectionSha256: outcome.publicProjectionSha256,
      carried: outcome.payloads.length, held: outcome.publicProjection.entries.filter((entry) => entry.status === 'held').length };
  } catch { return refusal(outputCreated ? 'BT-EXPORT-INCOMPLETE' : 'BT-IO'); }
  finally { for (const fd of [outputFd, scratchFd, rootFd]) if (fd !== null) closeSync(fd); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runTransferCli(process.argv.slice(2));
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 'ready' ? 0 : 2;
}
