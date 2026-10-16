#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALF-C-P19-05D / AC-127: unit test of the briefing route record PRODUCER
// (lib/dispatch-briefing-route-record.mjs), V-10 of pipeline.claude-windows-greenfield-lifecycle-not-walkable.
//
// ALF-C-P19-05C put the digest binding into hooks/guard-dispatch.mjs (evaluateBriefingRoute) but no product
// flow wrote the record the guard reads, so the binding never fired. These cases pin the producer against the
// guard's OWN reader and builder: the record lands exactly where evaluateBriefingRoute looks, carries the digest
// of the briefing text actually sent, and a mirror that removes any of those properties fails the same check.
//
// Host limitation: no symlink or directory-mode case is used here, so no case is skipped.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BRIEFING_ROUTE_SCHEMA, briefingRoutePath, buildBriefingRoute, evaluateBriefingRoute } from "../hooks/guard-dispatch.mjs";
import { DISPATCH_BRIEFING_ROUTE_RESULT_SCHEMA, recordDispatchBriefingRoute } from "./dispatch-briefing-route-record.mjs";

const REPO_SCRATCH = fileURLToPath(new URL("../../../scratch/", import.meta.url));
const MODULE_URL = pathToFileURL(fileURLToPath(new URL("./dispatch-briefing-route-record.mjs", import.meta.url))).href;
const SLICE = "ALF-D-UNIT";
const sha256Of = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const briefingFor = (sliceId, body = "alpha") => [
  "Goldfish task: route record producer unit fixture.",
  `Goal: keep the ${body} path green.`,
  "- **Tool budget (hard cap, first-class field):** 40 tool uses.",
  `- **Slice:** ${sliceId}`,
  "- **Write scope:** none",
].join("\n");
const BRIEFING = briefingFor(SLICE);

