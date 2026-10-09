// Walk step runner (evidence tooling, not part of any commit): executes one command (argv, no shell),
// appends a scrubbed, machine-written log block to the step file next to this script, prints the capped output.
// usage: node walk-runner.mjs <NN> <name> <label> -- cmd args...
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [step, name, label, sep, ...argv] = process.argv.slice(2);
if (sep !== '--' || argv.length === 0) {
  console.error('usage: walk-runner.mjs <NN> <name> <label> -- cmd args...');
  process.exit(64);
}
const dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(dir, '..', '..');
const home = os.homedir();
const temp = path.join(home, 'tmp', 'e2e-onb-b2-20261009');
const scrub = (s) =>
  String(s)
    .split(REPO).join('<repo-root-in-wsl>')
    .split(temp).join('<temp-repo>')
    .split(process.execPath).join('<wsl-node>')
    .split(home).join('<wsl-home>');
const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const out = scrub((r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : ''));
const file = path.join(dir, `step-${step}-${name}.txt`);
fs.appendFileSync(
  file,
  `${label}  ${scrub(argv.join(' '))}\n  cwd: ${scrub(process.cwd())}\n  exit code: ${r.status}\n  --- output ---\n${out}\n  --- end ---\n\n`
);
const cap = Number(process.env.RUNNER_CAP || 9000);
let shown = out;
if (out.length > cap) shown = out.slice(0, Math.floor(cap / 3)) + '\n...[truncated, full text in the step log]...\n' + out.slice(out.length - Math.floor((cap * 2) / 3));
console.log(`[${label}] EXIT=${r.status}\n${shown}`);
process.exit(r.status === null ? 1 : r.status);
