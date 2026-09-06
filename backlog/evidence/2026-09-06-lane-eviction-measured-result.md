# The onboarding-suite eviction, measured — 2026-09-06

Two full `node harness/scripts/verify.mjs` runs, both bound to a clean tree,
differing only by commit `f16ab254` (one line removed from
`SERIAL_LANE_SUITES`).

| | Before (`d483eea6`) | After (`f16ab254`) |
|---|---|---|
| Wall clock | 645.7s | **482.5s** |
| Serial lane | 644.9s (60 members) | 481.7s (59 members) |
| Ordinary pool | 1015.2s | 1222.8s |
| Suites run | 515 | 515 |
| Non-zero suites | 1 | 1 |

**Saving: 163.2s, 25.3% of the gate.** The prediction from the self-race
evidence was "≈170s, ≈26%"; the measured value is slightly lower because the
pool absorbed the relocated work rather than it vanishing.

## The safety result matters as much as the speed

The run still ends with **exactly one** non-zero suite, and it is the same one
as before the eviction: `suite-registration-check`, the pre-existing TP-3
signature blocker that has nothing to do with lane membership. Every other one
of the 515 suites exits 0.

So the eviction did not trade correctness for speed. It removed a
false-positive lane membership and nothing else moved.

## What the lane looks like now

The lane is still 100% of wall clock — 481.7s of lane against 482.5s wall
clock — so the same lever still applies to what remains. The new top members:

```
  67.8s  guard-lifecycle-ready-tests
  57.3s  codex-pretool-guard-tests
  51.2s  gate-strength-guard-tests
  36.6s  human-guard-override-tests
  35.9s  onboarding-continuity-tests
```

Those five are 248.8s, 52% of the remaining gate. Unlike the evicted suite,
they are not obviously false positives: they exercise guards that genuinely
write under `.git/agent-pipeline/**`, which is the sweep's signal (b) in its
strong form. Each would need its own assessment, and some will legitimately
stay.

## Attribution

The lever was the PO's, not the analysis's. A day of measurement here went
into *which whole suites may leave the lane by module scoping*, which yielded
about 9%. The PO recalled the earlier idea — check whether the onboarding
suite's lane membership is a false positive, and whether independent cases can
be parallelized — and that single suite was worth 25.3%, roughly three times
the entire eligible list the module-scoping audit produced.

Recorded because the methodological lesson is more durable than the number:
the audit answered the question it was asked precisely and well, and the
question was the smaller one.

## Still open on the same suite

Intra-file concurrency. Node runs `test()` cases within one file sequentially
unless concurrency is set; the suite is 164 independent cases, each with its
own temp root, dominated by process-spawn latency. Two concurrent whole-suite
instances cost 171.1s and 170.4s against a 169.6s solo time — near-zero
contention — which is the shape that says intra-file concurrency would shrink
the 169.6s itself rather than merely relocating it. Not attempted; it is now
pool work rather than lane work, so it no longer sits on the critical path.
