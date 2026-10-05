// SPDX-License-Identifier: SUL-1.0
// FANOUT slice S5: child-process contract tests for the Claude Stop adapter of the fan-out governor.
// Every case runs the real hook as a child with a stdin fixture. All state lives in a temp directory
// (queue, evidence, and a stand-in for the git common dir); the real repository's private state is never touched.
import assert from "node:assert/strict";
import { devNull, tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fanoutStatePath, readEvents } from "../lib/fanout-ledger.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { decideStop } from "./stop-fanout.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "stop-fanout.mjs");
const SESSION = "s5-session";

const cases = [];
function check(name, run) {
  cases.push({ id: `SF${String(cases.length + 1).padStart(2, "0")}`, name, run });
}

// ---------------------------------------------------------------- fixtures

function slice(id) {
  return {
    id,
    title: `title of ${id}`,
    state: "ready",
    dependsOn: [],
    writeScope: [`lib/${id.toLowerCase()}.mjs`],
    tier: "implementor",
    commitMode: "diff-only",
    loadClass: "light",
    briefing: { ref: `specs/unit/briefings/${id}.md` },
  };
}
const queueOf = (count) => ({
  schema: "pipeline.slice-queue.v1",
  feature: "unit",
  defaults: { commitMode: "diff-only", tier: "implementor" },
  monoliths: [],
  slices: Array.from({ length: count }, (_, index) => slice(`A${index + 1}`)),
});

/** A fresh sandbox: `root` (cwd, queue, evidence) and `common` (the stand-in git common dir). */
function sandbox({ slices = 3, queue = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "fanout-s5-"));
  const common = join(root, "common");
  mkdirSync(common);
  mkdirSync(join(root, "evidence"));
  if (queue) writeFileSync(join(root, "queue.json"), JSON.stringify(queueOf(slices)));
  return { root, common, queuePath: join(root, "queue.json") };
}
const configFor = (box, extra = {}) => JSON.stringify({ mode: "enforce", requiresEnforcement: true, platform: "linux", queuePath: box.queuePath, commonDir: box.common, ...extra });
function hook(box, payload, { config = configFor(box), env = {}, rawStdin = null } = {}) {
  const child = spawnSync(process.execPath, [HOOK], {
    cwd: box.root,
    input: rawStdin ?? JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "", PIPELINE_FANOUT_CONFIG: config, ...env },
  });
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}
const stopPayload = (box, extra = {}) => ({
  session_id: SESSION,
  hook_event_name: "Stop",
  cwd: box.root,
  transcript_path: join(box.root, "transcript.jsonl"),
  stop_hook_active: false,
  ...extra,
});
const ledgerTypes = (box) => readEvents(box.common, "claude", SESSION).events.map((event) => event.type);
function withBox(options, body) {
  const box = sandbox(options);
  try {
    body(box);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
}
function assertSilent(result, message = "") {
  assert.equal(result.status, 0, `${message} exit code (stderr: ${result.stderr})`);
  assert.equal(result.stdout, "", `${message} stdout must be empty`);
}

// ---------------------------------------------------------------- cases

check("shadow mode: an orchestrator Stop is silent, exits 0 and records one stop-eval (no block event)", () => {
  withBox({}, (box) => {
    const result = hook(box, stopPayload(box), { config: configFor(box, { mode: "shadow" }) });
    assertSilent(result);
    assert.deepEqual(ledgerTypes(box), ["stop-eval"]);
    const [event] = readEvents(box.common, "claude", SESSION).events;
    assert.equal(event.decision, "block", "the would-be decision is logged");
    assert.equal(event.mode, "shadow");
  });
});

check("the default mode (no mode in the config) is shadow: silent", () => {
  withBox({}, (box) => {
    const config = JSON.stringify({ requiresEnforcement: true, platform: "linux", queuePath: box.queuePath, commonDir: box.common });
    assertSilent(hook(box, stopPayload(box), { config }));
    assert.deepEqual(ledgerTypes(box), ["stop-eval"]);
  });
});

check("enforce mode with ready slices and free slots: exit 0, block JSON with <plugin-root> substituted, stop-eval and block recorded", () => {
  withBox({}, (box) => {
    const result = hook(box, stopPayload(box));
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(out).sort(), ["decision", "reason"]);
    assert.equal(out.decision, "block");
    assert.match(out.reason, /^FANOUT-BLOCK: 4 free slot\(s\), 3 ready slice\(s\)/u);
    assert.equal(out.reason.includes("<plugin-root>"), false, "the placeholder is substituted");
    assert.match(out.reason, /node .+slice-queue\.mjs defer <id>/u);
    assert.deepEqual(ledgerTypes(box), ["stop-eval", "block"]);
  });
});

