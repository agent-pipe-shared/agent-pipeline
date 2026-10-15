#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Pin for backlog item pipeline.onboarding-test-runner-reports-async-pass-before-settlement
// (AC-221). The onboarding suite's runner once counted an async callback as PASSED
// before it settled. Acceptance points pinned here:
//   A1 fulfilled and rejected promises settle before their PASS/FAIL/END disposition
//   A2 the original installed-plugin scanner fixture (SECGATE-2) completes with the
//      current dependency closure (both scanner diagnostics modules copied)
//   A3 a child with no B8 coverage is valid; missing/invalid/duplicate reports fail;
//      an entirely unobserved corpus cannot pass
//   A4 (complete-suite consistency) the corpus declares 216 unique cases that the
//      12 children partition exactly; the full-suite run itself is NOT run here
//
// Fixtures live under the repository's scratch/ (never the OS temp dir). No case here
// needs directory mode bits or directory symlinks, so none is skipped for the
// native-Windows host limitation (owner Coordinator, due 2026-10-19, Linux/WSL run).

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(here, "..");
const repoRoot = resolve(here, "..", "..", "..", "..");
const suitePath = join(libDir, "project-onboarding-v3.test.mjs");
const suiteSource = readFileSync(suitePath, "utf8");

const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const scratchRoot = mkdtempSync(join(scratchBase, "async-settlement-pin-"));
const savedEnv = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
// Redirect the suite's own fixture helpers (tmpdir()) into scratch/ for the duration of this file.
const fixtureTmp = join(scratchRoot, "tmp");
mkdirSync(fixtureTmp, { recursive: true });
for (const key of ["TEMP", "TMP", "TMPDIR"]) process.env[key] = fixtureTmp;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- shared harness -------------------------------------------------------
async function captureRun(runner, cases) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => { lines.push(args.join(" ")); };
  let results;
  try { results = await runner(cases); } finally { console.log = original; }
  return { lines, results };
}

function makeCases() {
  const state = { fulfilledSettled: false, rejectedSettled: false };
  const observed = [];
  const cases = [
    { index: 0, id: "POV-fulfilled", name: "fulfilled-late", run: async () => { await sleep(40); state.fulfilledSettled = true; } },
    { index: 1, id: "POV-rejected", name: "rejected-late", run: () => {
      const p = (async () => { await sleep(40); state.rejectedSettled = true; throw new Error("late rejection"); })();
      p.catch(() => {}); // keep a never-awaiting runner from crashing the pin with an unhandled rejection
      return p;
    } },
    { index: 2, id: "POV-sync-throw", name: "sync-throw", run: () => { throw new Error("sync boom"); } },
  ];
  return { state, cases, observed };
}

// What a correct runner must satisfy; shared by the production check and the RED mirror.
function assertSettlementSemantics({ lines, results }, state) {
  assert.deepEqual(results.map((r) => [r.index, r.id, r.disposition]), [
    [0, "POV-fulfilled", "pass"], [1, "POV-rejected", "fail"], [2, "POV-sync-throw", "fail"],
  ], "dispositions must reflect the settled outcome of each callback");
  // Since log capture is a flat list, assert order via the settle flags checked at emit time.
  const passIdx = lines.findIndex((l) => l.startsWith("PASS  fulfilled-late"));
  assert.ok(passIdx >= 0, "fulfilled callback must report PASS");
  assert.equal(state.fulfilledSettled, true);
  assert.ok(!lines.some((l) => l.startsWith("PASS  rejected-late")), "a rejected callback must never be reported PASS");
  assert.ok(lines.some((l) => l.startsWith("FAIL  rejected-late -- late rejection")), "rejection must be reported FAIL with its message");
  assert.ok(lines.some((l) => /CALLBACK END .*index=1 .*outcome=throw/u.test(l)), "rejected END outcome must be throw");
  assert.ok(lines.some((l) => /CALLBACK END .*index=0 .*outcome=pass/u.test(l)));
}

