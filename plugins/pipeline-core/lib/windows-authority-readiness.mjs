// SPDX-License-Identifier: SUL-1.0
// Read-only Windows custody diagnosis. The native authority backend remains the sole policy oracle.
import { win32 } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
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

function guidance(pathClass, reason) {
  return { kind: 'operator-review', mutation: false,
    summary: `Inspect the ${pathClass} path for ${reason}; ordinary host ownership and write grants do not block Pipeline readiness. Repair only a confirmed structural or private-authority fault, then rerun readiness.`,
    inspection: ['Confirm the exact path exists and is a physical non-reparse directory.', 'For private Pipeline authority, inspect its owner and protected DACL.'],
    repairPreview: null,
  };
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
        causes.push({ pathClass, reason: 'WIN-AUTH-OPEN', path, nextAction: guidance(pathClass, 'WIN-AUTH-OPEN') });
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
        causes.push({ pathClass, reason, ...(detail ? { detail } : {}), path, nextAction: guidance(pathClass, detail ?? reason) });
      }
    }
  }
  const stateRoot = win32.join(projectRoot, 'project');
  if (exists(stateRoot)) {
    let verdict;
    try { verdict = assessPrivateRoot(stateRoot); } catch { verdict = null; }
    const status = verdict?.status;
    if (status === 'insecure') {
      const quoted = stateRoot.includes('"');
      causes.push({ pathClass: 'private-state', reason: 'WIN-AUTH-PRIVATE-ROOT', path: stateRoot, nextAction: {
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
      } });
    } else if (status !== 'secure') {
      causes.push({ pathClass: 'private-state', reason: 'WIN-AUTH-OBSERVATION-UNAVAILABLE', path: stateRoot,
        nextAction: guidance('private-state', 'WIN-AUTH-OBSERVATION-UNAVAILABLE') });
    }
  }
  return { schema: WINDOWS_AUTHORITY_READINESS_SCHEMA, status: causes.length ? 'unavailable' : 'ready', causes };
}
