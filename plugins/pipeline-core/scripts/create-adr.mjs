#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * create-adr.mjs -- the sanctioned way to create an Architecture Decision Record proposal (C20 G20-26, greenfield finding G20-23).
 *
 * Usage:
 *   create-adr.mjs --root <root> --slug <slug> --title <title> [--scope project|global | --modules <id[,id...]>]
 *                  [--supersedes <adr-id>] [--date YYYY-MM-DD]
 *   create-adr.mjs --root <root> --slug <slug> --refresh
 *
 * Writes docs/adr/draft-<slug>.md and docs/adr/draft-<slug>.json: a PROPOSAL (status `proposed`, schema
 * pipeline.architecture-decision.v1, or .v2 when module ids are named) whose `digest` is already the SHA-256 of the Markdown bytes.
 * `--refresh` recomputes that digest after the Markdown was edited, so nobody hashes by hand.
 *
 * Why `draft-<slug>` and not `NNNN-<slug>`: the sanctioned materializer (`pipeline-state.mjs materialize-architecture`, through
 * lib/architecture-prospective-materialization.mjs) accepts only proposals named `docs/adr/draft-*` and writes the ACCEPTED record to
 * a different file `docs/adr/NNNN-<slug>` whose bytes the signed manifest pre-binds. An in-place proposed -> accepted flip would
 * change the very digests the PO's design signature covers. The authoritative status lives in the sidecar only; the Markdown carries
 * no status line. This script never writes `accepted`, `superseded` or `waived`: no agent write grants those statuses.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPhysicalArchitectureMap, validateArchitectureDecisionSidecar } from "../lib/architecture-effective-decisions.mjs";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const MODULE_ID = /^[a-z][a-z0-9-]{0,79}$/u;
const ADR_ID = /^[A-Za-z0-9._-]+$/u;
const FLAGS = new Set(["--root", "--slug", "--title", "--scope", "--modules", "--supersedes", "--date", "--refresh"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

class Refusal extends Error {}
const refuse = (message) => { throw new Refusal(message); };

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!FLAGS.has(flag)) refuse(`unknown argument ${JSON.stringify(flag)}; allowed: ${[...FLAGS].join(" ")}`);
    if (values.has(flag)) refuse(`${flag} may be given only once`);
    if (flag === "--refresh") { values.set(flag, true); continue; }
    const value = argv[index + 1];
    if (typeof value !== "string" || (value.startsWith("--") && FLAGS.has(value))) refuse(`${flag} needs a value`);
    values.set(flag, value);
    index += 1;
  }
  return values;
}

function adrDirectory(root, create) {
  const docs = join(root, "docs"), dir = join(docs, "adr");
  for (const path of [docs, dir]) {
    if (existsSync(path)) {
      const stat = lstatSync(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) refuse(`${path.slice(root.length + 1)} must be a real directory (not a link) inside the project`);
    } else if (create) mkdirSync(path);
  }
  return dir;
}

