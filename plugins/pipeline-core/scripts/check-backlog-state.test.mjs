#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, transitionHash } from "../lib/backlog-state.mjs";
import { checkBacklogState, writeBacklogProjections } from "./check-backlog-state.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const KNOWN_UNREACHABLE_BASELINE_MIGRATION_COMMIT = "933e1a8d17d6c7bed040d13f8fccca2511fff9dc";
// Also not a reachable local commit in the fixture repository, and deliberately
// NOT the allowlisted value: this proves the exception is narrowly keyed, not a
// blanket waiver for evidence.kind === "baseline-migration".
const UNRELATED_UNREACHABLE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

/** A minimal but real backlog fixture inside a real Git repository. */
function fixture({ items = [], events = [] } = {}) {
  const base = mkdtempSync(join(tmpdir(), "check-backlog-state-"));
  mkdirSync(join(base, "backlog", "items"), { recursive: true });
  // The state checker validates its projections against the shipped schemas.
  cpSync(join(REPO_ROOT, "backlog", "schemas"), join(base, "backlog", "schemas"), { recursive: true });
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: base, encoding: "utf8" });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  writeFileSync(join(base, "README.md"), "fixture\n");
  git("add", "-A");
  git("commit", "-qm", "fixture");

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
      at: event.at ?? "2026-07-20",
      actor: event.actor ?? "fixture",
      reason: "fixture baseline",
      evidence: { kind: event.kind ?? "fixture", commit: event.commit, reference: `backlog/items/${event.reference}` },
      previousHash: chain.length === 0 ? null : chain.at(-1).entryHash,
      entryHash: "",
    };
    full.entryHash = transitionHash(full);
    chain.push(full);
  }
  writeFileSync(join(base, "backlog", "transitions.ndjson"), chain.length === 0 ? "" : `${chain.map(canonicalJson).join("\n")}\n`);
  writeFileSync(join(base, "backlog", "STATUS.md"), "# placeholder\n");
  writeFileSync(join(base, "backlog", "index.json"), "{}\n");
  return { base };
}

const ITEM = (id, status, extra = {}) => ({
  name: `2026-07-20-${id}.md`,
  metadata: {
    id: `pipeline.${id}`, type: "defect", owner: "pipeline", status,
    created: "2026-07-20", source: "fixture", ...extra,
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
  check("CBS01 the known 2026-07-20 baseline-migration commit is an accepted historical exception", () => {
    const { base } = fixture({
      items: [ITEM("alpha", "open")],
      events: [{
        id: "pipeline.alpha", from: null, to: "open", reference: "2026-07-20-alpha.md",
        commit: KNOWN_UNREACHABLE_BASELINE_MIGRATION_COMMIT, actor: "backlog-migration", kind: "baseline-migration",
      }],
    });
    const written = writeBacklogProjections(base);
    assert.equal(written.ok, true, written.findings.join("; "));
    assert.equal(written.wrote, true);
    const after = checkBacklogState(base);
    assert.equal(after.ok, true, after.findings.join("; "));
  });

  check("CBS02 an unrelated unreachable evidence commit still fails — never a blanket waiver", () => {
    const { base } = fixture({
      items: [ITEM("beta", "open")],
      events: [{
        id: "pipeline.beta", from: null, to: "open", reference: "2026-07-20-beta.md",
        commit: UNRELATED_UNREACHABLE_COMMIT, actor: "backlog-migration", kind: "baseline-migration",
      }],
    });
    const result = checkBacklogState(base);
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /ledger event 1: evidence\.commit is not a reachable local Git commit/u);
  });

  check("CBS03 the exact known commit under a different actor/kind still fails — the triple must match exactly", () => {
    const { base } = fixture({
      items: [ITEM("gamma", "open")],
      events: [{
        id: "pipeline.gamma", from: null, to: "open", reference: "2026-07-20-gamma.md",
        commit: KNOWN_UNREACHABLE_BASELINE_MIGRATION_COMMIT, actor: "someone-else", kind: "baseline-migration",
      }],
    });
    const result = checkBacklogState(base);
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /ledger event 1: evidence\.commit is not a reachable local Git commit/u);
  });
} finally {
  console.log(`${passed} passed, ${failed} failed`);
}

process.exit(failed === 0 ? 0 : 1);
