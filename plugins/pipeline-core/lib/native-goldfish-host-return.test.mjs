// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { createHash } from "node:crypto";
import { mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { NATIVE_GOLDFISH_BRIEFING_SCHEMA, NATIVE_GOLDFISH_CODEX_BRIEFING_SCHEMA, NATIVE_GOLDFISH_RETURN_SCHEMA,
  NATIVE_GOLDFISH_HOST_DIRECTIVE, observeClaudeGoldfishReturn, observeCodexGoldfishReturn, parseNativeGoldfishBriefing,
  validateNativeGoldfishFinal, validateItemDeliveryBriefing } from "./native-goldfish-host-return.mjs";

const SHA = (text) => createHash("sha256").update(text).digest("hex");
const binding = { schema: NATIVE_GOLDFISH_BRIEFING_SCHEMA, dispatchId: "NATIVE-RETURN-1",
  candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40),
  runner: "claude",
  role: "pipeline-core:goldfish-implementor", agentType: "goldfish-implementor",
  model: "claude-sonnet-5", effort: "medium", rulesetSha: "c".repeat(64),
  allowedPaths: ["src/change.mjs"],
  criticDecision: { schema: "pipeline.critic-required-decision.v1",
    trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
      diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" } };
const final = { schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: binding.dispatchId,
  candidateCommit: binding.candidateCommit, outcome: "succeeded", report: "Implemented and verified.",
  changedPaths: ["src/change.mjs"] };
const finalText = JSON.stringify(final);
const claudePending = { runner: "claude", sessionId: "session-1", toolUseId: "tool-use-1", binding };
const codexBinding = { ...binding, runner: "codex" };
const { agentType: _legacyAgentType, ...bindingWithoutNativeAlias } = binding;
const codexWorkerBinding = { ...bindingWithoutNativeAlias, schema: NATIVE_GOLDFISH_CODEX_BRIEFING_SCHEMA, runner: "codex",
  nativeAgentType: "worker" };
const codexPending = { runner: "codex", sessionId: "session-1", agentId: "agent-1", binding: codexBinding };

const cases = [
  ["NGHR01 parses one closed host briefing binding and rejects duplicate markers", () => {
    const prompt = `briefing\n<!-- pipeline-native-goldfish-host-commit:v1\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nrest`;
    assert.deepEqual(parseNativeGoldfishBriefing(prompt), { ok: true, code: "NGHR-BRIEFING-VALID", binding });
    assert.equal(parseNativeGoldfishBriefing(`${prompt}\n${prompt}`).code, "NGHR-BRIEFING-MARKER");
  }],
  ["NGHR02 rejects malformed runner, model, candidate, scope and duplicate-key briefing metadata", () => {
    for (const change of [
      { role: "pipeline-core:critic" }, { agentType: "goldfish-mechanic" },
      { model: "" }, { candidateTree: "bad" }, { allowedPaths: ["../outside"] },
      { allowedPaths: ["src/change.mjs", "src/change.mjs"] },
    ]) {
      const prompt = `<!-- pipeline-native-goldfish-host-commit:v1\n${JSON.stringify({ ...binding, ...change })}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
      assert.equal(parseNativeGoldfishBriefing(prompt).ok, false);
    }
    assert.equal(parseNativeGoldfishBriefing(`<!-- pipeline-native-goldfish-host-commit:v1\n{"schema":"${binding.schema}","schema":"forged"}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`).code, "NGHR-BRIEFING-JSON");
  }],
  ["NGHR03 admits only one successful JSON return bound to dispatch, candidate and allowed paths", () => {
    const admitted = validateNativeGoldfishFinal(finalText, { binding });
    assert.equal(admitted.ok, true, admitted.code);
    assert.equal(admitted.final.reportSha256, SHA(final.report));
    for (const change of [
      { dispatchId: "OTHER" }, { candidateCommit: "d".repeat(40) },
      { outcome: "blocked", changedPaths: [] }, { changedPaths: ["src/change.mjs", "outside.txt"] },
      { changedPaths: ["../outside"] }, { extra: true },
    ]) assert.equal(validateNativeGoldfishFinal(JSON.stringify({ ...final, ...change }), { binding }).ok, false);
    assert.equal(validateNativeGoldfishFinal(`\`${finalText}\``, { binding }).code, "NGHR-FINAL-JSON");
    assert.equal(validateNativeGoldfishFinal(`{"schema":"${final.schema}","schema":"forged"}`, { binding }).code, "NGHR-FINAL-JSON");
    // Candidate 21b (Claude greenfield): one fence around the whole message is the same return; prose, a second block or a broken fence still fail closed.
    const plain = validateNativeGoldfishFinal(finalText, { binding });
    for (const wrapped of [`\`\`\`json\n${finalText}\n\`\`\``, `\`\`\`\n${finalText}\n\`\`\`\n`, `\n\`\`\`json\r\n${finalText}\r\n\`\`\`  \n`]) {
      const admitted = validateNativeGoldfishFinal(wrapped, { binding });
      assert.equal(admitted.ok, true, admitted.code);
      assert.equal(admitted.final.resultSha256, plain.final.resultSha256, "the fence changes nothing about the bound result");
      assert.equal(admitted.final.reportSha256, plain.final.reportSha256);
    }
    for (const refused of [
      `Here is the result:\n\`\`\`json\n${finalText}\n\`\`\``,
      `\`\`\`json\n${finalText}\n\`\`\`\nDone.`,
      `\`\`\`json\n${finalText}\n\`\`\`\n\`\`\`json\n${finalText}\n\`\`\``,
      `\`\`\`json\n${finalText}`,
      `\`\`\`json ${finalText} \`\`\``,
      `\`\`\`js\n${finalText}\n\`\`\``,
    ]) assert.equal(validateNativeGoldfishFinal(refused, { binding }).code, "NGHR-FINAL-JSON", refused.slice(0, 40));
    const fencedOther = validateNativeGoldfishFinal(`\`\`\`json\n${JSON.stringify({ ...final, dispatchId: "OTHER" })}\n\`\`\``, { binding });
    assert.equal(fencedOther.ok, false, "the binding is checked on the unwrapped object exactly as on a plain one");
  }],
  ["NGHR04 Claude Task/Agent return requires exact tool/session correlation, successful completion and stable resolved model", () => {
    const input = { hook_event_name: "PostToolUse", tool_name: "Task", tool_use_id: "tool-use-1",
      session_id: "session-1", tool_response: { status: "completed", resolvedModel: binding.model,
        modelsUsed: [binding.model], content: [{ type: "text", text: finalText }] } };
    const observed = observeClaudeGoldfishReturn(input, claudePending);
    assert.equal(observed.ok, true, observed.code);
    assert.equal(observed.runner, "claude");
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_name: "Agent" }, claudePending).ok, true);
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_use_id: "other" }, claudePending).ok, false);
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_response: { ...input.tool_response, resolvedModel: "other-model" } }, claudePending).code, "NGHR-CLAUDE-RETURN-MODEL");
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_response: { ...input.tool_response, modelsUsed: [binding.model, "other-model"] } }, claudePending).code, "NGHR-CLAUDE-MODEL-SWITCH");
    assert.equal(observeClaudeGoldfishReturn({ ...input, tool_response: { ...input.tool_response, status: "error" } }, claudePending).ok, false);
  }],
  ["NGHR05 Codex return requires the exact prior start-stop agent and session binding", () => {
    const input = { hook_event_name: "SubagentStop", session_id: "session-1", agent_id: "agent-1",
      agent_type: codexBinding.agentType, model: codexBinding.model, last_assistant_message: finalText };
    const observed = observeCodexGoldfishReturn(input, codexPending);
    assert.equal(observed.ok, true, observed.code);
    assert.equal(observed.assurance, "host-observed-subagent-start-stop-and-session-route");
    assert.equal(observeCodexGoldfishReturn({ ...input, agent_id: "other" }, codexPending).ok, false);
    assert.equal(observeCodexGoldfishReturn({ ...input, session_id: "other" }, codexPending).ok, false);
    assert.equal(observeCodexGoldfishReturn({ ...input, agent_type: "critic" }, codexPending).ok, false);
    assert.equal(observeCodexGoldfishReturn({ ...input, model: "other-model" }, codexPending).ok, false);
    assert.equal(observeCodexGoldfishReturn({ ...input, last_assistant_message: "partial" }, codexPending).ok, false);
  }],
  ["NGHR06 item delivery briefing admits .test.js check files next to .test.mjs and .test.cjs, nothing else", () => {
    const locator = { schema: "pipeline.critic-criterion-locator.v1", sourcePath: "specs/unit/spec.md", sourceSha256: "a".repeat(64),
      criterionId: "AC-1", startByte: 10, endByte: 20, excerptSha256: "b".repeat(64) };
    const briefing = path => ({ schema: "pipeline.item-delivery-briefing.v1", sliceId: "ITEM-AC-1", itemId: "AC-1", criterionLocator: locator,
      checks: [{ id: "check-one", path, dependencies: ["src/change.js", path] }] });
    for (const path of ["src/change.test.mjs", "src/change.test.cjs", "src/change.test.js"])
      assert.equal(validateItemDeliveryBriefing(briefing(path)).ok, true, path);
    for (const path of ["src/change.test.ts", "src/change.js", "src/change.test.json"])
      assert.equal(validateItemDeliveryBriefing(briefing(path)).code, "NGHR-ITEM-DELIVERY-SHAPE", path);
  }],
  ["NGHR07 D31: a checkpoint return validates only where the caller allows it, with the same binding rules", () => {
    const checkpointText = JSON.stringify({ ...final, outcome: "checkpoint", report: "Budget stop; continuation card follows." });
    const admitted = validateNativeGoldfishFinal(checkpointText, { binding, allowCheckpoint: true });
    assert.equal(admitted.ok, true, admitted.code);
    assert.equal(admitted.final.outcome, "checkpoint");
    assert.equal(admitted.final.reportSha256, SHA("Budget stop; continuation card follows."));
    // The default route (foreground PostToolUse, Codex) still admits only a success.
    assert.equal(validateNativeGoldfishFinal(checkpointText, { binding }).code, "NGHR-FINAL-SHAPE");
    // Every other field is bound exactly as for a success.
    for (const change of [{ dispatchId: "OTHER" }, { candidateCommit: "d".repeat(40) }, { changedPaths: ["outside.txt"] }, { extra: true }])
      assert.equal(validateNativeGoldfishFinal(JSON.stringify({ ...JSON.parse(checkpointText), ...change }), { binding, allowCheckpoint: true }).ok, false);
  }],
  ["NGHR08 D31: an unknown outcome is refused with the same code even where checkpoints are allowed", () => {
    for (const outcome of ["blocked", "failed", "Checkpoint", ""])
      assert.equal(validateNativeGoldfishFinal(JSON.stringify({ ...final, outcome }), { binding, allowCheckpoint: true }).code, "NGHR-FINAL-SHAPE", outcome);
    assert.equal(validateNativeGoldfishFinal(finalText, { binding, allowCheckpoint: true }).final.outcome, "succeeded");
  }],
  ["NGHR09 D195: the item delivery briefing admits the additive command form {id,path,command,dependencies}; the .test form is unchanged", () => {
    const locator = { schema: "pipeline.critic-criterion-locator.v1", sourcePath: "specs/unit/spec.md", sourceSha256: "a".repeat(64),
      criterionId: "AC-1", startByte: 10, endByte: 20, excerptSha256: "b".repeat(64) };
    const briefing = check => ({ schema: "pipeline.item-delivery-briefing.v1", sliceId: "ITEM-AC-1", itemId: "AC-1", criterionLocator: locator, checks: [check] });
    const good = { id: "check-one", path: "project/pipeline.json", command: "make-check", dependencies: ["src/change.js", "project/pipeline.json"] };
    assert.equal(validateItemDeliveryBriefing(briefing(good)).ok, true);
    for (const bad of [{ ...good, command: "bad id" }, { ...good, command: "" }, { ...good, command: "-x" }, { ...good, command: 7 },
      { id: good.id, command: good.command, dependencies: good.dependencies }, { ...good, path: "/abs/project/pipeline.json" },
      { ...good, dependencies: ["src/change.js"] }, { ...good, extra: true }])
      assert.equal(validateItemDeliveryBriefing(briefing(bad)).code, "NGHR-ITEM-DELIVERY-SHAPE", JSON.stringify(bad));
    // The 3-key form still demands a .test file, with or without a command-looking path.
    assert.equal(validateItemDeliveryBriefing(briefing({ id: "check-one", path: "project/pipeline.json", dependencies: ["project/pipeline.json"] })).code, "NGHR-ITEM-DELIVERY-SHAPE");
    assert.equal(validateItemDeliveryBriefing(briefing({ id: "check-one", path: "src/change.test.mjs", dependencies: ["src/change.test.mjs"] })).ok, true);
  }],
  ["NGHR10 AC-164: NGHR-FINAL-SHAPE names which sub-condition fired in a bounded detail, keeping the code unchanged", () => {
    const two = { ...binding, allowedPaths: ["src/a.mjs", "src/b.mjs"] };
    const run = (change, options = { binding }) => validateNativeGoldfishFinal(JSON.stringify({ ...final, ...change }), options);
    const cases10 = [
      [{ schema: "x" }, "schema"], [{ dispatchId: "OTHER" }, "dispatch-id"], [{ candidateCommit: "d".repeat(40) }, "candidate-commit"],
      [{ outcome: "blocked" }, "outcome"], [{ outcome: "checkpoint" }, "outcome"], [{ report: "  " }, "report-empty"],
      [{ report: 5 }, "report-type"], [{ report: "x".repeat(1024 * 1024 + 1) }, "report-oversize"],
      [{ changedPaths: "src/change.mjs" }, "changed-paths-type"], [{ changedPaths: [] }, "changed-paths-empty"],
      [{ changedPaths: Array.from({ length: 65 }, (_, i) => `src/f${i}.mjs`) }, "changed-paths-too-many"],
      [{ changedPaths: ["../outside"] }, "path-not-normalized"], [{ changedPaths: ["src/change.mjs", "src/change.mjs"] }, "paths-duplicate"],
      [{ changedPaths: ["outside.txt"] }, "path-outside-allowed"], [{ extra: true }, "fields"],
    ];
    for (const [change, condition] of cases10) {
      const result = run(change);
      assert.equal(result.code, "NGHR-FINAL-SHAPE", condition);
      assert.equal(result.detail?.condition, condition, JSON.stringify(result));
    }
    assert.equal(run({ changedPaths: ["src/b.mjs", "src/a.mjs"] }, { binding: two }).detail?.condition, "paths-unsorted");
    // Which paths: only repository-relative ones, at most 5, and a path that is not normalized is never echoed.
    const outside = Array.from({ length: 7 }, (_, i) => `out/f${i}.txt`).sort();
    const named = run({ changedPaths: outside });
    assert.deepEqual(named.detail.paths, outside.slice(0, 5));
    const absolute = run({ changedPaths: ["/home/someone/secret.txt"] });
    assert.equal(absolute.detail.condition, "path-not-normalized");
    assert.equal(JSON.stringify(absolute).includes("/home/someone"), false);
    // The checkpoint outcome is an outcome failure only where it is not allowed.
    assert.equal(run({ outcome: "checkpoint" }, { binding, allowCheckpoint: true }).ok, true);
  }],
  ["NGHR11 AC-239: the return admits one optional closed testFirst block; every other shape is refused as NGHR-FINAL-SHAPE naming the field", () => {
    const red = { command: "node --test src/change.test.mjs", exitCode: 1, evidencePath: "evidence/red-run.txt" };
    const good = { red: [red], greenCommand: "node --test src/change.test.mjs" };
    const run = (testFirst) => validateNativeGoldfishFinal(JSON.stringify({ ...final, testFirst }), { binding });
    const admitted = run(good);
    assert.equal(admitted.ok, true, admitted.code);
    assert.deepEqual(admitted.final.testFirst, good);
    // The result digest stays the digest of the return without the block (the observation receipt re-derives it from the record).
    assert.equal(admitted.final.resultSha256, validateNativeGoldfishFinal(finalText, { binding }).final.resultSha256);
    // A return without the key is unchanged: no testFirst on the validated final.
    assert.equal(Object.hasOwn(validateNativeGoldfishFinal(finalText, { binding }).final, "testFirst"), false);
    assert.equal(run({ ...good, red: [red, { ...red, exitCode: -1 }] }).ok, true);
    const refused = [
      [{ ...good, red: [{ ...red, exitCode: 0 }] }, "test-first-red-exit-code"],
      [{ ...good, red: [{ ...red, exitCode: "1" }] }, "test-first-red-exit-code"],
      [{ ...good, red: [] }, "test-first-red-empty"],
      [{ ...good, red: "x" }, "test-first-red-type"],
      [{ ...good, extra: true }, "test-first-fields"],
      [{ red: good.red }, "test-first-fields"],
      [{ ...good, red: [{ ...red, extra: 1 }] }, "test-first-red-fields"],
      [{ ...good, red: [{ ...red, command: "" }] }, "test-first-red-command"],
      [{ ...good, red: [{ ...red, command: "x".repeat(501) }] }, "test-first-red-command"],
      [{ ...good, red: [{ ...red, evidencePath: "/abs/out.txt" }] }, "test-first-red-evidence-path"],
      [{ ...good, red: [{ ...red, evidencePath: "../out.txt" }] }, "test-first-red-evidence-path"],
      [{ ...good, greenCommand: "" }, "test-first-green-command"],
      [{ ...good, greenCommand: 5 }, "test-first-green-command"],
      [null, "test-first-type"], [[], "test-first-type"],
    ];
    for (const [testFirst, condition] of refused) {
      const result = run(testFirst);
      assert.equal(result.code, "NGHR-FINAL-SHAPE", condition);
      assert.equal(result.detail?.condition, condition, JSON.stringify(result));
    }
  }],
  ["NGHR12 C23 (AC-108): a return that is not JSON keeps NGHR-FINAL-JSON and names where the text stopped being JSON, never echoing the text", () => {
    // A valid return cut directly after the report value: no changedPaths, no closing brace (the live failure shape).
    const cut = finalText.slice(0, finalText.indexOf(",\"changedPaths\""));
    const truncated = validateNativeGoldfishFinal(cut, { binding, allowCheckpoint: true });
    assert.equal(truncated.ok, false);
    assert.equal(truncated.code, "NGHR-FINAL-JSON");
    assert.equal(truncated.detail?.condition, "json-truncated", JSON.stringify(truncated));
    assert.equal(truncated.detail.errorMessage, `parse failed at position ${cut.length} of ${cut.length} characters`);
    assert.equal(JSON.stringify(truncated).includes(final.report), false, "the message text never travels in the detail");
    // The same cut inside one whole-message fence: the position is that of the unwrapped text, which is what was parsed.
    const fenced = validateNativeGoldfishFinal(`\`\`\`json\n${cut}\n\`\`\``, { binding });
    assert.equal(fenced.detail?.condition, "json-truncated");
    assert.equal(fenced.detail.errorMessage, `parse failed at position ${cut.length} of ${cut.length} characters`);
    // A syntax error before the end is a syntax error, with its own position; prose has no usable position and says only that.
    const broken = finalText.replace("\"outcome\":", "\"outcome\" ");
    const syntax = validateNativeGoldfishFinal(broken, { binding });
    assert.equal(syntax.code, "NGHR-FINAL-JSON");
    assert.equal(syntax.detail?.condition, "json-syntax", JSON.stringify(syntax));
    assert.match(syntax.detail.errorMessage, new RegExp(`^parse failed at position \\d+ of ${broken.length} characters$`, "u"));
    const prose = validateNativeGoldfishFinal("All done, no JSON here.", { binding });
    assert.equal(prose.code, "NGHR-FINAL-JSON");
    assert.equal(prose.detail?.condition, "json-syntax");
    assert.equal(JSON.stringify(prose).includes("All done"), false);
    // A duplicate key and a text the strict parser refuses although native JSON accepts it are told apart.
    assert.equal(validateNativeGoldfishFinal(`{"schema":"${final.schema}","schema":"forged"}`, { binding }).detail?.condition, "json-duplicate-key");
    assert.equal(validateNativeGoldfishFinal(finalText.replace("Implemented and verified.", "lone\\ud800surrogate"), { binding }).detail?.condition, "json-not-strict");
    // A return that parses never carries a JSON detail, and an empty text is still the input refusal.
    assert.equal(validateNativeGoldfishFinal(finalText, { binding }).ok, true);
    assert.equal(validateNativeGoldfishFinal("", { binding }).code, "NGHR-FINAL-INPUT");
  }],
  ["NGHR13 C23 (AC-108): a wrong field set names the missing and the unexpected keys, bounded; every other shape condition is unchanged", () => {
    const { changedPaths, ...withoutPaths } = final;
    const misspelled = validateNativeGoldfishFinal(JSON.stringify({ ...withoutPaths, changedPath: changedPaths }), { binding });
    assert.equal(misspelled.code, "NGHR-FINAL-SHAPE");
    assert.equal(misspelled.detail.condition, "fields");
    assert.deepEqual(misspelled.detail.missingKeys, ["changedPaths"]);
    assert.deepEqual(misspelled.detail.unexpectedKeys, ["changedPath"]);
    const cutKeys = validateNativeGoldfishFinal(JSON.stringify(withoutPaths), { binding });
    assert.deepEqual(cutKeys.detail, { condition: "fields", missingKeys: ["changedPaths"] });
    const many = validateNativeGoldfishFinal(JSON.stringify({ ...final, k1: 1, k2: 2, k3: 3, k4: 4, k5: 5, k6: 6, k7: 7 }), { binding });
    assert.equal(many.detail.unexpectedKeys.length, 5, "at most 5 keys are named");
    // A JSON value that is no object has no keys to name.
    assert.deepEqual(validateNativeGoldfishFinal("[1]", { binding }).detail, { condition: "fields" });
    assert.deepEqual(validateNativeGoldfishFinal(JSON.stringify({ ...final, dispatchId: "OTHER" }), { binding }).detail, { condition: "dispatch-id" });
  }],
  ["NGHR14 C23: the Agent tool carries only a family alias, so a model of the configured family satisfies the binding and another family does not", () => {
    const familyBinding = (model) => ({ ...claudePending, binding: { ...claudePending.binding, model } });
    const input = (resolvedModel, modelsUsed = [resolvedModel]) => ({ hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: "tool-use-1",
      session_id: "session-1", tool_response: { status: "completed", resolvedModel, modelsUsed, content: [{ type: "text", text: finalText }] } });
    const aliasBound = observeClaudeGoldfishReturn(input("claude-sonnet-5-5"), familyBinding("sonnet"));
    assert.equal(aliasBound.ok, true, aliasBound.code);
    assert.equal(aliasBound.resolvedModelDiffers, "claude-sonnet-5-5", "what really ran is reported, never overwritten by the configured value");
    const idBound = observeClaudeGoldfishReturn(input("claude-sonnet-5-5"), familyBinding("claude-sonnet-5-0"));
    assert.equal(idBound.ok, true, idBound.code);
    assert.equal(Object.hasOwn(observeClaudeGoldfishReturn(input("claude-sonnet-5-5"), familyBinding("claude-sonnet-5-5")), "resolvedModelDiffers"), false);
    assert.equal(observeClaudeGoldfishReturn(input("claude-opus-5-5"), familyBinding("sonnet")).code, "NGHR-CLAUDE-RETURN-MODEL");
    assert.equal(observeClaudeGoldfishReturn(input("claude-sonnet-5-5", ["claude-sonnet-5-5", "claude-opus-5-5"]), familyBinding("sonnet")).code, "NGHR-CLAUDE-MODEL-SWITCH");
    assert.equal(observeClaudeGoldfishReturn(input("claude-sonnet-5-5"), familyBinding("no-family-model")).code, "NGHR-CLAUDE-RETURN-MODEL", "a value with no family has only the exact comparison");
  }],
];

const temp = mkdtempSync(join(tmpdir(), "native-goldfish-host-return-"));
try {
  for (const [name, run] of cases) {
    try { run(); process.stdout.write(`✔ ${name}\n`); }
    catch (error) { process.stdout.write(`✖ ${name}\n`); throw error; }
  }
} finally { rmSync(temp, { recursive: true, force: true }); }

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases.map(([name, run]) => ({ id: name.slice(0, 6), name: name.slice(7), run })),
  fd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
