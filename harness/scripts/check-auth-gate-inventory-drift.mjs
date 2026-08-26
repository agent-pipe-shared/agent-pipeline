#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Fail-closed structural check: refuses a NEWLY-introduced one-off
 * human-approval UX that `docs/human-authorization-inventory.md` does not
 * yet acknowledge (`unified-human-authorization-ux` work package #4,
 * backlog/items/2026-08-02-unified-human-authorization-ux.md).
 *
 * Discovery method (deliberately narrow — see rationale below for what was
 * cut and why):
 *
 * 1. CLI command handlers in `plugins/pipeline-core/scripts/pipeline-state.mjs`:
 *    every double-quoted string literal matching `^(approve|submit|authorize)-
 *    [a-z][a-z0-9-]*$` (case labels / `sub === "..."` comparisons). This file's
 *    CLI vocabulary is exactly what the inventory doc's own header names as
 *    its search target, and each such literal maps 1:1 onto a doc-documented
 *    command token (verified: `submit-plan`, `approve-plan`, `approve-push`,
 *    `approve-deploy` all appear as inline-code spans in the doc today).
 * 2. The critical-action `kind` family: the `CRITICAL_ACTION_KINDS` frozen
 *    array (`plugins/pipeline-core/lib/critical-action-approval-request.mjs`),
 *    the `CRITICAL_COMMAND_KINDS` frozen array
 *    (`plugins/pipeline-core/scripts/po-human-approval.mjs`), and the outer
 *    wrapper `kind` literal(s) passed to `createPoApprovalIntent({ kind: "..." })`
 *    within `critical-action-approval-request.mjs` itself (currently just
 *    `"critical-action"`). Adding a member to either frozen array, or a new
 *    `createPoApprovalIntent` call site with a new literal `kind`, is exactly
 *    how `push`/`deploy`/`publication`/`governance-fork-disposition`/
 *    `feature-package-reconcile` were each introduced historically (see the
 *    "fifth kind must be an explicit decision" comment in
 *    `critical-action-approval-request.mjs`) — this is the family's own
 *    governed extension point.
 *
 * Deliberately NOT scanned (narrowed after a false-positive dry run):
 *
 * - `po-human-approval.mjs`'s own `approve-*`/`submit-*`/`authorize-*` CLI
 *   verbs (`approve-critical`, `authorize-critical`, `approve-fork-disposition`,
 *   `approve-all`, ...) are NOT literal-matched against the doc. The inventory
 *   doc documents that file's surfaces by `kind` value plus function name
 *   (`criticalApprovalRequest`, `runForkDispositionApproval`), never by the
 *   raw CLI verb — literal-matching those verbs produced four false positives
 *   on the very first dry run against a doc that is otherwise accurate. The
 *   kind-family scan above is the non-noisy signal for this file's surfaces.
 * - A blanket `kind: "..."` scan across `pipeline-state.mjs` was tried and
 *   rejected: that file uses the property name `kind` for several unrelated
 *   domains (`po-authority-design-review`, `reconcile`, `one-time-guard-override`,
 *   ...) that have nothing to do with human-approval gates, so a blanket scan
 *   is pure noise. Only the two purpose-built enum declarations plus the
 *   two-call-site outer-wrapper literal are read.
 * - Adapters entirely outside `pipeline-state.mjs`/`po-human-approval.mjs`
 *   (guard-maintenance-window `guard-lift`, human-guard-override
 *   `guard-override`, threat-model, security-authority) are out of scope:
 *   each is its own free-form `kind` string with no shared enum to anchor a
 *   discovery signal on, and none of the four is named in this check's own
 *   briefing context as a surface it needs to discover. Chasing them would
 *   require scanning an open-ended set of library files for a shape that,
 *   unlike the critical-action family, has no fixed extension point.
 *
 * Acknowledgment surface: a discovered token counts as acknowledged if it
 * appears as an inline-code span (`` `token` ``) ANYWHERE in
 * `docs/human-authorization-inventory.md` — not only inside the two tables.
 * The doc's own "Explicitly out of scope" section is where it records
 * `submit-plan` as a deliberately-excluded non-gate (with reasoning); that is
 * a real acknowledgment this check must accept, not a gap to paper over by
 * forcing `submit-plan` into a table that would then misrepresent it as a
 * gate. Requiring literal presence in ONE of the two tables specifically
 * would make this check reject the doc's own accurate classification.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PIPELINE_STATE_PATH = "plugins/pipeline-core/scripts/pipeline-state.mjs";
const PO_HUMAN_APPROVAL_PATH = "plugins/pipeline-core/scripts/po-human-approval.mjs";
const CRITICAL_ACTION_PATH = "plugins/pipeline-core/lib/critical-action-approval-request.mjs";
const INVENTORY_DOC_PATH = "docs/human-authorization-inventory.md";

function defaultReadText(root) {
  return (repoRelativePath) => readFileSync(join(root, repoRelativePath), "utf8");
}

