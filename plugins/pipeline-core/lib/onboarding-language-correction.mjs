// SPDX-License-Identifier: SUL-1.0

/**
 * NVA-R5-LANGWIRE: the PO-answered-language correction, extracted so both
 * `project-onboarding-v3.mjs` (the legacy kickoff/kickoff-promotion wrapper,
 * its original and still-only home before this task) and
 * `onboarding-continuity.mjs` (the coordinator-sourced `bootstrap-bind-apply`
 * flow, wired in by this task) can call the SAME correction rather than
 * diverging copies. This module is a deliberate leaf: it imports only from
 * modules neither of those two files depends on the other for
 * (`yaml-lite.mjs`, `runner-profiles-v3.mjs`, `po-gate-authority.mjs`,
 * `project-authority.mjs`), and it is imported BY both -- never the other
 * direction -- so it adds no cycle to the existing one-way
 * project-onboarding-v3.mjs -> onboarding-continuity.mjs dependency.
 *
 * The small file-identity/YAML-rendering helpers below are deliberate,
 * narrow duplicates of the equivalent helpers already local to
 * `project-onboarding-v3.mjs` (that file keeps its own copies, used at many
 * other call sites unrelated to this correction; duplicating a small,
 * self-contained helper across modules is the existing convention in this
 * codebase -- `safePath` alone is already duplicated in half a dozen files
 * here). Only the two correction functions themselves move; nothing else in
 * either caller's behaviour changes.
 */