// Ordering evidence: record, at the moment each PASS/FAIL/END line is emitted, whether the
// callback's own settle flag was already set.
async function runWithOrderProbe(runner) {
  const { state, cases } = makeCases();
  const emitted = [];
  const original = console.log;
  console.log = (...args) => {
    const line = args.join(" ");
    emitted.push({ line, fulfilledSettled: state.fulfilledSettled, rejectedSettled: state.rejectedSettled });
  };
  let results;
  try { results = await runner(cases); } finally { console.log = original; }
  return { emitted, results, state };
}
function assertOrder({ emitted }) {
  const pass = emitted.find((e) => e.line.startsWith("PASS  fulfilled-late"));
  assert.ok(pass, "fulfilled callback must report PASS");
  assert.equal(pass.fulfilledSettled, true, "PASS must be emitted only after the promise fulfilled");
  const endFulfilled = emitted.find((e) => /CALLBACK END .*index=0 /u.test(e.line));
  assert.equal(endFulfilled?.fulfilledSettled, true, "END must follow settlement");
  const fail = emitted.find((e) => e.line.startsWith("FAIL  rejected-late"));
  assert.ok(fail, "rejected callback must report FAIL");
  assert.equal(fail.rejectedSettled, true, "FAIL must be emitted only after the promise rejected");
  const endRejected = emitted.find((e) => /CALLBACK END .*index=1 /u.test(e.line));
  assert.equal(endRejected?.rejectedSettled, true);
}

// ---- suite import ---------------------------------------------------------
let suite;
before(async () => {
  // Import executes zero cases (DIRECT_INVOCATION is false); it only declares the corpus.
  suite = await import(pathToFileURL(suitePath).href);
});
after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(scratchRoot, { recursive: true, force: true });
});

// ---- A1 -------------------------------------------------------------------
describe("A1: fulfilled and rejected promises settle before their completion disposition", () => {
  it("the real runAssignedCases awaits each callback before PASS/FAIL/END and records the settled disposition", async () => {
    const probe = await runWithOrderProbe((cases) => suite.runAssignedCases(cases));
    assertOrder(probe);
    const { lines, results } = await (async () => {
      const { state, cases } = makeCases();
      const out = await captureRun((c) => suite.runAssignedCases(c), cases);
      assertSettlementSemantics(out, state);
      return out;
    })();
    assert.equal(results.length, 3);
    assert.ok(lines.length > 0);
  });

  it("RED control: a scratch mirror of the function without the await reports PASS before settlement and fails these assertions", async () => {
    const start = suiteSource.indexOf("export async function runAssignedCases");
    const end = suiteSource.indexOf("function assertClosedKeys");
    assert.ok(start > 0 && end > start, "runAssignedCases must be locatable in the suite source");
    const original = suiteSource.slice(start, end);
    assert.ok(original.includes("await run()"), "production function must await each callback");
    const broken = original.replace("await run()", "run()");
    assert.notEqual(broken, original);
    const mirrorPath = join(scratchRoot, "runner-mirror-unawaited.mjs");
    writeFileSync(mirrorPath,
      `const shard = 0; let passed = 0; const failures = []; const assignedCases = [];\n${broken}\n`);
    const mirror = await import(pathToFileURL(mirrorPath).href);
    const probe = await runWithOrderProbe((cases) => mirror.runAssignedCases(cases));
    assert.throws(() => assertOrder(probe), "the unawaited mirror must be caught by the ordering assertion");
    assert.deepEqual(probe.results.slice(0, 2).map((r) => r.disposition), ["pass", "pass"],
      "unawaited mirror reports the callback that later rejects as pass");
    // The faithful (awaited) mirror is meaningful too: same extraction, unmodified, must pass.
    const goodPath = join(scratchRoot, "runner-mirror-awaited.mjs");
    writeFileSync(goodPath, `const shard = 0; let passed = 0; const failures = []; const assignedCases = [];\n${original}\n`);
    const good = await import(pathToFileURL(goodPath).href);
    assertOrder(await runWithOrderProbe((cases) => good.runAssignedCases(cases)));
  });
});

