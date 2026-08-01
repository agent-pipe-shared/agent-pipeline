#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Sanitized operator boundary for the PHX-1 portable governance event store. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { canonicalSha256, parseStrictJson } from "../lib/governance-event.mjs";
import {
  GovernanceEventStoreError,
  appendPortableGovernanceEvent,
  queryPortableGovernanceStream,
  recoverPortableGovernanceProjection,
  verifyPortableGovernanceStream,
} from "../lib/governance-event-store.mjs";

export class GovernanceEventCliError extends Error {
  constructor(code, message) { super(message); this.name = "GovernanceEventCliError"; this.code = code; }
}
function fail(code, message) { throw new GovernanceEventCliError(code, message); }
function exactKeys(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function text(value) { return `${JSON.stringify(value)}\n`; }

async function request(file) {
  if (typeof file !== "string" || file.length === 0) fail("GEC-ARGUMENT", "A request file is required.");
  try { return parseStrictJson(await readFile(file)); } catch { fail("GEC-REQUEST", "The request file is not strict JSON."); }
}

function parse(argv) {
  const [operation, ...tail] = argv;
  const flags = new Map();
  for (let index = 0; index < tail.length; index += 2) {
    const flag = tail[index]; const value = tail[index + 1];
    if (!flag?.startsWith("--") || value === undefined || flags.has(flag)) fail("GEC-ARGUMENT", "Arguments must be unique flag/value pairs.");
    flags.set(flag, value);
  }
  const allowed = {
    preview: ["--request-file"],
    append: ["--repo", "--request-file"],
    verify: ["--repo", "--request-file"],
    query: ["--repo", "--request-file"],
    recover: ["--repo", "--request-file"],
  }[operation];
  if (!allowed || flags.size !== allowed.length || allowed.some((flag) => !flags.has(flag)) || [...flags.keys()].some((flag) => !allowed.includes(flag))) {
    fail("GEC-ARGUMENT", "Usage: governance-event.mjs preview --request-file <file> | append|verify|query|recover --repo <checkout> --request-file <file>");
  }
  return { operation, repo: flags.get("--repo"), requestFile: flags.get("--request-file") };
}

function appendRequest(value) {
  if (!exactKeys(value, ["schema", "repositoryFingerprint", "intent"]) || value.schema !== "pipeline.governance-event-append-request.v1") fail("GEC-REQUEST", "Append request has an invalid closed shape.");
  return value;
}
function streamRequest(value, schema) {
  if (!exactKeys(value, ["schema", "repositoryFingerprint", "streamId", "checkpoint"]) || value.schema !== schema || (value.checkpoint !== null && (value.checkpoint === null || typeof value.checkpoint !== "object"))) fail("GEC-REQUEST", "Stream request has an invalid closed shape.");
  return value;
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parse(argv);
  const body = await request(parsed.requestFile);
  if (parsed.operation === "preview") {
    const append = appendRequest(body);
    // Preview remains read-only and never allocates a sequence or event digest.
    return { schema: "pipeline.governance-event-preview.v1", repositoryFingerprint: append.repositoryFingerprint, requestDigest: canonicalSha256(append), operation: "append", mutation: false };
  }
  if (parsed.operation === "append") {
    const append = appendRequest(body);
    return appendPortableGovernanceEvent({ repositoryRoot: parsed.repo, repositoryFingerprint: append.repositoryFingerprint, intent: append.intent });
  }
  const stream = streamRequest(body, parsed.operation === "recover" ? "pipeline.governance-event-recovery-request.v1" : "pipeline.governance-event-stream-request.v1");
  if (parsed.operation === "verify") return verifyPortableGovernanceStream({ repositoryRoot: parsed.repo, repositoryFingerprint: stream.repositoryFingerprint, streamId: stream.streamId, checkpoint: stream.checkpoint });
  if (parsed.operation === "query") return queryPortableGovernanceStream({ repositoryRoot: parsed.repo, repositoryFingerprint: stream.repositoryFingerprint, streamId: stream.streamId, checkpoint: stream.checkpoint });
  return recoverPortableGovernanceProjection({ repositoryRoot: parsed.repo, repositoryFingerprint: stream.repositoryFingerprint, streamId: stream.streamId, checkpoint: stream.checkpoint });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(text(await main())); }
  catch (error) {
    const code = error instanceof GovernanceEventStoreError || error instanceof GovernanceEventCliError ? error.code : "GEC-FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
