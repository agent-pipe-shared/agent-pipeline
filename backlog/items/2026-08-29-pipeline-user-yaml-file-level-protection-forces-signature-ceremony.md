---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-user-yaml-file-level-protection-forces-signature-ceremony
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/hooks/guard-gate-strength.mjs pipeline.field-scoped-gate-strength-protection
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md, section 5.4), observed during the 2026-08-29 three-runner greenfield test."
---

# Fixing the PRD-language field requires a full Ed25519 ceremony, because pipeline.user.yaml is protected in its entirety on account of one unrelated field

## What happened

`pipeline.user.yaml` is gate-strength-protected as a WHOLE FILE, not per
field. The reason for the protection is real: the file carries
`gates.push_approval`, which decides whether a human clears the push gate with
a detached signature or in-session (ADR-0056). But the file also carries
`language.human_facing` — the exact static fallback value at the far end of
the F06 mismatch chain — and any edit to that unrelated field triggers the
identical protection, meaning correcting a language default costs the same
full human-guard-override signature ceremony as changing the push-approval
mode itself.

This is the third item in the F05/F06/F07 causal chain: this is WHY F06's fix
is expensive to land, not a separate defect in isolation.

## Where it is

`plugins/pipeline-core/hooks/guard-gate-strength.mjs`:
- Lines 92–93: the protected-path table entry —
  ```
  path: "pipeline.user.yaml",
  reason: "pipeline.user.yaml carries gates.push_approval — it decides whether a human clears the push gate with a detached signature or in-session (ADR-0056).",
  ```
  — the `path` field names the whole file, with no field-level scoping
  mechanism visible in this table's shape.
- Line 408: `pipeline.user.yaml` also appears in the shell-command classifier's
  protected-file-name list (`["pipeline.user.yaml", "project/pipeline.yaml",
  ".claude/pipeline.yaml"]`), which is what makes even a `sed -i` or similar
  shell command against the file refused outright, independent of the Edit/Write
  path.
- Verified empirically in this same dispatch: an attempted read-only `grep -n
  pipeline.user.yaml project/guard-config.json` was refused by
  `guard-lifecycle-ready.mjs` with `GUARD-GATE-STRENGTH-SHELL`, whose own
  denial text confirms the match is on "the file NAME pipeline.user.yaml
  appearing in the command," not on a distinguishing which FIELD would be
  touched — the classifier genuinely has no field-level view of the file's
  contents, only its name.

## Proposal

Move from file-level to field-level gate-strength protection for this one
file, since it is the only file in the protected-path table where the
protection reason names a SINGLE field (`gates.push_approval`) rather than the
file's contents as a whole. Concretely:

1. Extend the protected-path table entry (or add a sibling mechanism) so an
   Edit/Write to `pipeline.user.yaml` is inspected for which top-level YAML
   key(s) it changes, and the gate-strength ceremony is required only when
   `gates.push_approval` (or another key later added to an explicit protected-
   fields list for this file) is among the changed keys. An edit touching only
   `language.human_facing` (or any other currently-unprotected field) proceeds
   as an ordinary edit.
2. This is more invasive than the other two chain items (F05, F06) because it
   changes the SHAPE of protection for a currently file-scoped mechanism, not
   just a bug in one function — treat it as its own design decision, not a
   drop-in patch, and route it through the same review this file's own
   protection went through originally (it exists because of ADR-0056).

## Acceptance

- An Edit/Write to `pipeline.user.yaml` that changes ONLY
  `language.human_facing` (or another explicitly non-push-approval field) is
  admitted WITHOUT a human-guard-override ceremony — proven by a test.
- An Edit/Write to `pipeline.user.yaml` that changes `gates.push_approval` (or
  any field not on the explicit non-protected allowlist) still requires the
  full ceremony, unchanged from today — proven by a test, since this is the
  regression that would matter most.
- A shell command targeting `pipeline.user.yaml` (the line-408 classifier) is
  updated consistently with the Edit/Write-path change, or the item explicitly
  states why the shell-command lane is intentionally left coarser (it cannot
  distinguish a read from a write inside an arbitrary shell command per its own
  denial text, so it may need to stay file-scoped even after this fix — if so,
  say so here rather than silently leaving an inconsistency).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Confirmed empirically in this same dispatch session (a
  read-only `grep` naming the file was refused), and the protected-path
  table's own stated reason names one field, not the file's contents as a
  whole — the mismatch between protection SCOPE (whole file) and protection
  RATIONALE (one field) is the defect, not a hypothetical.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate. Third of the
  F05/F06/F07 chain — see `pipeline.prd-binding-precedes-framing-with-no-
  reopen-path-back` (F05) and `pipeline.prd-language-gate-reads-a-field-
  intake-never-writes` (F06). This is the more invasive of the three and may
  warrant its own design pass rather than a same-session patch.
- **Date:** 2026-08-29
