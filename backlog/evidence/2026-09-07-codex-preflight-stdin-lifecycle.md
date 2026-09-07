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

## Limits

The ten successful initialize handshakes show that the lifecycle race is
repaired for the measured intermediate route. They do not independently prove
sandbox isolation; isolation remains governed by the preflight's permission,
canary, and receipt checks. The fixture-driven happy-path test remains skipped
when its outer subprocess transport reports `child-stdio-error`; the new EOF
regression and the ten actual-source receipts provide the relevant lifecycle
evidence without relabeling that environment limitation as a pass.

The initial ten-attempt capture wrapper returned before it wrote its capture
log, while its host child continued and persisted all ten uniquely named
receipts. A follow-up attempt targeting receipts 7–10 therefore reported
`EEXIST`; it did not replace or alter the original receipts. The aggregate was
computed from the ten original sanitized receipt files. This is a host capture
transport limitation, not a preflight terminal-code result.