// ---- A2 -------------------------------------------------------------------
function parseCopyMap() {
  const start = suiteSource.indexOf("const COPY_MAP = [");
  const end = suiteSource.indexOf("];", start);
  assert.ok(start > 0 && end > start, "SECGATE-2 COPY_MAP must be locatable");
  return [...suiteSource.slice(start, end).matchAll(/\["(\.{1,2}\/[^"]+)",/gu)].map((m) => m[1]);
}

describe("A2: the original installed-plugin scanner fixture completes with the current closure", () => {
  it("the fixture copy list carries both scanner diagnostics modules and every copied source exists", () => {
    const entries = parseCopyMap();
    assert.ok(entries.includes("./security-scanner-diagnostics.mjs"));
    assert.ok(entries.includes("./security-scanner-diagnostics-publication.mjs"));
    for (const rel of entries) assert.ok(existsSync(fileURLToPath(new URL(rel, pathToFileURL(suitePath)))), `missing copy source ${rel}`);
  });

  it("every relative import reachable from the copied scanner modules is itself in the copy list", () => {
    const copied = new Set(parseCopyMap().map((rel) => resolve(libDir, rel)));
    const missing = [];
    for (const file of copied) {
      if (!file.endsWith(".mjs")) continue;
      const source = readFileSync(file, "utf8");
      const specs = [...source.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/gu)].map((m) => m[1]);
      for (const spec of specs) {
        const target = resolve(dirname(file), spec);
        if (!copied.has(target)) missing.push(`${file.slice(repoRoot.length + 1)} -> ${spec}`);
      }
    }
    assert.deepEqual(missing, [], "copy list must be closed under relative imports");
  });

  it("the real SECGATE-2 case body, run through its own fixture, settles and passes", async () => {
    const entry = suite.ONBOARDING_TEST_CASES.find((e) => e.name.endsWith("(SECGATE-2)"));
    assert.ok(entry, "SECGATE-2 case must be declared in the corpus");
    // The suite's own temporaryBase() refuses any temp parent that sits under a Git control, and
    // scratch/ is inside this repository, so this one case must use the host default temp dir
    // (the helper removes what it creates). Restored right after.
    const redirected = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    let results, lines;
    try { ({ results, lines } = await captureRun((cases) => suite.runAssignedCases(cases), [entry])); }
    finally { for (const [key, value] of Object.entries(redirected)) process.env[key] = value; }
    assert.deepEqual(results,[{ index: entry.index, id: entry.id, disposition: "pass" }], lines.filter((l) => l.startsWith("FAIL")).join("\n"));
  });
});

// ---- A3 -------------------------------------------------------------------
const SHARDS = 6, CHUNKS = 2, EXPECTED = 216;
const assigned = (index, shard, chunk) => index % SHARDS === shard && Math.floor(index / SHARDS) % CHUNKS === chunk;

function expectedFor(shard, chunk) {
  return suite.ONBOARDING_TEST_CASES.filter((e) => assigned(e.index, shard, chunk)).map(({ index, id }) => ({ index, id }));
}
function receiptFor(shard, chunk, classes = [], disposition = "pass") {
  const cases = expectedFor(shard, chunk);
  return {
    schema: "pipeline.onboarding-test-case-results.v1", shard, chunk, declaredCount: EXPECTED,
    assignedIndices: cases.map((c) => c.index),
    results: cases.map((c) => ({ index: c.index, id: c.id, disposition })),
    classes,
  };
}

