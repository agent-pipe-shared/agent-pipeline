# Current capability-source accounting

`NVA-CAPABILITY-CURRENT-SOURCE-1` refreshed the inventory's frozen source
baseline from `28ff2d2b5136c3fbc62841c6ff14b946867bd4c0` /
`79fb9b0fb428362727a11677462d43f54e9f6753` to the approved current source
candidate `d910db6c788f1570843e2d916aa0d074871b43d4` /
`aa4bf32e610a5ffd2ad2b4fb7f93e067a0ddf460`.

Authoritative `discoverSurfaces()` comparison found 351 baseline and 616
current surfaces: 266 added and one replaced hook surface removed. Every
current surface is already assigned exactly once to an existing capability, so
no capability, production claim, or planned delivery was added. The 35 public
targets now point to existing active anchors; the final validator reports only
the intentionally pending Critic attestation.

`criticReview` remains `required-before-publication` with a null receipt digest.
`node --test harness/scripts/check-product-capability-inventory.test.mjs` passed
25/25. This is source accounting only and does not activate the inventory or
claim a Critic PASS.
