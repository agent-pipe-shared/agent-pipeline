#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * create-adr.mjs -- the sanctioned way to create an Architecture Decision Record proposal (C20 G20-26, greenfield finding G20-23).
 *
 * Usage:
 *   create-adr.mjs --root <root> --slug <slug> --title <title> [--scope project|global | --modules <id[,id...]>]
 *                  [--supersedes <adr-id>] [--date YYYY-MM-DD]
 *   create-adr.mjs --root <root> --slug <slug> --refresh
 *   create-adr.mjs --root <root> --refresh    (every docs/adr/draft-*.md at once)
 *   create-adr.mjs --root <root> --from-design   (one proposal per module adrReferences path of the active feature's draft design that has
 *                                                 no draft and no accepted record; titles from the slugs; a second call creates nothing)
 *   create-adr.mjs --root <root> --slug <slug> --discard --reason "<why the draft is not wanted>"
 *                                              (records the discard in docs/adr/discarded/draft-<slug>.json; the draft stays as history)
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
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADR_DRAFT_DISCARD_SCHEMA, adrDraftDiscardPath, classifyDeclaredAdrReferences, loadPhysicalArchitectureMap, validateArchitectureDecisionSidecar } from "../lib/architecture-effective-decisions.mjs";
import { LEGACY_STATE, NEUTRAL_STATE, resolveProjectAuthorityPaths } from "../lib/project-authority-read.mjs";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const MODULE_ID = /^[a-z][a-z0-9-]{0,79}$/u;
const ADR_ID = /^[A-Za-z0-9._-]+$/u;
const FLAGS = new Set(["--root", "--slug", "--title", "--scope", "--modules", "--supersedes", "--date", "--refresh", "--discard", "--reason", "--from-design"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

class Refusal extends Error {}
const refuse = (message) => { throw new Refusal(message); };

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!FLAGS.has(flag)) refuse(`unknown argument ${JSON.stringify(flag)}; allowed: ${[...FLAGS].join(" ")}`);
    if (values.has(flag)) refuse(`${flag} may be given only once`);
    if (flag === "--refresh" || flag === "--discard" || flag === "--from-design") { values.set(flag, true); continue; }
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

/** Claude greenfield 2026-11-08: one call per draft cost about thirty calls. `--refresh` without a slug updates every draft at once. */
function refreshAllDigests(root) {
  const dir = adrDirectory(root, false);
  const slugs = pendingDraftSlugs(dir);
  if (slugs.length === 0) refuse("docs/adr holds no draft-<slug>.md to refresh");
  const refreshed = slugs.map((slug) => refreshDigest(root, slug));
  return { ok: true, refreshed, changed: refreshed.filter((entry) => entry.changed).map((entry) => entry.id) };
}

/**
 * C28-PLAN-GATES: a draft that is deliberately not wanted is discarded with a reason, so that submit-plan stops asking for its binding.
 * It writes ONE record (docs/adr/discarded/draft-<slug>.json: who/what/why, bound to the exact draft bytes) and leaves the draft on disk,
 * because ADRs are history. No signature: the record is an audit trail, not an approval, and it never makes anything accepted.
 */
function discardDraft(root, values) {
  const slug = values.get("--slug");
  const reason = values.get("--reason");
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > 300 || /[\u0000-\u001f\u007f]/u.test(reason)) {
    refuse("--discard needs --reason \"<why the draft is not wanted>\": 1 to 300 characters on one line");
  }
  const dir = adrDirectory(root, false);
  const id = `draft-${slug}`;
  const markdownPath = join(dir, `${id}.md`), sidecarPath = join(dir, `${id}.json`);
  if (!existsSync(markdownPath) || !existsSync(sidecarPath)) refuse(`docs/adr/${id}.md and docs/adr/${id}.json must both exist (nothing to discard for --slug ${slug})`);
  const accepted = readdirSync(dir).find((name) => new RegExp(`^\\d{4}-${slug}\\.json$`, "u").test(name));
  if (accepted !== undefined) refuse(`docs/adr/${accepted} already exists: this proposal was materialized, ADRs are immutable history and a discard record would mean nothing`);
  if (existsSync(join(root, ...adrDraftDiscardPath(slug).split("/")))) refuse(`docs/adr/discarded/${id}.json: this draft is already discarded (the first record is never rewritten)`);
  const body = {
    schema: ADR_DRAFT_DISCARD_SCHEMA, id, markdownSha256: sha256(readFileSync(markdownPath)), sidecarSha256: sha256(readFileSync(sidecarPath)),
    reason, discardedAt: new Date().toISOString(),
  };
  const target = join(root, ...adrDraftDiscardPath(slug).split("/"));
  mkdirSync(dirname(target), { recursive: true });
  const fd = openSync(target, "wx", 0o644);
  try { writeSync(fd, `${JSON.stringify(body, null, 2)}\n`); } finally { closeSync(fd); }
  return { ok: true, discarded: `docs/adr/${id}.md`, record: adrDraftDiscardPath(slug), reason,
    next: "Commit the discard record. The draft files stay as history; submit-plan no longer asks for this proposal's binding. If the draft changes later it counts as a new proposal and must be bound or discarded again." };
}

