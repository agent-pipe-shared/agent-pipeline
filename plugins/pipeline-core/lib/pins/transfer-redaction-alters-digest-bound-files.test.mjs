// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.transfer-redaction-alters-digest-bound-files (AC-265).
// The transfer path must never alter digest-bound bytes: it carries them byte-exact
// or holds them with an origin-device recovery note; the screen only matches real
// path shapes, never free text such as `ly:\n-`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  prepareBoundArtifactTransfer, hasPrivateTransferContent, verifyTransferredArtifact, REQUEST_SCHEMA,
} from '../bound-artifact-transfer.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const request = (artifacts) => ({ schema: REQUEST_SCHEMA, artifacts });
const entry = (id, sourcePath, bytes, extra = {}) => ({
  id, sourcePath, classification: 'public', binding: { kind: 'approval', sha256: sha(bytes) }, ...extra,
});
const readerFor = (files) => (path) => { if (!files.has(path)) throw new Error('missing'); return Buffer.from(files.get(path)); };

// The exact false-positive shape from the original incident (rationale text with `ly:` + newline + `-`).
const FALSE_POSITIVE = Buffer.from('{"rationale":"Receipt-backed facts only:\\n- Only the approved items.\\nonly:\\n- listed"}\n'
  + 'Receipt-backed facts only:\n- first\nreally:\n- second\n', 'utf8');

test('free text such as `ly:\\n-` is not treated as a path (pattern tightened to real path shapes)', () => {
  assert.equal(hasPrivateTransferContent(FALSE_POSITIVE), false);
  assert.equal(hasPrivateTransferContent(Buffer.from('only:\n- a\nonly: /x\n', 'utf8')), true, 'a real POSIX path after a colon is still refused');
});

test('real path shapes are still refused (drive letter, home prefix, UNC)', () => {
  for (const text of ['see C:\\Users\\me\\x.json', 'see c:/dev/x', 'at /home/me/x', 'at /Users/me/x', 'at ~/x/y', '\\\\host\\share\\f']) {
    assert.equal(hasPrivateTransferContent(Buffer.from(text, 'utf8')), true, text);
  }
});

test('a bound file with false-positive-prone prose is carried byte-exact, digest unchanged', () => {
  const files = new Map([['evidence/design-course/r5d.package.json', FALSE_POSITIVE]]);
  const out = prepareBoundArtifactTransfer(request([entry('r5d', 'evidence/design-course/r5d.package.json', FALSE_POSITIVE)]), readerFor(files));
  assert.equal(out.status, 'ready');
  assert.equal(out.publicProjection.entries[0].status, 'carried-byte-exact');
  assert.equal(out.payloads.length, 1);
  assert.ok(Buffer.compare(out.payloads[0].bytes, FALSE_POSITIVE) === 0, 'payload bytes identical to source');
  assert.equal(out.payloads[0].sha256, sha(FALSE_POSITIVE));
  assert.ok(verifyTransferredArtifact(out.payloads[0].bytes, sha(FALSE_POSITIVE)));
  assert.ok(!out.payloads[0].bytes.toString('utf8').includes('<machine-path>'), 'no redaction marker inserted');
});

test('a bound file containing a real machine path is held, never redacted or carried altered', () => {
  const dirty = Buffer.from('{"note":"origin C:\\\\Users\\\\me\\\\repo\\\\file"}\n', 'utf8');
  const files = new Map([['evidence/a.json', dirty]]);
  const out = prepareBoundArtifactTransfer(request([entry('dirty', 'evidence/a.json', dirty)]), readerFor(files));
  assert.equal(out.status, 'held');
  assert.equal(out.payloads.length, 0, 'nothing is carried, so nothing can be carried altered');
  const held = out.publicProjection.entries[0];
  assert.equal(held.status, 'held');
  assert.equal(held.code, 'BT-PRIVACY');
  assert.equal(held.recovery, 'must be copied from the origin device');
  assert.equal(held.expectedSha256, sha(dirty));
  assert.ok(!JSON.stringify(out.publicProjection).includes('Users'), 'public projection leaks no source text');
});

