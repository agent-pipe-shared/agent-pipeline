#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { listRunnerTranscripts, main, readRunnerTranscript, recoverRunnerTranscript } from "./runner-transcript-recovery.mjs";
// ALF-C-N1-02C: the export cases reach the new surface through a namespace import, so that on code
// without it only those cases fail (a missing named export would instead fail the whole file at link time).
import * as recovery from "./runner-transcript-recovery.mjs";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { antigravityArtifactHostContext } from "../lib/current-session-artifact-export.mjs";
// AC-175C: the handoff helpers are reached through a namespace, so on code without them only the handoff cases fail.
import * as handoff from "../lib/current-session-artifact-export.mjs";

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
    // Justification (G23.forensics Slice B): pin the host identity to the claim so an ambient host session cannot conflict.
    const savedIdentity = { CODEX_SESSION_ID: process.env.CODEX_SESSION_ID, CODEX_THREAD_ID: process.env.CODEX_THREAD_ID };
    process.env.CODEX_SESSION_ID = "current-session";
    process.env.CODEX_THREAD_ID = "current-session";
    try {
      main(["read", "--root", project, "--runner", "codex", "--exclude-session", "current-session", "--session-id", "prior-design"]);
    } finally {
      process.stdout.write = originalWrite;
      if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = originalCodexHome;
      for (const [key, value] of Object.entries(savedIdentity)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    const stdout = Buffer.concat(chunks);
    assert.deepEqual(stdout, readFileSync(prior));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// ALF-C-N1-02C (item pipeline.forensics-and-audit-evidence-not-reconstructable, Acceptance "A
// project-bound, data-minimising transcript export merges segments ... and reports usage where the
// host supplies it, for all three runners"): `export` / exportRunnerTranscript().
// ---------------------------------------------------------------------------------------------

const SECRET = "SECRET-BODY-MARKER-never-exported";
const SCHEMA = "pipeline.runner-transcript-recovery.v1";
const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = (clock) => `2026-09-01T${clock}.000Z`;
const NO_USAGE = { status: "unavailable", reason: "transcript-carries-no-usage" };

function withExportFixture(run) {
  const fixture = mkdtempSync(join(tmpdir(), "runner-transcript-export-"));
  const project = join(fixture, "project");
  const foreign = join(fixture, "foreign");
  mkdirSync(project);
  mkdirSync(foreign);
  try {
    return run({ fixture, project, foreign, codexHome: join(fixture, "codex-home"), claudeHome: join(fixture, "claude-home") });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function codexSegment(codexHome, fileName, { cwd, sessionId, metaTimestamp, records = [], rawLines = [], metaExtra = {} }) {
  const directory = join(codexHome, "sessions", "2026", "09");
  mkdirSync(directory, { recursive: true });
  const target = join(directory, fileName);
  const meta = { type: "session_meta", payload: { cwd, session_id: sessionId, ...metaExtra } };
  if (metaTimestamp !== undefined) meta.timestamp = metaTimestamp;
  writeFileSync(target, `${[JSON.stringify(meta), ...records.map((record) => JSON.stringify(record)), ...rawLines].join("\n")}\n`);
  return target;
}

const codexCounters = (total) => ({
  input_tokens: total, cached_input_tokens: total + 1, output_tokens: total + 2, reasoning_output_tokens: total + 3, total_tokens: total + 4,
});
const tokenCount = (timestamp, total) => ({ timestamp, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: codexCounters(total) } } });

function claudeSegment(claudeHome, project, fileName, lines) {
  const directory = join(claudeHome, "projects", realpathSync(project).replace(/[^A-Za-z0-9]/gu, "-"));
  mkdirSync(directory, { recursive: true });
  const target = join(directory, fileName);
  writeFileSync(target, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return target;
}
const claudeUser = (sessionId, cwd, timestamp) => ({ type: "user", sessionId, cwd, timestamp, message: { role: "user", content: SECRET } });
const claudeAssistant = (sessionId, cwd, timestamp, id, usage, model = "claude-sonnet-5-5") => ({
  type: "assistant", sessionId, cwd, timestamp, message: { id, role: "assistant", model, usage },
});

function runMain(argv, env) {
  const chunks = [];
  const originalWrite = process.stdout.write;
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  process.stdout.write = (chunk) => { chunks.push(Buffer.from(chunk)); return true; };
  Object.assign(process.env, env);
  try {
    recovery.main(argv);
  } finally {
    process.stdout.write = originalWrite;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

test("export merges a multi-segment Codex session in first-record-timestamp order and reports the last valid token_count", () => {
  withExportFixture(({ fixture, project, foreign, codexHome }) => {
    // The chronologically LATER segment has the lexicographically FIRST name and the OLDER mtime; the
    // EARLIER segment is touched afterwards (newest mtime), so every storage-order key points the wrong way.
    const late = codexSegment(codexHome, "a-late.jsonl", {
      cwd: project, sessionId: "multi", metaTimestamp: stamp("10:05:00"),
      records: [
        tokenCount(stamp("10:06:00"), 250),
        { timestamp: stamp("10:07:00"), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { ...codexCounters(900), input_tokens: -1 } } } },
      ],
      rawLines: ["{ damaged"],
    });
    const early = codexSegment(codexHome, "z-early.jsonl", {
      cwd: project, sessionId: "multi", metaTimestamp: stamp("10:00:00"),
      records: [tokenCount(stamp("10:01:00"), 100), { timestamp: stamp("10:02:00"), type: "response_item", payload: { text: SECRET } }],
    });
    codexSegment(codexHome, "current.jsonl", { cwd: project, sessionId: "current-session" });
    codexSegment(codexHome, "foreign.jsonl", { cwd: foreign, sessionId: "multi", metaTimestamp: stamp("11:00:00"), records: [tokenCount(stamp("11:01:00"), 999)] });
    utimesSync(late, new Date(1_000), new Date(1_000));
    utimesSync(early, new Date(9_000), new Date(9_000));

    const result = recovery.exportRunnerTranscript({
      rootDir: project, runner: "codex", excludeSession: "current-session", sessionId: "multi", env: { CODEX_HOME: codexHome },
    });
    assert.equal(result.status, "available");
    assert.equal(result.schema, SCHEMA);
    assert.equal(result.runner, "codex");
    assert.equal(result.sessionId, "multi");
    assert.equal(result.segmentCount, 2, "the same id in a foreign project is not a segment of this session");
    assert.equal(result.segmentOrder, "first-record-timestamp-then-mtime-then-path");
    assert.deepEqual(result.segments, [
      { ordinal: 0, sha256: sha256Of(readFileSync(early)), byteLength: readFileSync(early).length, recordCount: 3, unparsedLineCount: 0, firstTimestamp: stamp("10:00:00"), lastTimestamp: stamp("10:02:00") },
      { ordinal: 1, sha256: sha256Of(readFileSync(late)), byteLength: readFileSync(late).length, recordCount: 3, unparsedLineCount: 1, firstTimestamp: stamp("10:05:00"), lastTimestamp: stamp("10:07:00") },
    ]);
    assert.equal(result.recordCount, 6);
    assert.equal(result.unparsedLineCount, 1);
    assert.equal(result.firstTimestamp, stamp("10:00:00"));
    assert.equal(result.lastTimestamp, stamp("10:07:00"));
    // 250 comes from the chronologically last segment; the invalid 900 after it is skipped; mtime order would give 100.
    assert.deepEqual(result.usage, { status: "available", source: "codex-token-count-total", observations: 1, counters: codexCounters(250) });

    // Data-minimising: counts, digests and timestamps only.
    assert.deepEqual(Object.keys(result).sort(), [
      "childSessions", "completeness", "firstTimestamp", "incompleteReasons", "lastTimestamp", "recordCount", "runner", "schema", "segmentCount", "segmentOrder",
      "segments", "sessionId", "status", "turns", "unparsedLineCount", "usage",
    ]);
    // Justification (AC-175 part B): the key set stays pinned on purpose; `turns` is the new turn-boundary marker block.
    // Justification (G23.forensics Slice A): the key set is pinned on purpose; the three new keys are the completeness marker.
    assert.equal(result.completeness, "partial", "this session holds a damaged line");
    for (const segment of result.segments) {
      assert.deepEqual(Object.keys(segment).sort(), ["byteLength", "firstTimestamp", "lastTimestamp", "ordinal", "recordCount", "sha256", "unparsedLineCount"]);
    }
    const serialized = JSON.stringify(result);
    for (const forbidden of [SECRET, fixture, basename(fixture), "a-late", "z-early", "codex-home", "foreign"]) {
      assert.equal(serialized.includes(forbidden), false, `the export must not carry ${forbidden}`);
    }
  });
});

test("export orders segments by first-record timestamp, then mtime, then path, with timestamp-less segments last", () => {
  withExportFixture(({ project, codexHome }) => {
    const sameStart = stamp("08:00:00");
    const make = (name, mtime, extra = {}) => {
      const path = codexSegment(codexHome, `${name}.jsonl`, { cwd: project, sessionId: "tie", records: [{ type: "note", name }], ...extra });
      utimesSync(path, new Date(mtime), new Date(mtime));
      return sha256Of(readFileSync(path));
    };
    const b1 = make("b-1", 3_000, { metaTimestamp: sameStart });
    const a2 = make("a-2", 3_000, { metaTimestamp: sameStart });
    const c3 = make("c-3", 2_000, { metaTimestamp: sameStart });
    const none = make("n-none", 1_000);
    const first = make("d-first", 8_000, { metaTimestamp: stamp("07:00:00") });
    codexSegment(codexHome, "current.jsonl", { cwd: project, sessionId: "current-session" });

    const result = recovery.exportRunnerTranscript({
      rootDir: project, runner: "codex", excludeSession: "current-session", sessionId: "tie", env: { CODEX_HOME: codexHome },
    });
    assert.equal(result.status, "available");
    assert.deepEqual(result.segments.map((segment) => segment.sha256), [first, c3, a2, b1, none]);
    assert.deepEqual(result.segments.map((segment) => segment.ordinal), [0, 1, 2, 3, 4]);
    assert.equal(result.segments[4].firstTimestamp, null);
    assert.equal(result.segments[4].lastTimestamp, null);
    assert.equal(result.firstTimestamp, stamp("07:00:00"));
    assert.equal(result.lastTimestamp, sameStart);
    assert.deepEqual(result.usage, NO_USAGE);
  });
});

test("export reports usage unavailable when a transcript carries no complete token_count", () => {
  withExportFixture(({ project, codexHome }) => {
    codexSegment(codexHome, "partial.jsonl", {
      cwd: project, sessionId: "partial", metaTimestamp: stamp("06:00:00"),
      records: [
        { type: "event_msg", payload: { type: "token_count", info: null } },
        { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 1, output_tokens: 2 } } } },
        { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { ...codexCounters(5), total_tokens: 1.5 } } } },
        { type: "event_msg", payload: { type: "agent_message", message: SECRET } },
      ],
    });
    codexSegment(codexHome, "current.jsonl", { cwd: project, sessionId: "current-session" });
    const result = recovery.exportRunnerTranscript({
      rootDir: project, runner: "codex", excludeSession: "current-session", sessionId: "partial", env: { CODEX_HOME: codexHome },
    });
    assert.equal(result.status, "available");
    assert.equal(result.recordCount, 5);
    assert.deepEqual(result.usage, NO_USAGE);
  });
});

