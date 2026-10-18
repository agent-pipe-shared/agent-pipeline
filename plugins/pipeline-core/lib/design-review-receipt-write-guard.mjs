// SPDX-License-Identifier: SUL-1.0
/**
 * ALF-G4C: the pure predicate behind "a design review receipt is produced, never hand-written".
 *
 * The PO's design signature binds the review receipts, and a receipt carries a review time, a
 * reviewer and report digests. A receipt written by hand has an invented `reviewedAt` and
 * unverified digests, so the only admissible receipt is one written by the producer command
 * (`scripts/design-review-receipt.mjs create`), which reads the sources from disk and takes the
 * time, runner and model from the clock, the runtime and the Critic agent definition.
 *
 * `designReviewReceiptWriteRefusal({ resultingContent })` answers one question about a write: would
 * the file, AFTER the write, be a design review receipt? It decides on the RESULTING content and
 * never on the target path or extension, so
 *  - a receipt cannot be smuggled in under another file name, and
 *  - the two-step bypasses are closed (write `{}` and then edit the body in; an Edit with an empty
 *    `old_string` on an empty file), because each step is judged by what the file would contain.
 *
 * It refuses when the content parses as a JSON object whose `schema` is DESIGN_REVIEW_RECEIPT_SCHEMA
 * and says nothing else. Whether such an object is a VALID receipt is deliberately not asked: a
 * hand-written receipt with extra fields is non-canonical and is refused all the same. It returns
 * `null` ("not this predicate's business") for a non-string, oversized, non-JSON or any other
 * content, and on any throw: it fails open, because a false refusal blocks ordinary work and the
 * lifecycle writer still checks every receipt it is handed.
 *
 * Intended single call site (a protected-baseline change, made separately): the gate-strength
 * guard, `hooks/guard-gate-strength.mjs`, immediately after its GS-6 live-plugin classification
 * block and BEFORE the `if (matched === null)` branch whose early `process.exit(0)` otherwise ends
 * the run for every ordinary path. The call computes the resulting content with the guard's own
 * `simulateGateStrengthWriteContent` (`currentContent` is the file on disk, or "" if absent),
 * passes it as `resultingContent`, and on a non-null result writes `${code}: ${message}` to stderr
 * and exits 2 itself, without the human-override tail: no override capability applies, because
 * the producer command is the sanctioned route.
 *
 * Pure: no filesystem, no clock, no process. Imports only the receipt module's constants.
 */
import { DESIGN_REVIEW_RECEIPT_MAX_BYTES, DESIGN_REVIEW_RECEIPT_SCHEMA } from "./design-review-receipt.mjs";

export const DESIGN_REVIEW_RECEIPT_HAND_WRITTEN = "DRR-HAND-WRITTEN";

const PRODUCER_COMMAND = "node <plugin-root>/scripts/design-review-receipt.mjs create --repo <repo-root> --feature <feature-id> --report <critic-report-path> --prd <prd-path> --spec <spec-path> [--companion <path>]... [--previous <receipt-path>] [--open-finding <id>]... --out <receipt-path>";

const MESSAGE = `This write would leave a design review receipt (schema ${DESIGN_REVIEW_RECEIPT_SCHEMA}) in the file. `
  + "A receipt is never written or edited by hand: its review time, runner, reviewer model and digests come from the producer, "
  + "and a hand-written receipt is not admissible evidence for the design approval. "
  + `Produce it with: ${PRODUCER_COMMAND}`;

/**
 * @param {{ resultingContent?: unknown }} [input] the full file content AFTER the write
 * @returns {{ code: string, message: string } | null}
 */
export function designReviewReceiptWriteRefusal(input) {
  try {
    const content = input?.resultingContent;
    if (typeof content !== "string") return null;
    if (Buffer.byteLength(content, "utf8") > DESIGN_REVIEW_RECEIPT_MAX_BYTES) return null;
    const value = JSON.parse(content);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    if (value.schema !== DESIGN_REVIEW_RECEIPT_SCHEMA) return null;
    return { code: DESIGN_REVIEW_RECEIPT_HAND_WRITTEN, message: MESSAGE };
  } catch {
    return null;
  }
}
