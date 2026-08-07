#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Typed, confirmation-bound repair for a missing or stale local PO profile receipt,
 * and the project-side route for setting or correcting the operator-facing language.
 *
 * The language route exists because `language.human_facing` is the single
 * operator-facing language authority (operating-model.md, "language.human_facing
 * is the single human-facing language authority in the compiled runtime") and
 * ADR-0011 grants a private overlay exactly that configuration right. It runs
 * against `--root <project-root>`, so a PO reaches it from their own project's
 * primary checkout; it never touches the Public Core's English canon, which
 * ADR-0011 fixes and which is not a setting.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEGACY_MANIFEST,
  NEUTRAL_MANIFEST,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";
import {
  validatePoGateLanguageProjection,
  validatePoGateProfileForRepository,
} from "../lib/po-gate-authority.mjs";
import { publishPoGateProfileReceipt } from "../lib/po-gate-profile-publisher.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const PLAN_SCHEMA = "pipeline.po-gate-profile-repair-plan.v1";
const APPLY_SCHEMA = "pipeline.po-gate-profile-repair-apply.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const SCRIPT = fileURLToPath(import.meta.url);
const SUPPORTED_LANGUAGES = ["de", "en"];
// Closed grammar, mirroring the runtime projection's own locator: a two-space
// direct child of the top-level `language:` block, one of exactly two approved
// values, optionally quoted (the source YAML quotes it, the compiled manifest
// does not), with only trailing whitespace or a comment after it.
const HUMAN_FACING_SCALAR = /^(  human_facing:[ \t]*)(["']?)(de|en)\2([ \t]*(?:#[^\r\n]*)?)(\r?\n|$)/gmu;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonical(value) {
  return JSON.stringify(stable(value));
}

function physicalRoot(value) {
  const requested = resolve(value);
  const info = lstatSync(requested);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(requested) !== requested) {
    throw new Error("root is not a physical directory");
  }
  return requested;
}

function physicalRead(root, relativePath) {
  const target = resolve(root, relativePath);
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("authority path escapes the repository");
  }
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(target) !== target) {
    throw new Error("authority path is not a physical regular file");
  }
  return readFileSync(target, "utf8");
}

/**
 * Locate the single top-level `language:` block; refuse a duplicated or absent
 * one. Unlike the compiled runtime projection's locator this scans to the end of
 * the file rather than stopping at the first following top-level key: the input
 * here is a file a human may have hand-edited, so a second `language:` block is
 * an ambiguity to refuse, not a region to skip.
 */
function topLevelLanguageBlock(text) {
  const lines = text.split(/(?<=\n)/u);
  let offset = 0;
  let start = -1;
  let end = -1;
  for (const rawLine of lines) {
    const line = rawLine.replace(/[\r\n]+$/u, "");
    const topLevel = line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t") && !line.startsWith("#");
    if (line === "language:") {
      if (start !== -1) throw new Error("PO-PROFILE-LANGUAGE-BLOCK-AMBIGUOUS");
      start = offset;
    } else if (topLevel && start !== -1 && end === -1) {
      end = offset;
    }
    offset += rawLine.length;
  }
  if (start === -1) throw new Error("PO-PROFILE-LANGUAGE-BLOCK-MISSING");
  return { start, end: end === -1 ? text.length : end };
}

/**
 * Replace only the operator-facing language value, byte for byte. Indentation,
 * quoting style, trailing comments and line endings are preserved, and anything
 * the closed grammar cannot resolve to exactly one scalar is refused rather
 * than rewritten.
 */
function setHumanFacingLanguage(text, humanFacing) {
  if (!SUPPORTED_LANGUAGES.includes(humanFacing)) throw new Error("PO-PROFILE-LANGUAGE-UNSUPPORTED");
  const block = topLevelLanguageBlock(text);
  const matches = [...text.slice(block.start, block.end).matchAll(HUMAN_FACING_SCALAR)];
  if (matches.length !== 1) throw new Error("PO-PROFILE-LANGUAGE-SCALAR-AMBIGUOUS");
  const match = matches[0];
  const valueStart = block.start + match.index + match[1].length + match[2].length;
  return `${text.slice(0, valueStart)}${humanFacing}${text.slice(valueStart + match[3].length)}`;
}

function physicalTarget(root, relativePath) {
  const target = resolve(root, relativePath);
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("authority path escapes the repository");
  }
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(target) !== target) {
    throw new Error("authority path is not a physical regular file");
  }
  return { target, mode: info.mode & 0o777 };
}

