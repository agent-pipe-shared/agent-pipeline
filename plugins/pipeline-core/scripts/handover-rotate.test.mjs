#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Test coverage for handover-rotate.mjs. Uses ONLY synthetic fixture
// handover text constructed by this file — NEVER the real docs/state.md.
// Proves: (1) the archive-selection logic against known section shapes,
// (2) the dry-run-only safety property (the CLI never writes to any path
// matching the real handover file unless --execute is explicitly passed,
// and --execute itself is unreachable/refuses to run for real).

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseSections, computePlan, runCli, ACK_MARKER_RE } from "./handover-rotate.mjs";

const SCRIPT = fileURLToPath(new URL("./handover-rotate.mjs", import.meta.url));
const roots = [];
let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function tmp(name) {
  const root = mkdtempSync(join(tmpdir(), `handover-rotate-${name}-`));
  roots.push(root);
  return root;
}

// A small synthetic handover file: 4 sections, newest first (mirrors this
// repo's real docs/state.md convention), none acked, roughly modeling a
// too-big head plus older, larger inherited-history sections.
function fixtureText({ ackOldest = false, ackAll = false } = {}) {
  const ack = "<!-- pipeline.handover-rotation-extraction-ack.v2: true -->";
  const s4Ack = ackAll || ackOldest ? `${ack}\n` : "";
  const s3Ack = ackAll ? `${ack}\n` : "";
  return [
    "# Handover — fixture\n\n> preamble text, never a section\n",
    `## CHECKPOINT — 3 (newest)\n${"newest content line.\n".repeat(5)}`,
    `## CHECKPOINT — 2\n${"middle content line.\n".repeat(5)}`,
    `## CHECKPOINT — 1\n${s3Ack}${"older content line, fairly long to add bulk. ".repeat(40)}\n`,
    `## RESTART CHECKPOINT — inherited history\n${s4Ack}${"ancient inherited-history line. ".repeat(200)}\n`,
  ].join("\n");
}

check("parseSections finds preamble and sections in file order with correct ack detection", () => {
  const text = fixtureText({ ackOldest: true });
  const { preamble, sections } = parseSections(text);
  expect(preamble.includes("preamble text"), "preamble missing");
  expect(sections.length === 4, `expected 4 sections, got ${sections.length}`);
  expect(sections[0].header.startsWith("## CHECKPOINT — 3"), "section 0 header wrong");
  expect(sections[3].header.startsWith("## RESTART CHECKPOINT"), "section 3 header wrong");
  expect(sections[0].acked === false, "newest section must not be acked in this fixture");
  expect(sections[3].acked === true, "oldest section should be acked in this fixture");
});

check("ACK_MARKER_RE matches only the exact marker line", () => {
  expect(ACK_MARKER_RE.test("<!-- pipeline.handover-rotation-extraction-ack.v2: true -->"), "exact marker must match");
  expect(!ACK_MARKER_RE.test("pipeline.handover-rotation-extraction-ack.v2: true"), "non-comment text must not match");
  expect(!ACK_MARKER_RE.test("<!-- pipeline.handover-rotation-extraction-ack.v2: false -->"), "false must not match");
});

check("computePlan proposes nothing when no archivable section is acked", () => {
  const { preamble, sections } = parseSections(fixtureText());
  const plan = computePlan({ preamble, sections }, { maxBytes: 200, keepSections: 2 });
  expect(plan.toArchiveIndices.length === 0, "must propose zero sections when none are acked");
  expect(plan.overBudgetBefore === true, "fixture must be over the tiny test budget");
  expect(plan.unackedBlockingIndices.length === 2, `expected both non-floor sections blocked, got ${plan.unackedBlockingIndices.length}`);
});

check("computePlan archives a contiguous acked run from the bottom and stops at the first un-acked section", () => {
  const { preamble, sections } = parseSections(fixtureText({ ackOldest: true }));
  // Only the oldest (index 3) is acked; index 2 is not -> archive set = {3} only.
  const plan = computePlan({ preamble, sections }, { maxBytes: 50, keepSections: 2 });
  expect(plan.toArchiveIndices.length === 1, `expected 1 archived section, got ${plan.toArchiveIndices.length}`);
  expect(plan.toArchiveIndices[0] === 3, `expected index 3 archived, got ${plan.toArchiveIndices[0]}`);
  expect(plan.blockedAtIndex === 2, `expected blocked at index 2, got ${plan.blockedAtIndex}`);
});

check("computePlan archives every eligible section when the whole archivable range is acked", () => {
  const { preamble, sections } = parseSections(fixtureText({ ackAll: true }));
  const plan = computePlan({ preamble, sections }, { maxBytes: 50, keepSections: 2 });
  expect(plan.toArchiveIndices.length === 2, `expected 2 archived sections, got ${plan.toArchiveIndices.length}`);
  expect(JSON.stringify(plan.toArchiveIndices) === JSON.stringify([2, 3]), `expected [2,3] in file order, got ${JSON.stringify(plan.toArchiveIndices)}`);
  expect(plan.remainingHeadBytes < plan.totalBytes, "archiving must shrink the head");
});

