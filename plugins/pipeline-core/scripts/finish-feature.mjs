#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * One-shot local feature close driver.
 *
 * It does not manufacture lifecycle state: every coordinator transition is
 * planned and immediately applied by its existing CAS writer.  The final
 * action is accepted only when it is the coordinator-provided close-feature
 * invocation.  The protected State writer remains the sole closer.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = new URL(".", import.meta.url);
const COORDINATOR = fileURLToPath(new URL("./close-coordinator.mjs", HERE));
const STATE_WRITER = fileURLToPath(new URL("./pipeline-state.mjs", HERE));
const FEATURE = /^[a-z][a-z0-9-]{2,63}$/u;
const IMPACT = new Set(["architecture-conforms", "architecture-changed", "no-architecture-impact"]);

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parseJsonOutput(result, code) {
  if (result?.status !== 0) fail(code, String(result?.stderr ?? result?.stdout ?? "command failed").trim() || "Command failed.");
  try { return JSON.parse(String(result.stdout)); } catch { fail(code, "Command did not return one JSON object."); }
}
function readActiveFeature(root, deps) {
  const read = deps.readFileSyncFn ?? readFileSync;
  let state;
  try { state = JSON.parse(read(resolve(root, ".claude/pipeline-state.json"), "utf8")); } catch { fail("FINISH-STATE", "Pipeline State is unavailable."); }
  if (!state?.activeFeature || !FEATURE.test(state.activeFeature.id ?? "")) fail("FINISH-FEATURE", "A valid active feature is required.");
  return state.activeFeature.id;
}
function command(runner, executable, argv, code) { return parseJsonOutput(runner(executable, argv), code); }
function flagPairs(values) {
  const argv = [];
  for (const [name, value] of Object.entries(values)) if (value !== null && value !== undefined) argv.push(`--${name}`, value);
  return argv;
}