let counter = 0;
function withRoot(fn) {
  counter += 1;
  const root = join(REPO_SCRATCH, `alf-c-p19-05d-route-${process.pid}-${counter}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const producer = (root, prompt) => {
  const result = recordDispatchBriefingRoute({ root, prompt });
  assert.equal(result.status, "recorded", `the producer must record the route: ${JSON.stringify(result)}`);
  return result;
};

/** The V-10 clause at the producer boundary: after `produce`, the guard's own reader binds the sent text. */
function checkRoute(root, prompt, produce) {
  produce(root, prompt);
  const matched = evaluateBriefingRoute({ prompt, root });
  assert.equal(matched.status, "match", `the guard must find a matching route: ${JSON.stringify(matched)}`);
  const canonical = (text) => text.replace(/\r\n/gu, "\n"); // the one canonical form: CRLF -> LF, nothing else
  assert.equal(matched.digest, sha256Of(canonical(prompt)));
  const altered = prompt.replace("alpha", "alpho"); // exactly one byte differs
  assert.notEqual(altered, prompt);
  const refused = evaluateBriefingRoute({ prompt: altered, root });
  assert.equal(refused.status, "mismatch", `a one-byte-changed briefing must not match: ${JSON.stringify(refused)}`);
  assert.equal(refused.expected, sha256Of(canonical(prompt)));
  assert.equal(refused.observed, sha256Of(canonical(altered)));
}

describe("recordDispatchBriefingRoute writes the route record the guard reads", () => {
  test("the record lands at the guard's own route path with the builder's exact record", () => withRoot((root) => {
    const result = producer(root, BRIEFING);
    assert.equal(result.schema, DISPATCH_BRIEFING_ROUTE_RESULT_SCHEMA);
    assert.equal(result.sliceId, SLICE);
    assert.equal(result.path, `evidence/dispatch-route-${SLICE}.json`);
    assert.equal(result.digest, sha256Of(BRIEFING));
    assert.equal(existsSync(briefingRoutePath(root, SLICE)), true);
    const raw = readFileSync(briefingRoutePath(root, SLICE), "utf8");
    assert.equal(raw, `${JSON.stringify(buildBriefingRoute({ sliceId: SLICE, briefing: BRIEFING }))}\n`);
    assert.deepEqual(JSON.parse(raw), { schema: BRIEFING_ROUTE_SCHEMA, sliceId: SLICE, briefingSha256: sha256Of(BRIEFING) });
    assert.deepEqual(readdirSync(join(root, "evidence")), [`dispatch-route-${SLICE}.json`], "no temporary file may be left behind");
  }));

  test("the producer's record makes the guard's reader bind the text: same briefing matches, one byte off does not", () => withRoot((root) => {
    checkRoute(root, BRIEFING, producer);
    const crlf = BRIEFING.replace(/\n/gu, "\r\n");
    assert.equal(evaluateBriefingRoute({ prompt: crlf, root }).status, "match", "CRLF is normalised to LF by the shared digest");
  }));

  test("a maximal slice id still yields a record the guard accepts (size and name bounds)", () => withRoot((root) => {
    const longId = `A${"b".repeat(127)}`;
    const prompt = briefingFor(longId);
    producer(root, prompt);
    assert.equal(evaluateBriefingRoute({ prompt, root }).status, "match");
  }));

  test("recording the same briefing twice is unchanged; a new briefing for the slice replaces the binding", () => withRoot((root) => {
    const first = producer(root, BRIEFING);
    const again = recordDispatchBriefingRoute({ root, prompt: BRIEFING });
    assert.equal(again.status, "unchanged");
    assert.equal(again.digest, first.digest);
    const next = briefingFor(SLICE, "beta");
    const replaced = recordDispatchBriefingRoute({ root, prompt: next });
    assert.equal(replaced.status, "replaced");
    assert.equal(replaced.previousDigest, sha256Of(BRIEFING));
    assert.equal(evaluateBriefingRoute({ prompt: next, root }).status, "match");
    assert.equal(evaluateBriefingRoute({ prompt: BRIEFING, root }).status, "mismatch");
  }));

  test("a record the guard would refuse as invalid is repaired by recording again", () => withRoot((root) => {
    mkdirSync(join(root, "evidence"), { recursive: true });
    writeFileSync(briefingRoutePath(root, SLICE), "{ not json\n");
    assert.equal(evaluateBriefingRoute({ prompt: BRIEFING, root }).status, "invalid");
    const repaired = recordDispatchBriefingRoute({ root, prompt: BRIEFING });
    assert.equal(repaired.status, "replaced");
    assert.equal(repaired.previousDigest, null);
    assert.equal(evaluateBriefingRoute({ prompt: BRIEFING, root }).status, "match");
  }));

  test("a briefing the guard never binds writes nothing: no Slice line, or two different Slice ids", () => withRoot((root) => {
    const sliceless = BRIEFING.split("\n").filter((line) => !line.includes("Slice:")).join("\n");
    const none = recordDispatchBriefingRoute({ root, prompt: sliceless });
    assert.equal(none.status, "not-applicable");
    assert.equal(none.sliceId, null);
    const ambiguous = recordDispatchBriefingRoute({ root, prompt: `${BRIEFING}\n- **Slice:** ${SLICE}-OTHER` });
    assert.equal(ambiguous.status, "not-applicable");
    assert.equal(existsSync(join(root, "evidence")), false, "nothing may be created when there is nothing to bind");
  }));

  test("unusable input is refused typed and writes nothing", () => withRoot((root) => {
    const refusals = [
      [{ root, prompt: "" }, "DBRR-PROMPT"],
      [{ root, prompt: 42 }, "DBRR-PROMPT"],
      [{ root: "relative/root", prompt: BRIEFING }, "DBRR-ROOT"],
      [{ root: join(root, "missing"), prompt: BRIEFING }, "DBRR-ROOT"],
      [{ prompt: BRIEFING }, "DBRR-ROOT"],
    ];
    for (const [input, code] of refusals) {
      const result = recordDispatchBriefingRoute(input);
      assert.equal(result.status, "refused", JSON.stringify(result));
      assert.equal(result.code, code);
    }
    assert.equal(existsSync(join(root, "evidence")), false);
  }));

  test("an evidence entry or a route target of the wrong kind is refused, never overwritten or followed", () => withRoot((root) => {
    writeFileSync(join(root, "evidence"), "not a directory");
    const blocked = recordDispatchBriefingRoute({ root, prompt: BRIEFING });
    assert.equal(blocked.status, "refused");
    assert.equal(blocked.code, "DBRR-EVIDENCE-DIR");
    assert.equal(readFileSync(join(root, "evidence"), "utf8"), "not a directory");
    rmSync(join(root, "evidence"), { force: true });
    mkdirSync(briefingRoutePath(root, SLICE), { recursive: true }); // a directory where the record belongs
    const target = recordDispatchBriefingRoute({ root, prompt: BRIEFING });
    assert.equal(target.status, "refused");
    assert.equal(target.code, "DBRR-TARGET");
  }));

  test("importing the producer is free of hook side effects: a child imports it with stdin closed and exits clean", () => withRoot((root) => {
    const runner = join(root, "import-runner.mjs");
    writeFileSync(runner, "await import(process.argv[2]);\nprocess.stdout.write('imported');\n");
    const res = spawnSync(process.execPath, [runner, MODULE_URL], { input: "", encoding: "utf8", timeout: 20000, cwd: root });
    assert.equal(res.status, 0, `import failed: ${(res.stderr ?? "").slice(0, 300)}`);
    assert.equal(res.stdout, "imported");
    assert.equal(res.stderr, "");
  }));
});

describe("RED proofs: a producer that drops any guarded property fails the same check", () => {
  test("no producer at all (the state before this slice: no product flow writes a record) fails", () => withRoot((root) => {
    assert.throws(() => checkRoute(root, BRIEFING, () => {}));
  }));

  test("a producer that writes the record somewhere the guard does not read fails", () => withRoot((root) => {
    const misplaced = (target, prompt) => {
      mkdirSync(join(target, "evidence"), { recursive: true });
      writeFileSync(join(target, "evidence", "dispatch-route.json"), `${JSON.stringify(buildBriefingRoute({ sliceId: SLICE, briefing: prompt }))}\n`);
    };
    assert.throws(() => checkRoute(root, BRIEFING, misplaced));
  }));

  test("a producer that binds a briefing FILE name instead of the text actually sent fails", () => withRoot((root) => {
    const fileDigest = (target, prompt) => {
      mkdirSync(join(target, "evidence"), { recursive: true });
      const record = { schema: BRIEFING_ROUTE_SCHEMA, sliceId: SLICE, briefingSha256: sha256Of("scratch/briefing.md") };
      writeFileSync(briefingRoutePath(target, SLICE), `${JSON.stringify(record)}\n`);
      return prompt;
    };
    assert.throws(() => checkRoute(root, BRIEFING, fileDigest));
  }));

  test("a producer that hashes the text without the shared CRLF normalisation disagrees with the guard on a CRLF briefing", () => withRoot((root) => {
    const crlf = BRIEFING.replace(/\n/gu, "\r\n");
    const rawDigest = (target, prompt) => {
      mkdirSync(join(target, "evidence"), { recursive: true });
      const record = { schema: BRIEFING_ROUTE_SCHEMA, sliceId: SLICE, briefingSha256: sha256Of(prompt) }; // no CRLF -> LF step
      writeFileSync(briefingRoutePath(target, SLICE), `${JSON.stringify(record)}\n`);
    };
    assert.throws(() => checkRoute(root, crlf, rawDigest));
    withRoot((fresh) => checkRoute(fresh, crlf, producer)); // the real producer uses the guard's own digest, so the same CRLF input passes
  }));
});
