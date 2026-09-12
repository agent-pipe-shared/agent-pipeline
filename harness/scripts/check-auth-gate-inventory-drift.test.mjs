#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { authorizeCriticalPushCommand } from "../../plugins/pipeline-core/scripts/po-human-approval.mjs";
import {
  HUMAN_TERMINAL_ACTION_CATALOG_PATH as SHIPPED_CATALOG_PATH,
  buildRegisteredHumanTerminalAction,
  loadHumanTerminalActionCatalog,
  parseHumanTerminalActionCatalog,
  registeredHumanTerminalActionBuilderIds,
  validateHumanTerminalActionCatalog,
} from "../../plugins/pipeline-core/lib/human-terminal-action-catalog.mjs";

import {
  checkAuthGateInventoryDrift,
  extractCanonicalHumanAuthorizationRows,
  extractCliCommandLiterals,
  extractCreatePoApprovalIntentKinds,
  extractFrozenArray,
  extractHumanTerminalDispositionRows,
} from "./check-auth-gate-inventory-drift.mjs";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const PIPELINE_STATE_PATH = "plugins/pipeline-core/scripts/pipeline-state.mjs";
const PO_HUMAN_APPROVAL_PATH = "plugins/pipeline-core/scripts/po-human-approval.mjs";
const CRITICAL_ACTION_PATH = "plugins/pipeline-core/lib/critical-action-approval-request.mjs";
const INVENTORY_DOC_PATH = "docs/human-authorization-inventory.md";
const HUMAN_TERMINAL_ACTION_CATALOG_PATH = "plugins/pipeline-core/templates/human-terminal-actions/catalog.json";

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
## On the shared \`pipeline.po-approval-proof.v1\` contract
| Intent/gate | Authorizes | kind |
|---|---|---|
| Push <!-- inventory-id: push-signature --> | ... | \`push\` (\`approve-push\`) |
| Deploy <!-- inventory-id: deploy-signature --> | ... | \`deploy\` (\`approve-deploy\`) |
| Publication <!-- inventory-id: publication-signature --> | ... | \`publication\` |
| Feature-package reconcile <!-- inventory-id: feature-package-reconcile-signature --> | ... | \`feature-package-reconcile\` |
| Governance fork disposition <!-- inventory-id: governance-fork-disposition --> | ... | \`governance-fork-disposition\` |
| Critical action <!-- inventory-id: critical-action-family --> | ... | \`critical-action\` |

## NOT on the shared contract (a different mechanism)
| Intent/gate | Authorizes | Mechanism |
|---|---|---|
| Plan/PRD approval (\`approve-plan\`) <!-- inventory-id: plan-prd-approval --> | ... | ... |

## Explicitly out of scope for this inventory
Explicitly out of scope: \`submit-plan\`, \`set-feature\`.

## Human-terminal template dispositions
| Inventory id | Disposition | Catalog/template id |
|---|---|---|
| \`push-signature\` | \`registered\` | \`critical-push-authorize\` |
| \`deploy-signature\` | \`legacy-renderer\` | — |
| \`publication-signature\` | \`legacy-renderer\` | — |
| \`feature-package-reconcile-signature\` | \`legacy-renderer\` | — |
| \`governance-fork-disposition\` | \`legacy-renderer\` | — |
| \`critical-action-family\` | \`abstract-family\` | — |
| \`plan-prd-approval\` | \`legacy-renderer\` | — |
`;

