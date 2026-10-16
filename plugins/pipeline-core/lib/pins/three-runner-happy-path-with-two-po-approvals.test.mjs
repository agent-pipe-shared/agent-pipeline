#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.three-runner-happy-path-with-two-po-approvals
 * (AC-264; spec section 21.0 counting rule, section 21.3 R3-1 ceremony inventory).
 *
 * Deterministic ceremony-inventory test. Every PO interaction the product
 * defines is classified `per-feature` or `one-time-onboarding`; the happy path
 * (scenarios A-D of R3-1) needs exactly two per-feature decisions (plus one per
 * additional push). The lifecycle verb list is DERIVED from the real
 * `pipeline-state.mjs --help` output, so a newly added approval-bearing verb that
 * nobody classified fails here. The per-runner end-to-end proof is host evidence
 * (E) and stays a typed skip.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { run } from "../../scripts/pipeline-state.mjs";
import { applyOnboardingIntakeConsent } from "../onboarding-continuity.mjs";

const PLUGIN = fileURLToPath(new URL("../../", import.meta.url));
const SPEC = fileURLToPath(new URL("../../../../specs/sprint-alfred-epic/spec.md", import.meta.url));

const PER_FEATURE = "per-feature";
const ONE_TIME = "one-time-onboarding";
const ALLOWED_CLASSES = Object.freeze([PER_FEATURE, ONE_TIME]);

/**
 * The PO-interaction inventory. `anchor` ties each entry to product source:
 * `verb` entries must appear in the live pipeline-state command list;
 * `export`/`file` entries must resolve in the plugin.
 */
const INVENTORY = Object.freeze([
  { id: "plan-approval", class: PER_FEATURE, anchor: { verb: "approve-plan" } },
  { id: "push-approval", class: PER_FEATURE, anchor: { verb: "approve-push" } },
  { id: "enrollment-consent", class: ONE_TIME,
    anchor: { export: ["lib/onboarding-continuity.mjs", "applyOnboardingIntakeConsent"], file: "scripts/onboarding-consent.mjs" } },
  { id: "key-setup-first-use-confirmation", class: ONE_TIME, anchor: { file: "scripts/signing-ceremony.mjs" } },
]);

/**
 * Approval-bearing verbs deliberately NOT on the happy path. They are recovery,
 * re-enrollment mechanics (no extra prompt, PO decision 2026-10-04 #7), deploy or
 * release-publication acts. A happy-path scenario may never contain them.
 */
const OFF_HAPPY_PATH_VERBS = Object.freeze([
  "approve-deploy", "publication-approve", "rebind-approval", "retire-enrollment", "activate-enrollment",
  "po-authority-rebind-plan", "po-authority-rebind-apply", "po-authority-acknowledge-plan",
  "po-authority-acknowledge-apply", "po-authority-decision-plan", "po-authority-decision-select",
  "po-authority-decision-apply", "seal-plan-approval", "continuity-result-rebind-plan",
  "continuity-result-rebind-apply", "publication-authorize", "feature-package-rebind-mutable",
]);

const PO_VERB_PATTERN = /(^|-)(approve|approval|acknowledge|authorize|consent|rebind)(-|$)|^po-authority-/;

/** Scenarios of R3-1. Each builds its interaction list from the inventory only. */
const SCENARIOS = Object.freeze([
  { id: "A", pushes: 1, oneTime: [], expectPerFeature: 2 },
  { id: "B", pushes: 1, oneTime: ["enrollment-consent", "key-setup-first-use-confirmation"], expectPerFeature: 2 },
  { id: "C", pushes: 2, oneTime: [], expectPerFeature: 3 },
  { id: "D", pushes: 1, oneTime: ["enrollment-consent"], expectPerFeature: 2 },
]);

