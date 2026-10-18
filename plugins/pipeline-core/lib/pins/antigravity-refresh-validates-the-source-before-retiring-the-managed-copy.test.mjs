// SPDX-License-Identifier: SUL-1.0

// Pin for AC-112 (Antigravity managed refresh), item pipeline.antigravity-1-2-13-blocks-managed-refresh.
// Observed 2026-10-18 on WSL with Antigravity CLI 1.4.2: the global topology refresh of the plugin returned
//   {"status":"partial","reason":"ATR-CLI-FAILED","completed":["uninstall"]}
// so the managed copy was removed and nothing was installed. `agy plugin validate <source plugin root>` failed with
// 8 errors, one per agent file ("agents/<name>.md: the frontmatter isn't valid YAML: ... cannot unmarshal !!str
// 'Read, G...' into []string. The loader skips this agent"): the comma-separated string form `tools: Read, Grep, Glob`
// is documented for Claude Code but is not a YAML list, which Antigravity's loader requires.
// Two repairs, one case group each:
//   B  the refresh validates the source BEFORE it retires the managed copy. A failing validation leaves the existing
//      managed copy untouched and reports "refused" (nothing changed) with ATR-CLI-FAILED and completed [];
//   A  every shipped agent definition spells `tools:` (and `disallowedTools:` when present) as a YAML flow sequence
//      of bare tool names, which both loaders accept.
// Cases:
//   1  stale managed copy + a validate that fails: no uninstall is invoked, refused/ATR-CLI-FAILED/completed [], the
//      managed copy is still observed with its stale bytes;
//   2  stale managed copy + a validate that passes: validate, uninstall, validate, install, refreshed; prepare() lists
//      the same order without invoking the CLI;
//   3  each shipped agent file has a `tools:` line (and `disallowedTools:` if present) that parses as a flow sequence of
//      bare tool names; the parser is shown to reject the comma string form;
//   4  validate passing before and failing after the uninstall stays an honest "partial" (the uninstall happened);
//   5  no managed copy + a validate that fails: nothing was changed, so the result is "refused", not "partial".
// RED discriminator: against the previous host (uninstall first) case 1 sees an `uninstall` call and a "partial"
// result; against the previous agent files case 3 sees `tools: Read, Grep, Glob`, which the parser rejects.

import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { observeAntigravityPluginTopology } from "../antigravity-plugin-topology.mjs";
import { createAntigravityRefreshHost } from "../antigravity-topology-refresh-host.mjs";

const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "agents");

