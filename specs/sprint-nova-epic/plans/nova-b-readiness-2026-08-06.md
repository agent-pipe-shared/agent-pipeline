# Nova B readiness — status snapshot, 2026-08-06 evening

Prepared autonomously while the PO was AFK, at the PO's request ("Ausarbeitung
... der nächsten Nova B items"). This is a **readiness assessment, not an
implementation** — no Nova B slice code was written or activated. Every
finding below is grounded in the current repository state (branch
`feat/sprint-nova-codex-v046`), not in the plan document's aspirations alone.

## The entry gate is not met, and nothing in tonight's work advances it

[`nova-b.md`](nova-b.md)'s entry gate requires: an accepted Nova A Result
(all of A1–A7, `#57 #7 #29 #38 #14 #12 #54 #8 #56 #98`, with gate-only `E1`
increment receipt + independent readback and gate-only `E2` PO activation),
the exact PO-identified stable `main` 0.4.7 rebase, and explicit PO
activation.

Checked against [`nova-a.md`](nova-a.md): Nova A's own entry gate states "the
prior PRD/Spec approval is revoked; revised 17-Issue authority and a new
readiness/PO gate are required before implementation resumes" — i.e. Nova A
itself was mid-revocation/re-approval, not accepted, the last time its own
plan file was authoritative. **This evening's and today's actual session work
(the T1–T7 Critic rounds, ADR-0054/0055/0056, GS-1..GS-7 guard hardening, the
push-approval signature system) does not correspond to any Nova A issue
number** (`#57 #7 #29 #38 #14 #12 #54 #8 #56 #98`) and does not advance the
A1–A7 slice list. It is a separate "0.5.2 patch-candidate recovery" track
running on the same branch. **Conclusion: Nova B's entry gate is not met, and
nothing done today changes that.** No Nova B slice was implemented or
activated tonight for this reason.

## What already exists ahead of the gate, under a recorded PO exception

Not every trace of Nova B is theoretical. `nova-b.md`'s own "2026-07-26 PO
exception and bounded design phase" section records that the PO explicitly
authorized bounded pre-gate implementation for **B1-I** (local worker
supervisor). Confirmed still present in the tree:

- `plugins/pipeline-core/lib/local-worker-supervisor.mjs` (+ test)
- `plugins/pipeline-core/lib/local-supervisor-state.mjs` (+ test)
- `plugins/pipeline-core/scripts/local-worker-supervisor.mjs` (+ test, schema)
- `plugins/pipeline-core/scripts/local-supervisor-setup.mjs` (+ test)

This matches an already-open backlog item,
`backlog/items/2026-08-06-local-worker-supervisor-cli-suite-flakes-under-full-verify.md`
(a parallel background triage pass tonight is assessing that flake
specifically — see the backlog reconciliation work in this same session).

**Time-sensitive: the B1-I deferred-risk disposition expires 2026-08-09,
three days from now.** `nova-b.md`: "Accountable owner: the Nova Product
Owner. Expiry: 2026-08-09. Until that owner renews or replaces this
disposition... the Codex provider adapter remains inactive, B1 capability
remains unadvertised, and Issue `#21` remains open." If the PO wants to keep
this disposition alive past Friday, that needs a deliberate renewal — it will
not happen by itself.

## A naming collision found while checking Nova B's ADR dependencies

`nova-b.md`'s D1/B1-I sections depend on "ADR-0047" (the local-supervisor
state/authority boundary). The repository currently has **two different
ADR-0047 files**:

- `docs/adr/0047-local-supervisor-state-authority.md` — matches what Nova B's
  plan means.
- `docs/adr/0047-model-free-advisor-preflight-v2.md` — an unrelated ADR that
  also claims number 0047.

This is an ADR numbering collision, not evaluated further here (out of scope
for a readiness snapshot) — flagged as a small, separate finding. Not filed as
its own backlog item yet; recommend the next session either confirms this is
intentional (unlikely) or renumbers one of the two.

## Per-slice status (plan-only estimate; not independently re-verified beyond the two checks above)

| Slice | Issue(s) | Status per plan + repo check | Note |
|---|---|---|---|
| Entry gate | — | **Not met** | Nova A not accepted; no 0.4.7 rebase evidence found tonight |
| B0 | `#60` | Plan only | Runner-native continuation contract; no dedicated code located tonight |
| D1 | — | Blocked | Explicitly gated on Nova A acceptance in its own text |
| B1-C | `#21` | Plan only | Pure pool/capacity reducer, no production supervisor |
| B1-I | `#21` | **Partially implemented under PO exception** | Code exists (see above); B1 capability itself stays unadvertised; disposition expires 2026-08-09 |
| B2-C | `#16`, `#18` | Plan only | Async/lease contracts, synthetic only |
| B2-I | `#16`, `#18` | **Local contract implemented, no live pilot** | Plan states "implemented and Verify-registered as a token-free, network-free broker reducer" — matches `nova-b2-gitlab-ci-broker-*` Verify phases seen in `docs/product-capability-inventory.json` tonight |
| B3-R | `#15` | Plan only | Antigravity/Gemini research decision — not started tonight (out of scope: would need external research, deliberately not done autonomously, see below) |
| B3-A | `#15`, `#69` | Plan only | Blocked behind B3-R |
| B4 | `#51` | Plan only | GitHub/GitLab transport — depends on B2-I leases or a separate auth boundary |
| B5 | — | Not reached | Candidate assembly/freeze; depends on all prior slices |
| B6 | `#49`, `#72` | Plan only | Native macOS transfer disposition |

## What was deliberately NOT done tonight, and why

- No Nova B slice code, schema, or capability flag was written or activated —
  the entry gate is unmet, and every slice's own "Stop" conditions forbid
  exactly this (implied permission expansion, external/credential/network
  work, claiming a live capability).
- No Antigravity/Gemini research (B3-R) was performed — that slice's own
  order is "official source/version/auth/output research" before any
  proposal, which means real external research the PO should scope and
  review, not something to freelance overnight without oversight.
- No B1-I renewal or B2-I live-pilot authorization was granted — both
  explicitly require the PO's own decision, not an Elephant's.

## Recommended next step for the PO

1. Decide Nova A's actual disposition — is it still being pursued under
   `nova-a.md`'s 17-issue scope, or has it been superseded by the work this
   branch actually did today (guard/push hardening)? The two plans currently
   describe different work, and the branch has been carrying the latter.
2. If B1-I should continue past 2026-08-09, renew the deferred-risk
   disposition explicitly before that date.
3. Resolve the ADR-0047 numbering collision.
