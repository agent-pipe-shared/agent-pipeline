#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Read-only operator surface for provider-neutral external-reference preview and reconciliation. */
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseStrictJson } from "../lib/governance-event.mjs";
import { planExternalReferenceWrite, reconcileExternalReference } from "../lib/external-reference-adapter.mjs";
import { resolveCanonicalArtifactIdentity } from "../lib/feature-package-topology.mjs";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function safeRelative(root, value, code) { if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\\\")) fail(code, "A repository-relative path is required."); const target = resolve(root, value); const check = relative(root, target); if (check === "" || check === ".." || check.startsWith(`..${sep}`) || isAbsolute(check) || check.split(sep).some((part) => part === "." || part === "..")) fail(code, "The path escapes the repository."); return target; }
function parse(argv) {
  const command = argv[0]; const allowed = command === "preview" ? ["--root", "--reference", "--capabilities", "--desired", "--inspection", "--preview"] : command === "reconcile" ? ["--root", "--reference", "--capabilities", "--inspection"] : null;
  if (allowed === null || argv.length !== (allowed.length * 2) + 1) fail("ERC-ARGUMENT", "Usage: external-reference.mjs preview --root <checkout> --reference <relative-json> --capabilities <relative-json> --desired <relative-json> --inspection <relative-json> --preview <relative-json> | reconcile --root <checkout> --reference <relative-json> --capabilities <relative-json> --inspection <relative-json>");
  const values = new Map(); for (let index = 1; index < argv.length; index += 2) { if (!allowed.includes(argv[index]) || values.has(argv[index]) || argv[index + 1] === undefined) fail("ERC-ARGUMENT", "External-reference arguments are invalid."); values.set(argv[index], argv[index + 1]); }
  if (values.size !== allowed.length) fail("ERC-ARGUMENT", "External-reference arguments are incomplete.");
  const root = resolve(values.get("--root")); const paths = Object.fromEntries(allowed.filter((key) => key !== "--root").map((key) => [key.slice(2), safeRelative(root, values.get(key), "ERC-PATH")]));
  return { command, root, ...paths };
}
async function json(path, read) { try { return parseStrictJson(await read(path)); } catch { fail("ERC-JSON", "Operator input must be strict JSON."); } }
function inspectFrom(value) { return async () => value; }

export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parse(argv); const read = deps.readFile ?? readFile;
  const reference = await json(options.reference, read); const capabilities = await json(options.capabilities, read); const inspection = await json(options.inspection, read);
  if (options.command === "reconcile") return reconcileExternalReference({ reference, capabilities, inspect: inspectFrom(inspection) });
  const desired = await json(options.desired, read); const preview = await json(options.preview, read);
  // The canonical identity is resolved against the checkout under --root through
  // the feature-package topology, never inferred from the reference's own path.
  const resolveIdentity = deps.resolveIdentity ?? (async ({ path }) => resolveCanonicalArtifactIdentity(options.root, path));
  return planExternalReferenceWrite({ reference, capabilities, desired, inspect: inspectFrom(inspection), preview: async () => preview, resolveIdentity });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(await main())}\n`); } catch (error) { process.stderr.write(`${error.code ?? "ERC-FAILED"}: ${error.message}\n`); process.exitCode = 2; } }
