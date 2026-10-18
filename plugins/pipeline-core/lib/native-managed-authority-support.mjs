// Domain-specific physical source adapters. No handles or authority callbacks are minted here.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { canonical } from './po-approval-proof.mjs';
import { inspectSignedDescriptorCustodyRepository } from './worktree-lifecycle.mjs';
import { readAuthorityNamespace, readAuthoritySourceFile } from './session-authority-domain-owner.mjs';
import { readSourceOwnedAuthorityContext, inspectSourceOwnedCurrentAuthorityContext } from './session-requester-bridge.mjs';
import { validateNativeGoldfishHostObservation } from './native-goldfish-host-observation.mjs';
import { readClaudeHookSessionOwner } from './claude-hook-session-owner.mjs';

export const nativeManagedDigest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export function nativeManagedFault(reason) {
  const error = new Error(reason); error.name = 'SessionAuthorityError';
  error.code = 'SDC-AUTHORITY-UNAVAILABLE'; error.reason = reason; return error;
}
export function nativeManagedRepository(repository) {
  const observed = inspectSignedDescriptorCustodyRepository(repository?.primaryRoot);
  if (canonical(observed) !== canonical(repository)) throw nativeManagedFault('native-managed-repository-drift');
  return observed;
}
export function nativeManagedCurrentOwner(repository) {
  const context = readSourceOwnedAuthorityContext({ repository });
  if (context.status !== 'bound') {
    // T6-A fallback: a Claude hook process that entered its own hook-observed session scope.
    const hook = readClaudeHookSessionOwner({ repository });
    if (hook) return { association: { state: 'bound', target: { sessionId: hook.sessionId, descriptorSha256: hook.descriptorSha256, ownerNonceSha256: hook.ownerNonceSha256 } },
      descriptorHandle: null, assurance: 'physical-readback', ownerSource: hook.ownerSource };
    return { association: { state: 'unbound', target: null }, descriptorHandle: null, assurance: 'physical-readback' };
  }
  const observed = inspectSourceOwnedCurrentAuthorityContext({ repository });
  const requester = observed.currentRequester;
  return { association: { state: 'bound', target: { sessionId: requester.sessionId, descriptorSha256: requester.descriptorSha256, ownerNonceSha256: requester.ownerNonceSha256 } },
    descriptorHandle: observed.descriptorHandle, assurance: observed.assurance === 'controlled-unit-method' ? 'controlled-unit-method' : 'physical-readback' };
}
export function nativeManagedSourceRef(repository, path, sourceFact) {
  const suffix = relative(repository.commonDir, path);
  if (!suffix || suffix.startsWith(`..${sep}`) || suffix === '..' || suffix.includes('\\')) throw nativeManagedFault('native-managed-source-outside-common');
  return Object.freeze({ path: `.git/${suffix.split(sep).join('/')}`, sha256: sourceFact.sha256, size: sourceFact.size });
}
export function readNativeManagedSource(namespaceId, filePath) {
  return readAuthoritySourceFile({ namespaceId, filePath, semantic: ({ value }) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw nativeManagedFault('native-managed-json-required');
    return value;
  } });
}
/** True for a post-terminal custody record: published after the operation was released, so it is not part of the authority fact set once the terminal journal is closed. */
export const nativeManagedPostTerminalRecord = relativePath => /\/(advisor|readiness)-finalization\.json$/.test(relativePath);
export function readNativeManagedInventory(repository, domain) {
  nativeManagedRepository(repository);
  const roots = domain === 'native-goldfish' ? [['native-goldfish-host-commit', join(repository.commonDir, 'agent-pipeline/run/native-goldfish-host-commit')]]
    : [['design-readiness-processes', join(repository.commonDir, 'agent-pipeline/design-readiness-codex')], ['advisor-processes', join(repository.commonDir, 'agent-pipeline/advisor-codex')]];
  return roots.map(([namespaceId, rootPath]) => readAuthorityNamespace({ namespaceId, rootPath, classifyEntry: ({ relativePath, value }) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw nativeManagedFault('native-managed-invalid-record');
    if (domain === 'native-goldfish') {
      if (!/^(pending-(claude|codex)-[a-f0-9]{64}|agent-codex-[a-f0-9]{64}|observation-(claude|codex)-[a-f0-9]{64}|authority-owner-[a-f0-9]{64}|authority-terminal-[a-f0-9]{64}|authority-check-[a-f0-9]{64}|authority-scope-[a-f0-9]{64}-[1-9][0-9]{0,3}|authority-recheck-[a-f0-9]{64}-[1-9][0-9]{0,3}|authority-integration-[a-f0-9]{64}|authority-checkpoint-[a-f0-9]{64}-[1-9][0-9]{0,3})\.json$/.test(relativePath)) throw nativeManagedFault('native-managed-unknown-native-entry');
      if (relativePath.startsWith('pending-') && !['pipeline.native-goldfish-host-state.v1','pipeline.native-goldfish-host-state.v2','pipeline.native-goldfish-host-state.v3'].includes(value.schema)
        || relativePath.startsWith('agent-') && value.schema !== 'pipeline.native-goldfish-host-agent-binding.v1'
        || relativePath.startsWith('observation-') && !['pipeline.native-goldfish-host-observation.v1','pipeline.native-goldfish-host-observation.v2','pipeline.native-goldfish-host-observation.v3'].includes(value.schema)
        || relativePath.startsWith('authority-terminal-') && value.schema !== 'pipeline.native-goldfish-authority-terminal.v1'
        || relativePath.startsWith('authority-check-') && value.schema !== 'pipeline.native-goldfish-item-check.v1'
        || relativePath.startsWith('authority-scope-') && value.schema !== 'pipeline.native-goldfish-item-scope.v1'
        || relativePath.startsWith('authority-recheck-') && value.schema !== 'pipeline.native-goldfish-item-recheck.v1'
        || relativePath.startsWith('authority-integration-') && value.schema !== 'pipeline.native-goldfish-item-integration.v1'
        || relativePath.startsWith('authority-checkpoint-') && value.schema !== 'pipeline.native-goldfish-item-checkpoint.v1') throw nativeManagedFault('native-managed-native-schema');
      if(relativePath.startsWith('authority-owner-')&&value.schema!=='pipeline.native-goldfish-authority-owner.v1')throw nativeManagedFault('native-managed-native-owner-schema');
      if(relativePath.startsWith('observation-')&&!validateNativeGoldfishHostObservation(value))throw nativeManagedFault('native-managed-native-observation-shape');
    } else {
      // The two finalization names are the controller's post-terminal records: the host publishes them into
      // the journal directory after finish() has released the operation (codex-isolated-structured-host.mjs).
      const names = '(intent|launcher|admission|child-intent|worker|child|exec-admission|execution|terminal|recovered-child|recovery|authority|advisor-finalization|readiness-finalization)';
      if (!(new RegExp(`^[a-f0-9]{64}/processes/codex-host-drh_[a-f0-9]{32}/${names}\\.json$`)).test(relativePath)) throw nativeManagedFault('native-managed-unknown-managed-entry');
      const name=relativePath.split('/').at(-1).slice(0,-5);
      const schemas={intent:'pipeline.codex-host-process-intent.v1',launcher:'pipeline.codex-host-launcher.v1',admission:'pipeline.codex-host-admission.v1',
        'child-intent':'pipeline.codex-host-child-intent.v1',worker:'pipeline.codex-host-worker.v1',child:'pipeline.codex-host-child.v1',
        'exec-admission':'pipeline.codex-host-exec-admission.v1',execution:'pipeline.codex-host-execution.v1',terminal:'pipeline.codex-host-terminal.v1',
        recovery:'pipeline.codex-host-recovery.v1',authority:'pipeline.codex-host-authority.v1',
        'advisor-finalization':['pipeline.codex-advisor-finalization.v1','pipeline.codex-advisor-failed-finalization.v1'],
        'readiness-finalization':'pipeline.codex-readiness-finalization.v1'};
      if(![].concat(schemas[name]??[]).includes(value.schema))throw nativeManagedFault('native-managed-managed-schema');
    }
    return value;
  } }));
}
export function nativeManagedAssociation(value){
  if(!value||Object.keys(value).sort().join(',')!=='state,target')throw nativeManagedFault('native-managed-association-shape');
  if(value.state==='unbound'&&value.target===null)return value;
  if(value.state!=='bound'||!value.target||Object.keys(value.target).sort().join(',')!=='descriptorSha256,ownerNonceSha256,sessionId'
    ||!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(value.target.sessionId)
    ||![value.target.descriptorSha256,value.target.ownerNonceSha256].every(v=>/^[a-f0-9]{64}$/.test(v)))throw nativeManagedFault('native-managed-association-binding');
  return value;
}
export function nativeManagedRegistryPresent(repository) {
  nativeManagedRepository(repository);
  const path = join(repository.commonDir, 'agent-pipeline/session-authority/catalogue.json');
  if (!existsSync(path)) return false;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(path) !== path) throw nativeManagedFault('native-managed-catalogue-unsafe');
  return true;
}
