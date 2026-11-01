#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// D231 owner route (PO decision 2026-11-01, option A). A plain-terminal process may own the State write of EXACTLY FOUR Close-route
// entries, and only here. For a project WITH a session-authority catalogue those entries refuse on the direct route
// (SDC-AUTHORITY-UNAVAILABLE) because the State write must be owner-bound to an armed onboarding-continuity member.
//
//   node continuity-owner-route.mjs run --root <root> --lifecycle <close lifecycle id> -- <entry> [<entry flags>]
//   node continuity-owner-route.mjs release-orphan --root <root>          (also run by `routine-repair.mjs run heal`)
//
// ONE `run` call = bind, exactly one entry through the existing port.executeCompanionOperation (every gate unchanged), release, all in
// this process (the handles are process-local capabilities). Allowlist: continuity-result-bootstrap-plan, continuity-result-bootstrap-apply,
// continuity-result-close-plan, continuity-result-close-apply. close-feature is NOT on it (separate slice); the entry itself writes State,
// this script never does, and it never forces the registry or a member. The entry's own stdout passes through; the one-line result
// envelope (pipeline.continuity-owner-route-result.v1) goes to stderr. Exit: 0 completed, 2 refused, 3 held (a binding remains: run heal).
import { existsSync, realpathSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, resolve } from 'node:path';
import { inspectSignedDescriptorCustodyRepository } from '../lib/worktree-lifecycle.mjs';
import { createSourceOwnedContinuityOwnerRouteRequesterRuntime, inspectSourceOwnedContinuityOwnerRouteCourse } from '../lib/session-requester-bridge.mjs';
import { bindOnboardingSessionCleanup, observeSessionCleanupState, releaseOnboardingSessionCleanup,
  executeOnboardingContinuityOwnerRouteEntry, releaseDeadContinuityOwnerRouteBinding } from '../lib/onboarding-continuity.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROUTINE_REPAIR = fileURLToPath(new URL('./routine-repair.mjs', import.meta.url));
const SESSION_AUTHORITY_REPAIR = fileURLToPath(new URL('./session-authority-repair.mjs', import.meta.url));
const PIPELINE_STATE = fileURLToPath(new URL('./pipeline-state.mjs', import.meta.url));
const CLOSE_COORDINATOR = fileURLToPath(new URL('./close-coordinator.mjs', import.meta.url));
export const OWNER_ROUTE_RESULT_SCHEMA = 'pipeline.continuity-owner-route-result.v1';
export const OWNER_ROUTE_ORPHAN_SCHEMA = 'pipeline.continuity-owner-route-orphan-release.v1';
const ALLOWLIST = Object.freeze(['continuity-result-bootstrap-plan', 'continuity-result-bootstrap-apply', 'continuity-result-close-plan', 'continuity-result-close-apply']);
const USAGE = `node ${SELF} run --root <root> --lifecycle <close lifecycle id> -- <entry> [<entry flags>] (entries: ${ALLOWLIST.join(', ')})`;
const healCommand = (root) => `node ${ROUTINE_REPAIR} run heal --root ${root} --reason "<why the owner-route call was interrupted>"`;

class OwnerRouteRefusal extends Error {
  constructor(code, message, { held = false } = {}) { super(message); this.name = 'OwnerRouteRefusal'; this.code = code; this.held = held; }
}
const refuse = (code, message, options) => { throw new OwnerRouteRefusal(code, message, options); };

function parseRun(argv) {
  const dash = argv.indexOf('--');
  if (dash < 0) refuse('COR-USAGE', `the entry follows a literal "--": ${USAGE}`);
  const head = argv.slice(1, dash), tail = argv.slice(dash + 1);
  for (const token of head) {
    if (token.startsWith('-') && token !== '--root' && token !== '--lifecycle') refuse('COR-FOREIGN-FLAG', `${token} is not a flag of this command; the owner route accepts only --root and --lifecycle before "--": ${USAGE}`);
  }
  if (head.length !== 4 || head[0] !== '--root' || head[2] !== '--lifecycle' || tail.length < 1) refuse('COR-USAGE', USAGE);
  const [, root, , lifecycleId] = head;
  if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root || process.cwd() !== root) refuse('COR-USAGE', `--root must be the absolute real path of the current directory: ${USAGE}`);
  return { root, lifecycleId, entry: tail[0], tail };
}

