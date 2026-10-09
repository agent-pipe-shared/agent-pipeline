// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import { linkSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanctionedPipelineStateArgs } from '../lib/guard/sanctioned-args-scripts.mjs';
import { isSanctionedLifecycleCommand } from '../lib/guard/command-catalogue.mjs';
import { registerTestCaseCompletion } from '../lib/test-case-completion.mjs';
import { isDirectInvocation } from '../lib/entrypoint.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratchRoot = resolve(pluginRoot, '../../scratch');
const stateScript = join(pluginRoot, 'scripts/pipeline-state.mjs');
const request = `scratch/design-approval-request-${'a'.repeat(64)}.json`;
const receipt1 = 'reviews/round-1.json';
const receipt2 = 'reviews/round-2.json';
const present = (...receipts) => ['present-plan', '--by', 'Public reviewer', ...receipts.flatMap(path => ['--review-receipt', path])];
const approve = path => ['approve-plan', '--by', 'Public reviewer', '--design-approval-request', path];
const quote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;

function fixture(run) {
  mkdirSync(scratchRoot, { recursive: true });
  const box = mkdtempSync(join(scratchRoot, 'design-args-public-'));
  const root = join(box, 'project');
  const outside = join(box, 'outside');
  mkdirSync(join(root, 'reviews'), { recursive: true });
  mkdirSync(join(root, 'scratch'), { recursive: true });
  mkdirSync(outside);
  for (const path of [receipt1, receipt2, 'reviews/round-3.json', request]) writeFileSync(join(root, path), '{}\n');
  writeFileSync(join(outside, 'outside.json'), '{}\n');
  const stat = lstatSync(join(root, request));
  assert.equal(stat.isFile(), true, 'fixture request must be a regular file');
  assert.equal(stat.nlink, 1, 'fixture request must have one physical link');
  try { return run({ root, outside }); }
  finally { rmSync(box, { recursive: true, force: true }); }
}

function admission(args, root, expected) {
  const argv = Object.freeze([...args]);
  const before = [...argv];
  try {
    // Observe both actual policies before asserting, even when the parser is RED.
    const observed = [sanctionedPipelineStateArgs(argv, root),
      isSanctionedLifecycleCommand([process.execPath, stateScript, ...argv].map(quote).join(' '), root)];
    assert.deepEqual(observed, [expected, expected], `imported parser/catalogue policy for ${JSON.stringify(argv)}`);
  } finally { assert.deepEqual(argv, before, 'admission must leave frozen argv unchanged'); }
}

