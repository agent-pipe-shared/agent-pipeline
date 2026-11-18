#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * The contract that makes `templates/prompts/agent-obligations.md` trustworthy.
 *
 * The document is generated from the guards' own sources. Without this suite that
 * is a claim; with it, it is a property: the committed bytes must equal what the
 * generator produces right now, so a rule changed at its source and not
 * regenerated turns the suite red instead of silently shipping a stale
 * obligation to every dispatched agent.
 *
 * The drift check is the part that matters. A byte-equality test alone would
 * pass just as happily against a generator that ignored its inputs, so DRIFT-1
 * changes an input and asserts the output follows.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { OBLIGATIONS_PATH, renderAgentObligations } from "./generate-agent-obligations.mjs";
import { DEFAULT_EXEMPT_PREFIXES } from "../../plugins/pipeline-core/lib/guard-devplan-policy.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUARD_CONFIG = join(REPO_ROOT, "project", "guard-config.json");

const roots = [];
function tempRootWithGuardConfig(mutate) {
  const base = mkdtempSync(join(tmpdir(), "agent-obligations-"));
  roots.push(base);
  mkdirSync(join(base, "project"), { recursive: true });
  const config = JSON.parse(readFileSync(GUARD_CONFIG, "utf8"));
  mutate(config);
  writeFileSync(join(base, "project", "guard-config.json"), `${JSON.stringify(config, null, 2)}\n`);
  return base;
}

test.after(() => { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); });

test("AC-2: the committed document is byte-identical to a fresh generation", () => {
  const committed = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.equal(
    renderAgentObligations(),
    committed,
    "templates/prompts/agent-obligations.md is stale -- run: node harness/scripts/generate-agent-obligations.mjs",
  );
});

test("AC-2b: the vendored plugin copy is byte-identical to the canonical document", () => {
  // The allowlist entry in check-consumer-safe-paths.mjs justifies shipping this file
  // by asserting the copy is byte-identical. That claim went false unnoticed once (the
  // canonical file was regenerated, the vendored copy was not), so the claim is now a
  // test rather than a comment. Scoped to this one file on purpose: it is the only
  // vendored prompt whose canonical side is machine-generated.
  const canonical = readFileSync(OBLIGATIONS_PATH, "utf8");
  const vendored = readFileSync(join(REPO_ROOT, "plugins", "pipeline-core", "templates", "prompts", "agent-obligations.md"), "utf8");
  assert.equal(
    vendored,
    canonical,
    "plugins/pipeline-core/templates/prompts/agent-obligations.md has drifted -- re-copy templates/prompts/agent-obligations.md over it after regenerating",
  );
});

test("AC-3 (drift): a protected path added at the source changes the generated document", () => {
  const root = tempRootWithGuardConfig((config) => {
    config.protectedTestPaths.push({
      id: "TP-DRIFT",
      pattern: "plugins/pipeline-core/hooks/invented-for-this-test\\.test\\.mjs$",
      reason: "fixture only",
    });
  });
  const drifted = renderAgentObligations({ rootDir: root });
  assert.notEqual(drifted, renderAgentObligations(), "an added protected path must change the document");
  assert.match(drifted, /TP-DRIFT/u, "the added entry must appear in the generated table");
});

test("AC-4: every protected path appears verbatim, and the count is stated", () => {
  const entries = JSON.parse(readFileSync(GUARD_CONFIG, "utf8")).protectedTestPaths;
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.ok(entries.length > 0, "the fixture is meaningless if no paths are protected");
  assert.match(document, new RegExp(`\\(${entries.length} entries\\)`, "u"), "the stated count must match the source");
  for (const entry of entries) {
    assert.ok(document.includes(`\`${entry.id}\``), `${entry.id} is missing from the document`);
    // Verbatim, never paraphrased: the pattern is a regex and a reworded one
    // would send an agent looking at the wrong file.
    assert.ok(document.includes(`\`${entry.pattern}\``), `${entry.id}'s pattern is not verbatim in the document`);
  }
});

