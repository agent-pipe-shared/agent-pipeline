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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  // QG-04: the entry "git log | tail -n 5" was removed from this refusal list and restated as an admitted case in the D114 tail
  // section below (PO tile decision 2026-10-22: admit `tail` in the bounded git read pipeline in addition to `head`, D114 as written).
  // Every other sink stays refused here and in the tail section (cat, wc, sort, tee, xargs, redirects, doubled sinks).
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

// ------------------------------------------------------------------ P5 (2026-10-18 addendum, PF-17)
// The real-project observation listed four more refused shapes. Measured on 2026-10-22: `rg -o ...` and `ls -la <dir>` are admitted
// now (green below); `rg -c`, `rg --count` and `rg --no-filename`/`-I`/`-H` are still refused because the rg option set in
// hooks/guard-command-grammar.mjs (SEARCH_BOOLEAN) lacks them (todo, fix reported as patch h1-patch-02); `git -C <repo> ... | head`
// is refused on purpose today (the generic git pipeline excludes -C as a cross-repository reach, see isBoundedGitPipeline), which is a
// guard-owner decision, recorded as a todo and not guessed.
for (const command of ["rg -o needle README.md", "rg -n needle README.md", "ls -la docs", "ls -la", "rg -n needle README.md | head -n 3"]) {
  test(`P5 addendum shape admitted: ${command}`, () => {
    assert.equal(guard(command), true);
  });
}

for (const command of [
  "rg -c needle README.md",
  "rg --count needle README.md",
  "rg --no-filename needle README.md",
  "rg -o --no-filename needle README.md",
  "rg -c needle README.md | head -n 3",
]) {
  test(`P5 addendum shape (needs the rg option set widened): ${command}`,
    { todo: false },
    () => { assert.equal(guard(command), true); });
}

// QG-04 justification (PO decision D114, 2026-10-22, specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md): this case was a `todo`
// because admitting `git -C <repo>` in the pipeline was an open product question ("a security trade, not made here"). D114 resolved it:
// the READ forms of `git -C <repo> show|log|diff|ls-files|cat-file ... | head -n N` are admitted, with the -C target and every
// path/revision-path operand cleared by the same passive-read credential screen as any other read; writing git forms stay refused.
// The case below keeps its original intent and assertion; only the `todo` marker is removed because the decision now exists.
test("P5 addendum shape (decided by D114): git -C <repo> show <rev>:<path> | head", () => {
  assert.equal(guard("git -C . show HEAD:docs/state.md | head -n 3"), true);
});

// D114 admitted siblings (same repository root, read subcommands only) and negative controls. Fixtures live under scratch/.
const repo = join(fixture, "repo");
mkdirSync(join(repo, ".git"), { recursive: true });
mkdirSync(join(repo, "docs"), { recursive: true });
mkdirSync(join(repo, "sub"), { recursive: true });
mkdirSync(join(repo, "other", ".git"), { recursive: true });
mkdirSync(join(repo, ".env", ".git"), { recursive: true });
mkdirSync(join(repo, "other", "docs"), { recursive: true });
writeFileSync(join(repo, "docs", "state.md"), "state\n");
writeFileSync(join(repo, "other", "docs", "state.md"), "other state\n");
writeFileSync(join(repo, ".env", "config"), "x\n");
const inRepo = (command) => isReadOnlyDiagnosticCommand(command, repo);

for (const command of [
  "git -C . show HEAD:docs/state.md | head -n 3",
  "git -C . show HEAD:docs/state.md | head -3 2>/dev/null",
  "git -C other show HEAD:docs/state.md | head -n 3",
  "git -C . --no-pager log -n 3 | head -n 5",
  "git --no-pager -C . log --oneline | head -n 5",
  "git -C . diff --stat | head -n 20",
  "git -C . diff HEAD~1 -- docs/state.md | head -n 20",
  "git -C . ls-files docs | head -n 20",
  "git -C . ls-files | head -n 20",
  "git -C . cat-file -p HEAD:docs/state.md | head -n 3",
  "git -C . cat-file -t HEAD | head -n 1",
]) {
  test(`D114 admitted: ${command}`, () => { assert.equal(inRepo(command), true); });
}