// Same shape as fixture() in antigravity-topology-refresh-host.test.mjs (that file registers completion cases on import,
// so it cannot be imported): a stale managed copy, a current source, registries, an import manifest and a fake agy CLI.
function fixture(t, cliVersion = "1.4.2") {
  const base = mkdtempSync(join(tmpdir(), "agy-refresh-pin-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const configRoot = join(base, "gemini");
  const workspaceRoot = join(base, "workspace");
  const approvedSourceRoot = join(base, "source");
  const old = join(configRoot, "config", "plugins", "agent-pipeline-core");
  const foreign = join(base, "foreign");
  const put = (path, value) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, `${JSON.stringify(value)}\n`); };
  function source(path, name = "agent-pipeline-core", marker = "current") {
    mkdirSync(join(path, "hooks"), { recursive: true });
    put(join(path, "plugin.json"), { name, version: "0.7.0" });
    put(join(path, "hooks.json"), { "pipeline-core": { PreInvocation: [{ type: "command", command: "node hooks/antigravity-start-hint.mjs" }] } });
    writeFileSync(join(path, "hooks", "antigravity-start-hint.mjs"), `// metadata fixture ${marker}\n`);
    return path;
  }
  source(approvedSourceRoot);
  source(old, undefined, "stale");
  source(foreign, "foreign-plugin");
  mkdirSync(join(workspaceRoot, ".agents"), { recursive: true });
  const imports = join(configRoot, "config", "import_manifest.json");
  const global = join(configRoot, "config", "plugins.json");
  const local = join(workspaceRoot, ".agents", "plugins.json");
  put(imports, { imports: [{ name: "agent-pipeline-core", source: "antigravity" }, { name: "foreign-plugin", source: "claude" }], preserved: "import-key" });
  const unrelated = { path: foreign, enabled: false };
  put(global, { entries: [{ path: approvedSourceRoot }, unrelated], custom: { keep: true } });
  put(local, { entries: [unrelated] });
  const calls = [];
  let failValidateFrom = null;
  let validations = 0;
  const cli = (argv) => {
    calls.push([...argv]);
    if (argv[0] === "--version") return { status: "ok", version: cliVersion };
    if (argv[1] === "validate") {
      validations += 1;
      return failValidateFrom !== null && validations >= failValidateFrom ? { status: "failed" } : { status: "ok" };
    }
    if (argv[1] === "uninstall") {
      rmSync(old, { recursive: true });
      const value = JSON.parse(readFileSync(imports));
      put(imports, { ...value, imports: value.imports.filter((entry) => entry.name !== "agent-pipeline-core") });
    }
    if (argv[1] === "install") {
      cpSync(approvedSourceRoot, old, { recursive: true });
      const value = JSON.parse(readFileSync(imports));
      put(imports, { ...value, imports: [...value.imports, { name: "agent-pipeline-core", source: "antigravity" }] });
    }
    return { status: "ok" };
  };
  const args = { configRoot, workspaceRoot, approvedSourceRoot, scope: "global", globalChangeApproved: true, runCli: cli, writeInstalledReceipt: () => ({ status: "written" }) };
  return { old, imports, global, put, args, calls, failValidateFrom: (nth) => { failValidateFrom = nth; } };
}

const steps = (calls) => calls.map((argv) => argv[1]);
const STALE_HOOK = (f) => join(f.old, "hooks", "antigravity-start-hint.mjs");

test("AC-112 case 1: a source the CLI refuses to validate leaves the stale managed copy untouched (no uninstall, refused, nothing completed)", (t) => {
  const f = fixture(t);
  f.failValidateFrom(1);
  const importsBefore = readFileSync(f.imports);
  const globalBefore = readFileSync(f.global);
  const staleBefore = readFileSync(STALE_HOOK(f), "utf8");
  const result = createAntigravityRefreshHost(f.args).refresh();
  assert.equal(result.status, "refused", JSON.stringify(result));
  assert.equal(result.reason, "ATR-CLI-FAILED");
  assert.deepEqual(result.completed, []);
  assert.equal(f.calls.some((argv) => argv[1] === "uninstall"), false, "no uninstall may be invoked after a failed validation");
  assert.equal(f.calls.some((argv) => argv[1] === "install"), false);
  assert.deepEqual(steps(f.calls), [undefined, "validate"]);
  const observed = observeAntigravityPluginTopology(f.args);
  assert.equal(observed.managed.candidates.length, 1, "the managed copy is still observed");
  assert.equal(observed.managed.candidates[0].root, f.old);
  assert.notEqual(observed.managed.candidates[0].content.sha256, observed.source.content.sha256, "and it is still the stale copy");
  assert.equal(readFileSync(STALE_HOOK(f), "utf8"), staleBefore);
  assert.deepEqual(readFileSync(f.imports), importsBefore);
  assert.deepEqual(readFileSync(f.global), globalBefore);
});

test("AC-112 case 2: a source that validates is refreshed as validate, uninstall, validate, install; prepare() lists the same order", (t) => {
  const f = fixture(t);
  const host = createAntigravityRefreshHost(f.args);
  const plan = host.prepare();
  assert.equal(plan.status, "prepared", JSON.stringify(plan));
  assert.deepEqual(plan.actions.filter((action) => action.kind === "cli").map((action) => action.argv[1]), ["validate", "uninstall", "validate", "install"]);
  assert.deepEqual(f.calls, [["--version"]], "prepare() only reads the CLI version");
  const result = host.apply(plan);
  assert.equal(result.status, "refreshed", JSON.stringify(result));
  assert.deepEqual(steps(f.calls), [undefined, undefined, "validate", "uninstall", "validate", "install"], "version (prepare), version (apply), then the lifecycle");
  const uninstalled = steps(f.calls).indexOf("uninstall");
  assert.ok(steps(f.calls).indexOf("validate") < uninstalled, "validation precedes the uninstall");
  assert.ok(uninstalled < steps(f.calls).indexOf("install"), "the install follows the uninstall");
  assert.match(readFileSync(STALE_HOOK(f), "utf8"), /current/u, "the managed copy was replaced by the validated source");
});

