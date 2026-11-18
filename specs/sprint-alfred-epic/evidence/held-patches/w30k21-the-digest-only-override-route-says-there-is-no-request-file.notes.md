# w30k21 — the signature card on the digest-only override route no longer says the request file stays in scratch/ (C30K-K21, follow-up of C30J-J28)

**Order.** The patch is a delta on the integrated 30j tree (the clone int30j: the 30i chain, every 30j lane including w30j12 and w30j28, and the 30k wave 1 lanes). It does NOT apply to the real checkout before that chain; applied after it, `git apply --check` is clean (measured on the int30j clone: exit 0). An exit 1 against the real repository before the chain is expected, so the check test asserts only that the patch is non-empty and touches only the briefed files. `lib/critical-action-approval-card.mjs` is protected plugin source: the PO applies and commits this chain.

**Criterion.** AC-112 is the closest existing accepted criterion; it does not name this route, and the PRD and the Spec are unchanged. The Critic is suspended for candidates of this repository (PO 2026-11-16) and no Full Verify runs: this change is verified by tests only; no review was made, and none is claimed.

## What it does

- `lib/critical-action-approval-card.mjs`: `signingCeremonyCard` takes a route flag `requestFile` (default `true`). With `false` the decline sentence says "No request file exists on this route; without a signature nothing is granted" (German equivalent) instead of "The request file stays in scratch/ without a signature and grants nothing". With the default the text is byte-identical to before. The flag is derived by the caller from what it already knows and is stored nowhere.
- `scripts/po-human-approval.mjs`: only the digest-only branch of `signingConfirmationCard` (no request schema, structured `cardFacts` of the resolved description) passes `requestFile: false`. The signature-request route and the design-approval card are unchanged.
- No digest, subject, plan, proof byte or key handling, no record shape, no stored status and no gate changed; the card stays omitted where its facts are absent.

## Restated pin (QG-04)

The J28 case in `lib/critical-action-approval-card.test.mjs` compared the digest-only card byte for byte with the request-route card, which pinned the old decline sentence for the digest-only route. It now compares both cards apart from the decline line (English and German); the new K21 case pins the new decline sentence and that the request-file route's sentence is unchanged. No case was weakened or deleted.

## Checks (clone, serial, each alone, private TMPDIR)

- `lib/critical-action-approval-card.test.mjs`: 31 of 31 pass (30 + 1 new; the new case was red first: the digest-only decline still said "stays in scratch").
- `scripts/po-human-approval.test.mjs`: 236 of 236 pass (235 + 1 new journey case: `sign-intent --intent-sha256` to its confirmation prompt, decline sentence read from the prompt, proof still covers the digest only). The journey case was written together with the card case and was not run on its own against the original code.
- Check test of this slice: patch non-empty and limited to the four files.

## Not changed / not proven

- No live signing run with a real key and a terminal; wording not read by a human; no Full Verify; no Critic review.
- `lib/critical-action-approval-card.test.mjs` remains unregistered in `harness/verify-suites.json` (protected, TP-13), as in w30j12.
- The write-scope list of the briefing names the card module and its test plus the three deliverables; the clone list additionally names `scripts/po-human-approval.mjs` and its test, which the one-line caller change and the journey case need. Both are in the patch.
