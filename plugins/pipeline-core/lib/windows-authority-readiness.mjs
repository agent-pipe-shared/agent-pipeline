// SPDX-License-Identifier: SUL-1.0
// Read-only Windows custody diagnosis. The native authority backend remains the sole policy oracle.
import { win32 } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolveTrustedSystemExecutable } from './trusted-tool-resolution.mjs';
import { inspectWindowsOwnedAuthorityPath, observeWindowsAuthorityAncestor } from './windows-owned-authority-backend.mjs';
import { assessWindowsPrivateRoot } from './windows-private-state.mjs';

export const WINDOWS_AUTHORITY_READINESS_SCHEMA = 'pipeline.windows-authority-readiness.v1';
const NATIVE_REASON = /^WIN-AUTH-[A-Z-]{1,64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function observed(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'committed,helperSha256,nativeFacts,nativeFactsSha256'
    || typeof value.nativeFacts !== 'string' || value.nativeFacts.length === 0
    || !SHA256.test(value.nativeFactsSha256) || !SHA256.test(value.helperSha256)
    || value.committed !== false) return false;
  return createHash('sha256').update(value.nativeFacts).digest('hex') === value.nativeFactsSha256;
}

function chain(path) {
  const root = win32.parse(path).root;
  if (!root || !win32.isAbsolute(path) || win32.normalize(path) !== path) return null;
  const parts = win32.relative(root, path).split(win32.sep).filter(Boolean);
  const rows = [root];
  for (const part of parts) rows.push(win32.join(rows.at(-1), part));
  return rows;
}

export function windowsAuthorityCause(error) {
  return NATIVE_REASON.test(error?.reason) ? error.reason : 'WIN-AUTH-OBSERVATION-UNAVAILABLE';
}

const DACL_DETAIL = /^WIN-AUTH-DACL-(?:EMPTY|UNPROTECTED|ACE|FOREIGN)$/u;
/** The closed private-DACL detail behind a WIN-AUTH-DACL family refusal, or null. */
export function windowsAuthorityDetail(error) {
  return error?.reason === 'WIN-AUTH-DACL' && DACL_DETAIL.test(error?.detail) ? error.detail : null;
}

/** Q10: the two commands that repair a folder the native open could not use. The first only lists the access list. */
function openRepairCommands(path) {
  if (typeof path !== 'string' || path === '' || path.includes('"')) return [];
  return [
    { shell: 'cmd', purpose: 'preview', changesNothing: true, command: `icacls "${path}"` },
    { shell: 'cmd', purpose: 'apply', changesNothing: false, command: `icacls "${path}" /grant "%USERNAME%:(OI)(CI)F"` },
  ];
}

function guidance(pathClass, reason, path) {
  const commands = reason === 'WIN-AUTH-OPEN' ? openRepairCommands(path) : [];
  return { kind: 'operator-review', mutation: false,
    summary: `Inspect the ${pathClass} path${path ? ` ${path}` : ''} for ${reason}; ordinary host ownership and write grants do not block Pipeline readiness. Repair only a confirmed structural or private-authority fault, then rerun readiness.`,
    inspection: ['Confirm the exact path exists and is a physical non-reparse directory.', 'For private Pipeline authority, inspect its owner and protected DACL.'],
    repairPreview: commands.length === 0 ? null : { folder: path, commands,
      reason: 'the first command only lists the folder access list; the second grants the current user full control and is run by the operator',
      afterwards: 'Rerun the preflight; it reads the folder back and continues only when it opens.' },
  };
}

/**
 * Q10: the text a refusal prints after the bare WIN-AUTH-* code: the exact folder, a preview that changes nothing, the
 * apply command the operator runs, and the rule for a second concurrent launch. The platform and the probe are injected.
 * Returns '' when the platform is not Windows or the reason is not a native authority reason.
 */
