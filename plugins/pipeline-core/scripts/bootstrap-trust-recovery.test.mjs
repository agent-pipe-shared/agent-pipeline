// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyBootstrapTrustRecovery, confirmOnTerminal, main, planBootstrapTrustRecovery, readTypedLine } from "./bootstrap-trust-recovery.mjs";

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

// D165-S5 (W1): the line reader replaced readline/promises, whose close() dropped a second pasted line. The earlier
// intent of this case is kept: the digest request is the reader's prompt argument, never a separate write before it.
test("recovery confirmation hands the digest request to the line reader as its prompt, so it is not written twice", async () => {
  const plan = { planSha256: "a".repeat(64), intent: { root: "/repo" } };
  const prompts = [];
  const written = [];
  const readLine = (prompt) => { prompts.push(prompt); return `  ${plan.planSha256}\r`; };
  const answer = await confirmOnTerminal(plan, { stdin: {}, stdout: { write: (s) => written.push(s) } }, readLine);
  assert.equal(answer, plan.planSha256);
  assert.deepEqual(prompts, [`Type the plan digest ${plan.planSha256} to continue: `]);
  assert.doesNotMatch(written.join(""), /Type the plan digest/u);
  assert.match(written.join(""), /First-anchor recovery for \/repo\. This does not waive any approval gate\./u);
});

test("D165-S5 a second pasted line is not swallowed: each prompt consumes exactly one line, the next prompt gets the next", async () => {
  const consumed = [];
  const source = Buffer.from("first-answer\nsecond-answer\n");
  let position = 0;
  const read = (_fd, buffer) => { if (position >= source.length) return 0; buffer[0] = source[position]; position += 1; return 1; };
  assert.equal(readTypedLine(0, read), "first-answer");
  assert.equal(position, "first-answer\n".length, "exactly the first line and its newline were consumed");
  assert.equal(readTypedLine(0, read), "second-answer");
  const plan = { planSha256: "b".repeat(64), intent: { root: "/repo" } };
  let rest = `${plan.planSha256}\nnext-value\n`;
  const readLine = () => { const at = rest.indexOf("\n"); const line = rest.slice(0, at); rest = rest.slice(at + 1); consumed.push(line); return line; };
  assert.equal(await confirmOnTerminal(plan, { stdin: {}, stdout: { write() {} } }, readLine), plan.planSha256);
  assert.equal(rest, "next-value\n", "the pasted second line stays available for the next prompt");
  assert.equal(readLine(), "next-value");
});

test("D165-S5 a single-line answer behaves as before and an end of input before an answer fails closed", () => fixture(async (options) => {
  assert.equal(readTypedLine(0, (_fd, buffer) => { buffer[0] = 120; return 1; }, 1), "x", "a bounded run without a newline still returns what was typed");
  assert.equal(readTypedLine(0, () => 0), "", "end of input with nothing typed is the empty answer");
  const plan = planBootstrapTrustRecovery(options);
  let setupCount = 0;
  const result = await applyBootstrapTrustRecovery({ ...options, planSha256: plan.planSha256 }, {
    confirm: (p) => confirmOnTerminal(p, { stdin: {}, stdout: { write() {} } }, () => readTypedLine(0, () => 0)),
    apply: () => { setupCount += 1; return { ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE" }; }, audit: () => "audit.json",
  });
  assert.equal(result.code, "BTR-NOT-CONFIRMED");
  assert.equal(setupCount, 0);
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
