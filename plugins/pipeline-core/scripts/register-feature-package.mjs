#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// register-feature-package.mjs --root <root> [--add-review-unit | --add-diagnostic-evidence <path>]
//
// `--add-diagnostic-evidence <path>` (D165-CDR) registers a Critic diagnostic (a file under
// `specs/<feature>/evidence/`, produced by critic-diagnostic-evidence.mjs) and the log it names as
// immutable candidate-evidence entries of the feature manifest, after validating it against its own
// recorded candidate; it prints the paths to commit.
//
// `--add-review-unit` (PF-34) adds the Critic review unit and its manifest entry to a feature
// registered before the unit existed; it prints the two paths to commit and the review base.
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
import { addCriticDeltaRequest, addCriticDiagnosticEvidence, addCriticReviewLineage, addCriticReviewUnit, registerFeaturePackage } from "../lib/feature-package-registration.mjs";
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

export const REGISTER_FEATURE_PACKAGE_HELP = [
  "register-feature-package.mjs --root <root> [--add-review-unit | --add-diagnostic-evidence <path> | --add-review-lineage --packet <packetId> | --add-delta-request <input.json>]",
  "",
  "Critic diagnostic evidence route (run in this order):",
  "  1. Produce the diagnostic with scripts/critic-diagnostic-evidence.mjs.",
  "  2. Register it WITHOUT committing first (registration reads the working tree): register-feature-package.mjs --root <root> --add-diagnostic-evidence <path>",
  "  3. Commit the artifact, its log and the manifest the registration names in ONE evidence-only commit (the only form the admission accepts).",
  "  4. Rerun critic-dispatch-preflight.mjs with --registration-commit <that commit>.",
  "  5. A delta request that moves a trust boundary or is impact-ambiguous is admitted as an effective FULL round of the same course (RE-DELTA-FALLBACK-FULL); the verb says so.",
  "  6. If the range contains the handover file or a retained Critic result, first run critic-correction-input-bindings.mjs derive --root <root> --base <base> --head <candidate> --out <file under scratch/> and pass that file as --correction-input-bindings <file> (admit and finalize: review.correctionInputBindings, same value).",
  "",
  "Critic course lineage route (PF-94; register round N BEFORE the next correction commit):",
  "  1. Finalize the course round (session-critic-finalizer) so the packet is consumed.",
  "  2. Register it: register-feature-package.mjs --root <root> --add-review-lineage --packet <packetId>",
  "  3. Commit the manifest and the critic-lineage file the registration names, in one evidence-only commit.",
  "",
  "Critic delta request route (PF-94) for round 2 and later (run in this order):",
  "  1. The lineage of the last round is registered and committed (route above).",
  "  2. Make the correction commit.",
  "  3. Produce the diagnostic for it, register it (--add-diagnostic-evidence, route above), then commit artifact, log and manifest in one evidence-only commit.",
  "  4. Write the input JSON with exactly these keys and nothing else:",
  "     changedBehaviorClaims   list of claim ids the correction changes",
  "     pathInvariantMap        object: every changed path maps to its list of invariant ids",
  "     coordinatorImpactConfirmed  true when the Coordinator confirmed the impact",
  "     trustBoundaryChanged    true when the correction moves a trust boundary",
  "     impactAmbiguous         true when the impact cannot be told",
  "     pathInvariantMap must have exactly the changed paths as keys; a wrong map is refused (FPR-DELTA-MAP) with the changed paths printed.",
  "     If <input.json> does not exist yet, step 5 writes a PATH SKELETON there (the changed paths, an empty list each; never the four judgment fields) and refuses (FPR-DELTA-INPUT-PATH); complete it and rerun.",
  "  5. Run: register-feature-package.mjs --root <root> --add-delta-request <input.json>",
  "  6. Commit the manifest and the request file the verb names (evidence-only commit).",
  "  7. Rerun critic-dispatch-preflight.mjs with the arguments the verb prints.",
  "  8. If the range contains the handover file or a retained Critic result, first run critic-correction-input-bindings.mjs derive --root <root> --base <base> --head <candidate> --out <file under scratch/> and pass that file as --correction-input-bindings <file> (admit and finalize: review.correctionInputBindings, same value).",
  "",
  "Late lineage: if correction commits already follow a consumed round, its lineage can no longer be registered (CCA-TRANSPORT-SOURCE-DRIFT).",
  "  Retire the old batch with session-critic-finalizer inspect-course-takeover and supersede-course-takeover, then rerun round 1 on the course path.",
  "",
].join("\n");

