---
schema: pipeline.backlog-item.v1
id: pipeline.local-plugin-install-attestation-does-not-bind-external-marketplace-root
type: defect
owner: pipeline
status: open
created: 2026-08-06
source: "GATE-HONESTY-11 dispatch briefing, finding N1 (major), Sprint Nova session 2026-08-06"
due: 2026-09-06
---

# `exactLocalPluginInstall`'s attestation hashes this checkout, not the external marketplace root the admitted command actually installs from

## Description

`plugins/pipeline-core/lib/human-guard-override.mjs` admits exactly one
command literal (`:547-559`): `codex plugin add
pipeline-core@agent-pipeline-local`. The override's attestation
(`localPluginInstallSourceObservation`, `:197-240`, content hashing at
`:229-239`) observes only **this checkout's**
`.claude-plugin/marketplace.json`, `plugins/pipeline-core/.codex-plugin/plugin.json`,
and the `plugins/pipeline-core` source tree — it hashes
`marketplaceSha256`, `manifestSha256`, and `pluginTreeSha256` all from paths
inside `repo.root`.

Per [ADR-0052](../../docs/adr/0052-marketplace-identity-restoration-and-local-dev-separation.md),
`agent-pipeline-local` is a **separate marketplace root that lives outside
this checkout**, deliberately not a committed path the function can discover
or inspect. Its `plugins/pipeline-core` is a symlink or directory junction
back into this checkout. `codex plugin add
pipeline-core@agent-pipeline-local` resolves through that external root's own
marketplace manifest and link target — neither of which
`localPluginInstallSourceObservation` ever reads or hashes.

Consequently, `marketplaceSha256` in the attestation's `statusSha256` is
**decorative for this command class**: it proves this checkout's own
manifest still declares the `pipeline-core` → `./plugins/pipeline-core`
binding, not that the external `agent-pipeline-local` marketplace root the
command actually consults contains the same declaration, or that its
`plugins/pipeline-core` link still points into this checkout at all. An
attacker (or a stale/misconfigured local dev environment) who repoints or
mutates the external root's manifest or link target between attestation and
use is entirely outside what this override observes.

This sits on the trusted path that
[`docs/marketplace-supply-chain-threat-model.md`](../../docs/marketplace-supply-chain-threat-model.md)
exists to protect: local-plugin-install is exactly the install-time surface
that document is scoped to reason about, and ADR-0052 explicitly recorded
install-time behaviour of the external local marketplace root as
**unverified** at decision time. This item is the concrete, code-level
consequence of that recorded gap.

## Triggering situation

Goldfish task GATE-HONESTY-11 (Sprint Nova, 2026-08-06), dispatched to
correct the human-facing effect preview so it no longer claims the install
comes "from the bound local source" (a binding the attestation does not
establish). Making the preview text honest was in scope for that task;
closing the underlying attestation gap was explicitly out of scope and is
this backlog item's proposal instead.

**Reachability note:** before a recent fix to the override's admission path,
this command class was fail-closed dead, so the mismatch between what is
attested and what is installed was unreachable in practice. It is now live.

## Affected artifact

`plugins/pipeline-core/lib/human-guard-override.mjs`
(`localPluginInstallSourceObservation`, `:197-240`, and
`exactLocalPluginInstall`, `:547-559`),
[ADR-0052](../../docs/adr/0052-marketplace-identity-restoration-and-local-dev-separation.md)
(the governing decision that created the external-root split and recorded
install-time behaviour as unverified),
[`docs/marketplace-supply-chain-threat-model.md`](../../docs/marketplace-supply-chain-threat-model.md)
(the threat model this surface sits under).

## Proposal

Extend `localPluginInstallSourceObservation` (or a sibling observation
composed into the same attestation) to also locate and hash the external
`agent-pipeline-local` marketplace root: resolve where Codex's plugin
registry believes that marketplace root lives, read its own
`marketplace.json`, and verify that its `plugins/pipeline-core` entry
resolves (following any symlink/junction) back to this exact checkout's
`plugins/pipeline-core` tree — folding that into `statusSha256` alongside
the existing checkout-identity hashes. Until that is implemented, the
preview text corrected in GATE-HONESTY-11 must keep stating plainly that
only this checkout's manifest identity and plugin-source tree digest are
attested, not the external root the install actually resolves through.

This is design/attestation work, not a text fix — dispatch to
`goldfish-deep` with a T1 Critic round on the result, per the same
discipline ADR-0052's own follow-up items use.

Owner: PO. Due: 2026-09-06.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept-deferred.
- **Rationale:** re-verified 2026-08-07:
  `localPluginInstallSourceObservation` (now at `human-guard-override.mjs:197-240`)
  still only hashes this checkout's own `marketplace.json`, `plugin.json`,
  and source tree; it never resolves or hashes the external
  `agent-pipeline-local` marketplace root. Only `c4d4034` (2026-08-06,
  "state the local-plugin-install attestation's true scope") has landed
  since filing, and it only fixed the human-facing preview text — exactly
  the narrow GATE-HONESTY-11 scope this item's own "Triggering situation"
  already names as *not* the fix. The underlying attestation gap is
  unpatched and, per the item's own reachability note, now live (no longer
  fail-closed dead).
- **Assignment (if accepted):** as the item's Proposal already states,
  `goldfish-deep` with a T1 Critic round on the result — this is
  design/attestation work on a security-relevant install path, not a
  same-session mechanical fix.
- **Date:** 2026-08-07
