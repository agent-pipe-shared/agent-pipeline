#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// D3 (Antigravity and Codex greenfield, ADR draft-authority-carry-forward-and-signed-reconcile-commit point 3):
// the close steps before the signing ceremony leave a clean tree, and a signed feature-package reconcile deposits
// ONE commit capability bound to exactly its own files and bytes, consumed once by the pre-commit hook's existing
// commit-scope consumption (toolName Bash, `git commit`, pipelineCommitScope), expiring with the apply window and
// with a HEAD or tree change. The hook-shaped consume below mirrors scripts/pre-commit-hook-install.mjs
// (commitOverrideCourse): the scope object, the denial text and the finding rule are the hook's, not new inventions.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./pipeline-state.mjs";
import { observeCleanCandidate } from "./po-approval-request.mjs";
import { commitPipelineOwned } from "./commit-pipeline-owned.mjs";
import { validateFeaturePackage } from "../lib/feature-package-topology.mjs";
import { loadProtectedTestPathRules, protectedTestPathRuleFor } from "../lib/protected-test-paths.mjs";
import * as hgo from "../lib/human-guard-override.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOW = "2026-07-31T12:00:00.000Z";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const h = (c) => c.repeat(64);
const canonical = (value) => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const roots = [];
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

const MANIFEST = "specs/feature/lifecycle.json";
const RESULT = "specs/feature/result.md";

function stateValue() {
  const submission = { schema: "pipeline.plan-submission.v1", featureId: "feature", planPath: "specs/feature/prd_feature.md", planSha256: "", specPath: "specs/feature/spec.md", specSha256: "", profile: "feature", profileSha256: h("5"), submittedBy: "Coordinator", submittedAt: "2026-07-31T10:00:00.000Z" };
  return { submission };
}

