#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Checkpoint-bound human-authority readback for synchronous consumers. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { queryHumanGovernanceDecisions } from "../lib/human-governance-ledger.mjs";
import { requireGovernanceAuthority } from "../lib/governance-authority-resolver.mjs";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function parse(argv) {
  if (argv.length !== 4 || argv[0] !== "--repo" || (argv[2] !== "--request-file" && argv[2] !== "--request-json")) fail("GAC-ARGUMENT", "Usage: governance-authority.mjs --repo <checkout> (--request-file <file>|--request-json <canonical-json>)");
  return { repositoryRoot: argv[1], requestFile: argv[2] === "--request-file" ? argv[3] : null, requestJson: argv[2] === "--request-json" ? argv[3] : null };
}

export async function main(argv = process.argv.slice(2)) {
  const { repositoryRoot, requestFile, requestJson } = parse(argv);
  let request; try { request = parseStrictJson(requestFile === null ? requestJson : await readFile(requestFile)); } catch { fail("GAC-REQUEST", "Authority request must be strict JSON."); }
  if (!exact(request, ["schema", "repositoryFingerprint", "decisionId", "candidate", "checkpoint", "nowEpochMs"]) || request.schema !== "pipeline.governance-authority-request.v1") fail("GAC-REQUEST", "Authority request has an invalid closed shape.");
  // Cyborg integration point: the published `po-approval-proof` contract must
  // be verified at this admission boundary against its externally configured
  // trust policy before a caller can rely on a human authority result. The
  // proof intent must bind this decision's candidate and governed artifacts;
  // existing ledger assurance alone is intentionally not a Cyborg-verified
  // human attestation.
  const queried = await queryHumanGovernanceDecisions({ repositoryRoot, repositoryFingerprint: request.repositoryFingerprint, checkpoint: request.checkpoint });
  if (queried.completeness !== "verified") return Object.freeze({ schema: "pipeline.governance-authority-readback.v1", granted: false, reason: "checkpoint-unverified" });
  return Object.freeze({ schema: "pipeline.governance-authority-readback.v1", ...requireGovernanceAuthority({ decisions: queried.decisions, decisionId: request.decisionId, repositoryFingerprint: request.repositoryFingerprint, candidate: request.candidate, nowEpochMs: request.nowEpochMs }) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await main())}\n`); } catch (error) { process.stderr.write(`${error.code ?? "GAC-FAILED"}: ${error.message}\n`); process.exitCode = 2; }
}
