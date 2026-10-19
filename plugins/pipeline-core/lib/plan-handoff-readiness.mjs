// SPDX-License-Identifier: SUL-1.0
/**
 * Plan-readiness hand-off inspection (AC-264, PO decision D30).
 *
 * WHY. An item is later delivered through a briefing that names (a) the Spec's acceptance criterion by its exact
 * byte span and (b) the test file that proves it. Both are validated only at dispatch time, i.e. after the PO
 * has already approved the plan. A governed project whose Spec cannot be handed off that way would therefore be
 * approved, then fail every dispatch. This module answers the question earlier: "could the delivery briefing be
 * built from this exact Spec?" It is called before the plan is submitted and again before it is presented, never
 * at approval (a refusal there would burn the human's signature).
 *
 * WHAT IT PROVES. Only what the Spec bytes themselves can prove: at least one criterion row the host parser would
 * accept, and the shape and trackability of every test path the Spec names. It does NOT prove the bound
 * requester, approval eligibility, candidate drift or any approval digest; those exist only later.
 *
 * HEURISTIC, NAMED. A Spec has no machine-readable "check" field. Check paths are every token of the Spec text
 * that looks like a repository path ending in `.test.mjs`, `.test.cjs` or `.test.js`. A mention that is not a
 * deliverable test (an example, a URL, a path in another repository) is refused as CHECK-UNADMITTED and the
 * author edits the Spec. The governance gate and the criterion rows are the firm core; this path scan is not.
 *
 * GATE. Same predicate as dispatch time: the project's governance observation `requiresEnforcement`. Only a
 * literal boolean decides. `false` skips (PLR-NO-GOVERNANCE) before the Spec is read at all; anything that is
 * not a boolean, and every unexpected fault, fails closed as PLR-HANDOFF-UNAVAILABLE.
 *
 * Read-only: no file is written, no state is touched. The only subprocess is `git check-ignore`.
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { observeGovernanceScope } from './governance-scope.mjs';
import { parseAcceptedCriticCriterion, scanAcceptedCriterionRows } from './critic-accepted-contract.mjs';
import { validateItemDeliveryBriefing } from './native-goldfish-host-return.mjs';

export const PLAN_HANDOFF_CODES = Object.freeze([
  'PLR-NO-GOVERNANCE', 'PLR-HANDOFF-READY', 'PLR-HANDOFF-NO-CRITERION', 'PLR-HANDOFF-SPEC-UNREADABLE',
  'PLR-HANDOFF-CHECK-UNADMITTED', 'PLR-HANDOFF-CHECK-NOT-TRACKABLE', 'PLR-HANDOFF-UNAVAILABLE',
]);

const SHA = /^[a-f0-9]{64}$/u;
const SPEC_PATH = /^specs\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9_./-]+$/u;
const MAX_SPEC_BYTES = 1048576;
// The statuses scripts/dispatch-briefing.mjs admits for an item criterion at dispatch time.
const ADMITTED_CRITERION_STATUSES = Object.freeze(['explicit-actual-independent-pass', 'no-explicit-criterion']);
// A path-like token ending in a test-file suffix. The class includes `.` so `tests/../x.test.js` is captured whole
// (and then refused by the shape rule) instead of being truncated to a harmless-looking tail.
const CHECK_TOKEN = /[A-Za-z0-9_./-]+\.test\.(?:mjs|cjs|js)(?![A-Za-z0-9_-]|\.[A-Za-z0-9_])/gu;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const refuse = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const unavailable = (why) => refuse('PLR-HANDOFF-UNAVAILABLE', `the plan hand-off could not be inspected (${why}); fail closed`);

/** Strict, physical read of the Spec: repository-relative, no symlink component, single regular file, exact digest. */
function readSpec(root, specPath, expectedSha256) {
  try {
    if (typeof specPath !== 'string' || !SPEC_PATH.test(specPath) || typeof expectedSha256 !== 'string' || !SHA.test(expectedSha256)) return null;
    const parts = specPath.split('/');
    if (parts.some((part) => part === '.' || part === '..' || part === '')) return null;
    let target = root;
    for (const part of parts) {
      target = join(target, part);
      if (lstatSync(target).isSymbolicLink()) return null;
    }
    const seen = lstatSync(target);
    if (!seen.isFile() || seen.nlink !== 1 || seen.size < 1 || seen.size > MAX_SPEC_BYTES) return null;
    const bytes = readFileSync(target);
    if (bytes.length < 1 || bytes.length > MAX_SPEC_BYTES || sha256(bytes) !== expectedSha256) return null;
    // Same decoder options as the host parser, so the byte offsets of its rows line up with these bytes.
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { bytes, source };
  } catch { return null; }
}

