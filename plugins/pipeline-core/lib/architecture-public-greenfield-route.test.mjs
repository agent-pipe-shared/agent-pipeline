// SPDX-License-Identifier: SUL-1.0
// Public consumer qualification with the Source aggregate approval and State writer.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as fixture from './architecture-prospective-materialization.fixture.mjs';
import { inspectArchitectureEntryReadiness } from './architecture-entry-readiness.mjs';
import { inspectArchitectureDesign } from './architecture-design.mjs';

const readiness = f => inspectArchitectureEntryReadiness({ rootDir: f.dir, taskScope: fixture.PLAN,
  deps: { readCheckpointArchitectureDebt: () => ({ ok: true, debt: [], resolvedDebt: [] }) } });
const actionIsMaterializer = value => value?.kind === 'command'
  && value.argv?.at(-1) === 'materialize-architecture'
  && value.expected?.schema === 'pipeline.architecture-design-materialization.v1';

test('G27-PUBLIC-001 approved original Greenfield package routes through public readiness and State materializer', () => {
  const f = fixture.makeAggregateFixture({ stage: 'approved-unmaterialized' });
  const before = readiness(f);
  assert.equal(before.status, 'blocked', JSON.stringify(before));
  assert.equal(before.code, 'ARCHITECTURE-MATERIALIZATION-REQUIRED');
  assert(actionIsMaterializer(before.nextAction), JSON.stringify(before.nextAction));
  assert.equal(before.nextAction.mutation, true);
  assert.equal(before.nextAction.requiresConfirmation, false);
  const publicInspect = fixture.invoke(f, ['inspect']);
  assert.equal(publicInspect.status, 0, publicInspect.text);
  const projectedAction = JSON.parse(publicInspect.text).nextAction;
  assert(actionIsMaterializer(projectedAction), JSON.stringify(projectedAction));
  assert.equal(existsSync(join(f.dir, 'architecture/design-materialization.json')), false);
  const executed = fixture.invoke(f, before.nextAction.argv.slice(1));
  assert.equal(executed.status, 0, executed.text);
  assert.equal(JSON.parse(executed.text).status, 'materialized');
  const design = inspectArchitectureDesign(f.dir);
  assert.equal(design.ok, true, JSON.stringify(design));
  assert.equal(design.status, 'materialized');
  assert.equal(readiness(f).artifacts.map.status, 'current');
  assert(existsSync(join(f.dir, 'architecture/design-materialization.json')));
  assert(existsSync(join(f.dir, f.outputPaths[0])));
});

test('G27-PUBLIC-002 presented but unapproved package cannot route to materialization or write outputs', () => {
  const f = fixture.makeAggregateFixture({ stage: 'presented' });
  const before = readiness(f);
  assert.equal(before.status, 'blocked');
  assert.equal(actionIsMaterializer(before.nextAction), false);
  const invoked = fixture.invoke(f, ['materialize-architecture']);
  assert.notEqual(invoked.status, 0);
  assert.equal(existsSync(join(f.dir, 'architecture/design-materialization.json')), false);
  assert(f.outputPaths.every(path => !existsSync(join(f.dir, path))));
});

test('G27-PUBLIC-003 approved package with stale PRD bytes refuses materialization and leaves scaffold intact', () => {
  const f = fixture.makeAggregateFixture({ stage: 'approved-unmaterialized' });
  writeFileSync(join(f.dir, fixture.PLAN), Buffer.concat([readFileSync(join(f.dir, fixture.PLAN)), Buffer.from('\nDrift.\n')]));
  const before = readiness(f);
  assert.equal(before.status, 'blocked');
  assert.equal(actionIsMaterializer(before.nextAction), false);
  assert.notEqual(fixture.invoke(f, ['materialize-architecture']).status, 0);
  assert.equal(existsSync(join(f.dir, 'architecture/design-materialization.json')), false);
  assert(f.outputPaths.every(path => !existsSync(join(f.dir, path))));
});

test('G27-PUBLIC-004 existing estate keeps ADR only course and does not synthesize a Greenfield map', () => {
  const f = fixture.makeAggregateFixture({ stage: 'approved-unmaterialized' });
  for (const path of ['architecture/map/index.md', 'architecture/map/inventory.json']) unlinkSync(join(f.dir, path));
  const design = inspectArchitectureDesign(f.dir);
  assert.equal(design.materializationKind, 'prospective-adr-only');
  const before = readiness(f);
  assert.equal(before.status, 'blocked');
  assert(actionIsMaterializer(before.nextAction));
  const executed = fixture.invoke(f, ['materialize-architecture']);
  assert.equal(executed.status, 0, executed.text);
  assert.equal(inspectArchitectureDesign(f.dir).status, 'not-required');
  assert.equal(existsSync(join(f.dir, 'architecture/design-materialization.json')), false);
  assert.equal(existsSync(join(f.dir, 'architecture/map/index.md')), false);
});

test('G27-PUBLIC-005 malformed prospective package is refused by the public route without output', () => {
  const f = fixture.makeAggregateFixture({ stage: 'approved-unmaterialized' });
  const path = f.descriptor.prospectiveArchitecture.path;
  writeFileSync(join(f.dir, path), '{"schema":"pipeline.architecture-prospective-materialization.v1","decisions":"invalid"}\n');
  const before = readiness(f);
  assert.equal(before.status, 'blocked');
  assert.equal(actionIsMaterializer(before.nextAction), false);
  assert.notEqual(fixture.invoke(f, ['materialize-architecture']).status, 0);
  assert.equal(existsSync(join(f.dir, 'architecture/design-materialization.json')), false);
});

test('G27-PUBLIC-006 rebinding approved State to a different physical root is refused', () => {
  const source = fixture.makeAggregateFixture({ stage: 'approved-unmaterialized' });
  const target = fixture.makeAggregateFixture({ stage: 'approved-unmaterialized' });
  writeFileSync(join(target.dir, fixture.stateRelative(target)), fixture.rawState(source));
  const before = readiness(target);
  assert.equal(before.status, 'blocked');
  assert.equal(actionIsMaterializer(before.nextAction), false);
  assert.notEqual(fixture.invoke(target, ['materialize-architecture']).status, 0);
  assert.equal(existsSync(join(target.dir, 'architecture/design-materialization.json')), false);
});

test('G27-PUBLIC-007 wrong source root has no Greenfield materialization authority', () => {
  const f = fixture.makeAggregateFixture({ stage: 'approved-unmaterialized' });
  const wrongRoot = join(f.dir, 'scratch', 'wrong-root');
  const result = inspectArchitectureEntryReadiness({ rootDir: wrongRoot, taskScope: fixture.PLAN });
  assert.equal(result.status, 'blocked');
  assert.equal(actionIsMaterializer(result.nextAction), false);
  assert.equal(existsSync(join(f.dir, 'architecture/design-materialization.json')), false);
});
