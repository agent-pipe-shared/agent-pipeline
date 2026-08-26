#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Explicit read-only evaluation boundary for provider-neutral change control. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { evaluateChangeControlGate } from "../lib/change-control.mjs";
import { main as readGovernanceAuthority } from "./governance-authority.mjs";
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parse(argv) { if (argv[0] !== "gate" || argv.length !== 13) fail("CCC-ARGUMENT", "Usage: change-control.mjs gate --repo <checkout> --profile-file <json> --pipeline-authority-file <json> --authority-request-file <json> --external-receipt-file <json|none> --now-ms <epoch-ms>"); const values = new Map(); for (let index = 1; index < argv.length; index += 2) { const key = argv[index]; const value = argv[index + 1]; if (!new Set(["--repo", "--profile-file", "--pipeline-authority-file", "--authority-request-file", "--external-receipt-file", "--now-ms"]).has(key) || values.has(key) || value === undefined) fail("CCC-ARGUMENT", "Change-control arguments are invalid."); values.set(key, value); } return { repositoryRoot: values.get("--repo"), profileFile: values.get("--profile-file"), authorityFile: values.get("--pipeline-authority-file"), authorityRequestFile: values.get("--authority-request-file"), externalReceiptFile: values.get("--external-receipt-file"), nowEpochMs: Number(values.get("--now-ms")) }; }
async function readJson(path, read = readFile) { try { return parseStrictJson(await read(path)); } catch { fail("CCC-JSON", "A change-control JSON input is invalid."); } }
function boundHumanAuthority(profile, authority) {
  const scope = authority?.scope;
  if (authority?.granted !== true || !scope || scope.candidate?.commit !== profile.candidate?.commit || scope.candidate?.tree !== profile.candidate?.tree
    || scope.environment !== profile.environment || scope.action !== "APPROVE_DEPLOY"
    || !Array.isArray(scope.artifacts) || !scope.artifacts.some((artifact) => artifact.path === profile.artifact?.path && artifact.sha256 === profile.artifact?.sha256)) {
    return false;
  }
  return true;
}
export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parse(argv);
  if (!Number.isSafeInteger(options.nowEpochMs) || options.nowEpochMs < 0) fail("CCC-NOW", "now-ms must be a non-negative integer.");
  const load = deps.readJson ?? readJson;
  const profile = await load(options.profileFile);
  const authority = await (deps.readAuthority ?? readGovernanceAuthority)(["--repo", options.repositoryRoot, "--request-file", options.authorityRequestFile]);
  if (!boundHumanAuthority(profile, authority)) return Object.freeze({ schema: "pipeline.change-control-gate.v1", status: "blocked", reason: "human-authority" });
  return (deps.evaluate ?? evaluateChangeControlGate)({ profile, pipelineAuthority: await load(options.authorityFile), externalReceipt: options.externalReceiptFile === "none" ? null : await load(options.externalReceiptFile), nowEpochMs: options.nowEpochMs });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(await main())}\n`); } catch (error) { process.stderr.write(`${error.code ?? "CCC-FAILED"}: ${error.message}\n`); process.exitCode = 2; } }