test("AC-4: the no-in-session-override fact is stated with its citation, not as folklore", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.match(document, /author-repair-required/u);
  assert.match(document, /human-guard-override\.mjs/u);
});

test("AC-3: the draft-phase exempt prefixes come from the guard's own constant", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  for (const prefix of DEFAULT_EXEMPT_PREFIXES) {
    assert.ok(document.includes(`\`${prefix}\``), `exempt prefix ${prefix} is missing from the document`);
  }
});

test("AC-5: liftability is delegated to the repair map, never copied", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.match(document, /repair-map\.mjs/u, "the document must point at the runtime answer");
  // A second static copy of what the map computes is the drift this whole file
  // exists to prevent, so the document must not enumerate liftability verdicts.
  assert.doesNotMatch(document, /^\s*\|\s*`?HGO-[A-Z-]+`?\s*\|/mu, "the document must not restate the repair map's rows");
});

/**
 * OBLIGROUTE-2. The missing level, again: every assertion above reads the document
 * against a copy of what the guard is assumed to do. This one drives the real guard.
 *
 * The document printed `node plugins/pipeline-core/scripts/repair-map.mjs` until
 * 2026-08-09 and the lifecycle guard refused exactly that string, so §5's whole
 * purpose -- handing a stuck agent the one question it may still ask -- did not work
 * in the state it was written for. Both directions are asserted, because an
 * admission test alone would also pass on a document that named some other admitted
 * command.
 */
test("AC-9 (contract): the command §5 prints is the command the lifecycle guard admits", async () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  const printed = /^node (<plugin-root>\/\S+)$/mu.exec(document);
  assert.ok(printed, "§5 must print exactly one `node <plugin-root>/...` command");

  const guard = await import("../../plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs");
  // The guard resolves its admitted path from its OWN module URL, so substituting the
  // plugin root of the guard under test is the substitution a real agent performs.
  const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "plugins", "pipeline-core");
  const resolved = `node ${join(pluginRoot, printed[1].slice("<plugin-root>/".length))}`;
  const project = tempRootWithGuardConfig(() => {});

  assert.equal(
    guard.isSanctionedLifecycleCommand(resolved, project),
    true,
    `the guard refuses the command the document hands a stuck agent: ${resolved}`,
  );
  // The form this fix removed, asserted as refused so a regression to it turns red
  // here rather than in a dispatch that has already run out of budget.
  assert.equal(
    guard.isSanctionedLifecycleCommand("node plugins/pipeline-core/scripts/repair-map.mjs", project),
    false,
    "a repository-relative form must stay refused -- that is why the document may not print one",
  );
});

/**
 * pipeline.agent-obligations-recommends-a-commit-spelling-guard-push-refuses.
 * The document once recommended `git commit -m ... --trailer ...` while guard-push
 * refused exactly that spelling. Text-only assertions cannot see that, so this
 * drives the real guard-push hook with the commit command the document recommends.
 */
function runGuardPush(command, cwd) {
  return runGuardHook("guard-push.mjs", command, cwd);
}

