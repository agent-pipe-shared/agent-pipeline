// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { canonical } from "../../plugins/pipeline-core/lib/po-approval-proof.mjs";
import { checkVerifySuiteAppend, evaluateDuplicateRepair, evaluateSignedHistoryRestoration, integrationTrailerWitness } from "./check-verify-suite-append.mjs";
import { evaluateVerifySuiteAppend } from "../../plugins/pipeline-core/lib/verify-suite-append-policy.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "verify-suite-append-history-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const registry = (suites) => JSON.stringify({ schema: "pipeline.verify-suites.v1", suites });
  const suite = (name) => ({ name, file: `${name}.test.mjs` });
  const writeRegistry = (names) => writeFileSync(join(root, "harness", "verify-suites.json"),
    registry(names.map(suite)));
  const writeConfig = (protectedTestPaths) => writeFileSync(join(root, "project", "guard-config.json"),
    JSON.stringify({ protectedTestPaths }));
  const tp13 = { id: "TP-13", pattern: "harness/verify-suites\\.json$" };
  const commit = (message) => { git("add", "."); git("-c", "user.name=Test", "-c",
    "user.email=test@example.invalid", "commit", "-m", message); };
  try {
    mkdirSync(join(root, "harness"));
    mkdirSync(join(root, "project"));
    git("init", "-q");
    writeRegistry(["a"]);
    writeConfig([]);
    commit("initial");
    return run({ root, git, writeRegistry, writeConfig, tp13, commit });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("uncommitted TP-13 checks the exact proposed append, not merely a valid JSON file", () => fixture((f) => {
  f.writeConfig([f.tp13]);
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).ok, true);
  f.writeRegistry(["a", "b"]);
  assert.deepEqual(checkVerifySuiteAppend({ rootDir: f.root }),
    { ok: true, code: "VSA-UNCOMMITTED-INTRODUCTION", checked: 1, appended: 1 });
  f.writeRegistry(["z", "b"]);
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
}));

test("every committed edit after TP-13 is checked, even if a later append masks a rewrite", () => fixture((f) => {
  f.writeConfig([f.tp13]);
  f.writeRegistry(["a", "b"]);
  f.commit("introduce protected append");
  f.writeRegistry(["a", "b", "c"]);
  f.commit("another append");
  assert.deepEqual(checkVerifySuiteAppend({ rootDir: f.root }),
    { ok: true, code: "VSA-HISTORY-APPEND-ONLY", checked: 2 });
  f.writeRegistry(["z", "b", "c", "d"]);
  f.commit("rewrite old registration");
  f.writeRegistry(["z", "b", "c", "d", "e"]);
  f.commit("later append");
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
}));

const OID = "a".repeat(40);
const entry = {
  schema: "pipeline.verify-suite-history-recovery-entry.v1",
  integrationCommit: OID,
  integrationParent: "c".repeat(40),
  integrationIntentSha256: "b".repeat(64),
  parentRegistryBlobOid: "d".repeat(40),
  defectRegistryBlobOid: "e".repeat(40),
  priorSuiteCount: 87,
  appendedSuiteCount: 21,
};
const prior = Array.from({ length: 87 }, (_, i) => ({
  name: "prior-" + String(i).padStart(3, "0"),
  file: "prior-" + String(i).padStart(3, "0") + ".test.mjs",
}));
const additions = Array.from({ length: 21 }, (_, i) => ({
  name: "new-" + String(i).padStart(3, "0"),
  file: "new-" + String(i).padStart(3, "0") + ".test.mjs",
}));
const registry = (suites) => JSON.stringify({ schema: "pipeline.verify-suites.v1", suites }, null, 2) + "\n";
const defectRows = [...prior.slice(0, 40), ...additions, ...prior.slice(40)];
const common = {
  entry,
  integrationCommit: entry.integrationCommit,
  integrationParent: entry.integrationParent,
  parentRegistryBlobOid: entry.parentRegistryBlobOid,
  defectRegistryBlobOid: entry.defectRegistryBlobOid,
  parentBytes: registry(prior),
  defectBytes: registry(defectRows),
  candidateBytes: registry([...prior, ...additions]),
  integrationVerified: true,
};
const evaluate = (overrides = {}) => evaluateSignedHistoryRestoration({ ...common, ...overrides });

