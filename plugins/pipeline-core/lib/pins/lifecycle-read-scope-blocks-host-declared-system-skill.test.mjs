// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item pipeline.lifecycle-read-scope-blocks-host-declared-system-skill (ALF-C-P21-08 / 08B, AC-209).
// Original acceptance (item "Acceptance" section, four points):
//   P1 the narrow host-owned skill instruction surface (declared openai-docs SKILL.md) is admitted, with a concrete
//      ordinary route after refusal (no exceptional PO-signature flow);
//   P2 identical admission for supported single and bounded diagnostic reads;
//   P3 unrelated outside-root reads, traversal, symlink escapes and sensitive private surfaces stay refused;
//   P4 verified at the real lifecycle boundary, preserving current Implementation approval validation.
// Every case runs through the real guard (evaluateLifecycleReadyGuard); nothing under test is mocked except the
// documented observeGovernanceScopeFn enforcement seam.
//
// FIXTURE RECIPE (08B; same as the committed sibling pin declared-system-skill-read-requires-human-override.test.mjs):
//   1. Governance seam: the guard allows EVERY read unless observeGovernanceScope reports requiresEnforcement, and a
//      scratch directory is not an enrolled project, so pass { projectDir, observeGovernanceScopeFn: () => ({
//      requiresEnforcement: true }) }. Without it every "refusal" case was a false green waiting to happen (exit 0, not 2).
//   2. Protected home: the protected credential surfaces are resolved under homedir() (USERPROFILE on win32, HOME
//      elsewhere). The fake home only means something when HOME and USERPROFILE point at it during the in-process call;
//      both are set, then restored in finally.
//   3. Containment (incident 2026-10-16): the fixture project is `git init`-ed FIRST and every git call, including the
//      guard's in-process ones, runs with GIT_CEILING_DIRECTORIES = the absolute fixture base.
//   4. Baseline FIRST: an undeclared credential read under the fake home must be refused with the typed code, otherwise
//      every other refusal case is invalid (the fixture would not be honest).
//
// FINDINGS (restated 2026-10-30, PO decisions D96/D108/D109 and D210; QG-04 restatement, no case deleted):
//   * D96/D108 (built in 5b3990a37): a single read of ANY host-visible non-credential file outside the repository is
//     admitted by its physical name, with no catalog, in every supported form (cat, cat|head, head, sed -n, rg -n and
//     rg|head over the one file, native Read). That is why an UNDECLARED single SKILL.md, a lookalike path and a transcript
//     file are admitted (P3a-unlisted, P3b, P4-unrelated assert it so the premise change is visible), and why P2 parity of
//     the declared file holds before and after the catalog. Recursive searches and listings over the skill collection and
//     the session trees stay refused (D108).
//   * D210 builds the authenticated host skill-catalog carrier (lib/host-skill-catalog.mjs): a sealed private record
//     written ONLY by the host readback (writeHostSkillCatalog, the bootstrap preflight) and read by the passive read
//     policy. What a valid entry adds over D96 is exactly one thing: a bounded search/listing inside that ONE declared skill
//     directory (P1, P1b). A replaced file (drift) or a forged/hand-edited record invalidates it again (P5, P5b); an
//     undeclared sibling, the collection root, the transcript tree, traversal and aliases stay refused.
//   * The catalog is NOT an input field: a catalog handed to the guard in the tool input binds nothing (P3d, A3 of the
//     sibling pin). The installed-host readback of the actual Codex route is not proven by this pin (native hold, item AC-147).
//   * P1b (ordinary route): an ordinary route exists and is shown behaviourally: the refused recursive search of an
//     undeclared skill directory is paired with the admitted single read of its instruction file, and the declared directory
//     search is admitted with no override; denial TEXT lives in grammar-denials.mjs and is out of this slice.
//   * P2-diagnostic: the bounded (piped) form of an outside-root CREDENTIAL read carries GUARD-OPERATOR-UNAPPROVED where the
//     single form carries the scope code (measured; both exit 2). Re-labelling the piped credential refusal belongs to
//     evaluate.mjs and the NVA-BL-75 override-class corpus, not to this slice; the admitted side is identical for every form.
//   * Refusal-preserving points (credentials, transcript/skill-tree directory listings, forged declaration, in-project
//     boundary) are real GREEN assertions that fail for the stated reason (typed code asserted).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { hostSkillCatalogRecordPath, writeHostSkillCatalog } from "../host-skill-catalog.mjs";
import { resolveGitCommonDir } from "../po-key-directory.mjs";

