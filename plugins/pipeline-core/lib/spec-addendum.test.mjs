// SPDX-License-Identifier: SUL-1.0
// ADR-0095: the Spec addendum's one definition -- header, criterion rule, subject builder, approval record and reader.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSpecAddendumSubject, criterionIdsIn, isSpecAddendumPath, parseSpecAddendum, readSpecAddenda, specAddendumApprovalBytes,
  specAddendumApprovalPath, specAddendumCriteriaRefusal, specAddendumNumber,
} from "./spec-addendum.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const PACKET = "a".repeat(32);
const git = (root, ...args) => {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const SPEC = "# Spec\n\nAC-1 the board renders.\nAC-2 the score is saved.\n";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "spec-addendum-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "test");
  mkdirSync(join(root, "specs/f1/evidence"), { recursive: true });
  writeFileSync(join(root, "specs/f1/spec.md"), SPEC);
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: "f1", rigor: 1 }, state: "implementing",
    artifacts: [{ class: "spec", path: "specs/f1/spec.md", sha256: sha(SPEC), authority: true, mutability: "immutable", retention: "active" }], candidate: null, supersedes: null };
  writeFileSync(join(root, "specs/f1/lifecycle.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  writeFileSync(join(root, "src.txt"), "reviewed\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "reviewed");
  const reviewed = git(root, "rev-parse", "HEAD");
  return { root, manifest, reviewed };
}
const header = (findings = `CRF-${PACKET}-1`, base = `specs/f1/spec.md sha256:${sha(SPEC)}`) => `Base Spec: ${base}\nCritic packet: ${PACKET}\nFindings: ${findings}\n`;
function commitAddendum(root, body, number = "01") {
  writeFileSync(join(root, `specs/f1/spec-addendum-${number}.md`), body);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "addendum");
}
const readers = (reviewed, findings = [{ severity: "major", gap: "AC-2 cannot hold" }]) => ({
  controlRoot: "/unused",
  readReceipt: ({ packetId }) => { assert.equal(packetId, PACKET); return { receipt: { candidate: { commit: reviewed, tree: "t" }, verdict: "fail" } }; },
  readResult: () => ({ result: { verdict: { findings } } }),
});

