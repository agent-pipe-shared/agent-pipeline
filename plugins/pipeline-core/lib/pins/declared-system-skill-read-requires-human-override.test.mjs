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
// RESTATED TO THE D96 PREMISE (QG-04; K86-PIN-RESTATEMENTS, 2026-10-23). PO decision D96 (2026-10-22): reading outside the
// repository is generally allowed except credentials, runner-neutral, built in commit 5b3990a37 (passive-read-policy.mjs).
// PO decision D108 (2026-10-22): the runner session and skill collections (.codex/sessions, .codex/skills, .claude/projects)
// keep one private exception, recursive directory searches over them stay refused, "single files there read like any other
// file outside". This pin used to hold A2 (unlisted/transcript/traversal refused), A3 and A4 behind a NATIVE HOLD skip
// because they presumed a host-catalog authority as the ONLY route to the read; D96 removed that premise, so each case now
// proves the ORIGINAL claim under the decided premise (the credential and directory-search intent of A2 stays asserted):
//   * A1: a declared SKILL.md is read by its own physical name with no override and no catalog binding (generic rule).
//   * A2: credentials, credential traversals, directory listings and RECURSIVE searches over the skill and session trees,
//     and an alias that escapes into the skill tree stay refused; a single unlisted/lookalike/transcript file is a plain
//     outside file and is now admitted (D96/D108), asserted as admitted so the premise change is visible.
//   * A3: no catalog-bound read authority exists (sessionReadScopeRoots binds no skill path), so a replaced file identity
//     cannot leave a stale authority behind and the read decision is made per call on the physical file.
//   * A4: the route is real guard code, not a static skill allowlist or a synthetic catalog (source scan).
// NOT PROVEN BY THIS PIN (stays with the item, deferred past 0.7.0, D57 Q3 / D63): the installed Codex host readback of the
// actual route and the authenticated host-catalog identity half. No case here claims them.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { sessionReadScopeRoots } from "../guard/read-scope.mjs";

// Host fact: fixtures live under the repository scratch/, never the OS temp dir.
const SCRATCH_ROOT = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const WIN = process.platform === "win32";
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
  // Restated 2026-10-23 (QG-04, K141-FULL-VERIFY-RED-CLASSIFY): a native read of a credential file now carries the typed
  // GUARD-READ-CREDENTIAL-TARGET code (31aec2de2); GUARD-READ-TARGET stays the code for other targets.
  assert.match(viaRead.text, /GUARD-READ-CREDENTIAL-TARGET/u);
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

test("A2a-unlisted an undeclared sibling SKILL.md and a skill-looking lookalike path are plain outside files: admitted by their physical name (D96/D108), while a recursive search over the skill tree stays refused", () => withFixture((f) => {
  // QG-04 restatement, bounded to D96 + D108 (PO 2026-10-22, built in 5b3990a37): the former "refused (catalog binding)" assertion
  // presumed a host-catalog authority as the only route; D96 makes any non-credential single file outside the repository readable.
  // The intent of the original claim (nothing beyond the named file is swept in) is kept by the recursive-search refusal below.
  const lookalike = join(f.base, "elsewhere", ".codex", "skills", ".system", "skill-creator", "SKILL.md");
  mkdirSync(join(lookalike, ".."), { recursive: true });
  writeFileSync(lookalike, "# not declared\n");
  for (const target of [f.other, lookalike]) {
    for (const input of [bash(`cat ${fwd(target)}`), readTool(target)]) {
      const r = verdict(input, f.project);
      assert.equal(r.exitCode, 0, `${JSON.stringify(input)}\n${r.text}`);
    }
  }
  const search = verdict(bash(`rg -n skill ${fwd(join(f.home, ".codex", "skills"))}`), f.project);
  assert.equal(search.exitCode, 2, `recursive search over the skill tree (D108)\n${search.text}`);
  assert.match(search.text, /GUARD-READ/u, "refused by the read boundary, not by an unrelated grammar rule");
}));