function liveVerbs() {
  const out = [];
  const log = console.log;
  console.log = (...v) => out.push(v.join(" "));
  try { assert.equal(run(["--help"], {}), 0); } finally { console.log = log; }
  const m = /Commands: ([^\n]+)\./.exec(out.join("\n"));
  assert.ok(m, "pipeline-state --help must list its commands");
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function interactionsFor(inventory, scenario) {
  const byId = new Map(inventory.map((e) => [e.id, e]));
  const list = [byId.get("plan-approval")];
  for (let i = 0; i < scenario.pushes; i += 1) list.push(byId.get("push-approval"));
  for (const id of scenario.oneTime) list.push(byId.get(id));
  return list;
}

/** The checker under test. Throws on any violation of the section 21.0 counting rule. */
function assertCeremonyInventory(inventory, verbs) {
  // Every entry is classified, and only into the two allowed classes.
  for (const e of inventory) {
    assert.ok(ALLOWED_CLASSES.includes(e.class), `interaction ${e.id} has disallowed class ${e.class}`);
    if (e.anchor.verb) assert.ok(verbs.includes(e.anchor.verb), `${e.id}: verb ${e.anchor.verb} is not a pipeline-state command`);
    if (e.anchor.file) assert.ok(existsSync(PLUGIN + e.anchor.file), `${e.id}: anchor file ${e.anchor.file} missing`);
  }
  // Every PO-bearing verb the product exposes is either inventoried or declared off the happy path.
  const covered = new Set([...inventory.map((e) => e.anchor.verb).filter(Boolean), ...OFF_HAPPY_PATH_VERBS]);
  const unclassified = verbs.filter((v) => PO_VERB_PATTERN.test(v) && !covered.has(v));
  assert.deepEqual(unclassified, [], `unclassified PO-interaction verbs: ${unclassified.join(", ")}`);
  // The happy-path scenarios count exactly as specified.
  for (const s of SCENARIOS) {
    const list = interactionsFor(inventory, s);
    const perFeature = list.filter((e) => e.class === PER_FEATURE).length;
    const oneTime = list.filter((e) => e.class === ONE_TIME).map((e) => e.id).sort();
    assert.equal(perFeature, s.expectPerFeature, `scenario ${s.id}: per-feature count ${perFeature}`);
    assert.deepEqual(oneTime, [...s.oneTime].sort(), `scenario ${s.id}: one-time acts`);
    for (const e of list) assert.ok(!OFF_HAPPY_PATH_VERBS.includes(e.anchor.verb), `scenario ${s.id} contains off-path ${e.id}`);
  }
  // Exactly two distinct per-feature ceremony kinds exist.
  assert.deepEqual(inventory.filter((e) => e.class === PER_FEATURE).map((e) => e.id).sort(), ["plan-approval", "push-approval"]);
}

test("AC-264: the inventory classifies every PO interaction into per-feature or one-time-onboarding and the happy path needs exactly two per-feature approvals", () => {
  assertCeremonyInventory(INVENTORY, liveVerbs());
});

test("AC-264: scenarios A-D match section 21.3 R3-1 counts (2 / 2 + two one-time / 3 / 2 + one one-time)", () => {
  const counts = SCENARIOS.map((s) => interactionsFor(INVENTORY, s).filter((e) => e.class === PER_FEATURE).length);
  assert.deepEqual(counts, [2, 2, 3, 2]);
});

test("AC-264: inventory anchors resolve in product source (verbs from live --help, consent export, plugin files)", () => {
  const verbs = liveVerbs();
  for (const v of ["approve-plan", "approve-push"]) assert.ok(verbs.includes(v), v);
  assert.equal(typeof applyOnboardingIntakeConsent, "function");
  for (const v of OFF_HAPPY_PATH_VERBS) assert.ok(verbs.includes(v), `off-path verb ${v} no longer exists; remove it from the pin`);
});

test("AC-264: the governing spec text still states the two-decision counting rule this pin encodes", () => {
  const text = readFileSync(SPEC, "utf8");
  assert.match(text, /exactly two decisions:\s+the final plan approval and the approval of that push/);
  assert.match(text, /`per-feature` or `one-time-onboarding`\. Any other class fails the test/);
});

test("RED mirror: an extra per-feature ceremony makes the inventory check fail", () => {
  const extra = [...INVENTORY, { id: "bootstrap-plan-acknowledgement", class: PER_FEATURE, anchor: { verb: "approve-plan" } }];
  assert.throws(() => assertCeremonyInventory(extra, liveVerbs()), /bootstrap-plan-acknowledgement/);
});

test("RED mirror: a ceremony in any third class fails", () => {
  const third = INVENTORY.map((e) => (e.id === "key-setup-first-use-confirmation" ? { ...e, class: "residual" } : e));
  assert.throws(() => assertCeremonyInventory(third, liveVerbs()), /disallowed class residual/);
});

test("RED mirror: a new unclassified approval-bearing pipeline-state verb fails", () => {
  assert.throws(() => assertCeremonyInventory(INVENTORY, [...liveVerbs(), "approve-extra-gate"]),
    /unclassified PO-interaction verbs: approve-extra-gate/);
});

test("RED mirror: an extra per-feature ceremony inside the happy-path scenario count is detected", () => {
  const twoPush = [{ id: "A", pushes: 2, oneTime: [], expectPerFeature: 2 }];
  const list = interactionsFor(INVENTORY, twoPush[0]);
  assert.notEqual(list.filter((e) => e.class === PER_FEATURE).length, twoPush[0].expectPerFeature);
});

test("E: per-runner end-to-end greenfield scenario (Claude Windows, Codex, Antigravity) reaches a pushed branch with exactly two PO proofs and zero guard overrides",
  { skip: "E-HOLD pipeline.three-runner-happy-path-with-two-po-approvals: needs genuine installed host runs per runner (native/installed host evidence); not producible in-repo" },
  () => {});
