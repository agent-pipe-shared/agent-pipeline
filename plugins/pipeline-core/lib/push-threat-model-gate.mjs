// SPDX-License-Identifier: SUL-1.0
/**
 * D4a (candidate 19): the push threat model must exist before the push gate when a push approval is active.
 *
 * One pure-reading decision for a project root, shared by the three places that need the model first: the plan approval request
 * (`pipeline-state.mjs submit-plan`), `push-prepare.mjs` before it issues a push candidate and the close coordinator before the Critic/audit
 * step (`feature-close-prepared`). It reads the manifest and the model file and writes nothing.
 *
 * "A push approval is active" means the manifest's push gate asks for approval (`gates.push.approval: required`): the reader the close
 * coordinator already used. The `gates.push_approval` key of `pipeline.user.yaml` only chooses HOW a human clears the gate (signature or
 * chat) and always has a value, so it cannot say whether an approval is active.
 *
 * A project without an active push approval is never refused here. When it is active the file must exist as a regular file, hold more than
 * whitespace and carry at least one markdown heading (the shipped template does; a handwritten model is free in its words).
 */
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { gateConfig, loadManifestSafe } from "./manifest.mjs";

export const PUSH_THREAT_MODEL_FILE = "project/push-threat-model.md";
export const PUSH_THREAT_MODEL_GATE_SCHEMA = "pipeline.push-threat-model-gate.v1";
export const MATERIALIZE_PUSH_THREAT_MODEL_COMMAND = "node <plugin-root>/scripts/pipeline-state.mjs materialize-push-threat-model";
export const PUSH_THREAT_MODEL_COMMIT_RULE = `commit ${PUSH_THREAT_MODEL_FILE} in the same draft commit as the feature package registration, before the item binding is generated; created later it moves the candidate after the Critic and Verify ran and forces a second round`;
const MAX_MODEL_BYTES = 1024 * 1024;
const HEADING = /^#{1,6}[ \t]+\S/mu;

/** Does the manifest of `root` ask for a push approval? Never throws; an absent or invalid manifest means no. */
export function pushApprovalActive(root, deps = {}) {
  try {
    return gateConfig((deps.loadManifest ?? loadManifestSafe)(root), "push")?.approval === "required";
  } catch { return false; }
}

const refused = (code, message, repairCommand) => ({
  schema: PUSH_THREAT_MODEL_GATE_SCHEMA, active: true, ok: false, code, path: PUSH_THREAT_MODEL_FILE, message,
  repair: { command: repairCommand, commitRule: PUSH_THREAT_MODEL_COMMIT_RULE },
});
const REPLACE_COMMAND = `write the reviewed threat model into ${PUSH_THREAT_MODEL_FILE} (start from the shipped template plugins/pipeline-core/docs/default-push-threat-model.md; the command that creates the file from that template refuses while a file exists)`;

/** @returns {{schema: string, active: boolean, ok: boolean, code: string|null, path: string, message: string|null, repair: {command: string, commitRule: string}|null}} */
export function pushThreatModelVerdict(root, deps = {}) {
  if (!pushApprovalActive(root, deps)) return { schema: PUSH_THREAT_MODEL_GATE_SCHEMA, active: false, ok: true, code: null, path: PUSH_THREAT_MODEL_FILE, message: null, repair: null };
  const target = join(root, PUSH_THREAT_MODEL_FILE);
  let info;
  try { info = lstatSync(target); } catch (error) {
    if (error?.code === "ENOENT") return refused("PUSH-THREAT-MODEL-MISSING", `${PUSH_THREAT_MODEL_FILE} does not exist and the push approval is active`, MATERIALIZE_PUSH_THREAT_MODEL_COMMAND);
    return refused("PUSH-THREAT-MODEL-INVALID", `${PUSH_THREAT_MODEL_FILE} cannot be read (${error?.code ?? "error"})`, REPLACE_COMMAND);
  }
  if (!info.isFile() || info.isSymbolicLink()) return refused("PUSH-THREAT-MODEL-INVALID", `${PUSH_THREAT_MODEL_FILE} is not a regular file`, REPLACE_COMMAND);
  if (info.size > MAX_MODEL_BYTES) return refused("PUSH-THREAT-MODEL-INVALID", `${PUSH_THREAT_MODEL_FILE} is larger than ${MAX_MODEL_BYTES} bytes`, REPLACE_COMMAND);
  let text;
  try { text = readFileSync(target, "utf8"); } catch (error) { return refused("PUSH-THREAT-MODEL-INVALID", `${PUSH_THREAT_MODEL_FILE} cannot be read (${error?.code ?? "error"})`, REPLACE_COMMAND); }
  if (text.trim() === "") return refused("PUSH-THREAT-MODEL-EMPTY", `${PUSH_THREAT_MODEL_FILE} is empty and the push approval is active`, REPLACE_COMMAND);
  if (!HEADING.test(text)) return refused("PUSH-THREAT-MODEL-INVALID", `${PUSH_THREAT_MODEL_FILE} has no markdown heading, so it is not a threat model document`, REPLACE_COMMAND);
  return { schema: PUSH_THREAT_MODEL_GATE_SCHEMA, active: true, ok: true, code: null, path: PUSH_THREAT_MODEL_FILE, message: null, repair: null };
}

/** The one-sentence refusal every enforcement point prints (code, file, repair command, commit rule); null for a passing verdict. */
export function pushThreatModelRefusalText(verdict, where = "this step") {
  if (verdict === null || typeof verdict !== "object" || verdict.ok !== false) return null;
  return `${where} refused (${verdict.code}): ${verdict.message}. Repair: ${verdict.repair.command}. Commit rule: ${verdict.repair.commitRule}.`;
}
