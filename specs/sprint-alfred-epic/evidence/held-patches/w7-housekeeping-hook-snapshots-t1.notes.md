# Held patch notes: housekeeping hook-snapshot collector (W7-HOUSEKEEPING-HOOK-SNAPSHOTS-T1)

Patch: `w7-housekeeping-hook-snapshots-t1.patch` (apply-check on the plain candidate: exit 0). Status: targeted delivery green; batch Critic, Full Verify and PO acceptance pending.

## Changed files
- `scripts/housekeeping.mjs` (new): `plan` / `apply` verbs, exported `COLLECTORS` registry with the one collector `hook-runtime-snapshots`.
- `scripts/housekeeping.test.mjs` (new): cases HK01 to HK10.
- `docs/operating-tools.md`: one table row for the script.

## RED to GREEN
- RED (script absent): `node --test scripts/housekeeping.test.mjs` 10 of 10 failing (driver label red1).
- GREEN: tests 10, pass 10, fail 0 (driver label c1, exit 0).
- No existing test enumerates `scripts/` or `docs/operating-tools.md` (searched `harness/` and `scripts/`), so no neighbour comparison was needed; the doc entry is present once.

## Behaviour
1. State lives under `<git common dir>/agent-pipeline/{pre-commit,commit-msg,pre-push}-hook/`; a non-git root gives status `unavailable`.
2. The live snapshot is the single `runtime-<64 hex>` named in `impl.mjs`; missing impl.mjs, none or several names, or a missing directory gives `unreadable` with a reason and nothing planned there.
3. Plan = real-directory (lstat) siblings `runtime-<64 hex>` that are not live and not among the `--keep-newest n` (default 1) newest by mtime. Links and files are never planned.
4. `plan` writes nothing; it prints paths relative to the common dir and `planSha256` over the canonical JSON.
5. `apply` recomputes, refuses a differing digest (HK-PLAN-DRIFT), a missing aside (HK-ASIDE-MISSING) or one inside the repository or its git dir (HK-ASIDE-INSIDE-REPO); it renames each snapshot into `<aside>/<UTC stamp>/<hook dir>/<name>` and writes `manifest.json`.
6. Nothing is ever deleted; a failed rename is reported `failed`, the snapshot stays, exit 1.

## Deviations
- The briefing says the aside must be an empty-or-new directory; the script accepts an existing directory (non-empty allowed) and writes into a fresh stamped child, refusing only a non-directory aside or an already existing stamped directory. Reason: HK08 ("destination parent is a regular file") needs a blocker at the stamped path, which a strictly empty aside cannot hold. A hidden `--stamp <name>` option (default UTC timestamp) makes the stamped path predictable for that case.
- The new test file is not registered in `harness/verify-suites.json` (protected); it needs registration by the operator.

## NOT built
Other collectors; the preflight size line; the scheduled plan-only run; purge-after-grace; measuring hook speed before and after.

## Commands for the PO
```
node scripts/housekeeping.mjs plan
node scripts/housekeeping.mjs apply --plan-sha256 <digest from plan> --aside <directory outside the repository>
```