test("exact signed b7 witness reconstructs the prefix accepted by the unchanged append policy", () => {
  const result = evaluate();
  assert.equal(result.code, "VSA-RECOVERY-VERIFIED");
  assert.equal(result.priorSuiteCount, 87);
  assert.equal(result.appendedSuiteCount, 21);
  assert.equal(evaluateVerifySuiteAppend({ beforeBytes: common.parentBytes, afterBytes: result.restoredBytes }).appended, 21);
});

test("missing public proof and wrong commit, parent, or registry preimage bindings fail closed", () => {
  assert.equal(evaluate({ integrationVerified: false }).code, "VSA-RECOVERY-AUTHORIZATION");
  assert.equal(evaluate({ integrationCommit: "f".repeat(40) }).code, "VSA-RECOVERY-AUTHORIZATION");
  assert.equal(evaluate({ integrationParent: "f".repeat(40) }).code, "VSA-RECOVERY-AUTHORIZATION");
  assert.equal(evaluate({ parentRegistryBlobOid: "f".repeat(40) }).code, "VSA-RECOVERY-AUTHORIZATION");
  assert.equal(evaluate({ defectRegistryBlobOid: "f".repeat(41) }).code, "VSA-RECOVERY-AUTHORIZATION");
});

test("changed or dropped historical row cannot qualify as ordering-only", () => {
  const altered = [...defectRows];
  altered[10] = { ...altered[10], invariantPinned: "changed" };
  assert.equal(evaluate({ defectBytes: registry(altered) }).code, "VSA-RECOVERY-NOT-ORDERING-ONLY");
  assert.equal(evaluate({ defectBytes: registry(defectRows.slice(1)) }).code, "VSA-RECOVERY-SHAPE");
});

test("candidate must restore original order and preserve b7 addition order without duplicate identities", () => {
  assert.equal(evaluate({ candidateBytes: registry([...prior, ...additions].reverse()) }).code, "VSA-RECOVERY-CANDIDATE-MISMATCH");
  assert.equal(evaluate({ candidateBytes: registry([...prior, ...additions.slice().reverse()]) }).code, "VSA-RECOVERY-CANDIDATE-MISMATCH");
  const duplicate = [...prior, ...additions, { name: prior[0].name, file: "other.test.mjs" }];
  assert.equal(evaluate({ candidateBytes: registry(duplicate) }).code, "VSA-RECOVERY-DUPLICATE-IDENTITY");
  const duplicateFile = [...prior, ...additions, { name: "other-name", file: prior[0].file }];
  assert.equal(evaluate({ candidateBytes: registry(duplicateFile) }).code, "VSA-RECOVERY-DUPLICATE-IDENTITY");
});

test("missing restoration and an unrelated historical commit are not accepted", () => {
  assert.equal(evaluate({ candidateBytes: registry(defectRows) }).code, "VSA-RECOVERY-CANDIDATE-MISMATCH");
  const sameShapeWrongRestoration = [{ name: "unrelated", file: "unrelated.test.mjs" }, ...prior.slice(1), ...additions];
  assert.equal(sameShapeWrongRestoration.length, prior.length + additions.length);
  assert.equal(evaluate({ candidateBytes: registry(sameShapeWrongRestoration) }).code, "VSA-RECOVERY-CANDIDATE-MISMATCH");
  assert.equal(evaluate({ integrationCommit: "f".repeat(40) }).code, "VSA-RECOVERY-AUTHORIZATION");
});

