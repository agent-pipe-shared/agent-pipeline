import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const url = new URL("./R2.md", import.meta.url);
const text = readFileSync(url, "utf8");
const ids = ["AC-109", "AC-122", "AC-146"];
const labels = [
  "Original search:",
  "Reconstructed acceptance:",
  "Evidence consulted:",
  "Already landed:",
  "PO question:",
];

function sections() {
  const heads = [...text.matchAll(/^## (AC-\d+) - .+$/gm)];
  return heads.map((m, i) => ({
    id: m[1],
    body: text.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : text.length),
  }));
}

test("one section per AC id, in order", () => {
  assert.deepEqual(sections().map((s) => s.id), ids);
});

test("every section has all five labelled bullets non-empty", () => {
  for (const s of sections()) {
    for (const label of labels) {
      const m = s.body.match(new RegExp("^- " + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*(.*)$", "m"));
      assert.ok(m, `${s.id} lacks "${label}"`);
      const rest = s.body.slice(s.body.indexOf(m[0]) + m[0].length);
      const cont = rest.split("\n").slice(1).join("\n").split(/\n- [A-Z]/)[0];
      assert.ok((m[1] + cont).trim().length > 0, `${s.id} "${label}" is empty`);
    }
  }
});

test("header says DRAFT - pending PO release", () => {
  const header = text.split(/^## /m)[0];
  assert.ok(header.includes("DRAFT - pending PO release"));
});

test("no absolute host path", () => {
  assert.ok(!/[A-Za-z]:[\\/]/.test(text), "drive letter path");
  assert.ok(!text.includes("/home/"));
  assert.ok(!text.includes("/Users/"));
});
