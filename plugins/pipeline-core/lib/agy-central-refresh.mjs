// SPDX-License-Identifier: SUL-1.0
// Host-boundary orchestrator: publish the per-user central agy snapshot, retire workspace Pipeline
// registrations, then refresh the agy managed copy from the snapshot through the real refresh host.
// Library only; callers (installer source kind, update verb) are wired in a later slice.
import { publishAgySnapshot } from './agy-central-snapshot.mjs';
import {
  createAntigravityRefreshHost,
  observeAntigravityWorkspaceBindings,
  removeAntigravityWorkspaceRegistration,
  resolveAntigravityCliPath,
} from './antigravity-topology-refresh-host.mjs';

function hostCode(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return /^ATR-[A-Z-]+$/.test(message) ? message : 'ATR-UNAVAILABLE';
}

export async function installAgyFromCentralSnapshot({
  sourcePluginRoot,
  attestationSourceRoot,
  configRoot,
  workspaceRoot,
  deps,
  runCli,
  writeInstalledReceipt,
} = {}) {
  const snapshot = publishAgySnapshot({ sourcePluginRoot, attestationSourceRoot, deps });
  const receiptWriter = typeof writeInstalledReceipt === 'function'
    ? (receipt) => writeInstalledReceipt({ ...receipt, attestationSourceRoot })
    : undefined;
  // The host check comes first and mutates nothing: a broken global surface refuses here, with the workspace entry untouched.
  let host;
  try {
    host = createAntigravityRefreshHost({
      configRoot,
      workspaceRoot,
      approvedSourceRoot: snapshot.root,
      scope: 'global',
      globalChangeApproved: true,
      runCli,
      writeInstalledReceipt: receiptWriter,
    });
    const plan = host.prepare();
    if (plan.status !== 'prepared') {
      const refusal = { status: 'refused', reason: plan.reason ?? 'ATR-UNAVAILABLE' };
      return { status: refusal.status, reason: refusal.reason, snapshot, refresh: refusal };
    }
  } catch (error) {
    const refusal = { status: 'refused', reason: hostCode(error) };
    return { status: refusal.status, reason: refusal.reason, snapshot, refresh: refusal };
  }
  // Only after the host check succeeded: retire any workspace Pipeline entry so the host never rebinds one (global entry is intended).
  const bindings = observeAntigravityWorkspaceBindings({ workspaceRoot });
  if (bindings.ownedIndexes.length > 0) {
    const removed = removeAntigravityWorkspaceRegistration({ workspaceRoot, expectedSha256: bindings.sha256 });
    if (removed.status === 'refused') return { status: 'refused', reason: removed.reason, snapshot, refresh: null };
  }
  let refresh;
  try {
    refresh = host.refresh();
  } catch (error) {
    refresh = { status: 'refused', reason: hostCode(error) };
  }
  return { status: refresh.status, reason: refresh.reason ?? null, snapshot, refresh };
}

export async function applyAgyCentralSnapshotAfterUpdate({ resolveCliPath = resolveAntigravityCliPath, ...options } = {}) {
  if (!resolveCliPath()) return { status: 'skipped', reason: 'AGY-CLI-ABSENT', snapshot: null, refresh: null };
  return installAgyFromCentralSnapshot(options);
}
