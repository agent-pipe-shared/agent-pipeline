// SPDX-License-Identifier: SUL-1.0
// Candidate 28c (PO tile 2026-11-11, context baseline): the start skill stays in the model's context for the whole
// session and the runner re-attaches it after every compaction, cut at about 20,000 characters (measured live: the
// re-attached copy of the 24.5 KB skill ended mid-word inside the lazy-loading list, so the gate-authority and
// Compact sections were lost after every compaction). The skill keeps what binds every session and a trigger line
// for each status- or step-conditional block; the blocks themselves moved verbatim into the reference the trigger
// names. This pins the size with a margin below the cut, each moved block in its one home, and each trigger.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SKILL_DIR = fileURLToPath(new URL("../../skills/pipeline-start/", import.meta.url));
const read = (relative) => readFileSync(`${SKILL_DIR}${relative}`, "utf8");
const REATTACH_WINDOW_CHARS = 20_000;
const MARGIN_CHARS = 1_500;

test("the start skill body fits the re-attach window with a margin, so its last section survives a compaction", () => {
  const skill = read("SKILL.md");
  const body = skill.replace(/^---\n[\s\S]*?\n---\n/u, "");
  assert.ok(body.length <= REATTACH_WINDOW_CHARS - MARGIN_CHARS,
    `start skill body is ${body.length} characters; keep it at or below ${REATTACH_WINDOW_CHARS - MARGIN_CHARS} and move conditional detail to the reference its trigger names`);
  assert.match(skill.slice(-400), /## Compact[\s\S]*`PCR-READY` loads no recovery references\.\n$/u, "the Compact section is the last one");
});

test("each moved block lives in its one reference and the skill keeps its trigger line", () => {
  const skill = read("SKILL.md");
  const recovery = read("references/onboarding-recovery.md");
  const resume = read("references/resume-hint.md");
  const moved = [
    [recovery, /## One onboarding consent, not a chain of prompts/u, /What the consent covers, the commit\nauthor question and the rule before consent exists \(no deliverable file\) are in\n`references\/onboarding-recovery\.md`/u],
    [recovery, /\*\*Before this consent exists:\*\* never create a deliverable file/u, /rule before consent exists \(no deliverable file\)/u],
    [recovery, /`clone-hook-readiness\.mjs --root <root> --apply`/u, /`hook-refresh-required` \(Elephant only\)\ncarries a mutating `nextAction`: execute it once as\n`references\/onboarding-recovery\.md` states/u],
    [recovery, /`pipeline\.installed-plugin-attestation-host-result\.v1` with status `written`/u, /For Codex, execute only the exact typed\nhost-postinstall action, as `references\/onboarding-recovery\.md` states/u],
    [recovery, /Treat\n`executionBoundary: "host-authorized-wsl"` as mandatory/u, /`executionBoundary: "host-authorized-wsl"`, and a command for the human/u],
    [recovery, /`COPY_COMMAND_MAX_COLUMNS` — relay it VERBATIM, line for line/u, /relayed VERBATIM from the tool result that rendered it/u],
  ];
  for (const [reference, block, trigger] of moved) {
    assert.match(reference, block);
    assert.doesNotMatch(skill, block, `${block} is stated twice`);
    assert.match(skill, trigger);
  }
  assert.match(resume, /stated in `SKILL\.md` step 7 \(always loaded\)/u, "resume-hint.md defers to the one inline statement");
  assert.doesNotMatch(resume, /resume-hint\.mjs capture --root/u, "the capture command has one home, the skill");
  assert.doesNotMatch(recovery, /relaying `consentQuestion\.text` verbatim/u, "the consent question has one home, the skill");
});

test("the skill tells a session where the compact ready line keeps the full preflight envelope", () => {
  assert.match(read("SKILL.md"), /full envelope is written to the repo-relative path in `fullEnvelope`/u);
});
