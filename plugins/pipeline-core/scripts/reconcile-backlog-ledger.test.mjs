#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, transitionHash } from "../lib/backlog-state.mjs";
import { checkBacklogState, repositoryTrackingState } from "./check-backlog-state.mjs";
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
      `---\n${lines.join("\n")}\n---\n\n# ${meta.id}\n\n## Description\n\nFixture body.\n${item.body ?? ""}`,
    );
  }
  // Committed as its own step, separate from the "fixture" commit above: the tool's
  // primary, documented use case is reconciling item files that were already
  // committed in the past (edited-Markdown-directly drift), so a realistic fixture
  // must give the item files a real, containing commit too — the same property
  // resolveItemFileCommit() now requires before it will cite the baseline as
  // evidence for a non-closing step.
  if (items.length > 0) {
    git(base, "add", "-A");
    git(base, "commit", "-qm", "items");
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

const ITEM = (id, status, extra = {}, body = "") => ({
  name: `2026-07-01-${id}.md`,
  metadata: {
    id: `pipeline.${id}`, type: "defect", owner: "pipeline", status,
    created: "2026-07-01", source: "fixture", ...extra,
  },
  body,
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
    // The item's own closure_commit (head) is deliberately the PRE-items commit —
    // real, but distinct from the reconciliation baseline (the "items" commit
    // fixture() adds afterward), so a match on `head` can only come from
    // resolveClosureCommit(), never from a baseline pass-through.
    const baseline = git(base, "rev-parse", "HEAD");
    assert.notEqual(baseline, head, "the fixture must give the baseline and the closure_commit different values");
    const plan = planBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(plan.ok, true, plan.findings.join("; "));
    const closing = plan.planned.at(-1);
    assert.equal(closing.to, "closed");
    assert.equal(closing.evidence.commit, head);
    assert.equal(plan.planned[0].evidence.commit, baseline, "a non-closing step cites the baseline once it genuinely contains the item file");
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

  check("RBL12 a closing entry's reason names the closure sync, not the generic disclaimer", () => {
    const { base, head } = fixture({
      items: [ITEM("nu", "closed", {
        closed_at: "2026-07-02", closure_repository: "self",
        closure_commit: "PLACEHOLDER", closure_evidence: "backlog/evidence/nu.md",
      })],
      evidenceFiles: ["nu.md"],
    });
    const path = join(base, "backlog", "items", "2026-07-01-nu.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("PLACEHOLDER", head));
    const plan = planBacklogReconciliation(base, { at: "2026-08-06" });
    assert.equal(plan.ok, true, plan.findings.join("; "));
    const nonClosing = plan.planned.filter((event) => event.to !== "closed");
    const closing = plan.planned.filter((event) => event.to === "closed");
    assert.ok(nonClosing.length > 0 && closing.length > 0);
    for (const event of nonClosing) assert.match(event.reason, /claims no implementation, no review, and no closure/u);
    for (const event of closing) assert.match(event.reason, /attests the sync to that pre-existing closure record/u);
  });

  check("RBL13 a closure whose evidence exists but is untracked is blocked, and nothing is written", () => {
    // The failure this closes: `git add` refusing the file is loud, but simply
    // LEAVING it untracked was silent — the local run went green and every other
    // checkout got a closure bound to evidence it cannot read.
    const { base, head } = fixture({
      items: [ITEM("xi", "closed", {
        closed_at: "2026-07-02", closure_repository: "self",
        closure_commit: "PLACEHOLDER", closure_evidence: "backlog/evidence/xi.md",
      })],
    });
    const path = join(base, "backlog", "items", "2026-07-01-xi.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("PLACEHOLDER", head));
    // Written AFTER the fixture commit, so it is present on disk and absent from the index.
    writeFileSync(join(base, "backlog", "evidence", "xi.md"), "untracked evidence\n");
    const before = readFileSync(join(base, "backlog", "transitions.ndjson"), "utf8");
    const result = applyBacklogReconciliation(base, { at: "2026-08-09" });
    assert.equal(result.ok, false);
    assert.equal(result.wrote, false);
    assert.match(result.findings.join("\n"), /exists but is not tracked by Git/u);
    assert.match(result.findings.join("\n"), /git add backlog\/evidence\/xi\.md/u, "the refusal must name the command that clears it");
    assert.equal(readFileSync(join(base, "backlog", "transitions.ndjson"), "utf8"), before);
  });

  check("RBL14 staging that same evidence clears the refusal — no commit required", () => {
    const { base, head } = fixture({
      items: [ITEM("omicron", "closed", {
        closed_at: "2026-07-02", closure_repository: "self",
        closure_commit: "PLACEHOLDER", closure_evidence: "backlog/evidence/omicron.md",
      })],
    });
    const path = join(base, "backlog", "items", "2026-07-01-omicron.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("PLACEHOLDER", head));
    writeFileSync(join(base, "backlog", "evidence", "omicron.md"), "evidence\n");
    assert.equal(planBacklogReconciliation(base, { at: "2026-08-09" }).ok, false);
    // Trackedness is index membership, not HEAD membership: the ordinary flow writes
    // the evidence, stages it, reconciles, and commits everything in one commit.
    git(base, "add", "backlog/evidence/omicron.md");
    const plan = planBacklogReconciliation(base, { at: "2026-08-09" });
    assert.equal(plan.ok, true, plan.findings.join("; "));
    assert.equal(plan.planned.at(-1).to, "closed");
  });

  check("RBL15 the trackedness reader is three-valued — outside a work tree it answers indeterminate", () => {
    // A project that keeps a backlog without Git must not be told every one of its
    // citations is broken. `git ls-files` cannot answer there; the question is
    // unavailable, and only `untracked` is allowed to become a finding.
    const { base } = fixture({ items: [ITEM("pi", "open")], evidenceFiles: ["pi.md"] });
    assert.equal(repositoryTrackingState(base, "backlog/evidence/pi.md"), "tracked");
    assert.equal(repositoryTrackingState(base, "backlog/evidence/absent.md"), "absent");
    writeFileSync(join(base, "backlog", "evidence", "rho.md"), "written after the commit\n");
    assert.equal(repositoryTrackingState(base, "backlog/evidence/rho.md"), "untracked");
    rmSync(join(base, ".git"), { recursive: true, force: true });
    assert.equal(repositoryTrackingState(base, "backlog/evidence/pi.md"), "indeterminate");
    assert.equal(repositoryTrackingState(base, "backlog/evidence/absent.md"), "absent");
  });

  check("RBL10 the transaction journal does not survive a successful apply", () => {
    const { base } = fixture({
      items: [ITEM("kappa", "open")],
    });
    assert.equal(applyBacklogReconciliation(base, { at: "2026-08-06" }).wrote, true);
    assert.equal(existsSync(join(base, "backlog", ".reconcile-transaction.json")), false);
  });

  check("RBL16 (D5) a closing entry's evidence.commit is normalized to the full 40-character OID, never the item's abbreviated form", () => {
    // Directly the historical failure this closes: backlog/items/2026-08-12-ledger-
    // event-403-has-a-short-hash-evidence-commit.md — a short closure_commit reached
    // the ledger verbatim and, being append-only, could never be corrected afterward.
    const { base, head } = fixture({
      items: [ITEM("sigma", "closed", {
        closed_at: "2026-07-02", closure_repository: "self",
        closure_commit: "PLACEHOLDER", closure_evidence: "backlog/evidence/sigma.md",
      })],
      evidenceFiles: ["sigma.md"],
    });
    const path = join(base, "backlog", "items", "2026-07-01-sigma.md");
    // The item's OWN closure_commit is deliberately the SHORT, abbreviated form —
    // exactly the shape that produced event 403's permanent drift.
    writeFileSync(path, readFileSync(path, "utf8").replace("PLACEHOLDER", head.slice(0, 8)));
    const plan = planBacklogReconciliation(base, { at: "2026-08-09" });
    assert.equal(plan.ok, true, plan.findings.join("; "));
    const closing = plan.planned.at(-1);
    assert.equal(closing.to, "closed");
    assert.equal(closing.evidence.commit, head, "the appended event must carry the full OID, not the item's abbreviated form");
    assert.equal(closing.evidence.commit.length, 40);
    assert.match(closing.evidence.commit, /^[a-f0-9]{40}$/u);
  });

  check("RBL17 (D6) the writer refuses to append an event that would fail the checker's own event validator", () => {
    // readItems() intentionally trusts the item file's own id without re-running
    // validateBacklogItem (that would re-diagnose every historical drift on every
    // read). A malformed id therefore only surfaces here, at the same per-event
    // shape gate the checker itself applies before the event is ever written.
    const { base } = fixture({ items: [ITEM("Tau.Invalid-ID", "open")] });
    const before = readFileSync(join(base, "backlog", "transitions.ndjson"), "utf8");
    const plan = planBacklogReconciliation(base, { at: "2026-08-09" });
    assert.equal(plan.ok, false);
    assert.match(plan.findings.join("\n"), /refusing to append an event that would fail the state checker's own event validator/u);
    assert.match(plan.findings.join("\n"), /id must be a lowercase stable identifier/u);
    const applied = applyBacklogReconciliation(base, { at: "2026-08-09" });
    assert.equal(applied.ok, false);
    assert.equal(applied.wrote, false);
    assert.equal(readFileSync(join(base, "backlog", "transitions.ndjson"), "utf8"), before, "nothing is written when the candidate event is refused");
  });

  check("RBL18 a fresh item's first (open) ledger event's evidence.commit genuinely contains the item file", () => {
    // Directly the defect closed here: backlog/items/2026-08-18-reconcile-backlog-
    // ledger-evidence-commit-predates-referenced-file.md. Once the item file has a
    // real, containing commit (fixture()'s "items" commit), the planned "open"
    // event's evidence.commit must resolve to a commit whose tree actually holds
    // the file — not merely a well-formed OID.
    const { base } = fixture({ items: [ITEM("upsilon", "open")] });
    const plan = planBacklogReconciliation(base, { at: "2026-08-18" });
    assert.equal(plan.ok, true, plan.findings.join("; "));
    const opened = plan.planned[0];
    assert.equal(opened.to, "open");
    const lsTree = git(base, "ls-tree", opened.evidence.commit, "--", "backlog/items/2026-07-01-upsilon.md");
    assert.notEqual(lsTree, "", "evidence.commit must actually contain the referenced item file");
  });

  check("RBL19 an item file not yet reachable from the baseline is refused, not silently cited as evidence", () => {
    // The exact pre-fix failure mode: an item file that exists only in the
    // working tree (added AFTER the reconciliation baseline, not yet committed)
    // — unconditionally pinning the baseline there produced an "open" event
    // whose evidence.commit provably does not contain the file it references.
    const { base } = fixture({});
    mkdirSync(join(base, "backlog", "items"), { recursive: true });
    writeFileSync(
      join(base, "backlog", "items", "2026-08-18-phi.md"),
      "---\nschema: \"pipeline.backlog-item.v1\"\nid: \"pipeline.phi\"\ntype: \"defect\"\nowner: \"pipeline\"\nstatus: \"open\"\ncreated: \"2026-08-18\"\nsource: \"fixture\"\n---\n\n# pipeline.phi\n\n## Description\n\nFixture body.\n",
    );
    const before = readFileSync(join(base, "backlog", "transitions.ndjson"), "utf8");
    const plan = planBacklogReconciliation(base, { at: "2026-08-18" });
    assert.equal(plan.ok, false);
    assert.match(plan.findings.join("\n"), /does not yet contain this item file/u);
    const applied = applyBacklogReconciliation(base, { at: "2026-08-18" });
    assert.equal(applied.ok, false);
    assert.equal(applied.wrote, false);
    assert.equal(readFileSync(join(base, "backlog", "transitions.ndjson"), "utf8"), before, "nothing is written when the item file's baseline containment cannot be confirmed");
  });

  check("RBL20 the generated index.json projects an item's own tracking value verbatim, and omits it when absent", () => {
    const { base } = fixture({
      items: [
        ITEM("chi", "open", { tracking: "specs/foo/plan.md" }),
        ITEM("psi", "open"),
      ],
    });
    const result = applyBacklogReconciliation(base, { at: "2026-08-19" });
    assert.equal(result.ok, true, result.findings.join("; "));
    const index = JSON.parse(readFileSync(join(base, "backlog", "index.json"), "utf8"));
    const chi = index.items.find((entry) => entry.id === "pipeline.chi");
    const psi = index.items.find((entry) => entry.id === "pipeline.psi");
    assert.equal(chi.tracking, "specs/foo/plan.md");
    assert.equal(Object.hasOwn(psi, "tracking"), false, "an item with no tracking value must omit the field, never null/empty string");
  });

  check("RBL21 the generated index.json marks a Decision: deferred Triage item as deferred: true", () => {
    const { base } = fixture({
      items: [
        ITEM("omega", "open", {}, "\n## Triage\n\n- **Decision:** deferred — owned by another sprint.\n"),
      ],
    });
    const result = applyBacklogReconciliation(base, { at: "2026-08-19" });
    assert.equal(result.ok, true, result.findings.join("; "));
    const index = JSON.parse(readFileSync(join(base, "backlog", "index.json"), "utf8"));
    const omega = index.items.find((entry) => entry.id === "pipeline.omega");
    assert.equal(omega.deferred, true);
  });

  check("RBL22 an item with no Triage section, or a Triage Decision that is not deferred, projects deferred: false", () => {
    const { base } = fixture({
      items: [
        ITEM("notriage", "open"),
        ITEM("acceptedtriage", "open", {}, "\n## Triage\n\n- **Decision:** accepted — scheduled.\n"),
      ],
    });
    const result = applyBacklogReconciliation(base, { at: "2026-08-19" });
    assert.equal(result.ok, true, result.findings.join("; "));
    const index = JSON.parse(readFileSync(join(base, "backlog", "index.json"), "utf8"));
    const noTriage = index.items.find((entry) => entry.id === "pipeline.notriage");
    const accepted = index.items.find((entry) => entry.id === "pipeline.acceptedtriage");
    assert.equal(noTriage.deferred, false);
    assert.equal(accepted.deferred, false);
  });

  check("RBL13 an open -> rejected transition reconciles cleanly, admitting open first", () => {
    const { base } = fixture({ items: [ITEM("xi", "rejected")] });
    const plan = planBacklogReconciliation(base, { at: "2026-08-17" });
    assert.equal(plan.ok, true, plan.findings.join("; "));
    assert.deepEqual(plan.planned.map((event) => [event.from, event.to]), [[null, "open"], ["open", "rejected"]]);
    const applied = applyBacklogReconciliation(base, { at: "2026-08-17" });
    assert.equal(applied.ok, true, applied.findings.join("; "));
    assert.equal(checkBacklogState(base).ok, true);
  });

  check("RBL14 an open -> deferred transition reconciles cleanly from an already-open ledger entry", () => {
    const { base } = fixture({
      items: [ITEM("omicron", "deferred")],
      events: [{ id: "pipeline.omicron", from: null, to: "open", reference: "2026-07-01-omicron.md" }],
    });
    const plan = planBacklogReconciliation(base, { at: "2026-08-17" });
    assert.equal(plan.ok, true, plan.findings.join("; "));
    assert.deepEqual(plan.planned.map((event) => [event.from, event.to]), [["open", "deferred"]]);
  });

  check("RBL15 a rejected/deferred target is refused when the ledger's current status is in_progress, not open", () => {
    const { base } = fixture({
      items: [ITEM("pi", "rejected")],
      events: [{ id: "pipeline.pi", from: null, to: "open", reference: "2026-07-01-pi.md" },
        { id: "pipeline.pi", from: "open", to: "in_progress", reference: "2026-07-01-pi.md" }],
    });
    const result = planBacklogReconciliation(base, { at: "2026-08-17" });
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /reachable only from open/u);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
