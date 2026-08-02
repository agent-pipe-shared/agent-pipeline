#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Checkpoint-bound human-authority readback for synchronous consumers. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { canonicalSha256, parseStrictJson } from "../lib/governance-event.mjs";
import { appendConsumedHumanGovernanceDecision, queryHumanGovernanceDecisions } from "../lib/human-governance-ledger.mjs";
import { requireGovernanceAuthority } from "../lib/governance-authority-resolver.mjs";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function parse(argv) {
  if (argv.length !== 4 || argv[0] !== "--repo" || !new Set(["--request-file", "--request-json", "--consume-request-file", "--consume-request-json", "--consumption-readback-file", "--consumption-readback-json"]).has(argv[2])) fail("GAC-ARGUMENT", "Usage: governance-authority.mjs --repo <checkout> (--request-file <file>|--request-json <canonical-json>|--consume-request-file <file>|--consume-request-json <canonical-json>|--consumption-readback-file <file>|--consumption-readback-json <canonical-json>)");
  return {
    repositoryRoot: argv[1],
    requestFile: argv[2] === "--request-file" ? argv[3] : null,
    requestJson: argv[2] === "--request-json" ? argv[3] : null,
    consumeRequestFile: argv[2] === "--consume-request-file" ? argv[3] : null,
    consumeRequestJson: argv[2] === "--consume-request-json" ? argv[3] : null,
    consumptionReadbackFile: argv[2] === "--consumption-readback-file" ? argv[3] : null,
    consumptionReadbackJson: argv[2] === "--consumption-readback-json" ? argv[3] : null,
  };
}

function exactConsumptionRequest(request) {
  return exact(request, ["schema", "repositoryFingerprint", "decisionId", "decisionDigest", "candidate", "checkpoint", "observedAtEpochMs", "consumption"])
    && request.schema === "pipeline.governance-authority-consume-request.v1"
    && exact(request.consumption, ["decisionId", "eventId", "idempotencyKey"]);
}

function exactConsumptionReadbackRequest(request) {
  return exact(request, ["schema", "repositoryFingerprint", "candidate", "decisionId", "decisionDigest", "consumption"])
    && request.schema === "pipeline.governance-authority-consumption-readback-request.v1"
    && exact(request.candidate, ["commit", "tree"])
    && exact(request.consumption, ["schema", "decisionId", "decisionDigest", "checkpoint"])
    && request.consumption.schema === "pipeline.human-decision-consumption.v1";
}

export async function main(argv = process.argv.slice(2)) {
  const { repositoryRoot, requestFile, requestJson, consumeRequestFile, consumeRequestJson, consumptionReadbackFile, consumptionReadbackJson } = parse(argv);
  const consumption = consumeRequestFile !== null || consumeRequestJson !== null;
  const consumptionReadback = consumptionReadbackFile !== null || consumptionReadbackJson !== null;
  let request; try {
    request = parseStrictJson(consumptionReadback
      ? consumptionReadbackFile === null ? consumptionReadbackJson : await readFile(consumptionReadbackFile)
      : consumption
      ? consumeRequestFile === null ? consumeRequestJson : await readFile(consumeRequestFile)
      : requestFile === null ? requestJson : await readFile(requestFile));
  } catch { fail("GAC-REQUEST", "Authority request must be strict JSON."); }
  if (consumptionReadback) {
    if (!exactConsumptionReadbackRequest(request)) fail("GAC-CONSUMPTION-READBACK-REQUEST", "Consumption readback request has an invalid closed shape.");
    const queried = await queryHumanGovernanceDecisions({ repositoryRoot, repositoryFingerprint: request.repositoryFingerprint, checkpoint: request.consumption.checkpoint });
    if (queried.completeness !== "verified") return Object.freeze({ schema: "pipeline.governance-authority-consumption-status.v1", consumed: false, reason: "checkpoint-unverified" });
    const grant = queried.decisions.find((decision) => decision.decisionId === request.decisionId);
    const disposition = queried.decisions.find((decision) => decision.decisionId === request.consumption.decisionId);
    if (!grant || !disposition || canonicalSha256(grant) !== request.decisionDigest
      || canonicalSha256(grant) !== request.consumption.decisionDigest
      || canonicalSha256(grant.scope.candidate) !== canonicalSha256(request.candidate)
      || disposition.event !== "consumed" || disposition.outcome !== "consumed"
      || disposition.links.consumesDecisionId !== grant.decisionId
      || canonicalSha256(disposition.scope) !== canonicalSha256(grant.scope)) {
      return Object.freeze({ schema: "pipeline.governance-authority-consumption-status.v1", consumed: false, reason: "consumption-unavailable" });
    }
    return Object.freeze({ schema: "pipeline.governance-authority-consumption-status.v1", consumed: true, decisionId: grant.decisionId, decisionDigest: request.decisionDigest, consumptionDecisionId: disposition.decisionId, scope: grant.scope });
  }
  if (consumption) {
    if (!exactConsumptionRequest(request)) fail("GAC-CONSUME-REQUEST", "Consumption request has an invalid closed shape.");
    const queried = await queryHumanGovernanceDecisions({ repositoryRoot, repositoryFingerprint: request.repositoryFingerprint, checkpoint: request.checkpoint });
    // A retained grant checkpoint remains a valid prefix after its appended
    // disposition.  The locked ledger append revalidates the complete current
    // stream, while this prefix keeps an interrupted State projection safely
    // idempotent without treating heads.json as authority.
    if (queried.integrity !== "valid" && queried.integrity !== "prefix-valid") return Object.freeze({ schema: "pipeline.governance-authority-consumption-readback.v1", consumed: false, reason: "checkpoint-unverified" });
    const grantEvent = queried.events.find((event) => event.payload.decisionId === request.decisionId);
    const grant = queried.decisions.find((decision) => decision.decisionId === request.decisionId);
    if (!grantEvent || !grant || canonicalSha256(grant) !== request.decisionDigest
      || canonicalSha256(grant.scope.candidate) !== canonicalSha256(request.candidate)) return Object.freeze({ schema: "pipeline.governance-authority-consumption-readback.v1", consumed: false, reason: "decision-unavailable" });
    const receipt = await appendConsumedHumanGovernanceDecision({
      repositoryRoot,
      repositoryFingerprint: request.repositoryFingerprint,
      grantEvent,
      decisionId: request.consumption.decisionId,
      eventId: request.consumption.eventId,
      idempotencyKey: request.consumption.idempotencyKey,
      observedAtEpochMs: request.observedAtEpochMs,
    });
    return Object.freeze({ schema: "pipeline.governance-authority-consumption-readback.v1", consumed: true, decisionId: grant.decisionId, decisionDigest: request.decisionDigest, consumptionDecisionId: request.consumption.decisionId, checkpoint: receipt.checkpoint, outcome: receipt.outcome });
  }
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