const catalogEntry = (inventoryId, disposition, templateId = null, builderId = null, boundary = null) => ({
  id: templateId ?? inventoryId,
  inventoryId,
  revision: 1,
  purpose: `Fixture ${inventoryId}`,
  audience: "user",
  disposition,
  templateId,
  builderId,
  producerRefs: ["fixture.mjs"],
  boundary,
  mutation: disposition === "registered" ? true : null,
  requiresPoApproval: disposition === "registered" ? true : null,
  slots: disposition === "registered" ? [] : null,
  expectedReadback: disposition === "registered"
    ? { schema: null, code: "FIXTURE-READY", command: "verify-critical" }
    : null,
  runners: disposition === "registered" ? ["codex"] : null,
  platforms: disposition === "registered" ? ["posix"] : null,
});
const BASE_CATALOG = JSON.stringify({
  schema: "pipeline.human-terminal-action-catalog.v1",
  entries: [
    catalogEntry("push-signature", "registered", "critical-push-authorize", "authorize-critical-push"),
    catalogEntry("deploy-signature", "legacy-renderer"),
    catalogEntry("publication-signature", "legacy-renderer"),
    catalogEntry("feature-package-reconcile-signature", "legacy-renderer"),
    catalogEntry("governance-fork-disposition", "legacy-renderer"),
    catalogEntry("critical-action-family", "abstract-family"),
    catalogEntry("plan-prd-approval", "legacy-renderer"),
  ],
});

