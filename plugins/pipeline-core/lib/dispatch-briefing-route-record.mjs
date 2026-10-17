// SPDX-License-Identifier: SUL-1.0

/**
 * Briefing route record PRODUCER (ALF-C-P19-05D, AC-127, V-10 of
 * pipeline.claude-windows-greenfield-lifecycle-not-walkable).
 *
 * ALF-C-P19-05C bound the route digest to the inline briefing inside hooks/guard-dispatch.mjs
 * (`evaluateBriefingRoute`), but no product flow wrote the record the guard reads, so the binding never fired.
 * This module is that writer. It owns no digest and no record format: it builds the record with the guard's own
 * exported `buildBriefingRoute` (which calls the same `briefingSha256` the guard recomputes), writes it at the
 * guard's own `briefingRoutePath`, and reads it back through the guard's own `evaluateBriefingRoute`, so the
 * producer and the guard cannot drift apart. The guard file is imported read-only; its entrypoint gate makes the
 * import free of hook side effects.
 *
 * Contract. `prompt` must be the exact briefing text that will be sent inline as the Agent/Task prompt (CRLF
 * and LF are equivalent: the shared canonical form normalises CRLF to LF and strips nothing else). The slice is
 * taken from the briefing's `Slice:` line with the guard's own `parseDispatchSlice`, so the producer and the
 * guard always agree on which slice a briefing names. A briefing that names no single slice is not bound by the
 * guard, so nothing is written for it.
 *
 * Result statuses: `recorded` (new record), `replaced` (a record for the slice existed with another digest or
 * was unreadable; the guard's own advice for a stale route is to issue a new one), `unchanged` (identical
 * record already present), `not-applicable` (no single `Slice:` line), `refused` (typed code, nothing trusted).
 * The result never carries an absolute path.
 */
import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { briefingRoutePath, buildBriefingRoute, evaluateBriefingRoute } from "../hooks/guard-dispatch.mjs";
import { parseDispatchSlice } from "./dispatch-policy.mjs";

export const DISPATCH_BRIEFING_ROUTE_RESULT_SCHEMA = "pipeline.dispatch-briefing-route-record-result.v1";

const ROUTE_RECORD_MAX_BYTES = 4096; // the guard refuses a larger record as invalid
const DIGEST = /^[a-f0-9]{64}$/u;

function outcome(status, code, fields = {}) {
  return { schema: DISPATCH_BRIEFING_ROUTE_RESULT_SCHEMA, status, code, sliceId: null, path: null, digest: null, ...fields };
}

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

function digestOfExistingRecord(path, size) {
  if (size > ROUTE_RECORD_MAX_BYTES) return null;
  try {
    const digest = JSON.parse(readFileSync(path, "utf8"))?.briefingSha256;
    return typeof digest === "string" && DIGEST.test(digest) ? digest : null;
  } catch {
    return null;
  }
}

/**
 * Write the route record that binds the briefing about to be sent to its slice.
 * @param {{ root: string, prompt: string, origin?: "admission" }} input `root` is the absolute project root the guard
 *   resolves (CLAUDE_PROJECT_DIR, else the hook payload cwd); `prompt` is the exact inline briefing text. `origin`
 *   is optional: absent, the record keeps its three keys (the producer record of role-dispatch-preflight, which stays
 *   authoritative against a tampered briefing); "admission" is the guard's own provenance mark, the one extra key of
 *   a record a later admission of the same slice may supersede (V-10, latest admission wins).
 */
export function recordDispatchBriefingRoute({ root, prompt, origin } = {}) {
  if (typeof prompt !== "string" || prompt.trim() === "") return outcome("refused", "DBRR-PROMPT");
  if (typeof root !== "string" || root === "" || !isAbsolute(root)) return outcome("refused", "DBRR-ROOT");
  const absoluteRoot = resolve(root);
  try {
    if (!statSync(absoluteRoot).isDirectory()) return outcome("refused", "DBRR-ROOT");
  } catch {
    return outcome("refused", "DBRR-ROOT");
  }

  const sliceId = parseDispatchSlice(prompt).sliceId;
  if (sliceId === null) return outcome("not-applicable", "DBRR-NO-SLICE");
  const shown = `evidence/dispatch-route-${sliceId}.json`;
  let record;
  try {
    record = buildBriefingRoute({ sliceId, briefing: prompt, origin });
  } catch {
    return outcome("refused", "DBRR-BUILD", { sliceId, path: shown });
  }
  const bound = { sliceId, path: shown, digest: record.briefingSha256 };
  const content = `${JSON.stringify(record)}\n`;
  const evidenceDir = join(absoluteRoot, "evidence");
  const target = briefingRoutePath(absoluteRoot, sliceId);

  let status = "recorded";
  let previousDigest = null;
  let existing;
  try {
    const dir = lstatOrNull(evidenceDir);
    if (dir === null) mkdirSync(evidenceDir, { recursive: true });
    else if (!dir.isDirectory()) return outcome("refused", "DBRR-EVIDENCE-DIR", bound); // also a symlink or junction

    existing = lstatOrNull(target);
    if (existing !== null) {
      if (!existing.isFile()) return outcome("refused", "DBRR-TARGET", bound); // never follow or replace a non-regular entry
      status = "replaced";
      previousDigest = digestOfExistingRecord(target, existing.size);
      if (existing.size <= ROUTE_RECORD_MAX_BYTES && readFileSync(target, "utf8") === content) status = "unchanged";
    }
  } catch (error) {
    return outcome("refused", "DBRR-WRITE", { ...bound, detail: String(error?.code ?? "unknown") });
  }

  if (status !== "unchanged") {
    // Atomic replace: a hook reading mid-write must never see a partial record (it would refuse as invalid).
    const temp = join(evidenceDir, `.dispatch-route-${sliceId}.${randomBytes(6).toString("hex")}.tmp`);
    try {
      writeFileSync(temp, content, { flag: "wx" });
      renameSync(temp, target);
    } catch (error) {
      rmSync(temp, { force: true });
      return outcome("refused", "DBRR-WRITE", { ...bound, detail: String(error?.code ?? "unknown") });
    }
  }

  // Read the record back through the guard's own reader: what the guard will see is what is proven here.
  const read = evaluateBriefingRoute({ prompt, root: absoluteRoot });
  if (read.status !== "match" || read.digest !== record.briefingSha256 || (read.origin ?? null) !== (record.origin ?? null)) {
    return outcome("refused", "DBRR-READBACK", { ...bound, detail: String(read.status) });
  }
  return outcome(status, status === "unchanged" ? "DBRR-UNCHANGED" : status === "replaced" ? "DBRR-REPLACED" : "DBRR-RECORDED", {
    ...bound,
    ...(status === "replaced" ? { previousDigest } : {}),
  });
}