export function describeWindowsAuthorityRefusal({ reason, platform = process.platform, projectRoot, pluginRoot, privateRoot, assess = assessWindowsAuthorityReadiness, failedPath } = {}) {
  if (platform !== 'win32' || !NATIVE_REASON.test(reason ?? '')) return '';
  // Q10: the path the native open itself failed on (the failure envelope) wins; the readiness probe names it otherwise.
  // A path that could break out of a quoted command line is never printed.
  const fromEnvelope = typeof failedPath === 'string' && failedPath !== '' && !/["\u0000-\u001f\u007f]/u.test(failedPath);
  let causes = [];
  if (fromEnvelope) causes = [{ path: failedPath, reason }];
  else { try { causes = assess({ projectRoot, pluginRoot, privateRoot })?.causes ?? []; } catch { causes = []; } }
  const located = causes.filter(cause => typeof cause?.path === 'string' && cause.path !== '' && (cause.reason === reason || reason === 'WIN-AUTH-OPEN'));
  const rest = reason === 'WIN-AUTH-OPEN'
    ? ' If another Goldfish launch is still running, start only one Goldfish launch at a time on Windows and wait for it to return before the next.'
    : '';
  if (located.length === 0) return ` The folder was not located; read windowsAuthorityReadiness.causes in the preflight output (node scripts/pipeline-start-preflight.mjs), which names each path.${rest}`;
  const rows = located.slice(0, 3).map(cause => {
    const commands = reason === 'WIN-AUTH-OPEN' ? openRepairCommands(cause.path) : [];
    return commands.length === 0 ? `Path: ${cause.path}.`
      : `Path: ${cause.path}. Preview (changes nothing): ${commands[0].command} . Apply (you run it): ${commands[1].command} .`;
  });
  return ` ${rows.join(' ')}${rest}`;
}

const pauseMilliseconds = ms => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/**
 * E4: a second concurrent Goldfish launch on Windows must not fail with WIN-AUTH-OPEN merely because the first is running.
 * `prepare` returns the launch preparation result ({ ok, code, reason, repair? }). A WIN-AUTH-OPEN refusal on Windows while the
 * readiness probe finds every folder readable is contention on a file the first launch holds: the preparation is retried a bounded
 * number of times, then fails with the sequential rule and the one command that waits for the first launch. Another platform,
 * another reason, a folder that really cannot be opened or a probe that cannot judge returns the first result unchanged.
 * Platform, probe and pause are injected.
 */
export function prepareWithWindowsContentionRetry({ prepare, platform = process.platform, projectRoot, pluginRoot, privateRoot, assess = assessWindowsAuthorityReadiness, sleep = pauseMilliseconds, attempts = 3, pauseMs = 400, waitCommand } = {}) {
  const contended = result => platform === 'win32' && result?.ok === false && result.reason === 'WIN-AUTH-OPEN';
  let result = prepare();
  if (!contended(result)) return result;
  let causes = null;
  try { causes = assess({ projectRoot, pluginRoot, privateRoot })?.causes ?? null; } catch { causes = null; }
  if (!Array.isArray(causes) || causes.length !== 0) return result;
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    sleep(pauseMs);
    result = prepare();
    if (!contended(result)) return result;
  }
  const wait = typeof waitCommand === 'string' && waitCommand !== '' ? ` Wait for the first launch with: ${waitCommand} ; then launch again.` : '';
  return { ...result, contention: true,
    repair: `Another Goldfish launch still holds the session authority registry and every folder opens fine, so this is not a permission fault. On Windows start only one Goldfish launch at a time.${wait}` };
}

/** The injected probe is called once per distinct path; it must only observe, never repair. */
export function assessWindowsAuthorityReadiness({ projectRoot, pluginRoot, privateRoot,
  exists = existsSync,
  assessPrivateRoot = assessWindowsPrivateRoot,
  probe = ({ path, boundaryRoot, privatePath }) => privatePath
    ? inspectWindowsOwnedAuthorityPath({ path, directory: true })
    : observeWindowsAuthorityAncestor(boundaryRoot ? { path, boundaryRoot } : { path }),
} = {}) {
  const roots = [projectRoot, pluginRoot, privateRoot];
  if (roots.some(value => typeof value !== 'string' || chain(value) === null)) {
    return { schema: WINDOWS_AUTHORITY_READINESS_SCHEMA, status: 'unavailable', causes: [{ pathClass: 'input', reason: 'WIN-AUTH-PATH', nextAction: guidance('input', 'WIN-AUTH-PATH') }] };
  }
  const seen = new Map();
  const details = new Map();
  const causes = [];
  for (const [pathClass, target, boundaryRoot] of [
    ['project', projectRoot, projectRoot], ['plugin', pluginRoot, null], ['private', privateRoot, projectRoot],
  ]) {
    // Plugin ancestors receive the strict native ancestor rule. Only physical
    // directories above the proven project root get the existing human route.
    for (const path of chain(target)) {
      const privatePath = pathClass === 'private' && path.toLowerCase() === privateRoot.toLowerCase();
      // A pristine project may not have a .git directory yet. Every existing
      // ancestor was already inspected; only absent future private entries
      // can be skipped until onboarding creates them.
      if (!exists(path)) {
        if (pathClass === 'private' && path.toLowerCase().startsWith(projectRoot.toLowerCase())) continue;
        causes.push({ pathClass, reason: 'WIN-AUTH-OPEN', path, nextAction: guidance(pathClass, 'WIN-AUTH-OPEN', path) });
        continue;
      }
      const key = `${path.toLowerCase()}|${privatePath ? 'private' : 'ancestor'}|${boundaryRoot?.toLowerCase() ?? 'strict'}`;
      let reason = seen.get(key);
      if (reason === undefined) {
        try {
          const result = probe({ path, boundaryRoot, privatePath, pathClass });
          reason = observed(result) ? null : 'WIN-AUTH-OBSERVATION-UNAVAILABLE';
        }
        catch (error) {
          reason = windowsAuthorityCause(error);
          const found = windowsAuthorityDetail(error);
          if (found) details.set(key, found);
        }
        seen.set(key, reason);
      }
      if (reason) {
        const detail = details.get(key);
        causes.push({ pathClass, reason, ...(detail ? { detail } : {}), path, nextAction: guidance(pathClass, detail ?? reason, path) });
      }
    }
  }
  const stateCause = windowsPrivateStateCause({ projectRoot, exists, assessPrivateRoot });
  if (stateCause !== null) causes.push(stateCause);
  return { schema: WINDOWS_AUTHORITY_READINESS_SCHEMA, status: causes.length ? 'unavailable' : 'ready', causes };
}

