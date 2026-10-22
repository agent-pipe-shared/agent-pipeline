// SPDX-License-Identifier: SUL-1.0
// Source-owned observer assembly. This grants no operation/requester authority.
// Resolve factory exports only when called, after cyclic owner modules initialize.
import * as onboarding from './onboarding-continuity.mjs';
import * as hgo from './human-guard-override.mjs';
import * as chat from './chat-gate-ceremony.mjs';
import * as state from '../scripts/pipeline-state.mjs';
import * as native from './native-goldfish-host-state.mjs';
import * as codex from './codex-host-process-journal.mjs';
import * as consent from './agy-session-authority.mjs';
import * as agy from './agy-session-dispatch.mjs';
import * as model from './model-family-host-store.mjs';
import * as afk from './afk-ledger.mjs';
import * as power from './session-power.mjs';
import * as worker from './local-worker-supervisor.mjs';

const owners = Object.freeze([
  ['onboarding-continuity', onboarding, 'OnboardingContinuity'],
  ['human-guard-override', hgo, 'HumanGuardOverride'],
  ['chat-gate', chat, 'ChatGate'],
  ['state-push-challenge', state, 'StatePushChallenge'],
  ['native-goldfish', native, 'NativeGoldfish'],
  ['managed-codex', codex, 'ManagedCodex'],
  ['agy-session-consent', consent, 'AgySessionConsent'],
  ['agy-family-dispatch', agy, 'AgyFamilyDispatch'],
  ['model-family-host', model, 'ModelFamilyHost'],
  ['afk-ledger', afk, 'AfkLedger'],
  ['session-power', power, 'SessionPower'],
  ['local-worker-supervisor', worker, 'LocalWorkerSupervisor'],
].map(Object.freeze));

function unavailable(producerId, reason) {
  const error = new Error(reason);
  error.name = 'SessionAuthorityObserverError';
  error.code = 'SDC-AUTHORITY-UNAVAILABLE';
  error.producerId = producerId;
  error.reason = reason;
  throw error;
}

export function createSessionAuthorityParticipantPorts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Reflect.ownKeys(input).length !== 1 || !Object.hasOwn(input, 'repository')) {
    unavailable(null, 'observer-input-shape');
  }
  const {repository} = input;
  // Each real owner validates and retains the physical repository itself.
  // No requester/runtime is fabricated; no missing owner gets an empty port.
  const rows = owners.map(([producerId, owner, stem]) => {
    const factory = owner[`create${stem}AuthorityProducerPort`];
    const predicate = owner[`isOwned${stem}AuthorityProducerPort`];
    if (typeof factory !== 'function' || typeof predicate !== 'function') {
      unavailable(producerId, 'observer-owner-export-missing');
    }
    const port = factory({repository});
    if (!port || typeof port !== 'object' || predicate(port, {repository}) !== true) {
      unavailable(producerId, 'observer-owner-brand');
    }
    for (const method of ['readBaseline', 'observeOperation', 'observeTerminal', 'reconcile', 'readAssurance']) {
      if (typeof port[method] !== 'function') unavailable(producerId, 'observer-owner-method-missing');
    }
    return Object.freeze({producerId, port});
  });
  // Physical inventory, admission and lifecycle remain owning-port operations.
  // In particular an unavailable legacy root inventory is never empty evidence.
  return Object.freeze(rows);
}
