// SPDX-License-Identifier: SUL-1.0
/**
 * A REAL push decision with a carried Verify and Security record (candidate 19, D4b/E3 rest, AC-108;
 * docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md point 2 and the amendment of 2026-11-04).
 *
 * A git fixture holds a Verify and a Security record (v1 and v2) bound to commit A. Evidence-only commits follow. The same
 * question is put to the two real consumers that stand between an agent and a remote: `hooks/guard-push.mjs` (a spawned process fed
 * the tool call) and the managed pre-push hook template rendered by `scripts/pre-push-hook-install.mjs` (a spawned process fed the
 * ref update on stdin). Nothing is stubbed except the secret scanner binary, which is a shell script that exits 0, 2 or is absent.
 *
 * Accepted: evidence-only commits only. Refused with the stable code EF-STALE-COMMIT and the carry reason: a product-file commit, a
 * change of a gate-consumed file outside the evidence set, a secret scan finding or unavailable scanner (Security only), and a record
 * bound to a commit that is not an ancestor of the pushed one.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderImpl } from "../scripts/pre-push-hook-install.mjs";
import { checkEvidenceFreshness as prepareFreshness } from "../scripts/push-prepare.mjs";
import { commitApprovedMiniFixtureState, verifyEvidenceFixture } from "./verify-selection-fixture.mjs";
import { createGovernanceScopeController } from "./governance-scope.mjs";

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const GUARD = join(LIB_DIR, "..", "hooks", "guard-push.mjs");
const PUSH_COMMAND = "git push origin HEAD:refs/heads/fixture";
const ZERO40 = "0".repeat(40);
const VERIFY_PATH = "evidence/verify-latest.json";
const SECURITY_PATH = "evidence/security-latest.json";

const roots = [];
test.after(() => { for (const dir of roots) rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `carry-real-${prefix}-`));
  roots.push(dir);
  return dir;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function writeJson(dir, relPath, value) {
  mkdirSync(dirname(join(dir, relPath)), { recursive: true });
  writeFileSync(join(dir, relPath), JSON.stringify(value));
}

function securityEvidenceV1({ commit, tree, repositorySha256 }) {
  const payload = {
    schema: "pipeline.security-evidence.v1", exitCode: 0, commit,
    candidate: {
      status: "clean", commit, tree, inputSha256: "a".repeat(64), repositorySha256,
      inventory: { entries: 1, symlinkPolicy: "reject", submodulePolicy: "reject" },
      snapshot: { method: "git-detached-worktree.v1", verifiedBeforeAfter: true },
    },
    policy: { configurationSha256: "c".repeat(64), sha256: "d".repeat(64) },
  };
  return { ...payload, payloadSha256: createHash("sha256").update(canonicalJson(payload)).digest("hex") };
}

function securityEnvelopeV2({ commit, tree }) {
  return {
    schema: "pipeline.security-evidence.v2",
    policy: { configurationSha256: "e".repeat(64) },
    input: { commit, tree, inputSha256: "f".repeat(64) },
    environment: { platform: process.platform, nodeVersion: process.version },
    capabilities: [{
      capabilityId: "cap.secrets", tool: { name: "gitleaks", version: null }, rulePack: { ref: "gitleaks-default", digest: null },
      status: "PASS", classification: "clean", findings: [],
      coverage: { subject: "candidate-tree", exclusions: [], ignored: [], unsupportedScope: [], truncation: { truncated: false, scannedFileCount: null, totalEligibleFileCount: null }, dataAge: { ageSeconds: 0, snapshotAt: null } },
      reason: null,
    }],
  };
}

function securityVerdictV2() {
  return {
    schema: "pipeline.security-verdict.v2", producedFrom: "pipeline.security-evidence.v2", exitAuthority: "v1-blocking-logic", note: "fixture", v1ExitCode: 0,
    plan: { required: ["cap.secrets"], optional: [], planDigest: "g".repeat(64), source: "fixture", resolvedPolicyDigest: "h".repeat(64) },
    capabilityOutcomes: { "cap.secrets": "pass" }, verdict: { blocking: false, offendingCapabilities: [] }, controls: [],
  };
}

/** A repository whose commit A is an approved low-rigor state, with the push gate and the security gate configured. */
function buildRepo(name) {
  const dir = tempDir(name);
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`fixture git ${args[0]} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const governance = createGovernanceScopeController({ hostStateRoot: join(dir, ".git", "fixture-hoststate") });
  const plan = governance.planDecision({ rootDir: dir, decision: "enroll", by: "disposable-carry-fixture" });
  governance.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  const commitA = commitApprovedMiniFixtureState(dir);
  const pushUrl = `https://example.invalid/${name}.git`;
  git("remote", "add", "origin", pushUrl);
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"),
    "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n  security:\n    mode: blocking\n    type: automated\n");
  const repo = { dir, git, commitA, repositorySha256: createHash("sha256").update(pushUrl).digest("hex") };
  bindEvidence(repo, commitA);
  return repo;
}

