// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.catalogue-admit-prescribed-lifecycle-verbs (AC-123), slice ALF-PF21-RESUME-HINT-INSPECT.
// The pipeline-start skill makes `resume-hint.mjs inspect --root <root>` a MUST-DO read at bootstrap. In
// lifecycle state `approved` the dev-plan shell lane refused it as `opaque-script-execution`. Admission goes
// through the lifecycle catalogue; the lane itself is driven for real, with only the lifecycle verdict injected
// (the way devplan-shell-sanctioned-recovery.test.mjs drives it).
import assert from "node:assert/strict";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { devPlanShellRefusalHit } from "../guard/devplan-shell-lane.mjs";
import { isSanctionedLifecycleCommand } from "../guard/command-catalogue.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "../..");
const root = join(resolve(pluginRoot, "../.."), "scratch/.resume-hint-inspect-fixture");
const resumeHint = join(pluginRoot, "scripts/resume-hint.mjs");
const preflight = join(pluginRoot, "scripts/pipeline-start-preflight.mjs");
const governance = join(pluginRoot, "scripts/observation-governance-bootstrap.mjs");
const onboarding = join(pluginRoot, "scripts/project-onboarding-v3.mjs");

function deps(lifecycleStatus) {
  return { devPlanGateVerdictFn: input => {
    assert.equal(input.projectDir, root);
    return { verdict: "block", reason: "fixture lifecycle", lifecycleStatus };
  } };
}
const hit = (command, state) => devPlanShellRefusalHit(command, root, deps(state));
const STATES = ["approved", "implementing", "draft"];

test("resume-hint inspect --root <root> is admitted by the catalogue and the shell lane in every lifecycle state", () => {
  const command = `node ${resumeHint} inspect --root ${root}`;
  assert.equal(isSanctionedLifecycleCommand(command, root), true);
  for (const state of STATES) assert.equal(hit(command, state), null, state);
});

test("only exactly `inspect --root <root>` is admitted; every other shape keeps its refusal", () => {
  const refused = {
    "capture": `node ${resumeHint} capture --root ${root} --card-file scratch/card.json`,
    "discard": `node ${resumeHint} discard --root ${root}`,
    "consume": `node ${resumeHint} consume --root ${root} --session-id s1`,
    "query": `node ${resumeHint} query --root ${root} --session-id s1`,
    "extra flag": `node ${resumeHint} inspect --root ${root} --feature-id f`,
    "trailing word": `node ${resumeHint} inspect --root ${root} extra`,
    "different root": `node ${resumeHint} inspect --root ${join(root, "other")}`,
    "root with dot": `node ${resumeHint} inspect --root ${root}/.`,
    "no root": `node ${resumeHint} inspect`,
    "root first": `node ${resumeHint} --root ${root} inspect`,
    "repository copy": `node ${join(root, "scripts/resume-hint.mjs")} inspect --root ${root}`,
    "script outside plugin root": `node ${join(dirname(pluginRoot), "resume-hint.mjs")} inspect --root ${root}`,
  };
  for (const [label, command] of Object.entries(refused)) {
    assert.equal(isSanctionedLifecycleCommand(command, root), false, label);
    for (const state of STATES) assert.equal(hit(command, state)?.lane, "opaque-script-execution", `${label} ${state}`);
  }
});

test("the other read-only bootstrap commands the skill prescribes are admitted in every lifecycle state", () => {
  const prescribed = {
    preflight: `node ${preflight}`,
    governance: `node ${governance} --root ${root}`,
  };
  for (const [label, command] of Object.entries(prescribed)) {
    assert.equal(isSanctionedLifecycleCommand(command, root), true, label);
    for (const state of STATES) assert.equal(hit(command, state), null, `${label} ${state}`);
  }
});

test("onboarding inspect with --intent bootstrap: recorded result per lifecycle state", () => {
  const command = `node ${onboarding} inspect --root ${root} --intent bootstrap`;
  const withRunner = `${command} --runner claude`;
  const result = Object.fromEntries([command, withRunner].map(c => [c.endsWith("claude") ? "withRunner" : "plain",
    { catalogue: isSanctionedLifecycleCommand(c, root), shell: STATES.map(s => hit(c, s)?.lane ?? null) }]));
  process.stdout.write(`# onboarding-bootstrap ${JSON.stringify(result)}\n`);
  assert.equal(result.plain.catalogue, result.plain.shell.every(lane => lane === null));
});
