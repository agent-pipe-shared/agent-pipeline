// SPDX-License-Identifier: SUL-1.0
// ADR-0085 retired the durable initial-design Advisor admission course: the CLI answers every command with the typed
// retirement result before it parses arguments, reads state or touches a private receipt. The former cases (an answered
// inspect that rechecks its private transaction, an unavailable inspect that never reuses the write-time final
// approval claim) exercised the retired route and cannot hold; the transaction writer/reader they drove is covered by
// lib/design-advisory-admission.test.mjs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DESIGN_ADVISORY_COURSE_RETIRED, retiredDesignResult } from "../lib/retired-design-codes.mjs";
import { runDesignAdvisoryAdmission } from "./design-advisory-admission.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "advisor-admission-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["-C", root, "init", "-q"]);
  return root;
}
const common = ["--repo-root", "", "--feature", "feature-1", "--plan", "specs/feature-1/prd.md", "--spec", "specs/feature-1/spec.md"];
const argvFor = (command, root, extra = []) => [command, ...common.map((value, index) => index === 1 ? root : value), ...extra];

test("every Advisor admission command is answered with the typed retirement result and no effect", t => {
  const root = fixture(t);
  const before = readdirSync(join(root, ".git")).sort();
  for (const argv of [
    argvFor("plan", root),
    argvFor("inspect", root),
    argvFor("apply", root, ["--receipt-id", "advisor-1", "--native-available", "false", "--expected-public-sha256", "absent"]),
  ]) {
    const result = runDesignAdvisoryAdmission(argv);
    assert.deepEqual(result, retiredDesignResult(DESIGN_ADVISORY_COURSE_RETIRED), argv[0]);
    assert.equal(result.ok, false);
    assert.equal(result.implementationAuthority, false);
  }
  assert.deepEqual(readdirSync(join(root, ".git")).sort(), before, "the retired command wrote nothing under the git directory");
  assert.equal(existsSync(join(root, ".git", "agent-pipeline")), false);
});

test("the retirement answer precedes argument parsing and repository access", () => {
  for (const argv of [[], ["unknown-command"], argvFor("inspect", join(tmpdir(), "advisor-admission-cli-missing-root"))]) {
    assert.deepEqual(runDesignAdvisoryAdmission(argv), retiredDesignResult(DESIGN_ADVISORY_COURSE_RETIRED));
  }
});