function courseMessage(refusal, root, entry) {
  switch (refusal.code) {
    case 'COR-BINDING-HELD':
      return `a session-cleanup binding is already held (an owner-route call that was killed between bind and release leaves one). Release it, then repeat this call: ${healCommand(root)}`;
    case 'COR-LIFECYCLE-NOT-STARTED':
      return `the owner route is admitted only after the Close lifecycle of the active feature reached checkpointed (${refusal.reason}). Start it with: node ${CLOSE_COORDINATOR} plan-start ... then plan-transition --phase checkpointed`;
    default:
      return `${refusal.reason ?? refusal.code}; ${entry} stays refused until the State is admissible`;
  }
}

async function run(argv) {
  const { root, lifecycleId, entry, tail } = parseRun(argv);
  if (entry === 'close-feature') {
    refuse('COR-CLOSE-FEATURE-UNAVAILABLE', 'close-feature cannot run on the owner route yet: its State write runs in the retired-owner terminal, which needs (a) the retirement of the per-invocation owner descriptor before the entry runs and (b) a retired terminal for a physical-readback requester (today only the controlled-unit-method fixture assurance has one). That is a separate slice. The route that works today: the direct route for a project without a catalogue, or the attended close (an operator-held session that owns the lifecycle), see skills/close-feature/SKILL.md.');
  }
  if (!ALLOWLIST.includes(entry)) refuse('COR-ENTRY-OUTSIDE-ALLOWLIST', `${entry} is not an owner-route entry; the closed list is ${ALLOWLIST.join(', ')}. Everything else keeps its present route.`);
  let repository;
  try { repository = inspectSignedDescriptorCustodyRepository(root); } catch { refuse('COR-USAGE', `${root} is not a repository root`); }
  if (repository.primaryRoot !== root) refuse('COR-USAGE', `${root} is not the repository root`);
  if (!existsSync(join(repository.commonDir, 'agent-pipeline', 'session-authority', 'catalogue.json'))) {
    refuse('COR-NO-CATALOGUE', `this project has no session-authority catalogue, so ${entry} needs no owner: run it on the direct route, node ${PIPELINE_STATE} ${entry} ...`);
  }
  const course = inspectSourceOwnedContinuityOwnerRouteCourse({ rootDir: root, lifecycleId });
  if (course.status !== 'current') refuse(course.code, courseMessage(course, root, entry));
  let runtime;
  try { runtime = createSourceOwnedContinuityOwnerRouteRequesterRuntime({ rootDir: root }); }
  catch (error) {
    refuse('COR-REQUESTER-UNAVAILABLE', `the owner-route requester was refused (${error?.code ?? 'unavailable'}); this script is admitted only when started exactly as ${USAGE}, from the repository root, once per process`);
  }
  try {
    return await runtime.run(async () => {
      try {
        bindOnboardingSessionCleanup({ rootDir: root, sessionCleanup: runtime.sessionCleanup,
          expectedStateSha256: runtime.expectedStateSha256, expectedRevision: runtime.expectedRevision });
      } catch (error) {
        refuse('COR-MEMBER-UNAVAILABLE', `the onboarding-continuity member could not be armed (${error?.code ?? 'error'}: ${String(error?.message ?? error).slice(0, 200)}). Inspect with: node ${SESSION_AUTHORITY_REPAIR} inspect --root ${root}; release a leftover with: ${healCommand(root)}`, { held: true });
      }
      // Named test seam (S-ABORT): only ever kills this process after the bind, to leave the orphan the heal path must release.
      if (process.env.PIPELINE_COR_TEST_ABORT_AFTER_BIND === '1') process.kill(process.pid, 'SIGKILL');
      const bound = observeSessionCleanupState(root);
      const expectedStateSha256 = createHash('sha256').update(readFileSync(bound.path)).digest('hex');
      let result;
      try {
        result = executeOnboardingContinuityOwnerRouteEntry({ rootDir: root, sessionCleanup: runtime.sessionCleanup, entry, argv: [...tail], expectedStateSha256 });
      } catch (error) {
        result = { status: 'unavailable', code: error?.code ?? 'COR-ENTRY-REFUSED', attempted: false, exitCode: null };
      }
      if (result.status === 'unavailable' && result.attempted === true) {
        refuse('COR-ENTRY-HELD', `the entry was attempted and then refused (${result.code}); the binding is kept because a write may have happened. Release it only after reading the State: ${healCommand(root)}`, { held: true });
      }
      try {
        const before = observeSessionCleanupState(root);
        releaseOnboardingSessionCleanup({ rootDir: root, sessionCleanup: runtime.sessionCleanup, expectedStateSha256: before.stateSha256, expectedRevision: before.revision });
        const after = observeSessionCleanupState(root);
        if (after.sessionCleanup !== null || after.orphanBinding) throw new Error('binding still held');
      } catch (error) {
        refuse('COR-RELEASE-HELD', `the entry ran but its owner-route binding could not be released (${error?.code ?? 'error'}). Release it with: ${healCommand(root)}`, { held: true });
      }
      if (result.status !== 'completed') refuse(result.code ?? 'COR-ENTRY-REFUSED', `the entry was refused before it wrote anything (${result.code ?? 'refused'}); the binding is released`);
      return { status: result.exitCode === 0 ? 'completed' : 'refused', code: result.exitCode === 0 ? null : 'COR-ENTRY-EXIT', entry, exitCode: result.exitCode, released: true };
    });
  } finally { await runtime.dispose(); }
}

