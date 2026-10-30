// SPDX-License-Identifier: SUL-1.0
/**
 * Host declaration carrier for the system instruction directories a runner ships (AC-147 catalog half, AC-209; PO decision D210).
 *
 * WHY IT EXISTS. D96/D108 already admit a single read of any non-credential file outside the repository, so reading one declared
 * instruction file needs no authority. What stays refused is a recursive search or listing over the runner's skill collection
 * (D108): the collection holds other sessions' and other skills' content. This carrier is the narrow, authenticated exception: a
 * runner-neutral private record that names the instruction directories THE HOST declared, so a bounded search inside exactly one of
 * them can be admitted while the collection, its parents and every undeclared sibling keep the D108 refusal.
 *
 * CUSTODY. One record per runner under `<git-common-dir>/agent-pipeline/host-skill-catalog/<runner>.json`: private state (mode
 * 0600, single link, physical directory), never a tracked file. It is WRITTEN ONLY by a host readback (the bootstrap preflight,
 * `writeHostSkillCatalog`) and READ by the passive read policy (`declaredSkillDirectories`). The policy never trusts the record
 * alone, see below.
 *
 * WHAT THE READER VERIFIES (every one of these fails closed to "no entry", i.e. exactly the D108 behaviour):
 *   - the record is bounded, has exactly the typed keys and its `seal` equals the digest of its own canonical body (a hand-edited
 *     or forged record is ignored and reported, `HSC-SEAL-MISMATCH`);
 *   - each entry names `<home>/<runner declaration root>/<name>/<instruction file>` and its physical resolution equals the
 *     recorded path (so an entry cannot point anywhere else, alias or link out of the declaration root);
 *   - the current file digest equals the recorded one; a replaced or edited file invalidates its entry until the next host
 *     readback re-observes it (`HSC-DRIFT`).
 * A runner without a declaration surface answers `unavailable`; nothing is written and the guard behaves exactly as before.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { assertPrivateRegularFile, writePrivateFileAtomic } from "./private-boundary.mjs";
import { resolveGitCommonDir } from "./po-key-directory.mjs";

export const HOST_SKILL_CATALOG_SCHEMA = "pipeline.host-skill-catalog.v1";
export const HOST_SKILL_CATALOG_READBACK_SCHEMA = "pipeline.host-skill-catalog-readback.v1";

/**
 * Where each runner declares its system instruction directories, relative to the home directory. A runner with no entry exposes no
 * declaration this carrier can observe: its readback is `unavailable` and nothing is admitted. Claude and Antigravity are
 * deliberately absent today; adding one is one line here, the module is shared by all three runners.
 */
export const HOST_SKILL_DECLARATION_SURFACES = Object.freeze({
  codex: Object.freeze({ homeRelativeRoot: ".codex/skills/.system" }),
});
export const HOST_SKILL_CATALOG_RUNNERS = Object.freeze(["claude", "codex", "antigravity"]);

const INSTRUCTION_FILE = "SKILL.md";
const STORE_DIRECTORY = join("agent-pipeline", "host-skill-catalog");
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_ENTRIES = 64;
const MAX_FILE_BYTES = 1024 * 1024;
const RECORD_KEYS = ["schema", "runner", "entries", "seal"];
const ENTRY_KEYS = ["name", "path", "sha256", "runner", "observedAt"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sealOf = (runner, entries) => sha256(canonical({ schema: HOST_SKILL_CATALOG_SCHEMA, runner, entries }));

/** The digest a record must carry as its own seal; exported so a test can build a deliberately re-sealed forgery. */
export const hostSkillCatalogSeal = sealOf;
/** The private record file for `runner` under a repository's git common directory (tests and diagnostics only). */
export const hostSkillCatalogRecordPath = (gitCommonDir, runner) => join(gitCommonDir, STORE_DIRECTORY, `${runner}.json`);

function within(root, path) {
  const part = relative(root, path);
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

const unavailable = (runner, code) => ({ schema: HOST_SKILL_CATALOG_READBACK_SCHEMA, status: "unavailable", runner, code, entries: 0 });

function privateStore(rootDir, dependencies) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)) return null;
  const common = resolveGitCommonDir(rootDir, dependencies);
  return typeof common === "string" ? join(common, STORE_DIRECTORY) : null;
}

function recordPath(directory, runner) { return join(directory, `${runner}.json`); }

function fileDigest(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) return null;
  return sha256(readFileSync(path));
}

