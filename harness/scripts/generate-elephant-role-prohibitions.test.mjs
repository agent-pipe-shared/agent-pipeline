#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * The contract that makes the role-prohibitions block
 * `plugins/pipeline-core/skills/pipeline-start/SKILL.md` embeds trustworthy.
 *
 * The block is generated from `roles/elephant.md`'s own EL-NN headings and
 * `Rule:` text. Without this suite that is a claim; with it, it is a
 * property: the committed bytes between the START/END markers must equal
 * what the generator produces right now, so an edit to a prohibition's rule
 * text (or a renumbering, or a new prohibition) that is not followed by
 * regenerating SKILL.md turns the suite red instead of silently shipping a
 * stale summary. Mirrors `generate-agent-obligations.test.mjs`'s own
 * pattern -- read that file first if this one is unclear.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ELEPHANT_ROLE_PATH,
  END_MARKER,
  EXCLUDED_EL_IDS,
  INCLUDED_EL_IDS,
  firstSentence,
  parseElephantHeadings,
  renderRoleProhibitions,
  SKILL_PATH,
  START_MARKER,
} from "./generate-elephant-role-prohibitions.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function extractBlock(skillText) {
  const start = skillText.indexOf(START_MARKER);
  const end = skillText.indexOf(END_MARKER);
  assert.ok(start >= 0 && end >= 0, "SKILL.md must carry both the START and END markers");
  return skillText.slice(start, end + END_MARKER.length);
}

const roots = [];
function tempRootWithElephantRole(mutate) {
  const base = mkdtempSync(join(tmpdir(), "elephant-role-prohibitions-"));
  roots.push(base);
  mkdirSync(join(base, "roles"), { recursive: true });
  mkdirSync(join(base, "plugins", "pipeline-core", "skills", "pipeline-start"), { recursive: true });
  const roleText = readFileSync(ELEPHANT_ROLE_PATH, "utf8");
  writeFileSync(join(base, "roles", "elephant.md"), mutate(roleText));
  // The generator's write mode also needs a SKILL.md carrying the markers;
  // the drift test below only calls the read-only render path, so a minimal
  // stub with just the markers is enough.
  writeFileSync(
    join(base, "plugins", "pipeline-core", "skills", "pipeline-start", "SKILL.md"),
    `${START_MARKER}\n${END_MARKER}\n`,
  );
  return base;
}

test.after(() => {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
});

test("AC-1: the committed SKILL.md block is byte-identical to a fresh generation", () => {
  const committedSkill = readFileSync(SKILL_PATH, "utf8");
  const committedBlock = extractBlock(committedSkill);
  const generated = renderRoleProhibitions().replace(/\n$/u, "");
  assert.equal(
    generated,
    committedBlock,
    "plugins/pipeline-core/skills/pipeline-start/SKILL.md's role-prohibitions block is stale -- " +
      "run: node harness/scripts/generate-elephant-role-prohibitions.mjs",
  );
});

test("AC-2: the block carries the literal GENERATED FROM roles/elephant.md marker (backlog item done_when)", () => {
  const committedSkill = readFileSync(SKILL_PATH, "utf8");
  assert.match(committedSkill, /GENERATED FROM roles\/elephant\.md/u);
});

test("AC-3 (drift): editing an included id's Rule: text at the source changes the emitted block", () => {
  const root = tempRootWithElephantRole((roleText) =>
    roleText.replace(
      "### EL-01 (MUST NOT) — No production code\n\n- **Rule:** You write no production code.",
      "### EL-01 (MUST NOT) — No production code\n\n- **Rule:** You write absolutely no production code, ever, full stop.",
    ),
  );
  const original = renderRoleProhibitions();
  const drifted = renderRoleProhibitions({ rootDir: root });
  assert.notEqual(drifted, original, "editing EL-01's Rule: text must change the generated block");
  // Word-wrap may fold this clause across a line break, so compare on
  // whitespace-normalized text rather than assuming a single physical line.
  assert.match(drifted.replace(/\s+/gu, " "), /You write absolutely no production code, ever, full stop/u);
});

