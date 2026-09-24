// SPDX-License-Identifier: SUL-1.0
/**
 * Resolve the first-answer receipt without conflating a local Git repository
 * with a host-managed repository whose .git and .codex controls are reserved.
 * This resolver is deliberately read-only unless create is explicitly true;
 * it does not publish an answer or infer PO consent.
 */
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { resolveOnboardingPrivateState } from "./codex-onboarding-runtime.mjs";

export const INITIAL_ANSWERS_LOCAL_RECEIPT = ".git/agent-pipeline/onboarding-initial-answers.json";
export const INITIAL_ANSWERS_SCHEMA = "pipeline.onboarding-initial-answers.v1";

export function resolveInitialAnswersState(rootDir, repositoryCapability, options = {}) {
  const root = realpathSync(rootDir);
  if (repositoryCapability === "local") {
    if (options.create === true) throw new Error("local initial-answer receipt directory is owned by the existing local writer");
    return {
      root,
      repositoryCapability,
      receipt: join(root, INITIAL_ANSWERS_LOCAL_RECEIPT),
      pending: null,
    };
  }
  if (repositoryCapability !== "host-managed") {
    throw new Error("repository capability cannot host initial-answer state");
  }
  const privateState = resolveOnboardingPrivateState(root, "host-managed", options);
  return {
    root,
    repositoryCapability,
    receipt: join(privateState.directory, "initial-answers.json"),
    pending: join(privateState.directory, "initial-answers-pending.json"),
  };
}
