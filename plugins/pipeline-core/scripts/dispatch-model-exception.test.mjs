// SPDX-License-Identifier: SUL-1.0
// C30G-M16: the PO model-exception script and its store (record, list, revoke, refusals, chain break, expiry, count, idempotence).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { dispatchModelException } from "./dispatch-model-exception.mjs";
import {
  MODEL_EXCEPTION_MAX_ENTRIES,
  consumeModelException,
  emptyExceptionStore,
  modelExceptionStorePath,
  readModelExceptionStore,
  recordModelException,
  writeModelExceptionStore,
} from "../lib/dispatch-model-exception.mjs";
import { CLAUDE_FAMILY_ALIASES } from "../lib/dispatch-model-enforcement.mjs";

const SCRIPT = fileURLToPath(new URL("./dispatch-model-exception.mjs", import.meta.url));
const NOON = Date.parse("2026-11-17T12:00:00.000Z");
const clock = (minutesAfterNoon) => () => new Date(NOON + minutesAfterNoon * 60000).toISOString();
const sandboxes = [];
function repository() {
  const root = mkdtempSync(join(tmpdir(), "model-exception-"));
  sandboxes.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}
process.on("exit", () => { for (const root of sandboxes) { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } } });
const run = (root, argv, minutes = 0) => dispatchModelException([...argv, "--root", root], { nowFn: clock(minutes) });
const RECORD = ["record", "--model", "fable", "--reason", "design analysis", "--by", "label-from-the-po"];
const storeFile = (root) => modelExceptionStorePath(join(root, ".git"));

test("MXS-1 record stores the PO's request in a digest-chained store and list shows it live", () => {
  const root = repository();
  const first = run(root, [...RECORD, "--count", "2"]);
  assert.equal(first.status, "recorded", JSON.stringify(first));
  assert.deepEqual([first.result.id, first.result.model, first.result.scope.kind, first.result.by], ["MX-1", "fable", "count", "label-from-the-po"]);
  assert.match(first.result.note, /attribution record.*not a signature/u);
  const second = run(root, ["record", "--model", "opus", "--effort", "max", "--dispatch-id", "FEATURE-A-1", "--reason", "second", "--by", "label-from-the-po"], 1);
  assert.equal(second.result.id, "MX-2");
  const store = JSON.parse(readFileSync(storeFile(root), "utf8"));
  assert.equal(store.entries[1].prevDigest, store.entries[0].digest, "append-only chain");
  const listed = run(root, ["list"], 2);
  assert.equal(listed.lines.length, 2);
  assert.match(listed.lines[0], /^MX-1 live fable for 2 dispatches; requested by the PO at 2026-11-17T12:00:00\.000Z \(label-from-the-po\)/u);
  assert.match(listed.lines[1], /^MX-2 live opus effort max for dispatch FEATURE-A-1/u);
  assert.match(run(repository(), ["list"]).lines[0], /no model exception is recorded; record one with/u);
});

test("MXS-2 --by is required and has no default; --reason, model, scope and ranges are refused with the repair", () => {
  const root = repository();
  const without = (flag) => { const copy = [...RECORD, "--count", "1"]; const at = copy.indexOf(flag); copy.splice(at, 2); return copy; };
  const byMissing = run(root, without("--by"));
  assert.equal(byMissing.code, "by-missing");
  assert.match(byMissing.message, /no default.*label the PO supplied.*EL-36/u);
  assert.equal(run(root, [...without("--by"), "--by", ""]).code, "by-missing", "an empty label is refused too");
  assert.equal(run(root, [...without("--by"), "--by", "  "]).code, "by-missing");
  assert.equal(run(root, without("--reason")).code, "reason-missing");
  assert.equal(run(root, ["record", "--model", "gpt-6", "--count", "1", "--reason", "r", "--by", "b"]).code, "model-not-allowed");
  assert.match(run(root, ["record", "--model", "gpt-6", "--count", "1", "--reason", "r", "--by", "b"]).message, /opus, sonnet, haiku, fable/u);
  assert.equal(run(root, RECORD).code, "scope-missing");
  assert.equal(run(root, [...RECORD, "--count", "1", "--minutes", "5"]).code, "scope-ambiguous");
  assert.equal(run(root, [...RECORD, "--count", "6"]).code, "count-out-of-range");
  assert.equal(run(root, [...RECORD, "--count", "0"]).code, "count-out-of-range");
  assert.equal(run(root, [...RECORD, "--minutes", "241"]).code, "minutes-out-of-range");
  assert.equal(run(root, [...RECORD, "--dispatch-id", "bad id"]).code, "dispatch-id-invalid");
  assert.equal(run(root, [...RECORD, "--count", "1", "--effort", "MAX!"]).code, "effort-invalid");
  assert.equal(run(root, [...without("--reason"), "--reason", "x".repeat(501)]).code, "reason-invalid");
  assert.equal(run(root, ["record", "--bogus", "1"]).code, "unknown-argument");
  assert.equal(run(root, ["frobnicate"]).code, "unknown-subcommand");
  assert.equal(existsSync(storeFile(root)), false, "a refused request leaves no store behind");
});

