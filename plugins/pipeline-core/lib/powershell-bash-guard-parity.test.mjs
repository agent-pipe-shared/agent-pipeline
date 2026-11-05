// SPDX-License-Identifier: SUL-1.0
// C19C-W169 (E7 PowerShell part, W4, W5 of the native Windows runs; AC-108 binding): the PowerShell dialect of guard-lifecycle-ready gives the same
// verdict as the Bash grammar for every command shape both dialects can express, every PowerShell refusal names an admitted alternative, and the
// native read refusal states which roots are protected. Fixtures are the exact commands the Windows run reported.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { evaluateLifecycleReadyGuard } from "./guard/evaluate.mjs";
import { ADMITTED_GRAMMAR_SHAPES } from "./guard/grammar-denials.mjs";
import * as denials from "./guard/grammar-denials.mjs";
import { isReadOnlyDiagnosticCommand } from "./guard/shell-grammar.mjs";
import { HUMAN_OVERRIDE_SCRIPT, PIPELINE_STATE_SCRIPT } from "./guard/constants.mjs";
import { ProjectOnboardingReadyError } from "./project-onboarding-ready-gate.mjs";

const pluginRoot = dirname(dirname(PIPELINE_STATE_SCRIPT));
const scripts = (name) => join(pluginRoot, "scripts", name);
const READY = () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" });
const NOT_READY = () => { throw new ProjectOnboardingReadyError("PORG-NOT-READY", "not ready", { intent: "session", lifecycleStatus: "partial" }); };

