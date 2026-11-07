// SPDX-License-Identifier: SUL-1.0
// Native Antigravity Goldfish dispatch (candidate 20, G20-8 B): an Antigravity-hosted Elephant dispatches goldfish-implementor,
// goldfish-mechanic and goldfish-deep through the host's own `invoke_subagent`, admitted like a Claude Agent call (generated briefing,
// selected model, write-capable carrier -- all judged by hooks/guard-dispatch.mjs) with NO per-dispatch PO consent. What the Claude route
// gets from the runner, this module gets from what the host WRITES (specs/sprint-alfred-epic/evidence/held-patches/
// w252-agy-native-subagent-measurement.md; every fact below is measured there):
//
//   * the hook payload has exactly eight keys, a child has its own conversationId and NO parent field;
//   * the host writes <brain root>/<parentId>/.system_generated/subagents/<childId>.json = { conversationId, subagentDescriptor {typeName,
//     role}, state, spawnStepIndex, workspaceUris }; the brain root is the parent directory of the payload's artifactDirectoryPath. A child
//     is BOUND when exactly one parent directory holds a descriptor named after its id;
//   * the alias (Model) is only in the parent's call; every child call carries the RESOLVED modelName, and flash and pro resolved to the
//     SAME model on the measured host, so the child's modelName is compared with the model the dispatch selection resolved for its role
//     (the registry's Antigravity cell for that duty), never with the alias;
//   * invoke_subagent args are FLAT (TypeName, Role, Prompt, Model, Workspace) and may be JSON-string-encoded ("\"flash\"").
//
// NOT measured, so not assumed (see the M-items of the w255 notes): Workspace branch/share in a git workspace, the descriptor state a
// finished child carries, the exact spelling of modelName. Code-writing children therefore run serialized through the shared tree: one
// alive at a time, Workspace absent or inherit. That rule is the ONE switch AGY_NATIVE_SERIALIZE_CODE_WRITERS; flipping it lifts the
// workspace, one-per-call and one-alive refusals together once M4b has been measured.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";

export const AGY_NATIVE_SERIALIZE_CODE_WRITERS = true;
export const AGY_NATIVE_ALIVE_STATE = "SUBAGENT_STATE_ALIVE";
const DUTY_OF = Object.freeze({ "goldfish-implementor": "implement", "goldfish-mechanic": "mechanic", "goldfish-deep": "deep" });
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const PROTECTED_HOST_PATH = [
  /[\\/]\.gemini[\\/]antigravity-cli(?:[\\/]|$)/iu,
  /[\\/]\.gemini[\\/]config(?:[\\/]|$)/iu,
  /[\\/]\.system_generated(?:[\\/]|$)/u,
];

export const bareNativeType = (value) => (typeof value === "string" && value.startsWith("pipeline-core:") ? value.slice("pipeline-core:".length) : value);
export const isNativeCodeWriterType = (value) => Object.hasOwn(DUTY_OF, bareNativeType(value) ?? "");
const normalizeModel = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9.]+/gu, "-").replace(/^-+|-+$/gu, "");

/** One level of JSON string encoding, as the greenfield transcript shows it (Model as the string `"flash"` with its quotes). */
export function decodeNativeInvokeArgs(args) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return args;
  const decoded = {};
  for (const [key, value] of Object.entries(args)) {
    let next = value;
    if (typeof value === "string" && value.length >= 2 && value.startsWith("\"")) {
      try { const parsed = JSON.parse(value); if (typeof parsed === "string") next = parsed; } catch { /* keep the raw string */ }
    }
    decoded[key] = next;
  }
  return decoded;
}

function brainContext(input) {
  const conversationId = input?.conversationId;
  const artifact = input?.artifactDirectoryPath;
  if (typeof conversationId !== "string" || !SAFE_ID.test(conversationId) || typeof artifact !== "string" || artifact.trim() === "") return null;
  return { conversationId, brainRoot: dirname(artifact) };
}

const subagentDirectory = (brainRoot, parentId) => join(brainRoot, parentId, ".system_generated", "subagents");

