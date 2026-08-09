#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * The contract that makes `templates/prompts/agent-obligations.md` trustworthy.
 *
 * The document is generated from the guards' own sources. Without this suite that
 * is a claim; with it, it is a property: the committed bytes must equal what the
 * generator produces right now, so a rule changed at its source and not
 * regenerated turns the suite red instead of silently shipping a stale
 * obligation to every dispatched agent.
 *
 * The drift check is the part that matters. A byte-equality test alone would
 * pass just as happily against a generator that ignored its inputs, so DRIFT-1
 * changes an input and asserts the output follows.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { OBLIGATIONS_PATH, renderAgentObligations } from "./generate-agent-obligations.mjs";
import { DEFAULT_EXEMPT_PREFIXES } from "../../plugins/pipeline-core/lib/guard-devplan-policy.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUARD_CONFIG = join(REPO_ROOT, "project", "guard-config.json");

const roots = [];
function tempRootWithGuardConfig(mutate) {
  const base = mkdtempSync(join(tmpdir(), "agent-obligations-"));
  roots.push(base);
  mkdirSync(join(base, "project"), { recursive: true });
  const config = JSON.parse(readFileSync(GUARD_CONFIG, "utf8"));
  mutate(config);
  writeFileSync(join(base, "project", "guard-config.json"), `${JSON.stringify(config, null, 2)}\n`);
  return base;
}

test.after(() => { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); });

test("AC-2: the committed document is byte-identical to a fresh generation", () => {
  const committed = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.equal(
    renderAgentObligations(),
    committed,
    "templates/prompts/agent-obligations.md is stale -- run: node harness/scripts/generate-agent-obligations.mjs",
  );
});

test("AC-3 (drift): a protected path added at the source changes the generated document", () => {
  const root = tempRootWithGuardConfig((config) => {
    config.protectedTestPaths.push({
      id: "TP-DRIFT",
      pattern: "plugins/pipeline-core/hooks/invented-for-this-test\\.test\\.mjs$",
      reason: "fixture only",
    });
  });
  const drifted = renderAgentObligations({ rootDir: root });
  assert.notEqual(drifted, renderAgentObligations(), "an added protected path must change the document");
  assert.match(drifted, /TP-DRIFT/u, "the added entry must appear in the generated table");
});

test("AC-4: every protected path appears verbatim, and the count is stated", () => {
  const entries = JSON.parse(readFileSync(GUARD_CONFIG, "utf8")).protectedTestPaths;
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.ok(entries.length > 0, "the fixture is meaningless if no paths are protected");
  assert.match(document, new RegExp(`\\(${entries.length} entries\\)`, "u"), "the stated count must match the source");
  for (const entry of entries) {
    assert.ok(document.includes(`\`${entry.id}\``), `${entry.id} is missing from the document`);
    // Verbatim, never paraphrased: the pattern is a regex and a reworded one
    // would send an agent looking at the wrong file.
    assert.ok(document.includes(`\`${entry.pattern}\``), `${entry.id}'s pattern is not verbatim in the document`);
  }
});

test("AC-4: the no-in-session-override fact is stated with its citation, not as folklore", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.match(document, /author-repair-required/u);
  assert.match(document, /human-guard-override\.mjs/u);
});

test("AC-3: the draft-phase exempt prefixes come from the guard's own constant", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  for (const prefix of DEFAULT_EXEMPT_PREFIXES) {
    assert.ok(document.includes(`\`${prefix}\``), `exempt prefix ${prefix} is missing from the document`);
  }
});

test("AC-5: liftability is delegated to the repair map, never copied", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.match(document, /repair-map\.mjs/u, "the document must point at the runtime answer");
  // A second static copy of what the map computes is the drift this whole file
  // exists to prevent, so the document must not enumerate liftability verdicts.
  assert.doesNotMatch(document, /^\s*\|\s*`?HGO-[A-Z-]+`?\s*\|/mu, "the document must not restate the repair map's rows");
});

/**
 * OBLIGROUTE-2. The missing level, again: every assertion above reads the document
 * against a copy of what the guard is assumed to do. This one drives the real guard.
 *
 * The document printed `node plugins/pipeline-core/scripts/repair-map.mjs` until
 * 2026-08-09 and the lifecycle guard refused exactly that string, so §5's whole
 * purpose -- handing a stuck agent the one question it may still ask -- did not work
 * in the state it was written for. Both directions are asserted, because an
 * admission test alone would also pass on a document that named some other admitted
 * command.
 */
test("AC-9 (contract): the command §5 prints is the command the lifecycle guard admits", async () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  const printed = /^node (<plugin-root>\/\S+)$/mu.exec(document);
  assert.ok(printed, "§5 must print exactly one `node <plugin-root>/...` command");

  const guard = await import("../../plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs");
  // The guard resolves its admitted path from its OWN module URL, so substituting the
  // plugin root of the guard under test is the substitution a real agent performs.
  const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "plugins", "pipeline-core");
  const resolved = `node ${join(pluginRoot, printed[1].slice("<plugin-root>/".length))}`;
  const project = tempRootWithGuardConfig(() => {});

  assert.equal(
    guard.isSanctionedLifecycleCommand(resolved, project),
    true,
    `the guard refuses the command the document hands a stuck agent: ${resolved}`,
  );
  // The form this fix removed, asserted as refused so a regression to it turns red
  // here rather than in a dispatch that has already run out of budget.
  assert.equal(
    guard.isSanctionedLifecycleCommand("node plugins/pipeline-core/scripts/repair-map.mjs", project),
    false,
    "a repository-relative form must stay refused -- that is why the document may not print one",
  );
});

test("AC-7: the document carries no absolute or machine-specific path", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  assert.doesNotMatch(document, /\/home\//u);
  assert.doesNotMatch(document, /C:\\Users/u);
  assert.doesNotMatch(document, new RegExp(REPO_ROOT.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("AC-1: a hand-maintained line is marked as such, so the boundary is visible", () => {
  const document = readFileSync(OBLIGATIONS_PATH, "utf8");
  // The grammar rule and the commit discipline are stated rather than derived --
  // no component exports either as data. That is acceptable; being silent about
  // it is not, because a reader cannot otherwise tell which lines a source
  // change would update.
  const marks = document.match(/hand-maintained/gu) ?? [];
  assert.ok(marks.length >= 2, `expected every hand-maintained section to say so; found ${marks.length}`);
});
