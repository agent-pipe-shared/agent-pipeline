#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adjustRelativeLinksForArchiveDepth,
  ARCHIVE_DIR,
  ARCHIVED_HISTORY_HEADING,
  HandoverRotationError,
  isExtractionAcknowledged,
  planHandoverRotation,
  planRotation,
  recordExtractionAcknowledged,
  registerArchiveInDocGovernance,
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

// == NVA-HANDOVER-ROT-2 F1: --handover-path escaping root is rejected, typed error, zero write ==
{
  const root = fixtureRoot("traversal-handover-path");
  try {
    recordExtractionAcknowledged(root);
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
    recordExtractionAcknowledged(root);
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
    recordExtractionAcknowledged(root);
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

// == NVA-HANDOVER-ROT-2 F4: the read-only status check never creates the acknowledgment marker as a side effect ==
{
  const root = fixtureRoot("status-read-only");
  try {
    const markerPath = join(root, ".git", "agent-pipeline", "handover-rotation", "extraction-acknowledged.json");
    assert.equal(isExtractionAcknowledged(root), false);
    assert.equal(existsSync(markerPath), false, "checking status must never create the acknowledgment marker");
    assert.equal(isExtractionAcknowledged(root), false, "calling it repeatedly stays read-only");
    assert.equal(existsSync(markerPath), false);
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
    recordExtractionAcknowledged(root);

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
    recordExtractionAcknowledged(root);
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
    recordExtractionAcknowledged(root);
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

console.log("handover-rotate.test.mjs: all assertions passed");
