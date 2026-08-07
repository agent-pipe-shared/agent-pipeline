#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Explicit live-runner certification lane.
 *
 * Generic Core Verify never imports this module. The CI lane selects it
 * explicitly, binds the pinned adapter policy, and classifies absent authority
 * or runner prerequisites as typed unavailable evidence.
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  resolveCodexBinary,
} from "./codex-critic-isolation.mjs";
import { runCodexSandboxPreflight } from "./codex-sandbox-preflight.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const LIVE_CERTIFICATION_SCHEMA = "pipeline.live-runner-certification.v1";
const OID = /^[0-9a-f]{40}$/u;
const POLICIES = new Set(["advisory", "blocking"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function platformClass(platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "darwin";
  if (platform === "linux") return "linux";
  return "other";
}

function evidence({ status, code, candidateCommit, platform, observedVersion = null, resultSha256 = null }) {
  return Object.freeze({
    schema: LIVE_CERTIFICATION_SCHEMA,
    status,
    code,
    candidateCommit,
    adapter: "codex-sandbox-preflight",
    compatibilityClass: "codex-sandbox-state-v1",
    observedVersion,
    platformClass: platformClass(platform),
    commandSha256: sha256(JSON.stringify({
      adapter: "codex-sandbox-preflight",
      compatibilityClass: "codex-sandbox-state-v1",
      candidateCommit,
    })),
    resultSha256,
  });
}

export async function certifyLiveRunner({
  repoRoot,
  candidateCommit,
  authority,
  policy = "advisory",
  pathEnv,
  platform = process.platform,
  resolveBinary = resolveCodexBinary,
  runPreflight = runCodexSandboxPreflight,
} = {}) {
  if (typeof repoRoot !== "string" || !path.isAbsolute(repoRoot) || !OID.test(candidateCommit ?? "") || !POLICIES.has(policy)) {
    return evidence({ status: "failed", code: "LRC-INPUT-INVALID", candidateCommit: OID.test(candidateCommit ?? "") ? candidateCommit : null, platform });
  }
  if (authority !== "approved") {
    return evidence({ status: "unavailable", code: "LRC-AUTHORITY-UNAVAILABLE", candidateCommit, platform });
  }

  let binary;
  try {
    binary = await resolveBinary({ pathEnv, platform });
  } catch {
    return evidence({ status: "unavailable", code: "LRC-RUNNER-UNAVAILABLE", candidateCommit, platform });
  }

  let receipt;
  try {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "agent-pipeline-live-certification-"));
    try {
      receipt = await runPreflight({
        kind: "intermediate",
        codexPath: binary,
        receiptPath: path.join(scratch, "receipt.json"),
      });
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  } catch {
    return evidence({ status: "failed", code: "LRC-PREFLIGHT-FAILED", candidateCommit, platform });
  }
  const resultSha256 = sha256(JSON.stringify(receipt));
  const passed = receipt?.eligibility === "intermediate" && receipt?.terminalCode === "ok"
    && typeof receipt?.cli?.version === "string";
  return evidence({
    status: passed ? "passed" : "failed",
    code: passed ? "LRC-PREFLIGHT-PASSED" : "LRC-PREFLIGHT-REJECTED",
    candidateCommit,
    platform,
    observedVersion: typeof receipt?.cli?.version === "string" ? receipt.cli.version : null,
    resultSha256,
  });
}

export function parseLiveCertificationArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--candidate" || argv[2] !== "--policy" || !OID.test(argv[1]) || !POLICIES.has(argv[3])) {
    throw new Error("expected --candidate <40-hex> --policy <advisory|blocking>");
  }
  return Object.freeze({ candidateCommit: argv[1], policy: argv[3] });
}

if (isDirectInvocation(import.meta.url)) {
  let result;
  let policy = "blocking";
  try {
    const parsed = parseLiveCertificationArgs(process.argv.slice(2));
    policy = parsed.policy;
    result = await certifyLiveRunner({
      repoRoot: process.cwd(),
      candidateCommit: parsed.candidateCommit,
      policy,
      authority: process.env.PIPELINE_LIVE_CERTIFICATION_AUTHORITY,
      pathEnv: process.env.PATH,
      platform: os.platform(),
    });
  } catch {
    result = evidence({ status: "failed", code: "LRC-INPUT-INVALID", candidateCommit: null, platform: os.platform() });
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === "passed" || (result.status === "unavailable" && policy === "advisory") ? 0 : 2;
}
