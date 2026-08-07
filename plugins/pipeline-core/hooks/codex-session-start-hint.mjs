#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Surface a concise, non-mutating Agent-Pipeline entry hint in every Codex session. */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

const GOVERNANCE_MARKERS = [
  ".agent-pipeline/core.lock.json",
  "pipeline.user.yaml",
  "project/pipeline.json",
  "project/pipeline.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
];

export function sessionStartDecision(projectDir = process.cwd(), exists = existsSync) {
  let governed = false;
  try {
    const root = resolve(projectDir);
    governed = GOVERNANCE_MARKERS.some((marker) => exists(join(root, marker)));
  } catch {
    // A session-start hint must never prevent Codex from opening a workspace.
  }
  if (governed) {
    const message =
      "Agent Pipeline is active for this repository. Before project work, run pipeline-core:pipeline-start and report the resolved Pipeline version.";
    return {
      governed,
      message,
      context: [
        message,
        "This governed-repository bootstrap is mandatory; do not substitute a project-local script or stale cache path.",
        "After a ready bootstrap, the Operating Model and compiled manifest are the gate authority: continue ordinary implementation, focused tests, commits, Verify, Critic preparation and state readback autonomously.",
        "Do not invent a human checkpoint for routine work. Request the PO only for a configured decision gate, required final acceptance, an irreversible/external consequence, or a typed hard block with no safe returned recovery action.",
        "A guard denial is not by itself a human gate: first execute its exact typed read-only or lifecycle recovery action when one is supplied.",
      ].join(" "),
    };
  }
  const message =
    "Agent Pipeline is available as an optional project workflow, but it is not active in this folder. Ask the user whether they want to install it before running any Pipeline command.";
  return {
    governed,
    message,
    context: [
      message,
      "On the user's first request, briefly explain that Agent Pipeline adds a structured, verifiable delivery workflow, then ask whether it should be installed for this repository.",
      "End that turn and wait.",
      "Before an explicit affirmative answer, do not invoke pipeline-core:pipeline-start, inspect or plan onboarding, initialize Git, or change project files.",
      "After consent, invoke pipeline-core:pipeline-start; every returned mutating lifecycle action still keeps its own digest-bound confirmation.",
      "Reply in the user's language.",
    ].join(" "),
  };
}

export function sessionStartMessage(projectDir = process.cwd(), exists = existsSync) {
  return sessionStartDecision(projectDir, exists).message;
}

export function main({ projectDir, exists } = {}) {
  const decision = sessionStartDecision(projectDir, exists);
  process.stdout.write(`${JSON.stringify({
    systemMessage: decision.message,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: decision.context,
    },
  })}\n`);
}

if (isDirectInvocation(import.meta.url)) main();
