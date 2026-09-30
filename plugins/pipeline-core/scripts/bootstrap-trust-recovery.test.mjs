// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyBootstrapTrustRecovery, main, planBootstrapTrustRecovery } from "./bootstrap-trust-recovery.mjs";

function fixture(fn) {
  const home = mkdtempSync(join(tmpdir(), "pipeline-bootstrap-recovery-"));
  const root = join(home, "repo");
  const directory = join(home, "po-key");
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "pipeline.user.yaml"), 'gates:\n  human_approval: "signature"\n');
  writeFileSync(join(root, "project", "critical-human-proof.json"), '{"schema":"pipeline.critical-human-proof-policy.v3","trustAnchors":[]}\n');
  const options = { rootDir: root, mode: "new", directory, humanName: "Human", existingKey: "none",
    runGit: () => ({ status: 0, stdout: join(root, ".git") }) };
  return Promise.resolve().then(() => fn(options)).finally(() => rmSync(home, { recursive: true, force: true }));
}

test("recovery plan is bound to the public preimage and refuses an in-repository key directory", () => fixture(async (options) => {
  const plan = planBootstrapTrustRecovery(options);
  assert.equal(plan.code, "BTR-PLAN-READY");
  assert.equal(plan.intent.existingKeyPathSha256, null);
  assert.equal(plan.applyAction.kind, "external-operator");
  assert.equal(plan.applyAction.argv.at(-1), plan.planSha256);
  assert.equal(planBootstrapTrustRecovery({ ...options, directory: join(options.rootDir, "scratch", "key") }).code,
    "BTR-KEY-DIRECTORY-IN-REPOSITORY");
  writeFileSync(join(options.rootDir, "pipeline.user.yaml"), 'gates:\n  human_approval: "chat"\n');
  assert.notEqual(planBootstrapTrustRecovery(options).planSha256, plan.planSha256);
}));

test("recovery requires exact digest and explicit attended confirmation before bounded setup", () => fixture(async (options) => {
  const plan = planBootstrapTrustRecovery(options);
  let setupCount = 0;
  const apply = () => { setupCount += 1; return { ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE" }; };
  const audit = () => "audit.json";
  assert.equal((await applyBootstrapTrustRecovery({ ...options, planSha256: "0".repeat(64) },
    { confirm: async () => plan.planSha256, apply, audit })).code, "BTR-PLAN-DRIFT");
  assert.equal((await applyBootstrapTrustRecovery({ ...options, planSha256: plan.planSha256 },
    { confirm: async () => "CONFIRM", apply, audit })).code, "BTR-NOT-CONFIRMED");
  assert.equal(setupCount, 0);
  const result = await applyBootstrapTrustRecovery({ ...options, planSha256: plan.planSha256 },
    { confirm: async () => plan.planSha256, apply, audit });
  assert.equal(result.code, "BTR-RECOVERED");
  assert.equal(result.basis, "external-terminal-confirmed-unattested");
  assert.equal(setupCount, 1);
}));

test("recovery CLI rejects non-TTY activation without invoking setup", () => fixture(async (options) => {
  const lines = [];
  const code = await main(["apply", "--root", options.rootDir, "--mode", "new", "--directory", options.directory,
    "--human-name", "Human", "--existing-key", "none", "--plan-sha256", "0".repeat(64)], {
    stdin: { isTTY: false }, stdout: { isTTY: false, write: (s) => lines.push(s) }, stderr: { write: (s) => lines.push(s) },
  });
  assert.equal(code, 2);
  assert.match(lines.join(""), /BTR-EXTERNAL-TTY-REQUIRED/u);
}));

test("recovery reports source complete if audit fails, without pretending the setup rolled back", () => fixture(async (options) => {
  const plan = planBootstrapTrustRecovery(options);
  const result = await applyBootstrapTrustRecovery({ ...options, planSha256: plan.planSha256 }, {
    confirm: async () => plan.planSha256,
    apply: () => ({ ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE" }),
    audit: () => { throw new Error("disk unavailable"); },
  });
  assert.equal(result.code, "BTR-SOURCE-COMPLETE-AUDIT-UNAVAILABLE");
  assert.equal(result.ok, false);
}));

test("successful attended recovery writes a bounded, replay-safe private audit receipt", () => fixture(async (options) => {
  const plan = planBootstrapTrustRecovery(options);
  const input = { ...options, planSha256: plan.planSha256 };
  const dependencies = { confirm: async () => plan.planSha256,
    apply: () => ({ ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE" }) };
  const first = await applyBootstrapTrustRecovery(input, dependencies);
  assert.equal(first.code, "BTR-RECOVERED");
  assert.equal(existsSync(first.auditPath), true);
  const audit = JSON.parse(readFileSync(first.auditPath, "utf8"));
  assert.equal(audit.planSha256, plan.planSha256);
  assert.equal(audit.basis, "external-terminal-confirmed-unattested");
  assert.equal(JSON.stringify(audit).includes("po-private.pem"), false);
  const second = await applyBootstrapTrustRecovery(input, dependencies);
  assert.equal(second.code, "BTR-RECOVERED");
  assert.equal(second.auditPath, first.auditPath);
}));
