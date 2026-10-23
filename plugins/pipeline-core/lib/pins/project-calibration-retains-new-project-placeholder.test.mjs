// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: pipeline.project-calibration-retains-new-project-placeholder (AC-232).
 *
 * No backlog item and no public original exist; the acceptance pinned here is
 * the reconstruction S1-S8, RELEASED by the PO (2026-10-23, batch 11), with S4
 * following the PO's released wording R1 (AC-232: an aliased identity is refused):
 *   S1 initial   placeholder "new-project" w/o metadata -> root-derived, physical root name
 *   S2 resume    root-derived metadata resolves; differing stored name -> PCI-NAME-MISMATCH
 *   S3 substituted root -> PCI-ROOT-MISMATCH
 *   S4 alias     a non-placeholder name that is not the root-derived name is refused
 *                PCI-ALIAS-REFUSED, with or without metadata (follows R1); the message
 *                names the stored name, the root name and the repair; a name equal to
 *                the root name is no alias and resolves
 *   S4x          exception (PO decision 2026-10-23, row 42): the Agent-Pipeline source checkout
 *                (tracked .claude/pipeline.json project "agent-pipeline" AND tracked
 *                .claude-plugin/marketplace.json name/owner.name "agent-pipeline", one plugin
 *                pipeline-core at ./plugins/pipeline-core) keeps its stored alias in a root with
 *                any name, typed identityMode "source-checkout"; copying one file, untracked
 *                files, a deviating marketplace or any other alias stay refused
 *   S5 missing   no calibration -> PCI-CALIBRATION-MISSING; no project -> PCI-PROJECT-MISSING
 *   S6 invalid   INVALID / PROJECT-INVALID / METADATA-INVALID / CALIBRATION-DRIFT
 *   S7 onboarding writes a root-derived identity, never the placeholder
 *   S8 consumer  every PCI refusal reaches readConsumerVerifyConfiguration as
 *                VEP-PROJECT-IDENTITY: <code>, failing closed
 * Real module, real directories under scratch/r6c-fixtures.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

// QG-04 restatement (bounded): PO decision 2026-10-23 (batch 11), "S4 FOLLOWS R1".
// The two S4 cases below previously asserted that an aliased identity (a
// non-placeholder stored name that is not the root-derived name) RESOLVES as
// configured-alias, with or without metadata. R1 (AC-232, released 2026-10-16)
// says the opposite: "If the identity is ... aliased ... the system shall refuse
// to treat the calibration as bound to the project and shall report why". The
// intent of S4 is unchanged: the alias question has a defined, tested outcome.
// Only the outcome flips from "accepted" to "refused PCI-ALIAS-REFUSED"; the
// refusal message names the stored name, the root-derived name and the repair.
// Scope: only these two cases; nothing else in S1-S3, S5-S8 is touched.
const ALIAS_REFUSED = (r, stored, rootName) => {
  assert.equal(r.status, 'unavailable');
  assert.equal(r.code, 'PCI-ALIAS-REFUSED');
  assert.equal(r.kind, null);
  assert.equal(r.project, null);
  assert.ok(r.message.includes(`"${stored}"`), 'message names the stored name');
  assert.ok(r.message.includes(`"${rootName}"`), 'message names the root-derived name');
  assert.match(r.message, /regenerate the project identity or set "project" to the root name/u);
};

test('S4 a non-placeholder project without metadata that is not the root name is refused PCI-ALIAS-REFUSED', () => {
  const root = fixture('dir-name');
  calib(root, { project: 'my-alias' });
  ALIAS_REFUSED(read(root), 'my-alias', 'dir-name');
});

test('S4 metadata kind configured-alias whose name is not the root name is refused PCI-ALIAS-REFUSED', () => {
  const root = fixture('dir-name2');
  calib(root, { project: 'my-alias', projectIdentity: meta(root, 'configured-alias') });
  ALIAS_REFUSED(read(root), 'my-alias', 'dir-name2');
});

test('S4 a stored name equal to the root name is no alias and resolves without metadata', () => {
  const root = fixture('same-as-root');
  calib(root, { project: 'same-as-root' });
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.equal(r.kind, 'root-derived');
  assert.equal(r.project, 'same-as-root');
  assert.deepEqual(r.configuredValue, { status: 'selected', reason: null });
});