import { parseYaml } from "./yaml-lite.mjs";
import { validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { poGateProfileProjectionPaths } from "./po-gate-authority.mjs";
import { NEUTRAL_MANIFEST } from "./project-authority.mjs";

const SOURCE = "pipeline.user.yaml";
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;

function safePath(root, relative, fs) {
  if (!SAFE_RELATIVE.test(relative)) throw new Error(`unsafe project-relative path: ${relative}`);
  const target = `${root}/${relative}`;
  let cursor = root;
  for (const part of relative.split("/")) {
    cursor = `${cursor}/${part}`;
    if (!fs.existsSync(cursor)) break;
    const info = fs.lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error(`project path contains a symbolic link: ${relative}`);
    if (cursor !== target && !info.isDirectory()) throw new Error(`project path has a non-directory parent: ${relative}`);
  }
  return target;
}

function renderScalar(value) {
  if (typeof value === "string") return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e");
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  throw new Error("unsupported V3 YAML scalar");
}
function renderYaml(value, indent = "") {
  if (Array.isArray(value)) return value.map((item) => (item && typeof item === "object")
    ? `${indent}-\n${renderYaml(item, `${indent}  `)}` : `${indent}- ${renderScalar(item)}\n`).join("");
  return Object.keys(value).sort().map((key) => {
    const child = value[key];
    return child && typeof child === "object" ? `${indent}${key}:\n${renderYaml(child, `${indent}  `)}` : `${indent}${key}: ${renderScalar(child)}\n`;
  }).join("");
}

function bytesOf(value) { return Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8"); }

function fileIdentity(info) {
  return info && !info.isSymbolicLink() && info.isFile() && info.nlink === 1
    ? { dev: String(info.dev), ino: String(info.ino) }
    : null;
}

function sameIdentity(expected, path, fs) {
  try {
    const actual = fs.lstatSync(path);
    return !actual.isSymbolicLink()
      && actual.isFile()
      && actual.nlink === 1
      && String(actual.dev) === expected.dev
      && String(actual.ino) === expected.ino;
  } catch {
    return false;
  }
}

// A physical-file-identity-bound read, deliberately byte-identical to
// project-onboarding-v3.mjs's own `readBoundPhysicalFile` (its own ~15 call
// sites there are untouched by this extraction; this is a separate copy for
// the two correction functions below, which are the only callers here).
function readBoundPhysicalFile(path, fs, { optional = false } = {}) {
  let fd;
  try {
    let before;
    try { before = fileIdentity(fs.lstatSync(path)); } catch (error) {
      if (optional && error?.code === "ENOENT") return null;
      throw error;
    }
    if (!before) throw new Error("project file is not a single-link physical file");
    fd = fs.openSync(path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const opened = fileIdentity(fs.fstatSync(fd));
    if (!opened || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error("project file identity changed before read");
    }
    const bytes = fs.readFileSync(fd);
    const after = fileIdentity(fs.fstatSync(fd));
    if (!after || after.dev !== opened.dev || after.ino !== opened.ino || !sameIdentity(opened, path, fs)) {
      throw new Error("project file identity changed during read");
    }
    return bytesOf(bytes);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function seededManifestLanguageBlock(language) {
  return `language:\n  human_facing: ${language}\n`;
}

// Verbatim move of project-onboarding-v3.mjs's `correctSeededKickoffLanguage`
// (its own comment, unchanged): corrects the seeded `pipeline.user.yaml` and
// both runtime-manifest tiers' operator-facing language marker after the PO's
// real kickoff answer diverges from the fresh-seed default -- fails closed
// rather than rewriting anything unrecognized.
export function correctSeededKickoffLanguage(root, resolvedLanguage, fs) {
  const sourcePath = safePath(root, SOURCE, fs);
  const intent = parseYaml(fs.readFileSync(sourcePath, "utf8"));
  const seededLanguage = intent?.language?.human_facing;
  if (seededLanguage === resolvedLanguage) return false;
  const correctedIntent = { ...intent, language: { ...intent.language, human_facing: resolvedLanguage } };
  if (!validatePipelineUserV3(correctedIntent).ok) throw new Error("kickoff language correction produced an invalid V3 source");
  fs.writeFileSync(sourcePath, renderYaml(correctedIntent), { encoding: "utf8", mode: 0o600 });
  const before = seededManifestLanguageBlock(seededLanguage);
  const after = seededManifestLanguageBlock(resolvedLanguage);
  for (const relative of [".claude/pipeline.yaml", NEUTRAL_MANIFEST]) {
    const target = safePath(root, relative, fs);
    const bytes = fs.readFileSync(target, "utf8");
    const start = bytes.indexOf(before);
    if (start === -1 || bytes.indexOf(before, start + 1) !== -1) throw new Error(`kickoff language correction: ${relative} is not the expected fresh-seed shape`);
    fs.writeFileSync(target, bytes.slice(0, start) + after + bytes.slice(start + before.length), { encoding: "utf8", mode: 0o600 });
  }
  return true;
}

// Verbatim move of project-onboarding-v3.mjs's `correctPromotedLanguage` (its
// own comment, unchanged): the promotion-time counterpart above -- see that
// function's comment for why a second call site exists. Only an
// operator-facing `{de, en}` marker is corrected here: a third, non-{de,en}
// promoted-document language is the OTHER legitimate axis kickoff-design.md
// documents (a document-only language, tracked separately as
// `continuity.runtime.documentLanguage`, per `onboarding-continuity.mjs`),
// and is deliberately left alone by this function exactly as it already is
// by the promotion transaction's own `continuity.runtime` update. THIS EARLY
// RETURN IS THE TWO-AXIS SPLIT NVA-R5-LANGWIRE'S BRIEFING NAMES AS ALREADY
// CORRECT -- it is preserved verbatim, unmodified, from its original home.
// The PO profile receipt is republished (not re-initialized: kickoff already
// published one) so a live re-read of the just-corrected manifest does not
// itself turn into a PO-PROFILE-RECEIPT-STALE refusal.
export function correctPromotedLanguage(root, resolvedLanguage, fs) {
  if (resolvedLanguage !== "de" && resolvedLanguage !== "en") return;
  const changed = correctSeededKickoffLanguage(root, resolvedLanguage, fs);
  if (!changed) return;
  const projection = poGateProfileProjectionPaths(root);
  const sourceBytes = readBoundPhysicalFile(safePath(root, projection.source, fs), fs);
  const runtimeBytes = readBoundPhysicalFile(safePath(root, projection.manifest, fs), fs);
  const republished = fs.publishPoGateProfileReceipt({
    rootDir: root,
    userYamlText: sourceBytes,
    runtimeYamlText: runtimeBytes,
  });
  if (!republished?.ok) {
    throw new Error(`promotion language correction failed to republish the PO profile receipt (${republished?.code ?? "unavailable"})`);
  }
}
