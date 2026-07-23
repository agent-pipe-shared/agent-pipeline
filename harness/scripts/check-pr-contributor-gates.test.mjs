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
const CLA_BYTES = "<!-- CLA-Version: 1.0 -->\n\n# CLA\n\nThe Project may transfer and sublicense these rights.\n";
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
  const claRoot = mkdtempSync(join(tmpdir(), "pr-contributor-gates-trusted-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", AUTHOR_NAME);
  git(root, "config", "user.email", AUTHOR_EMAIL);
  writeFileSync(join(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), CLA_BYTES, "utf8");
  writeFileSync(join(claRoot, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), CLA_BYTES, "utf8");
  writeFileSync(join(root, "change.txt"), "base\n", "utf8");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "base", "-m", `Signed-off-by: ${AUTHOR_NAME} <${AUTHOR_EMAIL}>`);
  const baseSha = git(root, "rev-parse", "HEAD");
  const headSha = commit(root, "candidate");
  const cla = readClaContract(claRoot);
  const event = {
    action: "opened",
    number: 42,
    sender: { login: LOGIN },
    pull_request: {
      body: expectedAcceptanceLine(cla, LOGIN, true),
      user: { login: LOGIN },
      head: { sha: headSha },
      base: { sha: baseSha, ref: "main" },
    },
  };
  return { root, claRoot, cla, event };
}

const hasCode = (receipt, code) => receipt.errors.some((entry) => entry.code === code);

test("valid receipt binds PR identity, head, current CLA, and signed commits", () => {
  const { root, claRoot, cla, event } = fixture();
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
  assert.equal(receipt.schema, "agent-pipeline.pr-contributor-gate.v2");
  assert.deepEqual(receipt.event, { action: "opened", senderLogin: LOGIN, bodyTransition: "opened-by-author" });
  assert.deepEqual(receipt.pullRequest, { number: 42, authorLogin: LOGIN, headSha: event.pull_request.head.sha, baseRef: "main", baseSha: event.pull_request.base.sha });
  assert.deepEqual(receipt.cla, { path: "CONTRIBUTOR_LICENSE_AGREEMENT.md", version: "1.0", sha256: cla.sha256, accepted: true });
  assert.deepEqual(receipt.dco, { status: "passed", checkedCommits: 1 });
});

test("unchecked current acceptance fails closed", () => {
  const { root, claRoot, cla, event } = fixture();
  event.pull_request.body = expectedAcceptanceLine(cla, LOGIN, false);
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_UNCHECKED"), true);
});

test("a trusted-base CLA byte change makes the old acceptance stale", () => {
  const { root, claRoot, event } = fixture();
  writeFileSync(join(claRoot, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), `${readFileSync(join(claRoot, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), "utf8")}Changed.\n`, "utf8");
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_STALE"), true);
});

test("a candidate CLA rewrite cannot control trusted-base acceptance", () => {
  const { root, claRoot, cla, event } = fixture();
  writeFileSync(join(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md"), "<!-- CLA-Version: 99.0 -->\n\nAttacker-controlled candidate CLA.\n", "utf8");
  event.pull_request.head.sha = commit(root, "candidate-cla-rewrite");
  event.pull_request.body = expectedAcceptanceLine(cla, LOGIN, true);
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
  assert.equal(receipt.cla.version, "1.0");
  assert.equal(receipt.cla.sha256, cla.sha256);
});

test("acceptance bound to another login fails closed", () => {
  const { root, claRoot, cla, event } = fixture();
  event.pull_request.body = expectedAcceptanceLine(cla, "different-user", true);
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_LOGIN_MISMATCH"), true);
});

test("missing and duplicate acceptance records fail closed", () => {
  const { root, claRoot, event } = fixture();
  const accepted = event.pull_request.body;
  event.pull_request.body = "No acceptance";
  assert.equal(hasCode(validatePrContributorGates({ root, claRoot, event }), "CLA_ACCEPTANCE_MISSING"), true);
  event.pull_request.body = `${accepted}\n${accepted}`;
  assert.equal(hasCode(validatePrContributorGates({ root, claRoot, event }), "CLA_ACCEPTANCE_AMBIGUOUS"), true);
});

test("every commit unique to the PR must carry an author-matching DCO signoff", () => {
  const { root, claRoot, cla, event } = fixture();
  event.pull_request.head.sha = commit(root, "unsigned", false);
  event.pull_request.body = expectedAcceptanceLine(cla, LOGIN, true);
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.dco.checkedCommits, 2);
  assert.equal(hasCode(receipt, "DCO_SIGNOFF_MISSING_OR_MISMATCHED"), true);
});

test("wrong event action or target branch fails closed", () => {
  const { root, claRoot, event } = fixture();
  event.action = "closed";
  event.pull_request.base.ref = "develop";
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "EVENT_ACTION_INVALID"), true);
  assert.equal(hasCode(receipt, "PR_BASE_REF_INVALID"), true);
});