check("stop_hook_active: true right after our own block is governed by the loop rule (no output, defied recorded)", () => {
  withBox({}, (box) => {
    assert.equal(JSON.parse(hook(box, stopPayload(box)).stdout).decision, "block");
    const again = hook(box, stopPayload(box, { stop_hook_active: true }));
    assertSilent(again, "second stop");
    assert.deepEqual(ledgerTypes(box), ["stop-eval", "block", "stop-eval", "defied"]);
  });
});

check("stop_hook_active: true with no block of ours is not our loop: it still blocks", () => {
  withBox({}, (box) => {
    const result = hook(box, stopPayload(box, { stop_hook_active: true }));
    assert.equal(JSON.parse(result.stdout).decision, "block");
  });
});

check("a subagent payload (agent_id present) gets no output and no ledger line", () => {
  withBox({}, (box) => {
    assertSilent(hook(box, stopPayload(box, { agent_id: "agent-1", agent_type: "goldfish-implementor" })));
    assertSilent(hook(box, stopPayload(box, { agent_id: "agent-1" })));
    assert.deepEqual(ledgerTypes(box), []);
  });
});

// FANOUT-F5: SF07 is CHANGED, not deleted. It used to pin "advisory mode never produces hook output",
// which locked in the defect (the governor's advisory text was dropped, adapter Critic F2). It now pins
// the corrected behaviour: advisory text reaches the session on the stop-suggest channel, never as a block.
check("advisory mode emits the governor's advisory text as systemMessage/additionalContext (never a block decision, no block event)", () => {
  withBox({}, (box) => {
    const result = hook(box, stopPayload(box), { config: configFor(box, { mode: "advisory" }) });
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(out).sort(), ["hookSpecificOutput", "systemMessage"]);
    assert.match(out.systemMessage, /^FANOUT-ADVISORY: 4 free slot\(s\), 3 ready slice\(s\)/u);
    assert.deepEqual(out.hookSpecificOutput, { hookEventName: "Stop", additionalContext: out.systemMessage });
    assert.equal(out.systemMessage.includes("<plugin-root>"), false, "the placeholder is substituted");
    assert.match(out.systemMessage, /node .+slice-queue\.mjs defer <id>/u);
    assert.deepEqual(ledgerTypes(box), ["stop-eval"], "advisory records the evaluation but never a block");
  });
});

check("no queue configured: the governor gets 'no queue', the hook is silent", () => {
  withBox({ queue: false }, (box) => {
    const config = JSON.stringify({ mode: "enforce", requiresEnforcement: true, platform: "linux", commonDir: box.common });
    assertSilent(hook(box, stopPayload(box), { config }));
  });
});

check("consumer opt-out (requiresEnforcement false) is silent and never blocks", () => {
  withBox({}, (box) => {
    assertSilent(hook(box, stopPayload(box), { config: configFor(box, { requiresEnforcement: false }) }));
  });
});

check("fail-open: malformed, empty or non-object stdin exits 0 with no stdout", () => {
  withBox({}, (box) => {
    for (const rawStdin of ["{", "", "null", "[]", "42", "\"x\""]) assertSilent(hook(box, null, { rawStdin }), JSON.stringify(rawStdin));
    assert.deepEqual(ledgerTypes(box), []);
  });
});

check("fail-open: a missing queue file exits 0 with no stdout", () => {
  withBox({ queue: false }, (box) => {
    assertSilent(hook(box, stopPayload(box)));
  });
});

check("fail-open: a malformed config, a missing session id or an unusable common dir exits 0 with no stdout", () => {
  withBox({}, (box) => {
    assertSilent(hook(box, stopPayload(box), { config: "{not json" }), "bad config json");
    const { session_id: _omit, ...noSession } = stopPayload(box);
    assertSilent(hook(box, noSession), "no session id");
    assertSilent(hook(box, stopPayload(box), { config: configFor(box, { commonDir: "relative/dir" }) }), "relative commonDir");
  });
});

check("fail-open: an unreadable ledger (the ledger path is a directory) exits 0 with no stdout, even in enforce mode", () => {
  withBox({}, (box) => {
    mkdirSync(fanoutStatePath(box.common, "claude", SESSION), { recursive: true });
    assertSilent(hook(box, stopPayload(box)));
  });
});

