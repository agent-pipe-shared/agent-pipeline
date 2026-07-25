#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(HERE, "SKILL.md"), "utf8");

const cases = [
  ["consumer onboarding state is checked before Git or V3 authority", () => {
    const onboarding = skill.indexOf("## Step 0 — Consumer-root onboarding state");
    const loadedState = skill.indexOf("## Step 1 — Ruleset presence + loaded state");
    const v3Authority = skill.indexOf("## Step 1a — V3 source/runtime authority");
    assert.ok(onboarding >= 0, "Step 0 must exist");
    assert.ok(onboarding < loadedState, "onboarding must precede loaded-state Git checks");
    assert.ok(onboarding < v3Authority, "onboarding must precede V3 authority checks");
    assert.match(skill, /Before \*\*any\*\* `git rev-parse`, Git freshness helper, `setup\.mjs`, V3 authority\s+validator/u);
    assert.match(skill, /project-onboarding-v3\.mjs" inspect --root "\$PWD"/u);
    assert.match(skill, /Do\s+not replace it with a shell emptiness check, a copied consumer-root `setup\.mjs`,\s+or an incidental Git error/u);
  }],
  ["fresh roots stop as F0 and name the only authorized initializer", () => {
    assert.match(skill, /Report typed \*\*F0: onboarding-required\*\* and print \*\*no bootstrap\s+confirmation line\*\*/u);
    assert.match(skill, /project-onboarding-v3\.mjs" plan --root "\$PWD"/u);
    assert.match(skill, /project-onboarding-v3\.mjs" apply --root "\$PWD" --activate/u);
    assert.match(skill, /`inspect` and `plan` are read-only\. `apply --activate` is the sole write\s+operation/u);
    assert.match(skill, /sole exception is F0's explicit user-authorized onboarding `apply --activate`/u);
    assert.match(skill, /explicit user request to \*\*create\*\* or \*\*initialize\*\* this project authorizes\s+the agent to run that exact `apply --activate` command/u);
    assert.match(skill, /makes no commit, remote, dependency install,\s+application scaffold, or project-policy decision/u);
    assert.match(skill, /successful apply, rerun `pipeline-start` from Step 0/u);
  }],
  ["legacy and partial roots never get an inferred overwrite", () => {
    assert.match(skill, /\*\*`existing-unmanaged`:\*\*[\s\S]*\*\*F0A: adoption-required\*\*/u);
    assert.match(skill, /This is not a legacy migration and\s+not permission to overwrite project content/u);
    assert.match(skill, /\*\*`fresh` or `fresh-host-managed`:\*\*[\s\S]*writes only `pipeline\.user\.yaml` and `\.claude\/\*\*`/u);
    assert.match(skill, /Never\s+remove, overwrite, ignore, chmod, or silently relocate/u);
    assert.match(skill, /\*\*`migration-required` \(V0\/V1\/V2\):\*\*[\s\S]*runner-profile-migration-v3\.mjs" inspect --root/u);
    assert.match(skill, /Its explicit `apply --activate` is the only writer for a legacy consumer/u);
    assert.match(skill, /Never initialize over a legacy source/u);
    assert.match(skill, /\*\*`partial`, `invalid`, `unsafe`, a malformed result, or a non-zero exit:\*\*[\s\S]*fail closed/u);
    assert.match(skill, /Never\s+infer ownership of existing files or overwrite a non-empty\/partial root/u);
  }],
  ["Codex onboarding is first-request proactive, not an invisible hook", () => {
    assert.match(skill, /Codex currently has no SessionStart hook in its manifest/u);
    assert.match(skill, /proactive when the mandatory `pipeline-start` skill executes for the user's\s+first request/u);
    assert.match(skill, /not an invisible automatic initializer/u);
    assert.match(skill, /Codex manifest has PreToolUse guards but no SessionStart hook/u);
  }],
  ["V3 source and runtime-noop are bootstrap authority", () => {
    assert.match(skill, /pipeline\.user\.v3/u);
    assert.match(skill, /v3-bootstrap-authority\.mjs" --root "\$PWD"/u);
    assert.match(skill, /Consumer-root `setup\.mjs`\s+is neither required nor consulted/u);
    assert.match(skill, /Runtime projection \{\{noop\|host-managed-codex\}\}/u);
    assert.match(skill, /explicit V3 migration\/apply/u);
    assert.match(skill, /V3 contract\s+supersedes legacy/u);
  }],
  ["V1/V2 and runtime drift fail closed without confirmation", () => {
    assert.match(skill, /\*\*F5\*\*/u);
    assert.match(skill, /Do not use V1\/V2/u);
    assert.match(skill, /print \*\*no confirmation line\*\*/u);
  }],
  ["Codex locked projects use only the loaded plugin status wrapper", () => {
    assert.match(skill, /\.agent-pipeline\/core\.lock\.json/u);
    assert.match(skill, /currently loaded `pipeline-core` plugin/u);
    assert.match(skill, /node "\$\{PIPELINE_PLUGIN_ROOT\}\/scripts\/codex-private-overlay-activation\.mjs" status --project-root "\$PWD"/u);
    assert.match(skill, /node "\$\{PIPELINE_PLUGIN_ROOT\}\/scripts\/codex-private-overlay-activation\.mjs" load-context --project-root "\$PWD"/u);
    assert.match(skill, /Never select a wrapper under `\$PWD`/u);
    assert.match(skill, /Do not run project-local\s+`setup\.mjs`, a local harness,[\s\S]*as an SNT-A\s+identity\/admission substitute/u);
    assert.match(skill, /When `\.agent-pipeline\/core\.lock\.json` is absent,[\s\S]*ordinary public-project/u);
  }],
  ["private-overlay status outcomes are explicit and mutation-free", () => {
    assert.match(skill, /`activation-required`:[\s\S]*STOP before Step 1b and print no confirmation\s+line/u);
    assert.match(skill, /Report the returned reason and `planSha256`; perform no mutation/u);
    assert.match(skill, /do not invoke `activate`/u);
    assert.match(skill, /`rejected`, a non-zero exit, malformed output,[\s\S]*FAIL CLOSED/u);
    assert.match(skill, /`activated`: this is the only activation status/u);
  }],
  ["activated status requires the bounded operational context envelope", () => {
    assert.match(skill, /sanitized status alone is never private context/u);
    assert.match(skill, /pipeline\.private-overlay-operational-context\.v1/u);
    assert.match(skill, /status `context-loaded`/u);
    assert.match(skill, /same `planSha256` as the activated readback/u);
    assert.match(skill, /not private filenames/u);
    assert.match(skill, /Do not echo,[\s\S]*persist,[\s\S]*export/u);
    assert.match(skill, /SNT-A-CODEX-CONTEXT-TRANSFER-UNAVAILABLE/u);
    assert.match(skill, /Only `activated` plus schema-valid `context-loaded` may continue/u);
    assert.match(skill, /Do not infer or reconstruct the\s+private inputs from the project checkout, status stdout, setup, or harness/u);
  }],
  ["SNT-A admission does not replace project F4 checks", () => {
    assert.match(skill, /replaces only SNT-A identity, admission,[\s\S]*private-input authentication/u);
    assert.match(skill, /does \*\*not\*\* satisfy or replace\s+the project-specific Step 3 calibration\/denies, Step 4 handover, or Step 5\s+verify checks/u);
    assert.match(skill, /retain their F4 behavior/u);
  }],
  ["work profiles are epic feature mini and advisory is not a profile", () => {
    assert.match(skill, /`epic`, `feature`, or `mini`/u);
    assert.match(skill, /`advisor` and `design-first` are no longer profiles/u);
    assert.doesNotMatch(skill, /Profile \{\{advisor\|design-first/u);
    assert.doesNotMatch(skill, /\/advisor fable/u);
    assert.equal((skill.match(/MP-26g/gu) ?? []).length, 1, "MP-26g may appear only in the explicit V3 supersession notice");
    assert.match(skill, /reuse the persisted unambiguous V3\s+profile and phase/u);
    assert.match(skill, /Ask only when[\s\S]*genuinely\s+ambiguous/u);
    assert.doesNotMatch(skill, /profile question repeats at EVERY bootstrap/u);
  }],
  ["Epic and Feature Codex advisory defaults on while Mini disables it", () => {
    assert.match(skill, /Missing consent is the enabled `default`, with no per-run question/u);
    assert.match(skill, /`declined` disables before a child, export or status/u);
    assert.match(skill, /`mini` is disabled/u);
  }],
  ["Codex starts with exactly one direct Host Advisor", () => {
    assert.match(skill, /codex-host-advisor-route\.mjs/u);
    assert.match(skill, /immediately launch exactly one project-scoped read-only\s+`consult-advisor`/u);
    assert.match(skill, /Do not make any selected-sandbox, App-Server, native or\s+other advisory probe/u);
    assert.match(skill, /pipeline\.host-advisor-status\.v1/u);
  }],
  ["Claude fallback order is bounded Fable then Opus then consult", () => {
    const chain = skill.match(/order is `([^`]+)`/u)?.[1] ?? "";
    assert.match(chain, /Fable/u);
    assert.ok(chain.indexOf("Fable") < chain.indexOf("Opus"));
    assert.ok(chain.indexOf("Opus") < chain.indexOf("Claude consult"));
    assert.match(skill, /same-runner fresh read-only consult/u);
  }],
  ["Codex status is bounded gate capability while Claude receipts remain separate", () => {
    assert.match(skill, /Only an answered unchanged status is Codex\s+`host-bound-consult` success/u);
    assert.match(skill, /It emits no `pipeline\.advisory-receipt\.v1`/u);
    assert.match(skill, /Claude retains its existing coordinator receipt/u);
    assert.match(skill, /no attested\s+selected-sandbox execution; OS isolation and\s+model identity are not\s+asserted/u);
  }],
  ["existing provenance and Elephant role checks remain", () => {
    assert.match(skill, /git rev-parse HEAD/u);
    assert.match(skill, /ruleset-freshness\.mjs" --repo "\$PWD"/u);
    assert.match(skill, /`equal\|ahead` is current/u);
    assert.match(skill, /host-authorized\s+network-open\/read-only command boundary/u);
    assert.match(skill, /bootstrap-env-check\.mjs/u);
    assert.match(skill, /do not first run a known-to-fail sandbox probe/u);
    assert.match(skill, /check-po-gate-authority\.mjs/u);
    assert.match(skill, /EL-01\/EL-02\/EL-03\/EL-04\/EL-16\/EL-18\/EL-19/u);
    assert.match(skill, /Bootstrap check passed:/u);
  }],
  ["Compact re-enters bootstrap then resumes persisted continuity", () => {
    assert.match(skill, /Compact MUST rerun `?pipeline-start`? as a continuation re-entry/u);
    assert.match(skill, /after that re-entry, automatically continue the persisted next action without waiting/u);
    assert.match(skill, /Only an explicit pause\/cancel\/replace\/redirect, a named gate, completion or a typed blocker may stop/u);
  }],
  ["Readiness and Critic retain their documented selected host boundary", () => {
    assert.equal(skill.includes("sandboxed-readonly-host-bridge.mjs"), true, "pipeline start must name the generic selected host bridge");
    assert.match(skill, /Readiness and Critic duties; it is not an Advisor route/u);
    assert.doesNotMatch(skill, /Codex Advisory[\s\S]*network-open\/read-only/u);
    assert.equal(skill.includes("danger-full-access"), false, "the prohibited mode must never appear as a workaround");
  }],
  ["self-application probes the managed toolchain without exporting pipeline scope to consumers", () => {
    assert.match(skill, /Self-application toolchain preflight/u);
    assert.match(skill, /toolchain-preflight\.mjs" --root "\$PWD"/u);
    assert.match(skill, /Agent-Pipeline checkout only/u);
    assert.match(skill, /never run it in a consumer project/u);
    assert.match(skill, /read-only observation/u);
    assert.match(skill, /does not write a receipt/u);
    assert.match(skill, /securityGate: blocking/u);
    assert.match(skill, /security\/release\/public-baseline claims/u);
    assert.match(skill, /execution_environment`, `probe_timeout`, and `probe_error`/u);
    assert.match(skill, /never recommend\s+reinstalling/u);
  }],
  ["self-application observation governance fails closed before writes", () => {
    assert.match(skill, /Observation\/document governance \(Agent-Pipeline source checkout only\)/u);
    assert.match(skill, /node harness\/scripts\/check-observation-governance\.mjs/u);
    assert.match(skill, /unclassified `docs\/` artifact/u);
    assert.match(skill, /case \*\*F6\*\*/u);
    assert.match(skill, /no Issue, label, backlog item, or network request/u);
    assert.match(skill, /no writing, dispatch, confirmation line/u);
  }],
];

let passed = 0;
for (const [name, run] of cases) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name} -- ${error.message}`);
  }
}

console.log(`\npipeline-start V3: ${passed}/${cases.length} checks passed.`);
process.exit(passed === cases.length ? 0 : 1);
