# Held patch w7-g13-artifact-copy-route-hint (G13, D209)

Elephant-built held patch (PO exception for small items), candidate `10b883488`, built in a scratch clone.

## What it changes

- `plugins/pipeline-core/lib/current-session-artifact-export.mjs`: new exported `ARTIFACT_COPY_ROUTE_HINT`
  (`AGY-ARTIFACT-COPY-ROUTE: ...`) naming the one admitted shape, `cp [--] <regular PNG inside the project>
  <new .png directly in the current artifact directory>`. `crossRepositoryDenialReason(denials, input)` appends it
  after the authoritative recovery text only when the refused Bash command is a parsed `cp`/`mv`/`install` with an
  operand inside a `brain/<conversation-uuid>` directory. Read-only classification; it admits nothing and leaves
  `isCurrentSessionArtifactExport` unchanged.
- `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs`: the cross-repository deny passes the guard payload to
  `crossRepositoryDenialReason`, so the hint reaches the AGY runner.
- `plugins/pipeline-core/lib/current-session-artifact-export.test.mjs`: case G13A007 (aimed copy gets the hint after
  the recovery; an unrelated outside copy and a non-Bash write do not); case count guard 6 to 7.
- `plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs`: one end-to-end case through the hook (a refused
  `cp -r` into a brain directory names `AGY-ARTIFACT-COPY-ROUTE`; a refused copy elsewhere does not).
- `harness/scripts/check-verify-case-completion.test.mjs`: the pinned top-level-assertion count of
  `current-session-artifact-export-tests` 17 to 20 (the three new asserts).

## Evidence

- Clone: export suite 7/7, cross-runner suite 4/4, AGY hook suite 68/68.
- Revert proof (both production files reverted, restore byte-equal): the AGY hook suite fails exactly the new G13
  case; the export suite fails at import (the hint export is absent).
- `check-verify-case-completion.test.mjs`: VCR01 is red on the baseline with pre-existing count drift in other
  suites; without the 17 to 20 repin the clone adds exactly one mismatch (this suite), with it the clone failure
  is identical to the baseline.
- Stack dry run on `10b883488` with `w7-n30-n32-g12-close-route-builder-and-signatures`,
  `w7-g16-transport-credential-route` and this patch: all three apply and commit; export suite green; VCR01 shows the
  same pre-existing mismatches as the baseline, none new.
- `driver patch`: 8312 bytes, apply-check on the plain candidate exit 0.

## Not done

No native AGY run (a live refused copy in an Antigravity session on WSL is a native-host check). No inventory change
(no new suite).
