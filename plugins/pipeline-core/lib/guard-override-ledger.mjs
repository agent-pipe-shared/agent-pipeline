// SPDX-License-Identifier: SUL-1.0
/**
 * D56 (2): where the guard-override audit ledger lives.
 *
 * `hooks/guard-git.mjs` appends one entry for every applied override and signed push. In the tracked
 * tree (`project/guard-override.log.jsonl`, legacy `.claude/guard-override.log.jsonl`) each entry made
 * the tree dirty, and the next clean-tree check refused. This module places the ledger under the
 * repository's common Git directory, which every worktree of the repository shares, outside the tree.
 *
 * A ledger an older build left in the tree is still read, before the new one: its entries keep counting
 * as consumed, so an override used before the move cannot be replayed. A root that is not a Git
 * repository has no common directory and keeps the tree ledger the caller resolved.
 *
 * The read side skips an unreadable file and a corrupt line, exactly as the hook did before the move (each entry is
 * one append of one whole line), so the move changes where the ledger is, not what counts as consumed.
 * A new ledger file is created owner-only (`0o600`). The `0o700` directory mode applies only when this
 * module creates the directory; a directory that already exists keeps its mode.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveGitCommonDir } from "./po-key-directory.mjs";
import { LEGACY_GUARD_AUDIT, NEUTRAL_GUARD_AUDIT } from "./project-authority.mjs";

export const GUARD_OVERRIDE_LEDGER = "agent-pipeline/guard-override.log.jsonl";

/**
 * The ledger of one physical project root: entries are appended to `path`, consumption is read from every
 * `readPaths` entry (the tree ledgers first), and `label` names the ledger in messages. `treeFallback` is the
 * repo-relative tree path used only when the root has no Git common directory.
 */
export function guardOverrideLedger(root, { treeFallback = NEUTRAL_GUARD_AUDIT, ...dependencies } = {}) {
  const tree = [NEUTRAL_GUARD_AUDIT, LEGACY_GUARD_AUDIT].map((relative) => join(root, relative));
  const common = resolveGitCommonDir(root, dependencies);
  if (common === null) {
    const path = join(root, treeFallback);
    return Object.freeze({ path, readPaths: Object.freeze([...new Set([...tree, path])]), label: treeFallback });
  }
  const path = join(common, ...GUARD_OVERRIDE_LEDGER.split("/"));
  return Object.freeze({ path, readPaths: Object.freeze([...tree, path]), label: `<git-common-dir>/${GUARD_OVERRIDE_LEDGER}` });
}

/** Every parseable entry of every read path. An absent or unreadable file adds none; a corrupt line is skipped. */
export function readGuardOverrideLedgerEntries(ledger, { read = readFileSync } = {}) {
  const entries = [];
  for (const path of ledger.readPaths) {
    let raw;
    try { raw = read(path, "utf8"); } catch { continue; }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { entries.push(JSON.parse(trimmed)); } catch { /* corrupt line: the read side stays fail-open */ }
    }
  }
  return entries;
}

/** Appends one entry, creating the private ledger directory first. False on any failure: the caller fails closed. */
export function appendGuardOverrideLedgerEntry(ledger, entry, { append = appendFileSync, mkdir = mkdirSync } = {}) {
  try {
    mkdir(dirname(ledger.path), { recursive: true, mode: 0o700 });
    append(ledger.path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
