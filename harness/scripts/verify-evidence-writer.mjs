#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * verify-evidence-writer.mjs — atomic evidence-slot write helper for
 * harness/scripts/verify.mjs (NVA-B-EVSLOTFIX-1).
 *
 * Extracted into its own, unprotected, independently testable module for the same reason
 * ./manual-check-logic.mjs was: verify.mjs is TP-3-protected (no in-session edit route), so
 * logic that needs to change or be unit-tested has to live somewhere else and be imported.
 *
 * Problem this closes: verify.mjs's own writeEvidence() today is a bare
 * `mkdirSync(dir, { recursive: true }); writeFileSync(path, json)` -- two concurrent verify.mjs
 * runs writing the SAME evidence/verify-latest.json can interleave, and whichever process's
 * writeFileSync call lands last wins the file regardless of which run actually finished last
 * from a reader's point of view (reproduced: backlog/evidence/2026-09-04-nva-b-evslot-1-repro-red.txt,
 * reconfirmed independently: backlog/evidence/2026-09-04-nva-b-evslotfix-1-repro-red-reconfirm.txt).
 *
 * Fix mechanism: write to a uniquely-named temporary file in the SAME directory as the target
 * (so the follow-up rename is same-filesystem, hence atomic on POSIX and NTFS), created with the
 * exclusive "wx" flag so two writers can never share one temp file, then rename it over the real
 * target. A reader opening the target mid-write always sees either the complete prior content or
 * the complete new content -- never a partial or interleaved byte sequence. This mirrors the
 * temp-file-plus-rename pattern plugins/pipeline-core/scripts/verify-journal.mjs's own (internal,
 * unexported) atomicJson() already uses for every one of its own writes -- this file is the
 * unprotected, exported equivalent for verify.mjs's evidence slot.
 *
 * What this does NOT do: it does not give the shared "verify-latest.json" pointer any run
 * identity or resolve WHICH concurrent run's result that pointer ends up naming -- that stays a
 * last-writer-wins design choice, made explicit and disclosed at verify.mjs's call site, not
 * silently inherited from this helper. What atomicity buys is narrower and sufficient: the
 * winning write is always a complete, valid, un-torn JSON document, never a corrupted mixture of
 * two writers' bytes.
 */
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Atomically write `value` (JSON-serialized with 2-space indent, newline-terminated -- the
 * exact shape verify.mjs's own writeEvidence() already produces) to `path`. Creates `path`'s
 * parent directory if it does not exist. Never observable half-written: writes to a
 * uniquely-named sibling temp file first, fsyncs it, then renames it over `path`.
 *
 * @param {string} path - absolute or relative path to the JSON evidence file to (re)write.
 * @param {unknown} value - JSON-serializable evidence payload.
 * @returns {string} `path`, for convenient chaining/logging at the call site.
 */
export function writeEvidenceAtomic(path, value) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const temp = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const fd = openSync(temp, "wx");
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  return path;
}
