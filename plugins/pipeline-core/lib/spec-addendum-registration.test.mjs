#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ADR-0095: `register-feature-package.mjs --add-spec-addendum <record>` (addSpecAddendum). Real git, a real feature package,
// the record the approval verb writes (specAddendumApprovalBytes) and the private approval it stores (writeCriticalApproval).
// SAR-01 registers once; SAR-02..07 are the refusals that keep an unapproved or changed addendum out of the package.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import { writeCriticalApproval } from "./critical-action-authorization.mjs";
import { addSpecAddendum } from "./feature-package-registration.mjs";
import { SPEC_ADDENDUM_KIND, buildSpecAddendumSubject, readSpecAddenda, specAddendumApprovalBytes, specAddendumApprovalPath } from "./spec-addendum.mjs";
import { REGISTER_FEATURE_PACKAGE_HELP } from "../scripts/register-feature-package.mjs";
import { specAddendumContextLines } from "../scripts/dispatch-briefing.mjs";

const ID = "sa-pkg";
const PACKET = "e".repeat(32);
const ADDENDUM = `specs/${ID}/spec-addendum-01.md`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitIn = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } }).trim();
const head = (root) => ({ commit: gitIn(root, ["rev-parse", "HEAD"]), tree: gitIn(root, ["rev-parse", "HEAD^{tree}"]) });

/** A valid implementing package, a reviewed commit, the committed addendum, its record and (unless `approve: false`) the private approval. */
function fixture({ approve = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sa-reg-")));
  gitIn(root, ["init", "-q"]);
  const base = `specs/${ID}`;
  mkdirSync(join(root, base, "evidence"), { recursive: true });
  const entries = [["prd", "prd.md", true, "mutable"], ["spec", "spec.md", true, "mutable"], ["acceptance", "acceptance.md", false, "mutable"], ["result", "result.md", false, "mutable"], ["candidate-evidence", "envelope.json", false, "immutable"]].map(([klass, name, authority, mutability]) => {
    const bytes = `${klass} of ${ID}\n`;
    writeFileSync(join(root, base, name), bytes);
    return { class: klass, path: `${base}/${name}`, sha256: sha256(bytes), authority, mutability, retention: "active" };
  });
  const manifestRel = `${base}/lifecycle.json`;
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: ID, rigor: 1 }, state: "implementing", artifacts: entries, candidate: null, supersedes: null };
  writeFileSync(join(root, manifestRel), `${JSON.stringify(manifest, null, 2)}\n`);
  gitIn(root, ["add", "-A"]);
  gitIn(root, ["commit", "-qm", "work"]);
  const reviewed = head(root);
  const specSha = entries[1].sha256;
  writeFileSync(join(root, ADDENDUM), `Base Spec: ${base}/spec.md sha256:${specSha}\nCritic packet: ${PACKET}\nFindings: CRF-${PACKET}-1\n\nThe board shows the best score, not the last one.\n`);
  gitIn(root, ["add", "-A"]);
  gitIn(root, ["commit", "-qm", "spec addendum 01"]);
  const candidate = head(root);
  const built = buildSpecAddendumSubject({ root, featureId: ID, addendumPath: ADDENDUM, controlRoot: "/unused",
    readReceipt: () => ({ receipt: { packetId: PACKET, candidate: reviewed } }), readResult: () => ({ result: { verdict: { findings: [{ severity: "major" }] } } }) });
  assert.equal(built.ok, true, JSON.stringify(built));
  const subjectSha256 = criticalActionSubjectSha256({ kind: SPEC_ADDENDUM_KIND, candidate, subject: built.subject });
  const approvedAt = "2026-11-13T10:00:00.000Z";
  const bytes = specAddendumApprovalBytes({ subject: built.subject, candidate, subjectSha256, approvedBy: "PO", approvedAt, mode: "chat-attributed-unattested" });
  const recordPath = specAddendumApprovalPath(ID, bytes);
  writeFileSync(join(root, recordPath), bytes);
  if (approve) {
    const stored = writeCriticalApproval({ gitCommonDir: join(root, ".git"), kind: SPEC_ADDENDUM_KIND, consumedAt: approvedAt,
      approval: { approvedBy: "PO", approvedAt, forCommit: candidate.commit, forTree: candidate.tree, ...built.subject, subjectSha256, criticalProof: null } });
    assert.equal(stored.ok, true);
  }
  const readManifest = () => readFileSync(join(root, manifestRel), "utf8");
  return { root, manifestRel, recordPath, subject: built.subject, candidate, subjectSha256, approvedAt, readManifest, state: { activeFeature: { id: ID } }, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("SAR-01 an approved addendum is registered once: the addendum as immutable design, the record as candidate evidence, read back as applied", () => {
  const f = fixture();
  try {
    const added = addSpecAddendum({ root: f.root, state: f.state, approvalPath: f.recordPath });
    assert.equal(added.status, "spec-addendum-added", JSON.stringify(added));
    assert.deepEqual(added.commitPaths, [f.manifestRel, f.recordPath]);
    const manifest = JSON.parse(f.readManifest());
    const design = manifest.artifacts.find((entry) => entry.path === ADDENDUM);
    assert.deepEqual(design, { class: "design", path: ADDENDUM, sha256: f.subject.addendumSha256, authority: false, mutability: "immutable", retention: "retain" });
    assert.equal(manifest.artifacts.find((entry) => entry.path === f.recordPath)?.class, "candidate-evidence");
    const read = readSpecAddenda({ root: f.root, featureId: ID, manifest });
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.deepEqual(read.applied.map((entry) => [entry.path, entry.approvedBy, entry.mode]), [[ADDENDUM, "PO", "chat-attributed-unattested"]]);
    assert.equal(addSpecAddendum({ root: f.root, state: f.state, approvalPath: f.recordPath }).status, "already-registered");
  } finally { f.cleanup(); }
});

test("SAR-02 a committed record without the private PO approval is refused and the manifest is untouched", () => {
  const f = fixture({ approve: false });
  try {
    const before = f.readManifest();
    const refused = addSpecAddendum({ root: f.root, state: f.state, approvalPath: f.recordPath });
    assert.equal(refused.code, "FPR-SPEC-ADDENDUM-UNAPPROVED", JSON.stringify(refused));
    assert.equal(f.readManifest(), before);
  } finally { f.cleanup(); }
});

test("SAR-03 an addendum edited after its approval is refused (working tree), never registered with other bytes", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, ADDENDUM), `${readFileSync(join(f.root, ADDENDUM), "utf8")}A sentence added after the approval.\n`);
    const before = f.readManifest();
    const refused = addSpecAddendum({ root: f.root, state: f.state, approvalPath: f.recordPath });
    assert.equal(refused.code, "FPR-SPEC-ADDENDUM-DIGEST", JSON.stringify(refused));
    assert.equal(f.readManifest(), before);
  } finally { f.cleanup(); }
});

