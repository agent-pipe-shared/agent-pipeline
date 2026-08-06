#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, transitionHash } from "../lib/backlog-state.mjs";
import { checkBacklogState } from "./check-backlog-state.mjs";
import { applyBacklogReconciliation, planBacklogReconciliation } from "./reconcile-backlog-ledger.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const roots = [];

function git(dir, ...args) {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A minimal but real backlog fixture inside a real Git repository. */
function fixture({ items = [], events = [], evidenceFiles = [] } = {}) {
  const base = mkdtempSync(join(tmpdir(), "reconcile-backlog-"));
  roots.push(base);
  mkdirSync(join(base, "backlog", "items"), { recursive: true });
  mkdirSync(join(base, "backlog", "evidence"), { recursive: true });
  // The state checker validates its projections against the shipped schemas.
  cpSync(join(REPO_ROOT, "backlog", "schemas"), join(base, "backlog", "schemas"), { recursive: true });
  git(base, "init", "-q", "-b", "main");
  git(base, "config", "user.email", "fixture@example.invalid");
  git(base, "config", "user.name", "Fixture");
  for (const file of evidenceFiles) writeFileSync(join(base, "backlog", "evidence", file), "fixture evidence\n");
  writeFileSync(join(base, "README.md"), "fixture\n");
  git(base, "add", "-A");
  git(base, "commit", "-qm", "fixture");
  const head = git(base, "rev-parse", "HEAD");

  for (const item of items) {
    const meta = { schema: "pipeline.backlog-item.v1", ...item.metadata };
    const lines = Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
    writeFileSync(
      join(base, "backlog", "items", item.name),
      `---\n${lines.join("\n")}\n---\n\n# ${meta.id}\n\n## Description\n\nFixture body.\n`,
    );
  }
  const chain = [];
  for (const [index, event] of events.entries()) {
    const full = {
      schema: "pipeline.backlog-transition.v1",
      sequence: index + 1,
      id: event.id,
      from: event.from ?? null,
      to: event.to,
      at: "2026-07-01",
      actor: "fixture",
      reason: "fixture baseline",
      evidence: { kind: "fixture", commit: event.commit ?? head, reference: `backlog/items/${event.reference}` },
      previousHash: chain.length === 0 ? null : chain.at(-1).entryHash,
      entryHash: "",
    };
    full.entryHash = transitionHash(full);
    chain.push(full);
  }
  writeFileSync(join(base, "backlog", "transitions.ndjson"), chain.length === 0 ? "" : `${chain.map(canonicalJson).join("\n")}\n`);
  writeFileSync(join(base, "backlog", "STATUS.md"), "# placeholder\n");
  writeFileSync(join(base, "backlog", "index.json"), "{}\n");
  return { base, head };
}

const ITEM = (id, status, extra = {}) => ({
  name: `2026-07-01-${id}.md`,
  metadata: {
    id: `pipeline.${id}`, type: "defect", owner: "pipeline", status,
    created: "2026-07-01", source: "fixture", ...extra,
  },
});

let passed = 0;
let failed = 0;
function check(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    failed += 1;
  }
}

