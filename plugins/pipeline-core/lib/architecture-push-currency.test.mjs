// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspectArchitecturePushCurrency } from "./architecture-push-currency.mjs";
import * as currencyModule from "./architecture-push-currency.mjs";
import { drivePushInit } from "../scripts/push-init.mjs";
import { preflightCriticDispatch } from "../scripts/critic-dispatch-preflight.mjs";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "architecture-push-currency-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "contract.mjs"), "export const value = 1;\n");
  git("add", "."); git("commit", "-q", "-m", "initial contract");
  return { dir, git, commit: () => git("rev-parse", "HEAD") };
}

test("unadopted repository stays outside AC-18 push map gate", () => {
  const f = fixture();
  try { assert.deepEqual(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).applicable, false); }
  finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("a candidate cannot become unadopted by deleting its committed map", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture", "map"), { recursive: true });
    writeFileSync(join(f.dir, "architecture", "map", "index.md"), "# Map\n");
    writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "adopt map");
    f.git("rm", "-q", "-r", "architecture/map");
    f.git("commit", "-q", "-m", "remove map");
    const removed = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() });
    assert.equal(removed.ok, false);
    assert.match(removed.reason, /removed after adoption/u);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("a valid deferred adoption decision may precede the first map commit", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture"), { recursive: true });
    writeFileSync(join(f.dir, "architecture", "adoption-state.json"), JSON.stringify({ schema: "pipeline.adoption-state.v1", state: "deferred", scope: ["specs/example/"] }));
    f.git("add", "."); f.git("commit", "-q", "-m", "defer adoption");
    const deferred = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() });
    assert.equal(deferred.ok, true);
    assert.equal(deferred.applicable, false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("approved or malformed adoption state without a map fails closed", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture"), { recursive: true });
    const path = join(f.dir, "architecture", "adoption-state.json");
    writeFileSync(path, JSON.stringify({ schema: "pipeline.adoption-state.v1", state: "approved-scoped", scope: ["specs/example/"] }));
    f.git("add", "."); f.git("commit", "-q", "-m", "approve scoped adoption");
    const approved = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() });
    assert.equal(approved.ok, false);
    assert.match(approved.reason, /requires a map/u);
    writeFileSync(path, "{broken\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "malform adoption");
    const malformed = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() });
    assert.equal(malformed.ok, false);
    assert.match(malformed.reason, /malformed/u);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("candidate sees contract changes after map update and checkpoint binds debt", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture", "map"), { recursive: true });
    writeFileSync(join(f.dir, "architecture", "map", "index.md"), "# Map\n");
    writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "map contract");
    assert.equal(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).stale, false);
    writeFileSync(join(f.dir, "src", "contract.mjs"), "export const value = 2;\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "change contract");
    const stale = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit(), checkpoint: true });
    assert.equal(stale.stale, true);
    assert.equal(stale.stalenessDebt.length, 1);
    assert.equal(stale.stalenessDebt[0].target, "architecture/map/core.md");
    writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core v2\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "refresh map");
    assert.equal(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).stale, false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("partial map fails closed while wildcard and append-only data do not stale the map", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.dir, "architecture", "map"), { recursive: true });
    writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n  - backlog/items/**\n  - backlog/transitions.ndjson\n---\n# Core\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "partial map");
    assert.match(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).reason, /index is missing/u);
    writeFileSync(join(f.dir, "architecture", "map", "index.md"), "# Map\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "complete map");
    mkdirSync(join(f.dir, "backlog", "items"), { recursive: true });
    writeFileSync(join(f.dir, "backlog", "transitions.ndjson"), "{}\n");
    writeFileSync(join(f.dir, "backlog", "items", "item.md"), "# Item\n");
    f.git("add", "."); f.git("commit", "-q", "-m", "append backlog");
    assert.equal(inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() }).stale, false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

// N25 / D208: one shared formatter names each stale contract, its concept map and the sanctioned step for every caller.
function staleFixture() {
  const f = fixture();
  mkdirSync(join(f.dir, "architecture", "map"), { recursive: true });
  writeFileSync(join(f.dir, "architecture", "map", "index.md"), "# Map\n");
  writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core\n");
  // What a Critic dispatch preflight reads from the candidate before the map check: manifest, governance, Spec.
  for (const dir of [".claude", "governance/guidelines", "governance/policies", "specs"]) mkdirSync(join(f.dir, dir), { recursive: true });
  writeFileSync(join(f.dir, ".claude", "pipeline.yaml"), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(f.dir, "governance", "guidelines", "review.md"), "Review changed code.\n");
  writeFileSync(join(f.dir, "governance", "policies", "checklist.md"), "- verify\n");
  writeFileSync(join(f.dir, "specs", "spec.md"), "# Spec\n");
  f.git("add", "."); f.git("commit", "-q", "-m", "adopt map");
  // A comment-only change to the declared contract: D208 grants no relief, so the map is stale.
  writeFileSync(join(f.dir, "src", "contract.mjs"), "// reworded comment only\nexport const value = 1;\n");
  f.git("add", "."); f.git("commit", "-q", "-m", "comment-only contract change");
  return f;
}
function refreshMap(f) {
  writeFileSync(join(f.dir, "architecture", "map", "core.md"), "---\nid: core\npublicContracts:\n  - src/contract.mjs\n---\n# Core, covers the comment change\n");
  f.git("add", "."); f.git("commit", "-q", "-m", "refresh map");
}

test("the shared refusal formatter names every stale contract, its concept map and the sanctioned step", () => {
  const f = staleFixture();
  try {
    assert.equal(typeof currencyModule.formatArchitectureCurrencyRefusal, "function", "the one shared formatter is exported next to the check");
    const currency = inspectArchitecturePushCurrency({ projectDir: f.dir, commit: f.commit() });
    assert.equal(currency.stale, true, "a comment-only contract change stays stale (no relief)");
    const lines = currencyModule.formatArchitectureCurrencyRefusal(currency);
    const text = lines.join("\n");
    assert.match(text, /1 declared public contract\(s\) changed after their concept map/u);
    assert.ok(lines.some((line) => line.includes("src/contract.mjs") && line.includes("architecture/map/core.md")), text);
    assert.match(text, /update the concept map in architecture\/map\/core\.md/u);
    assert.match(text, /commit it/u);
    assert.match(text, /rebuild the candidate before Critic\/Verify/u);
    const invalid = currencyModule.formatArchitectureCurrencyRefusal({ ok: false, reason: "candidate architecture map index is missing" });
    assert.deepEqual(invalid, ["Reason: candidate architecture map index is missing."]);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("ANCHOR (D208): a comment-only contract change after the map commit is red in push-init and in the Critic dispatch preflight, both naming contract and concept map, and both go green after a map commit", () => {
  const f = staleFixture();
  try {
    const greenGate = () => ({ ok: true, report: { satisfiable: true, checks: [] } });
    const greenPrepare = () => ({ ok: true, report: { ready: true, humanApproval: "chat", checks: [] }, lines: { authorize: [], approvePush: ["approve"], gitPush: "push" } });
    const init = () => drivePushInit({ rootDir: f.dir, by: "tester", remote: "origin", destination: "refs/heads/main", assessPushGateSatisfiability: greenGate, pushPrepareReport: greenPrepare });
    const preflight = (commit) => {
      try {
        preflightCriticDispatch({ root: f.dir, base: f.git("rev-list", "--max-parents=0", "HEAD"), candidate: commit, specPath: "specs/spec.md", guardrailPaths: [], evidencePaths: ["evidence/verify.json"] });
        return null;
      } catch (error) { return error; }
    };
    const red = init();
    assert.equal(red.outcome, "precondition-unmet", JSON.stringify(red));
    const check = red.checks.find((entry) => entry.id === "architecture-map-currency");
    assert.ok(check, JSON.stringify(red.checks));
    assert.equal(check.ok, false);
    assert.ok(check.message.includes("src/contract.mjs") && check.message.includes("architecture/map/core.md"), check.message);
    assert.match(check.remedy, /commit it/u);
    assert.ok(red.recovery.blockers.some((blocker) => blocker.id === "architecture-map-currency" && blocker.message.includes("architecture/map/core.md")));
    const refusal = preflight(f.commit());
    assert.equal(refusal?.code, "CDP-ARCHITECTURE-MAP-STALE", String(refusal));
    assert.ok(refusal.details.reason.includes("src/contract.mjs") && refusal.details.reason.includes("architecture/map/core.md"), refusal.details.reason);
    assert.deepEqual(refusal.details.staleContracts.map(({ contract, target }) => ({ contract, target })), [{ contract: "src/contract.mjs", target: "architecture/map/core.md" }]);
    assert.match(refusal.details.repair, /rebuild the candidate before Critic\/Verify/u);
    refreshMap(f);
    const green = init();
    assert.equal(green.outcome, "chat-ready", JSON.stringify(green));
    assert.ok(green.steps.some((step) => step.id === "architecture-map-currency" && step.ok === true), "the green check is recorded as a step");
    assert.equal(preflight(f.commit())?.code?.startsWith("CDP-ARCHITECTURE") ?? false, false, "the map commit clears the early refusal");
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("a never-adopted repository keeps push-init and the preflight free of any architecture line", () => {
  const f = fixture();
  try {
    const result = drivePushInit({
      rootDir: f.dir, by: "tester", remote: "origin", destination: "refs/heads/main",
      assessPushGateSatisfiability: () => ({ ok: true, report: { satisfiable: true, checks: [] } }),
      pushPrepareReport: () => ({ ok: true, report: { ready: true, humanApproval: "chat", checks: [] }, lines: { authorize: [], approvePush: ["approve"], gitPush: "push" } }),
    });
    assert.equal(result.outcome, "chat-ready", JSON.stringify(result));
    assert.equal(result.steps.some((step) => /architecture/u.test(step.id)), false);
    let code = null;
    try { preflightCriticDispatch({ root: f.dir, base: f.git("rev-list", "--max-parents=0", "HEAD"), candidate: f.commit(), specPath: "specs/spec.md", guardrailPaths: [], evidencePaths: ["evidence/verify.json"] }); } catch (error) { code = error.code; }
    assert.equal(String(code).startsWith("CDP-ARCHITECTURE"), false, String(code));
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
