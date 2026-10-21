#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Sprint-local enforcement of D67 (cluster closure before the next cluster).
//   node specs/sprint-alfred-epic/plans/correction-ledger-check.mjs            status, exit 0 or 1 on an inconsistent ledger
//   node specs/sprint-alfred-epic/plans/correction-ledger-check.mjs admit <id> exit 0 only when a dispatch for cluster <id> is admitted
// Reads the COMMITTED ledger and plan (git show HEAD:...), so an uncommitted closure never counts.
import { execFileSync } from "node:child_process";

const LEDGER = "specs/sprint-alfred-epic/plans/correction-ledger.json";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const fail = (code, message) => { console.log(`REFUSED ${code}: ${message}`); process.exit(2); };

const committed = (path) => {
  try { return execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return fail("CL-NOT-COMMITTED", `${path} is not committed at HEAD; commit it first`); }
};
const ledger = JSON.parse(committed(LEDGER));
const plan = committed(ledger.plan);
const hasClosure = (id) => plan.split("\n").some((line) => line.startsWith(`### ${id} `));
const problems = [];
for (const c of ledger.clusters) {
  if (!["open", "in-progress", "closed"].includes(c.status)) problems.push(`${c.id}: unknown status ${c.status}`);
  if (c.status === "closed" && !hasClosure(c.id)) problems.push(`${c.id}: closed without a committed closure heading '### ${c.id} ' in ${ledger.plan}`);
}
// D76 (amends D67): several clusters may be in progress at once; disjointness is checked per dispatch below.
const active = ledger.clusters.filter((c) => c.status === "in-progress");

const [verb, id, ...scope] = process.argv.slice(2);
if (verb === undefined) {
  for (const c of ledger.clusters) console.log(`${c.status.padEnd(11)} ${c.id.padEnd(4)} ${c.title} :: next: ${c.next}`);
  if (problems.length) { console.log(`INCONSISTENT:\n- ${problems.join("\n- ")}`); process.exit(1); }
  console.log(active.length ? `ACTIVE ${active.map((c) => c.id).join(", ")}: close each with a closure entry + ledger 'closed', committed.` : "No cluster in progress.");
  process.exit(0);
}
if (verb !== "admit" || !id) fail("CL-USAGE", "use: correction-ledger-check.mjs [admit <cluster-id> <scope-path>...]");
if (problems.length) fail("CL-INCONSISTENT", problems.join("; "));
const target = ledger.clusters.find((c) => c.id === id);
if (!target) fail("CL-UNKNOWN", `cluster ${id} is not in the committed ledger`);
if (target.status !== "in-progress") fail("CL-NOT-IN-PROGRESS", `cluster ${id} is ${target.status}; set it in-progress in the committed ledger first`);
// D76: other running dispatches may leave the tree dirty; only a dirty path inside this dispatch's scope blocks it.
const dirty = git("status", "--porcelain", "--untracked-files=all").split("\n").filter(Boolean).map((l) => l.slice(3));
const overlap = dirty.filter((p) => scope.includes(p));
if (!scope.length) fail("CL-USAGE", "admit needs the dispatch's write scope paths (D76 disjointness check)");
if (overlap.length) fail("CL-SCOPE-DIRTY", `these scope paths carry uncommitted changes of another dispatch; wait for it or pick a disjoint scope:\n${overlap.join("\n")}`);
console.log(`ADMITTED ${id}`);
