#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Usage: node report-resource-headroom.mjs --input scratch/resource-observations.json
 * Or pass a bounded observation JSON document on stdin. Read-only diagnostic;
 * exit 0 means the report was emitted, never that a project check passed.
 * Source and artifact references are declared data and are never opened here.
 *
 * Run-time mode (the Quick surface; Verify prints the same line in-process):
 *   node report-resource-headroom.mjs --run-time <quick|verify> --measured-seconds <seconds>
 * prints ONE information line comparing the measured run time with the optional
 * calibration field resourceBudget.quickSeconds / resourceBudget.verifySeconds.
 * Information only: it always exits 0, and any problem (no budget, unreadable
 * calibration, bad arguments, a throwing reporter) prints "unknown".
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { isDirectInvocation } from '../lib/entrypoint.mjs';
import {
  RUN_TIME_BUDGET_KEYS, ResourceHeadroomError, reportProjectResourceHeadroom, runHeadroomInfoLine,
} from '../lib/project-resource-headroom.mjs';

const MAX_INPUT_BYTES = 65536;
const MAX_CALIBRATION_BYTES = 262144;
const PRIVATE_ROOTS = new Set(['.git', '.ssh', '.aws', '.codex', '.agents', '.claude', '.pipeline']);
const fail = (message) => { throw new ResourceHeadroomError(message); };

export function parseResourceHeadroomArgs(argv) {
  if (!Array.isArray(argv)) fail('Arguments must be an array.');
  if (argv.length === 0) return { input: null };
  if (argv.length !== 2 || argv[0] !== '--input' || typeof argv[1] !== 'string') fail('Expected only --input <repository-relative JSON path>.');
  const input = argv[1];
  const parts = input.split('/');
  if (input.length === 0 || input.length > 500 || !input.endsWith('.json')
    || /[\\:\x00-\x1f\x7f]/u.test(input) || parts.some(part => part === '' || part === '.' || part === '..')
    || PRIVATE_ROOTS.has(parts[0])) fail('Input must be a public repository-relative JSON path.');
  return { input };
}

/** Run-time mode grammar: exactly --run-time <quick|verify> --measured-seconds <decimal>. */
export function parseRunTimeArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 4 || argv[0] !== '--run-time' || argv[2] !== '--measured-seconds'
    || typeof argv[1] !== 'string' || typeof argv[3] !== 'string') fail('Expected only --run-time <quick|verify> --measured-seconds <seconds>.');
  if (!Object.hasOwn(RUN_TIME_BUDGET_KEYS, argv[1])) fail('Run kind must be quick or verify.');
  if (argv[3].length > 24 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(argv[3])) fail('Measured seconds must be a nonnegative decimal number.');
  return { kind: argv[1], measuredSeconds: Number(argv[3]) };
}

/** Read the project calibration (resolved authority tier) read-only; null on any problem. */
export async function readRunTimeCalibration(cwd) {
  try {
    const { resolveAuthorityArtifactPath } = await import('../lib/project-authority.mjs');
    const { path } = resolveAuthorityArtifactPath('calibration', { rootDir: cwd });
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_CALIBRATION_BYTES) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return null; }
}

function sameFile(left, right) {
  return ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every(key => left[key] === right[key]);
}

function readInputFile(cwd, input) {
  const requestedRoot = resolve(cwd);
  const rootStat = lstatSync(requestedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || realpathSync(requestedRoot) !== requestedRoot) fail('Input root must be a physical directory.');
  let current = requestedRoot;
  const parts = input.split('/');
  let initial;
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    const stat = lstatSync(current, { bigint: true });
    if (stat.isSymbolicLink() || realpathSync(current) !== current) fail('Input path must not use physical aliases.');
    if (index < parts.length - 1) {
      if (!stat.isDirectory()) fail('Input parent is not a directory.');
    } else {
      if (!stat.isFile() || stat.nlink !== 1n || stat.size > BigInt(MAX_INPUT_BYTES)) fail('Input must be one bounded regular file.');
      initial = stat;
    }
  }
  const fd = openSync(current, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!sameFile(initial, opened)) fail('Input physical identity changed.');
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (count === 0) break;
      size += count;
    }
    if (size > MAX_INPUT_BYTES || !sameFile(opened, fstatSync(fd, { bigint: true }))
      || !sameFile(opened, lstatSync(current, { bigint: true }))) fail('Input changed while being read.');
    return buffer.subarray(0, size);
  } finally { closeSync(fd); }
}

async function readStdin(stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stdin) {
    if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) fail('Input stream must contain UTF-8 bytes.');
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_INPUT_BYTES) fail('Input exceeds the JSON transport bound.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

/** Run-time mode: one information line, always exit 0, never throws. */
async function runTimeHeadroomMain({ argv, stdout, cwd, readCalibration, headroom }) {
  let parsed = null;
  try { parsed = parseRunTimeArgs(argv); } catch { parsed = null; }
  let calibration = null;
  if (parsed !== null) {
    try { calibration = await readCalibration(cwd); } catch { calibration = null; }
  }
  const line = runHeadroomInfoLine({ kind: parsed?.kind ?? null, measuredSeconds: parsed?.measuredSeconds ?? null, calibration, headroom });
  try { stdout.write(`${line}\n`); } catch { /* information only: a closed stdout must not change the exit code */ }
  return 0;
}

export async function main({ argv = process.argv.slice(2), stdin = process.stdin,
  stdout = process.stdout, stderr = process.stderr, cwd = process.cwd(),
  readCalibration = readRunTimeCalibration, headroom } = {}) {
  if (Array.isArray(argv) && argv[0] === '--run-time') return runTimeHeadroomMain({ argv, stdout, cwd, readCalibration, headroom });
  try {
    const args = parseResourceHeadroomArgs(argv);
    const bytes = args.input === null ? await readStdin(stdin) : readInputFile(cwd, args.input);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const report = reportProjectResourceHeadroom(JSON.parse(text));
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    // Do not echo caller input, native paths or private filesystem error text.
    const message = error instanceof ResourceHeadroomError ? error.message : 'Unable to read valid bounded observation JSON.';
    stderr.write(`RESOURCE-HEADROOM-INPUT: ${message}\n`);
    return 2;
  }
}

if (isDirectInvocation(import.meta.url)) process.exitCode = await main();
