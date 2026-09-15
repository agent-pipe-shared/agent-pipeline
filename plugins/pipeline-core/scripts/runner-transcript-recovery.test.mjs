#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { recoverRunnerTranscript } from "./runner-transcript-recovery.mjs";

function transcript(path, { cwd, sessionId, entries = [], malformed = false } = {}) {
  mkdirSync(join(path, "sessions", "2026", "09"), { recursive: true });
  const target = join(path, "sessions", "2026", "09", `${sessionId ?? "unknown"}.jsonl`);
  const lines = malformed
    ? ["not-json"]
    : [
      JSON.stringify({ type: "session_meta", payload: { cwd, session_id: sessionId } }),
      ...entries.map((entry) => JSON.stringify(entry)),
    ];
  writeFileSync(target, `${lines.join("\n")}\n`);
  return target;
}

test("recovery selects only an older project-matching Codex transcript and excludes the current session", () => {
  const fixture = mkdtempSync(join(tmpdir(), "runner-transcript-recovery-"));
  const project = join(fixture, "project");
  const foreign = join(fixture, "foreign");
  const codexHome = join(fixture, "codex-home");
  mkdirSync(project);
  mkdirSync(foreign);
  try {
    const prior = transcript(codexHome, {
      cwd: project,
      sessionId: "prior-session",
      entries: [{ type: "tool_result", tool_name: "exec_command", is_error: true, error: "GUARD-READ-SCOPE-OUTSIDE-ROOT" }],
    });
    const current = transcript(codexHome, {
      cwd: project,
      sessionId: "current-session",
      entries: [{ type: "tool_result", tool_name: "exec_command", is_error: true, error: "current only" }],
    });
    const other = transcript(codexHome, {
      cwd: foreign,
      sessionId: "foreign-session",
      entries: [{ type: "tool_result", tool_name: "exec_command", is_error: true, error: "foreign only" }],
    });
    utimesSync(prior, new Date(1_000), new Date(1_000));
    utimesSync(current, new Date(3_000), new Date(3_000));
    utimesSync(other, new Date(4_000), new Date(4_000));
    const result = recoverRunnerTranscript({ rootDir: project, runner: "codex", excludeSession: "current-session", env: { CODEX_HOME: codexHome } });
    assert.equal(result.status, "available");
    assert.equal(result.selectedSessionId, "prior-session");
    assert.match(result.excerpt[0].detail, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("recovery fails closed for no current identity, unknown runners, malformed metadata, and symlinked candidates", () => {
  const fixture = mkdtempSync(join(tmpdir(), "runner-transcript-recovery-"));
  const project = join(fixture, "project");
  const codexHome = join(fixture, "codex-home");
  mkdirSync(project);
  try {
    transcript(codexHome, { cwd: project, sessionId: "prior", malformed: true });
    const sessions = join(codexHome, "sessions", "2026", "09");
    const target = join(fixture, "outside.jsonl");
    writeFileSync(target, JSON.stringify({ type: "session_meta", payload: { cwd: project, session_id: "outside" } }));
    symlinkSync(target, join(sessions, "linked.jsonl"));
    const args = { rootDir: project, runner: "codex", env: { CODEX_HOME: codexHome } };
    assert.equal(recoverRunnerTranscript(args).reason, "current-session-identity-unavailable");
    assert.equal(recoverRunnerTranscript({ ...args, excludeSession: "current" }).reason, "no-prior-project-matching-transcript");
    assert.equal(recoverRunnerTranscript({ ...args, runner: "claude", excludeSession: "current" }).reason, "runner-transcript-source-unavailable");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
