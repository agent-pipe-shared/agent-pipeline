#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// A fixed consumer of the Source-issued verification exchange. No suite selector.
import {realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  consumeSourceOwnedContinuityVerificationExecutorExchange,
  inspectSourceOwnedContinuityVerificationExecutorContext,
  finalizeSourceOwnedContinuityVerificationExecutorExchange,
} from '../lib/session-requester-bridge.mjs';

const FIXED_ARGUMENTS=['--consume-owned-verification','--channel-fd','4'];
const INPUT_KEYS=['candidate','gitCommonDir','policyInputs','repoRoot','suites'];
const REFUSAL_CODES=new Set([
  'OSV-OWNER-UNAVAILABLE','OSV-COURSE-UNAVAILABLE','OSV-ASSOCIATION-UNAVAILABLE',
  'OSV-INPUT-DRIFT','OSV-EXCHANGE-UNAVAILABLE','OSV-REPLAY','OSV-EXPIRED',
  'OSV-VERIFY-FAILED','OSV-TERMINAL-UNAVAILABLE',
]);

function refuse(code) {
  const error=new Error(code);
  error.code=code;
  throw error;
}

function requireContext(context, expectedBindingSha256=null) {
  if(!context || !/^[a-f0-9]{64}$/u.test(context.bindingSha256 ?? '')
    || (expectedBindingSha256!==null && context.bindingSha256!==expectedBindingSha256)
    || !(context.signal instanceof AbortSignal)) refuse('OSV-EXCHANGE-UNAVAILABLE');
  if(context.signal.aborted) refuse('OSV-EXPIRED');
  const inputs=context.binding?.journalInputs;
  if(!inputs || Array.isArray(inputs)
    || JSON.stringify(Object.keys(inputs).sort())!==JSON.stringify(INPUT_KEYS))
    refuse('OSV-INPUT-DRIFT');
  if(typeof inputs.repoRoot!=='string' || resolve(inputs.repoRoot)!==inputs.repoRoot
    || realpathSync(inputs.repoRoot)!==inputs.repoRoot || process.cwd()!==inputs.repoRoot)
    refuse('OSV-INPUT-DRIFT');
  return inputs;
}

async function execute() {
  if(JSON.stringify(process.argv.slice(2))!==JSON.stringify(FIXED_ARGUMENTS))
    refuse('OSV-EXCHANGE-UNAVAILABLE');
  const consumed=await consumeSourceOwnedContinuityVerificationExecutorExchange();
  if(!consumed?.verificationContextHandle) refuse('OSV-EXCHANGE-UNAVAILABLE');
  const verificationContextHandle=consumed.verificationContextHandle;
  // The authentic inspector reopens the complete bound closure and live parent.
  // Nested origin/owner/member bindings remain that inspector's responsibility.
  const before=await inspectSourceOwnedContinuityVerificationExecutorContext({verificationContextHandle});
  const inputs=requireContext(before);
  const {runVerifyJournal}=await import('./verify-journal.mjs');
  if(before.signal.aborted) refuse('OSV-EXPIRED');
  // Do not forward an open options object or replace any production default.
  const journal=await runVerifyJournal({
    gitCommonDir:inputs.gitCommonDir,
    repoRoot:inputs.repoRoot,
    candidate:inputs.candidate,
    suites:inputs.suites,
    policyInputs:inputs.policyInputs,
    signal:before.signal,
  });
  const after=await inspectSourceOwnedContinuityVerificationExecutorContext({verificationContextHandle});
  requireContext(after,before.bindingSha256);
  if(after.signal!==before.signal) refuse('OSV-EXCHANGE-UNAVAILABLE');
  // The parent reopens genuine journal evidence and rechecks the original owner.
  // This acknowledgement precedes, and does not assert, this executor's close.
  const ack=await finalizeSourceOwnedContinuityVerificationExecutorExchange({
    verificationContextHandle,
    terminal:journal,
  });
  if(!ack || JSON.stringify(Object.keys(ack))!==JSON.stringify(['status'])
    || ack.status!=='acknowledged') refuse('OSV-TERMINAL-UNAVAILABLE');
  if(before.signal.aborted) refuse('OSV-EXPIRED');
  return journal?.terminal?.status==='passed' ? 0 : 1;
}

try {
  process.exitCode=await execute();
} catch(error) {
  // The parent captures the actual outer close and retains any journal effects.
  // Raw child errors, paths, handles and exchange data never become diagnostics.
  const code=REFUSAL_CODES.has(error?.code) ? error.code : 'OSV-VERIFY-FAILED';
  process.stderr.write(code+'\n');
  process.exitCode=1;
}
