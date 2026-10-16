// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item pipeline.declared-system-skill-read-requires-human-override (ALF-C-P21-04 / 04B, AC-147).
// Original acceptance (item "Acceptance" section, four points):
//   A1 a fresh session can read its declared skill-creator instructions through a normal read action, no human override;
//   A2 unlisted system files, credentials, transcript directories and aliases escaping the bound authority stay refused;
//   A3 replaced or drifting catalog/file identities invalidate the read authority;
//   A4 the installed host readback proves the actual route (a static allowlist or synthetic catalog alone is insufficient).
// Every case runs through the real guard (evaluateLifecycleReadyGuard) or the real read-scope module; nothing is mocked
// except the documented observeGovernanceScopeFn enforcement seam.
//
// WORKING FIXTURE RECIPE (04B diagnosis; the sibling P21-08 pin reuses it):
//   1. Governance seam: evaluate.mjs returns allow (exit 0) for EVERY read unless observeGovernanceScope reports
//      requiresEnforcement. A scratch directory is not an enrolled project, so pass
//      { projectDir, observeGovernanceScopeFn: () => ({ requiresEnforcement: true }) } to evaluateLifecycleReadyGuard.
//      The project root the guard uses is dependencies.projectDir (else CLAUDE_PROJECT_DIR, else cwd); with projectDir
//      given, the fixture project (not the enclosing real repository) is the root.
//   2. Containment (incident 2026-10-16): `git init` the fixture project FIRST and run every git call, including the
//      guard's in-process ones, with GIT_CEILING_DIRECTORIES = the absolute fixture base (the parent of the fixture root).
//   3. Protected home: passive-read-policy.mjs protects homeRelativePaths (.ssh, .codex/auth.json, ...) under homedir()
//      (USERPROFILE on win32, HOME elsewhere). A fake home is therefore only meaningful when HOME and USERPROFILE point at
//      it for the duration of the call; the guard runs in-process, so both variables are set, then restored in finally.
//   4. Precondition (case "baseline"): an undeclared credential read under the fake home must be REFUSED before any other
//      case counts. Without step 3 the fake credentials are an ordinary host-visible path and a read is admitted (vacuous).
//
// FINDINGS (measured on this source, honest per point):
//   * Outside-root, host-visible, non-credential files (any SKILL.md under the fake home, traversal and tilde spellings,
//     lookalikes) are ADMITTED today by the generic isAllowedPassiveReadTarget rule (userVisibleHostPath), with no catalog
//     binding at all. A1 therefore holds today by accident of the generic rule, not by a declared-skill authority.
//   * The "unlisted/lookalike/traversal stays refused" half of A2 cannot hold without a host-catalog authority, and A3/A4
//     need the authenticated host catalog producer. That producer is Codex-held and unavailable: NATIVE HOLD
//     (owner Coordinator). Refusal-preserving points (credentials, transcript/skill-tree directory listings, session
//     read roots) are real GREEN assertions.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { sessionReadScopeRoots } from "../guard/read-scope.mjs";

// Host fact: fixtures live under the repository scratch/, never the OS temp dir.
const SCRATCH_ROOT = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const WIN = process.platform === "win32";
const NATIVE_HOLD = "native hold: host-catalog producer unavailable (Codex-held); owner Coordinator";
const fwd = (p) => p.replaceAll("\\", "/");
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const readTool = (file_path) => ({ tool_name: "Read", tool_input: { file_path } });