function withRoot(body) {
  mkdirSync(resolve("scratch"), { recursive: true });
  const root = mkdtempSync(join(resolve("scratch"), "w169-"));
  try {
    mkdirSync(join(root, "docs"));
    mkdirSync(join(root, "project"));
    writeFileSync(join(root, "docs", "a.md"), "safe\n");
    writeFileSync(join(root, "probe.txt"), "needle\n");
    writeFileSync(join(root, "project", "pipeline.json"), "{}\n");
    const run = (tool_name, tool_input, ready = READY) => evaluateLifecycleReadyGuard(
      { tool_name, tool_input }, { projectDir: root, requireProjectOnboardingReadyFn: ready });
    const ps = (command, ready) => run("PowerShell", { command }, ready);
    return body({ root, run, ps });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// One row per shape of ADMITTED_GRAMMAR_SHAPES (same order). A shape the PowerShell dialect must refuse says why; the walk fails when a shape is added
// to the Bash table without a row here, so the two dialects cannot drift apart silently.
const SHAPE_DISPOSITION = [
  // E7 (9b0935da5): the PowerShell tool admits a single read-only rg exactly like the Bash grammar, so the plain-singleton shape is admitted in both dialects.
  // cat, head, tail, wc, stat and the other coreutils singletons are not PowerShell commands; reads there are Get-Content, Get-ChildItem or the native
  // Read, Glob and Grep tools. The git part of this shape is walked by the git cases below.
  { bashOnly: "cat, head, tail, wc, stat and the other coreutils singletons are not PowerShell commands (a read-only rg is admitted, E7)", psExitCode: 0 },
  { bashOnly: "a PowerShell pipeline passes objects, not text; the dialect admits no pipe at all" },
  { bashOnly: "a PowerShell pipeline passes objects, not text; the dialect admits no pipe at all" },
  { bashOnly: "a PowerShell pipeline passes objects, not text; the dialect admits no pipe at all" },
  { bashOnly: "a PowerShell pipeline passes objects, not text; the dialect admits no pipe at all" },
  { bashOnly: "the dialect admits one literal command per call (the one literal $env: assignment folded into it is the single exception)" },
];

test("every shape of the Bash grammar table has a disposition, and a Bash-only shape is refused by the PowerShell dialect", () => withRoot(({ root, ps }) => {
  assert.equal(SHAPE_DISPOSITION.length, ADMITTED_GRAMMAR_SHAPES.length, "a shape was added to or removed from ADMITTED_GRAMMAR_SHAPES without a row here");
  ADMITTED_GRAMMAR_SHAPES.forEach((shape, index) => {
    assert.equal(isReadOnlyDiagnosticCommand(shape.example, root), true, `Bash admits its own example: ${shape.example}`);
    assert.equal(typeof SHAPE_DISPOSITION[index].bashOnly, "string");
    const expected = SHAPE_DISPOSITION[index].psExitCode ?? 2;
    assert.equal(ps(shape.example).exitCode, expected, expected === 2 ? `Bash-only shape stays refused: ${shape.example}` : `shape the PowerShell dialect admits like Bash: ${shape.example}`);
  });
}));

test("read-only git observations get the Bash verdict in the PowerShell dialect, mutating git stays refused", () => withRoot(({ root, ps }) => {
  const mustBeAdmitted = ["git status", "git status --short", "git log", "git log -n 5 --oneline", "git diff --stat", "git diff", "git show HEAD",
    "git rev-parse HEAD", "git ls-files", "git describe", "git for-each-ref", "git branch --show-current", "git tag --list", "git remote -v", "git stash list"];
  const mustBeRefused = ["git commit -m x", "git push", "git add -A", "git reset --hard", "git checkout main", "git fetch", "git stash drop",
    "git branch -D x", "git config user.name x", "git diff --output=out.txt", "git -C .. status", "git status; git log", "git log | head -5"];
  for (const command of [...mustBeAdmitted, ...mustBeRefused]) {
    const expected = mustBeAdmitted.includes(command);
    if (!command.includes(";") && !command.includes("|")) assert.equal(isReadOnlyDiagnosticCommand(command, root), expected, `the Bash grammar verdict this case relies on: ${command}`);
    assert.equal(ps(command).exitCode, expected ? 0 : 2, command);
  }
}));

test("one literal $env: assignment is folded into the one command after it, nothing else is", () => withRoot(({ ps }) => {
  const preflight = "node \"$env:PIPELINE_PLUGIN_ROOT/scripts/pipeline-start-preflight.mjs\"";
  assert.equal(ps(`$env:PIPELINE_PLUGIN_ROOT = "${pluginRoot}"; ${preflight}`).exitCode, 0);
  assert.equal(ps(`$env:PIPELINE_PLUGIN_ROOT = '${pluginRoot}'; ${preflight}`).exitCode, 0);
  assert.equal(ps(`$env:PIPELINE_PLUGIN_ROOT="${pluginRoot}";${preflight}`).exitCode, 0);
  for (const refused of [
    `$env:PATH = "${pluginRoot}"; node "${scripts("pipeline-start-preflight.mjs")}"`,
    `$env:PIPELINE_PLUGIN_ROOT = "${join(pluginRoot, "..")}"; ${preflight}`,
    `$env:PIPELINE_PLUGIN_ROOT = "$env:HOME"; ${preflight}`,
    `$env:PIPELINE_PLUGIN_ROOT = "${pluginRoot}"; ${preflight}; Remove-Item docs/a.md`,
    `$env:PIPELINE_PLUGIN_ROOT = "${pluginRoot}"; Remove-Item docs/a.md`,
    `$env:PIPELINE_PLUGIN_ROOT = "${pluginRoot}"; $env:OTHER = "x"; ${preflight}`,
    `$env:PIPELINE_PLUGIN_ROOT = "${pluginRoot}"`,
  ]) assert.equal(ps(refused).exitCode, 2, refused);
}));

test("sanctioned scripts: --help and the plan, inspect and binding verbs are admitted in a ready session, mutating verbs never", () => withRoot(({ ps }) => {
  const state = (...args) => `node ${PIPELINE_STATE_SCRIPT} ${args.join(" ")}`.trim();
  const admittedWhenReady = [
    state("inspect"), state("--help"), state("continuity-authority-revision-plan", "--help"), state("continuity-result-bootstrap-plan"),
    state("continuity-authority-revision-plan", "--proposal-file", "scratch/p.json"),
    `node ${scripts("dispatch-briefing.mjs")} binding --dispatch-id C19C-X --item some-item --agent-type goldfish-deep --model-id claude-sonnet-5-5 --check lib/x.test.mjs`,
    `node ${scripts("dispatch-briefing.mjs")} --help`, `node ${HUMAN_OVERRIDE_SCRIPT} --help`,
  ];
  for (const command of admittedWhenReady) assert.equal(ps(command).exitCode, 0, command);
  // readiness is what differs: the Bash grammar table admits `pipeline-state inspect` and `pipeline-state --help` before readiness too (and so does the
  // dialect, through the same isSanctionedLifecycleCommand); every other route above exists only in a ready session
  const beforeReadiness = [state("inspect"), state("--help")];
  for (const command of beforeReadiness) assert.equal(ps(command, NOT_READY).exitCode, 0, `not ready: ${command}`);
  for (const command of admittedWhenReady.filter((entry) => !beforeReadiness.includes(entry))) assert.equal(ps(command, NOT_READY).exitCode, 2, `not ready: ${command}`);
  for (const refused of [
    state("configure-verify", "--verify-command", "\"node --test\""), state("approve-push", "--commit", "abc"), state("approve-plan", "--help"),
    state("continuity-authority-revision-apply"), state("continuity-result-bootstrap-apply"),
    `node ${scripts("foreign.mjs")} --help`, `node ${join("docs", "a.md")} --help`, `node ${scripts("dispatch-briefing.mjs")} build --dispatch-id x`,
    `node ${PIPELINE_STATE_SCRIPT} inspect | Out-String`, `node ${PIPELINE_STATE_SCRIPT} --help $env:HOME`,
  ]) assert.equal(ps(refused).exitCode, 2, refused);
}));

test("every PowerShell grammar refusal names the admitted alternative for the shape it refused, and every printed alternative is admitted", () => withRoot(({ ps }) => {
  const shapes = denials.POWERSHELL_ADMITTED_SHAPES ?? [];
  assert.ok(shapes.length >= 7, "the dialect publishes its admitted forms as one table");
  const rendered = (text) => text.replaceAll("<plugin-root>", pluginRoot);
  for (const shape of shapes) assert.equal(ps(rendered(shape.example)).exitCode, 0, `the table example is admitted: ${shape.example}`);
  const fixtures = [
    [`$env:PIPELINE_PLUGIN_ROOT = "${join(pluginRoot, "..")}"; node "$env:PIPELINE_PLUGIN_ROOT/scripts/pipeline-start-preflight.mjs"`, /\$env:PIPELINE_PLUGIN_ROOT = ".*"; node "\$env:PIPELINE_PLUGIN_ROOT\/scripts\/pipeline-start-preflight\.mjs"/u],
    [`node ${PIPELINE_STATE_SCRIPT} configure-verify --verify-command "node --test"`, /Working example: node "[^"]*pipeline-state\.mjs" --help/u],
    [`node ${scripts("dispatch-briefing.mjs")} build --dispatch-id x`, /Working example: node "[^"]*dispatch-briefing\.mjs" --help/u],
    ["git commit -m x", /git status --short/u],
    ["git push", /git status --short/u],
    ["Remove-Item docs/a.md", /Get-Content docs\/a\.md/u],
  ];
  for (const [command, expected] of fixtures) {
    const result = ps(command);
    assert.equal(result.exitCode, 2, command);
    assert.match(result.stderr, /GUARD-POWERSHELL-GRAMMAR/u, command);
    assert.match(result.stderr, expected, `${command}\n${result.stderr}`);
    const printed = result.stderr.split("\n").map((line) => /^Working example: (.*)$/u.exec(line)?.[1] ?? /^\s+e\.g\. (.*)$/u.exec(line)?.[1]).filter(Boolean);
    assert.ok(printed.length >= shapes.length + 1, `the refusal prints its working example and the whole table\n${result.stderr}`);
    for (const example of printed) assert.equal(ps(example).exitCode, 0, `the alternative printed for ${command} is admitted: ${example}`);
  }
}));

test("a native read of a project directory that is not a protected root states what is protected and which spelling is admitted", () => withRoot(({ root, run, ps }) => {
  const grep = run("Grep", { pattern: "x", path: join(root, "project") });
  assert.equal(grep.exitCode, 2);
  assert.match(grep.stderr, /GUARD-READ-TARGET:/u);
  assert.match(grep.stderr, /Protected roots:/u, grep.stderr);
  assert.match(grep.stderr, /\.ssh/u);
  assert.match(grep.stderr, /secret-named/u);
  assert.match(grep.stderr, /not a protected root/u, grep.stderr);
  assert.match(grep.stderr, /Glob/u);
  assert.match(grep.stderr, /exact file/u);
  const glob = run("Glob", { pattern: "**/*", path: join(root, "project") });
  assert.equal(glob.exitCode, 2);
  assert.match(glob.stderr, /GUARD-READ-TARGET:/u);
  assert.match(glob.stderr, /literal non-credential extension/u, glob.stderr);
  assert.match(glob.stderr, /Protected roots:/u);
  assert.equal(run("Grep", { pattern: "x", path: join(root, "project", "pipeline.json") }).exitCode, 0);
  assert.equal(run("Glob", { pattern: "*.json", path: join(root, "project") }).exitCode, 0);
  // the PowerShell read refusal says the same, and the project-relative directory read itself is admitted
  assert.equal(ps("Get-ChildItem project").exitCode, 0);
  assert.equal(ps("Get-ChildItem -Name project").exitCode, 0);
  const refused = ps("Get-Content ~/.ssh/id_rsa");
  assert.equal(refused.exitCode, 2);
  assert.match(refused.stderr, /GUARD-READ-TARGET/u);
  assert.match(refused.stderr, /Protected roots:/u, refused.stderr);
  assert.match(refused.stderr, /Get-Content docs\/a\.md|Get-Content -LiteralPath docs\/a\.md/u);
}));