test("export sums Claude assistant usage once per message id across merged segments and excludes synthetic messages", () => {
  withExportFixture(({ fixture, project, foreign, claudeHome }) => {
    const S = "claude-sess";
    const first = claudeSegment(claudeHome, project, "one.jsonl", [
      { type: "summary", summary: "continued" },
      claudeUser(S, project, stamp("09:00:00")),
      claudeAssistant(S, project, stamp("09:00:05"), "msg_1", { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 }),
      claudeAssistant(S, project, stamp("09:00:06"), "msg_1", { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 }),
      claudeAssistant(S, project, stamp("09:00:07"), "msg_synthetic", { input_tokens: 999, output_tokens: 999, cache_creation_input_tokens: 999, cache_read_input_tokens: 999 }, "<synthetic>"),
    ]);
    const second = claudeSegment(claudeHome, project, "two.jsonl", [
      claudeUser(S, project, stamp("09:10:00")),
      claudeAssistant(S, project, stamp("09:10:05"), "msg_2", { input_tokens: 20, output_tokens: 7, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000 }),
      claudeAssistant(S, project, stamp("09:10:06"), "msg_1", { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 }),
      { type: "assistant", sessionId: S, cwd: project, timestamp: stamp("09:10:07"), message: { role: "assistant", usage: { input_tokens: 5000, output_tokens: 5000 } } },
      claudeAssistant(S, project, stamp("09:10:08"), "msg_3", undefined),
    ]);
    claudeSegment(claudeHome, project, "other.jsonl", [claudeUser("claude-other", project, stamp("09:20:00")), claudeAssistant("claude-other", project, stamp("09:20:01"), "msg_o", { input_tokens: 777, output_tokens: 777 })]);
    claudeSegment(claudeHome, project, "current.jsonl", [claudeUser("current-session", project, stamp("09:30:00"))]);
    claudeSegment(claudeHome, project, "foreign.jsonl", [claudeUser(S, foreign, stamp("09:40:00")), claudeAssistant(S, foreign, stamp("09:40:01"), "msg_f", { input_tokens: 888, output_tokens: 888 })]);
    // The later segment is stored with the older mtime: only the timestamp may decide the order.
    utimesSync(first, new Date(5_000), new Date(5_000));
    utimesSync(second, new Date(1_000), new Date(1_000));

    const args = { rootDir: project, runner: "claude", excludeSession: "current-session", env: { CLAUDE_CONFIG_DIR: claudeHome } };
    const result = recovery.exportRunnerTranscript({ ...args, sessionId: S });
    assert.equal(result.status, "available");
    assert.equal(result.runner, "claude");
    assert.equal(result.segmentCount, 2, "the same id recorded for a foreign project is not a segment of this session");
    assert.deepEqual(result.segments.map((segment) => segment.sha256), [sha256Of(readFileSync(first)), sha256Of(readFileSync(second))]);
    assert.equal(result.recordCount, 10);
    assert.equal(result.firstTimestamp, stamp("09:00:00"));
    assert.equal(result.lastTimestamp, stamp("09:10:08"));
    // msg_1 counts once, at its final streamed snapshot (output 5, not 1); msg_2 once; the synthetic and id-less rows never.
    assert.deepEqual(result.usage, {
      status: "available",
      source: "claude-assistant-message-usage",
      observations: 2,
      counters: { input_tokens: 30, output_tokens: 12, cache_creation_input_tokens: 100, cache_read_input_tokens: 3000 },
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of [SECRET, fixture, basename(fixture), "claude-home", "one.jsonl", "two.jsonl", "projects"]) {
      assert.equal(serialized.includes(forbidden), false, `the export must not carry ${forbidden}`);
    }
    for (const sessionId of ["current-session", "claude-other-missing", "unknown-session"]) {
      assert.deepEqual(recovery.exportRunnerTranscript({ ...args, sessionId }), { schema: SCHEMA, status: "unavailable", runner: "claude", reason: "requested-session-unavailable" });
    }
    assert.deepEqual(
      recovery.exportRunnerTranscript({ ...args, env: { CLAUDE_CONFIG_DIR: join(claudeHome, "absent") }, sessionId: S }),
      { schema: SCHEMA, status: "unavailable", runner: "claude", reason: "runner-session-storage-unavailable" },
    );
    assert.equal(recovery.exportRunnerTranscript({ ...args, excludeSession: undefined, sessionId: S }).reason, "current-session-identity-unavailable");
  });
});

test("per-runner usage extraction is a pure function of the records and never invents a figure", () => {
  const antigravity = recovery.extractRunnerUsage("antigravity", [
    { type: "turn.started" },
    { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 } },
    { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 1 } },
    { type: "turn.completed", usage: { input_tokens: -4, output_tokens: 100 } },
    { type: "turn.completed" },
    { type: "item.completed", usage: { input_tokens: 1000 } },
  ]);
  assert.deepEqual(antigravity, {
    status: "available",
    source: "antigravity-turn-completed",
    observations: 2,
    counters: { input_tokens: 15, cached_input_tokens: 2, output_tokens: 4 },
  });
  assert.deepEqual(recovery.extractRunnerUsage("antigravity", [{ type: "turn.started" }, { type: "turn.completed" }]), NO_USAGE);
  assert.deepEqual(recovery.extractRunnerUsage("antigravity", []), NO_USAGE);
  assert.deepEqual(recovery.extractRunnerUsage("claude", [{ type: "turn.completed", usage: { input_tokens: 3 } }]), NO_USAGE);
  assert.deepEqual(recovery.extractRunnerUsage("codex", [{ type: "turn.completed", usage: { input_tokens: 3 } }]), NO_USAGE);
  assert.deepEqual(recovery.extractRunnerUsage("unknown-runner", [{ type: "turn.completed", usage: { input_tokens: 3 } }]), NO_USAGE);
});

