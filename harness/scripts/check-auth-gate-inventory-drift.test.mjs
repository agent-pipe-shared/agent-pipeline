#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  checkAuthGateInventoryDrift,
  extractCliCommandLiterals,
  extractCreatePoApprovalIntentKinds,
  extractFrozenArray,
} from "./check-auth-gate-inventory-drift.mjs";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const PIPELINE_STATE_PATH = "plugins/pipeline-core/scripts/pipeline-state.mjs";
const PO_HUMAN_APPROVAL_PATH = "plugins/pipeline-core/scripts/po-human-approval.mjs";
const CRITICAL_ACTION_PATH = "plugins/pipeline-core/lib/critical-action-approval-request.mjs";
const INVENTORY_DOC_PATH = "docs/human-authorization-inventory.md";

const BASE_PIPELINE_STATE = `
  switch (sub) {
    case "submit-plan": { return 0; }
    case "approve-plan": { return 0; }
    case "approve-push": { return 0; }
    case "approve-deploy": { return 0; }
  }
`;
const BASE_PO_HUMAN_APPROVAL = `
const CRITICAL_COMMAND_KINDS = Object.freeze(["push", "deploy", "publication", "feature-package-reconcile"]);
`;
const BASE_CRITICAL_ACTION = `
export const CRITICAL_ACTION_KINDS = Object.freeze(["push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile"]);
  const approvalIntent = createPoApprovalIntent({
    kind: "critical-action",
    featureId,
  });
`;
const BASE_DOC = `
| Push | ... | \`push\` | ... | (\`approve-push\`) |
| Deploy | ... | \`deploy\` | ... | (\`approve-deploy\`) |
| Publication | ... | \`publication\` | ... | |
| Feature-package reconcile | ... | \`feature-package-reconcile\` | ... | |
| Governance fork disposition | ... | \`governance-fork-disposition\` | ... | |
| Critical action | ... | \`critical-action\` | ... | |
| Plan/PRD approval (\`approve-plan\`) | ... |
Explicitly out of scope: \`submit-plan\`, \`set-feature\`.
`;

function fixture({ pipelineState = BASE_PIPELINE_STATE, poHumanApproval = BASE_PO_HUMAN_APPROVAL, criticalAction = BASE_CRITICAL_ACTION, doc = BASE_DOC } = {}) {
  const sources = {
    [PIPELINE_STATE_PATH]: pipelineState,
    [PO_HUMAN_APPROVAL_PATH]: poHumanApproval,
    [CRITICAL_ACTION_PATH]: criticalAction,
    [INVENTORY_DOC_PATH]: doc,
  };
  return { readText: (path) => sources[path] };
}

test("extractCliCommandLiterals finds approve-/submit-/authorize- prefixed literals only", () => {
  assert.deepEqual(
    extractCliCommandLiterals(`case "submit-plan": case "approve-push": case "set-feature": case "authorize-critical":`),
    ["approve-push", "authorize-critical", "submit-plan"],
  );
});

test("extractFrozenArray reads a Object.freeze([...]) string array", () => {
  assert.deepEqual(extractFrozenArray(BASE_CRITICAL_ACTION, "CRITICAL_ACTION_KINDS"), [
    "push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile",
  ]);
  assert.deepEqual(extractFrozenArray("no such constant here", "CRITICAL_ACTION_KINDS"), []);
});

test("extractCreatePoApprovalIntentKinds finds the outer-wrapper kind literal", () => {
  assert.deepEqual(extractCreatePoApprovalIntentKinds(BASE_CRITICAL_ACTION), ["critical-action"]);
});

test("clean fixture set (mirrors the real, accurate inventory) passes with zero findings", () => {
  const result = checkAuthGateInventoryDrift(REPO, fixture());
  assert.deepEqual(result.findings, []);
  assert.equal(result.stats.discovered, result.stats.cliCommands + result.stats.kinds);
});

test("the real repository state passes clean today", () => {
  const result = checkAuthGateInventoryDrift(REPO);
  assert.deepEqual(result.findings, []);
});

test("a synthetic new one-off approve-* command not yet in the doc fails closed", () => {
  const pipelineState = `${BASE_PIPELINE_STATE}\n    case "approve-widget-rollout": { return 0; }\n`;
  const result = checkAuthGateInventoryDrift(REPO, fixture({ pipelineState }));
  assert.equal(result.findings.some((finding) => finding.includes("approve-widget-rollout")), true);
});

test("the same synthetic gate passes once the fixture doc copy acknowledges it", () => {
  const pipelineState = `${BASE_PIPELINE_STATE}\n    case "approve-widget-rollout": { return 0; }\n`;
  const doc = `${BASE_DOC}\n| Widget rollout (\`approve-widget-rollout\`) | ... |\n`;
  const result = checkAuthGateInventoryDrift(REPO, fixture({ pipelineState, doc }));
  assert.deepEqual(result.findings, []);
});

test("a synthetic new critical-action kind not yet in the doc fails closed", () => {
  const criticalAction = BASE_CRITICAL_ACTION.replace(
    `"push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile"`,
    `"push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile", "widget-rollout"`,
  );
  const result = checkAuthGateInventoryDrift(REPO, fixture({ criticalAction }));
  assert.equal(result.findings.some((finding) => finding.includes("widget-rollout")), true);
});

test("the same synthetic kind passes once the fixture doc copy acknowledges it", () => {
  const criticalAction = BASE_CRITICAL_ACTION.replace(
    `"push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile"`,
    `"push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile", "widget-rollout"`,
  );
  const doc = `${BASE_DOC}\n| Widget rollout | ... | \`widget-rollout\` | ... |\n`;
  const result = checkAuthGateInventoryDrift(REPO, fixture({ criticalAction, doc }));
  assert.deepEqual(result.findings, []);
});

test("submit-plan is acknowledged via the doc's explicit-exclusion prose, not a table", () => {
  const result = checkAuthGateInventoryDrift(REPO, fixture());
  assert.equal(result.findings.some((finding) => finding.includes("submit-plan")), false);
});

test("an unreadable source file is reported, not silently skipped", () => {
  const result = checkAuthGateInventoryDrift(REPO, {
    readText: () => { throw new Error("ENOENT"); },
  });
  assert.equal(result.findings.some((finding) => finding.startsWith("AUTH-GATE-SOURCE-UNREADABLE")), true);
});

test("a missing CRITICAL_ACTION_KINDS declaration is reported as a missing signal", () => {
  const result = checkAuthGateInventoryDrift(REPO, fixture({ criticalAction: "// no declarations here" }));
  assert.equal(result.findings.some((finding) => finding.startsWith("AUTH-GATE-SIGNAL-MISSING")), true);
});