/**
 * PO decision 2026-11-09, the narrow exception to "the agent never changes folder rights": the onboarding driver narrows the `project` folder it has
 * just created itself, and no other folder. The grant runs first, so a failure can never leave the owner without access; the readiness check reads the
 * result back and a folder that is still not secure falls back to the human step. Never throws.
 */
export function narrowOwnNewPrivateState({ projectRoot, spawn = spawnSync, resolveExecutable = resolveTrustedSystemExecutable } = {}) {
  try {
    const stateRoot = win32.join(projectRoot, 'project');
    const whoami = resolveExecutable('whoami.exe');
    const icacls = resolveExecutable('icacls.exe');
    if (!whoami?.ok || !icacls?.ok) return { status: 'unavailable' };
    const run = (path, args) => spawn(path, args, { encoding: 'utf8', shell: false, windowsHide: true, timeout: 15_000 });
    const identity = run(whoami.path, ['/user', '/fo', 'csv', '/nh']);
    const sid = identity?.status === 0 ? /"(S-1-5-[0-9-]+)"/u.exec(identity.stdout ?? '')?.[1] : null;
    if (!sid) return { status: 'unavailable' };
    if (run(icacls.path, [stateRoot, '/grant:r', `*${sid}:(OI)(CI)F`])?.status !== 0) return { status: 'failed', step: 'grant' };
    if (run(icacls.path, [stateRoot, '/inheritance:r'])?.status !== 0) return { status: 'failed', step: 'inheritance' };
    return { status: 'narrowed' };
  } catch {
    return { status: 'failed', step: 'internal' };
  }
}

/**
 * The private state folder check alone (one native call, the full assessment is one per path). The onboarding driver runs it in the first question round,
 * so the one manual step stands next to the other questions instead of stopping the run later. Null when the folder is absent or secure.
 */
export function windowsPrivateStateCause({ projectRoot, exists = existsSync, assessPrivateRoot = assessWindowsPrivateRoot } = {}) {
  const stateRoot = win32.join(projectRoot, 'project');
  if (!exists(stateRoot)) return null;
  let verdict;
  try { verdict = assessPrivateRoot(stateRoot); } catch { verdict = null; }
  const status = verdict?.status;
  if (status === 'secure') return null;
  if (status !== 'insecure') {
    return { pathClass: 'private-state', reason: 'WIN-AUTH-OBSERVATION-UNAVAILABLE', path: stateRoot,
      nextAction: guidance('private-state', 'WIN-AUTH-OBSERVATION-UNAVAILABLE') };
  }
  const quoted = stateRoot.includes('"');
  return { pathClass: 'private-state', reason: 'WIN-AUTH-PRIVATE-ROOT', path: stateRoot, nextAction: {
    kind: 'operator-review', mutation: false,
    summary: 'The private state folder carries access rights inherited from above the repository. Remove the inherited grants, keep full control for the current user, then rerun readiness.',
    inspection: ['Confirm the folder is a physical non-reparse directory inside the project.', 'Read its access list and find the entries inherited from a parent folder.'],
    repairPreview: { folder: stateRoot,
      commands: quoted ? [] : [
        { shell: 'powershell', command: `icacls "${stateRoot}" /inheritance:r /grant:r "$(whoami):(OI)(CI)F"` },
        { shell: 'cmd', command: `icacls "${stateRoot}" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"` },
      ],
      reason: 'inherited grants from above the repository are removed, the current user keeps full control, files created later inherit the narrow rights',
      afterwards: 'The next preflight reads the folder back and continues only when it is secure.' },
  } };
}
