#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Typed, runner-neutral Git history preflight for Core Verify.
 *
 * This module resolves only Git objects. It never discovers or launches a
 * productive model runner and remains usable on an offline checkout.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluateAiHardeningGate } from "./ai-assisted-hardening-gate.mjs";

export const VERIFY_TOPOLOGY_SCHEMA = "pipeline.verify-topology-preflight.v1";
const OID = /^[0-9a-f]{40}$/u;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const DEFAULT_INVENTORY = "docs/product-capability-inventory.json";

function failure(code, subject = null) {
  return Object.freeze({
    schema: VERIFY_TOPOLOGY_SCHEMA,
    status: "failed",
    code,
    subject,
    candidate: null,
    parent: null,
    baselines: Object.freeze([]),
  });
}

function defaultGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return Object.freeze({
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout.trim() : "",
  });
}

function resolveObject(runGit, revision, kind) {
  const result = runGit(["rev-parse", "--verify", `${revision}^{${kind}}`]);
  return result?.status === 0 && OID.test(result.stdout) ? result.stdout : null;
}

export function declaredEvidenceBaselines(document) {
  if (!document || document.schema !== "pipeline.product-capability-inventory.v2") {
    throw new Error("unsupported evidence baseline declaration");
  }
  const source = document.sourceBaseline;
  if (!source || !OID.test(source.commit) || !OID.test(source.tree)) {
    throw new Error("invalid evidence baseline declaration");
  }
  return Object.freeze([
    Object.freeze({
      label: "product-capability-inventory.sourceBaseline",
      commit: source.commit,
      tree: source.tree,
    }),
  ]);
}

export function preflightVerifyTopology({
  candidateRevision = "HEAD",
  inventory,
  runGit,
  changedPaths = [],
  event = "local",
  privileged = false,
  isolated = false,
  validated = false,
} = {}) {
  if (typeof candidateRevision !== "string" || candidateRevision.length === 0 || typeof runGit !== "function") {
    return failure("VTP-INPUT-INVALID");
  }

  let declarations;
  try {
    declarations = declaredEvidenceBaselines(inventory);
  } catch {
    return failure("VTP-DECLARATION-INVALID");
  }

  const candidateCommit = resolveObject(runGit, candidateRevision, "commit");
  if (candidateCommit === null) return failure("VTP-CANDIDATE-UNRESOLVABLE", "candidate");
  const candidateTree = resolveObject(runGit, candidateCommit, "tree");
  if (candidateTree === null) return failure("VTP-CANDIDATE-TREE-UNRESOLVABLE", "candidate");

  const parentCommit = resolveObject(runGit, `${candidateCommit}^`, "commit");
  if (parentCommit === null) return failure("VTP-PARENT-UNRESOLVABLE", "parent");
  const parentTree = resolveObject(runGit, parentCommit, "tree");
  if (parentTree === null) return failure("VTP-PARENT-TREE-UNRESOLVABLE", "parent");

  // The candidate's repository-derived diff remains untrusted.  This invokes
  // CYB-5's admission controls at the same CI boundary that resolves the
  // exact candidate and parent used for Core Verify.
  const hardening = evaluateAiHardeningGate({
    changedPaths,
    event,
    privileged,
    isolated,
    validated,
  });
  if (!hardening.allowed) return failure("VTP-AI-HARDENING-REJECTED", "candidate");

  const baselines = [];
  for (const declaration of declarations) {
    const commit = resolveObject(runGit, declaration.commit, "commit");
    if (commit === null) return failure("VTP-BASELINE-UNRESOLVABLE", declaration.label);
    const tree = resolveObject(runGit, commit, "tree");
    if (tree === null) return failure("VTP-BASELINE-TREE-UNRESOLVABLE", declaration.label);
    if (tree !== declaration.tree) return failure("VTP-BASELINE-TREE-MISMATCH", declaration.label);
    const ancestry = runGit(["merge-base", "--is-ancestor", commit, candidateCommit]);
    if (ancestry?.status !== 0) {
      return failure(
        ancestry?.status === 1 ? "VTP-BASELINE-NOT-ANCESTOR" : "VTP-ANCESTRY-UNRESOLVABLE",
        declaration.label,
      );
    }
    baselines.push(Object.freeze({ label: declaration.label, commit, tree }));
  }

  return Object.freeze({
    schema: VERIFY_TOPOLOGY_SCHEMA,
    status: "ready",
    code: "VTP-READY",
    subject: null,
    candidate: Object.freeze({ commit: candidateCommit, tree: candidateTree }),
    parent: Object.freeze({ commit: parentCommit, tree: parentTree }),
    baselines: Object.freeze(baselines),
    hardening,
  });
}

export function parseVerifyTopologyArgs(argv) {
  const parsed = { root: DEFAULT_ROOT, candidateRevision: "HEAD", inventoryPath: DEFAULT_INVENTORY };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof value !== "string") throw new Error("every topology option requires one value");
    if (flag === "--root") parsed.root = path.resolve(value);
    else if (flag === "--candidate") parsed.candidateRevision = value;
    else if (flag === "--inventory") parsed.inventoryPath = value;
    else throw new Error("unknown topology option");
  }
  if (path.isAbsolute(parsed.inventoryPath) || parsed.inventoryPath.split(/[\\/]/u).includes("..")) {
    throw new Error("inventory must be repository-relative");
  }
  return Object.freeze(parsed);
}

export function runVerifyTopologyCli(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseVerifyTopologyArgs(argv);
  } catch {
    return failure("VTP-INPUT-INVALID");
  }
  let inventory;
  try {
    inventory = JSON.parse(readFileSync(path.join(parsed.root, parsed.inventoryPath), "utf8"));
  } catch {
    return failure("VTP-DECLARATION-UNAVAILABLE");
  }
  const candidateCommit = defaultGit(parsed.root, ["rev-parse", "--verify", `${parsed.candidateRevision}^{commit}`]).stdout;
  const parentCommit = candidateCommit ? defaultGit(parsed.root, ["rev-parse", "--verify", `${candidateCommit}^^{commit}`]).stdout : "";
  const changedPaths = candidateCommit && parentCommit
    ? defaultGit(parsed.root, ["diff", "--name-only", "--diff-filter=ACMR", parentCommit, candidateCommit]).stdout.split("\n")
    : [];
  return preflightVerifyTopology({
    candidateRevision: parsed.candidateRevision,
    inventory,
    runGit: (args) => defaultGit(parsed.root, args),
    changedPaths,
    event: process.env.GITHUB_EVENT_NAME ?? "local",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runVerifyTopologyCli();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === "ready" ? 0 : 2;
}
