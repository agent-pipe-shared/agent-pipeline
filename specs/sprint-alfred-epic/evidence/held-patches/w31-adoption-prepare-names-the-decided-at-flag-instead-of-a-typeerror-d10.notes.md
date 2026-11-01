# Held patch notes — `architecture-adoption.mjs prepare` names the missing `--decided-at` flag (Toolbox D10, candidate 15c)

Patch: `w31-adoption-prepare-names-the-decided-at-flag-instead-of-a-typeerror-d10.patch`. Two files (`scripts/architecture-adoption.mjs`, `scripts/architecture-adoption.test.mjs`), independent of the other 15c patches. D10 of `pipeline.toolbox-session-friction-and-feature-wishes`.

## What

`prepare` without `--decided-at` (or with a value that is not the canonical `toISOString()` form) ended in an uncaught `TypeError: decidedAt must be canonical ISO-8601` from the authority module, with a stack trace and no hint which flag to give. The CLI now checks the value before anything is built or written and exits 1 with: `prepare needs --decided-at <UTC instant in the form new Date().toISOString() prints, for example 2026-11-01T10:00:00.000Z>`, plus the fact that the instant is part of the signed request and that `apply` reads it back from the request file. The check is the same predicate the authority module applies, so no value that worked before is refused now.

The Toolbox note that the value "must be identical in prepare and apply" is not changed: `apply` takes it from the request file (`subject.decidedAt`), not from a flag, so it is given once.

## Evidence

- New case in `ADOPT-SIGN-T`: missing flag and a date-only value are both refused with exit 1, the named message, no stdout, no request file under `--out`, and no TypeError text. Adoption suite 56/56; with the case-completion suite 88/88.
- Mutation: disabling the check turns the new case red (the TypeError is printed).

## Not covered

- The remaining parts of D10 (none) and the other items of the Toolbox friction list (D11 to D13, D19, D23, D26) are untouched.