/** Every `"approve-…"`/`"submit-…"`/`"authorize-…"` double-quoted CLI-command literal. */
export function extractCliCommandLiterals(text) {
  const tokens = new Set();
  for (const match of text.matchAll(/"((?:approve|submit|authorize)-[a-z][a-z0-9-]*)"/g)) tokens.add(match[1]);
  return [...tokens].sort();
}

/** The string entries of a `const NAME = Object.freeze([...])` array literal. */
export function extractFrozenArray(text, constName) {
  const declaration = text.match(new RegExp(`${constName}\\s*=\\s*Object\\.freeze\\(\\[([^\\]]*)\\]\\)`));
  if (!declaration) return [];
  return [...declaration[1].matchAll(/"([a-z][a-z0-9-]*)"/g)].map((match) => match[1]);
}

/** The `kind` literal(s) passed to every `createPoApprovalIntent({ kind: "..." })` call site. */
export function extractCreatePoApprovalIntentKinds(text) {
  const tokens = new Set();
  for (const match of text.matchAll(/createPoApprovalIntent\(\{\s*\n\s*kind:\s*"([a-z][a-z0-9-]*)"/g)) tokens.add(match[1]);
  return [...tokens].sort();
}

function isAcknowledged(docText, token) {
  return docText.includes(`\`${token}\``);
}

export function checkAuthGateInventoryDrift(rootInput, options = {}) {
  const root = resolve(rootInput);
  const readText = options.readText ?? defaultReadText(root);
  const findings = [];

  const sources = {};
  for (const path of [PIPELINE_STATE_PATH, PO_HUMAN_APPROVAL_PATH, CRITICAL_ACTION_PATH, INVENTORY_DOC_PATH]) {
    try {
      sources[path] = readText(path);
    } catch (error) {
      findings.push(`AUTH-GATE-SOURCE-UNREADABLE ${path}: ${error.message}`);
    }
  }
  if (findings.length) return { findings, stats: { discovered: 0, cliCommands: 0, kinds: 0 } };

  const docText = sources[INVENTORY_DOC_PATH];

  const cliTokens = extractCliCommandLiterals(sources[PIPELINE_STATE_PATH])
    .map((token) => ({ token, source: PIPELINE_STATE_PATH }));

  const criticalActionKinds = extractFrozenArray(sources[CRITICAL_ACTION_PATH], "CRITICAL_ACTION_KINDS");
  const criticalCommandKinds = extractFrozenArray(sources[PO_HUMAN_APPROVAL_PATH], "CRITICAL_COMMAND_KINDS");
  const wrapperKinds = extractCreatePoApprovalIntentKinds(sources[CRITICAL_ACTION_PATH]);
  if (criticalActionKinds.length === 0) findings.push(`AUTH-GATE-SIGNAL-MISSING CRITICAL_ACTION_KINDS not found in ${CRITICAL_ACTION_PATH}`);
  if (criticalCommandKinds.length === 0) findings.push(`AUTH-GATE-SIGNAL-MISSING CRITICAL_COMMAND_KINDS not found in ${PO_HUMAN_APPROVAL_PATH}`);
  if (wrapperKinds.length === 0) findings.push(`AUTH-GATE-SIGNAL-MISSING createPoApprovalIntent kind literal not found in ${CRITICAL_ACTION_PATH}`);

  const kindTokens = [...new Set([...criticalActionKinds, ...criticalCommandKinds, ...wrapperKinds])]
    .sort()
    .map((token) => ({ token, source: `${CRITICAL_ACTION_PATH} / ${PO_HUMAN_APPROVAL_PATH} kind family` }));

  const discovered = [...cliTokens, ...kindTokens];
  for (const { token, source } of discovered) {
    if (!isAcknowledged(docText, token)) {
      findings.push(`AUTH-GATE-UNDOCUMENTED ${token} (discovered in ${source}) is not acknowledged in ${INVENTORY_DOC_PATH}`);
    }
  }

  findings.sort();
  return {
    findings,
    stats: { discovered: discovered.length, cliCommands: cliTokens.length, kinds: kindTokens.length },
  };
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--root")) {
    process.stderr.write("usage: check-auth-gate-inventory-drift.mjs [--root <repository>]\n");
    process.exitCode = 2;
    return;
  }
  const root = args.length ? args[1] : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  try {
    const result = checkAuthGateInventoryDrift(root);
    if (result.findings.length) {
      for (const item of result.findings) process.stderr.write(`AUTH-GATE-INVENTORY-DRIFT ${item}\n`);
      process.stderr.write(`Auth-gate inventory drift check failed: ${result.findings.length} finding(s).\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(
      `Auth-gate inventory drift check clean: ${result.stats.discovered} surface(s) discovered `
      + `(${result.stats.cliCommands} CLI command(s), ${result.stats.kinds} kind(s)), all acknowledged.\n`,
    );
  } catch (error) {
    process.stderr.write(`Auth-gate inventory drift check unavailable: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
