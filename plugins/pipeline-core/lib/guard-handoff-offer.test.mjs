#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// R-AC-08 / R-AC-10 at the guard hand-off seam: the external-operator routes of
// `recordHumanGuardDenial` are the production producer of the `command-offer`
// journal event. These tests exercise the seam through the real function, on a
// real repository fixture, rather than the mapper alone -- the defect this work
// closes was precisely that the lifecycle's initial state existed only in
// fixtures.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateCommandOfferEvent } from "./agent-decision-journal.mjs";
import {
  buildGuardHandoffOfferEvent,
  GUARD_HANDOFF_JOURNAL_REFUSAL,
  recordGuardHandoffOffer,
} from "./guard-handoff-offer.mjs";
import { humanGuardOverrideInternals, recordHumanGuardDenial } from "./human-guard-override.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = 1_734_000_000_000;
const denial = [{ guard: "guard-devplan.mjs", reason: "GUARD-DEVPLAN-NOT-READY" }];
const lifecycleDenial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-LIFECYCLE-NOT-READY" }];

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "guard-handoff-offer-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

function journalPath(root) {
  return join(realpathSync(root), ".git", "agent-pipeline", "human-guard-overrides", "command-offers.jsonl");
}

function verifiedAppend(sink) {
  return (event) => {
    sink.push(event);
    return { eventId: event.eventId, candidateDigest: event.candidateDigest, integrity: "verified" };
  };
}

// One case per external-operator route code recoveryRoute() can return, with a
// leak canary in every tool input the event must never carry.
const CANARY = "leak-canary-fixture-command.mjs";
// ADR-0059 Decision 6 (cross-repository-target eligibility): an out-of-root
// Edit/Write escape is only refused (and therefore only reaches the
// external-operator route this suite exercises) when the escaped ABSOLUTE
// target itself matches the same sensitive-path pattern every in-root path is
// already held to (hardBoundaryPath()); an escape into an ordinary,
// non-sensitive out-of-root location is legitimately eligible ("planned")
// since that ADR landed, not refused. `../secrets/...` keeps this a genuine
// HGO-EXTERNAL-PROJECT-BOUNDARY case under the current rule.
const EXTERNAL_ROUTES = [
  ["HGO-EXTERNAL-SENSITIVE-INPUT", "Bash", { command: `node ${CANARY} --tok` + "en=fixture-not-a-secret" }],
  ["HGO-EXTERNAL-PROJECT-BOUNDARY", "Write", { file_path: "../secrets/outside-canary.txt", content: CANARY }],
  ["HGO-EXTERNAL-ADAPTER-BOUNDARY", "Read", { file_path: CANARY }],
];

