---
schema: pipeline.backlog-item.v1
id: pipeline.approval-authority-setup-echoes-generic-values-not-supplied-ones
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "Codex self-report from a live 2026-08-10 greenfield test session: 'Beim setup der Freigabeautorität wich die Rückmeldung von den übergebenen Werten ab: Trotz --human-name <value> --key-reference <value> meldete sie APS-PO und local-po-key.' (exact supplied values redacted here — they are the PO's real identity strings and must never appear in a committed artifact; the point is that the echoed identifiers did not match what was passed at all)."
---

# `setup` silently keeps an existing authority record's name/key-reference and reports success, instead of saying the newly-supplied values were not applied

## Description

A live Codex session ran the push-approval authority setup step with explicit
`--human-name <value> --key-reference <value>` flags (real values supplied,
not defaults), but the tool's own confirmation/readback reported back the
generic-looking identifiers `APS-PO` and `local-po-key` instead — values that
look like placeholders or internal defaults, not an echo of what was actually
typed. The runner flagged this as "at minimum confusing" and asked for it to
be checked.

**Root cause confirmed by the Elephant (2026-08-10), following a PO question
about whether this reflects a security gap:** it does not. Reading
`po-human-approval.mjs` lines 378-412 confirms `--human-name`/`--key-reference`
are bound to a key ONCE, at `setup` time, and persisted into
`trust-policy.json`; `authorize-critical` (line 414 onward) has no
`--human-name` parameter at all and only ever reads the existing bound
record. There is no route by which a later signing action can claim a
different identity than the one bound to the key at setup — the
architecture already is what the PO asked for when raising this.

The actual defect is narrower: `setup`'s own "authority already exists"
branch (lines 389-404) does not update the persisted `humanName`/
`keyReference` when explicit new values are supplied on a later `setup`
invocation and a named authority record already exists — it silently KEEPS
the old (here: apparently generic/placeholder) values and returns
`PO-HUMAN-AUTHORITY-READY` as if the just-supplied values had been applied.
Whether silently overwriting an established identity on every `setup` call
would itself be a bad idea is a separate question (rebinding an already-
established identity without an explicit confirmatory step has its own
spoofing-adjacent risk) — but returning an unqualified success code while
quietly discarding the caller's input either way is the confusing part the
runner actually hit.

## Triggering situation

Part of a longer self-report from a live 2026-08-10 Codex greenfield test
session (the same session that also reported the critical feature-branch
push blocker, filed separately). Reported by the PO immediately afterward as
worth checking, alongside several other findings from the same report.

## Affected artifact

`plugins/pipeline-core/scripts/po-human-approval.mjs`'s `setup` command,
specifically the "authority already exists" branch at lines 389-404. Confirmed
NOT a security/identity-binding gap (see Description) — narrowly a
success-message accuracy issue in this one branch.

## Proposal

When `setup` is invoked with explicit `--human-name`/`--key-reference` and a
NAMED authority record already exists (lines 396-404), and the supplied
values differ from the persisted `authority.humanName`/`authority.keyReference`,
either: (a) fail loudly with a message stating an authority already exists
under a different name/key-reference and explaining the deliberate path to
rebind it (if one should exist at all), or (b) if `setup` is meant to be
idempotent/no-op in this case by design, change `PO-HUMAN-AUTHORITY-READY`'s
message to explicitly state "existing record kept (name: X, key-reference: Y);
supplied values were not applied" rather than reading as an unqualified
success. Needs a PO/design decision on which of (a)/(b) is intended before
implementation — this item does not decide it. A reproduction in a throwaway
scratch repo (running `setup` twice with different `--human-name`/
`--key-reference` values the second time) confirms the exact current message
shape before writing a fix.

## Triage (filled in by the Elephant of the next Pipeline session)
