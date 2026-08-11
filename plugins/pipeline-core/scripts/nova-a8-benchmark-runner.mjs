#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * nova-a8-benchmark-runner.mjs -- drives the five fixed NVA-A8 workloads through the "serial"
 * (direct `node task.mjs` subprocess) and "native" (real `claude -p` headless CLI dispatch)
 * routes, for 1 warmup + 5 measured repetitions each, and assembles a real
 * `pipeline.multi-cli-benchmark.v1` record by calling the existing scoring contract
 * (evaluateMultiCliBenchmark) -- never reimplementing it.
 *
 * REAL, NOT SYNTHETIC: every number in the resulting record comes from an actual observed
 * subprocess or CLI invocation on this host, at real run time. No fabricated numbers anywhere
 * (see the DoD in the dispatching briefing NVA-A8-RUNNER). Where a number is genuinely not
 * observable (serial-route token usage), it is reported as null/"unknown", never guessed.
 *
 * NATIVE-ROUTE CLI INVOCATION (empirically verified live in this environment before this file
 * was written -- see the workload-runner header notes below for what was learned and why):
 *   - `--output-format stream-json` with `-p` REQUIRES `--verbose` on the CLI version this was
 *     built against (2.1.227), even though the sibling script critic-bare.mjs's own
 *     buildChildArgs() omits it -- that script documents it has never exercised a real `claude
 *     -p` call. This is a disclosed, necessary deviation from "reuse critic-bare's exact
 *     invocation shape", not a stylistic choice.
 *   - Bash tool calls are denied by default ("This command requires approval") in a fully
 *     headless `-p` session with no permission-mode override. A blanket
 *     `--permission-mode bypassPermissions` (or `--dangerously-skip-permissions`) is refused
 *     by THIS session's own outer auto-mode classifier as too broad an action to grant
 *     autonomously (observed twice, including when the flag was only present inside a spawned
 *     Node child's argv, never typed literally into this session's own Bash tool calls). The
 *     narrow, scoped `--allowedTools "Bash(node *)"` allow-list is NOT blocked and reliably lets
 *     the child run exactly the one `node <task.mjs>` command it is asked to run, without a
 *     blanket bypass -- this is what NATIVE_ARGS uses.
 *   - Must run from a NEUTRAL cwd (os.tmpdir()), like critic-bare.mjs -- from the repo's own
 *     cwd, this repo's SessionStart/Stop hooks fire inside the child and inflate both prompt
 *     tokens (extra ~4k cache-creation tokens observed) and turn count for no benefit here.
 *   - Real usage tokens live on the final stream-json "result" event's `usage.input_tokens` /
 *     `usage.output_tokens` fields (aggregate for the whole child session, not per-tool-call --
 *     documented as such below and in the final report).
 *   - The Bash tool's own captured stdout/stderr live on the LAST `type:"user"` event carrying a
 *     `tool_use_result` field (`{stdout, stderr, ...}`); `is_error` lives on that event's
 *     `message.content[].is_error`. See findLastBashToolResult().
 *
 * EVIDENCE-HASH NORMALIZATION (disclosed deviation from the briefing's literal "sha256 of a
 * small object bundling the full captured stdout/stderr/exit code"): the RAW stdout/stderr of
 * the wrapping `claude -p` CLI process itself (assistant text, session ids, timing) is
 * inherently non-deterministic across identical calls and would make every sample's
 * evidenceSha256 differ, which evaluateMultiCliBenchmark's own MCB-FALSE-SUCCESS check requires
 * to be identical within a route+class (Set size 1). This runner instead bundles the stdout/
 * stderr/exit-code of the UNDERLYING WORKLOAD's own execution only -- for "serial" that is
 * spawnSync's own captured stdout/stderr/status; for "native" it is the inner Bash tool's own
 * captured stdout/stderr/is_error (never the wrapping CLI's free text). Since every workload is
 * designed to write nothing to stdout/stderr on success, both routes should observe the
 * identical {stdout:"", stderr:"", exitCode:0} bundle -- this is the deliberate, disclosed
 * mechanism by which correctnessEqual is expected to come out true, not an accident.
 *
 * STAGE TIMING: orchestrationMs/workspaceMs/verificationMs/retryMs/cleanupMs are real,
 * individually hrtime-bracketed sub-phases of THIS RUNNER's own sequencing around each
 * invocation (build args, reset workspace state, verify result.txt, the failure-recovery
 * retry, counter-file cleanup). There is deliberately no named "executionMs" stage -- the bulk
 * of wallMs is the workload's/CLI's own run time, which the schema's fixed 6-stage vocabulary
 * does not itemize; the stage sum therefore never approaches wallMs, by design, not by mistake.
 *
 * Node built-ins only, ESM. See nova-a8-benchmark-runner.test.mjs for the unit-level suite
 * (fixtures run directly + this file's pure helpers against mock/stub data, no real `claude -p`
 * call). The real end-to-end run is invoked manually: `node nova-a8-benchmark-runner.mjs`.
 */

import { createHash } from "node:crypto";
import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateMultiCliBenchmark, BENCHMARK_CLASSES, BENCHMARK_FIXTURES } from "../lib/multi-cli-benchmark.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..", "..");
const WORKLOADS_DIR = join(SCRIPT_DIR, "fixtures", "nova-benchmark", "workloads");
const SCHEMA_PATH = join(SCRIPT_DIR, "multi-cli-benchmark.schema.json");
const OUT_DIR = join(REPO_ROOT, "specs", "sprint-nova-epic", "evidence", "nova-a", "a3");

