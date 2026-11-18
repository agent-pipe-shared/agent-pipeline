// SPDX-License-Identifier: SUL-1.0
// Purpose: pin that the post-sitting rows are judged by exit code and failing cases, never by a stored count (finding K1-02).
// Usage:   node --test scripts/post-sitting-checks.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as mod from "./post-sitting-checks.mjs";

const { CHECKS } = mod;

const judge = (name) => CHECKS.find((c) => c.name === name).judge;
const tapOut = (pass, fail) => `ℹ tests ${pass + fail}\nℹ pass ${pass}\nℹ fail ${fail}\nℹ skipped 0\nℹ todo 0\n`;

test("no literal count is exported any more", () => {
  assert.equal(mod.EXPECT, undefined);
});

test("suite-registration: any registered count is GREEN at exit 0 and the count is printed", () => {
  const v = judge("suite-registration")({ status: 0, out: "1500 registered suites\n" });
  assert.equal(v.ok, true);
  assert.match(v.line, /1500 registered/);
});

test("suite-registration: a non-zero exit is RED", () => {
  assert.equal(judge("suite-registration")({ status: 1, out: "1093 registered\nunregistered: x\n" }).ok, false);
});

for (const name of ["doc-contracts-test", "consumer-safe-paths-test"]) {
  test(`${name}: a different case count is GREEN at exit 0 with no failing case`, () => {
    const v = judge(name)({ status: 0, out: tapOut(123, 0) });
    assert.equal(v.ok, true);
    assert.match(v.line, /pass 123 of 123, fail 0/);
  });
  test(`${name}: a failing case is RED even at exit 0`, () => {
    assert.equal(judge(name)({ status: 0, out: tapOut(75, 1) }).ok, false);
  });
  test(`${name}: a non-zero exit is RED`, () => {
    assert.equal(judge(name)({ status: 1, out: tapOut(76, 0) }).ok, false);
  });
  test(`${name}: output with no parsable counts is RED`, () => {
    assert.equal(judge(name)({ status: 0, out: "nothing\n" }).ok, false);
  });
}
