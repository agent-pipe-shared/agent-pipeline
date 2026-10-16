#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
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

function codexSegment(codexHome, fileName, { cwd, sessionId, metaTimestamp, records = [], rawLines = [] }) {
  const directory = join(codexHome, "sessions", "2026", "09");
  mkdirSync(directory, { recursive: true });
  const target = join(directory, fileName);
  const meta = { type: "session_meta", payload: { cwd, session_id: sessionId } };
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
      "firstTimestamp", "lastTimestamp", "recordCount", "runner", "schema", "segmentCount", "segmentOrder",
      "segments", "sessionId", "status", "unparsedLineCount", "usage",
    ]);
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

test("export of an Antigravity or unknown runner stays typed unavailable because no storage layout is established", () => {
  withExportFixture(({ project, codexHome, claudeHome }) => {
    codexSegment(codexHome, "s.jsonl", { cwd: project, sessionId: "some-session" });
    for (const runner of ["antigravity", "unknown-runner"]) {
      assert.deepEqual(
        recovery.exportRunnerTranscript({ rootDir: project, runner, excludeSession: "current-session", sessionId: "some-session", env: { CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome } }),
        { schema: SCHEMA, status: "unavailable", runner, reason: "runner-transcript-source-unavailable" },
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
    const env = { CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome };
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
