#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, itemPreTriageContent, transitionHash, validateBacklogItem } from "../lib/backlog-state.mjs";
import { applyBacklogItemHashRescopeAmendment, checkBacklogState, writeBacklogProjections } from "./check-backlog-state.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const KNOWN_UNREACHABLE_BASELINE_MIGRATION_COMMIT = "933e1a8d17d6c7bed040d13f8fccca2511fff9dc";
// Also not a reachable local commit in the fixture repository, and deliberately
// NOT the allowlisted value: this proves the exception is narrowly keyed, not a
// blanket waiver for evidence.kind === "baseline-migration".
const UNRELATED_UNREACHABLE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

// The seven additional pinned historical triples closed by NVA-BLDRIFT-02
// (sequences 13-38 of the 2026-07-19..2026-07-22 historical batch, none of
// them reachable local commits — plain 40-hex placeholders no repository
// contains). Deliberately syntactically valid hex, never reused from any real
// commit, so these checks never depend on this machine's own object graph.
const ADDITIONAL_PINNED_TRIPLES = [
  { commit: "8720bf3f6abfd79bbe6f42d8ff7b54211645c378", actor: "sentinel-implementation", kind: "license-boundary-recovery" },
  { commit: "a798db6d45f2fc113f66d01400d7ea70fcef9427", actor: "po", kind: "po-license-disposition" },
  { commit: "cb8219464937cfc4cb7ff50e2bf5579bfa78f6b5", actor: "close-retro", kind: "close-retro" },
  { commit: "6df2e8a068cba1e6de5410ea5fe23d2c2ca72e59", actor: "sentinel-recovery", kind: "sentinel-backlog-recovery" },
  { commit: "a09b69b11d636f424fafb98aeae948f282bb7338", actor: "sentinel-scope-extension", kind: "sentinel-scope-extension" },
  { commit: "e21933be86bea8735de7e407f94cff48cffd7bd8", actor: "pipeline", kind: "sentinel-windows-containment" },
  { commit: "e21933be86bea8735de7e407f94cff48cffd7bd8", actor: "pipeline", kind: "sentinel-windows-containment-closure" },
];
// A second, unpinned commit sharing the actor/kind of one of the pinned
// triples above — proves the extension is not a blanket waiver for that
// actor/kind pair either.
const UNRELATED_UNREACHABLE_COMMIT_2 = "fedcba9876543210fedcba9876543210fedcba98";

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
      evidence: { kind: event.kind ?? "fixture", commit: event.commit, reference: `backlog/items/${event.reference}`, ...(event.evidenceExtra ?? {}) },
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

/**
 * ADR-0068 D4 regression fixture: a managed-onboarding-success-contract item
 * whose missing-initial-ledger-repair pin (ledger event 1) does not bind the
 * item's current bytes -- the exact self-lock condition
 * applyBacklogItemHashRescopeAmendment exists to repair. `extraItems` lets a
 * caller add an item with no ledger entry of its own, to prove an unrelated
 * outstanding finding still blocks the repair rather than a blanket bypass.
 */
function managedOnboardingStalePinFixture(extraItems = []) {
  const { base } = fixture({
    items: [ITEM("managed-onboarding-success-contract", "open"), ...extraItems],
    events: [{
      id: "pipeline.managed-onboarding-success-contract", from: null, to: "open",
      reference: "2026-07-20-managed-onboarding-success-contract.md",
      commit: "a".repeat(40), actor: "hotfix-047-missing-initial-ledger-repair", kind: "missing-initial-ledger-repair",
      evidenceExtra: { itemSha256: "f".repeat(64) }, // deliberately stale: never the real item bytes
    }],
  });
  const itemBytes = readFileSync(join(base, "backlog", "items", "2026-07-20-managed-onboarding-success-contract.md"), "utf8");
  const itemSha256 = createHash("sha256").update(itemPreTriageContent(itemBytes)).digest("hex");
  return { base, itemSha256 };
}

