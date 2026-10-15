import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "R4.md"), "utf8");
const IDS = ["AC-190", "AC-204", "AC-211"];
const LABELS = ["Original search", "Reconstructed acceptance", "Evidence consulted", "Already landed", "PO question"];

const parts = text.split(/^## /m);
const header = parts[0];
const sections = parts.slice(1);

test("sections are AC-190, AC-204, AC-211 in order", () => {
  assert.deepEqual(sections.map((s) => s.slice(0, 6)), IDS);
  for (const s of sections) assert.match(s, /^AC-\d{3} - \S+/);
});

test("every section has all five labelled bullets non-empty", () => {
  for (const s of sections) {
    for (const label of LABELS) {
      const m = s.match(new RegExp(`^- ${label}:[ \\t]*(\\S.*)$`, "m"));
      assert.ok(m, `${s.slice(0, 6)} missing non-empty "${label}"`);
    }
  }
});

test("header carries the draft status", () => {
  assert.ok(header.includes("DRAFT - pending PO release"));
});

test("no absolute host path", () => {
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/);
  assert.ok(!text.includes("/home/"));
  assert.ok(!text.includes("/Users/"));
});
