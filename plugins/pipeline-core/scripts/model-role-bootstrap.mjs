// SPDX-License-Identifier: SUL-1.0
/** Attended new-session functional-model bootstrap; existing V3 routing stays authoritative until admission. */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readModelRoleApprovedPolicy } from "../lib/model-role-approved-policy.mjs";
import { resolveModelRoleHostSessionIdentity } from "../lib/model-role-host-identity.mjs";
import { collectModelRoleHostObservations } from "../lib/model-role-host-observations.mjs";
import { admitModelRoleHostBootstrap, prepareModelRoleHostBootstrap } from "../lib/model-role-host-session.mjs";
import { createModelRoleHostStore } from "../lib/model-role-host-store.mjs";
import { functionalTaskRoutesForRunner, registeredFunctionalTaskRoutes } from "../lib/model-role-route-source.mjs";
import { deriveV3BaselinePolicies } from "../lib/model-role-v3-baseline.mjs";
import { resolvePluginManifestVersion } from "./pipeline-start-preflight.mjs";
import { renderHumanCopySafeCommand } from "../lib/copy-safe-command.mjs";

const OID = /^[a-f0-9]{40}$/u;
const AGY_SESSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const AGY_HOOK_WINDOW_MS = 30 * 60 * 1000;
const fail = (code) => ({ ok: false, code, status: "unavailable" });
/** Optional model-role admission cannot turn an otherwise-ready V3 lifecycle partial. */
export function modelRoleBootstrapCliResult(result) {
  if (result?.ok) return result;
  return { ...result, fallback: "legacy-v3", lifecycleImpact: "none" };
}

export function modelRoleBootstrapExitCode(result) {
  return result?.ok || (result?.fallback === "legacy-v3" && result.lifecycleImpact === "none") ? 0 : 1;
}

/** Transfer an observed session to an attended terminal; this never confirms its mapping. */
export function modelRoleBootstrapTerminalIdentity({ runner, env = process.env,
  hostHookSessionId = null, interactive = false } = {}) {
  if (runner === "antigravity" || hostHookSessionId === null) {
    return resolveModelRoleHostSessionIdentity({ runner, env, hostHookSessionId });
  }
  if (!interactive) return fail("MODEL-ROLE-ATTENDED-SESSION-REQUIRES-TERMINAL");
  const transferredEnv = runner === "codex"
    ? { CODEX_SESSION_ID: hostHookSessionId, CODEX_THREAD_ID: hostHookSessionId }
    : runner === "claude" ? { CLAUDE_CODE_SESSION_ID: hostHookSessionId } : {};
  const transferred = resolveModelRoleHostSessionIdentity({ runner, env: transferredEnv });
  if (!transferred.ok) return transferred;
  const keys = runner === "codex" ? ["CODEX_SESSION_ID", "CODEX_THREAD_ID"] : ["CLAUDE_CODE_SESSION_ID"];
  if (keys.some((key) => env[key] !== undefined && env[key] !== transferred.sessionId)) {
    return fail("MODEL-ROLE-SESSION-IDENTITY-CONFLICT");
  }
  return transferred;
}

export function modelRoleBootstrapAttendedAction({ rootDir, runner, sessionId,
  executable = process.execPath, scriptPath = fileURLToPath(import.meta.url) } = {}) {
  const identity = modelRoleBootstrapTerminalIdentity({ runner, env: {},
    hostHookSessionId: sessionId, interactive: true });
  if (!identity.ok || !isAbsolute(rootDir ?? "") || !isAbsolute(scriptPath ?? "")
    || !isAbsolute(executable ?? "")) return null;
  const command = renderHumanCopySafeCommand({ label: "confirm model mapping in an attended terminal",
    executable, argv: [scriptPath, "--repo-root", rootDir, "--runner", runner,
      "--host-session-id", identity.sessionId] });
  return { kind: "command", executionBoundary: "attended-terminal", mutation: true,
    requiresHumanConfirmation: true, sessionId: identity.sessionId, runner, rootDir, ...command };
}

