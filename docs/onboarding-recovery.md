# Onboarding recovery and exceptional migrations

This is a reference for an already-governed consumer repository when a
normal onboarding inspection names a recovery or migration path. It is not
the first-time installation sequence. Use only the exact action returned by
the installed plugin and retain its digest-bound preview/readback.

## Typed failure and the Slim Overlay boundary

`invalid-source`, `invalid-baseline`, and `recovery-required` are non-success
states with actionable diagnostics. Repair the named prerequisite or complete
the recovery preview; do not create a baseline, lock, or generated file by
hand.

The Slim Private Overlay activation path is intentionally stricter. It is for
an already V3-valid overlay and requires an authenticated
`.agent-pipeline/core.lock.json` verified against the selected Public Core.
That sealed lock is not a substitute for legacy onboarding and must never be
hand-authored.

When a previously valid Slim Overlay lock is stale after a Public-Core update,
use the Core-owned authority-update flow. It observes the selected Public Core
and installed plugin, accepts only the existing lock's safe topology and source
channel, and derives the replacement lock itself. The preview is read-only and
returns a digest; only the matching explicit activation may write. Any runtime
projection drift is rejected rather than combined silently with the lock update.

```sh
node <plugin-root>/scripts/private-overlay-activation.mjs authority-plan --project-root /absolute/overlay/root --source-plugin-root <plugin-root>
node <plugin-root>/scripts/private-overlay-activation.mjs authority-activate --project-root /absolute/overlay/root --source-plugin-root <plugin-root> --expected-plan-sha256 <digest-from-authority-plan>
```

For Codex, use the host-attested wrapper instead of supplying a source root:

```sh
node <plugin-root>/scripts/codex-private-overlay-activation.mjs authority-plan --project-root /absolute/overlay/root
node <plugin-root>/scripts/codex-private-overlay-activation.mjs authority-activate --project-root /absolute/overlay/root --expected-plan-sha256 <digest-from-authority-plan>
```

After a successful activation, rerun `status`, then the normal private-overlay
`plan`/`activate` lifecycle only when it reports projection work. Commit the
overlay's new binding through the overlay's own reviewed workflow; never copy
or edit the lock bytes manually.

## Ownership

`pipeline.user.yaml` is the portable project source. `.claude/**` and
`.codex/**` are regenerable runner projections: Core-owned keys are refreshed
and unrelated user settings are preserved. The migration does not move local
credentials, host settings, caches, or private coordinates into the consumer
repository.

## Neutral project authority migration

Legacy project gates and lifecycle state may still live in
the manifest and lifecycle State at the legacy tier. Move that portable
authority to the runner-neutral `project/` layer only through its separate,
preview-first cutover:

```sh
node <plugin-root>/scripts/project-authority-migration.mjs inspect --root /absolute/consumer/root
node <plugin-root>/scripts/project-authority-migration.mjs plan --root /absolute/consumer/root
node <plugin-root>/scripts/project-authority-migration.mjs apply --root /absolute/consumer/root --activate
```

`plan` writes nothing and reports only path/digest metadata. `apply` writes a
sanitized pre-write preview to standard error before it can activate. The
legacy files are retained for the compatibility reader; the neutral files are
the only migration writes. A changed legacy source, changed neutral
destination, or pending journal rejects activation.

An ordinary `git fetch` never changes a checkout. Do not follow it with
`git checkout --force` or `git switch --force`: those commands can overlay the
untracked kickoff authority with a remote legacy authority. If an older host
already left exactly that mixed state, `plan` returns the explicit
`adopt-legacy-after-remote-checkout` recovery. Its activated apply preserves
the existing neutral preimages under the repository's private Git common-dir,
then copies the exact legacy authority into the neutral layer and verifies the
result. It is a PO-confirmed recovery, not a precedence rule or a normal
fetch-side effect.

If migration is blocked solely by a previously completed, no-longer-live
session-cleanup binding, use `session-cleanup.mjs release-binding --repo <root>`.
This exact closure-receipt CAS is intentionally available before
general onboarding readiness: it releases only the already persisted tuple and
cannot create a session, delete a worktree, or bypass a missing closure proof.

If an interrupted cutover leaves a journal, do not delete it or hand-copy its
files. First inspect the recorded recovery, then explicitly activate it:

```sh
node <plugin-root>/scripts/project-authority-migration.mjs recover --root /absolute/consumer/root
node <plugin-root>/scripts/project-authority-migration.mjs recover --root /absolute/consumer/root --activate
```

Recovery restores recorded preimages only after its own digest-bound preview;
it never resumes an unreviewed write.

## Externally archived temporary-worktree recovery

Do not remove a Pipeline-owned worktree by hand during an active cleanup
session. If an emergency archival was already performed outside the checkout,
first retain the archive and then inspect the normal recovery plan:

```sh
node <plugin-root>/scripts/session-cleanup.mjs plan-recovery --repo /absolute/consumer/root
node <plugin-root>/scripts/session-cleanup.mjs apply-recovery --repo /absolute/consumer/root --plan-sha256 <digest-from-plan> --activate
```

To retain the successful recovery as a non-authoritative governance action,
add `--event-out evidence/actions/session-recovery.json`. The target is
preflighted before recovery begins. A failed recovery emits no event; a failure
after successful recovery returns an event-only retry and does not undo the
recovery. Omitting the flag preserves the ordinary no-output flow.

Every externally archived descriptor must prove a missing, non-sole-copy
`disposable-control` worktree under `branch/detached`; its descriptor digest
and manifest digest must still match and its recorded owner must not be live.
Activation records `WT-EXTERNALLY-ARCHIVED` in the completed closure receipt
and retires only that exact descriptor/manifest. A stale capability-only
descriptor without a cleanup manifest may be included in the same plan only
when it separately proves normally retirable; it never inherits the archive
exception. The recovery never accepts a scratch file, generated output,
implementation worktree, present path, or path-prefix guess.
