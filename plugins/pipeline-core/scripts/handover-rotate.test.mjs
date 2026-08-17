#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARCHIVE_DIR,
  ARCHIVED_HISTORY_HEADING,
  HandoverRotationError,
  isExtractionAcknowledged,
  planHandoverRotation,
  planRotation,
  recordExtractionAcknowledged,
  rotateHandover,
  splitHandoverSections,
} from "./handover-rotate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH_ROOT, { recursive: true });

function fixtureRoot(label) {
  return mkdtempSync(join(SCRATCH_ROOT, `handover-rotate-test-${label}-`));
}

const SAMPLE = [
  "# docs/state.md",
  "",
  "**Last updated:** 2026-08-17",
  "**Project status:** fixture",
  "",
  "## Block A",
  "Content A line 1.",
  "Content A line 2.",
  "",
  "## Block B",
  "Content B line 1.",
  "",
].join("\n");

// == splitHandoverSections: preamble vs. H2 sections ==
{
  const { preambleLines, sections } = splitHandoverSections(SAMPLE);
  assert.deepEqual(preambleLines, ["# docs/state.md", "", "**Last updated:** 2026-08-17", "**Project status:** fixture", ""]);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, "Block A");
  assert.equal(sections[1].title, "Block B");
}

// == planHandoverRotation: typed refusal for an unmatched heading, zero mutation implied (pure function) ==
{
  assert.throws(
    () => planHandoverRotation(SAMPLE, { sectionHeadings: ["Block Z"] }),
    (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-ROTATION-SECTION-NOT-FOUND",
  );
}

// == planHandoverRotation: refuses to target the "Archived history" index section itself ==
{
  const withIndex = `${SAMPLE}\n## ${ARCHIVED_HISTORY_HEADING}\n\n| Date range | Summary | Archive |\n|---|---|---|\n`;
  assert.throws(
    () => planHandoverRotation(withIndex, { sectionHeadings: [ARCHIVED_HISTORY_HEADING] }),
    (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-ROTATION-ARCHIVED-HISTORY-IMMUTABLE",
  );
}

// == DoD item 5: rotation round-trips losslessly (archived + still-live reconstructs the original) ==
{
  const { preambleLines, sections } = splitHandoverSections(SAMPLE);
  const plan = planHandoverRotation(SAMPLE, { sectionHeadings: ["Block A"] });
  const archivedByTitle = new Map(plan.archiveSections.map((s) => [s.title, s]));
  const remainingByTitle = new Map(plan.remainingSections.map((s) => [s.title, s]));
  const reconstructedLines = [
    ...preambleLines,
    ...sections.flatMap((s) => (archivedByTitle.get(s.title) ?? remainingByTitle.get(s.title)).lines),
  ];
  const reconstructed = `${reconstructedLines.join("\n")}\n`;
  assert.equal(reconstructed, SAMPLE, "archived + still-live sections must reconstruct the original byte-for-byte");

  const rotation = planRotation({
    liveContent: SAMPLE,
    handoverPath: "docs/state.md",
    sectionHeadings: ["Block A"],
    summary: "test rotation",
    rotationDate: "2026-08-17",
  });
  // The actual written archive/live content each carry the verbatim moved bytes.
  assert.ok(rotation.archiveContent.includes(plan.archiveSections[0].lines.join("\n")));
  assert.ok(rotation.newLiveContent.includes(plan.remainingSections[0].lines.join("\n")));
  assert.equal(rotation.archivePath, `${ARCHIVE_DIR}/2026-08-17--block-a.md`);
  assert.ok(rotation.newLiveContent.includes(`## ${ARCHIVED_HISTORY_HEADING}`));
  assert.ok(rotation.newLiveContent.includes(rotation.archivePath));
}

// == DoD item 6: rotateHandover() refuses without acknowledgment -- typed error, zero mutation ==
{
  const root = fixtureRoot("no-ack");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    const before = readFileSync(join(root, "docs", "state.md"), "utf8");

    assert.equal(isExtractionAcknowledged(root), false);
    assert.throws(
      () => rotateHandover({
        root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17",
      }),
      (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED",
    );

    const after = readFileSync(join(root, "docs", "state.md"), "utf8");
    assert.equal(after, before, "a refused rotation must leave the live file byte-identical");
    assert.equal(existsSync(join(root, ARCHIVE_DIR)), false, "a refused rotation must create no archive directory");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == DoD item 7: rotation succeeds once acknowledged, and the index links to the new archive file ==
{
  const root = fixtureRoot("ack-then-rotate");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");

    const ack1 = recordExtractionAcknowledged(root, { now: () => "2026-08-17T00:00:00.000Z" });
    assert.equal(ack1.acknowledgedAt, "2026-08-17T00:00:00.000Z");
    assert.equal(isExtractionAcknowledged(root), true);
    // Idempotent: a second call does not overwrite the first timestamp.
    const ack2 = recordExtractionAcknowledged(root, { now: () => "2099-01-01T00:00:00.000Z" });
    assert.equal(ack2.acknowledgedAt, "2026-08-17T00:00:00.000Z");

    const plan = rotateHandover({
      root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "moved Block A", rotationDate: "2026-08-17",
    });
    assert.equal(plan.archivedTitles.length, 1);
    assert.equal(plan.archivedTitles[0], "Block A");

    const archiveFullPath = join(root, plan.archivePath);
    assert.equal(existsSync(archiveFullPath), true);
    const archiveContent = readFileSync(archiveFullPath, "utf8");
    assert.ok(archiveContent.includes("Content A line 1."));
    assert.ok(archiveContent.includes("Content A line 2."));

    const liveContent = readFileSync(join(root, "docs", "state.md"), "utf8");
    assert.ok(liveContent.includes(`## ${ARCHIVED_HISTORY_HEADING}`));
    assert.ok(liveContent.includes(plan.archivePath), "live file's Archived history index must link to the new archive file");
    assert.ok(liveContent.includes("Content B line 1."), "the still-open block stays in the live file verbatim");
    assert.ok(!liveContent.includes("Content A line 1."), "the archived block's content leaves the live file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == A second rotation appends a new row above the existing "Archived history" row (newest first) ==
{
  const root = fixtureRoot("second-rotation");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    const twoBlock = [
      "# docs/state.md",
      "",
      "## Block A",
      "A content.",
      "",
      "## Block B",
      "B content.",
      "",
      "## Block C",
      "C content.",
      "",
    ].join("\n");
    writeFileSync(join(root, "docs", "state.md"), twoBlock, "utf8");
    recordExtractionAcknowledged(root, { now: () => "2026-08-17T00:00:00.000Z" });

    rotateHandover({ root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "first", rotationDate: "2026-08-17" });
    const secondPlan = rotateHandover({ root, handoverPath: "docs/state.md", sectionHeadings: ["Block B"], summary: "second", rotationDate: "2026-08-18", slug: "second-slug" });

    const liveContent = readFileSync(join(root, "docs", "state.md"), "utf8");
    const rows = liveContent.split("\n").filter((line) => /^\|.*\|$/.test(line) && !/Date range|---/.test(line));
    assert.equal(rows.length, 2);
    assert.ok(rows[0].includes(secondPlan.archivePath), "the newest rotation's row is listed first");
    assert.ok(liveContent.includes("C content."), "the still-open block survives two rotations untouched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == Rotating a repeated (already-archived) heading refuses with a typed error, zero mutation ==
{
  const root = fixtureRoot("missing-file");
  try {
    assert.throws(
      () => rotateHandover({ root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17" }),
      (error) => error instanceof HandoverRotationError, // not-acknowledged fires first; still a typed, zero-mutation refusal
    );
    recordExtractionAcknowledged(root);
    assert.throws(
      () => rotateHandover({ root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17" }),
      (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-ROTATION-FILE-NOT-FOUND",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("handover-rotate.test.mjs: all assertions passed");
