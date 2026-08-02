#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Cross-runner public transport for the detached PO-proof flow.
 *
 * prepare emits a request only. A human signs its intent digest in a separate
 * trusted terminal/device; this program contains no signer and accepts no
 * private-key material. verify accepts only public proof/trust-policy data.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createThreatModelApprovalRequest, readPublicRepositoryFile, verifyThreatModelApprovalRequest } from "../lib/threat-model-approval-request.mjs";

const usage = "Usage: po-approval-request.mjs prepare --feature-id cyb-4 --plan <repo-path> --spec <repo-path> --model <repo-path> [--repo-root <path>] | verify --request <external-public-json> --authority <external-public-json> --proof <external-public-json> [--repo-root <path>]";

export function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = { command, repoRoot: process.cwd() };
  const supplied = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index];
    if (!key.startsWith("--")) return { error: usage };
    const value = tokens[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) return { error: usage };
    const normalized = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!new Set(["featureId", "plan", "spec", "model", "repoRoot", "request", "authority", "proof"]).has(normalized) || supplied.has(normalized)) return { error: usage };
    supplied.add(normalized);
    values[normalized] = value; index += 1;
  }
  return values;
}

export function observeCleanCandidate(repoRoot) {
  const root = resolve(repoRoot);
  const dirty = execFileSync("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" });
  if (dirty !== "") throw new Error("repository must be clean before preparing a PO approval request");
  const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const tree = execFileSync("git", ["-C", root, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
  return { commit, tree };
}

function externalJson(repoRoot, path) {
  const root = resolve(repoRoot); const source = resolve(path);
  if (source === root || source.startsWith(`${root}/`)) throw new Error("request, proof and trust policy must be supplied outside the repository");
  return JSON.parse(readFileSync(source, "utf8"));
}

/** Accept the public wrapper emitted by this CLI as well as the bare request. */
export function approvalRequestFromExternalJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.ok === true && Object.keys(value).length === 2 && Object.hasOwn(value, "value")) return value.value;
  return value;
}

export function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) throw new Error(args.error);
  if (args.command === "prepare") {
    if (!args.featureId || !args.plan || !args.spec || !args.model) throw new Error(usage);
    const root = resolve(args.repoRoot);
    const request = createThreatModelApprovalRequest({
      candidate: observeCleanCandidate(root),
      featureId: args.featureId,
      planBytes: readPublicRepositoryFile(root, args.plan),
      specBytes: readPublicRepositoryFile(root, args.spec),
      referenceModel: JSON.parse(readPublicRepositoryFile(root, args.model)),
    });
    return { ok: true, value: request };
  }
  if (args.command === "verify") {
    if (!args.request || !args.authority || !args.proof) throw new Error(usage);
    return { ok: true, value: verifyThreatModelApprovalRequest({ request: approvalRequestFromExternalJson(externalJson(args.repoRoot, args.request)), trustPolicy: externalJson(args.repoRoot, args.authority), proof: externalJson(args.repoRoot, args.proof) }) };
  }
  throw new Error(usage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(run(), null, 2)}\n`); } catch (error) { process.stderr.write(`PO-APPROVAL-REQUEST-FAILED: ${error.message}\n`); process.exitCode = 2; }
}
