---
schema: pipeline.backlog-item.v1
id: pipeline.approval-authority-setup-echoes-generic-values-not-supplied-ones
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "Codex self-report from a live 2026-08-10 greenfield test session: 'Beim setup der Freigabeautorität wich die Rückmeldung von den übergebenen Werten ab: Trotz --human-name <value> --key-reference <value> meldete sie APS-PO und local-po-key.' (exact supplied values redacted here — they are the PO's real identity strings and must never appear in a committed artifact; the point is that the echoed identifiers did not match what was passed at all)."
---

# The push-approval setup command's confirmation echoes generic/default-looking identifiers instead of the values the caller actually supplied

## Description

A live Codex session ran the push-approval authority setup step with explicit
`--human-name <value> --key-reference <value>` flags (real values supplied,
not defaults), but the tool's own confirmation/readback reported back the
generic-looking identifiers `APS-PO` and `local-po-key` instead — values that
look like placeholders or internal defaults, not an echo of what was actually
typed. The runner flagged this as "at minimum confusing" and asked for it to
be checked. This was not independently reproduced this session (no exact
command/output pair is available, only the runner's own retrospective
description) — treat as a lead to investigate, not a confirmed root cause.

## Triggering situation

Part of a longer self-report from a live 2026-08-10 Codex greenfield test
session (the same session that also reported the critical feature-branch
push blocker, filed separately). Reported by the PO immediately afterward as
worth checking, alongside several other findings from the same report.

## Affected artifact

`plugins/pipeline-core/scripts/po-human-approval.mjs`'s `setup` command (the
one that accepts `--human-name`/`--key-reference` and is supposed to persist
and then confirm them) — likely candidates for the actual defect: (a) the
confirmation/readback path reads a DIFFERENT field than the one `--human-name`/
`--key-reference` write to (a naming drift between the CLI's own argument
names and the persisted/displayed field names); (b) a fallback-to-default
path fires even when explicit values were supplied, e.g. because a prior
GF-080 change this same session (`persistExplicitDirectoryIntoMachinePlane`)
or an adjacent write path leaves a stale default value that the confirmation
reads instead of the just-written one; (c) the confirmation text is simply
hardcoded/generic and was never wired to the actual persisted values at all.
Needs direct source reading to confirm which.

## Proposal

No fix proposed yet — needs investigation first, since the exact mechanism is
unconfirmed. Read `po-human-approval.mjs`'s `setup` subcommand fully: trace
where `--human-name`/`--key-reference` are parsed, where they are persisted,
and where the confirmation text/readback is generated, to find the actual
disconnect. A reproduction in a throwaway scratch repo (running `setup
--human-name <test-value> --key-reference <test-value>` and inspecting both
the persisted file and the printed confirmation) would settle this quickly
and should be the first step of any fix dispatch.

## Triage (filled in by the Elephant of the next Pipeline session)
