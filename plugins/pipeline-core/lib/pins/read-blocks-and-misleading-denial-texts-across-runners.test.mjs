// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item pipeline.read-blocks-and-misleading-denial-texts-across-runners (ALF-C-P15-01, AC-239).
// Original acceptance (item Acceptance, three points):
//   A1 ordinary passive reads (Read, Grep with or without glob/type filters, Glob, cat/head/rg) inside the project root,
//      scratch and user-supplied exact files are admitted, including WSL UNC paths; credential roots stay denied.
//   A2 every denial says "blocked by guard <code>" and never implies absence.
//   A3 one test matrix covers these read shapes.
// Every case runs through the real guard (evaluateLifecycleReadyGuard); nothing under test is mocked.
// Cases named "UNSATISFIED" assert the ACCEPTANCE and are RED on the current source: they are the evidence that the item
// is not yet delivered (fix site: plugins/pipeline-core/lib/guard/read-scope.mjs readToolScopeVerdict for the Grep
// glob/type/subtree shapes, plugins/pipeline-core/lib/passive-read-policy.mjs rawCandidate for WSL UNC paths).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";

// Host fact: fixtures live under the repository scratch/, never the OS temp dir.
const SCRATCH_ROOT = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
const WIN = process.platform === "win32";
const LINUX_RUN = "typed host limitation: needs a Linux/WSL host (owner Coordinator, due 2026-10-19, PO decision K7)";

