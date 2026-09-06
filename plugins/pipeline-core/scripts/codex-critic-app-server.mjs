// SPDX-License-Identifier: SUL-1.0

/** Native one-turn Critic adapter executed inside the already-selected Codex sandbox. */
import { spawn } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSandboxInvocation } from "./codex-sandbox-preflight.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = resolve(HERE, "..", "..", "..");
const CHILD = realpathSync(fileURLToPath(new URL("./codex-critic-app-server-child.mjs", import.meta.url)));
const MODEL = "gpt-5.6-sol";
const PROVIDER = "openai";
const EFFORT = "xhigh";
const ROLE_CONTRACT_PATH = "roles/critic.md";
const PROMPT_CONTRACT_PATH = "templates/prompts/critic-review.md";
const VERDICT_SCHEMA_PATH = "plugins/pipeline-core/scripts/critic-verdict.schema.json";
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const TREE_SHA = /^[0-9a-f]{40,64}$/;

function fail(message) { throw new Error(message); }

/** Resolved against the executing plugin root, never the candidate repository. */
function physicalRulesetFile(relativePath) {
  const absolute = resolve(PIPELINE_ROOT, relativePath);
  const lexical = lstatSync(absolute);
  if (lexical.isSymbolicLink() || !lexical.isFile()) fail(`Critic ruleset reference is not a regular file: ${relativePath}`);
  return absolute;
}

/** Repo-relative, normalized, and a real readable file under the selected repository root. */
function normalizedCriticReference(repoRoot, value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.includes("\\")) fail("critic reference is invalid");
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) fail("critic reference is not repository-relative");
  const absolute = resolve(repoRoot, value);
  const rel = relative(repoRoot, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${"/"}`)) fail(`critic reference escapes repository: ${value}`);
  const lexical = lstatSync(absolute);
  if (lexical.isSymbolicLink() || !lexical.isFile()) fail(`critic reference is not a regular file: ${value}`);
  return value;
}

function loadVerdictSchema(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail("critic verdict schema is unreadable"); }
}

export async function invokeCodexCriticAppServer(payload, dependencies = {}) {
  const selected = payload?.sandboxTransport;
  if (!selected || selected.requested?.runner !== "codex" || selected.requested?.model !== MODEL
    || selected.profile?.base !== ":read-only" || selected.profile?.network?.enabled !== true
    || selected.profile?.scratchRootSha256 !== selected.scratch?.sha256
    || typeof selected.scratch?.sandboxStateJson !== "string" || typeof selected.scratch?.sandboxStateSha256 !== "string"
    || typeof selected.scratch?.repoRoot !== "string" || typeof selected.scratch?.codexPath !== "string"
    || typeof selected.scratch?.path !== "string") {
    fail("selected Codex Critic transport is invalid");
  }
  if (!Array.isArray(payload?.referencePaths) || payload.referencePaths.length === 0) fail("critic references are invalid");
  const referencePaths = payload.referencePaths.map((value) => normalizedCriticReference(selected.scratch.repoRoot, value));
  if (!COMMIT_SHA.test(payload.candidateCommit) || !TREE_SHA.test(payload.candidateTree) || !COMMIT_SHA.test(payload.reviewBase)) {
    fail("critic dispatch identity is invalid");
  }
  const rolePath = physicalRulesetFile(ROLE_CONTRACT_PATH);
  const promptPath = physicalRulesetFile(PROMPT_CONTRACT_PATH);
  const verdictSchemaPath = physicalRulesetFile(VERDICT_SCHEMA_PATH);

  const invocation = (dependencies.buildSandboxInvocationFn ?? buildSandboxInvocation)({
    codexPath: selected.scratch.codexPath,
    sandboxStateJson: selected.scratch.sandboxStateJson,
    sandboxStateSha256: selected.scratch.sandboxStateSha256,
    nodePath: process.execPath,
    payloadPath: CHILD,
  });
  const spawnFn = dependencies.spawnFn ?? spawn;
  const child = spawnFn(invocation.command, invocation.argv, {
    cwd: selected.scratch.repoRoot,
    env: process.env,
    shell: false,
    detached: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const chunks = [];
  let bytes = 0;
  child.stdout.on("data", (chunk) => { bytes += chunk.length; if (bytes <= 8 * 1024 * 1024) chunks.push(chunk); });
  child.stderr.on("data", () => {});
  const close = new Promise((res) => {
    child.once("error", (error) => res({ code: null, signal: null, error: error?.code ?? "spawn-error" }));
    child.once("close", (code, signal) => res({ code, signal, error: null }));
  });
  child.stdin.end(JSON.stringify({
    codexPath: selected.scratch.codexPath,
    cwd: selected.scratch.repoRoot,
    scratchPath: selected.scratch.path,
    referencePaths,
    roleContractPath: rolePath,
    promptContractPath: promptPath,
    verdictSchemaPath,
    candidateCommit: payload.candidateCommit,
    candidateTree: payload.candidateTree,
    reviewBase: payload.reviewBase,
  }));
  const terminal = await close;
  let result = null;
  if (bytes <= 8 * 1024 * 1024) {
    const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean);
    try { if (lines.length === 1) result = JSON.parse(lines[0]); } catch { result = null; }
  }
  const protocolOk = terminal.code === 0 && terminal.signal === null && terminal.error === null
    && result?.schema === "pipeline.codex-critic-app-server-child.v1" && result.ok === true
    && result.code === "answered" && result.observed?.provider === PROVIDER && result.observed?.model === MODEL && result.observed?.effort === EFFORT
    && result.observed?.initialized === true && result.observed?.threadStarted === true
    && result.observed?.turnStarted === true && result.observed?.turnCompleted === true
    && result.observed?.stdinEnded === true && result.observed?.exitCode === 0
    && result.observed?.signal === null && result.observed?.cleanup === "complete"
    && typeof result.answer === "string";
  let verdict = null;
  if (protocolOk) {
    try { verdict = JSON.parse(result.answer); } catch { verdict = null; }
  }
  const verdictOk = protocolOk && verdict !== null && typeof verdict === "object" && !Array.isArray(verdict)
    && validateAgainstSchema(verdict, loadVerdictSchema(verdictSchemaPath)).valid;
  // Do not collapse a completed but invalid child into no-child evidence. The
  // selected-duty bridge must retain it as a started transport incident.
  if (!verdictOk) return { status: "unavailable", childStarted: terminal.error === null };
  return {
    status: "reviewed",
    verdict,
    identity: { provider: PROVIDER, modelId: MODEL, effort: EFFORT },
    sandboxExecution: {
      schema: "pipeline.codex-sandbox-host-execution.v1",
      selectionId: selected.selectionId,
      selectionSha256: selected.selectionSha256,
      repoFingerprint: selected.repoFingerprint,
      duty: selected.duty,
      dispatch: selected.dispatch,
      observed: { cliSha256: selected.toolchain.cliSha256, profileSha256: selected.profile.sha256, networkEnabled: true, scratchRootSha256: selected.profile.scratchRootSha256 },
      terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
    },
  };
}
