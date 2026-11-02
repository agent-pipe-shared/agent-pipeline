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
mkdirSync(resolve(clone, "scratch"), { recursive: true });
copyFileSync(resolve(repo, script), resolve(clone, "scratch", basename(script)));
const r = sh("bash", [`scratch/${basename(script)}`], clone, { GIT_AUTHOR_NAME: "Rehearsal", GIT_AUTHOR_EMAIL: "rehearsal@example.invalid", GIT_COMMITTER_NAME: "Rehearsal", GIT_COMMITTER_EMAIL: "rehearsal@example.invalid" });
writeFileSync(resolve(import.meta.dirname, `out-${process.argv[3] ?? "clone"}.log`), `${r.stdout}\n--- stderr ---\n${r.stderr}`);
console.log(`start ${head}\nexit ${r.status}\n${r.stdout.split("\n").slice(-30).join("\n")}\n${r.stderr.split("\n").slice(-15).join("\n")}`);
