#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * authority-restore.mjs -- the typed self-revert for an edited, bound authority document
 * (PO decision D31 under AC-115, confirmed D137; backlog
 * 2026-10-21-a-stale-plan-invalidation-reopens-the-authority-edit-lock.md).
 *
 * An approved PRD/Spec is bound by digest in Pipeline State (`continuity.authority.prd|spec.sha256`).
 * An edit that reaches the working tree anyway drifts the file out from under that binding and the
 * session drops out of readiness. This script restores the exact approved bytes, so the approval is
 * valid again without a new design review. It never writes Pipeline State and never touches
 * anything but the edited bound documents.
 *
 *   inspect --root <root> [--commit <rev>]   read-only: per bound document, approved/working/source digests
 *   restore --root <root> [--commit <rev>]   restore every edited bound document, all or none
 *
 * The bytes come from git (`HEAD` by default, or the commit named by --commit) and are written only
 * when their sha256 equals the approved digest. Any refusal carries one repair and writes nothing.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { boundAuthorityDocumentPath } from "../lib/guard/denial-route.mjs";

export const AUTHORITY_RESTORE_SCHEMA = "pipeline.authority-restore.v1";
const SHA256_RE = /^[a-f0-9]{64}$/u;
const REV_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const STATE_PATHS = [join(".claude", "pipeline-state.json"), join("project", "pipeline-state.json")];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function refusal(code, message, repair) {
  return { ok: false, schema: AUTHORITY_RESTORE_SCHEMA, status: "refused", code, message, repair, written: [] };
}

function readState(root) {
  for (const rel of STATE_PATHS) {
    let raw;
    try { raw = readFileSync(join(root, rel), "utf8"); } catch { continue; }
    try {
      const state = JSON.parse(raw);
      return state !== null && typeof state === "object" && !Array.isArray(state) ? state : null;
    } catch { return null; }
  }
  return null;
}

function safeRelativePath(root, value) {
  if (typeof value !== "string" || value === "" || isAbsolute(value) || /[\x00-\x1f\x7f\\]/u.test(value)) return null;
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return { rel: rel.split(/[\\/]/u).join("/"), absolute };
}

function workingBytes(absolute) {
  try {
    if (lstatSync(absolute).isSymbolicLink()) return { symlink: true };
    return { bytes: readFileSync(absolute) };
  } catch { return { missing: true }; }
}

