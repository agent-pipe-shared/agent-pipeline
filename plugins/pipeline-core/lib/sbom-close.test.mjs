// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { SBOM_READERS, closeSbom, observeSbomInputs, sbomCloseRecordShape, sbomFindingHelp } from "./sbom-close.mjs";
import { validateSbomPayload } from "./sbom-manifest.mjs";
import { createHash, generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { SBOM_OVERRIDE_CODES, SBOM_OVERRIDE_REQUEST_SCHEMA, createSbomOverrideRequest, describeSbomOverrideRequest, verifySbomOverrideProof } from "./sbom-override-authority.mjs";

const NPM_LOCK = JSON.stringify({ name: "app", lockfileVersion: 3, packages: { "": { name: "app" }, "node_modules/left-pad": { version: "1.3.0" }, "node_modules/@scope/pkg": { version: "2.0.0", dev: true }, "node_modules/a/node_modules/b": { version: "0.1.0", optional: true }, "packages/inner": { version: "1.0.0" }, "node_modules/inner": { resolved: "packages/inner", link: true } } });
const CARGO_LOCK = '[[package]]\nname = "app"\nversion = "0.1.0"\n\n[[package]]\nname = "serde"\nversion = "1.0.200"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\ndependencies = [\n "x",\n]\n';
const POETRY_LOCK = '[[package]]\nname = "Requests_Lib"\nversion = "2.31.0"\ncategory = "main"\n\n[package.dependencies]\nversion = "9.9.9"\n\n[[package]]\nname = "pytest"\nversion = "8.0.0"\ncategory = "dev"\n';
const PIPFILE_LOCK = JSON.stringify({ default: { flask: { version: "==3.0.0" }, mine: { git: "https://example.invalid/x.git" } }, develop: { black: { version: "==24.1.0" } } });
const REQUIREMENTS = "# pinned\nDjango==4.2.1 ; python_version > '3'\nrequests>=2\n-r other.txt\n";
const GO_MOD = "module example.invalid/app\n\ngo 1.22\n\nrequire github.com/a/b v1.2.3\n\nrequire (\n\tgolang.org/x/text v0.14.0 // indirect\n\tgithub.com/c/d v0.0.1\n)\n";

function observe(files) { return observeSbomInputs({ tracked: Object.keys(files), read: (path) => (Object.hasOwn(files, path) ? files[path] : null) }); }
function close(files, extra = {}) { return closeSbom({ featureId: "demo-feature", evidenceDir: "specs/demo-feature/evidence", tracked: Object.keys(files), read: (path) => (Object.hasOwn(files, path) ? files[path] : null), ...extra }); }

test("readers cover npm, Python, Go and Rust lockfiles", () => {
  const seen = observe({ "package-lock.json": NPM_LOCK });
  assert.deepEqual(seen.components.map((c) => [c.purl, c.scope]), [["pkg:npm/left-pad@1.3.0", "required"], ["pkg:npm/b@0.1.0", "optional"], ["pkg:npm/%40scope/pkg@2.0.0", "dev"]].sort((a, b) => (a[1] === "required" ? -1 : b[1] === "required" ? 1 : 0) || (a[0] < b[0] ? -1 : 1)));
  assert.deepEqual(observe({ "Cargo.lock": CARGO_LOCK }).components.map((c) => c.purl), ["pkg:cargo/serde@1.0.200"]);
  assert.deepEqual(observe({ "poetry.lock": POETRY_LOCK }).components.map((c) => [c.purl, c.scope]), [["pkg:pypi/requests-lib@2.31.0", "required"], ["pkg:pypi/pytest@8.0.0", "dev"]]);
  const pip = observe({ "Pipfile.lock": PIPFILE_LOCK });
  assert.deepEqual(pip.components.map((c) => c.purl), ["pkg:pypi/flask@3.0.0", "pkg:pypi/black@24.1.0"]);
  assert.equal(pip.findings.length, 1); assert.equal(pip.findings[0].state, "partial");
  const go = observe({ "go.mod": GO_MOD });
  assert.deepEqual(go.components.map((c) => [c.purl, c.scope]), [["pkg:golang/github.com/a/b@v1.2.3", "required"], ["pkg:golang/github.com/c/d@v0.0.1", "required"], ["pkg:golang/golang.org/x/text@v0.14.0", "indirect"]]);
  assert.ok(Object.keys(SBOM_READERS).length >= 7);
});

test("an unpinned or option line in requirements.txt is a partial finding, a pinned line a component", () => {
  const seen = observe({ "requirements.txt": REQUIREMENTS });
  assert.deepEqual(seen.components.map((c) => c.purl), ["pkg:pypi/django@4.2.1"]);
  assert.deepEqual(seen.findings.map((f) => f.state), ["partial", "partial"]);
});

test("a manifest without a lockfile is partial; a lockfile in an ancestor directory covers it", () => {
  const manifest = JSON.stringify({ dependencies: { a: "^1" } });
  assert.equal(observe({ "package.json": manifest }).findings[0].state, "partial");
  assert.deepEqual(observe({ "package.json": JSON.stringify({ name: "x" }) }).findings, []);
  assert.deepEqual(observe({ "package-lock.json": NPM_LOCK, "web/package.json": manifest }).findings, []);
  assert.equal(observe({ "Cargo.toml": "[dependencies]\nserde = \"1\"\n" }).findings[0].state, "partial");
  assert.equal(observe({ "Pipfile": "[packages]\nflask = \"*\"\n" }).findings[0].state, "partial");
});

test("a lockfile format without a reader is unsupported and not also reported as partial", () => {
  const seen = observe({ "bun.lockb": "\u0000binary", "package.json": JSON.stringify({ dependencies: { a: "1" } }), "ios/Podfile.lock": "PODS:\n", "build.sbt": "libraryDependencies += x" });
  assert.deepEqual(seen.findings.map((f) => [f.state, f.path]).sort(), [["unsupported", "build.sbt"], ["unsupported", "bun.lockb"], ["unsupported", "ios/Podfile.lock"]]);
  assert.match(sbomFindingHelp(seen.findings[0]), /SBOM_READERS/u);
  // C28d: the names this test used to list (yarn.lock, a .csproj, pom.xml) have readers now; empty forms of them are no finding.
  assert.deepEqual(observe({ "yarn.lock": "# yarn lockfile v1\n", "svc/Service.csproj": "<Project/>", "pom.xml": "<project/>" }).findings, []);
});

test("fixture, vendored and working paths are not the project's dependencies", () => {
  const seen = observe({ "tests/fixtures/package-lock.json": NPM_LOCK, "vendor/x/go.mod": GO_MOD, "specs/a/package-lock.json": NPM_LOCK, "node_modules/p/package-lock.json": NPM_LOCK });
  assert.deepEqual(seen.inputs, []);
});

test("an unreadable or malformed lockfile is invalid", () => {
  assert.equal(observe({ "package-lock.json": "{not json" }).findings[0].state, "invalid");
  assert.equal(observe({ "go.mod": "nothing" }).findings[0].state, "invalid");
  assert.equal(observeSbomInputs({ tracked: ["Cargo.lock"], read: () => null }).findings[0].state, "invalid");
});

test("no manifest at all closes as an explicit not-applicable record with its reason", () => {
  const out = close({ "src/index.js": "x" });
  assert.equal(out.status, "ready"); assert.equal(out.record.status, "not-applicable"); assert.match(out.record.reason, /no dependency manifest/u);
  assert.deepEqual(out.files.map((f) => f.path), ["specs/demo-feature/evidence/sbom/record.json"]);
  assert.equal(sbomCloseRecordShape(out.record), true);
});

test("a lockfile with no component is not-applicable with a different reason", () => {
  const out = close({ "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }) });
  assert.equal(out.record.status, "not-applicable"); assert.match(out.record.reason, /list no component/u);
});

test("a complete close writes both documents, valid in their profiles and bound by digest", () => {
  const out = close({ "package-lock.json": NPM_LOCK, "go.mod": GO_MOD });
  assert.equal(out.status, "ready"); assert.equal(out.record.status, "complete"); assert.equal(out.record.code, "SBOM-COMPLETE");
  assert.equal(out.record.componentCount, 6);
  const byPath = Object.fromEntries(out.files.map((f) => [f.path, f.text]));
  assert.deepEqual(Object.keys(byPath).sort(), ["specs/demo-feature/evidence/sbom/cyclonedx.json", "specs/demo-feature/evidence/sbom/record.json", "specs/demo-feature/evidence/sbom/spdx.json"]);
  assert.equal(validateSbomPayload("cyclonedx-json", JSON.parse(byPath["specs/demo-feature/evidence/sbom/cyclonedx.json"])).valid, true);
  assert.equal(validateSbomPayload("spdx-json", JSON.parse(byPath["specs/demo-feature/evidence/sbom/spdx.json"])).valid, true);
  assert.equal(JSON.parse(byPath["specs/demo-feature/evidence/sbom/cyclonedx.json"]).metadata.component.name, "demo-feature");
  assert.equal(out.record.edges, "not-recorded");
  assert.equal(close({ "package-lock.json": NPM_LOCK, "go.mod": GO_MOD }).files[0].text, out.files[0].text, "deterministic bytes");
});

// The verified signature the close records; the caller (the one-shot close) proves it before this function is given it.
const AUTHORITY = Object.freeze({ kind: "po-signature", keyReference: "po-key", intentSha256: "a".repeat(64), proofSha256: "b".repeat(64), candidateCommit: "c".repeat(40) });

test("every blocking state stops the close unless a verified PO signature comes with the override; the override names what it covers", () => {
  const files = { "package-lock.json": NPM_LOCK, "Podfile.lock": "x" };
  const blocked = close(files);
  assert.equal(blocked.status, "blocked"); assert.equal(blocked.blocks[0].state, "unsupported");
  assert.equal(close(files, { override: "ja, ohne SBOM fuer CocoaPods", actor: "po" }).status, "blocked", "words alone never pass");
  const overridden = close(files, { override: "accepted by signature", authority: AUTHORITY, actor: "po" });
  assert.equal(overridden.status, "ready"); assert.equal(overridden.record.status, "overridden"); assert.equal(overridden.record.code, "SBOM-OVERRIDDEN");
  assert.equal(overridden.record.override.statement, "accepted by signature"); assert.equal(overridden.record.override.blocked[0].path, "Podfile.lock");
  assert.deepEqual(overridden.record.override.authority, AUTHORITY);
  assert.equal(overridden.record.componentCount, 3, "what could be read is still carried");
  assert.equal(sbomCloseRecordShape(overridden.record), true);
  assert.equal(sbomCloseRecordShape({ ...overridden.record, override: { ...overridden.record.override, authority: { ...AUTHORITY, kind: "words" } } }), false, "the authority is a PO signature");
  assert.equal(sbomCloseRecordShape({ ...overridden.record, override: { statement: "x", actor: "po", blocked: overridden.record.override.blocked } }), false, "an override without its authority is not a record");
  const onlyOverride = close({ "Podfile.lock": "x" }, { override: "weiter", authority: AUTHORITY, actor: "po" });
  assert.equal(onlyOverride.record.componentCount, 0); assert.equal(onlyOverride.record.documents.length, 0);
});

test("an existing matching record is reused; a changed lockfile makes it stale; a damaged one is invalid", () => {
  const files = { "package-lock.json": NPM_LOCK };
  const first = close(files);
  const stored = Object.fromEntries(first.files.map((f) => [f.path, f.text]));
  const again = close({ ...files, ...stored }, { existing: stored[first.recordPath] });
  assert.equal(again.status, "ready"); assert.equal(again.reused, true); assert.deepEqual(again.files, []);
  const changed = close({ ...files, ...stored, "package-lock.json": NPM_LOCK.replace("1.3.0", "1.3.1") }, { existing: stored[first.recordPath] });
  assert.equal(changed.status, "blocked"); assert.equal(changed.blocks[0].state, "stale"); assert.match(sbomFindingHelp(changed.blocks[0]), /Remove the sbom directory/u);
  const damaged = close({ ...files, ...stored, "specs/demo-feature/evidence/sbom/spdx.json": "{}" }, { existing: stored[first.recordPath] });
  assert.equal(damaged.status, "blocked"); assert.equal(damaged.blocks[0].state, "invalid");
  const garbage = close(files, { existing: "not json" });
  assert.equal(garbage.blocks[0].state, "invalid");
});

test("a recorded override keeps covering the same findings on a resumed close, and no others", () => {
  const files = { "package-lock.json": NPM_LOCK, "Podfile.lock": "x" };
  const first = close(files, { override: "weiter", authority: AUTHORITY, actor: "po" });
  const stored = Object.fromEntries(first.files.map((f) => [f.path, f.text]));
  const resumed = close({ ...files, ...stored }, { existing: stored[first.recordPath] });
  assert.equal(resumed.status, "ready"); assert.equal(resumed.reused, true);
  const extra = close({ ...files, ...stored, "build.sbt": "libraryDependencies += x" }, { existing: stored[first.recordPath] });
  assert.equal(extra.status, "blocked");
});

test("the record shape is closed", () => {
  const out = close({ "package-lock.json": NPM_LOCK });
  assert.equal(sbomCloseRecordShape({ ...out.record, extra: 1 }), false);
  assert.equal(sbomCloseRecordShape({ ...out.record, status: "overridden" }), false);
  assert.equal(sbomCloseRecordShape({ ...out.record, componentCount: 0 }), false);
  assert.equal(sbomCloseRecordShape({ ...out.record, edges: "full" }), false);
  assert.equal(sbomCloseRecordShape(null), false);
});

// The signed override (PO decision 2026-11-11): a request names the feature, every finding and the candidate; only a proof from a trusted key over exactly that request verifies.
function signer(keyReference = "po-key") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const anchor = { keyReference, publicKeySha256: createHash("sha256").update(pem).digest("hex") };
  const sign = (request) => ({ schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: request.approvalIntent.sha256, keyReference, publicKey: pem, signatureBase64: nodeSign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), privateKey).toString("base64") });
  return { anchor, sign };
}
const BLOCKED = [{ state: "unsupported", code: "SBOM-ADAPTER-UNSUPPORTED", path: "yarn.lock", reason: "no reader for yarn.lock" }, { state: "partial", code: "SBOM-PARTIAL", path: "requirements.txt", reason: "an unpinned line" }];
const CANDIDATE = { commit: "1".repeat(40), tree: "2".repeat(40) };