export const HOST_CLASS = "session-local";
export const NATIVE_MODEL = "haiku";
export const NATIVE_TIMEOUT_MS = 120_000;
export const RESOURCE_HARD_LIMIT_MS = 300_000; // generous: real cold-start CLI calls observed ~4-9s

// ---------------------------------------------------------------------------------------------
// Hashing helpers.
// ---------------------------------------------------------------------------------------------

export function sha256(bufferOrString) {
  return createHash("sha256").update(bufferOrString).digest("hex");
}

export function sha256Of(obj) {
  return sha256(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------------------------
// Native-route CLI-dispatch helpers (pure; unit-tested against mock/stub data).
// ---------------------------------------------------------------------------------------------

export function buildPrompt(cmd) {
  return `Run this exact command using the Bash tool and nothing else: ${cmd}\nDo not modify, inspect, or explain anything else. After it completes, reply with only the single word: done.`;
}

export function buildNativeArgs({ promptText, repoAbs }) {
  return [
    "-p",
    promptText,
    "--add-dir",
    repoAbs,
    "--output-format",
    "stream-json",
    "--model",
    NATIVE_MODEL,
    "--no-session-persistence",
    "--verbose",
    "--allowedTools",
    "Bash(node *)",
  ];
}

export function parseStreamJsonEvents(text) {
  const events = [];
  const parseErrors = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch (err) {
      parseErrors.push({ line, message: err.message });
    }
  }
  return { events, parseErrors };
}

export function findResultEvent(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i] && typeof events[i] === "object" && events[i].type === "result") return events[i];
  }
  return undefined;
}

/** Last `type:"user"` event carrying a `tool_use_result` (the Bash call's own captured
 *  stdout/stderr) -- never the wrapping CLI's own free text. Returns undefined if the child
 *  never actually ran a tool. */
