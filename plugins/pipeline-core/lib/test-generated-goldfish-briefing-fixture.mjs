// SPDX-License-Identifier: SUL-1.0
// Test-only: an approved item course plus a briefing from the real generator. Since D185 every productive Goldfish dispatch is
// admitted only with a generated briefing whose item-delivery binding resolves against an approved course, so a suite that
// drives the real dispatch guard builds its admission input here instead of filling templates/prompts/goldfish-task.md by hand.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordConsentGiven } from "./onboarding-consent-marker.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "./test-item-approved-course-fixture.mjs";
import { runDispatchBriefing } from "../scripts/dispatch-briefing.mjs";

/** A fresh approved-course repository (real commit, real plan approval) that is enrolled and has consent recorded. */
export function prepareGeneratedDispatchRoot(prefix = "generated-dispatch-") {
  const root = realpathSync(mkdtempSync(join(nativeContractFixtureParent(), prefix)));
  prepareApprovedItemCourseFixture({ root, calibrationExtra: { handover: "docs/state.md" } });
  recordConsentGiven({ rootDir: root });
  mkdirSync(join(root, "scratch"), { recursive: true });
  return root;
}

/**
 * Build one generated Goldfish briefing for `sliceId` in `root`. `goal` varies the bytes of the briefing without changing its slice
 * (an amended re-dispatch); the generator runs in process with an injected ruleset identity and route (no real plugin registry).
 */
export function buildGeneratedGoldfishBriefing(root, sliceId, { goal = "Fixture goal text.", paths = ["src/change.mjs"] } = {}) {
  const packagePath = `scratch/pkg-${sliceId}.json`;
  writeFileSync(join(root, packagePath), JSON.stringify({
    id: sliceId, item: "unit-item", criterion: "AC-1", agentType: "goldfish-implementor", modelId: "claude-sonnet-5-5", modelWhy: "role default",
    check: "src/change.test.mjs", paths, spec: "specs/unit/spec.md", title: "Fixture title", ac: "AC-1", goal,
    context: ["`src/change.mjs` -- the module."], targeted: ["`node --test src/change.test.mjs` (green)"], forbidden: ["Fixture forbidden rule."], stops: ["Fixture stop rule."],
  }));
  const built = runDispatchBriefing(["build", "--root", root, "--package", packagePath], {
    observePreflight: () => ({ rulesetSource: { selectedPlugin: { id: "pipeline-core", version: "9.9.9+test" }, loadedIdentity: { status: "available", algorithm: "content-sha256", value: "c".repeat(64) } } }),
    resolveBaseline: () => ({ status: "ready", entries: [] }),
    claudeRoute: (taskRoute) => ({ taskRoute, runner: "claude", role: "worker", state: "default", selector: { kind: "alias", value: "sonnet" }, effort: "medium" }),
  });
  assert.equal(built.ok, true, `the generator must build the fixture briefing -- ${JSON.stringify(built).slice(0, 300)}`);
  return built.text;
}