test('S4 metadata kind configured-alias whose name equals the root name resolves', () => {
  const root = fixture('same-as-root2');
  calib(root, { project: 'same-as-root2', projectIdentity: meta(root, 'configured-alias') });
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.equal(r.kind, 'configured-alias');
  assert.equal(r.project, 'same-as-root2');
});

test('S4 the alias refusal reaches the consumer fail-closed with the repair in its message', () => {
  const root = fixture('consumer-dir');
  calib(root, { project: 'my-alias', verify: null });
  assert.throws(() => readConsumerVerifyConfiguration(root), (error) =>
    error.message.startsWith('VEP-PROJECT-IDENTITY: PCI-ALIAS-REFUSED')
    && error.message.includes('"my-alias"') && error.message.includes('"consumer-dir"')
    && /regenerate the project identity or set "project" to the root name/u.test(error.message));
});

// S4x: PO decision 2026-10-23 (batch 12, row 42): S4 stays R1 for consumer projects; THIS
// repository (the Agent-Pipeline source checkout) gets a typed exemption that does not depend on
// the checkout directory name. The exemption is decided by the same identity facts the reader-review
// skill uses (tracked regular .claude/pipeline.json with project "agent-pipeline" AND tracked regular
// .claude-plugin/marketplace.json: name and owner.name "agent-pipeline", exactly one plugin
// "pipeline-core" at ./plugins/pipeline-core), observed from the Git index of the root, never from the
// directory name and never from a calibration field.
const gitEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, env: gitEnv(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};
const MARKETPLACE = ['.claude-plugin', 'marketplace.json'];
const realFile = (segments) => join(repository, ...segments);
/**
 * Fixture repo (arbitrary directory name) holding copies of the real identity files. Both
 * calibration tiers get the bytes of the real project/pipeline.json: at the time of writing the
 * real .claude/pipeline.json differs from it (PCI-CALIBRATION-DRIFT, an unrelated refusal that
 * the exemption deliberately does not touch), so the tiers are made byte-equal here.
 */
const sourceFixture = (name, { skip = [], track = true, edit = {} } = {}) => {
  const root = fixture(name);
  git(root, 'init', '-q');
  for (const segments of [NEUTRAL, LEGACY, MARKETPLACE]) {
    const key = segments.join('/');
    if (skip.includes(key)) continue;
    mkdirSync(join(root, ...segments.slice(0, -1)), { recursive: true });
    if (edit[key] !== undefined) writeFileSync(join(root, ...segments), edit[key]);
    else copyFileSync(realFile(segments === LEGACY ? NEUTRAL : segments), join(root, ...segments));
  }
  if (track) git(root, 'add', '-A');
  return root;
};
const realMarketplace = () => JSON.parse(readFileSync(realFile(MARKETPLACE), 'utf8'));
const SOURCE_REFUSED = (root, label = 'case') => {
  const r = read(root);
  assert.equal(r.status, 'unavailable', label);
  assert.equal(r.code, 'PCI-ALIAS-REFUSED', label);
  assert.equal(r.identityMode, undefined, label);
};

test('S4x the real identity files of this repository resolve in a root with an arbitrary name, typed source-checkout', () => {
  const root = sourceFixture('machine-two-checkout');
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.equal(r.project, 'agent-pipeline');
  assert.equal(r.identityMode, 'source-checkout');
  assert.deepEqual(r.configuredValue, { status: 'selected', reason: null });
});

test('S4x the source-checkout identity reaches consumer verify without PCI-ALIAS-REFUSED', () => {
  const root = sourceFixture('another-directory-name');
  const cfg = readConsumerVerifyConfiguration(root);
  assert.equal(cfg.project, 'agent-pipeline');
  assert.equal(cfg.projectIdentity.identityMode, 'source-checkout');
});

test('S4x a root really named agent-pipeline is no alias and carries no source-checkout mode', () => {
  const root = sourceFixture('agent-pipeline');
  const r = read(root);
  assert.equal(r.status, 'resolved');
  assert.equal(r.kind, 'root-derived');
  assert.equal(r.identityMode, undefined);
});

