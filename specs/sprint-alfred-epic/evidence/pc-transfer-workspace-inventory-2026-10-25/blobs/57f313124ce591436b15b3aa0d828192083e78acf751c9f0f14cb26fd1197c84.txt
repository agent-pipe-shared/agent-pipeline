// SPDX-License-Identifier: SUL-1.0
// Read-only Windows custody diagnosis. The native authority backend remains the sole policy oracle.
import { win32 } from 'node:path';
import { existsSync } from 'node:fs';
import { inspectWindowsOwnedAuthorityPath, observeWindowsAuthorityAncestor } from './windows-owned-authority-backend.mjs';

export const WINDOWS_AUTHORITY_READINESS_SCHEMA = 'pipeline.windows-authority-readiness.v1';
const NATIVE_REASON = /^WIN-AUTH-[A-Z-]{1,64}$/u;

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
  if (reason === 'WIN-AUTH-ANCESTOR-MUTATION') return {
    kind: 'operator-review', mutation: false,
    summary: `Inspect the inherited or explicit foreign write ACE on the ${pathClass} directory. Record the actual SID and ACE source; review a single-directory SID-targeted removal or move the repository into a private user-profile directory, then rerun readiness.`,
    inspection: ['whoami /user', 'Get-Acl -LiteralPath <exact directory> | Format-List Owner,Access'],
    repairPreview: 'At the reviewed ACE source only: icacls <exact directory> /remove:g *<observed SID>. If the ACE is inherited, review inheritance at that one directory before editing; never apply /T.',
  };
  return { kind: 'operator-review', mutation: false,
    summary: `Inspect ${pathClass} custody for ${reason}; repair only the named directory after review, or relocate the repository into a private user-profile directory, then rerun readiness.`,
    inspection: ['whoami /user', 'Get-Acl -LiteralPath <exact directory> | Format-List Owner,Access'],
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
        try { probe({ path, boundaryRoot, privatePath, pathClass }); reason = null; }
        catch (error) { reason = windowsAuthorityCause(error); }
        seen.set(key, reason);
      }
      if (reason) causes.push({ pathClass, reason, path, nextAction: guidance(pathClass, reason) });
    }
  }
  return { schema: WINDOWS_AUTHORITY_READINESS_SCHEMA, status: causes.length ? 'unavailable' : 'ready', causes };
}