function runGuardHook(hookFile, command, cwd) {
  const guard = join(REPO_ROOT, "plugins", "pipeline-core", "hooks", hookFile);
  const res = spawnSync(process.execPath, [guard], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 20000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

test("AC-106 (contract): the commit spelling the document recommends is admitted by guard-push", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  const recommended = /commit with `(git commit -F <msgfile> -- <paths>)`/u.exec(document);
  assert.ok(recommended, "§1 must recommend `git commit -F <msgfile> -- <paths>` as the provenance-bearing commit");

  const cwd = tempRootWithGuardConfig(() => {});
  const concrete = recommended[1].replace("<msgfile>", "scratch/commit-msg/msg.txt").replace("<paths>", "a.md");
  const admitted = runGuardPush(concrete, cwd);
  assert.equal(admitted.code, 0, `guard-push refuses the recommended spelling (${concrete}): ${admitted.stderr.trim().slice(0, 300)}`);

  assert.doesNotMatch(document, /prefer[^\n]*--trailer/iu, "the document must not recommend --trailer");
});

test("AC-106 (contract): the recommended commit spelling is admitted by every guard in the union, not only guard-push", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  const recommended = /commit with `(git commit -F <msgfile> -- <paths>)`/u.exec(document);
  assert.ok(recommended, "§1 must recommend `git commit -F <msgfile> -- <paths>` as the provenance-bearing commit");

  // The repository root, not a bare temp root: guard-git and guard-lifecycle-ready only
  // enforce their project rules (the --trailer refusal, the closed shell grammar) in a
  // governed root; in an ungoverned one they fail open, so an admission there is vacuous.
  // The negative controls below fail if that ever stops being true.
  const cwd = REPO_ROOT;
  // guard-git (GIT-03) reads the message file named by -F and requires the provenance
  // trailer in it, so the fixture is a real message file under the gitignored scratch/.
  const msgDir = join(REPO_ROOT, "scratch", "commit-msg-ac106");
  mkdirSync(msgDir, { recursive: true });
  roots.push(msgDir);
  writeFileSync(join(msgDir, "msg.txt"), "docs: fixture subject\n\nFixture body.\n\nAI-Assisted: true\nDispatch: ALF-FIXTURE (goldfish)\n");
  const concrete = recommended[1].replace("<msgfile>", "scratch/commit-msg-ac106/msg.txt").replace("<paths>", "a.md");
  // guard-lifecycle-ready is deliberately not driven here: in a session that is not
  // lifecycle-ready it denies EVERY command with GUARD-LIFECYCLE-NOT-READY before the
  // grammar is consulted (probed: composed and trailer commands get the same code), so
  // its verdict on a spelling is session-state dependent and a subprocess admission or
  // refusal would be meaningless. Open hold, reported to the dispatcher.
  for (const hook of ["guard-push.mjs", "guard-git.mjs"]) {
    const verdict = runGuardHook(hook, concrete, cwd);
    assert.equal(
      verdict.code,
      0,
      `${hook} refuses the recommended spelling (${concrete}): ${verdict.stderr.trim().slice(0, 300)}`,
    );
  }

  // Negative controls in the same fixture root: an admission result only means
  // something if the same harness can see each guard refuse.
  assert.notEqual(
    runGuardHook("guard-git.mjs", "git commit -m x --trailer a=b -- a.md", cwd).code,
    0,
    "guard-git must still refuse the --trailer spelling, otherwise its admission above proves nothing",
  );
});

// AC-106 / ALF-C-I08B: guard-lifecycle-ready, driven in-process. The subprocess route is
// session-state dependent (a non-ready lifecycle denies everything), so the evaluator is
// imported and given the documented onboarding-observation seam instead of reading this
// repository's live lifecycle. The hook is only imported, never edited.
test("AC-106 (contract): guard-lifecycle-ready admits the recommended commit spelling and refuses a composed near-miss", async () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  const recommended = /commit with `(git commit -F <msgfile> -- <paths>)`/u.exec(document);
  assert.ok(recommended, "§1 must recommend `git commit -F <msgfile> -- <paths>` as the provenance-bearing commit");
  const concrete = recommended[1].replace("<msgfile>", "scratch/commit-msg-ac106/msg.txt").replace("<paths>", "a.md");

  const guard = await import("../../plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs");
  const evaluate = (command) => guard.evaluateLifecycleReadyGuard(
    { tool_name: "Bash", tool_input: { command } },
    {
      projectDir: REPO_ROOT,
      runner: "claude",
      inspectProjectOnboardingV3Fn() { throw new Error("fixture: no onboarding observation"); },
    },
  );

  const admitted = evaluate(concrete);
  assert.equal(admitted.exitCode, 0, `guard-lifecycle-ready refuses the recommended spelling (${concrete}): ${String(admitted.stderr).trim().slice(0, 300)}`);

  // Near-miss in the same harness: the same commit composed with a second command is outside
  // the closed grammar. Without it the admission above could not be told from fail-open.
  const refused = evaluate(`${concrete} && echo done`);
  assert.equal(refused.exitCode, 2, "a composed commit must be refused, otherwise the admission above proves nothing");
  assert.match(String(refused.stderr), /GUARD-PARSE-UNSUPPORTED/u, "the near-miss must be refused by the closed shell grammar");
});

