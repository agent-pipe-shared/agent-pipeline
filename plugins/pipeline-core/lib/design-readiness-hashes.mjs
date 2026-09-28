// SPDX-License-Identifier: SUL-1.0
import {createHash} from 'node:crypto';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function designReadinessReportSha256(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("readiness report is invalid");
  const { hostExecution: _hostExecution, ...report } = receipt;
  return sha(Buffer.from(canonicalJson(report), "utf8"));
}

export function designReadinessRunnerSelectionSha256(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("readiness host receipt is invalid");
  const selection = {
    schema: "pipeline.design-readiness-runner-selection.v1",
    receiptId: receipt.receiptId,
    runner: receipt.runner,
    repoFingerprint: receipt.repoFingerprint,
    dispatchId: receipt.dispatchId,
    candidate: receipt.candidate,
    sources: receipt.sources,
    route: receipt.route,
    executableSha256: receipt.executableSha256,
    requestSha256: receipt.requestSha256,
  };
  return sha(Buffer.from(canonicalJson(selection), "utf8"));
}