/**
 * What the host declares for `runner` right now: every `<name>/<instruction file>` under the runner's declaration root, as a
 * plain file whose physical path stays inside the physical declaration root. Unavailable when the runner has no declaration surface.
 */
export function observeDeclaredSystemSkills({ runner, homeDir = homedir() } = {}) {
  const surface = HOST_SKILL_DECLARATION_SURFACES[runner];
  if (surface === undefined) return { status: "unavailable", code: "HSC-NO-DECLARATION-SURFACE" };
  if (typeof homeDir !== "string" || !isAbsolute(homeDir)) return { status: "unavailable", code: "HSC-HOME" };
  let physicalRoot;
  try { physicalRoot = realpathSync(join(resolve(homeDir), surface.homeRelativeRoot)); }
  catch { return { status: "unavailable", code: "HSC-DECLARATION-ROOT-ABSENT" }; }
  const skills = [];
  try {
    for (const entry of readdirSync(physicalRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !NAME.test(entry.name)) continue;
      const path = join(physicalRoot, entry.name, INSTRUCTION_FILE);
      try {
        const physical = realpathSync(path);
        const digest = physical === path && within(physicalRoot, physical) ? fileDigest(path) : null;
        if (digest !== null) skills.push({ name: entry.name, path, sha256: digest });
      } catch { /* an unreadable or missing instruction file is simply not declared */ }
      if (skills.length > MAX_ENTRIES) return { status: "unavailable", code: "HSC-TOO-MANY-ENTRIES" };
    }
  } catch { return { status: "unavailable", code: "HSC-DECLARATION-ROOT-UNREADABLE" }; }
  skills.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { status: "available", skills };
}

/** One entry against the CURRENT filesystem. `{ ok: true, directory, lexicalDirectory }` or `{ ok: false, code }`. */
function checkEntry(entry, runner, homeDir) {
  const surface = HOST_SKILL_DECLARATION_SURFACES[runner];
  if (surface === undefined || !exactKeys(entry, ENTRY_KEYS) || entry.runner !== runner
    || typeof entry.name !== "string" || !NAME.test(entry.name) || typeof entry.path !== "string" || !isAbsolute(entry.path)
    || typeof entry.sha256 !== "string" || !DIGEST.test(entry.sha256)
    || typeof entry.observedAt !== "string" || entry.observedAt === "") return { ok: false, code: "HSC-ENTRY-SHAPE" };
  const lexical = join(resolve(homeDir), surface.homeRelativeRoot, entry.name, INSTRUCTION_FILE);
  let physical;
  let physicalRoot;
  try {
    physical = realpathSync(lexical);
    physicalRoot = realpathSync(join(resolve(homeDir), surface.homeRelativeRoot));
  } catch { return { ok: false, code: "HSC-ENTRY-MISSING" }; }
  if (entry.path !== physical || !within(physicalRoot, physical) || dirname(dirname(physical)) !== physicalRoot) {
    return { ok: false, code: "HSC-ENTRY-OUTSIDE-SURFACE" };
  }
  let digest;
  try { digest = fileDigest(physical); } catch { return { ok: false, code: "HSC-ENTRY-MISSING" }; }
  if (digest === null) return { ok: false, code: "HSC-ENTRY-NOT-A-PLAIN-FILE" };
  if (digest !== entry.sha256) return { ok: false, code: "HSC-DRIFT" };
  return { ok: true, directory: dirname(physical), lexicalDirectory: dirname(lexical) };
}

/** The record at `path`: `{ state: "absent" }`, `{ state: "invalid", code }` or `{ state: "valid", record }`. */
function readRecord(path, runner) {
  if (!existsSync(path)) return { state: "absent" };
  let text;
  try {
    const info = assertPrivateRegularFile(path, "host skill catalog record");
    if (info.size < 1 || info.size > MAX_RECORD_BYTES) return { state: "invalid", code: "HSC-RECORD-SIZE" };
    text = readFileSync(path, "utf8");
  } catch { return { state: "invalid", code: "HSC-RECORD-CUSTODY" }; }
  let record;
  try { record = JSON.parse(text); } catch { return { state: "invalid", code: "HSC-RECORD-MALFORMED" }; }
  if (!exactKeys(record, RECORD_KEYS) || record.schema !== HOST_SKILL_CATALOG_SCHEMA || record.runner !== runner
    || !Array.isArray(record.entries) || record.entries.length > MAX_ENTRIES || typeof record.seal !== "string") {
    return { state: "invalid", code: "HSC-RECORD-SHAPE" };
  }
  if (record.seal !== sealOf(runner, record.entries)) return { state: "invalid", code: "HSC-SEAL-MISMATCH" };
  return { state: "valid", record };
}

