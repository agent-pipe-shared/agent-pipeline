#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * A guard that never runs is not a guard, and exit 0 means "allow".
 *
 * Measured on 2026-08-06: the local marketplace root registered for development carries
 * `plugins/pipeline-core` as a SYMLINK into the checkout. Node resolves symlinks when it
 * resolves a module, so `import.meta.url` was the real path while `process.argv[1]` stayed
 * the symlinked one, and every `invokedDirectly` comparison went false. Six wired hooks and
 * the mandatory bootstrap preflight exited 0 with no output. `guard-lifecycle-ready.mjs
 * --runner bogus` -- an input that must fail closed -- returned 0 through the symlink and 2
 * through the real path.
 *
 * The earlier gate-strength round learned this lesson in the other direction: it is not
 * enough to assert that a guard REFUSES, one must also assert that it is REACHABLE. This
 * file asserts both halves of that for the entrypoint class:
 *
 *   EP01..EP06  the resolver itself, including the symlink case that regressed
 *   EP07..EP08  wired guards and the bootstrap chain, executed through a real symlink
 *   EP09        no wired script still carries one of the three fragile spellings
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isDirectInvocation } from "./entrypoint.mjs";

const LIB = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(LIB, "..");
const HOOKS = join(PLUGIN_ROOT, "hooks");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const SELF = fileURLToPath(import.meta.url);
const roots = [];

/**
 * A directory symlink, using a junction on Windows so the check needs no elevation.
 * Never skipped silently: this repository's own record shows that a check which quietly
 * opts out reads as coverage it does not have.
 */
function linkedPluginRoot() {
  const base = mkdtempSync(join(tmpdir(), "entrypoint-link-"));
  roots.push(base);
  const link = join(base, "pipeline-core");
  symlinkSync(PLUGIN_ROOT, link, platform() === "win32" ? "junction" : "dir");
  return link;
}