function releaseOrphan(argv) {
  if (argv.length !== 3 || argv[1] !== '--root' || !isAbsolute(argv[2]) || resolve(argv[2]) !== argv[2]) refuse('COR-USAGE', `node ${SELF} release-orphan --root <root>`);
  return { schema: OWNER_ROUTE_ORPHAN_SCHEMA, ...releaseDeadContinuityOwnerRouteBinding({ rootDir: argv[2] }) };
}

const entry = process.argv[1] && resolve(process.argv[1]);
if (entry === SELF) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'release-orphan') {
    try { process.stdout.write(JSON.stringify(releaseOrphan(argv)) + '\n'); }
    catch (error) {
      process.stdout.write(JSON.stringify({ schema: OWNER_ROUTE_ORPHAN_SCHEMA, status: 'refused', code: /^COR-[A-Z0-9-]{1,80}$/u.test(error?.code ?? '') ? error.code : 'COR-ORPHAN-RELEASE-FAILED',
        message: String(error?.message ?? error).slice(0, 400) }) + '\n');
      process.exitCode = 2;
    }
  } else if (argv[0] === 'run') {
    run(argv).then((result) => {
      process.stderr.write(JSON.stringify({ schema: OWNER_ROUTE_RESULT_SCHEMA, ...result }) + '\n');
      process.exitCode = result.status === 'completed' ? 0 : 2;
    }).catch((error) => {
      const known = /^COR-[A-Z0-9-]{1,80}$/u.test(error?.code ?? '');
      process.stderr.write(JSON.stringify({ schema: OWNER_ROUTE_RESULT_SCHEMA, status: error?.held === true ? 'held' : 'refused', code: known ? error.code : 'COR-UNAVAILABLE',
        message: known ? String(error.message).slice(0, 1200) : `the owner route failed (${error?.code ?? 'error'}); nothing is released implicitly: ${USAGE}`, released: error?.held === true ? false : null }) + '\n');
      process.exitCode = error?.held === true ? 3 : 2;
    });
  } else {
    process.stderr.write(JSON.stringify({ schema: OWNER_ROUTE_RESULT_SCHEMA, status: 'refused', code: 'COR-USAGE', message: USAGE }) + '\n');
    process.exitCode = 2;
  }
}