try {
  check("RBL01 this repository needs no reconciliation", () => {
    const plan = planBacklogReconciliation(REPO_ROOT);
    assert.equal(plan.ok, true, plan.findings.join("; "));
    assert.equal(plan.planned.length, 0, `unexpected drift: ${plan.planned.map((e) => e.id).join(", ")}`);
  });

  check("RBL02 an item absent from the ledger gets a null -> open entry", () => {
    const { base } = fixture({ items: [ITEM("alpha", "open")] });
    const plan = planBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(plan.ok, true, plan.findings.join("; "));
    assert.equal(plan.planned.length, 1);
    assert.equal(plan.planned[0].from, null);
    assert.equal(plan.planned[0].to, "open");
    assert.equal(plan.planned[0].actor, "backlog-reconciliation");
  });

  check("RBL03 a multi-step gap emits every intermediate step, never a jump", () => {
    const { base, head } = fixture({
      items: [ITEM("beta", "closed", {
        closed_at: "2026-07-02", closure_repository: "self",
        closure_commit: "PLACEHOLDER", closure_evidence: "backlog/evidence/beta.md",
      })],
      evidenceFiles: ["beta.md"],
    });
    // Rewrite the placeholder with the fixture's real commit.
    const path = join(base, "backlog", "items", "2026-07-01-beta.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("PLACEHOLDER", head));
    const plan = planBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(plan.ok, true, plan.findings.join("; "));
    assert.deepEqual(plan.planned.map((event) => [event.from, event.to]), [
      [null, "open"], ["open", "in_progress"], ["in_progress", "closed"],
    ]);
  });

  check("RBL04 a closing entry carries the item's own closure commit, not the reconciling HEAD", () => {
    const { base, head } = fixture({
      items: [ITEM("gamma", "closed", {
        closed_at: "2026-07-02", closure_repository: "self",
        closure_commit: "PLACEHOLDER", closure_evidence: "backlog/evidence/gamma.md",
      })],
      evidenceFiles: ["gamma.md"],
    });
    const path = join(base, "backlog", "items", "2026-07-01-gamma.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("PLACEHOLDER", head));
    const plan = planBacklogReconciliation(base, { at: "2026-08-06", commit: "0".repeat(40) });
    const closing = plan.planned.at(-1);
    assert.equal(closing.to, "closed");
    assert.equal(closing.evidence.commit, head);
    assert.equal(plan.planned[0].evidence.commit, "0".repeat(40));
  });

  check("RBL05 a closure whose evidence file is missing is blocked, and nothing is written", () => {
    const { base, head } = fixture({
      items: [ITEM("delta", "closed", {
        closed_at: "2026-07-02", closure_repository: "self",
        closure_commit: "PLACEHOLDER", closure_evidence: "backlog/evidence/absent.md",
      })],
    });
    const path = join(base, "backlog", "items", "2026-07-01-delta.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("PLACEHOLDER", head));
    const before = readFileSync(join(base, "backlog", "transitions.ndjson"), "utf8");
    const result = applyBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(result.ok, false);
    assert.equal(result.wrote, false);
    assert.match(result.findings.join("\n"), /closure_evidence .* is not a regular repository file/u);
    assert.equal(readFileSync(join(base, "backlog", "transitions.ndjson"), "utf8"), before);
  });

  check("RBL06 a self-closure naming a commit this repository does not have is blocked", () => {
    const { base } = fixture({
      items: [ITEM("epsilon", "closed", {
        closed_at: "2026-07-02", closure_repository: "self",
        closure_commit: "0123456789abcdef0123456789abcdef01234567",
        closure_evidence: "backlog/evidence/epsilon.md",
      })],
      evidenceFiles: ["epsilon.md"],
    });
    const result = planBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /does not exist in this repository/u);
  });

  check("RBL07 a file status behind the ledger is refused — an entry is never rewound", () => {
    const { base } = fixture({
      items: [ITEM("zeta", "open")],
      events: [{ id: "pipeline.zeta", from: null, to: "open", reference: "2026-07-01-zeta.md" },
        { id: "pipeline.zeta", from: "open", to: "in_progress", reference: "2026-07-01-zeta.md" }],
    });
    const result = planBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /is BEHIND the ledger's in_progress/u);
  });

  check("RBL08 an applied reconciliation satisfies the backlog state checker", () => {
    const { base } = fixture({
      items: [ITEM("eta", "in_progress"), ITEM("theta", "open")],
      events: [{ id: "pipeline.eta", from: null, to: "open", reference: "2026-07-01-eta.md" }],
    });
    assert.equal(checkBacklogState(base).ok, false);
    const result = applyBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(result.ok, true, result.findings.join("; "));
    assert.equal(result.wrote, true);
    const after = checkBacklogState(base);
    assert.equal(after.ok, true, after.findings.join("; "));
  });

  check("RBL09 a second run is a no-op — reconciliation is idempotent", () => {
    const { base } = fixture({
      items: [ITEM("iota", "in_progress")],
      events: [{ id: "pipeline.iota", from: null, to: "open", reference: "2026-07-01-iota.md" }],
    });
    assert.equal(applyBacklogReconciliation(base, { at: "2026-08-06" }).wrote, true);
    const second = applyBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(second.ok, true);
    assert.equal(second.wrote, false);
    assert.equal(second.planned.length, 0);
  });

  check("RBL11 existing ledger bytes are never rewritten — the write is append-only", () => {
    // Re-serialising the whole chain keeps every hash valid, which is exactly what
    // makes rewriting history a quiet failure. It also invalidates content-bound
    // external references into the file (this repository's .gitleaksignore
    // false-positive fingerprints bind path:rule:line:column).
    const { base } = fixture({
      items: [ITEM("lambda", "in_progress"), ITEM("mu", "open")],
      events: [{ id: "pipeline.lambda", from: null, to: "open", reference: "2026-07-01-lambda.md" }],
    });
    const ledger = join(base, "backlog", "transitions.ndjson");
    const before = readFileSync(ledger, "utf8");
    const result = applyBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(result.wrote, true);
    const after = readFileSync(ledger, "utf8");
    assert.equal(after.startsWith(before), true, "the prior ledger must survive verbatim as a prefix");
    assert.equal(after.slice(0, before.length), before);
    assert.equal(
      after.trimEnd().split("\n").length,
      before.trimEnd().split("\n").length + result.planned.length,
      "exactly the planned events are appended, nothing else changes",
    );
  });

  check("RBL10 the transaction journal does not survive a successful apply", () => {
    const { base } = fixture({
      items: [ITEM("kappa", "open")],
    });
    assert.equal(applyBacklogReconciliation(base, { at: "2026-08-06" }).wrote, true);
    assert.equal(existsSync(join(base, "backlog", ".reconcile-transaction.json")), false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
