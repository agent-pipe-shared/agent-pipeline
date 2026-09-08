#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { CriticDispatchPreflightError, preflightCriticDispatch, parseCriticDispatchPreflightArgs } from "./critic-dispatch-preflight.mjs";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";

function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }
function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "critic-dispatch-preflight-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "governance", "guidelines"), { recursive: true });
  mkdirSync(join(root, "governance", "policies"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  git(root, ["init", "-q"]);
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance", "guidelines", "review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance", "policies", "checklist.md"), "- verify\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n");
  const base = commit(root, "base");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n\nchanged\n");
  const candidate = commit(root, "candidate");
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify({ candidate: { commit: candidate, tree } })}\n`);
  writeFileSync(join(root, "evidence", "verify-root.json"), `${JSON.stringify({ commit: candidate, tree })}\n`);
  writeFileSync(join(root, "evidence", "verify-canonical.json"), `${JSON.stringify({ commit: candidate, tree, candidate: { start: { status: "clean" }, finish: { status: "clean" }, binding: "exact" } })}\n`);
  writeFileSync(join(root, "evidence", "prior-critic.json"), `${JSON.stringify({ candidate: { commit: base, tree: git(root, ["rev-parse", `${base}^{tree}`]) } })}\n`);
  return { root, base, candidate, tree };
}
function input(fx, overrides = {}) {
  return {
    root: fx.root,
    base: fx.base,
    candidate: fx.candidate,
    specPath: "specs/spec.md",
    guardrailPaths: [],
    evidencePaths: ["evidence/verify.json"],
    priorCriticEvidencePath: "evidence/prior-critic.json",
    ...overrides,
  };
}

test("read-only dispatch preflight binds candidate, candidate-tree governance, and separate evidence", () => {
  const fx = fixture();
  const result = preflightCriticDispatch(input(fx));
  assert.equal(result.status, "packet-ready");
  assert.equal(result.candidate.commit, fx.candidate);
  assert.equal(result.candidate.tree, fx.tree);
  assert.equal(result.spec.path, "specs/spec.md");
  assert.deepEqual(result.guardrails.map(({ path }) => path), [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"]);
  assert.equal(result.evidence[0].candidate.commit, fx.candidate);
  assert.equal(result.priorCriticEvidence.path, "evidence/prior-critic.json");
  assert.equal(result.dispatch.childCreated, false);
  assert.equal(result.dispatch.spawnAuthorized, false);
  assert.equal(result.dispatch.requiredNextGate, "selected-runner-transport");
});

test("rejects missing candidate-bound evidence, missing governance, and prior-evidence aliasing", () => {
  const fx = fixture();
  assert.throws(() => preflightCriticDispatch(input(fx, { evidencePaths: [] })), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-EVIDENCE-REQUIRED");
  writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify({ candidate: { commit: fx.base, tree: fx.tree } })}\n`);
  assert.throws(() => preflightCriticDispatch(input(fx)), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-EVIDENCE-BINDING");
  assert.throws(() => preflightCriticDispatch(input(fx, { priorCriticEvidencePath: "evidence/verify.json" })), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-PRIOR-ALIASED");
  assert.throws(() => preflightCriticDispatch(input(fx, { guardrailPaths: ["governance/policies/missing.md"] })), (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-CANDIDATE-PATH");
});

test("accepts the root candidate binding used by canonical Verify evidence", () => {
  const fx = fixture();
  const result = preflightCriticDispatch(input(fx, { evidencePaths: ["evidence/verify-root.json"] }));
  assert.equal(result.evidence[0].candidate.tree, fx.tree);
});

test("accepts canonical Verify evidence whose candidate field is only a run-status wrapper", () => {
  const fx = fixture();
  const result = preflightCriticDispatch(input(fx, { evidencePaths: ["evidence/verify-canonical.json"] }));
  assert.equal(result.evidence[0].candidate.commit, fx.candidate);
});

/**
 * A repository whose entire history is one commit -- the normal state of a
 * project that just adopted the Pipeline and produced its first feature
 * (AC-1/AC-2, 2026-08-08-verify-evidence-has-a-schema-consumers-and-no-producer.md).
 * `base` here is the git empty-tree OID: the only well-defined predecessor of
 * a root commit. No parent commit is fabricated anywhere in this fixture.
 */
function singleCommitFixture() {
  const root = mkdtempSync(join(tmpdir(), "critic-dispatch-preflight-root-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "governance", "guidelines"), { recursive: true });
  mkdirSync(join(root, "governance", "policies"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  git(root, ["init", "-q"]);
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance", "guidelines", "review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance", "policies", "checklist.md"), "- verify\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n");
  const candidate = commit(root, "root commit");
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify({ candidate: { commit: candidate, tree } })}\n`);
  const base = execFileSync("git", ["-C", root, "hash-object", "-t", "tree", "--stdin"], { input: "", encoding: "utf8" }).trim();
  return { root, base, candidate, tree };
}

test("a repository with exactly one commit resolves the root commit as an ordinary base, not a refusal", () => {
  const fx = singleCommitFixture();
  try {
    const result = preflightCriticDispatch({
      root: fx.root,
      base: fx.base,
      candidate: fx.candidate,
      specPath: "specs/spec.md",
      guardrailPaths: [],
      evidencePaths: ["evidence/verify.json"],
    });
    assert.equal(result.status, "packet-ready");
    assert.equal(result.base.commit, null, "a root commit's base has no commit -- only the empty tree");
    assert.equal(result.base.tree, fx.base);
    assert.equal(result.candidate.commit, fx.candidate);
    assert.equal(result.candidate.tree, fx.tree);
    // AC-4: no history was invented anywhere -- the fixture's own log proves it.
    const log = git(fx.root, ["log", "--oneline"]).split("\n").filter(Boolean);
    assert.equal(log.length, 1);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("a base ref that fails commit-peeling and is not the empty tree is still refused (unchanged behavior)", () => {
  const fx = fixture();
  const bogus = "0".repeat(40);
  assert.throws(
    () => preflightCriticDispatch(input(fx, { base: bogus })),
    (error) => error instanceof CriticDispatchPreflightError && error.code === "CDP-GIT",
  );
});


// These new fixtures are owned by each test and never run a preflight against
// the working checkout. Existing six producer expectations above stay intact.
function captureFixture(t) {
  const fx = fixture();
  t.after(() => rmSync(fx.root, { recursive: true, force: true }));
  return fx;
}
function expectedSource(fx, patch = {}) {
  return { schema: "pipeline.critic-preflight-observation.v1", producer: "critic-dispatch-preflight",
    observationRevision: 1, stage: "complete", outcome: "packet-ready", code: null,
    candidate: { commit: fx.candidate, tree: fx.tree },
    specSha256: createHash("sha256").update("# Spec\n\nchanged\n").digest("hex"), ...patch };
}
function captureRejection(value, expected) {
  const observations = [];
  assert.throws(() => preflightCriticDispatch(value, (source) => { observations.push(source); }),
    (error) => error instanceof CriticDispatchPreflightError && error.code === expected.code);
  assert.deepEqual(observations, [expected]);
}
function producerArgv(value) {
  return ["--root", value.root, "--base", value.base, "--candidate", value.candidate, "--spec", value.specPath,
    ...value.guardrailPaths.flatMap((path) => ["--guardrail", path]),
    ...value.evidencePaths.flatMap((path) => ["--evidence", path]),
    ...(value.priorCriticEvidencePath === null ? [] : ["--prior-critic", value.priorCriticEvidencePath])];
}
function directCli(fx, argv) {
  const result = childProcess.spawnSync(process.execPath,
    [fileURLToPath(new URL("./critic-dispatch-preflight.mjs", import.meta.url)), ...argv],
    { cwd: fx.root, encoding: "utf8", timeout: 15000 });
  assert.equal(result.error, undefined);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function withBuiltinMocks(t, patches, action) {
  try {
    for (const [object, key, replacement] of patches) t.mock.method(object, key, replacement);
    syncBuiltinESMExports();
    return action();
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
}

test("source callback emits exactly one closed detached packet-ready observation", (t) => {
  const fx = captureFixture(t), value = input(fx), expected = preflightCriticDispatch(value);
  const seen = [];
  const result = preflightCriticDispatch(value, (source) => { seen.push(source); return { ok: true, code: null }; });
  assert.deepEqual(result, expected);
  assert.deepEqual(seen, [expectedSource(fx)]);
  assert.notEqual(seen[0].candidate, result.candidate);
  assert.deepEqual(Object.keys(result), ["schema", "status", "base", "candidate", "spec", "guardrails", "governance", "evidence", "priorCriticEvidence", "dispatch"]);
  assert.deepEqual(result.dispatch, { mode: "path-only", childCreated: false, packetCreated: false, stateMutated: false,
    spawnAuthorized: false, requiredNextGate: "selected-runner-transport" });
  seen[0].candidate.commit = "0".repeat(40); seen[0].specSha256 = null; seen[0].extra = "synthetic";
  assert.deepEqual(result, expected);
  result.candidate.tree = "f".repeat(40); assert.equal(seen[0].candidate.tree, fx.tree);
  assert.equal(fs.existsSync(join(fx.root, "evidence", "interruption-receipts")), false);
  assert.equal(fs.existsSync(join(fx.root, "evidence", "interruption-collection")), false);
});

test("actual direct CLI preserves complete packet-ready and representative rejection protocols", (t) => {
  const fx = captureFixture(t), value = input(fx);
  const before = git(fx.root, ["status", "--porcelain", "--untracked-files=all"]);
  const expected = preflightCriticDispatch(value);
  assert.deepEqual(directCli(fx, producerArgv(value)), { status: 0, stdout: JSON.stringify(expected) + "\n", stderr: "" });
  for (const [patch, code] of [
    [{ evidencePaths: [] }, "CDP-EVIDENCE-REQUIRED"],
    [{ evidencePaths: ["evidence/prior-critic.json"], priorCriticEvidencePath: null }, "CDP-EVIDENCE-BINDING"],
    [{ priorCriticEvidencePath: "evidence/verify.json" }, "CDP-PRIOR-ALIASED"],
    [{ specPath: "specs/absent.md" }, "CDP-CANDIDATE-PATH"],
    [{ specPath: "../spec.md" }, "CDP-PATH"],
    [{ candidate: "absent-candidate" }, "CDP-GIT"],
  ]) assert.deepEqual(directCli(fx, producerArgv(input(fx, patch))), { status: 1, stdout: "",
    stderr: JSON.stringify({ schema: "pipeline.critic-dispatch-preflight.v1", status: "rejected", code }) + "\n" });
  assert.deepEqual(directCli(fx, ["--unknown"]), { status: 1, stdout: "",
    stderr: '{"schema":"pipeline.critic-dispatch-preflight.v1","status":"rejected","code":"CDP-ARGUMENT"}\n' });
  assert.equal(git(fx.root, ["status", "--porcelain", "--untracked-files=all"]), before);
  assert.equal(fs.existsSync(join(fx.root, "telemetry")), false);
});

test("shared argument parser preserves defaults scalar overwrites arrays and exact flag errors", () => {
  assert.deepEqual(parseCriticDispatchPreflightArgs([]), { guardrailPaths: [], evidencePaths: [], priorCriticEvidencePath: null });
  const argv = ["--root", "first", "--root", "second", "--base", "base", "--candidate", "candidate", "--spec", "spec",
    "--guardrail", "z", "--guardrail", "z", "--evidence", "e", "--evidence", "e", "--prior-critic", "old", "--prior-critic", "new"];
  const before = [...argv];
  assert.deepEqual(parseCriticDispatchPreflightArgs(argv), { guardrailPaths: ["z", "z"], evidencePaths: ["e", "e"],
    priorCriticEvidencePath: "new", root: "second", base: "base", candidate: "candidate", specPath: "spec" });
  assert.deepEqual(argv, before);
  // A flag-looking value remains a value exactly as in the original parser.
  assert.deepEqual(parseCriticDispatchPreflightArgs(["--root", "--base"]), { guardrailPaths: [], evidencePaths: [], priorCriticEvidencePath: null, root: "--base" });
  for (const flag of ["--root", "--base", "--candidate", "--spec", "--guardrail", "--evidence", "--prior-critic"])
    assert.throws(() => parseCriticDispatchPreflightArgs([flag]), { name: "CriticDispatchPreflightError", code: "CDP-ARGUMENT", message: flag + " requires a value." });
  assert.throws(() => parseCriticDispatchPreflightArgs(["--other", "value"]),
    { name: "CriticDispatchPreflightError", code: "CDP-ARGUMENT", message: "Unknown argument: --other" });
});

test("request destructuring retains original getter order and exceptions before body entry", () => {
  const fields = ["root", "base", "candidate", "specPath", "guardrailPaths", "evidencePaths", "priorCriticEvidencePath"];
  const order = [], request = {};
  for (const key of fields) Object.defineProperty(request, key, { get() { order.push(key); return undefined; } });
  const seen = [];
  assert.throws(() => preflightCriticDispatch(request, (source) => { seen.push(source); }), { code: "CDP-INPUT" });
  assert.deepEqual(order, fields);
  assert.deepEqual(seen, [expectedSource({}, { stage: "request", outcome: "rejected", code: "CDP-INPUT", candidate: null, specSha256: null })]);
  const thrown = new Error("synthetic parameter-binding failure"), bindingOrder = [], throwing = {};
  for (const key of fields) Object.defineProperty(throwing, key, { get() { bindingOrder.push(key); if (key === "guardrailPaths") throw thrown; return undefined; } });
  let observed = 0;
  assert.throws(() => preflightCriticDispatch(throwing, () => { observed++; }), (error) => error === thrown);
  assert.deepEqual(bindingOrder, fields.slice(0, 5)); assert.equal(observed, 0);
  for (const value of [null, undefined]) assert.throws(() => preflightCriticDispatch(value, () => { observed++; }), TypeError);
  assert.equal(observed, 0);
});

test("early request and base failures have no captured candidate or spec", (t) => {
  const fx = captureFixture(t);
  captureRejection(input(fx, { root: "" }), expectedSource(fx, { stage: "request", outcome: "rejected", code: "CDP-INPUT", candidate: null, specSha256: null }));
  for (const patch of [{ base: "absent-base" }, { candidate: "absent-candidate" }])
    captureRejection(input(fx, patch), expectedSource(fx, { stage: "candidate", outcome: "rejected", code: "CDP-GIT", candidate: null, specSha256: null }));
  const seen = [];
  assert.throws(() => preflightCriticDispatch(input(fx, { root: join(fx.root, "absent-root") }), (source) => { seen.push(source); }),
    (error) => error.code === "ENOENT");
  assert.deepEqual(seen, [expectedSource(fx, { stage: "request", outcome: "rejected", code: "CDP-UNEXPECTED", candidate: null, specSha256: null })]);
});

test("range and path rejections retain the validated candidate before any spec readback", (t) => {
  const fx = captureFixture(t);
  for (const [patch, stage, code] of [
    [{ base: fx.candidate }, "candidate", "CDP-RANGE"],
    [{ specPath: "../unsafe" }, "paths", "CDP-PATH"],
    [{ guardrailPaths: null }, "paths", "CDP-PATHS"],
    [{ guardrailPaths: ["duplicate.md", "duplicate.md"] }, "paths", "CDP-DUPLICATE-PATH"],
    [{ evidencePaths: [] }, "paths", "CDP-EVIDENCE-REQUIRED"],
    [{ priorCriticEvidencePath: "evidence/verify.json" }, "paths", "CDP-PRIOR-ALIASED"],
  ]) captureRejection(input(fx, patch), expectedSource(fx, { stage, outcome: "rejected", code, specSha256: null }));
});

test("spec binding becomes visible only after successful actual spec readback", (t) => {
  const fx = captureFixture(t);
  captureRejection(input(fx, { specPath: "specs/missing.md" }),
    expectedSource(fx, { stage: "candidate-files", outcome: "rejected", code: "CDP-CANDIDATE-PATH", specSha256: null }));
  captureRejection(input(fx, { guardrailPaths: ["governance/policies/missing.md"] }),
    expectedSource(fx, { stage: "candidate-files", outcome: "rejected", code: "CDP-CANDIDATE-PATH" }));
});

test("actual evidence and prior-evidence failures retain their owning stages and spec binding", (t) => {
  const fx = captureFixture(t);
  writeFileSync(join(fx.root, "evidence", "malformed.json"), "synthetic non-JSON");
  for (const [patch, stage, code] of [
    [{ evidencePaths: ["evidence"] }, "evidence", "CDP-EVIDENCE-FILE"],
    [{ evidencePaths: ["evidence/malformed.json"] }, "evidence", "CDP-EVIDENCE-JSON"],
    [{ evidencePaths: ["evidence/prior-critic.json"], priorCriticEvidencePath: null }, "evidence", "CDP-EVIDENCE-BINDING"],
    [{ priorCriticEvidencePath: "evidence" }, "prior-evidence", "CDP-EVIDENCE-FILE"],
  ]) captureRejection(input(fx, patch), expectedSource(fx, { stage, outcome: "rejected", code }));
  for (const [patch, stage] of [
    [{ evidencePaths: ["evidence/missing.json"] }, "evidence"],
    [{ priorCriticEvidencePath: "evidence/missing.json" }, "prior-evidence"],
  ]) {
    const seen = [];
    assert.throws(() => preflightCriticDispatch(input(fx, patch), (source) => { seen.push(source); }), (error) => error.code === "ENOENT");
    assert.deepEqual(seen, [expectedSource(fx, { stage, outcome: "rejected", code: "CDP-UNEXPECTED" })]);
  }
  const seen = [];
  const result = preflightCriticDispatch(input(fx, { priorCriticEvidencePath: "evidence/malformed.json" }), (source) => { seen.push(source); });
  assert.equal(result.status, "packet-ready"); assert.deepEqual(seen, [expectedSource(fx)]);
});

test("an actual missing candidate manifest is observed before governance or spec reads", (t) => {
  const fx = captureFixture(t);
  rmSync(join(fx.root, ".claude", "pipeline.yaml"));
  const candidate = commit(fx.root, "fixture missing manifest"), tree = git(fx.root, ["rev-parse", candidate + "^{tree}"]);
  captureRejection(input(fx, { candidate }), expectedSource({ ...fx, candidate, tree },
    { stage: "manifest", outcome: "rejected", code: "CDP-MANIFEST", specSha256: null }));
});

test("injected Git failures cover partial candidate inventory manifest governance and candidate-read branches", (t) => {
  const fx = captureFixture(t), originalSpawn = childProcess.spawnSync;
  for (const [match, response, stage, code, candidate] of [
    [(args) => args[2] === "rev-parse" && args[3] === fx.candidate + "^{tree}", { status: 0, stdout: "not-an-oid" }, "candidate", "CDP-REF", null],
    [(args) => args[2] === "ls-tree", { status: 1, stdout: "" }, "inventory", "CDP-GIT", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "ls-tree", { status: 0, stdout: "malformed inventory" }, "inventory", "CDP-TREE", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "ls-tree", { status: 0, stdout: "100644 blob " + "a".repeat(40) + "\t../unsafe\0" }, "inventory", "CDP-PATH", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "show" && args[3].endsWith(":.claude/pipeline.yaml"), { status: 1, stdout: "" }, "manifest", "CDP-MANIFEST", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "diff", { status: 1, stdout: "" }, "governance", "CDP-GIT", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "diff", { status: 0, stdout: "../unsafe\0" }, "governance", "CDP-PATH", { commit: fx.candidate, tree: fx.tree }],
    [(args) => args[2] === "show" && args[3].endsWith(":specs/spec.md"), { status: 1, stdout: "" }, "candidate-files", "CDP-CANDIDATE-READ", { commit: fx.candidate, tree: fx.tree }],
  ]) {
    let injected = 0;
    withBuiltinMocks(t, [[childProcess, "spawnSync", (command, args, options) => {
      if (match(args)) { injected++; return response; }
      return originalSpawn(command, args, options);
    }]], () => captureRejection(input(fx), expectedSource(fx, { stage, outcome: "rejected", code, candidate, specSha256: null })));
    assert.equal(injected, 1, "one explicitly injected owner operation");
  }
});

test("injected evidence containment refusal is captured without rerunning any guard", (t) => {
  const fx = captureFixture(t);
  withBuiltinMocks(t, [[path, "relative", () => ".."]], () => {
    captureRejection(input(fx), expectedSource(fx, { stage: "evidence", outcome: "rejected", code: "CDP-EVIDENCE-PATH" }));
  });
});

test("foreign thrown objects are rethrown identically without reading hostile properties", (t) => {
  const fx = captureFixture(t), originalRead = fs.readFileSync;
  let getters = 0;
  const foreign = Object.defineProperties(new Error("synthetic foreign exception"), {
    code: { get() { getters++; throw new Error("must not inspect code"); } },
    message: { get() { getters++; throw new Error("must not inspect message"); } },
  });
  for (const thrown of [foreign, null, "synthetic", new Proxy({}, { getPrototypeOf() { getters++; throw null; } })]) {
    const seen = [];
    withBuiltinMocks(t, [[fs, "readFileSync", (file, ...args) => {
      if (file === join(fx.root, "evidence", "verify.json")) throw thrown;
      return originalRead(file, ...args);
    }]], () => {
      let caught = false;
      try { preflightCriticDispatch(input(fx), (source) => { seen.push(source); throw new Error("observer failure"); }); }
      catch (error) { caught = true; assert.equal(error, thrown); }
      assert.equal(caught, true);
    });
    assert.deepEqual(seen, [expectedSource(fx, { stage: "evidence", outcome: "rejected", code: "CDP-UNEXPECTED" })]);
  }
  assert.equal(getters, 0);
});

test("invalid synchronous observer returns and exceptions cannot change admission or read return getters", (t) => {
  const fx = captureFixture(t), value = input(fx), expected = preflightCriticDispatch(value);
  let inspected = 0, calls = 0;
  const hostileReturn = Object.defineProperties({}, {
    then: { get() { inspected++; throw null; } }, ok: { get() { inspected++; throw null; } },
  });
  // Fulfilled Promise returns are invalid but ignored synchronously. This does
  // not claim containment of independently scheduled async rejections/side effects.
  for (const callback of [
    () => { calls++; throw new Error("synthetic observer failure"); },
    (source) => { calls++; source.candidate.commit = "0".repeat(40); source.code = "changed"; return false; },
    () => { calls++; return hostileReturn; },
    () => { calls++; return Promise.resolve({ ok: true, code: null }); },
  ]) {
    const before = calls;
    assert.deepEqual(preflightCriticDispatch(value, callback), expected); assert.equal(calls, before + 1);
    assert.throws(() => preflightCriticDispatch(input(fx, { evidencePaths: [] }), callback), { code: "CDP-EVIDENCE-REQUIRED" });
    assert.equal(calls, before + 2);
  }
  for (const callback of [null, undefined, false, 1, hostileReturn])
    assert.deepEqual(preflightCriticDispatch(value, callback), expected);
  assert.equal(inspected, 0);
});

test("callback capture adds no Git operations and candidate never follows later ref or HEAD changes", (t) => {
  const fx = captureFixture(t), originalSpawn = childProcess.spawnSync;
  const traces = [[], []];
  for (let index = 0; index < 2; index++) withBuiltinMocks(t, [[childProcess, "spawnSync", (command, args, options) => {
    traces[index].push([command, [...args]]);
    return originalSpawn(command, args, options);
  }]], () => preflightCriticDispatch(input(fx), index === 0 ? null : () => ({ ok: true, code: null })));
  assert.deepEqual(traces[0], traces[1]);
  git(fx.root, ["branch", "capture-ref", fx.candidate]);
  const seen = []; let resolved = false, moved = false;
  withBuiltinMocks(t, [[childProcess, "spawnSync", (command, args, options) => {
    if (resolved && !moved && args[2] === "rev-parse" && args[3] === fx.candidate + "^{tree}") {
      git(fx.root, ["update-ref", "refs/heads/capture-ref", fx.base]); git(fx.root, ["update-ref", "HEAD", fx.base]); moved = true;
    }
    const result = originalSpawn(command, args, options);
    if (args[2] === "rev-parse" && args[4] === "capture-ref^{commit}") resolved = true;
    return result;
  }]], () => {
    const result = preflightCriticDispatch(input(fx, { candidate: "capture-ref" }), (source) => { seen.push(source); });
    assert.deepEqual(result.candidate, { commit: fx.candidate, tree: fx.tree });
  });
  assert.equal(moved, true); assert.deepEqual(seen, [expectedSource(fx)]);
});
