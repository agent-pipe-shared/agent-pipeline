#!/usr/bin/env node
/**
 * guard-push.test.mjs — test suite for the Push-Gate PreToolUse guard.
 *
 * AP1-P3 "DURIN". Run: node plugins/pipeline-core/hooks/guard-push.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Hermetics: every spawn sets CLAUDE_PROJECT_DIR (and cwd) to a fresh temp dir with its
 * own `git init` + commit, so this machine's real .claude/pipeline.yaml / pipeline-
 * state.json / evidence files can never leak into these cases, and HEAD-dependent
 * cases have a real, deterministic commit sha to compare against.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));

const ALL_DIRS = [];

/** Fresh temp dir with a real git repo (one commit) so `git rev-parse HEAD` resolves. */
function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-${prefix}-`));
  ALL_DIRS.push(dir);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();
  return { dir, head };
}

function writeManifest(dir, yamlText) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), yamlText);
}
function writeState(dir, obj) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), typeof obj === "string" ? obj : JSON.stringify(obj));
}
function writeEvidence(dir, relPath, obj) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, typeof obj === "string" ? obj : JSON.stringify(obj));
}

function runGuard(command, dir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
function check(id, command, dir, expectExit, { stderrIncludes, stderrEmpty } = {}) {
  const { code, stderr } = runGuard(command, dir);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 300)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 300)}`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 200)}`);
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}
const BLOCK = 2,
  ALLOW = 0,
  WARN = 1;

const PUSH_CMD = "git push origin main";

function manifestPush({ mode = "blocking", approval = "required", security = null }) {
  let y = `schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: ${mode}\n    type: human\n    approval: ${approval}\n`;
  if (security) y += `  security:\n    mode: ${security}\n    type: automated\n`;
  return y;
}

// ---- PG01 no manifest -> allow --------------------------------------------------------
{
  const { dir } = freshRepo("no-manifest");
  check("PG01 allow  no manifest at all", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG02 non-push command -> allow fast (even with a strict manifest present) --------
{
  const { dir } = freshRepo("non-push");
  writeManifest(dir, manifestPush({ approval: "required" }));
  check("PG02 allow  non-push command -> fast path", "git status", dir, ALLOW, { stderrEmpty: true });
}

// ---- PG03 gate mode off -> allow -------------------------------------------------------
{
  const { dir } = freshRepo("mode-off");
  writeManifest(dir, manifestPush({ mode: "off" }));
  check("PG03 allow  push gate mode off", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG04 blocking + missing verify evidence -> exit 2 ---------------------------------
{
  const { dir } = freshRepo("missing-evidence");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  check("PG04 block  blocking + missing verify evidence", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["evidence/verify-latest.json missing"],
  });
}

// ---- PG05 blocking + stale commit -> exit 2 --------------------------------------------
{
  const { dir, head } = freshRepo("stale-commit");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: "0000000000000000000000000000000000000000" });
  check("PG05 block  blocking + stale commit in verify evidence", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["is stale"],
  });
  void head;
}

// ---- PG06 blocking + red exitCode -> exit 2 --------------------------------------------
{
  const { dir, head } = freshRepo("red-exit");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 1, commit: head });
  check("PG06 block  blocking + red exitCode in verify evidence", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["exitCode=1"],
  });
}

// ---- PG07 warn + missing evidence -> exit 1 --------------------------------------------
{
  const { dir } = freshRepo("warn-missing");
  writeManifest(dir, manifestPush({ mode: "warn", approval: "standing-approved" }));
  check("PG07 warn  warn mode + missing verify evidence -> exit 1", PUSH_CMD, dir, WARN, {
    stderrIncludes: ["evidence/verify-latest.json missing"],
  });
}

// ---- PG08 security check enforced when security mode blocking -------------------------
{
  const { dir, head } = freshRepo("security-enforced");
  writeManifest(dir, manifestPush({ approval: "standing-approved", security: "blocking" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  // security-latest.json intentionally absent -> must be reported as a failure.
  check("PG08 block  security evidence enforced when gates.security mode=blocking", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["evidence/security-latest.json missing"],
  });
}

// ---- PG09 security check skipped when security mode off -------------------------------
{
  const { dir, head } = freshRepo("security-skipped");
  writeManifest(dir, manifestPush({ approval: "standing-approved", security: "off" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  // security-latest.json absent, but security gate is off -> must NOT be reported, all-green.
  check("PG09 allow  security evidence skipped when gates.security mode=off", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG10 standing-approved passes without any state file ------------------------------
{
  const { dir, head } = freshRepo("standing-approved");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  check("PG10 allow  standing-approved passes without any state file", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG11a required + absent approval (no state file at all) -> exit 2 -----------------
{
  const { dir, head } = freshRepo("required-absent");
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  check("PG11a block  required approval, no state file at all", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["Push approval missing"],
  });
}

// ---- PG11b required + stale approval (state present, wrong commit) -> exit 2 -----------
{
  const { dir, head } = freshRepo("required-stale");
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  writeState(dir, {
    schema: "pipeline.state.v0",
    pushApproval: { lastApproved: { approvedBy: "po-test", approvedAt: "2020-01-01T00:00:00.000Z", forCommit: "deadbeef" } },
  });
  check("PG11b block  required approval, state present but stale forCommit", PUSH_CMD, dir, BLOCK, {
    stderrIncludes: ["Push approval missing or stale"],
  });
}

// ---- PG12 required + fresh approval -> allow -------------------------------------------
{
  const { dir, head } = freshRepo("required-fresh");
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  writeState(dir, {
    schema: "pipeline.state.v0",
    pushApproval: { lastApproved: { approvedBy: "po-test", approvedAt: "2026-07-07T20:00:00.000Z", forCommit: head } },
  });
  check("PG12 allow  required approval, fresh forCommit matches HEAD", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG13 all-green (standing-approved + verify + security both fresh) -> allow --------
{
  const { dir, head } = freshRepo("all-green");
  writeManifest(dir, manifestPush({ approval: "standing-approved", security: "blocking" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  writeEvidence(dir, "evidence/security-latest.json", { exitCode: 0, commit: head });
  check("PG13 allow  all-green (verify + security fresh, standing-approved)", PUSH_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- PG14 malformed manifest -> exit 1 warn --------------------------------------------
{
  const { dir } = freshRepo("malformed-manifest");
  writeManifest(dir, "schema: pipeline.manifest.v0\ngates:\n  push: &anchor\n    mode: blocking\n");
  check("PG14 warn  malformed manifest YAML -> exit 1 warn, not block", PUSH_CMD, dir, WARN, {
    stderrIncludes: ["WARN"],
  });
}

// ---- PG15 push inside second segment -> detected ---------------------------------------
{
  const { dir } = freshRepo("second-segment");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  check("PG15 block  push detected inside second segment (git add . && git push)", "git add . && git push", dir, BLOCK, {
    stderrIncludes: ["evidence/verify-latest.json missing"],
  });
}

// ---- PG16 quoted prose mentioning push -> NOT detected ---------------------------------
{
  const { dir } = freshRepo("quoted-prose");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  check(
    "PG16 allow  quoted prose mentioning push is NOT detected as a push command",
    'git commit -m "remember to git push later"',
    dir,
    ALLOW,
    { stderrEmpty: true },
  );
}

// =============================================================================================
// DEPLOY BRANCH -- new fixtures/cases, additive. Base manifest: two envs
// (`test` = automated/non-gated, `prod` = human-gate) + two adapters (`vercel-preview`
// no trigger, `vercel-prod` tag-triggered); `triggerRefs` customizes vercel-prod's own
// trigger.refs (varies per ref-extraction-form case); `testEnvAdapterRef: "ghost-adapter"`
// deliberately breaks release integrity (an undeclared-adapter semantic error) WITHOUT
// touching vercel-prod's own trigger patterns -- used for the A/B fail-matrix cases so
// the manifest is semantic-`status:"invalid"` while trigger classification stays clean.
// =============================================================================================
function releaseManifest({ triggerRefs = ["refs/tags/v*"], extraTop = "", testEnvAdapterRef = "vercel-preview", includeCanary = false } = {}) {
  const lines = ["schema: pipeline.manifest.v0"];
  if (extraTop) lines.push(...extraTop.split("\n").filter((l) => l.length > 0));
  lines.push(
    "release:",
    "  environments:",
    "    test:",
    `      adapter: ${testEnvAdapterRef}`,
    "      healthcheck: check.sh",
    "      rollback: rollback-test.sh",
    "    prod:",
    "      adapter: vercel-prod",
    "      healthcheck: check.sh",
    "      rollback: rollback-prod.sh",
    "      promotion: human-gate",
  );
  if (includeCanary) {
    lines.push("    canary:", "      adapter: vercel-canary", "      healthcheck: check.sh", "      rollback: rollback-canary.sh");
  }
  lines.push("  adapters:", "    vercel-preview:", "      executor: ci", "      credentials: oidc", "    vercel-prod:", "      executor: ci");
  if (triggerRefs.length > 0) {
    lines.push("      trigger:", "        refs:");
    for (const r of triggerRefs) lines.push(`          - ${r}`);
  }
  lines.push("      credentials: oidc");
  if (includeCanary) {
    lines.push(
      "    vercel-canary:",
      "      executor: ci",
      "      trigger:",
      "        refs:",
      "          - refs/tags/canary-*",
      "      credentials: oidc",
    );
  }
  return lines.join("\n") + "\n";
}
function writeGovernancePolicy(dir, relDir, content) {
  mkdirSync(join(dir, relDir), { recursive: true });
  writeFileSync(join(dir, relDir, "deploy-policy.yaml"), content);
}
function deployApprovalState(forArtifact, forEnvironment) {
  return {
    schema: "pipeline.state.v0",
    deployApprovals: [{ forArtifact, forEnvironment, approvedBy: "po-test", approvedAt: "2026-07-07T20:00:00.000Z" }],
  };
}

// ---- PGD01/02 bare-name candidate: block (no approval) / allow (matching approval) --------
{
  const { dir } = freshRepo("deploy-bare-block");
  writeManifest(dir, releaseManifest());
  check("PGD01 block  bare-name deploy-trigger to human-gate env without a deployApproval", "git push origin v1.0.0", dir, BLOCK, {
    stderrIncludes: ["no unused deployApproval", "v1.0.0"],
  });
}
{
  const { dir } = freshRepo("deploy-bare-allow");
  writeManifest(dir, releaseManifest());
  writeState(dir, deployApprovalState("v1.0.0", "prod"));
  check("PGD02 allow  bare-name deploy-trigger with a matching unconsumed deployApproval", "git push origin v1.0.0", dir, ALLOW, {
    stderrEmpty: true,
  });
}

// ---- PGD03/04 src:dst candidate (destination-keyed): block / allow ------------------------
{
  const { dir } = freshRepo("deploy-srcdst-block");
  writeManifest(dir, releaseManifest());
  check(
    "PGD03 block  src:dst deploy-trigger (destination-keyed) without a deployApproval",
    "git push origin HEAD:refs/tags/v2.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["no unused deployApproval", "v2.0.0"] },
  );
}
{
  const { dir } = freshRepo("deploy-srcdst-allow");
  writeManifest(dir, releaseManifest());
  writeState(dir, deployApprovalState("v2.0.0", "prod"));
  check(
    "PGD04 allow  src:dst deploy-trigger with a matching unconsumed deployApproval (bare dest artifact identity)",
    "git push origin HEAD:refs/tags/v2.0.0",
    dir,
    ALLOW,
    { stderrEmpty: true },
  );
}

// ---- PGD05/06 --tags: block (a tag-pattern trigger is declared) / allow (none declared) ---
{
  const { dir } = freshRepo("deploy-tags-block");
  writeManifest(dir, releaseManifest());
  check("PGD05 block  --tags counts as release-triggering whenever ANY tag-pattern trigger is declared", "git push origin --tags", dir, BLOCK, {
    stderrIncludes: ["no unused deployApproval"],
  });
}
{
  const { dir } = freshRepo("deploy-tags-allow");
  writeManifest(dir, releaseManifest({ triggerRefs: ["refs/heads/release-*"] })); // branch-pattern only, no tag pattern
  check("PGD06 allow  --tags does NOT trigger when no tag-pattern trigger is declared", "git push origin --tags", dir, ALLOW, {
    stderrEmpty: true,
  });
}

// ---- PGD07 --delete: NOT a deploy trigger, even for an otherwise-matching name -------------
{
  const { dir } = freshRepo("deploy-delete-allow");
  writeManifest(dir, releaseManifest());
  check("PGD07 allow  --delete forms are excluded from deploy-trigger matching (protected-ref deletion stays guard-git territory)", "git push origin --delete v1.0.0", dir, ALLOW, {
    stderrEmpty: true,
  });
}

// ---- PGD08/09 unparseable -> conservative block --------------------------------------------
{
  const { dir } = freshRepo("deploy-unparseable-chain");
  writeManifest(dir, releaseManifest());
  check(
    "PGD08 block  a multi-push chain in one command is unparseable in a release-declaring repo -- conservative block",
    "git push origin v1.0.0 && git push origin v2.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["exactly ONE git-push segment"] },
  );
}
{
  const { dir } = freshRepo("deploy-unparseable-refspec");
  writeManifest(dir, releaseManifest());
  check(
    "PGD09 block  an unparseable refspec form (empty destination after the colon) -- conservative block",
    "git push origin v1.0.0:",
    dir,
    BLOCK,
    { stderrIncludes: ["cannot be evaluated deterministically"] },
  );
}

// ---- PGD10/11 bare push: tag-only trigger ALLOWED, branch-pattern trigger BLOCKED ----------
{
  const { dir } = freshRepo("deploy-barepush-tagonly-allow");
  writeManifest(dir, releaseManifest()); // default trigger is a tag pattern only
  check("PGD10 allow  a bare `git push` (no remote/refspec) never pushes tags -- allowed when triggers are tag-only", "git push", dir, ALLOW, {
    stderrEmpty: true,
  });
}
{
  const { dir } = freshRepo("deploy-barepush-branchpattern-block");
  writeManifest(dir, releaseManifest({ triggerRefs: ["refs/heads/release-*"] }));
  check(
    "PGD11 block  a bare `git push` in a repo declaring a branch-pattern trigger -- conservative block",
    "git push",
    dir,
    BLOCK,
    { stderrIncludes: ["without an explicit remote/ref"] },
  );
}

// ---- PGD12: a deploy-trigger resolving to a NON-human-gated env never demands approval -----
{
  const { dir } = freshRepo("deploy-nongated-allow");
  writeManifest(dir, releaseManifest({ includeCanary: true }));
  check("PGD12 allow  deploy-trigger to a non-human-gated env (automated) never demands a deployApproval", "git push origin canary-1", dir, ALLOW, {
    stderrEmpty: true,
  });
}

// ---- PGD13 standing-approval carve-out: the deploy branch is evaluated EVEN under standing-approved --
{
  const { dir } = freshRepo("deploy-standing-approval-carveout");
  writeManifest(dir, releaseManifest({ extraTop: "gates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n" }));
  check(
    "PGD13 block  standing push approval does NOT satisfy a deployApproval -- the composition bypass closed",
    "git push origin v1.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["no unused deployApproval"] },
  );
}

// ---- PGD14/15/16/17 the fail-matrix: A block / B fall-through-block / C warn / D warn ------
{
  // Case A: semantic-invalid manifest (undeclared adapter ref on the `test` env), release present,
  // push IS deploy-triggering (matches vercel-prod's own -- untouched, still valid -- trigger.refs).
  const { dir } = freshRepo("deploy-caseA-block");
  writeManifest(dir, releaseManifest({ testEnvAdapterRef: "ghost-adapter" }));
  check(
    "PGD14 block  case A: semantic-invalid manifest + release present + deploy-triggering push -- unconditional block",
    "git push origin v1.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["is semantically invalid", "deploy-triggering", "unconditional block, no mode exception"] },
  );
}
{
  // Case B: same semantic-invalid manifest, push NOT deploy-triggering (main matches neither
  // refs/tags/v* nor refs/heads/v* trigger form) -- falls through to the normal push-gate
  // checks (WARN prepended); a configured blocking push gate + no verify evidence -> exit 2.
  const { dir } = freshRepo("deploy-caseB-fallthrough-block");
  writeManifest(
    dir,
    releaseManifest({
      testEnvAdapterRef: "ghost-adapter",
      extraTop: "gates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n",
    }),
  );
  check(
    "PGD15 block  case B: semantic-invalid manifest + release present + NON-deploy-triggering push -- falls through, blocked by the normal evidence-freshness gate (WARN prepended, not fail-open)",
    "git push origin main",
    dir,
    BLOCK,
    { stderrIncludes: ["release section present, the push-gate check still runs normally", "evidence/verify-latest.json missing"] },
  );
}
{
  // Case C: semantic-invalid manifest, NO release section at all -- unchanged WARN behavior.
  const { dir } = freshRepo("deploy-caseC-warn");
  writeManifest(dir, "schema: pipeline.manifest.v0\nprofiles:\n  active: bogus-profile\n");
  check("PGD16 warn  case C: semantic-invalid manifest, no release section -- unchanged WARN", "git push origin main", dir, WARN, {
    stderrIncludes: ["WARN"],
  });
}
{
  // Case D: parse-level invalid (malformed YAML), no release section reachable at all --
  // unchanged WARN behavior (same fixture class as PG14 above).
  const { dir } = freshRepo("deploy-caseD-warn");
  writeManifest(dir, "schema: pipeline.manifest.v0\ngates:\n  push: &anchor\n    mode: blocking\n");
  check("PGD17 warn  case D: parse-level invalid manifest (malformed YAML) -- unchanged WARN", "git push origin main", dir, WARN, {
    stderrIncludes: ["WARN"],
  });
}

// ---- PGD18: a declared-but-malformed central deploy policy fail-closes a deploy-triggering push --
{
  const { dir } = freshRepo("deploy-malformed-central-policy");
  writeManifest(dir, releaseManifest({ extraTop: "governance:\n  policies_path: governance-policies\n" }));
  writeGovernancePolicy(dir, "governance-policies", "schema: &anchor pipeline.deploy-policy.v0\nmode: strict\n");
  check(
    "PGD18 block  a declared-but-malformed central deploy-policy fail-closes a deploy-triggering push, unconditional",
    "git push origin v1.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["central deploy policy is declared but unreadable/invalid", "fail-closed blocked, unconditional"] },
  );
}

// ---- PGD19/20: a leading `+` (force-push refspec syntax) is stripped before trigger-
// classification AND artifact-matching, so a force-tag-push blocks exactly like its
// non-force form -------------------------------------------------------------------------
{
  const { dir } = freshRepo("deploy-plus-bare-block");
  writeManifest(dir, releaseManifest());
  check("PGD19 block  `+`-force bare-name deploy-trigger to human-gate env without a deployApproval -- `+` stripped for trigger-classification AND artifact identity", "git push origin +v1.0.0", dir, BLOCK, {
    stderrIncludes: ["no unused deployApproval", "v1.0.0"],
  });
}
{
  const { dir } = freshRepo("deploy-plus-fq-block");
  writeManifest(dir, releaseManifest());
  check(
    "PGD20 block  `+`-force fully-qualified deploy-trigger (refs/tags/v1.0.0) to human-gate env without a deployApproval -- resolves identically to the non-force form",
    "git push origin +refs/tags/v1.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["no unused deployApproval", "v1.0.0"] },
  );
}

// ---- PGD21 fall-matrix case B, NO active push gate: the semantic-invalidity WARN is still
// surfaced instead of exiting silently -------------------------------------------------------
{
  // Same semantic-invalid manifest as PGD15 (case B), but no `gates.push` section at all
  // (absent, not "off") -- exercises the `!pushGate || pushGate.mode === "off"` branch.
  const { dir } = freshRepo("deploy-caseB-nogate-warn");
  writeManifest(dir, releaseManifest({ testEnvAdapterRef: "ghost-adapter" }));
  check(
    "PGD21 warn  case B: semantic-invalid manifest + release present + NON-deploy-triggering push + NO active push gate -- invalidity WARN still surfaces, does not silently exit 0",
    "git push origin main",
    dir,
    WARN,
    { stderrIncludes: ["is semantically invalid", "release section present"] },
  );
}

// ---- Cleanup ----------------------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
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
