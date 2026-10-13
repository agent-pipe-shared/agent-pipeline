// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.codex-own-session-audit-export-missing (ALF-C-P2-03, AC-133).
// Exercises the real own-session audit module and its real CLI (runner-transcript-recovery audit-current).
// Hosts without O_NOFOLLOW (native Windows) cannot open a session file under the module's alias
// protection; there it must say so honestly (`nofollow-unavailable`), and the cases that need a
// successful readback are skipped with that typed host-limitation reason.
import assert from "node:assert/strict";
import { constants, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { auditCurrentRunnerSession } from "../runner-own-session-audit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const cli = resolve(here, "..", "..", "scripts", "runner-transcript-recovery.mjs");
const HAS_NOFOLLOW = constants.O_NOFOLLOW !== undefined;
const HOST_LIMIT = HAS_NOFOLLOW ? false : "host-limitation: O_NOFOLLOW unavailable (nofollow-unavailable); session readback cannot succeed on this host";
const ENV_KEYS = ["CODEX_SESSION_ID", "CODEX_THREAD_ID", "CODEX_HOME"];

function fixture() {
  const scratch = join(repoRoot, "scratch");
  mkdirSync(scratch, { recursive: true });
  const base = realpathSync(mkdtempSync(join(scratch, "own-session-audit-")));
  const project = join(base, "project");
  const foreign = join(base, "foreign");
  const codexHome = join(base, "codex-home");
  mkdirSync(project);
  mkdirSync(foreign);
  mkdirSync(join(codexHome, "sessions", "2026", "10"), { recursive: true });
  return { base, project, foreign, codexHome, dir: join(codexHome, "sessions", "2026", "10") };
}

function session(fx, name, id, cwd, extra = []) {
  const lines = [JSON.stringify({ type: "session_meta", payload: { id, cwd } }), ...extra.map((row) => JSON.stringify(row))];
  writeFileSync(join(fx.dir, `${name}.jsonl`), `${lines.join("\n")}\n`);
}

function withEnv(values, run) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try { return run(); } finally {
    for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
}

const approved = (fx, extra = {}) => ({ rootDir: fx.project, runner: "codex", metadataConsent: "approved", ...extra });
const cleanup = (fx) => rmSync(fx.base, { recursive: true, force: true });
const SESSION = "audit-session-001";

test("explicit command shape: consent, runner and invocation are required; selectors, paths and read grants are refused", () => {
  const fx = fixture();
  try {
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession({ rootDir: fx.project, runner: "codex" }).reason, "metadata-consent-required");
      assert.equal(auditCurrentRunnerSession({ ...approved(fx), metadataConsent: "yes" }).reason, "metadata-consent-required");
      assert.equal(auditCurrentRunnerSession(approved(fx, { runner: "claude" })).reason, "runner-unavailable");
      for (const extra of [{ sessionId: "foreign" }, { session: SESSION }, { path: fx.dir }, { filePath: fx.dir },
        { readTranscript: true }, { transcript: "content" }, { operation: "read" }]) {
        const out = auditCurrentRunnerSession(approved(fx, extra));
        assert.equal(out.status, "unavailable", JSON.stringify(extra));
        assert.equal(out.reason, "invalid-invocation", JSON.stringify(extra));
      }
      assert.equal(auditCurrentRunnerSession(approved(fx, { operation: "audit-current" })).reason !== "invalid-invocation", true);
      assert.equal(auditCurrentRunnerSession(null).reason, "invalid-invocation");
      assert.equal(auditCurrentRunnerSession([]).reason, "invalid-invocation");
    });
  } finally { cleanup(fx); }
});

test("active session identity is proven from the host environment; absent or conflicting identity yields honest unavailable", () => {
  const fx = fixture();
  try {
    session(fx, "a", SESSION, fx.project);
    withEnv({ CODEX_HOME: fx.codexHome }, () => {
      const out = auditCurrentRunnerSession(approved(fx));
      assert.equal(out.status, "unavailable");
      assert.equal(out.reason, "MODEL-ROLE-SESSION-IDENTITY-UNAVAILABLE");
    });
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_THREAD_ID: "another-thread", CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "MODEL-ROLE-SESSION-IDENTITY-CONFLICT");
    });
    withEnv({ CODEX_SESSION_ID: "bad id/with slash", CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "MODEL-ROLE-SESSION-IDENTITY-CONFLICT");
    });
  } finally { cleanup(fx); }
});

test("repository identity is proven before any metadata: relative or missing repository and storage are unavailable", () => {
  const fx = fixture();
  try {
    session(fx, "a", SESSION, fx.project);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx, { rootDir: "relative/project" })).reason, "repository-unavailable");
      assert.equal(auditCurrentRunnerSession(approved(fx, { rootDir: undefined })).reason, "repository-unavailable");
      assert.equal(auditCurrentRunnerSession(approved(fx, { rootDir: join(fx.base, "missing") })).reason, "host-metadata-unavailable");
    });
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: "relative-home" }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "storage-unavailable");
    });
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: join(fx.base, "no-such-home") }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).status, "unavailable");
    });
  } finally { cleanup(fx); }
});

