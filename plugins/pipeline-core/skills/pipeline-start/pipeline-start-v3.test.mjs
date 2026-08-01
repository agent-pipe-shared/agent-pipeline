#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const core = readFileSync(join(here, "SKILL.md"), "utf8");
const refs = ["onboarding-recovery.md", "private-overlay.md", "roles.md", "freshness.md", "failure-cases.md", "continuation.md"]
  .map((name) => readFileSync(join(here, "references", name), "utf8")).join("\n");
const all = `${core}\n${refs}`;
assert.ok(Buffer.byteLength(core, "utf8") <= 15_000);
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
process.stdout.write("pipeline-start V3: core budget and lazy-reference checks passed\n");
