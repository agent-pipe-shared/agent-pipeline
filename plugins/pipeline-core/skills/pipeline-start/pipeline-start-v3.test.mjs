#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureBootstrapBytes } from "../../lib/bootstrap-payload-budget.mjs";
import { DEFAULT_ENVELOPE } from "../../scripts/bootstrap-payload-measure.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const core = readFileSync(join(here, "SKILL.md"), "utf8");
const closeBlock = readFileSync(join(here, "..", "close-block", "SKILL.md"), "utf8");
const refs = ["onboarding-recovery.md", "private-overlay.md", "roles.md", "freshness.md", "failure-cases.md", "continuation.md"]
  .map((name) => readFileSync(join(here, "references", name), "utf8")).join("\n");
const all = `${core}\n${refs}`;
// The budget is the emitted bootstrap payload, not the file alone: it is
// BOOTSTRAP_PAYLOAD_MAX_BYTES over the SUMMED segments (core skill + machine-
// readback envelope; lib/bootstrap-payload-budget.mjs, scripts/bootstrap-
// payload-measure.mjs). Asserting on `core` alone granted an author bytes that
// do not exist -- it stayed green at 14992 B while the payload measurement was
// already red. Measured against the production DEFAULT_ENVELOPE, so passing
// here implies passing bootstrap-payload-measure.test.mjs, never the reverse.
const coreBudget = measureBootstrapBytes(
  Buffer.byteLength(core, "utf8") + Buffer.byteLength(JSON.stringify(DEFAULT_ENVELOPE), "utf8"),
  { mode: "normal" },
);
assert.ok(
  coreBudget.withinBudget,
  `core+envelope ${coreBudget.upperBoundUnits} B exceeds ${coreBudget.maxUpperBoundUnits} B`,
);
assert.match(core, /full Elephant bootstrap is session-bound/u);
assert.match(core, /never for an ordinary task, message, tool result, commit, test,/u);
assert.match(core, /does not trigger a second full Elephant bootstrap unless a real SessionStart or\n+typed recovery follows/u);
assert.match(core, /No happy-path reference is mandatory/u);
assert.match(core, /project-onboarding-v3\.mjs inspect --root "\$PWD" --intent bootstrap/u);
assert.match(core, /Agent Pipeline start: version/u);
assert.match(all, /codex-project-runtime-readback-host\.mjs/u);
assert.match(all, /pipeline\.codex-project-runtime-readback-status\.v1/u);
assert.match(all, /project-onboarding-v3\.mjs kickoff plan/u);
assert.match(all, /codex-host-repository-init\.mjs plan/u);
assert.match(all, /session-cleanup\.mjs plan-privatization/u);
assert.match(all, /pipeline\.session-cleanup-privatization-plan\.v1/u);
assert.match(all, /Agent Pipeline source: local-development/u);
assert.match(all, /pipeline\.start-preflight\.v1/u);
assert.match(all, /CR?PCR?-BLOCKED|PCR-DECISION-PENDING/u);
assert.match(all, /four|three|Verify|handover/u);
assert.match(core, /Operating Model, compiled runtime manifest and recorded active\nplan are the only gate authority/u);
assert.match(core, /scoped edits, focused tests, state\nreadback, one-line commits, Verify, Critic preparation/u);
assert.match(core, /A guard\ndenial alone is not a human gate/u);
assert.match(core, /\*\*and\n   before proposing, displaying, or performing any restart, session cut or\n   Compact after kickoff\*\*/u);
assert.match(core, /input received\n   after a short kickoff goal has already initialized the project/u);
assert.match(core, /do not reduce it to a new short\n   kickoff goal or merely promise to remember it/u);
assert.match(core, /Read back `resume-hint\.mjs inspect` after a\n   successful capture/u);
assert.match(core, /obtain both a single-line project goal and an\nexplicit PO profile: `epic`, `feature`, or `mini`/u);
assert.match(core, /Never infer, silently select, or retrospectively claim a profile/u);
assert.match(core, /`specs\/kickoff-\*` files are provisional bootstrap\nanchors, not the standard long-term design location/u);
assert.match(core, /`specs\/YYYY-MM-DD_short-topic\/`/u);
assert.match(core, /`prd_short-topic\.md`, `spec\.md`, and `design-input\.md`/u);
assert.match(core, /The PRD and Spec both\nlink to it and carry a compact traceability table/u);
assert.match(core, /include a valid Mermaid flow\/sequence\/state diagram wherever it materially\nclarifies that flow/u);
assert.match(core, /Treat that named package as a pre-authority staging set/u);
assert.match(core, /only its digest-bound `kickoff promote apply` to bind the PRD\/Spec in State\nand the source-evidence path\/hash in the same immutable continuity transaction\./u);
assert.match(core, /Do not invoke a repair, generic continuity CAS, manifest\nrepair, or hash-rebinding cascade solely because a new design package was\ncreated/u);
assert.match(core, /The source-evidence file is immutable after its PRD\/Spec reference is bound/u);
assert.match(core, /Normal restart is handover-only/u);
assert.match(core, /Never invoke `close-block`, `close-feature`, or the close\n   coordinator merely to start a new chat/u);
assert.match(closeBlock, /Hard entry gate — never close a normal restart/u);
assert.match(closeBlock, /CLOSE-INTENT-REQUIRED/u);
assert.match(closeBlock, /`durable-stop` or `runtime-transfer`/u);
assert.match(closeBlock, /Do \*\*not\*\* invoke `close-block`, `close-feature`, `close-coordinator`, Verify/u);
// PHX-SKILL — obligations of harness/session-bootstrap.md that the skill must
// carry. Steps 1d and 6 are pinned against `core`: the spec requires them
// embedded, without a runtime file read. Steps 3, 4 and 5b are pinned against
// `all`, because lazy relocation into a typed reference is legitimate there.
assert.match(core, /Bootstrap check passed: ruleset \{\{VERSION_OR_SHA\}\} loaded/u);
assert.match(core, /Never print it without Steps 1–5/u);
assert.match(core, /Role prohibitions loaded: EL-01\/EL-02\/EL-03\/EL-04\/EL-16\/EL-18\/EL-19/u);
assert.match(core, /read no file for this/u);
for (const el of ["EL-01", "EL-02", "EL-03", "EL-04", "EL-16", "EL-18", "EL-19"]) {
  assert.ok(core.includes(el), `${el} must stay embedded in SKILL.md`);
}
assert.match(all, /`project\/pipeline\.json`, else the legacy/u);
assert.match(all, /denies do not live in that file/u);
assert.match(all, /sole authoritative state source/u);
assert.match(all, /\$driftThreshold/u);
assert.match(all, /briefing replaces the handover/u);
assert.match(all, /`\/reload-plugins`/u);
assert.match(all, /Staleness unchecked \(offline, cache state\)/u);
assert.match(all, /MISSING \(F4\)/u);
assert.match(all, /State briefing \{\{TASK_ID_OR_DATE\}\}/u);
assert.match(all, /State n\/a \(Critic sees no history\)/u);
process.stdout.write("pipeline-start V3: core budget and lazy-reference checks passed\n");