test("MXS-3 revoke ends one exception; an unknown or already revoked id is refused naming list", () => {
  const root = repository();
  run(root, [...RECORD, "--count", "1"]);
  const revoked = run(root, ["revoke", "--id", "MX-1"], 5);
  assert.equal(revoked.status, "revoked");
  assert.match(run(root, ["list"], 6).lines[0], /^MX-1 revoked fable/u);
  assert.match(run(root, ["list"], 6).lines[0], /revoked 2026-11-17T12:05:00\.000Z/u);
  const unknown = run(root, ["revoke", "--id", "MX-9"]);
  assert.equal(unknown.code, "revoke-unknown-id");
  assert.match(unknown.message, /list/u);
  assert.equal(run(root, ["revoke", "--id", "MX-1"]).code, "revoke-already-revoked");
  assert.equal(run(root, ["revoke"]).code, "id-missing");
});

test("MXS-4 a window and an unused count or dispatch-id exception expire by time on the injected clock", () => {
  const root = repository();
  run(root, [...RECORD, "--minutes", "30"]);
  run(root, [...RECORD, "--count", "1"]);
  run(root, [...RECORD, "--dispatch-id", "FEATURE-A-1"]);
  const states = (minutes) => run(root, ["list"], minutes).lines.map((line) => line.split(" ")[1]);
  assert.deepEqual(states(29), ["live", "live", "live"]);
  assert.deepEqual(states(30), ["expired", "live", "live"]);
  assert.deepEqual(states(1439), ["expired", "live", "live"]);
  assert.deepEqual(states(1440), ["expired", "expired", "expired"], "an unused count or dispatch-id exception ends after a day");
});

test("MXS-5 consumption is once per dispatch: a retry burns nothing, a spent count refuses, undo puts the exception back", () => {
  const root = repository();
  run(root, [...RECORD, "--count", "1"]);
  const use = (key) => ({ id: "MX-1", dispatchKey: key, dispatchId: key, model: "fable", effort: null, reused: false });
  const first = consumeModelException({ root, use: use("FEATURE-A-1"), nowFn: clock(1) });
  assert.equal(first.ok, true);
  const afterFirst = readFileSync(storeFile(root), "utf8");
  const retry = consumeModelException({ root, use: use("FEATURE-A-1"), nowFn: clock(2) });
  assert.equal(retry.ok, true, "the same dispatch again is admitted");
  assert.equal(readFileSync(storeFile(root), "utf8"), afterFirst, "and appends nothing");
  const other = consumeModelException({ root, use: use("FEATURE-A-2"), nowFn: clock(3) });
  assert.equal(other.ok, false);
  assert.equal(other.code, "exception-no-longer-live");
  assert.match(run(root, ["list"], 3).lines[0], /^MX-1 consumed fable.*used by FEATURE-A-1/u);
  first.undo();
  assert.match(run(root, ["list"], 3).lines[0], /^MX-1 live fable/u, "a dispatch refused later puts the exception back");
  assert.equal(consumeModelException({ root, use: use("FEATURE-A-2"), nowFn: clock(4) }).ok, true, "and the next dispatch can take it");
});

