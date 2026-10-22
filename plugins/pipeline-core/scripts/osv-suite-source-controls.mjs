// SPDX-License-Identifier: SUL-1.0
// Test task DATA for the genuine Source-owned authoring producer. These strings
// carry no course, identity, registration, requester or verification authority.
// Root alone executes a suite after the real production association is issued.
import assert from 'node:assert/strict';

const variants = Object.freeze(['complete', 'duplicate-declaration', 'incomplete', 'malformed', 'missing', 'real-failure']);
export const suiteControlVariants = variants;

export function createSuiteSourceControl({kind, recorderModuleSpecifier}) {
  assert.ok(variants.includes(kind), 'Unknown real suite control');
  assert.equal(typeof recorderModuleSpecifier, 'string');
  assert.ok(recorderModuleSpecifier.startsWith('./') || recorderModuleSpecifier.startsWith('../'), 'Recorder import must be a real contained relative module');
  assert.ok(recorderModuleSpecifier.endsWith('/test-case-completion.mjs'), 'Use the official completion recorder');
  assert.ok(!recorderModuleSpecifier.includes('\0'));
  const importLine = `import {registerTestCaseCompletion,createTestCaseCompletionRecorder} from ${JSON.stringify(recorderModuleSpecifier)};\n`;
  const declared = kind === 'incomplete' ? ['OSVF001', 'OSVF002'] : ['OSVF001'];
  let source;
  if (kind === 'complete') {
    source = `${importLine}import assert from 'node:assert/strict';\nregisterTestCaseCompletion({cases:[{id:'OSVF001',name:'Actual owning verification arithmetic',run(){assert.equal(19+23,42);}}],fd:3,maxBytes:65536});\n`;
  } else if (kind === 'real-failure') {
    source = `${importLine}import assert from 'node:assert/strict';\nregisterTestCaseCompletion({cases:[{id:'OSVF001',name:'Actual intentional child assertion failure',run(){assert.fail('Intentional independently specified Verify child failure');}}],fd:3,maxBytes:65536});\n`;
  } else if (kind === 'duplicate-declaration') {
    source = `${importLine}import assert from 'node:assert/strict';\ncreateTestCaseCompletionRecorder({caseIds:['OSVF001'],fd:3,maxBytes:65536});\nconst second=createTestCaseCompletionRecorder({caseIds:['OSVF001'],fd:3,maxBytes:65536});\nassert.equal(19+23,42);\nsecond.dispose('OSVF001','pass');\n`;
  } else if (kind === 'incomplete') {
    source = `${importLine}import assert from 'node:assert/strict';\nconst recorder=createTestCaseCompletionRecorder({caseIds:['OSVF001','OSVF002'],fd:3,maxBytes:65536});\nassert.equal(19+23,42);\nrecorder.dispose('OSVF001','pass');\n`;
  } else if (kind === 'malformed') {
    source = `import {writeSync} from 'node:fs';\nwriteSync(3,Buffer.from('{not-valid-json}\\n'));\n`;
  } else {
    source = `import assert from 'node:assert/strict';\nassert.equal(19+23,42);\n// Deliberately does not publish the required completion stream.\n`;
  }
  return Object.freeze({kind, source, caseIds: Object.freeze(declared), maxBytes: 65536});
}