test("an override request is deterministic, bound to feature, findings and candidate, and shown to the signer from the request alone", () => {
  const request = createSbomOverrideRequest({ featureId: "demo-feature", blocked: BLOCKED, candidate: CANDIDATE });
  assert.equal(request.schema, SBOM_OVERRIDE_REQUEST_SCHEMA); assert.equal(request.intentSha256, request.approvalIntent.sha256);
  assert.equal(createSbomOverrideRequest({ featureId: "demo-feature", blocked: [...BLOCKED].reverse(), candidate: CANDIDATE }).intentSha256, request.intentSha256, "the order of the findings does not matter");
  for (const other of [{ featureId: "other-feature" }, { blocked: [BLOCKED[0]] }, { candidate: { commit: "3".repeat(40), tree: "2".repeat(40) } }]) {
    assert.notEqual(createSbomOverrideRequest({ featureId: "demo-feature", blocked: BLOCKED, candidate: CANDIDATE, ...other }).intentSha256, request.intentSha256, JSON.stringify(other));
  }
  assert.equal(createSbomOverrideRequest({ featureId: "demo-feature", blocked: [], candidate: CANDIDATE }), null);
  assert.equal(createSbomOverrideRequest({ featureId: "demo-feature", blocked: BLOCKED, candidate: { commit: "1".repeat(40), tree: "1".repeat(40) } }), null);
  const shown = describeSbomOverrideRequest(request, request.intentSha256);
  assert.equal(shown.resolved, true); assert.ok(shown.lines.some((line) => line.includes("yarn.lock")) && shown.lines.some((line) => line.includes("requirements.txt")) && shown.lines.some((line) => line.includes(CANDIDATE.commit)));
  assert.equal(describeSbomOverrideRequest({ ...request, blocked: [BLOCKED[0]] }, request.intentSha256), null, "a request that no longer re-derives shows nothing and is not signed");
  assert.equal(describeSbomOverrideRequest(request, "f".repeat(64)), null);
});