// A project root (own git root) and a sibling fake "home" holding .codex/skills/.system/<skill>/SKILL.md.
function fixture() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const base = realpathSync(mkdtempSync(join(SCRATCH_ROOT, "alf-c-p21-04-")));
  const project = join(base, "project");
  const home = join(base, "home");
  mkdirSync(project, { recursive: true });
  const gitEnv = { ...process.env, GIT_CEILING_DIRECTORIES: base };
  execFileSync("git", ["init", "-q", project], { env: gitEnv });
  mkdirSync(join(project, ".claude"), { recursive: true });
  mkdirSync(join(project, ".agent-pipeline"), { recursive: true });
  mkdirSync(join(project, "docs"), { recursive: true });
  writeFileSync(join(project, "docs", "state.md"), "# state\n");
  writeFileSync(join(project, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  const skillDir = join(home, ".codex", "skills", ".system", "skill-creator");
  const otherDir = join(home, ".codex", "skills", ".system", "undeclared-skill");
  mkdirSync(skillDir, { recursive: true });
  mkdirSync(otherDir, { recursive: true });
  mkdirSync(join(home, ".ssh"), { recursive: true });
  mkdirSync(join(home, ".codex", "sessions"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "# skill-creator\n");
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
const refusedBoth = (target, project, label) => {
  const viaBash = verdict(bash(`cat ${fwd(target)}`), project);
  assert.equal(viaBash.exitCode, 2, `cat ${label ?? target}\n${viaBash.text}`);
  const viaRead = verdict(readTool(target), project);
  assert.equal(viaRead.exitCode, 2, `Read ${label ?? target}\n${viaRead.text}`);
};

test("baseline precondition: credential reads under the protected fake home are refused with the typed code (fixture is honest)", () => withFixture((f) => {
  const viaBash = verdict(bash(`cat ${fwd(join(f.home, ".ssh", "id_rsa"))}`), f.project);
  assert.equal(viaBash.exitCode, 2, viaBash.text);
  assert.match(viaBash.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  const viaTilde = verdict(bash("cat ~/.ssh/id_rsa"), f.project);
  assert.equal(viaTilde.exitCode, 2, viaTilde.text);
  assert.match(viaTilde.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  const viaRead = verdict(readTool(join(f.home, ".codex", "auth.json")), f.project);
  assert.equal(viaRead.exitCode, 2, viaRead.text);
  assert.match(viaRead.text, /GUARD-READ-TARGET/u);
  // Control: an in-project read is still admitted, so the refusals above are scope decisions, not a dead guard.
  assert.equal(verdict(bash("cat docs/state.md"), f.project).exitCode, 0);
}));

test("A1 a declared skill-creator SKILL.md is read through a normal read action with no human override (admitted today by the generic host-visible rule, not by a catalog)", () => withFixture((f) => {
  for (const input of [bash(`cat ${fwd(f.skill)}`), bash(`head -n 40 ${fwd(f.skill)}`), readTool(f.skill)]) {
    const r = verdict(input, f.project);
    assert.equal(r.exitCode, 0, `${JSON.stringify(input)}\n${r.text}`);
    assert.doesNotMatch(r.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u);
  }
}));

test("A2a credentials, transcript directory and the skill tree directory beside the declared skill stay refused", () => withFixture((f) => {
  refusedBoth(join(f.home, ".ssh", "id_rsa"), f.project);
  refusedBoth(join(f.home, ".codex", "auth.json"), f.project);
  // Directory listings of the transcript directory and of the skill tree are refused (no directory read lane).
  refusedBoth(join(f.home, ".codex", "sessions"), f.project);
  refusedBoth(join(f.home, ".codex", "skills", ".system"), f.project);
}));

test("A2a-unlisted an undeclared sibling SKILL.md and a skill-looking lookalike path are refused (catalog binding)", {
  skip: NATIVE_HOLD + "; today any host-visible non-credential file is admitted without catalog binding",
}, () => withFixture((f) => {
  const lookalike = join(f.base, "elsewhere", ".codex", "skills", ".system", "skill-creator", "SKILL.md");
  mkdirSync(join(lookalike, ".."), { recursive: true });
  writeFileSync(lookalike, "# not declared\n");
  refusedBoth(f.other, f.project);
  refusedBoth(lookalike, f.project);
}));

test("A2a-transcript a transcript file under the fake home is refused (catalog binding)", {
  skip: NATIVE_HOLD + "; the transcript file is only protected as a directory listing today",
}, () => withFixture((f) => {
  refusedBoth(join(f.home, ".codex", "sessions", "rollout.jsonl"), f.project);
}));

test("A2b traversal and tilde spellings aimed at the skill tree are refused (catalog binding)", {
  skip: NATIVE_HOLD + "; traversal/tilde spellings resolve to the same admitted host-visible file today",
}, () => withFixture((f) => {
  const traversal = "../home/.codex/skills/.system/skill-creator/SKILL.md";
  const tilde = "~/.codex/skills/.system/skill-creator/SKILL.md";
  for (const spelling of [traversal, tilde]) {
    assert.equal(verdict(bash(`cat ${spelling}`), f.project).exitCode, 2, `cat ${spelling}`);
    assert.equal(verdict(readTool(spelling), f.project).exitCode, 2, `Read ${spelling}`);
  }
}));

test("A2b-roots the session-derived read roots do not silently widen to the skill tree", () => {
  assert.deepEqual(sessionReadScopeRoots({ tool_input: {} }), []);
});

test("A2c a symlink alias inside the project pointing at the skill tree stays refused", {
  skip: WIN && "typed host limitation: directory symlinks unavailable on this native Windows host; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)",
}, () => withFixture((f) => {
  const alias = join(f.project, "skill-alias");
  symlinkSync(join(f.home, ".codex", "skills", ".system", "skill-creator"), alias, "dir");
  const target = join(alias, "SKILL.md");
  assert.equal(verdict(bash(`cat ${fwd(target)}`), f.project).exitCode, 2);
  assert.equal(verdict(bash("cat skill-alias/SKILL.md"), f.project).exitCode, 2);
  assert.equal(verdict(readTool(target), f.project).exitCode, 2);
}));

test("A3 a replaced or drifting catalog/file identity invalidates the read authority", {
  skip: NATIVE_HOLD + "; no catalog-bound authority seam exists in sessionReadScopeRoots (A3 held)",
}, () => withFixture((f) => {
  const catalog = { skills: [{ name: "skill-creator", path: f.skill }] };
  const input = { tool_input: {}, skill_catalog: catalog, hostSkillCatalog: catalog };
  const before = sessionReadScopeRoots(input);
  assert.ok(before.some((r) => r.endsWith("SKILL.md")), "declared skill file is bound into the read authorities");
  writeFileSync(f.skill, "# replaced content\n");
  const after = sessionReadScopeRoots(input);
  assert.ok(!after.some((r) => r.endsWith("SKILL.md")), "a replaced file identity invalidates the authority");
}));

test("A4 the actual host-catalog route exists in the read boundary source, not only a static allowlist", {
  skip: NATIVE_HOLD + "; the authenticated host catalog entry/custody route is unavailable (A4 held)",
}, () => {
  assert.fail("held: requires the authenticated host catalog producer");
});
