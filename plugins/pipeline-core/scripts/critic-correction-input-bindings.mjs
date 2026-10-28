#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// critic-correction-input-bindings.mjs derive --root ROOT --base COMMIT --head COMMIT --out scratch/FILE
// Writes the correction-input bindings document of a Critic range once (no overwrite) and prints a one-line JSON result.
// Exit 0 on success; a typed refusal prints {schema, code, detail} on one line and exits 2.
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  CRITIC_CORRECTION_INPUT_BINDINGS_SCHEMA,
  CriticCorrectionInputBindingsError,
  bindingsRoleCounts,
  deriveCriticCorrectionInputBindings,
} from "../lib/critic-correction-input-bindings.mjs";

export const CRITIC_CORRECTION_INPUT_BINDINGS_REFUSAL_SCHEMA = "pipeline.critic-correction-input-bindings-refusal.v1";
const USAGE = "Usage: critic-correction-input-bindings.mjs derive --root ROOT --base COMMIT --head COMMIT --out scratch/FILE";
const refuse = (code, detail) => { throw new CriticCorrectionInputBindingsError(code, detail); };

function parseArgs(argv) {
  if (argv[0] !== "derive") refuse("CCI-USAGE", USAGE);
  const options = {};
  const keys = { "--root": "root", "--base": "base", "--head": "head", "--out": "out" };
  for (let i = 1; i < argv.length; i += 2) {
    const key = keys[argv[i]];
    if (key === undefined || argv[i + 1] === undefined || Object.hasOwn(options, key)) refuse("CCI-USAGE", USAGE);
    options[key] = argv[i + 1];
  }
  for (const key of Object.values(keys)) if (typeof options[key] !== "string" || options[key] === "") refuse("CCI-USAGE", USAGE);
  return options;
}

function outTarget(root, out) {
  const parts = out.split("/");
  if (isAbsolute(out) || out.includes("\\") || out.includes("\0") || parts.length < 2 || parts[0] !== "scratch"
    || parts.some((part) => part === "" || part === "." || part === "..")) refuse("CCI-OUT", "the out path must be a repository-relative path under scratch/");
  const rootReal = realpathSync(root);
  let cursor = rootReal;
  for (const part of parts.slice(0, -1)) {
    cursor = join(cursor, part);
    let info = null;
    try { info = lstatSync(cursor); } catch (error) { if (error?.code !== "ENOENT") refuse("CCI-OUT", "the out directory is not readable"); break; }
    if (info.isSymbolicLink() || !info.isDirectory()) refuse("CCI-OUT", "the out path crosses a symlink or a non-directory");
  }
  const target = resolve(rootReal, out);
  if (!target.startsWith(rootReal + sep)) refuse("CCI-OUT", "the out path leaves the repository root");
  return target;
}

export function runCriticCorrectionInputBindingsCli(argv) {
  const options = parseArgs(argv);
  const target = outTarget(options.root, options.out);
  const document = deriveCriticCorrectionInputBindings({ repoRoot: options.root, base: options.base, head: options.head });
  mkdirSync(dirname(target), { recursive: true });
  try { writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" }); }
  catch (error) { if (error?.code === "EEXIST") refuse("CCI-OUT", "the out file already exists and is never overwritten"); throw error; }
  return { schema: CRITIC_CORRECTION_INPUT_BINDINGS_SCHEMA, digestSha256: document.digestSha256, counts: bindingsRoleCounts(document), path: options.out };
}

if (isDirectInvocation(import.meta.url)) {
  try { console.log(JSON.stringify(runCriticCorrectionInputBindingsCli(process.argv.slice(2)))); }
  catch (error) {
    const typed = error instanceof CriticCorrectionInputBindingsError ? error : new CriticCorrectionInputBindingsError("CCI-UNEXPECTED", "unexpected failure");
    console.log(JSON.stringify({ schema: CRITIC_CORRECTION_INPUT_BINDINGS_REFUSAL_SCHEMA, code: typed.code, detail: typed.detail }));
    process.exitCode = 2;
  }
}
