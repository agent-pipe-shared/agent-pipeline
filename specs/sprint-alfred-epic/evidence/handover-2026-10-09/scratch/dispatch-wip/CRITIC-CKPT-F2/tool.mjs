// CRITIC-CKPT-F2 helper (git-ignored scratch): apply | checkpoint <commit> <phase> <uses> | finalize <outcome> <phase> <uses>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

const GUARD = "specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-dispatch-budget.mjs";
const REDIRECT = "scratch/dispatch-wip/CRITIC-CKPT-T3/post/hooks/guard-dispatch-budget.mjs";
const EDITS = "scratch/dispatch-wip/CRITIC-CKPT-F2/edits.txt";
const RECORD = "evidence/dispatch-record-CRITIC-CKPT-F2-20261009.json";
const REPORT = "scratch/dispatch-wip/CRITIC-CKPT-F2/report.txt";
const BASE_SHA = "f7649839d83cfaad1f4163269a07284e91efe71751e3b3634f09b92ccbfa4c4f";
const BASE_BYTES = 87604;
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

function parseEdits(source) {
  const edits = [];
  let mode = null;
  let current = null;
  for (const line of source.split("\n")) {
    if (line === "@@@ OLD") { current = { old: [], new: [] }; mode = "old"; continue; }
    if (line === "@@@ NEW") { mode = "new"; continue; }
    if (line === "@@@ END") { edits.push({ old: current.old.join("\n"), new: current.new.join("\n") }); current = null; mode = null; continue; }
    if (mode !== null) current[mode].push(line);
  }
  return edits;
}

function apply() {
  const base = readFileSync(GUARD);
  if (sha(base) !== BASE_SHA || base.length !== BASE_BYTES) throw new Error(`base mismatch: ${sha(base)} ${base.length}`);
  let text = base.toString("utf8");
  const edits = parseEdits(readFileSync(EDITS, "utf8"));
  edits.forEach((edit, index) => {
    const n = text.split(edit.old).length - 1;
    if (n !== 1) throw new Error(`edit ${index + 1}: ${n} occurrences of its OLD text (need exactly 1)`);
  });
  for (const edit of edits) text = text.replace(edit.old, () => edit.new);
  const out = Buffer.from(text, "utf8");
  writeFileSync(GUARD, out);
  mkdirSync(dirname(REDIRECT), { recursive: true });
  writeFileSync(REDIRECT, out);
  console.log(JSON.stringify({ edits: edits.length, baseSha256: BASE_SHA, newSha256: sha(out), bytes: out.length, lines: text.split("\n").length - 1, redirect: REDIRECT }));
}

const readRecord = () => JSON.parse(readFileSync(RECORD, "utf8"));
const writeRecord = (record) => writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`);

function checkpoint(commit, phase, uses) {
  const record = readRecord();
  const full = execFileSync("git", ["rev-parse", commit], { encoding: "utf8" }).trim();
  const files = execFileSync("git", ["show", "--name-only", "--format=", full], { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
  record.commits = [full];
  record.outcome = "committed-pending-report";
  record.report = { text: "interim checkpoint: committed, final report pending", changedFiles: files };
  record.log.push({ phase, toolUses: Number(uses) });
  writeRecord(record);
  console.log(JSON.stringify({ commit: full, changedFiles: files }));
}

function finalize(outcome, phase, uses) {
  const record = readRecord();
  const text = readFileSync(REPORT, "utf8");
  record.report = { text, changedFiles: record.report?.changedFiles ?? [] };
  record.resultSha256 = sha(Buffer.from(text, "utf8"));
  record.outcome = outcome;
  record.log.push({ phase, toolUses: Number(uses) });
  writeRecord(record);
  console.log(JSON.stringify({ outcome, resultSha256: record.resultSha256, changedFiles: record.report.changedFiles }));
}

const [command, ...args] = process.argv.slice(2);
if (command === "apply") apply();
else if (command === "checkpoint") checkpoint(...args);
else if (command === "finalize") finalize(...args);
else throw new Error("usage: apply | checkpoint <commit> <phase> <uses> | finalize <outcome> <phase> <uses>");
