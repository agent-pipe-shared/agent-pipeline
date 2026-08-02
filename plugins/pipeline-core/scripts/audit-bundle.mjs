#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Explicit local CLI for candidate-bound Audit Bundle planning, build and verification. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { buildAuditBundle, planAuditBundle, verifyAuditBundle } from "../lib/audit-bundle.mjs";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function values(argv) { const result = new Map(); for (let index = 1; index < argv.length; index += 2) { const key = argv[index]; const value = argv[index + 1]; if (!key?.startsWith("--") || value === undefined || (!key.endsWith("-file") && result.has(key))) fail("ABC-ARGUMENT", "Audit Bundle arguments are invalid."); const list = result.get(key) ?? []; result.set(key, [...list, value]); } return result; }
function one(map, key, required = true) { const found = map.get(key) ?? []; if ((required && found.length !== 1) || (!required && found.length > 1)) fail("ABC-ARGUMENT", `Expected one ${key}.`); return found[0] ?? null; }
function parse(argv) { if (!new Set(["plan", "build", "verify"]).has(argv[0]) || (argv.length - 1) % 2 !== 0) fail("ABC-ARGUMENT", "Usage: audit-bundle.mjs plan|build|verify …"); const flags = values(argv); const sub = argv[0]; if (sub === "plan") return { sub, repositoryRoot: one(flags, "--repo"), manifestPath: one(flags, "--manifest"), bundleId: one(flags, "--bundle-id"), coreVersion: one(flags, "--core-version"), packFiles: flags.get("--pack-file") ?? [] }; if (sub === "build") return { sub, repositoryRoot: one(flags, "--repo"), planFile: one(flags, "--plan-file"), outputPath: one(flags, "--output") }; return { sub, bundleRoot: one(flags, "--bundle") }; }
async function readJson(path, read = readFile) { try { return parseStrictJson(await read(path)); } catch { fail("ABC-JSON", "A required JSON input is invalid."); } }
export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parse(argv); const load = deps.readJson ?? readJson;
  if (options.sub === "plan") { if (options.packFiles.length === 0) fail("ABC-ARGUMENT", "At least one policy pack is required."); const packs = []; for (const path of options.packFiles) packs.push(await load(path)); return (deps.plan ?? planAuditBundle)({ repositoryRoot: options.repositoryRoot, manifestPath: options.manifestPath, bundleId: options.bundleId, coreVersion: options.coreVersion, packs }); }
  if (options.sub === "build") return (deps.build ?? buildAuditBundle)({ repositoryRoot: options.repositoryRoot, outputPath: options.outputPath, plan: await load(options.planFile) });
  return (deps.verify ?? verifyAuditBundle)({ bundleRoot: options.bundleRoot });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(await main())}\n`); } catch (error) { process.stderr.write(`${error.code ?? "ABC-FAILED"}: ${error.message}\n`); process.exitCode = 2; } }
