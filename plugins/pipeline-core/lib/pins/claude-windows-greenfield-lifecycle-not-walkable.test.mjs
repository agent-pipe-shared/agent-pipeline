#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALF-C-P19-05 / AC-127: pin for backlog item pipeline.claude-windows-greenfield-lifecycle-not-walkable.
//
//   V-9   covered: --answers-file route carries answers beyond the ~10 KB command-line limit.
//   V-12  covered: once consent holds a language, no later intake nextAction asks for one.
//   V-13  covered: the docs/state.md "## Next action" projection is re-rendered from live state.
//   V-10  covered (ALF-C-P19-05C, PO decision #19): hooks/guard-dispatch.mjs binds the route digest of a
//         dispatch to the briefing INLINE in the Agent/Task prompt it actually received. A route record
//         (evidence/dispatch-route-<sliceId>.json) carries the digest; the guard recomputes it over the
//         canonical inline text and refuses a mismatch typed; no record = behaviour unchanged.
//   V-10  producer (ALF-C-P19-05D): lib/dispatch-briefing-route-record.mjs writes that record, built with the
//         guard's own buildBriefingRoute/briefingSha256, exactly where the guard reads it; a recorded route
//         makes the binding fire through the real hook (matching digest admitted, mismatching refused typed).
//   V-10  wiring, exact state (ALF-C-V10-DISP-B; the C6g5 F1 claim "no caller" is stale and is retracted):
//         delivered: the record type (pipeline.dispatch-briefing-route.v1), the guard check
//         (hooks/guard-dispatch.mjs evaluateBriefingRoute, refusing DISPATCH-BRIEFING-DIGEST-MISMATCH /
//         DISPATCH-BRIEFING-ROUTE-INVALID), the producer (lib/dispatch-briefing-route-record.mjs), and the TWO
//         callers of recordDispatchBriefingRoute: (1) lib/role-dispatch-preflight.mjs, only when
//         current.packet.transport === "direct" (commit a2d61489c); (2) hooks/guard-dispatch.mjs
//         recordAdmittedBriefingRoutes (ALF-C-V10-WIRE3), the admission point of EVERY transport the guard reads: the
//         native Claude Agent/Task call, Codex spawn_agent, the Antigravity Subagents array and a statically resolvable
//         Workflow agent() call. It is the LAST step before the hook admits (after the policy, route check, item
//         admission, fan-out, Advisor/budget binding and the native host state), so a refused briefing writes no record.
//         Semantics (PO decision 2026-10-17): latest admission wins. The guard's records carry one extra key,
//         origin: "admission"; an amended re-dispatch of an admitted slice is admitted and replaces that record. A record
//         without origin is a producer record (role-dispatch-preflight) and stays authoritative: a tampered briefing after
//         it is refused DISPATCH-BRIEFING-DIGEST-MISMATCH, as are two different briefings of one slice in one call.
//         Only a dispatch that is itself recorded (a Goldfish briefing) can supersede an admission record.
//         Typed gaps (no fake record is written for any of them):
//         V-10 Critic and unrelated-role dispatches are not recorded (critic-review.md carries no Slice line): open, owner Coordinator, due 2026-10-31
//         V-10 a dynamically built Workflow script (not statically resolvable, fail-open in the guard) has no admission point: open, owner Coordinator, due 2026-10-31
//              (measured, ALF-K28: the Workflow CALL reaches guard-dispatch -- hooks.json matches Task|Agent|Workflow, "V-10 runner registration" --
//              and a static agent() literal is recorded; a prompt built at run time (interpolation, a named const) is admitted and records no
//              route, "V-10 typed gap, measured". Whether the host re-fires the hook per inner agent() is not observable here and not claimed.)
//         (The former gap "Codex/Antigravity runner registration of guard-dispatch" is closed at this head and is pinned by the
//         source-scan case "V-10 runner registration": hooks/codex-hooks.json registers guard-dispatch.mjs on the spawn_agent
//         matcher, and hooks/antigravity-pretool-guard.mjs runs it for every Task/Agent entry, once per Subagents array element.
//         That case reads the shipped files; it does not prove a live Codex or Antigravity host fires the hook.)
//         V-10 role-dispatch-preflight records the direct transport only; the other transports are recorded by the guard,
//         because a Workflow digest is taken over the script literal the guard extracts, not over packet.prompt: by design
//         The caller set below is pinned by a source scan; when a caller is added or removed this header must be
//         updated with it.
//   two-approval happy path (reaches implementation and push) -- native: pending. It needs a live
//         interactive Claude/Windows session. A native run exercises
//         plugins/pipeline-core/lib/onboarding-continuity.mjs applyOnboardingIntakeGenerate and the
//         pipeline-state lifecycle commands end to end.
//
// Host limitation: no directory-mode or directory-symlink case is used here, so no case is skipped.
// (If one is ever added: skip with owner Coordinator, due 2026-10-19, Linux/WSL run, PO decision K7.)

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, test, before, after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { observeGovernanceScope } from "../governance-scope.mjs";
import { recordConsentGiven } from "../onboarding-consent-marker.mjs";

import {
  applyProjectOnboardingLifecycleV4,
  applyProjectOnboardingV3,
  expectedPipelineScriptsRunnerAllowlistEntries,
  inspectProjectOnboardingV3,
  planProjectOnboardingLifecycleV4,
  planProjectOnboardingV3,
} from "../project-onboarding-v3.mjs";
import { nextActionSection, replaceNextActionSection, syncStateMdNextAction } from "../onboarding-continuity.mjs";
import { fakeDeps, fakeGit } from "../project-onboarding-v3.test.mjs";
import { main as onboardingCli } from "../../scripts/project-onboarding-v3.mjs";

const RUNNER = "claude";
const CONSENT_LANGUAGE = "de";
const REPO_SCRATCH = fileURLToPath(new URL("../../../../scratch/", import.meta.url));

