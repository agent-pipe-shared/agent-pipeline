// SPDX-License-Identifier: SUL-1.0
// ALF-G4C: tests for the pure write predicate that refuses a hand-written design review receipt.
// The predicate decides on the RESULTING file content of a write, never on the target path or extension.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonical } from "./po-approval-proof.mjs";
import {
  DESIGN_REVIEW_RECEIPT_MAX_BYTES,
  DESIGN_REVIEW_RECEIPT_SCHEMA,
  createDesignReviewReceipt,
} from "./design-review-receipt.mjs";
import {
  DESIGN_REVIEW_RECEIPT_HAND_WRITTEN,
  designReviewReceiptWriteRefusal,
} from "./design-review-receipt-write-guard.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");

function producedReceipt() {
  const made = createDesignReviewReceipt({
    featureId: "feat-x",
    previous: null,
    sources: {
      prd: { path: "specs/feat-x/prd.md", sha256: sha("prd") },
      spec: { path: "specs/feat-x/spec.md", sha256: sha("spec") },
      companions: [],
    },
    reviewer: { runner: "claude", model: "sonnet" },
    report: { path: "specs/feat-x/review/report.md", sha256: sha("report") },
    openFindingIds: [],
    reviewedAt: "2026-10-18T09:30:00.000Z",
  });
  assert.equal(made.ok, true);
  return made;
}

const refusalOf = (resultingContent) => designReviewReceiptWriteRefusal({ resultingContent });

