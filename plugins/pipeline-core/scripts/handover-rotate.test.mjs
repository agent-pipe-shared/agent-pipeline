#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adjustRelativeLinksForArchiveDepth,
  ARCHIVE_DIR,
  ARCHIVED_HISTORY_HEADING,
  assertSectionsExtractionAcknowledged,
  getAcknowledgedSections,
  HandoverRotationError,
  isSectionExtractionAcknowledged,
  planHandoverRotation,
  planRotation,
  recordExtractionAcknowledged,
  registerArchiveInDocGovernance,
  rotateHandover,
  sectionContentHash,
  splitHandoverSections,
} from "./handover-rotate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
const SCRIPT_PATH = join(HERE, "handover-rotate.mjs");
mkdirSync(SCRATCH_ROOT, { recursive: true });

function fixtureRoot(label) {
  return mkdtempSync(join(SCRATCH_ROOT, `handover-rotate-test-${label}-`));
}

function snapshotFixture(root) {
  const entries = [];
  function visit(relativePath) {
    const fullPath = join(root, relativePath);
    const stat = lstatSync(fullPath);
    if (stat.isDirectory()) {
      entries.push({ path: relativePath, type: "directory" });
      for (const child of readdirSync(fullPath).sort()) visit(join(relativePath, child));
    } else if (stat.isSymbolicLink()) {
      entries.push({ path: relativePath, type: "symlink", target: readlinkSync(fullPath) });
    } else {
      entries.push({ path: relativePath, type: "file", content: readFileSync(fullPath).toString("base64") });
    }
  }
  visit(".");
  return entries;
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

// == sectionContentHash: stable for identical bytes, changes when a section's own lines change ==
{
  const { sections } = splitHandoverSections(SAMPLE);
  const hashA1 = sectionContentHash(sections[0].lines);
  const hashA2 = sectionContentHash(sections[0].lines);
  assert.equal(hashA1, hashA2, "hashing the same lines twice is stable");
  const edited = sections[0].lines.map((line, i) => (i === 1 ? "Content A line 1, edited." : line));
  assert.notEqual(sectionContentHash(edited), hashA1, "editing a section's content changes its hash");
}

// == DoD (a): rotateHandover() refuses when the requested section is never acknowledged -- typed error naming it, zero mutation ==
{
  const root = fixtureRoot("no-ack");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    const before = readFileSync(join(root, "docs", "state.md"), "utf8");

    assert.deepEqual(getAcknowledgedSections(root), []);
    assert.throws(
      () => rotateHandover({
        root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17",
      }),
      (error) => error instanceof HandoverRotationError
        && error.code === "HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED"
        && error.message.includes('"Block A"'),
    );

    const after = readFileSync(join(root, "docs", "state.md"), "utf8");
    assert.equal(after, before, "a refused rotation must leave the live file byte-identical");
    assert.equal(existsSync(join(root, ARCHIVE_DIR)), false, "a refused rotation must create no archive directory");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == DoD (b): acknowledging a section then rotating it succeeds, and the index links to the new archive file ==
{
  const root = fixtureRoot("ack-then-rotate");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");

    const [ack1] = recordExtractionAcknowledged(root, {
      sectionHeadings: ["Block A"], liveContent: SAMPLE, now: () => "2026-08-17T00:00:00.000Z",
    });
    assert.equal(ack1.title, "Block A");
    assert.equal(ack1.acknowledgedAt, "2026-08-17T00:00:00.000Z");
    const expectedHash = sectionContentHash(splitHandoverSections(SAMPLE).sections[0].lines);
    assert.equal(ack1.contentHash, expectedHash);
    assert.equal(isSectionExtractionAcknowledged(root, { title: "Block A", contentHash: expectedHash }), true);
    // Re-acknowledging (upsert, not idempotent-preservation) replaces the entry's timestamp for the same title.
    const [ack2] = recordExtractionAcknowledged(root, {
      sectionHeadings: ["Block A"], liveContent: SAMPLE, now: () => "2099-01-01T00:00:00.000Z",
    });
    assert.equal(ack2.acknowledgedAt, "2099-01-01T00:00:00.000Z");
    assert.equal(getAcknowledgedSections(root).length, 1, "re-acknowledging the same title upserts, never duplicates");

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

// == DoD (c): editing a section's content after acknowledgment (before rotation) makes it refuse again ==
{
  const root = fixtureRoot("edited-after-ack");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE });
    const originalHash = sectionContentHash(splitHandoverSections(SAMPLE).sections[0].lines);
    assert.equal(isSectionExtractionAcknowledged(root, { title: "Block A", contentHash: originalHash }), true);

    const edited = SAMPLE.replace("Content A line 2.", "Content A line 2, edited after acknowledgment.");
    writeFileSync(join(root, "docs", "state.md"), edited, "utf8");
    const before = readFileSync(join(root, "docs", "state.md"), "utf8");

    assert.throws(
      () => rotateHandover({
        root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17",
      }),
      (error) => error instanceof HandoverRotationError
        && error.code === "HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED"
        && error.message.includes('"Block A"'),
    );
    const after = readFileSync(join(root, "docs", "state.md"), "utf8");
    assert.equal(after, before, "a content-hash-mismatch refusal leaves the live file byte-identical");
    // The stale acknowledgment (by the OLD hash) still stands untouched -- only the CURRENT content fails to match it.
    assert.equal(isSectionExtractionAcknowledged(root, { title: "Block A", contentHash: originalHash }), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == DoD (d): a multi-section rotation where only some sections are acknowledged fails closed entirely, naming ALL failing sections ==
{
  const root = fixtureRoot("multi-section-partial-ack");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    const threeBlock = [
      "# docs/state.md", "", "## Block A", "A content.", "", "## Block B", "B content.", "", "## Block C", "C content.", "",
    ].join("\n");
    writeFileSync(join(root, "docs", "state.md"), threeBlock, "utf8");
    // Only Block A is acknowledged; Block B and Block C are left unacknowledged.
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: threeBlock });
    const before = readFileSync(join(root, "docs", "state.md"), "utf8");

    assert.throws(
      () => rotateHandover({
        root, handoverPath: "docs/state.md", sectionHeadings: ["Block A", "Block B", "Block C"], summary: "s", rotationDate: "2026-08-17",
      }),
      (error) => {
        if (!(error instanceof HandoverRotationError) || error.code !== "HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED") return false;
        return error.message.includes('"Block B"') && error.message.includes('"Block C"') && !error.message.includes('"Block A"');
      },
    );
    const after = readFileSync(join(root, "docs", "state.md"), "utf8");
    assert.equal(after, before, "a partially-acknowledged multi-section rotation fails closed with zero mutation");
    assert.equal(existsSync(join(root, ARCHIVE_DIR)), false, "no archive directory for a fully-refused multi-section rotation, not even for the acknowledged subset");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == DoD (e): an old-schema (or missing) marker file is treated as fully unacknowledged, not a crash ==
{
  const root = fixtureRoot("old-schema-marker");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    const markerPath = join(root, ".git", "agent-pipeline", "handover-rotation", "extraction-acknowledged.json");
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(
      markerPath,
      `${JSON.stringify({ schema: "pipeline.handover-rotation-extraction-ack.v1", acknowledgedAt: "2026-08-17T00:00:00.000Z" })}\n`,
      "utf8",
    );

    assert.deepEqual(getAcknowledgedSections(root), [], "an old-schema (v1) marker is treated as absent, never grandfathered");
    const before = readFileSync(join(root, "docs", "state.md"), "utf8");
    assert.throws(
      () => rotateHandover({
        root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17",
      }),
      (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED",
    );
    assert.equal(readFileSync(join(root, "docs", "state.md"), "utf8"), before, "an old-schema-marker refusal leaves the live file untouched");

    // Acknowledging a section now upserts a fresh v2 record over the old-schema file -- no crash, no partial trust.
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE });
    const rewritten = JSON.parse(readFileSync(markerPath, "utf8"));
    assert.equal(rewritten.schema, "pipeline.handover-rotation-extraction-ack.v2");
    assert.equal(rewritten.acknowledgedSections.length, 1);
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
    // Per-section hashing means acknowledging both headings against the ORIGINAL content stays valid for the
    // second rotation even though the live file has already changed shape after the first rotation removed
    // Block A -- Block B's own lines are untouched by that removal.
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A", "Block B"], liveContent: twoBlock, now: () => "2026-08-17T00:00:00.000Z" });

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

// == Rotating an already-archived (now-missing) heading refuses with a typed error, zero mutation ==
{
  const root = fixtureRoot("repeated-heading");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE });
    rotateHandover({ root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17" });
    const after = readFileSync(join(root, "docs", "state.md"), "utf8");

    assert.throws(
      () => rotateHandover({ root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s2", rotationDate: "2026-08-18" }),
      (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-ROTATION-SECTION-NOT-FOUND",
    );
    assert.equal(readFileSync(join(root, "docs", "state.md"), "utf8"), after, "a refused repeat rotation leaves the live file untouched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == A rotation of a file that does not exist refuses with a typed error before any acknowledgment check ==
{
  const root = fixtureRoot("missing-file");
  try {
    assert.throws(
      () => rotateHandover({ root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17" }),
      (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-ROTATION-FILE-NOT-FOUND",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == NVA-HANDOVER-ROT-2 F1: --handover-path escaping root is rejected, typed error, zero write ==
{
  const root = fixtureRoot("traversal-handover-path");
  try {
    const outsideTarget = join(dirname(root), "outside-secret.md");
    assert.throws(
      () => rotateHandover({
        root, handoverPath: "../outside-secret.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17",
      }),
      (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-ROTATION-PATH-ESCAPES-ROOT",
    );
    assert.equal(existsSync(outsideTarget), false, "no write must occur outside root for a traversal --handover-path");
    assert.equal(existsSync(join(root, ARCHIVE_DIR)), false, "no archive directory created inside root either");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == NVA-HANDOVER-ROT-2 F1: --rotation-date must be strict YYYY-MM-DD, typed error, zero write ==
{
  const root = fixtureRoot("traversal-rotation-date");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE });
    assert.throws(
      () => rotateHandover({
        root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "../../../etc/evil",
      }),
      (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-ROTATION-INVALID-DATE",
    );
    assert.equal(existsSync(join(root, ARCHIVE_DIR)), false, "a rejected rotation date must create no archive directory");
    assert.equal(readFileSync(join(root, "docs", "state.md"), "utf8"), SAMPLE, "the live file must remain untouched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == NVA-HANDOVER-ROT-2 F1: --slug is ALWAYS slugify()'d, never used raw -- a traversal payload is neutralized, not raw-joined ==
{
  const root = fixtureRoot("traversal-slug");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE });
    const plan = rotateHandover({
      root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s",
      rotationDate: "2026-08-17", slug: "../../../../etc/evil",
    });
    assert.equal(plan.archivePath, `${ARCHIVE_DIR}/2026-08-17--etc-evil.md`, "a hostile slug is sanitized into a flat, traversal-proof filename");
    assert.ok(!plan.archivePath.includes(".."), "the resolved archive path never contains a traversal segment");
    assert.equal(existsSync(join(root, plan.archivePath)), true, "the archive file was written inside the repository");
    assert.equal(existsSync(join(dirname(root), "evil.md")), false, "no write occurred outside root as a result of the hostile slug");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == The read-only accessors never create the acknowledgment marker as a side effect ==
{
  const root = fixtureRoot("status-read-only");
  try {
    const markerPath = join(root, ".git", "agent-pipeline", "handover-rotation", "extraction-acknowledged.json");
    assert.deepEqual(getAcknowledgedSections(root), []);
    assert.equal(existsSync(markerPath), false, "checking status must never create the acknowledgment marker");
    assert.equal(isSectionExtractionAcknowledged(root, { title: "Block A", contentHash: "deadbeef" }), false);
    assert.equal(existsSync(markerPath), false, "calling it repeatedly stays read-only");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == assertSectionsExtractionAcknowledged is directly callable and read-only too ==
{
  const root = fixtureRoot("assert-read-only");
  try {
    const markerPath = join(root, ".git", "agent-pipeline", "handover-rotation", "extraction-acknowledged.json");
    assert.throws(
      () => assertSectionsExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE }),
      (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED",
    );
    assert.equal(existsSync(markerPath), false, "a refusal from the assert function must never create the marker file");
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE });
    assert.doesNotThrow(() => assertSectionsExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == adjustRelativeLinksForArchiveDepth: rewrites a bare-relative link, leaves URLs/anchors/absolute paths alone ==
{
  const lines = [
    "See [ADR](adr/0051-foo.md) and [same-doc](#heading) and [ext](https://example.com/x) and [abs](/root.md).",
  ];
  const adjusted = adjustRelativeLinksForArchiveDepth(lines, { handoverPath: "docs/state.md", archivePath: "docs/state-archive/2026-08-18--x.md" });
  assert.equal(
    adjusted[0],
    "See [ADR](../adr/0051-foo.md) and [same-doc](#heading) and [ext](https://example.com/x) and [abs](/root.md).",
  );
}

// == adjustRelativeLinksForArchiveDepth: no-op when handoverPath and archivePath share a directory ==
{
  const lines = ["[x](foo.md)"];
  const adjusted = adjustRelativeLinksForArchiveDepth(lines, { handoverPath: "docs/state.md", archivePath: "docs/2026-08-18--x.md" });
  assert.equal(adjusted[0], "[x](foo.md)");
}

// == A real rotation depth-adjusts a relative link and discloses the deviation in the archive header ==
{
  const root = fixtureRoot("link-adjust");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    const withLink = [
      "# docs/state.md",
      "",
      "## Block A",
      "See [ADR-0051](adr/0051-foo.md) for background.",
      "",
      "## Block B",
      "B content.",
      "",
    ].join("\n");
    writeFileSync(join(root, "docs", "state.md"), withLink, "utf8");
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: withLink });

    const plan = rotateHandover({
      root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17",
    });
    const archiveContent = readFileSync(join(root, plan.archivePath), "utf8");
    assert.ok(archiveContent.includes("[ADR-0051](../adr/0051-foo.md)"), "the relative link is rewritten one level up");
    assert.ok(!archiveContent.includes("(adr/0051-foo.md)"), "the original (now-broken) target is gone");
    assert.ok(archiveContent.includes("relative markdown link target"), "the header discloses the deviation");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == A rotation with no relative links keeps the plain byte-for-byte header claim ==
{
  const root = fixtureRoot("link-noop-header");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE });
    const plan = rotateHandover({
      root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17",
    });
    const archiveContent = readFileSync(join(root, plan.archivePath), "utf8");
    assert.ok(archiveContent.includes("byte-for-byte identical"), "no links to adjust -> the plain verbatim claim stays");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const GOVERNANCE_FIXTURE = [
  "{",
  '  "documentation": {',
  '    "inventory": [',
  "      {",
  '        "audience": "maintainer",',
  '        "lifecycle": "maintained",',
  '        "paths": [',
  '          "docs/aaa.md",',
  '          "docs/state.md"',
  "        ]",
  "      }",
  "    ]",
  "  }",
  "}",
  "",
].join("\n");

// == registerArchiveInDocGovernance: inserts the new archive path into handoverPath's group, sorted, comma-correct ==
{
  const root = fixtureRoot("governance-register");
  try {
    mkdirSync(join(root, "governance"), { recursive: true });
    writeFileSync(join(root, "governance", "observation-doc-governance.json"), GOVERNANCE_FIXTURE, "utf8");
    const result = registerArchiveInDocGovernance(root, {
      handoverPath: "docs/state.md",
      archivePath: "docs/state-archive/2026-08-18--x.md",
    });
    assert.equal(result.updated, true);
    const rewritten = readFileSync(join(root, "governance", "observation-doc-governance.json"), "utf8");
    const parsed = JSON.parse(rewritten);
    assert.deepEqual(
      parsed.documentation.inventory[0].paths,
      ["docs/aaa.md", "docs/state-archive/2026-08-18--x.md", "docs/state.md"],
    );
    // Calling it again for the same archivePath is a no-op, not a duplicate insertion.
    const second = registerArchiveInDocGovernance(root, {
      handoverPath: "docs/state.md",
      archivePath: "docs/state-archive/2026-08-18--x.md",
    });
    assert.equal(second.updated, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == registerArchiveInDocGovernance: no registry file present -> silent no-op (consumer-project posture) ==
{
  const root = fixtureRoot("governance-absent");
  try {
    const result = registerArchiveInDocGovernance(root, { handoverPath: "docs/state.md", archivePath: "docs/state-archive/x.md" });
    assert.equal(result.updated, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == registerArchiveInDocGovernance: handoverPath not listed -> typed error, zero mutation ==
{
  const root = fixtureRoot("governance-unlisted");
  try {
    mkdirSync(join(root, "governance"), { recursive: true });
    writeFileSync(join(root, "governance", "observation-doc-governance.json"), GOVERNANCE_FIXTURE, "utf8");
    const before = readFileSync(join(root, "governance", "observation-doc-governance.json"), "utf8");
    assert.throws(
      () => registerArchiveInDocGovernance(root, { handoverPath: "docs/not-listed.md", archivePath: "docs/state-archive/x.md" }),
      (error) => error instanceof HandoverRotationError && error.code === "HANDOVER-ROTATION-GOVERNANCE-PATH-NOT-FOUND",
    );
    const after = readFileSync(join(root, "governance", "observation-doc-governance.json"), "utf8");
    assert.equal(after, before, "a refused governance registration must leave the file byte-identical");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == A full rotation auto-registers the new archive path when a doc-governance registry is present ==
{
  const root = fixtureRoot("rotation-with-governance");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    mkdirSync(join(root, "governance"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    writeFileSync(join(root, "governance", "observation-doc-governance.json"), GOVERNANCE_FIXTURE, "utf8");
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: SAMPLE });
    const plan = rotateHandover({
      root, handoverPath: "docs/state.md", sectionHeadings: ["Block A"], summary: "s", rotationDate: "2026-08-17",
    });
    assert.equal(plan.governanceRegistration.updated, true);
    const registry = JSON.parse(readFileSync(join(root, "governance", "observation-doc-governance.json"), "utf8"));
    assert.ok(registry.documentation.inventory[0].paths.includes(plan.archivePath));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == DoD (f): CLI --acknowledge-extraction-done with no --section-heading is a usage error, exit 1, no marker written ==
{
  const root = fixtureRoot("cli-usage-error");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    const spawned = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--acknowledge-extraction-done"], { encoding: "utf8" });
    assert.equal(spawned.status, 1, "no --section-heading given must exit 1");
    assert.ok(/section-heading/i.test(spawned.stderr), "the usage error must mention --section-heading");
    assert.equal(
      existsSync(join(root, ".git", "agent-pipeline", "handover-rotation", "extraction-acknowledged.json")),
      false,
      "a usage error must write no marker file",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == CLI: --acknowledge-extraction-done with --section-heading succeeds, prints a confirmation, and --status reports it ==
{
  const root = fixtureRoot("cli-acknowledge");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    const ackSpawn = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--root", root, "--acknowledge-extraction-done", "--section-heading", "Block A"],
      { encoding: "utf8" },
    );
    assert.equal(ackSpawn.status, 0, ackSpawn.stderr);
    assert.ok(ackSpawn.stdout.includes("Block A"), "the confirmation line names the acknowledged section");

    const statusSpawn = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--status"], { encoding: "utf8" });
    assert.equal(statusSpawn.status, 0, statusSpawn.stderr);
    assert.ok(statusSpawn.stdout.includes("Block A"), "--status lists the acknowledged section");

    const statusOneSpawn = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--root", root, "--status", "--section-heading", "Block B"],
      { encoding: "utf8" },
    );
    assert.equal(statusOneSpawn.status, 0, statusOneSpawn.stderr);
    assert.ok(/NOT acknowledged/.test(statusOneSpawn.stdout), "--status --section-heading reports an unacknowledged section correctly");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == NVA-W3-F8: CLI --status --handover-path escaping root is rejected, same containment check as rotateHandover ==
{
  const root = fixtureRoot("traversal-status-handover-path");
  try {
    const spawned = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--root", root, "--status", "--section-heading", "Block A", "--handover-path", "../outside-secret-status.md"],
      { encoding: "utf8" },
    );
    assert.equal(spawned.status, 1, "a traversal --handover-path must exit 1 via --status too");
    assert.ok(
      /HANDOVER-ROTATION-PATH-ESCAPES-ROOT/.test(spawned.stderr),
      "the containment check must reject with the same typed error code as rotateHandover",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == NVA-W3-F8: CLI --acknowledge-extraction-done --handover-path escaping root is rejected, same containment check ==
{
  const root = fixtureRoot("traversal-acknowledge-handover-path");
  try {
    const spawned = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--root", root, "--acknowledge-extraction-done", "--section-heading", "Block A", "--handover-path", "../outside-secret-ack.md"],
      { encoding: "utf8" },
    );
    assert.equal(spawned.status, 1, "a traversal --handover-path must exit 1 via --acknowledge-extraction-done too");
    assert.ok(
      /HANDOVER-ROTATION-PATH-ESCAPES-ROOT/.test(spawned.stderr),
      "the containment check must reject with the same typed error code as rotateHandover",
    );
    assert.equal(
      existsSync(join(root, ".git", "agent-pipeline", "handover-rotation", "extraction-acknowledged.json")),
      false,
      "a traversal rejection must write no marker file",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == NVA-B-HANDOVER-CLI-MODES-1: inspection modes are explicit, read-only child-CLI entrypoints ==
{
  const root = fixtureRoot("cli-read-only-modes");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    mkdirSync(join(root, "project"), { recursive: true });
    mkdirSync(join(root, "governance"), { recursive: true });
    writeFileSync(join(root, "docs", "custom.md"), SAMPLE, "utf8");
    writeFileSync(join(root, "project", "pipeline.json"), JSON.stringify({ handover: { path: "docs/custom.md", maxBytes: 10_000 } }), "utf8");
    writeFileSync(join(root, "governance", "observation-doc-governance.json"), GOVERNANCE_FIXTURE, "utf8");
    const cleanState = snapshotFixture(root);

    const checked = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--check-size", "--file", "docs/custom.md"], { encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /utf8-byte-upper-bound/);
    assert.match(checked.stdout, /10000/);
    assert.deepEqual(snapshotFixture(root), cleanState, "--check-size must preserve every fixture entry, including absent marker/archive paths");
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "handover-rotation", "extraction-acknowledged.json")), false);
    assert.equal(existsSync(join(root, ARCHIVE_DIR)), false);

    writeFileSync(join(root, "project", "pipeline.json"), JSON.stringify({ handover: { path: "docs/custom.md", maxBytes: 1 } }), "utf8");
    const overBefore = snapshotFixture(root);
    const over = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--check-size", "--handover-path", "docs/custom.md"], { encoding: "utf8" });
    assert.equal(over.status, 1, "an over-cap read-only size check must fail");
    assert.match(over.stderr, /exceeds configured maximum/i);
    assert.deepEqual(snapshotFixture(root), overBefore, "an over-cap size check must still write nothing");

    writeFileSync(join(root, "project", "pipeline.json"), JSON.stringify({ handover: { path: "docs/custom.md", maxBytes: 10_000 } }), "utf8");
    const unacknowledgedBefore = snapshotFixture(root);
    const unacknowledged = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--root", root, "--dry-run", "--section-heading", "Block A", "--summary", "planned archive"],
      { encoding: "utf8" },
    );
    assert.equal(unacknowledged.status, 1, "an unacknowledged dry run must fail just as a real rotation does");
    assert.match(unacknowledged.stderr, /HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED/);
    assert.deepEqual(snapshotFixture(root), unacknowledgedBefore, "an unacknowledged dry run must not create a marker, archive, or governance write");

    const live = readFileSync(join(root, "docs", "custom.md"), "utf8");
    recordExtractionAcknowledged(root, { sectionHeadings: ["Block A"], liveContent: live });
    const acknowledgedBefore = snapshotFixture(root);
    const acknowledged = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--root", root, "--dry-run", "--section-heading", "Block A", "--summary", "planned archive"],
      { encoding: "utf8" },
    );
    assert.equal(acknowledged.status, 0, acknowledged.stderr);
    assert.match(acknowledged.stdout, /Dry-run archive plan/);
    assert.match(acknowledged.stdout, /docs\/state-archive\//);
    assert.ok(!acknowledged.stdout.includes("Content A line 1."), "the dry-run summary must remain bounded and omit handover body text");
    assert.deepEqual(snapshotFixture(root), acknowledgedBefore, "an acknowledged dry run must be fully read-only");

    writeFileSync(join(root, "docs", "custom.md"), live.replace("Content A line 1.", "Content A line 1, edited after acknowledgment."), "utf8");
    const staleBefore = snapshotFixture(root);
    const stale = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--root", root, "--dry-run", "--section-heading", "Block A", "--summary", "planned archive"],
      { encoding: "utf8" },
    );
    assert.equal(stale.status, 1, "a stale extraction acknowledgement must fail dry-run");
    assert.match(stale.stderr, /HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED/);
    assert.deepEqual(snapshotFixture(root), staleBefore, "a stale dry run must remain read-only");

    const rejectedBefore = snapshotFixture(root);
    for (const argv of [
      ["--root", root, "--unknown-option", "--section-heading", "Block A", "--summary", "s"],
      ["--root", root, "--execute", "--section-heading", "Block A", "--summary", "s"],
      ["--root", root, "--help"],
      ["--root", root, "--check-size", "--file"],
      ["--root"],
      ["--root", root, "--check-size", "--summary", "must refuse"],
      ["--root", root, "--dry-run", "--acknowledge-extraction-done", "--section-heading", "Block A", "--summary", "s"],
      ["--root", root, "--file", "docs/custom.md", "--handover-path", "docs/other.md", "--check-size"],
      ["--root", root, "--root", join(root, "other"), "--check-size"],
    ]) {
      const rejected = spawnSync(process.execPath, [SCRIPT_PATH, ...argv], { encoding: "utf8" });
      assert.equal(rejected.status, 1, `invalid CLI input must refuse: ${argv.join(" ")}`);
      assert.match(rejected.stderr, /HANDOVER-ROTATION-CLI-USAGE/);
      assert.deepEqual(snapshotFixture(root), rejectedBefore, "invalid flags must be rejected before any possible mutation");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == NVA-B-HANDOVER-CLI-MODES-1: check-size measures on-disk bytes, not decoded UTF-8 text ==
{
  const root = fixtureRoot("cli-size-raw-bytes");
  try {
    const handoverBytes = Buffer.from([0x41, 0xf0, 0x9f, 0x98, 0x80, 0xff]); // A, 😀, invalid UTF-8 byte
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), handoverBytes);
    const before = snapshotFixture(root);
    const checked = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--check-size"], { encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, new RegExp(`Handover size: ${handoverBytes.length} bytes`));
    assert.deepEqual(snapshotFixture(root), before, "raw-byte size inspection must preserve the fixture byte-for-byte");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// == NVA-B-HANDOVER-CLI-MODES-1: check-size applies the default cap and fails cleanly for a missing handover ==
{
  const root = fixtureRoot("cli-default-size");
  const missingRoot = fixtureRoot("cli-size-missing-file");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "state.md"), SAMPLE, "utf8");
    const defaultBefore = snapshotFixture(root);
    const defaultCap = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--check-size"], { encoding: "utf8" });
    assert.equal(defaultCap.status, 0, defaultCap.stderr);
    assert.match(defaultCap.stdout, /max 30000/);
    assert.deepEqual(snapshotFixture(root), defaultBefore, "the default-cap size check must remain read-only");

    const missingBefore = snapshotFixture(missingRoot);
    const missing = spawnSync(process.execPath, [SCRIPT_PATH, "--root", missingRoot, "--check-size"], { encoding: "utf8" });
    assert.equal(missing.status, 1, "a missing default handover must refuse");
    assert.match(missing.stderr, /HANDOVER-ROTATION-FILE-NOT-FOUND/);
    assert.deepEqual(snapshotFixture(missingRoot), missingBefore, "a missing-file size check must not create directories or markers");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(missingRoot, { recursive: true, force: true });
  }
}

// == NVA-B-HANDOVER-CLI-MODES-1: read-only file resolution must reject an escaping symlink ==
{
  const root = fixtureRoot("cli-read-only-symlink");
  const outsideRoot = fixtureRoot("cli-read-only-symlink-outside");
  const outside = join(outsideRoot, "handover.md");
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(outside, SAMPLE, "utf8");
    symlinkSync(outside, join(root, "docs", "state.md"));
    const before = snapshotFixture(root);
    const outsideBefore = readFileSync(outside, "utf8");
    const spawned = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root, "--check-size"], { encoding: "utf8" });
    assert.equal(spawned.status, 1, "a read-only CLI mode must reject a handover symlink that escapes root");
    assert.match(spawned.stderr, /HANDOVER-ROTATION-PATH-ESCAPES-ROOT/);
    assert.deepEqual(snapshotFixture(root), before, "a rejected symlink must leave the complete fixture state unchanged");
    assert.equal(readFileSync(outside, "utf8"), outsideBefore, "the outside target must remain unread for mutation and unchanged");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
}

console.log("handover-rotate.test.mjs: all assertions passed");
