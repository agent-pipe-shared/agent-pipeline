// Walk authoring helper (evidence tooling, not part of any commit). Runs inside the temp repository:
// authors the generated PRD/Spec drafts the way the returned guidance asks (architecture block placeholders,
// product framing, one EARS criterion, traceability row) and reconciles the PRD cross-reference digest.
import fs from 'node:fs';
import crypto from 'node:crypto';

const dirs = fs.readdirSync('specs').filter((d) => d.startsWith('onboarding-'));
if (dirs.length !== 1) throw new Error('expected exactly one onboarding feature dir, got: ' + dirs.join(','));
const id = dirs[0];
const prdPath = `specs/${id}/prd_${id}.md`;
const specPath = `specs/${id}/spec.md`;

function must(text, needle, what) {
  if (!text.includes(needle)) throw new Error('anchor missing: ' + what);
}

let spec = fs.readFileSync(specPath, 'utf8');
const acOld = '- AC-01: WHEN <trigger>, the system SHALL <observable result>.';
must(spec, acOld, 'AC-01 placeholder line');
spec = spec.replace(acOld, '- AC-01: WHEN a file path is given, the system SHALL print the number of whitespace-separated words in that file.');
const rowRe = /^\| REPLACE: input reference \|.*$/m;
if (!rowRe.test(spec)) throw new Error('anchor missing: traceability REPLACE row');
spec = spec.replace(rowRe, '| Captured goal: a CLI that counts words (chunk 1) | The CLI prints the word count of the given file | AC-01 | tests/word-count.test.mjs: counts whitespace-separated words |');
fs.writeFileSync(specPath, spec);
const specSha = crypto.createHash('sha256').update(fs.readFileSync(specPath)).digest('hex');

let prd = fs.readFileSync(prdPath, 'utf8');
prd = prd.split('\n').filter((l) => !l.startsWith('<!-- DRAFT TEMPLATE')).join('\n');
const swaps = [
  ['REPLACE: why the proposed module boundaries fit this design', 'One application module owns the whole word counter; the tool is small enough that a single boundary is the honest fit.'],
  ['REPLACE: application responsibility', 'Read a text file and print its whitespace-separated word count.'],
  ['REPLACE: excluded responsibility', 'No network access, no persistence and no text analysis beyond counting words.'],
  ['REPLACE: project fitness profile', 'word-counter-cli'],
];
for (const [from, to] of swaps) {
  must(prd, from, from);
  prd = prd.replace(from, to);
}
const fence = '```pipeline-architecture-design';
must(prd, fence, 'architecture fence');
const framing = [
  '## What',
  '',
  'A command-line tool that prints the number of whitespace-separated words in a text file.',
  '',
  '## Why',
  '',
  'The captured goal is a CLI that counts words; a minimal but real design package lets the walk measure the whole design chain.',
  '',
  '## Scope',
  '',
  'One executable, one file path argument, the count printed to standard output, a non-zero exit code when the file cannot be read.',
  '',
  '## Non-goals',
  '',
  'Counting characters or lines, reading standard input, Unicode word segmentation, packaging and distribution.',
  '',
  '## Risks',
  '',
  'Punctuation and Unicode edge cases are not handled; any run of whitespace is one separator.',
  '',
  '## Alternatives',
  '',
  'The existing wc command was rejected: the goal is an owned, tested tool, not a shell alias.',
  '',
  '## DoD',
  '',
  'AC-01 holds, a test covers it, and the configured Verify command passes.',
  '',
  '',
].join('\n');
prd = prd.replace(fence, framing + fence);
const markerRe = /<!-- technical-spec-sha256: [0-9a-f]{64} -->/;
if (!markerRe.test(prd)) throw new Error('anchor missing: technical-spec-sha256 marker');
prd = prd.replace(markerRe, `<!-- technical-spec-sha256: ${specSha} -->`);
fs.writeFileSync(prdPath, prd);
const prdSha = crypto.createHash('sha256').update(fs.readFileSync(prdPath)).digest('hex');
console.log(JSON.stringify({ featureId: id, prdPath, specPath, specSha256: specSha, prdSha256: prdSha, prdBytes: prd.length, specBytes: spec.length }, null, 2));
