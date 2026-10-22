// SPDX-License-Identifier: SUL-1.0
// Pin (AC-148, pipeline.denial-names-a-diagnosis-it-refuses): every recovery verb a design-advisory
// denial names must be admitted by the shell lane in the state that produced that denial.
// Verbs are captured from the real emitter text (designAdvisoryRemediation); each command is spelled
// exactly as the catalogue's own definition (sanctioned-args-scripts.mjs) requires.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const { designAdvisoryRemediation } = await import(new URL('../guard-devplan-policy.mjs', import.meta.url));
const { devPlanShellRefusalHit } = await import(new URL('../guard/devplan-shell-lane.mjs', import.meta.url));
const { isSanctionedLifecycleCommand } = await import(new URL('../guard/command-catalogue.mjs', import.meta.url));
const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/[\\/]$/u, '');
const script = fileURLToPath(new URL('../../scripts/pipeline-state.mjs', import.meta.url));
const CODES = ['DAA-DESIGN-APPROVAL-BINDING-DRIFT', 'DAA-DESIGN-SOURCE-DRIFT', 'DAA-PUBLIC-UNAVAILABLE', 'DAA-PO-APPROVAL-TRUST-ANCHOR-SETUP'];
const VERBS = ['reopen-design', 'present-plan', 'approve-plan', 'set-phase'];
const blockedDraft = { devPlanGateVerdictFn: () => ({ verdict: 'block', reason: 'fixture', lifecycleStatus: 'implementing' }) };

// Fixture: an existing single-link regular review receipt under scratch/ (relative path, as the catalogue demands).
const receiptRel = 'scratch/denial-diagnosis-pin-receipt.json';
mkdirSync(join(root, 'scratch'), { recursive: true });
writeFileSync(join(root, receiptRel), '{}');
const SHAPES = {
  'reopen-design': '--by tester',
  'present-plan': `--by tester --review-receipt ${receiptRel}`,
  'approve-plan': '--by tester',
  'set-phase': '--phase implementation',
};
const build = (verb, tail = SHAPES[verb]) => `node "${script}" ${verb} ${tail}`.trim();
try {
  let namedTotal = 0;
  const seen = new Set();
  for (const code of CODES) {
    const text = designAdvisoryRemediation(code);
    const named = VERBS.filter(verb => text.includes(verb));
    assert.ok(named.length > 0, `${code}: remediation names no recovery verb`);
    for (const verb of named) {
      namedTotal += 1; seen.add(verb);
      const command = build(verb);
      const sanctioned = isSanctionedLifecycleCommand(command, root, {});
      const hit = devPlanShellRefusalHit(command, root, blockedDraft);
      assert.ok(sanctioned === true && hit === null,
        `${code}: named command "${verb}" is refused in the state that produced the denial (sanctioned=${sanctioned}, lane=${hit?.lane ?? 'none'})`);
    }
  }
  assert.ok(namedTotal >= CODES.length);
  assert.ok(seen.has('reopen-design'), 'reopen-design must be named by at least one denial');
  // Meaningful-RED mirror: a wrongly spelled named command (missing receipt flag value) is NOT admitted,
  // so the admission assertion above discriminates spelling rather than passing vacuously.
  assert.equal(isSanctionedLifecycleCommand(build('present-plan', '--by tester --review-receipt scratch/does-not-exist.json'), root, {}), false);
  assert.equal(isSanctionedLifecycleCommand(build('set-phase', '--by tester'), root, {}), false);
  console.log(`ok: ${namedTotal} named recovery commands admitted across ${CODES.length} denial codes (verbs: ${[...seen].join(',')})`);
} finally {
  rmSync(join(root, receiptRel), { force: true });
}

// --- AC-148 correction (Critic C6b F2), added 2026-10-16 ---
const { test } = await import('node:test');
const { readFileSync } = await import('node:fs');
const policySource = readFileSync(fileURLToPath(new URL('../guard-devplan-policy.mjs', import.meta.url)), 'utf8');
// Every denial code the emitter file knows (quoted DAA-/DWP- literals), plus an unknown code (fallthrough branch)
// and DLR035 (a code with no dedicated emitter: it must render the generic text, never a refused command).
const ALL_CODES = [...new Set([...policySource.matchAll(/"((?:DAA|DWP)-[A-Z0-9-]+)"/gu)].map(m => m[1]).concat(['DAA-UNKNOWN-CODE', 'DLR035']))];
const inspectCommand = `node "${fileURLToPath(new URL('../../scripts/design-advisory-admission.mjs', import.meta.url))}" inspect --repo-root ${root} --feature f --plan p --spec s`;
const refusedNames = text => /design-advisory-admission|\binspect\b|\.mjs\b|\bnode\b/u.test(text);