/** 'present' | 'absent' for a deliverable path; null when the path can never be a delivered test file. */
function checkState(root, path) {
  const parts = path.split('/');
  let target = root;
  for (let index = 0; index < parts.length; index++) {
    target = join(target, parts[index]);
    let seen;
    try { seen = lstatSync(target); } catch (error) {
      if (error?.code === 'ENOENT') return 'absent';
      throw error;
    }
    if (seen.isSymbolicLink()) return null;
    if (index === parts.length - 1 ? !seen.isFile() : !seen.isDirectory()) return null;
  }
  return 'present';
}

/**
 * @param {{rootDir: string, specPath: string, expectedSpecSha256: string}} input
 * @param {{observeScope?: (options: {rootDir: string}) => {requiresEnforcement: boolean}}} [deps]
 * @returns {{ok: true, skipped: true, code: 'PLR-NO-GOVERNANCE'}
 *   | {ok: true, code: 'PLR-HANDOFF-READY', admittedCriteria: string[], checks: {path: string, state: 'present'|'absent'}[]}
 *   | {ok: false, code: string, message: string, path?: string}}
 */
export function inspectPlanDeliveryHandoff(input, deps = {}) {
  try {
    const rootDir = input?.rootDir;
    if (typeof rootDir !== 'string' || rootDir === '') return unavailable('no project root');
    const observe = deps?.observeScope ?? ((options) => observeGovernanceScope(options));
    const scope = observe({ rootDir });
    if (typeof scope?.requiresEnforcement !== 'boolean') return unavailable('governance observation is not decisive');
    if (scope.requiresEnforcement === false) return { ok: true, skipped: true, code: 'PLR-NO-GOVERNANCE' };

    const root = realpathSync(resolve(rootDir));
    const specPath = input.specPath;
    const spec = readSpec(root, specPath, input.expectedSpecSha256);
    if (spec === null) return refuse('PLR-HANDOFF-SPEC-UNREADABLE', 'the Spec is not a readable, unchanged, regular UTF-8 file at its recorded path and digest');
    const { bytes, source } = spec;

    // Criterion rows: the host parser's own scan, each confirmed through the parser the delivery briefing will use.
    const featureId = specPath.split('/')[1];
    const sourceBindings = [{ path: specPath, sha256: input.expectedSpecSha256, role: 'spec' }];
    const admitted = [];
    for (const row of scanAcceptedCriterionRows(source)) {
      if (row.normative !== true || !Number.isSafeInteger(row.startByte) || !Number.isSafeInteger(row.endByte)) continue;
      const locator = { schema: 'pipeline.critic-criterion-locator.v1', sourcePath: specPath, sourceSha256: input.expectedSpecSha256, criterionId: row.id,
        startByte: row.startByte, endByte: row.endByte, excerptSha256: sha256(bytes.subarray(row.startByte, row.endByte)) };
      const parsed = parseAcceptedCriticCriterion({ sourceBytes: new Uint8Array(bytes), locator, packageContext: { featureId, sourceBindings } });
      if (ADMITTED_CRITERION_STATUSES.includes(parsed.status)) admitted.push({ id: row.id, locator });
    }
    if (admitted.length === 0) return refuse('PLR-HANDOFF-NO-CRITERION', 'the Spec has no normative acceptance criterion row the host parser admits for a delivery briefing');

    // Check paths: shape (the briefing validator's own rule) first for every path, then trackability and presence.
    const paths = [...new Set([...source.matchAll(CHECK_TOKEN)].map((match) => match[0]))].sort();
    const deliveryFor = (path) => ({ schema: 'pipeline.item-delivery-briefing.v1', sliceId: 'plan-readiness', itemId: 'plan-readiness-check',
      criterionLocator: admitted[0].locator, checks: [{ id: 'handoff-check', path, dependencies: [path] }] });
    for (const path of paths) {
      if (!validateItemDeliveryBriefing(deliveryFor(path)).ok) {
        return refuse('PLR-HANDOFF-CHECK-UNADMITTED', 'a test path named in the Spec cannot be a delivery check (not a normalized repository-relative .test.mjs/.test.cjs/.test.js path)', { path: path.slice(0, 240) });
      }
    }
    const checks = [];
    for (const path of paths) {
      const ignored = spawnSync('git', ['check-ignore', '-q', '--', path], { cwd: root, encoding: 'utf8', timeout: 30000 });
      if (ignored.error || ignored.signal || typeof ignored.status !== 'number') throw new Error('git check-ignore unavailable');
      if (ignored.status === 0) return refuse('PLR-HANDOFF-CHECK-NOT-TRACKABLE', 'a test path named in the Spec is git-ignored, so a delivery commit could never contain it', { path });
      if (ignored.status !== 1) throw new Error('git check-ignore refused');
      const state = checkState(root, path);
      if (state === null) return refuse('PLR-HANDOFF-CHECK-UNADMITTED', 'a test path named in the Spec is a symlink or has a non-file or non-directory component', { path });
      checks.push({ path, state });
    }
    return { ok: true, code: 'PLR-HANDOFF-READY', admittedCriteria: admitted.map((entry) => entry.id), checks };
  } catch { return unavailable('unexpected fault'); }
}