// D101: the exception must be provable from committed history alone, in a clone
// that has no machine-local receipt directory at all.
const INTENT = "9".repeat(64);
const pretty = (names) => registry(names.map((name) => ({ name, file: `${name}.test.mjs` })));
function recoveryFixture(f, { trailerIntent = INTENT, entryIntent = INTENT, commitRecovery = true } = {}) {
  f.writeConfig([f.tp13]);
  writeFileSync(join(f.root, "harness", "verify-suites.json"), pretty(["a", "b"]));
  f.commit("introduce protected append");
  const parent = f.git("rev-parse", "HEAD").trim();
  writeFileSync(join(f.root, "harness", "verify-suites.json"), pretty(["a", "x", "y", "b"]));
  f.git("add", ".");
  f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "import",
    "-m", `Dispatch: quality-package-${trailerIntent} (integration)\nAI-Assisted: true`);
  const integration = f.git("rev-parse", "HEAD").trim();
  writeFileSync(join(f.root, "harness", "verify-suites.json"), pretty(["a", "b", "x", "y"]));
  f.commit("restore order");
  const recovery = {
    schema: "pipeline.verify-suite-history-recovery.v1",
    entries: [{
      schema: entry.schema, integrationCommit: integration, integrationParent: parent,
      integrationIntentSha256: entryIntent,
      parentRegistryBlobOid: f.git("rev-parse", parent + ":harness/verify-suites.json").trim(),
      defectRegistryBlobOid: f.git("rev-parse", integration + ":harness/verify-suites.json").trim(),
      priorSuiteCount: 2, appendedSuiteCount: 2,
    }],
  };
  writeFileSync(join(f.root, "harness", "verify-suite-history-recovery.json"), JSON.stringify(recovery, null, 2) + "\n");
  if (commitRecovery) f.commit("record recovery");
}

test("integration trailer witness binds the exact intent digest recorded in the recovery entry", () => {
  const message = (sha) => `import\n\nDispatch: quality-package-${sha} (integration)\nAI-Assisted: true\n`;
  assert.equal(integrationTrailerWitness({ entry: { ...entry, integrationIntentSha256: INTENT }, message: message(INTENT) }), true);
  assert.equal(integrationTrailerWitness({ entry: { ...entry, integrationIntentSha256: INTENT }, message: message("8".repeat(64)) }), false);
  assert.equal(integrationTrailerWitness({ entry, message: "import\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n" }), false);
  assert.equal(integrationTrailerWitness({ entry: { ...entry, integrationIntentSha256: "short" }, message: message(INTENT) }), false);
});

test("committed ordering repair is accepted from tracked history alone, with no receipt directory", () => fixture((f) => {
  recoveryFixture(f);
  const result = checkVerifySuiteAppend({ rootDir: f.root });
  assert.equal(result.ok, true);
  assert.equal(result.code, "VSA-HISTORY-APPEND-ONLY-RECORDED-RESTORATION");
}));

test("the same repair is refused when the integration trailer, the entry digest, or the commit state differs", () => {
  for (const options of [
    { trailerIntent: "8".repeat(64) },
    { entryIntent: "8".repeat(64) },
    { commitRecovery: false },
  ]) fixture((f) => {
    recoveryFixture(f, options);
    assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
  });
});

// D103: later rows may be inserted anywhere, also while a recorded restoration is in force.
test("a mid-file insertion commit is admitted by the relaxed contract; a change next to it is not", () => fixture((f) => {
  f.writeConfig([f.tp13]);
  f.writeRegistry(["a", "b"]);
  f.commit("introduce protected registry");
  f.writeRegistry(["a", "x", "b"]);
  f.commit("insert in the middle");
  f.writeRegistry(["w", "a", "x", "b", "c"]);
  f.commit("insert in front and append");
  assert.deepEqual(checkVerifySuiteAppend({ rootDir: f.root }),
    { ok: true, code: "VSA-HISTORY-APPEND-ONLY", checked: 3 });
  f.writeRegistry(["w", "a", "b", "x", "c", "d"]);
  f.commit("reorder prior rows while appending");
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
}));

test("the recorded restoration still holds after later rows were inserted mid-file", () => {
  const restoredWithInsertions = registry([...prior.slice(0, 50), { name: "mid-a", file: "mid-a.test.mjs" },
    ...prior.slice(50), ...additions.slice(0, 5), { name: "mid-b", file: "mid-b.test.mjs" }, ...additions.slice(5),
    { name: "tail", file: "tail.test.mjs" }]);
  const result = evaluate({ candidateBytes: restoredWithInsertions });
  assert.equal(result.code, "VSA-RECOVERY-VERIFIED");
  assert.equal(result.futureAppendCount, 3);
  const lostRow = registry([...prior.slice(0, 50), ...prior.slice(51), ...additions, { name: "tail", file: "tail.test.mjs" }]);
  assert.equal(evaluate({ candidateBytes: lostRow }).code, "VSA-RECOVERY-CANDIDATE-MISMATCH");
  const duplicated = registry([...prior, ...additions, { name: "tail", file: additions[0].file }]);
  assert.equal(evaluate({ candidateBytes: duplicated }).code, "VSA-RECOVERY-DUPLICATE-IDENTITY");
});