export function finishFeature({ rootDir = process.cwd(), by, architectureImpact, auditRequest, criticVerifyLifecycle, continuityCloseRequest = null, lifecycleId = null } = {}, deps = {}) {
  const root = (deps.realpathSyncFn ?? realpathSync)(resolve(rootDir));
  if (typeof by !== "string" || by.trim() === "") fail("FINISH-BY", "Feature close requires a non-empty --by.");
  if (!IMPACT.has(architectureImpact)) fail("FINISH-IMPACT", "Feature close requires a known architecture impact.");
  if (typeof auditRequest !== "string" || auditRequest.length === 0 || auditRequest.startsWith("/") || auditRequest.includes("\\") || auditRequest.split("/").some(part => part === "" || part === "." || part === "..")) fail("FINISH-AUDIT-REQUEST", "Feature close requires one safe repository-relative audit request.");
  if (!/^[a-f0-9]{64}$/u.test(criticVerifyLifecycle ?? "")) fail("FINISH-CRITIC-VERIFY", "Feature close requires the exact private Critic/Verify lifecycle receipt ID.");
  if (continuityCloseRequest !== null && (typeof continuityCloseRequest !== "string" || continuityCloseRequest.length === 0 || continuityCloseRequest.startsWith("/") || continuityCloseRequest.includes("\\") || continuityCloseRequest.split("/").some(part => part === "" || part === "." || part === ".."))) fail("FINISH-CONTINUITY", "Continuity close request must be safe and repository-relative.");
  const featureId = readActiveFeature(root, deps);
  const id = lifecycleId ?? `${featureId}-${(deps.randomBytesFn ?? randomBytes)(12).toString("hex")}`;
  if (!/^[A-Za-z0-9._-]{1,100}$/u.test(id)) fail("FINISH-LIFECYCLE", "Lifecycle ID is invalid.");
  const runner = deps.runCommand ?? ((executable, argv) => spawnSync(executable, argv, { cwd: root, encoding: "utf8", shell: false }));
  const base = { root, lifecycle: id, actor: by.trim() };
  const invokeCoordinator = (subcommand, values, code) => command(runner, process.execPath, [COORDINATOR, subcommand, ...flagPairs(values)], code);
  const apply = (plan, values, code) => {
    if (!/^[a-f0-9]{64}$/u.test(plan?.planSha256 ?? "")) fail("FINISH-PLAN", "Coordinator plan lacks an exact digest.");
    const applied = invokeCoordinator(plan.nextAction?.argv?.[1] ?? "apply-transition", { ...values, "plan-sha256": plan.planSha256, activate: "true" }, code);
    if (!new Set(["applied", "replayed"]).has(applied?.status)) fail(code, "Coordinator did not durably apply its exact plan.");
    return applied;
  };
  const start = invokeCoordinator("plan-start", { ...base, "close-intent": "durable-stop" }, "FINISH-START-PLAN");
  apply(start, { ...base, "close-intent": "durable-stop" }, "FINISH-START-APPLY");
  const checkpoint = invokeCoordinator("plan-transition", { ...base, phase: "checkpointed" }, "FINISH-CHECKPOINT-PLAN");
  apply(checkpoint, { ...base, phase: "checkpointed" }, "FINISH-CHECKPOINT-APPLY");
  const preparedValues = { ...base, phase: "feature-close-prepared", "architecture-impact": architectureImpact, "audit-request": auditRequest, "critic-verify-lifecycle": criticVerifyLifecycle, "continuity-close-request": continuityCloseRequest };
  const prepared = invokeCoordinator("plan-transition", preparedValues, "FINISH-PREPARE-PLAN");
  const preparedApplied = apply(prepared, preparedValues, "FINISH-PREPARE-APPLY");
  const next = preparedApplied.nextAction;
  if (!next || next.executable !== process.execPath || !Array.isArray(next.argv) || next.argv[0] !== STATE_WRITER || next.argv[1] !== "close-feature"
    || !next.argv.includes("--coordinator-lifecycle") || !next.argv.includes("--coordinator-sha256")
    || !next.argv.includes("--critic-verify-lifecycle") || next.argv.at(next.argv.indexOf("--critic-verify-lifecycle") + 1) !== criticVerifyLifecycle) fail("FINISH-CLOSE-ACTION", "Coordinator did not return its exact bound close-feature action.");
  const closed = runner(next.executable, next.argv);
  if (closed?.status !== 0) fail("FINISH-CLOSE", String(closed?.stderr ?? closed?.stdout ?? "State close failed.").trim() || "State close failed.");
  return Object.freeze({ schema: "pipeline.finish-feature.v1", status: "closed", lifecycleId: id, featureId, coordinator: preparedApplied, closeOutput: String(closed.stdout ?? "").trim() });
}

function parse(argv) {
  const value = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]; const next = argv[i + 1];
    if (!["--root", "--by", "--architecture-impact", "--audit-request", "--critic-verify-lifecycle", "--continuity-close-request"].includes(flag) || next === undefined || next.startsWith("--") || Object.hasOwn(value, flag)) fail("FINISH-USAGE", "Usage: finish-feature.mjs --root <repo> --by <name> --architecture-impact <value> --audit-request <repo-relative-json> --critic-verify-lifecycle <receipt-id> [--continuity-close-request <repo-relative-json>]");
    value[flag] = next;
  }
  return { rootDir: value["--root"] ?? process.cwd(), by: value["--by"], architectureImpact: value["--architecture-impact"], auditRequest: value["--audit-request"], criticVerifyLifecycle: value["--critic-verify-lifecycle"], continuityCloseRequest: value["--continuity-close-request"] ?? null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(finishFeature(parse(process.argv.slice(2))), null, 2)}\n`); }
  catch (error) { process.stderr.write(`finish-feature: ${error?.code ?? "FINISH-ERROR"}: ${error.message}\n`); process.exitCode = 2; }
}