test("SAR-04 a changed record is refused: other bytes under the old name, and a re-named record whose subject no longer binds its digest", () => {
  const f = fixture();
  try {
    const record = JSON.parse(readFileSync(join(f.root, f.recordPath), "utf8"));
    writeFileSync(join(f.root, f.recordPath), `${JSON.stringify({ ...record, approvedBy: "someone else" }, null, 2)}\n`);
    assert.equal(addSpecAddendum({ root: f.root, state: f.state, approvalPath: f.recordPath }).code, "FPR-SPEC-ADDENDUM-RECORD");
    const forged = Buffer.from(`${JSON.stringify({ ...record, subject: { ...record.subject, findingIds: [`CRF-${PACKET}-2`] } }, null, 2)}\n`);
    const forgedPath = specAddendumApprovalPath(ID, forged);
    writeFileSync(join(f.root, forgedPath), forged);
    assert.equal(addSpecAddendum({ root: f.root, state: f.state, approvalPath: forgedPath }).code, "FPR-SPEC-ADDENDUM-RECORD");
  } finally { f.cleanup(); }
});

test("SAR-05 a record that binds a Spec the package no longer approves (design reopened and re-approved) is refused as superseded", () => {
  const f = fixture();
  try {
    const manifest = JSON.parse(f.readManifest());
    const spec = manifest.artifacts.find((entry) => entry.class === "spec");
    writeFileSync(join(f.root, spec.path), "spec of sa-pkg, re-approved\n");
    spec.sha256 = sha256("spec of sa-pkg, re-approved\n");
    writeFileSync(join(f.root, f.manifestRel), `${JSON.stringify(manifest, null, 2)}\n`);
    const refused = addSpecAddendum({ root: f.root, state: f.state, approvalPath: f.recordPath });
    assert.equal(refused.code, "FPR-SPEC-ADDENDUM-SUPERSEDED", JSON.stringify(refused));
  } finally { f.cleanup(); }
});

test("SAR-06 a path that is not a Spec addendum approval record of this feature is refused before anything is read", () => {
  const f = fixture();
  try {
    for (const path of [`specs/${ID}/${f.recordPath.split("/").at(-1)}`, `specs/other/evidence/${f.recordPath.split("/").at(-1)}`, ADDENDUM]) {
      assert.equal(addSpecAddendum({ root: f.root, state: f.state, approvalPath: path }).code, "FPR-SPEC-ADDENDUM-PATH", path);
    }
  } finally { f.cleanup(); }
});

test("SAR-07 an approved commit that is not an ancestor of HEAD is refused", () => {
  const f = fixture();
  try {
    gitIn(f.root, ["checkout", "-q", "--detach", "HEAD~1"]);
    const refused = addSpecAddendum({ root: f.root, state: f.state, approvalPath: f.recordPath });
    assert.equal(refused.code, "FPR-SPEC-ADDENDUM-CANDIDATE", JSON.stringify(refused));
  } finally { f.cleanup(); }
});

test("SAR-09 the Goldfish briefing names a registered addendum next to the Spec, and a changed one as a stop", () => {
  const f = fixture();
  try {
    assert.deepEqual(specAddendumContextLines(f.root, `specs/${ID}/spec.md`), [], "an approved but unregistered addendum is not yet context");
    assert.equal(addSpecAddendum({ root: f.root, state: f.state, approvalPath: f.recordPath }).status, "spec-addendum-added");
    const lines = specAddendumContextLines(f.root, `specs/${ID}/spec.md`);
    assert.equal(lines.length, 1);
    assert.match(lines[0], new RegExp(`\`${ADDENDUM}\` \\(sha256 \`${f.subject.addendumSha256}\`\\) corrects \`CRF-${PACKET}-1\`; where it and \`specs/${ID}/spec.md\` differ, the addendum wins`, "u"));
    writeFileSync(join(f.root, ADDENDUM), "changed\n");
    assert.match(specAddendumContextLines(f.root, `specs/${ID}/spec.md`)[0], /do not read back .*SPEC-ADDENDUM-DIGEST.*stop and report it/u);
    assert.deepEqual(specAddendumContextLines(f.root, "specs/no-package/spec.md"), []);
  } finally { f.cleanup(); }
});

test("SAR-08 the registration help names the Spec addendum route", () => {
  assert.match(REGISTER_FEATURE_PACKAGE_HELP, /--add-spec-addendum <approval record>/u);
  assert.match(REGISTER_FEATURE_PACKAGE_HELP, /approve-spec-addendum --by <label the PO gives>/u);
});
