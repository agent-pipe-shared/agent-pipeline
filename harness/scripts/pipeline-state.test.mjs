#!/usr/bin/env node
/**
 * pipeline-state.test.mjs — behavior tests for the sanctioned pipeline-state.mjs
 * writer CLI (AP1-P3 "DURIN").
 *
 * Run: node harness/scripts/pipeline-state.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Two layers: (a) in-process calls against `run()` with injected {dir, now, gitHead}
 * (fast, no real git/process spawn needed for most cases), (b) one real-git-repo case
 * for `approve-push` end to end (spawnSync the actual CLI as a subprocess, mirroring
 * how a Goldfish/Elephant would invoke it).
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { run, readState, statePath, SCHEMA_ID } from "./pipeline-state.mjs";
import { loadManifestSafe } from "../../plugins/pipeline-core/lib/manifest.mjs";
import { loadStateSafe, resolveSuggestion } from "../../plugins/pipeline-core/hooks/stop-suggest.mjs";

const CLI = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
const ALL_DIRS = [];
function freshDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `pipeline-state-${prefix}-`));
  ALL_DIRS.push(dir);
  return dir;
}

let pass = 0;
const failures = [];
function ok(id, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}${detail ? `: ${detail}` : ""}`);
    console.log(`FAIL  ${id}${detail ? ` -- ${detail}` : ""}`);
  }
}

const FIXED_NOW = () => "2026-07-07T21:00:00.000Z";
const FIXED_GIT_HEAD = () => ({ ok: true, commit: "abc123deadbeef" });

// ---- PS01: approve-plan without --by is refused, nothing written ----------------------
{
  const dir = freshDir("refuse-approve-no-by");
  const code = run(["approve-plan"], { dir, now: FIXED_NOW });
  ok("PS01a approve-plan without --by refused (exit 2)", code === 2, `got ${code}`);
  ok("PS01b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS02: approve-plan with empty --by is refused -------------------------------------
{
  const dir = freshDir("refuse-approve-empty-by");
  const code = run(["approve-plan", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS02 approve-plan with empty --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS03: revoke-plan without --by is refused -----------------------------------------
{
  const dir = freshDir("refuse-revoke-no-by");
  const code = run(["revoke-plan"], { dir, now: FIXED_NOW });
  ok("PS03 revoke-plan without --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS04: approve-push without --by is refused ----------------------------------------
{
  const dir = freshDir("refuse-push-no-by");
  const code = run(["approve-push"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS04 approve-push without --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS05: malformed pre-existing state file -> English error, exit 2, no overwrite -----
{
  const dir = freshDir("malformed-existing");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), "{ this is not json");
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["set-feature", "--id", "x", "--plan-path", "p.md"], { dir, now: FIXED_NOW });
  ok("PS05a malformed existing file -> exit 2", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS05b file left byte-identical (no silent overwrite)", after === before);
}

// ---- PS06: approve-plan shape correct ---------------------------------------------------
{
  const dir = freshDir("approve-shape");
  run(["set-feature", "--id", "ap1-pipeline-tuning", "--plan-path", ".claude/plans/x.md"], { dir, now: FIXED_NOW });
  const code = run(["approve-plan", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS06a approve-plan exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS06b schema field correct", state.schema === SCHEMA_ID);
  ok("PS06c planApproved true", state.planApproved === true);
  ok(
    "PS06d planApproval shape {approvedBy, approvedAt}",
    state.planApproval?.approvedBy === "po-test" && state.planApproval?.approvedAt === FIXED_NOW(),
  );
  ok("PS06e activeFeature preserved from set-feature", state.activeFeature?.id === "ap1-pipeline-tuning");
}

// ---- PS07: set-feature resets planApproved to false + phase design ---------------------
{
  const dir = freshDir("set-feature-reset");
  run(["set-feature", "--id", "f1", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  run(["approve-plan", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["set-feature", "--id", "f2", "--plan-path", "p2.md"], { dir, now: FIXED_NOW });
  const state = readState(dir).state;
  ok("PS07a new feature resets planApproved=false", state.planApproved === false);
  ok("PS07b phase reset to design (inside activeFeature, F1 fix)", state.activeFeature?.phase === "design");
  ok("PS07c prior planApproval cleared", state.planApproval === undefined);
  ok("PS07d activeFeature reflects the NEW feature", state.activeFeature?.id === "f2");
}

// ---- PS08: revoke-plan sets planApproved=false + records revocation -------------------
{
  const dir = freshDir("revoke");
  run(["set-feature", "--id", "f1", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  run(["approve-plan", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["revoke-plan", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS08a revoke-plan exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS08b planApproved false after revoke", state.planApproved === false);
  ok("PS08c planRevocation recorded", state.planRevocation?.revokedBy === "po-test");
}

// ---- PS09: set-phase updates only phase ------------------------------------------------
{
  const dir = freshDir("set-phase");
  run(["set-feature", "--id", "f1", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  run(["approve-plan", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["set-phase", "--phase", "implementation"], { dir, now: FIXED_NOW });
  ok("PS09a set-phase exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS09b phase updated (inside activeFeature, F1 fix)", state.activeFeature?.phase === "implementation");
  ok("PS09c planApproved untouched", state.planApproved === true);
  ok("PS09d activeFeature id/planPath untouched by set-phase", state.activeFeature?.id === "f1" && state.activeFeature?.planPath === "p1.md");
}

// ---- PS10: approve-push records {approvedBy, approvedAt, forCommit} via injected git --
{
  const dir = freshDir("approve-push-shape");
  const code = run(["approve-push", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS10a approve-push exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS10b pushApproval.lastApproved shape correct",
    state.pushApproval?.lastApproved?.approvedBy === "po-test" &&
      state.pushApproval?.lastApproved?.approvedAt === FIXED_NOW() &&
      state.pushApproval?.lastApproved?.forCommit === "abc123deadbeef",
  );
}

// ---- PS11: approve-push fails cleanly when git rev-parse HEAD fails -------------------
{
  const dir = freshDir("approve-push-no-git");
  const code = run(["approve-push", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    gitHead: () => ({ ok: false, error: "not a git repository" }),
  });
  ok("PS11 approve-push without a resolvable HEAD refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS12: real subprocess invocation end-to-end (real git repo) ----------------------
{
  const dir = freshDir("subprocess-e2e");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();

  const res1 = spawnSync(process.execPath, [CLI, "set-feature", "--id", "e2e", "--plan-path", "p.md"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  ok("PS12a subprocess set-feature exit 0", res1.status === 0, `stderr: ${res1.stderr}`);

  const res2 = spawnSync(process.execPath, [CLI, "approve-plan", "--by", "po-test"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  ok("PS12b subprocess approve-plan exit 0", res2.status === 0, `stderr: ${res2.stderr}`);

  const res3 = spawnSync(process.execPath, [CLI, "approve-push", "--by", "po-test"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  ok("PS12c subprocess approve-push exit 0", res3.status === 0, `stderr: ${res3.stderr}`);

  const finalState = JSON.parse(readFileSync(statePath(dir), "utf8"));
  ok("PS12d final state has planApproved true", finalState.planApproved === true);
  ok("PS12e final state pushApproval.forCommit matches real HEAD", finalState.pushApproval?.lastApproved?.forCommit === head);
  ok("PS12f state file is pretty-printed (contains newline+indent)", readFileSync(statePath(dir), "utf8").includes("\n  "));
}

// ---- PS13: unknown subcommand refused ---------------------------------------------------
{
  const dir = freshDir("unknown-cmd");
  const code = run(["frobnicate"], { dir, now: FIXED_NOW });
  ok("PS13 unknown subcommand refused (exit 2)", code === 2, `got ${code}`);
  ok("PS13b nothing written", !existsSync(statePath(dir)));
}

// ---- PS14: F1 REAL end-to-end integration -- the real CLI subprocess writes the state file,
// stop-suggest.mjs's own real resolver reads it -- this is the exact test class whose absence
// let Finding F1 (specs/2026-07-07-ap1-tuning/e2e-demo.md) ship: pipeline-state.mjs wrote
// `phase` top-level while stop-suggest.mjs reads `activeFeature.phase`, and neither suite
// noticed because both fixtured the SAME (mismatched) shape independently instead of one
// producing real output for the other to consume. Declared here (not in stop-suggest.test.mjs)
// because it exercises pipeline-state.mjs's real CLI as the state-producing half.
{
  const dir = freshDir("f1-integration");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "flags:",
      "  has_ui: false",
      "",
    ].join("\n"),
  );

  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
  const r1 = spawnSync(process.execPath, [CLI, "set-feature", "--id", "f1-integration-test", "--plan-path", ".claude/plans/f1.md"], {
    encoding: "utf8",
    env,
  });
  ok("PS14a F1-integration: real set-feature subprocess exit 0", r1.status === 0, `stderr: ${r1.stderr}`);
  const r2 = spawnSync(process.execPath, [CLI, "approve-plan", "--by", "po-test"], { encoding: "utf8", env });
  ok("PS14b F1-integration: real approve-plan subprocess exit 0", r2.status === 0, `stderr: ${r2.stderr}`);
  const r3 = spawnSync(process.execPath, [CLI, "set-phase", "--phase", "implementation"], { encoding: "utf8", env });
  ok("PS14c F1-integration: real set-phase subprocess exit 0", r3.status === 0, `stderr: ${r3.stderr}`);

  // Feed the REAL resulting file into stop-suggest.mjs's OWN real loader/resolver (not a
  // fixture reconstruction) -- this is the load-bearing cross-check.
  const manifest = loadManifestSafe(dir);
  ok("PS14d F1-integration: real manifest loads ok via stop-suggest's loadManifestSafe", manifest !== null);
  const state = loadStateSafe(statePath(dir));
  ok("PS14e F1-integration: real CLI-written state file loads via stop-suggest's loadStateSafe", state !== null);
  ok(
    "PS14f F1-integration: real state has activeFeature.phase populated (THE F1 bug: this used to be undefined)",
    state?.activeFeature?.phase === "implementation",
    JSON.stringify(state),
  );

  const suggestion = resolveSuggestion(manifest, state);
  ok(
    "PS14g F1-integration: resolveSuggestion produces a NON-EMPTY suggestion against the REAL CLI-written state",
    typeof suggestion === "string" && suggestion.length > 0,
    suggestion,
  );
  ok(
    "PS14h F1-integration: suggestion names the next phase (security-scan)",
    typeof suggestion === "string" && suggestion.includes("security-scan"),
    suggestion,
  );
}

// ---- PS15: close-feature without --by is refused, nothing written ---------------------
{
  const dir = freshDir("close-feature-no-by");
  const code = run(["close-feature"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS15a close-feature without --by refused (exit 2)", code === 2, `got ${code}`);
  ok("PS15b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS16: close-feature with empty --by is refused ------------------------------------
{
  const dir = freshDir("close-feature-empty-by");
  const code = run(["close-feature", "--by", ""], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS16 close-feature with empty --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS17: close-feature without an activeFeature is refused, nothing written ----------
{
  const dir = freshDir("close-feature-no-active");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS17a close-feature without activeFeature refused (exit 2)", code === 2, `got ${code}`);
  ok("PS17b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS18: close-feature with an activeFeature -- full shape assertion -----------------
{
  const dir = freshDir("close-feature-shape");
  run(["set-feature", "--id", "f-close", "--plan-path", "p-close.md"], { dir, now: FIXED_NOW });
  run(["approve-plan", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["approve-push", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS18a close-feature exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS18b activeFeature removed", state.activeFeature === undefined);
  ok("PS18c planApproved false", state.planApproved === false);
  ok("PS18d planApproval cleared", state.planApproval === undefined);
  ok("PS18e planRevocation cleared", state.planRevocation === undefined);
  ok(
    "PS18f closedFeatures[0] shape correct",
    state.closedFeatures?.length === 1 &&
      state.closedFeatures[0].id === "f-close" &&
      state.closedFeatures[0].planPath === "p-close.md" &&
      state.closedFeatures[0].phaseAtClose === "design" &&
      state.closedFeatures[0].closedAt === FIXED_NOW() &&
      state.closedFeatures[0].closedBy === "po-test" &&
      state.closedFeatures[0].forCommit === "abc123deadbeef",
    JSON.stringify(state.closedFeatures),
  );
  ok("PS18g pushApproval preserved", state.pushApproval?.lastApproved?.forCommit === "abc123deadbeef");
}

// ---- PS19: close-feature best-effort on a git failure (DEVIATION vs. approve-push) -----
{
  const dir = freshDir("close-feature-git-error");
  run(["set-feature", "--id", "f-git-err", "--plan-path", "p.md"], { dir, now: FIXED_NOW });
  const code = run(["close-feature", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    gitHead: () => ({ ok: false, error: "not a git repository" }),
  });
  ok("PS19a close-feature with unresolvable git HEAD still exits 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS19b forCommit null on git failure", state.closedFeatures?.[0]?.forCommit === null);
  ok("PS19c activeFeature still removed despite git failure", state.activeFeature === undefined);
}

// ---- PS20: close-feature appends -- prior closedFeatures entries are preserved ---------
{
  const dir = freshDir("close-feature-append");
  run(["set-feature", "--id", "f-first", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  run(["set-feature", "--id", "f-second", "--plan-path", "p2.md"], { dir, now: FIXED_NOW });
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS20a second close-feature exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS20b closedFeatures length 2", state.closedFeatures?.length === 2, JSON.stringify(state.closedFeatures));
  ok("PS20c first closedFeatures entry unchanged", state.closedFeatures?.[0]?.id === "f-first");
  ok("PS20d second closedFeatures entry appended", state.closedFeatures?.[1]?.id === "f-second");
}

// ---- PS21: close-feature silences the stop-suggest nudge (no activeFeature -> null) ----
{
  const dir = freshDir("close-feature-nudge-silence");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "flags:",
      "  has_ui: false",
      "",
    ].join("\n"),
  );
  run(["set-feature", "--id", "nudge-test", "--plan-path", ".claude/plans/nudge.md"], { dir, now: FIXED_NOW });
  run(["set-phase", "--phase", "implementation"], { dir, now: FIXED_NOW });

  const manifestBefore = loadManifestSafe(dir);
  const stateBefore = loadStateSafe(statePath(dir));
  const suggestionBefore = resolveSuggestion(manifestBefore, stateBefore);
  ok(
    "PS21a sanity: BEFORE close-feature the nudge is non-empty",
    typeof suggestionBefore === "string" && suggestionBefore.length > 0,
    suggestionBefore,
  );

  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS21b close-feature exit 0", code === 0, `got ${code}`);

  const manifestAfter = loadManifestSafe(dir);
  const stateAfter = loadStateSafe(statePath(dir));
  const suggestionAfter = resolveSuggestion(manifestAfter, stateAfter);
  ok("PS21c AFTER close-feature the nudge is silent (null)", suggestionAfter === null, JSON.stringify(suggestionAfter));
}

// ---- PS22: close-feature refuses when activeFeature.id is blank (F2 hardening) ---------
{
  const dir = freshDir("close-feature-blank-id");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify({ schema: SCHEMA_ID, activeFeature: { id: "", planPath: "p.md", phase: "design" } }, null, 2) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS22a close-feature with blank activeFeature.id refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS22b file left byte-identical (no silent write)", after === before);
}

// ---- PS23: close-feature refuses when activeFeature.planPath is blank (F2 hardening) ---
{
  const dir = freshDir("close-feature-blank-planpath");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify({ schema: SCHEMA_ID, activeFeature: { id: "f-blank-plan", planPath: "  ", phase: "design" } }, null, 2) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS23a close-feature with blank activeFeature.planPath refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS23b file left byte-identical (no silent write)", after === before);
}

// ---- PS24: close-feature refuses when existing closedFeatures is not an array (F2) -----
{
  const dir = freshDir("close-feature-nonarray-closed");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify(
      { schema: SCHEMA_ID, activeFeature: { id: "f-ok", planPath: "p.md", phase: "design" }, closedFeatures: "not-an-array" },
      null,
      2,
    ) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS24a close-feature with non-array closedFeatures refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS24b file left byte-identical (no silent overwrite with [])", after === before);
}

// ---- PS25: close-feature happy path still succeeds and appends the audit entry ---------
// (regression guard: the new F2 validations must not break the normal case already
// covered by PS18/PS20 -- kept as an explicit, minimal case named for the F2 fix.)
{
  const dir = freshDir("close-feature-f2-happy-path");
  run(["set-feature", "--id", "f2-happy", "--plan-path", "p2-happy.md"], { dir, now: FIXED_NOW });
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS25a close-feature happy path exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS25b closedFeatures[0] appended with correct id/planPath",
    state.closedFeatures?.length === 1 && state.closedFeatures[0].id === "f2-happy" && state.closedFeatures[0].planPath === "p2-happy.md",
    JSON.stringify(state.closedFeatures),
  );
  ok("PS25c activeFeature removed", state.activeFeature === undefined);
}

// ---- PS26: approve-deploy binds {forArtifact, forEnvironment, approvedBy, approvedAt} -----
{
  const dir = freshDir("approve-deploy-shape");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS26a approve-deploy exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS26b deployApprovals[0] shape correct",
    state.deployApprovals?.length === 1 &&
      state.deployApprovals[0].forArtifact === "v1.0.0" &&
      state.deployApprovals[0].forEnvironment === "prod" &&
      state.deployApprovals[0].approvedBy === "po-test" &&
      state.deployApprovals[0].approvedAt === FIXED_NOW() &&
      state.deployApprovals[0].usedAt === undefined,
    JSON.stringify(state.deployApprovals),
  );
}

// ---- PS27: approve-deploy refuses blank --env/--artifact/--by, nothing written ------------
{
  const dir = freshDir("approve-deploy-blank-env");
  const code = run(["approve-deploy", "--env", "", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS27a approve-deploy blank --env refused (exit 2)", code === 2, `got ${code}`);
  ok("PS27b nothing written", readState(dir).status === "absent");
}
{
  const dir = freshDir("approve-deploy-blank-artifact");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS27c approve-deploy blank --artifact refused (exit 2)", code === 2, `got ${code}`);
  ok("PS27d nothing written", readState(dir).status === "absent");
}
{
  const dir = freshDir("approve-deploy-blank-by");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS27e approve-deploy blank --by refused (exit 2)", code === 2, `got ${code}`);
  ok("PS27f nothing written", readState(dir).status === "absent");
}
{
  const dir = freshDir("approve-deploy-missing-env");
  const code = run(["approve-deploy", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS27g approve-deploy missing --env refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS28: a `test` approval does NOT satisfy a `prod` check ------------------------------
{
  const dir = freshDir("deploy-env-does-not-cross");
  run(["approve-deploy", "--env", "test", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const codeWrongEnv = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS28a consume-deploy for prod fails when only a test approval exists (exit 2)", codeWrongEnv === 2, `got ${codeWrongEnv}`);
  const stateAfterFail = readState(dir).state;
  ok(
    "PS28b test approval left untouched (still unconsumed) after the failed prod check",
    stateAfterFail.deployApprovals?.[0]?.usedAt === undefined,
  );
  const codeRightEnv = run(["consume-deploy", "--env", "test", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS28c consume-deploy for the matching test env succeeds (exit 0)", codeRightEnv === 0, `got ${codeRightEnv}`);
}

// ---- PS29: consumed-on-use -- a consumed record fails a second consume-deploy check ------
{
  const dir = freshDir("deploy-consumed-on-use");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code1 = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS29a first consume-deploy exit 0", code1 === 0, `got ${code1}`);
  const state1 = readState(dir).state;
  ok("PS29b usedAt set after first consume", state1.deployApprovals?.[0]?.usedAt === FIXED_NOW());
  const code2 = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS29c second consume-deploy on the same record fails (exit 2, never a silent no-op)", code2 === 2, `got ${code2}`);
}

// ---- PS30: consume-deploy refuses blank --env/--artifact/--by ----------------------------
{
  const dir = freshDir("consume-deploy-blank-env");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["consume-deploy", "--env", "", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS30a consume-deploy blank --env refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("consume-deploy-blank-artifact");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["consume-deploy", "--env", "prod", "--artifact", "", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS30b consume-deploy blank --artifact refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("consume-deploy-blank-by");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS30c consume-deploy blank --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS31: consume-deploy fails loudly (exit 2, nothing written) on a non-existent record -
{
  const dir = freshDir("consume-deploy-no-record");
  const code = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS31a consume-deploy with no prior approval refused (exit 2)", code === 2, `got ${code}`);
  ok("PS31b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS32: clear-deploy removes pending approvals for the env (unconsumed only) ----------
{
  const dir = freshDir("clear-deploy-pending-only");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["approve-deploy", "--env", "prod", "--artifact", "v2.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS32a clear-deploy exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS32b only the pending (unconsumed) v2.0.0 record was removed -- the consumed v1.0.0 record stays",
    state.deployApprovals?.length === 1 && state.deployApprovals[0].forArtifact === "v1.0.0" && state.deployApprovals[0].usedAt === FIXED_NOW(),
    JSON.stringify(state.deployApprovals),
  );
}

// ---- PS33: clear-deploy narrowed by --artifact only clears the named artifact -------------
{
  const dir = freshDir("clear-deploy-narrowed");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["approve-deploy", "--env", "prod", "--artifact", "v2.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS33a clear-deploy narrowed by --artifact exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS33b only v1.0.0 removed, v2.0.0 stays pending",
    state.deployApprovals?.length === 1 && state.deployApprovals[0].forArtifact === "v2.0.0",
    JSON.stringify(state.deployApprovals),
  );
}

// ---- PS34: clear-deploy refuses blank --env/--by; --artifact stays optional ---------------
{
  const dir = freshDir("clear-deploy-blank-env");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS34a clear-deploy blank --env refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("clear-deploy-blank-by");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS34b clear-deploy blank --by refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("clear-deploy-no-artifact-ok");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS34c clear-deploy without --artifact (optional) still succeeds (exit 0)", code === 0, `got ${code}`);
}

// ---- PS35: clear-deploy fails loudly (exit 2, nothing written) when nothing matches -------
{
  const dir = freshDir("clear-deploy-no-match");
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS35a clear-deploy with no matching pending approval refused (exit 2)", code === 2, `got ${code}`);
  ok("PS35b nothing written (state file absent)", readState(dir).status === "absent");
}
{
  const dir = freshDir("clear-deploy-already-consumed-no-match");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS35c clear-deploy with only an already-consumed record refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS35d file left byte-identical (no silent write)", after === before);
}

// ---- PS36: existing malformed-file refusal still holds with the new subcommands ----------
{
  const dir = freshDir("malformed-existing-deploy");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), "{ this is not json");
  const before = readFileSync(statePath(dir), "utf8");

  const codeApprove = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS36a approve-deploy on malformed existing file -> exit 2", codeApprove === 2, `got ${codeApprove}`);
  ok("PS36b file left byte-identical after approve-deploy attempt", readFileSync(statePath(dir), "utf8") === before);

  const codeConsume = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS36c consume-deploy on malformed existing file -> exit 2", codeConsume === 2, `got ${codeConsume}`);
  ok("PS36d file left byte-identical after consume-deploy attempt", readFileSync(statePath(dir), "utf8") === before);

  const codeClear = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS36e clear-deploy on malformed existing file -> exit 2", codeClear === 2, `got ${codeClear}`);
  ok("PS36f file left byte-identical after clear-deploy attempt", readFileSync(statePath(dir), "utf8") === before);
}

// ---- PS37: approve-deploy refuses a non-array pre-existing deployApprovals field ---------
{
  const dir = freshDir("approve-deploy-nonarray");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify({ schema: SCHEMA_ID, deployApprovals: "not-an-array" }, null, 2) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS37a approve-deploy with non-array deployApprovals refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS37b file left byte-identical (no silent overwrite)", after === before);
}

// ---- Cleanup ------------------------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
