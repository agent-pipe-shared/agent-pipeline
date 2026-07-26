#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main, sessionStartDecision, sessionStartMessage } from "./codex-session-start-hint.mjs";

const root = mkdtempSync(join(tmpdir(), "codex-session-start-hint-"));
try {
  const optional = sessionStartDecision(root);
  assert.equal(optional.governed, false);
  assert.match(optional.message, /optional project workflow/u);
  assert.match(optional.context, /ask whether it should be installed/u);
  assert.match(optional.context, /End that turn and wait/u);
  assert.match(optional.context, /do not invoke pipeline-core:pipeline-start/u);
  assert.doesNotMatch(optional.message, /run pipeline-core:pipeline-start/u);
  assert.equal(sessionStartMessage(root), optional.message);

  mkdirSync(join(root, ".claude"));
  writeFileSync(join(root, ".claude", "pipeline.json"), "{}\n");
  const governed = sessionStartDecision(root);
  assert.equal(governed.governed, true);
  assert.match(governed.message, /Agent Pipeline is active/u);
  assert.match(governed.message, /report the resolved Pipeline version/u);

  let stdout = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => { stdout += chunk; return true; };
  try {
    main({ projectDir: root });
  } finally {
    process.stdout.write = originalWrite;
  }
  const payload = JSON.parse(stdout);
  assert.equal(payload.systemMessage, governed.message);
  assert.equal(payload.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(payload.hookSpecificOutput.additionalContext, governed.context);

  console.log("codex-session-start-hint: 13 passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
