# Critic delta re-review 3 (round 4/4, FINAL): PHX-2 rework 3 (base `099a31b`, head `6f191ee`)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max.
**Reviewed object:** delta `099a31b..6f191ee` on `specs/sprint-phoenix-epic/design/phx-2-additive-ledger-authority.md`, prior finding IDs Finding 1-4.
**Verdict: FAIL — 2 new MINOR (documentation self-consistency only; no design/control-flow/security impact).**

## Findings

A. **MINOR (new)** — the recovery paragraph's new appositive says "the two
   write-side failure points that occur only after the local write has
   already succeeded", but THREE do (sub-case 1, the filesystem-condition
   sub-case, AND `EEXIST` — all three fire only after `writeState`
   succeeded). Contradicts the document's own adjacent text in 3 places
   (`:474`, `:479-481`, `:488-490`) and the delta's own snippet comment,
   which correctly uses the plural "sub-cases". A second, related item: the
   passage at `:500-502` still quotes and scopes an old phrase ("once the
   underlying filesystem condition is fixed... applies only to the
   filesystem-condition sub-case") that the delta itself rewrote elsewhere
   to cover sub-case 1 too — the scoping text wasn't updated to match.
   `EEXIST`'s correct exclusion from that recovery path does survive.

B. **MINOR** — Finding 3 only partially resolved. The rewritten timeout
   paragraph says "the 5000ms convention `guard-push.mjs`'s own **two**
   existing git spawns already use" — `guard-push.mjs` actually has **20**
   git spawn sites, all at `timeout: 5000` (verified by full enumeration).
   Separately, describes both `pipeline-state.mjs` timeout-bearing sites as
   "conditional" — only one (`:2675`) is; `:2685` is unconditional `5_000`.
   The paragraph's conclusions (recommend `5000`ms at both new sites) are
   unaffected and, if anything, better-supported than claimed (20/20
   uniform, not a 2-site sample) — but the cited evidentiary basis for "which
   codebase convention this design reuses" doesn't describe the codebase.

## Deliberately not flagged (genuinely resolved)

**Finding 1 (MAJOR) — genuinely resolved at its core.** Independently
re-derived `pipeline-state.mjs`'s `approve-push` case from source (not from
the document's claim): exactly one `writeState` call at `:5213`, and §2's
own unchanged placement instruction lands the new block strictly after it in
every path. No residual "before"/"state untouched" language survives
anywhere in the document. The recovery it now prescribes (fresh signing
ceremony) is correct. Finding A above is a defect in how the extension is
*justified*, not in whether the sub-case is *covered*.

**Finding 2 — genuinely resolved**, byte-compared against §2's snippet.
**Finding 4 — correctly required no document change**, and none was made;
provenance for this round is clean (dispatch record `dispatcher: "goldfish"`
matches the commit trailer, the prior round's mismatch pattern did not
repeat). Scope clean (one file, five hunks, nothing protective removed).

**Explicit limitation disclosed by the Critic:** F1-F5/F-B/F-C/F-D
"remain intact" was NOT independently re-verified this round (the neutral
registry supplied covered only Finding 1-4) — the reviewer states this
should be read as "unverified this round," not "reconfirmed," though the
delta is additive/corrective and removes no disposition/guard/caveat on a
hunk-by-hunk check.

## Trajectory check

Consistent. One process disclosure: the dispatch's "changed path" framing
didn't distinguish the head commit from the base..head range (which spans 4
unrelated intermediate commits); this led the reviewer's scope check into
brief incidental contact with unrelated prior-verdict prose elsewhere in the
repo, disclosed and not used.

## Disposition — ROUND CAP REACHED

This is Critic round 4 of the 4 allowed under `critic-review.md`'s Phase-2.6
cap (initial + 3 deltas) for this package. Per that rule, a further FAIL
needs a **PO course gate, not a fifth autonomous correction round**. The
Critic's own assessment, offered as input to that gate (not as a decision):
the remaining defects are two sentence-level self-consistency corrections
confined to §4's prose, with no design, control-flow, or security
consequence — a materially different situation from a design failing on
substance. Exact remaining fix, if the PO wants it made: correct the
"two"→"three" write-side failure points at `:514-516`; update the stale
scoping phrase at `:500-502`; correct "own two existing git spawns" to the
real count (20) at `:268-270`; correct "conditionally" to name only `:2675`
as conditional at `:272-274`. Nothing else in the document is implicated.