test("export of an unknown runner stays typed unavailable, and Antigravity without a host context names that precise reason", () => {
  // Justification (AC-175 part B): the Antigravity layout IS established now (brain layout), so its reason is no longer the
  // generic source-unavailable one; an unknown runner keeps the old reason unchanged.
  withExportFixture(({ project, codexHome, claudeHome }) => {
    codexSegment(codexHome, "s.jsonl", { cwd: project, sessionId: "some-session" });
    const reasons = { antigravity: "antigravity-host-context-unavailable", "unknown-runner": "runner-transcript-source-unavailable" };
    for (const runner of ["antigravity", "unknown-runner"]) {
      assert.deepEqual(
        recovery.exportRunnerTranscript({ rootDir: project, runner, excludeSession: "current-session", sessionId: "some-session", env: { CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome } }),
        { schema: SCHEMA, status: "unavailable", runner, reason: reasons[runner] },
      );
    }
  });
});

test("export fails closed for current, foreign, unknown and missing session ids and never follows a linked directory", () => {
  withExportFixture(({ fixture, project, foreign, codexHome }) => {
    codexSegment(codexHome, "prior.jsonl", { cwd: project, sessionId: "prior", metaTimestamp: stamp("05:00:00"), records: [tokenCount(stamp("05:01:00"), 7)] });
    codexSegment(codexHome, "current.jsonl", { cwd: project, sessionId: "current-session" });
    codexSegment(codexHome, "foreign.jsonl", { cwd: foreign, sessionId: "foreign-session" });
    // A directory link (a junction needs no privilege on Windows) leading outside the session store.
    const outside = join(fixture, "outside-store");
    mkdirSync(outside);
    writeFileSync(join(outside, "linked.jsonl"), `${JSON.stringify({ type: "session_meta", payload: { cwd: project, session_id: "linked-session" } })}\n`);
    symlinkSync(outside, join(codexHome, "sessions", "2026", "09", "linked-dir"), "junction");

    const args = { rootDir: project, runner: "codex", excludeSession: "current-session", env: { CODEX_HOME: codexHome } };
    assert.equal(recovery.exportRunnerTranscript({ ...args, sessionId: "prior" }).status, "available");
    for (const sessionId of ["current-session", "foreign-session", "unknown-session", "linked-session", "", undefined]) {
      assert.deepEqual(recovery.exportRunnerTranscript({ ...args, sessionId }), { schema: SCHEMA, status: "unavailable", runner: "codex", reason: "requested-session-unavailable" }, String(sessionId));
    }
    assert.equal(recovery.exportRunnerTranscript({ ...args, excludeSession: undefined, sessionId: "prior" }).reason, "current-session-identity-unavailable");
  });
});

test("the export CLI operation prints the same data-minimised JSON and rejects every flag set but the read flags", () => {
  withExportFixture(({ project, codexHome, claudeHome }) => {
    codexSegment(codexHome, "prior.jsonl", { cwd: project, sessionId: "prior", metaTimestamp: stamp("05:00:00"), records: [tokenCount(stamp("05:01:00"), 7)] });
    codexSegment(codexHome, "current.jsonl", { cwd: project, sessionId: "current-session" });
    claudeSegment(claudeHome, project, "prior.jsonl", [claudeUser("claude-prior", project, stamp("04:00:00")), claudeAssistant("claude-prior", project, stamp("04:00:01"), "msg_a", { input_tokens: 4, output_tokens: 2 })]);
    // Justification (G23.forensics Slice B): main reads the process environment, so the host identity is pinned to the claim here.
    const env = { CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome, CODEX_SESSION_ID: "current-session", CODEX_THREAD_ID: "current-session", CLAUDE_CODE_SESSION_ID: "current-session" };
    for (const [runner, sessionId] of [["codex", "prior"], ["claude", "claude-prior"], ["antigravity", "prior"]]) {
      const expected = recovery.exportRunnerTranscript({ rootDir: project, runner, excludeSession: "current-session", sessionId, env });
      const stdout = runMain(["export", "--root", project, "--runner", runner, "--exclude-session", "current-session", "--session-id", sessionId], env);
      assert.ok(stdout.endsWith("\n") && stdout.indexOf("\n") === stdout.length - 1, "one JSON line, no raw transcript bytes");
      assert.deepEqual(JSON.parse(stdout), expected, runner);
      assert.equal(expected.status, runner === "antigravity" ? "unavailable" : "available", runner);
    }
    const invalid = { schema: SCHEMA, status: "unavailable", runner: "unknown", reason: "invalid-invocation" };
    for (const argv of [
      ["export", "--root", project, "--runner", "codex", "--exclude-session", "current-session"],
      ["export", "--root", project, "--runner", "codex", "--exclude-session", "current-session", "--session-id", "prior", "--extra", "x"],
      ["export", "--root", project, "--runner", "codex", "--exclude-session", "current-session", "--session", "prior"],
      ["export", "--root", project, "--runner", "codex", "--runner", "claude", "--exclude-session", "current-session"],
    ]) {
      assert.deepEqual(JSON.parse(runMain(argv, env)), invalid, argv.join(" "));
    }
  });
});

// ---------------------------------------------------------------------------------------------
// G23.forensics Slice A: the export says whether it saw the whole session, and why not.
// ---------------------------------------------------------------------------------------------

test("export marks completeness: a clean session is complete, a skipped line makes it partial, a session without children lists none", () => {
  withExportFixture(({ project, codexHome }) => {
    codexSegment(codexHome, "clean.jsonl", { cwd: project, sessionId: "clean", metaTimestamp: stamp("05:00:00"), records: [tokenCount(stamp("05:01:00"), 7)] });
    codexSegment(codexHome, "damaged.jsonl", { cwd: project, sessionId: "damaged", metaTimestamp: stamp("06:00:00"), records: [tokenCount(stamp("06:01:00"), 9)], rawLines: ["{ damaged"] });
    const args = { rootDir: project, runner: "codex", excludeSession: "current-session", env: { CODEX_HOME: codexHome } };
    const clean = recovery.exportRunnerTranscript({ ...args, sessionId: "clean" });
    assert.equal(clean.status, "available");
    assert.equal(clean.completeness, "complete");
    assert.deepEqual(clean.incompleteReasons, []);
    // Justification (AC-175 part B, Acceptance "merges ... child sessions"): the runner records children, so a session
    // without any now reports an empty list; "not-inferred" is no longer a possible answer for Codex and Claude.
    assert.deepEqual(clean.childSessions, []);
    const damaged = recovery.exportRunnerTranscript({ ...args, sessionId: "damaged" });
    assert.equal(damaged.status, "available");
    assert.equal(damaged.completeness, "partial");
    assert.deepEqual(damaged.incompleteReasons, ["records-skipped"]);
    assert.deepEqual(damaged.childSessions, []);
  });
});