/** Host-owned terminal input is compared with the displayed proposal, once. */
export async function confirmModelRoleMapping(readback, { question, write } = {}) {
  write(`${JSON.stringify(readback, null, 2)}\n`);
  const entered = await question(
    `Paste this exact 64-character mapping digest to confirm: ${readback.readbackSha256}\nDigest: `,
  );
  if (typeof entered === "string" && entered.trim() === readback.readbackSha256) return true;
  write(`Mapping not confirmed: the input must match the exact 64-character digest shown above.\nExpected digest: ${readback.readbackSha256}\nRun the attended action again and paste that digest; no confirmation was recorded.\n`);
  return false;
}

/** The same terminal transport is exercised by the CLI and disposable tests. */
export async function runModelRoleBootstrapTransport({ rootDir, runner, env = process.env,
  hostHookSessionId = null, interactive = false, question, write = () => {},
  bootstrapOptions = {} } = {}) {
  const identity = modelRoleBootstrapTerminalIdentity({ runner, env, hostHookSessionId, interactive });
  if (!identity.ok) return modelRoleBootstrapCliResult(fail(identity.code));
  // Only the explicitly transferred, validated identity is carried into the normal
  // bootstrap resolver. Ambient conflicts were rejected above, never overwritten.
  const identityEnv = runner === "codex"
    ? { ...env, CODEX_SESSION_ID: identity.sessionId, CODEX_THREAD_ID: identity.sessionId }
    : runner === "claude" ? { ...env, CLAUDE_CODE_SESSION_ID: identity.sessionId } : env;
  const result = await runModelRoleBootstrap({ ...bootstrapOptions, rootDir, runner,
    env: identityEnv, hostHookSessionId: runner === "antigravity" ? identity.sessionId : null,
    confirm: interactive ? (readback) => confirmModelRoleMapping(readback, { question, write }) : null });
  const diagnostic = modelRoleBootstrapCliResult(result);
  if (result.status === "confirmation-required") {
    const action = modelRoleBootstrapAttendedAction({ rootDir, runner, sessionId: identity.sessionId });
    if (action) {
      diagnostic.attendedAction = action;
      write(`Human mapping confirmation requires an attended terminal for session ${identity.sessionId}.\n${action.text}\n`);
    }
  }
  return diagnostic;
}

/** A lock is a bounded local hook observation, not provider attestation. */
export function observeAgyModelRoleHookSession({ rootDir, sessionId,
  pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url))),
  nowEpochMs = Date.now() } = {}) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)
    || !AGY_SESSION.test(sessionId ?? "") || !Number.isFinite(nowEpochMs)) {
    return fail("MODEL-ROLE-AGY-HOOK-IDENTITY");
  }
  const expected = resolvePluginManifestVersion(pluginRoot, "antigravity");
  if (typeof expected !== "string" || expected.length === 0) {
    return fail("MODEL-ROLE-AGY-HOOK-VERSION");
  }
  const target = join(rootDir, ".git", "agent-pipeline", "run",
    `session-${sessionId}`, "requires-bootstrap.lock");
  try {
    const info = lstatSync(target);
    const age = nowEpochMs - info.mtimeMs;
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4096
      || age < 0 || age > AGY_HOOK_WINDOW_MS || realpathSync(target) !== target) {
      return fail("MODEL-ROLE-AGY-HOOK-UNAVAILABLE");
    }
    const value = JSON.parse(readFileSync(target, "utf8"));
    return value?.locked === true && value?.version === expected
      ? { ok: true, code: "MODEL-ROLE-AGY-HOOK-OBSERVED", sessionId }
      : fail("MODEL-ROLE-AGY-HOOK-UNAVAILABLE");
  } catch { return fail("MODEL-ROLE-AGY-HOOK-UNAVAILABLE"); }
}