const cases = [
  { id: 'DAGA001', name: 'present admits one explicit existing review receipt', run: () => fixture(({ root }) => admission(present(receipt1), root, true)) },
  { id: 'DAGA002', name: 'present admits two distinct receipts and attribution at the UTF-8 bound', run: () => fixture(({ root }) => {
    const args = present(receipt1, receipt2); args[2] = 'é'.repeat(250);
    admission(args, root, true);
  }) },
  { id: 'DAGA003', name: 'mini presentation admits plain bounded attribution', run: () => fixture(({ root }) => admission(present(), root, true)) },
  { id: 'DAGA004', name: 'approve admits the exact physically contained regular Scratch request', run: () => fixture(({ root }) => admission(approve(request), root, true)) },
  { id: 'DAGA005', name: 'preserve existing inspect submit phase and approval branches', run: () => fixture(({ root }) => {
    const legacy = `scratch/design-workflow-approval-request-${'b'.repeat(64)}.json`;
    writeFileSync(join(root, legacy), '{}\n');
    for (const args of [['inspect'], ['submit-plan', '--by', 'Public reviewer', '--profile', 'mini'],
      ['set-phase', '--phase', 'design'], ['approve-plan', '--by', 'Public reviewer'],
      ['approve-plan', '--bootstrap-acknowledgement-receipt', `scratch/bootstrap-plan-acknowledgement-receipt-${'c'.repeat(64)}.json`],
      ['approve-plan', '--by', 'Public reviewer', '--design-workflow-approval-request', legacy]]) admission(args, root, true);
  }) },
  { id: 'DAGA006', name: 'reject third and duplicate review receipt paths', run: () => fixture(({ root }) => {
    for (const args of [present(receipt1, receipt2, 'reviews/round-3.json'), present(receipt1, receipt1)]) admission(args, root, false);
  }) },
  { id: 'DAGA007', name: 'reject missing duplicate blank oversize and flag-form attribution', run: () => fixture(({ root }) => {
    for (const base of [present(receipt1), approve(request)]) {
      admission([base[0], ...base.slice(3)], root, false);
      admission([...base, '--by', 'Second reviewer'], root, false);
      for (const by of ['', '   ', 'x'.repeat(501), 'é'.repeat(251), '--review-receipt']) {
        const args = [...base]; args[2] = by; admission(args, root, false);
      }
      admission([base[0], '--by=Public', ...base.slice(3)], root, false);
    }
  }) },
  { id: 'DAGA008', name: 'reject unknown duplicate request and spliced flag forms', run: () => fixture(({ root }) => {
    for (const base of [present(receipt1), approve(request)]) {
      for (const tail of [['--unknown', 'yes'], ['--root', root], ['unexpected']]) admission([...base, ...tail], root, false);
    }
    for (const args of [[...approve(request), '--design-approval-request', request],
      ['present-plan', '--by', 'Public reviewer', `--review-receipt=${receipt1}`],
      ['approve-plan', '--by', 'Public reviewer', `--design-approval-request=${request}`],
      ['present-plan', '--by', 'Public reviewer', '--review-receipt'],
      ['approve-plan', '--by', 'Public reviewer', '--design-approval-request']]) admission(args, root, false);
  }) },
  { id: 'DAGA009', name: 'reject unsafe absolute escaping non-JSON and missing receipt paths', run: () => fixture(({ root, outside }) => {
    for (const path of ['', join(root, receipt1), join(outside, 'outside.json'), '../outside/outside.json',
      'reviews/../reviews/round-1.json', './reviews/round-1.json', 'reviews//round-1.json',
      'reviews\\round-1.json', 'reviews/round-1.json\0', 'reviews/missing.json', 'reviews/round-1.txt', '--by']) admission(present(path), root, false);
  }) },
  { id: 'DAGA010', name: 'reject unsafe request paths and invalid digest basenames', run: () => fixture(({ root, outside }) => {
    const elsewhere = `reviews/design-approval-request-${'a'.repeat(64)}.json`;
    writeFileSync(join(root, elsewhere), '{}\n');
    for (const path of ['', join(root, request), join(outside, 'outside.json'), '../outside/outside.json',
      request.replace('scratch/', 'scratch/../scratch/'), request.replace('scratch/', './scratch/'),
      request.replace('scratch/', 'scratch//'), request.replace('/', '\\'), `${request}\0`, elsewhere,
      `scratch/design-approval-request-${'d'.repeat(64)}.json`,
      'scratch/design-approval-request-short.json', `scratch/design-approval-request-${'A'.repeat(64)}.json`,
      request.replace('.json', '.txt'), '--by']) admission(approve(path), root, false);
  }) },
  { id: 'DAGA011', name: 'reject receipt symlinks and physical parent escapes', run: () => fixture(({ root, outside }) => {
    symlinkSync(join(root, receipt1), join(root, 'reviews/local-link.json'));
    symlinkSync(join(outside, 'outside.json'), join(root, 'reviews/escape-link.json'));
    symlinkSync(outside, join(root, 'foreign-reviews'));
    for (const path of ['reviews/local-link.json', 'reviews/escape-link.json', 'foreign-reviews/outside.json']) admission(present(path), root, false);
  }) },
  { id: 'DAGA012', name: 'reject request symlinks parent escape directory and multiple links', run: () => fixture(({ root, outside }) => {
    const digestPath = letter => `scratch/design-approval-request-${letter.repeat(64)}.json`;
    symlinkSync(join(root, request), join(root, digestPath('b')));
    symlinkSync(join(outside, 'outside.json'), join(root, digestPath('c')));
    mkdirSync(join(root, digestPath('d')));
    linkSync(join(root, request), join(root, digestPath('e')));
    for (const path of [request, digestPath('b'), digestPath('c'), digestPath('d'), digestPath('e')]) admission(approve(path), root, false);
    // A correct lexical basename cannot rescue an aliased Scratch directory.
    rmSync(join(root, 'scratch'), { recursive: true });
    symlinkSync(outside, join(root, 'scratch'));
    writeFileSync(join(outside, request.slice('scratch/'.length)), '{}\n');
    admission(approve(request), root, false);
  }) },
  { id: 'DAGA013', name: 'new flags do not widen unrelated commands or foreign script admission', run: () => fixture(({ root }) => {
    for (const command of ['inspect', 'submit-plan', 'set-phase', 'unrelated']) {
      admission([command, '--by', 'Public reviewer', '--review-receipt', receipt1], root, false);
      admission([command, '--by', 'Public reviewer', '--design-approval-request', request], root, false);
    }
    const foreign = join(root, 'pipeline-state.mjs');
    assert.equal(isSanctionedLifecycleCommand([process.execPath, foreign, ...approve(request)].map(quote).join(' '), root), false);
  }) },
];

if (isDirectInvocation(import.meta.url)) registerTestCaseCompletion({ cases, fd: 3, maxBytes: 65536 });