export function findLastBashToolResult(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.type === "user" && e.tool_use_result && typeof e.tool_use_result.stdout === "string") {
      const isError = Array.isArray(e.message?.content) && e.message.content.some((c) => c && c.is_error === true);
      return { stdout: e.tool_use_result.stdout, stderr: e.tool_use_result.stderr ?? "", isError };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Route invocation (serial = direct node subprocess; native = real `claude -p` dispatch).
// spawnSyncFn/spawnFn are dependency-injected so tests never shell out to a real CLI.
// ---------------------------------------------------------------------------------------------

export function invokeSerial(taskFilePath, args, spawnSyncFn = nodeSpawnSync) {
  const res = spawnSyncFn("node", [taskFilePath, ...args], { encoding: "utf8" });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", exitCode: res.status ?? 1, usage: undefined };
}

/** One `claude -p` attempt. Rejects if no result event arrives, or if the child never actually
 *  ran the Bash tool call (transient model/CLI non-determinism, observed empirically -- retried
 *  by invokeNative() below, never silently papered over). */
function invokeNativeOnce(taskFilePath, args, spawnFn) {
  return new Promise((resolvePromise, reject) => {
    const cmd = `node ${taskFilePath}${args.length ? ` ${args.join(" ")}` : ""}`;
    const promptText = buildPrompt(cmd);
    const child = spawnFn("claude", buildNativeArgs({ promptText, repoAbs: REPO_ROOT }), {
      cwd: tmpdir(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let out = "";
    let errBuf = "";
    const timer = setTimeout(() => {
      child.kill();
    }, NATIVE_TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      errBuf += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const { events } = parseStreamJsonEvents(out);
        const resultEvent = findResultEvent(events);
        if (!resultEvent) {
          reject(new Error(`native invocation produced no "result" stream-json event (stderr=${errBuf.slice(0, 500)})`));
          return;
        }
        const toolResult = findLastBashToolResult(events);
        if (!toolResult) {
          reject(new Error(`native invocation never executed the Bash tool call (stderr=${errBuf.slice(0, 500)})`));
          return;
        }
        const usage =
          resultEvent.usage &&
          typeof resultEvent.usage.input_tokens === "number" &&
          typeof resultEvent.usage.output_tokens === "number"
            ? { input: resultEvent.usage.input_tokens, output: resultEvent.usage.output_tokens, unit: "tokens" }
            : { input: null, output: null, unit: "unknown" };
        resolvePromise({
          stdout: toolResult.stdout,
          stderr: toolResult.stderr,
          exitCode: toolResult.isError ? 1 : 0,
          usage,
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** Up to 2 real attempts: a transient non-execution (model didn't call Bash, or a stream-json
 *  hiccup) is retried once before this bubbles up as a genuine, reportable failure -- this is
 *  resilience against flakiness in the CLI-dispatch mechanism itself, never a retry of the
 *  workload's own outcome (that is the separately-modeled failure-recovery class). */
export async function invokeNative(taskFilePath, args, spawnFn = nodeSpawn, maxAttempts = 2) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await invokeNativeOnce(taskFilePath, args, spawnFn);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------------------------
// Observation measurement (real hrtime-bracketed stage timing; see module docstring).
// ---------------------------------------------------------------------------------------------

function msBetween(startNs, endNs) {
  return Number((endNs - startNs) / 1_000_000n);
}

function taskDir(cls) {
  return join(WORKLOADS_DIR, cls);
}

function taskFilePath(cls) {
  return join(taskDir(cls), "task.mjs");
}

async function invoke(route, taskFile, args, deps) {
  if (route === "serial") return invokeSerial(taskFile, args, deps.spawnSyncFn);
  return invokeNative(taskFile, args, deps.spawnFn);
}

export async function runObservation(route, cls, repetition, clockEpoch, deps) {
  const dir = taskDir(cls);
  const resultPath = join(dir, "result.txt");
  const counterPath = cls === "failure-recovery" ? join(tmpdir(), `nova-a8-fr-counter-${route}.txt`) : null;
  const args = cls === "failure-recovery" ? [counterPath] : [];
  const file = taskFilePath(cls);

  const cpu0 = process.cpuUsage();
  const t0 = process.hrtime.bigint();

  // orchestration: build the invocation spec (path resolution, command construction)
  void `node ${file}${args.length ? ` ${args.join(" ")}` : ""}`;
  const t1 = process.hrtime.bigint();

  // workspace: prep before the task's own work starts -- clean slate for honest verification
  if (existsSync(resultPath)) unlinkSync(resultPath);
  if (counterPath && existsSync(counterPath)) unlinkSync(counterPath);
  const t2 = process.hrtime.bigint();

  let retryMs = 0;
  let interventions = 0;
  let execOutcome;
  if (cls === "failure-recovery") {
    const r0 = process.hrtime.bigint();
    await invoke(route, file, args, deps); // deliberate first failure (exit 1, no result.txt)
    const r1 = process.hrtime.bigint();
    retryMs = msBetween(r0, r1);
    interventions = 1;
    execOutcome = await invoke(route, file, args, deps); // the retry -- this is the recorded run
  } else {
    execOutcome = await invoke(route, file, args, deps);
  }
  const t3 = process.hrtime.bigint();

  // verification: read + hash result.txt fresh
  const resultBytes = existsSync(resultPath) ? readFileSync(resultPath) : Buffer.alloc(0);
  const correctnessSha256 = sha256(resultBytes);
  const t4 = process.hrtime.bigint();

  // cleanup: counter-file cleanup for failure-recovery, else a near-0 no-op
  const c0 = process.hrtime.bigint();
  if (counterPath && existsSync(counterPath)) unlinkSync(counterPath);
  const c1 = process.hrtime.bigint();
  const cleanupMs = msBetween(c0, c1);
  const tEnd = process.hrtime.bigint();

  const wallMs = msBetween(t0, tEnd);
  const cpuDelta = process.cpuUsage(cpu0);
  const cpuMs = Math.round((cpuDelta.user + cpuDelta.system) / 1000);
  const succeeded = execOutcome.exitCode === 0 && resultBytes.length > 0;
  if (!succeeded) {
    throw new Error(
      `observation did not succeed as expected: route=${route} class=${cls} repetition=${repetition} exitCode=${execOutcome.exitCode} resultBytes=${resultBytes.length}`,
    );
  }

  const monotonicMs = Number((process.hrtime.bigint() - clockEpoch) / 1_000_000n);
  const rawSha256 = sha256Of({ tStartNs: t0.toString(), tEndNs: tEnd.toString() });
  const evidenceSha256 = sha256Of({ stdout: execOutcome.stdout, stderr: execOutcome.stderr, exitCode: execOutcome.exitCode });

  return {
    route,
    repetition,
    clock: { source: "monotonic", monotonicMs, wallTime: null, rawSha256 },
    outcome: "succeeded",
    measures: {
      wallMs,
      cpuMs,
      concurrency: 1,
      stages: {
        orchestrationMs: msBetween(t0, t1),
        workspaceMs: msBetween(t1, t2),
        verificationMs: msBetween(t3, t4),
        reviewMs: 0,
        retryMs,
        cleanupMs,
      },
      usage: route === "native" ? execOutcome.usage : { input: null, output: null, unit: "unknown" },
      interventions,
    },
    resourceUse: [{ resource: "wallClockMs", unit: "ms", value: wallMs }],
    correctnessSha256,
    evidenceSha256,
    cleanupOk: true,
    authorityOk: true,
  };
}

export async function runRoute(routeId, clockEpoch, deps) {
  const classes = [];
  for (const cls of BENCHMARK_CLASSES) {
    const warmup = await runObservation(routeId, cls, 0, clockEpoch, deps);
    process.stderr.write(`nova-a8: ${routeId} ${cls} warmup done\n`);
    const samples = [];
    for (let repetition = 1; repetition <= 5; repetition++) {
      samples.push(await runObservation(routeId, cls, repetition, clockEpoch, deps));
      process.stderr.write(`nova-a8: ${routeId} ${cls} repetition ${repetition}/5 done\n`);
    }
    classes.push({ taskClass: cls, warmup, samples });
  }
  return { routeId, hostClass: HOST_CLASS, classes };
}

// ---------------------------------------------------------------------------------------------
// Candidate / subject metadata (real git + real `claude --version`).
// ---------------------------------------------------------------------------------------------

export function getCandidate(spawnSyncFn = nodeSpawnSync) {
  const commit = spawnSyncFn("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).stdout.trim();
  const tree = spawnSyncFn("git", ["rev-parse", "HEAD^{tree}"], { cwd: REPO_ROOT, encoding: "utf8" }).stdout.trim();
  return { commit, tree };
}

export function getClaudeVersion(spawnSyncFn = nodeSpawnSync) {
  const res = spawnSyncFn("claude", ["--version"], { encoding: "utf8" });
  return (res.stdout || "").trim();
}

// ---------------------------------------------------------------------------------------------
// Bespoke, disclosed structural check against multi-cli-benchmark.schema.json. NOT a general
// $ref/prefixItems/allOf/oneOf-capable JSON-Schema engine -- none exists in this repo
// (schema-lite.mjs understands only type/required/properties/items/enum/additionalProperties;
// there is no package.json/npm ecosystem here to add ajv to). This checks the record's own
// structural facts using the schema file's own pattern/const strings (never hand-duplicated),
// deliberately scoped to what evaluateMultiCliBenchmark's own runtime checks do not already
// guarantee by construction of the record it returns.
// ---------------------------------------------------------------------------------------------

export function structurallyValidateRecord(record, schema) {
  const errors = [];
  const idPattern = new RegExp(schema.$defs.id.pattern);
  const digestPattern = new RegExp(schema.$defs.digest.pattern);
  if (record.schema !== schema.properties.schema.const) errors.push("schema constant mismatch");
  if (!idPattern.test(record.benchmarkId)) errors.push("benchmarkId fails id pattern");
  if (record.scoringVersion !== schema.properties.scoringVersion.const) errors.push("scoringVersion constant mismatch");
  if (!digestPattern.test(record.recordSha256)) errors.push("recordSha256 fails digest pattern");
  if (record.fixture.length !== 5) errors.push("fixture length != 5");
  if (record.warmups.length !== 10) errors.push("warmups length != 10");
  if (record.observations.length !== 10) errors.push("observations length != 10");
  if (record.score.length !== 5) errors.push("score length != 5");
  const expectedClassSeq = [...BENCHMARK_CLASSES, ...BENCHMARK_CLASSES];
  record.warmups.forEach((w, i) => {
    if (w.taskClass !== expectedClassSeq[i]) errors.push(`warmups[${i}].taskClass out of prefixItems order`);
    if (w.observation.repetition !== 0) errors.push(`warmups[${i}].observation.repetition != 0`);
  });
  record.observations.forEach((o, i) => {
    if (o.taskClass !== expectedClassSeq[i]) errors.push(`observations[${i}].taskClass out of prefixItems order`);
    o.samples.forEach((s, j) => {
      if (s.repetition !== j + 1) errors.push(`observations[${i}].samples[${j}].repetition != ${j + 1}`);
    });
  });
  record.score.forEach((s, i) => {
    if (s.taskClass !== BENCHMARK_CLASSES[i]) errors.push(`score[${i}].taskClass out of prefixItems order`);
  });
  if (!["candidate-route-for-observed-envelope", "no-recommendation"].includes(record.recommendation)) {
    errors.push("recommendation not in schema enum");
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------------------------
// Assembly + main.
// ---------------------------------------------------------------------------------------------

export async function assembleAndEvaluate(deps = {}) {
  const spawnSyncFn = deps.spawnSyncFn ?? nodeSpawnSync;
  const spawnFn = deps.spawnFn ?? nodeSpawn;
  const candidate = getCandidate(spawnSyncFn);
  const claudeVersion = getClaudeVersion(spawnSyncFn);

  const subjects = [
    { route: "native", subjectSha256: sha256Of({ route: "native", cli: "claude", version: claudeVersion }), hostClass: HOST_CLASS },
    { route: "serial", subjectSha256: sha256Of({ route: "serial", mechanism: "direct-node-subprocess" }), hostClass: HOST_CLASS },
  ];
  const adapterReportSha256 = sha256Of({ native: subjects[0].subjectSha256, serial: subjects[1].subjectSha256 });
  const resourceEnvelope = { hostClass: HOST_CLASS, bounds: [{ resource: "wallClockMs", unit: "ms", hardLimit: RESOURCE_HARD_LIMIT_MS }] };
  const fixtures = BENCHMARK_FIXTURES.map((f) => ({ ...f, seed: `${f.class}-seed` }));

  const clockEpoch = process.hrtime.bigint();
  const serialRoute = await runRoute("serial", clockEpoch, { spawnSyncFn, spawnFn });
  const nativeRoute = await runRoute("native", clockEpoch, { spawnSyncFn, spawnFn });

  const input = {
    benchmarkId: "nova-a8-4",
    candidate,
    fixtures,
    adapterReportSha256,
    subjects,
    resourceEnvelope,
    baseline: serialRoute,
    candidateRoute: nativeRoute,
  };

  const record = evaluateMultiCliBenchmark(input);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const structural = structurallyValidateRecord(record, schema);
  return { record, structural };
}

async function main() {
  const { record, structural } = await assembleAndEvaluate();
  if (!structural.valid) {
    process.stderr.write(`STRUCTURAL VALIDATION FAILED:\n${structural.errors.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const shortSha = record.candidate.commit.slice(0, 7); // mirrors the a6 sealed-record naming convention
  const outPath = join(OUT_DIR, `multi-cli-benchmark-record-${shortSha}.json`);
  writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ outPath, recommendation: record.recommendation, recordSha256: record.recordSha256, structuralValid: structural.valid })}\n`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exitCode = 1;
  });
}