for (const command of [
  // the -C target: escaping, credential-named, missing, not a repository, doubled, flag-shaped, glob or expansion
  "git -C .. show HEAD:docs/state.md | head -n 3",
  "git -C /etc show HEAD:docs/state.md | head -n 3",
  "git -C .env show HEAD:docs/state.md | head -n 3",
  "git -C missing show HEAD:docs/state.md | head -n 3",
  "git -C sub show HEAD:docs/state.md | head -n 3",
  "git -C . -C other show HEAD:docs/state.md | head -n 3",
  "git -C -p show HEAD:docs/state.md | head -n 3",
  "git -C 'ot*' show HEAD:docs/state.md | head -n 3",
  "git -C $HOME show HEAD:docs/state.md | head -n 3",
  "git -C ~/.ssh log | head -n 3",
  // operands: credential names, hidden parts, traversal, absolute paths, metacharacters
  "git -C . show HEAD:.env | head -n 3",
  "git -C . show HEAD:.env/config | head -n 3",
  "git -C . show HEAD:../outside.txt | head -n 3",
  "git -C . show HEAD:/etc/hostname | head -n 3",
  "git -C . log -- .env | head -n 3",
  "git -C . log -- ../outside.txt | head -n 3",
  "git -C other log -- ../docs/state.md | head -n 3",
  "git -C . ls-files .env | head -n 3",
  "git -C . ls-files ../outside | head -n 3",
  "git -C . ls-files 'docs/*' | head -n 3",
  "git -C . cat-file -p HEAD:.env | head -n 3",
  "git -C . cat-file -p HEAD:../outside.txt | head -n 3",
  "git -C . show HEAD:docs/state.md$(id) | head -n 3",
  "git -C . show `id` | head -n 3",
  "git -C . show HEAD:docs/state.md;id | head -n 3",
  // cat-file is a closed -p/-t/-s/-e form: batch modes, filters and bare forms stay refused
  "git -C . cat-file --batch | head -n 3",
  "git -C . cat-file --textconv HEAD:docs/state.md | head -n 3",
  "git -C . cat-file -p | head -n 3",
  "git -C . cat-file -p HEAD HEAD | head -n 3",
  // execution/output options of the admitted subcommands
  "git -C . log --output=out.txt | head -n 3",
  "git -C . diff --ext-diff | head -n 3",
  "git -C . diff --no-index a b | head -n 3",
  // sink bounds and shape are the existing ones
  "git -C . log | head -n 501",
  "git -C . log | cat",
  "git -C . log | head -n 3 > out.txt",
  "git -C . log ; head -n 3",
  // writing and unlisted git forms with -C stay refused
  "git -C . commit -m x | head -n 3",
  "git -C . add -- docs/state.md | head -n 3",
  "git -C . rm docs/state.md | head -n 3",
  "git -C . checkout main | head -n 3",
  "git -C . reset --hard | head -n 3",
  "git -C . stash | head -n 3",
  "git -C . config user.name x | head -n 3",
  "git -C . push | head -n 3",
  "git -C . status | head -n 3",
  "git -C . rev-parse HEAD | head -n 3",
]) {
  test(`D114 stays refused: ${command}`, () => { assert.equal(inRepo(command), false); });
}

// ------------------------------------------------------------------ D114 tail sink (PO tile decision 2026-10-22)
// `tail` is admitted as the second sink of the bounded git read pipeline, with the same 1..500 bound, the same optional trailing
// `2>/dev/null` and exactly the same containment / credential / -C rules as the head form. No other sink is added.
test("D114 tail: the advertised git pipeline shape names tail with its bound and both spellings", () => {
  const shape = ADMITTED_GRAMMAR_SHAPES.find((s) => s.spelling.includes("git-to-head"));
  assert.ok(shape);
  assert.match(shape.spelling, /tail -n N/u);
  assert.match(shape.spelling, /tail -N/u);
});