export function runRegisterFeaturePackage(argv, out = (text) => process.stdout.write(text)) {
  if (argv.length === 1 && argv[0] === "--help") { out(REGISTER_FEATURE_PACKAGE_HELP); return 0; }
  const rootIndex = argv.indexOf("--root");
  const rootValue = rootIndex >= 0 ? argv[rootIndex + 1] : undefined;
  // PF-34: `--add-review-unit` adds the Critic review unit to a feature registered before it existed.
  const addReviewUnit = argv.length === 3 && argv[2] === "--add-review-unit";
  // D165-CDR: `--add-diagnostic-evidence <path>` registers Critic diagnostic evidence in the feature manifest.
  const addDiagnostic = argv.length === 4 && argv[2] === "--add-diagnostic-evidence" && typeof argv[3] === "string" && argv[3] !== "" && !argv[3].startsWith("--");
  // PF-94: `--add-review-lineage --packet <packetId>` registers the lineage record of a consumed course round.
  const addLineage = argv.length === 5 && argv[2] === "--add-review-lineage" && argv[3] === "--packet" && /^[a-f0-9]{32}$/u.test(argv[4] ?? "");
  // PF-94: `--add-delta-request <input.json>` builds, writes and registers the delta request of the next Critic round.
  const addDelta = argv.length === 4 && argv[2] === "--add-delta-request" && typeof argv[3] === "string" && argv[3] !== "" && !argv[3].startsWith("--");
  if ((argv.length !== 2 && !addReviewUnit && !addDiagnostic && !addLineage && !addDelta) || rootIndex !== 0 || typeof rootValue !== "string" || rootValue === "" || rootValue.startsWith("--")) {
    out(`${JSON.stringify({ schema: "pipeline.feature-package-registration.v1", status: "refused", code: "FPR-ARGS", reason: "usage: register-feature-package.mjs --root <root> [--add-review-unit | --add-diagnostic-evidence <path>]" })}\n`);
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
  if (addDelta) {
    const added = addCriticDeltaRequest({ root, inputPath: argv[3], readAcceptedDeliveryContract });
    out(`${JSON.stringify(added)}\n`);
    return added.status === "refused" ? 2 : 0;
  }
  if (addLineage) {
    const added = addCriticReviewLineage({ root, packetId: argv[4], readAcceptedDeliveryContract });
    out(`${JSON.stringify(added)}\n`);
    return added.status === "refused" ? 2 : 0;
  }
  if (addDiagnostic) {
    const added = addCriticDiagnosticEvidence({ root, state: read.state, path: argv[3], readAcceptedDeliveryContract });
    out(`${JSON.stringify(added)}\n`);
    return added.status === "refused" ? 2 : 0;
  }
  if (addReviewUnit) {
    const added = addCriticReviewUnit({ root, state: read.state, readAcceptedDeliveryContract });
    out(`${JSON.stringify(added)}\n`);
    return added.status === "refused" ? 2 : 0;
  }
  const result = registerFeaturePackage({ root, state: read.state, readAcceptedDeliveryContract });
  const printed = result.status === "registered" || result.status === "already-registered" ? { ...result, ...commitPlan(root, result) } : result;
  out(`${JSON.stringify(printed)}\n`);
  return result.status === "refused" ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runRegisterFeaturePackage(process.argv.slice(2));
}
