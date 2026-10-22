// SPDX-License-Identifier: SUL-1.0
// Purpose: archive the reader inputs, outputs and prompts of the 2026-10-22 gap rounds (3 to 6) into a tracked evidence folder and write its README with the verdict counts.
// Usage:   node scripts/gap-evidence.mjs     (run from the repository root; no arguments; the destination folder must already exist)
// Inputs:  scratch/gap/{out3-*,out4-c7,out5-N,out6-N,input5-N,input6-N}.json and scratch/gap/reader-prompt-5.md, reader-prompt-6.md (untracked, per-run).
// Output:  "copied" on stdout.
// Data:    writes into specs/sprint-alfred-epic/evidence/gap-readers-2026-10-22/ (tracked evidence; the operator commits it). NOT read-only: it overwrites that folder's copies and README.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const dest = "specs/sprint-alfred-epic/evidence/gap-readers-2026-10-22";
if (!existsSync("scratch/gap/out6-1.json") || !existsSync(dest)) { console.error(`gap-evidence: scratch/gap/ round outputs or ${dest}/ not found; run from the repository root after the gap rounds`); process.exit(2); }
const files = ["out3-a", "out3-b", "out3-c", "out4-c7", "out5-1", "out5-2", "out5-3", "out5-4", "out6-1", "out6-2", "out6-3", "out6-4", "out6-5", "out6-6", "input5-1", "input5-2", "input5-3", "input5-4", "input6-1", "input6-2", "input6-3", "input6-4", "input6-5", "input6-6"].map((n) => `${n}.json`);
for (const f of [...files, "reader-prompt-5.md", "reader-prompt-6.md"]) copyFileSync(`scratch/gap/${f}`, `${dest}/${f}`);
const counts = (prefix, n) => {
  const c = {};
  for (let i = 1; i <= n; i += 1) for (const r of JSON.parse(readFileSync(`scratch/gap/${prefix}-${i}.json`, "utf8"))) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
  return JSON.stringify(c);
};
writeFileSync(`${dest}/README.md`, `# Gap readers, 2026-10-22 (rounds 3 to 6)

Read-only status readers over the clauses of the delivery matrix (snapshot at 9a12beab7) that were not yet done. Each reader judged its clauses against the CURRENT repository state (HEAD at the time of the round), never ran a test, made no model call and changed no file except its own output. Verdicts are the readers' own and were not independently re-verified; the readers disclose per clause where a verdict rests on commit messages or item text instead of a re-read pin.

- Round 5 (clauses owned by the agent, 67): ${counts("out5", 4)}. Prompt: reader-prompt-5.md. Inputs input5-N.json, outputs out5-N.json.
- Round 6 (clauses owned by verify-wsl, po-decision, po-signature, native-host, 152): ${counts("out6", 6)}. Prompt: reader-prompt-6.md. Inputs input6-N.json, outputs out6-N.json.
- Rounds 3 and 4 (earlier re-checks and the C7 pipeline-state bundle): out3-a, out3-b, out3-c, out4-c7.

Hard scope rule given to every reader: the design is never reopened and the approved Spec and PRD never change; a clause that needs that is OUT-OF-SCOPE-DESIGN.

Use: the actionable verdicts (OPEN-BUILDABLE, NOW-AGENT, NOW-PO-TERMINAL) drove the builds K46 to K49 and the Linux single runs recorded in linux-single-verifys-2026-10-22.md. STILL-BLOCKED clauses need native Windows (D133), a real host session or the stamped and installed candidate.
`);
console.log("copied");
