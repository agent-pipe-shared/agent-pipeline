// SPDX-License-Identifier: SUL-1.0

/**
 * Canonical default path for `pipeline.verify-evidence.v0` artifacts.
 *
 * WHY. Three components each held their own hardcoded copy of this same
 * repo-relative path: `verify-evidence-producer.mjs` (which required an
 * explicit `--out` with no default at all), `guard-push.mjs` (which reads
 * the literal `"evidence/verify-latest.json"` when checking freshness), and
 * `push-prepare.mjs` (the same literal). A default-less producer plus two
 * independently hardcoded consumer literals means a bare producer
 * invocation with no `--out` flag was refused outright, and any future
 * rename of the consumer-side literal in only one of the two guard/prepare
 * call sites would silently desynchronize what the producer writes from
 * what a push gate reads -- exactly the gap
 * backlog/items/2026-08-18-... (pipeline.canonical-verify-evidence-path)
 * was opened to close (source: greenfield happy-path handover, P0-5).
 *
 * This module is the single source of truth: importers use this constant
 * instead of restating the literal.
 */
export const VERIFY_EVIDENCE_DEFAULT_PATH = "evidence/verify-latest.json";