test('headline case: the diagnosis command the original defect named is refused, so no rendered denial may name it', () => {
  // Precondition: under the denial-producing state the guard really refuses it (opaque-script-execution).
  const hit = devPlanShellRefusalHit(inspectCommand, root, blockedDraft);
  assert.equal(hit?.lane, 'opaque-script-execution');
  assert.equal(isSanctionedLifecycleCommand(inspectCommand, root, {}), false);
  // Consequence: no emitted denial (every code) names that command or any raw script invocation.
  assert.ok(ALL_CODES.length >= 8, `expected the emitter's full code set, got ${ALL_CODES.length}`);
  for (const code of ALL_CODES) {
    const text = designAdvisoryRemediation(code);
    assert.ok(!refusedNames(text), `${code}: rendered denial names a refused script command`);
  }
  assert.ok(!refusedNames(designAdvisoryRemediation()), 'undefined code: rendered denial names a refused script command');
});
test('DLR035 receipt: a DLR035 denial has no dedicated emitter and names only admitted recovery verbs', () => {
  const text = designAdvisoryRemediation('DLR035');
  assert.ok(text.includes('(DLR035)'), 'DLR035 receipt is rendered in the denial header');
  assert.ok(!refusedNames(text));
  for (const verb of VERBS.filter(v => text.includes(v))) {
    const command = build(verb);
    mkdirSync(join(root, 'scratch'), { recursive: true });
    writeFileSync(join(root, receiptRel), '{}');
    try {
      assert.equal(isSanctionedLifecycleCommand(command, root, {}), true, `DLR035: named "${verb}" not admitted`);
      assert.equal(devPlanShellRefusalHit(command, root, blockedDraft), null, `DLR035: named "${verb}" refused by lane`);
    } finally { rmSync(join(root, receiptRel), { force: true }); }
  }
});
test('all denial codes: every recovery verb a rendered denial names is admitted in the producing state', () => {
  mkdirSync(join(root, 'scratch'), { recursive: true });
  writeFileSync(join(root, receiptRel), '{}');
  try {
    let named = 0;
    for (const code of ALL_CODES) {
      for (const verb of VERBS.filter(v => designAdvisoryRemediation(code).includes(v))) {
        named += 1;
        const command = build(verb);
        assert.equal(isSanctionedLifecycleCommand(command, root, {}), true, `${code}: "${verb}" not sanctioned`);
        assert.equal(devPlanShellRefusalHit(command, root, blockedDraft), null, `${code}: "${verb}" refused by lane`);
      }
    }
    assert.ok(named >= ALL_CODES.length, 'every code must name at least one recovery verb');
  } finally { rmSync(join(root, receiptRel), { force: true }); }
});
test('exact rendered recovery text: the denial spelling is observed against the guard, not a hand-built spelling', () => {
  const text = designAdvisoryRemediation('DAA-DESIGN-SOURCE-DRIFT');
  const rendered = /Run (reopen-design --by <human attribution>)/u.exec(text)?.[1];
  assert.equal(rendered, 'reopen-design --by <human attribution>', 'denial text no longer renders the pinned recovery spelling');
  // The spelling exactly as rendered, bare and with the sanctioned script prefix.
  const bare = isSanctionedLifecycleCommand(rendered, root, {});
  const prefixed = isSanctionedLifecycleCommand(`node "${script}" ${rendered}`, root, {});
  console.log(`observed: rendered bare sanctioned=${bare}; prefixed sanctioned=${prefixed}`);
  // Observed value: the placeholder text is not runnable, so the guard refuses the literal spelling.
  assert.equal(bare, false);
  assert.equal(prefixed, false);
});

