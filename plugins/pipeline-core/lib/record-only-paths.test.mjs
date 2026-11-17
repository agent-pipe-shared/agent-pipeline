// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { isEvidencePath } from "./evidence-carry-forward.mjs";
import * as envelope from "./release-promotion-envelope.mjs";
import { AUTHORITY_CARRY_EXTENSION_PATTERNS, RECORD_ONLY_PATH_PATTERNS, isAuthorityCarryExtensionPath, isRecordOnlyPath } from "./record-only-paths.mjs";

// The sources the production push gate accepted before the set moved into its own module. Any change here widens or narrows
// what hooks/guard-push.mjs and scripts/push-prepare.mjs accept, so it must be a deliberate, reviewed edit of this list.
const PRE_MOVE_SOURCES = [
  "^evidence\\/.*$",
  "^backlog\\/evidence\\/.*$",
  "^specs\\/[^/]+\\/evidence\\/.*$",
  "^specs\\/[^/]+\\/lifecycle\\.json$",
  "^specs\\/[^/]+\\/result\\.md$",
  "^backlog\\/STATUS\\.md$",
  "^backlog\\/index\\.json$",
  "^backlog\\/transitions\\.ndjson$",
  "^backlog\\/items\\/.*$",
  "^backlog\\/PO-TOPICS\\.md$",
  "^docs\\/state\\.md$",
  "^\\.claude\\/pipeline-state\\.json$",
  "^project\\/pipeline-state\\.json$",
];

test("ROP1: the record-only set is byte-identical to the one the promotion envelope had, in the same order", () => {
  assert.deepEqual(RECORD_ONLY_PATH_PATTERNS.map((pattern) => pattern.source), PRE_MOVE_SOURCES);
  assert.ok(RECORD_ONLY_PATH_PATTERNS.every((pattern) => pattern.flags === "u"));
  assert.ok(Object.isFrozen(RECORD_ONLY_PATH_PATTERNS));
});

test("ROP2: the promotion envelope re-exports the very same objects, so every existing importer is unchanged", () => {
  assert.equal(envelope.RECORD_ONLY_PATH_PATTERNS, RECORD_ONLY_PATH_PATTERNS);
  assert.equal(envelope.isRecordOnlyPath, isRecordOnlyPath);
});

test("ROP3: membership and normalisation behave as before", () => {
  for (const path of ["evidence/verify-latest.json", "backlog/items/x.md", "specs/f/evidence/a/b.json", "specs/f/lifecycle.json", "specs/f/result.md",
    "docs/state.md", ".claude/pipeline-state.json", "project/pipeline-state.json", "./docs/state.md", "specs\\f\\result.md"]) {
    assert.equal(isRecordOnlyPath(path), true, path);
  }
  for (const path of ["src/app.mjs", "specs/f/plan.md", "specs/f/spec.md", "project/guard-config.json", "docs/other.md", "specs/f/sub/result.md",
    "specs/f/audit-bundles/b.json", "project/push-threat-model.md", "", undefined, null, 7]) {
    assert.equal(isRecordOnlyPath(path), false, String(path));
  }
});

test("ROP4: the extension classes are separate from the record-only set and accepted by the extension predicate only", () => {
  // Candidate 30e: three patterns now, the repository-root audit-bundles/<feature>/ location the writer really uses joined the specs/<feature>/ form.
  assert.equal(AUTHORITY_CARRY_EXTENSION_PATTERNS.length, 3);
  assert.ok(Object.isFrozen(AUTHORITY_CARRY_EXTENSION_PATTERNS));
  for (const path of ["specs/f/audit-bundles/b.json", "specs/f/audit-bundles/deep/c.json", "audit-bundles/f/0123456789abcdef0123456789abcdef01234567/proofs/002-push.json",
    "audit-bundles/f/README.md", "project/push-threat-model.md", "./project/push-threat-model.md"]) {
    assert.equal(isAuthorityCarryExtensionPath(path), true, path);
    assert.equal(isRecordOnlyPath(path), false, `${path} must not be record-only`);
  }
  for (const path of ["specs/f/evidence/a.json", "docs/state.md", "specs/f/audit-bundles", "audit-bundles", "audit-bundles/f", "audit-bundles/f/", "project/other.md", "", undefined]) {
    assert.equal(isAuthorityCarryExtensionPath(path), false, String(path));
  }
});

test("ROP5: the narrower carry-forward decision of w156 never accepts a path outside the record-only set plus the extension", () => {
  const samples = ["specs/f/evidence/new.json", "specs/f/evidence/deep/run.log", "specs/f/audit-bundles/b.json", "specs/f/lifecycle.json", "specs/f/result.md",
    "project/push-threat-model.md", "docs/state.md", "backlog/items/x.md", "backlog/STATUS.md", ".claude/pipeline-state.json", "evidence/verify-latest.json",
    "src/app.mjs", "specs/f/plan.md", "project/guard-config.json", "specs/f/sub/evidence/x.json"];
  for (const path of samples) {
    if (isEvidencePath(path)) {
      assert.ok(isRecordOnlyPath(path) || isAuthorityCarryExtensionPath(path), `${path} is accepted by w156 but by neither shared definition`);
    }
  }
  // The deliberate differences, pinned so they cannot drift unnoticed: the shared record-only set is wider than the w156 set in these members.
  for (const wider of ["docs/state.md", "backlog/items/x.md", "backlog/STATUS.md", ".claude/pipeline-state.json", "evidence/verify-latest.json"]) {
    assert.equal(isRecordOnlyPath(wider), true, wider);
    assert.equal(isEvidencePath(wider), false, `${wider} stays refused by the w156 decision until the reviewed amendment says otherwise`);
  }
});
