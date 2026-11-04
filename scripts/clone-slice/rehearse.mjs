// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool rehearse.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first (this one to scratch/agent-out/w24reh/, its repository-root arithmetic counts three levels). Paths below that say scratch/agent-out are intended.
// Rehearse a PO apply script in a fresh clone of the current HEAD (never in the real tree). Writes the full output to out.log next to this file.
// usage: node scratch/agent-out/w24reh/rehearse.mjs <apply script relative to repo root>
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
const repo = resolve(import.meta.dirname, "../../..");
const clone = resolve(import.meta.dirname, process.argv[3] ?? "clone"); // a second name keeps a running Full Verify clone untouched
const script = process.argv[2];
const sh = (cmd, args, cwd, env = {}) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, ...env } });
rmSync(clone, { recursive: true, force: true });
const head = sh("git", ["rev-parse", "HEAD"], repo).stdout.trim();
sh("git", ["clone", "--shared", "--no-checkout", repo, clone], repo);
sh("git", ["checkout", "--detach", head], clone);
sh("git", ["remote", "add", "upstream", repo], clone); // the Full Verify's security step looks for a remote named upstream
mkdirSync(resolve(clone, "scratch"), { recursive: true });
copyFileSync(resolve(repo, script), resolve(clone, "scratch", basename(script)));
const r = sh("bash", [`scratch/${basename(script)}`], clone, { GIT_AUTHOR_NAME: "Rehearsal", GIT_AUTHOR_EMAIL: "rehearsal@example.invalid", GIT_COMMITTER_NAME: "Rehearsal", GIT_COMMITTER_EMAIL: "rehearsal@example.invalid" });
writeFileSync(resolve(import.meta.dirname, `out-${basename(process.argv[3] ?? "clone")}.log`), `${r.stdout}\n--- stderr ---\n${r.stderr}`);
// Candidate 19 (w155): applying the chain is not enough; a registered suite that the capability inventory does not name makes a Full Verify red. Run the registration checker on the resulting tree.
let registration = "";
if (r.status === 0) {
  const check = sh("node", ["harness/scripts/check-verify-suite-registration.mjs"], clone);
  registration = `registration check exit ${check.status}: ${(check.stdout + check.stderr).trim().split("\n").slice(-3).join(" | ")}\n`;
  // Candidate 19 (w160): the same holds for the case-completion registry; a suite that registers its cases but has no registry row or caseCompletion policy is reported VULNERABLE-UNREGISTERED.
  const completion = sh("node", ["harness/scripts/check-verify-case-completion.mjs"], clone);
  registration += `case-completion check exit ${completion.status}: ${(completion.stdout + completion.stderr).trim().split("\n").slice(-3).join(" | ")}\n`;
}
console.log(`start ${head}\nexit ${r.status}\n${registration}${r.stdout.split("\n").slice(-30).join("\n")}\n${r.stderr.split("\n").slice(-15).join("\n")}`);