function fixture(name) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `d3-reconcile-commit-${name}-`))); roots.push(root);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(root, ".claude")); mkdirSync(join(root, "specs", "feature"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".claude/pipeline-state.json\n.git-common/\n");
  writeFileSync(join(root, "specs/feature/prd_feature.md"), "prd\n"); writeFileSync(join(root, "specs/feature/spec.md"), "spec\n");
  const historical = Buffer.from("# Feature result\n\nExisting canonical Markdown must survive intact.\n", "utf8");
  writeFileSync(join(root, RESULT), historical);
  mkdirSync(join(root, ".git-common"), { mode: 0o700 });
  const prdSha = hash(readFileSync(join(root, "specs/feature/prd_feature.md"))), specSha = hash(readFileSync(join(root, "specs/feature/spec.md")));
  const value = {
    schema: "pipeline.state.v0", activeFeature: { id: "feature", planPath: "specs/feature/prd_feature.md", phase: "implementation" }, planApproved: true,
    continuity: {
      schema: "pipeline.continuity.v0", featureId: "feature", revision: 7,
      runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
      authority: { prd: { path: "specs/feature/prd_feature.md", sha256: prdSha }, spec: { path: "specs/feature/spec.md", sha256: specSha }, result: null },
      queueHead: { packageId: "pkg", actionId: "review", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
      blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 7, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, closeTransition: null,
      capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
    }, updatedAt: "2026-07-31T11:00:00.000Z",
  };
  const authority = { schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: h("1"), runtimeSha256: h("2"), receiptSha256: h("3"), repositoryFingerprint: h("4"), planPath: value.continuity.authority.prd.path, planSha256: prdSha, specPath: value.continuity.authority.spec.path, specSha256: specSha };
  const submission = { ...stateValue().submission, planSha256: prdSha, specSha256: specSha };
  value.planSubmission = submission;
  value.planApproval = { schema: "pipeline.plan-approval.v4", approvedBy: "PO", approvedAt: "2026-07-31T10:05:00.000Z", submissionSha256: hash(canonical(submission)), profileSha256: submission.profileSha256, poGateAuthority: authority, priorInvalidationSha256: null };
  const statePath = join(root, ".claude", "pipeline-state.json"); writeFileSync(statePath, JSON.stringify(value, null, 2) + "\n");
  for (const name of ["acceptance.md", "candidate-evidence.md"]) writeFileSync(join(root, "specs/feature", name), `${name}\n`);
  const artifact = (kind, path, auth, mutability) => ({ class: kind, path, sha256: hash(readFileSync(join(root, path))), authority: auth, mutability, retention: "active" });
  const manifest = {
    schema: "pipeline.feature-package.v1", feature: { id: "feature", rigor: 1 }, state: "implementing",
    artifacts: [
      artifact("prd", "specs/feature/prd_feature.md", true, "mutable"), artifact("spec", "specs/feature/spec.md", true, "immutable"),
      artifact("acceptance", "specs/feature/acceptance.md", true, "mutable"), artifact("result", RESULT, false, "immutable"),
      artifact("candidate-evidence", "specs/feature/candidate-evidence.md", false, "immutable"),
    ], candidate: null, supersedes: null,
  };
  writeFileSync(join(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(validateFeaturePackage(root, MANIFEST).ok, true);
  git("add", "-A"); git("commit", "-q", "-m", "baseline");
  return { root, git, statePath };
}

function invoke(root, argv, extra = {}) {
  const out = []; const err = []; const log = console.log; const error = console.error;
  console.log = (...v) => out.push(v.join(" ")); console.error = (...v) => err.push(v.join(" "));
  try { return { status: run(argv, { dir: root, now: () => NOW, gitCommonDir: () => ({ ok: true, path: join(root, ".git-common") }), ...extra }), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}
const reconcileDeps = { featurePackageReconcileApproval: () => ({ ok: true }), gitCandidate: () => ({ ok: true, commit: h("a"), tree: h("b") }) };
const status = (f) => f.git("status", "--porcelain=v1", "--untracked-files=all");

/** Steps 1 to 3 of the close route, up to the pending reconcile: returns the reconcile plan digest. */
function bootstrapped(f) {
  const before = status(f);
  const planned = invoke(f.root, ["continuity-result-bootstrap-plan"]); assert.equal(planned.status, 0, planned.err);
  const p = JSON.parse(planned.out);
  assert.equal(status(f), before, "the read-only bootstrap plan leaves the tracked and the untracked tree as it was");
  const applied = invoke(f.root, p.applyAction.argv.slice(1)); assert.equal(applied.status, 0, applied.err);
  return JSON.parse(applied.out).completion;
}

/** Marks the feature closed in State so the dynamic PB-CONTINUITY class protects its result and package files. */
function closeInState(f) {
  const value = JSON.parse(readFileSync(f.statePath, "utf8"));
  value.closedFeatures = [{ id: "feature", continuityClose: { result: { path: RESULT }, package: { path: MANIFEST } } }];
  writeFileSync(f.statePath, JSON.stringify(value, null, 2) + "\n");
}

/** The pre-commit hook's own scope for the currently staged index (scripts/pre-commit-hook-install.mjs commitOverrideCourse). */
function hookCall(f) {
  const head = f.git("rev-parse", "HEAD").trim();
  const staged = f.git("diff", "--cached", "--name-only", "-z").split("\0").filter(Boolean);
  const { rules } = loadProtectedTestPathRules({ rootDir: f.root });
  const findings = staged.map((path) => ({ path, rule: protectedTestPathRuleFor(rules, path) })).filter((row) => row.rule && f.git("log", "--format=%H", "-1", "--", row.path).trim() !== "");
  const protectedPaths = [...new Set(findings.map((row) => row.path))].sort();
  const ruleIds = [...new Set(findings.map((row) => row.rule.id))].sort();
  const indexTree = f.git("write-tree").trim();
  const scope = { schema: "pipeline.pre-commit-protected-scope.v1", head, indexTree, protectedPaths };
  const scopeSha256 = createHash("sha256").update(JSON.stringify(scope)).digest("hex");
  return {
    protectedPaths, ruleIds,
    toolName: "Bash", toolInput: { command: "git commit", pipelineCommitScope: scope },
    denials: [{ guard: "pre-commit-hook", reason: `PB-GUARD-HOOKS: protected path(s) staged for commit; head ${head}; index tree ${indexTree}; paths ${protectedPaths.join(", ")}; rules ${ruleIds.join(", ")}; scope ${scopeSha256}` }],
  };
}
const consume = (f, extra = {}) => { const { toolName, toolInput, denials } = hookCall(f); return hgo.consumeHumanGuardOverride({ rootDir: f.root, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials, ...extra }); };

/** The signed apply of the whole close route: everything up to and including feature-package-reconcile. */
function signedApply(f, { committedBefore = true } = {}) {
  const completion = bootstrapped(f);
  if (committedBefore) assert.equal(commitPipelineOwned(["--root", f.root, "--agent"]).status, "committed");
  closeInState(f);
  const applied = invoke(f.root, ["feature-package-reconcile", "--root", f.root, "--manifest", MANIFEST, "--plan-sha256", completion.planSha256], reconcileDeps);
  return { completion, applied, receipt: JSON.parse(applied.out) };
}

test("D3 (1): the read-only reconcile plan leaves the tracked and the untracked tree clean, and the clean-tree check passes right after it", () => {
  const f = fixture("plan-clean");
  const planned = invoke(f.root, ["continuity-result-bootstrap-plan"]); assert.equal(planned.status, 0, planned.err);
  assert.equal(status(f), "");
  const candidate = observeCleanCandidate(f.root);
  assert.equal(candidate.commit, f.git("rev-parse", "HEAD").trim());
});

test("D3 (1): after the result bootstrap the refusal names the one command that commits the Pipeline's own result file, and that command makes the check pass", () => {
  const f = fixture("owned-result");
  bootstrapped(f);
  assert.match(status(f), /M specs\/feature\/result\.md/);
  assert.throws(() => observeCleanCandidate(f.root), (error) => {
    assert.match(error.message, /repository must be clean before preparing a PO approval request/);
    assert.match(error.message, /commit-pipeline-owned\.mjs/);
    assert.match(error.message, /--agent/);
    return true;
  });
  const committed = commitPipelineOwned(["--root", f.root, "--agent"]);
  assert.equal(committed.status, "committed"); assert.deepEqual(committed.owned, [RESULT]);
  assert.equal(status(f), "");
  assert.equal(observeCleanCandidate(f.root).commit, f.git("rev-parse", "HEAD").trim());
});

test("D3 (1): a dirty result file whose bytes State does not bind is not the Pipeline's own; the refusal still names a command, not a dead end", () => {
  const f = fixture("foreign-result");
  bootstrapped(f);
  writeFileSync(join(f.root, RESULT), `${readFileSync(join(f.root, RESULT), "utf8")}\nhand edit\n`);
  assert.throws(() => observeCleanCandidate(f.root), (error) => {
    assert.doesNotMatch(error.message, /commit-pipeline-owned\.mjs/);
    assert.match(error.message, /git status --short/);
    assert.match(error.message, /specs\/feature\/result\.md/);
    return true;
  });
  assert.equal(commitPipelineOwned(["--root", f.root, "--agent"]).status, "refused");
});

test("D3 (2): the signed apply deposits one commit capability bound to exactly its own file and bytes; the hook-shaped commit consumes it once", () => {
  const f = fixture("arm-consume");
  const { receipt, applied } = signedApply(f);
  assert.equal(applied.status, 0, applied.err);
  assert.equal(receipt.status, "applied");
  assert.equal(receipt.commitCapability.status, "armed");
  assert.deepEqual(receipt.commitCapability.paths, [MANIFEST]);
  assert.deepEqual(f.git("diff", "--cached", "--name-only").trim().split("\n"), [MANIFEST], "only the reconcile's own file is staged");
  const call = hookCall(f);
  assert.deepEqual(call.protectedPaths, [MANIFEST]);
  assert.match(call.ruleIds[0], /^PB-CONTINUITY-feature-package$/);
  const first = consume(f);
  assert.equal(first.status, "consumed", JSON.stringify(first));
  const capDir = join(f.root, ".git/agent-pipeline/human-guard-overrides/capabilities");
  const stored = readdirSync(capDir).map((name) => JSON.parse(readFileSync(join(capDir, name), "utf8")));
  assert.equal(stored.length, 1, "exactly ONE capability is deposited");
  assert.equal(stored[0].status, "consumed"); assert.deepEqual(stored[0].eligiblePaths, [MANIFEST]);
  const second = consume(f);
  assert.equal(second.status, "absent", "a second presentation of the same commit finds nothing to consume");
});

test("D3 (2): arming refuses bytes other than the ones the signed apply wrote, with the typed code and the re-plan command", () => {
  const f = fixture("arm-bytes");
  const completion = bootstrapped(f); assert.equal(commitPipelineOwned(["--root", f.root, "--agent"]).status, "committed");
  closeInState(f);
  writeFileSync(join(f.root, MANIFEST), `${readFileSync(join(f.root, MANIFEST), "utf8")}\n`);
  assert.throws(() => hgo.armReconcileCommitCapability({ rootDir: f.root, pluginRoot: PLUGIN_ROOT, reconcilePlanSha256: completion.planSha256, files: [{ path: MANIFEST, sha256: h("9") }] }),
    (error) => error.code === "HGO-RC-BYTES" && /continuity-result-bootstrap-plan/.test(error.heal));
  assert.equal(f.git("diff", "--cached", "--name-only").trim(), "", "a refusal stages nothing");
});

/** A presentation that is not the capability's exact scope is not admitted, and the capability stays armed and unspent
 * (the hook then falls back to its own commit-scoped course, which is the pre-existing second signature route). */
function notAdmitted(f, result, why) {
  assert.notEqual(result.status, "consumed", why);
  const dir = join(f.root, ".git/agent-pipeline/human-guard-overrides/capabilities");
  assert.deepEqual(readdirSync(dir).map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")).status), ["armed"], "the capability is not spent by a non-matching presentation");
}

test("D3 (2): a path outside the capability, or a changed byte of its own file, is not admitted", () => {
  const extra = fixture("arm-extra-path");
  signedApply(extra);
  writeFileSync(join(extra.root, "specs/feature/spec.md"), "spec changed\n"); extra.git("add", "specs/feature/spec.md");
  notAdmitted(extra, consume(extra), "an additional staged path changes the scope");
  const bytes = fixture("arm-changed-byte");
  signedApply(bytes);
  writeFileSync(join(bytes.root, MANIFEST), `${readFileSync(join(bytes.root, MANIFEST), "utf8")}\n`); bytes.git("add", MANIFEST);
  notAdmitted(bytes, consume(bytes), "a changed byte changes the staged tree");
});

test("D3 (2): the capability expires with the apply window and with a HEAD change", () => {
  const late = fixture("arm-expired");
  signedApply(late);
  const expired = consume(late, { nowMs: Date.now() + 2 * 60 * 60 * 1000 });
  assert.equal(expired.status, "replan"); assert.equal(expired.code, "HGO-EXPIRED");
  const moved = fixture("arm-head-moved");
  signedApply(moved);
  writeFileSync(join(moved.root, "unrelated.txt"), "x\n"); moved.git("add", "unrelated.txt");
  moved.git("commit", "-q", "-m", "unrelated commit that moves HEAD", "--", "unrelated.txt");
  notAdmitted(moved, consume(moved), "a HEAD move changes the scope");
});

test("D3 (3): a staged foreign path refuses the apply BEFORE the proof is consumed, with a typed code and the command that clears it; the retry then arms", () => {
  const f = fixture("foreign-staged");
  const completion = bootstrapped(f); assert.equal(commitPipelineOwned(["--root", f.root, "--agent"]).status, "committed");
  closeInState(f);
  writeFileSync(join(f.root, "unrelated.txt"), "x\n"); f.git("add", "unrelated.txt");
  const manifestBefore = readFileSync(join(f.root, MANIFEST));
  let approvals = 0;
  const args = ["feature-package-reconcile", "--root", f.root, "--manifest", MANIFEST, "--plan-sha256", completion.planSha256];
  const refused = invoke(f.root, args, { ...reconcileDeps, featurePackageReconcileApproval: () => { approvals += 1; return { ok: true }; } });
  assert.equal(refused.status, 2);
  assert.match(refused.err, /HGO-RC-FOREIGN-STAGED/); assert.match(refused.err, /git restore --staged -- unrelated\.txt/);
  assert.equal(approvals, 0, "the signed proof is not consumed by a refusal the precheck can see");
  assert.deepEqual(readFileSync(join(f.root, MANIFEST)), manifestBefore, "zero mutation");
  f.git("restore", "--staged", "--", "unrelated.txt");
  const retried = invoke(f.root, args, reconcileDeps);
  assert.equal(retried.status, 0, retried.err); assert.equal(JSON.parse(retried.out).commitCapability.status, "armed");
});

test("D3 (3): with no protected path in the reconcile commit nothing is armed and nothing is staged (exit 0)", () => {
  const f = fixture("not-needed");
  const completion = bootstrapped(f); assert.equal(commitPipelineOwned(["--root", f.root, "--agent"]).status, "committed");
  const applied = invoke(f.root, ["feature-package-reconcile", "--root", f.root, "--manifest", MANIFEST, "--plan-sha256", completion.planSha256], reconcileDeps);
  assert.equal(applied.status, 0, applied.err);
  assert.equal(JSON.parse(applied.out).commitCapability.status, "not-needed");
  assert.equal(f.git("diff", "--cached", "--name-only").trim(), "");
});
