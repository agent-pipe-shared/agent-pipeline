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
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();
  return { dir, head };
}

function gitAt(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
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

function configureAnonymousPublicPush(dir, branch = "feat/v0.3-phase2.6-multi-cli") {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline.json"),
    JSON.stringify({
      publicPushIdentity: {
        schema: "pipeline.public-push-identity.v1",
        mode: "required",
        repositoryOwner: "agent-pipe-shared",
        repositoryName: "agent-pipeline",
        sshHostAlias: "github-share",
        sshAccount: "agent-pipe-shared",
        authorName: "The Agent-Pipeline Contributors",
        authorEmail: "301875187+agent-pipe-shared@users.noreply.github.com",
      },
    }),
  );
  gitAt(dir, "config", "--local", "user.useConfigOnly", "true");
  gitAt(dir, "config", "--local", "commit.gpgSign", "false");
  gitAt(dir, "config", "--local", "user.name", "The Agent-Pipeline Contributors");
  gitAt(dir, "config", "--local", "user.email", "301875187+agent-pipe-shared@users.noreply.github.com");
  gitAt(dir, "config", "--local", "remote.origin.url", "git@github-share:agent-pipe-shared/agent-pipeline.git");
  const base = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  gitAt(dir, "update-ref", `refs/remotes/origin/${branch}`, base);
}

function anonymousCommit(dir, name = "anonymous.txt", message = "anonymous feature") {
  writeFileSync(join(dir, name), `${message}\n`);
  gitAt(dir, "add", name);
  gitAt(dir, "commit", "-q", "-m", message);
  return gitAt(dir, "rev-parse", "HEAD").stdout.trim();
}

function prepareAnonymousPublicPush(dir, branch = "feat/v0.3-phase2.6-multi-cli") {
  configureAnonymousPublicPush(dir, branch);
  const head = anonymousCommit(dir);
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  return { head, command: `git push origin HEAD:refs/heads/${branch}` };
}

function runGuard(command, dir, { cwd = dir, projectDir = dir, env = {} } = {}) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: projectDir },
    timeout: 10000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
