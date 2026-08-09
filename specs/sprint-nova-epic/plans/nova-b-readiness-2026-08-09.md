# Nova B readiness — status snapshot, 2026-08-09

Prepared per PO instruction this session: "Vorbereitungen für Nova B" are
welcome, but the pending 0.5.4 candidate must not be touched until the
happy-path test outcome decides the release. This is a **readiness update
only** — no Nova B slice code, schema or capability flag was written or
activated, and nothing under `plugins/pipeline-core/` was changed. It refreshes
[`nova-b-readiness-2026-08-06.md`](nova-b-readiness-2026-08-06.md) against
today's repository state (branch `feat/sprint-nova-codex-v046`, HEAD
`1024102`).

## Entry gate: still not met

[`nova-b.md`](nova-b.md)'s entry gate requires an accepted Nova A Result,
explicit PO activation, and the stable-main rebase. `docs/state.md`'s current
block (2026-08-09) states plainly: "Nova A completion still paused on genuine
ADR-gated/evidence-gated blockers." Nothing in the intervening three days
changed that disposition. **Conclusion unchanged from 2026-08-06: the gate is
not met**, so no Nova B slice work is started here either.

## Time-critical: the B1-I deferred-risk disposition expires TODAY

`nova-b.md`, Slice B1-I: "Accountable owner: the Nova Product Owner. Expiry:
**2026-08-09**." That date is today. Per its own terms, until the PO renews or
explicitly replaces this disposition, it lapses on schedule — no code change
enforces that, the disposition is simply no longer current after today. Its
effect either way: the Codex provider adapter stays inactive, B1 capability
stays unadvertised, Issue `#21` stays open. **This is a PO-only decision** (the
2026-08-06 note already flagged that an Elephant does not grant this renewal),
so it is surfaced here rather than acted on.

The B1-I code itself is still present and untouched:
`plugins/pipeline-core/lib/local-worker-supervisor.mjs` (+test),
`plugins/pipeline-core/lib/local-supervisor-state.mjs` (+test),
`plugins/pipeline-core/scripts/local-worker-supervisor.mjs` (+test, schema),
`plugins/pipeline-core/scripts/local-supervisor-setup.mjs` (+test). The flake
backlog item against this suite
(`2026-08-06-local-worker-supervisor-cli-suite-flakes-under-full-verify.md`)
is now `status: closed`.

## ADR-0047 numbering collision: still unresolved

Both files are still present, unchanged since 2026-08-06:
`docs/adr/0047-local-supervisor-state-authority.md` (what Nova B's D1/B1-I
sections mean) and `docs/adr/0047-model-free-advisor-preflight-v2.md` (a
different, unrelated ADR claiming the same number). Still only flagged, not
resolved — this readiness pass did not renumber either file, since that is a
docs/adr edit outside the scope the PO authorized this session (candidate
untouched, preparation only).

## The stale rebase criterion

`nova-b.md`'s entry gate names a rebase onto "the exact Product-Owner-identified
stable `main` 0.4.7 commit/tree." Locally-known tags now run `v0.4.0` through
`v0.5.2`, and `docs/state.md` records `0.5.3` as already released to `main`.
Whatever the actual current stable baseline is, it is several releases past
0.4.7 — the literal "0.4.7" text in the plan is stale. This doesn't change
whether the gate is met (Nova A acceptance is still the binding blocker
either way), but the wording will need a PO-scoped correction to name the
real current baseline before anyone tries to satisfy it literally.

## A tension worth flagging: queueHead already points at B0

`project/pipeline-state.json`'s `activeFeature` (`sprint-nova-epic`, phase
`implementation`, continuity revision 24, last updated 2026-08-07) carries
`queueHead: {packageId: "nova-b0", actionId: "runner-native-continuation",
nextAction: "dispatch"}`. Read literally, the mechanical queue already points
at dispatching Slice B0 next. But B0 carries no PO exception comparable to
B1-I's explicit 2026-07-26 pre-gate authorization, and `nova-b.md`'s own text
is unambiguous that the shared entry gate applies to every slice not
separately excepted. Dispatching B0 under the general gate would repeat the
exact situation the 2026-08-06 note already resolved the other way ("no Nova
B slice was implemented or activated" while the gate stood unmet). Recorded
here rather than resolved unilaterally — an Elephant does not grant itself a
pre-gate exception any more than it grants a B1-I renewal.

## What was deliberately not done today

- No Nova B slice code, schema, or capability flag was written or activated —
  same reasoning as 2026-08-06: the entry gate is unmet and every slice's own
  "Stop" conditions forbid it.
- No B1-I renewal, no B0 pre-gate exception, and no ADR-0047 renumbering were
  granted or performed — all three are PO-only calls.
- Nothing under `plugins/pipeline-core/` or any file bound to the pending
  0.5.4 candidate was touched, per this session's explicit instruction.

## Recommended next step for the PO

1. **Today:** decide whether the B1-I deferred-risk disposition is renewed,
   replaced, or allowed to lapse as scheduled.
2. Decide whether Slice B0 gets its own explicit pre-gate exception (as B1-I
   already has) or waits for the full entry gate like every other slice.
3. Resolve the ADR-0047 numbering collision (renumber one of the two files).
4. When ready, restate the entry gate's stable-baseline criterion against the
   actual current release line instead of the stale "0.4.7" text.

## Addendum — same-day PO resolution, 2026-08-09

All four items above were resolved the same day, recorded directly in
[`nova-b.md`](nova-b.md):

1. **B1-I disposition renewed** three weeks, new expiry **2026-08-30**.
2. **B0 pre-gate exception:** not granted. Instead, PO instruction defers all
   Nova B dispatch (including B0) until the pending 0.5.4 candidate is live —
   the `queueHead` tension resolves to "wait," not "except."
3. **ADR-0047 numbering collision:** out of scope here — the PO states it is
   being resolved in the Phoenix sprint and will merge later. Left untouched
   in this repository; not re-flagged going forward.
4. **Stale "0.4.7 rebase" criterion:** superseded, not merely noted — the PO
   confirmed the next release candidate (0.5.4) ships from Nova itself, so
   the entry-gate bullet and the "External 0.4.7 rebase gate (`#63`)" section
   in `nova-b.md` are both marked superseded with the 2026-08-09 instruction
   recorded inline.

No candidate file and nothing under `plugins/pipeline-core/` was touched by
any of these edits — all four are plan-document (`specs/`) changes only.
