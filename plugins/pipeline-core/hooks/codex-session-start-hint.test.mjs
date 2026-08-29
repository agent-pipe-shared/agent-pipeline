#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { main, sessionStartDecision, sessionStartMessage } from "./codex-session-start-hint.mjs";
import {
  buildResumeHint, captureResumeHint, queryResumeHintConsumption, recordResumeHintCardDigest,
} from "../lib/resume-hint.mjs";
import {
  applyOnboardingIntakeCapture, applyOnboardingIntakeConsent, resolveIntakeCheckpointPaths,
} from "../lib/onboarding-continuity.mjs";

const root = mkdtempSync(join(tmpdir(), "codex-session-start-hint-"));
const script = fileURLToPath(new URL("./codex-session-start-hint.mjs", import.meta.url));
try {
  const optional = sessionStartDecision(root);
  assert.equal(optional.governed, false);
  assert.match(optional.message, /optional project workflow/u);
  assert.match(optional.message, /before any project work/u);
  assert.doesNotMatch(optional.message, /before running any Pipeline command/u);
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

  // 2026-08-29-undocumented-transcript-fallback-selects-wrong-file-by-mtime: selection must be
  // scoped by project identity FIRST, mtime only a tiebreaker within that matching set -- never
  // a plain most-recent-overall ranking that can pick a DIFFERENT project's newer transcript
  // over this project's own older one.
  assert.match(governed.context, /pipeline\.deterministic-transcript-selection/u);
  assert.match(governed.context, /first scope by PROJECT IDENTITY, not recency/u);
  assert.match(governed.context, /discard outright any transcript whose recorded project does not match this repository's own root/u);
  assert.match(
    governed.context,
    /a more-recently-modified transcript from a DIFFERENT project must never be selected over an older one belonging to THIS project/u,
  );
  assert.match(governed.context, /use modification time as a tiebreaker within the remaining project-matching set/u);
  assert.match(governed.context, /if no transcript matches this project's identity, say so honestly and continue/u);
  assert.match(governed.context, /never widen the search back to the most recent transcript overall/u);

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

  // NVA-W4-09: on source === "compact", the hint must reuse post-compact-reground.mjs's
  // own PCR-READY/PCR-BLOCKED projection instead of unconditionally instructing a full
  // re-bootstrap. First, no state present -> a fail-closed PCR stop, never the bootstrap text.
  let compactStdout = "";
  const originalWriteCompact = process.stdout.write;
  process.stdout.write = (chunk) => { compactStdout += chunk; return true; };
  try {
    main({ projectDir: root, input: { source: "compact" } });
  } finally {
    process.stdout.write = originalWriteCompact;
  }
  assert.doesNotMatch(compactStdout, /run pipeline-core:pipeline-start/u);
  assert.match(compactStdout, /PCR-OUTER-INVALID/u);

  // Second, a valid ready continuity state -> the lightweight reground continuation,
  // not the full bootstrap instruction, via the real CLI (exercises stdin JSON parsing).
  const compactRoot = mkdtempSync(join(tmpdir(), "codex-session-start-compact-"));
  try {
    mkdirSync(join(compactRoot, ".claude"), { recursive: true });
    const hex = (ch) => ch.repeat(64);
    const continuityState = {
      schema: "pipeline.state.v0",
      activeFeature: { id: "f1", planPath: "specs/prd.md", phase: "implementation" },
      continuity: {
        schema: "pipeline.continuity.v0",
        featureId: "f1",
        revision: 4,
        runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
        authority: {
          prd: { path: "specs/prd.md", sha256: hex("a") },
          spec: { path: "specs/spec.md", sha256: hex("b") },
          result: { path: "specs/result.md", sha256: hex("c") },
        },
        queueHead: {
          packageId: "P1",
          actionId: "post-compact-reground",
          nextAction: "dispatch",
          productRetryCount: 0,
          environmentRerouteCount: 0,
          dispatch: null,
        },
        blocker: null,
        acknowledgedFinal: null,
        resume: { mode: "resume-on-next-turn", sourceRevision: 4, reasonCode: "compact-reload" },
        recovery: null,
        decisionTxn: null,
        capacity: {
          concurrencyLimit: 3,
          reservedCriticSlots: 1,
          reservedRecoverySlots: 1,
          fallbackPolicy: "defer",
        },
      },
    };
    writeFileSync(join(compactRoot, ".claude", "pipeline-state.json"), `${JSON.stringify(continuityState)}\n`);
    const compactCli = spawnSync(process.execPath, [script], {
      cwd: compactRoot,
      encoding: "utf8",
      input: JSON.stringify({ source: "compact" }),
    });
    assert.equal(compactCli.status, 0, compactCli.stderr);
    const compactPayload = JSON.parse(compactCli.stdout);
    assert.doesNotMatch(compactPayload.systemMessage, /run pipeline-core:pipeline-start/u);
    assert.match(compactPayload.systemMessage, /Re-grounding after \/compact\./u);
    assert.match(compactPayload.systemMessage, /"code":"PCR-READY"/u);

    // A stdin read failure (empty/malformed) must still fall back safely, never crash.
    const nonCompactCli = spawnSync(process.execPath, [script], {
      cwd: compactRoot,
      encoding: "utf8",
      input: "",
    });
    assert.equal(nonCompactCli.status, 0, nonCompactCli.stderr);
    assert.equal(JSON.parse(nonCompactCli.stdout).hookSpecificOutput.hookEventName, "SessionStart");
  } finally {
    rmSync(compactRoot, { recursive: true, force: true });
  }

  // NVA-R11-RESUMECONSUME: this hook's own resumeHintContextLines() is the real bootstrap
  // consumption step -- Stage 2's other half. A separate, git-initialized root is required
  // here (recordResumeHintConsumption's private-state resolver needs a usable `.git`, which
  // `root` above deliberately never has, and its own tests above rely on that).
  const consumptionRoot = mkdtempSync(join(tmpdir(), "codex-session-start-hint-consume-"));
  try {
    mkdirSync(join(consumptionRoot, "project"), { recursive: true });
    writeFileSync(join(consumptionRoot, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
    const git = spawnSync("git", ["init", "-q"], { cwd: consumptionRoot, encoding: "utf8", shell: false });
    assert.equal(git.status, 0, git.stderr);

    const context = {
      intent: "Resume the resume-consumption wiring work.",
      scope: ["SessionStart consumption wiring only"],
      constraints: ["No transcript reading"],
      questions: ["Any remaining gap?"],
    };
    captureResumeHint({ rootDir: consumptionRoot, context });
    const { cardDigest } = recordResumeHintCardDigest({ rootDir: consumptionRoot, card: context });

    // No sessionId at all: the card content still reaches context (unchanged behaviour),
    // and nothing is recorded -- best-effort, observation-only, never a silent requirement.
    const noSession = sessionStartDecision(consumptionRoot);
    assert.match(noSession.context, /Resume-hint intent: Resume the resume-consumption wiring work\./u);
    assert.equal(
      queryResumeHintConsumption({ rootDir: consumptionRoot, sessionId: "session-none" }).outcome,
      "not-consumed",
      "no receipt should exist yet for any session",
    );

    // A real sessionId: the SAME call that surfaces the card's content into context must
    // also record a matching consumption receipt for that exact session.
    const withSession = sessionStartDecision(consumptionRoot, undefined, "session-real");
    assert.match(withSession.context, /Resume-hint intent: Resume the resume-consumption wiring work\./u);
    const queried = queryResumeHintConsumption({ rootDir: consumptionRoot, sessionId: "session-real" });
    assert.equal(queried.outcome, "consumed");
    assert.equal(queried.cardDigest, cardDigest);

    // A DIFFERENT session never having been surfaced this card must still show not-consumed --
    // consumption is per-session, never a blanket "someone read it" flag.
    assert.equal(
      queryResumeHintConsumption({ rootDir: consumptionRoot, sessionId: "session-other" }).outcome,
      "not-consumed",
    );

    // Full CLI path: main({ input: { session_id } }) must thread the real hook payload's
    // session_id through to the same recording call, exercising the exact wiring a live
    // Claude/Codex SessionStart event drives.
    const cliRoot = mkdtempSync(join(tmpdir(), "codex-session-start-hint-consume-cli-"));
    try {
      mkdirSync(join(cliRoot, "project"), { recursive: true });
      writeFileSync(join(cliRoot, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
      const cliGit = spawnSync("git", ["init", "-q"], { cwd: cliRoot, encoding: "utf8", shell: false });
      assert.equal(cliGit.status, 0, cliGit.stderr);
      captureResumeHint({ rootDir: cliRoot, context });
      recordResumeHintCardDigest({ rootDir: cliRoot, card: context });

      const cliResult = spawnSync(process.execPath, [script], {
        cwd: cliRoot,
        encoding: "utf8",
        input: JSON.stringify({ session_id: "session-cli" }),
      });
      assert.equal(cliResult.status, 0, cliResult.stderr);
      assert.match(JSON.parse(cliResult.stdout).hookSpecificOutput.additionalContext, /Resume-hint intent: Resume the resume-consumption wiring work\./u);
      assert.equal(
        queryResumeHintConsumption({ rootDir: cliRoot, sessionId: "session-cli" }).outcome,
        "consumed",
        "the real hook payload's session_id must have been recorded as a consumption receipt",
      );
    } finally {
      rmSync(cliRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(consumptionRoot, { recursive: true, force: true });
  }

  // NVA-CF-RESUMEVERBATIM-HOOK: the onboarding intake checkpoint's own verbatim
  // materialInput (the user's own design-input chunks) and answered values must also reach
  // this hook's additionalContext, in addition to the existing distilled-card lines above --
  // mirroring what scripts/resume-hint.mjs's `inspect` CLI (NVA-RESUMEVERBATIM-1) already
  // does on a different, manual path. A real git root is required (readOnboardingIntake*'s
  // private-state resolver needs a usable `.git`, same reason the NVA-R11-RESUMECONSUME
  // block above uses its own separate root).
  const verbatimRoot = mkdtempSync(join(tmpdir(), "codex-session-start-hint-verbatim-"));
  try {
    mkdirSync(join(verbatimRoot, "project"), { recursive: true });
    writeFileSync(join(verbatimRoot, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
    const verbatimGit = spawnSync("git", ["init", "-q"], { cwd: verbatimRoot, encoding: "utf8", shell: false });
    assert.equal(verbatimGit.status, 0, verbatimGit.stderr);

    const verbatimContext = {
      intent: "Resume the resume-hint verbatim surfacing work.",
      scope: ["SessionStart hook only"],
      constraints: ["No transcript reading"],
      questions: ["Any remaining gap?"],
    };
    captureResumeHint({ rootDir: verbatimRoot, context: verbatimContext });

    // Card available, but no intake checkpoint at all yet -- unchanged: no new lines.
    const noCheckpoint = sessionStartDecision(verbatimRoot);
    assert.match(noCheckpoint.context, /Resume-hint intent: Resume the resume-hint verbatim surfacing work\./u);
    assert.doesNotMatch(noCheckpoint.context, /Resume-hint answered onboarding values/u);
    assert.doesNotMatch(noCheckpoint.context, /Resume-hint material input chunk/u);

    // Consent granted but nothing answered/captured yet -- an empty checkpoint is still
    // "unchanged" output, never a bare label with no content.
    applyOnboardingIntakeConsent({ rootDir: verbatimRoot, granted: true, activate: true });
    const emptyCheckpoint = sessionStartDecision(verbatimRoot);
    assert.doesNotMatch(emptyCheckpoint.context, /Resume-hint answered onboarding values/u);
    assert.doesNotMatch(emptyCheckpoint.context, /Resume-hint material input chunk/u);

    // Now seed real answered values and two verbatim material-input chunks.
    applyOnboardingIntakeConsent({
      rootDir: verbatimRoot, granted: true, activate: true,
      gitAuthor: { name: "Jane PO", email: "jane@example.com" },
      language: "en", profile: "feature",
    });
    const first = "Line one of a verbatim design brief.\nLine two, multi-line, unbounded by short-string caps.";
    const second = "A second, later chunk of user input -- unicode: café, 日本語.";
    applyOnboardingIntakeCapture({ rootDir: verbatimRoot, text: first, activate: true });
    applyOnboardingIntakeCapture({ rootDir: verbatimRoot, text: second, activate: true });

    const withVerbatim = sessionStartDecision(verbatimRoot);
    // Existing distilled-card lines stay present, unchanged, only extended.
    assert.match(withVerbatim.context, /Resume-hint intent: Resume the resume-hint verbatim surfacing work\./u);
    // New: answered onboarding values.
    assert.match(
      withVerbatim.context,
      /Resume-hint answered onboarding values \(already answered, do not re-ask\): commit author Jane PO <jane@example\.com>; operator language en; PO profile feature\./u,
    );
    // New: verbatim material input, byte-identical, in capture order, MUST-read framing.
    assert.match(withVerbatim.context, /MUST be read in full now, not treated as already condensed by the summary above \(2 chunk\(s\)\)/u);
    assert.match(
      withVerbatim.context,
      /Resume-hint material input chunk 1 of 2: Line one of a verbatim design brief\.\nLine two, multi-line, unbounded by short-string caps\./u,
    );
    assert.match(
      withVerbatim.context,
      /Resume-hint material input chunk 2 of 2: A second, later chunk of user input -- unicode: café, 日本語\./u,
    );

    // A read failure (malformed checkpoint bytes) must degrade to exactly the distilled-card
    // output -- never a throw, never a crash, never a partial/garbled new line.
    const { checkpoint: checkpointPath } = resolveIntakeCheckpointPaths({ rootDir: verbatimRoot });
    const validBytes = readFileSync(checkpointPath);
    writeFileSync(checkpointPath, "{ not valid json");
    const withMalformed = sessionStartDecision(verbatimRoot);
    assert.match(withMalformed.context, /Resume-hint intent: Resume the resume-hint verbatim surfacing work\./u);
    assert.doesNotMatch(withMalformed.context, /Resume-hint answered onboarding values/u);
    assert.doesNotMatch(withMalformed.context, /Resume-hint material input chunk/u);
    writeFileSync(checkpointPath, validBytes);
  } finally {
    rmSync(verbatimRoot, { recursive: true, force: true });
  }

  console.log("codex-session-start-hint: 48 passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
