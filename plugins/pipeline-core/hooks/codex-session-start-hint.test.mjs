#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { main, sessionStartDecision, sessionStartMessage } from "./codex-session-start-hint.mjs";
import { buildResumeHint } from "../lib/resume-hint.mjs";

const root = mkdtempSync(join(tmpdir(), "codex-session-start-hint-"));
const script = fileURLToPath(new URL("./codex-session-start-hint.mjs", import.meta.url));
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
  assert.match(governed.context, /Operating Model and compiled manifest are the gate authority/u);
  assert.match(governed.context, /ordinary implementation, focused tests, commits, Verify, Critic preparation/u);
  assert.match(governed.context, /Do not invent a human checkpoint for routine work/u);
  assert.match(governed.context, /A guard denial is not by itself a human gate/u);

  // 2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript:
  // a mandatory, unconditional (no resume-hint card required) instruction to locate and read the
  // session's own most recent prior Codex rollout transcript, bounded and never a gate.
  assert.match(governed.context, /locate and read your own most recent PRIOR Codex rollout transcript/u);
  assert.match(governed.context, /\$CODEX_HOME\/sessions \(or ~\/\.codex\/sessions when CODEX_HOME is unset\)/u);
  assert.match(governed.context, /bound the read to the most recent handful of tool-call, tool-result and error entries/u);
  assert.match(governed.context, /never quote large raw excerpts into any git-tracked file/u);
  assert.match(governed.context, /say so honestly rather than claiming this step was done/u);

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

  const fresh = mkdtempSync(join(tmpdir(), "codex-session-start-native-cwd-"));
  try {
    const governedCwd = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: fresh },
    });
    assert.equal(governedCwd.status, 0, governedCwd.stderr);
    assert.equal(JSON.parse(governedCwd.stdout).systemMessage, governed.message);

    const optionalCwd = spawnSync(process.execPath, [script], {
      cwd: fresh,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    assert.equal(optionalCwd.status, 0, optionalCwd.stderr);
    assert.equal(JSON.parse(optionalCwd.stdout).systemMessage, optional.message);
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }

  // NVA-BL-72: an `available` resume-hint card must be surfaced through this SessionStart
  // hook's own `additionalContext` -- its full content (intent/scope/constraints/questions/
  // progress), not merely a passive "a card exists" flag. This is the mandatory-read
  // mechanism: text delivered unbidden into the next session's context, at the same
  // `startup|resume|clear` trigger this hook already fires on.
  assert.doesNotMatch(governed.context, /Resume-hint intent:/u, "no card was captured yet; nothing should be injected");
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  const hint = buildResumeHint({
    context: {
      intent: "Resume the resume-hint mandatory-read work.",
      scope: ["SessionStart hook only"],
      constraints: ["No transcript reading"],
      questions: ["Any remaining gap?"],
      progress: ["hit a lifecycle-not-ready denial; resolved via typed inspection"],
    },
  });
  writeFileSync(join(root, "project", "resume-hint.json"), `${JSON.stringify(hint, null, 2)}\n`);
  const withHint = sessionStartDecision(root);
  assert.match(withHint.context, /MUST be read now/u);
  assert.match(withHint.context, /Resume-hint intent: Resume the resume-hint mandatory-read work\./u);
  assert.match(withHint.context, /Resume-hint scope: SessionStart hook only/u);
  assert.match(withHint.context, /Resume-hint constraints: No transcript reading/u);
  assert.match(withHint.context, /Resume-hint questions: Any remaining gap\?/u);
  assert.match(withHint.context, /Resume-hint progress: hit a lifecycle-not-ready denial; resolved via typed inspection/u);
  // The rest of the governed message/context is unchanged, only extended.
  assert.match(withHint.context, /A guard denial is not by itself a human gate/u);
  assert.equal(withHint.message, governed.message);

  console.log("codex-session-start-hint: 22 passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