function realGitState(rootDir) {
  const commit = execFileSync("git", ["rev-parse", "--verify", "HEAD^{commit}"],
    { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"],
    { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (!OID.test(commit) || common.length === 0) throw new Error("MODEL-ROLE-GIT-STATE");
  return { candidateCommit: commit, commonDir: realpathSync(resolve(rootDir, common)) };
}

/** The confirmation callback must be a host-owned human event, never a model-supplied JSON flag. */
export async function runModelRoleBootstrap({ rootDir, runner, env = process.env,
  hostHookSessionId = null, confirm = null,
  routeSource = registeredFunctionalTaskRoutes(),
  readApprovedPolicy = readModelRoleApprovedPolicy,
  collectObservations = collectModelRoleHostObservations,
  readGitState = realGitState, makeStore = createModelRoleHostStore,
  now = () => new Date().toISOString() } = {}) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)
    || !routeSource?.ok) return fail("MODEL-ROLE-BOOTSTRAP-SOURCE");
  const identity = resolveModelRoleHostSessionIdentity({ runner, env, hostHookSessionId });
  if (!identity.ok) return fail(identity.code);
  const runnerSource = functionalTaskRoutesForRunner(routeSource, runner);
  if (!runnerSource.ok) return fail(runnerSource.code);
  let gitState;
  try { gitState = readGitState(rootDir); }
  catch { return fail("MODEL-ROLE-BOOTSTRAP-GIT-UNAVAILABLE"); }
  if (!OID.test(gitState?.candidateCommit ?? "")
    || typeof gitState?.commonDir !== "string" || !isAbsolute(gitState.commonDir)) {
    return fail("MODEL-ROLE-BOOTSTRAP-GIT-UNAVAILABLE");
  }
  let store;
  try { store = makeStore(gitState.commonDir, { rootDir }); }
  catch { return fail("MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE"); }
  const existing = store.inspect(identity.sessionId);
  if (!existing?.ok) return fail("MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE");
  if (existing.status === "present") {
    const held = store.read(identity.sessionId);
    return held?.ok && held.runner === runner
      ? { ok: true, code: "MODEL-ROLE-BOOTSTRAP-REUSED", status: "ready",
      sessionId: identity.sessionId, receipts: held.receipts,
      readbackSha256: held.admission.readbackSha256 } : fail("MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE");
  }
  if (existing.status !== "absent") return fail("MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE");
  const previous = store.latest(identity.sessionId, runner);
  if (!previous?.ok) return fail("MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE");
  let observed;
  try { observed = await collectObservations({ routeSource: runnerSource }); }
  catch { observed = { ok: false, code: "MODEL-ROLE-HOST-OBSERVATION-UNAVAILABLE" }; }
  const signed = readApprovedPolicy({ rootDir, routeSource, requiredRunner: runner });
  const v3Baseline = !signed?.ok && observed?.ok
    ? deriveV3BaselinePolicies({ routeSource, runner, observations: observed.observations })
    : null;
  const approved = signed?.ok ? signed : v3Baseline;
  if (!approved?.ok) {
    // A concrete V3 selector is PO-approved as an initial assignment, but
    // neither its compatibility nor the exact ID behind a Claude alias may
    // be inferred from that approval. Keep this diagnostic non-authorizing.
    const baseline = runnerSource.configuredRoutes.map(({ runner, role, effort, selector }) => ({
      runner, role, effort, selector: structuredClone(selector),
      disposition: selector?.kind === "model-id"
        ? "v3-assignment-approved-compatibility-required"
        : "exact-model-approval-required",
    }));
    const observedModelIds = observed?.ok && Array.isArray(observed.observations)
      ? [...new Set(observed.observations.flatMap((entry) => entry.availableModelIds ?? []))].sort()
      : [];
    return { ...fail("MODEL-ROLE-BOOTSTRAP-POLICY-REQUIRED"),
      policyCode: signed?.code ?? null, baseline,
      baselineCode: v3Baseline?.code ?? null,
      observationCode: observed?.code ?? "MODEL-ROLE-HOST-OBSERVATION-UNAVAILABLE",
      observedModelIds };
  }
  if (!observed?.ok) return { ...fail("MODEL-ROLE-BOOTSTRAP-OBSERVATION-UNAVAILABLE"),
    observationCode: observed?.code ?? null };
  const proposal = prepareModelRoleHostBootstrap({ sessionId: identity.sessionId,
    candidateCommit: gitState.candidateCommit, observedAt: now(),
    approvedPolicies: approved.approvedPolicies.filter((entry) => entry.runner === runner),
    observations: observed.observations,
    previousReceipts: previous.receipts, routeSource: runnerSource });
  if (!proposal.ok) return { ...fail("MODEL-ROLE-BOOTSTRAP-PROPOSAL-UNAVAILABLE"),
    proposalCode: proposal.code };
  let acknowledgement = null;
  if (proposal.readback.acknowledgementRequired) {
    if (typeof confirm !== "function") {
      return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED",
        status: "confirmation-required", readback: proposal.readback,
        reviewCandidates: proposal.reviewCandidates };
    }
    let confirmed;
    try { confirmed = await confirm(proposal.readback); } catch { confirmed = false; }
    if (confirmed !== true) return { ok: false, code: "MODEL-ROLE-BOOTSTRAP-NOT-CONFIRMED",
      status: "confirmation-required", readback: proposal.readback };
    acknowledgement = { sessionId: identity.sessionId, confirmed: true,
      readbackSha256: proposal.readback.readbackSha256 };
  }
  const admitted = admitModelRoleHostBootstrap({ proposal, acknowledgement, store,
    authority: signed?.ok ? { routeSource, bundle: signed.bundle }
      : { mode: "v3-baseline", routeSource, observations: observed.observations } });
  return admitted.ok ? { ok: true, code: "MODEL-ROLE-BOOTSTRAP-READY", status: "ready",
    sessionId: identity.sessionId, readback: proposal.readback,
    reviewCandidates: proposal.reviewCandidates }
    : { ...fail("MODEL-ROLE-BOOTSTRAP-ADMISSION-FAILED"), admissionCode: admitted.code };
}

