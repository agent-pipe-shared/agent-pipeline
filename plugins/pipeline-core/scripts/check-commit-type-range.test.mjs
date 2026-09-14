// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { auditCommitTypeRange } from "./check-commit-type-range.mjs";

test("auditCommitTypeRange: clean conventional commit range passes", () => {
  const gitOperations = {
    runGit(args) {
      if (args[0] === "log") {
        return "1111111111111111111111111111111111111111\0feat(core): new capability\n2222222222222222222222222222222222222222\0fix: handle boundary";
      }
      return "";
    },
  };
  const result = auditCommitTypeRange({ base: "base-sha", head: "head-sha", gitOperations });
  assert.equal(result.ok, true);
  assert.equal(result.commitsChecked, 2);
  assert.equal(result.findings.length, 0);
});

test("auditCommitTypeRange: non-conventional commit type produces finding", () => {
  const gitOperations = {
    runGit(args) {
      if (args[0] === "log") {
        return "1111111111111111111111111111111111111111\0design: unadmitted type";
      }
      return "";
    },
  };
  const result = auditCommitTypeRange({ base: "base-sha", head: "head-sha", gitOperations });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].findings[0].code, "GIT-01-UNKNOWN-TYPE");
});

test("auditCommitTypeRange: missing base when plugin.json has no parsable version returns skipped", () => {
  const gitOperations = {
    runGit() { return ""; },
  };
  const result = auditCommitTypeRange({ root: "/nonexistent-path", gitOperations });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, "no resolvable base");
});
