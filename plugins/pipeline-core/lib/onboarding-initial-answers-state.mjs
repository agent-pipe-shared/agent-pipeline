// SPDX-License-Identifier: SUL-1.0
/**
 * Resolve the first-answer receipt without conflating a local Git repository
 * with a host-managed repository whose .git and .codex controls are reserved.
 * This resolver is deliberately read-only unless create is explicitly true;
 * it does not publish an answer or infer PO consent.
 */
import { lstatSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveOnboardingPrivateState } from "./codex-onboarding-runtime.mjs";

export const INITIAL_ANSWERS_LOCAL_RECEIPT = ".git/agent-pipeline/onboarding-initial-answers.json";
export const INITIAL_ANSWERS_SCHEMA = "pipeline.onboarding-initial-answers.v1";

function hasGitControlInAncestors(root) {
  let cursor = root;
  while (true) {
    try { lstatSync(join(cursor, ".git")); return true; }
    catch (error) { if (error?.code !== "ENOENT") return true; }
    const parent = dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}

export function resolveInitialAnswersState(rootDir, repositoryCapability, options = {}) {
  const root = realpathSync(rootDir);
  if (repositoryCapability === "local") {
    if (options.create === true) throw new Error("local initial-answer receipt directory is owned by the existing local writer");
    // The receipt is repository-wide private state. Resolve it through the
    // same canonical Git common-directory authority as the local onboarding
    // private-state writer: in a linked worktree `.git` is a pointer file,
    // while the common directory remains the stable repository identity.
    let privateState;
    try { privateState = resolveOnboardingPrivateState(root, "local", options); }
    catch (error) {
      // Before local Git initialization, read-only inspection still needs an
      // absent receipt path so ordinary greenfield onboarding can continue.
      // This fallback is forbidden for writers and only applies when there is
      // no .git control at all; malformed/pointer controls remain fail-closed.
      if (options.requireGit !== true && !hasGitControlInAncestors(root)) {
        return { root, repositoryCapability, receipt: join(root, INITIAL_ANSWERS_LOCAL_RECEIPT), pending: null };
      }
      throw error;
    }
    return {
      root,
      repositoryCapability,
      receipt: join(dirname(privateState.directory), "onboarding-initial-answers.json"),
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
