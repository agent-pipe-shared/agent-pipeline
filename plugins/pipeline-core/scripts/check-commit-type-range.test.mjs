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

test("auditCommitTypeRange: accepts only the exact imported revert/reapply pair", () => {
  const gitOperations = {
    runGit(args) {
      if (args[0] === "log") {
        return [
          '09a3e6e5dcbeb8250cf8c5c2ad638cf18154239a\0Reapply "docs(backlog): close blind push driver gap"',
          '9843cb192b35a3b45b52c0522c83a0389d2c5600\0Revert "docs(backlog): close blind push driver gap"',
        ].join("\n");
      }
      return "";
    },
  };
  const result = auditCommitTypeRange({ base: "base-sha", head: "head-sha", gitOperations });
  assert.equal(result.ok, true);
  assert.equal(result.acceptedHistoricalExceptions, 2);
  assert.equal(result.findings.length, 0);
});

test("auditCommitTypeRange: a changed subject does not inherit the historical exception", () => {
  const gitOperations = {
    runGit(args) {
      if (args[0] === "log") return '09a3e6e5dcbeb8250cf8c5c2ad638cf18154239a\0Reapply "different change"';
      return "";
    },
  };
  const result = auditCommitTypeRange({ base: "base-sha", head: "head-sha", gitOperations });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.acceptedHistoricalExceptions, 0);
});

test("auditCommitTypeRange: missing base when plugin.json has no parsable version returns skipped", () => {
  const gitOperations = {
    runGit() { return ""; },
  };
  const result = auditCommitTypeRange({ root: "/nonexistent-path", gitOperations });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, "no resolvable base");
});
