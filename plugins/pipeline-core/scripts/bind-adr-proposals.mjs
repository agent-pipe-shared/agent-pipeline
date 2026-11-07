#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * bind-adr-proposals.mjs -- the sanctioned step that binds ADR proposals into the design package (C20 G20-23, remainder).
 *
 * Usage:
 *   bind-adr-proposals.mjs --root <root> --feature <featureId> --carrier <design.md> --selection <po-selection.json> --draft <slug> [--draft <slug>...]
 *
 * `create-adr.mjs` writes the proposals docs/adr/draft-<slug>.{md,json}. This script turns them into what the PO's single design
 * approval can sign, so that `pipeline-state.mjs materialize-architecture` publishes the accepted `docs/adr/NNNN-<slug>` records (and the
 * superseded predecessor) with no hand-built file. It writes, BEFORE the design review:
 *   - <dir of carrier>/prospective-chat-selection-<slug>.json for each draft (the pre-approval selection, bound to the exact proposal bytes),
 *   - <dir of carrier>/prospective-architecture.json (the prospective materialization manifest, every output digest computed by the same
 *     functions the consumer uses: lib/architecture-prospective-materialization.mjs),
 *   - the `pipeline-design-decision-bindings` v2 block inside the carrier (an existing block is replaced in place; its architectureDecisions
 *     and modelPolicy are kept).
 * and prints every companion path the design review receipt must carry (`design-review-receipt.mjs create --companion ...`).
 *
 * Authority: this script never writes `accepted`, `superseded` or `waived` anywhere. Those statuses appear only in the files
 * `materialize-architecture` publishes after the PO's approval, with the exact bytes the signed package pre-bound. The PO's own words
 * come only from --selection, a file the PO's reply was saved into; the script validates and copies it, it never invents or edits it.
 * Nothing is written unless the whole result passed the consumer's own manifest check; a refused request leaves no file behind.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateArchitectureDecisionSidecar } from "../lib/architecture-effective-decisions.mjs";
import {
  PLACEHOLDER_LINE, PROSPECTIVE_ARCHITECTURE_SCHEMA, deriveAcceptedRecords, derivePredecessorSidecar,
  inspectProspectiveArchitectureManifest, prospectiveJson,
} from "../lib/architecture-prospective-materialization.mjs";
import { parseDesignDecisionBindings } from "../lib/design-decision-bindings.mjs";
import { derivePoGateRepositoryFingerprint, resolvePoGateRepositoryTopology } from "../lib/po-gate-authority.mjs";
import { nextFreeNumber } from "./create-adr.mjs";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const FEATURE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const REL_PATH = /^[A-Za-z0-9_@][A-Za-z0-9._@/-]{0,239}$/u;
const FLAGS = new Set(["--root", "--feature", "--carrier", "--selection", "--draft"]);
const BLOCK = /^```pipeline-design-decision-bindings\r?\n[\s\S]*?^```[ \t]*\r?$\n?/mu;
const CHOICE_SCHEMA = "pipeline.architecture-prospective-chat-selection.v1";
const MAX_FILE = 1048576;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

class Refusal extends Error {}
const refuse = (message) => { throw new Refusal(message); };

function parseArgs(argv) {
  const values = new Map(), drafts = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!FLAGS.has(flag)) refuse(`unknown argument ${JSON.stringify(flag)}; allowed: ${[...FLAGS].join(" ")}`);
    const value = argv[index + 1];
    if (typeof value !== "string" || (value.startsWith("--") && FLAGS.has(value))) refuse(`${flag} needs a value`);
    index += 1;
    if (flag === "--draft") { drafts.push(value); continue; }
    if (values.has(flag)) refuse(`${flag} may be given only once`);
    values.set(flag, value);
  }
  return { values, drafts };
}

