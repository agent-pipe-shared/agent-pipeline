#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkSectionCitations,
  descriptionMatches,
  extractCitations,
  isOutOfCitationScope,
  parseOperatingModelHeadings,
  resolveCitation,
} from "./check-section-citations.mjs";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const roots = [];

const SAMPLE_OPERATING_MODEL = [
  "# Agent-Pipeline Operating Model (V3)",
  "",
  "## 1. What the model protects",
  "",
  "Body text.",
  "",
  "## 2. Roles and boundaries",
  "",
  "Body text.",
  "",
  "## 3. V3 routing: profiles, duties and phases",
  "",
  "### Profiles",
  "",
  "Body text.",
  "",
  "### Duties",
  "",
  "Body text.",
  "",
  "## 4. The lifecycle",
  "",
  "Body text.",
  "",
  "<!-- DE-REFERENCE-BELOW | agents: skip. -->",
  "",
  "## 4. Der Lifecycle",
  "",
  "### Deutsche Unterüberschrift",
  "",
].join("\n");

function write(root, path, content) {
  const file = join(root, path);
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, content);
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "section-citations-"));
  roots.push(root);
  const files = {
    "docs/operating-model.md": SAMPLE_OPERATING_MODEL,
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) {
    if (content !== null) write(root, path, content);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("parseOperatingModelHeadings reads numbered sections and ordinal subsections, stops at the DE marker", () => {
  const sections = parseOperatingModelHeadings(SAMPLE_OPERATING_MODEL);
  assert.deepEqual(
    sections.map((s) => s.number),
    [1, 2, 3, 4],
  );
  const three = sections.find((s) => s.number === 3);
  assert.deepEqual(
    three.subsections.map((s) => s.title),
    ["Profiles", "Duties"],
  );
  const four = sections.find((s) => s.number === 4);
  assert.equal(four.subsections.length, 0);
  // The German mirror duplicates "## 4." after the marker; must not be read.
  assert.equal(sections.filter((s) => s.number === 4).length, 1);
});

test("resolveCitation: section-missing, subsection-missing, and both ok levels", () => {
  const sections = parseOperatingModelHeadings(SAMPLE_OPERATING_MODEL);
  assert.equal(resolveCitation(sections, 9, null).status, "section-missing");
  const noSub = resolveCitation(sections, 4, 2);
  assert.equal(noSub.status, "subsection-missing");
  assert.equal(noSub.sectionTitle, "The lifecycle");
  const sectionOk = resolveCitation(sections, 1, null);
  assert.equal(sectionOk.status, "ok");
  assert.equal(sectionOk.title, "What the model protects");
  const subOk = resolveCitation(sections, 3, 2);
  assert.equal(subOk.status, "ok");
  assert.equal(subOk.title, "Duties");
});

test("extractCitations: operating-model.md and OM anchors, with and without a parenthetical", () => {
  assert.deepEqual(extractCitations("See `docs/operating-model.md` §2.3 for the field list."), [
    { section: 2, subsection: 3, description: null },
  ]);
  assert.deepEqual(extractCitations("Dispatch metadata (operating-model §2.3 field 6, critic variant)."), [
    { section: 2, subsection: 3, description: null },
  ]);
  assert.deepEqual(extractCitations("`docs/operating-model.md` §4 (review system)."), [
    { section: 4, subsection: null, description: "review system" },
  ]);
  assert.deepEqual(extractCitations("Backtick form: `OM §4.2`."), [{ section: 4, subsection: 2, description: null }]);
});

test("extractCitations: chained enumeration on one anchor, never crossing into an unrelated document", () => {
  assert.deepEqual(
    extractCitations("Source: `docs/operating-model.md` §2.4 (Critic contract + report format), §4.2 (trigger matrix)."),
    [
      { section: 2, subsection: 4, description: "Critic contract + report format" },
      { section: 4, subsection: 2, description: "trigger matrix" },
    ],
  );
  // A §-numbered citation belonging to a DIFFERENT named document, appearing
  // later on the same line, must never be attributed to operating-model.md.
  assert.deepEqual(
    extractCitations("Normative source: `docs/operating-model.md` — *Rigor*, `harness/review-protocol.md` §2.1, ADR-0003."),
    [],
  );
});

test("descriptionMatches: significant-word overlap decides the fuzzy match, empty description never warns", () => {
  assert.equal(descriptionMatches("review system", "The lifecycle"), false);
  assert.equal(descriptionMatches("review system", "Evidence, review and recovery"), true);
  assert.equal(descriptionMatches("", "Anything"), true);
  assert.equal(descriptionMatches("a b c", "Anything"), true); // no word reaches the 4-char floor
});

test("isOutOfCitationScope excludes specs, backlog, and docs/state.md, but NOT canonical ADRs", () => {
  // docs/adr/ is the canonical source of live "Full articulation: ... §N" pointers
  // (e.g. ADR-0009) and is deliberately IN scope -- only specs/backlog stay excluded
  // as archival "quoting the defect" surfaces (RW1-CITATIONSCOPE).
  assert.equal(isOutOfCitationScope("docs/adr/0001-example.md"), false);
  assert.equal(isOutOfCitationScope("specs/2026-01-01-topic/spec.md"), true);
  assert.equal(isOutOfCitationScope("backlog/items/example.md"), true);
  assert.equal(isOutOfCitationScope("docs/state.md"), true);
  assert.equal(isOutOfCitationScope("CLAUDE.md"), false);
  assert.equal(isOutOfCitationScope("roles/elephant.md"), false);
});

test("isOutOfCitationScope excludes ONLY the generated vendored ADR mirror, not its canonical docs/adr/ source", () => {
  assert.equal(isOutOfCitationScope("plugins/pipeline-core/docs/adr/0056-push-approval-mode.md"), true);
  assert.equal(isOutOfCitationScope("docs/adr/0056-push-approval-mode.md"), false);
  // Sibling vendored directories are NOT ADR-exempt -- only the ADR mirror is.
  assert.equal(isOutOfCitationScope("plugins/pipeline-core/roles/elephant.md"), false);
  assert.equal(isOutOfCitationScope("plugins/pipeline-core/docs/push-release-flow.md"), false);
});

test("checkSectionCitations: hard-fails a nonexistent section and a nonexistent subsection", () => {
  const root = fixture({
    "roles/example.md": [
      "Source of truth: `docs/operating-model.md` §2.4 (Critic contract).",
      "See also OM §9.1 for the routing table.",
    ].join("\n"),
  });
  const result = checkSectionCitations(root, { markdownPaths: ["docs/operating-model.md", "roles/example.md"] });
  assert.equal(result.stats.citationsChecked, 2);
  assert.equal(result.failures.length, 2);
  assert.match(result.failures[0], /roles\/example\.md:1 -> §2\.4: no subsection §2\.4 under §2 "Roles and boundaries"/);
  assert.match(result.failures[1], /roles\/example\.md:2 -> §9\.1: section does not exist/);
  assert.equal(result.warnings.length, 0);
});

test("checkSectionCitations: warns (non-failing) on a kind-B mismatched description, passes a matching one clean", () => {
  const root = fixture({
    "roles/example.md": [
      "See `docs/operating-model.md` §4 (review system).",
      "See `docs/operating-model.md` §3.2 (duties).",
    ].join("\n"),
  });
  const result = checkSectionCitations(root, { markdownPaths: ["docs/operating-model.md", "roles/example.md"] });
  assert.equal(result.failures.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /roles\/example\.md:1 -> §4 \("review system"\): resolves to "The lifecycle"/);
});

test("checkSectionCitations: a bare §N with no named anchor is out of detection scope", () => {
  const root = fixture({
    "roles/example.md": "§3.2 step 3b, unrelated to any named document.",
  });
  const result = checkSectionCitations(root, { markdownPaths: ["docs/operating-model.md", "roles/example.md"] });
  assert.equal(result.stats.citationsChecked, 0);
  assert.equal(result.failures.length, 0);
  assert.equal(result.warnings.length, 0);
});

test("checkSectionCitations: excluded classes (specs/backlog/state.md) are never scanned even when they carry stale citations", () => {
  const root = fixture({
    "docs/state.md": "Narrative: `OM §2.4` was the old citation, now fixed elsewhere.",
    "backlog/items/example.md": "Quoting the defect: `operating-model.md` §9.9.",
  });
  const result = checkSectionCitations(root, {
    markdownPaths: ["docs/operating-model.md", "docs/state.md", "backlog/items/example.md"],
  });
  assert.equal(result.stats.markdownFiles, 1); // only docs/operating-model.md itself remains in scope
  assert.equal(result.stats.citationsChecked, 0);
  assert.equal(result.failures.length, 0);
});

test("checkSectionCitations: canonical docs/adr/ IS scanned and catches a genuinely stale citation; its generated mirror is excluded", () => {
  const root = fixture({
    // A real defect shape (ADR-0009 precedent): a live "Full articulation" pointer
    // to a subsection that no longer exists must be caught in the canonical source.
    "docs/adr/0099-example.md": "Full articulation: `operating-model.md` §9.9.",
    // Same stale citation, vendored copy -- must stay exempt (byte-identical, would
    // just duplicate the canonical finding under a second path).
    "plugins/pipeline-core/docs/adr/0099-example.md": "Full articulation: `operating-model.md` §9.9.",
  });
  const result = checkSectionCitations(root, {
    markdownPaths: ["docs/operating-model.md", "docs/adr/0099-example.md", "plugins/pipeline-core/docs/adr/0099-example.md"],
  });
  assert.equal(result.stats.markdownFiles, 2); // operating-model.md + the canonical ADR; mirror stays excluded
  assert.equal(result.stats.citationsChecked, 1);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /docs\/adr\/0099-example\.md:1 -> §9\.9: section does not exist/);
});