describe("Spec addendum (ADR-0095)", () => {
  it("SA-01 the path grammar and the paths no close commit may carry", () => {
    assert.equal(specAddendumNumber("f1", "specs/f1/spec-addendum-01.md"), 1);
    assert.equal(specAddendumNumber("f1", "specs/f1/spec-addendum-00.md"), null);
    assert.equal(specAddendumNumber("f1", "specs/f2/spec-addendum-01.md"), null);
    assert.equal(specAddendumNumber("f1", "specs/f1/design/spec-addendum-01.md"), null);
    assert.equal(isSpecAddendumPath("specs/f1/spec-addendum-07.md"), true);
    assert.equal(isSpecAddendumPath("specs/f1/spec.md"), false);
  });

  it("SA-02 the header is parsed strictly; a missing line, a malformed value or an empty body is refused", () => {
    const parsed = parseSpecAddendum(`${header(`CRF-${PACKET}-2, CRF-${PACKET}-1`)}\nAC-2 means the last score.\n`);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.findingIds, [`CRF-${PACKET}-1`, `CRF-${PACKET}-2`]);
    for (const bad of [`# Title\n${header()}body\n`, `Base Spec: specs/f1/spec.md sha256:abc\nCritic packet: ${PACKET}\nFindings: x\nbody\n`, header(), `${header("a, a")}body\n`]) {
      assert.equal(parseSpecAddendum(bad).code, "SPEC-ADDENDUM-HEADER", bad);
    }
  });

  it("SA-03 the criterion set may not change: an id the base Spec does not name is refused and names the PO's reopen", () => {
    assert.deepEqual(criterionIdsIn(SPEC), ["AC-1", "AC-2"]);
    assert.equal(specAddendumCriteriaRefusal("AC-2 means the last score.", SPEC), null);
    const refused = specAddendumCriteriaRefusal("AC-3 a new criterion.", SPEC);
    assert.equal(refused.code, "SPEC-ADDENDUM-CRITERIA");
    assert.match(refused.detail, /reopen-design/u);
  });

  it("SA-04 the subject is derived from HEAD, the approved Spec and the consumed packet", () => {
    const { root, reviewed } = fixture();
    commitAddendum(root, `${header()}\nAC-2 means the last score, not the best one.\n`);
    const built = buildSpecAddendumSubject({ root, featureId: "f1", addendumPath: "specs/f1/spec-addendum-01.md", ...readers(reviewed) });
    assert.equal(built.ok, true, JSON.stringify(built));
    assert.equal(built.candidate.commit, git(root, "rev-parse", "HEAD"));
    assert.deepEqual(Object.keys(built.subject).sort(), ["addendumPath", "addendumSha256", "criticReceiptSha256", "featureId", "findingIds", "packetId", "specPath", "specSha256"]);
    assert.equal(built.subject.specSha256, sha(SPEC));
    assert.equal(built.subject.addendumSha256, sha(readFileSync(join(root, "specs/f1/spec-addendum-01.md"))));
  });

  it("SA-05 the builder refuses an uncommitted, edited, foreign-based, criterion-changing, out-of-order or unknown-finding addendum", () => {
    const { root, reviewed } = fixture();
    const path = "specs/f1/spec-addendum-01.md";
    const build = (overrides = {}) => buildSpecAddendumSubject({ root, featureId: "f1", addendumPath: path, ...readers(reviewed), ...overrides });
    writeFileSync(join(root, path), `${header()}\nbody\n`);
    assert.equal(build().code, "SPEC-ADDENDUM-UNCOMMITTED");
    commitAddendum(root, `${header()}\nbody\n`);
    writeFileSync(join(root, path), `${header()}\nedited after the commit\n`);
    assert.equal(build().code, "SPEC-ADDENDUM-UNCOMMITTED");
    commitAddendum(root, `${header(`CRF-${PACKET}-1`, `specs/f1/spec.md sha256:${"b".repeat(64)}`)}\nbody\n`);
    assert.equal(build().code, "SPEC-ADDENDUM-BASE");
    commitAddendum(root, `${header()}\nAC-9 is new.\n`);
    assert.equal(build().code, "SPEC-ADDENDUM-CRITERIA");
    commitAddendum(root, `${header(`CRF-${PACKET}-2`)}\nbody\n`);
    assert.equal(build().code, "SPEC-ADDENDUM-FINDINGS");
    commitAddendum(root, `${header()}\nbody\n`);
    assert.equal(build({ addendumPath: "specs/f1/spec-addendum-02.md" }).code, "SPEC-ADDENDUM-UNCOMMITTED");
    commitAddendum(root, `${header()}\nbody\n`, "02");
    assert.equal(build({ addendumPath: "specs/f1/spec-addendum-02.md" }).code, "SPEC-ADDENDUM-ORDER", "02 before 01 is registered");
    assert.equal(build({ readReceipt: () => { throw Object.assign(new Error("x"), { code: "CPP-NOT-CONSUMED" }); } }).code, "SPEC-ADDENDUM-PACKET");
    assert.equal(build({ readReceipt: () => ({ receipt: { candidate: { commit: "c".repeat(40) } } }) }).code, "SPEC-ADDENDUM-PACKET");
    writeFileSync(join(root, "specs/f1/spec.md"), `${SPEC}AC-1 edited in place.\n`);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "spec edited");
    assert.equal(build().code, "SPEC-ADDENDUM-BASE", "the Spec stays byte-identical");
  });

  it("SA-06 the reader returns registered addenda in order, flags a drifted file and treats another base as superseded", () => {
    const { root, manifest, reviewed } = fixture();
    const path = "specs/f1/spec-addendum-01.md";
    commitAddendum(root, `${header()}\nAC-2 means the last score.\n`);
    const built = buildSpecAddendumSubject({ root, featureId: "f1", addendumPath: path, ...readers(reviewed) });
    const record = specAddendumApprovalBytes({ subject: built.subject, candidate: built.candidate, subjectSha256: "d".repeat(64), approvedBy: "PO", approvedAt: "2026-11-13T10:00:00.000Z", mode: "chat-attributed-unattested" });
    const approvalPath = specAddendumApprovalPath("f1", record);
    writeFileSync(join(root, approvalPath), record);
    const registered = { ...manifest, artifacts: [...manifest.artifacts,
      { class: "design", path, sha256: built.subject.addendumSha256, authority: false, mutability: "immutable", retention: "retain" },
      { class: "candidate-evidence", path: approvalPath, sha256: sha(record), authority: false, mutability: "immutable", retention: "retain" }] };
    const read = readSpecAddenda({ root, featureId: "f1", manifest: registered });
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.deepEqual(read.applied.map((a) => [a.number, a.path, a.status, a.approvedBy]), [[1, path, "applied", "PO"]]);
    const reapproved = { ...registered, artifacts: registered.artifacts.map((e) => (e.class === "spec" ? { ...e, sha256: "e".repeat(64) } : e)) };
    const later = readSpecAddenda({ root, featureId: "f1", manifest: reapproved });
    assert.equal(later.ok, true);
    assert.deepEqual([later.addenda[0].status, later.applied.length], ["superseded", 0]);
    writeFileSync(join(root, path), `${header()}\nchanged after approval\n`);
    const drifted = readSpecAddenda({ root, featureId: "f1", manifest: registered });
    assert.equal(drifted.ok, false);
    assert.match(drifted.findings.join("\n"), /SPEC-ADDENDUM-DIGEST/u);
  });
});
