# w260: dispatch records, briefing digests, the work-verify result and the approval proof reference survive a fresh clone (candidate 20, G20-29, AC-108)

Base: `35db88a31` (the candidate-20 chain incl. w257). Built in the slice clone `scratch/agent-out/s-evidence`. One held patch. Closest
criterion: AC-108 (PRD and Spec unchanged). Sources: the Codex greenfield P1 row "Nachweise nur teilweise dauerhaft/hostbeobachtet" and the
Claude greenfield finding that the approval proof is referenced nowhere in the repository.

## What

- Root cause, measured: the onboarding seed git-ignores `/evidence/` (dispatch records, `verify-latest.json`) and `/scratch/` (briefings), and
  `approve-push` (D206) keeps the approval and its proof in the private store under the Git common directory. A clone holds none of it. The
  seed's ignore is deliberate (security-scan refuses a dirty tree), so this patch adds a tracked mirror instead of un-ignoring anything.
- New `lib/durable-evidence.mjs` + `scripts/durable-evidence.mjs sync|check --root <abs root>`:
  - `sync` projects, into tracked `audit/` (root, not matched by any seed ignore), one file per
    - completed dispatch: `audit/dispatch-<taskId>.json` (`pipeline.durable-dispatch-evidence.v1`): runner, agentType, model, effort, rulesetSha,
      dispatcher, candidateCommit, commits, outcome, outcome kind, `assurance` (`host-observed` for a v4 authored-commit record, which the writer
      only publishes through the host route; `orchestrator-attested` for the attested kind; `recorded-unlabelled` for a v3 record), `resultSha256`,
      changed paths, critic disposition, the digest of the source record, and `briefing {sha256, path, source}` (the attestation's digest, else the
      digest of the one `scratch/*.md` briefing whose marker block names the dispatch id, else `none`; only the digest is durable, the scratch
      path is informational);
    - work-verify result: `audit/verify-<commit12>-<resultDigest12>.json` (commit, tree, command, binding, times, step count, failed step names,
      `passed`, source digest);
    - approval: `audit/approval-<kind>-<commit12>-<entryDigest12>.json` from the existing read-only human-approval trace
      (`traceHumanApprovals`): kind, mode, forCommit, approvedAt, approvedBy, signed-payload digest (`intentSha256`), `proofSha256`, key
      reference, `publicKeySha256` and the PUBLIC proof object (signature, public key). Written only when the proof hashes to the digest the
      approval record names. The trace's verdict is deliberately not copied: it changes with trust anchors, an entry is immutable evidence.
  - `audit/index.json` (`pipeline.audit-index.v1`), rederived from the files on every sync: `{kind, id, path, sha256, commit}` per entry, sorted,
    no timestamps (deterministic).
  - `check` is read-only and works on a fresh clone. Findings, each with a code and a runnable repair: `AUDIT-INDEX-MISSING/INVALID`,
    `AUDIT-ENTRY-MISSING`, `AUDIT-DIGEST-MISMATCH`, `AUDIT-ENTRY-INVALID`, `AUDIT-PRIVATE-CONTENT` (absolute host path, private-key PEM, a
    report/text/transcript/prompt/secret field), `AUDIT-PROOF-INVALID` (the stored proof does not hash to its digest or its Ed25519 signature
    does not verify over the signed-payload digest with the stored public key), `AUDIT-INDEX-STALE` (a file the index does not list),
    `AUDIT-NOT-TRACKED` (`git ls-files`), `AUDIT-UNSYNCED` (a completed dispatch or the verify result exists privately with no mirror).
  - "Never fully blocking" / "a refused operation leaves no state": `sync` plans first. If an existing entry would change it throws
    `AUDIT-ENTRY-DIFFERS` naming the file and the repair (remove it, rerun) BEFORE any write; no temp file is left. A briefing digest found earlier
    is never forgotten because the ignored scratch file is gone.
  - Data-sparse by construction: entries are built from a closed field list (no report prose, no prompt, no transcript, no absolute host path, no
    key other than the public one), then scanned again with the existing `PRIVATE_ABSOLUTE_PATH` rule (`denyPrivateAbsolutePaths` is now
    exported from `lib/dispatch-record.mjs`; one word changed). Digests are over LF-normalised bytes so `core.autocrlf` checkouts read the same.