function scratchDir(name) {
  const dir = join(REPO_SCRATCH, `${name}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

function checkV9(pendingAction, afterAnswersAction) {
  const file = pendingAction.fileApplyAction;
  assert.ok(Array.isArray(file?.argv) && file.argv.includes("--answers-file") && !file.argv.includes("--answers-json"));
  assert.match(file.argv[file.argv.indexOf("--answers-file") + 1], /^scratch\/[A-Za-z0-9._-]+$/u);
  assert.equal(afterAnswersAction?.argv?.[1], "intake-generate-plan");
}

function checkV12(action) {
  const text = JSON.stringify(action);
  assert.equal(/"name":"language"/u.test(text), false);
  const walk = (n) => {
    if (Array.isArray(n)) {
      const at = n.indexOf("--language");
      if (at !== -1) assert.equal(n[at + 1], CONSENT_LANGUAGE);
      n.forEach(walk);
    } else if (n && typeof n === "object") Object.values(n).forEach(walk);
  };
  walk(JSON.parse(text));
}

describe("V-9 / V-12 intake lifecycle on the claude runner", () => {
  let path = null;
  let collecting = null;
  let pending = null;
  let afterAnswers = null;

  before(() => {
    path = scratchDir("alf-c-p19-05-intake with spaces");
    const git = (command, args, options) => {
      if (command === "git" && args[0] === "config" && args[1] === "--get") {
        return { status: 0, stdout: args[2] === "user.name" ? "Fixture PO\n" : "fixture-po@example.invalid\n", stderr: "" };
      }
      return fakeGit(command, args, options);
    };
    const deps = { ...fakeDeps, spawnSync: git, spawn: git };
    const cli = (args) => {
      let output = ""; let stderr = "";
      const code = onboardingCli(args, { deps, write: (c) => { output += c; }, writeError: (c) => { stderr += c; } });
      return { code, output, stderr };
    };
    const inspect = () => JSON.parse(JSON.stringify(inspectProjectOnboardingV3({ runner: RUNNER, rootDir: path, deps })));
    const portable = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: RUNNER });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", runner: RUNNER });
    const sha = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    applyProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", planSha256: sha, activate: true, runner: RUNNER });
    writeFileSync(join(path, ".claude", "settings.local.json"),
      `${JSON.stringify({ permissions: { allow: expectedPipelineScriptsRunnerAllowlistEntries() } }, null, 2)}\n`);
    assert.equal(cli(["intake-consent-apply", "--root", path, "--granted", "--language", CONSENT_LANGUAGE,
      "--profile", "feature", "--activate", "--runner", RUNNER]).code, 0);
    collecting = inspect();
    assert.equal(cli(["intake-capture-apply", "--root", path, "--text", "Build a local keyboard game.", "--activate", "--runner", RUNNER]).code, 0);
    pending = inspect();
    // V-9: answers far beyond the ~10 KB inline limit travel through --answers-file.
    mkdirSync(join(path, "scratch"), { recursive: true });
    const big = JSON.stringify([{ question: "What is the primary goal?", answer: "Ship safely. ".repeat(2000) }]);
    assert.ok(big.length > 20_000);
    writeFileSync(join(path, "scratch", "answers.json"), big);
    const applied = cli(["intake-design-questions-apply", "--root", path, "--answers-file", "scratch/answers.json", "--activate", "--runner", RUNNER]);
    assert.equal(applied.code, 0, `answers-file apply exited ${applied.code}: ${applied.stderr}${applied.output}`);
    afterAnswers = inspect();
  });
  after(() => { if (path !== null) rmSync(path, { recursive: true, force: true }); });

  test("V-9 the pending nextAction offers a fileApplyAction on a scratch/ path and the large file is accepted", () => {
    checkV9(pending.nextAction, afterAnswers.nextAction);
  });

  test("V-12 no nextAction asks for a language after consent supplied one", () => {
    for (const action of [collecting.nextAction, pending.nextAction, afterAnswers.nextAction]) checkV12(action);
  });

  test("V-9 RED proof: a mirror that offers only inline --answers-json fails the same check", () => {
    const mirrorPending = { argv: ["x", "intake-design-questions-apply", "--answers-json", "[]"] };
    assert.throws(() => checkV9(mirrorPending, afterAnswers.nextAction));
  });

  test("V-12 RED proof: a mirror that re-asks the language or carries another one fails the same check", () => {
    assert.throws(() => checkV12({ fields: [{ name: "language" }] }));
    assert.throws(() => checkV12({ argv: ["x", "--language", "en"] }));
  });
});

describe("V-13 docs/state.md next-action projection tracks live state", () => {
  const STALE = ["# Project state", "", "## Goal", "", "Keep me.", "", "## Next action", "", "stale design text", "", "## Tail", "", "Keep tail.", ""].join("\n");

  test("replaceNextActionSection swaps only that section and fails closed without the heading", () => {
    const section = nextActionSection({});
    const out = replaceNextActionSection(STALE, section);
    assert.ok(out.includes("Keep me.") && out.includes("Keep tail.") && !out.includes("stale design text"));
    assert.equal(replaceNextActionSection("# no heading\n", section), null);
  });

  test("V-13 RED proof: a mirror that replaces the whole file instead of only the section fails the same check", () => {
    const mirror = (_markdown, section) => section; // guarded behavior removed: no preservation of other sections
    const out = mirror(STALE, nextActionSection({}));
    assert.throws(() => assert.ok(out.includes("Keep me.") && out.includes("Keep tail.")));
    const staleKept = (markdown) => markdown; // guarded behavior removed: no re-render at all
    assert.throws(() => assert.ok(!staleKept(STALE).includes("stale design text")));
  });

  test("syncStateMdNextAction rewrites a stale docs/state.md in place", () => {
    const dir = scratchDir("alf-c-p19-05-v13");
    try {
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs", "state.md"), STALE);
      syncStateMdNextAction(dir, {});
      const after = readFileSync(join(dir, "docs", "state.md"), "utf8");
      assert.ok(!after.includes("stale design text"));
      assert.ok(after.includes("Keep me.") && after.includes("Keep tail."));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// V-10: ALF-C-P19-05B found no producer of a continuity route digest (single-file searches of
// guard-dispatch.mjs, onboarding-continuity.mjs, pipeline-state.mjs). ALF-C-P19-05C (PO decision #19) puts the
// binding where the briefing is actually received: hooks/guard-dispatch.mjs. The digest is computed by ONE
// exported function (briefingSha256: CRLF normalised to LF, nothing else stripped) that the route record
// producer (buildBriefingRoute) and the guard both use, so the two sides cannot drift.
const GUARD = fileURLToPath(new URL("../../hooks/guard-dispatch.mjs", import.meta.url));
const V10_SLICE = "ALF-V10-PIN";
const V10_BRIEFING = [
  "Independent Critic review. Build your own input from the references below.",
  "DIFF RANGE: 754b32b..1568fe3",
  "SPEC: specs/sprint-nova-epic/spec.md",
  "GUARDRAILS: guardrails/global.md",
  "EVIDENCE ARTIFACTS: evidence/verify-latest.json",
  "TASK FRAME: risk class high; Ruleset-SHA: 0f38b425; Model: claude-opus-5.",
  "- **Tool budget (hard cap, first-class field):** ≤24 tool uses.",
  `- **Slice:** ${V10_SLICE}`,
].join("\n");
const sha256Of = (text) => createHash("sha256").update(text, "utf8").digest("hex");

// The hook module is exercised through a child process, never imported into this one: its entrypoint gate
// is what makes an import safe, and a regression of that gate must fail loudly, not end this run silently.
// A runner FILE (not `node -e`): the hook's entrypoint check reads argv[1], which must be the runner's own path.
function guardExport(name, argument, runnerDir) {
  const runner = join(runnerDir, "export-runner.mjs");
  writeFileSync(runner, "const m = await import(process.argv[2]); process.stdout.write(JSON.stringify(await m[process.argv[3]](JSON.parse(process.argv[4]))));\n");
  const res = spawnSync(process.execPath, [runner, pathToFileURL(GUARD).href, name, JSON.stringify(argument)],
    { input: "", encoding: "utf8", timeout: 15000 });
  assert.equal(res.status, 0, `guard export ${name} failed: ${(res.stderr ?? "").slice(0, 300)}`);
  return JSON.parse(res.stdout);
}

/** The V-10 clause as one reusable check: bind a route to the sent briefing; same text admitted, one byte off refused typed. */
function checkV10({ bind, send }) {
  bind(V10_SLICE, V10_BRIEFING);
  const admitted = send(V10_BRIEFING);
  assert.equal(admitted.code, 0, `the briefing the route names must be admitted: ${admitted.stderr.slice(0, 300)}`);
  const altered = V10_BRIEFING.replace("risk class high", "risk class hugh"); // exactly one byte differs
  assert.equal(altered.length, V10_BRIEFING.length);
  assert.notEqual(altered, V10_BRIEFING);
  const refused = send(altered);
  assert.equal(refused.code, 2, `a one-byte-changed briefing must be refused: ${refused.stderr.slice(0, 300)}`);
  assert.ok(refused.stderr.includes("DISPATCH-BRIEFING-DIGEST-MISMATCH"), refused.stderr.slice(0, 300));
  assert.ok(refused.stderr.includes(sha256Of(V10_BRIEFING)), "the refusal names the expected digest");
  assert.ok(refused.stderr.includes(sha256Of(altered)), "the refusal names the observed digest");
}

describe("V-10 route digest is bound to the inline briefing actually sent", () => {
  let root = null;
  let sequence = 0;
  const send = (prompt) => {
    sequence += 1;
    const res = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({ tool_use_id: `v10-pin-${process.pid}-${sequence}`, tool_name: "Task",
        tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt } }),
      encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    return { code: res.status, stderr: res.stderr ?? "" };
  };
  const bind = (sliceId, briefing) => {
    const record = guardExport("buildBriefingRoute", { sliceId, briefing }, root);
    mkdirSync(join(root, "evidence"), { recursive: true });
    writeFileSync(join(root, "evidence", `dispatch-route-${sliceId}.json`), `${JSON.stringify(record)}\n`);
    return record;
  };

  before(() => {
    root = scratchDir("alf-c-p19-05c-v10");
    execFileSync("git", ["init", "-q"], { cwd: root });
    mkdirSync(join(root, ".claude"), { recursive: true });
    recordConsentGiven({ rootDir: root });
    assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, true, "the fixture must be an enrolled governed root");
  });
  after(() => { if (root !== null) rmSync(root, { recursive: true, force: true }); });

  test("V-10 the route digest equals the digest of the inline briefing actually sent: match admitted, one byte off refused typed", () => {
    checkV10({ bind, send });
  });

  test("V-10 the digest is computed once: the route producer and the guard agree, and a CRLF copy of the same briefing is admitted", () => {
    const record = bind(V10_SLICE, V10_BRIEFING);
    assert.equal(record.briefingSha256, sha256Of(V10_BRIEFING));
    assert.equal(guardExport("briefingSha256", V10_BRIEFING.replace(/\n/g, "\r\n"), root), record.briefingSha256);
    const crlf = send(V10_BRIEFING.replace(/\n/g, "\r\n"));
    assert.equal(crlf.code, 0, crlf.stderr.slice(0, 300));
  });

  test("V-10 no route digest: a dispatch without a record, or without a Slice line, is unchanged", () => {
    const unrouted = V10_BRIEFING.replace(V10_SLICE, `${V10_SLICE}-UNROUTED`);
    assert.equal(send(unrouted).code, 0);
    assert.equal(send(unrouted.replace("risk class high", "risk class hugh")).code, 0);
    bind(V10_SLICE, V10_BRIEFING); // a record for another slice never constrains a briefing that names none
    const sliceless = V10_BRIEFING.split("\n").filter((line) => !line.includes("Slice:")).join("\n");
    assert.equal(send(sliceless).code, 0);
  });

  test("V-10 a route record that exists but cannot be verified refuses typed instead of admitting", () => {
    mkdirSync(join(root, "evidence"), { recursive: true });
    const invalid = `${V10_SLICE}-INVALID`;
    writeFileSync(join(root, "evidence", `dispatch-route-${invalid}.json`), "{ not json\n");
    const refused = send(V10_BRIEFING.replace(V10_SLICE, invalid));
    assert.equal(refused.code, 2);
    assert.ok(refused.stderr.includes("DISPATCH-BRIEFING-ROUTE-INVALID"), refused.stderr.slice(0, 300));
  });

  test("V-10 RED proof: a guard that does not bind the digest to the inline text (admits everything) fails the same check", () => {
    const unbound = { bind: () => {}, send: () => ({ code: 0, stderr: "" }) };
    assert.throws(() => checkV10(unbound));
    const digestOfStaleFile = { bind: () => {}, send: (prompt) => ({ code: prompt === V10_BRIEFING ? 0 : 2, stderr: "DISPATCH-BRIEFING-DIGEST-MISMATCH" }) };
    assert.throws(() => checkV10(digestOfStaleFile)); // names no expected/observed digest -> not a typed, evidenced refusal
  });
});

// V-10 PRODUCER (ALF-C-P19-05D). ALF-C-P19-05C bound the digest guard-side only: no product flow wrote the
// record, so nothing ever put one where the guard looks and the binding never fired. The producer module builds
// the record with the guard's own exports and writes it at evidence/dispatch-route-<sliceId>.json. Like the guard,
// it is exercised through a child process, so a regression of an import-time side effect fails loudly here.
const PRODUCER = fileURLToPath(new URL("../dispatch-briefing-route-record.mjs", import.meta.url));

function producerExport(name, argument, runnerDir) {
  const runner = join(runnerDir, "producer-runner.mjs");
  writeFileSync(runner, "const m = await import(process.argv[2]); process.stdout.write(JSON.stringify(await m[process.argv[3]](JSON.parse(process.argv[4]))));\n");
  const res = spawnSync(process.execPath, [runner, pathToFileURL(PRODUCER).href, name, JSON.stringify(argument)],
    { input: "", encoding: "utf8", timeout: 20000 });
  assert.equal(res.status, 0, `producer export ${name} failed: ${(res.stderr ?? "").slice(0, 300)}`);
  return JSON.parse(res.stdout);
}

describe("V-10 a recorded route makes the binding fire: the producer writes what the guard reads", () => {
  let root = null;
  let sequence = 0;
  let priorCeiling;
  const send = (prompt) => {
    sequence += 1;
    const res = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({ tool_use_id: `v10-producer-pin-${process.pid}-${sequence}`, tool_name: "Task",
        tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt } }),
      encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    return { code: res.status, stderr: res.stderr ?? "" };
  };
  const produce = (sliceId, briefing) => {
    const result = producerExport("recordDispatchBriefingRoute", { root, prompt: briefing }, root);
    assert.ok(["recorded", "replaced", "unchanged"].includes(result.status), `the producer must record the route: ${JSON.stringify(result)}`);
    assert.equal(result.sliceId, sliceId);
    return result;
  };
  const routeFile = (sliceId) => join(root, "evidence", `dispatch-route-${sliceId}.json`);

  before(() => {
    root = scratchDir("alf-c-p19-05d-v10-producer");
    priorCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = dirname(root); // fixture containment: no git call may climb out of scratch/
    execFileSync("git", ["init", "-q"], { cwd: root, env: process.env });
    mkdirSync(join(root, ".claude"), { recursive: true });
    recordConsentGiven({ rootDir: root });
    assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, true, "the fixture must be an enrolled governed root");
  });
  after(() => {
    if (priorCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = priorCeiling;
    if (root !== null) rmSync(root, { recursive: true, force: true });
  });

  test("V-10 the producer's record binds the sent text through the real hook: matching digest admitted, mismatching refused typed", () => {
    checkV10({ bind: (sliceId, briefing) => { produce(sliceId, briefing); }, send });
  });

  test("V-10 the record sits at the route path the guard reads and carries the independently computed digest; a CRLF copy is admitted", () => {
    produce(V10_SLICE, V10_BRIEFING);
    const raw = readFileSync(routeFile(V10_SLICE), "utf8");
    assert.deepEqual(JSON.parse(raw), { schema: "pipeline.dispatch-briefing-route.v1", sliceId: V10_SLICE, briefingSha256: sha256Of(V10_BRIEFING) });
    assert.ok(raw.endsWith("\n"));
    assert.equal(send(V10_BRIEFING.replace(/\n/g, "\r\n")).code, 0);
  });

  test("V-10 issuing a route for a new briefing replaces the binding: the new text is admitted, the old one refused typed", () => {
    const next = V10_BRIEFING.replace("risk class high", "risk class medium");
    produce(V10_SLICE, V10_BRIEFING);
    produce(V10_SLICE, next);
    assert.equal(send(next).code, 0);
    const stale = send(V10_BRIEFING);
    assert.equal(stale.code, 2);
    assert.ok(stale.stderr.includes("DISPATCH-BRIEFING-DIGEST-MISMATCH"), stale.stderr.slice(0, 300));
    assert.ok(stale.stderr.includes(sha256Of(next)) && stale.stderr.includes(sha256Of(V10_BRIEFING)), "the refusal names both digests");
  });

  test("V-10 RED proof: with no producer call (the state before this slice) the one-byte-changed briefing is admitted and the same check fails", () => {
    rmSync(join(root, "evidence"), { recursive: true, force: true });
    assert.throws(() => checkV10({ bind: () => {}, send }));
    assert.equal(send(V10_BRIEFING.replace("risk class high", "risk class hugh")).code, 0, "no record, no binding: the unrouted briefing goes through");
  });

  test("V-10 RED proof: a producer that binds a briefing FILE name instead of the text actually sent fails the same check", () => {
    const fileDigest = (sliceId) => {
      mkdirSync(join(root, "evidence"), { recursive: true });
      const record = { schema: "pipeline.dispatch-briefing-route.v1", sliceId, briefingSha256: sha256Of("scratch/briefing.md") };
      writeFileSync(routeFile(sliceId), `${JSON.stringify(record)}\n`);
    };
    assert.throws(() => checkV10({ bind: fileDigest, send }));
  });
});

// V-10 CALLER SET (ALF-C-V10-DISP-B). Pins which non-test source files call the producer and the route builder, so
// the header's wiring statement cannot silently go stale in either direction.
const PLUGIN_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:"'`\\])\/\/.*$/gmu, "$1");

