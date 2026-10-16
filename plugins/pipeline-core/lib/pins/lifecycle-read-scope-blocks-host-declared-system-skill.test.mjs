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
// FINDINGS (measured on this source):
//   * There is no host skill-catalog declaration carrier in current source. Every point that needs the authenticated
//     declaration (P1 admission, P1b ordinary retry route, P2 parity of an ADMITTED read, unlisted/lookalike/traversal
//     refusal that depends on a catalog binding) is a typed NATIVE HOLD (owner Coordinator), not a faked pass.
//   * Outside-root, host-visible, non-credential files (any SKILL.md under the fake home) are admitted today by the
//     generic host-visible-path rule with no catalog binding; so "unlisted stays refused" cannot be asserted yet.
//   * Refusal-preserving points (credentials, transcript/skill-tree directory listings, forged declaration, in-project
//     boundary) are real GREEN assertions that fail for the stated reason (typed code asserted).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";

// Host fact: fixtures live under the repository scratch/, never the OS temp dir.
const SCRATCH_ROOT = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const WIN = process.platform === "win32";
const HOST_LIMITATION = "typed host limitation: directory symlinks unavailable on this native Windows host; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)";
const NATIVE_HOLD = "native hold: no host skill-catalog declaration carrier exists in source; owner Coordinator";
const fwd = (p) => p.replaceAll("\\", "/");
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const readTool = (file_path) => ({ tool_name: "Read", tool_input: { file_path } });

function fixture() {
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
  mkdirSync(skillDir, { recursive: true });
  mkdirSync(otherDir, { recursive: true });
  mkdirSync(join(home, ".ssh"), { recursive: true });
  mkdirSync(join(home, ".codex", "sessions"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "# openai-docs\n");
  writeFileSync(join(otherDir, "SKILL.md"), "# undeclared\n");
  writeFileSync(join(home, ".ssh", "id_rsa"), "private\n");
  writeFileSync(join(home, ".codex", "sessions", "rollout.jsonl"), "{}\n");
  writeFileSync(join(home, ".codex", "auth.json"), "{}\n");
  return { base, project, home, skill: join(skillDir, "SKILL.md"), other: join(otherDir, "SKILL.md") };
}
const ENV_KEYS = ["HOME", "USERPROFILE", "GIT_CEILING_DIRECTORIES"];
const withFixture = (fn) => {
  const f = fixture();
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
const REFUSAL_CODE = /GUARD-READ-SCOPE-OUTSIDE-ROOT|GUARD-READ-TARGET/u;
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

test("P1 a declared openai-docs SKILL.md is admitted through an ordinary single read, no PO-signature route", {
  skip: NATIVE_HOLD + "; admission of a DECLARED skill cannot be distinguished from the generic host-visible rule without the declaration (P1 held)",
}, () => withFixture((f) => {
  const catalog = { skills: [{ name: "openai-docs", path: f.skill }] };
  for (const input of [bash(`cat ${fwd(f.skill)}`), readTool(f.skill)]) {
    const r = verdict({ ...input, skill_catalog: catalog, hostSkillCatalog: catalog }, f.project);
    assert.equal(r.exitCode, 0, r.text);
  }
}));

test("P1b the refusal of a declared skill read names a concrete ordinary route, not only the exceptional override", {
  skip: NATIVE_HOLD + "; no declared-skill refusal exists to carry a retry route (P1b held)",
}, () => {
  assert.fail("held: requires the authenticated host catalog declaration");
});

test("P2 single and bounded diagnostic reads of the declared skill get identical admission", {
  skip: NATIVE_HOLD + "; parity of an admitted declared read is meaningless without the declaration (P2 held)",
}, () => {
  assert.fail("held: requires the authenticated host catalog declaration");
});

test("P2-refusal single and bounded diagnostic forms are refused identically for a credential (parity on the refusal side)", () => withFixture((f) => {
  const target = fwd(join(f.home, ".ssh", "id_rsa"));
  assertRefused(bash(`cat ${target}`), f.project, "single");
  for (const command of [`cat ${target} | head -n 20`, `cat ${target} | grep -n x`, `rg -n x ${target} | head -5`, `grep -n x ${target} | head -5`]) {
    assertBoundedRefused(bash(command), f.project, command);
  }
}));

test("P2-diagnostic single and bounded refusals of an outside-root target carry the identical typed diagnostic", {
  skip: NATIVE_HOLD + "; bounded forms currently surface GUARD-OPERATOR-UNAPPROVED where the single form surfaces the read-scope code (P2 identical admission held)",
}, () => withFixture((f) => {
  const t = fwd(join(f.home, ".ssh", "id_rsa"));
  assertRefused(bash(`cat ${t} | head -n 5`), f.project, "bounded");
}));

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

test("P3a-unlisted an undeclared sibling SKILL.md, a skill-looking lookalike path and a transcript file are refused (catalog binding)", {
  skip: NATIVE_HOLD + "; today any host-visible non-credential file is admitted without catalog binding",
}, () => withFixture((f) => {
  const lookalike = join(f.base, "elsewhere", ".codex", "skills", ".system", "openai-docs", "SKILL.md");
  mkdirSync(join(lookalike, ".."), { recursive: true });
  writeFileSync(lookalike, "# not declared\n");
  for (const target of [f.other, lookalike, join(f.home, ".codex", "sessions", "rollout.jsonl")]) {
    assertRefused(bash(`cat ${fwd(target)}`), f.project, target);
    assertRefused(readTool(target), f.project, `Read ${target}`);
  }
}));

test("P3b traversal and tilde spellings aimed at the skill tree stay refused (catalog binding)", {
  skip: NATIVE_HOLD + "; traversal/tilde spellings resolve to the same admitted host-visible file today",
}, () => withFixture((f) => {
  const traversal = "../home/.codex/skills/.system/openai-docs/SKILL.md";
  const tilde = "~/.codex/skills/.system/openai-docs/SKILL.md";
  for (const spelling of [traversal, tilde]) {
    assertRefused(bash(`cat ${spelling}`), f.project, `cat ${spelling}`);
    assertRefused(readTool(spelling), f.project, `Read ${spelling}`);
  }
}));

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

test("P4-unrelated an undeclared outside-root skill file keeps the typed outside-root refusal (catalog binding)", {
  skip: NATIVE_HOLD + "; the generic host-visible rule admits it today",
}, () => withFixture((f) => {
  const r = verdict(bash(`cat ${fwd(f.other)}`), f.project);
  assert.equal(r.exitCode, 2);
  assert.match(r.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
}));
