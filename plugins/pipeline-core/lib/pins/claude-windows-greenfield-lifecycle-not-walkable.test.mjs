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
//         DISPATCH-BRIEFING-ROUTE-INVALID), the producer (lib/dispatch-briefing-route-record.mjs), and the ONE
//         caller: lib/role-dispatch-preflight.mjs calls recordDispatchBriefingRoute, and only when
//         current.packet.transport === "direct" (commit a2d61489c).
//         The guard itself never writes a record: with no record for the named slice it passes ("none").
//         A native Claude Agent/Task dispatch that does not go through role-dispatch-preflight writes no record,
//         so for it the binding does not fire (the guard admits unchanged).
//         V-10 native Agent/Task dispatch wiring: open, owner Coordinator, due 2026-10-31
//         V-10 non-direct transport (role-dispatch-preflight, transport !== "direct") wiring: open, owner Coordinator, due 2026-10-31
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
        tool_input: { subagent_type: "pipeline-core:critic", prompt } }),
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
        tool_input: { subagent_type: "pipeline-core:critic", prompt } }),
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
    ["recordDispatchBriefingRoute", "lib/dispatch-briefing-route-record.mjs", ["lib/role-dispatch-preflight.mjs"]],
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
  test("recordDispatchBriefingRoute is called only by role-dispatch-preflight (direct transport) and buildBriefingRoute only by the producer", () => {
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
        put("hooks/guard-dispatch.mjs", "export function buildBriefingRoute() {}\n");
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

test("two-approval happy path to implementation and push", { skip: "native: pending (live interactive Claude/Windows session)" }, () => {});