// D107: one exact, byte-bound, unsigned exception for a duplicate row added by one commit
// and removed again by another. Narrow by construction: it names two full commit SHAs and
// four registry digests, so a look-alike commit of the same shape stays refused.
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const row = (name, extra = {}) => ({ name, file: `${name}.test.mjs`, ...extra });
const rowHash = (value) => sha256(canonical(value));
const dupRow = row("a", { invariantPinned: "generic second entry" });
const registryText = (rows) => JSON.stringify({ schema: "pipeline.verify-suites.v1", suites: rows }, null, 2) + "\n";
function dupRepairHistory(f, { lookAlike = false, mutateEntry = (e) => e, commitRecovery = true } = {}) {
  const write = (rows) => writeFileSync(join(f.root, "harness", "verify-suites.json"), registryText(rows));
  const sha = (rev) => f.git("rev-parse", rev).trim();
  const bytes = (rev) => f.git("show", rev + ":harness/verify-suites.json");
  f.writeConfig([f.tp13]);
  write([row("a"), row("b")]);
  f.commit("introduce protected registry");
  write([row("a"), row("b"), row("c"), dupRow]);
  f.commit("add rows including a duplicate identity");
  const addCommit = sha("HEAD");
  write([row("a"), row("b"), row("c"), row("d"), row("e")]);
  f.commit("drop the duplicate again and add rows");
  const removeCommit = sha("HEAD");
  const dupEntry = mutateEntry({
    schema: "pipeline.verify-suite-duplicate-repair-entry.v1",
    addCommit, addParent: sha(addCommit + "^"), removeCommit, removeParent: sha(removeCommit + "^"),
    addPreimageSha256: sha256(bytes(addCommit + "^")), addPostimageSha256: sha256(bytes(addCommit)),
    removePreimageSha256: sha256(bytes(removeCommit + "^")), removePostimageSha256: sha256(bytes(removeCommit)),
    duplicateName: dupRow.name, duplicateFile: dupRow.file, duplicateRowSha256: rowHash(dupRow),
    owner: "Elephant", signed: false,
    reason: "Historical, unsigned exception recorded by the Elephant: narrow, bound to these two commits and their registry bytes, not extendable.",
  });
  if (lookAlike) {
    // The very same shape again, by two other commits that the entry does not name.
    write([row("a"), row("b"), row("c"), row("d"), row("e"), row("g", { invariantPinned: "x" }), row("g2", { name: "d", file: "d.test.mjs", invariantPinned: "generic" })]);
    f.commit("look-alike: add a duplicate identity again");
    write([row("a"), row("b"), row("c"), row("d"), row("e"), row("g", { invariantPinned: "x" }), row("h")]);
    f.commit("look-alike: drop it again");
  }
  writeFileSync(join(f.root, "harness", "verify-suite-history-recovery.json"), JSON.stringify({
    schema: "pipeline.verify-suite-history-recovery.v1", entries: [entry], duplicateRepairs: [dupEntry],
  }, null, 2) + "\n");
  if (commitRecovery) f.commit("record recovery");
  return { dupEntry, addCommit, removeCommit };
}

test("a duplicate row added by one commit and removed by another is accepted only for the exactly named pair", () => fixture((f) => {
  dupRepairHistory(f);
  const result = checkVerifySuiteAppend({ rootDir: f.root });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.code, "VSA-HISTORY-APPEND-ONLY-RECORDED-DUPLICATE-REPAIR");
}));

test("a look-alike commit pair of the same shape is refused (the exception is not extendable)", () => fixture((f) => {
  const { addCommit } = dupRepairHistory(f, { lookAlike: true });
  const result = checkVerifySuiteAppend({ rootDir: f.root });
  assert.equal(result.ok, false);
  assert.equal(result.code, "VSA-ENTRY");
  assert.notEqual(result.detail, addCommit);
}));