test("AC-7: the document carries no absolute or machine-specific path", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.doesNotMatch(document, /\/home\//u);
  assert.doesNotMatch(document, /C:\\Users/u);
  assert.doesNotMatch(document, new RegExp(REPO_ROOT.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("AC-1: a hand-maintained line is marked as such, so the boundary is visible", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  // The grammar prose and the commit discipline are stated rather than derived --
  // no component exports the commit rules as data. That is acceptable; being silent about
  // it is not, because a reader cannot otherwise tell which lines a source
  // change would update.
  const marks = document.match(/hand-maintained/gu) ?? [];
  assert.ok(marks.length >= 2, `expected every hand-maintained section to say so; found ${marks.length}`);
});

// C30J-J26 (AC-112): since C30J-J18 the guard module exports the admitted shell shapes as data, so the section-1 comment must not say no
// component exports the grammar; it names what is exported instead. The "hand-maintained" mark above stays (the prose is still stated).
test("C30J-J26: section 1 does not claim that no component exports the grammar, and names the exported shape table", async () => {
  for (const rel of ["templates/prompts/agent-obligations.md", "plugins/pipeline-core/templates/prompts/agent-obligations.md"]) {
    const text = readFileSync(join(REPO_ROOT, rel), "utf8");
    assert.doesNotMatch(text, /no component\s+exports the whole grammar/u, rel);
    assert.match(text, /ADMITTED_GRAMMAR_SHAPES/u, rel);
    assert.match(text, /GRAMMAR_DENIAL_REMEDY/u, rel);
  }
  const grammar = await import("../../plugins/pipeline-core/lib/guard/grammar-denials.mjs");
  assert.ok(Array.isArray(grammar.ADMITTED_GRAMMAR_SHAPES) && grammar.ADMITTED_GRAMMAR_SHAPES.length > 0, "the shape table is exported");
  assert.ok(Array.isArray(grammar.GRAMMAR_DENIAL_REMEDY), "the refusal lines are exported");
});

// C30-19 / AC-111 (slice C30I-S4B): the commit-route texts say what really holds for the one-command commit with trailers.
const COMMIT_ROUTE_FILES = [
  "templates/prompts/agent-obligations.md", "plugins/pipeline-core/templates/prompts/agent-obligations.md",
  "templates/prompts/goldfish-task.md", "plugins/pipeline-core/templates/prompts/goldfish-task.md",
  "plugins/pipeline-core/lib/goldfish-commit-command-flow.mjs", "plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs",
];
test("AC-111: the generated obligations teach the one-command commit first, the file route as the fallback, and the Git glue fact", () => {
  const document = renderAgentObligations();
  const oneCommand = document.indexOf('git commit -m <subject> [-m <body>] --trailer "AI-Assisted: true" --trailer "Dispatch: <ID>"');
  assert.ok(oneCommand > 0, "the one-command form is named");
  assert.ok(oneCommand < document.indexOf("git commit -F <msgfile> -- <paths>"), "the one-command form comes first");
  assert.match(document, /GIT-03-TRAILERS-GLUED-TO-BODY/u);
  assert.match(document, /Key: value/u);
  assert.match(document, /plain printable-ASCII/u, "the guard-push limit is stated exactly");
  assert.match(document, /commit with `git commit -F <msgfile> -- <paths>`/u, "the AC-106 contract phrase stays");
});
test("AC-111: no commit-route text keeps the blanket claim that guard-push refuses -m with --trailer", () => {
  for (const rel of COMMIT_ROUTE_FILES) {
    const text = readFileSync(join(REPO_ROOT, rel), "utf8");
    assert.doesNotMatch(text, /is refused by guard-push/u, rel);
    assert.doesNotMatch(text, /guard-push refuses it/u, rel);
    assert.doesNotMatch(text, /guard-push refuses `-m` with a parenthesised/u, rel);
    assert.doesNotMatch(text, /`-m` is refused where a/u, rel);
  }
});
test("AC-111: the Goldfish route keeps the message file and names the accurate reason", () => {
  const text = readFileSync(join(REPO_ROOT, "templates/prompts/goldfish-task.md"), "utf8");
  assert.match(text, /There is exactly one commit route: the message file/u);
  assert.match(text, /guard-dispatch-budget/u);
});

// C30K-K18 (AC-112, duplicated-state analysis K1-03, stage 5): the closed list of admitted `Dispatch:` forms is exported once by the
// commit-message policy; the policy texts and the generated section 6 are built from it. These cases are written from the criterion,
// not from the implementation: they must be red while the export is absent and green when the generator derives from it.
const K18_SAMPLES = Object.freeze({
  goldfish: "C30K-K18 (goldfish)",
  critic: "C30K-K18 (critic)",
  "elephant-generated": "harness/scripts/generate-agent-obligations.mjs (elephant-generated)",
  "stage-0": "stage-0 (elephant)",
  design: "design (elephant)",
  administrative: "administrative (elephant)",
  integration: `quality-package-${"a".repeat(64)} (integration)`,
  "elephant-exception": "D54 (elephant-exception)",
});
const K18_REFUSED = Object.freeze([
  "invented (elephant)", "C30K-K18 (elephant)", "C30K-K18 (invented)", "D0 (elephant-exception)", "x (integration)",
  "../x (elephant-generated)", "C30K K18 (goldfish)",
]);
async function k18Policy() {
  return import("../../plugins/pipeline-core/lib/commit-message-policy.mjs");
}
function k18Section6(document = renderAgentObligations()) {
  const start = document.indexOf("## 6. Commit discipline");
  const end = document.indexOf("## 7.");
  assert.ok(start > 0 && end > start, "section 6 is found");
  return document.slice(start, end);
}
function k18FormsListed(section) {
  return [...section.replace(/\s+/gu, " ").matchAll(/`Dispatch: ([^`]+)`/gu)].map((match) => match[1]);
}

test("C30K-K18: the commit-message policy exports the closed list of admitted Dispatch forms, one entry per binding", async () => {
  const policy = await k18Policy();
  const forms = policy.ADMITTED_DISPATCH_FORMS;
  assert.ok(Array.isArray(forms) && Object.isFrozen(forms), "ADMITTED_DISPATCH_FORMS is an exported frozen array");
  assert.deepEqual(forms.map((form) => form.id).sort(), Object.keys(K18_SAMPLES).sort(), "exactly the eight bindings GIT-03 admits");
  for (const form of forms) {
    assert.equal(typeof form.value, "string", form.id);
    assert.equal(typeof form.matches, "function", form.id);
    assert.ok(form.matches(K18_SAMPLES[form.id]), `${form.id} admits its sample`);
  }
});

test("C30K-K18: the generated section 6 lists every form the policy admits and none it refuses", async () => {
  const { ADMITTED_DISPATCH_FORMS: forms, finishedCommitMessageFindings } = await k18Policy();
  assert.ok(Array.isArray(forms), "the export exists");
  const listed = k18FormsListed(k18Section6());
  assert.deepEqual([...new Set(listed)].sort(), forms.map((form) => form.value).sort(), "the listed forms are exactly the exported ones");
  for (const refused of K18_REFUSED) {
    assert.ok(!listed.includes(refused), `${refused} is not listed`);
    const message = `feat(x): x\n\nDispatch: ${refused}\nAI-Assisted: true\n`;
    const codes = finishedCommitMessageFindings(message, { requireMarker: true, requireDispatch: true }).findings.map((finding) => finding.code);
    assert.ok(codes.includes("GIT-03-DISPATCH-MALFORMED"), `${refused} is refused by the policy`);
  }
  for (const form of forms) {
    const message = `feat(x): x\n\nDispatch: ${K18_SAMPLES[form.id]}\nAI-Assisted: true\n`;
    const codes = finishedCommitMessageFindings(message, { requireMarker: true, requireDispatch: true }).findings.map((finding) => finding.code);
    assert.ok(!codes.includes("GIT-03-DISPATCH-MALFORMED"), `${form.id} is admitted by the policy`);
  }
});

test("C30K-K18: the section 6 marker names the exported list as the derived part and keeps the prose hand-maintained", () => {
  const section = k18Section6();
  assert.match(section, /ADMITTED_DISPATCH_FORMS/u);
  assert.match(section, /hand-maintained/u);
  assert.doesNotMatch(section, /not values any guard exports/u, "the old claim that no component exports the forms is gone");
});

test("C30K-K18: the policy keeps no inline copy of the admitted forms outside the exported list", () => {
  const source = readFileSync(join(REPO_ROOT, "plugins", "pipeline-core", "lib", "commit-message-policy.mjs"), "utf8");
  assert.doesNotMatch(source, /value === "stage-0 \(elephant\)" \|\|/u, "the inline Elephant chain is gone");
  assert.doesNotMatch(source, /\(\\`Dispatch: <task-id> \(goldfish\)\\` or \\`Dispatch: stage-0 \(elephant\)\\`\)/u, "the refusal text is built from the export");
});

// Refusal texts and codes stay byte-identical (GIT-03): green before and after the derivation, so a change of bytes shows here.
test("C30K-K18: the two GIT-03 refusal texts that name forms keep their exact bytes", async () => {
  const { finishedCommitMessageFindings } = await k18Policy();
  const opts = { requireMarker: true, requireDispatch: true };
  const missing = finishedCommitMessageFindings("feat(x): x\n\nAI-Assisted: true\n", opts).findings.find((finding) => finding.code === "GIT-03-DISPATCH-MISSING");
  assert.equal(
    missing.detail,
    "no `Dispatch:` entry in the final Git trailer block; end the message with `AI-Assisted: true` and one `Dispatch:` line (`Dispatch: <task-id> (goldfish)` or `Dispatch: stage-0 (elephant)`) as the last lines, written with `git commit -m <subject> [-m <body>] --trailer \"AI-Assisted: true\" --trailer \"Dispatch: <id>\"` (or, for a long or multi-paragraph body, `git commit -F scratch/<message-file>`)",
  );
  const administrative = finishedCommitMessageFindings("feat(x): x\n\nDispatch: administrative (elephant)\nAI-Assisted: true\n", opts).findings
    .find((finding) => finding.code === "GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED");
  assert.equal(
    administrative.detail,
    "administrative binding requires independently inspected exact Git paths and official projection bytes; no authorship or approval is inferred. The admitted Elephant form for a bounded commit of your own is `Dispatch: stage-0 (elephant)` with `AI-Assisted: true`",
  );
  const malformed = finishedCommitMessageFindings("feat(x): x\n\nDispatch: invented (elephant)\nAI-Assisted: true\n", opts).findings.find((finding) => finding.code === "GIT-03-DISPATCH-MALFORMED");
  assert.equal(malformed.detail, "the final `Dispatch: invented (elephant)` entry is not an admitted work-package binding");
});