function readDescriptor(path, childId) {
  try {
    const record = JSON.parse(readFileSync(path, "utf8"));
    const typeName = record?.subagentDescriptor?.typeName;
    if (record?.conversationId !== childId || typeof typeName !== "string" || typeName === "") return null;
    return { typeName: bareNativeType(typeName), role: record.subagentDescriptor.role, state: record.state, spawnStepIndex: record.spawnStepIndex };
  } catch { return null; }
}

/** Resolve a hook payload to "a child of session P of type T" from the descriptor the host wrote, or say it is not a child. */
export function bindNativeChild(input) {
  const context = brainContext(input);
  if (context === null) return { status: "not-a-child" };
  let parents;
  try { parents = readdirSync(context.brainRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && SAFE_ID.test(entry.name)); }
  catch { return { status: "not-a-child" }; }
  const matches = [];
  for (const parent of parents) {
    const path = join(subagentDirectory(context.brainRoot, parent.name), `${context.conversationId}.json`);
    if (existsSync(path)) matches.push({ parentConversationId: parent.name, path });
  }
  if (matches.length === 0) return { status: "not-a-child" };
  if (matches.length > 1) return { status: "ambiguous", parents: matches.map((match) => match.parentConversationId) };
  const descriptor = readDescriptor(matches[0].path, context.conversationId);
  if (descriptor === null) return { status: "invalid", parentConversationId: matches[0].parentConversationId };
  return { status: "child", childConversationId: context.conversationId, parentConversationId: matches[0].parentConversationId, ...descriptor };
}

/** The model the dispatch selection resolved for a role: the registry's Antigravity cell for its duty. Null = no opinion (route source unreadable). */
export function expectedNativeModel(type, routeSource = registeredFunctionalTaskRoutes()) {
  const duty = DUTY_OF[bareNativeType(type)];
  if (!duty || !routeSource?.ok || !Array.isArray(routeSource.taskRoutes)) return null;
  const route = routeSource.taskRoutes.find((entry) => entry.runner === "antigravity" && entry.taskRoute === `duty.${duty}`);
  const value = route?.selector?.value ?? route?.cell?.selector?.value;
  return typeof value === "string" && value !== "" ? { duty, value } : null;
}

const deny = (code, reason) => ({ ok: false, code, reason: `${code}: ${reason}` });

/** A hook call from a native child: attribute it to its parent and check the model it actually resolved to (goldfish roles only). */
export function evaluateNativeChildCall(input, { routeSource } = {}) {
  const bound = bindNativeChild(input);
  if (bound.status === "not-a-child") return { ok: true, attributed: null };
  if (bound.status === "ambiguous") {
    return deny("AGY-NATIVE-CHILD-BINDING-AMBIGUOUS", `more than one session directory (${bound.parents.join(", ")}) holds a descriptor for this conversation, so it cannot be bound to one parent. Repair: stop this child with manage_subagents (kill) and dispatch it again from the parent.`);
  }
  if (bound.status === "invalid") {
    return deny("AGY-NATIVE-CHILD-DESCRIPTOR-INVALID", `the host descriptor for this conversation under parent ${bound.parentConversationId} is unreadable or names another conversation. Repair: stop this child with manage_subagents (kill) and dispatch it again from the parent.`);
  }
  const attributed = {
    parentConversationId: bound.parentConversationId, childConversationId: bound.childConversationId,
    typeName: bound.typeName, role: bound.role, spawnStepIndex: bound.spawnStepIndex,
  };
  if (!isNativeCodeWriterType(bound.typeName)) return { ok: true, attributed };
  const expected = expectedNativeModel(bound.typeName, routeSource);
  if (expected === null) return { ok: true, attributed, modelCheck: "no-opinion" };
  if (normalizeModel(input?.modelName) !== normalizeModel(expected.value)) {
    return deny("AGY-NATIVE-CHILD-MODEL-MISMATCH", `child ${bound.typeName} (parent ${bound.parentConversationId}) resolved to model ${JSON.stringify(input?.modelName ?? null)}, but the dispatch selection for it (duty.${expected.duty}, Antigravity cell) is ${JSON.stringify(expected.value)}. The host maps the aliases flash and pro to models of its own and they may be the same model, so the alias in the parent call does not select the model. Repair: stop this child with manage_subagents (kill) and dispatch it again with a Model alias that resolves to ${JSON.stringify(expected.value)}; if no alias does on this host, stop and report that to the PO (the PO can set the registry's Antigravity cell for duty.${expected.duty} in config/runner-profiles-v3.json to the model the host really resolves). Do not implement in the parent session instead.`);
  }
  return { ok: true, attributed };
}

