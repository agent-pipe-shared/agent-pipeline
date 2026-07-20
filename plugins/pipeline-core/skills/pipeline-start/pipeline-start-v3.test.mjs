#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(HERE, "SKILL.md"), "utf8");

const cases = [
  ["V3 source and runtime-noop are bootstrap authority", () => {
    assert.match(skill, /pipeline\.user\.v3/u);
    assert.match(skill, /node setup\.mjs/u);
    assert.match(skill, /Runtime projection noop/u);
    assert.match(skill, /explicit V3 migration\/apply/u);
    assert.match(skill, /V3 contract\s+supersedes legacy/u);
  }],
  ["V1/V2 and runtime drift fail closed without confirmation", () => {
    assert.match(skill, /\*\*F5\*\*/u);
    assert.match(skill, /Do not use V1\/V2/u);
    assert.match(skill, /print \*\*no confirmation line\*\*/u);
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
  ["Epic and Feature advisory is consent-gated while Mini disables it", () => {
    assert.match(skill, /Missing or `declined` consent is an accepted optional bootstrap state/u);
    assert.match(skill, /`epic` and `feature` run Advisory only[\s\S]*`mini` disables it/u);
    assert.match(skill, /Advisory is disabled and no adapter, selected-sandbox probe, child, export,[\s\S]*receipt may run/u);
    assert.match(skill, /A disabled state[\s\S]*must not fabricate an advisory receipt/u);
  }],
  ["Codex starts with one fresh native attested Sol App-Server turn", () => {
    assert.match(skill, /\*\*Codex:\*\*[\s\S]*native Codex[\s\S]*openai\/gpt-5\.6-sol/u);
    assert.match(skill, /`initialize` → `initialized` →[\s\S]*`thread\/start`[\s\S]*`turn\/start`/u);
    assert.match(skill, /external read-only\/network-open policy/u);
    assert.match(skill, /exact selected[\s\S]*sandbox is its only transport[\s\S]*There\s+is no unbound host shell\/consult fallback/u);
    assert.match(skill, /raw `node -e`/u);
    assert.match(skill, /codex-advisory-bootstrap\.mjs/u);
    assert.match(skill, /question only on\s+the launcher's stdin, never in its argv/u);
    assert.match(skill, /standing\s+consent is approved/u);
  }],
  ["Claude fallback order is bounded Fable then Opus then consult", () => {
    const chain = skill.match(/order is `([^`]+)`/u)?.[1] ?? "";
    assert.match(chain, /Fable/u);
    assert.ok(chain.indexOf("Fable") < chain.indexOf("Opus"));
    assert.ok(chain.indexOf("Opus") < chain.indexOf("Claude consult"));
    assert.match(skill, /same-runner fresh read-only consult/u);
  }],
  ["attested success needs a receipt while the PO-authorized direct fallback has bounded gate capability", () => {
    assert.match(skill, /pipeline\.advisory-receipt\.v1/u);
    assert.match(skill, /requires an `answered` receipt/u);
    assert.match(skill, /observed provider matches the same runner/u);
    assert.match(skill, /candidate binding is\s+current/u);
    assert.match(skill, /po-authorized-functional-equivalent/u);
    assert.match(skill, /emits no Pipeline Advisory\s+receipt/u);
    assert.match(skill, /gate-capable for the affected PO gate, bootstrap\/readiness decision,\s+Critic prerequisite, or Epic-close prerequisite/u);
    assert.match(skill, /until revoked by the PO or\s+replaced by a functional Codex CLI selected sandbox/u);
    assert.match(skill, /no attested\s+selected-sandbox execution; OS isolation and model identity are not\s+asserted/u);
  }],
  ["existing provenance and Elephant role checks remain", () => {
    assert.match(skill, /git rev-parse HEAD/u);
    assert.match(skill, /ruleset-freshness\.mjs --repo "\$PWD"/u);
    assert.match(skill, /`equal\|ahead` is current/u);
    assert.match(skill, /host-authorized\s+network-open\/read-only command boundary/u);
    assert.match(skill, /bootstrap-env-check\.mjs/u);
    assert.match(skill, /do not first run a known-to-fail sandbox probe/u);
    assert.match(skill, /check-po-gate-authority\.mjs/u);
    assert.match(skill, /EL-01\/EL-02\/EL-03\/EL-04\/EL-16\/EL-18\/EL-19/u);
    assert.match(skill, /Bootstrap check passed:/u);
  }],
  ["affected Codex duties select the documented host mode before any child", () => {
    assert.equal(skill.includes("sandboxed-readonly-host-bridge.mjs"), true, "pipeline start must name the generic selected host bridge");
    assert.equal(skill.includes("network-open/read-only"), true, "pipeline start must name the documented profile");
    assert.equal(/before (?:the )?first child/u.test(skill), true, "selection must precede every child");
    assert.equal(skill.includes("host-mode-unavailable"), true, "unavailable hosts need a typed outcome");
    assert.equal(/ask (?:the )?(?:PO|user).*sandbox mode/ui.test(skill), false, "user prose cannot choose the host mode");
    assert.equal(skill.includes("danger-full-access"), false, "the prohibited mode must never appear as a workaround");
  }],
  ["self-application probes the managed toolchain without exporting pipeline scope to consumers", () => {
    assert.match(skill, /Self-application toolchain preflight/u);
    assert.match(skill, /toolchain-preflight\.mjs --root "\$PWD"/u);
    assert.match(skill, /Agent-Pipeline checkout only/u);
    assert.match(skill, /never run it in a consumer project/u);
    assert.match(skill, /read-only observation/u);
    assert.match(skill, /does not write a receipt/u);
    assert.match(skill, /securityGate: blocking/u);
    assert.match(skill, /security\/release\/public-baseline claims/u);
    assert.match(skill, /execution_environment`, `probe_timeout`, and `probe_error`/u);
    assert.match(skill, /never recommend\s+reinstalling/u);
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
