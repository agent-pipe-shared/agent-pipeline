#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditModuleClusterReachability, extractModuleEdges } from "./check-module-cluster-reachability.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fixture(files, run) {
  const root = mkdtempSync(join(tmpdir(), "module-reachability-"));
  try {
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), source, "utf8");
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("static imports and literal child-process targets are distinct reachable edges", () => {
  fixture({
    "plugins/pipeline-core/scripts/root.mjs": "import '../lib/imported.mjs';\nimport { spawnSync } from 'node:child_process';\nspawnSync(process.execPath, ['plugins/pipeline-core/scripts/child.mjs']);\n",
    "plugins/pipeline-core/lib/imported.mjs": "export const imported = true;\n",
    "plugins/pipeline-core/scripts/child.mjs": "export const child = true;\n",
  }, (root) => {
    const result = auditModuleClusterReachability({ root, roots: ["plugins/pipeline-core/scripts/root.mjs"] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.counts, {
      subjects: 3, frontierModules: 0, frontierRoots: 0, roots: 1, edges: 2, reachable: 3, unreachable: 0, clusters: 0,
      readinessFindingClusters: 0, deferredNativeCodexClusters: 0,
    });
  });
});

test("computed join and URL constants are resolved for all supported Node child APIs", () => {
  const importer = "plugins/pipeline-core/scripts/launcher.mjs";
  const targets = ["spawn", "spawnSync", "execFile", "execFileSync", "fork"].map((name) => `plugins/pipeline-core/scripts/${name}.mjs`);
  const subjects = new Set([importer, ...targets]);
  const source = `
    import { spawnSync, execFile, execFileSync, fork } from "node:child_process";
    import * as childProcess from "node:child_process";
    import { dirname, join } from "node:path";
    import { fileURLToPath } from "node:url";
    const DIR = dirname(fileURLToPath(import.meta.url));
    const SPAWN = join(DIR, "spawn.mjs");
    const SPAWN_SYNC = fileURLToPath(new URL("./spawnSync.mjs", import.meta.url));
    childProcess.spawn(process.execPath, [SPAWN]);
    spawnSync(process.execPath, [SPAWN_SYNC]);
    execFile(process.execPath, [join(DIR, "execFile.mjs")]);
    execFileSync(process.execPath, [join(DIR, "execFileSync.mjs")]);
    fork(join(DIR, "fork.mjs"));
  `;
  const edges = extractModuleEdges({ path: importer, source, subjects }).filter((edge) => edge.type === "child-process");
  assert.deepEqual(edges.map((edge) => [edge.operation, edge.to]), [
    ["execFile", "plugins/pipeline-core/scripts/execFile.mjs"],
    ["execFileSync", "plugins/pipeline-core/scripts/execFileSync.mjs"],
    ["fork", "plugins/pipeline-core/scripts/fork.mjs"],
    ["spawn", "plugins/pipeline-core/scripts/spawn.mjs"],
    ["spawnSync", "plugins/pipeline-core/scripts/spawnSync.mjs"],
  ]);
});

test("local child-process homonyms do not create edges without a node:child_process binding", () => {
  const importer = "plugins/pipeline-core/scripts/local-functions.mjs";
  const target = "plugins/pipeline-core/scripts/not-reachable.mjs";
  const subjects = new Set([importer, target]);
  const source = `
    function spawn() {}
    const execFile = () => {};
    function fork() {}
    spawn(process.execPath, ["${target}"]);
    execFile(process.execPath, ["${target}"]);
    fork("${target}");
  `;
  assert.deepEqual(extractModuleEdges({ path: importer, source, subjects }), []);
});

test("the real Codex pretool wrapper reaches its complete literal nested-guard set", () => {
  const importer = "plugins/pipeline-core/hooks/codex-pretool-guard.mjs";
  const expected = [
    "guard-apply-patch.mjs",
    "guard-devplan.mjs",
    "guard-gate-strength.mjs",
    "guard-git.mjs",
    "guard-lifecycle-ready.mjs",
    "guard-push.mjs",
    "guard-testpath.mjs",
  ].map((name) => `plugins/pipeline-core/hooks/${name}`);
  const subjects = new Set([importer, ...expected]);
  const source = readFileSync(join(repoRoot, importer), "utf8");
  const childTargets = extractModuleEdges({ path: importer, source, subjects })
    .filter((edge) => edge.type === "child-process")
    .map((edge) => edge.to);
  for (const target of expected) assert.ok(childTargets.includes(target), `missing real nested guard edge: ${target}`);
});

test("a wrapper with a dynamic unbound guard-name source does not turn unrelated literals into edges", () => {
  const importer = "plugins/pipeline-core/hooks/dynamic-wrapper.mjs";
  const target = "plugins/pipeline-core/hooks/guard-unbound.mjs";
  const subjects = new Set([importer, target]);
  const source = `
    import { spawnSync } from "node:child_process";
    function boundedSpawn(executable, args, options) { return spawnSync(executable, args, options); }
    const unrelatedExamples = ["guard-unbound.mjs"];
    const guardNames = readNamesFromInput();
    for (const guardName of guardNames) {
      const guard = fileURLToPath(new URL(\`./\${guardName}\`, import.meta.url));
      boundedSpawn(process.execPath, [guard], {});
    }
  `;
  const childEdges = extractModuleEdges({ path: importer, source, subjects }).filter((edge) => edge.type === "child-process");
  assert.deepEqual(childEdges, []);
});

test("the real generated consumer adapter binds its literal URL dispatcher through to baseline Verify", () => {
  const producer = "plugins/pipeline-core/scripts/verify-evidence-producer.mjs";
  const contract = "plugins/pipeline-core/lib/consumer-verify.mjs";
  const dispatcher = "plugins/pipeline-core/scripts/consumer-verify-check.mjs";
  const baseline = "plugins/pipeline-core/lib/consumer-baseline-verify.mjs";
  const subjects = new Set([producer, contract, dispatcher, baseline]);
  const edges = [producer, contract, dispatcher].flatMap((path) => extractModuleEdges({
    path,
    source: readFileSync(join(repoRoot, path), "utf8"),
    subjects,
  }));
  assert.ok(edges.some((edge) => edge.from === producer && edge.to === contract && edge.type === "module-load"));
  assert.ok(edges.some((edge) => edge.from === contract && edge.to === dispatcher
    && edge.type === "generated-dynamic-import" && edge.operation === "url-dispatcher"));
  assert.ok(edges.some((edge) => edge.from === dispatcher && edge.to === baseline && edge.type === "module-load"));
});

test("URL constants and generated imports do not bind without the complete literal dispatcher pair", () => {
  const importer = "plugins/pipeline-core/lib/generated-adapter.mjs";
  const target = "plugins/pipeline-core/scripts/target.mjs";
  const subjects = new Set([importer, target]);
  const urlOnly = `export const TASK_DISPATCHER = new URL("../scripts/target.mjs", import.meta.url).href;`;
  const dynamicUrl = `
    export const TASK_ADAPTER = \`const [dispatcher] = process.argv.slice(2); await import(dispatcher);\`;
    export const TASK_DISPATCHER = new URL(resolveAtRuntime(), import.meta.url).href;
  `;
  assert.deepEqual(extractModuleEdges({ path: importer, source: urlOnly, subjects }), []);
  assert.deepEqual(extractModuleEdges({ path: importer, source: dynamicUrl, subjects }), []);
});

test("unreachable modules are classified once as a connected cluster", () => {
  fixture({
    "plugins/pipeline-core/scripts/root.mjs": "export const root = true;\n",
    "plugins/pipeline-core/lib/cluster-a.mjs": "import './cluster-b.mjs';\n",
    "plugins/pipeline-core/lib/cluster-b.mjs": "import './cluster-a.mjs';\n",
  }, (root) => {
    const result = auditModuleClusterReachability({ root, roots: ["plugins/pipeline-core/scripts/root.mjs"] });
    assert.equal(result.ok, false);
    assert.equal(result.clusters.length, 1);
    assert.equal(result.clusters[0].classification, "unreachable-module-cluster");
    assert.equal(result.clusters[0].moduleCount, 2);
    assert.equal(result.clusters[0].readinessFinding, true);
  });
});

test("an executable verify check is a root while a test-suite registration is not", () => {
  fixture({
    "plugins/pipeline-core/scripts/live-check.mjs": "export const live = true;\n",
    "plugins/pipeline-core/scripts/tested-only.mjs": "export const tested = true;\n",
    "harness/scripts/verify.mjs": `
      const pluginScriptsDir = join(repoRoot, "plugins", "pipeline-core", "scripts");
      const TEST_SUITES = [
        { name: "live", file: join(pluginScriptsDir, "live-check.mjs") },
        { name: "tested-only", file: join(pluginScriptsDir, "tested-only.test.mjs") },
      ];
    `,
  }, (root) => {
    const result = auditModuleClusterReachability({ root });
    assert.deepEqual(result.roots, ["plugins/pipeline-core/scripts/live-check.mjs"]);
    assert.equal(result.counts.reachable, 1);
    assert.equal(result.counts.unreachable, 1);
    assert.deepEqual(result.clusters[0].paths, ["plugins/pipeline-core/scripts/tested-only.mjs"]);
  });
});

test("only registered executable Verify frontier modules propagate imports into plugin subjects", () => {
  fixture({
    "plugins/pipeline-core/lib/reached-from-frontier.mjs": "export const reached = true;\n",
    "plugins/pipeline-core/lib/test-only-target.mjs": "export const hidden = true;\n",
    "harness/scripts/executable-check.mjs": "import './frontier-helper.mjs';\n",
    "harness/scripts/frontier-helper.mjs": "import '../../plugins/pipeline-core/lib/reached-from-frontier.mjs';\n",
    "harness/scripts/test-only.test.mjs": "import '../../plugins/pipeline-core/lib/test-only-target.mjs';\n",
    "harness/scripts/verify.mjs": `
      const scriptDir = "harness/scripts";
      const TEST_SUITES = [
        { name: "frontier-check", file: join(scriptDir, "executable-check.mjs") },
        { name: "test-only", file: join(scriptDir, "test-only.test.mjs") },
      ];
    `,
  }, (root) => {
    const result = auditModuleClusterReachability({ root });
    assert.deepEqual(result.roots, ["harness/scripts/executable-check.mjs"]);
    assert.equal(result.counts.frontierRoots, 1);
    assert.equal(result.counts.reachable, 1);
    assert.equal(result.counts.unreachable, 1);
    assert.deepEqual(result.clusters[0].paths, ["plugins/pipeline-core/lib/test-only-target.mjs"]);
  });
});

test("authoritative prompt templates can name a plugin command without rooting substring neighbors", () => {
  fixture({
    "plugins/pipeline-core/scripts/dispatch-record-strip-for-critic.mjs": "export const strip = true;\n",
    "plugins/pipeline-core/scripts/not-dispatch-record-strip-for-critic.mjs": "export const other = true;\n",
    "templates/prompts/critic-review.md": "Run `node\nplugins/pipeline-core/scripts/dispatch-record-strip-for-critic.mjs\n--input packet.json`.\n",
  }, (root) => {
    const result = auditModuleClusterReachability({ root });
    assert.deepEqual(result.roots, ["plugins/pipeline-core/scripts/dispatch-record-strip-for-critic.mjs"]);
    assert.equal(result.counts.reachable, 1);
    assert.deepEqual(result.clusters[0].paths, ["plugins/pipeline-core/scripts/not-dispatch-record-strip-for-critic.mjs"]);
  });
});

test("named command roots use token boundaries rather than basename substrings", () => {
  fixture({
    "plugins/pipeline-core/scripts/foo.mjs": "export const foo = true;\n",
    "plugins/pipeline-core/scripts/not-foo.mjs": "export const notFoo = true;\n",
    "docs/usage.md": "Run `node plugins/pipeline-core/scripts/not-foo.mjs` for the real command.\n",
  }, (root) => {
    const result = auditModuleClusterReachability({ root });
    assert.deepEqual(result.roots, ["plugins/pipeline-core/scripts/not-foo.mjs"]);
    assert.equal(result.counts.reachable, 1);
    assert.deepEqual(result.clusters[0].paths, ["plugins/pipeline-core/scripts/foo.mjs"]);
  });
});

test("only concrete native Codex launch surfaces are deferred; connected offline policy and selection stay in scope", () => {
  fixture({
    "plugins/pipeline-core/scripts/root.mjs": "export const root = true;\n",
    "plugins/pipeline-core/scripts/codex-sandbox-runtime.mjs": "import './codex-sandbox-select.mjs';\n",
    "plugins/pipeline-core/scripts/codex-sandbox-select.mjs": "import '../lib/codex-sandbox-compatibility.mjs';\n",
    "plugins/pipeline-core/lib/codex-sandbox-compatibility.mjs": "export const compatibility = true;\n",
    "plugins/pipeline-core/scripts/codex-critic-app-server.mjs": "import '../lib/codex-native-critic-policy.mjs';\n",
    "plugins/pipeline-core/lib/codex-native-critic-policy.mjs": "import './codex-native-critic-tools.mjs';\n",
    "plugins/pipeline-core/lib/codex-native-critic-tools.mjs": "export const tools = true;\n",
    "plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs": "import './codex-critic-isolation.mjs';\n",
    "plugins/pipeline-core/scripts/codex-critic-isolation.mjs": "export const isolation = true;\n",
    "plugins/pipeline-core/scripts/codex-wsl-ipc-bridge.mjs": "export const ipc = true;\n",
  }, (root) => {
    const result = auditModuleClusterReachability({ root, roots: ["plugins/pipeline-core/scripts/root.mjs"] });
    assert.equal(result.ok, false);
    const deferred = result.clusters.filter((cluster) => !cluster.readinessFinding).flatMap((cluster) => cluster.paths).sort();
    assert.deepEqual(deferred, [
      "plugins/pipeline-core/scripts/codex-critic-app-server.mjs",
      "plugins/pipeline-core/scripts/codex-critic-isolation.mjs",
      "plugins/pipeline-core/scripts/codex-sandbox-runtime.mjs",
      "plugins/pipeline-core/scripts/codex-wsl-ipc-bridge.mjs",
      "plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs",
    ]);
    const inScope = result.clusters.filter((cluster) => cluster.readinessFinding).flatMap((cluster) => cluster.paths).sort();
    assert.deepEqual(inScope, [
      "plugins/pipeline-core/lib/codex-native-critic-policy.mjs",
      "plugins/pipeline-core/lib/codex-native-critic-tools.mjs",
      "plugins/pipeline-core/lib/codex-sandbox-compatibility.mjs",
      "plugins/pipeline-core/scripts/codex-sandbox-select.mjs",
    ]);
    assert.equal(result.counts.readinessFindingClusters, 2);
    assert.equal(result.scope.nativeCodexRuntime, "deferred-out-of-scope");
  });
});

test("generic sandboxed-readonly and WSL IPC modules remain Nova-B readiness findings", () => {
  fixture({
    "plugins/pipeline-core/scripts/root.mjs": "export const root = true;\n",
    "plugins/pipeline-core/scripts/sandboxed-readonly-duty.mjs": "import './wsl-ipc-profile.mjs';\n",
    "plugins/pipeline-core/scripts/wsl-ipc-profile.mjs": "export const profile = true;\n",
  }, (root) => {
    const result = auditModuleClusterReachability({ root, roots: ["plugins/pipeline-core/scripts/root.mjs"] });
    assert.equal(result.ok, false);
    assert.equal(result.counts.deferredNativeCodexClusters, 0);
    assert.equal(result.counts.readinessFindingClusters, 1);
    assert.equal(result.clusters[0].classification, "unreachable-module-cluster");
    assert.equal(result.clusters[0].readinessFinding, true);
  });
});

test("diagnostics are deterministic and bounded", () => {
  const files = { "plugins/pipeline-core/scripts/root.mjs": "export const root = true;\n" };
  for (let index = 0; index < 70; index += 1) files[`plugins/pipeline-core/lib/orphan-${String(index).padStart(2, "0")}.mjs`] = "export default true;\n";
  fixture(files, (root) => {
    const first = auditModuleClusterReachability({ root, roots: ["plugins/pipeline-core/scripts/root.mjs"] });
    const second = auditModuleClusterReachability({ root, roots: ["plugins/pipeline-core/scripts/root.mjs"] });
    assert.deepEqual(second, first);
    assert.equal(first.clusters.length, 64);
    assert.equal(first.diagnosticsTruncated, 6);
    assert.equal(first.counts.clusters, 70);
    assert.equal(first.counts.readinessFindingClusters, 70);
  });
});
