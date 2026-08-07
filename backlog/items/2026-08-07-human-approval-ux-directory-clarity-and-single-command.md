---
schema: pipeline.backlog-item.v1
id: pipeline.human-approval-ux-directory-clarity-and-single-command
type: defect
owner: pipeline
status: open
created: 2026-08-07
due: 2026-09-06
source: "PO decision and observation during the first live guard-maintenance-window signing on 2026-08-07: the wrong key directory was used twice before the trust mismatch surfaced, and the PO was handed two commands where only the first is theirs."
---

# The human signs blind: no configured key directory, an opaque digest, and one command too many

## Description

The first end-to-end use of the signed guard-lift path worked, but exposed
three separate ways the human is asked to authorize something they cannot
fully see. All three are in the same layer and should be fixed together.

**1. The repository pins a key but not its location.**
`project/critical-human-proof.json` records `trustAnchor.publicKeySha256` and
nothing about where that key lives. Two external directories exist on this
machine, `agent-pipeline-po` and `agent-pipeline-po-nova`, holding different
keys — and both declare the same `keyReference: "local-po-key"`, so even that
field does not discriminate. The agent could not name the correct directory,
and the only feedback was `PO-APPROVAL-TRUST-MISMATCH` from
`guard-maintenance-window.mjs install`, i.e. **after** the PO had already read
a confirmation prompt and typed a passphrase.

**2. `sign-intent`'s confirmation prompt shows a digest, not a decision.**
The gate added earlier the same day correctly refuses to sign without an
explicit typed confirmation, but for `sign-intent` all it can honestly say is
"this arms a guard-lift/guard-override for whatever was recorded against this
digest". The PO's words: it is "wirklich nicht sehr aussagefähig". The
information exists — the request file names the scope rule IDs, the reason, the
expiry and the bound candidate — but the signing command never receives it.

**3. The PO was asked to run two commands when only one is theirs.**
`installGuardMaintenanceWindow` is documented in its own source as
`Agent-safe: verify-and-place only. Cannot succeed without a genuine proof`
(`plugins/pipeline-core/lib/guard-maintenance-window.mjs:382`), and was in fact
executed by the agent during the failed first attempt. Handing it to the human
was an orchestration error, not a design constraint — but nothing in the
documentation states which side of the boundary each command sits on, so the
error was easy to make and will recur.

## Triggering situation

The 2026-08-07 Nova session opened the first real maintenance window
(`TP-2,TP-6,TP-7`) for the ADR-0059 test coverage. The signing round took three
attempts: once with a relative `--repo-root` that the parser rejects without
saying it requires an absolute path, once with the wrong key directory, and
once correctly. The PO then made two decisions, recorded below.

## Affected artifact

- `project/critical-human-proof.json` and
  `plugins/pipeline-core/lib/critical-human-proof-policy.mjs` — the trust anchor
  that would carry a directory.
- `plugins/pipeline-core/scripts/po-human-approval.mjs` — `parseHumanArgs`
  (absolute-path requirement, unstated in `USAGE`) and
  `requireExplicitConfirmation` (the opaque `sign-intent` summary).
- `docs/po-human-approval.md` and `docs/push-release-flow.md` — neither states
  which commands are human-only and which are agent-safe.
- [ADR-0058](../../docs/adr/0058-guard-maintenance-window.md),
  [ADR-0059](../../docs/adr/0059-signed-human-guard-override.md).

## Proposal

**PO decisions taken 2026-08-07, to be implemented rather than re-opened:**
one key directory for all repositories, maintained in configuration, installed
once, with a per-repository SUBDIRECTORY beneath it for artifacts; and the PO
runs exactly one command per approval.

The subdirectory is not tidiness, it is a collision fix. Approval artifacts are
named from the feature id and action kind alone — `po-human-approval.mjs:165`
builds `request<suffix>.json` / `proof<suffix>.json` where the suffix is empty
for the default feature id — so nothing in the filename identifies the
repository. Two repositories sharing one flat directory silently overwrite each
other's request and proof. The already-populated shared directory shows the
shape: `request.json`, `proof.json`, `request-cyb-5.json`,
`proof-cyb-5.json`, `phoenix-authority-revision-*.json`. One key and one place
to back up, but per-repository artifact storage beneath it.

Guard lifts specifically do not contribute to this growth, which is worth
recording so the fix is not over-scoped: the window record lives in the
repository's own git common directory
(`guard-maintenance-window.mjs:258-261`), and `sign-intent` leaves exactly one
fixed-name `proof-manual.json` behind, overwritten each run, with its
intermediate intent and signature files removed in `finally` blocks.

Concretely:

1. **Record the directory in configuration**, as a non-authoritative hint
   beside the authoritative key hash — the hash stays the trust anchor, the
   path is only where to look. With it, the agent can name the exact command,
   and `po-human-approval.mjs` can check the local public key against the
   pinned hash **before** prompting for anything, turning a post-passphrase
   trust mismatch into a pre-confirmation refusal. Resolve artifacts to a
   per-repository subdirectory beneath the configured root, and keep the key
   material at the root so it is installed and backed up once.
2. **Let `sign-intent` describe what it signs.** An optional `--request <path>`
   that the command verifies against `--intent-sha256` — refusing outright if
   the request's own `intent.sha256` differs — and then renders in plain
   language: scope, effect, duration, bound candidate. Without the flag, keep
   today's honest "I do not know". The check is what makes the rendering
   trustworthy: it can never describe something other than what is being
   signed.
3. **State the human/agent boundary per command** in the two flow documents,
   and keep `install` on the agent side where its own source already puts it.

Note that a single shared directory does not weaken replay protection: an
approval intent binds the candidate commit, plan and spec digests, so a proof
minted for one repository cannot open a window in another regardless of which
key signed it. Key separation only ever bounded blast radius on key
compromise, and every directory lives on the same machine behind the same
person. If separate keys are ever reintroduced, they must carry distinct
`keyReference` values — two keys both called `local-po-key` make the field
worthless precisely where it is most needed.

Related, same family: the confirmation prompt is English-only
([`pipeline.human-authorization-prompts-ignore-the-configured-language-profile`](2026-08-07-human-authorization-prompts-ignore-the-configured-language-profile.md)).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
