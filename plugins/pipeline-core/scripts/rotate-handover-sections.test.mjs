// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { applyRotation, planRotation, splitSections, TAIL_SECTION_HEADINGS, DEFAULT_RETAIN_COUNT } from "./rotate-handover-sections.mjs";

/**
 * Synthetic fixture mirroring docs/state.md's real shape: a preamble, five
 * reverse-chronological `## <date> ...` session entries (newest first),
 * one carrying an open marker, one older entry cross-referenced from the
 * "Open items and next block" tail section, then the never-rotatable tail
 * sections.
 */
function buildFixture() {
  return `# Project state — Fixture

> Canonical operational handover for this fixture.

**Last updated:** 2026-08-12

## 2026-08-12 Newest closed session (current)

Body of the newest entry, still marked current.

## 2026-08-11 Second-newest closed session

Body of the second-newest entry.

## 2026-08-10 Third session, referenced from open items

Body of the third entry. This one's title is quoted verbatim in the open
items section below, so it must survive rotation even though it is old.

## 2026-08-09 Fourth session, carries an in-progress marker (in progress)

Body of the fourth entry, marked in-progress despite its age.

## 2026-08-08 Fifth session, genuinely closed and unreferenced

Body of the fifth entry. Nothing points at this one. It should rotate.

## 2026-07-30 Sixth session, also genuinely closed

Body of the sixth entry, from a different month than the fifth.

## Operational head

- Current pointer: nothing special.

## Open items and next block

- Follow up on "Third session, referenced from open items" — still open.

## Observation publication queue

- Nothing queued.

## Re-entry

- Resume here.

## Recovery

- Nothing to recover.
`;
}

test("splitSections finds the preamble and every H2 section in order", () => {
  const { preambleLines, sections } = splitSections(buildFixture());
  assert.ok(preambleLines.join("\n").includes("# Project state — Fixture"));
  assert.equal(sections.length, 11);
  assert.match(sections[0].headingLine, /^## 2026-08-12/);
  assert.equal(sections.at(-1).headingLine, "## Recovery");
});

test("planRotation retains the newest N, an open-marker entry, a cross-referenced entry, and all tail sections", () => {
  const { decisions } = planRotation(buildFixture(), { retainCount: DEFAULT_RETAIN_COUNT });
  const byTitle = new Map(decisions.map((d) => [d.section.headingLine.replace(/^##\s*/, ""), d]));

  assert.equal(byTitle.get("2026-08-12 Newest closed session (current)").action, "retain");
  assert.equal(byTitle.get("2026-08-11 Second-newest closed session").action, "retain");
  assert.equal(byTitle.get("2026-08-10 Third session, referenced from open items").action, "retain");
  assert.equal(byTitle.get("2026-08-10 Third session, referenced from open items").reason, "cross-referenced");
  assert.equal(byTitle.get("2026-08-09 Fourth session, carries an in-progress marker (in progress)").action, "retain");
  assert.equal(byTitle.get("2026-08-09 Fourth session, carries an in-progress marker (in progress)").reason, "open-marker");

  assert.equal(byTitle.get("2026-08-08 Fifth session, genuinely closed and unreferenced").action, "archive");
  assert.equal(byTitle.get("2026-07-30 Sixth session, also genuinely closed").action, "archive");

  for (const heading of TAIL_SECTION_HEADINGS) {
    assert.equal(byTitle.get(heading).action, "retain");
    assert.equal(byTitle.get(heading).reason, "tail-section");
  }
});

test("applyRotation never touches an open-marker entry or a cross-referenced entry, only genuinely closed ones", () => {
  const { newContent } = applyRotation(buildFixture(), { retainCount: DEFAULT_RETAIN_COUNT, rotatedDate: "2026-08-12" });
  assert.match(newContent, /## 2026-08-09 Fourth session, carries an in-progress marker \(in progress\)/);
  assert.match(newContent, /## 2026-08-10 Third session, referenced from open items/);
  assert.match(newContent, /Follow up on "Third session, referenced from open items"/);
  assert.doesNotMatch(newContent, /## 2026-08-08 Fifth session/);
  assert.doesNotMatch(newContent, /## 2026-07-30 Sixth session/);
  assert.match(newContent, /archived to `docs\/state-archive\/2026-08\.md`/);
  assert.match(newContent, /archived to `docs\/state-archive\/2026-07\.md`/);
});

test("reconstruction: archived section bytes are byte-identical to the original section text", () => {
  const original = buildFixture();
  const { sections } = splitSections(original);
  const fifth = sections.find((s) => s.headingLine.includes("Fifth session"));
  const sixth = sections.find((s) => s.headingLine.includes("Sixth session"));

  const { archiveGroups } = applyRotation(original, { retainCount: DEFAULT_RETAIN_COUNT, rotatedDate: "2026-08-12" });
  const augustArchive = archiveGroups.get("docs/state-archive/2026-08.md");
  const julyArchive = archiveGroups.get("docs/state-archive/2026-07.md");

  assert.ok(augustArchive.includes(fifth.lines.join("\n")), "fifth entry archived verbatim");
  assert.ok(julyArchive.includes(sixth.lines.join("\n")), "sixth entry archived verbatim");
});

test("retained sections are byte-identical to their original text in the rotated live file", () => {
  const original = buildFixture();
  const { sections } = splitSections(original);
  const { newContent } = applyRotation(original, { retainCount: DEFAULT_RETAIN_COUNT, rotatedDate: "2026-08-12" });

  const retainedTitles = ["Newest closed session", "Second-newest closed session", "Third session, referenced from open items", "Fourth session, carries an in-progress marker"];
  for (const title of retainedTitles) {
    const section = sections.find((s) => s.headingLine.includes(title));
    assert.ok(newContent.includes(section.lines.join("\n")), `${title} retained verbatim`);
  }
});

test("idempotency: a second rotation run over the already-rotated file is a no-op", () => {
  const original = buildFixture();
  const first = applyRotation(original, { retainCount: DEFAULT_RETAIN_COUNT, rotatedDate: "2026-08-12" });
  const second = applyRotation(first.newContent, { retainCount: DEFAULT_RETAIN_COUNT, rotatedDate: "2026-08-13" });

  assert.equal(second.newContent, first.newContent, "no further changes on the second pass");
  assert.equal(second.archiveGroups.size, 0, "nothing new archived on the second pass");
  assert.equal(second.decisions.filter((d) => d.action === "archive").length, 0);
});

test("planRotation is fail-safe: an entry is retained unless ALL three conditions for archiving hold", () => {
  const onlyOpenMarker = `# Fixture

## 2026-08-05 Old but current (current)

Still open despite age.

## 2026-08-01 Old and closed

Genuinely closed.

## Operational head

nothing
## Open items and next block

nothing
## Observation publication queue

nothing
## Re-entry

nothing
## Recovery

nothing
`;
  const { decisions } = planRotation(onlyOpenMarker, { retainCount: 0 });
  const byTitle = new Map(decisions.map((d) => [d.section.headingLine.replace(/^##\s*/, ""), d]));
  assert.equal(byTitle.get("2026-08-05 Old but current (current)").action, "retain");
  assert.equal(byTitle.get("2026-08-01 Old and closed").action, "archive");
});
