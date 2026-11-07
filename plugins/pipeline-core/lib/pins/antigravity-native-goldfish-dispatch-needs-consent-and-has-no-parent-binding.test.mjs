// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.antigravity-native-goldfish-dispatch (AC-108, candidate 20 finding G20-8 B and G20-22).
// An Antigravity-hosted Elephant dispatches goldfish-implementor / -mechanic / -deep through the host's native `invoke_subagent` like a
// Claude Elephant does through the Agent tool: no per-dispatch PO consent, the child's hook calls bound to the parent through the
// host-written descriptor, the child's RESOLVED model checked, one code-writing child alive at a time.
//
// Every payload below replays the shape MEASURED on a real Antigravity host (specs/sprint-alfred-epic/evidence/held-patches/
// w252-agy-native-subagent-measurement.md): flat invoke_subagent args (no Subagents array), args that may be JSON-string-encoded, the
// eight-key hook payload, no parent field, and the descriptor <brain>/<parentId>/.system_generated/subagents/<childId>.json.
// No model is called and no agy process is started.
//
// Before the change: the guard refused every native goldfish call without a signed consent (AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE),
// had no module reading the descriptor, no resolved-model check and no code-writer serialization, and did not decode a quoted Model.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { normalizeAntigravityToolInput } from "../../hooks/antigravity-pretool-guard.mjs";
import { registeredFunctionalTaskRoutes } from "../model-role-route-source.mjs";

const libDir = dirname(dirname(fileURLToPath(import.meta.url)));
const adapter = join(libDir, "..", "hooks", "antigravity-pretool-guard.mjs");
const loadModule = () => import("../agy-native-goldfish.mjs");

const PARENT = "11111111-aaaa-4aaa-8aaa-000000000001";
const CHILD = "22222222-bbbb-4bbb-8bbb-000000000002";
const OTHER_CHILD = "33333333-cccc-4ccc-8ccc-000000000003";

function brainFixture() {
  const base = mkdtempSync(join(tmpdir(), "agy-native-goldfish-"));
  const brain = join(base, "brain");
  const workspace = join(base, "workspace");
  mkdirSync(join(brain, PARENT, ".system_generated", "subagents"), { recursive: true });
  mkdirSync(join(brain, CHILD), { recursive: true });
  mkdirSync(join(workspace, ".agent-pipeline"), { recursive: true });
  mkdirSync(join(workspace, ".claude"), { recursive: true });
  writeFileSync(join(workspace, ".claude", "pipeline.json"), JSON.stringify({ project: "test", verify: "node verify.mjs" }));
  writeFileSync(join(workspace, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: "2026-10-02T00:00:00.000Z",
  }));
  return { base, brain, workspace };
}

function descriptor(fx, childId, typeName, state = "SUBAGENT_STATE_ALIVE", parent = PARENT) {
  mkdirSync(join(fx.brain, parent, ".system_generated", "subagents"), { recursive: true });
  writeFileSync(join(fx.brain, parent, ".system_generated", "subagents", `${childId}.json`), JSON.stringify({
    conversationId: childId,
    subagentDescriptor: { typeName, role: "Goldfish" },
    state,
    spawnStepIndex: 7,
    workspaceUris: [`file://${fx.workspace}`],
  }));
}

// The eight measured keys and nothing else.
function payload(fx, { conversationId, toolCall, modelName = "parent-model", lastUserInput = "do it" }) {
  return {
    artifactDirectoryPath: join(fx.brain, conversationId),
    conversationId,
    lastUserInput,
    modelName,
    stepIdx: 12,
    toolCall,
    transcriptPath: join(fx.brain, conversationId, "transcript.jsonl"),
    workspacePaths: [fx.workspace],
  };
}

// Flat args; Model is the JSON-STRING-encoded value the greenfield transcript shows ("flash" with its quotes).
const flatCall = (TypeName, extra = {}) => ({
  name: "invoke_subagent",
  args: { TypeName, Role: "Goldfish", Prompt: "briefing text", Model: JSON.stringify("flash"), ...extra },
});

