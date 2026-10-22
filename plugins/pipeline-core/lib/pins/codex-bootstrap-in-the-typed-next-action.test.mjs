// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.codex-bootstrap-in-the-typed-next-action (AC-131).
//
// The original item is deliberately conditional: "After verifying the premise, include the design-readiness
// bootstrap in the fresh-host typed action." The premise (a PO hand-runs the Codex design-readiness bootstrap on
// fresh hosts, as recurring toil) was UNVERIFIED with no toil row. It was verified on 2026-10-22 and is REFUTED
// on two independent grounds, both pinned below through the real modules:
//   1. The script is not a host setup step. It is a per-design-package readiness producer: its argument contract
//      needs five committed package sources, a receipt path, an advisor preparation, a dispatch id and a session
//      descriptor (the usage string and the typed producer action), none of which exist on a fresh host.
//   2. ADR-0085 retired the design course behaviorally: `runCodexDesignReadinessBootstrap` returns
//      DESIGN-COURSE-RETIRED before parsing, state access, dispatch or publication. There is nothing to fold in.
// The fresh-host bootstrap typed next action therefore does not name the script, and must not. A case in the
// last group going RED means someone folded the script into the bootstrap action: that contradicts both
// grounds, so re-open the item with a new premise (and bind a toil record) rather than deleting this pin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DESIGN_COURSE_RETIRED, retiredDesignResult } from "../retired-design-codes.mjs";

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

test("premise is recorded as refuted: the item names the two grounds and the inventory names no recurring-toil evidence", () => {
  const item = read("backlog/items/2026-10-08-codex-bootstrap-in-the-typed-next-action.md");
  assert.match(item, /After verifying the premise, include the design-readiness\s+bootstrap in the fresh-host typed action/u);
  assert.match(item, /None measured: no toil row exists/u);
  assert.match(item, /premise refuted/iu);
  assert.match(item, /per-design-package/u);
  assert.match(item, /DESIGN-COURSE-RETIRED/u);
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

test("ground 2: the script is retired (ADR-0085) and answers before parsing, even with no arguments", async () => {
  const mod = await import(new URL(`file:///${join(PLUGIN_ROOT, "scripts", SCRIPT).split(sep).join("/")}`));
  const retired = await mod.runCodexDesignReadinessBootstrap([]);
  assert.deepEqual(retired, retiredDesignResult(DESIGN_COURSE_RETIRED));
  assert.equal(retired.ok, false);
  assert.equal(retired.implementationAuthority, false);
});

test("ground 1: the script's argument contract is per design package, nothing a fresh host has", () => {
  const source = read(`plugins/pipeline-core/scripts/${SCRIPT}`);
  const usage = /const USAGE = "([^"]+)"/u.exec(source)?.[1] ?? "";
  for (const required of ["--repo-root", "--dispatch-id", "--session-id", "--expected-descriptor-sha256", "--receipt", "--source"]) {
    assert.ok(usage.includes(required), `the usage requires ${required}`);
  }
  assert.ok(usage.includes("--advisor-preparation"), "the readiness binds an already-authored advisor preparation");
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

test("refuted premise: the fresh-host bootstrap typed next action does not fold in the Codex bootstrap", () => {
  const mentions = sourcesMentioning(PLUGIN_ROOT, SCRIPT);
  assert.deepEqual(mentions, [
    "lib/guard-maintenance-window.mjs",
    `scripts/${SCRIPT}`,
    "scripts/design-course-session.mjs",
  ], "only the script itself, its design-course producer route and the maintenance-window allowlist may name it");
  const preflight = readFileSync(join(PLUGIN_ROOT, "scripts", "pipeline-start-preflight.mjs"), "utf8");
  assert.ok(!preflight.includes(SCRIPT), "the preflight typed next action must not name the retired, per-package Codex bootstrap");
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