/** Write the replacement bytes into a sibling temporary; publish nothing yet. */
function stageWrite(root, relativePath, text) {
  const { target, mode } = physicalTarget(root, relativePath);
  const temporary = join(dirname(target), `.${process.pid}.${randomUUID()}.tmp`);
  const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
  try {
    writeFileSync(descriptor, text);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(temporary, mode);
  return { temporary, target };
}

function discardStagedWrite(staged) {
  try {
    if (existsSync(staged.temporary)) unlinkSync(staged.temporary);
  } catch {
    // Best-effort cleanup of an unpublished temporary file.
  }
}

/**
 * Both files are fully written and fsynced before either rename, so the only
 * interruption window is between the two renames. That leaves an inconsistent
 * source/runtime pair, which the gate already detects as
 * PO-PROFILE-PROJECTION-INVALID and which re-running this command repairs --
 * the language route deliberately does not require a currently valid pair.
 */
function applyLanguageChange(root, sourceAfter, runtimePath, runtimeAfter) {
  const stagedSource = stageWrite(root, "pipeline.user.yaml", sourceAfter);
  let stagedRuntime;
  try {
    stagedRuntime = stageWrite(root, runtimePath, runtimeAfter);
  } catch (error) {
    discardStagedWrite(stagedSource);
    throw error;
  }
  try {
    renameSync(stagedSource.temporary, stagedSource.target);
  } catch (error) {
    discardStagedWrite(stagedSource);
    discardStagedWrite(stagedRuntime);
    throw error;
  }
  try {
    renameSync(stagedRuntime.temporary, stagedRuntime.target);
  } catch (error) {
    discardStagedWrite(stagedRuntime);
    throw error;
  }
}

function buildPlan(rootDir, humanFacing = null) {
  const root = physicalRoot(rootDir);
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  const manifest = authority.status === "ready"
    ? authority.manifest
    : (lstatSync(join(root, NEUTRAL_MANIFEST), { throwIfNoEntry: false })
      ? NEUTRAL_MANIFEST
      : LEGACY_MANIFEST);
  const source = physicalRead(root, "pipeline.user.yaml");
  const runtime = physicalRead(root, manifest);
  const projection = validatePoGateLanguageProjection(source, runtime);
  // Republication alone still demands a valid current pair. Setting the language
  // must not: correcting a half-edited pair is exactly what the PO needs it for.
  if (!projection.ok && humanFacing === null) throw new Error(projection.code);
  const current = validatePoGateProfileForRepository({ repoRoot: root });
  const payload = {
    schema: PLAN_SCHEMA,
    status: "ready",
    root,
    source: { path: "pipeline.user.yaml", sha256: sha256(source) },
    runtime: { path: manifest, sha256: sha256(runtime) },
    profile: {
      currentStatus: current.ok ? "current" : "repair-required",
      currentCode: current.code,
      humanFacing: projection.ok ? projection.humanFacing : null,
    },
  };
  let sourceAfter = source;
  let runtimeAfter = runtime;
  if (humanFacing !== null) {
    sourceAfter = setHumanFacingLanguage(source, humanFacing);
    runtimeAfter = setHumanFacingLanguage(runtime, humanFacing);
    const after = validatePoGateLanguageProjection(sourceAfter, runtimeAfter);
    if (!after.ok) throw new Error(after.code);
    payload.languageChange = {
      from: projection.ok ? projection.humanFacing : null,
      to: humanFacing,
      sourceSha256: sha256(sourceAfter),
      runtimeSha256: sha256(runtimeAfter),
    };
  }
  const planSha256 = sha256(canonical(payload));
  return {
    payload,
    planSha256,
    source: sourceAfter,
    runtime: runtimeAfter,
    manifest,
    changesLanguage: humanFacing !== null,
    action: {
      executable: process.execPath,
      argv: [
        SCRIPT,
        "apply",
        "--root",
        root,
        ...(humanFacing === null ? [] : ["--human-facing", humanFacing]),
        "--plan-sha256",
        planSha256,
        "--activate",
      ],
      mutation: true,
      requiresConfirmation: true,
      requiresHostBoundary: true,
    },
  };
}

function parse(argv) {
  if (!["plan", "apply"].includes(argv[0])) return null;
  const result = { command: argv[0], activate: false, humanFacing: null };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root" && argv[index + 1]) result.root = argv[++index];
    else if (token === "--plan-sha256" && argv[index + 1]) result.planSha256 = argv[++index];
    else if (token === "--human-facing" && SUPPORTED_LANGUAGES.includes(argv[index + 1])) result.humanFacing = argv[++index];
    else if (token === "--activate") result.activate = true;
    else return null;
  }
  if (!result.root) return null;
  if (result.command === "plan" && (result.planSha256 || result.activate)) return null;
  if (result.command === "apply"
    && (!SHA256.test(result.planSha256 ?? "") || result.activate !== true)) return null;
  return result;
}

export function main(argv = process.argv.slice(2), write = process.stdout.write.bind(process.stdout)) {
  const options = parse(argv);
  if (!options) {
    write("usage: <plan|apply> --root <project-root> [--human-facing <de|en>] [--plan-sha256 <sha256> --activate]\n");
    return 64;
  }
  let plan;
  try {
    plan = buildPlan(options.root, options.humanFacing);
  } catch (error) {
    write(`${JSON.stringify({ schema: PLAN_SCHEMA, status: "unavailable", code: error.message })}\n`);
    return 2;
  }
  if (options.command === "plan") {
    write(`${JSON.stringify({ ...plan.payload, planSha256: plan.planSha256, applyAction: plan.action }, null, 2)}\n`);
    return 0;
  }
  if (options.planSha256 !== plan.planSha256) {
    write(`${JSON.stringify({ schema: APPLY_SCHEMA, status: "rejected", code: "PO-PROFILE-REPAIR-PLAN-STALE" })}\n`);
    return 2;
  }
  if (plan.changesLanguage) {
    try {
      applyLanguageChange(plan.payload.root, plan.source, plan.manifest, plan.runtime);
    } catch {
      write(`${JSON.stringify({ schema: APPLY_SCHEMA, status: "unavailable", code: "PO-PROFILE-LANGUAGE-WRITE-FAILED" })}\n`);
      return 2;
    }
  }
  const published = publishPoGateProfileReceipt({
    rootDir: plan.payload.root,
    userYamlText: plan.source,
    runtimeYamlText: plan.runtime,
  });
  const readback = published.ok
    ? validatePoGateProfileForRepository({ repoRoot: plan.payload.root })
    : null;
  const applied = published.ok && readback?.ok === true;
  write(`${JSON.stringify({
    schema: APPLY_SCHEMA,
    status: applied ? "applied" : "unavailable",
    code: applied ? "PO-PROFILE-REPAIR-APPLIED" : published.code,
    planSha256: plan.planSha256,
    ...(plan.changesLanguage ? { humanFacing: plan.payload.languageChange.to } : {}),
  }, null, 2)}\n`);
  return applied ? 0 : 2;
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main();