const selectedModel = (duty) => {
  const routes = registeredFunctionalTaskRoutes();
  const route = routes.taskRoutes.find((entry) => entry.runner === "antigravity" && entry.taskRoute === `duty.${duty}`);
  return route.selector?.value ?? route.cell.selector.value;
};

function runAdapter(fx, input) {
  return spawnSync(process.execPath, [adapter], {
    cwd: fx.workspace,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fx.workspace },
    encoding: "utf8",
    input: JSON.stringify(input),
    timeout: 20_000,
  });
}

test("a flat invoke_subagent call with a quoted Model is read as the alias and the goldfish call needs no consent", async () => {
  const fx = brainFixture();
  try {
    const normalized = normalizeAntigravityToolInput({ toolCall: flatCall("pipeline-core:goldfish-implementor") });
    assert.equal(normalized.nativeCallShape, "flat");
    assert.equal(normalized.nativeSubagents[0].Model, "flash", "one level of JSON string encoding is decoded");
    const { evaluateNativeGoldfishParentCall } = await loadModule();
    const verdict = evaluateNativeGoldfishParentCall(
      payload(fx, { conversationId: PARENT, toolCall: flatCall("pipeline-core:goldfish-implementor") }), normalized.nativeSubagents);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    // The adapter must no longer name a missing signed consent as the cause of a refusal.
    const res = runAdapter(fx, payload(fx, { conversationId: PARENT, toolCall: flatCall("pipeline-core:goldfish-implementor") }));
    assert.doesNotMatch(`${res.stdout}${res.stderr}`, /AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE|AGY-NATIVE-SCOPE-NOT-GRANTED/u);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("a child hook call is bound to its parent through the host-written descriptor and attributed with the same TypeName", async () => {
  const fx = brainFixture();
  try {
    descriptor(fx, CHILD, "goldfish-implementor");
    const { bindNativeChild, evaluateNativeChildCall } = await loadModule();
    const childInput = payload(fx, {
      conversationId: CHILD, lastUserInput: "", modelName: selectedModel("implement"),
      toolCall: { name: "view_file", args: { Path: join(fx.workspace, "x.txt") } },
    });
    const bound = bindNativeChild(childInput);
    assert.equal(bound.status, "child");
    assert.equal(bound.parentConversationId, PARENT);
    assert.equal(bound.typeName, "goldfish-implementor");
    assert.equal(bound.typeName, flatCall("goldfish-implementor").args.TypeName);
    const verdict = evaluateNativeChildCall(childInput);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    assert.equal(verdict.attributed.parentConversationId, PARENT);
    // The parent session itself is not a child, and a session no parent names is not one either.
    assert.equal(bindNativeChild(payload(fx, { conversationId: PARENT, toolCall: { name: "view_file", args: {} } })).status, "not-a-child");
    // Two parents naming one child is ambiguous and refused, never guessed.
    mkdirSync(join(fx.brain, "44444444-dddd-4ddd-8ddd-000000000004"), { recursive: true });
    descriptor(fx, CHILD, "goldfish-implementor", "SUBAGENT_STATE_ALIVE", "44444444-dddd-4ddd-8ddd-000000000004");
    assert.equal(bindNativeChild(childInput).status, "ambiguous");
    assert.equal(evaluateNativeChildCall(childInput).ok, false);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("a child whose resolved modelName differs from the selected model is refused with a typed code that names the repair", async () => {
  const fx = brainFixture();
  try {
    descriptor(fx, CHILD, "goldfish-implementor");
    const { evaluateNativeChildCall } = await loadModule();
    const childCall = { name: "view_file", args: { Path: join(fx.workspace, "x.txt") } };
    const wrong = payload(fx, { conversationId: CHILD, lastUserInput: "", modelName: "some-other-model", toolCall: childCall });
    const verdict = evaluateNativeChildCall(wrong);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, "AGY-NATIVE-CHILD-MODEL-MISMATCH");
    assert.ok(verdict.reason.includes("some-other-model") && verdict.reason.includes(selectedModel("implement")), verdict.reason);
    assert.match(verdict.reason, /repair/iu);
    // The adapter denies the child's call, verbatim and typed.
    const res = runAdapter(fx, wrong);
    assert.equal(res.status, 2, `${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /AGY-NATIVE-CHILD-MODEL-MISMATCH/u);
    const right = payload(fx, { conversationId: CHILD, lastUserInput: "", modelName: selectedModel("implement"), toolCall: childCall });
    assert.equal(evaluateNativeChildCall(right).ok, true);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("a second code-writing child while one is alive is refused with the serialize repair; read-only roles and finished children do not block", async () => {
  const fx = brainFixture();
  try {
    const { evaluateNativeGoldfishParentCall } = await loadModule();
    const parentCall = (TypeName, extra) => ({ conversationId: PARENT, toolCall: flatCall(TypeName, extra) });
    const entry = (TypeName, extra = {}) => ({ TypeName, Role: "Goldfish", Prompt: "p", Model: "flash", ...extra });
    descriptor(fx, CHILD, "goldfish-implementor");
    const second = evaluateNativeGoldfishParentCall(payload(fx, parentCall("goldfish-mechanic")), [entry("goldfish-mechanic")]);
    assert.equal(second.ok, false);
    assert.equal(second.code, "AGY-NATIVE-CODE-WRITER-ALIVE");
    assert.match(second.reason, /wait for the first child's (completion )?message/u);
    // A read-only role may run beside it.
    assert.equal(evaluateNativeGoldfishParentCall(payload(fx, parentCall("critic")), [entry("critic", { Model: "pro" })]).ok, true);
    // A finished child no longer counts.
    descriptor(fx, CHILD, "goldfish-implementor", "SUBAGENT_STATE_COMPLETED");
    assert.equal(evaluateNativeGoldfishParentCall(payload(fx, parentCall("goldfish-mechanic")), [entry("goldfish-mechanic")]).ok, true);
    // Two code writers in one call, and an isolation request that is not measured, are refused too.
    assert.equal(evaluateNativeGoldfishParentCall(payload(fx, parentCall("goldfish-mechanic")),
      [entry("goldfish-mechanic"), entry("goldfish-implementor")]).ok, false);
    const branch = evaluateNativeGoldfishParentCall(payload(fx, parentCall("goldfish-mechanic")), [entry("goldfish-mechanic", { Workspace: "branch" })]);
    assert.equal(branch.ok, false);
    assert.equal(branch.code, "AGY-NATIVE-WORKSPACE-UNMEASURED");
    assert.equal(evaluateNativeGoldfishParentCall(payload(fx, parentCall("goldfish-mechanic")), [entry("goldfish-mechanic", { Workspace: "inherit" })]).ok, true);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});

test("an agent write under the Antigravity brain or config directory is refused", async () => {
  const fx = brainFixture();
  try {
    const { nativeBrainWriteRefusal } = await loadModule();
    const descriptorPath = join(fx.brain, PARENT, ".system_generated", "subagents", `${OTHER_CHILD}.json`);
    assert.match(nativeBrainWriteRefusal({ filePath: descriptorPath, command: "" }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u);
    assert.match(nativeBrainWriteRefusal({ filePath: "/home/u/.gemini/antigravity-cli/brain/x/y.json", command: "" }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u);
    assert.equal(nativeBrainWriteRefusal({ filePath: join(fx.workspace, "src", "a.mjs"), command: "" }), null);
    assert.match(nativeBrainWriteRefusal({ filePath: null, command: `echo {} > ${descriptorPath}` }) ?? "", /AGY-NATIVE-BRAIN-WRITE/u);
    assert.equal(nativeBrainWriteRefusal({ filePath: null, command: `cat ${descriptorPath}` }), null);
    const res = runAdapter(fx, payload(fx, {
      conversationId: PARENT, toolCall: { name: "write_to_file", args: { TargetFile: descriptorPath, CodeContent: "{}" } },
    }));
    assert.equal(res.status, 2, `${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /AGY-NATIVE-BRAIN-WRITE/u);
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
});