test("checkSectionCitations: absolute repo root and relative markdownPaths together resolve correctly (real harness contract)", () => {
  const root = fixture({ "CLAUDE.md": "Clean: `docs/operating-model.md` §1 (What the model protects)." });
  assert.ok(root.startsWith("/") || /^[A-Za-z]:\\/.test(root), "fixture root must be absolute");
  const result = checkSectionCitations(root, { markdownPaths: ["docs/operating-model.md", "CLAUDE.md"] });
  assert.equal(result.failures.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.stats.citationsChecked, 1);
});

test("checkSectionCitations: a vendored roles/guardrails file citing operating-model.md fails when the vendored copy itself is missing", () => {
  const root = fixture({
    "plugins/pipeline-core/roles/example.md": "See `docs/operating-model.md` §1 (What the model protects).",
  });
  const result = checkSectionCitations(root, {
    markdownPaths: ["docs/operating-model.md", "plugins/pipeline-core/roles/example.md"],
    fileExists: () => false,
  });
  assert.equal(result.failures.length, 1);
  assert.match(
    result.failures[0],
    /plugins\/pipeline-core\/roles\/example\.md:1 -> cites docs\/operating-model\.md but plugins\/pipeline-core\/docs\/operating-model\.md does not exist/,
  );
});

test("checkSectionCitations: a vendored roles/guardrails file citing operating-model.md passes when the vendored copy exists", () => {
  const root = fixture({
    "plugins/pipeline-core/roles/example.md": "See `docs/operating-model.md` §1 (What the model protects).",
  });
  const result = checkSectionCitations(root, {
    markdownPaths: ["docs/operating-model.md", "plugins/pipeline-core/roles/example.md"],
    fileExists: () => true,
  });
  assert.equal(result.failures.length, 0);
});

test("real repository: docs/operating-model.md's live heading structure resolves at least sections 1-3 with the documented subsections", () => {
  const sections = parseOperatingModelHeadings(readFileSync(resolve(REPO, "docs/operating-model.md"), "utf8"));
  assert.ok(sections.length >= 3);
  assert.equal(sections[0].number, 1);
  const three = sections.find((s) => s.number === 3);
  assert.ok(three);
  assert.ok(three.subsections.length >= 1);
});

test("real repository: current in-scope citations produce zero hard failures against verify.mjs's own gate contract", () => {
  const result = checkSectionCitations(REPO);
  assert.equal(result.failures.length, 0, result.failures.join("\n"));
});
