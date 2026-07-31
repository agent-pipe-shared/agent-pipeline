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
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CODEX_CRITIC_ARTIFACTS,
  CODEX_CRITIC_POLICY,
  inspectCodexBinary,
  resolveCodexBinary,
  runProfileBoundIsolation,
} from "./codex-critic-isolation.mjs";

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

function evidence({ status, code, candidateCommit, platform, resultSha256 = null }) {
  return Object.freeze({
    schema: LIVE_CERTIFICATION_SCHEMA,
    status,
    code,
    candidateCommit,
    adapter: CODEX_CRITIC_POLICY.adapter,
    requiredVersion: CODEX_CRITIC_POLICY.requiredVersion,
    platformClass: platformClass(platform),
    commandSha256: sha256(JSON.stringify({
      adapter: CODEX_CRITIC_POLICY.adapter,
      requiredVersion: CODEX_CRITIC_POLICY.requiredVersion,
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
  inspectBinary = inspectCodexBinary,
  runIsolation = runProfileBoundIsolation,
} = {}) {
  if (typeof repoRoot !== "string" || !path.isAbsolute(repoRoot) || !OID.test(candidateCommit ?? "") || !POLICIES.has(policy)) {
    return evidence({ status: "failed", code: "LRC-INPUT-INVALID", candidateCommit: OID.test(candidateCommit ?? "") ? candidateCommit : null, platform });
  }
  if (authority !== "approved") {
    return evidence({ status: "unavailable", code: "LRC-AUTHORITY-UNAVAILABLE", candidateCommit, platform });
  }

  let binary;
  let inspection;
  try {
    binary = await resolveBinary({ pathEnv, platform });
    inspection = await inspectBinary({ codexBinary: binary });
  } catch {
    return evidence({ status: "unavailable", code: "LRC-RUNNER-UNAVAILABLE", candidateCommit, platform });
  }

  let result;
  try {
    result = await runIsolation({
      repoRoot,
      candidateCommit,
      artifactPaths: CODEX_CRITIC_ARTIFACTS,
      resolvedBinary: binary,
      binaryInspection: inspection,
      pathEnv,
    });
  } catch {
    return evidence({ status: "failed", code: "LRC-EXECUTION-FAILED", candidateCommit, platform });
  }
  const { localDiagnostics: _localDiagnostics, ...publicResult } = result && typeof result === "object" ? result : {};
  const resultSha256 = sha256(JSON.stringify(publicResult));
  return evidence({
    status: result?.ok === true ? "passed" : "failed",
    code: result?.ok === true ? "LRC-PASSED" : "LRC-REJECTED",
    candidateCommit,
    platform,
    resultSha256,
  });
}

export function parseLiveCertificationArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--candidate" || argv[2] !== "--policy" || !OID.test(argv[1]) || !POLICIES.has(argv[3])) {
    throw new Error("expected --candidate <40-hex> --policy <advisory|blocking>");
  }
  return Object.freeze({ candidateCommit: argv[1], policy: argv[3] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
