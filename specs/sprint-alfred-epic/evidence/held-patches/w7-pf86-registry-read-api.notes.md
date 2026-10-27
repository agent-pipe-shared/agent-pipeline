# PF-86 c2 held patch: lock-free registry read path, publish by generation compare (INTERIM, budget-stopped)

Status: PARTIAL. Patch applies; 3 of 4 new cases green (NGHS44, NGHS45, NGHS47); NGHS46 (lock not held during a slow scan) is RED and was not diagnosed. NGHS41 is red in the stack base itself (baseline clone2, identical failure at test line 1262, a `launch(...).ok` assertion); this patch does not turn it green. Independent Critic review stays a parent-owned batch gate.

Apply order: PF-85 c2 (`w7-pf85-repair-hints-c2.patch`), PF-86 c1 (`w7-pf86-scan-outside-registry-lock.patch`), then `w7-pf86-registry-read-api.patch`. The patch is `git diff --binary` against a local commit "stack base" on candidate b9c3e7ed5c2735d59cc6029904f236cf3f2bdbf5 (after applying the first two). Apply check in clone2 (same stack, same candidate): exit 0.

## Cause
c1 moved only the boundary-independent git read out of the lock. The member-record reads, the integrated-slice computation and the settled set still ran inside `withSessionAuthorityBoundary`, because the inspect* readers need a boundary token.

## Change (+101/-2 over 3 files; the same registry/host-state files named as editable)
- `session-authority-registry.mjs` (+16, additive): new exports `readSessionAuthorityGeneration({repository})` (digest of the catalogue record ref) and `withSessionAuthorityReadScope({repository,generationOf?},cb)`: brands a read-only token (no lock, no migrate/heal), runs cb, reads the generation before and after, throws `SDC-AUTHORITY-CAS` `read-generation-drift` if it moved, returns `{result,generation}`. No existing export, signature or wait bound changed.
- `native-goldfish-host-state.mjs` (+29/-2): new exports `prescanAdmissionFacts` (runs `readNativeIntegratedSlices(only=dependsOn)` and `readSettledItemSliceIds` through the read scope and carries the per-admission memo entries with generation, queue sha256, candidate commit) and `adoptAdmissionFacts` (re-reads the generation under the real boundary; seeds the memo only when generation, queue digest and commit all match, else returns `recomputed-after-drift` and the ordinary in-boundary reads run once). `publishNativeAuthorityState` computes facts before the boundary and adopts them right after the existing queue-drift check and the c1 adopt; any fault leaves `facts=null` (fallback).
- Tests (NGHS44-47) in `native-goldfish-host-state.test.mjs` (that file already exercises the registry; lock-wait test not touched), plus a `governedRegistryFixture` helper.

## Results
- RED (unchanged stack clone): NGHS44, 45, 46 failed (new exports missing); NGHS47 (export/arity guard) passed by design; NGHS41 failed (pre-existing). Log: scratch run `red`.
- GREEN (patched clone, whole file): failing names NGHS41, NGHS46. Baseline clone2 (stack base without new cases): failing name NGHS41 only. So the only new failure is NGHS46.
- NGHS46: the child process spawned from inside the slow scan printed no `entered` (stdout empty, stderr not inspected). Hypotheses (unverified): the child script failed to import/resolve the repository, or the fixture repo equality check in `repository()` rejected it; or the lock was in fact busy. Not isolated; do not treat as green.

## NOT done
- NGHS46 not repaired; NGHS41 pre-existing red not analysed (c1 notes' fixture hypothesis is unverified).
- Pending inventory scan (`nativeAuthorityScan`/`readNativeManagedInventory`) and `readNativeReservedItemScopes` still run in the lock; only the integrated/settled facts and member-record reads moved.
- Risks for the Critic: the read token is only read-only by contract (writers do not check `readOnly`); the generation covers the registry catalogue, not native pending files on disk.
- No Full Verify. Clones `scratch/agent-out/w7qh/clone` and `clone2` were NOT deleted (budget); delete with driver `cleanup`.

## Proposed commit
`perf(dispatch): read admission facts through a lock-free registry path and publish by generation compare (PF-86)`

## Operator flow
Apply PF-85 c2, PF-86 c1, then this patch (`git apply`), `git add -u` with a path limit to the three lib files, `--no-verify` commit, stamp, install. Protected-path class: `session-authority-registry.mjs` and `native-goldfish-host-state.mjs` are core registry area (Critic batch gate); the test file matched no TP pattern.

CONTINUATION CARD -- done: registry read scope, host-state prescan/adopt, wiring, NGHS44-47, patch, apply check; remaining: diagnose NGHS46 child output, cleanup clones; next step: print child.stderr/status in NGHS46.
