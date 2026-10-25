// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import { parseArchitectureDesign } from "./architecture-design.mjs";
import { renderArchitectureDesignSkeleton, renderDesignTraceabilitySkeleton, hasGeneratedCriterionPlaceholder, stagingDesignNeedsAuthoring, compactActionReadback } from "./design-authoring.mjs";
import { createHash } from "node:crypto";
import { inspectSpecCriterionRows, parseAcceptedCriticCriterion, scanAcceptedCriterionRows } from "./critic-accepted-contract.mjs";
import { devNull } from "node:os";
const completionCases = [];
function test(name, optionsOrRun, possibleRun) {
  const options = typeof optionsOrRun === "function" ? {} : optionsOrRun ?? {};
  const run = typeof optionsOrRun === "function" ? optionsOrRun : possibleRun;
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  const entry = { id: "DAU" + String(completionCases.length + 1).padStart(3, "0"), name, run };
  if (options.skip === true) entry.mode = "skip";
  completionCases.push(entry);
}

test("authoring skeleton uses the actual architecture contract and remains visibly draft", () => {
  const text = renderArchitectureDesignSkeleton();
  assert.match(text, /DRAFT TEMPLATE/u);
  assert.throws(() => parseArchitectureDesign(text), /ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE/u);
  const authored = text.replace(/^<!-- DRAFT TEMPLATE:[^\n]*-->\n/u, "").replace(/REPLACE: /gu, "Authored: ");
  const parsed = parseArchitectureDesign(authored);
  assert.equal(parsed.modules[0].id, "application");
  assert.deepEqual(parsed.baseline.acceptedViolations, []);
  assert.deepEqual(parsed.modules[0].verificationEntryPoints, ["tests/application.test.mjs"]);
  assert.match(parsed.disposition.rationale, /Authored/u);
  assert.match(renderDesignTraceabilitySkeleton(), /WHEN <trigger>.*SHALL/u);
});
test("compact readback retains executable recovery and digests without copying design contents", () => {
  const action = { kind: "command", argv: ["inspect"] };
  const result = compactActionReadback({schema:"example.v1",status:"pending",nextAction:action,
    intentSha256:"a".repeat(64),requestPath:"scratch/request.json",designInput:"x".repeat(50000),plan:{designInput:"private"}});
  assert.equal(result.nextAction, action);
  assert.equal(result.intentSha256, "a".repeat(64));
  assert.equal(result.requestPath, "scratch/request.json");
  assert.equal(Object.hasOwn(result,"designInput"), false);
  assert.equal(Object.hasOwn(result,"plan"), false);
});

test("generated criterion uses the accepted parser shape while draft and legacy ids remain unapproved", () => {
  const draft = renderDesignTraceabilitySkeleton();
  assert.equal(hasGeneratedCriterionPlaceholder(draft), true);
  assert.equal(hasGeneratedCriterionPlaceholder("## Acceptance criteria\n- AC-01: WHEN <trigger>, the system SHALL <observable result>.\n"), true);
  assert.equal(hasGeneratedCriterionPlaceholder("## Notes\n\nThe example says WHEN <trigger>, the system SHALL <observable result>.\n"), false);
  assert.equal(hasGeneratedCriterionPlaceholder("## Acceptance criteria\n\n> - AC-01: WHEN <trigger>, the system SHALL <observable result>.\n"), false);
  assert.equal(hasGeneratedCriterionPlaceholder("## Notes\n\n| AC-1 | WHEN <trigger>, the system SHALL <observable result>. | quoted example |\n"), false);
  for (const heading of ["## Acceptance requirements — project", "## Abnahmeanforderungen"]) {
    const variant = draft.replace("## Acceptance criteria", heading);
    assert.deepEqual(scanAcceptedCriterionRows(variant).filter(row => row.normative).map(row => row.id), ["AC-1"]);
    assert.equal(hasGeneratedCriterionPlaceholder(variant), true, heading);
  }
  const nested = draft.replace("## Acceptance criteria\n", "## Acceptance criteria\n\n### Delivery flow\n");
  assert.deepEqual(scanAcceptedCriterionRows(nested).filter(row => row.normative).map(row => row.id), ["AC-1"]);
  assert.equal(hasGeneratedCriterionPlaceholder(nested), true);
  const excluded = draft.replace("## Acceptance criteria\n", "## Acceptance criteria\n\n### Notes\n");
  assert.deepEqual(scanAcceptedCriterionRows(excluded).filter(row => row.normative).map(row => row.id), []);
  assert.equal(hasGeneratedCriterionPlaceholder(excluded), false);
  const legacyNested = "## Acceptance requirements — project\n\n### Delivery flow\n- AC-01: WHEN <trigger>, the system SHALL <observable result>.\n";
  assert.equal(hasGeneratedCriterionPlaceholder(legacyNested), true);
  assert.deepEqual(inspectSpecCriterionRows(draft), { ok: true, located: ["AC-1"] });
  const rows = scanAcceptedCriterionRows(draft).filter(row => row.normative);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "AC-1");
  assert.equal(rows[0].text, "WHEN <trigger>, the system SHALL <observable result>.");
  const malformed = draft.replace("| AC-1 |", "| AC-01 |");
  assert.equal(inspectSpecCriterionRows(malformed).code, "CAC-CRITERION-UNSUPPORTED");
  assert.match(inspectSpecCriterionRows(malformed).message, /\| # \| Criterion \| Evidence \|.*\| AC-1 \| WHEN/u);
  const badHeader = draft.replace("| # | Criterion | Evidence |", "| ID | Criterion | Evidence |");
  assert.equal(inspectSpecCriterionRows(badHeader).code, "CAC-CRITERION-UNSUPPORTED");

  const authored = draft.replace("WHEN <trigger>, the system SHALL <observable result>.",
    "The package must receive a PASS verdict from an independent Critic before acceptance.")
    .replaceAll("REPLACE: ", "Authored: ");
  assert.equal(hasGeneratedCriterionPlaceholder(authored), false);
  assert.deepEqual(inspectSpecCriterionRows(authored), { ok: true, located: ["AC-1"] });
  const row = scanAcceptedCriterionRows(authored).find(item => item.id === "AC-1");
  const bytes = Buffer.from(authored);
  const hash = value => createHash("sha256").update(value).digest("hex");
  const sourcePath = "specs/synthetic/spec.md";
  const sourceSha256 = hash(bytes);
  const result = parseAcceptedCriticCriterion({ sourceBytes: bytes,
    locator: { schema: "pipeline.critic-criterion-locator.v1", sourcePath, sourceSha256, criterionId: "AC-1",
      startByte: row.startByte, endByte: row.endByte, excerptSha256: hash(bytes.subarray(row.startByte, row.endByte)) },
    packageContext: { featureId: "synthetic", sourceBindings: [{ path: sourcePath, sha256: sourceSha256, role: "spec" }] } });
  assert.equal(result.status, "explicit-actual-independent-pass");
});

test("staging authoring distinguishes generated placeholders from reviewed source", () => {
  assert.equal(stagingDesignNeedsAuthoring(renderArchitectureDesignSkeleton(), renderDesignTraceabilitySkeleton()), true);
  assert.equal(stagingDesignNeedsAuthoring("# Product brief\nReviewed goals.\n", "## Acceptance criteria\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | WHEN submitted, the system SHALL retain sources. | tests/submission.test.mjs |\n"), false);
});

if (completionCases.length !== 4) throw new Error("case completion count drift: expected 4, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