test("a maintainer edit cannot accept the CLA for the PR author", () => {
  const { root, claRoot, cla, event } = fixture();
  event.action = "edited";
  event.sender.login = "maintainer";
  event.changes = { body: { from: expectedAcceptanceLine(cla, LOGIN, false) } };
  const receipt = validatePrContributorGates({ root, claRoot, event });
  assert.equal(receipt.ok, false);
  assert.equal(hasCode(receipt, "CLA_ACCEPTANCE_PROXY_ACTOR"), true);
});

test("an author push invalidates a proxy checkbox until the author personally re-checks it", () => {
  const { root, claRoot, cla, event } = fixture();
  event.pull_request.head.sha = commit(root, "author-push-after-proxy-checkbox");
  event.action = "synchronize";
  const synchronized = validatePrContributorGates({ root, claRoot, event });
  assert.equal(synchronized.ok, false);
  assert.equal(hasCode(synchronized, "CLA_ACCEPTANCE_REFRESH_REQUIRED"), true);

  event.action = "edited";
  event.changes = { body: { from: expectedAcceptanceLine(cla, LOGIN, false) } };
  const refreshed = validatePrContributorGates({ root, claRoot, event });
  assert.equal(refreshed.ok, true, JSON.stringify(refreshed.errors));
  assert.deepEqual(refreshed.event, { action: "edited", senderLogin: LOGIN, bodyTransition: "checked-by-author" });
});

test("CLI emits and writes the same machine-readable receipt without commit email", () => {
  const { root, claRoot, event } = fixture();
  const eventPath = join(root, "event.json");
  const receiptPath = join(root, "receipt.json");
  writeFileSync(eventPath, JSON.stringify(event), "utf8");
  let stdout = "";
  let stderr = "";
  const status = runCli(["--root", root, "--cla-root", claRoot, "--event", eventPath, "--receipt", receiptPath], { stdout: { write: (value) => { stdout += value; } }, stderr: { write: (value) => { stderr += value; } } });
  assert.equal(status, 0, stderr || stdout);
  const stdoutReceipt = JSON.parse(stdout);
  assert.deepEqual(JSON.parse(readFileSync(receiptPath, "utf8")), stdoutReceipt);
  assert.equal(stdout.includes(AUTHOR_EMAIL), false);
});

test("CLI rejects a missing trusted CLA root and unknown or duplicate arguments", () => {
  const { root, claRoot, event } = fixture();
  const eventPath = join(root, "event.json");
  writeFileSync(eventPath, JSON.stringify(event), "utf8");
  const io = { stdout: { write: () => {} }, stderr: { write: () => {} } };
  assert.equal(runCli(["--root", root, "--event", eventPath], io), 2);
  assert.equal(runCli(["--root", root, "--cla-root", claRoot, "--event", eventPath, "--extra", "value"], io), 2);
  assert.equal(runCli(["--root", root, "--cla-root", claRoot, "--cla-root", claRoot, "--event", eventPath], io), 2);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok - ${name}`); }
  catch (failure) { failed += 1; console.error(`not ok - ${name}\n${failure.stack ?? failure}`); }
}
console.log(`1..${tests.length}`);
if (failed > 0) process.exitCode = 1;
