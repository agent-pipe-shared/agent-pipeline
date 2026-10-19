---
schema: pipeline.backlog-item.v1
id: pipeline.model-family-async-effects-need-a-settled-journal-phase
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "Elephant decisions E23 and E24 (2026-10-19, under PO decision D26): the model-family async-lifetime defect is latent and is not fixed in 0.7.0"
sprint: none
done_when: manual
---

# Model-family async effects need a settled journal phase

## Description

`lib/model-family-host-store.mjs` runs native admission and launch inside
`authorityLifecycle.run()` (`ownedLifetime`). Both legs can produce a promise:
`admitNativeRequestUnregistered` awaits the adapter port `admitNativeRequest`, and
`launchUnregistered` returns the driver's promise when the driver is async. The domain
owner (`session-authority-domain-owner.mjs`) refuses an effect that is still held when
`run()` returns. The refusal surfaces as `SDC-LOCK-HELD`
(`domain-transition-partial-effect-retained`). `model-family-invocation.mjs` maps it to
`MODEL-FAMILY-NATIVE-REQUEST-REFUSED`.

The defect is latent. The production default chain never supplies the native admission
port, so admission stops synchronously at `MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED` before any
await, and launch is unreachable without an issued admission (MFAN measurement and
ALF-B6-MFI, 2026-10-19).

A genuine decision/IO split inside the host store (E23 option (a)) is not possible:

- **Admission:** the adapter's answer is the verdict. No synchronous decision exists to
  record inside `run()`.
- **Launch:** the lifecycle-held state depends on the driver's result. `modelLaunched`
  records `returned: value?.ok === true`, and `disposeInvocation` needs `held.returned`
  to close the member. Moving the driver call out of `run()` would journal a
  consumption before the spawn it attests to has succeeded or failed.

A second finding (E23): the registry boundary's finally block replaces the original error
without a cause.

## Proposal

Add a settled journal phase for async effects (E23 option (b)) in
`session-authority-domain-owner.mjs` and `session-authority-registry.mjs`. The phase holds
the member until the effect settles and then journals the terminal outcome. Its registry
refusal today is the async-phase refusal. This adds an authority phase, so it needs an
EL-04 register entry in `docs/state.md` and an ADR before implementation. Keep the original
error as the cause in the registry boundary's finally block.

## Acceptance

- Native admission with an async adapter port, and launch with an async driver, both pass
  against the real lifecycle, and the settled outcome is journaled.
- These red cases turn green with a counted result and no assertion weakened:
  - MFI012 and MFI013 (`model-family-invocation.test.mjs`);
  - MFMP003 (`model-family-main-prelaunch.test.mjs`);
  - MFHS002 to MFHS008 (`model-family-host-store.test.mjs`);
  - CCH136 (`codex-critic-host.test.mjs`).
- A refusal case keeps proving that an effect still held when the lifecycle closes is
  refused.
