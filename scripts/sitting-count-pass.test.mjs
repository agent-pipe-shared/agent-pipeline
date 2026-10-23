// SPDX-License-Identifier: SUL-1.0
// Purpose: pin scripts/sitting-count-pass.mjs on tiny fixture suites written to a private temp directory (no repository test is run).
// Usage:   node --test scripts/sitting-count-pass.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { runCountPass, defaultSpawn, parseCounts, makeScrubber } from "./sitting-count-pass.mjs";

let base;
let root;
const quiet = () => {};

before(() => {
  base = mkdtempSync(join(tmpdir(), "count-pass-test-"));
  root = join(base, "tree");
  mkdirSync(root, { recursive: true });
  const t = (name, body) => writeFileSync(join(root, name), `import { test } from "node:test";\n${body}\n`);
  t("green.test.mjs", 'test("one", () => {});\ntest("two", () => {});');
  t("red.test.mjs", 'test("good case", () => {});\ntest("broken case alpha", () => { throw new Error("boom"); });');
  t("todo.test.mjs", 'test("ok", () => {});\ntest("later", { todo: true }, () => { throw new Error("not yet"); });\ntest("typed skip", { skip: "windows only" }, () => {});');
  t("slow.test.mjs", 'test("never ends", async () => { await new Promise((r) => setTimeout(r, 60000)); });');
});

after(() => rmSync(base, { recursive: true, force: true }));

const writeList = (name, suites) => {
  const p = join(base, name);
  writeFileSync(p, JSON.stringify({ suites }));
  return p;
};
const entry = (id, file, extra = {}) => ({ id, items: [`pipeline.${id}`], command: ["--test", file], expect: null, heavy: false, why: "fixture", ...extra });

