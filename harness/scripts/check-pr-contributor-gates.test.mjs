#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expectedAcceptanceLine, readClaContract, runCli, validatePrContributorGates } from "./check-pr-contributor-gates.mjs";

const AUTHOR_NAME = "External Contributor";
const AUTHOR_EMAIL = "contributor@example.invalid";
const LOGIN = "external-contributor";
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function commit(root, subject, signed = true) {
  writeFileSync(join(root, "change.txt"), `${subject}\n`, "utf8");
  git(root, "add", ".");
  const args = ["commit", "-q", "-m", subject];
  if (signed) args.push("-m", `Signed-off-by: ${AUTHOR_NAME} <${AUTHOR_EMAIL}>`);
  git(root, ...args);
  return git(root, "rev-parse", "HEAD");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pr-contributor-gates-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", AUTHOR_NAME);
  git(root, "config", "user.email", AUTHOR_EMAIL);
  writeFileSync(join(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), "<!-- CLA-Version: 1.0 -->\n\n# CLA\n\nThe Project may transfer and sublicense these rights.\n", "utf8");
  writeFileSync(join(root, "change.txt"), "base\n", "utf8");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "base", "-m", `Signed-off-by: ${AUTHOR_NAME} <${AUTHOR_EMAIL}>`);
  const baseSha = git(root, "rev-parse", "HEAD");
  const headSha = commit(root, "candidate");
  const cla = readClaContract(root);
  const event = {
    action: "opened",
    number: 42,
    pull_request: {
      body: expectedAcceptanceLine(cla, LOGIN, true),
      user: { login: LOGIN },
      head: { sha: headSha },
      base: { sha: baseSha, ref: "main" },
    },
  };
  return { root, cla, event };
}

const hasCode = (receipt, code) => receipt.errors.some((entry) => entry.code === code);

test("valid receipt binds PR identity, head, current CLA, and signed commits", () => {
  const { root, cla, event } = fixture();
  const receipt = validatePrContributorGates({ root, event });
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
  assert.deepEqual(receipt.pullRequest, { number: 42, authorLogin: LOGIN, headSha: event.pull_request.head.sha, baseRef: "main", baseSha: event.pull_request.base.sha });
  assert.deepEqual(receipt.cla, { path: "CONTRIBUTOR_LICENSE_AGREEMENT.md", version: "1.0", sha256: cla.sha256, accepted: true });
  assert.deepEqual(receipt.dco, { status: "passed", checkedCommits: 1 });
});

test("unchecked current acceptance fails closed", () => {
  const { root, cla, event } = fixture();
  event.pull_request.body = expectedAcceptanceLine(cla, LOGIN, false);
  const receipt = validatePrContributorGates({ root, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_UNCHECKED"), true);
});

test("a CLA byte change makes the old acceptance stale", () => {
  const { root, event } = fixture();
  event.pull_request.body = event.pull_request.body;
  writeFileSync(join(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), `${readFileSync(join(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), "utf8")}Changed.\n`, "utf8");
  const receipt = validatePrContributorGates({ root, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_STALE"), true);
});

test("acceptance bound to another login fails closed", () => {
  const { root, cla, event } = fixture();
  event.pull_request.body = expectedAcceptanceLine(cla, "different-user", true);
  const receipt = validatePrContributorGates({ root, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_LOGIN_MISMATCH"), true);
});

test("missing and duplicate acceptance records fail closed", () => {
  const { root, event } = fixture();
  const accepted = event.pull_request.body;
  event.pull_request.body = "No acceptance";
  assert.equal(hasCode(validatePrContributorGates({ root, event }), "CLA_ACCEPTANCE_MISSING"), true);
  event.pull_request.body = `${accepted}\n${accepted}`;
  assert.equal(hasCode(validatePrContributorGates({ root, event }), "CLA_ACCEPTANCE_AMBIGUOUS"), true);
});

test("every commit unique to the PR must carry an author-matching DCO signoff", () => {
  const { root, cla, event } = fixture();
  event.pull_request.head.sha = commit(root, "unsigned", false);
  event.pull_request.body = expectedAcceptanceLine(cla, LOGIN, true);
  const receipt = validatePrContributorGates({ root, event });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.dco.checkedCommits, 2);
  assert.equal(hasCode(receipt, "DCO_SIGNOFF_MISSING_OR_MISMATCHED"), true);
});

test("wrong event action or target branch fails closed", () => {
  const { root, event } = fixture();
  event.action = "closed";
  event.pull_request.base.ref = "develop";
  const receipt = validatePrContributorGates({ root, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "EVENT_ACTION_INVALID"), true);
  assert.equal(hasCode(receipt, "PR_BASE_REF_INVALID"), true);
});

test("CLI emits and writes the same machine-readable receipt without commit email", () => {
  const { root, event } = fixture();
  const eventPath = join(root, "event.json");
  const receiptPath = join(root, "receipt.json");
  writeFileSync(eventPath, JSON.stringify(event), "utf8");
  let stdout = "";
  let stderr = "";
  const status = runCli(["--root", root, "--event", eventPath, "--receipt", receiptPath], { stdout: { write: (value) => { stdout += value; } }, stderr: { write: (value) => { stderr += value; } } });
  assert.equal(status, 0, stderr || stdout);
  const stdoutReceipt = JSON.parse(stdout);
  assert.deepEqual(JSON.parse(readFileSync(receiptPath, "utf8")), stdoutReceipt);
  assert.equal(stdout.includes(AUTHOR_EMAIL), false);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok - ${name}`); }
  catch (failure) { failed += 1; console.error(`not ok - ${name}\n${failure.stack ?? failure}`); }
}
console.log(`1..${tests.length}`);
if (failed > 0) process.exitCode = 1;