// Host fact: fixtures live under the repository scratch/, never the OS temp dir.
const SCRATCH_ROOT = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const WIN = process.platform === "win32";
const HOST_LIMITATION = "typed host limitation: directory symlinks unavailable on this native Windows host; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)";
const fwd = (p) => p.replaceAll("\\", "/");
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const readTool = (file_path) => ({ tool_name: "Read", tool_input: { file_path } });

// `declare: true` runs the REAL host readback (writeHostSkillCatalog) right after the declared skill exists and BEFORE the
// undeclared sibling is created, so the sibling is genuinely not in the catalog. No catalog is ever written by hand here.
function fixture({ declare = false } = {}) {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const base = realpathSync(mkdtempSync(join(SCRATCH_ROOT, "alf-c-p21-08-")));
  const project = join(base, "project");
  const home = join(base, "home");
  mkdirSync(project, { recursive: true });
  // CONTAINMENT: own git root first, then every git call under the ceiling.
  execFileSync("git", ["init", "-q", project], { env: { ...process.env, GIT_CEILING_DIRECTORIES: base } });
  mkdirSync(join(project, ".claude"), { recursive: true });
  mkdirSync(join(project, ".agent-pipeline"), { recursive: true });
  mkdirSync(join(project, "docs"), { recursive: true });
  writeFileSync(join(project, "docs", "state.md"), "# state\n");
  writeFileSync(join(project, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  const skillDir = join(home, ".codex", "skills", ".system", "openai-docs");
  const otherDir = join(home, ".codex", "skills", ".system", "undeclared-skill");
  mkdirSync(join(skillDir, "references"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "# openai-docs\nline two\n");
  writeFileSync(join(skillDir, "references", "a.md"), "reference text\n");
  if (declare) {
    const readback = writeHostSkillCatalog({ rootDir: project, runner: "codex", homeDir: home });
    assert.equal(readback.status, "written", JSON.stringify(readback));
  }
  mkdirSync(otherDir, { recursive: true });
  mkdirSync(join(home, ".ssh"), { recursive: true });
  mkdirSync(join(home, ".codex", "sessions"), { recursive: true });
  writeFileSync(join(otherDir, "SKILL.md"), "# undeclared\n");
  writeFileSync(join(home, ".ssh", "id_rsa"), "private\n");
  writeFileSync(join(home, ".codex", "sessions", "rollout.jsonl"), "{}\n");
  writeFileSync(join(home, ".codex", "auth.json"), "{}\n");
  return { base, project, home, skillDir, otherDir, skill: join(skillDir, "SKILL.md"), other: join(otherDir, "SKILL.md") };
}
const ENV_KEYS = ["HOME", "USERPROFILE", "GIT_CEILING_DIRECTORIES"];
const withFixture = (fn, options) => {
  const f = fixture(options);
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.HOME = f.home;
  process.env.USERPROFILE = f.home;
  process.env.GIT_CEILING_DIRECTORIES = f.base;
  try { return fn(f); } finally {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    rmSync(f.base, { recursive: true, force: true });
  }
};
const verdict = (input, project) => {
  const r = evaluateLifecycleReadyGuard(input, { projectDir: project, observeGovernanceScopeFn: () => ({ requiresEnforcement: true }) });
  return { exitCode: r.exitCode, text: String(r.stderr ?? "") };
};
// Refused AND for the stated reason: a typed read-scope/target refusal code, never a bare exit 2 from some other cause.
// Restated 2026-10-23 (QG-04, K141-FULL-VERIFY-RED-CLASSIFY): a native read of a credential file carries the typed GUARD-READ-CREDENTIAL-TARGET (31aec2de2).
const REFUSAL_CODE = /GUARD-READ-SCOPE-OUTSIDE-ROOT|GUARD-READ-TARGET|GUARD-READ-CREDENTIAL-TARGET/u;
const assertRefused = (input, project, label) => {
  const r = verdict(input, project);
  assert.equal(r.exitCode, 2, `${label}\n${r.text}`);
  assert.match(r.text, REFUSAL_CODE, `${label} refused for the wrong reason\n${r.text}`);
};

// MEASURED (08B): an outside-root target inside a bounded pipeline (`cat X | head -n N`, `rg ... | head`) is refused with
// GUARD-OPERATOR-UNAPPROVED, not the single-read read-scope code. Still a refusal (exit 2, correct for a credential), but the
// diagnostic differs from the single form; identical diagnostics are part of P2 and are held below.
const BOUNDED_REFUSAL_CODE = /GUARD-OPERATOR-UNAPPROVED|GUARD-READ-SCOPE-OUTSIDE-ROOT|GUARD-READ-TARGET/u;
const assertBoundedRefused = (input, project, label) => {
  const r = verdict(input, project);
  assert.equal(r.exitCode, 2, `${label}\n${r.text}`);
  assert.match(r.text, BOUNDED_REFUSAL_CODE, `${label} refused for the wrong reason\n${r.text}`);
};

test("baseline precondition: credential reads under the protected fake home are refused with the typed code (fixture is honest)", () => withFixture((f) => {
  assertRefused(bash(`cat ${fwd(join(f.home, ".ssh", "id_rsa"))}`), f.project, "cat id_rsa");
  assertRefused(bash("cat ~/.ssh/id_rsa"), f.project, "cat ~/.ssh/id_rsa");
  assertRefused(readTool(join(f.home, ".codex", "auth.json")), f.project, "Read auth.json");
  // Control: an in-project read is admitted, so the refusals above are scope decisions, not a dead guard.
  assert.equal(verdict(bash("cat docs/state.md"), f.project).exitCode, 0);
}));

// Restated 2026-10-30 (QG-04, D96/D108/D210): the NATIVE HOLD on P1/P1b/P2 is lifted because the carrier now exists
// (lib/host-skill-catalog.mjs); each case runs on a catalog written by the REAL host readback, never a hand-built one.
test("P1 a declared openai-docs skill is read through ordinary read actions with no PO-signature route: the instruction file and a bounded search inside its own directory", () => withFixture((f) => {
  for (const input of [bash(`cat ${fwd(f.skill)}`), readTool(f.skill)]) {
    const r = verdict(input, f.project);
    assert.equal(r.exitCode, 0, `${JSON.stringify(input)}\n${r.text}`);
  }
  // The catalog-specific admission: a recursive search/listing inside the declared directory (refused by D108 without a catalog entry).
  for (const command of [`rg -n reference ${fwd(f.skillDir)}`, `rg --files ${fwd(f.skillDir)}`, `rg -n reference ${fwd(join(f.skillDir, "references"))}`]) {
    const r = verdict(bash(command), f.project);
    assert.equal(r.exitCode, 0, `${command}\n${r.text}`);
    assert.doesNotMatch(r.text, /GUARD-/u);
  }
}, { declare: true }));

test("P1b an ordinary route exists after a refusal: the undeclared skill directory search is refused with the typed code while its instruction file reads normally, and the declared directory search needs no override", () => withFixture((f) => {
  // Restated (D210): the route is shown behaviourally. Refusal text lives in grammar-denials.mjs (out of this slice).
  const refused = verdict(bash(`rg -n undeclared ${fwd(f.otherDir)}`), f.project);
  assert.equal(refused.exitCode, 2, refused.text);
  assert.match(refused.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  const route = verdict(bash(`cat ${fwd(f.other)}`), f.project);
  assert.equal(route.exitCode, 0, `the ordinary route: read the instruction file by its own name\n${route.text}`);
  assert.equal(verdict(bash(`rg -n reference ${fwd(f.skillDir)}`), f.project).exitCode, 0, "declared directory search, no override");
}, { declare: true }));

test("P1c without a catalog entry (no readback yet) the declared directory search keeps the D108 refusal and the single read stays admitted", () => withFixture((f) => {
  const refused = verdict(bash(`rg -n reference ${fwd(f.skillDir)}`), f.project);
  assert.equal(refused.exitCode, 2, refused.text);
  assert.match(refused.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  assert.equal(verdict(bash(`cat ${fwd(f.skill)}`), f.project).exitCode, 0);
}));

test("P2 single and bounded diagnostic reads of the declared skill get identical admission", () => withFixture((f) => {
  const file = fwd(f.skill);
  const forms = [
    `cat ${file}`, `cat ${file} | head -n 5`, `cat ${file} | grep -n line`, `head -n 5 ${file}`, `sed -n 1,2p ${file}`,
    `rg -n line ${file}`, `rg -n line ${file} | head -5`, `grep -n line ${file}`, `grep -n line ${file} | head -5`,
  ];
  const outcomes = forms.map((command) => ({ command, ...verdict(bash(command), f.project) }));
  for (const outcome of outcomes) assert.equal(outcome.exitCode, 0, `${outcome.command}\n${outcome.text}`);
  assert.equal(new Set(outcomes.map((o) => o.text)).size, 1, "identical diagnostics: every admitted form prints the same (empty) text");
  const native = verdict(readTool(f.skill), f.project);
  assert.equal(native.exitCode, 0, native.text);
}, { declare: true }));

test("P2-refusal single and bounded diagnostic forms are refused identically for a credential (parity on the refusal side)", () => withFixture((f) => {
  const target = fwd(join(f.home, ".ssh", "id_rsa"));
  assertRefused(bash(`cat ${target}`), f.project, "single");
  for (const command of [`cat ${target} | head -n 20`, `cat ${target} | grep -n x`, `rg -n x ${target} | head -5`, `grep -n x ${target} | head -5`]) {
    assertBoundedRefused(bash(command), f.project, command);
  }
}));

test("P2-diagnostic the single and the bounded form of the same declared-skill operation carry the identical diagnostic: admitted for the file, the same typed refusal for the undeclared directory search", () => withFixture((f) => {
  // Restated (D210): the bounded forms of an ADMITTED skill read do not surface GUARD-OPERATOR-UNAPPROVED on this source (measured);
  // the diagnostic is identical because there is none. The undeclared directory search is refused by the same typed scope code in
  // the single and in the piped shape. The one remaining asymmetry is for a CREDENTIAL (P2-refusal above: scope code single,
  // GUARD-OPERATOR-UNAPPROVED piped, both exit 2); its label belongs to evaluate.mjs and the NVA-BL-75 override-class corpus.
  const file = fwd(f.skill);
  const single = verdict(bash(`cat ${file}`), f.project);
  const piped = verdict(bash(`cat ${file} | head -n 5`), f.project);
  assert.deepEqual([single.exitCode, single.text], [piped.exitCode, piped.text]);
  assert.equal(single.exitCode, 0);
  const dir = fwd(f.otherDir);
  const singleDir = verdict(bash(`rg -n x ${dir}`), f.project);
  const pipedDir = verdict(bash(`rg -n x ${dir} | head -5`), f.project);
  assert.equal(singleDir.exitCode, 2, singleDir.text);
  assert.equal(pipedDir.exitCode, 2, pipedDir.text);
  assert.match(singleDir.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  assert.match(pipedDir.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
}, { declare: true }));

test("P3a credentials, transcript directory and the skill tree directory stay refused, single and bounded, even with a declaration present", () => withFixture((f) => {
  const catalog = { skills: [{ name: "openai-docs", path: f.skill }] };
  const declared = (input) => ({ ...input, skill_catalog: catalog, hostSkillCatalog: catalog });
  const targets = [
    join(f.home, ".ssh", "id_rsa"),
    join(f.home, ".codex", "auth.json"),
    join(f.home, ".codex", "sessions"),
    join(f.home, ".codex", "skills", ".system"),
  ];
  for (const target of targets) {
    const t = fwd(target);
    assertRefused(declared(bash(`cat ${t}`)), f.project, `cat ${t}`);
    for (const command of [`cat ${t} | head -n 5`, `rg -n x ${t} | head -5`]) {
      assertBoundedRefused(declared(bash(command)), f.project, command);
    }
    assertRefused(declared(readTool(target)), f.project, `Read ${target}`);
  }
}));

test("P3a-unlisted an undeclared sibling SKILL.md, a skill-looking lookalike path and a transcript file are plain outside files (admitted by name, D96/D108) while recursive searches around them stay refused", () => withFixture((f) => {
  // Restated (QG-04; D96/D108/D210): the former "refused (catalog binding)" assertion presumed the catalog was the only route to a
  // read. D96 makes any non-credential single file outside the repository readable; the catalog adds only a bounded search inside a
  // DECLARED directory. The intent "nothing beyond the named file is swept in" is held by the refusals asserted here.
  const lookalike = join(f.base, "elsewhere", ".codex", "skills", ".system", "openai-docs", "SKILL.md");
  mkdirSync(join(lookalike, ".."), { recursive: true });
  writeFileSync(lookalike, "# not declared\n");
  const transcript = join(f.home, ".codex", "sessions", "rollout.jsonl");
  for (const target of [f.other, lookalike, transcript]) {
    assert.equal(verdict(bash(`cat ${fwd(target)}`), f.project).exitCode, 0, `cat ${target}`);
    assert.equal(verdict(readTool(target), f.project).exitCode, 0, `Read ${target}`);
  }
  for (const directory of [f.otherDir, join(f.home, ".codex", "skills", ".system"), join(f.home, ".codex", "skills"), join(f.home, ".codex", "sessions")]) {
    assertRefused(bash(`rg -n x ${fwd(directory)}`), f.project, `recursive search ${directory}`);
  }
}, { declare: true }));

test("P3b traversal and tilde spellings aimed at the skill tree: a single file read resolves to the declared file itself (admitted, D96); a recursive search spelled with traversal stays refused even into the declared directory", () => withFixture((f) => {
  // Restated (QG-04; D96/D210): the single-read spellings reach the same physical file, readable by its own name. The refusal intent
  // moves to the recursive search: a `..` spelling is never accepted as the declared directory, a catalog entry notwithstanding.
  for (const spelling of ["../home/.codex/skills/.system/openai-docs/SKILL.md", "~/.codex/skills/.system/openai-docs/SKILL.md"]) {
    assert.equal(verdict(bash(`cat ${spelling}`), f.project).exitCode, 0, `cat ${spelling}`);
    assert.equal(verdict(readTool(spelling), f.project).exitCode, 0, `Read ${spelling}`);
  }
  for (const spelling of ["../home/.codex/skills/.system/openai-docs", `${fwd(f.skillDir)}/references/..`, `${fwd(f.skillDir)}/../undeclared-skill`]) {
    assertRefused(bash(`rg -n x ${spelling}`), f.project, `rg -n x ${spelling}`);
  }
}, { declare: true }));

test("P3b-credential traversal and tilde spellings aimed at a credential stay refused", () => withFixture((f) => {
  for (const spelling of ["../home/.ssh/id_rsa", "~/.ssh/id_rsa", "~/.codex/auth.json"]) {
    assertRefused(bash(`cat ${spelling}`), f.project, `cat ${spelling}`);
    assertBoundedRefused(bash(`cat ${spelling} | head -n 5`), f.project, `piped ${spelling}`);
    assertRefused(readTool(spelling), f.project, `Read ${spelling}`);
  }
}));

test("P3c a symlink alias inside the project pointing at the declared skill tree stays refused", {
  skip: WIN && HOST_LIMITATION,
}, () => withFixture((f) => {
  const alias = join(f.project, "skill-alias");
  symlinkSync(join(f.home, ".codex", "skills", ".system", "openai-docs"), alias, "dir");
  assert.equal(verdict(bash(`cat ${fwd(join(alias, "SKILL.md"))}`), f.project).exitCode, 2);
  assert.equal(verdict(bash("cat skill-alias/SKILL.md"), f.project).exitCode, 2);
  assert.equal(verdict(readTool(join(alias, "SKILL.md")), f.project).exitCode, 2);
}));

test("P3d a forged declaration naming a credential file never admits it", () => withFixture((f) => {
  const id = join(f.home, ".ssh", "id_rsa");
  const catalog = { skills: [{ name: "openai-docs", path: id }] };
  assertRefused({ ...bash(`cat ${fwd(id)}`), skill_catalog: catalog, hostSkillCatalog: catalog }, f.project, "forged declaration");
}));

test("P4 the in-project read boundary and the typed credential refusal stay intact at the lifecycle boundary", () => withFixture((f) => {
  assert.equal(verdict(bash("cat docs/state.md"), f.project).exitCode, 0, "ordinary in-project read still admitted");
  assertRefused(bash(`cat ${fwd(join(f.home, ".ssh", "id_rsa"))}`), f.project, "outside-root credential keeps its typed refusal");
}));

test("P4-unrelated an undeclared outside-root skill keeps the typed outside-root refusal for the directory search while its file reads by name (D96, catalog present)", () => withFixture((f) => {
  // Restated (QG-04; D96/D210): the file itself is admitted by the generic host-visible rule; the typed scope refusal now
  // belongs to the directory search, which the catalog does not extend to a skill it never declared.
  assert.equal(verdict(bash(`cat ${fwd(f.other)}`), f.project).exitCode, 0);
  const r = verdict(bash(`rg -n undeclared ${fwd(f.otherDir)}`), f.project);
  assert.equal(r.exitCode, 2);
  assert.match(r.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
}, { declare: true }));

test("P3c-declared a project-local alias into the DECLARED skill directory stays refused even with a valid catalog entry", { skip: WIN && HOST_LIMITATION }, () => withFixture((f) => {
  const alias = join(f.project, "skill-alias");
  symlinkSync(f.skillDir, alias, "dir");
  assert.equal(verdict(bash("rg -n x skill-alias"), f.project).exitCode, 2);
  assert.equal(verdict(bash(`rg -n x ${fwd(alias)}`), f.project).exitCode, 2);
  assert.equal(verdict(bash("cat skill-alias/SKILL.md"), f.project).exitCode, 2);
}, { declare: true }));

test("P5 drift: a replaced declared instruction file invalidates the catalog entry, the directory search is refused again and the file still reads by name", () => withFixture((f) => {
  assert.equal(verdict(bash(`rg -n reference ${fwd(f.skillDir)}`), f.project).exitCode, 0, "baseline: declared");
  writeFileSync(f.skill, "# replaced content\n");
  const r = verdict(bash(`rg -n reference ${fwd(f.skillDir)}`), f.project);
  assert.equal(r.exitCode, 2, r.text);
  assert.match(r.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  assert.equal(verdict(bash(`cat ${fwd(f.skill)}`), f.project).exitCode, 0);
  // The next host readback re-observes the new identity and restores the binding.
  assert.equal(writeHostSkillCatalog({ rootDir: f.project, runner: "codex", homeDir: f.home }).status, "written");
  assert.equal(verdict(bash(`rg -n reference ${fwd(f.skillDir)}`), f.project).exitCode, 0);
}, { declare: true }));

test("P5b a forged or hand-edited catalog record binds nothing and a catalog handed in the tool input is ignored", () => withFixture((f) => {
  const file = hostSkillCatalogRecordPath(resolveGitCommonDir(f.project), "codex");
  const record = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...record, entries: [{ ...record.entries[0], name: "forged" }] }));
  chmodSync(file, 0o600);
  const refused = verdict(bash(`rg -n reference ${fwd(f.skillDir)}`), f.project);
  assert.equal(refused.exitCode, 2, refused.text);
  assert.match(refused.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  const inputCatalog = { skills: [{ name: "openai-docs", path: f.skill }] };
  const stillRefused = verdict({ ...bash(`rg -n reference ${fwd(f.skillDir)}`), skill_catalog: inputCatalog, hostSkillCatalog: inputCatalog }, f.project);
  assert.equal(stillRefused.exitCode, 2, stillRefused.text);
}, { declare: true }));