describe("sitting-count-pass", () => {
  test("SCP01 counts green, red and todo/skip suites and writes repository-relative evidence", async () => {
    const list = writeList("l1.json", [entry("green", "green.test.mjs"), entry("red", "red.test.mjs"), entry("todo", "todo.test.mjs"), { id: "nosuite", items: [], command: null, unresolved: "no suite found for the fixture", why: "fixture" }]);
    const out = join(base, "e1.md");
    const lines = [];
    const res = await runCountPass({ list, out, root, home: join(base, "home1"), log: (l) => lines.push(l) });
    assert.equal(res.ok, false);
    const byId = Object.fromEntries(res.records.map((r) => [r.id, r]));
    assert.equal(byId.green.result, "GREEN");
    assert.deepEqual([byId.green.tests, byId.green.pass, byId.green.fail], [2, 2, 0]);
    assert.equal(byId.red.result, "RED");
    assert.equal(byId.red.fail, 1);
    assert.ok(byId.red.failing.some((n) => n.includes("broken case alpha")));
    assert.equal(byId.todo.result, "GREEN");
    assert.equal(byId.todo.todo, 1);
    assert.equal(byId.todo.skipped, 1);
    assert.equal(lines.filter((l) => /^(GREEN|RED|TIMEOUT) /.test(l)).length, 3, "one line per suite");
    const md = readFileSync(out, "utf8");
    assert.match(md, /## Red \(1\)/);
    assert.match(md, /broken case alpha/);
    assert.match(md, /## Skipped typed[\s\S]*`todo`/);
    assert.match(md, /## Unresolved \(not run\)[\s\S]*`nosuite`/);
    assert.match(md, /\| Id \| File \| Tests \| Pass \| Fail \| Skip \| Todo \| Seconds \| Result \|/);
    assert.ok(!md.includes(root), "no absolute root path in the evidence");
    assert.ok(!md.includes(base), "no absolute temp path in the evidence");
    assert.ok(!/\/(home|Users)\//.test(md), "no home path in the evidence");
    assert.ok(existsSync(`${out}.state.jsonl`));
  });

  test("SCP02 a suite that exceeds the cap is TIMEOUT and its process group is stopped", async () => {
    const list = writeList("l2.json", [entry("slow", "slow.test.mjs")]);
    const out = join(base, "e2.md");
    const t0 = Date.now();
    const res = await runCountPass({ list, out, root, home: join(base, "home2"), timeoutMs: 2000, log: quiet });
    assert.equal(res.records[0].result, "TIMEOUT");
    assert.equal(res.records[0].retried, false, "a timeout is not retried");
    assert.ok(Date.now() - t0 < 30000, "the child was stopped near the cap");
    assert.match(readFileSync(out, "utf8"), /TIMEOUT/);
  });

  test("SCP03 --resume skips a finished suite and a second run without it is refused", async () => {
    const list = writeList("l3.json", [entry("green", "green.test.mjs"), entry("todo", "todo.test.mjs")]);
    const out = join(base, "e3.md");
    await runCountPass({ list, out, root, home: join(base, "home3"), only: ["green"], log: quiet });
    const spawned = [];
    const spy = (cmd, args, opts) => { spawned.push(args.join(" ")); return defaultSpawn(cmd, args, opts); };
    await assert.rejects(() => runCountPass({ list, out, root, home: join(base, "home3"), spawn: spy, log: quiet }), /--resume/);
    assert.equal(spawned.length, 0);
    const lines = [];
    const res = await runCountPass({ list, out, root, home: join(base, "home3"), resume: true, spawn: spy, log: (l) => lines.push(l) });
    assert.deepEqual(spawned, ["--test todo.test.mjs"], "only the unfinished suite ran");
    assert.ok(lines.some((l) => l.startsWith("SKIP-DONE green")));
    assert.equal(res.records.length, 2);
    assert.match(readFileSync(out, "utf8"), /2 suites run/);
  });

  test("SCP04 a null !== 0 process failure is retried once and recorded as retried", async () => {
    const list = writeList("l4.json", [entry("flaky", "green.test.mjs")]);
    const calls = [];
    const spawn = async (_cmd, _args, opts) => {
      calls.push(opts.env.TMPDIR);
      if (calls.length === 1) return { status: 1, signal: null, stdout: "not ok 1\n  Process failed: null !== 0\nℹ tests 1\nℹ pass 0\nℹ fail 1\nℹ skipped 0\nℹ todo 0\n", stderr: "" };
      return { status: 0, signal: null, stdout: "ℹ tests 1\nℹ pass 1\nℹ fail 0\nℹ skipped 0\nℹ todo 0\n", stderr: "" };
    };
    const out = join(base, "e4.md");
    const res = await runCountPass({ list, out, root, home: join(base, "home4"), spawn, log: quiet });
    assert.equal(calls.length, 2);
    assert.equal(res.records[0].result, "GREEN");
    assert.equal(res.records[0].retried, true);
    assert.match(res.records[0].firstAttempt, /null !== 0/);
    assert.match(readFileSync(out, "utf8"), /GREEN \(retried\)/);
    assert.ok(calls[0].includes("pipeline-test-tmp"), "private TMPDIR under the injected home");
  });

  test("SCP05 a killed child is retried once, a plain red is not, and the child env has no NODE_TEST_CONTEXT", async () => {
    const list = writeList("l5.json", [entry("killed", "green.test.mjs"), entry("plain", "red.test.mjs")]);
    let killedCalls = 0;
    let plainCalls = 0;
    let sawContext = false;
    const prev = process.env.NODE_TEST_CONTEXT;
    process.env.NODE_TEST_CONTEXT = "child-v8";
    const spawn = async (_cmd, args, opts) => {
      if ("NODE_TEST_CONTEXT" in opts.env) sawContext = true;
      if (args.includes("green.test.mjs")) { killedCalls += 1; return killedCalls === 1 ? { status: null, signal: "SIGKILL", stdout: "", stderr: "" } : { status: 0, signal: null, stdout: "ℹ tests 2\nℹ pass 2\nℹ fail 0\nℹ skipped 0\nℹ todo 0\n", stderr: "" }; }
      plainCalls += 1;
      return { status: 1, signal: null, stdout: "ℹ tests 2\nℹ pass 1\nℹ fail 1\nℹ skipped 0\nℹ todo 0\n", stderr: "" };
    };
    try {
      const res = await runCountPass({ list, out: join(base, "e5.md"), root, home: join(base, "home5"), spawn, log: quiet });
      assert.equal(killedCalls, 2);
      assert.equal(plainCalls, 1);
      assert.equal(res.records[0].result, "GREEN");
      assert.equal(res.records[1].result, "RED");
      assert.equal(res.records[1].retried, false);
      assert.equal(sawContext, false);
    } finally {
      if (prev === undefined) delete process.env.NODE_TEST_CONTEXT;
      else process.env.NODE_TEST_CONTEXT = prev;
    }
  });

  test("SCP06 expect.minPass turns a thin green into RED, and suites never overlap", async () => {
    const list = writeList("l6.json", [entry("thin", "green.test.mjs", { expect: { minPass: 5 } }), entry("second", "todo.test.mjs")]);
    let running = 0;
    let maxRunning = 0;
    const spawn = async (cmd, args, opts) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      try { return await defaultSpawn(cmd, args, opts); } finally { running -= 1; }
    };
    const res = await runCountPass({ list, out: join(base, "e6.md"), root, home: join(base, "home6"), spawn, log: quiet });
    assert.equal(res.records[0].result, "RED");
    assert.equal(maxRunning, 1);
  });

  test("SCP07 only counts and path scrubbing helpers behave", () => {
    assert.deepEqual(parseCounts("ℹ tests 3\nℹ pass 2\nℹ fail 0\nℹ skipped 1\nℹ todo 0\n"), { tests: 3, pass: 2, fail: 0, skipped: 1, todo: 0, custom: false });
    assert.equal(parseCounts("161/161 cases passed").tests, 161);
    assert.equal(parseCounts("24 passed, 0 failed").pass, 24);
    assert.equal(parseCounts("nothing").tests, null);
    const ctl = parseCounts("PASS  a\nproject-onboarding-v3: 216 cases across 3 sequential chunks of 4 shards, 0 shards failed\n");
    assert.deepEqual([ctl.tests, ctl.pass, ctl.fail, ctl.custom], [216, 216, 0, true]);
    const scrub = makeScrubber({ root: "/work/some/tree", home: "/home/alice", user: "alice" });
    assert.equal(scrub("at /work/some/tree/x.mjs and /home/alice/y and /home/bob/z"), "at <path>/x.mjs and <path>/y and <path>/z");
  });
});
