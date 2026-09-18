#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { listRunnerTranscripts, main, readRunnerTranscript, recoverRunnerTranscript } from "./runner-transcript-recovery.mjs";

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

test("list returns every prior project-matching session by recency without paths or foreign sessions", () => {
  const fixture = mkdtempSync(join(tmpdir(), "runner-transcript-recovery-"));
  const project = join(fixture, "project");
  const foreign = join(fixture, "foreign");
  const codexHome = join(fixture, "codex-home");
  mkdirSync(project);
  mkdirSync(foreign);
  try {
    const oldest = transcript(codexHome, {
      cwd: project,
      sessionId: "prior-oldest",
      entries: [{ type: "tool_result", tool_name: "exec_command", error: "oldest", message: "x".repeat(9 * 1024 * 1024) }],
    });
    const middle = transcript(codexHome, { cwd: project, sessionId: "prior-middle" });
    const newest = transcript(codexHome, { cwd: project, sessionId: "prior-newest", entries: [{ type: "tool_result", tool_name: "exec_command", error: "newest" }] });
    transcript(codexHome, { cwd: project, sessionId: "current-session" });
    transcript(codexHome, { cwd: foreign, sessionId: "foreign-session" });
    utimesSync(oldest, new Date(1_000), new Date(1_000));
    utimesSync(middle, new Date(2_000), new Date(2_000));
    utimesSync(newest, new Date(3_000), new Date(3_000));
    const result = listRunnerTranscripts({ rootDir: project, runner: "codex", excludeSession: "current-session", env: { CODEX_HOME: codexHome } });
    assert.equal(result.status, "available");
    assert.deepEqual(result.sessions.map((session) => session.sessionId), ["prior-newest", "prior-middle", "prior-oldest"]);
    assert.deepEqual(result.sessions[1].excerpt, []);
    assert.equal(JSON.stringify(result).includes(fixture), false);
    assert.doesNotMatch(JSON.stringify(result), /foreign-session|current-session/u);
    assert.ok(readFileSync(oldest).byteLength > 8 * 1024 * 1024, "fixture must exceed the bounded automatic-excerpt limit");
    for (const [sessionId, source] of [["prior-newest", newest], ["prior-middle", middle], ["prior-oldest", oldest]]) {
      const selected = readRunnerTranscript({ rootDir: project, runner: "codex", excludeSession: "current-session", sessionId, env: { CODEX_HOME: codexHome } });
      assert.equal(selected.status, "available");
      assert.deepEqual(selected.bytes, readFileSync(source), `${sessionId} must remain fully readable after list selection`);
    }
    const chunks = [];
    const originalWrite = process.stdout.write;
    const originalCodexHome = process.env.CODEX_HOME;
    process.stdout.write = (chunk) => { chunks.push(Buffer.from(chunk)); return true; };
    process.env.CODEX_HOME = codexHome;
    try {
      main(["list", "--root", project, "--runner", "codex", "--exclude-session", "current-session"]);
    } finally {
      process.stdout.write = originalWrite;
      if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = originalCodexHome;
    }
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString("utf8")), result);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("read emits byte-identical selected JSONL while current, foreign, and unknown ids fail closed", () => {
  const fixture = mkdtempSync(join(tmpdir(), "runner-transcript-recovery-"));
  const project = join(fixture, "project");
  const foreign = join(fixture, "foreign");
  const codexHome = join(fixture, "codex-home");
  mkdirSync(project);
  mkdirSync(foreign);
  try {
    const prior = transcript(codexHome, {
      cwd: project,
      sessionId: "prior-design",
      entries: [{ type: "user_message", message: "The external Greenfield input must remain byte-identical." }],
    });
    transcript(codexHome, { cwd: project, sessionId: "current-session" });
    transcript(codexHome, { cwd: foreign, sessionId: "foreign-session" });
    const args = { rootDir: project, runner: "codex", excludeSession: "current-session", env: { CODEX_HOME: codexHome } };
    const selected = readRunnerTranscript({ ...args, sessionId: "prior-design" });
    assert.equal(selected.status, "available");
    assert.deepEqual(selected.bytes, readFileSync(prior));
    assert.match(selected.bytes.toString("utf8"), /external Greenfield input/u);
    for (const sessionId of ["current-session", "foreign-session", "unknown-session"]) {
      const unavailable = readRunnerTranscript({ ...args, sessionId });
      assert.deepEqual(unavailable, {
        schema: "pipeline.runner-transcript-recovery.v1",
        status: "unavailable",
        runner: "codex",
        reason: "requested-session-unavailable",
      });
    }
    const chunks = [];
    const originalWrite = process.stdout.write;
    const originalCodexHome = process.env.CODEX_HOME;
    process.stdout.write = (chunk) => { chunks.push(Buffer.from(chunk)); return true; };
    process.env.CODEX_HOME = codexHome;
    try {
      main(["read", "--root", project, "--runner", "codex", "--exclude-session", "current-session", "--session-id", "prior-design"]);
    } finally {
      process.stdout.write = originalWrite;
      if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = originalCodexHome;
    }
    const stdout = Buffer.concat(chunks);
    assert.deepEqual(stdout, readFileSync(prior));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
