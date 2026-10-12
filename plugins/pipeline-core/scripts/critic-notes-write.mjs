#!/usr/bin/env node
// Source-owned, dispatch-bound Critic notes writer (AC-143 / PO decision AC-144 option (a)).
//
// A Critic has no Write tool outside its notes route and the closed shell grammar admits neither `openssl`
// nor a bare `mkdir`. This script replaces the "openssl rand -hex 4" instruction: it draws the directory
// suffix from node:crypto, creates the directory exclusively (non-recursive mkdir, EEXIST is a collision, never
// adopted), and creates/appends `critic-notes.md` inside it. It never reads a sibling directory.
//
//   create --root <repo> [--codename <name>]   -> prints {"dir","notes"} (repo-relative, forward slashes)
//   append --root <repo> --dir <scratch/dispatch/critic-...> --text <text>
import { randomBytes } from "node:crypto";
import { appendFileSync, lstatSync, mkdirSync, openSync, closeSync, realpathSync } from "node:fs";
import { resolve, sep, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const DISPATCH_PARENT = "scratch/dispatch";
export const NOTES_FILE = "critic-notes.md";
export const SUFFIX_BYTES = 4; // 8 hex characters, the template's stated minimum
const CODENAME_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;
const DIR_RE = /^scratch\/dispatch\/critic-(?:[a-z0-9][a-z0-9-]{0,30}-)?[0-9a-f]{8,}$/;
export const MAX_TEXT_BYTES = 64 * 1024;
const MAX_ATTEMPTS = 8;

export class NotesWriterError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function fail(code, message) {
  throw new NotesWriterError(code, message);
}

function lstatOrNull(p) {
  try {
    return lstatSync(p);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

/** Ensure scratch/dispatch exists as real directories (no symlinks) under the root. */
function ensureParent(root) {
  let current = root;
  for (const part of DISPATCH_PARENT.split("/")) {
    current = resolve(current, part);
    const st = lstatOrNull(current);
    if (!st) {
      mkdirSync(current, { mode: 0o700 });
    } else if (st.isSymbolicLink() || !st.isDirectory()) {
      fail("CNW-UNSAFE-PARENT", `${part} is not a real directory`);
    }
  }
  const real = realpathSync(current);
  const realRoot = realpathSync(root);
  if (real !== resolve(realRoot, ...DISPATCH_PARENT.split("/"))) {
    fail("CNW-UNSAFE-PARENT", "scratch/dispatch resolves outside the root");
  }
  return current;
}

/** Draw the random suffix. Injectable for collision tests; production always uses node:crypto. */
export function drawSuffix(draw = randomBytes) {
  return draw(SUFFIX_BYTES).toString("hex");
}

export function createNotesDir({ root, codename, draw = randomBytes } = {}) {
  if (!root || !isAbsolute(root)) fail("CNW-ROOT", "--root must be an absolute path");
  if (codename !== undefined && !CODENAME_RE.test(codename)) fail("CNW-CODENAME", "codename must match [a-z0-9-]{1,31}");
  const parent = ensureParent(root);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const name = `critic-${codename ? `${codename}-` : ""}${drawSuffix(draw)}`;
    const dir = resolve(parent, name);
    try {
      mkdirSync(dir, { mode: 0o700 }); // non-recursive: EEXIST means a collision, never adopt
    } catch (error) {
      if (error && error.code === "EEXIST") continue;
      throw error;
    }
    const fd = openSync(resolve(dir, NOTES_FILE), "wx", 0o600);
    closeSync(fd);
    return { dir: `${DISPATCH_PARENT}/${name}`, notes: `${DISPATCH_PARENT}/${name}/${NOTES_FILE}` };
  }
  return fail("CNW-COLLISION", `no unused directory name after ${MAX_ATTEMPTS} draws`);
}

export function appendNotes({ root, dir, text } = {}) {
  if (!root || !isAbsolute(root)) fail("CNW-ROOT", "--root must be an absolute path");
  if (typeof dir !== "string" || !DIR_RE.test(dir)) fail("CNW-DIR", "dir must be scratch/dispatch/critic-<...>-<hex>");
  if (typeof text !== "string" || text.length === 0) fail("CNW-TEXT", "--text is required");
  if (Buffer.byteLength(text) > MAX_TEXT_BYTES) fail("CNW-TEXT", `text exceeds ${MAX_TEXT_BYTES} bytes`);
  const abs = resolve(root, ...dir.split("/"));
  const st = lstatOrNull(abs);
  if (!st || st.isSymbolicLink() || !st.isDirectory()) fail("CNW-DIR", "dir is not an existing real directory");
  const realDir = realpathSync(abs);
  const rel = relative(realpathSync(root), realDir).split(sep).join("/");
  if (rel !== dir) fail("CNW-DIR", "dir resolves outside its declared location");
  const file = resolve(abs, NOTES_FILE);
  const fst = lstatOrNull(file);
  if (!fst) fail("CNW-NOTES-MISSING", "notes file was not created by this writer's create step");
  if (fst.isSymbolicLink() || !fst.isFile()) fail("CNW-UNSAFE-NOTES", "notes file is not a regular file");
  appendFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
  return { notes: `${dir}/${NOTES_FILE}`, bytes: Buffer.byteLength(text) };
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!/^--[a-z-]+$/.test(key) || i + 1 >= argv.length) fail("CNW-ARGS", `bad argument ${key}`);
    flags[key.slice(2)] = argv[i + 1];
  }
  return flags;
}

export function main(argv, out = process.stdout) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  let result;
  if (command === "create") result = createNotesDir({ root: flags.root, codename: flags.codename });
  else if (command === "append") result = appendNotes({ root: flags.root, dir: flags.dir, text: flags.text });
  else fail("CNW-ARGS", "usage: create|append");
  out.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exit(error instanceof NotesWriterError ? 2 : 1);
  }
}
