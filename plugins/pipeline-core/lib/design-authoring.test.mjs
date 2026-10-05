// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import { parseArchitectureDesign } from "./architecture-design.mjs";
import { renderArchitectureDesignSkeleton, renderDesignTraceabilitySkeleton, compactActionReadback } from "./design-authoring.mjs";
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

if (completionCases.length !== 2) throw new Error("case completion count drift: expected 2, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
