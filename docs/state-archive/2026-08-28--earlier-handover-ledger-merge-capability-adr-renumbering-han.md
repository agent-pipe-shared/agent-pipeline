# Handover archive -- Earlier handover — ledger-merge capability, ADR renumbering, handover rotation (2026-08-27)

> Rotated from `docs/state.md` on 2026-08-28 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Earlier handover — ledger-merge capability, ADR renumbering, handover rotation (2026-08-27).
> Summary: Ledger merge across parallel sprints (ADR-0068), ADR renumbering at acceptance (ADR-0069), and the first handover rotation; its four live open items -- ADR collision 0063, the unregistered check-adr-consistency, BS25/BS26 durability, and the Nova A candidate list -- are carried forward to the current handover.
> Append-only once written; never edited by hand.
> Content below is verbatim except that relative markdown link target(s) were rewritten to keep resolving correctly at this file's directory depth (link text and all other content are untouched).

## Earlier handover — ledger-merge capability, ADR renumbering, handover rotation (2026-08-27)

**READ THIS FIRST.** Three connected pieces of work, all committed, all on
`feat/sprint-nova-codex-v046`.

**1. The backlog ledger can now be merged across parallel sprints** — the
capability the Phoenix merge proved missing. [ADR-0068](../adr/0068-backlog-ledger-merge-semantics.md)
records the decision; the defect it fixes was a contradiction sitting unnoticed
in one module, because it is invisible while nothing moves: chain validation
demanded an amendment's `from`/`to` equal the item's CURRENT status, while
supersession recognition and the planners demanded the status frozen in a
registry. Both readings coincide until a second line advances the item, and then
they are mutually unsatisfiable. An amendment is now status-neutral and binds
its target by `entryHash` rather than physical position. All 38 Phoenix
reachability amendments migrated; the measurement that matters is that the same
append took `check-backlog-state.mjs` from 13 findings to 73 before the change
and leaves it unchanged after. `backlog-state.test.mjs` 55/55 including BS26,
which can finally exercise what it was written for. Commits `87203a08`,
`e8e65eb4`, `14f028bb`, `72c1c48d`, `086c3430`.

**2. The six duplicate ADR numbers the merge produced are being resolved.**
[ADR-0069](../adr/0069-adr-numbers-are-allocated-at-acceptance.md): numbers are
allocated at ACCEPTANCE, never at drafting, and carry no sprint prefix. Five of
six done — 0062→0071, 0064→0073, 0065→0074, 0066→0075, 0061→0070. **0063 is
still open** and is the largest (97 files, ~185 ambiguous bare references);
expect `repository-directory-contract` to keep the number on reference load.

**3. `docs/state.md` is editable again** — it was 48,825 bytes against its own
30,000-byte cap, which blocked every session that follows the bootstrap
protocol. Checkpoints 61–71 rotated to `docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md` (`da70d0df`).

### Still open, in order

1. **Collision 0063 → 0072.** The only remaining `DUPLICATE-NUMBER` finding.
2. **Register `check-adr-consistency.mjs` in `verify.mjs`** (ADR-0069 D3). The
   checker already existed and already worked; `verify.mjs` simply never ran it,
   which is why six collisions could land unreported. Do this AFTER 0063, or
   Verify goes red by design.
3. **BS25/BS26 durability** (ADR-0068 D6, not yet written): three positional
   lookups remain (`backlog-state.mjs:1326`, `:1504`, and the test's fixture).
   Two can bind by `entryHash`; `amendsSequence` has no hash in its event shape
   and needs an additive `amendsEntryHash`. The test fixture must stay
   positional — it needs a contiguous valid chain — so the prefix invariant
   becomes a NAMED check instead of a silent assumption.
4. **Full `verify.mjs` run** once the above land.

### Recommended for this candidate (Nova A), everything else Nova B

- `handover-file-exceeds-its-own-size-cap` — **done above**, close it.
- `long-dispatches-truncate-before-emitting-their-report` — hit **five times**
  in the 2026-08-27 session alone; two dispatches lost their report entirely and
  one nearly lost its work. The closing-allowance fix is already designed.
- `existing-repos-drift-on-agy-pipeline-user-yaml-update` — adoption blocker for
  every existing repo once 0.6.0 ships.
- `gitleaks-content-fingerprint-breaks-on-any-line-insertion` — presents as an
  unexplained blocking secret scan.
- `antigravity-hard-enforcement-layer-has-two-fail-open-paths` — **PO
  instruction 2026-08-27: the agy security items belong in the candidate.** The
  residual path is not small: the entire Antigravity hard-enforcement layer
  (PreToolUse guards, mandatory-bootstrap hard block) is inert whenever the
  daemon cannot resolve `node`, and it fails SILENTLY because the hook that
  would report it is the one that does not run. Its own QG-06 review horizon
  (`due: 2026-08-30`) is three days out.

Five further items are finished but not closed (ledger-merge, BS26,
claude-start-time, tp-guard-restore, intake-generate-coordinator — the last is a
status/Triage contradiction). Closing them is bookkeeping, but until it happens
every backlog overview is wrong.

### Ledger discipline — extracted 2026-08-27, applies to the closures above

Both rules existed ONLY in the rotated checkpoints and are now filed
(`f5a77841`): a `reconcile-backlog-ledger.mjs --activate` result is committed
ALONE, because GG-22 inspects the whole staged index rather than the commit's
pathspec; and `check-backlog-state.mjs` runs BEFORE committing a ledger change,
since an uncommitted bad reconciliation is undone with `git checkout --` on the
three projection files while a committed one needs the heavy evidence-amendment
machinery. `closure_commit` needs a FULL lowercase OID.

