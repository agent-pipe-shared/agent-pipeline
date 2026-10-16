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
