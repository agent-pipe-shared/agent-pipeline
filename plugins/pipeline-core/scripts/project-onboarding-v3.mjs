#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { pathToFileURL } from "node:url";
import {
  applyProjectOnboardingManifestRepairV4,
  applyProjectOnboardingKickoffV4,
  applyProjectOnboardingKickoffPromotionV4,
  applyProjectOnboardingLifecycleV4,
  applyProjectOnboardingManifestRepair,
  inspectProjectOnboardingV3,
  planProjectOnboardingManifestRepair,
  planProjectOnboardingSourceRecovery,
  planProjectOnboardingKickoffV4,
  planProjectOnboardingKickoffPromotionV4,
  planProjectOnboardingLifecycleV4,
  planProjectOnboardingSourceRecoveryV4,
} from "../lib/project-onboarding-v3.mjs";

function usage() {
  return [
    "Usage: node plugins/pipeline-core/scripts/project-onboarding-v3.mjs <inspect|plan|plan-source-recovery|plan-manifest-repair|apply-manifest-repair|apply-portable-seed|plan-runtime|initialize-runtime|plan-repair|apply-repair|plan-readback|apply-readback> --root <project-dir> [--intent onboarding|bootstrap|session|dispatch] [--plan-sha256 <sha256>] [--activate]",
    "       node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff <plan|apply> --root <project-dir> --goal <text> [--plan-sha256 <sha256>] [--activate]",
    "       node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff promote <plan|apply> --root <project-dir> --profile <epic|feature|mini> --id <id> --plan-path <path> --prd-path <path> --spec-path <path> [--plan-sha256 <sha256>] [--activate]",
    "       node plugins/pipeline-core/scripts/project-onboarding-v3.mjs continuity inspect --root <project-dir>",
  ].join("\n");
}
function parse(args) {
  const output = { activate: false, intent: "onboarding" };
  let start = 0;
  if (args[0] === "kickoff" && args[1] === "promote") {
    if (!["plan", "apply"].includes(args[2])) return { error: "kickoff promote requires plan or apply" };
    output.command = `kickoff-promote-${args[2]}`;
    start = 3;
  } else if (args[0] === "kickoff") {
    if (!["plan", "apply"].includes(args[1])) return { error: "kickoff requires plan or apply" };
    output.command = `kickoff-${args[1]}`;
    start = 2;
  } else if (args[0] === "continuity") {
    if (args[1] !== "inspect") return { error: "continuity requires inspect" };
    output.command = "continuity-inspect";
    start = 2;
  } else if (["inspect", "plan", "plan-source-recovery", "plan-manifest-repair", "apply-manifest-repair", "apply-portable-seed", "plan-runtime", "initialize-runtime", "plan-repair", "apply-repair", "plan-readback", "apply-readback"].includes(args[0])) {
    output.command = args[0];
    start = 1;
  }
  for (let index = start; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") { const root = args[index + 1]; if (!root || root.startsWith("--")) return { error: "--root requires a project directory" }; output.root = root; index += 1; }
    else if (arg === "--intent") { const intent = args[index + 1]; if (!["onboarding", "bootstrap", "session", "dispatch"].includes(intent)) return { error: "--intent must be onboarding, bootstrap, session, or dispatch" }; output.intent = intent; index += 1; }
    else if (arg === "--goal") { const goal = args[index + 1]; if (goal === undefined) return { error: "--goal requires one argv text element" }; output.goal = goal; index += 1; }
    else if (arg === "--profile") { const profile = args[index + 1]; if (!["epic", "feature", "mini"].includes(profile)) return { error: "--profile must be epic, feature, or mini" }; output.profile = profile; index += 1; }
    else if (arg === "--id") { const featureId = args[index + 1]; if (!featureId || featureId.startsWith("--")) return { error: "--id requires a feature id" }; output.featureId = featureId; index += 1; }
    else if (arg === "--plan-path") { const planPath = args[index + 1]; if (!planPath || planPath.startsWith("--")) return { error: "--plan-path requires a repository path" }; output.planPath = planPath; index += 1; }
    else if (arg === "--prd-path") { const prdPath = args[index + 1]; if (!prdPath || prdPath.startsWith("--")) return { error: "--prd-path requires a repository path" }; output.prdPath = prdPath; index += 1; }
    else if (arg === "--spec-path") { const specPath = args[index + 1]; if (!specPath || specPath.startsWith("--")) return { error: "--spec-path requires a repository path" }; output.specPath = specPath; index += 1; }
    else if (arg === "--plan-sha256") { const digest = args[index + 1]; if (!/^[a-f0-9]{64}$/u.test(digest ?? "")) return { error: "--plan-sha256 requires a lowercase SHA-256 digest" }; output.planSha256 = digest; index += 1; }
    else if (arg === "--activate") output.activate = true;
    else if (arg === "--help" || arg === "-h") output.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!output.help && !output.command) return { error: "one command is required" };
  if (!output.help && !output.root) return { error: "--root is required" };
  if (output.command?.startsWith("kickoff-promote-")) {
    if (output.goal !== undefined) return { error: "--goal is not valid for kickoff promotion" };
    if (![output.profile, output.featureId, output.planPath, output.prdPath, output.specPath].every(Boolean)) return { error: "kickoff promotion requires --profile --id --plan-path --prd-path --spec-path" };
  } else if (output.command?.startsWith("kickoff-") && output.goal === undefined) return { error: "kickoff plan/apply requires --goal <text>" };
  else if (!output.command?.startsWith("kickoff-") && output.goal !== undefined) return { error: "--goal is only valid for kickoff plan/apply" };
  if (output.activate && !["apply-portable-seed", "initialize-runtime", "apply-repair", "apply-readback", "apply-manifest-repair", "kickoff-apply", "kickoff-promote-apply"].includes(output.command)) return { error: "--activate is only valid for an apply command" };
  return output;
}
export function main(args = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
  writeError = process.stderr.write.bind(process.stderr),
  deps,
} = {}) {
  const options = parse(args);
  if (options.help) { write(`${usage()}\n`); return 0; }
  if (options.error) { write(`${usage()}\n${options.error}\n`); return 2; }
  let output;
  try {
    if (options.command === "inspect") output = inspectProjectOnboardingV3({ rootDir: options.root, deps, intent: options.intent });
    else if (options.command === "plan-source-recovery") output = planProjectOnboardingSourceRecovery({ rootDir: options.root, deps });
    else if (options.command === "plan-manifest-repair") output = planProjectOnboardingManifestRepair({ rootDir: options.root, deps });
    else if (options.command === "apply-manifest-repair") output = applyProjectOnboardingManifestRepair({ rootDir: options.root, planSha256: options.planSha256, activate: options.activate, deps });
    else if (options.command === "continuity-inspect") output = inspectProjectOnboardingV3({ rootDir: options.root, deps, intent: "onboarding" });
    else if (options.command === "plan") output = planProjectOnboardingLifecycleV4({ rootDir: options.root, deps, operation: "portable" });
    else if (options.command === "plan-runtime") output = planProjectOnboardingLifecycleV4({ rootDir: options.root, deps, operation: "runtime" });
    else if (options.command === "plan-repair") output = planProjectOnboardingLifecycleV4({ rootDir: options.root, deps, operation: "repair" });
    else if (options.command === "plan-readback") output = planProjectOnboardingLifecycleV4({ rootDir: options.root, deps, operation: "readback" });
    else if (options.command === "plan-source-recovery") output = planProjectOnboardingSourceRecoveryV4({ rootDir: options.root, deps });
    else if (options.command === "plan-manifest-repair") output = planProjectOnboardingManifestRepairV4({ rootDir: options.root, deps });
    else if (options.command === "apply-manifest-repair") output = applyProjectOnboardingManifestRepairV4({
      rootDir: options.root,
      planSha256: options.planSha256,
      activate: options.activate,
      deps,
    });
    else if (options.command === "kickoff-plan") output = planProjectOnboardingKickoffV4({
      rootDir: options.root,
      goal: options.goal,
      deps,
    });
    else if (options.command === "kickoff-apply") output = applyProjectOnboardingKickoffV4({
      rootDir: options.root,
      goal: options.goal,
      planSha256: options.planSha256,
      activate: options.activate,
      deps,
    });
    else if (options.command === "kickoff-promote-plan") output = planProjectOnboardingKickoffPromotionV4({
      rootDir: options.root, profile: options.profile, featureId: options.featureId,
      planPath: options.planPath, prdPath: options.prdPath, specPath: options.specPath, deps,
    });
    else if (options.command === "kickoff-promote-apply") output = applyProjectOnboardingKickoffPromotionV4({
      rootDir: options.root, profile: options.profile, featureId: options.featureId,
      planPath: options.planPath, prdPath: options.prdPath, specPath: options.specPath,
      planSha256: options.planSha256, activate: options.activate, deps,
    });
    else {
      const operation = options.command === "initialize-runtime"
        ? "runtime"
        : options.command === "apply-repair"
          ? "repair"
          : options.command === "apply-readback"
            ? "readback"
            : "portable";
      output = applyProjectOnboardingLifecycleV4({
        rootDir: options.root,
        deps,
        operation,
        planSha256: options.planSha256,
        activate: options.activate,
      });
    }
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "ONBOARDING-ERROR";
    const message = String(error?.message ?? "onboarding command failed").replace(/[\r\n]+/gu, " ");
    writeError(`${code}: ${message}\n`);
    return 2;
  }
  write(`${JSON.stringify(output, null, 2)}\n`);
  if (["pipeline.codex-onboarding-kickoff-plan.v1", "pipeline.codex-onboarding-kickoff-promotion-plan.v1"].includes(output.schema)) return 0;
  return ["portable-seed-required", "runtime-initialization-required", "runtime-attestation-required", "restart-required", "kickoff-required", "host-repository-init-required", "ready", "migration-required", "adoption-required", "projection-drift"].includes(output.status) ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