function committedBytes(root, rev, rel) {
  const result = spawnSync("git", ["-C", root, "cat-file", "blob", `${rev}:${rel}`], { maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

/** Read-only plan: what is bound, what is edited, and whether the approved bytes can be restored. */
export function planAuthorityRestore(root, { commit = "HEAD" } = {}) {
  const state = readState(root);
  const authority = state?.continuity?.authority;
  const entries = [["prd", authority?.prd], ["spec", authority?.spec]];
  if (state === null || entries.some(([, e]) => typeof e?.path !== "string" || !SHA256_RE.test(e?.sha256 ?? ""))) {
    return refusal("AUTHORITY-RESTORE-NOT-BOUND",
      "Pipeline State records no approved PRD/Spec digest pair, so there are no approved bytes to restore.",
      "Nothing to restore here. If the documents are being designed, edit them normally; otherwise run `inspect` of pipeline-state.mjs.");
  }
  const documents = [];
  for (const [kind, entry] of entries) {
    const target = safeRelativePath(root, entry.path);
    if (target === null || boundAuthorityDocumentPath(root, target.absolute) === null) {
      return refusal("AUTHORITY-RESTORE-NOT-BOUND",
        `The ${kind} (${entry.path}) is not a currently bound, approved authority document (design is open or an invalidation is newer than the approval).`,
        "The document is editable through the design route; restore applies only while the approval is current.");
    }
    const approved = entry.sha256;
    // A recorded approval binding must agree with the continuity digest; a disagreement means State itself is the problem.
    const gate = state.planApproval?.poGateAuthority;
    const gateDigest = kind === "prd" ? gate?.planSha256 : gate?.specSha256;
    if (typeof gateDigest === "string" && gateDigest !== approved) {
      return refusal("AUTHORITY-RESTORE-STATE-INCONSISTENT",
        `The approval binding (${gateDigest}) and the continuity digest (${approved}) of the ${kind} disagree.`,
        "Run `inspect` of pipeline-state.mjs and follow its named PO-authority route; restoring bytes cannot repair a disagreeing binding.");
    }
    const working = workingBytes(target.absolute);
    if (working.symlink) {
      return refusal("AUTHORITY-RESTORE-UNSAFE-TARGET", `${target.rel} is a symbolic link.`,
        "Replace the link with a regular file by hand, then run inspect again.");
    }
    const workingDigest = working.bytes === undefined ? null : sha256(working.bytes);
    const edited = workingDigest !== approved;
    const source = edited ? committedBytes(root, commit, target.rel) : null;
    documents.push({
      kind, path: target.rel, absolute: target.absolute, approvedSha256: approved, workingSha256: workingDigest, edited,
      sourceRev: commit, sourceSha256: source === null ? null : sha256(source), sourceBytes: source,
    });
  }
  const edited = documents.filter((d) => d.edited);
  if (edited.length === 0) {
    return refusal("AUTHORITY-RESTORE-NOTHING-EDITED",
      "Every bound document already matches its approved digest; there is nothing to restore.",
      "No action needed. To change an approved document, use the design route (`reopen-design`).");
  }
  const bad = edited.find((d) => d.sourceSha256 !== d.approvedSha256);
  if (bad !== undefined) {
    return refusal("AUTHORITY-RESTORE-SOURCE-MISMATCH",
      `The bytes of ${bad.path} at ${commit} ${bad.sourceSha256 === null ? "cannot be read" : `hash to ${bad.sourceSha256}`}, not the approved ${bad.approvedSha256}.`,
      `Name a commit that holds the approved bytes with --commit <full sha> (find it with: git log --format=%H -- ${bad.path}), or accept the edit through the design route (reopen-design, then submit-plan and approve-plan).`);
  }
  return { ok: true, schema: AUTHORITY_RESTORE_SCHEMA, status: "restorable", documents };
}

const publicDocument = ({ absolute, sourceBytes, ...rest }) => rest;

export function applyAuthorityRestore(root, options = {}) {
  const plan = planAuthorityRestore(root, options);
  if (!plan.ok) return plan;
  const written = [];
  const temps = [];
  try {
    for (const doc of plan.documents.filter((d) => d.edited)) {
      const temp = join(dirname(doc.absolute), `.authority-restore-${process.pid}-${doc.kind}.tmp`);
      temps.push(temp);
      writeFileSync(temp, doc.sourceBytes, { flag: "wx" });
      if (sha256(readFileSync(temp)) !== doc.approvedSha256) throw new Error("staged bytes do not match the approved digest");
    }
    for (const doc of plan.documents.filter((d) => d.edited)) {
      renameSync(join(dirname(doc.absolute), `.authority-restore-${process.pid}-${doc.kind}.tmp`), doc.absolute);
      written.push(doc.path);
    }
  } catch (error) {
    for (const temp of temps) rmSync(temp, { force: true });
    return { ...refusal("AUTHORITY-RESTORE-WRITE-FAILED", `The restore could not be completed: ${error.message}`,
      "Check the file permissions of the named documents and run `inspect` again."), written };
  }
  return { ok: true, schema: AUTHORITY_RESTORE_SCHEMA, status: "restored", written,
    documents: plan.documents.map((d) => publicDocument({ ...d, workingSha256: d.approvedSha256 })) };
}

function parseArgs(argv, root) {
  const [verb, ...rest] = argv;
  if (!["inspect", "restore"].includes(verb)) return null;
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i];
    if (!["--root", "--commit"].includes(name) || Object.hasOwn(flags, name) || rest[i + 1] === undefined) return null;
    flags[name] = rest[i + 1];
  }
  if (flags["--root"] === undefined || resolve(flags["--root"]) !== resolve(root)) return null;
  if (flags["--commit"] !== undefined && !REV_RE.test(flags["--commit"])) return null;
  return { verb, commit: flags["--commit"] };
}

export function main(argv = process.argv.slice(2), root = process.cwd()) {
  const parsed = parseArgs(argv, root);
  if (parsed === null) {
    console.error("Usage: authority-restore.mjs <inspect|restore> --root <project root, the current directory> [--commit <full sha>]");
    return 2;
  }
  let result;
  if (parsed.verb === "inspect") {
    const plan = planAuthorityRestore(root, { commit: parsed.commit });
    result = plan.ok ? { ...plan, documents: plan.documents.map(publicDocument) } : plan;
  } else {
    result = applyAuthorityRestore(root, { commit: parsed.commit });
  }
  if (!result.ok) {
    console.error(`${result.code}: ${result.message}\nRepair: ${result.repair}\nNo state was written.`);
    return 2;
  }
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
