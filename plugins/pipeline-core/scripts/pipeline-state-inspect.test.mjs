#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Coverage for the `inspect` subcommand (NVA-W4-07): the ONE consolidated
 * read-only readback, distinct in shape from the ~14 terse mutating writer
 * subcommands (`set-feature`, `close-feature`, etc. -- untouched, and NOT
 * re-tested here; their own suites already cover them). `inspect` reuses the
 * `continuity-result-rebind`/`continuity-result-bootstrap` family's richer
 * structured-JSON pattern (a `schema` field plus nested detail) and performs
 * ZERO writes: no lock, no state mutation, no `docs/state.md` touch.
 *
 * NVA-I-ONEROUTE: `nextAction` is now the STRUCTURAL protocol action
 * (`{kind, executable, argv}` or `{kind: "collect-input", ...}`); the
 * rendered prose moved to `nextActionText`, asserted against
 * `nextActionSection()` directly (the same pure renderer `syncStateMdNextAction`
 * calls before writing `docs/state.md`'s "## Next action" section) rather than
 * against a hardcoded body string, so this test tracks that renderer's real
 * contract instead of duplicating its prose.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { run, SCHEMA_ID, statePath as resolveStatePath } from "./pipeline-state.mjs";
import { nextActionSection } from "../lib/onboarding-continuity.mjs";
import { mkdtempTestScratch } from "../lib/test-tmpdir.mjs";

const roots = [];
const NOW = "2026-08-18T12:00:00.000Z";
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

function invoke(root, argv) {
  const out = []; const err = []; const log = console.log; const error = console.error;
  console.log = (...value) => out.push(value.join(" ")); console.error = (...value) => err.push(value.join(" "));
  try { return { status: run(argv, { dir: root, now: () => NOW }), out: out.join("\n"), err: err.join("\n") }; }
  finally { console.log = log; console.error = error; }
}

function freshRoot(name) {
  const root = mkdtempTestScratch(`pipeline-state-inspect-${name}-`);
  roots.push(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  return root;
}

test("inspect on a project with no active feature reports an inactive lifecycle and zero mutation", () => {
  const root = freshRoot("inactive");
  const before = invoke(root, ["inspect"]);
  assert.equal(before.status, 0, before.err);
  const payload = JSON.parse(before.out);
  assert.equal(payload.schema, "pipeline.inspect.v1");
  assert.equal(payload.activeFeature, null);
  assert.equal(payload.phase, null);
  assert.equal(payload.planApproved, false);
  assert.equal(payload.lifecycle.code, "PLAN-LIFECYCLE-INACTIVE");
  assert.equal(payload.lifecycle.status, null);
  assert.equal(payload.status, null);
  assert.equal(payload.nextAction, null);
  assert.equal(payload.nextActionText, nextActionSection({ schema: SCHEMA_ID }));

  // Zero mutation: `inspect` on a project with no state file yet must not
  // create one -- it is read-only, unlike every writer subcommand above it.
  let stateExistsAfter = true;
  try { readFileSync(resolveStatePath(root), "utf8"); } catch { stateExistsAfter = false; }
  assert.equal(stateExistsAfter, false, "inspect must not create a state file as a side effect");
});

test("inspect after set-feature surfaces phase, draft lifecycle, and the live Next-action text", () => {
  const root = freshRoot("draft");
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);

  const statePathValue = resolveStatePath(root);
  const beforeBytes = readFileSync(statePathValue, "utf8");

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.schema, "pipeline.inspect.v1");
  assert.deepEqual(payload.activeFeature, { id: "widget", planPath: "specs/widget/prd.md", phase: "design" });
  assert.equal(payload.phase, "design");
  assert.equal(payload.planApproved, false);
  assert.equal(payload.lifecycle.ok, true);
  assert.equal(payload.lifecycle.status, "draft");
  assert.equal(payload.status, "draft");
  assert.equal(payload.closedFeaturesCount, 0);

  // Structural nextAction: no plan has been submitted yet, and this command
  // cannot derive who is submitting it or which delivery profile applies --
  // a collect-input, never an invented/placeholder-laden command.
  assert.equal(payload.nextAction.kind, "collect-input");
  assert.deepEqual(payload.nextAction.inputs.map((input) => input.name), ["by", "profile"]);
  assert.equal(payload.nextAction.input, undefined);

  const persistedState = JSON.parse(readFileSync(statePathValue, "utf8"));
  assert.equal(payload.nextActionText, nextActionSection(persistedState),
    "nextActionText must be byte-identical to the same pure renderer syncStateMdNextAction uses");

  // Zero mutation: the state file bytes must be unchanged by `inspect`.
  const afterBytes = readFileSync(statePathValue, "utf8");
  assert.equal(afterBytes, beforeBytes, "inspect must not mutate the state file");
});

test("inspect reports phoenixEpicHistory as null when the field is absent", () => {
  const root = freshRoot("no-phoenix");
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);
  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.equal(payload.phoenixEpicHistory, null);
});

test("inspect surfaces a compact phoenixEpicHistory summary when the field is present (RW2-STATEKEY)", () => {
  const root = freshRoot("phoenix");
  assert.equal(run(["set-feature", "--id", "widget", "--plan-path", "specs/widget/prd.md"], { dir: root, now: () => NOW }), 0);
  const statePathValue = resolveStatePath(root);
  const state = JSON.parse(readFileSync(statePathValue, "utf8"));
  state.phoenixEpicHistory = {
    note: "preserved verbatim, historical record only",
    activeFeature: { id: "sprint-phoenix-epic", planPath: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", phase: "implementation" },
    continuity: { schema: "pipeline.continuity.v0", featureId: "sprint-phoenix-epic", revision: 8 },
  };
  writeFileSync(statePathValue, JSON.stringify(state, null, 2) + "\n");
  const beforeBytes = readFileSync(statePathValue, "utf8");

  const result = invoke(root, ["inspect"]);
  assert.equal(result.status, 0, result.err);
  const payload = JSON.parse(result.out);
  assert.deepEqual(payload.phoenixEpicHistory, {
    present: true,
    featureId: "sprint-phoenix-epic",
    continuityRevision: 8,
    note: "preserved verbatim, historical record only",
  });

  // Zero mutation: inspect must not touch the state file even when this field is present.
  const afterBytes = readFileSync(statePathValue, "utf8");
  assert.equal(afterBytes, beforeBytes, "inspect must not mutate the state file");
});

test("--help lists inspect among the accepted commands", () => {
  const root = freshRoot("help");
  const result = invoke(root, ["--help"]);
  assert.equal(result.status, 0, result.err);
  assert.ok(result.out.includes("inspect"), "help output must name the inspect subcommand");
});