function safeRelative(label, value) {
  if (typeof value !== "string" || !REL_PATH.test(value) || value.split("/").some((part) => part === "" || part.startsWith("."))) {
    refuse(`${label} must be a repository-relative path without dot segments, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** A regular, non-link file below the root, read once; null when absent. */
function readRegular(root, rel, { required = false } = {}) {
  let cursor = root;
  const parts = rel.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    cursor = join(cursor, parts[index]);
    if (!existsSync(cursor)) { if (required) refuse(`${rel} does not exist`); return null; }
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) refuse(`${rel} must be a regular file below the project (no links)`);
  }
  const bytes = readFileSync(cursor);
  if (bytes.length === 0 || bytes.length > MAX_FILE) refuse(`${rel} must be between 1 byte and 1 MiB`);
  return { path: rel, bytes, text: bytes.toString("utf8"), sha256: sha256(bytes) };
}

function parseJson(file, what) {
  try { return JSON.parse(file.text); } catch { return refuse(`${file.path} is not valid JSON (${what})`); }
}

function readSelection(root, rel) {
  const shape = `{"attributedTo": "<who selected, e.g. PO chat selection 2026-11-07>", "selections": [{"topic": "<topic>", "text": "<the PO's own words>", "adr": "<optional draft slug>"}]}`;
  const file = readRegular(root, rel);
  if (!file) {
    refuse(`${rel} does not exist. It carries the PO's own selection, and this step never writes or edits it: save what the PO chose, in the PO's words, as JSON at that path `
      + `(shape ${shape}), then run this command again. Without the PO's selection the proposals cannot be bound.`);
  }
  const value = parseJson(file, `expected ${shape}`);
  const fail = (why) => refuse(`${rel}: ${why}. Expected ${shape}. Fix the file with the PO's actual words, then run this command again.`);
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("not a JSON object");
  const by = value.attributedTo;
  if (typeof by !== "string" || by.trim() === "" || by.length > 160 || /[\r\n\0]/u.test(by)) fail("attributedTo must be 1 to 160 characters on one line");
  if (!Array.isArray(value.selections) || value.selections.length === 0 || value.selections.length > 64) fail("selections must be 1 to 64 entries");
  for (const item of value.selections) {
    if (item === null || typeof item !== "object" || typeof item.topic !== "string" || item.topic.trim() === "" || typeof item.text !== "string" || item.text.trim() === "") {
      fail("every selection needs a non-empty topic and text");
    }
    if (PLACEHOLDER_LINE.test(item.text) || PLACEHOLDER_LINE.test(item.topic)) fail("a selection still holds a REPLACE: placeholder, which is not the PO's words");
    if (item.adr !== undefined && (typeof item.adr !== "string" || !SLUG.test(item.adr))) fail("adr, when present, must be a draft slug");
  }
  return { file, attributedTo: by, selections: value.selections };
}

function atomicWrite(root, rel, bytes) {
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.binding-${process.pid}`;
  const fd = openSync(temporary, "wx", 0o644);
  try { writeSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, target);
}

/** Writes all files or none: every previous state is restored when one write fails. */
function commitAll(root, writes) {
  const previous = writes.map(({ rel }) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel)) : null));
  const done = [];
  try {
    for (const { rel, bytes } of writes) { atomicWrite(root, rel, bytes); done.push(rel); }
  } catch (error) {
    for (const rel of done.reverse()) {
      const before = previous[writes.findIndex((write) => write.rel === rel)];
      try { if (before === null) unlinkSync(join(root, rel)); else atomicWrite(root, rel, before); } catch { /* best effort */ }
    }
    throw error;
  }
}

function bind(root, values, slugs) {
  const feature = values.get("--feature");
  if (typeof feature !== "string" || !FEATURE.test(feature)) refuse("--feature must be the active feature id (letters, digits, '.', '_' and '-')");
  const carrierPath = safeRelative("--carrier", values.get("--carrier"));
  const selectionPath = safeRelative("--selection", values.get("--selection"));
  if (!carrierPath.endsWith(".md")) refuse("--carrier must be the design Markdown file of this package (a .md file that is one of its companions)");
  if (slugs.length === 0 || slugs.length > 16 || new Set(slugs).size !== slugs.length || !slugs.every((slug) => SLUG.test(slug))) {
    refuse("name 1 to 16 distinct proposals with --draft <slug> (the slug given to create-adr.mjs)");
  }
  const carrier = readRegular(root, carrierPath, { required: true });
  let existingBinding;
  try { existingBinding = parseDesignDecisionBindings(carrier.bytes); }
  catch (error) { return refuse(`${carrierPath} holds a malformed pipeline-design-decision-bindings block (${error.message}); repair or remove that block, then run this command again`); }
  const selection = readSelection(root, selectionPath);
  for (const item of selection.selections) {
    if (item.adr !== undefined && !slugs.includes(item.adr)) refuse(`${selectionPath}: a selection names the draft ${JSON.stringify(item.adr)}, which is not among the --draft slugs (${slugs.join(", ")})`);
  }

  let fingerprint;
  try { fingerprint = derivePoGateRepositoryFingerprint(resolvePoGateRepositoryTopology(root)); } catch { fingerprint = null; }
  if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(fingerprint)) refuse("--root is not a readable git repository; the design binding is bound to the repository, run this step inside the project checkout");

  const dir = dirname(carrierPath) === "." ? "" : `${dirname(carrierPath)}/`;
  const manifestPath = `${dir}prospective-architecture.json`;
  const adrDirectory = join(root, "docs", "adr");
  if (!existsSync(adrDirectory)) refuse("docs/adr does not exist; create the proposals with create-adr.mjs first");
  const first = Number(nextFreeNumber(adrDirectory));
  if (first + slugs.length > 10000) refuse("no free four-digit ADR numbers remain");

  const files = new Map(), companions = new Set([carrierPath, manifestPath, selectionPath]), writes = [], rows = [], bound = [];
  const remember = (file) => { files.set(file.path, file); companions.add(file.path); return { path: file.path, sha256: file.sha256 }; };
  const origin = remember(selection.file);
  slugs.forEach((slug, index) => {
    const draftId = `draft-${slug}`, number = String(first + index).padStart(4, "0"), id = `${number}-${slug}`;
    for (const name of [`${id}.md`, `${id}.json`]) {
      if (existsSync(join(adrDirectory, name))) refuse(`docs/adr/${name} already exists: this proposal was already materialized. Create a new proposal with another slug instead`);
    }
    const markdown = readRegular(root, `docs/adr/${draftId}.md`), sidecar = readRegular(root, `docs/adr/${draftId}.json`);
    if (!markdown || !sidecar) refuse(`docs/adr/${draftId}.md and docs/adr/${draftId}.json must both exist; create the proposal with create-adr.mjs --slug ${slug} --title "<title>" first`);
    const proposed = parseJson(sidecar, "the proposal sidecar");
    if (!validateArchitectureDecisionSidecar(proposed) || proposed.id !== draftId || proposed.status !== "proposed") {
      refuse(`docs/adr/${draftId}.json is not a valid proposal for ${draftId} (status must be proposed)`);
    }
    if (PLACEHOLDER_LINE.test(markdown.text)) {
      refuse(`docs/adr/${draftId}.md still has REPLACE: lines from the template. Replace each one with the real text, run create-adr.mjs --root <root> --slug ${slug} --refresh to recompute the digest, then run this command again`);
    }
    if (proposed.digest !== markdown.sha256) refuse(`docs/adr/${draftId}.json carries a stale digest. Run create-adr.mjs --root <root> --slug ${slug} --refresh, then run this command again`);
    const own = selection.selections.filter((item) => item.adr === undefined || item.adr === slug).map(({ topic, text }) => ({ topic, text }));
    if (own.length === 0) refuse(`${selectionPath} holds no selection for ${slug}: add the PO's words for it (an entry with "adr": ${JSON.stringify(slug)}), then run this command again`);
    const choice = { schema: CHOICE_SCHEMA, id: draftId, decision: "selected", markdownSha256: markdown.sha256, sidecarSha256: sidecar.sha256,
      scope: proposed.scope, moduleIds: proposed.moduleIds ?? [], supersedes: proposed.supersedes ?? null, attributedTo: selection.attributedTo, origin, selections: own };
    const choicePath = `${dir}prospective-chat-selection-${slug}.json`;
    const choiceBytes = Buffer.from(prospectiveJson(choice), "utf8");
    const existingChoice = readRegular(root, choicePath);
    if (existingChoice && parseJson(existingChoice, "an existing binding file").schema !== CHOICE_SCHEMA) refuse(`${choicePath} exists and is not a binding file written by this step; move it away or use another carrier directory`);
    writes.push({ rel: choicePath, bytes: choiceBytes });
    const chatSelection = remember({ path: choicePath, bytes: choiceBytes, text: choiceBytes.toString("utf8"), sha256: sha256(choiceBytes) });
    const proposedMarkdown = remember(markdown), proposedSidecar = remember(sidecar);
    const { acceptedMarkdown, acceptedSidecar, acceptedChoice } = deriveAcceptedRecords({ id, proposed, markdownText: markdown.text, choice });
    const outputs = {
      markdown: { path: `docs/adr/${id}.md`, sha256: sha256(acceptedMarkdown) },
      sidecar: { path: `docs/adr/${id}.json`, sha256: sha256(prospectiveJson(acceptedSidecar)) },
      chatSelection: { path: `project/architecture-chat-selections/${id}.json`, sha256: sha256(prospectiveJson(acceptedChoice)) },
    };
    let predecessor = null;
    if (proposed.supersedes) {
      const historic = readRegular(root, `docs/adr/${proposed.supersedes}.md`, { required: true });
      if (!historic.text.startsWith(`# ADR-${proposed.supersedes.slice(0, 4)}:`)) refuse(`docs/adr/${proposed.supersedes}.md must start with "# ADR-${proposed.supersedes.slice(0, 4)}: <title>"`);
      const prior = readRegular(root, `docs/adr/${proposed.supersedes}.json`);
      let derived;
      try { derived = derivePredecessorSidecar({ supersedes: proposed.supersedes, historic, proposed, prior }); }
      catch (error) { return refuse(`docs/adr/${proposed.supersedes}.json cannot be superseded (${error.message}); only an accepted, valid record for ${proposed.supersedes} can be`); }
      if (prior && derived.preimageSha256 === null) refuse(`docs/adr/${proposed.supersedes}.json is already superseded; this proposal supersedes ${proposed.supersedes} again, pick the record that is still accepted`);
      predecessor = { markdown: remember(historic), sidecar: { path: `docs/adr/${proposed.supersedes}.json`, sha256: sha256(prospectiveJson(derived.record)) },
        ...(prior ? { sidecarPreimageSha256: derived.preimageSha256 } : {}) };
    }
    rows.push({ id, proposedMarkdown, proposedSidecar, chatSelection, predecessor, outputs });
    bound.push({ draft: slug, id, supersedes: proposed.supersedes ?? null });
  });

  const manifestBytes = Buffer.from(prospectiveJson({ schema: PROSPECTIVE_ARCHITECTURE_SCHEMA, decisions: rows }), "utf8");
  const existingManifest = readRegular(root, manifestPath);
  if (existingManifest && parseJson(existingManifest, "an existing binding file").schema !== PROSPECTIVE_ARCHITECTURE_SCHEMA) refuse(`${manifestPath} exists and is not a binding file written by this step; move it away or use another carrier directory`);
  writes.push({ rel: manifestPath, bytes: manifestBytes });
  const manifest = remember({ path: manifestPath, bytes: manifestBytes, text: manifestBytes.toString("utf8"), sha256: sha256(manifestBytes) });

  const descriptor = { schema: "pipeline.design-decision-bindings.v2", repositoryFingerprint: fingerprint, featureId: feature,
    architectureDecisions: existingBinding?.architectureDecisions ? structuredClone(existingBinding.architectureDecisions) : [],
    modelPolicy: existingBinding?.modelPolicy ? structuredClone(existingBinding.modelPolicy) : null, prospectiveArchitecture: manifest };
  const block = `\`\`\`pipeline-design-decision-bindings\n${prospectiveJson(descriptor)}\`\`\`\n`;
  const carrierText = carrier.text;
  const nextCarrier = BLOCK.test(carrierText) ? carrierText.replace(BLOCK, () => block) : `${carrierText}${carrierText.endsWith("\n") ? "" : "\n"}\n${block}`;
  const carrierBytes = Buffer.from(nextCarrier, "utf8");
  writes.push({ rel: carrierPath, bytes: carrierBytes });

  // The consumer's own check, run on exactly what is about to be written. The carrier is not an input of the manifest.
  const sourceRef = (path) => ({ path, sha256: "0".repeat(64) });
  const sources = { prd: sourceRef("dry-run/prd.md"), spec: sourceRef("dry-run/spec.md"),
    companions: [...companions].sort().map((path) => ({ path, sha256: path === carrierPath ? sha256(carrierBytes) : files.get(path).sha256 })) };
  try {
    inspectProspectiveArchitectureManifest({ manifest, sources, existing: (name) => readRegular(root, name),
      read: (name) => files.get(name) ?? refuse(`internal: ${name} is not among the bound inputs`) });
  } catch (error) {
    if (error instanceof Refusal) throw error;
    return refuse(`the generated binding was refused by the materialization check (${error.message}); nothing was written. Repair the named input and run this command again`);
  }

  commitAll(root, writes);
  const written = writes.map(({ rel }) => rel).sort();
  return { ok: true, bound, manifest: { path: manifestPath, sha256: manifest.sha256 }, carrier: carrierPath, written,
    companions: [...companions].sort(),
    next: "Stage and commit the written files together with the drafts; then create the design review receipt with design-review-receipt.mjs create and one --companion <path> for EVERY path in `companions` "
      + "(plus the other companions of the package), and continue with submit-plan, present-plan and approve-plan. "
      + "If a draft changes later, run create-adr.mjs --refresh and then this command again with the same arguments; it replaces its own files in place." };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const { values, drafts } = parseArgs(argv);
    const rootValue = values.get("--root");
    if (typeof rootValue !== "string" || !isAbsolute(rootValue) || !existsSync(rootValue) || !lstatSync(rootValue).isDirectory()) refuse("--root must be the absolute project root directory");
    console.log(JSON.stringify(bind(resolve(rootValue), values, drafts), null, 2));
    return 0;
  } catch (error) {
    if (!(error instanceof Refusal)) console.error(`bind-adr-proposals: ${error?.message ?? error}`);
    else console.error(`bind-adr-proposals refused: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