function fixture({ pipelineState = BASE_PIPELINE_STATE, poHumanApproval = BASE_PO_HUMAN_APPROVAL, criticalAction = BASE_CRITICAL_ACTION, doc = BASE_DOC, catalog = BASE_CATALOG } = {}) {
  const sources = {
    [PIPELINE_STATE_PATH]: pipelineState,
    [PO_HUMAN_APPROVAL_PATH]: poHumanApproval,
    [CRITICAL_ACTION_PATH]: criticalAction,
    [INVENTORY_DOC_PATH]: doc,
    [HUMAN_TERMINAL_ACTION_CATALOG_PATH]: catalog,
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

test("extractHumanTerminalDispositionRows reads only explicit closed table rows", () => {
  assert.deepEqual(extractHumanTerminalDispositionRows(BASE_DOC).at(0), {
    inventoryId: "push-signature",
    disposition: "registered",
    templateId: "critical-push-authorize",
  });
});

test("canonical authorization rows derive their ids from the two authoritative tables", () => {
  assert.deepEqual(
    extractCanonicalHumanAuthorizationRows(BASE_DOC).map((row) => row.inventoryId),
    ["push-signature", "deploy-signature", "publication-signature", "feature-package-reconcile-signature",
      "governance-fork-disposition", "critical-action-family", "plan-prd-approval"],
  );
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

test("a newly documented synthetic gate still fails until its canonical row has an inventory disposition", () => {
  const pipelineState = `${BASE_PIPELINE_STATE}\n    case "approve-widget-rollout": { return 0; }\n`;
  const doc = BASE_DOC.replace(
    "\n## NOT on the shared contract",
    "\n| Widget rollout (\`approve-widget-rollout\`) | ... | ... |\n\n## NOT on the shared contract",
  );
  const result = checkAuthGateInventoryDrift(REPO, fixture({ pipelineState, doc }));
  assert.equal(result.findings.some((finding) => finding.includes("AUTH-GATE-INVENTORY-ID-MISSING")), true);
});

test("a synthetic new critical-action kind not yet in the doc fails closed", () => {
  const criticalAction = BASE_CRITICAL_ACTION.replace(
    `"push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile"`,
    `"push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile", "widget-rollout"`,
  );
  const result = checkAuthGateInventoryDrift(REPO, fixture({ criticalAction }));
  assert.equal(result.findings.some((finding) => finding.includes("widget-rollout")), true);
});

test("a newly documented synthetic kind with an id fails until catalog and disposition cover it", () => {
  const criticalAction = BASE_CRITICAL_ACTION.replace(
    `"push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile"`,
    `"push", "deploy", "publication", "governance-fork-disposition", "feature-package-reconcile", "widget-rollout"`,
  );
  const doc = BASE_DOC.replace(
    "\n## NOT on the shared contract",
    "\n| Widget rollout <!-- inventory-id: widget-rollout --> | ... | \`widget-rollout\` |\n\n## NOT on the shared contract",
  );
  const result = checkAuthGateInventoryDrift(REPO, fixture({ criticalAction, doc }));
  assert.equal(result.findings.some((finding) => finding.includes("AUTH-GATE-TERMINAL-CATALOG-MISSING widget-rollout")), true);
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

test("terminal disposition drift and missing catalog coverage fail closed", () => {
  const drifted = BASE_DOC.replace("| `deploy-signature` | `legacy-renderer` | — |", "| `deploy-signature` | `excluded` | — |");
  assert.equal(
    checkAuthGateInventoryDrift(REPO, fixture({ doc: drifted })).findings
      .some((finding) => finding.includes("AUTH-GATE-TERMINAL-DISPOSITION-DRIFT deploy-signature")),
    true,
  );
  const extra = `${BASE_DOC}\n| \`new-human-action\` | \`excluded\` | — |\n`;
  assert.equal(
    checkAuthGateInventoryDrift(REPO, fixture({ doc: extra })).findings
      .some((finding) => finding.includes("AUTH-GATE-TERMINAL-CATALOG-MISSING new-human-action")),
    true,
  );
});

test("malformed and duplicate catalog entries fail closed", () => {
  const malformed = JSON.parse(BASE_CATALOG);
  malformed.entries[0].unexpected = true;
  assert.equal(
    checkAuthGateInventoryDrift(REPO, fixture({ catalog: JSON.stringify(malformed) })).findings
      .some((finding) => finding.includes("AUTH-GATE-TERMINAL-CATALOG-INVALID")),
    true,
  );
  const duplicate = JSON.parse(BASE_CATALOG);
  duplicate.entries.push(structuredClone(duplicate.entries[0]));
  assert.equal(
    checkAuthGateInventoryDrift(REPO, fixture({ catalog: JSON.stringify(duplicate) })).findings
      .some((finding) => finding.includes("DUPLICATE")),
    true,
  );
});

test("shipped terminal catalog is immutable and covers unique inventory dispositions", () => {
  const catalog = loadHumanTerminalActionCatalog();
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.entries), true);
  assert.equal(catalog.entries.length, 18);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, catalog.entries.length);
  assert.equal(new Set(catalog.entries.map((entry) => entry.inventoryId)).size, catalog.entries.length);
  assert.deepEqual(registeredHumanTerminalActionBuilderIds(), ["authorize-critical-push"]);
});

test("registered terminal builder delegates deep-equal to its current source and preserves absent boundary fields", () => {
  const input = {
    repoRoot: "/repo root",
    directory: "/external material",
    featureId: "feature-one",
    plan: "specs/feature one/prd.md",
    spec: "specs/feature one/spec.md",
    subjectSha256: "a".repeat(64),
    expiresAt: "2026-09-12T12:00:00.000Z",
    launcher: "/plugin/scripts/po-human-approval.mjs",
  };
  const source = authorizeCriticalPushCommand(input);
  const registered = buildRegisteredHumanTerminalAction("authorize-critical-push", input);
  assert.deepEqual(registered.output, source);
  const sourceBoundary = ["executionBoundary", "invocation", "codexToolCallPermitted"]
    .some((field) => Object.hasOwn(source, field))
    ? Object.fromEntries(["executionBoundary", "invocation", "codexToolCallPermitted"]
      .filter((field) => Object.hasOwn(source, field)).map((field) => [field, source[field]]))
    : null;
  assert.deepEqual(registered.boundary, sourceBoundary,
    "the source builder emits no boundary tuple; Slice 1 must preserve absence rather than invent fields");
});

test("terminal catalog rejects unknown builders, duplicate builder use and boundary drift", () => {
  const base = JSON.parse(readFileSync(SHIPPED_CATALOG_PATH, "utf8"));
  const unknown = structuredClone(base);
  unknown.entries[0].builderId = "unknown-builder";
  assert.equal(validateHumanTerminalActionCatalog(unknown).findings.some((finding) => finding.includes("UNKNOWN-BUILDER")), true);

  const duplicate = structuredClone(base);
  const second = structuredClone(duplicate.entries[0]);
  second.id = "second-push-template";
  second.inventoryId = "second-push-inventory";
  second.templateId = "second-push-template";
  duplicate.entries.push(second);
  assert.equal(validateHumanTerminalActionCatalog(duplicate).findings.some((finding) => finding.includes("DUPLICATE-BUILDER-ID")), true);

  const drifted = structuredClone(base);
  drifted.entries[0].boundary = {
    executionBoundary: "attended-external-terminal",
    invocation: "user-copy-only",
    codexToolCallPermitted: false,
  };
  assert.equal(validateHumanTerminalActionCatalog(drifted).findings.some((finding) => finding.includes("BOUNDARY-DRIFT")), true);
  assert.throws(() => buildRegisteredHumanTerminalAction("not-registered", {}), /HTA-BUILDER-UNKNOWN/u);
});

test("terminal catalog JSON schema and runtime validator close every structural object", () => {
  const schema = JSON.parse(readFileSync(
    new URL("../../plugins/pipeline-core/schemas/human-terminal-action-catalog.schema.json", import.meta.url),
    "utf8",
  ));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.entry.additionalProperties, false);
  assert.equal(schema.$defs.boundary.additionalProperties, false);
  assert.equal(schema.$defs.slot.additionalProperties, false);
  assert.equal(schema.$defs.readback.additionalProperties, false);
  const designedFields = [
    "id", "inventoryId", "revision", "purpose", "audience", "disposition", "templateId", "builderId",
    "producerRefs", "boundary", "mutation", "requiresPoApproval", "slots", "expectedReadback", "runners", "platforms",
  ];
  assert.deepEqual([...schema.$defs.entry.required].sort(), designedFields.sort());
  const catalog = JSON.parse(readFileSync(SHIPPED_CATALOG_PATH, "utf8"));
  assert.deepEqual(Object.keys(catalog.entries[0]).sort(), designedFields.sort());
  catalog.entries[0].unexpected = true;
  assert.equal(validateHumanTerminalActionCatalog(catalog).valid, false);
  assert.throws(() => parseHumanTerminalActionCatalog(JSON.stringify(catalog)), /closed entry fields required/u);
});

test("published registered/inactive schema branches and runtime reject the same contract-field mismatches", () => {
  const schema = JSON.parse(readFileSync(
    new URL("../../plugins/pipeline-core/schemas/human-terminal-action-catalog.schema.json", import.meta.url),
    "utf8",
  ));
  const conditional = schema.$defs.entry.allOf[0];
  const inactiveFields = [
    "templateId", "builderId", "boundary", "mutation", "requiresPoApproval", "slots", "expectedReadback", "runners", "platforms",
  ];
  for (const field of inactiveFields) assert.equal(conditional.else.properties[field].type, "null", field);
  for (const field of ["templateId", "builderId", "mutation", "requiresPoApproval", "slots", "expectedReadback", "runners", "platforms"]) {
    assert.notEqual(conditional.then.properties[field].type, "null", field);
  }

  const base = JSON.parse(readFileSync(SHIPPED_CATALOG_PATH, "utf8"));
  const inactiveValues = {
    templateId: "should-not-exist",
    builderId: "authorize-critical-push",
    boundary: { executionBoundary: "external-terminal", invocation: "user-copy-only", codexToolCallPermitted: false },
    mutation: false,
    requiresPoApproval: false,
    slots: [],
    expectedReadback: { schema: null, code: "READY", command: "verify-critical" },
    runners: ["codex"],
    platforms: ["posix"],
  };
  for (const [field, value] of Object.entries(inactiveValues)) {
    const changed = structuredClone(base);
    changed.entries[1][field] = value;
    assert.equal(validateHumanTerminalActionCatalog(changed).valid, false, field);
  }

  for (const field of ["templateId", "builderId", "mutation", "requiresPoApproval", "slots", "expectedReadback", "runners", "platforms"]) {
    const changed = structuredClone(base);
    changed.entries[0][field] = null;
    assert.equal(validateHumanTerminalActionCatalog(changed).valid, false, field);
  }
});
