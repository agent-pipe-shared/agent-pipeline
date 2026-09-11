// SPDX-License-Identifier: SUL-1.0

/** Native one-turn Critic adapter executed inside the already-selected Codex sandbox. */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSandboxInvocation } from "./codex-sandbox-preflight.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// The directory containing scripts/, roles/, templates/ -- the executing
// plugin root, never the candidate repository (this is a source-checkout
// vendored copy or an installed marketplace copy; the two are the same
// shape either way).
const PLUGIN_ROOT = resolve(HERE, "..");
const CHILD_RELATIVE_PATH = "scripts/codex-critic-app-server-child.mjs";
const PROVIDER = "openai";
const ROLE_CONTRACT_PATH = "roles/critic.md";
const PROMPT_CONTRACT_PATH = "templates/prompts/critic-review.md";
const VERDICT_SCHEMA_PATH = "scripts/critic-verdict.schema.json";
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const TREE_SHA = /^[0-9a-f]{40,64}$/;
const MAX_OUTER_WAIT_MS = 1_230_000;
const TERM_GRACE_MS = 5_000;
const CHILD_FAILURE_CODES = new Set(["request-invalid", "prompt-invalid", "protocol-error", "write-attempt", "child-exit-error"]);
const FAILURE_CODES = new Set([...CHILD_FAILURE_CODES, "input-invalid", "ruleset-unavailable", "outer-terminal", "outer-stdout-overflow", "child-output-invalid", "route-mismatch", "lifecycle-invalid", "answer-json-invalid", "verdict-schema-invalid", "ruleset-drift"]);
const SIGNALS = new Set(["SIGHUP", "SIGINT", "SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGPIPE"]);

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

/** Resolved against the executing plugin root, never the candidate repository. */
function physicalRulesetFile(relativePath) {
  const absolute = resolve(PLUGIN_ROOT, relativePath);
  const lexical = lstatSync(absolute);
  if (lexical.isSymbolicLink() || !lexical.isFile()) fail(`Critic ruleset reference is not a regular file: ${relativePath}`);
  const physical = realpathSync(absolute);
  const rel = relative(realpathSync(PLUGIN_ROOT), physical);
  if (rel === "" || rel === ".." || rel.startsWith(`..${"/"}`)) fail(`Critic ruleset reference escapes the plugin root: ${relativePath}`);
  return physical;
}

function gitOutput(args) {
  return spawnSync("git", args, { cwd: PLUGIN_ROOT, encoding: null, shell: false, maxBuffer: 8 * 1024 * 1024 });
}

function enclosingGitCheckout() {
  let current = realpathSync(PLUGIN_ROOT);
  while (true) {
    const marker = join(current, ".git");
    if (existsSync(marker)) {
      const info = lstatSync(marker);
      if (info.isFile() || info.isDirectory() && existsSync(join(marker, "HEAD"))) return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * A source checkout must brief committed contract bytes from a completely
 * clean checkout. A Git-less install remains unavailable until an external,
 * installer-owned verifier exists; package-local inventories cannot attest
 * their own mutable bytes.
 */
function assertCommittedRuleset(files) {
  const enclosing = enclosingGitCheckout();
  if (enclosing === null) {
    fail("Critic installed ruleset is unavailable until an installer-owned verifier is implemented");
  }
  const rootResult = gitOutput(["rev-parse", "--show-toplevel"]);
  if (rootResult.error || rootResult.status !== 0) fail("Critic ruleset Git identity is unavailable");
  const gitRoot = realpathSync(rootResult.stdout.toString("utf8").trim());
  if (gitRoot !== realpathSync(enclosing)) fail("Critic ruleset Git root is ambiguous");
  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: gitRoot, encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024,
  });
  if (status.status !== 0 || status.stdout.length !== 0) fail("Critic ruleset checkout is dirty");
  const paths = files.map(({ path }) => path).map((path) => {
    const value = relative(gitRoot, path).split("\\").join("/");
    if (!value || value === ".." || value.startsWith("../")) fail("Critic ruleset checkout does not contain its contracts");
    return value;
  });
  for (let index = 0; index < paths.length; index += 1) {
    const committed = spawnSync("git", ["show", `HEAD:${paths[index]}`], { cwd: gitRoot, encoding: null, shell: false, maxBuffer: 8 * 1024 * 1024 });
    const observed = files[index].bytes;
    if (committed.status !== 0 || !committed.stdout.equals(observed)) fail("Critic ruleset executable or contract differs from committed bytes");
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: gitRoot, encoding: "utf8", shell: false });
  if (head.status !== 0 || !COMMIT_SHA.test(head.stdout.trim())) fail("Critic ruleset HEAD is unavailable");
  return { kind: "git", identity: head.stdout.trim() };
}

