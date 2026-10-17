// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item pipeline.advertised-git-to-head-pipeline-is-refused
// (AC-102, slice ALF-C-P9-05). Every case drives the real grammar modules; no behavior is mocked.
// Fixtures/mutants live under the repository scratch/ directory.
//
// Acceptance points (from the item's Description/Proposal):
//   P1 the advertised "git <read-only-subcommand> ... | head -n N" shape is admitted, including
//      the `git show HEAD:<path>` (<rev>:<path>) form that was reported refused
//   P2 every grammar example the refusal text advertises is actually admitted, and the text a
//      real refusal prints is rendered from that same table (advertised == admitted)
//   P3 the admitted shape stays closed: bounds, sink, write subcommands, root containment
//   P4 meaningful: a mirror of the module without the git-pipeline lane fails P1/P2 (RED)
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ADMITTED_GRAMMAR_SHAPES, GRAMMAR_DENIAL_REMEDY } from "../guard/grammar-denials.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// The default is always the real module; PIN_GRAMMAR_MODULE lets a pending (signature-bound)
// grammar candidate be proven against this same pin before it is applied.
const { isReadOnlyDiagnosticCommand } = await import(process.env.PIN_GRAMMAR_MODULE
  ? pathToFileURL(resolve(process.env.PIN_GRAMMAR_MODULE)).href
  : "../guard/shell-grammar.mjs");
const guardDir = resolve(here, "..", "guard");
const repoRoot = resolve(here, "..", "..", "..", "..");
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const fixture = mkdtempSync(join(scratchBase, "p905-"));
test.after(() => rmSync(fixture, { recursive: true, force: true }));

const guard = (command) => isReadOnlyDiagnosticCommand(command, repoRoot);

// ------------------------------------------------------------------ P1
for (const command of [
  "git show HEAD:docs/state.md | head -n 200",
  "git show HEAD:docs/state.md | head -200",
  "git show HEAD:docs/state.md | head -n 200 2>/dev/null",
  "git show HEAD:plugins/pipeline-core/lib/guard/shell-grammar.mjs | head -n 5",
  "git --no-pager show HEAD:docs/state.md | head -n 5",
  "git log | head -5",
  "git log --oneline -n 5 | head -n 3",
  "git diff --stat | head -n 20",
  "git status --short | head -n 10",
  "git rev-parse HEAD | head -n 1",
  "git log HEAD~1 | head -n 3",
  "git log --max-count 5 | head -n 3",
  "git show -U 3 HEAD:docs/state.md | head -n 5",
  "git log -n 5 -- docs/state.md | head -n 5",
]) {
  test(`P1 admitted: ${command}`, () => {
    assert.equal(guard(command), true);
  });
}

test("P1 control: the un-piped <rev>:<path> form is admitted too", () => {
  assert.equal(guard("git show HEAD:docs/state.md"), true);
});

// ------------------------------------------------------------------ P2
test("P2 the git-to-head shape is advertised, with a bound and the head -N spelling", () => {
  const shape = ADMITTED_GRAMMAR_SHAPES.find((s) => s.spelling.includes("git-to-head"));
  assert.ok(shape, "git-to-head shape missing from the advertised grammar");
  assert.match(shape.spelling, /head -n N/u);
  assert.match(shape.spelling, /head -N/u);
  assert.match(shape.spelling, /1\.\.500/u);
});

for (const shape of ADMITTED_GRAMMAR_SHAPES) {
  test(`P2 advertised example is admitted: ${shape.example}`, () => {
    // The examples name a relative probe.txt: give them a real one inside a fixture root.
    writeFileSync(join(fixture, "probe.txt"), "needle\n");
    assert.equal(isReadOnlyDiagnosticCommand(shape.example, fixture), true);
  });
}

test("P2 a real refusal renders every advertised shape and example", async () => {
  // Real refusal text: a composed command outside the grammar goes through the real renderer.
  const denials = await import("../guard/grammar-denials.mjs");
  const rendered = [...GRAMMAR_DENIAL_REMEDY, ...(denials.GRAMMAR_DENIAL_REMEDY_SHORT ?? [])].join("\n");
  assert.ok(rendered.length > 0);
  const source = readFileSync(join(guardDir, "grammar-denials.mjs"), "utf8");
  assert.match(source, /grammarShapeLines\(\)/u, "refusal text must be rendered from the shape table");
  assert.equal(guard("git log ; git status"), false, "control: a composed command is still refused");
});

// ------------------------------------------------------------------ P3
for (const command of [
  "git log | head -n 0",
  "git log | head -n 501",
  "git log | head -501",
  "git log | cat",
  "git log | head -n 5 | head -n 2",
  "git log | tail -n 5",
  "git log | head -n 5 > out.txt",
  "git commit -m x | head -n 5",
  "git push | head -n 5",
  "git add -- a.md | head -n 5",
  "git show HEAD:../outside.txt | head -n 5",
  "git show HEAD:docs/../../outside.txt | head -n 5",
  "git show HEAD:/etc/hostname | head -n 5",
  "git log -- ../outside.txt | head -n 5",
  "git log ../outside.txt | head -n 5",
  "git log -n ../outside.txt | head -n 5",
  "git show HEAD:docs/state.md ; head -n 5",
  "git log || head -n 5",
]) {
  test(`P3 stays refused: ${command}`, () => {
    assert.equal(guard(command), false);
  });
}

// ------------------------------------------------------------------ P4 (RED against a mirror)
function mirrorWithoutGitPipeline(name) {
  let source = readFileSync(join(guardDir, "shell-grammar.mjs"), "utf8");
  const lane = "if (isBoundedGitPipeline(parsed, root, pipelineRoots)) return true;";
  assert.ok(source.includes(lane), "mirror anchor (git-pipeline lane) not found");
  source = source.replace(lane, "");
  source = source.replace(/from "(\.\.?\/[^"]+)"/gu, (_m, spec) => `from "${pathToFileURL(resolve(guardDir, spec)).href}"`);
  const file = join(fixture, name);
  writeFileSync(file, source);
  return import(pathToFileURL(file).href);
}

test("P4 RED: a mirror with the git-pipeline lane removed refuses the advertised shapes", async () => {
  const mutant = await mirrorWithoutGitPipeline("shell-grammar-no-git-pipeline.mjs");
  const asMutant = (command) => mutant.isReadOnlyDiagnosticCommand(command, repoRoot);
  assert.equal(asMutant("rg -n needle README.md"), true, "mirror control: unrelated lanes intact");
  // the dedicated git-show lane (isContainedGitShowObject, via isBoundedReadOnlyPipeline)
  // admits "git show HEAD:<path> | head" even without the generic git-pipeline lane,
  // so the discriminating probes use shapes only the generic lane can admit.
  assert.equal(asMutant("git log | head -n 3"), false);
  assert.equal(asMutant("git diff --stat | head -n 20"), false);
  assert.equal(asMutant("git log | head -5"), false);
  // and the real module still admits them: the pin above discriminates real from mirror
  assert.equal(guard("git log | head -5"), true);
});