check("fail-open: a governor that throws (PIPELINE_FANOUT_TEST_THROW=1 test seam) exits 0 with no stdout", () => {
  withBox({}, (box) => {
    assertSilent(hook(box, stopPayload(box), { env: { PIPELINE_FANOUT_TEST_THROW: "1" } }));
    assert.deepEqual(ledgerTypes(box), []);
    assert.equal(JSON.parse(hook(box, stopPayload(box)).stdout).decision, "block", "control: the same sandbox blocks without the seam");
  });
});

check("a launch event after the block resets the loop: the next Stop with stop_hook_active blocks again", () => {
  withBox({}, (box) => {
    assert.equal(JSON.parse(hook(box, stopPayload(box)).stdout).decision, "block");
    const launch = { type: "launch", sliceId: "A1", agentType: "goldfish-implementor", model: "claude-sonnet-5-5", writeScopeHash: "0".repeat(64), commitMode: "diff-only", at: new Date().toISOString() };
    writeFileSync(fanoutStatePath(box.common, "claude", SESSION), `${readEventsRaw(box)}${JSON.stringify({ schema: "pipeline.fanout-event.v1", ...launch })}\n`);
    const result = hook(box, stopPayload(box, { stop_hook_active: true }));
    assert.equal(JSON.parse(result.stdout).decision, "block");
  });
});
function readEventsRaw(box) {
  return readEvents(box.common, "claude", SESSION).events.map((event) => `${JSON.stringify({ schema: "pipeline.fanout-event.v1", ...event })}\n`).join("");
}

// ---------------------------------------------------------------- FANOUT-F5 regression cases
// adapter Critic F2 (advisory output + implementationPhaseActive), governor Critic F1 (block only after a
// durable append) and adapter Critic F5 (no spawn before the queuePath/config early exit).

check("shadow and off stay silent even when the governor would block (advisory text is an advisory/enforce channel only)", () => {
  withBox({}, (box) => {
    assertSilent(hook(box, stopPayload(box), { config: configFor(box, { mode: "shadow" }) }), "shadow");
    assert.deepEqual(ledgerTypes(box), ["stop-eval"]);
  });
  withBox({}, (box) => {
    assertSilent(hook(box, stopPayload(box), { config: configFor(box, { mode: "off" }) }), "off");
    assert.deepEqual(ledgerTypes(box), []);
  });
  withBox({ queue: false }, (box) => {
    for (const mode of ["shadow", "off"]) {
      assertSilent(hook(box, stopPayload(box), { config: configFor(box, { mode, implementationPhaseActive: true }) }), `${mode} with no queue`);
    }
  });
});

check("FANOUT-NO-QUEUE reaches the session in advisory and enforce mode (absent queue while implementing, invalid queue) as advisory output, never a block", () => {
  for (const mode of ["advisory", "enforce"]) {
    withBox({ queue: false }, (box) => {
      const absent = hook(box, stopPayload(box), { config: configFor(box, { mode, implementationPhaseActive: true }) });
      assert.equal(absent.status, 0, absent.stderr);
      const out = JSON.parse(absent.stdout);
      assert.deepEqual(Object.keys(out).sort(), ["hookSpecificOutput", "systemMessage"], mode);
      assert.match(out.systemMessage, /^FANOUT-NO-QUEUE: no slice queue is declared/u);
      assert.match(out.systemMessage, /node .+slice-queue\.mjs add/u);
      assert.equal(out.systemMessage.includes("<plugin-root>"), false, "the placeholder is substituted");
      assert.deepEqual(out.hookSpecificOutput, { hookEventName: "Stop", additionalContext: out.systemMessage });
      assert.deepEqual(ledgerTypes(box), [], "rules 1-4 log nothing");
      assertSilent(hook(box, stopPayload(box), { config: configFor(box, { mode, implementationPhaseActive: false }) }), `${mode}: absent queue, not implementing`);
    });
    withBox({ queue: false }, (box) => {
      writeFileSync(box.queuePath, "{ not json");
      const invalid = JSON.parse(hook(box, stopPayload(box), { config: configFor(box, { mode }) }).stdout);
      assert.match(invalid.systemMessage, /^FANOUT-NO-QUEUE: the slice queue is invalid/u, mode);
      assert.equal(invalid.decision, undefined, "an advisory line is never a block decision");
    });
  }
});

