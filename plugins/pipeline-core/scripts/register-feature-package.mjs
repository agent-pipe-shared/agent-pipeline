#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// register-feature-package.mjs --root <root>
//
// Registers the accepted delivery contract envelope of an approved plan (plan approval v9)
// in `specs/<feature>/lifecycle.json`, the manifest that `readAcceptedDeliveryContract`
// resolves it through. Without this registration the first item-governed dispatch of a
// consumer project is refused `CAC-REGISTRATION-INVALID`.
//
// Reads the active feature, the plan submission and the approval's `acceptedContract.path`
// from the project authority State through the existing resolvers. Writes the manifest
// (validated by `validateFeaturePackage`) and, only when the feature has none yet, a
// Pipeline-owned acceptance pointer and result record (exclusive create, listed in
// `commitPaths`); a file that already exists is registered as found and never rewritten.
// Never overwrites, never rewrites the envelope, never changes authority state, never
// commits. The result names the rigor level and its `rigorSource`. Prints one JSON result.
// Exit 0: registered | already-registered. Exit 2: refused (typed FPR-* code).
import { spawnSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerFeaturePackage } from "../lib/feature-package-registration.mjs";
import { readAcceptedDeliveryContract, readState } from "./pipeline-state.mjs";

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 10000 });
}

/** Commit order the operator must follow; the binding carries the candidate, so it comes last. */
function commitPlan(root, result) {
  const forceEnvelope = git(root, ["check-ignore", "-q", "--", result.envelopePath]).status === 0;
  const trackedEnvelope = git(root, ["ls-files", "--error-unmatch", "--", result.envelopePath]).status === 0;
  // Files this run generated (a missing acceptance pointer, a missing result record) belong to the same commit.
  const generatedPaths = (result.generated ?? []).map((entry) => entry.path);
  const steps = [
    { step: 1, action: forceEnvelope && !trackedEnvelope ? "git add -f -- <envelopePath>" : "git add -- <envelopePath> (skip when already tracked)" },
    { step: 2, action: "git add -- <manifestPath>" + (generatedPaths.length > 0 ? " and every generated path in commitPaths" : "") },
    { step: 3, action: "commit all of commitPaths in one commit (Conventional Commits, the dispatch trailers your role requires)" },
    { step: 4, action: "only then generate the item binding: dispatch-briefing.mjs binding --root <root> ... (a binding generated before this commit carries a stale candidate)" },
  ];
  return { commitPaths: [result.manifestPath, result.envelopePath, ...generatedPaths], envelopeTracked: trackedEnvelope, envelopeIgnored: forceEnvelope, order: steps };
}

export function runRegisterFeaturePackage(argv, out = (text) => process.stdout.write(text)) {
  const rootIndex = argv.indexOf("--root");
  const rootValue = rootIndex >= 0 ? argv[rootIndex + 1] : undefined;
  if (argv.length !== 2 || rootIndex !== 0 || typeof rootValue !== "string" || rootValue === "" || rootValue.startsWith("--")) {
    out(`${JSON.stringify({ schema: "pipeline.feature-package-registration.v1", status: "refused", code: "FPR-ARGS", reason: "usage: register-feature-package.mjs --root <root>" })}\n`);
    return 2;
  }
  let root;
  try { root = realpathSync(resolve(rootValue)); if (!statSync(root).isDirectory()) throw new Error("not a directory"); }
  catch {
    out(`${JSON.stringify({ schema: "pipeline.feature-package-registration.v1", status: "refused", code: "FPR-ARGS", reason: "--root does not resolve to a directory" })}\n`);
    return 2;
  }
  const read = readState(root);
  if (read?.status !== "ok") {
    out(`${JSON.stringify({ schema: "pipeline.feature-package-registration.v1", status: "refused", code: "FPR-NO-APPROVED-PLAN", reason: "the project authority State is unavailable; run set-feature, submit-plan, present-plan and approve-plan first", stateStatus: read?.status ?? null })}\n`);
    return 2;
  }
  const result = registerFeaturePackage({ root, state: read.state, readAcceptedDeliveryContract });
  const printed = result.status === "registered" || result.status === "already-registered" ? { ...result, ...commitPlan(root, result) } : result;
  out(`${JSON.stringify(printed)}\n`);
  return result.status === "refused" ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runRegisterFeaturePackage(process.argv.slice(2));
}