test("R-AC-08: every external-operator hand-off journals a validated offered command-offer", () => {
  const root = fixture();
  try {
    for (const [code, toolName, toolInput] of EXTERNAL_ROUTES) {
      const appended = [];
      const observed = recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
        nowMs: NOW,
        appendCommandOffer: verifiedAppend(appended),
      });
      const label = `${code} ${toolName}`;
      assert.equal(observed.status, "external-operator-required", label);
      assert.equal(observed.code, code, label);
      assert.equal(typeof observed.nextAction, "object", label);
      assert.equal(Object.hasOwn(observed, "journalRefusal"), false, label);
      assert.equal(appended.length, 1, label);
      const event = appended[0];
      // The single closed predicate is the contract: it must accept the event
      // unchanged, not merely "look valid" field by field.
      assert.deepEqual(validateCommandOfferEvent(event), event, label);
      assert.equal(event.kind, "command-offer", label);
      assert.equal(event.state, "offered", label);
      assert.equal(event.reasonCode, code, label);
      assert.equal(event.offerOrigin, "pipeline-initiated", label);
      assert.equal(event.sideEffectClass, "guard-bypass", label);
      assert.equal(event.authorityRequirement, "not-required", label);
      assert.equal(event.relatedHumanDecisionId, null, label);
      assert.equal(event.supersedesEventId, null, label);
      assert.equal(event.offerEventId, null, label);
      assert.equal(event.executionAssurance, "not-applicable", label);
      assert.equal(event.preEvidenceDigest, null, label);
      assert.equal(event.postEvidenceDigest, null, label);
      assert.equal(event.recoverability, "not-applicable", label);
      assert.equal(Object.hasOwn(event, "requiredCleanup"), false, label);
      assert.equal(event.occurredAtEpochMs, NOW, label);
      assert.equal(event.operation.operationClass, `external-operator-handoff:${toolName}`, label);
      assert.equal(
        event.eventId,
        `guard-handoff-offer:${code}:${observed.nextAction.action.toolInputSha256}`,
        label,
      );
      // A replayed identical denial is the same offer, not a second one.
      const replayed = [];
      recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
        nowMs: NOW,
        appendCommandOffer: verifiedAppend(replayed),
      });
      assert.deepEqual(replayed[0], event, label);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("R-AC-08: the offer append happens before the route is returned", () => {
  const root = fixture();
  try {
    const sequence = [];
    const observed = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Read",
      toolInput: { file_path: CANARY },
      denials: denial,
      nowMs: NOW,
      appendCommandOffer: (event) => {
        sequence.push("append");
        return { eventId: event.eventId, candidateDigest: event.candidateDigest, integrity: "verified" };
      },
    });
    sequence.push("return");
    assert.deepEqual(sequence, ["append", "return"]);
    assert.equal(typeof observed.nextAction, "object");
    // The ordering above is only half the claim; the other half is that the
    // route genuinely DEPENDS on the append having succeeded, which the two
    // refusal tests below prove by removing nextAction when it does not.
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("R-AC-10: an append that throws suppresses nextAction and returns the typed refusal", () => {
  const root = fixture();
  try {
    for (const [code, toolName, toolInput] of EXTERNAL_ROUTES) {
      const observed = recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
        nowMs: NOW,
        appendCommandOffer: () => { throw new Error("journal unavailable"); },
      });
      assert.deepEqual(Object.keys(observed), ["status", "code", "journalRefusal"], code);
      assert.equal(observed.status, "external-operator-required", code);
      assert.equal(observed.code, code, code);
      assert.equal(observed.journalRefusal, GUARD_HANDOFF_JOURNAL_REFUSAL, code);
      assert.equal(Object.hasOwn(observed, "nextAction"), false, code);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("R-AC-10: an unverified append readback suppresses nextAction the same way", () => {
  const root = fixture();
  try {
    const unverified = [
      ["substituted event id", (event) => ({ eventId: "other-offer", candidateDigest: event.candidateDigest, integrity: "verified" })],
      ["substituted candidate", (event) => ({ eventId: event.eventId, candidateDigest: "f".repeat(64), integrity: "verified" })],
      ["unverified integrity", (event) => ({ eventId: event.eventId, candidateDigest: event.candidateDigest, integrity: "unknown" })],
      ["shapeless receipt", (event) => ({ eventId: event.eventId, candidateDigest: event.candidateDigest })],
      ["asynchronous append", async (event) => ({ eventId: event.eventId, candidateDigest: event.candidateDigest, integrity: "verified" })],
    ];
    for (const [label, appendCommandOffer] of unverified) {
      const observed = recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName: "Read",
        toolInput: { file_path: CANARY },
        denials: denial,
        nowMs: NOW,
        appendCommandOffer,
      });
      assert.deepEqual(Object.keys(observed), ["status", "code", "journalRefusal"], label);
      assert.equal(observed.code, "HGO-EXTERNAL-ADAPTER-BOUNDARY", label);
      assert.equal(observed.journalRefusal, GUARD_HANDOFF_JOURNAL_REFUSAL, label);
      assert.equal(Object.hasOwn(observed, "nextAction"), false, label);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lifecycle-not-ready never creates a signature path or external hand-off offer", () => {
  const root = fixture();
  try {
    const appended = [];
    const observed = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Read",
      toolInput: { file_path: CANARY },
      denials: lifecycleDenial,
      nowMs: NOW,
      appendCommandOffer: verifiedAppend(appended),
    });
    assert.equal(observed.status, "non-liftable-recovery-required");
    assert.equal(observed.code, "HGO-NONOVERRIDABLE-LIFECYCLE-NOT-READY");
    assert.equal(observed.nextAction.kind, "repair-required");
    assert.equal(Object.hasOwn(observed, "requestSha256"), false);
    assert.equal(Object.hasOwn(observed, "candidateSourceRoot"), false);
    assert.deepEqual(appended, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("R-AC-05/R-AC-06: the journaled offer omits the four mandatory classes and carries no command, path, or tool input", () => {
  const root = fixture();
  try {
    for (const [code, toolName, toolInput] of EXTERNAL_ROUTES) {
      const appended = [];
      recordHumanGuardDenial({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput,
        denials: denial,
        nowMs: NOW,
        appendCommandOffer: verifiedAppend(appended),
      });
      const event = appended[0];
      assert.deepEqual(
        event.omissions,
        ["raw-command", "arguments", "private-coordinates", "unrestricted-output"],
        code,
      );
      const serialized = JSON.stringify(event);
      const forbidden = [
        ...Object.values(toolInput).filter((value) => typeof value === "string"),
        JSON.stringify(toolInput),
        CANARY,
        "leak-canary",
        "outside-canary",
        "fixture-not-a-secret",
        realpathSync(root),
        // Nothing may claim execution: an offer is never an outcome (R-AC-06).
        "executed",
        "completed",
        "succeeded",
      ];
      for (const needle of forbidden) {
        assert.equal(serialized.includes(needle), false, `${code} leaked ${needle}`);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the three non-external route statuses keep their exact current shape and journal nothing", () => {
  const root = fixture();
  try {
    const appended = [];
    const wildcardInput = { command: "rm *" };
    const wildcard = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Bash",
      toolInput: wildcardInput,
      denials: denial,
      nowMs: NOW,
      appendCommandOffer: verifiedAppend(appended),
    });
    assert.equal(JSON.stringify(wildcard), JSON.stringify({
      status: "narrower-recovery-required",
      code: "HGO-NARROWER-EXACT-TARGET-REQUIRED",
      nextAction: {
        kind: "typed-recovery",
        action: {
          toolName: "Bash",
          toolInputSha256: humanGuardOverrideInternals.sha(wildcardInput),
          requiredChange: "replace every wildcard with one exact target",
          repositoryRoot: realpathSync(root),
        },
      },
    }));

    const planned = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput: { file_path: ".claude/pipeline-state.json", content: "{}" },
      denials: denial,
      nowMs: NOW,
      appendCommandOffer: verifiedAppend(appended),
    });
    // NVA-CROSSREPOGUIDANCE-1: `planned` now additionally carries `root` so a
    // cross-repository-target denial's guidance can name the repository the
    // request was actually bound to -- additive field, not a schema change.
    assert.deepEqual(Object.keys(planned), ["status", "requestSha256", "root"]);
    assert.equal(planned.status, "planned");

    const authorRepair = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput: { file_path: "plugins/pipeline-core/lib/repair.mjs", content: "x\n" },
      denials: denial,
      nowMs: NOW,
      appendCommandOffer: verifiedAppend(appended),
    });
    assert.deepEqual(Object.keys(authorRepair), ["status", "requestSha256", "root", "candidateSourceRoot"]);
    assert.equal(authorRepair.status, "author-repair-required");

    assert.deepEqual(appended, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("R-AC-08: the production writer appends to its own journal file without rewriting earlier offers", () => {
  const root = fixture();
  try {
    const first = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Read",
      toolInput: { file_path: CANARY },
      denials: denial,
      nowMs: NOW,
    });
    assert.equal(first.code, "HGO-EXTERNAL-ADAPTER-BOUNDARY");
    assert.equal(typeof first.nextAction, "object");
    const after = readFileSync(journalPath(root), "utf8").split("\n").filter(Boolean);
    assert.equal(after.length, 1);
    const event = JSON.parse(after[0]);
    assert.deepEqual(validateCommandOfferEvent(event), event);
    assert.equal(event.state, "offered");

    // Same ADR-0059 Decision 6 rule as EXTERNAL_ROUTES above: only an escape
    // whose absolute target itself matches the sensitive-path pattern is
    // refused into the external-operator route this test exercises.
    const second = recordHumanGuardDenial({
      rootDir: root,
      pluginRoot: PLUGIN_ROOT,
      toolName: "Write",
      toolInput: { file_path: "../secrets/outside-canary.txt", content: CANARY },
      denials: denial,
      nowMs: NOW + 1000,
    });
    assert.equal(second.code, "HGO-EXTERNAL-PROJECT-BOUNDARY");
    const grown = readFileSync(journalPath(root), "utf8").split("\n").filter(Boolean);
    assert.equal(grown.length, 2);
    assert.equal(grown[0], after[0]);
    assert.equal(JSON.parse(grown[1]).occurredAtEpochMs, NOW + 1000);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the producer refuses anything but an external-operator route and any unverified append", () => {
  const context = {
    toolName: "Bash",
    candidateDigest: "a".repeat(64),
    repositoryFingerprint: "b".repeat(64),
    scopeDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    redactionPolicyDigest: "e".repeat(64),
    occurredAtEpochMs: NOW,
  };
  const route = {
    status: "external-operator-required",
    code: "HGO-EXTERNAL-ADAPTER-BOUNDARY",
    nextAction: { kind: "external-operator", action: { toolInputSha256: "9".repeat(64) } },
  };
  assert.throws(
    () => buildGuardHandoffOfferEvent({ ...context, route: { ...route, status: "planned" } }),
    (error) => error.code === "GHO-ROUTE",
  );
  assert.throws(
    () => buildGuardHandoffOfferEvent({ ...context, route: { ...route, code: "HGO-NARROWER-PUBLICATION-REQUIRED" } }),
    (error) => error.code === "GHO-ROUTE",
  );
  assert.throws(
    () => buildGuardHandoffOfferEvent({ ...context, route: { ...route, nextAction: { action: {} } } }),
    (error) => error.code === "GHO-ROUTE-DIGEST",
  );
  assert.throws(
    () => buildGuardHandoffOfferEvent({ ...context, route, policyDigest: "not-a-digest" }),
    (error) => error.code === "GHO-DIGEST",
  );
  assert.throws(
    () => buildGuardHandoffOfferEvent({ ...context, route, occurredAtEpochMs: Number.NaN }),
    (error) => error.code === "GHO-OCCURRED-AT",
  );
  const offer = buildGuardHandoffOfferEvent({ ...context, route });
  assert.throws(() => recordGuardHandoffOffer({ offer }), (error) => error.code === "GHO-APPEND");
  assert.throws(
    () => recordGuardHandoffOffer({ offer, append: () => ({ eventId: offer.eventId, candidateDigest: offer.candidateDigest, integrity: "unknown" }) }),
    (error) => error.code === "GHO-READBACK",
  );
  const receipt = recordGuardHandoffOffer({
    offer,
    append: (event) => ({ eventId: event.eventId, candidateDigest: event.candidateDigest, integrity: "verified" }),
  });
  assert.equal(receipt.status, "offered");
  assert.equal(receipt.authority, "non-authoritative");
  assert.equal(receipt.eventId, offer.eventId);
});