test("A2a-transcript a transcript file under the fake home is a plain outside file (D96/D108) while a recursive search over the session tree stays refused", () => withFixture((f) => {
  // QG-04 restatement, bounded to D108: "single files there read like any other file outside"; only recursive directory
  // searches over .codex/sessions stay refused. The directory listing refusal is held by case A2a above.
  const transcript = join(f.home, ".codex", "sessions", "rollout.jsonl");
  for (const input of [bash(`cat ${fwd(transcript)}`), readTool(transcript)]) {
    const r = verdict(input, f.project);
    assert.equal(r.exitCode, 0, `${JSON.stringify(input)}\n${r.text}`);
  }
  const search = verdict(bash(`rg -n rollout ${fwd(join(f.home, ".codex", "sessions"))}`), f.project);
  assert.equal(search.exitCode, 2, `recursive search over the session tree (D108)\n${search.text}`);
  assert.match(search.text, /GUARD-READ/u, "refused by the read boundary, not by an unrelated grammar rule");
}));

test("A2b traversal and tilde spellings aimed at the skill tree reach the same physical declared file (admitted, D96); the same spellings aimed at credentials stay refused", () => withFixture((f) => {
  // QG-04 restatement, bounded to D96: the spellings resolve to the declared file itself, which is readable by its own name.
  // The refusal intent is kept on the credential file beside it, in the same two spellings, through both tools.
  const skillSpellings = ["../home/.codex/skills/.system/skill-creator/SKILL.md", "~/.codex/skills/.system/skill-creator/SKILL.md"];
  for (const spelling of skillSpellings) {
    assert.equal(verdict(bash(`cat ${spelling}`), f.project).exitCode, 0, `cat ${spelling}`);
    assert.equal(verdict(readTool(spelling), f.project).exitCode, 0, `Read ${spelling}`);
  }
  for (const spelling of ["../home/.ssh/id_rsa", "~/.ssh/id_rsa", "../home/.codex/auth.json", "~/.codex/auth.json"]) {
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

test("A3 no catalog-bound read authority exists to go stale: a skill catalog handed to the session read roots binds nothing, and a replaced or removed declared file is judged per call on the physical file (D96)", () => withFixture((f) => {
  // QG-04 restatement, bounded to D96: the original claim (a drifting catalog/file identity must not leave a standing read
  // authority) is met by there being no standing authority at all. The authenticated host-catalog identity half stays
  // with the deferred Codex-host work (D57 Q3 / D63) and is not claimed here.
  const catalog = { skills: [{ name: "skill-creator", path: f.skill }] };
  const input = { tool_input: {}, skill_catalog: catalog, hostSkillCatalog: catalog };
  assert.deepEqual(sessionReadScopeRoots(input), [], "a skill catalog does not widen the session read roots");
  writeFileSync(f.skill, "# replaced content\n");
  assert.deepEqual(sessionReadScopeRoots(input), [], "a replaced file identity leaves no authority behind");
  assert.equal(verdict(readTool(f.skill), f.project).exitCode, 0, "the replaced declared file is still read by its own name");
  rmSync(f.skill);
  const gone = verdict(readTool(f.skill), f.project);
  assert.doesNotMatch(gone.text, /GUARD-READ-SCOPE-OUTSIDE-ROOT/u, "a removed file is not refused as outside the root");
}));

test("A4 the admission route is real guard code, not a static skill allowlist or a synthetic catalog: neither read-boundary module names a skill, a SKILL.md or a catalog", () => {
  // QG-04 restatement, bounded to D96: with no catalog route to prove, the checkable half of "a static allowlist or synthetic
  // catalog alone is insufficient" is that the boundary carries none. The installed-host readback of the actual route is NOT
  // proven here; it stays native-host and deferred past 0.7.0 (item triage 2026-10-17, D57 Q3 / D63).
  for (const rel of ["../guard/read-scope.mjs", "../passive-read-policy.mjs"]) {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    assert.doesNotMatch(src, /SKILL\.md|skill-creator|skill_catalog|hostSkillCatalog/iu, `${rel} must not carry a skill allowlist or catalog`);
  }
});
