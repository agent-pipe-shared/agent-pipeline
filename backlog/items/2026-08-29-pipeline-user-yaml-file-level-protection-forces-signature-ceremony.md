---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-user-yaml-file-level-protection-forces-signature-ceremony
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: 56f2116ac15862ed99e3f37656b296d8dfe822b3
closure_evidence: plugins/pipeline-core/hooks/guard-gate-strength.mjs
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

## Shell-lane note (Acceptance bullet 3)

The shell-command lane (`GUARD-GATE-STRENGTH-SHELL` in
`guard-lifecycle-ready.mjs`) is left coarser, deliberately, and stays
file-scoped even after this fix. Its own runtime denial text already
states the reason, unprompted by this item: it matches on the file NAME
`pipeline.user.yaml` appearing anywhere in an arbitrary shell command
string, and says explicitly that "this rule cannot tell a read from a
write inside an arbitrary shell command, so it refuses both rather than
risk letting the gate-weakening write through." A classifier that
cannot distinguish a read from a write has no basis to determine which
YAML field a write would touch either — field-level scoping needs the
tool's structured `tool_input` (`old_string`/`new_string`/`content`),
which the shell lane never receives; it sees only the command's text.
Narrowing the shell lane to match this dispatch's write-lane field
scoping would require either parsing the effect of an arbitrary shell
command (out of scope for a token-substring classifier by design) or
whitelisting specific command shapes (a much larger, separately-scoped
piece of work). No inconsistency is left silent: the write lane (this
fix) and the shell lane (unchanged) are now each doing the strongest
thing their respective input shapes support.

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

Closed, 2026-08-29 (dispatch NVA-W13-GATESTRENGTH, commit `56f2116a`).

**What landed:** `guard-gate-strength.mjs` gained a field-level diff for
GS-1 only (`GATE_STRENGTH_FIELD_EXEMPTIONS`, `changedGateStrengthDottedPaths`,
`evaluateGateStrengthFieldExemption`), gated behind an explicit,
default-deny allowlist (today: `language.human_facing` only). An Edit/Write
to `pipeline.user.yaml` is simulated against its current on-disk content
(mirrors `guard-handover-size.mjs`'s own Edit-simulation shape), parsed
with the existing `lib/yaml-lite.mjs`, and diffed by dotted leaf path; the
GS-1 ceremony stands down only when every changed path is on the
allowlist. Anything this cannot cleanly determine — an unparseable
document, an unsimulatable Edit, any changed field outside the allowlist
(including `gates.push_approval` itself) — falls straight through to the
unchanged, file-scoped ceremony. Marker `pipeline.field-scoped-gate-
strength-protection` present verbatim (`done_when` satisfied, confirmed
with `rg`).

**Verified by the dispatcher:** the existing `guard-gate-strength.test.mjs`
suite (38/38, unmodified logic unaffected) and
`harness/scripts/check-consumer-safe-paths.test.mjs` (9/9) both green
against the committed change. The two Acceptance bullets that ask for new
regression coverage (an exempt-only edit admitted; a `gates.push_approval`
edit, alone or alongside an exempt field, still refused) were proven with
a standalone reproduction script run against the real, committed guard
(8/8 checks: language.human_facing-only Edit admitted; push_approval Edit
refused; both-fields-touched Edit refused; language.human_facing-only
Write admitted; an unparseable proposed document falls through
fail-closed; `changedGateStrengthDottedPaths` unit-tested directly;
`evaluateGateStrengthFieldExemption` unit-tested directly; the allowlist
shape itself asserted) — not run through the actual test suite, because
`guard-gate-strength.test.mjs` is TP-6 protected and the in-session Edit
was refused (`author-repair-required`, no in-session override route: the
target is Pipeline plugin source, so the override planner requires an
explicit author source root a guard cannot select on the human's behalf).

**What remains — a genuine, disclosed gap, not closed by this dispatch:**
the drafted GST39–GST46 regression tests (the exact source, matching the
verified reproduction above) were never landed in the committed test
suite. They exist only as a draft diff, in this session's own
`scratch/guard-gate-strength.test.mjs.draft-diff.md` — which is
gitignored and therefore NOT durable past this session's workspace. A
follow-up session with either author-repair standing on this plugin
source, or an explicitly briefed test-change task (per `roles/goldfish.md`
GF-04 / QG-04, this dispatch's own briefing correctly refused to let an
ad-hoc edit through TP-6), should re-derive and land that coverage in
`guard-gate-strength.test.mjs` directly — the logic itself is proven
correct by the reproduction above, so this is a landing task, not a design
task.

Acceptance bullet 3 (shell-lane handling) is addressed by the "Shell-lane
note" section above: the shell lane stays intentionally file-scoped, and
says so in its own runtime denial text already — no code change was
needed or made there, and none of `guard-lifecycle-ready.mjs` was
touched by this dispatch.