function flowSequenceMembers(line) {
  const match = /^(?:tools|disallowedTools): \[([^[\]]*)\]$/u.exec(line);
  if (!match) return null;
  const members = match[1].split(",").map((member) => member.trim());
  return members.every((member) => /^[A-Za-z][A-Za-z0-9_]*$/u.test(member)) && new Set(members).size === members.length ? members : null;
}

function frontmatterLines(name, text) {
  const lines = text.split(/\r?\n/u);
  assert.equal(lines[0], "---", `${name} opens a frontmatter block`);
  const end = lines.indexOf("---", 1);
  assert.ok(end > 1, `${name} closes its frontmatter block`);
  return lines.slice(1, end);
}

test("AC-112 case 3: every shipped agent spells tools (and disallowedTools when present) as a YAML flow sequence of bare tool names", () => {
  assert.deepEqual(flowSequenceMembers("tools: [Read, Grep, Glob]"), ["Read", "Grep", "Glob"]);
  for (const bad of ["tools: Read, Grep, Glob", "tools: [Read, Grep, Glob", "tools: Read, Grep, Glob]", "tools: []", "tools: [Read, Read]", "tools: [Read,, Grep]", "tools: [\"Read\", Grep]", "tools: [Read, Grep] # note"]) {
    assert.equal(flowSequenceMembers(bad), null, `the parser rejects: ${bad}`);
  }
  const names = readdirSync(AGENTS_DIR).filter((entry) => entry.endsWith(".md")).sort();
  assert.ok(names.length > 0, "the agents directory ships agent definitions");
  for (const name of names) {
    const frontmatter = frontmatterLines(name, readFileSync(join(AGENTS_DIR, name), "utf8"));
    const toolLines = frontmatter.filter((line) => /^tools:/u.test(line));
    assert.equal(toolLines.length, 1, `${name} declares exactly one tools line`);
    assert.notEqual(flowSequenceMembers(toolLines[0]), null, `${name}: ${toolLines[0]}`);
    for (const line of frontmatter.filter((entry) => /^disallowedTools:/u.test(entry))) {
      assert.notEqual(flowSequenceMembers(line), null, `${name}: ${line}`);
    }
  }
});

test("AC-112 case 4: a validation that passes before and fails after the uninstall is still an honest partial", (t) => {
  const f = fixture(t);
  f.failValidateFrom(2);
  const result = createAntigravityRefreshHost(f.args).refresh();
  assert.equal(result.status, "partial", JSON.stringify(result));
  assert.equal(result.reason, "ATR-CLI-FAILED");
  assert.deepEqual(result.completed, ["uninstall"]);
  assert.deepEqual(steps(f.calls), [undefined, "validate", "uninstall", "validate"]);
});

test("AC-112 case 5: with no managed copy a failed validation changed nothing and is refused, not partial", (t) => {
  const f = fixture(t);
  rmSync(f.old, { recursive: true });
  const manifest = JSON.parse(readFileSync(f.imports));
  f.put(f.imports, { ...manifest, imports: manifest.imports.filter((entry) => entry.name !== "agent-pipeline-core") });
  f.failValidateFrom(1);
  const result = createAntigravityRefreshHost(f.args).refresh();
  assert.equal(result.status, "refused", JSON.stringify(result));
  assert.equal(result.reason, "ATR-CLI-FAILED");
  assert.deepEqual(result.completed, []);
  assert.deepEqual(steps(f.calls), [undefined, "validate"]);
  assert.equal(existsSync(f.old), false);
});
