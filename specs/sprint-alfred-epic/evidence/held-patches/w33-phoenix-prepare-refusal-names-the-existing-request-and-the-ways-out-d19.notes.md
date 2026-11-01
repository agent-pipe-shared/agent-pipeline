# Held patch notes — the Phoenix `prepare` refusal names the existing request and the ways out (Toolbox D19, candidate 15c)

Patch: `w33-phoenix-prepare-refusal-names-the-existing-request-and-the-ways-out-d19.patch`. Two files (`scripts/phoenix-authority-approval.mjs`, `lib/authority-revision-proof.test.mjs`), independent of the other 15c patches. D19 of `pipeline.toolbox-session-friction-and-feature-wishes`: the ceremony writes fixed file names (`phoenix-authority-revision-request.json`, `-proof.json`) into the key folder, so the second ceremony met the first one's request and `prepare` refused with the bare `request already exists; refuse overwrite`, leaving the PO to guess the rename.

## What

The refusal now names the existing request path and the two ways out: move it aside together with its `phoenix-authority-revision-proof.json` (for example rename both with a date suffix), or give a fresh `--directory`. The refusal itself, its exit and the "never overwrite" rule are unchanged; the first request stays byte for byte.

The fixed names themselves are NOT changed here: hash-named files would be a layout change of the signed ceremony (readers of `verify`/`approve` would have to find the request by hash), which is a design decision, not a message.

## Evidence

- New case in `lib/authority-revision-proof.test.mjs`: a second `prepare` in the same directory throws with the path, `refuse overwrite`, `move it aside` and `fresh --directory`, and the first request file is unchanged. Proof suite, approval script suite and case-completion suite: 46/46.
- Mutation: restoring the old bare message turns the new case red.

## Not covered

- Hash-named ceremony files (the design change above) and the same fixed-name behaviour of other ceremonies, if any: not looked at.
