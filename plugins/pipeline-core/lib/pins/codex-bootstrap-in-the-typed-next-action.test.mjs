// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.codex-bootstrap-in-the-typed-next-action (AC-131).
//
// The original item is deliberately conditional: "After verifying the premise, include the design-readiness
// bootstrap in the fresh-host typed action." The premise (a PO hand-runs the Codex design-readiness bootstrap on
// fresh hosts, as recurring toil) is recorded as UNVERIFIED with no toil row. The qualified state is therefore
// "defer retained": the existing script and its typed producer route exist, and the fresh-host bootstrap typed
// next action does NOT yet fold the script in. These cases pin that state through the real modules. A case in
// the "deferral" group going RED means someone folded the script into the bootstrap action: retarget this pin to
// the new acceptance (and bind the toil record) rather than deleting it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const SCRIPT = "codex-design-readiness-bootstrap.mjs";
const SCRATCH = join(REPO_ROOT, "scratch", "codex-bootstrap-next-action-pin");

const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8");

/** Non-test plugin sources (relative, forward-slash) that mention the bootstrap script by name. */
function sourcesMentioning(dir, needle, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "pins" || entry.name === "scratch") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { sourcesMentioning(full, needle, base, out); continue; }
    if (!/\.(mjs|js)$/u.test(entry.name) || /\.test\.mjs$/u.test(entry.name)) continue;
    if (readFileSync(full, "utf8").includes(needle)) out.push(full.slice(base.length + 1).split(sep).join("/"));
  }
  return out.sort();
}

test("premise is recorded as unverified: item and inventory name no recurring-toil evidence", () => {
  const item = read("backlog/items/2026-10-08-codex-bootstrap-in-the-typed-next-action.md");
  assert.match(item, /After verifying the premise, include the design-readiness\s+bootstrap in the fresh-host typed action/u);
  assert.match(item, /not evidenced\s+as recurring toil/u);
  assert.match(item, /None measured: no toil row exists/u);
  const inventory = read("docs/admin-steps-inventory.md");
  const row = inventory.split("\n").find((line) => line.includes("Run Codex design-readiness bootstrap script on a fresh host"));
  assert.ok(row, "inventory row exists");
  assert.match(row, /per host/u);
  assert.match(row, /PO terminal/u);
  assert.match(row, /automatable/u);
  assert.match(row, /no toil row; cited as existing script only/u);
});

test("no toil record in docs binds the Codex design-readiness bootstrap as recurring toil", () => {
  const docs = join(REPO_ROOT, "docs");
  const toilFiles = readdirSync(docs).filter((name) => /toil/iu.test(name) && name.endsWith(".md"));
  for (const name of toilFiles) {
    assert.ok(!readFileSync(join(docs, name), "utf8").includes(SCRIPT), `${name} must not bind ${SCRIPT} (premise would be verified: retarget this pin)`);
  }
});

test("the existing script is present and exports its entry point", async () => {
  assert.ok(existsSync(join(PLUGIN_ROOT, "scripts", SCRIPT)));
  const mod = await import(new URL(`file:///${join(PLUGIN_ROOT, "scripts", SCRIPT).split(sep).join("/")}`));
  assert.equal(typeof mod.runCodexDesignReadinessBootstrap, "function");
});

test("existing typed producer route: codex readiness resolves to the Codex bootstrap as a confirmed, non-shell action", async () => {
  const { buildDesignCourseProducerAction } = await import("../../scripts/design-course-session.mjs");
  mkdirSync(SCRATCH, { recursive: true });
  try {
    const sha = (c) => c.repeat(64);
    const sources = Object.fromEntries(["input", "prd", "spec", "design", "traceability"]
      .map((name, i) => [name, { path: `specs/f1/${name}.md`, sha256: sha("abcde"[i]) }]));
    const base = {
      root: SCRATCH, pluginRoot: PLUGIN_ROOT, stage: "readiness", featureId: "f1", authoringDispatchId: "auth-1",
      candidate: { commit: "1".repeat(40), tree: "2".repeat(40) }, sources, outputPrefix: "specs/f1/evidence/advisor",
      readinessDispatchId: "ready-1", queueRevision: 0, receiptPath: "specs/f1/evidence/receipt.json",
      preparationPath: "specs/f1/evidence/prep.json",
    };
    const action = buildDesignCourseProducerAction({ ...base, runner: "codex", sessionId: "sess-1", descriptorSha256: sha("f") });
    assert.equal(action.schema, "pipeline.design-course-producer-action.v1");
    assert.equal(action.producer, join(PLUGIN_ROOT, "scripts", SCRIPT));
    assert.equal(action.shell, false);
    assert.equal(action.mutation, true);
    assert.equal(action.requiresConfirmation, true, "a PO-confirmed step, not silent automation");
    assert.equal(action.implementationAuthority, false);
    assert.ok(action.argv.includes("--session-id") && action.argv.includes("--expected-descriptor-sha256"));
    assert.ok(!action.argv.includes("--runner"), "the Codex producer takes no --runner");
    // Codex-specific binding is required, so the route is real rather than a name lookup.
    assert.throws(() => buildDesignCourseProducerAction({ ...base, runner: "codex" }),
      (error) => error.code === "DESIGN-COURSE-CODEX-HOST-DESCRIPTOR-REQUIRED");
    // Another runner resolves to a different producer: the selection is runner-specific.
    const other = buildDesignCourseProducerAction({ ...base, runner: "claude" });
    assert.notEqual(other.producer, action.producer);
  } finally {
    rmSync(SCRATCH, { recursive: true, force: true });
  }
});

test("deferral: the fresh-host bootstrap typed next action does not yet fold in the Codex bootstrap", () => {
  const mentions = sourcesMentioning(PLUGIN_ROOT, SCRIPT);
  assert.deepEqual(mentions, [
    "lib/guard-maintenance-window.mjs",
    `scripts/${SCRIPT}`,
    "scripts/design-course-session.mjs",
  ], "only the script itself, its design-course producer route and the maintenance-window allowlist may name it");
  const preflight = readFileSync(join(PLUGIN_ROOT, "scripts", "pipeline-start-preflight.mjs"), "utf8");
  assert.ok(!preflight.includes(SCRIPT), "the preflight typed next action must not name the Codex bootstrap while the item is deferred");
});

test("detector self-check: the deferral scan reports a planted mention (the pin can fail)", () => {
  const dir = join(SCRATCH, "detector");
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "planted.mjs"), `export const x = "${SCRIPT}";\n`);
    writeFileSync(join(dir, "clean.mjs"), "export const y = 1;\n");
    assert.deepEqual(sourcesMentioning(dir, SCRIPT), ["planted.mjs"]);
  } finally {
    rmSync(SCRATCH, { recursive: true, force: true });
  }
});
