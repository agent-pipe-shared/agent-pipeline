// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: pipeline.project-calibration-retains-new-project-placeholder (AC-232).
 *
 * No backlog item and no public original exist; the acceptance pinned here is
 * the Elephant-fixed reconstruction S1-S8 (pending PO release):
 *   S1 initial   placeholder "new-project" w/o metadata -> root-derived, physical root name
 *   S2 resume    root-derived metadata resolves; differing stored name -> PCI-NAME-MISMATCH
 *   S3 substituted root -> PCI-ROOT-MISMATCH
 *   S4 alias     non-placeholder w/o metadata -> configured-alias; metadata alias accepted
 *   S5 missing   no calibration -> PCI-CALIBRATION-MISSING; no project -> PCI-PROJECT-MISSING
 *   S6 invalid   INVALID / PROJECT-INVALID / METADATA-INVALID / CALIBRATION-DRIFT
 *   S7 onboarding writes a root-derived identity, never the placeholder
 *   S8 consumer  every PCI refusal reaches readConsumerVerifyConfiguration as
 *                VEP-PROJECT-IDENTITY: <code>, failing closed
 * Real module, real directories under scratch/r6c-fixtures.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readProjectCalibrationIdentity, buildRootProjectCalibrationIdentity,
} from '../project-calibration-identity.mjs';
import { readConsumerVerifyConfiguration } from '../consumer-verify.mjs';
import { freshCalibrationBytes } from '../project-onboarding-v3.mjs';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const HOST_LIMITATION = 'host-limitation: native Windows host cannot create directory symlinks; '
  + 'owner Coordinator, to be run on the Linux/WSL host (PO decision K7)';

const base = join(repository, 'scratch', 'r6c-fixtures');
mkdirSync(base, { recursive: true });
/** Fixture root whose directory name is `name` (default: unique). */
const fixture = (name = 'proj') => {
  const parent = mkdtempSync(join(base, 'case-'));
  const root = join(parent, name);
  mkdirSync(root);
  return root;
};
const NEUTRAL = ['project', 'pipeline.json'];
const LEGACY = ['.claude', 'pipeline.json'];
const put = (root, segments, content) => {
  mkdirSync(join(root, ...segments.slice(0, -1)), { recursive: true });
  writeFileSync(join(root, ...segments), typeof content === 'string' ? content : JSON.stringify(content));
};
const calib = (root, value, segments = NEUTRAL) => put(root, segments, value);
const read = (root) => readProjectCalibrationIdentity({ rootDir: root });
const rootSha = (root) => buildRootProjectCalibrationIdentity({ rootDir: root }).rootSha256;
const meta = (root, kind = 'root-derived', over = {}) => ({
  schema: 'pipeline.project-calibration-identity.v1', kind, rootSha256: rootSha(root), ...over,
});

test('S1 placeholder without metadata resolves root-derived to the physical root name', () => {
  const root = fixture('real-name');
  calib(root, { project: 'new-project' });
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.equal(r.kind, 'root-derived');
  assert.equal(r.project, 'real-name');
  assert.deepEqual(r.configuredValue, { status: 'unavailable', reason: 'legacy-placeholder' });
});

test('S1 the placeholder is never reported as the project name (legacy path too)', () => {
  const root = fixture('legacy-name');
  calib(root, { project: 'new-project' }, LEGACY);
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.notEqual(r.project, 'new-project');
  assert.equal(r.project, 'legacy-name');
});

test('S1 a root genuinely named new-project still reports the placeholder as unavailable', () => {
  const root = fixture('new-project');
  calib(root, { project: 'new-project' });
  const r = read(root);
  assert.equal(r.kind, 'root-derived');
  assert.deepEqual(r.configuredValue, { status: 'unavailable', reason: 'legacy-placeholder' });
});

test('S2 root-derived metadata with matching rootSha256 resolves', () => {
  const root = fixture('resume-root');
  calib(root, { project: 'resume-root', projectIdentity: meta(root) });
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.equal(r.kind, 'root-derived');
  assert.equal(r.project, 'resume-root');
  assert.deepEqual(r.configuredValue, { status: 'selected', reason: null });
});

