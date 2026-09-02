---
schema: pipeline.backlog-item.v1
id: pipeline.entry-point-reachability-check-substring-matches-whole-source-files
type: defect
owner: pipeline
status: open
created: 2026-09-03
sprint: nova-b
tracking: "Nova B — the reachability check decides whether a guard admits a script by testing whether the guard's source text contains the script's stem anywhere, comments included. A comment citing an evidence file whose name happens to contain a script stem is read as an admission."
source: "Measured 2026-09-03: a full verify.mjs run went red on its only failing suite because commit 79bc79b8's comments cite an evidence file named 2026-09-02-nva-rebdead-f5-continuity-status.json, and safeStem reduces plugins/pipeline-core/scripts/continuity-status.mjs to the bare needle continuity-status."
done_when: manual
---

# The entry-point reachability check substring-matches whole source files

## What happens

`checkEntryPointReachability` in
`harness/scripts/check-product-capability-inventory.mjs` decides three things
about every discovered entry point with three plain substring tests:

```js
const namedInBootstrap = bootstrapCorpus.includes(entryPoint.basename);
const named = corpus.includes(entryPoint.basename);
const admitted = guardSource.includes(entryPoint.basename);
```

`guardSource` is the entire text of
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`, comments included, and
`safeStem` (`:121`) strips `.mjs`, so the needle for
`plugins/pipeline-core/scripts/continuity-status.mjs` is the bare string
`continuity-status`.

Any occurrence of that string anywhere in the guard — a comment, a citation, an
unrelated identifier, an evidence filename — is read as an admission rule.

## What it cost, measured

On 2026-09-03 a full `verify.mjs` run failed on this suite alone (505 of 506
green). The finding was:

    entry point admitted by plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs
    but named by no skill or guard: plugins/pipeline-core/scripts/continuity-status.mjs

It was false. The guard has no admission rule for that script; `grep -n
"continuity-status"` over the guard returned only two comment lines citing an
evidence artifact named `2026-09-02-nva-rebdead-f5-continuity-status.json`,
introduced in commit `79bc79b8`. Renaming that artifact
(`70eb60f4`) cleared the finding without touching a line of guard logic — which
is itself the proof that no admission ever existed.

Cost: one ~10-minute full verify run, plus the investigation to establish the
finding was false rather than a real undocumented admission.

## Why the direction of the false positive matters

This check exists to catch two opposite failures: a script the bootstrap docs
point agents at that the readiness guard never admits, and a script the guard
admits that nothing tells an agent about. The second is a real
security-adjacent concern — an admission nobody can discover.

A false positive in that direction manufactures a phantom admission. A reader
who trusts the finding goes looking for an admission rule that does not exist;
a reader who learns the check produces phantoms starts discounting its findings,
including the true ones. Either way the check gets less useful the more it fires
falsely.

The mirror risk is worse and is not measured here: the same substring test can
also produce a false NEGATIVE. A script whose stem happens to appear in an
unrelated comment counts as `named`, so a genuinely undiscoverable admission
would be silently reported as fine. Nothing currently rules that out.

## Directions — options only, no decision made here

1. Strip comments from `guardSource` before matching. Cheapest, and closes the
   measured instance exactly; leaves the underlying "substring over a whole
   file" fragility in place for the `named`/`namedInBootstrap` corpora.
2. Match a path-shaped needle (`scripts/<stem>.mjs`, or the admission's real
   argv shape) instead of a bare stem, for all three tests. Narrower and
   direction-symmetric, but needs to know what an admission actually looks like
   in the guard, which is more than this checker currently models.
3. Have the guard declare its admitted entry points in a structured list the
   checker reads, rather than inferring admission from source text at all.
   Strongest and most invasive; it turns an inference into a contract.

Option 3 is the only one that removes the inference. Options 1 and 2 make the
inference less wrong without making it a fact.

## Affected artifacts

- `harness/scripts/check-product-capability-inventory.mjs` — `checkEntryPointReachability` (~:297-330), `safeStem` (~:121)
- `harness/scripts/check-product-capability-inventory.test.mjs` — HAW-B01..B05 cover the true/false pairs but not a comment-only occurrence
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` — the source being matched against