/**
 * The reader the passive read policy calls. Verifies every record and entry against the current filesystem and returns only the
 * entries that are valid NOW. Never throws; any failure yields fewer (or no) entries, never a wider read scope.
 */
export function readHostSkillCatalog({ rootDir, homeDir = homedir(), dependencies = {} } = {}) {
  const directory = privateStore(rootDir, dependencies);
  if (directory === null) return { status: "unavailable", code: "HSC-NO-REPOSITORY", entries: [], problems: [] };
  const entries = [];
  const problems = [];
  let seen = 0;
  for (const runner of HOST_SKILL_CATALOG_RUNNERS) {
    if (HOST_SKILL_DECLARATION_SURFACES[runner] === undefined) continue;
    const read = readRecord(recordPath(directory, runner), runner);
    if (read.state === "absent") continue;
    seen += 1;
    if (read.state === "invalid") { problems.push({ runner, code: read.code }); continue; }
    for (const entry of read.record.entries) {
      let checked;
      try { checked = checkEntry(entry, runner, homeDir); } catch { checked = { ok: false, code: "HSC-ENTRY-SHAPE" }; }
      if (checked.ok) entries.push({ name: entry.name, runner, directory: checked.directory, lexicalDirectory: checked.lexicalDirectory });
      else problems.push({ runner, name: typeof entry?.name === "string" ? entry.name : null, code: checked.code });
    }
  }
  if (seen === 0) return { status: "absent", entries: [], problems };
  return { status: entries.length > 0 ? "valid" : "ignored", entries, problems };
}

/** The declared instruction directories valid right now: `[{ name, runner, directory, lexicalDirectory }]`. */
export function declaredSkillDirectories({ rootDir, homeDir } = {}) {
  return readHostSkillCatalog({ rootDir, homeDir }).entries;
}

/**
 * Host readback: observe what `runner` declares and publish it as the sealed private record. `written` when the record changed,
 * `unchanged` when the current observation equals it, `unavailable` (with a typed code) when the runner exposes no declaration,
 * the repository private store cannot be resolved, or the write failed. An invalid existing record (forged, hand-edited,
 * malformed) is replaced and reported in `replacedInvalid`.
 */
export function writeHostSkillCatalog({
  rootDir, runner, homeDir = homedir(), now = () => new Date().toISOString(), dependencies = {},
} = {}) {
  if (!HOST_SKILL_CATALOG_RUNNERS.includes(runner)) return unavailable(String(runner), "HSC-RUNNER");
  const observed = observeDeclaredSystemSkills({ runner, homeDir });
  if (observed.status !== "available") return unavailable(runner, observed.code);
  const directory = privateStore(rootDir, dependencies);
  if (directory === null) return unavailable(runner, "HSC-NO-REPOSITORY");
  const path = recordPath(directory, runner);
  const existing = readRecord(path, runner);
  const previous = new Map(existing.state === "valid" ? existing.record.entries.map((entry) => [`${entry.name}\0${entry.path}\0${entry.sha256}`, entry]) : []);
  const stamp = now();
  const entries = observed.skills.map((skill) => previous.get(`${skill.name}\0${skill.path}\0${skill.sha256}`)
    ?? { name: skill.name, path: skill.path, sha256: skill.sha256, runner, observedAt: stamp });
  const record = { schema: HOST_SKILL_CATALOG_SCHEMA, runner, entries, seal: sealOf(runner, entries) };
  const base = { schema: HOST_SKILL_CATALOG_READBACK_SCHEMA, runner, entries: entries.length };
  if (existing.state === "valid" && existing.record.seal === record.seal) return { ...base, status: "unchanged" };
  try {
    // writePrivateFileAtomic asserts custody of an EXISTING file first, so a record that fails custody (loose mode, extra link,
    // a symlink) could never be replaced. It is our own record inside the private store: remove that one path, then publish.
    if (existing.state === "invalid" && existing.code === "HSC-RECORD-CUSTODY") rmSync(path, { force: true });
    writePrivateFileAtomic(path, `${JSON.stringify(record, null, 2)}\n`);
  } catch { return unavailable(runner, "HSC-WRITE-FAILED"); }
  return { ...base, status: "written", ...(existing.state === "invalid" ? { replacedInvalid: existing.code } : {}) };
}
