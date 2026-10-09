// Elephant helper (toil T110/T116): bind resultSha256 over report.text of a terminal record whose dispatch ran out of budget.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [path, ruling] = process.argv.slice(2);
if (!/^evidence\/dispatch-record-[A-Za-z0-9-]+\.json$/u.test(path ?? "") || !/^Ruling \d+$/u.test(ruling ?? "")) throw new Error("usage: bind-digest.mjs evidence/dispatch-record-<ID>.json 'Ruling <n>'");
const record = JSON.parse(readFileSync(path, "utf8"));
if (record.resultSha256 !== null) throw new Error("resultSha256 already bound");
if (typeof record.report?.text !== "string") throw new Error("report.text missing");
record.resultSha256 = createHash("sha256").update(record.report.text, "utf8").digest("hex");
(record.log ??= []).push({ phase: `Elephant digest bind (${ruling}): resultSha256 computed over the unchanged report.text`, toolUses: null });
writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
console.log(record.resultSha256);