async function main() {
  const args = process.argv.slice(2);
  const basic = args.length === 4 && args[0] === "--repo-root" && args[2] === "--runner"
    && ["codex", "claude"].includes(args[3]);
  const transferred = args.length === 6 && args[0] === "--repo-root" && args[2] === "--runner"
    && ["codex", "claude", "antigravity"].includes(args[3]) && args[4] === "--host-session-id";
  const agy = transferred && args[3] === "antigravity";
  if (!basic && !transferred) {
    throw new Error("Usage: model-role-bootstrap.mjs --repo-root <absolute-repo> --runner codex|claude|antigravity [--host-session-id <observed-session-id>; Codex/Claude transfer requires an attended terminal, Antigravity requires its native hook]");
  }
  if (agy) {
    let source;
    try { source = registeredFunctionalTaskRoutes(); }
    catch { source = { ok: false }; }
    if (!functionalTaskRoutesForRunner(source, "antigravity").ok) {
      const diagnostic = modelRoleBootstrapCliResult(fail("MODEL-ROLE-BOOTSTRAP-SOURCE"));
      stdout.write(`${JSON.stringify(diagnostic)}\n`);
      process.exitCode = modelRoleBootstrapExitCode(diagnostic);
      return;
    }
    const hook = observeAgyModelRoleHookSession({ rootDir: args[1], sessionId: args[5] });
    if (!hook.ok) {
      const diagnostic = modelRoleBootstrapCliResult(hook);
      stdout.write(`${JSON.stringify(diagnostic)}\n`);
      process.exitCode = modelRoleBootstrapExitCode(diagnostic);
      return;
    }
  }
  const interactive = stdin.isTTY && stdout.isTTY;
  let result;
  try {
    result = await runModelRoleBootstrapTransport({ rootDir: args[1], runner: args[3],
      hostHookSessionId: transferred ? args[5] : null, interactive,
      write: (text) => process.stderr.write(text),
      question: async (text) => {
        const prompt = createInterface({ input: stdin, output: stdout });
        try {
          return await prompt.question(text);
        } finally { prompt.close(); }
      } });
  } catch {
    result = fail("MODEL-ROLE-BOOTSTRAP-UNAVAILABLE");
  }
  const diagnostic = modelRoleBootstrapCliResult(result);
  stdout.write(`${JSON.stringify(diagnostic)}\n`);
  process.exitCode = modelRoleBootstrapExitCode(diagnostic);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
