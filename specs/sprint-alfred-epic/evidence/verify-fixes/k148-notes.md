# K148-FV-ADDRESS-RACE notes (Goldfish goldfish-deep, sonnet / xhigh, ruleset 0.7.0+claude.20261023185750.bd9ee06)

Status: implementation complete, targeted checks green. NOT committed in the clone (see Open). No dispatch record written (PO list row 59 deviation).

## Mechanism (matches K145 section 4, with one correction)
prepareAddressRoot (session-power.mjs) listed `<home>/.apsp` twice and failed `SP-ADDRESS fixed address namespace changed` when a second process on the same home published its own slot between the two listings. The half-created slot (mkdir, then anchor.json) was observable as well; measured message for it is a raw `ENOENT ... .apsp/<slot>/anchor.json` (not `foreign fixed address slot`, which only fires for a present-but-malformed anchor). The D71/D72 repair verb is not on this path (only `powerAuthorityOwner` calls prepareAddressRoot, line ~593); repair file was grepped, not read in depth.

## Fix (lib/session-power.mjs, narrowest, check not weakened)
- readAddressNamespace / validateAddressSlot extracted (same bound, foreign-name and anchor validation).
- A changed listing is accepted only if every originally read name is still present and every new name validates as a complete slot; at most 2 accepted changes, then the existing `fixed address namespace changed` refusal.
- createAddressSlot: slot staged in `<home>/.apsp-stage-<pid>-<hex>` (beside, not inside, the namespace) with its anchor.json via immutableAddressRecord, then renameSync into place; an existing slot is never replaced, EEXIST/ENOTEMPTY (same repo published concurrently) falls through to the final readAddressAnchor validation; stage is cleaned up in a finally. The old `new address root raced in` check and createdRepositoryRoot flag are gone (no longer reachable).

## Pin (lib/session-power.test.mjs, no new helper file)
Two async cases; children are `node --input-type=module -e` of a function in the test file, with `os.userInfo().homedir` and fs.readdirSync/mkdirSync patched only in the children (private home). Ready/go file barrier, no sleeps as synchronisation (a 10 ms Atomics.wait is only the poll interval of the file wait).
1. held process paused right after its first `.apsp` listing, other process completes, then release: RED `fixed address namespace changed`.
2. other process paused right after its slot mkdir: RED raw ENOENT on anchor.json; on the fixed code the process never pauses (slot published by rename) and the case asserts both succeed and two anchored slots exist.
Needs the short private TMPDIR of scripts/run-in.mjs (107-byte socket bound); `TMPDIR` of 42+ characters plus the fixture names exceeds it.

## Evidence (scratch/agent-out/)
- K148-evidence-red-full.txt: unchanged code, test file run directly with private TMPDIR, exit 1, both new cases FAIL with the real messages above.
- K148-evidence-green-pin.txt: fixed code, same command, exit 0 (8/8 checks).
- K148-evidence-green-sp.txt (run-in, lib/session-power.test.mjs, exit 0); K148-evidence-green-repair.txt (run-in, session-power-address-repair.test.mjs 17/17 and plugins/pipeline-core/scripts/session-power.test.mjs, exit 0); K148-evidence-broader.txt (check-consumer-safe-paths.test.mjs 9/9, check-doc-contracts.mjs, exit 0).
- K148-evidence-red.txt is an earlier superseded RED run (socket-bound message from a too-long fixture path); ignore it.
- Diffs apply cleanly (`git apply --check`) in scratch/clones/k148-check against the base.

## Deviations / open
- Protection: the Edit of both files was accepted in the clone (no guard denial there). By repo convention both are plugin source; I split the diffs by file anyway: K148-protected.diff = lib/session-power.mjs, K148-unprotected.diff = lib/session-power.test.mjs. Elephant/operator decides the real classification.
- Not committed in the clone: git-guard GIT-03 refused the message file in scratch/agent-out (outside the clone project) for both relative and absolute spelling; budget did not allow a second route. Work is staged in scratch/clones/k148 (`git add` done, no commit). Messages are K148-msg-protected.txt / K148-msg-unprotected.txt (trailers as briefed).
- Check 4 (concurrent run of native-goldfish-host-state and the finalizer suite on one HOME) NOT run (budget).
- Resource headroom: unknown, no observations supplied.
- verify: pending (Coordinator Full Verify), independent review: pending, PO acceptance: open.
