#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/** Project-local inspect/plan/apply surface for the V3 authority cutover. */
import { writeSync } from "node:fs";

import {
  applyPendingTransactionRecoveryV3,
  applyRunnerProfileMigrationV3,
  authorizePendingTransactionRecoveryV3,
  inspectRunnerProfileMigrationV3,
  planPendingTransactionRecoveryV3,
  planRunnerProfileMigrationV3,
} from "../lib/runner-profile-migration-v3.mjs";
import { RECOVERY_PREVIEW_ACK_SCHEMA } from "../lib/recovery-preview-attestation.mjs";

const PREVIEW_FD = 2;
const MAX_PREVIEW_BYTES = 64 * 1024;

function usage() {
  return "Usage: node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs <inspect|plan|apply> --root <project-dir> [--activate]";
}

function parseArgs(args) {
  const parsed = { activate: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (index === 0 && ["inspect", "plan", "apply"].includes(arg)) parsed.command = arg;
    else if (arg === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return { error: "--root requires a project directory" };
      parsed.root = value;
      index += 1;
    } else if (arg === "--activate") parsed.activate = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!parsed.help && !parsed.command) return { error: "one command is required" };
  if (!parsed.help && !parsed.root) return { error: "--root is required" };
  if (parsed.activate && parsed.command !== "apply") return { error: "--activate is only valid for apply" };
  return parsed;
}

function preWritePreview(plan) {
  return {
    schema: "pipeline.runner-profile-migration-prewrite-preview.v3",
    status: "pre-write-preview",
    operation: "activation",
    candidate: {
      planSchema: plan.schema,
      source: plan.source,
      sourceKind: plan.sourceKind,
      sourceSha256: plan.sourceSha256,
      intentSha256: plan.intentSha256,
    },
    activation: {
      requested: true,
      sourceCommittedLast: plan.activation?.sourceCommittedLast === true,
    },
    targets: plan.targets.map((target) => ({
      path: target.path,
      kind: target.kind,
      preWrite: target.preWrite,
      before: target.before,
      after: target.after,
      changed: target.changed,
    })),
  };
}

function previewFailure(plan, operation = "activation") {
  return {
    schema: plan.schema,
    status: "preview-failed",
    ...(plan.source ? { source: plan.source } : {}),
    diagnostics: [{
      path: "$.preWritePreview",
      code: "preview_write_failed",
      message: `pre-write preview channel failed before ${operation}`,
      repair: "restore the separate preview channel and run the authenticated plan again",
    }],
    requiresExplicitActivation: true,
  };
}

function writePreviewFullySync(chunk, syncWrite = writeSync) {
  const bytes = Buffer.from(String(chunk), "utf8");
  if (bytes.length === 0 || bytes.length > MAX_PREVIEW_BYTES) throw new Error("pre-write preview has an invalid byte length");
  // Every accepted iteration advances by at least one byte, so byteLength is
  // both a complete short-write allowance and a hard loop bound.
  let offset = 0;
  for (let attempt = 0; offset < bytes.length && attempt < bytes.length; attempt += 1) {
    const remaining = bytes.length - offset;
    const written = syncWrite(PREVIEW_FD, bytes, offset, remaining);
    if (!Number.isInteger(written) || written <= 0 || written > remaining) {
      throw new Error("pre-write preview channel made invalid progress");
    }
    offset += written;
  }
  if (offset !== bytes.length) throw new Error("pre-write preview delivery was incomplete");
}

export function main(args = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
  writePreview,
  previewWriteSync = writeSync,
} = {}) {
  const options = parseArgs(args);
  if (options.help) { write(`${usage()}\n`); return 0; }
  if (options.error) { write(`${usage()}\n${options.error}\n`); return 2; }
  let output;
  const emitPreview = (preview, invocation) => {
    const chunk = `${JSON.stringify(preview, null, 2)}\n`;
    if (writePreview) writePreview(chunk);
    else writePreviewFullySync(chunk, previewWriteSync);
    if (!invocation) return undefined;
    return {
      schema: RECOVERY_PREVIEW_ACK_SCHEMA,
      invocationId: invocation.invocationId,
      previewDigest: invocation.previewDigest,
      acknowledgementId: `cli-${invocation.invocationId}`,
      delivery: "delivered",
    };
  };
  if (options.command === "inspect") output = inspectRunnerProfileMigrationV3({ rootDir: options.root });
  else {
    if (options.command === "apply" && options.activate) {
      const recoveryPlan = planPendingTransactionRecoveryV3({ rootDir: options.root });
      if (recoveryPlan.status === "ready") {
        const authorization = authorizePendingTransactionRecoveryV3(recoveryPlan, { deliverPreview: emitPreview });
        if (authorization.status !== "authorized") output = authorization;
        else {
          const recovered = applyPendingTransactionRecoveryV3(recoveryPlan, { rootDir: options.root, authorization });
          if (!["recovered", "cleanup"].includes(recovered.status)) output = recovered;
        }
      } else if (recoveryPlan.status !== "none") output = recoveryPlan;
    }
    const plan = output ? null : planRunnerProfileMigrationV3({ rootDir: options.root });
    if (options.command === "plan") output = plan;
    else {
      if (!output && options.activate && ["ready", "noop"].includes(plan.status)) {
        try { emitPreview(preWritePreview(plan)); }
        catch { output = previewFailure(plan); }
      }
      if (!output) output = applyRunnerProfileMigrationV3(plan, { rootDir: options.root, activate: options.activate });
    }
  }
  write(`${JSON.stringify(output, null, 2)}\n`);
  return ["ready", "noop", "applied"].includes(output.status) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