test('S2 a stored name differing from the root name is refused PCI-NAME-MISMATCH', () => {
  const root = fixture('actual-root');
  calib(root, { project: 'other-name', projectIdentity: meta(root) });
  const r = read(root);
  assert.equal(r.status, 'unavailable');
  assert.equal(r.code, 'PCI-NAME-MISMATCH');
});

test('S3 metadata whose rootSha256 does not match the physical root is refused PCI-ROOT-MISMATCH', () => {
  const root = fixture('substituted');
  calib(root, { project: 'substituted', projectIdentity: meta(root, 'root-derived', { rootSha256: 'f'.repeat(64) }) });
  const r = read(root);
  assert.equal(r.status, 'unavailable');
  assert.equal(r.code, 'PCI-ROOT-MISMATCH');
});

test('S3 a calibration copied from another root is refused PCI-ROOT-MISMATCH', () => {
  const origin = fixture('same-name');
  const copy = fixture('same-name');
  calib(origin, { project: 'same-name', projectIdentity: meta(origin) });
  writeFileSync(join(copy, 'project-copy.tmp'), '');
  put(copy, NEUTRAL, readFileSync(join(origin, ...NEUTRAL), 'utf8'));
  assert.equal(read(copy).code, 'PCI-ROOT-MISMATCH');
});

test('S4 a non-placeholder project without metadata resolves configured-alias', () => {
  const root = fixture('dir-name');
  calib(root, { project: 'my-alias' });
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.equal(r.kind, 'configured-alias');
  assert.equal(r.project, 'my-alias');
  assert.deepEqual(r.configuredValue, { status: 'selected', reason: null });
});

test('S4 metadata kind configured-alias is accepted', () => {
  const root = fixture('dir-name2');
  calib(root, { project: 'my-alias', projectIdentity: meta(root, 'configured-alias') });
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.equal(r.kind, 'configured-alias');
  assert.equal(r.project, 'my-alias');
});

test('S5 no calibration file is refused PCI-CALIBRATION-MISSING', () => {
  const r = read(fixture());
  assert.equal(r.status, 'unavailable');
  assert.equal(r.code, 'PCI-CALIBRATION-MISSING');
});

test('S5 a calibration without a project field is refused PCI-PROJECT-MISSING', () => {
  const root = fixture();
  calib(root, { verify: null });
  assert.equal(read(root).code, 'PCI-PROJECT-MISSING');
  const blank = fixture();
  calib(blank, { project: '   ' });
  assert.equal(read(blank).code, 'PCI-PROJECT-MISSING');
});

test('S6 invalid JSON is refused PCI-CALIBRATION-INVALID', () => {
  const root = fixture();
  put(root, NEUTRAL, '{ not json');
  assert.equal(read(root).code, 'PCI-CALIBRATION-INVALID');
});

test('S6 a bad project label is refused PCI-PROJECT-INVALID', () => {
  const root = fixture();
  calib(root, { project: 'bad\u0007label' });
  assert.equal(read(root).code, 'PCI-PROJECT-INVALID');
  const long = fixture();
  calib(long, { project: 'x'.repeat(600) });
  assert.equal(read(long).code, 'PCI-PROJECT-INVALID');
});

test('S6 a bad metadata shape is refused PCI-METADATA-INVALID', () => {
  const extra = fixture();
  calib(extra, { project: 'p', projectIdentity: meta(extra, 'configured-alias', { extra: 1 }) });
  assert.equal(read(extra).code, 'PCI-METADATA-INVALID');
  const kind = fixture();
  calib(kind, { project: 'p', projectIdentity: meta(kind, 'bogus-kind') });
  assert.equal(read(kind).code, 'PCI-METADATA-INVALID');
  const sha = fixture();
  calib(sha, { project: 'p', projectIdentity: meta(sha, 'root-derived', { rootSha256: 'nothex' }) });
  assert.equal(read(sha).code, 'PCI-METADATA-INVALID');
});

