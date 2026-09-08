# Conservative unparsed-command protected-path denial

NVA-B-UNPARSED-CAVEAT-1 makes the protected-test-path shell denial distinguish
a positively resolved target from a possible target contributed by a
fail-closed fallback. It does not widen shell grammar or admit any protected
write.

## Measured reproduction and classification

The new regression uses an unparseable command whose named writer targets an
unprotected scratch note while a later display argument merely mentions the
protected suite. The guard evaluates that command without executing it. Before
the repair, the classifier returned the protected token on
`unparsed-command` but supplied no evidence that it was only a possible target,
and the lifecycle denial incorrectly said it had detected a write.

The repair adds `classification: "conservative-possible-write"` only to
unresolved candidates:

- the raw-token unparsed-command fallback;
- opaque payload regions that cannot be shown to be one literal write-target
  argument, including dynamic expressions and text outside known calls; and
- recursively reclassified opaque payload candidates.

Resolved command operands and a literal first argument to a known opaque
write-sink retain the pre-existing hit fields (`rule`, `candidate`, `lane`) and
the detected-write wording. The opaque basename fallback retains its prior
rule-first priority while carrying the selected region's classification.

The lifecycle message now calls this a conservative possible write, explains
that a mention can trigger the fallback, recommends splitting supported
standalone read/run commands, and directs a real protected test change to the
sanctioned author-repair workflow. It does not print the raw command and does
not suggest rerouting through another writer as a bypass.

This is distinct from the older `rm <protected-path>; echo done` example: that
shape contains an apparent direct protected-path writer. The measured new case
has the writer elsewhere and uses the protected path only as display content;
the guard nevertheless continues to refuse it conservatively because its
command structure is unresolved.

## Evidence

- Additive failure-first capture:
  `scratch/NVA-B-UNPARSED-CAVEAT-1/unparsed-caveat-red.txt` — exit 1, with the
  three new assertions failing against the pre-repair classifier and denial
  wording.
- Scoped final capture:
  `scratch/NVA-B-UNPARSED-CAVEAT-1/unparsed-caveat-final.txt` — exit 0,
  282 tests passed across `protected-test-paths.test.mjs` and
  `guard-lifecycle-ready.test.mjs`.
- Consumer-path capture:
  `scratch/NVA-B-UNPARSED-CAVEAT-1/consumer-safe-paths-final.txt` — exit 0,
  9 tests passed.

The final suite covers the unparsed mention, a regular resolved write, opaque
unresolved and literal known-write cases, plain reads/runs, absence of raw
command echo, and preserved basename-rule priority. Full Verify and independent
Critic review remain parent-owned candidate work.