function check(id, command, dir, expectExit, { stderrIncludes, stderrNotIncludes, stderrEmpty, cwd, projectDir, env } = {}) {
  const { code, stderr } = runGuard(command, dir, { cwd: cwd ?? dir, projectDir: projectDir ?? dir, env });
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 300)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 300)}`);
  }
  for (const needle of [].concat(stderrNotIncludes ?? [])) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
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
{
  const { dir } = freshRepo("opt-in-ambiguous");
  check("PG03b allow  structural policy remains opt-in without a manifest", "git add README.md && git push", dir, ALLOW, {
    stderrEmpty: true,
  });
  writeManifest(dir, manifestPush({ mode: "off" }));
  check("PG03c allow  structural policy remains off when push gate is off", "git add README.md && git push", dir, ALLOW, {
    stderrEmpty: true,
  });
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
    stderrIncludes: ["standalone command"],
  });
}

// ---- PG17 actual repository and explicit source OID bind every artifact ----------------
{
  const decoy = freshRepo("binding-decoy");
  const target = freshRepo("binding-target");
  writeManifest(decoy.dir, manifestPush({ approval: "standing-approved" }));
  writeManifest(target.dir, manifestPush({ approval: "standing-approved" }));
  writeEvidence(decoy.dir, "evidence/verify-latest.json", { exitCode: 0, commit: decoy.head });
  check("PG17a block  git -C target never borrows green evidence from session repo", `git -C ${target.dir} push origin main`, decoy.dir, BLOCK, {
    cwd: decoy.dir,
    projectDir: decoy.dir,
    stderrIncludes: ["evidence/verify-latest.json missing"],
    stderrNotIncludes: [target.dir, decoy.dir],
  });
  writeEvidence(target.dir, "evidence/verify-latest.json", { exitCode: 0, commit: target.head });
  writeEvidence(decoy.dir, "evidence/verify-latest.json", { exitCode: 1, commit: decoy.head });
  check("PG17b allow  git -C target uses target evidence despite red session repo", `git -C ${target.dir} push origin main`, decoy.dir, ALLOW, {
    cwd: decoy.dir,
    projectDir: decoy.dir,
    stderrEmpty: true,
  });
}
{
  const { dir, head: verifiedOid } = freshRepo("source-oid");
  gitAt(dir, "branch", "verified", verifiedOid);
  writeFileSync(join(dir, "later.txt"), "later\n");
  gitAt(dir, "add", "later.txt");
  gitAt(dir, "commit", "-q", "-m", "later");
  const laterOid = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: verifiedOid });
  check("PG17c allow  evidence binds explicit older source, not checkout HEAD", "git push origin verified", dir, ALLOW, { stderrEmpty: true });
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: laterOid });
  check("PG17d block  checkout-HEAD evidence cannot authorize another source", "git push origin verified", dir, BLOCK, {
    stderrIncludes: [verifiedOid, "pushed source commit"],
  });
  check("PG17e block  unresolvable source fails closed", "git push origin does-not-exist:refs/heads/x", dir, BLOCK, {
    stderrIncludes: ["does not resolve"],
  });
}
{
  const { dir } = freshRepo("detection-privacy");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  check("PG17f block  quoted git executable is gated", '"git" push origin main', dir, BLOCK, {
    stderrIncludes: ["evidence/verify-latest.json missing"],
  });
  check("PG17g block  git.exe cannot bypass detection", "git.exe push origin main", dir, BLOCK, {
    stderrIncludes: ["not unambiguous"],
  });
  check("PG17h block  shell wrapper cannot bypass detection", 'bash -c "git push origin main"', dir, BLOCK, {
    stderrIncludes: ["not unambiguous"],
  });
  check("PG17h2 block  cmd wrapper cannot bypass detection", 'cmd.exe /c "git push origin main"', dir, BLOCK, {
    stderrIncludes: ["not unambiguous"],
  });
  check("PG17h3 block  ssh wrapper cannot bypass detection", 'ssh host "git push origin main"', dir, BLOCK, {
    stderrIncludes: ["not unambiguous"],
  });
  check("PG17i diagnostics redact raw credential-shaped remote and absolute path", "git push https://token@example.invalid/repo main", dir, BLOCK, {
    stderrNotIncludes: ["token@example.invalid", dir],
  });
  check("PG17i2 unsupported option diagnostics redact credential-shaped values", "git push --repo=https://secret@example.invalid/x origin main", dir, BLOCK, {
    stderrNotIncludes: ["secret@example.invalid", dir],
  });
}
{
  const { dir } = freshRepo("strict-shapes");
  writeManifest(dir, manifestPush({ approval: "standing-approved" }));
  const blockedShapes = [
    ["PG17j multiple refspecs", "git push origin main other"],
    ["PG17k bulk all", "git push --all origin main"],
    ["PG17l pipe", "git push origin main | tee result"],
    ["PG17m redirect", "git push origin main >result"],
    ["PG17n substitution", "git push origin $(git branch --show-current)"],
    ["PG17o option operand", "git push --repo other origin main"],
    ["PG17o2 git-dir override", "git --git-dir=/tmp/other.git push origin main"],
    ["PG17o3 multiple git-C overrides", "git -C one -C two push origin main"],
    ["PG17p incomplete quoting", "git push origin 'main"],
    ["PG17r variable source expansion", "git push origin $BRANCH"],
    ["PG17s double-quoted source expansion", 'git push origin "$BRANCH"'],
  ];
  for (const [id, command] of blockedShapes) {
    check(`${id} is structurally blocked`, command, dir, BLOCK, { stderrIncludes: ["not unambiguous"] });
  }
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: gitAt(dir, "rev-parse", "HEAD").stdout.trim() });
  check("PG17q allow  safe set-upstream flag preserves one-source binding", "git push -u origin main", dir, ALLOW, {
    stderrEmpty: true,
  });
}
{
  const decoy = freshRepo("ambiguous-cross-decoy");
  const target = freshRepo("ambiguous-cross-target");
  writeManifest(target.dir, manifestPush({ approval: "standing-approved" }));
  check(
    "PG17t block  bundled git -C push loads the target gate, not an ungated session repo",
    `git -C ${target.dir} push origin main && echo done`,
    decoy.dir,
    BLOCK,
    { cwd: decoy.dir, projectDir: decoy.dir, stderrIncludes: ["standalone command"], stderrNotIncludes: [target.dir, decoy.dir] },
  );
  check(
    "PG17u block  unresolved variable git -C target fails closed",
    'git -C "$TARGET_DIR" push origin main',
    decoy.dir,
    BLOCK,
    { cwd: decoy.dir, projectDir: decoy.dir, stderrIncludes: ["dynamic cross-repository"], stderrNotIncludes: [decoy.dir] },
  );
  const literalDynamicDir = join(decoy.dir, "$TARGET_DIR");
  mkdirSync(literalDynamicDir);
  gitAt(literalDynamicDir, "init", "-q", "-b", "main");
  check(
    "PG17v block  literal dynamic-path decoy cannot hide the expanded gated target",
    'git -C "$TARGET_DIR" push origin main',
    decoy.dir,
    BLOCK,
    {
      cwd: decoy.dir,
      projectDir: decoy.dir,
      env: { TARGET_DIR: target.dir },
      stderrIncludes: ["dynamic cross-repository"],
      stderrNotIncludes: [target.dir, decoy.dir],
    },
  );
  check(
    "PG17w block  inline environment assignment cannot hide dynamic cross-repo expansion",
    `TARGET_DIR=${target.dir} git -C "$TARGET_DIR" push origin main`,
    decoy.dir,
    BLOCK,
    {
      cwd: decoy.dir,
      projectDir: decoy.dir,
      stderrIncludes: ["dynamic cross-repository"],
      stderrNotIncludes: [target.dir, decoy.dir],
    },
  );
  check(
    "PG17x block  env wrapper options cannot hide dynamic cross-repo expansion",
    `env -i TARGET_DIR=${target.dir} git -C "$TARGET_DIR" push origin main`,
    decoy.dir,
    BLOCK,
    {
      cwd: decoy.dir,
      projectDir: decoy.dir,
      stderrIncludes: ["dynamic cross-repository"],
      stderrNotIncludes: [target.dir, decoy.dir],
    },
  );
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
  check("PG16b allow  an unquoted commit-message token named push is not a push subcommand", "git commit -m push", dir, ALLOW, {
    stderrEmpty: true,
  });
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
function writePolicyLock(dir, { mode = "mandate", status = "resolved" } = {}) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "policy-lock.yaml"),
    [
      "schema: pipeline.policy-lock.v0",
      "pack_id: policy-pack-001",
      "version: 1.0.0",
      "digest: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      `mode: ${mode}`,
      "update: pinned",
      "verifier:",
      `  status: ${status}`,
      "",
    ].join("\n"),
  );
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
  gitAt(dir, "tag", "v1.0.0");
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

// ---- PGD05/06 bulk tag pushes are structurally ambiguous regardless trigger shape --------
{
  const { dir } = freshRepo("deploy-tags-block");
  writeManifest(dir, releaseManifest());
  check("PGD05 block  --tags cannot bind evidence to one source commit", "git push origin --tags", dir, BLOCK, {
    stderrIncludes: ["cannot be bound to exactly one source commit"],
  });
}
{
  const { dir } = freshRepo("deploy-tags-allow");
  writeManifest(dir, releaseManifest({ triggerRefs: ["refs/heads/release-*"] })); // branch-pattern only, no tag pattern
  check("PGD06 block  --tags remains ambiguous without a tag trigger", "git push origin --tags", dir, BLOCK, {
    stderrIncludes: ["cannot be bound to exactly one source commit"],
  });
}

// ---- PGD07 deletion has no source commit and is therefore structurally blocked ------------
{
  const { dir } = freshRepo("deploy-delete-allow");
  writeManifest(dir, releaseManifest());
  check("PGD07 block  --delete cannot bind evidence to a source commit", "git push origin --delete v1.0.0", dir, BLOCK, {
    stderrIncludes: ["cannot be bound to exactly one source commit"],
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
    { stderrIncludes: ["standalone command"] },
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
    { stderrIncludes: ["source-ambiguous"] },
  );
}

// ---- PGD10/11 implicit bare pushes are structurally ambiguous -------------------------------
{
  const { dir } = freshRepo("deploy-barepush-tagonly-allow");
  writeManifest(dir, releaseManifest()); // default trigger is a tag pattern only
  check("PGD10 block  bare git push cannot identify one source", "git push", dir, BLOCK, {
    stderrIncludes: ["exactly one remote and one explicit source"],
  });
}
{
  const { dir } = freshRepo("deploy-barepush-branchpattern-block");
  writeManifest(dir, releaseManifest({ triggerRefs: ["refs/heads/release-*"] }));
  check(
    "PGD11 block  bare git push remains ambiguous with a branch trigger",
    "git push",
    dir,
    BLOCK,
    { stderrIncludes: ["exactly one remote and one explicit source"] },
  );
}

// ---- PGD12: a deploy-trigger resolving to a NON-human-gated env never demands approval -----
{
  const { dir } = freshRepo("deploy-nongated-allow");
  gitAt(dir, "branch", "canary-1");
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

// ---- PGD18a/b: fixed managed policy lock is independent of governance.policies_path ----
{
  const { dir } = freshRepo("deploy-policylock-mandate");
  writeManifest(dir, releaseManifest());
  writePolicyLock(dir, { mode: "mandate", status: "source-unverified" });
  check(
    "PGD18a block  a fixed mandate lock with unverified source blocks a deploy trigger without governance discovery",
    "git push origin v1.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["managed policy lock status: source-unverified", "deploy-triggering"] },
  );
}
{
  const { dir } = freshRepo("deploy-policylock-advisory");
  gitAt(dir, "tag", "v1.0.0");
  writeManifest(dir, releaseManifest());
  writePolicyLock(dir, { mode: "advisory", status: "source-unverified" });
  writeState(dir, deployApprovalState("v1.0.0", "prod"));
  check(
    "PGD18b allow  an advisory unverified lock warns at validation but does not close an otherwise approved deploy trigger",
    "git push origin v1.0.0",
    dir,
    ALLOW,
    { stderrEmpty: true },
  );
}

// ---- PGD19/20 force refspecs are rejected before evidence binding ----------------------
{
  const { dir } = freshRepo("deploy-plus-bare-block");
  writeManifest(dir, releaseManifest());
  check("PGD19 block  leading-plus force refspec is source-ambiguous", "git push origin +v1.0.0", dir, BLOCK, {
    stderrIncludes: ["source-ambiguous"],
  });
}
{
  const { dir } = freshRepo("deploy-plus-fq-block");
  writeManifest(dir, releaseManifest());
  check(
    "PGD20 block  fully-qualified leading-plus force refspec is source-ambiguous",
    "git push origin +refs/tags/v1.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["source-ambiguous"] },
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

// ---- PG26 anonymous-public self-application range -----------------------------------------------
{
  const { dir } = freshRepo("anonymous-public-green");
  const { command } = prepareAnonymousPublicPush(dir);
  check("PG26a allow  calibrated anonymous feature-branch range", command, dir, ALLOW, { stderrEmpty: true });
}
{
  const { dir } = freshRepo("anonymous-public-personal-author");
  const { command } = prepareAnonymousPublicPush(dir);
  gitAt(dir, "config", "--local", "user.name", "Personal Name");
  gitAt(dir, "config", "--local", "user.email", "personal@example.invalid");
  anonymousCommit(dir, "personal.txt", "personal author");
  const head = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  check("PG26b block  personal Author or Committer in the newly reachable range", command, dir, BLOCK, {
    stderrIncludes: ["non-neutral Author identity", "non-neutral Committer identity"],
  });
}
{
  const { dir } = freshRepo("anonymous-public-trailer");
  const { command } = prepareAnonymousPublicPush(dir);
  const head = anonymousCommit(dir, "trailer.txt", "privacy\n\nCo-authored-by: Personal <personal@example.invalid>");
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  check("PG26c block  personal/provider trailers and mail in the new range", command, dir, BLOCK, {
    stderrIncludes: ["forbidden personal/provider/private trailer", "email address"],
  });
}
{
  const { dir } = freshRepo("anonymous-public-private-coordinate");
  const { command } = prepareAnonymousPublicPush(dir);
  const head = anonymousCommit(dir, "private.txt", "privacy\n\nPrivate-Account: account-123");
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  check("PG26d block  private-account trailer in the new range", command, dir, BLOCK, {
    stderrIncludes: ["forbidden personal/provider/private trailer"],
  });
}
{
  const { dir } = freshRepo("anonymous-public-wrong-ssh");
  const { command } = prepareAnonymousPublicPush(dir);
  gitAt(dir, "config", "--local", "remote.origin.url", "git@github.com:agent-pipe-shared/agent-pipeline.git");
  check("PG26e block  a generic or wrong SSH identity path", command, dir, BLOCK, {
    stderrIncludes: ["calibrated SSH host alias"],
  });
}
{
  const { dir } = freshRepo("anonymous-public-signing");
  const { command } = prepareAnonymousPublicPush(dir);
  gitAt(dir, "config", "--local", "commit.gpgSign", "true");
  check("PG26f block  signing-enabled local configuration", command, dir, BLOCK, {
    stderrIncludes: ["commit.gpgSign"],
  });
}
{
  const { dir } = freshRepo("anonymous-public-unfetched-destination");
  const { command } = prepareAnonymousPublicPush(dir);
  gitAt(dir, "update-ref", "-d", "refs/remotes/origin/feat/v0.3-phase2.6-multi-cli");
  check("PG26g block  missing fetched destination range evidence", command, dir, BLOCK, {
    stderrIncludes: ["fetched destination tracking ref"],
  });
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
