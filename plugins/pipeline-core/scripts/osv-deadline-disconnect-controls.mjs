// SPDX-License-Identifier: SUL-1.0
// Real elapsed-time and real owning-lifetime controls. No clock, transport,
// spawn, backend, or authority callback is supplied to product code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';

export const REAL_ATTEMPT_TTL_MS = 120000;

export function createRealLifetimeSuiteSource({kind, recorderModuleSpecifier, markerRelative = null}) {
  assert.ok(kind === 'deadline' || kind === 'disconnect');
  assert.equal(typeof recorderModuleSpecifier, 'string');
  assert.ok((recorderModuleSpecifier.startsWith('./') || recorderModuleSpecifier.startsWith('../')) && recorderModuleSpecifier.endsWith('/test-case-completion.mjs'));
  let imports = `import assert from 'node:assert/strict';\nimport {registerTestCaseCompletion} from ${JSON.stringify(recorderModuleSpecifier)};\n`;
  let progress = '';
  if (kind === 'disconnect') {
    assert.equal(typeof markerRelative, 'string');
    assert.ok(markerRelative.startsWith('scratch/osv-independent/') && !markerRelative.split('/').some(x => !x || x === '.' || x === '..'));
    imports += "import {writeFileSync} from 'node:fs';\n";
    // Actual child writes one declared disposable progress marker. This is not
    // completion, origin, member, invocation or execution authority evidence.
    progress = `writeFileSync(${JSON.stringify(markerRelative)},'actual-suite-running\\n',{flag:'wx',mode:0o600});\n`;
  }
  const source = `${imports}registerTestCaseCompletion({cases:[{id:'OSVF001',name:'Actual bounded lifetime control',async run(){${progress}await new Promise(resolve=>setTimeout(resolve,150000));assert.equal(19+23,42);}}],fd:3,maxBytes:65536});\n`;
  return Object.freeze({source, caseIds:Object.freeze(['OSVF001']), maxBytes:65536});
}

export function assertActualDeadlineRefusal({result, startedAt, endedAt}) {
  assert.ok(Number.isFinite(startedAt) && Number.isFinite(endedAt));
  assert.ok(endedAt - startedAt >= REAL_ATTEMPT_TTL_MS, 'An earlier generic refusal is not the actual TTL vector');
  assert.equal(result?.status, 'unavailable');
  assert.equal(result.code, 'OSV-EXPIRED', 'Require the genuine declared expiration result; do not relabel a hidden generic failure');
}

export async function disposeActualOwnerAfterOwnedSuiteProgress({fixture, markerRelative}) {
  assert.equal(typeof fixture.runtime?.dispose, 'function', 'Use the actual Source-issued runtime disposal entry');
  assert.ok(markerRelative.startsWith('scratch/osv-independent/'));
  const file = path.resolve(fixture.repository, markerRelative);
  const relative = path.relative(fixture.ownedRoot, file);
  assert.ok(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  const deadline = performance.now() + 60000;
  let observed = false;
  while (performance.now() < deadline) {
    try {
      const before = fs.lstatSync(file);
      assert.ok(before.isFile() && !before.isSymbolicLink());
      assert.equal(before.nlink, 1);
      assert.equal(fs.realpathSync(file), file);
      const bytes = fs.readFileSync(file);
      const after = fs.lstatSync(file);
      assert.equal(after.dev, before.dev);
      assert.equal(after.ino, before.ino);
      assert.equal(after.mode, before.mode);
      assert.equal(bytes.toString('utf8'), 'actual-suite-running\n');
      observed = true;
      break;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await wait(25);
  }
  assert.equal(observed, true, 'Missing real suite progress is not a passing disconnect control');
  // No PID lookup, adopted handle, caller Promise or outside-family signal.
  await fixture.runtime.dispose();
}

export function assertActualLostOwnerRefusal(result) {
  assert.ok(result?.status === 'failed' || result?.status === 'unavailable');
  assert.ok(['OSV-OWNER-UNAVAILABLE','OSV-EXCHANGE-UNAVAILABLE','OSV-VERIFY-FAILED','OSV-TERMINAL-UNAVAILABLE','OSV-EXPIRED'].includes(result.code));
  assert.notEqual(result.status, 'succeeded');
}
