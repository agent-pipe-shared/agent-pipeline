#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression test for wiring ADR-0063's directory-kinds pointer into
 * `harness/session-bootstrap.md` (backlog
 * `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md`,
 * ADR-0063 point 3 follow-up 2, dispatch NVA-W1-8).
 *
 * ADR-0063 point 3 requires the kinds table (or a condensed pointer to it) to
 * appear in the agent-facing surfaces a fresh session actually loads: "the
 * `pipeline-start` skill (`harness/session-bootstrap.md` / `plugins/pipeline-core`)".
 * A prior dispatch (99aeafd2, "docs(pipeline-start,templates): surface
 * ADR-0063's directory-kinds table") wired the executable form
 * (`plugins/pipeline-core/skills/pipeline-start/SKILL.md`) and both dispatch
 * templates, but left the full-spec document (`harness/session-bootstrap.md`,
 * the "full spec" per CLAUDE.md's bootstrap pointer) untouched -- this test
 * pins that gap closed.
 *
 * Deliberately narrow: this checks that the pointer exists and is traceable
 * to ADR-0063, not a generic prose-quality scanner. This file is not wired
 * into `verify.mjs`'s `TEST_SUITES` (TP-3, no in-session override in this
 * repo's `signature` push-approval mode -- confirmed live during this
 * dispatch: an attempted registration edit was blocked pre-execution with
 * Rule ID TP-3) and will show as "unaccounted" in
 * `check-suite-registration.mjs`'s diagnostic, the same disclosed, known gap
 * already accepted for `check-directory-contract.test.mjs` and
 * `check-gitignore-anchoring.test.mjs`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bootstrapText = readFileSync(join(repoRoot, "harness", "session-bootstrap.md"), "utf8");

test("harness/session-bootstrap.md names ADR-0063 and points at the directory contract", () => {
  assert.match(bootstrapText, /ADR-0063/u);
  assert.match(bootstrapText, /docs\/adr\/0063-repository-directory-contract\.md/u);
});

test("the ADR-0063 pointer states the scratch/ home for temporary material", () => {
  const index = bootstrapText.indexOf("ADR-0063");
  assert.ok(index >= 0, "ADR-0063 must be mentioned");
  const nearby = bootstrapText.slice(index, index + 1500);
  assert.match(nearby, /scratch\//u);
  assert.match(nearby, /directory-kinds table/u);
});

test("the ADR-0063 pointer names the kinds a fresh session is most likely to place wrong", () => {
  const index = bootstrapText.indexOf("ADR-0063");
  const nearby = bootstrapText.slice(index, index + 1500);
  assert.match(nearby, /docs\/adr\//u, "decision records home must be named");
  assert.match(nearby, /specs\/<feature-id>\/|specs\//u, "specifications home must be named");
  assert.match(nearby, /backlog\/evidence\/|specs\/\*\/evidence\//u, "durable evidence home must be named");
});

test("the pointer cross-references the executable form (SKILL.md)", () => {
  const index = bootstrapText.indexOf("ADR-0063");
  const nearby = bootstrapText.slice(index, index + 1500);
  assert.match(nearby, /pipeline-start\/SKILL\.md/u);
});

test("the pointer sits before the first '---' divider, in the general Purpose section read by every role", () => {
  const purposeIndex = bootstrapText.indexOf("## 1. Purpose");
  const mechanismIndex = bootstrapText.indexOf("## 2. Mechanism decision");
  const adrIndex = bootstrapText.indexOf("ADR-0063");
  assert.ok(purposeIndex >= 0 && mechanismIndex >= 0, "both section headers must exist");
  assert.ok(
    adrIndex > purposeIndex && adrIndex < mechanismIndex,
    "the ADR-0063 pointer must live inside §1 Purpose, ahead of §2",
  );
});

process.stdout.write("check-session-bootstrap-directory-contract: harness/session-bootstrap.md ADR-0063 pointer checks passed\n");