test("MXS-6 a store that does not verify grants nothing, and record refuses with the one runnable repair, which keeps the broken file", () => {
  const root = repository();
  run(root, [...RECORD, "--count", "1"]);
  const tampered = JSON.parse(readFileSync(storeFile(root), "utf8"));
  tampered.entries[0].reason = "another reason";
  writeFileSync(storeFile(root), `${JSON.stringify(tampered)}\n`);
  const read = readModelExceptionStore(root);
  assert.equal(read.ok, false);
  assert.equal(read.code, "entry-digest-mismatch");
  assert.equal(consumeModelException({ root, use: { id: "MX-1", dispatchKey: "FEATURE-A-1", dispatchId: "FEATURE-A-1", model: "fable", effort: null, reused: false } }).ok, false, "a tampered store consumes and grants nothing");
  assert.match(run(root, ["list"]).lines[0], /does not verify \(entry-digest-mismatch\).*--move-broken-store-aside/u);
  const refused = run(root, [...RECORD, "--count", "1"]);
  assert.equal(refused.code, "store-does-not-verify");
  assert.match(refused.message, /re-run this same command with --move-broken-store-aside.*never deleted/u);
  assert.equal(run(root, ["revoke", "--id", "MX-1"]).code, "store-does-not-verify");
  const repaired = run(root, [...RECORD, "--count", "1", "--move-broken-store-aside"], 1);
  assert.equal(repaired.status, "recorded", JSON.stringify(repaired));
  assert.equal(repaired.result.id, "MX-1", "the new chain starts empty");
  assert.match(repaired.result.brokenStoreMovedTo, /store\.json\.broken-2026-11-17T12-01-00-000Z$/u);
  assert.equal(readdirSync(join(root, ".git", "agent-pipeline", "dispatch-model-exception")).filter((name) => name.includes(".broken-")).length, 1);
  assert.equal(readModelExceptionStore(root).ok, true);
  // Garbage that is not JSON is the same case.
  writeFileSync(storeFile(root), "{not json");
  assert.equal(readModelExceptionStore(root).code, "store-malformed");
  assert.equal(run(root, [...RECORD, "--count", "1", "--move-broken-store-aside"], 2).status, "recorded");
});

test("MXS-7 a full store names the same repair and the flag archives it", () => {
  const root = repository();
  let store = emptyExceptionStore();
  for (let index = 0; index < MODEL_EXCEPTION_MAX_ENTRIES; index += 1) {
    const next = recordModelException(store, { model: "fable", scope: { kind: "count", value: 1 }, reason: "r", by: "b", at: "2026-11-17T12:00:00.000Z", aliases: CLAUDE_FAMILY_ALIASES });
    assert.equal(next.ok, true);
    store = next.store;
  }
  assert.equal(recordModelException(store, { model: "fable", scope: { kind: "count", value: 1 }, reason: "r", by: "b", at: "2026-11-17T12:00:00.000Z", aliases: CLAUDE_FAMILY_ALIASES }).code, "store-full");
  assert.equal(writeModelExceptionStore(storeFile(root), store).ok, true);
  const refused = run(root, [...RECORD, "--count", "1"]);
  assert.equal(refused.code, "store-full");
  assert.match(refused.message, /--move-broken-store-aside/u);
  assert.equal(run(root, [...RECORD, "--count", "1", "--move-broken-store-aside"]).status, "recorded");
});

test("MXS-8 a directory that is no git repository is refused naming --root; the CLI prints usage for --help and one refusal line with exit 2", () => {
  const outside = mkdtempSync(join(tmpdir(), "model-exception-plain-"));
  sandboxes.push(outside);
  const refused = run(outside, ["list"]);
  assert.equal(refused.code, "git-common-dir-unresolved");
  assert.match(refused.message, /--root/u);
  const help = spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /record --model <opus\|sonnet\|haiku\|fable>/u);
  const root = repository();
  const cli = spawnSync(process.execPath, [SCRIPT, "record", "--model", "fable", "--count", "1", "--reason", "r", "--root", root], { encoding: "utf8" });
  assert.equal(cli.status, 2);
  assert.match(cli.stderr, /^DISPATCH-MODEL-EXCEPTION-REFUSED: by-missing: --by is required and has no default/u);
  const ok = spawnSync(process.execPath, [SCRIPT, "record", "--model", "fable", "--count", "1", "--reason", "r", "--by", "label-from-the-po", "--root", root], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).id, "MX-1");
  assert.match(spawnSync(process.execPath, [SCRIPT, "list", "--root", root], { encoding: "utf8" }).stdout, /^MX-1 live fable/u);
});
