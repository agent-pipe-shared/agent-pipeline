// SPDX-License-Identifier: SUL-1.0
/**
 * The one module that owns "which repository paths may change without invalidating a Verify or Security record"
 * (candidate 19, stage 1 of the order of work in docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md,
 * "Proposed amendment of 2026-11-04").
 *
 * RECORD_ONLY_PATH_PATTERNS moved here unchanged from lib/release-promotion-envelope.mjs, which re-exports it and
 * isRecordOnlyPath under the same names; the production push gate (hooks/guard-push.mjs, scripts/push-prepare.mjs) therefore
 * accepts exactly what it accepted before. Nothing is widened by this module.
 *
 * AUTHORITY_CARRY_EXTENSION_PATTERNS names the two classes the authority carry-forward draft needs in addition. They are
 * NOT part of the record-only set: the release-promotion envelope does not accept them, and nothing consumes the extension yet.
 */

export const RECORD_ONLY_PATH_PATTERNS = Object.freeze([
  /^evidence\/.*$/u,
  /^backlog\/evidence\/.*$/u,
  /^specs\/[^/]+\/evidence\/.*$/u,
  /^specs\/[^/]+\/lifecycle\.json$/u,
  /^specs\/[^/]+\/result\.md$/u,
  /^backlog\/STATUS\.md$/u,
  /^backlog\/index\.json$/u,
  /^backlog\/transitions\.ndjson$/u,
  /^backlog\/items\/.*$/u,
  /^backlog\/PO-TOPICS\.md$/u,
  /^docs\/state\.md$/u,
  /^\.claude\/pipeline-state\.json$/u,
  /^project\/pipeline-state\.json$/u,
]);

export const AUTHORITY_CARRY_EXTENSION_PATTERNS = Object.freeze([
  /^specs\/[^/]+\/audit-bundles\/.+$/u,
  // The repository-root location the bundle writer actually uses (candidate 30e); the specs/<feature>/ form above is kept.
  /^audit-bundles\/[^/]+\/.+$/u,
  /^project\/push-threat-model\.md$/u,
]);

function normalizePath(path) {
  return typeof path === "string" ? path.replaceAll("\\", "/").replace(/^\.\//u, "") : null;
}

export function isRecordOnlyPath(path) {
  const normalized = normalizePath(path);
  if (normalized === null) return false;
  return RECORD_ONLY_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** True for the two classes only the authority carry-forward draft adds. Not accepted by the promotion envelope. */
export function isAuthorityCarryExtensionPath(path) {
  const normalized = normalizePath(path);
  if (normalized === null) return false;
  return AUTHORITY_CARRY_EXTENSION_PATTERNS.some((pattern) => pattern.test(normalized));
}