function pendingDraftSlugs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((name) => /^draft-(.+)\.md$/u.exec(name)?.[1]).filter((slug) => typeof slug === "string" && SLUG.test(slug)).sort();
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
    next: "Finish the bootstrap binding first: while readiness is bootstrap-binding-required an edit of this draft is refused (GUARD-LIFECYCLE-NOT-READY). Then replace each REPLACE: line in the Markdown, run this script again with --refresh (without --slug it updates every draft) to recompute the digest once after the last edit, then bind the proposal in the design package; it becomes `accepted` only through the PO's design approval and `pipeline-state.mjs materialize-architecture`. The number is a preview: bind-adr-proposals.mjs assigns the final numbers in --draft order." };
}

/** The file at a repository-relative path inside the root, never a link; null when it is absent. */
function readInsideRoot(root, relative) {
  const normalized = typeof relative === "string" ? relative.replace(/\\/gu, "/") : "";
  if (normalized === "" || isAbsolute(normalized) || /^[A-Za-z]:/u.test(normalized) || normalized.split("/").some((part) => part === ".." || part === "")) return null;
  const target = join(root, ...normalized.split("/"));
  try { if (!lstatSync(target).isFile()) return null; return readFileSync(target, "utf8"); } catch { return null; }
}

/**
 * AC-112 (candidate 31, L4 stage 3): one proposal for every module adrReferences path of the active feature's draft design that has neither a
 * draft nor an accepted record (the same list submit-plan prints as a notice). Title derived from the slug, the REPLACE: text stays so
 * bind-adr-proposals refuses the draft until it is written, a slug that already has a draft is skipped and named. Derived from the PRD and the
 * files: no stored status. Once the design approval is in force a draft could no longer be bound, so nothing is written then.
 */
function createFromDesign(root) {
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  const statePath = authority.status === "ready" ? authority.state : (existsSync(join(root, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
  let state;
  try { state = JSON.parse(readInsideRoot(root, statePath) ?? ""); } catch { state = null; }
  if (state === null || typeof state !== "object" || Array.isArray(state)) refuse("--from-design needs the Pipeline State of this project (project/pipeline-state.json); run pipeline-start first");
  if (state.planApproved === true || state.planApproval?.poGateAuthority) {
    refuse("--from-design writes nothing while the design approval is in force: a draft written now cannot be bound into the approved package and would block the next submit-plan. Reopen the design first (pipeline-state.mjs reopen-design, the PO's reopening step), then run this command again");
  }
  if (state.planSubmission !== undefined && state.planSubmission !== null) {
    refuse("--from-design writes nothing while a plan submission stands: the PRD is immutable then and a draft written now could not be bound into the design. Withdraw it first (pipeline-state.mjs cancel-submitted-plan --by <name> --submission-sha256 <the submission digest shown by submit-plan>), then run this command again");
  }
  const planPath = state.activeFeature?.planPath;
  const prd = readInsideRoot(root, planPath);
  if (prd === null) refuse("--from-design needs the active feature's PRD with its architecture design block; start the feature (pipeline-state.mjs set-feature) and author the design first");
  const blocks = [...prd.matchAll(/^```pipeline-architecture-design\r?\n([\s\S]*?)^```\s*$/gmu)];
  if (blocks.length !== 1) refuse(`${planPath} must hold exactly one pipeline-architecture-design block; author the design (design-authoring) first`);
  let design;
  try { design = JSON.parse(blocks[0][1]); } catch { refuse(`the pipeline-architecture-design block of ${planPath} is not valid JSON; correct it first`); }
  const { pending, skipped } = classifyDeclaredAdrReferences({ rootDir: root, modules: design?.modules });
  const created = pending.map((entry) => {
    const proposal = createProposal(root, new Map([["--slug", entry.slug], ["--title", entry.title]]));
    return { slug: entry.slug, id: proposal.id, title: entry.title, markdown: proposal.markdown, sidecar: proposal.sidecar, reference: entry.reference };
  });
  return { ok: true, created, skipped,
    next: created.length === 0 ? "Nothing to create: every declared ADR path already has a draft or an accepted record."
      : "Replace each REPLACE: line of the new docs/adr/draft-<slug>.md, run this script with --refresh (without --slug it updates every draft), then bind the drafts with bind-adr-proposals.mjs (SKILL.md of the architecture-decision skill) before the design review receipt. A draft that is not wanted is discarded with --discard --reason." };
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
    const refresh = values.has("--refresh");
    if (values.has("--from-design")) {
      if (values.size !== 2) refuse("--from-design takes only --root and --from-design (the slugs and titles come from the design's adrReferences)");
      console.log(JSON.stringify(createFromDesign(root), null, 2));
      return 0;
    }
    if (refresh && values.size === 2) {
      console.log(JSON.stringify(refreshAllDigests(root), null, 2));
      return 0;
    }
    if (typeof slug !== "string" || !SLUG.test(slug)) refuse("--slug must be 1 to 64 characters of a-z, 0-9 and '-', starting with a letter or digit");
    if (values.has("--discard") || values.has("--reason")) {
      if (!values.has("--discard") || refresh || values.size !== 4) refuse("--discard takes exactly --root, --slug and --reason \"<why the draft is not wanted>\"");
      console.log(JSON.stringify(discardDraft(root, values), null, 2));
      return 0;
    }
    if (refresh && values.size !== 3) refuse("--refresh takes only --root and, for one draft, --slug");
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
