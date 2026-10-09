// SPDX-License-Identifier: SUL-1.0
// FANOUT slice S5: child-process contract tests for the Claude Stop adapter of the fan-out governor.
// Every case runs the real hook as a child with a stdin fixture. All state lives in a temp directory
// (queue, evidence, and a stand-in for the git common dir); the real repository's private state is never touched.
import assert from "node:assert/strict";
import { devNull, tmpdir } from "node:os";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fanoutStatePath, readEvents } from "../lib/fanout-ledger.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { decideStop } from "./stop-fanout.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "stop-fanout.mjs");
const SESSION = "s5-session";

const cases = [];
let autoNumbered = 0;
// An explicit `id` is for a case that sits between two auto-numbered ones (SF22b, Ruling 87): the neighbours keep their ids.
function check(name, run, id = `SF${String(++autoNumbered).padStart(2, "0")}`) {
  cases.push({ id, name, run });
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
function hook(box, payload, { config = configFor(box), env = {}, rawStdin = null, nodeArgs = [] } = {}) {
  const child = spawnSync(process.execPath, [...nodeArgs, HOOK], {
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

// FANOUT-F5b: SF20 is CHANGED, not deleted. Its control used to pin the git fallback ("exactly one git spawn
// once a queue is configured, windowsHide"); that fallback is gone (design 3.6: no `git`, no child process), so the
// control now passes the absolute commonDir the contract requires and pins that the configured queue flows through
// with zero spawns. The early-exit assertions and the real-child unset-config case are unchanged.
check("no config or no queuePath returns silently having spawned nothing; a configured queue with an absolute commonDir flows through without a spawn", () => {
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

    const out = decideStop(input, { config: JSON.parse(configFor(box)), execFile: spy, append: (_common, _runner, _session, event) => ({ event }) });
    assert.equal(JSON.parse(out).decision, "block", "control: the configured queue flows through");
    assert.deepEqual(spawned, [], "an absolute commonDir means nothing is spawned, not even once (design 3.6)");
  });
  withBox({}, (box) => {
    assertSilent(hook(box, stopPayload(box), { config: "" }), "unset PIPELINE_FANOUT_CONFIG as a real child");
    assert.deepEqual(ledgerTypes(box), []);
  });
});

// ---------------------------------------------------------------- FANOUT-F5b: no child process at all (design 3.6, 8 "native Windows")
// Critic finding F-A: the adapter still spawned `git rev-parse` when the config carried no commonDir. The git common
// dir now comes ONLY from the config's absolute `commonDir`.
// FANOUT-F5b2, scope of the real-process assertions: the ADAPTER spawns nothing. Two routes on its path may still spawn
// and are not forbidden wholesale. (1) `observeGovernanceScope` spawns git transitively when the config carries no
// boolean `requiresEnforcement` (lib/governance-scope.mjs:256-258 -> lib/worktree-lifecycle.mjs:255-277); every config
// in this file carries one, so that route is not exercised here. (2) The ledger's native-Windows private-state hardening
// (lib/windows-private-state.mjs, reached through lib/private-boundary.mjs from lib/fanout-ledger.mjs) spawns.
// FANOUT-SF22t / Ruling 87: SF22 PINS those spawns exactly instead of tolerating them, for the FIRST Stop per git common dir.
// SF22 runs in a fresh sandbox, so its Stop creates the ledger directory, and creating it spawns PowerShell on native
// Windows. That is a one-time directory-creation latency per common dir, ACCEPTED (Ruling 87, measured by
// FANOUT-WIN-M-20261009): the backlog item backlog/items/2026-10-06-fanout-ledger-spawns-powershell-on-every-stop-on-windows.md
// is re-scoped to exactly that. It stays a known deviation from design 3.6 and 8 ("native Windows": the Stop hook spawns
// nothing) for that first Stop only. What SF22 asserts: no `git` executable is spawned anywhere on the path; no spawn of
// any executable happens outside the ledger chain (every recorded spawn has `fanout-ledger.mjs` in its call chain); on win32
// every ledger-side spawn is the PowerShell executable reached through windows-private-state.mjs > private-boundary.mjs >
// fanout-ledger.mjs, EXACTLY LEDGER_POWERSHELL_SPAWN_BOUND_WIN32 of them per enforce-mode evaluation in the fresh sandbox
// (an equality, so SF22 is red on a reduction as well as on an increase); on every other platform there are none. SF22b
// pins the STEADY STATE: a second Stop against the same common dir spawns nothing at all, so a regression to per-Stop
// spawning turns red there.

// A preload for the REAL hook process: it wraps every `node:child_process` entry point, appends one line per call to a
// log file and then calls through, and `syncBuiltinESMExports()` makes the ESM named imports of the hook, and of every
// module it loads (a transitive git probe included), see the wrapper. An empty log is a measured "nothing was spawned";
// SF23 proves the wrapper really sees an ESM-style spawn, so that emptiness cannot be vacuous. One line per call:
// `<entry point> <executable> <- <module chain, innermost first>`. The executable is the FIRST argument only (its
// basename; for exec/execSync the first token of the command line), never the argv; the chain is file basenames only.
const TRIPWIRE_SOURCE = [
  'const cp = require("node:child_process");',
  'const { appendFileSync } = require("node:fs");',
  'const { syncBuiltinESMExports } = require("node:module");',
  "function executableOf(name, first) {",
  "  const text = String(first);",
  '  const match = name === "exec" || name === "execSync" ? /^\\s*(?:"([^"]+)"|(\\S+))/u.exec(text) : null;',
  "  const target = match === null ? text : (match[1] ?? match[2]);",
  "  return target.split(/[\\\\/]/u).pop();",
  "}",
  "function modulesOf() {",
  "  const limit = Error.stackTraceLimit;",
  "  Error.stackTraceLimit = 200;",
  "  const stack = String(new Error().stack);",
  "  Error.stackTraceLimit = limit;",
  "  const modules = [];",
  '  for (const line of stack.split("\\n")) {',
  "    const match = /([^()\\s]+\\.(?:mjs|cjs|js)):\\d+:\\d+\\)?\\s*$/u.exec(line);",
  '    if (match === null || match[1].startsWith("node:")) continue;',
  "    const file = match[1].split(/[\\\\/]/u).pop();",
  '    if (file !== "spawn-tripwire.cjs" && modules[modules.length - 1] !== file) modules.push(file);',
  "  }",
  '  return modules.join(">");',
  "}",
  'for (const name of ["exec", "execFile", "execFileSync", "execSync", "fork", "spawn", "spawnSync"]) {',
  "  const original = cp[name];",
  "  cp[name] = function spawnTripwire(...args) {",
  "    appendFileSync(process.env.PIPELINE_SF_SPAWN_LOG, `${name} ${executableOf(name, args[0])} <- ${modulesOf()}\\n`);",
  "    return original.apply(this, args);",
  "  };",
  "}",
  "syncBuiltinESMExports();",
  "",
].join("\n");
function tripwire(box) {
  const preload = join(box.root, "spawn-tripwire.cjs");
  const log = join(box.root, "spawn.log");
  writeFileSync(preload, TRIPWIRE_SOURCE);
  return {
    nodeArgs: ["--require", preload],
    env: { PIPELINE_SF_SPAWN_LOG: log },
    spawned: () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []),
  };
}
/** The tripwire log as records: `{ line, executable, modules }`. */
function spawnRecords(trip) {
  return trip.spawned().map((line) => {
    const match = /^(\w+) (.*?) <- (.*)$/u.exec(line);
    assert.ok(match, `unparsable tripwire line: ${line}`);
    return { line, executable: match[2], modules: match[3].split(">") };
  });
}
const isGit = (record) => /^git(?:\.(?:exe|cmd|bat|com))?$/iu.test(record.executable);
// FANOUT-SF22t (used by SF22 only): the pinned ledger-side spawn shape on native Windows, observed as 4 `powershell.exe`
// runs for the FIRST ledger-writing Stop against a fresh git common dir (SF22's sandbox is exactly that). All four come
// from ensureLedgerDirectory > ensurePrivateDirectory creating the ledger directory: a one-time directory-creation latency
// per common dir, ACCEPTED (Ruling 87), so the bound stays 4. SF22 asserts the count with an equality, so a reduction or an
// increase turns SF22 red. The steady state (a second Stop against the same common dir) is SF22b's concern: no spawn at
// all. The executable is matched by basename and the chain by module basenames, innermost first.
const LEDGER_POWERSHELL_SPAWN_BOUND_WIN32 = 4;
const LEDGER_POWERSHELL_CHAIN = ["windows-private-state.mjs", "private-boundary.mjs", "fanout-ledger.mjs"];
const isPowerShell = (record) => /^powershell\.exe$/iu.test(record.executable);
const reachesLedgerThroughPrivateState = (record) => LEDGER_POWERSHELL_CHAIN.every((file, index) => record.modules[index] === file);

check("a queuePath without an absolute commonDir fails open silently: nothing spawned, the governor and the ledger are never reached", () => {
  withBox({}, (box) => {
    const { commonDir: _omit, ...withoutCommonDir } = JSON.parse(configFor(box));
    const variants = [
      ["absent commonDir", withoutCommonDir],
      ["relative commonDir", { ...withoutCommonDir, commonDir: "relative/dir" }],
      ["non-string commonDir", { ...withoutCommonDir, commonDir: 7 }],
    ];
    for (const [label, config] of variants) {
      const spawned = [];
      const reached = [];
      // `execFile` is the pre-F5b injection point. Production no longer has one, so this spy is an inert tripwire
      // (red before the fix); the preload tripwire on the real process below is the actual measure.
      const spy = (file, args, options) => {
        spawned.push({ file, args, options });
        return `${box.common}\n`;
      };
      const evaluate = () => {
        reached.push("evaluate");
        throw new Error("the governor must not be reached");
      };
      const append = () => {
        reached.push("append");
        throw new Error("the ledger must not be reached");
      };
      assert.equal(decideStop(stopPayload(box), { config, execFile: spy, evaluate, append }), "", `${label}: silent`);
      assert.deepEqual(spawned, [], `${label}: nothing spawned through the seam`);
      assert.deepEqual(reached, [], `${label}: neither the governor nor the ledger was reached`);
    }
    for (const [label, config] of variants) {
      const trip = tripwire(box);
      assertSilent(hook(box, stopPayload(box), { config: JSON.stringify(config), nodeArgs: trip.nodeArgs, env: trip.env }), label);
      const records = spawnRecords(trip);
      assert.deepEqual(records.filter(isGit).map((record) => record.line), [], `${label}: the real hook process spawned no git`);
      // requiresEnforcement is a boolean here and the ledger is never reached: no spawn of any executable is possible.
      assert.deepEqual(records.map((record) => record.line), [], `${label}: the real hook process spawned nothing before the ledger (it is never reached)`);
    }
    assert.deepEqual(readdirSync(box.common), [], "no ledger file or directory was created anywhere");
  });
});

check("an absolute commonDir is the only source of the git common dir: no git spawn, none outside the ledger chain, and the win32 ledger-side PowerShell spawns are a pinned known deviation from design 8 (bound 4, must drop to 0)", (t) => {
  withBox({}, (box) => {
    const spawned = [];
    const recorded = [];
    const spy = (file, args, options) => {
      spawned.push({ file, args, options });
      return `${box.common}\n`;
    };
    const append = (common, _runner, _session, event) => {
      recorded.push({ common, type: event.type });
      return { event };
    };
    const out = decideStop(stopPayload(box), { config: JSON.parse(configFor(box)), execFile: spy, append });
    assert.equal(JSON.parse(out).decision, "block", "normal evaluation");
    assert.deepEqual(spawned, [], "nothing spawned through the seam");
    assert.deepEqual(recorded, [{ common: box.common, type: "stop-eval" }, { common: box.common, type: "block" }], "the ledger lives under the configured commonDir");
  });
  withBox({}, (box) => {
    const trip = tripwire(box);
    const result = hook(box, stopPayload(box), { nodeArgs: trip.nodeArgs, env: trip.env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).decision, "block", "normal evaluation in the real process");
    assert.deepEqual(ledgerTypes(box), ["stop-eval", "block"]);
    const records = spawnRecords(trip);
    assert.deepEqual(records.filter(isGit).map((record) => record.line), [], "the real hook process spawned no git on the whole path, transitive spawns included");
    // requiresEnforcement is a boolean in this config, so nothing may spawn outside the ledger chain.
    assert.deepEqual(
      records.filter((record) => !record.modules.includes("fanout-ledger.mjs")).map((record) => record.line),
      [],
      "no spawn of any executable happens outside the ledger chain",
    );
    // FANOUT-SF22t: the ledger-side spawns are PINNED, not tolerated. A known deviation from design 3.6 and 8, tracked in
    // backlog/items/2026-10-06-fanout-ledger-spawns-powershell-on-every-stop-on-windows.md. The count is an EXACT equality:
    // an increase is a regression and a reduction is the tracked fix landing, and both turn this red. Whoever fixes that
    // item must set LEDGER_POWERSHELL_SPAWN_BOUND_WIN32 to 0 (and this branch collapses into the other-platform one).
    const ledgerSide = records.filter((record) => record.modules.includes("fanout-ledger.mjs"));
    if (process.platform === "win32") {
      assert.deepEqual(
        ledgerSide.filter((record) => !isPowerShell(record)).map((record) => record.line),
        [],
        "on win32 every ledger-side spawn is the PowerShell executable",
      );
      assert.deepEqual(
        ledgerSide.filter((record) => !reachesLedgerThroughPrivateState(record)).map((record) => record.line),
        [],
        `on win32 every ledger-side spawn is reached through ${LEDGER_POWERSHELL_CHAIN.join(" > ")}`,
      );
      assert.ok(
        ledgerSide.length === LEDGER_POWERSHELL_SPAWN_BOUND_WIN32,
        `exactly ${LEDGER_POWERSHELL_SPAWN_BOUND_WIN32} ledger-side PowerShell spawns per enforce-mode evaluation on win32 (known deviation, backlog item), observed ${ledgerSide.length}; if the count dropped, the tracked fix landed and LEDGER_POWERSHELL_SPAWN_BOUND_WIN32 must be set to 0, if it rose that is a regression: ${JSON.stringify(ledgerSide.map((record) => record.line))}`,
      );
    } else {
      assert.deepEqual(ledgerSide.map((record) => record.line), [], "off win32 the ledger spawns nothing");
    }
    t.diagnostic(`ledger-side spawns pinned (${ledgerSide.length}, bound ${process.platform === "win32" ? LEDGER_POWERSHELL_SPAWN_BOUND_WIN32 : 0} on ${process.platform}): ${JSON.stringify(ledgerSide.map((record) => record.line))}`);
  });
});

// FANOUT-SF22b / Ruling 87 (FANOUT-WIN-M-20261009): the STEADY STATE. SF22 pins the FIRST Stop per git common dir, whose
// ledger-directory creation spawns PowerShell on native Windows (one-time, accepted). This case runs that first Stop and
// then a SECOND Stop against the same common dir and the same session, each as its own real hook process with its own
// tripwire (own preload and own log directory, so the second log cannot inherit the first one's lines), and pins that the
// second Stop spawns NOTHING, of any executable, on every platform: an existing ledger directory is only lstat'd
// (lib/fanout-ledger.mjs ensureLedgerDirectory), never re-hardened. It does not pin the first Stop's count (SF22 owns that),
// so the two cases have separate reasons to fail, and a regression to per-Stop spawning turns only this one red.
// Non-vacuity: (1) the second Stop must still decide `block` and really append to the ledger, so it ran the whole path;
// (2) the second Stop's own tripwire files then record a control spawn made in the same sandbox, so an empty second log is
// a measured zero and not a dead preload; (3) SF23 proves the wrapper sees an ESM-style spawn at all, and on win32 SF22
// proves the hook process loads this very preload (its exact count). Off win32 the first Stop spawns nothing either, so
// there (1) and (2) carry the non-vacuity.
check("steady state: a second Stop against the same common dir spawns no child process at all, with the same block decision and a real ledger append (the first Stop's one-time directory creation is SF22's)", (t) => {
  withBox({}, (box) => {
    assert.deepEqual(readdirSync(box.common), [], "precondition: a fresh git common dir with no ledger directory yet");
    const ledgerDirectory = dirname(fanoutStatePath(box.common, "claude", SESSION));
    const stop = (label) => {
      const directory = join(box.root, label);
      mkdirSync(directory);
      const trip = tripwire({ root: directory });
      return { trip, directory, result: hook(box, stopPayload(box), { nodeArgs: trip.nodeArgs, env: trip.env }) };
    };

    const first = stop("first-stop");
    assert.equal(first.result.status, 0, first.result.stderr);
    assert.equal(JSON.parse(first.result.stdout).decision, "block", "first Stop: normal evaluation in the real process");
    assert.deepEqual(ledgerTypes(box), ["stop-eval", "block"]);
    assert.equal(existsSync(ledgerDirectory), true, "the first Stop created the ledger directory");
    const firstRecords = spawnRecords(first.trip);

    const second = stop("second-stop");
    assert.equal(second.result.status, 0, second.result.stderr);
    const secondRecords = spawnRecords(second.trip);
    assert.deepEqual(
      secondRecords.map((record) => record.line),
      [],
      `the second Stop against the same common dir spawned ${secondRecords.length} child process(es) on ${process.platform}; Ruling 87: the steady state spawns none (only the first Stop creates the ledger directory)`,
    );
    assert.equal(JSON.parse(second.result.stdout).decision, "block", "second Stop: the same decision as the first");
    assert.deepEqual(ledgerTypes(box), ["stop-eval", "block", "stop-eval", "block"], "second Stop: a real ledger append, after the first Stop's two events");

    // Control: the second Stop's OWN preload and log, used for a spawn made in this same sandbox, record it.
    const control = join(second.directory, "spawn-control.mjs");
    writeFileSync(control, 'import { execFileSync } from "node:child_process";\nexecFileSync(process.execPath, ["--version"], { stdio: "ignore" });\n');
    const probe = spawnSync(process.execPath, [...second.trip.nodeArgs, control], { encoding: "utf8", env: { ...process.env, ...second.trip.env } });
    assert.equal(probe.status, 0, probe.stderr);
    const controlLines = second.trip.spawned();
    assert.equal(controlLines.length, 1, "control: the second Stop's tripwire records exactly the control spawn, so the zero above is measured");
    assert.match(controlLines[0], /^execFileSync /u);

    t.diagnostic(`first Stop: ${firstRecords.length} spawn(s), second Stop: ${secondRecords.length} on ${process.platform}; first Stop spawns: ${JSON.stringify(firstRecords.map((record) => record.line))}`);
  });
}, "SF22b");

check("the spawn tripwire is live: a control module that spawns through an ESM named import is recorded", () => {
  withBox({}, (box) => {
    const trip = tripwire(box);
    const control = join(box.root, "spawn-control.mjs");
    writeFileSync(control, 'import { execFileSync } from "node:child_process";\nexecFileSync(process.execPath, ["--version"], { stdio: "ignore" });\n');
    const child = spawnSync(process.execPath, [...trip.nodeArgs, control], { encoding: "utf8", env: { ...process.env, ...trip.env } });
    assert.equal(child.status, 0, child.stderr);
    const lines = trip.spawned();
    assert.equal(lines.length, 1, "exactly the control spawn is recorded");
    assert.match(lines[0], /^execFileSync /u);
  });
});

assert.equal(cases.length, 24, "the complete stop-fanout corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