test('S4x a consumer-shaped repository with the same stored alias is still refused PCI-ALIAS-REFUSED', () => {
  const root = fixture('consumer-shaped');
  git(root, 'init', '-q');
  calib(root, { project: 'agent-pipeline', verify: null });
  git(root, 'add', '-A');
  SOURCE_REFUSED(root);
  assert.throws(() => readConsumerVerifyConfiguration(root), (error) =>
    error.message.startsWith('VEP-PROJECT-IDENTITY: PCI-ALIAS-REFUSED'));
});

test('S4x a repository that copies only the marketplace file is refused PCI-ALIAS-REFUSED', () => {
  SOURCE_REFUSED(sourceFixture('copies-marketplace', { skip: ['.claude/pipeline.json'] }));
});

test('S4x a repository that copies only the calibration file is refused PCI-ALIAS-REFUSED', () => {
  SOURCE_REFUSED(sourceFixture('copies-calibration', { skip: ['.claude-plugin/marketplace.json'] }));
});

test('S4x both identity files present but not tracked by Git are refused PCI-ALIAS-REFUSED', () => {
  SOURCE_REFUSED(sourceFixture('untracked-copy', { track: false }));
});

test('S4x both identity files in a directory that is not a Git repository are refused PCI-ALIAS-REFUSED', () => {
  const root = fixture('not-a-repository');
  for (const segments of [NEUTRAL, LEGACY, MARKETPLACE]) {
    mkdirSync(join(root, ...segments.slice(0, -1)), { recursive: true });
    copyFileSync(realFile(segments === LEGACY ? NEUTRAL : segments), join(root, ...segments));
  }
  SOURCE_REFUSED(root);
});

test('S4x a marketplace that deviates from the closed identity is refused PCI-ALIAS-REFUSED', () => {
  const variants = {
    'other name': (m) => ({ ...m, name: 'someone-else' }),
    'other owner': (m) => ({ ...m, owner: { name: 'someone-else' } }),
    'extra plugin': (m) => ({ ...m, plugins: [...m.plugins, { ...m.plugins[0], name: 'second' }] }),
    'other plugin name': (m) => ({ ...m, plugins: [{ ...m.plugins[0], name: 'not-pipeline-core' }] }),
    'other plugin source': (m) => ({ ...m, plugins: [{ ...m.plugins[0], source: './elsewhere' }] }),
  };
  for (const [label, change] of Object.entries(variants)) {
    const edited = JSON.stringify(change(realMarketplace()));
    SOURCE_REFUSED(sourceFixture('variant', { edit: { '.claude-plugin/marketplace.json': edited } }), label);
  }
});

test('S4x a stored alias other than agent-pipeline is refused even in the source-checkout shape', () => {
  const root = sourceFixture('other-alias', {
    edit: { 'project/pipeline.json': '{"project":"my-alias"}', '.claude/pipeline.json': '{"project":"my-alias"}' },
  });
  SOURCE_REFUSED(root);
});

test('S4x root-derived metadata keeps PCI-NAME-MISMATCH in the source-checkout shape', () => {
  const root = sourceFixture('metadata-root');
  const text = JSON.stringify({ project: 'agent-pipeline', projectIdentity: meta(root) });
  calib(root, text, NEUTRAL);
  calib(root, text, LEGACY);
  assert.equal(read(root).code, 'PCI-NAME-MISMATCH');
});

test('S4x a symbolic-link marketplace file is refused PCI-ALIAS-REFUSED',
  { skip: process.platform === 'win32' ? HOST_LIMITATION : false }, () => {
    const root = sourceFixture('linked-marketplace', { skip: ['.claude-plugin/marketplace.json'] });
    mkdirSync(join(root, '.claude-plugin'), { recursive: true });
    symlinkSync(realFile(MARKETPLACE), join(root, ...MARKETPLACE), 'file');
    git(root, 'add', '-A');
    SOURCE_REFUSED(root);
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

// QG-04 fixture restatement (bounded): PO decision 2026-10-23 "S4 follows R1". The fixture
// stored the alias "alpha" under a differently named root and relied on alias acceptance
// only incidentally; the case's intent (byte-equal tiers do not drift) is unchanged, so
// the fixture root is now named like its stored project.
test('S6 byte-equal neutral and legacy calibrations do not drift', () => {
  const root = fixture('alpha');
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
