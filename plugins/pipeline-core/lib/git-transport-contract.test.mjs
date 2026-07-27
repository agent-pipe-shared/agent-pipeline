// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { applyGitTransport, confirmGitBranch, createGitTransportRequest, previewGitBranch, readbackGitTransport, validateGitTransport } from "./git-transport-contract.mjs";

const A = "a".repeat(64); const C = "c".repeat(40); const D = "d".repeat(64);
const branch = () => createGitTransportRequest({ operationId: "nova-b4-probe", provider: "gitlab", remote: { baseUrlClass: "gitlab-com", remoteUrlSha256: A, projectCoordinatesSha256: D }, operation: "branch.publish", sourceCommit: C, destinationRef: "refs/heads/nova-transport-probe/20260727-01", expectedRemoteOid: null });
const fetch = () => createGitTransportRequest({ operationId: "nova-b4-fetch", provider: "github", remote: { baseUrlClass: "github-com", remoteUrlSha256: A, projectCoordinatesSha256: D }, operation: "ref.fetch", sourceCommit: C, destinationRef: "refs/heads/main", expectedRemoteOid: C });
const check = (name, fn) => { try { fn(); process.stdout.write(`PASS ${name}\n`); } catch (e) { process.stderr.write(`FAIL ${name}: ${e.stack}\n`); process.exitCode = 1; } };
check("sealed new-branch publication requires preview, confirmation, and matching readback", () => {
  const requested = branch(); const previewed = previewGitBranch(requested, { expiresAt: 200 }).transport; const confirmed = confirmGitBranch(previewed, { authoritySha256: A, previewSha256: previewed.preview.previewSha256, confirmedAt: 100 }).transport; const applied = applyGitTransport(confirmed, { providerReceiptSha256: D, acceptedAt: 101, status: "accepted" }).transport; const done = readbackGitTransport(applied, { observedOid: C, expectedOid: C, status: "matching", observedAt: 102 }).transport;
  assert.equal(done.state, "readback-verified"); assert.deepEqual(validateGitTransport(done), { ok: true, code: null });
});
check("read-only fetch has no confirmation path but still requires exact ref readback", () => {
  const applied = applyGitTransport(fetch(), { providerReceiptSha256: D, acceptedAt: 1, status: "accepted" }).transport; const done = readbackGitTransport(applied, { observedOid: C, expectedOid: C, status: "matching", observedAt: 2 }).transport; assert.equal(done.state, "readback-verified");
});
check("hostile refspecs, force-style prefixes, existing branches, and raw credentials are rejected", () => {
  for (const destinationRef of ["main", "refs/heads/*", "refs/heads/+topic", "refs/heads/topic..x", "refs/tags/v1", "refs/heads/"]) assert.throws(() => createGitTransportRequest({ ...branch(), destinationRef }), /(?:SHAPE|AUTHORITY)/u);
  assert.throws(() => createGitTransportRequest({ operationId: "x", provider: "gitlab", remote: { baseUrlClass: "gitlab-com", remoteUrlSha256: A, projectCoordinatesSha256: D, token: "no" }, operation: "branch.publish", sourceCommit: C, destinationRef: "refs/heads/x", expectedRemoteOid: null }), /SHAPE/u);
  assert.throws(() => createGitTransportRequest({ operationId: "x", provider: "gitlab", remote: { baseUrlClass: "gitlab-com", remoteUrlSha256: A, projectCoordinatesSha256: D }, operation: "branch.publish", sourceCommit: C, destinationRef: "refs/heads/x", expectedRemoteOid: C }), /AUTHORITY/u);
});
check("confirmation substitution and mismatching readback cannot become success", () => {
  const previewed = previewGitBranch(branch(), { expiresAt: 200 }).transport; assert.equal(confirmGitBranch(previewed, { authoritySha256: A, previewSha256: D, confirmedAt: 100 }).ok, false);
  const confirmed = confirmGitBranch(previewed, { authoritySha256: A, previewSha256: previewed.preview.previewSha256, confirmedAt: 100 }).transport; const applied = applyGitTransport(confirmed, { providerReceiptSha256: D, acceptedAt: 101, status: "accepted" }).transport; const bad = readbackGitTransport(applied, { observedOid: "e".repeat(40), expectedOid: C, status: "mismatch", observedAt: 102 }).transport; assert.equal(bad.state, "mismatch");
});
