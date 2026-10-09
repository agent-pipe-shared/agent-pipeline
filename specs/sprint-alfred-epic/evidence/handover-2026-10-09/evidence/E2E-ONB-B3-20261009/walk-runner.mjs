// E2E-ONB-B3 walk step runner (evidence tooling, not part of any commit). Executes commands as argv (no shell),
// appends a scrubbed, machine-written log block per step to a step file next to this script.
// single: node walk-runner.mjs <NN> <name> <label> -- cmd args...        (prints the capped full output)
// chain : node walk-runner.mjs chain <NN> <name> <label> -- cmd args... --- <NN> <name> <label> -- cmd args...
//         (each step still logged in full; prints a compact digest per step; stops at the first non-zero exit
//         unless the label ends with "?")
// macros: @PLUGIN @TEMP @REPO paths; @<name> = last value of a JSON string key seen in earlier step output
//         (persisted in walk-vars.json, values with a slash are never stored); builtin commands @mkgoal, @author.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(dir, '..', '..');
const home = os.homedir();
const TEMP = path.join(home, 'tmp', 'e2e-onb-b3-20261009');
const PLUGIN = path.join(REPO, 'plugins', 'pipeline-core');
const varsFile = path.join(dir, 'walk-vars.json');
const vars = fs.existsSync(varsFile) ? JSON.parse(fs.readFileSync(varsFile, 'utf8')) : {};

const scrub = (s) =>
  String(s)
    .split(REPO).join('<repo-root-in-wsl>')
    .split(TEMP).join('<temp-repo>')
    .split(process.execPath).join('<wsl-node>')
    .split(home).join('<wsl-home>');

const sub = (a) =>
  a
    .replace(/@(PLUGIN|TEMP|REPO)\b/g, (m, k) => ({ PLUGIN, TEMP, REPO })[k])
    .replace(/@([A-Za-z][A-Za-z0-9]*)/g, (m, k) => (k in vars ? vars[k] : m));

const KEYS = new Set(['status', 'code', 'reasonCode', 'kind', 'action', 'mode', 'executionBoundary', 'invocation', 'subcommand', 'initializesGit', 'planSha256', 'intentSha256', 'featureId', 'human_approval']);

function runStep(step, name, label, rawArgv) {
  let argv = rawArgv.map(sub);
  let r;
  if (argv[0] === '@mkgoal') {
    fs.mkdirSync('scratch', { recursive: true });
    fs.writeFileSync('scratch/goal.txt', 'a CLI that counts words\n');
    vars.goalSha256 = crypto.createHash('sha256').update(fs.readFileSync('scratch/goal.txt')).digest('hex');
    r = { status: 0, stdout: JSON.stringify({ goalSha256: vars.goalSha256 }) + '\n', stderr: '' };
    argv = ['(builtin) write scratch/goal.txt "a CLI that counts words"'];
  } else {
    if (argv[0] === '@author') argv = [process.execPath, path.join(REPO, 'evidence', 'E2E-ONB-B2-20261009', 'walk-author.mjs')];
    if (argv[0] === 'node') argv[0] = process.execPath;
    r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  }
  const raw = (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
  const out = scrub(raw);
  fs.appendFileSync(
    path.join(dir, `step-${step}-${name}.txt`),
    `${label}  ${scrub(argv.join(' '))}\n  cwd: ${scrub(process.cwd())}\n  exit code: ${r.status}\n  --- output ---\n${out}\n  --- end ---\n\n`
  );
  for (const m of raw.matchAll(/"([A-Za-z0-9_]+)"\s*:\s*"([^"\n]{1,300})"/g)) if (!/[\\/]/.test(m[2])) vars[m[1]] = m[2];
  fs.writeFileSync(varsFile, JSON.stringify(vars, null, 2));
  return { label, status: r.status === null ? 1 : r.status, out };
}

function digest(out) {
  const seen = new Set();
  const items = [];
  for (const m of out.matchAll(/"([A-Za-z0-9_]+)"\s*:\s*("[^"\n]{0,200}"|true|false|null|\d+)/g)) {
    if (!KEYS.has(m[1])) continue;
    const item = `${m[1]}=${m[2].slice(0, 120)}`;
    if (!seen.has(item)) { seen.add(item); items.push(item); }
    if (items.length >= 16) break;
  }
  return items.join(' | ');
}

const args = process.argv.slice(2);
if (args[0] === 'chain') {
  const groups = [[]];
  for (const a of args.slice(1)) a === '---' ? groups.push([]) : groups[groups.length - 1].push(a);
  let last = 0;
  for (const g of groups) {
    const [step, name, label, sep, ...argv] = g;
    if (sep !== '--' || argv.length === 0) { console.error('bad chain group: ' + g.join(' ')); process.exit(64); }
    const res = runStep(step, name, label, argv);
    last = res.status;
    console.log(`[${label}] EXIT=${res.status}  ${digest(res.out)}`);
    if (res.status !== 0 && !label.endsWith('?')) { console.log(`[chain stopped at ${label}]\n` + res.out.slice(0, 3000)); break; }
  }
  process.exit(last);
} else {
  const [step, name, label, sep, ...argv] = args;
  if (sep !== '--' || argv.length === 0) { console.error('usage: walk-runner.mjs <NN> <name> <label> -- cmd args...'); process.exit(64); }
  const res = runStep(step, name, label, argv);
  const cap = Number(process.env.RUNNER_CAP || 9000);
  let shown = res.out;
  if (shown.length > cap) shown = shown.slice(0, Math.floor(cap / 3)) + '\n...[truncated, full text in the step log]...\n' + shown.slice(shown.length - Math.floor((cap * 2) / 3));
  console.log(`[${label}] EXIT=${res.status}\n${shown}`);
  process.exit(res.status);
}
