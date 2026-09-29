// SPDX-License-Identifier: SUL-1.0
// Scope-only admission. No enrollment, authority, consent, HGO or audit writer.
import {dangerousGitFindings} from './git-dangerous-policy.mjs';
import {observeGovernanceScope} from '../lib/governance-scope.mjs';
export function nativeHookGovernanceAdmission({runner,rawInput}={}) {
  let input = null; try { input = JSON.parse(rawInput); } catch {}
  const rootDir = runner === 'antigravity'
    ? input?.toolCall?.args?.Cwd ?? input?.workspacePaths?.[0] ?? input?.cwd ?? process.cwd()
    : input?.cwd ?? process.cwd();
  const scope = observeGovernanceScope({rootDir});
  if (scope.requiresEnforcement) return {requiresEnforcement:true,destructiveDenial:null};
  // Only the provider's shell envelope is forwarded to the existing dangerous
  // union. This is not a governed tool/role/grammar admission and writes no audit.
  const shell = input?.toolCall?.name === 'run_command'
    ? input.toolCall.args?.CommandLine
    : ['Bash','PowerShell'].includes(input?.tool_name) ? input?.tool_input?.command ?? input?.tool_input?.CommandLine : null;
  if (typeof shell !== 'string' || !shell) return {requiresEnforcement:false,destructiveDenial:null};
  const findings = dangerousGitFindings(shell);
  return {requiresEnforcement:false,destructiveDenial:findings.length ? findings.map(r=>'[git-guard] BLOCKED '+r.id+': '+r.why).join('\n') : null};
}