function callersOf(name, definingRel, pluginRoot) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(mjs|js|cjs)$/u.test(entry.name) || entry.name.endsWith(".test.mjs")) continue;
      const rel = relative(pluginRoot, full).split("\\").join("/");
      if (rel === definingRel) continue;
      if (new RegExp(`\\b${name}\\b`, "u").test(stripComments(readFileSync(full, "utf8")))) found.push(rel);
    }
  };
  walk(pluginRoot);
  return found.sort();
}

function checkV10Callers(pluginRoot) {
  const expected = [
    ["recordDispatchBriefingRoute", "lib/dispatch-briefing-route-record.mjs", ["hooks/guard-dispatch.mjs", "lib/role-dispatch-preflight.mjs"]],
    ["buildBriefingRoute", "hooks/guard-dispatch.mjs", ["lib/dispatch-briefing-route-record.mjs"]],
  ];
  for (const [name, defining, callers] of expected) {
    const actual = callersOf(name, defining, pluginRoot);
    assert.deepEqual(actual, callers,
      `V-10 caller set of ${name} changed (now: ${JSON.stringify(actual)}). Update the V-10 wiring header of this pin ` +
      "(delivered / open routes) and this expected set together.");
  }
}

describe("V-10 caller set of the route producer is pinned", () => {
  test("recordDispatchBriefingRoute is called only by role-dispatch-preflight (direct transport) and the guard's admission step, and buildBriefingRoute only by the producer", () => {
    checkV10Callers(PLUGIN_ROOT);
    const source = readFileSync(join(PLUGIN_ROOT, "lib", "role-dispatch-preflight.mjs"), "utf8");
    assert.match(source, /transport === "direct"\)\s*\{\s*const route = recordDispatchBriefingRoute\(/u,
      "the producer call must stay guarded by the direct transport; update the V-10 header if that changes");
  });

  test("V-10 caller set RED proof: a mirror tree with an added caller, and one with the real caller removed, fail the same check", () => {
    const dir = scratchDir("alf-c-v10-disp-b-callers");
    try {
      const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
      const real = () => {
        put("hooks/guard-dispatch.mjs", "import { recordDispatchBriefingRoute } from \"../lib/dispatch-briefing-route-record.mjs\"; export function buildBriefingRoute() {} recordDispatchBriefingRoute();\n");
        put("lib/dispatch-briefing-route-record.mjs", "import { buildBriefingRoute } from \"../hooks/guard-dispatch.mjs\"; export function recordDispatchBriefingRoute() { buildBriefingRoute(); }\n");
        put("lib/role-dispatch-preflight.mjs", "import { recordDispatchBriefingRoute } from \"./dispatch-briefing-route-record.mjs\"; recordDispatchBriefingRoute();\n");
      };
      real();
      checkV10Callers(dir); // the faithful mirror passes
      put("lib/fake-caller.mjs", "import { recordDispatchBriefingRoute } from \"./dispatch-briefing-route-record.mjs\"; recordDispatchBriefingRoute();\n");
      assert.throws(() => checkV10Callers(dir), /Update the V-10 wiring header/u);
      rmSync(join(dir, "lib", "fake-caller.mjs"));
      put("lib/role-dispatch-preflight.mjs", "// recordDispatchBriefingRoute mentioned only in a comment\n");
      assert.throws(() => checkV10Callers(dir), /Update the V-10 wiring header/u);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// V-10 ADMISSION WIRING (ALF-C-V10-WIRE, AC-127). The guard records the route digest of every governed (Goldfish) briefing it
// admits, at the one admission point every transport passes through, so the binding no longer depends on a caller that
// only the direct preflight had. Every case drives the real hook as a child process; nothing is mocked.
const V10W_ROLE = "pipeline-core:goldfish-implementor";
const V10W_ROUTE_SCHEMA = "pipeline.dispatch-briefing-route.v1";

function v10wBriefing(sliceId, { withSlice = true } = {}) {
  return [
    "### 1. Goal", "", "V-10 admission wiring pin: nothing in this briefing is executed.", "",
    "### 2. Context files", "", "- backlog/items/2026-10-03-claude-windows-greenfield-lifecycle-not-walkable.md", "",
    "### 3. DoD checks", "", "- the pin passes", "",
    "### 4. Forbidden", "", "- any file outside the write scope", "",
    "### 5. Stop conditions", "", "- more than 2 failed attempts at the same problem", "",
    "### 6. Dispatch metadata", "",
    "- Model/effort for this run: claude-sonnet-5-5 / medium.",
    "- **Tool budget (hard cap, first-class field):** ≤24 tool uses.",
    ...(withSlice ? [`- **Slice:** ${sliceId}`, "- Write scope: none"] : []),
  ].join("\n");
}

// One packet per transport the guard reads. The Workflow packet carries the briefing as a template literal, so the text
// the guard extracts (and hashes) is exactly the text sent.
const V10W_PACKET = {
  native: (prompt, id) => ({ tool_use_id: id, tool_name: "Agent", tool_input: { subagent_type: V10W_ROLE, model: "sonnet", prompt } }),
  codex: (prompt, id) => ({ tool_use_id: id, tool_name: "spawn_agent", tool_input: { agent_type: V10W_ROLE, message: prompt } }),
  antigravity: (prompt, id) => ({ tool_use_id: id, tool_name: "invoke_subagent", tool_input: { Subagents: [{ TypeName: V10W_ROLE, Prompt: prompt }] } }),
  workflow: (prompt, id) => ({ tool_use_id: id, tool_name: "Workflow", tool_input: { script: `await agent({ agentType: '${V10W_ROLE}', prompt: \`${prompt}\` });` } }),
  critic: (prompt, id) => ({ tool_use_id: id, tool_name: "Task", tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt } }),
};

const V10W_ORIGIN = "admission";

/**
 * The wiring clause as one reusable check (PO decision 2026-10-17, latest admission wins):
 *   admit -> the record carries the digest of what was admitted, with origin "admission"
 *   amended re-dispatch of the admitted slice -> admitted, and it REPLACES the record
 *   a producer (preflight) record is written for that text -> a tampered copy is refused typed and moves nothing.
 */
function checkV10Wiring({ send, read, produce, prompt, sliceId }) {
  assert.equal(read(), null, "the slice must start unrouted");
  const admitted = send(prompt);
  assert.equal(admitted.code, 0, `the briefing must be admitted: ${admitted.stderr.slice(0, 300)}`);
  assert.deepEqual(read(), { schema: V10W_ROUTE_SCHEMA, sliceId, briefingSha256: sha256Of(prompt), origin: V10W_ORIGIN },
    "admission must record the route digest of the briefing it admitted, with its provenance");
  const amended = prompt.replace("admission wiring pin", "amended wiring pin");
  assert.notEqual(amended, prompt);
  const redispatched = send(amended);
  assert.equal(redispatched.code, 0, `an amended re-dispatch of an admitted slice must be admitted: ${redispatched.stderr.slice(0, 300)}`);
  assert.deepEqual(read(), { schema: V10W_ROUTE_SCHEMA, sliceId, briefingSha256: sha256Of(amended), origin: V10W_ORIGIN },
    "the latest admission must replace the record");
  produce(amended); // the preflight producer binds the amended text: no origin key, authoritative
  const preflight = { schema: V10W_ROUTE_SCHEMA, sliceId, briefingSha256: sha256Of(amended) };
  assert.deepEqual(read(), preflight, "a producer record carries exactly the three keys");
  const tampered = amended.replace("amended wiring pin", "amended wirinG pin");
  assert.notEqual(tampered, amended);
  assert.equal(tampered.length, amended.length);
  const refused = send(tampered);
  assert.equal(refused.code, 2, `a tampered briefing after a preflight record must be refused: ${refused.stderr.slice(0, 300)}`);
  assert.ok(refused.stderr.includes("DISPATCH-BRIEFING-DIGEST-MISMATCH"), refused.stderr.slice(0, 300));
  assert.ok(refused.stderr.includes(sha256Of(amended)) && refused.stderr.includes(sha256Of(tampered)), "the refusal names the expected and the observed digest");
  assert.deepEqual(read(), preflight, "a refused briefing must not move the record");
  assert.equal(send(amended).code, 0, "the briefing the preflight record names is still admitted");
  assert.deepEqual(read(), preflight, "re-admitting the routed text leaves a producer record untouched");
}

describe("V-10 admission wiring: the guard records the route digest of the briefing it admits (ALF-C-V10-WIRE)", () => {
  let root = null;
  let sequence = 0;
  let priorCeiling;
  const runHook = (payload) => {
    const res = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    return { code: res.status, stderr: res.stderr ?? "" };
  };
  const send = (kind, prompt, { toolUseId } = {}) => {
    sequence += 1;
    const payload = V10W_PACKET[kind](prompt, toolUseId === undefined ? `v10w-${kind}-${process.pid}-${sequence}` : toolUseId);
    if (toolUseId === null) delete payload.tool_use_id;
    return runHook(payload);
  };
  // The route record a producer (role-dispatch-preflight's direct transport) writes: three keys, no origin.
  const produce = (prompt) => {
    const result = producerExport("recordDispatchBriefingRoute", { root, prompt }, root);
    assert.ok(["recorded", "replaced", "unchanged"].includes(result.status), `the producer must record the route: ${JSON.stringify(result)}`);
  };
  const readRoute = (sliceId) => {
    try { return JSON.parse(readFileSync(join(root, "evidence", `dispatch-route-${sliceId}.json`), "utf8")); } catch { return null; }
  };
  const routeNames = () => {
    try { return readdirSync(join(root, "evidence")).sort(); } catch { return []; }
  };

  before(() => {
    root = scratchDir("alf-c-v10-wire");
    priorCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = dirname(root); // fixture containment: no git call may climb out of scratch/
    execFileSync("git", ["init", "-q"], { cwd: root, env: process.env });
    // Fixture blocker of the earlier attempts: a governed root WITHOUT project authority fails closed in the hook
    // (resolveGovernedItemQueue -> SQ-AUTHORITY-UNAVAILABLE) before any route logic runs. This repository is enrolled
    // and carries valid project authority (a manifest and a lifecycle State) but NO approved course (no activeFeature),
    // so resolveGovernedItemQueue answers not-applicable and the route logic is what the cases exercise.
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.yaml"), "# V-10 admission wiring fixture: authority marker only\n");
    writeFileSync(join(root, ".claude", "pipeline-state.json"), `${JSON.stringify({ schema: "pipeline.state.v0" })}\n`);
    recordConsentGiven({ rootDir: root });
    assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, true, "the fixture must be an enrolled governed root");
  });
  after(() => {
    if (priorCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = priorCeiling;
    if (root !== null) rmSync(root, { recursive: true, force: true });
  });

  test("V-10 a native Agent dispatch is admitted and records its route with origin admission: an amended re-dispatch replaces it, a tampered briefing after a preflight record is refused typed", () => {
    const slice = "ALF-V10-WIRE-NATIVE";
    checkV10Wiring({ send: (text) => send("native", text), read: () => readRoute(slice), produce, prompt: v10wBriefing(slice), sliceId: slice });
  });

  test("V-10 the admission record reads back through the guard's own check; a resend and a CRLF copy are admitted and leave it untouched", () => {
    const slice = "ALF-V10-WIRE-READBACK";
    const prompt = v10wBriefing(slice);
    assert.equal(send("native", prompt).code, 0);
    assert.deepEqual(guardExport("evaluateBriefingRoute", { prompt, root }, root), { status: "match", sliceId: slice, digest: sha256Of(prompt), origin: V10W_ORIGIN });
    const recorded = readFileSync(join(root, "evidence", `dispatch-route-${slice}.json`), "utf8");
    assert.equal(send("native", prompt).code, 0);
    assert.equal(send("native", prompt.replace(/\n/gu, "\r\n")).code, 0);
    assert.equal(readFileSync(join(root, "evidence", `dispatch-route-${slice}.json`), "utf8"), recorded, "re-admitting the routed text leaves the record untouched");
    // origin is the ONE optional extra key: any other key, and any other origin value, stays an unverifiable record
    const file = join(root, "evidence", `dispatch-route-${slice}.json`);
    for (const record of [{ ...JSON.parse(recorded), note: "x" }, { ...JSON.parse(recorded), origin: "preflight" }]) {
      writeFileSync(file, `${JSON.stringify(record)}\n`);
      assert.equal(guardExport("evaluateBriefingRoute", { prompt, root }, root).status, "invalid");
    }
    writeFileSync(file, recorded);
  });

  test("V-10 latest admission wins: a slice re-dispatched with other bytes is admitted each time and the record follows the last admission", () => {
    const slice = "ALF-V10-WIRE-LATEST";
    const first = v10wBriefing(slice);
    const second = first.replace("nothing in this briefing", "nothing in that briefing");
    for (const prompt of [first, second, first]) {
      assert.equal(send("native", prompt).code, 0);
      assert.deepEqual(readRoute(slice), { schema: V10W_ROUTE_SCHEMA, sliceId: slice, briefingSha256: sha256Of(prompt), origin: V10W_ORIGIN });
    }
  });

  test("V-10 only a recorded dispatch can supersede an admission record: a Critic briefing naming the slice with other bytes is refused typed and moves nothing", () => {
    const slice = "ALF-V10-WIRE-CRITIC-SLICE";
    const prompt = v10wBriefing(slice);
    assert.equal(send("native", prompt).code, 0);
    const critic = V10_BRIEFING.replace(V10_SLICE, slice);
    const refused = send("critic", critic);
    assert.equal(refused.code, 2, refused.stderr.slice(0, 300));
    assert.ok(refused.stderr.includes("DISPATCH-BRIEFING-DIGEST-MISMATCH") && refused.stderr.includes(sha256Of(prompt)) && refused.stderr.includes(sha256Of(critic)), refused.stderr.slice(0, 300));
    assert.deepEqual(readRoute(slice), { schema: V10W_ROUTE_SCHEMA, sliceId: slice, briefingSha256: sha256Of(prompt), origin: V10W_ORIGIN });
  });

  for (const kind of ["codex", "antigravity", "workflow"]) {
    test(`V-10 the ${kind} transport records the briefing it admits at the guard's admission point: latest admission wins, a tampered copy after a preflight record is refused typed`, () => {
      const slice = `ALF-V10-WIRE-${kind.toUpperCase()}`;
      checkV10Wiring({ send: (text) => send(kind, text), read: () => readRoute(slice), produce, prompt: v10wBriefing(slice), sliceId: slice });
    });
  }

  test("V-10 a refused briefing leaves no record: a policy refusal and a later admission refusal both leave the slice unrouted, and nothing blocks the retry", () => {
    const slice = "ALF-V10-WIRE-REFUSED";
    const prompt = v10wBriefing(slice);
    const incomplete = prompt.split("\n").filter((line) => !/Stop conditions|more than 2 failed/u.test(line)).join("\n");
    const policy = send("native", incomplete);
    assert.equal(policy.code, 2, policy.stderr.slice(0, 300));
    assert.ok(policy.stderr.includes("DISPATCH-INCOMPLETE-BRIEFING"), policy.stderr.slice(0, 300));
    assert.equal(readRoute(slice), null, "a policy refusal records nothing");
    const late = send("native", prompt, { toolUseId: null }); // a budget-bearing dispatch without the host tool-use id is refused after the route check
    assert.equal(late.code, 2, late.stderr.slice(0, 300));
    assert.ok(late.stderr.includes("DBB-PARENT-TOOL-USE-ID-MISSING"), late.stderr.slice(0, 300));
    assert.equal(readRoute(slice), null, "a later admission refusal records nothing");
    const retry = prompt.replace("nothing in this briefing", "nothing in that briefing"); // nothing bound the slice, so other bytes are admitted and become the route
    assert.equal(send("native", retry).code, 0);
    assert.deepEqual(readRoute(slice), { schema: V10W_ROUTE_SCHEMA, sliceId: slice, briefingSha256: sha256Of(retry), origin: V10W_ORIGIN });
  });

  test("V-10 two different briefings of one slice in a single call are refused DISPATCH-BRIEFING-DIGEST-MISMATCH before anything is written", () => {
    const slice = "ALF-V10-WIRE-CALL";
    const first = v10wBriefing(slice);
    const second = first.replace("nothing in this briefing", "nothing in that briefing");
    const result = guardExport("recordAdmittedBriefingRoutes", { dispatches: [{ prompt: first }, { prompt: second }], root }, root);
    assert.equal(result.ok, false);
    assert.deepEqual([result.route.status, result.route.sliceId, result.route.path, result.route.expected, result.route.observed],
      ["mismatch", slice, `evidence/dispatch-route-${slice}.json`, sha256Of(first), sha256Of(second)]);
    assert.equal(readRoute(slice), null);
    // the same conflict through the real hook (a Workflow script carrying two agent() calls): refused typed, no effect
    const call = (prompt) => `await agent({ agentType: '${V10W_ROLE}', prompt: \`${prompt}\` });`;
    const refused = runHook({ tool_use_id: `v10w-call-${process.pid}`, tool_name: "Workflow", tool_input: { script: `${call(first)}\n${call(second)}` } });
    assert.equal(refused.code, 2, refused.stderr.slice(0, 300));
    assert.ok(refused.stderr.includes("DISPATCH-BRIEFING-DIGEST-MISMATCH") && refused.stderr.includes(sha256Of(first)) && refused.stderr.includes(sha256Of(second)), refused.stderr.slice(0, 300));
    assert.equal(readRoute(slice), null, "a refused call records nothing");
    // two identical briefings of one slice in one call are one admission
    const same = runHook({ tool_use_id: `v10w-same-${process.pid}`, tool_name: "Workflow", tool_input: { script: `${call(first)}\n${call(first)}` } });
    assert.equal(same.code, 0, same.stderr.slice(0, 300));
    assert.deepEqual(readRoute(slice), { schema: V10W_ROUTE_SCHEMA, sliceId: slice, briefingSha256: sha256Of(first), origin: V10W_ORIGIN });
  });

  test("V-10 a call with one unverifiable slice records nothing for its other slices", () => {
    const [a, b] = ["ALF-V10-WIRE-MULTI-A", "ALF-V10-WIRE-MULTI-B"];
    mkdirSync(join(root, "evidence"), { recursive: true });
    writeFileSync(join(root, "evidence", `dispatch-route-${b}.json`), "{ not json\n");
    const result = guardExport("recordAdmittedBriefingRoutes", { dispatches: [{ prompt: v10wBriefing(a) }, { prompt: v10wBriefing(b) }], root }, root);
    assert.equal(result.ok, false);
    assert.equal(result.route.status, "invalid");
    assert.equal(result.route.sliceId, b);
    assert.equal(readRoute(a), null, "the verifiable slice must not be recorded when another slice of the call is refused");
    rmSync(join(root, "evidence", `dispatch-route-${b}.json`), { force: true });
  });

  test("V-10 multi-slice rollback: when a later slice's record write fails, the earlier slice's prior record bytes are restored and a slice with no prior record stays absent", () => {
    const [a, b, c] = ["ALF-V10-WIRE-RB-A", "ALF-V10-WIRE-RB-B", "ALF-V10-WIRE-RB-C"];
    const prior = v10wBriefing(a, {}).replace("nothing in this briefing", "nothing in the earlier briefing");
    const priorRecord = `${JSON.stringify({ schema: V10W_ROUTE_SCHEMA, sliceId: a, briefingSha256: sha256Of(prior), origin: V10W_ORIGIN })}\n`;
    mkdirSync(join(root, "evidence"), { recursive: true });
    const fileA = join(root, "evidence", `dispatch-route-${a}.json`);
    writeFileSync(fileA, priorRecord);
    // The writer is injected (the one documented seam of recordAdmittedBriefingRoutes): the real writer for A and B, a
    // write fault for C. A is a superseding admission (its prior bytes must come back), B has no prior record (it must
    // be removed again), C fails after both were written.
    const runner = join(root, "rollback-runner.mjs");
    writeFileSync(runner, [
      "const guard = await import(process.argv[2]);",
      "const lib = await import(process.argv[3]);",
      "const { prompts, root, failing } = JSON.parse(process.argv[4]);",
      "const record = (input) => input.prompt.includes(failing) ? { status: 'refused', code: 'DBRR-WRITE' } : lib.recordDispatchBriefingRoute(input);",
      "process.stdout.write(JSON.stringify(guard.recordAdmittedBriefingRoutes({ dispatches: prompts.map((prompt) => ({ prompt })), root, record })));",
    ].join("\n"));
    const prompts = [v10wBriefing(a), v10wBriefing(b), v10wBriefing(c)];
    assert.notEqual(sha256Of(prompts[0]), sha256Of(prior));
    const res = spawnSync(process.execPath, [runner, pathToFileURL(GUARD).href,
      pathToFileURL(fileURLToPath(new URL("../dispatch-briefing-route-record.mjs", import.meta.url))).href,
      JSON.stringify({ prompts, root, failing: c })], { input: "", encoding: "utf8", timeout: 15000 });
    assert.equal(res.status, 0, (res.stderr ?? "").slice(0, 300));
    const result = JSON.parse(res.stdout);
    assert.equal(result.ok, false);
    assert.deepEqual(result.fault, { code: "DBRR-WRITE", sliceId: c, path: `evidence/dispatch-route-${c}.json` });
    assert.equal(readFileSync(fileA, "utf8"), priorRecord, "the earlier slice's prior record bytes must be restored");
    assert.equal(readRoute(b), null, "a slice with no prior record must be left absent");
    assert.equal(readRoute(c), null);
    rmSync(fileA, { force: true });
  });

  test("V-10 a record-write fault is refused before any admission effect, names the evidence path and the code, and leaves nothing persisted", () => {
    const slice = "ALF-V10-WIRE-FAULT";
    const pending = () => {
      const out = [];
      const walk = (dir) => {
        let entries = [];
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full); else out.push(relative(root, full));
        }
      };
      walk(join(root, ".git", "agent-pipeline"));
      return out.sort();
    };
    const before = pending();
    const evidence = join(root, "evidence");
    rmSync(evidence, { recursive: true, force: true });
    writeFileSync(evidence, "not a directory\n"); // the evidence target cannot hold a record
    try {
      const refused = send("native", v10wBriefing(slice));
      assert.equal(refused.code, 2, refused.stderr.slice(0, 300));
      assert.ok(refused.stderr.includes("DBRR-EVIDENCE-DIR") && refused.stderr.includes("evidence"), refused.stderr.slice(0, 300));
      assert.ok(!/repair or remove it/iu.test(refused.stderr), "a write fault must not be worded as an unverifiable existing record");
      assert.deepEqual(pending(), before, "a refused briefing must leave no persisted admission effect behind");
    } finally {
      rmSync(evidence, { force: true });
    }
    assert.equal(send("native", v10wBriefing(slice)).code, 0, "once the evidence path is fixed the same briefing is admitted");
    assert.equal(readRoute(slice)?.briefingSha256, sha256Of(v10wBriefing(slice)));
  });

  test("V-10 what is deliberately not recorded: a Critic dispatch and a Goldfish briefing without a Slice line stay unbound and are admitted", () => {
    const critic = V10_BRIEFING.replace(V10_SLICE, "ALF-V10-WIRE-CRITIC");
    assert.equal(send("critic", critic).code, 0);
    assert.equal(readRoute("ALF-V10-WIRE-CRITIC"), null);
    assert.equal(send("critic", critic.replace("risk class high", "risk class hugh")).code, 0);
    const prior = routeNames();
    assert.equal(send("native", v10wBriefing("unused", { withSlice: false })).code, 0);
    assert.deepEqual(routeNames(), prior, "no Slice line, nothing recorded");
  });

  // The dynamic-Workflow gap, measured (ALF-K28). The Workflow call itself DOES reach the hook (the matcher below) and a statically
  // resolvable agent() literal is recorded (the workflow transport case above). What the hook cannot see is a prompt that only exists
  // once the script runs: `extractWorkflowDispatches` skips it by design (fail-open), so the whole call is admitted and nothing is
  // recorded. This case documents that boundary; it is the contract to update, together with the header, when the gap is closed.
  const dynamicScript = (body) => ({ tool_use_id: `v10w-dyn-${process.pid}-${(sequence += 1)}`, tool_name: "Workflow", tool_input: { script: body } });
  const staticCall = (prompt) => `await agent({ agentType: '${V10W_ROLE}', prompt: \`${prompt}\` });`;

  /** The boundary as one reusable check: admitted, and no route recorded for the slice the script builds at run time. */
  function checkDynamicWorkflowGap({ send, read }) {
    const admitted = send();
    assert.equal(admitted.code, 0, `a dynamically built Workflow prompt is admitted (fail-open): ${admitted.stderr.slice(0, 300)}`);
    assert.equal(read(), null, "a prompt the hook cannot resolve statically records no route");
  }

  test("V-10 typed gap, measured: a Workflow script whose prompt is built at run time (interpolation, a named const) is admitted and records no route; a static call beside it is still recorded", () => {
    const slice = "ALF-V10-WIRE-DYNAMIC";
    const briefing = v10wBriefing(slice);
    const templated = v10wBriefing("${sliceId}"); // interpolation: the slice id only exists at run time
    const scripts = {
      interpolation: `const sliceId = '${slice}';\nawait agent({ agentType: '${V10W_ROLE}', prompt: \`${templated}\` });`,
      "named const": `const BRIEFING = \`${briefing}\`;\nawait agent({ agentType: '${V10W_ROLE}', prompt: BRIEFING });`,
    };
    for (const [name, script] of Object.entries(scripts)) {
      assert.equal(script.includes(slice), true, name);
      checkDynamicWorkflowGap({ send: () => runHook(dynamicScript(script)), read: () => readRoute(slice) });
    }
    // one call carrying both kinds: only the static literal is recorded, the dynamic one is not seen
    const staticSlice = "ALF-V10-WIRE-DYNAMIC-STATIC";
    const mixed = `${staticCall(v10wBriefing(staticSlice))}\n${scripts.interpolation}`;
    assert.equal(runHook(dynamicScript(mixed)).code, 0);
    assert.deepEqual(readRoute(staticSlice), { schema: V10W_ROUTE_SCHEMA, sliceId: staticSlice, briefingSha256: sha256Of(v10wBriefing(staticSlice)), origin: V10W_ORIGIN });
    assert.equal(readRoute(slice), null);
  });

  // PO decision 2026-10-22 (ALF-K35): the gap above is not closed by a refusal but by a typed advisory. The call is still admitted and
  // still unrecorded (the case above is unchanged); the hook now says so, names the cause and the one repair.
  const WARN_CODE = "GUARD-DISPATCH-WORKFLOW-PROMPT-UNRESOLVED";
  test("V-10 typed warning: an unresolvable Goldfish agent() prompt in a Workflow script is admitted with an advisory naming the cause, the missing record and one repair", () => {
    const slice = "ALF-V10-WIRE-DYNAMIC-WARN";
    const briefing = v10wBriefing(slice);
    const cases = {
      interpolation: { script: `const sliceId = '${slice}';\nawait agent({ agentType: '${V10W_ROLE}', prompt: \`${v10wBriefing("${sliceId}")}\` });`, cause: /\$\{/u },
      "named const": { script: `const BRIEFING = \`${briefing}\`;\nawait agent({ agentType: '${V10W_ROLE}', prompt: BRIEFING });`, cause: /identifier|expression|variable/iu },
    };
    for (const [name, { script, cause }] of Object.entries(cases)) {
      const res = runHook(dynamicScript(script));
      assert.equal(res.code, 0, `${name}: still admitted: ${res.stderr.slice(0, 300)}`);
      assert.ok(res.stderr.includes(WARN_CODE), `${name}: typed advisory code expected: ${res.stderr.slice(0, 300)}`);
      assert.match(res.stderr, cause, `${name}: names the cause`);
      assert.ok(res.stderr.includes("no route record was written for this call"), `${name}: says what is missing`);
      assert.ok(res.stderr.includes("templates/prompts/goldfish-task.md") && res.stderr.includes("static string literal"), `${name}: one repair`);
      assert.equal(readRoute(slice), null, `${name}: nothing recorded`);
    }
  });

  test("V-10 typed warning scope: a static literal, a non-Goldfish role and a script without agent() calls get no advisory; a static literal beside a dynamic one is still recorded", () => {
    const staticSlice = "ALF-V10-WIRE-DYNAMIC-WARN-STATIC";
    const quiet = runHook(dynamicScript(staticCall(v10wBriefing(staticSlice))));
    assert.equal(quiet.code, 0, quiet.stderr.slice(0, 300));
    assert.ok(!quiet.stderr.includes(WARN_CODE), "a static literal is recorded and needs no advisory");
    assert.equal(readRoute(staticSlice)?.briefingSha256, sha256Of(v10wBriefing(staticSlice)));
    const critic = runHook(dynamicScript("const P = 'x';\nawait agent({ agentType: 'pipeline-core:critic', prompt: P });"));
    assert.ok(!critic.stderr.includes(WARN_CODE), "Critic and other non-Goldfish roles are out of scope of V-10 (PO 2026-10-22)");
    const plain = runHook(dynamicScript("const n = 1 + 1;"));
    assert.equal(plain.code, 0);
    assert.ok(!plain.stderr.includes(WARN_CODE));
    const mixedSlice = "ALF-V10-WIRE-DYNAMIC-WARN-MIXED";
    const mixed = runHook(dynamicScript(`${staticCall(v10wBriefing(mixedSlice))}\nconst S = 'a';\nawait agent({ agentType: '${V10W_ROLE}', prompt: \`${v10wBriefing("${S}")}\` });`));
    assert.equal(mixed.code, 0, mixed.stderr.slice(0, 300));
    assert.ok(mixed.stderr.includes(WARN_CODE), "the dynamic call beside the static one is flagged");
    assert.equal(readRoute(mixedSlice)?.briefingSha256, sha256Of(v10wBriefing(mixedSlice)), "the static call is still recorded");
  });

  test("V-10 typed gap RED proof: a guard that did record the run-time prompt, or one that refused it, fails the same check", () => {
    const slice = "ALF-V10-WIRE-DYNAMIC-RED";
    assert.throws(() => checkDynamicWorkflowGap({ send: () => ({ code: 0, stderr: "" }), read: () => ({ sliceId: slice }) }), /records no route/u);
    assert.throws(() => checkDynamicWorkflowGap({ send: () => ({ code: 2, stderr: "DISPATCH-INCOMPLETE-BRIEFING" }), read: () => null }), /admitted/u);
    checkDynamicWorkflowGap({ send: () => ({ code: 0, stderr: "" }), read: () => null });
  });

  test("V-10 admission wiring RED proof: a guard that records nothing, one that never lets a later admission win, and one that admits a tampered briefing after a preflight record, fail the same check", () => {
    const sliceId = "ALF-V10-WIRE-RED";
    const prompt = v10wBriefing(sliceId);
    const ok = { code: 0, stderr: "" };
    assert.throws(() => checkV10Wiring({ send: () => ok, read: () => null, produce: () => {}, prompt, sliceId })); // the state before this slice
    const record = (text, origin) => ({ schema: V10W_ROUTE_SCHEMA, sliceId, briefingSha256: sha256Of(text), ...(origin === undefined ? {} : { origin }) });
    // first admission binds (the semantics this slice replaces): the amended re-dispatch is refused
    let bound = null;
    const firstBinds = (text) => {
      if (bound === null) { bound = record(text, V10W_ORIGIN); return ok; }
      return text === prompt ? ok : { code: 2, stderr: "DISPATCH-BRIEFING-DIGEST-MISMATCH" };
    };
    assert.throws(() => checkV10Wiring({ send: firstBinds, read: () => bound, produce: (text) => { bound = record(text); }, prompt, sliceId }), /amended re-dispatch/u);
    // records every admission but cannot tell a producer record from its own: a tampered text after a preflight record goes through
    let stored = null;
    assert.throws(() => checkV10Wiring({
      send: (text) => { stored = record(text, V10W_ORIGIN); return ok; },
      read: () => stored, produce: (text) => { stored = record(text); }, prompt, sliceId,
    }), /tampered briefing after a preflight record/u);
    // records without provenance: the admission record is not distinguishable from a producer record
    let bare = null;
    assert.throws(() => checkV10Wiring({ send: (text) => { bare = record(text); return ok; }, read: () => bare, produce: () => {}, prompt, sliceId }));
  });
});

describe("V-10 runner registration: the shipped Codex and Antigravity routes reach guard-dispatch", () => {
  const dispatchCommands = (manifest, matcher) => (manifest.hooks?.PreToolUse ?? [])
    .filter((entry) => entry.matcher === matcher)
    .flatMap((entry) => entry.hooks ?? [])
    .map((hook) => `${hook.command ?? ""} ${hook.commandWindows ?? ""}`);

  test("V-10 runner registration: codex-hooks.json runs guard-dispatch.mjs on spawn_agent and the Antigravity adapter runs it for Task and Agent per Subagents element", () => {
    const codex = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks", "codex-hooks.json"), "utf8"));
    const commands = dispatchCommands(codex, "spawn_agent");
    assert.ok(commands.length > 0, "codex-hooks.json has no spawn_agent PreToolUse entry");
    assert.ok(commands.every((c) => /hooks\/guard-dispatch\.mjs/u.test(c)), `spawn_agent must run guard-dispatch.mjs: ${JSON.stringify(commands)}`);
    const adapter = stripComments(readFileSync(join(PLUGIN_ROOT, "hooks", "antigravity-pretool-guard.mjs"), "utf8"));
    assert.match(adapter, /toolName === "Task" \|\| toolName === "Agent"\s*\?\s*\["guard-dispatch\.mjs"\]/u);
    assert.match(adapter, /guardName === "guard-dispatch\.mjs" && multiSubagentDispatch/u);
  });

  // A Workflow call is a PreToolUse event of the Workflow tool: its script text reaches guard-dispatch. Whether the host fires the hook
  // again for each agent() the running script launches is host behaviour this repository cannot observe and is NOT claimed here.
  const claudeDispatchMatchers = (manifest) => (manifest.hooks?.PreToolUse ?? [])
    .filter((entry) => (entry.hooks ?? []).some((hook) => /hooks\/guard-dispatch\.mjs/u.test(hook.command ?? "")))
    .map((entry) => String(entry.matcher ?? "").split("|"));

  test("V-10 runner registration: hooks.json runs guard-dispatch.mjs on the Workflow tool as well as Task and Agent", () => {
    const hooks = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks", "hooks.json"), "utf8"));
    const matchers = claudeDispatchMatchers(hooks);
    assert.ok(matchers.length > 0, "hooks.json has no PreToolUse entry for guard-dispatch.mjs");
    assert.ok(matchers.some((tools) => ["Task", "Agent", "Workflow"].every((tool) => tools.includes(tool))),
      `guard-dispatch.mjs must be matched on Task, Agent and Workflow: ${JSON.stringify(matchers)}`);
  });

  test("V-10 runner registration RED proof: a hooks.json whose dispatch matcher omits Workflow fails the same check", () => {
    const covers = (manifest) => claudeDispatchMatchers(manifest).some((tools) => ["Task", "Agent", "Workflow"].every((tool) => tools.includes(tool)));
    const entry = (matcher, script) => ({ hooks: { PreToolUse: [{ matcher, hooks: [{ command: `node "\${CLAUDE_PLUGIN_ROOT}/hooks/${script}"` }] }] } });
    assert.equal(covers(entry("Task|Agent|Workflow", "guard-dispatch.mjs")), true);
    assert.equal(covers(entry("Task|Agent", "guard-dispatch.mjs")), false);
    assert.equal(covers(entry("Task|Agent|Workflow", "guard-dispatch-budget.mjs")), false);
  });

  test("V-10 runner registration RED proof: a manifest without the spawn_agent entry, or one that runs another script there, fails the same check", () => {
    const check = (manifest) => {
      const commands = dispatchCommands(manifest, "spawn_agent");
      assert.ok(commands.length > 0);
      assert.ok(commands.every((c) => /hooks\/guard-dispatch\.mjs/u.test(c)));
    };
    assert.throws(() => check({ hooks: { PreToolUse: [] } }));
    assert.throws(() => check({ hooks: { PreToolUse: [{ matcher: "spawn_agent", hooks: [{ command: "node hooks/codex-slicing-hint.mjs" }] }] } }));
    check({ hooks: { PreToolUse: [{ matcher: "spawn_agent", hooks: [{ command: "node hooks/guard-dispatch.mjs" }] }] } });
  });
});

test("two-approval happy path to implementation and push", { skip: "native: pending (live interactive Claude/Windows session)" }, () => {});
