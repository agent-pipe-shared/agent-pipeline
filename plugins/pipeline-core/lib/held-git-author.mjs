// SPDX-License-Identifier: SUL-1.0
/**
 * PO decision 2026-11-10: the author answered in onboarding goes into the repository's local Git config directly before the first commit.
 * Live on native Windows, the answer was held but nothing wrote it, and the first commit carried the global account's identity.
 * Only a value the PO answered is written, only where no repository-local value exists; a project that sets its own stays untouched.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";

import { initialAnswersReceipt, intakeGitAuthor } from "./project-onboarding-v3-author-identity.mjs";
import { readOnboardingIntakeCheckpoint } from "./onboarding-continuity.mjs";

function localValue(root, key, spawn) {
  const probe = spawn("git", ["config", "--local", "--get", key], { cwd: root, encoding: "utf8", timeout: 5_000 });
  return probe.status === 0 ? String(probe.stdout ?? "").trim() : "";
}

function heldAuthor(root, deps) {
  const receipt = (deps.initialAnswersReceipt ?? initialAnswersReceipt)(root, fs);
  if (receipt?.gitAuthorName && receipt?.gitAuthorEmail) return { name: receipt.gitAuthorName, email: receipt.gitAuthorEmail };
  return intakeGitAuthor((deps.readOnboardingIntakeCheckpoint ?? readOnboardingIntakeCheckpoint)({ rootDir: root, repositoryCapability: "local", spawn: deps.spawn ?? spawnSync }));
}

/** Writes each missing key from the held answer. Never throws: a commit is not stopped by this step. */
export function applyHeldGitAuthor(root, deps = {}) {
  const spawn = deps.spawn ?? spawnSync;
  try {
    const missing = [["user.name", "name"], ["user.email", "email"]].filter(([key]) => localValue(root, key, spawn) === "");
    if (missing.length === 0) return { status: "already-configured" };
    const held = heldAuthor(root, deps);
    if (!held) return { status: "nothing-held" };
    for (const [key, field] of missing) {
      const written = spawn("git", ["config", "--local", key, held[field]], { cwd: root, encoding: "utf8", timeout: 5_000 });
      if (written.status !== 0) return { status: "unavailable" };
    }
    return { status: "applied", keys: missing.map(([key]) => key) };
  } catch {
    return { status: "unavailable" };
  }
}
