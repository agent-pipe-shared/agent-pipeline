# R7-6 / decision AA — several PO keys per repository: analysis and §22.6 delta

**Status:** delta accepted by PO decisions AC (env tier above the default), AD (second anchor only via the signed GS-2 change)
and AE (new probe class `probe-environment-unavailable`), 2026-10-07; it is the binding §22.6 delta for the candidate (chat
decision, recorded like decision I; `spec.md` itself is not edited so the approved Spec digest stays intact).

Read-only design pass, 2026-10-07 (design-tier model). Decision AA in [`po-decisions-2026-10-07.md`](po-decisions-2026-10-07.md).
Source references are to `plugins/pipeline-core/` at this date; no tests were run.

## Today

- **Anchors:** committed `project/critical-human-proof.json`; schema v3 holds a set `trustAnchors` of `{keyReference, publicKeySha256}`
  (`lib/critical-human-proof-policy.mjs:238-328`); HEAD has one anchor (`local-po-key`). The shared verifier
  `verifyAgainstTrustAnchors` (`:536-556`) is any-of on the pair; used by push/deploy consumption, guard maintenance window and others.
  Trust-on-first-use pinning only when no anchor exists (`lib/critical-action-authorization.mjs:172`). The human guard override is
  stricter (absent set = `HGO-TRUST-ANCHOR-MISSING`, `lib/human-guard-override.mjs:3954-3962`). `push-prepare.mjs:356-392` any-of on the
  pair. The readiness probe / sign-intent pre-check (`scripts/po-human-approval.mjs:972-1008`) match the digest only and report an empty
  set as `key-anchor-mismatch`.
- **Deviations from any-of:** the approve-push pre-check reads only the old single `trustAnchor` field (`scripts/pipeline-state.mjs:4599-4603`;
  null on v3 → check silently skipped); the local push scratch route trusts only the key behind the legacy per-repository pointer
  (`pipeline-state.mjs:4513-4539`).
- **Key directory:** one key per directory (fixed file names, `po-human-approval.mjs:1604-1617`). Resolution in `parseHumanArgs`
  (`:716-757`): `--directory` → machine plane `poKeyDirectory` → legacy per-repository store → env `PIPELINE_PO_APPROVAL_DIRECTORY`
  (`:70`, `:748`) → `SIGN-KEY-DIRECTORY-UNSET`. Second copies: `scripts/toolchain-preflight.mjs:402-415`; `push-prepare.mjs:340-342`
  (no `--directory`). Block comment `po-human-approval.mjs:702-711` is stale.
- **Machine plane:** one string `poKeyDirectory` in `<home>/.agent-pipeline/machine.json` (`lib/machine-plane.mjs`), i.e. one per OS user.
- **Writers:** `setup` writes only the legacy repository store (`po-human-approval.mjs:352-372`, finding F3);
  `persistExplicitDirectoryIntoMachinePlane` (`:282-311`) is never called; `set-po-key-directory` has null `executable`/`argv`
  (`:855-861`, finding F2).
- **Per-invocation choice:** the CLI accepts `--directory`, but handed-over commands omit it (`human-guard-override.mjs:3560-3568`,
  `pipeline-state.mjs:4214`, `:4260`, `:10681`).

## Gaps against AA

G1 no defined way to admit a second person's anchor; G2 local push scratch route only accepts the legacy-pointer key (and fixing F3
would break it unless changed together); G3 approve-push approval-time check ignores v3 anchors; G4 probe matches digest only and treats
an empty set differently; G5 the env tier sits below plane and legacy, so it can never pick a second key on a configured machine; G6
nothing writes or changes the default (F2/F3); G7 three resolvers to keep in step; G8 stale docs (`docs/push-release-flow.md:218-227`,
`:331-337`). `pipeline-state.mjs` is protected → G2, G3 and the catalogue entry for `set-po-key-directory` go to the signed package.

## Proposed §22.6 delta (replaces the first T14 bullet; pending PO answers Q1/Q2)

- **Key directories; one default per OS user (T14, decision AA).** Several people may sign for one repository, each with their own key
  directory; one person may hold several (one Ed25519 key per directory). The machine-wide `poKeyDirectory` (one value per OS user,
  outside every repository and `.git`) is that user's default.
- **One resolver for every entry point** (ceremony preparation, `sign-intent`, `authorize-critical`, readiness probe, `push-prepare`,
  `toolchain-preflight`): (1) explicit `--directory`; (2) `PIPELINE_PO_APPROVAL_DIRECTORY` in the invoking process (selects a non-default
  key for one terminal) **[Q1]**; (3) machine-wide default; (4) legacy per-repository value (read-only, reported legacy); (5) absent →
  `SIGN-KEY-DIRECTORY-UNSET`. The result names the resolving tier; an invalid consulted store is a failure, never "absent".
- **Handed-over commands** carry no `--directory` unless the PO named one for this ceremony, so the PO's terminal resolves its own choice.
- **Choosing a key never grants trust.** A key verifies only as a member of the committed anchor set (v3 `trustAnchors`; v1/v2
  `trustAnchor` as a set of one), any-of on the pair `keyReference` + `publicKeySha256`, at every local-key check (probe step (c),
  sign-intent pre-check, `push-prepare`, approve-push approval-time check, local push scratch route).
- **Adding a person's key** changes the committed anchor set only through **[Q2]**.
- **Writing the default:** `set-po-key-directory` is agent-runnable with concrete `executable`/`argv`; writes only `poKeyDirectory` and
  `updatedAt` in the machine plane (creating a valid plane if absent); refuses relative paths, non-directories, paths inside any
  repository or `.git`; reports an invalid plane instead of repairing it; replacing a different value needs confirmation; grants no trust.
  `setup --directory` writes the plane only when it records no directory, otherwise reports the current default and the repair command;
  it writes nothing in the repository or `.git`; the legacy store is read-only.
- **Out of scope:** named profiles per OS user; two people on one OS account; anchor removal / revocation; key-directory discovery;
  legacy migration.

## Test list (test-only dispatch after the PO answers)

1 resolution-order table with source labels; 2 env vs plane vs legacy vs `--directory` precedence; 3 invalid plane bypassed by flag/env,
failure otherwise; 4 `toolchain-preflight` and `push-prepare` resolve identically to `parseHumanArgs`; 5 `setup --directory` on a fresh
home writes only the plane (replaces pin PO-KEYDIR-01(A)); 6 `setup --directory` with a different existing default leaves it and reports
the repair; 7 `set-po-key-directory` argv non-null, writes only the two fields, refusals, invalid plane untouched; 8 two anchors A/B:
B's directory passes step (c), C fails `key-anchor-mismatch` before opening the private key; 9 pair matching (same digest, other
`keyReference` refused) at probe, `push-prepare`, verifier; 10 local push scratch route with a plane-only default accepts B, refuses
non-members (protected); 11 approve-push refuses a non-member at approval time with `CRITICAL-PROOF-TRUST-ANCHOR-MISMATCH`
(protected); 12 person A with K1 default and K2 via flag/env signs with K2, plane unchanged; handed-over commands carry no `--directory`.

## PO questions

- **Q1 env tier:** (a, recommended) above the plane as per-terminal selection of a second key; (b) keep it as the last fallback;
  (c) remove it.
- **Q2 admitting a second person's anchor:** (a, recommended) committed edit of `trustAnchors` through the existing audited GS-2
  override, signed by a key already in the set; (b) per-key trust-on-first-use with confirmation; (c) empty v3 set (any key; drops the
  identity binding; the guard override refuses it).
