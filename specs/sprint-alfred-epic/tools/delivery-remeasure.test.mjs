import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import nodeCrypto from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempTestScratch } from "../../../plugins/pipeline-core/lib/test-tmpdir.mjs";

const TOOL = resolve(dirname(fileURLToPath(import.meta.url)), "delivery-remeasure.mjs");
const OPEN = [{ owner: "critic", what: "batch review" }];

function fixture(outRows) {
  const root = mkdtempTestScratch("delivery-remeasure-");
  const inputs = join(root, "inputs");
  mkdirSync(inputs, { recursive: true });
  writeFileSync(join(inputs, "input-01.json"), JSON.stringify({ rows: [{ itemId: "a" }, { itemId: "b" }] }));
  writeFileSync(join(inputs, "out-01.json"), JSON.stringify(outRows));
  writeFileSync(join(inputs, "reader-prompt.md"), "prompt\n");
  writeFileSync(join(root, "prev.json"), JSON.stringify({ rows: [{ itemId: "a", stage: "25" }, { itemId: "b", stage: "50" }] }));
  return root;
}
const row = (itemId, stage, open = OPEN) => ({ itemId, stage, baselineStage: "25", reason: "r", evidence: [], open });
function run(root) {
  return spawnSync(process.execPath, [TOOL, "--date", "2026-10-17", "--head", "abc123", "--previous", join(root, "prev.json"),
    "--inputs", join(root, "inputs"), "--out-root", root], { encoding: "utf8" });
}
const evidence = (root, p) => join(root, "specs/sprint-alfred-epic/evidence", p);

test("green two-item run writes snapshot, README, method copy and pointer", () => {
  const root = fixture([row("a", "50"), row("b", "75")]);
  const r = run(root);
  assert.equal(r.status, 0, r.stderr);
  const dir = "delivery-remeasure-2026-10-17";
  const snap = JSON.parse(readFileSync(evidence(root, `${dir}/snapshot.json`), "utf8"));
  assert.equal(snap.schema, "pipeline.alfred-delivery-snapshot.v1");
  assert.equal(snap.total, 2);
  assert.equal(snap.baseline.counts["25"], 1);
  assert.equal(snap.baseline.counts["50"], 1);
  assert.equal(snap.baseline.index, 37.5);
  assert.equal(snap.current.index, 62.5);
  assert.equal(snap.moves.length, 2);
  assert.equal(snap.openByOwner.critic, 2);
  assert.match(snap.previous.sha256, /^[0-9a-f]{64}$/);
  assert.equal(snap.previous.path, "prev.json");
  const readme = readFileSync(evidence(root, `${dir}/README.md`), "utf8");
  assert.match(readme, /## Open per item/);
  assert.ok(existsSync(evidence(root, `${dir}/method/out-01.json`)));
  assert.ok(existsSync(evidence(root, `${dir}/method/input-01.json`)));
  assert.ok(existsSync(evidence(root, `${dir}/method/reader-prompt.md`)));
  assert.ok(!/[A-Za-z]:[\\/]/.test(readFileSync(evidence(root, `${dir}/snapshot.json`), "utf8")));
});

test("pointer content is stable and bound to the snapshot sha", () => {
  const root = fixture([row("a", "50"), row("b", "75")]);
  assert.equal(run(root).status, 0);
  const p = JSON.parse(readFileSync(evidence(root, "delivery-status-current.json"), "utf8"));
  assert.equal(p.schema, "pipeline.alfred-delivery-status-pointer.v1");
  assert.equal(p.snapshot, "specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-17/snapshot.json");
  assert.equal(p.measuredAt, "2026-10-17");
  assert.equal(p.head, "abc123");
  assert.equal(p.index, 62.5);
  assert.equal(p.counts["50"], 1);
  assert.equal(p.sha256, nodeCrypto.createHash("sha256").update(readFileSync(join(root, p.snapshot))).digest("hex"));
  const md = readFileSync(evidence(root, "delivery-status-current.md"), "utf8");
  assert.match(md, /This file is replaced by every remeasure; history lives in the dated directories\./);
});

test("missing item is refused with exit 1 and no write", () => {
  const root = fixture([row("a", "50")]);
  const r = run(root);
  assert.equal(r.status, 1);
  assert.ok(!existsSync(evidence(root, "delivery-remeasure-2026-10-17")));
  assert.ok(!existsSync(evidence(root, "delivery-status-current.json")));
});

test("stage 100 from a reader is refused", () => {
  const root = fixture([row("a", "100", []), row("b", "50")]);
  const r = run(root);
  assert.equal(r.status, 1);
  assert.ok(!existsSync(evidence(root, "delivery-status-current.json")));
});

test("empty open list below 100 is refused", () => {
  const root = fixture([row("a", "50", []), row("b", "50")]);
  assert.equal(run(root).status, 1);
});

test("unknown owner and extra item are refused", () => {
  assert.equal(run(fixture([row("a", "50", [{ owner: "nobody", what: "x" }]), row("b", "50")])).status, 1);
  assert.equal(run(fixture([row("a", "50"), row("b", "50"), row("c", "50")])).status, 1);
});
