// SPDX-License-Identifier: SUL-1.0

/** Native one-turn independent-readiness adapter inside the selected Codex sandbox. */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateAdvisoryEvidenceBundleForRepository } from "../lib/advisory-lifecycle-v2.mjs";
import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { validateDesignReadinessModelOutput } from "../lib/design-readiness-host-evidence.mjs";
import { buildSandboxInvocation } from "./codex-sandbox-preflight.mjs";

const CHILD = realpathSync(fileURLToPath(new URL("./codex-readiness-app-server-child.mjs", import.meta.url)));
const SOURCES = ["input", "prd", "spec", "design", "traceability"];
const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40,64}$/;
const MAX_STDIO_BYTES = 8 * 1024 * 1024;
const MAX_ELAPSED_MS = 240_000;
const TERM_GRACE_MS = 500;

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function sameJson(left, right) { return canonicalJson(left) === canonicalJson(right); }
function routeValid(value, candidateCommit) {
  return exact(value, ["model", "effort", "sourceSha256", "candidateCommit"])
    && typeof value.model === "string" && value.model.length > 0
    && typeof value.effort === "string" && value.effort.length > 0
    && SHA256.test(value.sourceSha256 ?? "") && value.candidateCommit === candidateCommit;
}

export async function invokeCodexReadinessAppServer(payload, dependencies = {}) {
  const selected = payload?.sandboxTransport;
  const sourceBytes = payload?.sources;
  const route = payload?.route;
  const evidence = validateAdvisoryEvidenceBundleForRepository(
    selected?.scratch?.repoRoot,
    payload?.evidenceBundle,
    selected?.dispatch?.referenceSetSha256 ?? null,
  );
  const candidate = payload?.candidate;
  const sourceSet = sourceBytes && Object.fromEntries(SOURCES.map((name) => [name, sourceBytes[name]]));
  const expectedEvidence = sourceSet && SOURCES.map((name) => sourceSet[name]).sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const actualEvidence = payload?.evidenceBundle?.references?.map(({ path, sha256 }) => ({ path, sha256 }));
  if (!selected || selected.duty !== "readiness" || selected.requested?.runner !== "codex"
    || selected.requested?.model !== route?.model || !exact(candidate, ["commit", "tree"])
    || !OID.test(candidate.commit ?? "") || !OID.test(candidate.tree ?? "")
    || !routeValid(route, candidate.commit)
    || !exact(sourceBytes, SOURCES) || SOURCES.some((name) => !exact(sourceBytes[name], ["path", "sha256"])
      || typeof sourceBytes[name].path !== "string" || !SHA256.test(sourceBytes[name].sha256 ?? ""))
    || !sameJson(expectedEvidence, actualEvidence)
    || selected.dispatch?.candidateCommit !== candidate.commit || selected.dispatch?.candidateTree !== candidate.tree
    || selected.profile?.base !== ":read-only" || selected.profile?.network?.enabled !== true
    || selected.profile?.scratchRootSha256 !== selected.scratch?.sha256
    || typeof selected.scratch?.sandboxStateJson !== "string" || typeof selected.scratch?.sandboxStateSha256 !== "string"
    || typeof payload?.dispatchId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(payload.dispatchId)
    || !evidence.ok) throw new Error("selected Codex readiness transport is invalid");
  const referencesMatch = payload.evidenceBundle.references.every((entry) => {
    const match = SOURCES.map((name) => sourceBytes[name]).find((source) => source.path === entry.path);
    return match && match.sha256 === entry.sha256;
  });
  if (!referencesMatch) throw new Error("selected readiness source digest mismatch");

  const invocation = (dependencies.buildSandboxInvocationFn ?? buildSandboxInvocation)({
    codexPath: selected.scratch.codexPath,
    sandboxStateJson: selected.scratch.sandboxStateJson,
    sandboxStateSha256: selected.scratch.sandboxStateSha256,
    nodePath: process.execPath,
    payloadPath: CHILD,
  });
  let child;
  try {
    child = (dependencies.spawnFn ?? spawn)(invocation.command, invocation.argv, {
      cwd: selected.scratch.repoRoot,
      env: process.env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return { status: "unavailable", childStarted: false };
  }
  const chunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let overflow = false;
  let timedOut = false;
  let stopped = false;
  let killTimer = null;
  let escalation = null;
  const killProcess = dependencies.killFn ?? process.kill;
  const schedule = dependencies.setTimeoutFn ?? setTimeout;
  const cancel = dependencies.clearTimeoutFn ?? clearTimeout;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      if (process.platform !== "win32" && Number.isInteger(child.pid) && child.pid > 0) killProcess(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch { try { child.kill("SIGTERM"); } catch { /* the child may already be gone */ } }
    escalation = new Promise((resolveEscalation) => {
      killTimer = schedule(() => {
        try {
          if (process.platform !== "win32" && Number.isInteger(child.pid) && child.pid > 0) killProcess(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch { try { child.kill("SIGKILL"); } catch { /* best-effort escalation */ } }
        resolveEscalation();
      }, TERM_GRACE_MS);
    });
  };
  child.stdout.on("data", (chunk) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes <= MAX_STDIO_BYTES) chunks.push(chunk);
    else { overflow = true; stop(); }
  });
  child.stderr.on("data", (chunk) => {
    stderrBytes += chunk.length;
    if (stderrBytes > MAX_STDIO_BYTES) { overflow = true; stop(); }
  });
  try {
    child.stdin.end(JSON.stringify({
      codexPath: selected.scratch.codexPath,
      cwd: selected.scratch.repoRoot,
      scratchPath: selected.scratch.path,
      dispatchId: payload.dispatchId,
      candidate,
      sources: sourceSet,
      evidenceBundle: payload.evidenceBundle,
      evidenceSha256: selected.dispatch.referenceSetSha256,
      route,
    }));
  } catch {
    stop();
  }
  const close = new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null, error: error?.code ?? "spawn-error" }));
    child.once("close", (code, signal) => resolve({ code, signal, error: null }));
  });
  const elapsedTimer = schedule(() => { timedOut = true; stop(); }, MAX_ELAPSED_MS);
  const terminal = await close;
  cancel(elapsedTimer);
  if (escalation !== null) await escalation;
  let result = null;
  if (!overflow && stdoutBytes <= MAX_STDIO_BYTES) {
    const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean);
    try { if (lines.length === 1) result = JSON.parse(lines[0]); } catch { result = null; }
  }
  const schemaValid = result?.schema === "pipeline.codex-readiness-app-server-child.v1" && result.ok === true
    && result.code === "reviewed" && validateDesignReadinessModelOutput(result.report).valid;
  const reportValid = schemaValid && result.report.dispatchId === payload.dispatchId && result.report.runner === "codex"
    && sameJson(result.report.candidate, candidate) && sameJson(result.report.sources, sourceSet)
    && !Object.hasOwn(result.report, "hostExecution");
  const observed = result?.observed;
  const protocolValid = observed?.provider === "openai" && observed.model === route.model && observed.effort === route.effort
    && observed.initialized === true && observed.threadStarted === true && observed.turnStarted === true
    && observed.turnCompleted === true && observed.stdinEnded === true && observed.exitCode === 0
    && observed.signal === null && observed.cleanup === "complete";
  if (terminal.code !== 0 || terminal.signal !== null || terminal.error !== null || overflow || timedOut || !reportValid || !protocolValid) {
    return { status: "unavailable", childStarted: terminal.error === null };
  }
  return {
    status: "reviewed",
    report: structuredClone(result.report),
    identity: { provider: "openai", modelId: route.model, effort: route.effort },
    sandboxExecution: {
      schema: "pipeline.codex-sandbox-host-execution.v1",
      selectionId: selected.selectionId,
      selectionSha256: selected.selectionSha256,
      repoFingerprint: selected.repoFingerprint,
      duty: "readiness",
      dispatch: selected.dispatch,
      observed: { cliSha256: selected.toolchain.cliSha256, profileSha256: selected.profile.sha256,
        networkEnabled: true, scratchRootSha256: selected.profile.scratchRootSha256 },
      terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
    },
  };
}