test("canonical receipt bytes are refused with a typed code that names the producer command", () => {
  const made = producedReceipt();
  const refusal = refusalOf(Buffer.from(made.bytes).toString("utf8"));
  assert.notEqual(refusal, null);
  assert.equal(refusal.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
  assert.equal(typeof refusal.message, "string");
  assert.match(refusal.message, /scripts\/design-review-receipt\.mjs create/u);
});

test("a pretty-printed receipt is refused", () => {
  const refusal = refusalOf(JSON.stringify(producedReceipt().receipt, null, 2));
  assert.equal(refusal?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
});

test("a compact, non-canonical key order is refused", () => {
  const reversed = Object.fromEntries(Object.entries(producedReceipt().receipt).reverse());
  assert.equal(refusalOf(JSON.stringify(reversed))?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
});

test("a receipt-schema object with extra fields is refused (hand-written receipts are non-canonical)", () => {
  const extra = { ...producedReceipt().receipt, invented: "reviewedAt chosen by hand", note: [1, 2] };
  assert.equal(refusalOf(JSON.stringify(extra))?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
  assert.equal(refusalOf(JSON.stringify(extra, null, 2))?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
});

test("an object that carries only the schema is refused: the schema value alone decides", () => {
  assert.equal(refusalOf(JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_SCHEMA }))?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
});

test("the decision is on the content, so surrounding whitespace and a trailing newline do not hide a receipt", () => {
  const body = canonical(producedReceipt().receipt);
  assert.equal(refusalOf(`\n\n  ${body}\n\n`)?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
});

test("a JSON string-escaped schema value is still a receipt (no substring shortcut to dodge)", () => {
  const escaped = `{"schema":"${[...DESIGN_REVIEW_RECEIPT_SCHEMA].map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`).join("")}"}`;
  assert.equal(refusalOf(escaped)?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
});

test("the target extension is irrelevant: the predicate takes content only", () => {
  const content = JSON.stringify(producedReceipt().receipt);
  assert.equal(designReviewReceiptWriteRefusal({ resultingContent: content, filePath: "notes/review.txt" })?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
  assert.equal(designReviewReceiptWriteRefusal({ resultingContent: content, filePath: "specs/x/receipt.md" })?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
  assert.equal(designReviewReceiptWriteRefusal({ resultingContent: content, filePath: "receipt" })?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
});

test("the two-step bypass is closed: only the resulting content matters, not the edit that produced it", () => {
  const receipt = JSON.stringify(producedReceipt().receipt);
  // Step 1: writing `{}` is ordinary JSON and is allowed.
  assert.equal(refusalOf("{}"), null);
  // Step 2: an Edit of `{}` that brings the receipt body in resolves to receipt content and is refused.
  assert.equal(refusalOf("{}".replace("{}", receipt))?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
  // An empty old_string edit on an empty file resolves to the new string alone.
  assert.equal(refusalOf("".slice(0, 0) + receipt + "".slice(0))?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
});

test("ordinary JSON is allowed", () => {
  assert.equal(refusalOf("{}"), null);
  assert.equal(refusalOf('{"schema":"pipeline.something-else.v1","a":1}'), null);
  assert.equal(refusalOf("[]"), null);
  assert.equal(refusalOf("[{\"schema\":\"" + DESIGN_REVIEW_RECEIPT_SCHEMA + "\"}]"), null);
  assert.equal(refusalOf('{"nested":{"schema":"' + DESIGN_REVIEW_RECEIPT_SCHEMA + '"}}'), null);
  assert.equal(refusalOf(JSON.stringify(DESIGN_REVIEW_RECEIPT_SCHEMA)), null);
  assert.equal(refusalOf("null"), null);
});

test("source code that merely contains the schema string is allowed", () => {
  const source = `export const SCHEMA = "${DESIGN_REVIEW_RECEIPT_SCHEMA}";\nconsole.log(SCHEMA);\n`;
  assert.equal(refusalOf(source), null);
  assert.equal(refusalOf(`// ${DESIGN_REVIEW_RECEIPT_SCHEMA}\nmodule.exports = { schema: "${DESIGN_REVIEW_RECEIPT_SCHEMA}" };\n`), null);
});

test("non-JSON content is allowed", () => {
  assert.equal(refusalOf(""), null);
  assert.equal(refusalOf("# Design review\n\nSchema: " + DESIGN_REVIEW_RECEIPT_SCHEMA + "\n"), null);
  assert.equal(refusalOf("{ not json"), null);
  assert.equal(refusalOf(`{"schema":"${DESIGN_REVIEW_RECEIPT_SCHEMA}",}`), null);
  assert.equal(refusalOf(`﻿{"schema":"${DESIGN_REVIEW_RECEIPT_SCHEMA}"}`), null);
});

test("oversized content fails open", () => {
  const body = JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_SCHEMA, padding: "x".repeat(DESIGN_REVIEW_RECEIPT_MAX_BYTES) });
  assert.ok(Buffer.byteLength(body, "utf8") > DESIGN_REVIEW_RECEIPT_MAX_BYTES);
  assert.equal(refusalOf(body), null);
  // A multi-byte payload that is under the limit in characters but over it in bytes is oversized too.
  const wide = JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_SCHEMA, padding: "é".repeat(DESIGN_REVIEW_RECEIPT_MAX_BYTES / 2) });
  assert.ok(wide.length < DESIGN_REVIEW_RECEIPT_MAX_BYTES + 100);
  assert.ok(Buffer.byteLength(wide, "utf8") > DESIGN_REVIEW_RECEIPT_MAX_BYTES);
  assert.equal(refusalOf(wide), null);
});

test("content exactly at the byte limit is still decided", () => {
  const head = JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_SCHEMA, p: "" });
  const exact = JSON.stringify({ schema: DESIGN_REVIEW_RECEIPT_SCHEMA, p: "x".repeat(DESIGN_REVIEW_RECEIPT_MAX_BYTES - Buffer.byteLength(head, "utf8")) });
  assert.equal(Buffer.byteLength(exact, "utf8"), DESIGN_REVIEW_RECEIPT_MAX_BYTES);
  assert.equal(refusalOf(exact)?.code, DESIGN_REVIEW_RECEIPT_HAND_WRITTEN);
});

test("non-string input fails open and never throws", () => {
  for (const value of [undefined, null, 0, 1, true, {}, [], Buffer.from("{}"), new Uint8Array([123, 125]), Symbol("s"), () => "{}"]) {
    assert.equal(refusalOf(value), null, `resultingContent: ${String(typeof value)}`);
  }
  assert.equal(designReviewReceiptWriteRefusal(), null);
  assert.equal(designReviewReceiptWriteRefusal(null), null);
  assert.equal(designReviewReceiptWriteRefusal({}), null);
  assert.equal(designReviewReceiptWriteRefusal("not an options object"), null);
});

test("a throwing getter on the input fails open", () => {
  const hostile = { get resultingContent() { throw new Error("boom"); } };
  assert.equal(designReviewReceiptWriteRefusal(hostile), null);
});

test("the refusal object is closed: code and message only", () => {
  const refusal = refusalOf(JSON.stringify(producedReceipt().receipt));
  assert.deepEqual(Object.keys(refusal).sort(), ["code", "message"]);
});