test('digest mismatch (bytes differ from the bound digest) is held with the actual digest, not carried', () => {
  const bound = Buffer.from('{"a":1}\n');
  const drifted = Buffer.from('{"a":2}\n');
  const files = new Map([['evidence/b.json', drifted]]);
  const out = prepareBoundArtifactTransfer(request([entry('drift', 'evidence/b.json', bound)]), readerFor(files));
  assert.equal(out.status, 'held');
  assert.equal(out.payloads.length, 0);
  const held = out.publicProjection.entries[0];
  assert.equal(held.code, 'BT-DIGEST-MISMATCH');
  assert.equal(held.expectedSha256, sha(bound));
  assert.equal(held.actualSha256, sha(drifted));
  assert.equal(held.recovery, 'must be copied from the origin device');
});

test('private and unknown classifications are held without reading the source', () => {
  let reads = 0;
  const reader = () => { reads += 1; return Buffer.from('x'); };
  const x = Buffer.from('x');
  const out = prepareBoundArtifactTransfer(request([
    entry('priv', 'whatever/path.json', x, { classification: 'private' }),
    entry('unk', 'whatever/path.json', x, { classification: 'unknown' }),
  ]), reader);
  assert.equal(reads, 0);
  assert.deepEqual(out.publicProjection.entries.map((e) => e.code), ['BT-PRIVATE', 'BT-CLASSIFICATION-UNKNOWN']);
  assert.ok(out.publicProjection.entries.every((e) => e.recovery === 'must be copied from the origin device'));
});

test('mixed batch: clean bound file carried exact while a dirty one is held; carried bytes never mutated', () => {
  const dirty = Buffer.from('path /home/me/secret-place\n', 'utf8');
  const files = new Map([['docs/ok.md', FALSE_POSITIVE], ['docs/bad.md', dirty]]);
  const out = prepareBoundArtifactTransfer(request([entry('ok', 'docs/ok.md', FALSE_POSITIVE), entry('bad', 'docs/bad.md', dirty)]), readerFor(files));
  assert.equal(out.status, 'held');
  assert.deepEqual(out.publicProjection.entries.map((e) => e.status), ['carried-byte-exact', 'held']);
  assert.equal(out.payloads.length, 1);
  assert.equal(out.payloads[0].id, 'ok');
  assert.ok(Buffer.compare(out.payloads[0].bytes, FALSE_POSITIVE) === 0);
});

test('payload is an independent copy: mutating the reader buffer afterwards does not alter the carried bytes', () => {
  const source = Buffer.from(FALSE_POSITIVE);
  const out = prepareBoundArtifactTransfer(request([entry('r', 'docs/r.md', FALSE_POSITIVE)]), () => source);
  source.fill(0x41);
  assert.equal(sha(out.payloads[0].bytes), sha(FALSE_POSITIVE));
});

// The CLI is Linux-only (descriptor anchoring via /proc); other hosts get a typed hold.
test('CLI carries the bound file byte-exact on disk (Linux) or refuses with a typed hold (other hosts)', () => {
  const cli = fileURLToPath(new URL('../../scripts/bound-artifact-transfer.mjs', import.meta.url));
  const root = mkdtempSync(join(tmpdir(), 'bat-pin-'));
  try {
    mkdirSync(join(root, 'evidence'), { recursive: true });
    mkdirSync(join(root, 'scratch'), { recursive: true });
    writeFileSync(join(root, 'evidence', 'r5d.package.json'), FALSE_POSITIVE);
    writeFileSync(join(root, 'scratch', 'manifest.json'), JSON.stringify(request([entry('r5d', 'evidence/r5d.package.json', FALSE_POSITIVE)])));
    const run = spawnSync(process.execPath, [cli, 'prepare', '--root', root, '--manifest', 'scratch/manifest.json', '--output', 'scratch/out'], { encoding: 'utf8' });
    const result = JSON.parse(run.stdout.trim());
    if (process.platform !== 'linux') {
      assert.equal(result.status, 'refused');
      assert.equal(result.code, 'BT-HOST-CAPABILITY');
      return;
    }
    assert.equal(run.status, 0, run.stdout);
    assert.equal(result.status, 'ready');
    assert.deepEqual(readdirSync(join(root, 'scratch', 'out')).sort(), ['public-projection.json', 'r5d.artifact', 'witness.json']);
    assert.ok(Buffer.compare(readFileSync(join(root, 'scratch', 'out', 'r5d.artifact')), FALSE_POSITIVE) === 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
