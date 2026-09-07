# HGO consumer fixture contracts after lifecycle nonliftability

`GUARD-LIFECYCLE-NOT-READY` remains nonliftable. It cannot produce a signed
override request or an external-operator command offer. The handoff consumer
now verifies that this result is `repair-required`, contains no request or
author-source fields, and invokes no offer-journal append callback.

The positive consumers use the actual liftable `GUARD-DEVPLAN-NOT-READY`
denial class. The signature-intent path still records, plans, prepares and
resolves an HGO signature-mode selection before the existing real OpenSSL test
signs it. The external-handoff suite still executes the real producer against
its sensitive-input, external-project-boundary and adapter-boundary branches;
its journal, privacy, append/readback, immutable-history and exact-shape
assertions remain in place.

Terminal machine capture
`scratch/NVA-B-GATE-HGO-CONSUMERS-1/hgo-consumers-full.txt` exited 0 with 118
tests across `po-human-approval.test.mjs` and `guard-handoff-offer.test.mjs`.
`scratch/NVA-B-GATE-HGO-CONSUMERS-1/consumer-safe-paths.txt` exited 0 with 9
tests. The earlier full-gate evidence remains preserved; this scoped result
does not claim full Verify, installed-plugin behavior, a live signing key, or
PO acceptance.
