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
const active = ledger.clusters.filter((c) => c.status === "in-progress");
if (active.length > 1) problems.push(`more than one cluster in-progress: ${active.map((c) => c.id).join(", ")}`);

const [verb, id] = process.argv.slice(2);
if (verb === undefined) {
  for (const c of ledger.clusters) console.log(`${c.status.padEnd(11)} ${c.id.padEnd(4)} ${c.title} :: next: ${c.next}`);
  if (problems.length) { console.log(`INCONSISTENT:\n- ${problems.join("\n- ")}`); process.exit(1); }
  console.log(active.length ? `ACTIVE ${active[0].id}: close it (closure entry + ledger 'closed', committed) before starting another cluster.` : "No cluster in progress.");
  process.exit(0);
}
if (verb !== "admit" || !id) fail("CL-USAGE", "use: correction-ledger-check.mjs [admit <cluster-id>]");
if (problems.length) fail("CL-INCONSISTENT", problems.join("; "));
const target = ledger.clusters.find((c) => c.id === id);
if (!target) fail("CL-UNKNOWN", `cluster ${id} is not in the committed ledger`);
if (target.status !== "in-progress") fail("CL-NOT-IN-PROGRESS", `cluster ${id} is ${target.status}; set it in-progress in the committed ledger first${active.length ? `, after closing ${active[0].id}` : ""}`);
const dirty = git("status", "--porcelain", "--untracked-files=no").trim();
if (dirty) fail("CL-TREE-DIRTY", `commit or restore tracked changes first:\n${dirty}`);
console.log(`ADMITTED ${id}`);
