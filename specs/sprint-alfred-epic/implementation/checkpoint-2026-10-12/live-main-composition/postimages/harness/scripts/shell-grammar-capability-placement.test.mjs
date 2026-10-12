// SPDX-License-Identifier: SUL-1.0
// NEW RGGRAM placement fixture. It does not identify or repair the historical unnamed fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { discoverSurfaces } from './check-product-capability-inventory.mjs';
import { registerTestCaseCompletion } from '../../plugins/pipeline-core/lib/test-case-completion.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const grammar = 'plugins/pipeline-core/lib/guard/shell-grammar.mjs';
const splitTest = 'plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs';
const closureTest = 'plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs';
const ownTest = 'harness/scripts/shell-grammar-capability-placement.test.mjs';
const suiteName = 'shell-grammar-capability-placement-tests';
const json = path => JSON.parse(readFileSync(new URL(path, new URL('../../', import.meta.url)), 'utf8'));
function fixture() {
  return { inventory: json('docs/product-capability-inventory.json'),
    split: json('harness/guard-split-map.json'),
    registry: json('harness/verify-suites.json'),
    map: readFileSync(new URL('../../architecture/map/pipeline-core.md', import.meta.url), 'utf8') };
}
function assertPlacement(value) {
  const owners = value.inventory.capabilities.filter(capability => capability.productionEvidence.includes(grammar));
  assert.equal(owners.length, 1, 'RGGRAM has one concrete capability evidence placement');
  assert.equal(owners[0].id, 'claude-hook-safety', 'shared guard library is placed with command/write-path guardrails');
  for (const path of [splitTest, closureTest, ownTest]) assert(owners[0].testEvidence.includes(path), `missing placement test evidence: ${path}`);
  const front = value.map.split('\n---\n')[0];
  const contracts = front.split('publicContracts:\n')[1]?.split('\nallowedDependencies:')[0] ?? '';
  const checks = front.split('verificationEntryPoints:\n')[1]?.split('\nadrReferences:')[0] ?? '';
  assert(contracts.split('\n').includes(`  - ${grammar}`), 'grammar is a declared pipeline-core contract');
  for (const path of [splitTest, closureTest]) assert(checks.split('\n').includes(`  - ${path}`), 'module evidence maps to existing real verification entry');
  assert.equal(value.split.moduleDir, 'plugins/pipeline-core/lib/guard');
  assert.equal(value.split.modules['shell-grammar'].layer, 1, 'existing measured layer1 is conserved');
  for (const name of ['isReadOnlyDiagnosticCommand', 'isReadOnlySimpleWords', 'simpleWords']) assert.equal(value.split.declarations[name], 'shell-grammar', 'source fixture must point to the real grammar owner');
  const suite = value.registry.suites.filter(row => row.name === suiteName);
  assert.equal(suite.length, 1, 'placement fixture is registered exactly once');
  assert.equal(suite[0].file, ownTest);
  assert.deepEqual(suite[0].caseCompletion.caseIds, ['RGCP001', 'RGCP002', 'RGCP003', 'RGCP004']);
}
const cases = [
  { id: 'RGCP001', name: 'actual current capability and architecture/split maps place the kernel grammar without an extra capability', run() { assertPlacement(fixture()); } },
  { id: 'RGCP002', name: 'missing or duplicate production placement is detected even when broad hook evidence remains', run() {
    const missing = fixture(); missing.inventory.capabilities.find(c => c.id === 'claude-hook-safety').productionEvidence = missing.inventory.capabilities.find(c => c.id === 'claude-hook-safety').productionEvidence.filter(path => path !== grammar);
    assert.throws(() => assertPlacement(missing), /one concrete capability/);
    const duplicate = fixture(); duplicate.inventory.capabilities.find(c => c.id === 'deterministic-verification').productionEvidence.push(grammar);
    assert.throws(() => assertPlacement(duplicate), /one concrete capability/);
  } },
  { id: 'RGCP003', name: 'actual product surface discovery does not fabricate a library guard surface and the new suite has one real assignment', run() {
    const value = fixture(); const discovered = new Set(discoverSurfaces(root).map(row => row.surfaceId));
    const invented = `guard:${grammar}:shell-grammar`;
    assert.equal(discovered.has(invented), false, 'library evidence is not a new discoverable hook');
    assert(value.inventory.capabilities.every(c => !c.surfaceIds.includes(invented)), 'no capability declares a fake library surface');
    const surface = `verify-phase:harness/scripts/verify.mjs:${suiteName}`;
    assert(discovered.has(surface), 'actual discoverSurfaces reads the registered suite');
    assert.deepEqual(value.inventory.capabilities.filter(c => c.surfaceIds.includes(surface)).map(c => c.id), ['deterministic-verification']);
    const corrupted = structuredClone(value.inventory); corrupted.capabilities.find(c => c.id === 'claude-hook-safety').surfaceIds.push(invented);
    assert(corrupted.capabilities.some(c => c.surfaceIds.some(id => !discovered.has(id))), 'unknown library assignment is not registered evidence');
  } },
  { id: 'RGCP004', name: 'wrong source owner, missing module contract and mismatched registered fixture fail independently', run() {
    const source = fixture(); source.split.declarations.isReadOnlyDiagnosticCommand = 'read-scope';
    assert.throws(() => assertPlacement(source), /real grammar owner/);
    const contract = fixture(); contract.map = contract.map.replace(`  - ${grammar}\n`, '');
    assert.throws(() => assertPlacement(contract), /declared pipeline-core contract/);
    const registered = fixture(); registered.registry.suites.find(s => s.name === suiteName).file = 'harness/scripts/foreign-placement.test.mjs';
    assert.throws(() => assertPlacement(registered));
  } },
];
registerTestCaseCompletion({ cases, fd: 3, maxBytes: 32768 });