export function nextFreeNumber(dir) {
  const numbers = existsSync(dir) ? readdirSync(dir).map((name) => /^(\d{4})-/u.exec(name)?.[1]).filter(Boolean).map(Number) : [];
  return String(Math.max(0, ...numbers) + 1).padStart(4, "0");
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function template(title) {
  const section = (heading, hint) => `## ${heading}\n\nREPLACE: ${hint}\n`;
  return [`# ${title}\n`,
    section("Context", "the forces and constraints that make this decision necessary."),
    section("Decision", "the decision, stated so that it can be checked against the implementation."),
    section("Consequences", "what becomes easier, what becomes harder, what is now fixed."),
    section("Affected Contracts", "the public contracts, modules or paths this decision constrains, or `none`.")].join("\n");
}

function refreshDigest(root, slug) {
  const dir = adrDirectory(root, false), id = `draft-${slug}`;
  const markdownPath = join(dir, `${id}.md`), sidecarPath = join(dir, `${id}.json`);
  if (!existsSync(markdownPath) || !existsSync(sidecarPath)) refuse(`docs/adr/${id}.md and docs/adr/${id}.json must both exist (create the proposal first)`);
  let record;
  try { record = JSON.parse(readFileSync(sidecarPath, "utf8")); } catch { refuse(`docs/adr/${id}.json is not valid JSON`); }
  if (!validateArchitectureDecisionSidecar(record) || record.id !== id || record.status !== "proposed") {
    refuse(`docs/adr/${id}.json is not a valid proposal for ${id} (status must be proposed); --refresh changes the digest only`);
  }
  const digest = sha256(readFileSync(markdownPath));
  if (digest === record.digest) return { ok: true, id, sidecar: `docs/adr/${id}.json`, digest, changed: false };
  // Same key order as the creation; only `digest` changes.
  const fd = openSync(sidecarPath, "w");
  try { writeSync(fd, `${JSON.stringify({ ...record, digest }, null, 2)}\n`); } finally { closeSync(fd); }
  return { ok: true, id, sidecar: `docs/adr/${id}.json`, digest, changed: true };
}

function createProposal(root, values) {
  const slug = values.get("--slug");
  const title = values.get("--title");
  if (typeof title !== "string" || title.trim() === "" || title !== title.trim() || title.length > 160 || /[\u0000-\u001f\u007f]/u.test(title)) {
    refuse("--title must be 1 to 160 characters, without leading/trailing space or control characters");
  }
  const date = values.get("--date") ?? new Date().toISOString().slice(0, 10);
  if (!validDate(date)) refuse(`--date must be a real calendar date YYYY-MM-DD, got ${JSON.stringify(date)}`);
  let scope = values.get("--scope") ?? "project";
  if (!["project", "global"].includes(scope)) refuse("--scope must be project or global (name module ids with --modules instead)");
  let moduleIds = null;
  if (values.has("--modules")) {
    if (values.has("--scope")) refuse("--modules and --scope exclude each other (named modules make the record module-scoped)");
    const listed = values.get("--modules").split(",");
    if (listed.some((id) => !MODULE_ID.test(id))) refuse("--modules must be a comma-separated list of lower-case module ids");
    moduleIds = [...new Set(listed)].sort();
    const map = loadPhysicalArchitectureMap(root);
    if (!map) refuse("--modules needs the physical architecture map (architecture/map); it does not exist yet. Draft a project- or global-scope proposal, or create the proposal after the map is materialized");
    const known = new Set(map.modules.map((module) => module.id));
    const unknown = moduleIds.filter((id) => !known.has(id));
    if (unknown.length) refuse(`module ids not in architecture/map: ${unknown.join(", ")}; known: ${[...known].sort().join(", ")}`);
    scope = "module";
  }
  const supersedes = values.get("--supersedes");
  const dir = adrDirectory(root, false);
  if (supersedes !== undefined) {
    if (!ADR_ID.test(supersedes)) refuse("--supersedes must be an ADR id such as 0003-storage");
    if (!existsSync(join(dir, `${supersedes}.md`))) refuse(`--supersedes names ${supersedes}, but docs/adr/${supersedes}.md does not exist`);
  }
  const id = `draft-${slug}`;
  if (existsSync(join(dir, `${id}.md`)) || existsSync(join(dir, `${id}.json`))) refuse(`docs/adr/${id}.md or .json already exists; ADRs are immutable history, pick another slug (edit the Markdown and use --refresh to update the digest)`);
  const markdown = Buffer.from(template(title), "utf8");
  const record = {
    schema: moduleIds ? "pipeline.architecture-decision.v2" : "pipeline.architecture-decision.v1",
    id, title, status: "proposed", digest: sha256(markdown), scope,
    ...(moduleIds ? { moduleIds } : {}), ...(supersedes === undefined ? {} : { supersedes }), date,
  };
  if (!validateArchitectureDecisionSidecar(record)) refuse("internal: the generated sidecar failed the structural check");
  const free = nextFreeNumber(dir);
  adrDirectory(root, true);
  const written = [];
  try {
    for (const [name, bytes] of [[`${id}.md`, markdown], [`${id}.json`, Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8")]]) {
      const fd = openSync(join(dir, name), "wx", 0o644);
      written.push(join(dir, name));
      try { writeSync(fd, bytes); } finally { closeSync(fd); }
    }
  } catch (error) {
    for (const path of written) { try { unlinkSync(path); } catch { /* best effort */ } }
    throw error;
  }
  return { ok: true, id, schema: record.schema, status: "proposed", digest: record.digest, markdown: `docs/adr/${id}.md`, sidecar: `docs/adr/${id}.json`,
    nextFreeNumber: free, acceptedIdAfterApproval: `${free}-${slug}`,
    next: "Replace each REPLACE: line in the Markdown, run this script again with --refresh to recompute the digest, then bind the proposal in the design package; it becomes `accepted` only through the PO's design approval and `pipeline-state.mjs materialize-architecture`." };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const values = parseArgs(argv);
    const rootValue = values.get("--root");
    // The guard hands this script the root in whichever separator spelling the shell typed; resolve() normalizes it, so a
    // forward-slash Windows spelling is not refused here after the guard admitted it.
    if (typeof rootValue !== "string" || !isAbsolute(rootValue) || !existsSync(rootValue) || !lstatSync(rootValue).isDirectory()) {
      refuse("--root must be the absolute project root directory");
    }
    const root = resolve(rootValue);
    const slug = values.get("--slug");
    if (typeof slug !== "string" || !SLUG.test(slug)) refuse("--slug must be 1 to 64 characters of a-z, 0-9 and '-', starting with a letter or digit");
    const refresh = values.has("--refresh");
    if (refresh && values.size !== 3) refuse("--refresh takes only --root and --slug");
    const result = refresh ? refreshDigest(root, slug) : createProposal(root, values);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    if (!(error instanceof Refusal)) console.error(`create-adr: ${error?.message ?? error}`);
    else console.error(`create-adr refused: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