test("only a proof of a trusted key over exactly this feature, these findings and this candidate verifies", () => {
  const { anchor, sign } = signer();
  const request = createSbomOverrideRequest({ featureId: "demo-feature", blocked: BLOCKED, candidate: CANDIDATE });
  const proof = sign(request);
  const ask = (over = {}) => verifySbomOverrideProof({ featureId: "demo-feature", blocked: BLOCKED, candidate: CANDIDATE, proof, trustAnchors: [anchor], ...over });
  const ok = ask();
  assert.equal(ok.verified, true); assert.equal(ok.authority.kind, "po-signature"); assert.equal(ok.authority.keyReference, "po-key"); assert.equal(ok.authority.intentSha256, request.intentSha256); assert.equal(ok.authority.candidateCommit, CANDIDATE.commit);
  assert.equal(ask({ featureId: "other-feature" }).verified, false, "another feature");
  assert.equal(ask({ blocked: [BLOCKED[0]] }).verified, false, "another set of findings");
  assert.equal(ask({ candidate: { commit: "3".repeat(40), tree: "2".repeat(40) } }).verified, false, "another candidate");
  assert.equal(ask({ trustAnchors: [] }).code, SBOM_OVERRIDE_CODES.noAnchor, "no trust anchor is not an open door");
  assert.equal(ask({ trustAnchors: [signer("other-key").anchor] }).code, SBOM_OVERRIDE_CODES.untrusted, "a key the project does not name");
  assert.equal(ask({ trustAnchors: [{ ...anchor, publicKeySha256: "0".repeat(64) }] }).verified, false, "a key that does not match its anchor");
  assert.equal(ask({ proof: { ...proof, signatureBase64: Buffer.from("not a signature").toString("base64") } }).verified, false, "an edited signature");
  assert.equal(ask({ proof: { ...proof, extra: 1 } }).code, SBOM_OVERRIDE_CODES.invalid, "a proof of another shape");
  assert.equal(ask({ proof: null }).code, SBOM_OVERRIDE_CODES.invalid);
});
