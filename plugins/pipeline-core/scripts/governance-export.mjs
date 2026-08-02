#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Explicit read-only export sanitation preview. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { mapGovernanceExportProjection } from "../lib/governance-export-adapter.mjs";
import { projectGovernanceEvent } from "../lib/governance-event-projection.mjs";
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parse(argv) {
  if (argv.length !== 5) fail("GEC-ARGUMENT", "Usage: governance-export.mjs preview --event-file <json> --policy-file <json|none> | map --projection-file <json> --profile-file <json>");
  const flags = new Map([[argv[1], argv[2]], [argv[3], argv[4]]]);
  if (flags.size !== 2) fail("GEC-ARGUMENT", "Export arguments are invalid.");
  if (argv[0] === "preview" && flags.has("--event-file") && flags.has("--policy-file")) return { mode: "preview", eventFile: flags.get("--event-file"), policyFile: flags.get("--policy-file") };
  if (argv[0] === "map" && flags.has("--projection-file") && flags.has("--profile-file")) return { mode: "map", projectionFile: flags.get("--projection-file"), profileFile: flags.get("--profile-file") };
  fail("GEC-ARGUMENT", "Export arguments are invalid.");
}
async function readJson(path, read = readFile) { try { return parseStrictJson(await read(path)); } catch { fail("GEC-JSON", "Export JSON input is invalid."); } }
export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parse(argv); const load = deps.readJson ?? readJson;
  if (options.mode === "map") return (deps.map ?? mapGovernanceExportProjection)({ projection: await load(options.projectionFile), profile: await load(options.profileFile) });
  return (deps.project ?? projectGovernanceEvent)({ event: await load(options.eventFile), policy: options.policyFile === "none" ? null : await load(options.policyFile) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(await main())}\n`); } catch (error) { process.stderr.write(`${error.code ?? "GEC-FAILED"}: ${error.message}\n`); process.exitCode = 2; } }
