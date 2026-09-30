// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MACHINE_PLANE_SCHEMA, machinePlaneFilePath, writeMachinePlane } from "./machine-plane.mjs";
import { beginInitialAnswersJournal, completeInitialAnswersJournal, readInitialAnswersJournal } from "./onboarding-initial-answers-transaction.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "initial-answers-tx-"));
  mkdirSync(join(root, "private"));
  const targets = ["source", "machine", "receipt", "manifest"].map((role) => ({
    role, path: join(root, `${role}.json`), postBytes: Buffer.from(`${role}-new\n`), postMode: 0o600,
  }));
  writeFileSync(targets[0].path, "source-old\n");
  return { root, markerPath: join(root, "private", "pending.json"), targets, runner: "codex", answerSha256: sha256("confirmed-answers") };
}

test("a journal binds exact bytes, then a matching completion is replay-safe", () => {
  const input = fixture();
  try {
    assert.equal(readInitialAnswersJournal(input), null);
    const started = beginInitialAnswersJournal(input);
    assert.equal(started.entries.length, 4);
    assert.equal(existsSync(input.markerPath), true);
    const writes = [];
    const publish = (role, path, bytes, mode) => { writes.push(role); writeFileSync(path, bytes); chmodSync(path, mode); };
    assert.deepEqual(completeInitialAnswersJournal({ ...input, publish }), { status: "completed" });
    assert.deepEqual(writes, ["source", "machine", "receipt", "manifest"]);
    assert.equal(existsSync(input.markerPath), false);
    for (const target of input.targets) assert.deepEqual(readFileSync(target.path), target.postBytes);
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("an interruption after each publication resumes only exact bound postimages", () => {
  for (const cutAfter of [1, 2, 3, 4]) {
    const input = fixture();
    try {
      beginInitialAnswersJournal(input);
      let writes = 0;
      assert.throws(() => completeInitialAnswersJournal({ ...input, publish(_role, path, bytes, mode) {
        writeFileSync(path, bytes);
        chmodSync(path, mode);
        writes += 1;
        if (writes === cutAfter) throw new Error("simulated-process-stop");
      } }), /simulated-process-stop/u);
      assert.equal(existsSync(input.markerPath), true);
      const resumed = [];
      assert.deepEqual(completeInitialAnswersJournal({ ...input, publish(role, path, bytes, mode) {
        resumed.push(role);
        writeFileSync(path, bytes);
        chmodSync(path, mode);
      } }), { status: cutAfter === 4 ? "replayed" : "completed" });
      assert.deepEqual(resumed, input.targets.slice(cutAfter).map((target) => target.role));
      assert.equal(existsSync(input.markerPath), false);
    } finally { rmSync(input.root, { recursive: true, force: true }); }
  }
});

test("a changed answer or foreign target byte stops before any further publication", () => {
  const input = fixture();
  try {
    beginInitialAnswersJournal(input);
    let writes = 0;
    assert.throws(() => completeInitialAnswersJournal({ ...input,
      answerSha256: sha256("different-answer"), publish() { writes += 1; },
    }), /ANSWER-CONFLICT/u);
    writeFileSync(input.targets[1].path, "foreign-machine-value\n");
    assert.throws(() => completeInitialAnswersJournal({ ...input, publish() { writes += 1; } }), /DRIFT/u);
    assert.equal(writes, 0);
    assert.equal(readFileSync(input.targets[0].path, "utf8"), "source-old\n");
    assert.equal(existsSync(input.markerPath), true);
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("a validated preimage that changes before journal admission cannot authorize a stale postimage", () => {
  const input = fixture();
  try {
    input.targets[0].expectedPre = {
      bytes: Buffer.from("source-old\n"),
      mode: lstatSync(input.targets[0].path).mode & 0o777,
    };
    // The content change models an edit between source validation and journal
    // admission; neither a marker nor any target postimage may be published.
    writeFileSync(input.targets[0].path, "source-changed\n");
    assert.throws(() => beginInitialAnswersJournal(input), /PREIMAGE-DRIFT/u);
    assert.equal(existsSync(input.markerPath), false);
    assert.equal(readFileSync(input.targets[0].path, "utf8"), "source-changed\n");
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("an unchanged validated preimage admits and completes the exact projection", () => {
  const input = fixture();
  try {
    input.targets[0].expectedPre = {
      bytes: readFileSync(input.targets[0].path),
      mode: lstatSync(input.targets[0].path).mode & 0o777,
    };
    input.targets[1].expectedPre = { bytes: null, mode: null };
    input.targets[2].expectedPre = { bytes: null, mode: null };
    beginInitialAnswersJournal(input);
    assert.deepEqual(completeInitialAnswersJournal({ ...input, publish(_role, path, bytes, mode) {
      writeFileSync(path, bytes);
      chmodSync(path, mode);
    } }), { status: "completed" });
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("a later-language journal binds its purpose and repository capability", () => {
  const input = { ...fixture(), purpose: "later-language", repositoryCapability: "local" };
  try {
    const journal = beginInitialAnswersJournal(input);
    assert.equal(journal.value.purpose, "later-language");
    assert.equal(journal.value.repositoryCapability, "local");
    assert.throws(() => readInitialAnswersJournal({ ...input, purpose: "first-answers" }), /BINDING/u);
    assert.throws(() => readInitialAnswersJournal({ ...input, repositoryCapability: "host-managed" }), /BINDING/u);
    assert.deepEqual(completeInitialAnswersJournal({ ...input, publish(_role, path, bytes, mode) {
      writeFileSync(path, bytes);
      chmodSync(path, mode);
    } }), { status: "completed" });
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("a three-target marker from the prior plugin is completed only with an explicit manifest migration", () => {
  const input = fixture();
  try {
    beginInitialAnswersJournal(input);
    const value = JSON.parse(readFileSync(input.markerPath, "utf8"));
    value.entries.pop();
    writeFileSync(input.markerPath, `${JSON.stringify(value)}\n`);
    const publish = (_role, path, bytes, mode) => { writeFileSync(path, bytes); chmodSync(path, mode); };
    assert.throws(() => completeInitialAnswersJournal({ ...input, publish }), /LEGACY-RECOVERY-REQUIRED/u);
    assert.equal(existsSync(input.markerPath), true);
    let attempts = 0;
    assert.throws(() => completeInitialAnswersJournal({ ...input, publish, completeLegacy() {
      attempts += 1;
      throw new Error("simulated legacy migration stop");
    } }), /simulated legacy migration stop/u);
    assert.equal(existsSync(input.markerPath), true);
    const result = completeInitialAnswersJournal({ ...input, publish, completeLegacy() {
      attempts += 1;
      publish("manifest", input.targets[3].path, input.targets[3].postBytes, input.targets[3].postMode);
    } });
    assert.deepEqual(result, { status: "replayed", legacy: true });
    assert.equal(attempts, 2);
    assert.equal(existsSync(input.markerPath), false);
    assert.deepEqual(readFileSync(input.targets[3].path), input.targets[3].postBytes);
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("a malformed or target-swapped journal never authorizes publication", () => {
  const input = fixture();
  try {
    beginInitialAnswersJournal(input);
    const foreignTargets = input.targets.map((target) => ({ ...target }));
    foreignTargets[1].path = join(input.root, "foreign-machine.json");
    assert.throws(() => completeInitialAnswersJournal({ ...input, targets: foreignTargets,
      publish() { throw new Error("must not publish"); },
    }), /BINDING/u);
    writeFileSync(input.markerPath, "{ malformed");
    assert.throws(() => readInitialAnswersJournal(input), /SHAPE/u);
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("a broken target alias and a changed file mode are not accepted as absent or exact", () => {
  const aliased = fixture();
  try {
    symlinkSync(join(aliased.root, "missing-foreign"), aliased.targets[1].path);
    assert.throws(() => beginInitialAnswersJournal(aliased), /TARGET-UNSAFE/u);
    assert.equal(existsSync(aliased.markerPath), false);
  } finally { rmSync(aliased.root, { recursive: true, force: true }); }
  const changedMode = fixture();
  try {
    beginInitialAnswersJournal(changedMode);
    chmodSync(changedMode.targets[0].path, 0o600);
    assert.throws(() => completeInitialAnswersJournal({ ...changedMode,
      publish() { throw new Error("must not publish"); },
    }), /DRIFT/u);
  } finally { rmSync(changedMode.root, { recursive: true, force: true }); }
});

test("recovery can project the exact machine plane through its sole sanctioned writer", () => {
  const input = fixture();
  const machineHome = join(input.root, "home");
  mkdirSync(machineHome);
  const dependencies = { homedirFn: () => machineHome };
  const plane = {
    schema: MACHINE_PLANE_SCHEMA, poKeyDirectory: null, pushApprovalDefault: "chat",
    routing: null, language: "de", session: null, usage: null,
    updatedAt: "2026-09-24T00:00:00.000Z",
  };
  input.targets[1] = {
    role: "machine", path: machinePlaneFilePath(dependencies),
    postBytes: Buffer.from(`${JSON.stringify(plane, null, 2)}\n`), postMode: 0o600,
  };
  try {
    beginInitialAnswersJournal(input);
    assert.deepEqual(completeInitialAnswersJournal({ ...input, publish(role, path, bytes, mode) {
      if (role === "machine") {
        assert.equal(path, machinePlaneFilePath(dependencies));
        writeMachinePlane(JSON.parse(bytes.toString("utf8")), dependencies);
      } else { writeFileSync(path, bytes); chmodSync(path, mode); }
    } }), { status: "completed" });
    assert.deepEqual(readFileSync(input.targets[1].path), input.targets[1].postBytes);
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("a crash between exclusive marker link and temporary cleanup is recoverable", () => {
  const input = fixture();
  try {
    const journal = beginInitialAnswersJournal(input);
    const alias = `${input.markerPath}.tmp-${journal.value.transactionId}`;
    linkSync(input.markerPath, alias);
    assert.equal(readInitialAnswersJournal(input).linkedTemporary, alias);
    assert.deepEqual(completeInitialAnswersJournal({ ...input, publish(_role, path, bytes, mode) {
      writeFileSync(path, bytes);
      chmodSync(path, mode);
    } }), { status: "completed" });
    assert.equal(existsSync(alias), false);
    assert.equal(existsSync(input.markerPath), false);
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});

test("an orphaned partial temporary without a marker never blocks a new journal", () => {
  const input = fixture();
  try {
    writeFileSync(`${input.markerPath}.tmp-${"a".repeat(32)}`, "interrupted pre-publication bytes");
    assert.equal(readInitialAnswersJournal(input), null);
    assert.equal(beginInitialAnswersJournal(input).entries.length, 4);
  } finally { rmSync(input.root, { recursive: true, force: true }); }
});