test("another session's metadata and a foreign repository are never exported (honest unavailable, never available)", () => {
  const fx = fixture();
  try {
    session(fx, "other", "someone-elses-session", fx.project, [{ type: "turn_context", payload: { model: "gpt-secret-model" } }]);
    session(fx, "foreign", SESSION, fx.foreign);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      const out = auditCurrentRunnerSession(approved(fx));
      assert.equal(out.status, "unavailable");
      assert.equal(out.reason, HAS_NOFOLLOW ? "session-repository-conflict" : "nofollow-unavailable");
      assert.equal(JSON.stringify(out).includes("gpt-secret-model"), false);
    });
  } finally { cleanup(fx); }
});

test("a session with no stored record for the active id reports current-session-unavailable", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    session(fx, "other", "someone-elses-session", fx.project);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "current-session-unavailable");
    });
  } finally { cleanup(fx); }
});

test("malformed session metadata and an ambiguous duplicate identity fail closed", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.dir, "bad.jsonl"), "not-json\n");
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "metadata-malformed");
    });
    rmSync(join(fx.dir, "bad.jsonl"));
    session(fx, "one", SESSION, fx.project);
    session(fx, "two", SESSION, fx.project);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      assert.equal(auditCurrentRunnerSession(approved(fx)).reason, "session-identity-ambiguous");
    });
  } finally { cleanup(fx); }
});

test("available readback is bounded metadata only: hashes, runner-supplied model and token counters, no transcript content or path", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    const usage = { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 1, total_tokens: 15 };
    session(fx, "mine", SESSION, fx.project, [
      { type: "turn_context", payload: { model: "gpt-5.5" } },
      { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usage } } },
      { type: "response_item", payload: { text: "PRIVATE-TRANSCRIPT-BODY" } },
    ]);
    withEnv({ CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      const out = auditCurrentRunnerSession(approved(fx));
      assert.equal(out.status, "available");
      assert.equal(out.identityAssurance, "host-environment-and-local-session-metadata");
      assert.match(out.sessionSha256, /^[0-9a-f]{64}$/u);
      assert.match(out.repositorySha256, /^[0-9a-f]{64}$/u);
      assert.equal(out.modelIdentity, "gpt-5.5");
      assert.deepEqual(out.tokenCounters, usage);
      assert.equal(out.phaseWallTime, "unavailable");
      const text = JSON.stringify(out);
      for (const leak of ["PRIVATE-TRANSCRIPT-BODY", SESSION, fx.project, fx.codexHome]) assert.equal(text.includes(leak), false, leak);
    });
  } finally { cleanup(fx); }
});

test("absent runner data is reported as unavailable, and reconnect (fresh process, same host identity) returns the same session hash", { skip: HOST_LIMIT }, () => {
  const fx = fixture();
  try {
    session(fx, "mine", SESSION, fx.project);
    withEnv({ CODEX_THREAD_ID: SESSION, CODEX_HOME: fx.codexHome }, () => {
      const first = auditCurrentRunnerSession(approved(fx));
      const second = auditCurrentRunnerSession(approved(fx));
      assert.equal(first.status, "available");
      assert.equal(first.modelIdentity, "unavailable");
      assert.equal(first.tokenCounters, "unavailable");
      assert.equal(first.phaseWallTime, "unavailable");
      assert.equal(second.sessionSha256, first.sessionSha256);
    });
  } finally { cleanup(fx); }
});

test("CLI audit-current: exact flag set only, consent required, never a session selector or read grant", () => {
  const fx = fixture();
  try {
    session(fx, "mine", SESSION, fx.project);
    const env = { ...process.env, CODEX_SESSION_ID: SESSION, CODEX_HOME: fx.codexHome };
    delete env.CODEX_THREAD_ID;
    const run = (args) => {
      const done = spawnSync(process.execPath, [cli, ...args], { env, encoding: "utf8" });
      return JSON.parse(done.stdout.trim().split("\n").at(-1));
    };
    const base = ["audit-current", "--root", fx.project, "--runner", "codex", "--metadata-consent", "approved"];
    const ok = run(base);
    assert.equal(ok.schema === "pipeline.runner-own-session-audit.v1" || ok.status === "unavailable", true);
    assert.equal(ok.status, HAS_NOFOLLOW ? "available" : "unavailable");
    if (!HAS_NOFOLLOW) assert.equal(ok.reason, "nofollow-unavailable");
    assert.equal(run(["audit-current", "--root", fx.project, "--runner", "codex", "--metadata-consent", "denied"]).reason, "metadata-consent-required");
    assert.equal(run([...base, "--session-id", "foreign"]).reason, "invalid-invocation");
    assert.equal(run(["audit-current", "--root", fx.project, "--runner", "codex"]).reason, "invalid-invocation");
    assert.equal(run(["audit-current", "--root", fx.project, "--root", fx.project, "--runner", "codex"]).reason, "invalid-invocation");
  } finally { cleanup(fx); }
});
