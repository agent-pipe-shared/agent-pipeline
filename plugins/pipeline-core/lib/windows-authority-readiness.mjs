// SPDX-License-Identifier: SUL-1.0
// Read-only Windows custody diagnosis. The native authority backend remains the sole policy oracle.
import { win32 } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { inspectWindowsOwnedAuthorityPath, observeWindowsAuthorityAncestor } from './windows-owned-authority-backend.mjs';

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
  probe = ({ path, boundaryRoot, privatePath }) => privatePath
    ? inspectWindowsOwnedAuthorityPath({ path, directory: true })
    : observeWindowsAuthorityAncestor(boundaryRoot ? { path, boundaryRoot } : { path }),
} = {}) {
  const roots = [projectRoot, pluginRoot, privateRoot];
  if (roots.some(value => typeof value !== 'string' || chain(value) === null)) {
    return { schema: WINDOWS_AUTHORITY_READINESS_SCHEMA, status: 'unavailable', causes: [{ pathClass: 'input', reason: 'WIN-AUTH-PATH', nextAction: guidance('input', 'WIN-AUTH-PATH') }] };
  }
  const seen = new Map();
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
        catch (error) { reason = windowsAuthorityCause(error); }
        seen.set(key, reason);
      }
      if (reason) causes.push({ pathClass, reason, path, nextAction: guidance(pathClass, reason) });
    }
  }
  return { schema: WINDOWS_AUTHORITY_READINESS_SCHEMA, status: causes.length ? 'unavailable' : 'ready', causes };
}