const RESCOPE_INPUT = (base, itemSha256) => ({
  root: base,
  input: {
    id: "pipeline.managed-onboarding-success-contract",
    amendsSequence: 1,
    scope: "pre-triage",
    itemSha256,
    at: "2026-07-27",
    actor: "test-rescope",
    reason: "regression fixture re-binds the pin to the current bytes",
    rationale: "regression fixture re-binds the pin to the current bytes",
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
    assert.equal(after.drift.find((entry) => entry.finding.includes("ledger event 1"))?.knownHistoricalBatch, true);
  });

  // CBS02/03/05/06/07 (NVA-LEDGER-B, 2026-08-16): "unreachable evidence.commit" is
  // now classified DRIFT for every ledger event, known or not (the ledger is
  // append-only, so this can never be edited into compliance regardless of how it
  // got there) — the exit code no longer depends on the eight-triple table at all.
  // What the table STILL decides, narrowly, is only the `knownHistoricalBatch`
  // LABEL on an already-drift finding — proven below by asserting `false` for
  // every one of these five never-a-blanket-waiver cases.
  check("CBS02 an unrelated unreachable evidence commit is drift, not blocking, and is NOT labelled the known historical batch", () => {
    const { base } = fixture({
      items: [ITEM("beta", "open")],
      events: [{
        id: "pipeline.beta", from: null, to: "open", reference: "2026-07-20-beta.md",
        commit: UNRELATED_UNREACHABLE_COMMIT, actor: "backlog-migration", kind: "baseline-migration",
      }],
    });
    const written = writeBacklogProjections(base);
    assert.equal(written.ok, true, written.findings.join("; "));
    const result = checkBacklogState(base);
    assert.equal(result.ok, true, result.findings.join("; "));
    const drift = result.drift.find((entry) => entry.finding.includes("ledger event 1"));
    assert.match(drift?.finding ?? "", /ledger event 1: evidence\.commit is not a reachable local Git commit/u);
    assert.equal(drift?.knownHistoricalBatch, false);
    // D3: drift is reported, not swallowed — present in `drift`, absent from the
    // blocking `findings` array that decides `ok` and the process exit code.
    assert.ok(!result.findings.some((finding) => finding.includes("evidence.commit is not a reachable local Git commit")), "a drift finding must never also appear in the blocking findings array");
  });

  check("CBS03 the exact known commit under a different actor/kind is drift, but not labelled known — the triple must match exactly", () => {
    const { base } = fixture({
      items: [ITEM("gamma", "open")],
      events: [{
        id: "pipeline.gamma", from: null, to: "open", reference: "2026-07-20-gamma.md",
        commit: KNOWN_UNREACHABLE_BASELINE_MIGRATION_COMMIT, actor: "someone-else", kind: "baseline-migration",
      }],
    });
    const written = writeBacklogProjections(base);
    assert.equal(written.ok, true, written.findings.join("; "));
    const result = checkBacklogState(base);
    assert.equal(result.ok, true, result.findings.join("; "));
    const drift = result.drift.find((entry) => entry.finding.includes("ledger event 1"));
    assert.match(drift?.finding ?? "", /ledger event 1: evidence\.commit is not a reachable local Git commit/u);
    assert.equal(drift?.knownHistoricalBatch, false);
  });

  check("CBS04 each of the seven additional NVA-BLDRIFT-02 historical triples is an accepted exception", () => {
    const ids = ["delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa"];
    const items = ids.map((id) => ITEM(id, "open"));
    const events = ids.map((id, index) => ({
      id: `pipeline.${id}`, from: null, to: "open", reference: `2026-07-20-${id}.md`,
      commit: ADDITIONAL_PINNED_TRIPLES[index].commit,
      actor: ADDITIONAL_PINNED_TRIPLES[index].actor,
      kind: ADDITIONAL_PINNED_TRIPLES[index].kind,
    }));
    const { base } = fixture({ items, events });
    const written = writeBacklogProjections(base);
    assert.equal(written.ok, true, written.findings.join("; "));
    assert.equal(written.wrote, true);
    const after = checkBacklogState(base);
    assert.equal(after.ok, true, after.findings.join("; "));
    assert.equal(after.drift.length, ids.length);
    assert.ok(after.drift.every((entry) => entry.knownHistoricalBatch === true), after.drift.map((entry) => `${entry.finding} -> ${entry.knownHistoricalBatch}`).join("; "));
  });

  check("CBS05 an unreachable commit outside the pinned set is drift, but not labelled known, under a newly pinned actor/kind — never a blanket waiver", () => {
    const { base } = fixture({
      items: [ITEM("lambda", "open")],
      events: [{
        id: "pipeline.lambda", from: null, to: "open", reference: "2026-07-20-lambda.md",
        commit: UNRELATED_UNREACHABLE_COMMIT_2, actor: "sentinel-recovery", kind: "sentinel-backlog-recovery",
      }],
    });
    const written = writeBacklogProjections(base);
    assert.equal(written.ok, true, written.findings.join("; "));
    const result = checkBacklogState(base);
    assert.equal(result.ok, true, result.findings.join("; "));
    const drift = result.drift.find((entry) => entry.finding.includes("ledger event 1"));
    assert.match(drift?.finding ?? "", /ledger event 1: evidence\.commit is not a reachable local Git commit/u);
    assert.equal(drift?.knownHistoricalBatch, false);
  });

  check("CBS06 a newly pinned commit value under a different actor is drift, but not labelled known", () => {
    const { base } = fixture({
      items: [ITEM("mu", "open")],
      events: [{
        id: "pipeline.mu", from: null, to: "open", reference: "2026-07-20-mu.md",
        commit: "6df2e8a068cba1e6de5410ea5fe23d2c2ca72e59", actor: "someone-else", kind: "sentinel-backlog-recovery",
      }],
    });
    const written = writeBacklogProjections(base);
    assert.equal(written.ok, true, written.findings.join("; "));
    const result = checkBacklogState(base);
    assert.equal(result.ok, true, result.findings.join("; "));
    const drift = result.drift.find((entry) => entry.finding.includes("ledger event 1"));
    assert.match(drift?.finding ?? "", /ledger event 1: evidence\.commit is not a reachable local Git commit/u);
    assert.equal(drift?.knownHistoricalBatch, false);
  });

  check("CBS07 the pinned e21933be commit/actor pair under a third, non-pinned kind is drift, but not labelled known — kind is part of the triple too", () => {
    const { base } = fixture({
      items: [ITEM("nu", "open")],
      events: [{
        id: "pipeline.nu", from: null, to: "open", reference: "2026-07-20-nu.md",
        commit: "e21933be86bea8735de7e407f94cff48cffd7bd8", actor: "pipeline", kind: "sentinel-windows-unrelated-kind",
      }],
    });
    const written = writeBacklogProjections(base);
    assert.equal(written.ok, true, written.findings.join("; "));
    const result = checkBacklogState(base);
    assert.equal(result.ok, true, result.findings.join("; "));
    const drift = result.drift.find((entry) => entry.finding.includes("ledger event 1"));
    assert.match(drift?.finding ?? "", /ledger event 1: evidence\.commit is not a reachable local Git commit/u);
    assert.equal(drift?.knownHistoricalBatch, false);
  });

  // D2 (no severity regression): unlike the commit-format/reachability findings
  // above, a broken hash chain is evidence the LEDGER ITSELF was tampered with —
  // never DRIFT, and classifyBacklogFindings must never reclassify it. Built over
  // a synthetic fixture, never by mutating the real ledger.
  check("CBS08 a tampered previousHash is INTEGRITY — it still blocks and never appears as drift", () => {
    const { base } = fixture({
      items: [ITEM("xi", "open")],
      events: [{ id: "pipeline.xi", from: null, to: "open", reference: "2026-07-20-xi.md", commit: "a".repeat(40) }],
    });
    const ledgerPath = join(base, "backlog", "transitions.ndjson");
    const tampered = JSON.parse(readFileSync(ledgerPath, "utf8").trim());
    tampered.previousHash = "f".repeat(64);
    writeFileSync(ledgerPath, `${JSON.stringify(tampered)}\n`);
    const result = checkBacklogState(base);
    assert.equal(result.ok, false, "a tampered previousHash must still block — no severity regression");
    assert.match(result.findings.join("\n"), /previousHash does not bind the preceding ledger event/u);
    assert.ok(!(result.drift ?? []).some((entry) => entry.finding.includes("previousHash")), "hash-chain tampering must never be classified drift");
  });

  // ADR-0068 D4: the sanctioned repair path must not lock itself out the
  // moment the damage it exists to repair actually occurs.
  check("CBS09 applyBacklogItemHashRescopeAmendment succeeds when the only outstanding finding is the stale pin it resolves", () => {
    const { base, itemSha256 } = managedOnboardingStalePinFixture();
    const before = checkBacklogState(base);
    assert.equal(before.ok, false, "fixture setup must reproduce the self-lock precondition");
    assert.deepEqual(before.findings, ["ledger event 1: itemSha256 does not bind the current item bytes"]);
    const { root, input } = RESCOPE_INPUT(base, itemSha256);
    const result = applyBacklogItemHashRescopeAmendment(root, input);
    assert.equal(result.ok, true, (result.findings ?? []).join("; "));
    assert.equal(result.wrote, true);
    assert.equal(result.transition?.evidence?.kind, "item-hash-rescope-amendment");
    assert.equal(result.transition?.evidence?.amendsSequence, 1);
    const after = checkBacklogState(base);
    assert.equal(after.ok, true, after.findings.join("; "));
  });

  // Negative direction: a genuinely unrelated outstanding finding must still
  // block -- proving the tolerance is bound to this call's own
  // amendsSequence/id, never a blanket `!current.ok` bypass.
  check("CBS10 applyBacklogItemHashRescopeAmendment still refuses when an unrelated finding is also outstanding", () => {
    const { base, itemSha256 } = managedOnboardingStalePinFixture([ITEM("rescope-unrelated-orphan", "open")]);
    const before = checkBacklogState(base);
    assert.equal(before.ok, false);
    assert.equal(before.findings.length, 2, before.findings.join("; "));
    const { root, input } = RESCOPE_INPUT(base, itemSha256);
    const result = applyBacklogItemHashRescopeAmendment(root, input);
    assert.equal(result.ok, false, "an unrelated outstanding finding must still block -- never a blanket bypass");
    assert.equal(result.wrote, false);
  });

  // F2 (backlog/items/2026-08-27-phoenix-merge-re-critic-minor-findings.md): checkPhoenixHistoryImmutable
  // was reachable by no existing fixture -- fixture() never populates the archival path, so both its
  // branches ran untested. These three cases build a fixture that actually contains the path.
  check("CBS11 checkPhoenixHistoryImmutable stands down cleanly when the archival path is absent", () => {
    const { base } = fixture({
      items: [ITEM("omicron", "open")],
      events: [{ id: "pipeline.omicron", from: null, to: "open", reference: "2026-07-20-omicron.md", commit: "a".repeat(40) }],
    });
    const written = writeBacklogProjections(base);
    assert.equal(written.ok, true, written.findings.join("; "));
    // fixture() never writes backlog/transitions-phoenix-history.ndjson -- the presence gate itself.
    const result = checkBacklogState(base);
    assert.equal(result.ok, true, result.findings.join("; "));
    assert.ok(!result.findings.some((finding) => finding.includes("transitions-phoenix-history.ndjson")), result.findings.join("; "));
  });

  check("CBS12 checkPhoenixHistoryImmutable blocks as INTEGRITY when the archived bytes drift from the pin", () => {
    const { base } = fixture({
      items: [ITEM("pi", "open")],
      events: [{ id: "pipeline.pi", from: null, to: "open", reference: "2026-07-20-pi.md", commit: "a".repeat(40) }],
    });
    writeFileSync(join(base, "backlog", "transitions-phoenix-history.ndjson"), "not the preserved Phoenix archive bytes\n");
    const result = checkBacklogState(base);
    assert.equal(result.ok, false, "byte drift on the archived Phoenix ledger tail must block");
    assert.match(
      result.findings.join("\n"),
      /backlog\/transitions-phoenix-history\.ndjson: bytes changed since the Nova\/Phoenix merge \(expected sha256 [0-9a-f]{64}, got [0-9a-f]{64}\); this file is an immutable archived copy and must never be edited or appended to/u,
    );
    // INTEGRITY, never DRIFT: it must decide `ok`, not merely be reported alongside it.
    assert.ok(
      !(result.drift ?? []).some((entry) => entry.finding.includes("transitions-phoenix-history.ndjson")),
      "archival-pin drift must never be classified as ledger DRIFT",
    );
  });

  check("CBS13 checkPhoenixHistoryImmutable holds when the archived bytes match the real, currently-pinned copy", () => {
    const { base } = fixture({
      items: [ITEM("rho", "open")],
      events: [{ id: "pipeline.rho", from: null, to: "open", reference: "2026-07-20-rho.md", commit: "a".repeat(40) }],
    });
    // Real production bytes, copied rather than a second hardcoded digest -- this proves today's
    // real archival file still matches its own pin, the same fact F1's own text records.
    cpSync(
      join(REPO_ROOT, "backlog", "transitions-phoenix-history.ndjson"),
      join(base, "backlog", "transitions-phoenix-history.ndjson"),
    );
    const written = writeBacklogProjections(base);
    assert.equal(written.ok, true, written.findings.join("; "));
    const result = checkBacklogState(base);
    assert.equal(result.ok, true, result.findings.join("; "));
    assert.ok(!result.findings.some((finding) => finding.includes("bytes changed since the Nova/Phoenix merge")), result.findings.join("; "));
  });
  // NVA-DONEWHEN-2: validateBacklogItem() must admit `done_when` as a
  // recognised optional field (widened ITEM_OPTIONAL by exactly this one
  // key) without validating its VALUE -- that grammar belongs solely to
  // check-backlog-done-predicate.mjs, per `sprint`'s precedent.
  check("CBS14 an item carrying a valid done_when value validates cleanly", () => {
    const errors = validateBacklogItem({
      path: "backlog/items/2026-08-29-done-when-sigma.md",
      metadata: {
        schema: "pipeline.backlog-item.v1", id: "pipeline.done-when-sigma", type: "defect",
        owner: "pipeline", status: "open", created: "2026-08-29", source: "fixture",
        done_when: "path-exists backlog/README.md",
      },
    });
    assert.deepEqual(errors, []);
  });

  check("CBS15 an item carrying a genuinely unsupported field is still rejected -- widened by exactly one key, not disabled", () => {
    const errors = validateBacklogItem({
      path: "backlog/items/2026-08-29-done-when-tau.md",
      metadata: {
        schema: "pipeline.backlog-item.v1", id: "pipeline.done-when-tau", type: "defect",
        owner: "pipeline", status: "open", created: "2026-08-29", source: "fixture",
        done_when: "path-exists backlog/README.md",
        not_a_real_field: "anything",
      },
    });
    assert.deepEqual(errors, ["backlog/items/2026-08-29-done-when-tau.md: unsupported field not_a_real_field"]);
  });
} finally {
  console.log(`${passed} passed, ${failed} failed`);
}

process.exit(failed === 0 ? 0 : 1);
