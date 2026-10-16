// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: pipeline.signing-prompt-prints-the-whole-review-package (AC-261).
 * Acceptance points pinned through the real exported functions of
 * scripts/po-human-approval.mjs (compactSigningDisclosure, formatHumanApprovalCliResult):
 *  P1 compact, fixed-shape confirmation block (bounded lines, digest present)
 *  P2 full review material is referenced by path + sha256, never printed inline
 *  P3 hostile / multi-line free text cannot widen the block
 *  P4 post-sign output is one short line (status + proof path)
 *  P5 dispatch on the request schema to exactly one describer and an immediate
 *     progress line (structural pin on the source; the end-to-end sign-intent
 *     route is NOT exercised here, see report)
 * RED mirrors below prove the assertions can fail.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compactSigningDisclosure, formatHumanApprovalCliResult } from "../../scripts/po-human-approval.mjs";

const SCRIPT = fileURLToPath(new URL("../../scripts/po-human-approval.mjs", import.meta.url));
const INTENT = "a".repeat(64);
const MATERIAL = { path: "scratch/review-" + INTENT + "-" + "b".repeat(64) + ".json", sha256: "b".repeat(64) };
const bigRecord = () => ({ resolved: true, lines: Array.from({ length: 4000 }, (_, i) => `line ${i}: ${"x".repeat(2000)}`) });

test("P1: a 4000-line, multi-megabyte review record renders as a bounded block carrying the intent digest", () => {
  const lines = compactSigningDisclosure({ intentSha256: INTENT, record: bigRecord(), materialArtifact: MATERIAL });
  assert.ok(lines.length <= 25, `rendered ${lines.length} lines`);
  assert.equal(lines[0], `intent sha256: ${INTENT}`);
  assert.ok(Buffer.byteLength(lines.join("\n")) < 8 * 1024, "block stays far below the ~100 KB dump");
  for (const line of lines) assert.ok(line.length <= 300, "every line is bounded");
});

test("P2: the full material is referenced by path and sha256 and the omission is stated", () => {
  const lines = compactSigningDisclosure({ intentSha256: INTENT, record: bigRecord(), materialArtifact: MATERIAL });
  assert.ok(lines.includes("full review material: " + JSON.stringify(MATERIAL.path)));
  assert.ok(lines.includes("full review material sha256: " + MATERIAL.sha256));
  assert.ok(lines.some((l) => /additional validated review material is retained at the bound artifact/u.test(l)));
  assert.ok(!lines.some((l) => l.includes("line 3999")), "omitted lines are not printed");
  assert.throws(() => compactSigningDisclosure({ intentSha256: INTENT, record: bigRecord(), materialArtifact: { path: MATERIAL.path, sha256: "zz" } }), /PO-SIGN-DISCLOSURE-MATERIAL/u);
  assert.throws(() => compactSigningDisclosure({ intentSha256: "nope", record: bigRecord() }), /PO-SIGN-DISCLOSURE-DIGEST/u);
  const withoutArtifact = compactSigningDisclosure({ intentSha256: INTENT, record: bigRecord() });
  assert.ok(withoutArtifact.some((l) => /full review material is unavailable/u.test(l)), "no silent truncation without an artifact");
});

test("P3: control characters and embedded newlines cannot add lines to the block", () => {
  const record = { resolved: true, lines: ["ok\u001b[2J fact", "multi\nline smuggle", "tab\tand\u0007bell"] };
  const lines = compactSigningDisclosure({ intentSha256: INTENT, record, materialArtifact: MATERIAL });
  for (const line of lines) assert.doesNotMatch(line, /[\u0000-\u001f\u007f]/u);
  assert.ok(!lines.some((l) => l.includes("smuggle")), "a multi-line entry is dropped, not split");
  const unresolved = compactSigningDisclosure({ intentSha256: INTENT, record: { resolved: false, lines: [] } });
  assert.ok(unresolved.some((l) => /purpose unavailable/u.test(l)));
});

test("P4: the post-sign result for a human is exactly one short line; machine callers keep the full result", () => {
  const result = { ok: true, code: "PO-HUMAN-SIGN-INTENT-READY", intentSha256: INTENT, signer: { keyReference: "k", publicKey: "p".repeat(500) },
    paths: { proof: "/x/proof.json", signer: "/x/signer.json", scratchProofPath: "/r/p.json", scratchSignerPath: "/r/s.json" } };
  const human = formatHumanApprovalCliResult(result, { humanFacing: true });
  assert.equal(human.trimEnd().split("\n").length, 1);
  assert.deepEqual(JSON.parse(human), { ok: true, code: "PO-HUMAN-SIGN-INTENT-READY", proofPath: "/x/proof.json" });
  assert.ok(human.length < 200);
  assert.ok(formatHumanApprovalCliResult(result, { humanFacing: false }).split("\n").length > 5);
});

test("P5 (structural): sign-intent prints a progress line first, dispatches one describer per request schema and binds the review file digest", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const at = (needle) => { const i = src.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  assert.ok(at('progress("Preparing signing request...\\n")') < at("const requestSchema = scratchRequestRecord?.schema"));
  assert.ok(at("switch (requestSchema)") < at("publishSigningReviewMaterial(repository, portableRequestPath"));
  assert.ok(src.includes("const sha256 = designSigningHash(bytes);") && src.includes("review-${intentSha256}-${sha256}.json"), "file name embeds the digest of the written bytes");
  assert.ok(src.includes("actual.sha256 !== sha256 || !actual.bytes.equals(bytes)"), "readback proves digest equals written bytes");
  assert.ok(src.includes("materialArtifact.sha256) fail(\"PO-SIGN-REVIEW-DRIFT\")"), "digest re-checked before signing");
});

test("P6 (host limitation): directory-mode / symlink custody cases of the review file", { skip: "host-limitation: Windows has no directory mode bits or directory symlinks; owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)" }, () => {});

test("RED mirror: an uncapped renderer fails the P1 bound, so the pin can fail", () => {
  const uncapped = ({ intentSha256, record }) => [`intent sha256: ${intentSha256}`, ...record.lines];
  assert.ok(uncapped({ intentSha256: INTENT, record: bigRecord() }).length > 25);
  const naiveHuman = (r) => JSON.stringify(r, null, 2) + "\n";
  assert.ok(naiveHuman({ ok: true, paths: { a: 1, b: 2 }, signer: {} }).split("\n").length > 1);
});
