#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { auditStateNumericClaims } from "./check-state-numeric-claims.mjs";

function fixture(stateBody, counts) {
  const root = mkdtempSync(join(tmpdir(), "state-numeric-claims-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "backlog"), { recursive: true });
  writeFileSync(join(root, "docs", "state.md"), stateBody);
  writeFileSync(
    join(root, "backlog", "index.json"),
    `${JSON.stringify({ schema: "pipeline.backlog-index.v1", generatedFrom: {}, counts, items: [] }, null, 2)}\n`,
  );
  return root;
}

function withFixture(stateBody, counts, run) {
  const root = fixture(stateBody, counts);
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("(a) a current-state claim matching the live count produces no findings", () => {
  const body = "# state\n\nBacklog now stands at **10/12 closed, 1 open, 1 in_progress**.\n";
  withFixture(body, { closed: 10, open: 1, in_progress: 1 }, (root) => {
    assert.deepEqual(auditStateNumericClaims(root), []);
  });
});

test("(b) a stale current-state claim fails with a finding naming the exact mismatch", () => {
  const body = "# state\n\nBacklog now stands at **10/12 closed, 1 open, 1 in_progress**.\n";
  withFixture(body, { closed: 9, open: 2, in_progress: 1 }, (root) => {
    const findings = auditStateNumericClaims(root);
    assert.ok(findings.length > 0);
    const joined = findings.join("\n");
    assert.match(joined, /docs\/state\.md:3: current-state claim "Backlog now stands at \*\*10\/12 closed, 1 open, 1 in_progress\*\*" claims 10 closed; live backlog\/index\.json counts 9 closed/u);
    assert.match(joined, /claims 1 open; live backlog\/index\.json counts 2 open/u);
    // in_progress and total (both consistent with 10+1+1=12 vs live 9+2+1=12) must NOT be flagged.
    assert.ok(!joined.includes("in_progress; live"));
    assert.ok(!joined.includes("total items"));
  });
});

test("(c) a historical claim under an Archived heading is never flagged, however stale", () => {
  const body = [
    "# state",
    "",
    "This paragraph is the live open state and carries no claim of its own.",
    "",
    "## Archived history",
    "",
    "Backlog now stands at **1/1 closed, 0 open, 0 in_progress**.",
    "",
  ].join("\n");
  // Every live count component deliberately disagrees with the archived claim.
  withFixture(body, { closed: 5, open: 3, in_progress: 2 }, (root) => {
    assert.deepEqual(auditStateNumericClaims(root), []);
  });
});

test("running-log rule: an earlier superseded claim is ignored; only the LAST claim is checked", () => {
  const body = [
    "# state",
    "",
    "Backlog now stands at **5/10 closed, 3 open, 2 in_progress**.",
    "",
    "Backlog now stands at **7/10 closed, 1 open, 2 in_progress**.",
    "",
  ].join("\n");
  // Matches only the SECOND (last) claim -- the first, superseded claim would
  // mismatch this live count if it were (wrongly) also checked.
  withFixture(body, { closed: 7, open: 1, in_progress: 2 }, (root) => {
    assert.deepEqual(auditStateNumericClaims(root), []);
  });
  // Invert: make the live count match only the FIRST (superseded) claim.
  // The check must still fire, proving it evaluates the last claim, not "any".
  withFixture(body, { closed: 5, open: 3, in_progress: 2 }, (root) => {
    const findings = auditStateNumericClaims(root);
    assert.ok(findings.length > 0);
    assert.match(findings.join("\n"), /claims 7 closed; live backlog\/index\.json counts 5 closed/u);
  });
});

test("no 'Backlog now ...' claim at all produces no findings", () => {
  const body = "# state\n\nNo numeric backlog claim of the matched shape appears here.\n";
  withFixture(body, { closed: 1, open: 2, in_progress: 3 }, (root) => {
    assert.deepEqual(auditStateNumericClaims(root), []);
  });
});

test("a subset claim (no open/in_progress breakdown) is never matched", () => {
  const body = "# state\n\n**Wave 4 stands at 12/17 closed** (not the total backlog).\n";
  withFixture(body, { closed: 1, open: 2, in_progress: 3 }, (root) => {
    assert.deepEqual(auditStateNumericClaims(root), []);
  });
});