- Guard admission (`lib/guard/constants.mjs` `DURABLE_EVIDENCE_SCRIPT`, one clause in `command-catalogue.mjs`): exactly `sync|check --root <this
  root>`, like `SECURITY_GATE_CONFIGURE_SCRIPT`. The agent runs both itself, on every runner; no ceremony.
- Pins: new `lib/pins/durable-evidence-survives-a-fresh-clone.test.mjs` (D1-D6: three dispatch routes + verify + a REAL Ed25519 approval proof are
  mirrored; a `git clone` of the committed fixture plus the index reaches every record and the proof reference with no `evidence/`/`scratch/`
  present; nothing private in any tracked file; every tamper has a code and repair; sync idempotent/immutable/no-state-on-refusal; CLI exit
  codes) and one case in `catalogue-admit-prescribed-lifecycle-verbs.test.mjs` (the exact shape admitted, 8 near-misses refused).

## Why

AC-108 asks that a human approval is traceable back to the human's detached proof and that the evidence a later audit needs survives. The
trace (Q3) can only read what is on the machine that approved; a clone, a second machine or an auditor sees `lifecycle.json` binding
`state: approved` and nothing behind it. The mirror keeps the signed-payload digest, the proof digest and the public proof in the repository, so
the auditor re-verifies the signature offline (`check`) and matches the key reference against the trust anchors the repository already commits.
Nothing in the signed payload changed: `approve-plan`, `approve-push`, `lifecycle.json` and the proof format are untouched, so the "referencing
the proof would change the signed payload" stop condition did not fire.

## Not changed

- The onboarding `/evidence/` ignore seed, `lib/path-spelling.mjs` and the separator-sweep sites. `audit-pack.mjs` (package-bound, requires
  HEAD == the package candidate, request-file driven: the wrong granularity for per-dispatch durability).
- `lifecycle.json` and `pipeline-state.mjs`: no field added. Reference lives in the audit entries and index, not in the signed binding.
- No automatic call. Nothing runs `sync` for you: wiring it into `dispatch-record-write.mjs`, the host-commit hook or the close chain would write
  into the working tree during commits and touch more than the briefed scope. Until a Coordinator wires it, `check` reports `AUDIT-UNSYNCED` with
  the exact command, which is the safety net.
- Briefings for host-observed dispatches carry no digest in the record itself; they are bound only when the generated briefing still sits in
  `scratch/` at sync time (marker block names the dispatch id). Otherwise `briefing.source` is `none`/`ambiguous`; the attested route always has
  its digest.
- v3 records get no host/attested label (`recorded-unlabelled`): nothing in a v3 record says which route wrote it.

## Not proven

Full Verify of the applied chain, Critic review, PO acceptance, a run against a real signed push approval (the pin signs a fixture proof; the
default trace source is only exercised on a fixture without approvals), Windows/macOS execution (only `node:fs`/`node:path`, no shell; the CRLF
digest path is not run on a real autocrlf checkout), and that a tracked `audit/` directory does not trip other repository-wide scans (for
example secret scanners over a public key PEM, or a security-scan dirty-tree rule if `sync` runs after a scan: commit the mirror before it).

## Needs the Coordinator

- Register `plugins/pipeline-core/lib/pins/durable-evidence-survives-a-fresh-clone.test.mjs` in the Verify suite list (new test file; the
  admission case extends the already registered catalogue pin).
- Decide the trigger: the natural places are the close chain (run `sync`, then commit `audit/`) and the post-approval step. A push approval is
  bound to the exact HEAD, so the mirror of an approval made for commit X is committed in a LATER commit (the entry names `forCommit: X`); do not
  expect the proof reference to ride in X itself.
- Mention the new command and the `audit/` home in the vendored `docs/operating-model.md` evidence section and the goldfish-task template's
  closing step (not touched here: outside the write scope).