test('S6 neutral and legacy calibration present and not byte-equal is refused PCI-CALIBRATION-DRIFT', () => {
  const root = fixture();
  calib(root, { project: 'alpha' }, NEUTRAL);
  calib(root, { project: 'beta' }, LEGACY);
  assert.equal(read(root).code, 'PCI-CALIBRATION-DRIFT');
});

test('S6 byte-equal neutral and legacy calibrations do not drift', () => {
  const root = fixture();
  calib(root, { project: 'alpha' }, NEUTRAL);
  calib(root, { project: 'alpha' }, LEGACY);
  assert.equal(read(root).status, 'resolved');
});

test('S6 a symlinked root is unavailable PCI-ROOT-UNAVAILABLE',
  { skip: process.platform === 'win32' ? HOST_LIMITATION : false }, () => {
    const real = fixture('real');
    const link = join(fixture('holder'), 'link');
    symlinkSync(real, link, 'dir');
    assert.equal(read(link).code, 'PCI-ROOT-UNAVAILABLE');
  });

test('S6 an unavailable root (deps seam) is refused PCI-ROOT-UNAVAILABLE', () => {
  const r = readProjectCalibrationIdentity({
    rootDir: fixture(),
    deps: { lstatSync: () => { throw new Error('boom'); } },
  });
  assert.equal(r.code, 'PCI-ROOT-UNAVAILABLE');
});

test('S7 onboarding seeds a root-derived identity, never the new-project placeholder', () => {
  const root = fixture('onboarded-proj');
  const seeded = JSON.parse(freshCalibrationBytes({ rootDir: root }));
  assert.equal(seeded.project, 'onboarded-proj');
  assert.notEqual(seeded.project, 'new-project');
  assert.equal(seeded.projectIdentity.kind, 'root-derived');
  assert.equal(seeded.projectIdentity.rootSha256, rootSha(root));
  // Round trip: the freshly onboarded calibration resolves as root-derived.
  calib(root, seeded);
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.equal(r.kind, 'root-derived');
  assert.equal(r.project, 'onboarded-proj');
  assert.deepEqual(r.configuredValue, { status: 'selected', reason: null });
});

test('S7 the onboarding source calls buildRootProjectCalibrationIdentity for the seeded identity', () => {
  const src = readFileSync(join(repository, 'plugins', 'pipeline-core', 'lib', 'project-onboarding-v3.mjs'), 'utf8');
  assert.match(src, /buildRootProjectCalibrationIdentity\(\{ rootDir,/u);
  assert.doesNotMatch(src, /project:\s*["']new-project["']/u);
});

test('S8 consumer reads a resolved identity; the placeholder yields the root name', () => {
  const root = fixture('consumer-root');
  calib(root, { project: 'new-project', verify: null });
  const cfg = readConsumerVerifyConfiguration(root);
  assert.equal(cfg.project, 'consumer-root');
  assert.equal(cfg.projectIdentity.kind, 'root-derived');
});

const consumerCases = [
  ['PCI-PROJECT-MISSING', (root) => calib(root, { verify: null })],
  ['PCI-CALIBRATION-INVALID', (root) => put(root, NEUTRAL, '{ nope')],
  ['PCI-PROJECT-INVALID', (root) => calib(root, { project: 'bad\u0007' })],
  ['PCI-METADATA-INVALID', (root) => calib(root, { project: 'p', projectIdentity: { schema: 'x' } })],
  ['PCI-ROOT-MISMATCH', (root) => calib(root, { project: 'consumer', projectIdentity: meta(root, 'root-derived', { rootSha256: 'e'.repeat(64) }) })],
  ['PCI-NAME-MISMATCH', (root) => calib(root, { project: 'other', projectIdentity: meta(root) })],
  ['PCI-CALIBRATION-DRIFT', (root) => { calib(root, { project: 'a' }, NEUTRAL); calib(root, { project: 'b' }, LEGACY); }],
];
for (const [code, arrange] of consumerCases) {
  test(`S8 consumer fails closed with VEP-PROJECT-IDENTITY: ${code}`, () => {
    const root = fixture('consumer');
    arrange(root);
    assert.throws(() => readConsumerVerifyConfiguration(root),
      (error) => error.message === `VEP-PROJECT-IDENTITY: ${code}`);
  });
}