// --- Extension (2026-10-22): every OTHER guard denial that names a command ---
// The cases above cover the design-advisory emitter. These cover the remaining denial texts in hooks/ and lib/guard/ that print a
// "Run ..." style command, found by a source scan so that a NEW denial naming a command fails the inventory until it is classified.
// Cases marked `todo` pin a defect that needs a protected guard file; the exact fix is a JSON patch for the operator and the
// case turns green when it is applied (it is then to be un-marked). Reported as patch h1-patch-01 (not a tracked file).
const pluginDir = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/u, '');
const NAMED_COMMAND_LINE = /(?:Run exactly:|[Tt]hen run:|\bRun:|\bRun `|\brun `|\bRun \w+ \w+:)\s*(?:node\b|["`]?[\w.${}/-]+\.mjs)|\buse plugins\/pipeline-core\/scripts\/[\w-]+\.mjs/u;
const { readdirSync } = await import('node:fs');
function namedCommandHits() {
  const hits = [];
  for (const rel of ['hooks', 'lib/guard']) {
    const dir = join(pluginDir, ...rel.split('/'));
    for (const name of readdirSync(dir).filter(n => n.endsWith('.mjs') && !n.endsWith('.test.mjs'))) {
      readFileSync(join(dir, name), 'utf8').split('\n').forEach((line) => {
        if (/^\s*(\/\/|\*|\/\*)/u.test(line)) return;
        const match = NAMED_COMMAND_LINE.exec(line);
        if (match) hits.push(`${rel}/${name} :: ${match[0]}`);
      });
    }
  }
  return hits.sort();
}
const buildPushInit = async (options) => {
  const { buildPushInitArgv } = await import(new URL('../../scripts/push-init.mjs', import.meta.url));
  return buildPushInitArgv({ root, by: 'tester', remote: 'origin', destination: 'refs/heads/feat-x', ...options });
};
const pushInitCommand = (argv) => `node "${join(pluginDir, 'scripts', 'push-init.mjs')}" ${argv.join(' ')}`;

test('inventory: the denial texts that name a command are exactly the classified ones', () => {
  assert.deepEqual(namedCommandHits(), [
    'hooks/guard-git.mjs :: then run: node',
    'hooks/guard-push.mjs :: Run: push-init.mjs',
    'lib/guard/bootstrap-receipt.mjs :: Run exactly: node',
    'lib/guard/dispatch-record-lane.mjs :: use plugins/pipeline-core/scripts/capture-evidence.mjs',
  ], 'a denial that names a command is new or was removed: classify it in this file (admitted, or a todo with its patch)');
});

test('GUARD-BOOTSTRAP-RECEIPT-MISSING: the named preflight command is sanctioned and not lane-refused in the blocked state', async () => {
  const { START_PREFLIGHT_SCRIPT } = await import(new URL('../guard/constants.mjs', import.meta.url));
  const source = readFileSync(fileURLToPath(new URL('../guard/bootstrap-receipt.mjs', import.meta.url)), 'utf8');
  assert.ok(source.includes('Run exactly: node "${START_PREFLIGHT_SCRIPT}"'), 'the denial no longer names the preflight script as pinned');
  const command = `node "${START_PREFLIGHT_SCRIPT}"`;
  assert.equal(isSanctionedLifecycleCommand(command, root, {}), true);
  assert.equal(devPlanShellRefusalHit(command, root, blockedDraft), null);
});

test('guard-push checkpoint denial: control, the default push-init argv is sanctioned', async () => {
  assert.equal(isSanctionedLifecycleCommand(pushInitCommand(await buildPushInit({})), root, {}), true);
  assert.equal(isSanctionedLifecycleCommand(pushInitCommand(await buildPushInit({ base: 'main' })), root, {}), true);
});

test('guard-push checkpoint denial: the argv push-init emits for --checkpoint is sanctioned by the shell lane',
  { todo: 'needs a protected guard file: sanctionedPushInitArgs() does not admit --checkpoint/--candidate/--record-ref (patch h1-patch-01)' },
  async () => {
    const argv = await buildPushInit({ checkpoint: true });
    assert.equal(isSanctionedLifecycleCommand(pushInitCommand(argv), root, {}), true, `refused: ${argv.join(' ')}`);
    assert.equal(devPlanShellRefusalHit(pushInitCommand(argv), root, blockedDraft), null);
  });

test('guard-push checkpoint denial: the text names a complete, runnable push-init invocation',
  { todo: 'needs a protected guard file: guard-push.mjs prints the bare "push-init.mjs --checkpoint" (patch h1-patch-01)' },
  async () => {
    const source = readFileSync(join(pluginDir, 'hooks', 'guard-push.mjs'), 'utf8');
    const named = /"Run: (node <plugin-root>\/scripts\/push-init\.mjs --root <project-dir> --by <name> --remote <remote> --destination refs\/heads\/<branch> --checkpoint) prints/u.exec(source)?.[1];
    assert.ok(named, 'the checkpoint denial must name the full invocation, not only the script name');
    const concrete = named.replace('<plugin-root>', pluginDir).replace('<project-dir>', root).replace('<name>', 'tester')
      .replace('<remote>', 'origin').replace('<branch>', 'feat-x');
    assert.equal(isSanctionedLifecycleCommand(concrete, root, {}), true, `named command refused: ${concrete}`);
  });

test('observed limit: the commands GG-22 and the dispatch-record lane name are refused only while the lifecycle gate blocks', () => {
  // Neither script is in the sanctioned catalogue; both are admitted in the states that produce those denials (a commit and a
  // dispatch-record write, which need an approved plan) because the opaque-script lane only fires on a blocking gate verdict.
  const allow = { devPlanGateVerdictFn: () => ({ verdict: 'allow', reason: 'fixture' }) };
  for (const command of [
    'node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate',
    `node "${join(pluginDir, 'scripts', 'capture-evidence.mjs')}" --out scratch/evidence/x.txt --label x -- node --version`,
  ]) {
    assert.equal(isSanctionedLifecycleCommand(command, root, {}), false, `not sanctioned: ${command}`);
    assert.equal(devPlanShellRefusalHit(command, root, blockedDraft)?.lane, 'opaque-script-execution');
    assert.equal(devPlanShellRefusalHit(command, root, allow), null);
  }
});
