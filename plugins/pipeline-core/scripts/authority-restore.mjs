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
import { renameSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { boundAuthorityDocumentPath } from "../lib/guard/denial-route.mjs";
import { AUTHORITY_RESTORE_SCHEMA, planAuthorityRestore as planFromState, restoreRefusal as refusal, sha256 } from "../lib/authority-restore.mjs";

export { AUTHORITY_RESTORE_SCHEMA };
/** The restore itself uses the guard's own bound-document predicate. */
export const planAuthorityRestore = (root, options = {}) =>
  planFromState(root, { ...options, isBound: (_state, absolute) => boundAuthorityDocumentPath(root, absolute) !== null });
const REV_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

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