check("implementationPhaseActive is derived from the feature state (design 3.10): implementing with no queue -> the NO-QUEUE line, any other phase or unreadable state -> silent", () => {
  const advisory = (box) => hook(box, stopPayload(box), { config: configFor(box, { mode: "advisory" }) });
  for (const [dir, file] of [["project", "pipeline-state.json"], [".claude", "pipeline-state.json"]]) {
    withBox({ queue: false }, (box) => {
      assertSilent(advisory(box), `${dir}: no state file`);
      mkdirSync(join(box.root, dir), { recursive: true });
      writeFileSync(join(box.root, dir, file), JSON.stringify({ activeFeature: { phase: "design" } }));
      assertSilent(advisory(box), `${dir}: phase design`);
      writeFileSync(join(box.root, dir, file), JSON.stringify({ activeFeature: { phase: "implementation" } }));
      const result = advisory(box);
      assert.equal(result.status, 0, result.stderr);
      assert.match(JSON.parse(result.stdout).systemMessage, /^FANOUT-NO-QUEUE: no slice queue is declared/u, dir);
      writeFileSync(join(box.root, dir, file), "{ malformed");
      assertSilent(advisory(box), `${dir}: malformed state`);
    });
  }
});

check("a block is emitted only after its block event was durably appended: a refused append, or a result without a block event, fails open", () => {
  withBox({}, (box) => {
    const config = JSON.parse(configFor(box));
    const input = stopPayload(box);
    const recorded = [];
    const ok = (_common, _runner, _session, event) => {
      recorded.push(event.type);
      return { path: "unit", event };
    };
    assert.equal(JSON.parse(decideStop(input, { config, append: ok })).decision, "block", "control: a recorded block is issued");
    assert.deepEqual(recorded, ["stop-eval", "block"], "recorded in the governor's order before the block is returned");

    const refused = [];
    const unsafeOnBlock = (_common, _runner, _session, event) => {
      if (event.type === "block") throw Object.assign(new Error("ledger"), { code: "FANOUT-FILE-UNSAFE" });
      refused.push(event.type);
      return { path: "unit", event };
    };
    assert.equal(decideStop(input, { config, append: unsafeOnBlock }), "", "FANOUT-FILE-UNSAFE on the block append: no block");
    assert.deepEqual(refused, ["stop-eval"]);
    const unsafeAlways = () => {
      throw Object.assign(new Error("ledger"), { code: "FANOUT-FILE-UNSAFE" });
    };
    assert.equal(decideStop(input, { config, append: unsafeAlways }), "", "no event can be appended: no block");

    const withoutBlockEvent = () => ({ decision: "block", reasonCode: "FANOUT-BLOCK", reason: "FANOUT-BLOCK: unit", telemetry: { mode: "enforce", events: [{ type: "stop-eval" }] } });
    assert.equal(decideStop(input, { config, evaluate: withoutBlockEvent, append: ok }), "", "a block whose block event was never produced is not issued");
  });
});

check("no config or no queuePath returns silently having spawned nothing; once a queue is configured the one git spawn is windowsHide", () => {
  withBox({}, (box) => {
    const spawned = [];
    const spy = (file, args, options) => {
      spawned.push({ file, args, options });
      return `${box.common}\n`;
    };
    const input = stopPayload(box);
    const base = { mode: "enforce", requiresEnforcement: true, platform: "linux" };
    for (const [label, config] of [
      ["unset config", {}],
      ["no queuePath", base],
      ["empty queuePath", { ...base, queuePath: "" }],
      ["non-string queuePath", { ...base, queuePath: 7 }],
    ]) {
      assert.equal(decideStop(input, { config, execFile: spy }), "", label);
    }
    assert.deepEqual(spawned, [], "no child process before the queuePath/config early exit");
    assert.deepEqual(ledgerTypes(box), []);

    const { commonDir: _omit, ...withoutCommonDir } = JSON.parse(configFor(box));
    const out = decideStop(input, { config: withoutCommonDir, execFile: spy, append: (_common, _runner, _session, event) => ({ event }) });
    assert.equal(JSON.parse(out).decision, "block", "control: the configured queue flows through the injected spawn seam");
    assert.equal(spawned.length, 1, "exactly one git spawn once a queue is configured");
    assert.equal(spawned[0].file, "git");
    assert.equal(spawned[0].options.windowsHide, true, "no console window on native Windows");
    assert.equal(spawned[0].options.cwd, box.root);
  });
  withBox({}, (box) => {
    assertSilent(hook(box, stopPayload(box), { config: "" }), "unset PIPELINE_FANOUT_CONFIG as a real child");
    assert.deepEqual(ledgerTypes(box), []);
  });
});

assert.equal(cases.length, 20, "the complete stop-fanout corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