test("AC-3b (drift): adding a new, unaccounted EL id at the source is refused rather than silently dropped", () => {
  const root = tempRootWithElephantRole(
    (roleText) =>
      `${roleText}\n\n### EL-99 (MUST NOT) — Fixture-only invented prohibition\n\n- **Rule:** This id exists only for this test.\n`,
  );
  assert.throws(
    () => renderRoleProhibitions({ rootDir: root }),
    /EL-99.*neither INCLUDED_EL_IDS nor EXCLUDED_EL_IDS/su,
    "a new EL id absent from both INCLUDED_EL_IDS and EXCLUDED_EL_IDS must fail loudly, not render silently",
  );
});

test("AC-4: every EL-NN heading roles/elephant.md actually defines is accounted for -- included or excluded with a reason", () => {
  const roleText = readFileSync(ELEPHANT_ROLE_PATH, "utf8");
  const headings = parseElephantHeadings(roleText);
  assert.ok(headings.length > 20, `expected roles/elephant.md to define well over 20 EL headings; parsed ${headings.length}`);
  for (const heading of headings) {
    const included = INCLUDED_EL_IDS.includes(heading.id);
    const excluded = Object.prototype.hasOwnProperty.call(EXCLUDED_EL_IDS, heading.id);
    assert.ok(
      included || excluded,
      `${heading.id} (roles/elephant.md line ${heading.lineIndex + 1}, "${heading.title}") is accounted for in neither ` +
        "INCLUDED_EL_IDS nor EXCLUDED_EL_IDS",
    );
    if (excluded) assert.ok(EXCLUDED_EL_IDS[heading.id].length > 0, `${heading.id}'s exclusion reason must be non-empty`);
  }
});

test("AC-5: every included id's short text appears in the generated block, in print order", () => {
  const generated = renderRoleProhibitions();
  let lastIndex = -1;
  for (const id of INCLUDED_EL_IDS) {
    const index = generated.indexOf(id, lastIndex + 1);
    assert.ok(index > lastIndex, `${id} must appear in the generated block after the previously checked id`);
    lastIndex = index;
  }
});

test("AC-6: the confirmation blockquote's id list matches INCLUDED_EL_IDS exactly, in order", () => {
  const generated = renderRoleProhibitions();
  const match = /^> Role prohibitions loaded: ([^ ]+) —/mu.exec(generated);
  assert.ok(match, "the generated block must carry the confirmation blockquote line");
  assert.equal(match[1], INCLUDED_EL_IDS.join("/"));
});

test("firstSentence: extracts a quote-balanced clause even when the first raw period sits inside an open quote", () => {
  const text =
    '"The Elephant writes no bulk artifacts itself; if a task is dispatchable, dispatch it (x). Elephant time is reserved." This applies to execution-phase work.';
  const result = firstSentence(text);
  assert.equal(
    result,
    '"The Elephant writes no bulk artifacts itself; if a task is dispatchable, dispatch it (x). Elephant time is reserved."',
  );
});

test("firstSentence: extracts a backtick-balanced clause even when the first raw period sits inside a code span", () => {
  const text = "Any new foundational decision, register entry (`docs/state.md`) plus ADR. A decision without a written trace does not exist.";
  const result = firstSentence(text);
  assert.equal(result, "Any new foundational decision, register entry (`docs/state.md`) plus ADR.");
});

test("firstSentence: falls back to the whole line (trailing colon stripped) when no sentence boundary exists", () => {
  const result = firstSentence("Judgment stays at the right level, in three directions:");
  assert.equal(result, "Judgment stays at the right level, in three directions");
});

test("AC-7: the document carries no absolute or machine-specific path", () => {
  const generated = renderRoleProhibitions();
  assert.doesNotMatch(generated, /\/home\//u);
  assert.doesNotMatch(generated, /C:\\Users/u);
  assert.doesNotMatch(generated, new RegExp(REPO_ROOT.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});
