# V3 consumer onboarding

This is the supported, preview-first path for a consumer project that has a
valid legacy (`pipeline.user.v0`/`pipeline.user.v1`/V2) `pipeline.user.yaml`
but intentionally has no generated `.claude/**` or `.codex/**` projections.
It uses the Public Core migration authority; do not hand-author runtime files,
an authority lock, or a projection plan.

## Preconditions

- Run the command from a trusted checkout of the released Public Core.
- Supply one real consumer project root containing `pipeline.user.yaml`.
- Keep the project writable only for the final, explicit activation. `inspect`
  and `plan` are read-only.
- Resolve any separately required route/advisory decision before activation.
  A migration preview is not an approval, push, or release authorization.

## Legacy consumer with no projections

First inspect and preview the exact migration:

```sh
node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs inspect --root /absolute/consumer/root
node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs plan --root /absolute/consumer/root
```

For an accepted V0/V1/V2 source, the plan deterministically lists the
generated runtime targets plus `pipeline.user.yaml`. It creates no bytes. The
final source is written last in one recoverable transaction so a stale or
interrupted operation cannot present a converted source with old projections.

Only after reviewing the emitted target list and hashes, activate it:

```sh
node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs apply --root /absolute/consumer/root --activate
```

Before the first write the command emits a sanitized pre-write preview to
standard error. It contains every target path, data class, owner mode, before
and after digest, but no private bytes or absolute project coordinate. The
write is rejected unless `--activate` is present. On completion, rerunning
`plan` is a no-op; interruption recovery remains preview-first and
transaction-bound.

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
node plugins/pipeline-core/scripts/private-overlay-activation.mjs authority-plan --project-root /absolute/overlay/root --source-plugin-root /absolute/public/plugins/pipeline-core
node plugins/pipeline-core/scripts/private-overlay-activation.mjs authority-activate --project-root /absolute/overlay/root --source-plugin-root /absolute/public/plugins/pipeline-core --expected-plan-sha256 <digest-from-authority-plan>
```

For Codex, use the host-attested wrapper instead of supplying a source root:

```sh
node plugins/pipeline-core/scripts/codex-private-overlay-activation.mjs authority-plan --project-root /absolute/overlay/root
node plugins/pipeline-core/scripts/codex-private-overlay-activation.mjs authority-activate --project-root /absolute/overlay/root --expected-plan-sha256 <digest-from-authority-plan>
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
`.claude/pipeline.yaml` and `.claude/pipeline-state.json`. Move that portable
authority to the runner-neutral `project/` layer only through its separate,
preview-first cutover:

```sh
node plugins/pipeline-core/scripts/project-authority-migration.mjs inspect --root /absolute/consumer/root
node plugins/pipeline-core/scripts/project-authority-migration.mjs plan --root /absolute/consumer/root
node plugins/pipeline-core/scripts/project-authority-migration.mjs apply --root /absolute/consumer/root --activate
```

`plan` writes nothing and reports only path/digest metadata. `apply` writes a
sanitized pre-write preview to standard error before it can activate. The
legacy files are retained for the compatibility reader; the neutral files are
the only migration writes. A changed legacy source, changed neutral
destination, mixed authority layer, or pending journal rejects activation.

If an interrupted cutover leaves a journal, do not delete it or hand-copy its
files. First inspect the recorded recovery, then explicitly activate it:

```sh
node plugins/pipeline-core/scripts/project-authority-migration.mjs recover --root /absolute/consumer/root
node plugins/pipeline-core/scripts/project-authority-migration.mjs recover --root /absolute/consumer/root --activate
```

Recovery restores recorded preimages only after its own digest-bound preview;
it never resumes an unreviewed write.