function fixture() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const path = realpathSync(mkdtempSync(join(SCRATCH_ROOT, "alf-c-p15-01-")));
  mkdirSync(join(path, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(path, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  for (const dir of ["docs", "scratch", "vault"]) mkdirSync(join(path, dir), { recursive: true });
  writeFileSync(join(path, "docs", "2026-09-21-a.md"), "apply\n");
  writeFileSync(join(path, "docs", "2026-09-22-b.txt"), "apply\n");
  writeFileSync(join(path, "scratch", "notes.md"), "apply\n");
  writeFileSync(join(path, "vault", "id_rsa"), "private\n");
  return path;
}

const fwd = (p) => p.replaceAll("\\", "/");
const withFixture = (fn) => {
  const path = fixture();
  try { return fn(path); } finally { rmSync(path, { recursive: true, force: true }); }
};
const run = (input, path) => {
  const r = evaluateLifecycleReadyGuard(input, { projectDir: path });
  return { exitCode: r.exitCode, text: String(r.stderr ?? "") };
};
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

// A2 detector: a denial must name the blocking guard and a GUARD-* code, and must not claim the target is absent
// unless it carries the dedicated GUARD-READ-TARGET-MISSING code (used only for a genuinely non-existent in-root path).
function denialProblems(text) {
  const problems = [];
  if (!/^BLOCKED \(guard-[a-z-]+, plugin [a-z-]+\): GUARD-[A-Z0-9-]+/u.test(text)) problems.push("not of the form 'BLOCKED (guard-x ...): GUARD-CODE'");
  if (/not found|not present|no such file|cannot find/iu.test(text)) problems.push("implies absence");
  if (/does not exist|nothing to read/iu.test(text) && !/GUARD-READ-TARGET-MISSING/u.test(text)) problems.push("absence wording without the MISSING code");
  return problems;
}

test("P1 in-root passive reads are admitted: native Read, Glob listing, Bash cat/head/rg (incl. -g filter), scratch and docs", () => withFixture((path) => {
  const doc = join(path, "docs", "2026-09-21-a.md");
  for (const input of [
    { tool_name: "Read", tool_input: { file_path: doc } },
    { tool_name: "Read", tool_input: { file_path: "docs/2026-09-21-a.md" } },
    { tool_name: "Read", tool_input: { file_path: join(path, "scratch", "notes.md") } },
    { tool_name: "Glob", tool_input: { pattern: "docs/*" } },
    { tool_name: "Glob", tool_input: { pattern: "**/*.md", path: join(path, "docs") } },
    { tool_name: "Grep", tool_input: { pattern: "apply", path: doc } },
    bash("cat docs/2026-09-21-a.md"),
    bash("head -n 5 docs/2026-09-21-a.md"),
    bash("rg -n apply docs"),
    bash(`rg -n apply docs -g "*.md"`),
    bash(`rg -n apply ${fwd(path)}/scratch`),
  ]) {
    const r = run(input, path);
    assert.equal(r.exitCode, 0, `${JSON.stringify(input)}\n${r.text}`);
  }
}));

test("P2 credential roots and out-of-root reads stay denied on every read shape", () => withFixture((path) => {
  const secret = join(path, "vault", "id_rsa");
  for (const input of [
    { tool_name: "Read", tool_input: { file_path: secret } },
    { tool_name: "Read", tool_input: { file_path: "~/.ssh/id_rsa" } },
    { tool_name: "Grep", tool_input: { pattern: "x", path: secret } },
    { tool_name: "Glob", tool_input: { pattern: "*", path: join(path, ".git") } },
    bash("cat vault/id_rsa"),
    bash("cat ~/.ssh/id_rsa"),
  ]) {
    const r = run(input, path);
    assert.equal(r.exitCode, 2, JSON.stringify(input));
    assert.deepEqual(denialProblems(r.text), [], `${JSON.stringify(input)}\n${r.text}`);
    assert.doesNotMatch(r.text, /GUARD-READ-TARGET-MISSING/u, "an existing secret must never be reported as missing");
  }
}));

test("P3 every denial across the read shapes is a 'BLOCKED (guard ...): GUARD-<code>' text that never implies absence", () => withFixture((path) => {
  const denied = [
    { tool_name: "Read", tool_input: { file_path: join(path, "vault", "id_rsa") } },
    { tool_name: "Read", tool_input: { file_path: join(path, "..", "..", "outside.md") } },
    { tool_name: "Read", tool_input: { file_path: join(path, "docs", "missing.md") } },
    { tool_name: "Grep", tool_input: { pattern: "a", path: join(path, "docs") } },
    { tool_name: "Grep", tool_input: { pattern: "a", path: join(path, "docs", "2026-09-21-a.md"), glob: "*.md" } },
    { tool_name: "Glob", tool_input: { pattern: "../*", path } },
    bash("cat ~/.ssh/id_rsa"),
    bash("cat docs/missing-file.md"),
    bash("grep -R apply ."),
  ];
  for (const input of denied) {
    const r = run(input, path);
    if (r.exitCode === 0) continue; // an admitted shape has no denial text to audit (admission is pinned in P1/U-cases)
    assert.equal(r.exitCode, 2, JSON.stringify(input));
    assert.deepEqual(denialProblems(r.text), [], `${JSON.stringify(input)}\n${r.text}`);
  }
}));

test("P4 the A2 detector is meaningful: it flags a misleading 'not found' text and an unblocked-form text (negative control)", () => {
  assert.ok(denialProblems("File not found: docs/x.md").length >= 1);
  assert.ok(denialProblems("BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-TARGET: path not present").includes("implies absence"));
  assert.ok(denialProblems("BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-TARGET: the target does not exist").includes("absence wording without the MISSING code"));
  assert.deepEqual(denialProblems("BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-TARGET-MISSING: the target does not exist inside the project (nothing to read at that path)."), []);
});

test("P5 a genuinely missing in-root Read is labelled GUARD-READ-TARGET-MISSING while a blocked existing secret is not", () => withFixture((path) => {
  const missing = run({ tool_name: "Read", tool_input: { file_path: join(path, "docs", "nope.md") } }, path);
  assert.equal(missing.exitCode, 2);
  assert.match(missing.text, /GUARD-READ-TARGET-MISSING/u);
  const blocked = run({ tool_name: "Read", tool_input: { file_path: join(path, "vault", "id_rsa") } }, path);
  assert.equal(blocked.exitCode, 2);
  assert.match(blocked.text, /GUARD-READ-TARGET:/u);
  assert.doesNotMatch(blocked.text, /GUARD-READ-TARGET-MISSING/u);
}));

test("UNSATISFIED U1 native Grep on an exact in-repo file with a glob filter is admitted (A1: Grep with glob filters)", () => withFixture((path) => {
  const r = run({ tool_name: "Grep", tool_input: { pattern: "apply", path: join(path, "docs", "2026-09-21-a.md"), glob: "*.md" } }, path);
  assert.equal(r.exitCode, 0, r.text);
}));

test("U1b the exact-file glob lane is restricted to the project root: an exact file in a SECOND fixture root outside the project is refused with a glob", () => withFixture((path) => {
  withFixture((outside) => {
    const r = run({ tool_name: "Grep", tool_input: { pattern: "x", path: join(outside, "scratch", "notes.md"), glob: "*.md" } }, path);
    assert.equal(r.exitCode, 2, r.text);
    assert.deepEqual(denialProblems(r.text), [], r.text);
  });
}));

test("P7 a glob filter does not widen native Grep: secret file, subtree and out-of-root targets stay denied with a glob", () => withFixture((path) => {
  for (const target of [join(path, "vault", "id_rsa"), join(path, "docs"), join(path, "..", "..", "outside.md")]) {
    const r = run({ tool_name: "Grep", tool_input: { pattern: "x", path: target, glob: "*" } }, path);
    assert.equal(r.exitCode, 2, `${target}\n${r.text}`);
    assert.deepEqual(denialProblems(r.text), [], `${target}\n${r.text}`);
  }
}));

test("P6 native Grep on an exact in-repo file with a type filter is admitted (A1: Grep with type filters; the type field does not feed the selector)", () => withFixture((path) => {
  const r = run({ tool_name: "Grep", tool_input: { pattern: "apply", path: join(path, "docs", "2026-09-21-a.md"), type: "md" } }, path);
  assert.equal(r.exitCode, 0, r.text);
}));

test("U2 (PO decision 2026-10-16: REFUSE, SEC-11 exact-file rule stays) native Grep on an in-repo subtree is refused with or without a glob filter; the credential directory stays denied too", () => withFixture((path) => {
  for (const target of [join(path, "docs"), join(path, "vault")]) {
    for (const extra of [{ glob: "2026-09-2*-*.md" }, { glob: "*" }, {}]) {
      const r = run({ tool_name: "Grep", tool_input: { pattern: "apply", path: target, ...extra } }, path);
      assert.equal(r.exitCode, 2, `${target} ${JSON.stringify(extra)}\n${r.text}`);
      assert.deepEqual(denialProblems(r.text), [], `${target}\n${r.text}`);
    }
  }
}));

// ---- A3: the cross-runner matrix (Claude row above and in P1-P7; Codex and Antigravity rows below) ------------------
// The Claude row runs the lifecycle guard in-process. The Codex and Antigravity rows start the REAL native adapters
// (hooks/codex-pretool-guard.mjs, hooks/antigravity-pretool-guard.mjs) as processes with their own envelope shape,
// because that is where the text an agent reads is finally assembled. Codex has no native Read/Grep/Glob tool (its
// adapter accepts Bash, apply_patch, Edit, Write only); Antigravity maps run_command to Bash and treats its native
// read tools (view_file, list_dir, find_by_name, grep_search, ...) as read-only calls it allows at once.
const HOOKS_DIR = fileURLToPath(new URL("../../hooks/", import.meta.url));
const RUNNERS = ["claude", "codex", "antigravity"];
const ABSENCE_WORDING = /not found|not present|no such file|cannot find|does not exist/iu;

function runnerFixture() {
  const path = fixture();
  const init = spawnSync("git", ["init", "-q", path], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  return path;
}
const withRunnerFixture = (fn) => {
  const path = runnerFixture();
  try { return fn(path); } finally { rmSync(path, { recursive: true, force: true }); }
};

/** One call through a runner's real guard surface: { denied, text } where text is what the agent reads. */
function runnerDecision(runner, toolCall, path) {
  if (runner === "claude") {
    const result = run(toolCall.claude, path);
    return { denied: result.exitCode === 2, text: result.text };
  }
  const { PIPELINE_GUARD_OVERRIDE: _dropInherited, ...baseEnv } = process.env;
  const script = join(HOOKS_DIR, runner === "codex" ? "codex-pretool-guard.mjs" : "antigravity-pretool-guard.mjs");
  const envelope = runner === "codex" ? { cwd: path, session_id: "alf-c-p15-01", ...toolCall.codex } : { cwd: path, ...toolCall.antigravity };
  const child = spawnSync(process.execPath, [script], {
    cwd: path, input: JSON.stringify(envelope), encoding: "utf8", timeout: 120000,
    env: { ...baseEnv, CLAUDE_PROJECT_DIR: path },
  });
  let parsed = {};
  try { parsed = JSON.parse(String(child.stdout).trim().split("\n")[0]); } catch { parsed = {}; }
  if (runner === "codex") {
    return {
      denied: parsed?.hookSpecificOutput?.permissionDecision === "deny",
      text: String(parsed?.hookSpecificOutput?.permissionDecisionReason ?? ""),
    };
  }
  return { denied: parsed.decision === "deny", text: String(parsed.reason ?? "") };
}

const shellCall = (command, path) => ({
  claude: bash(command),
  codex: { tool_name: "Bash", tool_input: { command } },
  antigravity: { toolCall: { name: "run_command", args: { CommandLine: command, Cwd: path } } },
});

test("M1 matrix: ordinary in-root passive shell reads are admitted on Claude, Codex and Antigravity", { timeout: 300000 }, () => withRunnerFixture((path) => {
  for (const runner of RUNNERS) {
    for (const command of [
      "cat docs/2026-09-21-a.md",
      "head -n 5 docs/2026-09-21-a.md",
      "rg -n apply docs",
      `rg -n apply docs -g "*.md"`,
      `rg -n apply ${fwd(path)}/scratch`,
    ]) {
      const decision = runnerDecision(runner, shellCall(command, path), path);
      assert.equal(decision.denied, false, `${runner}: ${command}\n${decision.text}`);
    }
  }
}));

test("M2 matrix: credential and outside-root shell reads are denied on every runner with a 'BLOCKED (guard ...): GUARD-<code>' text that never implies absence", { timeout: 300000 }, () => withRunnerFixture((path) => {
  for (const runner of RUNNERS) {
    for (const command of ["cat vault/id_rsa", "cat ~/.ssh/id_rsa"]) {
      const decision = runnerDecision(runner, shellCall(command, path), path);
      assert.equal(decision.denied, true, `${runner}: ${command} must be denied`);
      assert.deepEqual(denialProblems(decision.text), [], `${runner}: ${command}\n${decision.text}`);
      assert.doesNotMatch(decision.text, /GUARD-READ-TARGET-MISSING/u, `${runner}: an existing secret must never be reported as missing`);
    }
    for (const command of ["cat docs/missing-file.md", "grep -R apply ."]) {
      const decision = runnerDecision(runner, shellCall(command, path), path);
      if (!decision.denied) continue; // an admitted shape has no denial text to audit
      assert.deepEqual(denialProblems(decision.text), [], `${runner}: ${command}\n${decision.text}`);
    }
  }
}));

test("M3 Codex row: native Read, Grep and Glob are not Codex tools; each is refused by name and never as an absent file", { timeout: 300000 }, () => withRunnerFixture((path) => {
  const doc = join(path, "docs", "2026-09-21-a.md");
  for (const [name, input] of [
    ["Read", { file_path: doc }], ["Grep", { pattern: "apply", path: doc }], ["Glob", { pattern: "docs/*" }],
  ]) {
    const decision = runnerDecision("codex", { codex: { tool_name: name, tool_input: input } }, path);
    assert.equal(decision.denied, true, name);
    assert.match(decision.text, new RegExp(`Codex tool_name "${name}"`, "u"), decision.text);
    assert.doesNotMatch(decision.text, ABSENCE_WORDING, decision.text);
  }
}));

test("M4 Antigravity row: in-root native read tools are allowed by the real adapter", { timeout: 300000 }, () => withRunnerFixture((path) => {
  const doc = join(path, "docs", "2026-09-21-a.md");
  for (const [name, args] of [
    ["view_file", { AbsolutePath: doc }], ["list_dir", { DirectoryPath: join(path, "docs") }],
    ["find_by_name", { SearchDirectory: path, Pattern: "*.md" }], ["grep_search", { SearchPath: doc, Query: "apply" }],
  ]) {
    const decision = runnerDecision("antigravity", { antigravity: { toolCall: { name, args } } }, path);
    assert.equal(decision.denied, false, `${name}\n${decision.text}`);
  }
}));

// The cases below assert the item's acceptance for the credential-read and denial-text clauses (M5, M6, M7). They were `todo`
// while their fix sites were open; each is a plain pass now (see the item).
test("M5 a native view_file of a credential file is denied on Antigravity (A1: credential roots stay denied; D87 gated the native read tools, ea69fe398)", {
  timeout: 300000,
}, () => withRunnerFixture((path) => {
  const decision = runnerDecision("antigravity", { antigravity: { toolCall: { name: "view_file", args: { AbsolutePath: join(path, "vault", "id_rsa") } } } }, path);
  assert.equal(decision.denied, true, "a credential file was admitted by the native read tool");
  assert.deepEqual(denialProblems(decision.text), [], decision.text);
  assert.match(decision.text, /GUARD-READ-CREDENTIAL-TARGET/u, "the native lane names the credential target with the typed code (K96)");
}));

test("M6 a denial surfaced on Codex does not tell the agent to use native Read, Glob or Grep tools (A2: a truthful, actionable denial; runner-neutral note, operator patch 38)", {
  timeout: 300000,
}, () => withRunnerFixture((path) => {
  // QG-04 restatement, bounded (K96, PO decision 2026-10-23, rows 6/16, M7): this case asserted GUARD-READ-COMMAND-UNSUPPORTED on
  // `cat vault/id_rsa`, a credential read, which now carries GUARD-READ-CREDENTIAL-TARGET (asserted in M7b). The criterion under test --
  // the Codex-surfaced UNSUPPORTED note names no native Read, Glob or Grep tool -- is unchanged and keeps its UNSUPPORTED assertion on a
  // command that really is refused for its own option; the credential denial is held to the same wording rule.
  const decision = runnerDecision("codex", shellCall("rg -n --column apply docs/2026-09-21-a.md", path), path);
  assert.equal(decision.denied, true, decision.text);
  assert.match(decision.text, /GUARD-READ-COMMAND-UNSUPPORTED/u, decision.text);
  assert.doesNotMatch(decision.text, /use the Read, Glob or Grep tools/u, "Codex refuses Read, Glob and Grep as unsupported tool names");
  const credential = runnerDecision("codex", shellCall("cat vault/id_rsa", path), path);
  assert.doesNotMatch(credential.text, /use the Read, Glob or Grep tools/u, credential.text);
}));

test("M7 a denied credential read never says the refusal is about flags or spelling and not about a path (A2; PO decision 2026-10-23 rows 6/16: own typed code, K96)", {
  timeout: 300000,
}, () => withRunnerFixture((path) => {
  const decision = runnerDecision("claude", shellCall("cat vault/id_rsa", path), path);
  assert.equal(decision.denied, true, decision.text);
  assert.doesNotMatch(decision.text, /refuses the command's own flags or spelling, not a path/u, decision.text);
}));

// K96 (PO decision 2026-10-23, rows 6/16, M7): an in-root credential read has its OWN typed code. It names the PATH as the cause and
// gives a repair a human or agent can actually run; it never tells the agent to change flags or spelling.
const CREDENTIAL_CODE = /GUARD-READ-CREDENTIAL-TARGET/u;

function assertCredentialTargetDenial(decision, label) {
  assert.equal(decision.denied, true, `${label}\n${decision.text}`);
  assert.match(decision.text, CREDENTIAL_CODE, `${label}\n${decision.text}`);
  assert.deepEqual(denialProblems(decision.text), [], `${label}\n${decision.text}`);
  assert.match(decision.text, /about the path/u, `${label}: names the path as the cause\n${decision.text}`);
  assert.match(decision.text, /non-credential file/u, `${label}: states the repair (a human puts the content in a non-credential file)\n${decision.text}`);
  assert.doesNotMatch(decision.text, /GUARD-READ-COMMAND-UNSUPPORTED|flags or spelling|Re-spell/u, `${label}: must not blame flags or spelling\n${decision.text}`);
}

test("M7b an in-root credential read on every shell runner carries GUARD-READ-CREDENTIAL-TARGET, names the path as the cause and gives a repair", { timeout: 300000 }, () => withRunnerFixture((path) => {
  for (const runner of RUNNERS) {
    for (const command of ["cat vault/id_rsa", "head -n 3 vault/id_rsa", "tail vault/id_rsa"]) {
      assertCredentialTargetDenial(runnerDecision(runner, shellCall(command, path), path), `${runner}: ${command}`);
    }
  }
}));

test("M7c the claude lane's credential refusal also offers the override route text of the other human-liftable refusals, and says plainly when none is offered", { timeout: 300000 }, () => withRunnerFixture((path) => {
  const decision = runnerDecision("claude", shellCall("cat vault/id_rsa", path), path);
  assert.match(decision.text, /Human override available for this exact command|No human override route is offered for this exact command/u, decision.text);
}));

test("M7d negative control: refusals that are not about a credential keep their codes (a flag the grammar does not know, an unsupported recursive grep, a missing file)", { timeout: 300000 }, () => withRunnerFixture((path) => {
  for (const runner of RUNNERS) {
    for (const command of ["rg -n --column apply docs/2026-09-21-a.md", "grep -R apply ."]) {
      const decision = runnerDecision(runner, shellCall(command, path), path);
      assert.equal(decision.denied, true, `${runner}: ${command}`);
      assert.match(decision.text, /GUARD-READ-COMMAND-UNSUPPORTED/u, `${runner}: ${command}\n${decision.text}`);
      assert.doesNotMatch(decision.text, CREDENTIAL_CODE, `${runner}: ${command} is not a credential read\n${decision.text}`);
    }
  }
  const missing = runnerDecision("claude", { claude: { tool_name: "Read", tool_input: { file_path: join(path, "docs", "missing.md") } } }, path);
  assert.equal(missing.denied, true, missing.text);
  assert.match(missing.text, /GUARD-READ-TARGET-MISSING/u, missing.text);
  assert.doesNotMatch(missing.text, CREDENTIAL_CODE, missing.text);
}));

test("M5b every Antigravity native read tool that takes a path is refused for a credential target with GUARD-READ-CREDENTIAL-TARGET and its repair; a non-credential path stays allowed (PO decision 2026-10-23, rows 6/16, M5)", { timeout: 300000 }, () => withRunnerFixture((path) => {
  const secret = join(path, "vault", "id_rsa");
  const doc = join(path, "docs", "2026-09-21-a.md");
  for (const [name, args] of [
    ["view_file", { AbsolutePath: secret }],
    ["view_file", { AbsolutePath: "vault/id_rsa" }],
    ["grep_search", { SearchPath: secret, Query: "x" }],
    ["read_url_content", { Url: `file://${secret}` }],
  ]) {
    assertCredentialTargetDenial(runnerDecision("antigravity", { antigravity: { toolCall: { name, args } } }, path), `${name} ${JSON.stringify(args)}`);
  }
  for (const [name, args] of [
    ["view_file", { AbsolutePath: doc }], ["grep_search", { SearchPath: doc, Query: "apply" }],
  ]) {
    const decision = runnerDecision("antigravity", { antigravity: { toolCall: { name, args } } }, path);
    assert.equal(decision.denied, false, `${name}: a non-credential read stays allowed\n${decision.text}`);
  }
  const missing = runnerDecision("antigravity", { antigravity: { toolCall: { name: "view_file", args: { AbsolutePath: join(path, "docs", "missing.md") } } } }, path);
  assert.doesNotMatch(missing.text, CREDENTIAL_CODE, `a missing non-credential file is not a credential refusal\n${missing.text}`);
}));

test("U3 (PO decision 2026-10-16: ADMIT) native Read of a user-supplied WSL UNC exact file is admitted; UNC credential roots and secret basenames stay denied (A1: WSL UNC paths)", {
  skip: !WIN && LINUX_RUN,
}, () => withFixture((path) => {
  for (const file of [
    "\\\\wsl.localhost\\Ubuntu\\home\\user\\report.md",
    "\\\\wsl$\\Ubuntu\\home\\user\\report.md",
  ]) {
    const r = run({ tool_name: "Read", tool_input: { file_path: file } }, path);
    assert.equal(r.exitCode, 0, `${file}\n${r.text}`);
  }
  for (const file of [
    "\\\\wsl.localhost\\Ubuntu\\home\\user\\.ssh\\id_rsa",
    "\\\\wsl.localhost\\Ubuntu\\home\\user\\.ssh\\config",
    "\\\\wsl$\\Ubuntu\\home\\user\\.aws\\credentials",
    "\\\\wsl.localhost\\Ubuntu\\home\\user\\notes\\id_ed25519",
    "\\\\wsl.localhost\\Ubuntu\\home\\user\\..\\..\\etc\\report.md",
    "\\\\wsl.localhost\\Ubuntu\\etc\\shadow",
    "\\\\wsl.localhost\\Ubuntu\\home\\user\\*.md",
  ]) {
    const r = run({ tool_name: "Read", tool_input: { file_path: file } }, path);
    assert.equal(r.exitCode, 2, `${file}\n${r.text}`);
    assert.deepEqual(denialProblems(r.text), [], `${file}\n${r.text}`);
  }
}));