/** Writes the Verify record and the Security records (v1, v2) bound to `commit` and its tree. */
function bindEvidence(repo, commit) {
  const tree = repo.git("rev-parse", `${commit}^{tree}`);
  writeJson(repo.dir, VERIFY_PATH, verifyEvidenceFixture(commit));
  writeJson(repo.dir, SECURITY_PATH, securityEvidenceV1({ commit, tree, repositorySha256: repo.repositorySha256 }));
  writeJson(repo.dir, "evidence/security-latest.v2.json", securityEnvelopeV2({ commit, tree }));
  writeJson(repo.dir, "evidence/security-latest.v2.verdict.json", securityVerdictV2());
}

function commitFile(repo, relPath, text, message) {
  mkdirSync(dirname(join(repo.dir, relPath)), { recursive: true });
  writeFileSync(join(repo.dir, relPath), text);
  repo.git("add", "--", relPath);
  repo.git("commit", "-q", "-m", message);
  return repo.git("rev-parse", "HEAD");
}

/**
 * The passed-over commits of an accepted carry: an exported-evidence commit and an audit-bundle commit. A generated lifecycle.json is
 * deliberately not used: a registered package makes the independent publication review a separate duty (REVIEW-PACKAGE-REQUIRED),
 * and the Critic round is not carried by this decision.
 */
function addEvidenceOnlyCommits(repo) {
  return [
    commitFile(repo, "specs/fixture-feature/evidence/critic-round-1.md", "review\n", "docs(evidence): exported critic evidence"),
    commitFile(repo, "specs/fixture-feature/audit-bundles/bundle-1.json", "{}\n", "chore(audit): audit bundle"),
  ];
}

function fakeScanner(mode) {
  if (mode === "unavailable") return join(tempDir("no-scanner"), "gitleaks-not-here");
  const file = join(tempDir("scanner"), "gitleaks");
  writeFileSync(file, `#!/bin/sh\nexit ${mode === "finding" ? 2 : 0}\n`);
  chmodSync(file, 0o755);
  return file;
}

function runGuard(repo, scan) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: PUSH_COMMAND } }),
    encoding: "utf8", cwd: repo.dir, timeout: 60000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo.dir, PIPELINE_GITLEAKS_PATH: fakeScanner(scan) },
  });
  return { code: result.status, stderr: result.stderr ?? "" };
}

function runHook(repo, scan) {
  const impl = join(tempDir("hook"), "impl.mjs");
  writeFileSync(impl, renderImpl(LIB_DIR));
  const head = repo.git("rev-parse", "HEAD");
  const result = spawnSync(process.execPath, [impl, "origin", "https://example.invalid/fixture.git"], {
    input: `refs/heads/fixture ${head} refs/heads/fixture ${ZERO40}\n`,
    encoding: "utf8", cwd: repo.dir, timeout: 60000,
    env: { ...process.env, PIPELINE_GITLEAKS_PATH: fakeScanner(scan) },
  });
  return { code: result.status, stderr: result.stderr ?? "" };
}

function hookLog(repo) {
  const path = join(repo.dir, ".git", "agent-pipeline", "pre-push-hook", "log.jsonl");
  return existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
}

const CONSUMERS = [
  { name: "guard-push", run: runGuard, refused: 2 },
  { name: "pre-push hook template", run: runHook, refused: 1 },
];