describe("A3: per-child coverage reports", () => {
  it("a child that observed no B8 command (empty classes) is a valid, closing report", () => {
    const expected = expectedFor(0, 0);
    const receiver = suite.createShardReceiptReceiver(0, 0, expected);
    receiver.receive(receiptFor(0, 0, []));
    const closed = receiver.close(0, null);
    assert.deepEqual(closed.classes, []);
    const withClasses = suite.createShardReceiptReceiver(1, 0, expectedFor(1, 0));
    withClasses.receive(receiptFor(1, 0, ["a:b", "c:d"]));
    assert.deepEqual(withClasses.close(0, null).classes, ["a:b", "c:d"]);
  });

  it("a missing report fails the child close", () => {
    const receiver = suite.createShardReceiptReceiver(0, 0, expectedFor(0, 0));
    assert.throws(() => receiver.close(0, null), /child callback receipt missing/u);
  });

  it("a duplicate report fails the child close", () => {
    const receiver = suite.createShardReceiptReceiver(0, 0, expectedFor(0, 0));
    receiver.receive(receiptFor(0, 0, []));
    receiver.receive(receiptFor(0, 0, []));
    assert.throws(() => receiver.close(0, null), /one terminal callback receipt per child/u);
  });

  it("invalid reports are refused", () => {
    const expected = expectedFor(0, 0);
    const good = receiptFor(0, 0, ["a:b"]);
    const bad = {
      "wrong schema": { ...good, schema: "other" },
      "extra key": { ...good, extra: 1 },
      "wrong chunk": { ...good, chunk: 1 },
      "wrong declared count": { ...good, declaredCount: 215 },
      "missing result": { ...good, results: good.results.slice(1) },
      "wrong id": { ...good, results: [{ ...good.results[0], id: "POV-x" }, ...good.results.slice(1)] },
      "bad disposition": { ...good, results: [{ ...good.results[0], disposition: "skipped" }, ...good.results.slice(1)] },
      "unsorted classes": { ...good, classes: ["b:b", "a:a"] },
      "duplicate classes": { ...good, classes: ["a:a", "a:a"] },
      "non-string class": { ...good, classes: [7] },
      "classes not an array": { ...good, classes: "a:a" },
    };
    for (const [label, value] of Object.entries(bad)) {
      assert.throws(() => suite.validateShardReceipt(value, 0, 0, expected), undefined, `${label} must be refused`);
      const receiver = suite.createShardReceiptReceiver(0, 0, expected);
      receiver.receive(value);
      assert.throws(() => receiver.close(0, null), undefined, `${label} must fail the close`);
    }
  });

  it("child exit status must agree with the reported callback outcomes", () => {
    const expected = expectedFor(0, 0);
    const pass = suite.createShardReceiptReceiver(0, 0, expected); pass.receive(receiptFor(0, 0));
    assert.throws(() => pass.close(1, null), /child exit must agree/u);
    const fail = suite.createShardReceiptReceiver(0, 0, expected); fail.receive(receiptFor(0, 0, [], "fail"));
    assert.throws(() => fail.close(0, null), /child exit must agree/u);
    const signalled = suite.createShardReceiptReceiver(0, 0, expected); signalled.receive(receiptFor(0, 0));
    assert.throws(() => signalled.close(null, "SIGKILL"), /terminated before a validated close/u);
  });

  it("an entirely unobserved corpus cannot pass: the parent requires nonempty coverage across successful children (structural pin)", () => {
    // The aggregate decision is inline in the suite's direct-invocation parent block and is
    // not exported, so it is pinned structurally (full behavior needs the 216-case run).
    assert.match(suiteSource,
      /if \(failed\.length === 0\) \{[\s\S]*?const classes = new Set\(results\.flatMap\(\(result\) => result\.coverage\)\);\s*assert\.ok\(classes\.size > 0, "B8 corpus must reach at least one real session command"\);/u);
    assert.match(suiteSource, /classes: \[\.\.\.b8ObservedCommandClasses\]\.sort\(\)/u, "children must report coverage once over IPC");
    // Each observed producer action still requires its real guard check (not a per-child requirement).
    assert.match(suiteSource, /assert\.deepEqual\(guarded, \{ exitCode: 0, stderr: "" \},[\s\S]*?b8ObservedCommandClasses\.add\(/u);
    assert.doesNotMatch(suiteSource, /b8ObservedCommandClasses\.size\s*>\s*0/u, "no per-child nonempty-coverage requirement");
  });
});

// ---- A4 -------------------------------------------------------------------
describe("A4: case-count consistency (complete suite run itself is out of this pin's scope)", () => {
  it("216 unique declared cases are partitioned exactly once by the 12 children, 18 each", () => {
    const cases = suite.ONBOARDING_TEST_CASES;
    assert.equal(cases.length, EXPECTED);
    assert.equal(new Set(cases.map((c) => c.id)).size, EXPECTED);
    assert.deepEqual(cases.map((c) => c.index), Array.from({ length: EXPECTED }, (_, i) => i));
    const owner = new Map();
    for (let chunk = 0; chunk < CHUNKS; chunk += 1) for (let shard = 0; shard < SHARDS; shard += 1) {
      const mine = cases.filter((c) => assigned(c.index, shard, chunk));
      assert.equal(mine.length, EXPECTED / (SHARDS * CHUNKS));
      for (const c of mine) { assert.ok(!owner.has(c.index)); owner.set(c.index, `${shard}/${chunk}`); }
    }
    assert.equal(owner.size, EXPECTED);
    assert.deepEqual([...suite.ONBOARDING_CASE_IDS], cases.map((c) => c.id).sort());
  });
});
