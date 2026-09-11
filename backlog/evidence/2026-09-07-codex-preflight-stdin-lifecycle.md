# Codex preflight stdin lifecycle measurement

## Result

The EOF hypothesis was demonstrated with an additive deterministic regression.
The prior payload closed app-server stdin while sending the initialize request;
a fake app server that exits on EOF before its scheduled response therefore
left `initialized` false. Keeping stdin open through the initialize-or-deadline
race made the same fake server return the accepted response and preserved a
bounded stop.

The repair changes only the payload lifecycle: it writes both JSON-RPC lines,
waits for the existing bounded handshake race, then closes stdin before the
existing TERM/KILL shutdown path. Response identity checks, the 65,536-byte
overflow limit, spawn-error handling, and bounded-stop behavior are unchanged.

## Evidence

- RED regression: `scratch/NVA-B-PREFLIGHT-EOF-1/eof-race-red.txt` records
  `node --test --test-name-pattern "payload keeps app-server stdin open" plugins/pipeline-core/scripts/codex-sandbox-preflight.test.mjs`, exit 1.
- GREEN regression: `scratch/NVA-B-PREFLIGHT-EOF-1/eof-race-green.txt` records
  the same command, exit 0.
- Ten actual-source intermediate preflight attempts: `scratch/NVA-B-PREFLIGHT-EOF-1/ten-handshakes.json` records 10 attempts, 10 successes, and 10 bounded stops. The ten sanitized receipts are under `scratch/NVA-B-PREFLIGHT-EOF-1/handshake-receipts/`.
- Final suite: `scratch/NVA-B-PREFLIGHT-EOF-1/verify.txt` records
  `node --test plugins/pipeline-core/scripts/codex-sandbox-preflight.test.mjs`, exit 0 (26 pass, 0 fail, 1 environment skip).
- Consumer-safe paths: `node harness/scripts/check-consumer-safe-paths.test.mjs`, exit 0.

## Current durable verification (2026-09-11)

The historical scratch captures above explain how the defect was isolated, but
they are ignored workspace artifacts and are not the closure proof. From a
clean committed source candidate, the versioned Codex sandbox-preflight
producer executed ten fresh intermediate preflights against Codex 0.154.0. It
wrote the ten sanitized, exclusive-create receipts under
`backlog/evidence/2026-09-11-codex-preflight-eof-live/`; none was reconstructed
or edited after the run. Machine-written provenance beside those receipts binds
the exact source commit and tree, the producer path, Git blob, SHA-256 and mode,
the invocation transcripts, and each resulting receipt digest.

All ten receipts report `terminalCode: ok`, `eligibility: intermediate`, both
control and sandbox app servers initialized and stopped within the bound, and
both `appServerInitEquivalent` and `lifecycleComplete` true. The receipts bind
the measured Codex artifact digest, permission-profile digests, event-chain
digest, canary manifest and semantic result vectors. This repeats the original
10/10 actual-source result with current tracked machine output.

The focused suite was also run on the clean evidence candidate: 26 passed,
zero failed and one honestly skipped fixture transport case. Its EOF-sensitive
case `payload keeps app-server stdin open until initialize can respond` passed.
The machine-written `focused-suite.txt` transcript and
`focused-suite-candidate.txt` commit/tree binding beside the receipts retain
that result. The ten producer-written live receipts above remain the distinct
integration evidence.

## Limits

The ten successful current initialize handshakes show that the lifecycle race
is repaired for the measured intermediate route on this WSL2 host and Codex
0.154.0. They do not establish portability to every Codex or operating-system
version. The fixture-driven happy-path test remains skipped when its outer
subprocess transport reports `child-stdio-error`; the deterministic EOF
regression and the ten current live receipts provide distinct unit and
integration evidence without relabelling that environment limitation as a
pass. Pipeline maintainers own this remaining fixture-transport gap and will
reassess it by 2026-09-18; after that date the closure evidence must be renewed
or the item reopened.

The initial ten-attempt capture wrapper returned before it wrote its capture
log, while its host child continued and persisted all ten uniquely named
receipts. A follow-up attempt targeting receipts 7–10 therefore reported
`EEXIST`; it did not replace or alter the original receipts. The aggregate was
computed from the ten original sanitized receipt files. This is a host capture
transport limitation, not a preflight terminal-code result.

## Portability follow-up (2026-09-07)

Date: 2026-09-07  
Dispatch: `NVA-B-EOF-PORTABILITY-1`

The EOF-race regression now starts the platform Node runtime with an
`app-server` JavaScript fixture in the test working directory. It no longer
depends on a POSIX shebang, executable permission bits, or a URL pathname for
the payload; the test converts the payload file URL with `fileURLToPath`.

Regression sensitivity was demonstrated against a contained pre-fix copy of
the payload that ends app-server stdin before waiting for initialization:

- `node --test scratch/NVA-B-EOF-PORTABILITY-1/pre-fix-eof-red.test.mjs`
  exited 1 because `appServer.initialized` was `false` rather than the required
  `true`; machine-written evidence:
  `scratch/NVA-B-EOF-PORTABILITY-1/pre-fix-eof-red.json`.

The source regression retained both the initialization and bounded-stop
assertions:

- `node --test plugins/pipeline-core/scripts/codex-sandbox-preflight.test.mjs`
  exited 0; machine-written evidence:
  `scratch/NVA-B-EOF-PORTABILITY-1/codex-sandbox-preflight-green.json`.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` exited 0;
  machine-written evidence:
  `scratch/NVA-B-EOF-PORTABILITY-1/consumer-safe-paths.json`.

The checks ran on the current Linux host. No Windows runtime was executed, and
this evidence does not infer a Windows pass; the updated EOF regression has no
Windows skip condition.
