import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { publishEvidenceRun } from './publish-evidence-run.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'publish-evidence-run.mjs');
const sha = (data) => createHash('sha256').update(data).digest('hex');

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'g24-run-'));
  git(root, 'init');
  writeFileSync(join(root, 'source.html'), '<main>one</main>\n');
  writeFileSync(join(root, 'functional.json'), JSON.stringify({ schema: 'app.functional.v1', ok: true }) + '\n');
  writeFileSync(join(root, 'visual.json'), JSON.stringify({ schema: 'app.visual.v1', ok: true }) + '\n');
  git(root, 'add', 'source.html', 'functional.json', 'visual.json');
  git(root, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  return root;
}

function run(root, kind, extra = []) {
  const args = [script, '--output-root', 'evidence/scene', '--run-id', 'run-001', '--kind', kind,
    '--source', 'source.html', '--artifact', `${kind}.json`, '--schema', `app.${kind}.v1`,
    ...(kind === 'visual' ? ['--viewport', '800x600', '--device-scale-factor', '2'] : [])];
  for (let i = 0; i < extra.length; i += 2) {
    const at = args.indexOf(extra[i]);
    if (at < 0) args.push(extra[i], extra[i + 1]);
    else args[at + 1] = extra[i + 1];
  }
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
}

test('public producer retains distinct immutable functional and visual records with source hash, viewport and separate latest pointers', () => {
  const root = fixture();
  try {
    assert.equal(run(root, 'functional').status, 0);
    assert.equal(run(root, 'visual').status, 0);
    const records = ['functional', 'visual'].map((kind) => {
      const path = join(root, 'evidence/scene/runs/run-001', `${kind}.run.json`);
      const record = JSON.parse(readFileSync(path, 'utf8'));
      const pointer = JSON.parse(readFileSync(join(root, 'evidence/scene', `${kind}.latest.json`), 'utf8'));
      assert.equal(record.schema, 'pipeline.consumer-evidence-run.v1');
      assert.equal(record.kind, kind);
      assert.equal(record.source.sha256, sha(readFileSync(join(root, 'source.html'))));
      assert.equal(record.candidate.commit, git(root, 'rev-parse', 'HEAD'));
      assert.equal(pointer.recordSha256, sha(readFileSync(path)));
      assert.equal(pointer.recordPath, `runs/run-001/${kind}.run.json`);
      assert.deepEqual(JSON.parse(readFileSync(join(root, 'evidence/scene/runs/run-001', `${kind}.json`), 'utf8')),
        JSON.parse(readFileSync(join(root, `${kind}.json`), 'utf8')));
      return record;
    });
    assert.deepEqual(records[1].viewport, { width: 800, height: 600, deviceScaleFactor: 2 });
    assert.equal(records[0].viewport, null);
    assert.notEqual(records[0].artifact.sha256, records[1].artifact.sha256);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('existing run ID is immutable; same writer may advance only its own latest pointer to a new retained run', () => {
  const root = fixture();
  try {
    assert.equal(run(root, 'functional').status, 0);
    const priorPath = join(root, 'evidence/scene/runs/run-001/functional.run.json');
    const prior = readFileSync(priorPath);
    const repeat = run(root, 'functional');
    assert.equal(repeat.status, 1);
    assert.deepEqual(readFileSync(priorPath), prior);
    const second = run(root, 'functional', ['--run-id', 'run-002']);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(readFileSync(priorPath), prior);
    assert.equal(JSON.parse(readFileSync(join(root, 'evidence/scene/functional.latest.json'))).runId, 'run-002');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('foreign, malformed and symlinked latest outputs refuse without altering previous bytes or external target', () => {
  for (const prior of ['foreign', 'malformed', 'symlink']) {
    const root = fixture();
    try {
      const latest = join(root, 'evidence/scene/functional.latest.json');
      mkdirSync(dirname(latest), { recursive: true });
      const target = join(root, 'outside.json');
      writeFileSync(target, 'outside\n');
      if (prior === 'symlink') symlinkSync(target, latest);
      else writeFileSync(latest, prior === 'foreign' ? '{"schema":"foreign.v1"}\n' : '{partial');
      const before = lstatSync(latest).isSymbolicLink() ? readFileSync(target) : readFileSync(latest);
      assert.equal(run(root, 'functional').status, 1);
      assert.deepEqual(lstatSync(latest).isSymbolicLink() ? readFileSync(target) : readFileSync(latest), before);
      assert.equal(lstatSync(latest).isSymbolicLink(), prior === 'symlink');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('competing pointer lock and foreign schema input refuse without replacing latest or existing run', () => {
  const root = fixture();
  try {
    assert.equal(run(root, 'functional').status, 0);
    const latest = join(root, 'evidence/scene/functional.latest.json');
    const before = readFileSync(latest);
    writeFileSync(`${latest}.lock`, 'competitor\n');
    assert.equal(run(root, 'functional', ['--run-id', 'run-002']).status, 1);
    assert.deepEqual(readFileSync(latest), before);
    assert.equal(existsSync(join(root, 'evidence/scene/runs/run-002/functional.run.json')), false);
    rmSync(`${latest}.lock`);
    writeFileSync(join(root, 'functional.json'), '{"schema":"other.v1"}\n');
    assert.equal(run(root, 'functional', ['--run-id', 'run-002']).status, 1);
    assert.deepEqual(readFileSync(latest), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('path escape and symlinked source or artifact refuse without publication', () => {
  const root = fixture();
  try {
    assert.equal(run(root, 'functional', ['--output-root', '../outside']).status, 1);
    symlinkSync(join(root, 'source.html'), join(root, 'linked-source.html'));
    assert.equal(run(root, 'functional', ['--source', 'linked-source.html']).status, 1);
    symlinkSync(join(root, 'functional.json'), join(root, 'linked-artifact.json'));
    assert.equal(run(root, 'functional', ['--artifact', 'linked-artifact.json']).status, 1);
    assert.equal(existsSync(join(root, 'evidence/scene/functional.latest.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('partial existing run output and symlinked run output remain untouched on refusal', () => {
  for (const prior of ['partial', 'symlink']) {
    const root = fixture();
    try {
      const payload = join(root, 'evidence/scene/runs/run-001/functional.json');
      mkdirSync(dirname(payload), { recursive: true });
      const target = join(root, 'outside.json');
      writeFileSync(target, 'external\n');
      if (prior === 'symlink') symlinkSync(target, payload);
      else writeFileSync(payload, '{partial');
      const before = readFileSync(payload);
      assert.equal(run(root, 'functional').status, 1);
      assert.deepEqual(readFileSync(payload), before);
      assert.equal(existsSync(join(root, 'evidence/scene/functional.latest.json')), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('a failed functional result remains a real latest attempt; a broken prior pointer cannot be silently replaced', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'functional.json'), '{"schema":"app.functional.v1","ok":false}\n');
    assert.equal(run(root, 'functional').status, 0);
    const payload = JSON.parse(readFileSync(join(root, 'evidence/scene/runs/run-001/functional.json')));
    assert.equal(payload.ok, false);
    const latest = join(root, 'evidence/scene/functional.latest.json');
    const before = readFileSync(latest);
    rmSync(join(root, 'evidence/scene/runs/run-001/functional.run.json'));
    assert.equal(run(root, 'functional', ['--run-id', 'run-002']).status, 1);
    assert.deepEqual(readFileSync(latest), before);
    assert.equal(existsSync(join(root, 'evidence/scene/runs/run-002/functional.run.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a later functional run cannot repoint latest to a different JSON schema', () => {
  const root = fixture();
  try {
    assert.equal(run(root, 'functional').status, 0);
    const latest = join(root, 'evidence/scene/functional.latest.json');
    const before = readFileSync(latest);
    writeFileSync(join(root, 'functional.json'), '{"schema":"app.screenshot.v1","ok":true}\n');
    const collision = run(root, 'functional', ['--run-id', 'run-002', '--schema', 'app.screenshot.v1']);
    assert.equal(collision.status, 1, collision.stderr);
    assert.match(collision.stderr, /EVIDENCE-RUN-SCHEMA-COLLISION/);
    assert.deepEqual(readFileSync(latest), before);
    assert.equal(existsSync(join(root, 'evidence/scene/runs/run-002/functional.run.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a foreign latest pointer arriving after initial validation is preserved at the replacement boundary', () => {
  const root = fixture();
  try {
    assert.equal(run(root, 'functional').status, 0);
    const latest = join(root, 'evidence/scene/functional.latest.json');
    const foreign = Buffer.from('{"schema":"foreign.capture.v1"}\n');
    assert.throws(() => publishEvidenceRun({
      root, outputRoot: 'evidence/scene', runId: 'run-002', kind: 'functional',
      source: 'source.html', artifact: 'functional.json', schema: 'app.functional.v1',
      beforeLatestReplace: () => writeFileSync(latest, foreign),
    }), /EVIDENCE-RUN-POINTER-DRIFT/);
    assert.deepEqual(readFileSync(latest), foreign);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('even a valid same-schema latest preimage change is detected before replacement', () => {
  const root = fixture();
  try {
    assert.equal(run(root, 'functional').status, 0);
    const latest = join(root, 'evidence/scene/functional.latest.json');
    const changed = Buffer.from(JSON.stringify(JSON.parse(readFileSync(latest))) + '\n');
    assert.throws(() => publishEvidenceRun({
      root, outputRoot: 'evidence/scene', runId: 'run-002', kind: 'functional',
      source: 'source.html', artifact: 'functional.json', schema: 'app.functional.v1',
      beforeLatestReplace: () => writeFileSync(latest, changed),
    }), /EVIDENCE-RUN-POINTER-DRIFT/);
    assert.deepEqual(readFileSync(latest), changed);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('visual PNG bytes and required viewport are preserved by the public producer', () => {
  const root = fixture();
  try {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    writeFileSync(join(root, 'image.png'), png);
    const produced = run(root, 'visual', ['--artifact', 'image.png', '--schema', 'image/png']);
    assert.equal(produced.status, 0, produced.stderr);
    assert.deepEqual(readFileSync(join(root, 'evidence/scene/runs/run-001/visual.png')), png);
    const record = JSON.parse(readFileSync(join(root, 'evidence/scene/runs/run-001/visual.run.json')));
    assert.equal(record.artifact.sha256, sha(png));
    assert.equal(run(root, 'visual', ['--run-id', 'run-002', '--viewport', '0x600']).status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('public help states the explicit contract without a repository lookup or write', () => {
  const root = mkdtempSync(join(tmpdir(), 'g24-help-'));
  try {
    const result = spawnSync(process.execPath, [script, '--help'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--kind functional\|visual/);
    assert.match(result.stdout, /--source/);
    assert.match(result.stdout, /--viewport/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