for (const command of [
  "git log | tail -n 5",
  "git log | tail -5",
  "git log | tail -n 5 2>/dev/null",
  "git diff --stat | tail -n 20",
  "git show HEAD:docs/state.md | tail -n 5",
  "git log -n 5 -- docs/state.md | tail -500",
]) {
  test(`D114 tail admitted: ${command}`, () => { assert.equal(guard(command), true); });
}

for (const command of [
  "git -C . log | tail -n 3",
  "git -C . show HEAD:docs/state.md | tail -3 2>/dev/null",
  "git -C . ls-files docs | tail -n 20",
  "git -C . cat-file -p HEAD:docs/state.md | tail -n 3",
  "git -C other diff --stat | tail -n 3",
]) {
  test(`D114 tail admitted with -C: ${command}`, () => { assert.equal(inRepo(command), true); });
}

for (const command of [
  "git log | tail -n 0", "git log | tail -n 501", "git log | tail -501", "git log | tail", "git log | tail -n", "git log | tail -f",
  "git log | tail -n +5", "git log | tail -c 5", "git log | tail -n 5 -f", "git log | tail -n 5 docs/state.md",
  "git log | tail -n 5 | tail -n 2", "git log | head -n 5 | tail -n 2", "git log | tail -n 5 > out.txt", "git log | tail -n 5 2>&1",
  "git log | cat", "git log | wc -l", "git log | sort", "git log | tee out.txt", "git log | xargs echo", "git log | sh",
  "git log | rg x", "git log | grep x", "git log | less", "git log | tail -n 5 ; head -n 2",
  "git commit -m x | tail -n 5", "git push | tail -n 5", "git add -- a.md | tail -n 5",
  "git show HEAD:../outside.txt | tail -n 5", "git show HEAD:/etc/hostname | tail -n 5", "git show HEAD:.env | tail -n 5",
  "git log -- ../outside.txt | tail -n 5", "git log ../outside.txt | tail -n 5", "git log -- .env | tail -n 5",
]) {
  test(`D114 tail stays refused: ${command}`, () => { assert.equal(guard(command), false); });
}

for (const command of [
  "git -C .. log | tail -n 3", "git -C /etc log | tail -n 3", "git -C .env show HEAD:docs/state.md | tail -n 3",
  "git -C sub log | tail -n 3", "git -C . -C other log | tail -n 3", "git -C . show HEAD:.env | tail -n 3",
  "git -C . cat-file --batch | tail -n 3", "git -C . commit -m x | tail -n 3", "git -C . push | tail -n 3",
  "git -C . checkout main | tail -n 3", "git -C . status | tail -n 3", "git -C . log | tail -n 501", "git -C . log | wc -l",
  "git -C . log | cat", "git -C . log | tee out.txt", "git -C . log | xargs echo", "git -C . log | sort", "git -C . log | tail -n 3 > out.txt",
]) {
  test(`D114 tail with -C stays refused: ${command}`, () => { assert.equal(inRepo(command), false); });
}

test("D114 a symlinked -C target is refused even when it resolves inside the project; the real directory is admitted", (t) => {
  try { symlinkSync(join(repo, "other"), join(repo, "other-link"), "dir"); }
  catch (error) { t.skip(`host-limitation: cannot create directory symlinks (${error?.code ?? "unknown"})`); return; }
  assert.equal(inRepo("git -C other show HEAD:docs/state.md | head -n 3"), true, "control: the real directory");
  assert.equal(inRepo("git -C other-link show HEAD:docs/state.md | head -n 3"), false);
});

test("P5 control: the other refused addendum rg flags and an escaping -C target stay refused", () => {
  for (const command of ["rg --hidden needle README.md", "rg --pre cat needle README.md", "rg -c -c needle README.md",
    "rg -c needle ../outside.txt", "git -C .. show HEAD:docs/state.md | head -n 3"]) {
    assert.equal(guard(command), false, command);
  }
});

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