test("export reports candidate-bound-reached for Codex and Claude when the enumeration cap truncates, and complete at exactly the cap", () => {
  withExportFixture(({ project, codexHome, claudeHome }) => {
    for (const name of ["w1", "w2", "w3"]) {
      codexSegment(codexHome, `${name}.jsonl`, { cwd: project, sessionId: "wide", metaTimestamp: stamp("05:00:00"), records: [{ type: "note", name }] });
      claudeSegment(claudeHome, project, `${name}.jsonl`, [claudeUser("wide", project, stamp("05:00:00"))]);
    }
    const env = { CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome };
    for (const runner of ["codex", "claude"]) {
      const cut = recovery.exportRunnerTranscript({ rootDir: project, runner, excludeSession: "current-session", sessionId: "wide", env, limits: { maxCandidates: 2 } });
      assert.equal(cut.status, "available", runner);
      assert.equal(cut.completeness, "partial", runner);
      assert.ok(cut.incompleteReasons.includes("candidate-bound-reached"), runner);
      assert.deepEqual(cut.childSessions, [], runner);
    }
    // Exactly at the cap nothing was left unread: the Codex store holds only 2 of the 'exact' files in a directory of its own.
    const exactCodex = join(codexHome, "exact-store");
    for (const name of ["e1", "e2"]) codexSegment(exactCodex, `${name}.jsonl`, { cwd: project, sessionId: "exact", metaTimestamp: stamp("06:00:00"), records: [{ type: "note", name }] });
    const atCap = recovery.exportRunnerTranscript({ rootDir: project, runner: "codex", excludeSession: "current-session", sessionId: "exact", env: { CODEX_HOME: exactCodex }, limits: { maxCandidates: 2 } });
    assert.equal(atCap.completeness, "complete");
    assert.deepEqual(atCap.incompleteReasons, []);
  });
});

test("export reports byte-ceiling when an optional seam ceiling truncates a segment, without failing or hiding the full digest", () => {
  withExportFixture(({ project, codexHome }) => {
    const path = codexSegment(codexHome, "big.jsonl", {
      cwd: project, sessionId: "big", metaTimestamp: stamp("05:00:00"),
      records: [tokenCount(stamp("05:01:00"), 1), tokenCount(stamp("05:02:00"), 2), tokenCount(stamp("05:03:00"), 3)],
    });
    const full = readFileSync(path);
    const args = { rootDir: project, runner: "codex", excludeSession: "current-session", sessionId: "big", env: { CODEX_HOME: codexHome } };
    const whole = recovery.exportRunnerTranscript(args);
    assert.equal(whole.completeness, "complete");
    assert.equal(whole.recordCount, 4);
    const cut = recovery.exportRunnerTranscript({ ...args, limits: { maxSegmentBytes: Math.floor(full.length / 2) } });
    assert.equal(cut.status, "available");
    assert.equal(cut.completeness, "partial");
    assert.deepEqual(cut.incompleteReasons, ["byte-ceiling"]);
    assert.ok(cut.recordCount < 4, "records beyond the ceiling are not counted");
    assert.equal(cut.segments[0].byteLength, full.length, "the segment digest and length still identify the whole file");
    assert.equal(cut.segments[0].sha256, sha256Of(full));
  });
});

// ---------------------------------------------------------------------------------------------
// G23.forensics Slice B: a claimed current session is checked against the host identity on every
// transcript operation, not only audit-current.
// ---------------------------------------------------------------------------------------------

const IDENTITY_CONFLICT = "MODEL-ROLE-SESSION-IDENTITY-CONFLICT";

test("export, list and read refuse a claimed current session that differs from the host identity, and still pass when it matches", () => {
  withExportFixture(({ project, codexHome, claudeHome }) => {
    codexSegment(codexHome, "prior.jsonl", { cwd: project, sessionId: "prior", metaTimestamp: stamp("05:00:00"), records: [tokenCount(stamp("05:01:00"), 7)] });
    claudeSegment(claudeHome, project, "prior.jsonl", [claudeUser("claude-prior", project, stamp("04:00:00"))]);
    const base = { rootDir: project, excludeSession: "claimed-session" };
    const codexEnv = (extra) => ({ CODEX_HOME: codexHome, ...extra });
    const refused = (runner, env) => ({ schema: SCHEMA, status: "unavailable", runner, reason: IDENTITY_CONFLICT, env });
    void refused;
    const expectRefusal = (result, runner, label) => {
      assert.equal(result.status, "unavailable", label);
      assert.equal(result.runner, runner, label);
      assert.equal(result.reason, IDENTITY_CONFLICT, label);
    };
    // Codex: the host says "host-session", the caller claims "claimed-session".
    const mismatch = { ...base, runner: "codex", env: codexEnv({ CODEX_THREAD_ID: "host-session" }) };
    expectRefusal(recovery.exportRunnerTranscript({ ...mismatch, sessionId: "prior" }), "codex", "export");
    expectRefusal(recovery.listRunnerTranscripts(mismatch), "codex", "list");
    expectRefusal(recovery.readRunnerTranscript({ ...mismatch, sessionId: "prior" }), "codex", "read");
    // Claude export: the single CLAUDE_CODE_SESSION_ID disagrees with the claim.
    expectRefusal(recovery.exportRunnerTranscript({ ...base, runner: "claude", env: { CLAUDE_CONFIG_DIR: claudeHome, CLAUDE_CODE_SESSION_ID: "host-session" }, sessionId: "claude-prior" }), "claude", "claude export");
    // A matching claim passes on every operation.
    const match = { ...base, runner: "codex", env: codexEnv({ CODEX_THREAD_ID: "claimed-session", CODEX_SESSION_ID: "claimed-session" }) };
    assert.equal(recovery.exportRunnerTranscript({ ...match, sessionId: "prior" }).status, "available");
    assert.equal(recovery.listRunnerTranscripts(match).status, "available");
    assert.equal(recovery.readRunnerTranscript({ ...match, sessionId: "prior" }).status, "available");
    assert.equal(recovery.exportRunnerTranscript({ ...base, runner: "claude", env: { CLAUDE_CONFIG_DIR: claudeHome, CLAUDE_CODE_SESSION_ID: "claimed-session" }, sessionId: "claude-prior" }).status, "available");
  });
});

test("export, list and read refuse conflicting CODEX_SESSION_ID and CODEX_THREAD_ID even when the claim equals one of them", () => {
  withExportFixture(({ project, codexHome }) => {
    codexSegment(codexHome, "prior.jsonl", { cwd: project, sessionId: "prior", metaTimestamp: stamp("05:00:00"), records: [tokenCount(stamp("05:01:00"), 7)] });
    const conflicting = { rootDir: project, runner: "codex", excludeSession: "claimed-session", env: { CODEX_HOME: codexHome, CODEX_SESSION_ID: "claimed-session", CODEX_THREAD_ID: "other-thread" } };
    for (const [label, result] of [
      ["export", recovery.exportRunnerTranscript({ ...conflicting, sessionId: "prior" })],
      ["list", recovery.listRunnerTranscripts(conflicting)],
      ["read", recovery.readRunnerTranscript({ ...conflicting, sessionId: "prior" })],
    ]) {
      assert.equal(result.status, "unavailable", label);
      assert.equal(result.reason, IDENTITY_CONFLICT, label);
    }
  });
});

test("the CLI refuses a claimed current session that conflicts with the host identity", () => {
  withExportFixture(({ project, codexHome }) => {
    codexSegment(codexHome, "prior.jsonl", { cwd: project, sessionId: "prior", metaTimestamp: stamp("05:00:00"), records: [tokenCount(stamp("05:01:00"), 7)] });
    const hostEnv = { CODEX_HOME: codexHome, CODEX_SESSION_ID: "host-session", CODEX_THREAD_ID: "host-session" };
    for (const argv of [
      ["export", "--root", project, "--runner", "codex", "--exclude-session", "claimed-session", "--session-id", "prior"],
      ["list", "--root", project, "--runner", "codex", "--exclude-session", "claimed-session"],
    ]) {
      const printed = JSON.parse(runMain(argv, hostEnv));
      assert.equal(printed.status, "unavailable", argv[0]);
      assert.equal(printed.reason, IDENTITY_CONFLICT, argv[0]);
    }
    const ok = JSON.parse(runMain(["export", "--root", project, "--runner", "codex", "--exclude-session", "host-session", "--session-id", "prior"], hostEnv));
    assert.equal(ok.status, "available");
  });
});

// ---------------------------------------------------------------------------------------------
// AC-175 part B (item pipeline.forensics-and-audit-evidence-not-reconstructable, Acceptance "merges
// segments, child sessions and turn boundaries ... for all three runners"; PO decision D210): child
// provenance and turn markers for Claude and Codex, and the Antigravity export through the brain layout.
// ---------------------------------------------------------------------------------------------

