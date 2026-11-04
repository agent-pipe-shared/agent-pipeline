# w166 — one shared reader of the bound authority documents returns sealed and digests (candidate 19c, late-binding build step 1a)

Delta on w165. Elephant-built in a work clone (small first step of the late-binding chain; the PO accepted the late-binding ADR and decided on 2026-11-04 to build the whole chain). Inert: no existing reader calls the new module, the continuity schema does not know the marker yet.

## What it changes

- `lib/authority-seal-reader.mjs` (new): `readAuthoritySeal(authority)` returns `{ status, sealed, digests, paths, exits }`; a state without the `sealed` marker reads as sealed (today's behaviour for every bound project), `sealed: false` reads as a draft with paths and no digest, anything else is `invalid` with a typed code (`ASR-AUTHORITY`, `ASR-MARKER`, `ASR-ARTIFACT`, `ASR-DRAFT-DIGEST`) and `sealed: false`, so a reader that only checks the flag fails closed. `requireSealedAuthority` is the gate form for the readers that are authority-bearing gates after the approval. Pure, never throws.
- Every non-sealed result names typed exits and `reopen-design` is in all of them: the PO's condition of 2026-11-04 that no state may be a dead end.
- `lib/authority-seal-reader.test.mjs` (new, ASR1 to ASR5), registered in `harness/verify-suites.json` and `docs/product-capability-inventory.json`.

## Checks

- Clone: the new suite 5/5; registration checker 1163 registered, 0 unregistered; case-completion checker valid (389 entries). `git apply --check` against the 19a state plus w165: exit 0.

## Not changed / not proven

- No reader is moved onto the module (the 26 sources are the next steps), the continuity schema (`AUTHORITY_KEYS`) is unchanged, there is no seal command and no seal plan, and the guard tripwire is untouched. The typed exit `prepare-seal` names a command that does not exist yet.
- No Full Verify; the independent Critic review for the late-binding chain runs after the chain is built (PO decision 2026-11-04).
