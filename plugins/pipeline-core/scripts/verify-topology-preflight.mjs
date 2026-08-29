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
import { fileURLToPath } from "node:url";
import { evaluateAiHardeningGate, runIndependentChecks } from "./ai-assisted-hardening-gate.mjs";
import { resolveReviewerIdentity } from "../lib/ai-assisted-hardening.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

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
  // v3 (NVA-INVDERIVE-1): the schema name moved when the derived `surfaces` array was
  // removed. This consumer only ever read `sourceBaseline`, which v3 keeps unchanged --
  // the pin is updated rather than widened, so an actual v2 document still fails closed.
  if (!document || document.schema !== "pipeline.product-capability-inventory.v3") {
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
  independentChecks = [],
  authorId = "candidate-author",
  reviewerId = null,
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
    independentChecks,
    authorId,
    reviewerId,
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
  const parsed = { root: DEFAULT_ROOT, candidateRevision: "HEAD", inventoryPath: DEFAULT_INVENTORY, base: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof value !== "string") throw new Error("every topology option requires one value");
    if (flag === "--root") parsed.root = path.resolve(value);
    else if (flag === "--candidate") parsed.candidateRevision = value;
    else if (flag === "--inventory") parsed.inventoryPath = value;
    else if (flag === "--base") parsed.base = value;
    else throw new Error("unknown topology option");
  }
  if (path.isAbsolute(parsed.inventoryPath) || parsed.inventoryPath.split(/[\\/]/u).includes("..")) {
    throw new Error("inventory must be repository-relative");
  }
  return Object.freeze(parsed);
}

/**
 * The delivery base bounds the candidate diff that drives every downstream
 * hardening check (`evaluateChangeIntegrity`, `routeSecurityReview`,
 * `runIndependentChecks`). It is resolved in strict priority order, never
 * merged or widened:
 *   1. `--base` (explicit, caller-supplied -- CI or a human can always be exact)
 *   2. `PIPELINE_CANDIDATE_BASE` (the CI event's own before/base SHA, forwarded
 *      by the workflow -- e.g. `github.event.before` for a push, or
 *      `github.event.pull_request.base.sha` for a PR)
 *   3. `inventory.sourceBaseline.commit` (last resort only -- an
 *      inventory-derivation fact, not a delivery boundary; using it widens the
 *      window to everything since the inventory was last regenerated).
 * A blank or whitespace-only candidate at any tier is treated as absent, not
 * as an explicit empty base.
 */
export function resolveDeliveryBase({ explicitBase, ciEventBase, sourceBaselineCommit } = {}) {
  const tiers = [
    ["explicit", explicitBase],
    ["ci-event", ciEventBase],
    ["source-baseline", sourceBaselineCommit],
  ];
  for (const [source, candidate] of tiers) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return Object.freeze({ commit: candidate, source });
  }
  return null;
}

/**
 * Resolve the actual delivery window (base..candidate) and its changed-path
 * set, failing closed at every step instead of silently admitting an empty
 * or unresolvable window (F1/F2,
 * `backlog/evidence/2026-08-28-self-excluded-review-path-design.md` sections
 * B/C). `runGit` is the same `(args) => {status, stdout}` shape
 * `preflightVerifyTopology` already takes, so this is unit-testable with the
 * same fixture pattern.
 */
export function resolveCandidateChangeWindow({
  runGit, candidateCommit, explicitBase, ciEventBase, sourceBaselineCommit,
} = {}) {
  const deliverySpec = resolveDeliveryBase({ explicitBase, ciEventBase, sourceBaselineCommit });
  if (deliverySpec === null) {
    return Object.freeze({ ok: false, code: "VTP-BASE-UNRESOLVABLE", subject: "delivery-base" });
  }
  const baseCommit = resolveObject(runGit, deliverySpec.commit, "commit");
  if (baseCommit === null) {
    return Object.freeze({ ok: false, code: "VTP-BASE-UNRESOLVABLE", subject: "delivery-base" });
  }
  if (baseCommit === candidateCommit) {
    return Object.freeze({ ok: false, code: "VTP-BASE-NOT-ANCESTOR", subject: "delivery-base" });
  }
  const ancestry = runGit(["merge-base", "--is-ancestor", baseCommit, candidateCommit]);
  if (ancestry?.status !== 0) {
    return Object.freeze({ ok: false, code: "VTP-BASE-NOT-ANCESTOR", subject: "delivery-base" });
  }
  const diff = runGit(["diff", "--name-only", "--diff-filter=ACMR", baseCommit, candidateCommit]);
  if (diff?.status !== 0) {
    return Object.freeze({ ok: false, code: "VTP-DIFF-UNRESOLVABLE", subject: "candidate-diff" });
  }
  const changedPaths = diff.stdout.split("\n").map((entry) => entry.trim()).filter(Boolean);
  if (changedPaths.length === 0) {
    return Object.freeze({ ok: false, code: "VTP-CANDIDATE-DIFF-EMPTY", subject: "candidate-diff" });
  }
  return Object.freeze({
    ok: true,
    changedPaths: Object.freeze(changedPaths),
    deliveryBase: Object.freeze({ commit: baseCommit, source: deliverySpec.source }),
  });
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
  const runGit = (args) => defaultGit(parsed.root, args);
  const candidateCommit = runGit(["rev-parse", "--verify", `${parsed.candidateRevision}^{commit}`]).stdout;
  const authorId = runGit(["log", "-1", "--format=%ae", parsed.candidateRevision]).stdout;
  // There is no `--reviewer-id` flag here (unlike ai-assisted-hardening-
  // gate.mjs's CLI): only the environment (the admin-controlled GitHub
  // repository variable) is ever consulted, so `cliReviewerId` is absent by
  // construction, never a widened surface added for testability.
  const reviewerIdentity = resolveReviewerIdentity({ environmentReviewerId: process.env.PIPELINE_SECURITY_REVIEWER_ID ?? null });

  let changedPaths = [];
  let deliveryBase = null;
  if (candidateCommit) {
    const window = resolveCandidateChangeWindow({
      runGit,
      candidateCommit,
      explicitBase: parsed.base,
      ciEventBase: process.env.PIPELINE_CANDIDATE_BASE,
      sourceBaselineCommit: inventory?.sourceBaseline?.commit,
    });
    if (!window.ok) return failure(window.code, window.subject);
    changedPaths = window.changedPaths;
    deliveryBase = window.deliveryBase;
  }

  const result = preflightVerifyTopology({
    candidateRevision: parsed.candidateRevision,
    inventory,
    runGit,
    changedPaths,
    event: process.env.GITHUB_EVENT_NAME ?? "local",
    independentChecks: runIndependentChecks(parsed.root, changedPaths, deliveryBase?.commit ?? null, {
      reviewerId: reviewerIdentity.id,
      authorId,
      reviewerSource: reviewerIdentity.source,
    }),
    authorId,
    reviewerId: reviewerIdentity.id,
  });
  const withDeliveryBase = deliveryBase ? { ...result, deliveryBase } : result;
  return Object.freeze({ ...withDeliveryBase, reviewerIdentity });
}

if (isDirectInvocation(import.meta.url)) {
  const result = runVerifyTopologyCli();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === "ready" ? 0 : 2;
}