const claudeToolUse = (sessionId, cwd, timestamp, id, toolUseId, subagentType = "pipeline-core:goldfish-deep") => ({
  type: "assistant", sessionId, cwd, timestamp,
  message: {
    id, role: "assistant", model: "claude-sonnet-5-5", usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "tool_use", id: toolUseId, name: "Agent", input: { subagent_type: subagentType, prompt: SECRET } }],
  },
});
const claudeToolResult = (sessionId, cwd, timestamp, toolUseId) => ({
  type: "user", sessionId, cwd, timestamp,
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content: SECRET }] },
});
const sidechain = (sessionId, cwd, timestamp, agentId, extra = {}) => ({ type: "user", sessionId, cwd, timestamp, isSidechain: true, agentId, message: { role: "user", content: SECRET }, ...extra });

/** The recorded Claude layout: <projects>/<project>/<sessionId>/subagents/agent-<id>.jsonl beside agent-<id>.meta.json. */
function claudeChild(claudeHome, project, sessionId, agentId, { meta, lines }) {
  const directory = join(claudeHome, "projects", realpathSync(project).replace(/[^A-Za-z0-9]/gu, "-"), sessionId, "subagents");
  mkdirSync(directory, { recursive: true });
  const target = join(directory, `agent-${agentId}.jsonl`);
  writeFileSync(target, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  if (meta !== undefined) writeFileSync(join(directory, `agent-${agentId}.meta.json`), JSON.stringify(meta));
  return target;
}

test("AC-175B: the Claude export lists child sessions with agent type, turn span and transcript digest, and marks turn boundaries", () => {
  withExportFixture(({ fixture, project, foreign, claudeHome }) => {
    const S = "claude-parent";
    claudeSegment(claudeHome, project, "parent.jsonl", [
      claudeUser(S, project, stamp("09:00:00")),
      claudeAssistant(S, project, stamp("09:00:01"), "msg_1", { input_tokens: 1, output_tokens: 1 }),
      claudeToolUse(S, project, stamp("09:00:02"), "msg_2", "toolu_A"),
      claudeToolUse(S, project, stamp("09:00:03"), "msg_2", "toolu_A"),
      claudeToolResult(S, project, stamp("09:00:30"), "toolu_A"),
      claudeToolUse(S, project, stamp("09:01:00"), "msg_3", "toolu_B", "pipeline-core:critic"),
      claudeAssistant(S, project, stamp("09:01:05"), "msg_4", { input_tokens: 1, output_tokens: 1 }),
      claudeToolResult(S, project, stamp("09:02:00"), "toolu_B"),
    ]);
    claudeSegment(claudeHome, project, "current.jsonl", [claudeUser("current-session", project, stamp("09:30:00"))]);
    const childA = claudeChild(claudeHome, project, S, "aaa111", {
      meta: { agentType: "pipeline-core:goldfish-deep", description: SECRET, toolUseId: "toolu_A", spawnDepth: 1 },
      lines: [sidechain(S, project, stamp("09:00:05"), "aaa111"), claudeAssistant(S, project, stamp("09:00:20"), "msg_c1", { input_tokens: 10, output_tokens: 2 })],
    });
    claudeChild(claudeHome, project, S, "bbb222", {
      meta: { agentType: "pipeline-core:critic", description: "review", toolUseId: "toolu_B", spawnDepth: 1 },
      lines: [sidechain(S, project, stamp("09:01:10"), "bbb222")],
    });
    claudeChild(claudeHome, project, S, "ccc333", {
      meta: { agentType: "pipeline-core:plan-verifier", toolUseId: "toolu_not_in_parent", spawnDepth: 2 },
      lines: [sidechain(S, project, stamp("09:03:00"), "ccc333")],
    });
    // Two files that must never be listed: another session's records, and another project's records.
    claudeChild(claudeHome, project, S, "ddd444", { meta: { agentType: "x", toolUseId: "toolu_A", spawnDepth: 1 }, lines: [sidechain("someone-else", project, stamp("09:00:06"), "ddd444")] });
    claudeChild(claudeHome, project, S, "eee555", { meta: { agentType: "x", toolUseId: "toolu_A", spawnDepth: 1 }, lines: [sidechain(S, foreign, stamp("09:00:07"), "eee555")] });

    const result = recovery.exportRunnerTranscript({ rootDir: project, runner: "claude", excludeSession: "current-session", sessionId: S, env: { CLAUDE_CONFIG_DIR: claudeHome } });
    assert.equal(result.status, "available");
    assert.equal(result.segmentCount, 1, "child transcripts are never merged into the parent's segments");
    assert.equal(result.recordCount, 8);
    assert.ok(Array.isArray(result.childSessions), "the runner records children, so the answer is a list, not a reason");
    assert.deepEqual(result.childSessions.map((child) => [child.childId, child.agentType, child.spawnDepth, child.startTurnIndex, child.endTurnIndex]), [
      ["aaa111", "pipeline-core:goldfish-deep", 1, 1, 1],
      ["bbb222", "pipeline-core:critic", 1, 2, 3],
      ["ccc333", "pipeline-core:plan-verifier", 2, null, null],
    ]);
    assert.deepEqual(result.childSessions[0].transcript, {
      sha256: sha256Of(readFileSync(childA)), byteLength: readFileSync(childA).length, recordCount: 2, unparsedLineCount: 0,
      firstTimestamp: stamp("09:00:05"), lastTimestamp: stamp("09:00:20"),
    });
    assert.deepEqual(result.childSessions[0].usage, { status: "available", source: "claude-assistant-message-usage", observations: 1, counters: { input_tokens: 10, output_tokens: 2 } });
    assert.deepEqual(result.turns, {
      model: "claude-assistant-message-id", count: 4, markersTruncated: false,
      markers: [
        { index: 0, record: 1, timestamp: stamp("09:00:01") }, { index: 1, record: 2, timestamp: stamp("09:00:02") },
        { index: 2, record: 5, timestamp: stamp("09:01:00") }, { index: 3, record: 6, timestamp: stamp("09:01:05") },
      ],
    });
    assert.equal(result.completeness, "partial", "two child files failed authentication");
    assert.deepEqual(result.incompleteReasons, ["child-session-rejected"]);
    const serialized = JSON.stringify(result);
    for (const forbidden of [SECRET, fixture, basename(fixture), "subagents", ".jsonl", "agent-", "description", "claude-home", "ddd444", "eee555"]) {
      assert.equal(serialized.includes(forbidden), false, `the export must not carry ${forbidden}`);
    }
  });
});

test("AC-175B: a Claude session without a subagent directory lists no children, and unsafe or linked child storage is a typed reason", () => {
  withExportFixture(({ fixture, project, claudeHome }) => {
    const args = { rootDir: project, runner: "claude", excludeSession: "current-session", env: { CLAUDE_CONFIG_DIR: claudeHome } };
    claudeSegment(claudeHome, project, "plain.jsonl", [claudeUser("plain", project, stamp("08:00:00")), claudeAssistant("plain", project, stamp("08:00:01"), "msg_p", { input_tokens: 1, output_tokens: 1 })]);
    const plain = recovery.exportRunnerTranscript({ ...args, sessionId: "plain" });
    assert.deepEqual(plain.childSessions, []);
    assert.equal(plain.completeness, "complete");
    assert.deepEqual(plain.turns, { model: "claude-assistant-message-id", count: 1, markersTruncated: false, markers: [{ index: 0, record: 1, timestamp: stamp("08:00:01") }] });

    claudeSegment(claudeHome, project, "linked.jsonl", [claudeUser("linked", project, stamp("08:10:00"))]);
    const projectDirectory = join(claudeHome, "projects", realpathSync(project).replace(/[^A-Za-z0-9]/gu, "-"));
    const outside = join(fixture, "outside-subagents");
    mkdirSync(outside);
    writeFileSync(join(outside, "agent-zzz999.jsonl"), `${JSON.stringify(sidechain("linked", project, stamp("08:10:05"), "zzz999"))}\n`);
    mkdirSync(join(projectDirectory, "linked"));
    symlinkSync(outside, join(projectDirectory, "linked", "subagents"), "junction");
    const linked = recovery.exportRunnerTranscript({ ...args, sessionId: "linked" });
    assert.equal(linked.status, "available");
    assert.equal(linked.childSessions, "child-storage-unavailable", "a linked subagent directory is never followed");
    assert.equal(JSON.stringify(linked).includes("zzz999"), false);

    // A linked child file inside a real subagent directory is skipped, never read.
    claudeSegment(claudeHome, project, "filelink.jsonl", [claudeUser("filelink", project, stamp("08:20:00"))]);
    const real = join(projectDirectory, "filelink", "subagents");
    mkdirSync(real, { recursive: true });
    symlinkSync(join(outside, "agent-zzz999.jsonl"), join(real, "agent-yyy888.jsonl"));
    assert.deepEqual(recovery.exportRunnerTranscript({ ...args, sessionId: "filelink" }).childSessions, []);
  });
});

test("AC-175B: the Codex export lists spawned child sessions with turn span, role and digest, and marks turn boundaries", () => {
  withExportFixture(({ project, foreign, codexHome }) => {
    const P = "codex-parent";
    const spawned = (parent) => ({ source: { subagent: { thread_spawn: { parent_thread_id: parent, depth: 1 } } } });
    const call = (timestamp, name, call_id, args) => ({ timestamp, type: "response_item", payload: { type: "function_call", name, call_id, arguments: JSON.stringify(args) } });
    const output = (timestamp, call_id, value) => ({ timestamp, type: "response_item", payload: { type: "function_call_output", call_id, output: JSON.stringify(value) } });
    const started = (timestamp) => ({ timestamp, type: "event_msg", payload: { type: "task_started" } });
    codexSegment(codexHome, "parent.jsonl", {
      cwd: project, sessionId: P, metaTimestamp: stamp("10:00:00"),
      records: [
        started(stamp("10:00:01")),
        call(stamp("10:00:02"), "spawn_agent", "c1", { message: SECRET }),
        output(stamp("10:00:03"), "c1", { agent_id: "codex-child-1" }),
        { timestamp: stamp("10:00:04"), type: "event_msg", payload: { type: "task_complete" } },
        started(stamp("10:05:00")),
        call(stamp("10:05:01"), "wait_agent", "c2", { targets: ["codex-child-1"] }),
        output(stamp("10:05:02"), "c2", {}),
        call(stamp("10:05:03"), "spawn_agent", "c3", { message: SECRET }),
        output(stamp("10:05:04"), "c3", { agent_id: "codex-child-2" }),
        started(stamp("10:10:00")),
      ],
    });
    const child1 = codexSegment(codexHome, "child-1.jsonl", {
      cwd: project, sessionId: "codex-child-1", metaTimestamp: stamp("10:00:05"), metaExtra: { ...spawned(P), agent_role: "worker" },
      records: [tokenCount(stamp("10:04:00"), 40), { timestamp: stamp("10:04:30"), type: "response_item", payload: { text: SECRET } }],
    });
    codexSegment(codexHome, "child-2.jsonl", { cwd: project, sessionId: "codex-child-2", metaTimestamp: stamp("10:05:05"), metaExtra: spawned(P), records: [] });
    codexSegment(codexHome, "child-3.jsonl", { cwd: project, sessionId: "codex-child-3", metaTimestamp: stamp("10:06:00"), metaExtra: spawned(P), records: [] });
    // Never listed: another parent's child, a child recorded for another project, and a fork (a copy of history, not a spawned child).
    codexSegment(codexHome, "other-child.jsonl", { cwd: project, sessionId: "codex-other-child", metaTimestamp: stamp("10:07:00"), metaExtra: spawned("someone-else") });
    codexSegment(codexHome, "foreign-child.jsonl", { cwd: foreign, sessionId: "codex-foreign-child", metaTimestamp: stamp("10:07:00"), metaExtra: spawned(P) });
    codexSegment(codexHome, "fork.jsonl", { cwd: project, sessionId: "codex-fork", metaTimestamp: stamp("10:07:00"), metaExtra: { forked_from_id: P } });
    codexSegment(codexHome, "current.jsonl", { cwd: project, sessionId: "current-session" });

    const result = recovery.exportRunnerTranscript({ rootDir: project, runner: "codex", excludeSession: "current-session", sessionId: P, env: { CODEX_HOME: codexHome } });
    assert.equal(result.status, "available");
    assert.equal(result.segmentCount, 1);
    assert.deepEqual(result.childSessions.map((child) => [child.childId, child.agentType, child.spawnDepth, child.startTurnIndex, child.endTurnIndex]), [
      ["codex-child-1", "worker", 1, 0, 1],
      ["codex-child-2", null, 1, 1, 1],
      ["codex-child-3", null, 1, null, null],
    ]);
    assert.equal(result.childSessions[0].transcript.sha256, sha256Of(readFileSync(child1)));
    assert.equal(result.childSessions[0].transcript.recordCount, 3);
    assert.deepEqual(result.childSessions[0].usage, { status: "available", source: "codex-token-count-total", observations: 1, counters: codexCounters(40) });
    assert.deepEqual(result.turns, {
      model: "codex-task-started", count: 3, markersTruncated: false,
      markers: [{ index: 0, record: 1, timestamp: stamp("10:00:01") }, { index: 1, record: 5, timestamp: stamp("10:05:00") }, { index: 2, record: 10, timestamp: stamp("10:10:00") }],
    });
    assert.equal(result.completeness, "complete");
    const serialized = JSON.stringify(result);
    for (const forbidden of [SECRET, "codex-home", "child-1.jsonl", ".jsonl", "codex-other-child", "codex-foreign-child", "codex-fork"]) {
      assert.equal(serialized.includes(forbidden), false, `the export must not carry ${forbidden}`);
    }
  });
});

// The recorded Antigravity layout: <home>/.gemini/.../brain/<conversationId>/.system_generated/logs/transcript.jsonl.
const AGY_CONVERSATION = "11111111-2222-4333-8444-555555555555";
// The credential screen's two machine-plane lookups are stubbed so no test reads a real machine plane or home directory.
const NO_MACHINE_PLANE = { machinePlaneRead: () => ({ status: "absent" }), repoKeyDirectory: () => ({ status: "absent" }) };
const AGY_SENTINEL ="SENTINEL-OAUTH-CREDENTIAL-never-read";

function agyFixture(fixture, project, lines, { brainParent = join(".gemini", "antigravity", "brain") } = {}) {
  const home = join(realpathSync(fixture), "agy-home");
  const artifacts = join(home, brainParent, AGY_CONVERSATION);
  const logs = join(artifacts, ".system_generated", "logs");
  mkdirSync(logs, { recursive: true });
  mkdirSync(join(home, ".gemini"), { recursive: true });
  writeFileSync(join(home, ".gemini", "oauth_creds.json"), AGY_SENTINEL);
  const transcriptPath = join(logs, "transcript.jsonl");
  writeFileSync(transcriptPath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  // The host context exactly as the Antigravity pretool hook derives it from the original envelope.
  const host = antigravityArtifactHostContext({
    toolCall: { name: "run_command" }, conversationId: AGY_CONVERSATION, artifactDirectoryPath: artifacts, transcriptPath, workspacePaths: [realpathSync(project)],
  });
  return { home, artifacts, logs, transcriptPath, host };
}

const AGY_LINES = [
  { type: "turn.started", timestamp: stamp("11:00:00") },
  { type: "tool.call", timestamp: stamp("11:00:01"), text: SECRET },
  { type: "turn.completed", timestamp: stamp("11:00:02"), usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 } },
  { type: "turn.started", timestamp: stamp("11:05:00") },
  { type: "turn.completed", timestamp: stamp("11:05:09"), usage: { input_tokens: 5, output_tokens: 1 } },
];

test("AC-175B: the Antigravity export reads the current conversation through the brain layout from the host context only", () => {
  withExportFixture(({ fixture, project, codexHome }) => {
    const agy = agyFixture(fixture, project, AGY_LINES);
    const options = { rootDir: project, runner: "antigravity", excludeSession: AGY_CONVERSATION, sessionId: AGY_CONVERSATION, env: {}, homedirFn: () => agy.home, credentialScreen: NO_MACHINE_PLANE };
    const result = recovery.exportRunnerTranscript({ ...options, antigravityArtifactHost: agy.host });
    assert.equal(result.status, "available");
    assert.equal(result.runner, "antigravity");
    assert.equal(result.sessionId, AGY_CONVERSATION);
    assert.equal(result.segmentCount, 1);
    assert.equal(result.recordCount, 5);
    assert.equal(result.segments[0].sha256, sha256Of(readFileSync(agy.transcriptPath)));
    assert.equal(result.firstTimestamp, stamp("11:00:00"));
    assert.equal(result.lastTimestamp, stamp("11:05:09"));
    assert.equal(result.completeness, "complete");
    assert.deepEqual(result.usage, { status: "available", source: "antigravity-turn-completed", observations: 2, counters: { input_tokens: 15, cached_input_tokens: 2, output_tokens: 4 } });
    assert.deepEqual(result.turns, {
      model: "antigravity-turn-started", count: 2, markersTruncated: false,
      markers: [{ index: 0, record: 0, timestamp: stamp("11:00:00") }, { index: 1, record: 3, timestamp: stamp("11:05:00") }],
    });
    assert.equal(result.childSessions, "antigravity-child-sessions-not-recorded");
    const serialized = JSON.stringify(result);
    for (const forbidden of [SECRET, AGY_SENTINEL, fixture, basename(fixture), "brain", "transcript.jsonl", ".gemini", ".system_generated", "agy-home"]) {
      assert.equal(serialized.includes(forbidden), false, `the export must not carry ${forbidden}`);
    }
    // The context is a host field: the admitted CLI argv cannot carry it, so the CLI names that precise reason and reads nothing.
    const printed = JSON.parse(runMain(["export", "--root", project, "--runner", "antigravity", "--exclude-session", AGY_CONVERSATION, "--session-id", AGY_CONVERSATION], {}));
    assert.deepEqual(printed, { schema: SCHEMA, status: "unavailable", runner: "antigravity", reason: "antigravity-host-context-unavailable" });
    // Claude and Codex cannot select the Antigravity route with that option.
    codexSegment(codexHome, "s.jsonl", { cwd: project, sessionId: "some-session" });
    const codexWith = recovery.exportRunnerTranscript({ rootDir: project, runner: "codex", excludeSession: "current-session", sessionId: AGY_CONVERSATION, env: { CODEX_HOME: codexHome }, antigravityArtifactHost: agy.host });
    assert.deepEqual(codexWith, { schema: SCHEMA, status: "unavailable", runner: "codex", reason: "requested-session-unavailable" });
  });
});

test("AC-175B: the Antigravity export refuses an absent, foreign, aliased or credential-located context and reads no credential", () => {
  withExportFixture(({ fixture, project, foreign }) => {
    const agy = agyFixture(fixture, project, AGY_LINES);
    const base = { rootDir: project, runner: "antigravity", excludeSession: AGY_CONVERSATION, sessionId: AGY_CONVERSATION, env: {}, homedirFn: () => agy.home, credentialScreen: NO_MACHINE_PLANE };
    const reason = (extra) => recovery.exportRunnerTranscript({ ...base, antigravityArtifactHost: agy.host, ...extra });
    const typed = (why) => ({ schema: SCHEMA, status: "unavailable", runner: "antigravity", reason: why });
    assert.deepEqual(recovery.exportRunnerTranscript(base), typed("antigravity-host-context-unavailable"));
    // Own session only: a different requested id, and a claim that differs from the host conversation.
    assert.deepEqual(reason({ sessionId: "11111111-2222-4333-8444-666666666666" }), typed("requested-session-unavailable"));
    assert.equal(reason({ excludeSession: "11111111-2222-4333-8444-666666666666" }).reason, IDENTITY_CONFLICT);
    // Own project only, exact layout only.
    for (const delta of [
      { workspacePaths: [realpathSync(foreign)] },
      { conversationId: "bad" },
      { artifactDirectoryPath: join(agy.artifacts, "..", "11111111-2222-4333-8444-666666666666") },
      { transcriptPath: join(agy.artifacts, ".system_generated", "logs", "other.jsonl") },
    ]) {
      assert.deepEqual(reason({ antigravityArtifactHost: { ...agy.host, ...delta } }), typed("antigravity-host-context-invalid"), JSON.stringify(Object.keys(delta)));
    }
    // A linked transcript pointing at a credential is never followed.
    rmSync(agy.transcriptPath);
    symlinkSync(join(agy.home, ".gemini", "oauth_creds.json"), agy.transcriptPath);
    const linked = reason({});
    assert.deepEqual(linked, typed("antigravity-host-context-invalid"));
    assert.equal(JSON.stringify(linked).includes(AGY_SENTINEL), false);
    // A missing transcript is invalid, not an empty export.
    rmSync(agy.transcriptPath);
    assert.deepEqual(reason({}), typed("antigravity-host-context-invalid"));
  });
});

test("AC-175B: an Antigravity layout located under a credential root is refused even though its path shape is valid", () => {
  withExportFixture(({ fixture, project }) => {
    const agy = agyFixture(fixture, project, AGY_LINES, { brainParent: join(".config", "gcloud", "brain") });
    const result = recovery.exportRunnerTranscript({
      rootDir: project, runner: "antigravity", excludeSession: AGY_CONVERSATION, sessionId: AGY_CONVERSATION, env: {},
      homedirFn: () => agy.home, credentialScreen: NO_MACHINE_PLANE, antigravityArtifactHost: agy.host,
    });
    assert.deepEqual(result, { schema: SCHEMA, status: "unavailable", runner: "antigravity", reason: "antigravity-host-context-invalid" });
  });
});

// ---------------------------------------------------------------------------------------------
// AC-175 follow-up (AC-175C): the CLI export reaches the host context of its OWN Antigravity conversation through a handoff
// the pretool hook wrote for exactly this admitted command. The context never comes from a flag, a path or the environment.
// ---------------------------------------------------------------------------------------------

const AGY_OTHER = "11111111-2222-4333-8444-666666666666";
const agyCliArgs = (root, { id = AGY_CONVERSATION, exclude = id, session = id } = {}) =>
  ["export", "--root", root, "--runner", "antigravity", "--exclude-session", exclude, "--session-id", session];

/** The CLI exactly as the agent runs it; only the two machine-plane seams a test must stub travel as the second argument. */
function runCli(argv, seams = {}) {
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(Buffer.from(chunk)); return true; };
  try { recovery.main(argv, seams); } finally { process.stdout.write = originalWrite; }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function withHandoffFixture(run) {
  return withExportFixture((context) => {
    mkdirSync(join(context.project, ".git"));
    const root = realpathSync(context.project);
    const agy = agyFixture(context.fixture, context.project, AGY_LINES);
    const seams = { homedirFn: () => agy.home, credentialScreen: NO_MACHINE_PLANE };
    const typed = (reason) => ({ schema: SCHEMA, status: "unavailable", runner: "antigravity", reason });
    return run({ ...context, root, agy, seams, typed, args: agyCliArgs(root) });
  });
}

const handoffFile = (root, id = AGY_CONVERSATION) => join(handoff.antigravityHostHandoffDirectory(root), `${id}.json`);

test("AC-175C: a CLI export on Antigravity succeeds with the handoff the hook wrote, equals the library route, and consumes the handoff", () => {
  withHandoffFixture(({ root, agy, seams, args }) => {
    assert.equal(handoff.writeAntigravityHostHandoff({ root, host: agy.host, args }).status, "written");
    const file = handoffFile(root);
    assert.equal(existsSync(file), true);
    const printed = runCli(args, seams);
    const expected = recovery.exportRunnerTranscript({
      rootDir: root, runner: "antigravity", excludeSession: AGY_CONVERSATION, sessionId: AGY_CONVERSATION, env: {}, ...seams, antigravityArtifactHost: agy.host,
    });
    assert.equal(printed.status, "available");
    assert.deepEqual(printed, expected);
    assert.equal(existsSync(file), false, "the handoff does not outlive its one use");
    assert.deepEqual(readdirSync(handoff.antigravityHostHandoffDirectory(root)), []);
  });
});

test("AC-175C: a replayed handoff is refused typed because it is consumed by its first use", () => {
  withHandoffFixture(({ root, agy, seams, args, typed }) => {
    handoff.writeAntigravityHostHandoff({ root, host: agy.host, args });
    assert.equal(runCli(args, seams).status, "available");
    assert.deepEqual(runCli(args, seams), typed("antigravity-host-context-unavailable"));
  });
});

test("AC-175C: a missing or expired handoff is typed unavailable, and an expired one is removed", () => {
  withHandoffFixture(({ root, agy, seams, args, typed }) => {
    assert.deepEqual(runCli(args, seams), typed("antigravity-host-context-unavailable"));
    const longAgo = Date.now() - 10 * 60_000;
    handoff.writeAntigravityHostHandoff({ root, host: agy.host, args, now: longAgo });
    assert.equal(existsSync(handoffFile(root)), true);
    assert.deepEqual(runCli(args, seams), typed("antigravity-host-context-unavailable"));
    assert.equal(existsSync(handoffFile(root)), false, "an expired handoff is not left behind");
  });
});

test("AC-175C: a handoff of another conversation or another command is typed invalid and never exports", () => {
  withHandoffFixture(({ root, agy, seams, args, typed }) => {
    // A handoff for the other conversation, planted under this conversation's file name.
    const foreignHost = { ...agy.host, conversationId: AGY_OTHER };
    handoff.writeAntigravityHostHandoff({ root, host: foreignHost, args: agyCliArgs(root, { id: AGY_OTHER }) });
    mkdirSync(handoff.antigravityHostHandoffDirectory(root), { recursive: true });
    writeFileSync(handoffFile(root), readFileSync(handoffFile(root, AGY_OTHER)), { mode: 0o600 });
    assert.deepEqual(runCli(args, seams), typed("antigravity-host-context-invalid"));
    // A handoff admitted for different argv (another claimed session) does not serve this command.
    rmSync(handoffFile(root), { force: true });
    handoff.writeAntigravityHostHandoff({ root, host: agy.host, args: agyCliArgs(root, { exclude: AGY_OTHER }) });
    assert.deepEqual(runCli(args, seams), typed("antigravity-host-context-invalid"));
    // A handoff admitted for another project root does not serve this one.
    rmSync(handoffFile(root), { force: true });
    handoff.writeAntigravityHostHandoff({ root, host: { ...agy.host, workspacePaths: ["/somewhere/else"] }, args });
    assert.equal(runCli(args, seams).reason, "antigravity-host-context-invalid");
  });
});

test("AC-175C: a malformed, over-permissive or linked handoff is typed invalid and is not left behind", () => {
  withHandoffFixture(({ root, agy, seams, args, typed, fixture }) => {
    const directory = handoff.antigravityHostHandoffDirectory(root);
    mkdirSync(directory, { recursive: true });
    const file = handoffFile(root);
    const good = () => {
      handoff.writeAntigravityHostHandoff({ root, host: agy.host, args });
      return JSON.parse(readFileSync(file, "utf8"));
    };
    const plant = (text, mode = 0o600) => { rmSync(file, { force: true }); writeFileSync(file, text, { mode }); chmodSync(file, mode); };
    for (const [name, text] of [
      ["not json", "{not json"],
      ["not an object", "[]"],
      ["wrong schema", JSON.stringify({ ...good(), schema: "other.v1" })],
      ["host with an extra field", JSON.stringify({ ...good(), host: { ...agy.host, extra: "x" } })],
      ["host missing the transcript", JSON.stringify({ ...good(), host: { ...agy.host, transcriptPath: undefined } })],
      ["lifetime beyond the cap", JSON.stringify({ ...good(), expiresAt: Date.now() + 24 * 3_600_000 })],
    ]) {
      plant(text);
      assert.deepEqual(runCli(args, seams), typed("antigravity-host-context-invalid"), name);
      assert.equal(existsSync(file), false, `${name}: not left behind`);
    }
    plant(JSON.stringify(good()), 0o644);
    assert.deepEqual(runCli(args, seams), typed("antigravity-host-context-invalid"), "group/other readable");
    // A linked handoff is never followed.
    const real = join(fixture, "elsewhere.json");
    writeFileSync(real, JSON.stringify(good()), { mode: 0o600 });
    rmSync(file, { force: true });
    symlinkSync(real, file);
    assert.deepEqual(runCli(args, seams), typed("antigravity-host-context-invalid"), "symlink");
    rmSync(file, { force: true });
    linkSync(real, file);
    assert.deepEqual(runCli(args, seams), typed("antigravity-host-context-invalid"), "hard link");
  });
});

test("AC-175C: nothing an agent supplies selects the host context (flag, environment, library option)", () => {
  withHandoffFixture(({ root, agy, seams, args, typed }) => {
    // No flag carries a context: an extra flag is an invalid invocation, whatever its value.
    for (const extra of [["--host-context", agy.transcriptPath], ["--transcript", agy.transcriptPath], ["--artifact-directory", agy.artifacts]]) {
      assert.deepEqual(runCli([...args, ...extra], seams), { schema: SCHEMA, status: "unavailable", runner: "unknown", reason: "invalid-invocation" }, extra[0]);
    }
    // No environment variable carries it either.
    const printed = JSON.parse(runMain(args, { ANTIGRAVITY_ARTIFACT_DIRECTORY: agy.artifacts, ANTIGRAVITY_TRANSCRIPT_PATH: agy.transcriptPath, ANTIGRAVITY_CONVERSATION_ID: AGY_CONVERSATION }));
    assert.deepEqual(printed, typed("antigravity-host-context-unavailable"));
    // The second parameter of main() is a test seam for two lookups: it cannot inject a context.
    assert.deepEqual(runCli(args, { ...seams, antigravityArtifactHost: agy.host }), typed("antigravity-host-context-unavailable"));
  });
});

test("AC-175C: a Claude or Codex export is unchanged and neither reads nor consumes an Antigravity handoff", () => {
  withHandoffFixture(({ root, agy, args, codexHome, claudeHome, project }) => {
    handoff.writeAntigravityHostHandoff({ root, host: agy.host, args });
    const before = readFileSync(handoffFile(root), "utf8");
    codexSegment(codexHome, "prior.jsonl", { cwd: project, sessionId: "prior", records: [{ type: "event_msg", payload: { type: "task_started" } }] });
    const codexArgs = ["export", "--root", root, "--runner", "codex", "--exclude-session", "current-session", "--session-id", "prior"];
    const viaCli = runMain(codexArgs, { CODEX_HOME: codexHome });
    const viaLibrary = recovery.exportRunnerTranscript({ rootDir: root, runner: "codex", excludeSession: "current-session", sessionId: "prior", env: { CODEX_HOME: codexHome } });
    assert.equal(viaCli, `${JSON.stringify(viaLibrary)}\n`);
    assert.equal(JSON.parse(viaCli).status, "available");
    claudeSegment(claudeHome, project, "prior.jsonl", [claudeUser("prior", root, stamp("10:00:00")), claudeAssistant("prior", root, stamp("10:00:01"), "m1", { input_tokens: 1, output_tokens: 2 })]);
    const claudeArgs = ["export", "--root", root, "--runner", "claude", "--exclude-session", "current-session", "--session-id", "prior"];
    const claudeEnv = { CLAUDE_CONFIG_DIR: claudeHome, CLAUDE_CODE_SESSION_ID: "current-session" };
    const claudeViaCli = runMain(claudeArgs, claudeEnv);
    assert.equal(claudeViaCli, `${JSON.stringify(recovery.exportRunnerTranscript({ rootDir: root, runner: "claude", excludeSession: "current-session", sessionId: "prior", env: claudeEnv }))}\n`);
    assert.equal(JSON.parse(claudeViaCli).status, "available");
    assert.equal(readFileSync(handoffFile(root), "utf8"), before, "the handoff is untouched by the other runners");
  });
});

test("AC-175C: the stale-handoff sweep removes expired and foreign leftovers and keeps a live handoff", () => {
  withHandoffFixture(({ root, agy, args }) => {
    const directory = handoff.antigravityHostHandoffDirectory(root);
    handoff.writeAntigravityHostHandoff({ root, host: agy.host, args });
    const staleName = `${AGY_OTHER}.json`;
    writeFileSync(join(directory, staleName), "{}", { mode: 0o600 });
    writeFileSync(join(directory, `${AGY_OTHER}.json.claim-1`), "{}", { mode: 0o600 });
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(join(directory, staleName), old, old);
    utimesSync(join(directory, `${AGY_OTHER}.json.claim-1`), old, old);
    const swept = handoff.sweepAntigravityHostHandoffs({ root });
    assert.equal(swept.removed, 2);
    assert.deepEqual(readdirSync(directory), [`${AGY_CONVERSATION}.json`]);
    assert.equal(handoff.sweepAntigravityHostHandoffs({ root: join(root, "no-such-root") }).removed, 0);
  });
});