/** The parent's invoke_subagent call that names a code-writing Goldfish: shared-tree serialization while M4b is unmeasured. */
export function evaluateNativeGoldfishParentCall(input, nativeSubagents) {
  const entries = Array.isArray(nativeSubagents) ? nativeSubagents : [];
  const writers = entries.filter((entry) => isNativeCodeWriterType(entry?.TypeName));
  if (writers.length === 0) return { ok: true, codeWriter: false };
  if (!AGY_NATIVE_SERIALIZE_CODE_WRITERS) return { ok: true, codeWriter: true };
  if (writers.length > 1 || entries.length > 1) {
    return deny("AGY-NATIVE-CODE-WRITER-ONE-PER-CALL", "a code-writing Goldfish shares the working tree, so it is dispatched alone in its own invoke_subagent call. Repair: issue one call per code-writing child, the next one only after the previous child's completion message has arrived.");
  }
  const [writer] = writers;
  if (writer.Workspace !== undefined && writer.Workspace !== "inherit") {
    return deny("AGY-NATIVE-WORKSPACE-UNMEASURED", `Workspace ${JSON.stringify(writer.Workspace)} for a code-writing child is not measured in a git workspace (follow-up M4b), so it is not admitted. Repair: omit Workspace or pass "inherit" (the child writes the shared tree, one at a time).`);
  }
  const context = brainContext(input);
  if (context === null) {
    return deny("AGY-NATIVE-PARENT-UNIDENTIFIED", "the hook payload names no conversationId or artifactDirectoryPath, so the live children of this session cannot be counted. Repair: this is not the measured Antigravity hook payload; dispatch from a current Antigravity session.");
  }
  let files = [];
  try { files = readdirSync(subagentDirectory(context.brainRoot, context.conversationId)).filter((name) => name.endsWith(".json")); } catch { files = []; }
  for (const name of files) {
    const childId = basename(name, ".json");
    const descriptor = readDescriptor(join(subagentDirectory(context.brainRoot, context.conversationId), name), childId);
    if (descriptor !== null && descriptor.state === AGY_NATIVE_ALIVE_STATE && isNativeCodeWriterType(descriptor.typeName)) {
      return deny("AGY-NATIVE-CODE-WRITER-ALIVE", `code-writing child ${descriptor.typeName} (${childId}) is still alive in this session and shares the working tree. Repair: wait for the first child's message (it arrives in this same turn, at the next model invocation), then dispatch the next one; read-only roles may run beside it.`);
    }
  }
  return { ok: true, codeWriter: true, parentConversationId: context.conversationId };
}

/** The host owns its brain and config directories; an agent write there would forge a child's identity or message. */
export function nativeBrainWriteRefusal({ filePath, command } = {}) {
  const refusal = `AGY-NATIVE-BRAIN-WRITE: the Antigravity brain and config directories are written by the host only (subagent descriptors, messages, credentials); a file written there would forge a child's identity or a completion message. Repair: write inside the project workspace (scratch/ for temporary files); to stop a child use manage_subagents.`;
  if (typeof filePath === "string" && PROTECTED_HOST_PATH.some((pattern) => pattern.test(filePath))) return refusal;
  if (typeof command === "string" && PROTECTED_HOST_PATH.some((pattern) => pattern.test(command))) {
    const readOnly = /^\s*(?:cat|ls|rg|grep|head|tail|wc|stat|file|find|pwd)\b/u.test(command) && !/>|\btee\b|-delete\b|-exec\b/u.test(command);
    if (!readOnly) return refusal;
  }
  return null;
}