function separatedRulesetRoot(candidateRoot) {
  const rulesetRoot = enclosingGitCheckout();
  const candidate = realpathSync(candidateRoot);
  const ruleset = realpathSync(rulesetRoot ?? PLUGIN_ROOT);
  const nested = (parent, child) => {
    const rel = relative(parent, child);
    return rel === "" || rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\");
  };
  if (nested(candidate, ruleset) || nested(ruleset, candidate)) fail("Critic candidate and ruleset roots must be physically separate");
  return ruleset;
}

function snapshotRuleset(candidateRoot) {
  separatedRulesetRoot(candidateRoot);
  const definitions = [
    ["roleContractSha256", ROLE_CONTRACT_PATH],
    ["promptContractSha256", PROMPT_CONTRACT_PATH],
    ["verdictSchemaSha256", VERDICT_SCHEMA_PATH],
    ["childExecutableSha256", CHILD_RELATIVE_PATH],
    [null, "lib/codex-native-critic-tools.mjs"],
    [null, "lib/codex-native-critic-policy.mjs"],
    [null, "hooks/guard-command-grammar.mjs"],
  ];
  const files = definitions.map(([binding, relativePath]) => {
    const path = physicalRulesetFile(relativePath);
    return { binding, relativePath, path, bytes: readFileSync(path) };
  });
  const provenance = assertCommittedRuleset(files);
  const verdictSchema = JSON.parse(files.find(({ binding }) => binding === "verdictSchemaSha256").bytes.toString("utf8"));
  const snapshotRoot = mkdtempSync(join(tmpdir(), "pipeline-critic-ruleset-"));
  try {
    for (const file of files.slice(3)) {
      const target = join(snapshotRoot, file.relativePath);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, file.bytes, { flag: "wx", mode: 0o400 });
    }
    for (const directory of ["scripts", "lib", "hooks"]) chmodSync(join(snapshotRoot, directory), 0o500);
    chmodSync(snapshotRoot, 0o500);
  } catch (error) {
    rmSync(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
  const graph = files.slice(3).map(({ relativePath, bytes }) => ({ path: relativePath, sha256: sha256(bytes) }));
  const contractBindings = Object.fromEntries(files.slice(0, 3).map(({ binding, bytes }) => [binding, sha256(bytes)]));
  const bindings = { ...contractBindings, childExecutableSha256: graph[0].sha256, childModuleGraphSha256: sha256(`${JSON.stringify(graph)}\n`) };
  return {
    provenance,
    bindings,
    contractBindings,
    transport: Object.fromEntries(files.slice(0, 3).map(({ binding, bytes }) => [binding.replace("Sha256", "Base64"), bytes.toString("base64")])),
    verdictSchema,
    childPath: join(snapshotRoot, CHILD_RELATIVE_PATH),
    cleanup() {
      for (const directory of ["scripts", "lib", "hooks"]) {
        try { chmodSync(join(snapshotRoot, directory), 0o700); } catch {}
      }
      try { chmodSync(snapshotRoot, 0o700); } catch {}
      rmSync(snapshotRoot, { recursive: true, force: true });
    },
  };
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

function boundedFailureDiagnostic(result, terminal, stdoutBytes, stderrBytes, selected, payload, diagnosticCode) {
  const observed = result?.observed && typeof result.observed === "object" ? result.observed : {};
  const exitCode = Number.isInteger(observed.exitCode) ? observed.exitCode : null;
  const signal = SIGNALS.has(observed.signal) ? observed.signal : null;
  const outerExitCode = Number.isInteger(terminal.code) ? terminal.code : null;
  const outerSignal = SIGNALS.has(terminal.signal) ? terminal.signal : null;
  const spawnFailed = terminal.error !== null && terminal.error !== "outer-timeout";
  return {
    schema: "pipeline.codex-critic-app-server-failure.v1",
    binding: { selectionId: selected.selectionId, selectionSha256: selected.selectionSha256, candidateCommit: payload.candidateCommit, candidateTree: payload.candidateTree },
    child: {
      code: FAILURE_CODES.has(diagnosticCode) ? diagnosticCode : "child-output-invalid", started: !spawnFailed, initialized: observed.initialized === true,
      threadStarted: observed.threadStarted === true, turnStarted: observed.turnStarted === true,
      turnCompleted: observed.turnCompleted === true, stdinEnded: observed.stdinEnded === true,
      exitCode, signal, cleanup: observed.cleanup === "complete" || observed.cleanup === "incomplete" ? observed.cleanup : "unknown",
      writeAttemptKind: ["file-change", "command-action", "server-rpc-request"].includes(observed.writeAttemptKind) ? observed.writeAttemptKind : null,
    },
    outer: { exitCode: outerExitCode, signal: outerSignal, spawnFailed, stdoutBytes, stderrBytes },
  };
}

function unavailableBeforeSpawn(payload, code) {
  const selected = payload?.sandboxTransport ?? {};
  return {
    status: "unavailable",
    childStarted: false,
    failureDiagnostic: boundedFailureDiagnostic(null, { code: null, signal: null, error: "admission-refused" }, 0, 0, selected, payload ?? {}, code),
  };
}

export async function invokeCodexCriticAppServer(payload, dependencies = {}) {
  const selected = payload?.sandboxTransport;
  let referencePaths;
  let ruleset = null;
  let invocation;
  try {
    if (!selected || selected.requested?.runner !== "codex" || typeof selected.requested?.model !== "string" || selected.requested.model.length === 0
      || !selected.criticRoute || selected.criticRoute.model !== selected.requested.model || typeof selected.criticRoute.effort !== "string" || selected.criticRoute.effort.length === 0
      || selected.profile?.base !== ":read-only" || selected.profile?.network?.enabled !== true
      || selected.profile?.scratchRootSha256 !== selected.scratch?.sha256
      || typeof selected.scratch?.sandboxStateJson !== "string" || typeof selected.scratch?.sandboxStateSha256 !== "string"
      || typeof selected.scratch?.repoRoot !== "string" || typeof selected.scratch?.codexPath !== "string"
      || typeof selected.scratch?.path !== "string") fail("selected Codex Critic transport is invalid");
    if (!Array.isArray(payload?.referencePaths) || payload.referencePaths.length === 0) fail("critic references are invalid");
    referencePaths = payload.referencePaths.map((value) => normalizedCriticReference(selected.scratch.repoRoot, value));
    if (!COMMIT_SHA.test(payload.candidateCommit) || !TREE_SHA.test(payload.candidateTree) || !COMMIT_SHA.test(payload.reviewBase)) fail("critic dispatch identity is invalid");
    ruleset = snapshotRuleset(selected.scratch.repoRoot);
    invocation = (dependencies.buildSandboxInvocationFn ?? buildSandboxInvocation)({
      codexPath: selected.scratch.codexPath,
      sandboxStateJson: selected.scratch.sandboxStateJson,
      sandboxStateSha256: selected.scratch.sandboxStateSha256,
      nodePath: process.execPath,
      payloadPath: ruleset.childPath,
    });
  } catch (error) {
    try { ruleset?.cleanup(); } catch {}
    return unavailableBeforeSpawn(payload, /ruleset|checkout|committed|installer|contract/i.test(error?.message ?? "") ? "ruleset-unavailable" : "input-invalid");
  }
  const spawnFn = dependencies.spawnFn ?? spawn;
  let child;
  try {
    child = spawnFn(invocation.command, invocation.argv, {
      cwd: selected.scratch.repoRoot,
      env: process.env,
      shell: false,
      detached: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    try { ruleset.cleanup(); } catch {}
    return unavailableBeforeSpawn(payload, "outer-terminal");
  }
  const chunks = [];
  let bytes = 0;
  let stderrBytes = 0;
  child.stdout.on("data", (chunk) => { bytes += chunk.length; if (bytes <= 8 * 1024 * 1024) chunks.push(chunk); });
  child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; });
  let terminalSettled = false;
  let forceTimer = null;
  let settleTerminal;
  const close = new Promise((res) => {
    settleTerminal = (value) => { if (!terminalSettled) { terminalSettled = true; res(value); } };
    child.once("error", (error) => settleTerminal({ code: null, signal: null, error: error?.code ?? "spawn-error" }));
    child.once("close", (code, signal) => settleTerminal({ code, signal, error: null }));
  });
  const timeout = setTimeout(() => {
    try { child.stdin.destroy(); } catch {}
    try { child.kill("SIGTERM"); } catch {}
    forceTimer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      settleTerminal({ code: null, signal: "SIGKILL", error: "outer-timeout" });
    }, dependencies.outerTermGraceMs ?? TERM_GRACE_MS);
  }, dependencies.outerTimeoutMs ?? MAX_OUTER_WAIT_MS);
  const request = {
    codexPath: selected.scratch.codexPath,
    cwd: selected.scratch.repoRoot,
    scratchPath: selected.scratch.path,
    model: selected.criticRoute.model,
    effort: selected.criticRoute.effort,
    referencePaths,
    ruleset: { ...ruleset.transport, ...ruleset.contractBindings, provenance: ruleset.provenance },
    candidateCommit: payload.candidateCommit,
    candidateTree: payload.candidateTree,
    reviewBase: payload.reviewBase,
  };
  try { child.stdin.end(JSON.stringify(request)); }
  catch { try { child.kill("SIGTERM"); } catch {} }
  const terminal = await close;
  clearTimeout(timeout);
  if (forceTimer !== null) clearTimeout(forceTimer);
  try { ruleset.cleanup(); } catch {}
  let result = null;
  if (bytes <= 8 * 1024 * 1024) {
    const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean);
    try { if (lines.length === 1) result = JSON.parse(lines[0]); } catch { result = null; }
  }
  const childAnswered = result?.schema === "pipeline.codex-critic-app-server-child.v1" && result.ok === true && result.code === "answered";
  const routeOk = childAnswered && result.observed?.provider === PROVIDER && result.observed?.model === selected.criticRoute.model && result.observed?.effort === selected.criticRoute.effort;
  const lifecycleOk = routeOk && result.observed?.initialized === true && result.observed?.threadStarted === true
    && result.observed?.turnStarted === true && result.observed?.turnCompleted === true && result.observed?.stdinEnded === true
    && result.observed?.exitCode === 0 && result.observed?.signal === null && result.observed?.cleanup === "complete";
  const protocolOk = terminal.code === 0 && terminal.signal === null && terminal.error === null && lifecycleOk && typeof result.answer === "string";
  let verdict = null;
  let answerJsonOk = false;
  if (protocolOk) {
    try { verdict = JSON.parse(result.answer); answerJsonOk = true; } catch { verdict = null; }
  }
  const rulesetOk = Object.entries(ruleset.transport).every(([key, encoded]) => {
    const binding = key.replace("Base64", "Sha256");
    return sha256(Buffer.from(encoded, "base64")) === ruleset.contractBindings[binding];
  });
  const verdictOk = protocolOk && rulesetOk && verdict !== null && typeof verdict === "object" && !Array.isArray(verdict)
    && validateAgainstSchema(verdict, ruleset.verdictSchema).valid;
  // Do not collapse a completed but invalid child into no-child evidence. The
  // selected-duty bridge must retain it as a started transport incident.
  if (!verdictOk) {
    const diagnosticCode = CHILD_FAILURE_CODES.has(result?.code) ? result.code
      : bytes > 8 * 1024 * 1024 ? "outer-stdout-overflow"
        : terminal.error !== null || terminal.code !== 0 || terminal.signal !== null ? "outer-terminal"
          : !childAnswered ? "child-output-invalid"
            : !routeOk ? "route-mismatch"
              : !lifecycleOk ? "lifecycle-invalid"
                : !rulesetOk ? "ruleset-drift"
                  : !answerJsonOk ? "answer-json-invalid"
                  : "verdict-schema-invalid";
    return {
    status: "unavailable",
    childStarted: terminal.error === null || terminal.error === "outer-timeout",
    failureDiagnostic: boundedFailureDiagnostic(result, terminal, bytes, stderrBytes, selected, payload, diagnosticCode),
    };
  }
  return {
    status: "reviewed",
    verdict,
    rulesetBindings: structuredClone(ruleset.bindings),
    rulesetProvenance: structuredClone(ruleset.provenance),
    identity: { provider: PROVIDER, modelId: selected.criticRoute.model, effort: selected.criticRoute.effort },
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