function run(scriptPath, argv, { input = "", cwd = REPO_ROOT, env = {} } = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...argv], {
    input,
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** The property the regression violated: the process said something, or refused. */
function observable(result) {
  return result.status !== 0 || result.stdout !== "" || result.stderr !== "";
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("EP01 the module's own path is a direct invocation", () => {
    assert.equal(isDirectInvocation(import.meta.url, SELF), true);
    assert.equal(isDirectInvocation(import.meta.url, resolve(SELF)), true);
  });

  check("EP02 a symlinked path to the same file is a direct invocation", () => {
    // The exact shape that disarmed six hooks: argv[1] points through a symlink,
    // import.meta.url is already resolved.
    const link = linkedPluginRoot();
    const linked = join(link, "lib", basename(SELF));
    assert.equal(isDirectInvocation(import.meta.url, linked), true,
      "a symlinked entrypoint must still count as direct -- this is the regression");
  });

  check("EP03 a different file is not a direct invocation", () => {
    assert.equal(isDirectInvocation(import.meta.url, join(LIB, "entrypoint.mjs")), false);
    assert.equal(isDirectInvocation(import.meta.url, join(HOOKS, "guard-push.mjs")), false);
  });

  check("EP04 an empty or non-string entrypoint is not a direct invocation", () => {
    // `undefined` is deliberately absent: it triggers the default parameter, which is the
    // documented production shape -- every call site passes only the module url.
    for (const argv1 of ["", null, 0, {}, []]) {
      assert.equal(isDirectInvocation(import.meta.url, argv1), false, `argv1=${String(argv1)}`);
    }
    // ...and that default really is process.argv[1], which here is this test file.
    assert.equal(process.argv[1], SELF);
    assert.equal(isDirectInvocation(import.meta.url), true);
    assert.equal(isDirectInvocation(pathToFileURL(join(HOOKS, "guard-push.mjs")).href), false);
  });

  check("EP05 a path that does not exist is not a direct invocation", () => {
    assert.equal(isDirectInvocation(import.meta.url, join(LIB, "no-such-file.mjs")), false);
  });

  check("EP06 a non-file module url answers false rather than throwing", () => {
    for (const url of ["data:text/javascript,0", "https://example.invalid/x.mjs", "", null]) {
      assert.equal(isDirectInvocation(url, SELF), false, `url=${String(url)}`);
    }
  });

  check("EP07 wired guards refuse identically through a symlinked plugin root", () => {
    const link = linkedPluginRoot();
    const cases = [
      {
        id: "guard-lifecycle-ready",
        rel: "hooks/guard-lifecycle-ready.mjs",
        argv: ["--runner", "bogus"],
        input: "{}",
      },
      {
        id: "guard-git",
        rel: "hooks/guard-git.mjs",
        argv: [],
        input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push --force" }, cwd: REPO_ROOT }),
      },
      {
        id: "guard-push",
        rel: "hooks/guard-push.mjs",
        argv: [],
        input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push" }, cwd: REPO_ROOT }),
      },
      {
        id: "guard-gate-strength",
        rel: "hooks/guard-gate-strength.mjs",
        argv: [],
        input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "pipeline.user.yaml" } }),
        env: { CLAUDE_PROJECT_DIR: REPO_ROOT },
      },
    ];
    for (const entry of cases) {
      const options = { input: entry.input, env: entry.env };
      const direct = run(join(PLUGIN_ROOT, entry.rel), entry.argv, options);
      const linked = run(join(link, entry.rel), entry.argv, options);
      assert.equal(observable(direct), true,
        `${entry.id}: the direct invocation produced nothing, so this case proves nothing`);
      assert.equal(linked.status, direct.status,
        `${entry.id}: exit ${linked.status} through the symlink, ${direct.status} directly`);
      assert.equal(observable(linked), true,
        `${entry.id}: silent no-op through the symlink -- exit 0 means ALLOW`);
    }
  });

  check("EP08 the bootstrap chain still speaks through a symlinked plugin root", () => {
    // A bootstrap that fails silently is worse than one that fails loudly: the agent
    // proceeds to ordinary work believing it was admitted.
    const link = linkedPluginRoot();
    const cases = [
      { id: "pipeline-start-preflight", rel: "scripts/pipeline-start-preflight.mjs", argv: [], schema: "pipeline.start-preflight.v1" },
      {
        id: "project-onboarding-v3",
        rel: "scripts/project-onboarding-v3.mjs",
        argv: ["inspect", "--root", REPO_ROOT, "--intent", "bootstrap", "--runner", "claude"],
        schema: "pipeline.project-onboarding.v4",
      },
    ];
    for (const entry of cases) {
      const direct = run(join(PLUGIN_ROOT, entry.rel), entry.argv);
      const linked = run(join(link, entry.rel), entry.argv);
      assert.equal(observable(direct), true, `${entry.id}: direct invocation produced nothing`);
      assert.equal(linked.status, direct.status, `${entry.id}: exit code differs through the symlink`);
      // The payload itself differs by design (it reports the plugin root it was reached
      // through), so the assertion is on the schema, not on byte equality.
      for (const [label, result] of [["direct", direct], ["symlinked", linked]]) {
        assert.equal(JSON.parse(result.stdout)?.schema, entry.schema,
          `${entry.id}: ${label} invocation did not emit ${entry.schema}`);
      }
    }
  });

  check("EP09 no wired hook or bootstrap script carries a symlink-fragile entrypoint", () => {
    // The three spellings that were all wrong the same way. This is the check that stops
    // the class coming back one file at a time.
    const fragile = [
      /resolve\(fileURLToPath\(import\.meta\.url\)\)\s*===\s*resolve\(process\.argv\[1\]\)/u,
      /fileURLToPath\(import\.meta\.url\)\s*===\s*resolve\(process\.argv\[1\]\)/u,
      /import\.meta\.url\s*===\s*pathToFileURL\(process\.argv\[1\]\)\.href/u,
    ];
    const wiredCommands = JSON.stringify(JSON.parse(readFileSync(join(HOOKS, "hooks.json"), "utf8")));
    const wired = readdirSync(HOOKS)
      .filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"))
      .filter((name) => wiredCommands.includes(name));
    assert.ok(wired.length >= 8, `expected the wired hook set, found ${wired.length}`);
    const targets = [
      ...wired.map((name) => join(HOOKS, name)),
      join(PLUGIN_ROOT, "scripts", "pipeline-start-preflight.mjs"),
      join(PLUGIN_ROOT, "scripts", "project-onboarding-v3.mjs"),
    ];
    for (const target of targets) {
      const source = readFileSync(target, "utf8");
      for (const pattern of fragile) {
        assert.doesNotMatch(source, pattern,
          `${basename(target)} still compares an unresolved argv[1] against a resolved import.meta.url`);
      }
    }
  });

  check("EP10 pathToFileURL is not left imported where it is no longer used", () => {
    // Cheap hygiene, but it is also the tell that a file was half-converted.
    for (const name of readdirSync(HOOKS).filter((entry) => entry.endsWith(".mjs"))) {
      const source = readFileSync(join(HOOKS, name), "utf8");
      if (!/import\s*\{[^}]*\bpathToFileURL\b[^}]*\}\s*from\s*"node:url"/u.test(source)) continue;
      const uses = source.split("pathToFileURL").length - 1;
      assert.ok(uses > 1, `${name} imports pathToFileURL without using it`);
    }
  });

  console.log(`\nentrypoint: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