test("the exception is refused when a digest, a commit, the reason or the commit state is wrong", () => {
  const variants = [
    (e) => ({ ...e, addPostimageSha256: "0".repeat(64) }),
    (e) => ({ ...e, removePreimageSha256: "0".repeat(64) }),
    (e) => ({ ...e, addCommit: "f".repeat(40) }),
    (e) => ({ ...e, removeCommit: e.addCommit }),
    (e) => ({ ...e, duplicateRowSha256: "1".repeat(64) }),
    (e) => ({ ...e, signed: true }),
    (e) => ({ ...e, owner: "Someone" }),
    (e) => ({ ...e, reason: "short" }),
    (e) => ({ ...e, extra: 1 }),
  ];
  for (const mutateEntry of variants) fixture((f) => {
    dupRepairHistory(f, { mutateEntry });
    assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).ok, false, mutateEntry.toString());
  });
  fixture((f) => {
    dupRepairHistory(f, { commitRecovery: false });
    assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).ok, false);
  });
});

test("evaluateDuplicateRepair derives the shape from the bytes: no duplicate add, no removal, or an extra change is refused", () => {
  const base = [row("a"), row("b")];
  const withDup = [...base, row("c"), dupRow];
  const fixed = [...base, row("c"), row("d")];
  const input = (over = {}) => {
    const e = {
      schema: "pipeline.verify-suite-duplicate-repair-entry.v1",
      addCommit: "a".repeat(40), addParent: "b".repeat(40), removeCommit: "c".repeat(40), removeParent: "d".repeat(40),
      addPreimageSha256: sha256(registryText(base)), addPostimageSha256: sha256(registryText(withDup)),
      removePreimageSha256: sha256(registryText(withDup)), removePostimageSha256: sha256(registryText(fixed)),
      duplicateName: dupRow.name, duplicateFile: dupRow.file, duplicateRowSha256: rowHash(dupRow),
      owner: "Elephant", signed: false, reason: "Historical, unsigned exception recorded by the Elephant: narrow, not extendable.",
    };
    return { entry: e, addCommit: e.addCommit, addParent: e.addParent, removeCommit: e.removeCommit, removeParent: e.removeParent,
      addBeforeBytes: registryText(base), addAfterBytes: registryText(withDup),
      removeBeforeBytes: registryText(withDup), removeAfterBytes: registryText(fixed), ...over };
  };
  assert.equal(evaluateDuplicateRepair(input()).ok, true);
  // The add step must really be a duplicate identity, not a plain append.
  const plain = [...base, row("c"), row("z")];
  assert.equal(evaluateDuplicateRepair(input({ addAfterBytes: registryText(plain) })).ok, false);
  // The removal step must remove exactly that row and change no other prior row.
  const alsoRemoved = [row("a"), row("c"), row("d")];
  assert.equal(evaluateDuplicateRepair(input({ removeAfterBytes: registryText(alsoRemoved) })).ok, false);
  const keptDup = [...base, row("c"), dupRow, row("d")];
  assert.equal(evaluateDuplicateRepair(input({ removeAfterBytes: registryText(keptDup) })).ok, false);
  const changedPrior = [row("a"), { ...row("b"), invariantPinned: "weakened" }, row("c"), row("d")];
  assert.equal(evaluateDuplicateRepair(input({ removeAfterBytes: registryText(changedPrior) })).ok, false);
});

test("full history traversal refuses a rewrite when recovery is missing or invalid", () => {
  const invalidRecovery = JSON.stringify({
    schema: "pipeline.verify-suite-history-recovery.v1",
    entries: [{ ...entry, integrationCommit: "f".repeat(41) }],
  });
  for (const recoveryContents of [null, invalidRecovery]) fixture((f) => {
    f.writeConfig([f.tp13]);
    f.writeRegistry(["a", "b"]);
    f.commit("introduce protected append");
    f.writeRegistry(["z", "b", "c"]);
    f.commit("unrelated historical rewrite");
    f.writeRegistry(["z", "b", "c", "d"]);
    f.commit("later append that must not mask rewrite");
    if (recoveryContents !== null) {
      writeFileSync(join(f.root, "harness", "verify-suite-history-recovery.json"), recoveryContents);
    }
    assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
  });
});