for (const consumer of CONSUMERS) {
  test(`RDC1 ${consumer.name}: Verify and Security bound to A are accepted after evidence-only commits`, () => {
    const repo = buildRepo(`accept-${consumer.name.split(" ")[0]}`);
    addEvidenceOnlyCommits(repo);
    const outcome = consumer.run(repo, "clean");
    assert.equal(outcome.code, 0, outcome.stderr);
  });

  test(`RDC2 ${consumer.name}: one product-file commit is refused with the stable code and the reason`, () => {
    const repo = buildRepo(`product-${consumer.name.split(" ")[0]}`);
    addEvidenceOnlyCommits(repo);
    commitFile(repo, "src/app.mjs", "export const changed = true;\n", "feat: product line");
    const outcome = consumer.run(repo, "clean");
    assert.equal(outcome.code, consumer.refused, outcome.stderr);
    assert.match(outcome.stderr, /verify-latest\.json: commit=.*is stale.*EF-STALE-COMMIT.*PRODUCT-PATH-CHANGED/);
    assert.match(outcome.stderr, /security-latest\.json: commit=.*is stale.*EF-STALE-COMMIT.*PRODUCT-PATH-CHANGED/);
  });

  test(`RDC3 ${consumer.name}: a change of a gate-consumed file outside the evidence set is refused`, () => {
    const repo = buildRepo(`gatefile-${consumer.name.split(" ")[0]}`);
    commitFile(repo, "project/guard-config.json", "{}\n", "chore: guard configuration");
    const outcome = consumer.run(repo, "clean");
    assert.equal(outcome.code, consumer.refused, outcome.stderr);
    assert.match(outcome.stderr, /verify-latest\.json: commit=.*is stale.*EF-STALE-COMMIT.*PRODUCT-PATH-CHANGED/);
  });

  test(`RDC4 ${consumer.name}: a failed or unavailable secret scan refuses Security and still carries Verify`, () => {
    for (const [scan, reason] of [["finding", "SECRET-SCAN-FINDING"], ["unavailable", "SECRET-SCAN-UNAVAILABLE"]]) {
      const repo = buildRepo(`scan-${scan}-${consumer.name.split(" ")[0]}`);
      addEvidenceOnlyCommits(repo);
      const outcome = consumer.run(repo, scan);
      assert.equal(outcome.code, consumer.refused, outcome.stderr);
      assert.match(outcome.stderr, new RegExp(`security-latest\\.json: commit=.*is stale.*EF-STALE-COMMIT.*${reason}`), scan);
      assert.doesNotMatch(outcome.stderr, /verify-latest\.json: commit=/, `${scan}: a Verify record needs no scan and stays carried`);
    }
  });

  test(`RDC5 ${consumer.name}: a record bound to a commit that is not an ancestor is refused`, () => {
    const repo = buildRepo(`ancestor-${consumer.name.split(" ")[0]}`);
    repo.git("checkout", "-q", "-b", "side");
    const side = commitFile(repo, "specs/fixture-feature/evidence/side.md", "side\n", "docs(evidence): a side evidence commit");
    repo.git("checkout", "-q", "main");
    addEvidenceOnlyCommits(repo);
    bindEvidence(repo, side);
    const outcome = consumer.run(repo, "clean");
    assert.equal(outcome.code, consumer.refused, outcome.stderr);
    assert.match(outcome.stderr, /verify-latest\.json: commit=.*is stale.*EF-STALE-COMMIT.*NOT-AN-ANCESTOR/);
  });
}

test("RDC6 the hook log names the passed-over commits of an accepted carry", () => {
  const repo = buildRepo("hook-log");
  const passedOver = addEvidenceOnlyCommits(repo);
  assert.equal(runHook(repo, "clean").code, 0);
  const entry = hookLog(repo).at(-1);
  assert.equal(entry.verdict, "allowed");
  const verify = entry.carriedForward.find((row) => row.record === VERIFY_PATH);
  assert.equal(verify.evidenceCommit, repo.commitA);
  assert.deepEqual(verify.passedOverCommits, passedOver);
});

test("RDC7 the push-prepare readback names the passed-over commits", () => {
  const repo = buildRepo("prepare-readback");
  const passedOver = addEvidenceOnlyCommits(repo);
  const head = repo.git("rev-parse", "HEAD");
  const previous = process.env.PIPELINE_GITLEAKS_PATH;
  process.env.PIPELINE_GITLEAKS_PATH = fakeScanner("clean");
  try {
    const verify = prepareFreshness("verify-evidence", VERIFY_PATH, repo.dir, head);
    assert.equal(verify.ok, true, verify.message);
    for (const commit of passedOver) assert.ok(verify.message.includes(commit.slice(0, 8)), `names ${commit.slice(0, 8)}: ${verify.message}`);
    assert.match(verify.message, /evidence-only carry-forward/);
  } finally {
    if (previous === undefined) delete process.env.PIPELINE_GITLEAKS_PATH; else process.env.PIPELINE_GITLEAKS_PATH = previous;
  }
});