check("computePlan always keeps the keepSections floor regardless of ack state", () => {
  // Ack everything, including (hypothetically) the newest two -- floor still protects them.
  const ack = "<!-- pipeline.handover-rotation-extraction-ack.v2: true -->";
  const text = [
    "# preamble\n",
    `## CHECKPOINT — newest\n${ack}\n${"x ".repeat(500)}\n`,
    `## CHECKPOINT — older\n${ack}\n${"x ".repeat(500)}\n`,
  ].join("\n");
  const { preamble, sections } = parseSections(text);
  expect(sections[0].acked === true, "fixture setup: newest must be acked");
  const plan = computePlan({ preamble, sections }, { maxBytes: 10, keepSections: 2 });
  expect(plan.toArchiveIndices.length === 0, "keepSections floor must protect both sections even when acked and over budget");
});

check("runCli --dry-run writes only to the preview path, never to the source handover file", () => {
  const cwd = tmp("dry-run-cwd");
  mkdirSync(join(cwd, "docs"), { recursive: true });
  mkdirSync(join(cwd, "scratch"), { recursive: true });
  const handoverPath = join(cwd, "docs", "state.md");
  const sourceText = fixtureText({ ackOldest: true });
  writeFileSync(handoverPath, sourceText, "utf8");
  const outRel = "scratch/preview.md";

  const code = runCli(["--file", "docs/state.md", "--out", outRel, "--max-bytes", "50"], cwd);
  expect(code === 0, `exit code=${code}`);
  expect(readFileSync(handoverPath, "utf8") === sourceText, "source handover file was modified by --dry-run");

  const previewPath = join(cwd, outRel);
  expect(existsSync(previewPath), "preview file was not written");
  const preview = readFileSync(previewPath, "utf8");
  expect(preview.includes("DRY-RUN preview"), "preview missing header");
  expect(preview.includes("RESTART CHECKPOINT"), "preview missing archived section reference");
});

check("runCli refuses --execute unconditionally (no live-rewrite path is reachable today)", () => {
  const cwd = tmp("execute-cwd");
  mkdirSync(join(cwd, "docs"), { recursive: true });
  const handoverPath = join(cwd, "docs", "state.md");
  const sourceText = fixtureText({ ackAll: true });
  writeFileSync(handoverPath, sourceText, "utf8");

  let threw = false;
  try {
    runCli(["--file", "docs/state.md", "--execute"], cwd);
  } catch {
    threw = true;
  }
  expect(threw, "--execute must throw rather than silently succeed");
  expect(readFileSync(handoverPath, "utf8") === sourceText, "source handover file was modified by a refused --execute call");
});

check("runCli --check-size reports over/under against the configured threshold without writing anything", () => {
  const cwd = tmp("check-size-cwd");
  mkdirSync(join(cwd, "docs"), { recursive: true });
  const handoverPath = join(cwd, "docs", "state.md");
  const sourceText = fixtureText();
  writeFileSync(handoverPath, sourceText, "utf8");

  const codeOver = runCli(["--file", "docs/state.md", "--check-size", "--max-bytes", "10"], cwd);
  expect(codeOver === 1, `expected over-threshold exit 1, got ${codeOver}`);
  const codeUnder = runCli(["--file", "docs/state.md", "--check-size", "--max-bytes", "999999"], cwd);
  expect(codeUnder === 0, `expected under-threshold exit 0, got ${codeUnder}`);
  expect(readFileSync(handoverPath, "utf8") === sourceText, "--check-size must never modify the handover file");
});

check("CLI subprocess: --dry-run never touches the source file even invoked as a real process", () => {
  const cwd = tmp("cli-subprocess-cwd");
  mkdirSync(join(cwd, "docs"), { recursive: true });
  mkdirSync(join(cwd, "scratch"), { recursive: true });
  const handoverPath = join(cwd, "docs", "state.md");
  const sourceText = fixtureText({ ackAll: true });
  writeFileSync(handoverPath, sourceText, "utf8");

  const result = spawnSync(
    process.execPath,
    [SCRIPT, "--file", "docs/state.md", "--out", "scratch/preview.md", "--max-bytes", "50"],
    { cwd, encoding: "utf8" }
  );
  expect(result.status === 0, `CLI exit=${result.status}; stderr=${result.stderr}`);
  expect(readFileSync(handoverPath, "utf8") === sourceText, "CLI subprocess modified the source handover file");
  expect(existsSync(join(cwd, "scratch", "preview.md")), "CLI subprocess did not write the preview file");
});

check("CLI subprocess: --execute exits non-zero and never modifies the source file", () => {
  const cwd = tmp("cli-subprocess-execute-cwd");
  mkdirSync(join(cwd, "docs"), { recursive: true });
  const handoverPath = join(cwd, "docs", "state.md");
  const sourceText = fixtureText({ ackAll: true });
  writeFileSync(handoverPath, sourceText, "utf8");

  const result = spawnSync(process.execPath, [SCRIPT, "--file", "docs/state.md", "--execute"], { cwd, encoding: "utf8" });
  expect(result.status !== 0, `--execute must not exit 0, got ${result.status}`);
  expect(readFileSync(handoverPath, "utf8") === sourceText, "CLI subprocess --execute modified the source handover file");
});

for (const root of roots) rmSync(root, { recursive: true, force: true });

const total = passed + failures.length;
console.log(`\n${passed}/${total} cases passed.`);
if (failures.length) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
