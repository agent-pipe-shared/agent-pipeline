# close-feature — acceptance, SBOM, Step 3 detail and the push/release follow-up (moved verbatim from SKILL.md)

Loaded on demand from `SKILL.md` at the condition each pointer there states. Every block below is the original text of the skill body, moved byte for byte; the comment line above each block names its place in the parent commit. The headings `## Step 3 — ...` and `## After the close: ...` stay in `SKILL.md` with the pointer under them; the ordered route for a feature with active Continuity and the command signatures stay there in full.

## A. The acceptance question, the SBOM, the four status facts, what the close touches

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 28-34 -->
**The human acceptance question (one stop, no signature).** The close runs the candidate Verify first: a red or dirty Verify stops with `ONESHOT-VERIFY-RED` and the human is never asked. Only when the Verify has passed does the first call stop once with `ONESHOT-ACCEPTANCE-REQUIRED`, so the human sees the Verify result before accepting. That stop is after writes: the passing Verify evidence and the package move are written and uncommitted, do not commit them; the rerun with the answer discards those uncommitted outputs (stage `discard-own-leftovers`) and runs the Verify again on the same candidate (cost: every close runs the Verify twice, once before the question and once after the answer; the producer may reuse suite receipts of the same candidate, how much that saves is not measured, and the Verify is never skipped). The stop's reason is ONE generated sentence that says the candidate Verify has passed. In the same message say in one line how you really started or opened the delivered result and what it showed, whatever kind of result it is, or say plainly that you could not and why (never a gate; a result you could not run also goes into `--open-checks`). Ask the human exactly that sentence in the chat: whether they accept this feature package at the candidate, that the performed close counts as the human acceptance of this feature package, and the checks still open. If you know a project-specific open check (for example a real device check) that the sentence lacks, rerun first with `--open-checks "<check; check>"` so the sentence names it, then ask. The sentence is in the project's human-facing language (German for a German project, English for any other language) and ends with a closed list of clear yes forms of that language (`yes, I accept`, `yes`, `yes, accepted`, `accepted`, `I accept`; `ja, ich akzeptiere`, `ja`, `ja, akzeptiert`, `akzeptiert`, `ich akzeptiere`), plus a closed list of plainly positive answers the question only exemplifies (`good`, `ok`, `approved`, `great`, `looks good`, `perfect` and others; `gut`, `passt`, `ok`, `super`, `einverstanden`, `sieht gut aus` and others; PO decision 2026-11-17, the signature before a push stays the final gate; a doubt, a negation or a "but" is never on it). If the human answers with one of those forms (case, commas, spaces and a closing `.` or `!` do not matter), rerun the identical command with `--human-acceptance "<the human's literal answer>"`. `--human-acceptance` records an acceptance for those forms only: any other answer (a bug report, a change request, a doubt, a "yes, but ...") stops with `ONESHOT-ACCEPTANCE-NOT-YES`, records nothing and names both ways on; never search the answer for a keyword and never turn it into a yes yourself. **A decline is not the end of the feature:** rerun the identical command with `--human-decline "<the human's literal answer>"` (exclusive with `--human-acceptance`). The close records the human's words with the candidate and the time in `specs/<feature>/evidence/human-decline-<candidate>-<answer>.md` (never read as an acceptance), retires the bound Result (the State transition `continuity-result-retire-plan` / `-apply`: `continuity.authority.result` becomes null, the retired binding stays in `continuity.resultRetirements`, `result.md` is restored to the text before the bootstrap block, and the package is reconciled result-only, without a signature; in a project with a session-authority catalogue this runs on the owner route like the Result bootstrap, on the Close lifecycle the one-shot already opened) and returns status `declined` with `next` in order: the commit of exactly those outputs, a correction dispatch (`prepare-dispatch.mjs goldfish`, the human's words are the correction request), a Critic delta round on the new candidate (`prepare-dispatch.mjs critic --delta-request`), then the identical close command with `--critic-packet-id <new-packet-id>`. The decline runs no Verify of its own: it first discards the uncommitted outputs of the asking call's Verify, so its commit carries only the decline outputs. That second close runs the Result bootstrap again, runs the Verify for the new candidate and asks the acceptance question again after it. Do not run `reopen-design` for a declined acceptance: with a bound Result it refuses (`PLAN-REOPEN-RESULT-BOUND`) and names this route, because `submit-plan` would refuse `PLAN-SUBMIT-CONTINUITY-BUSY` while a Result is bound. The answer is recorded in the feature's tracked `acceptance.md` (a managed section: the literal answer, the candidate commit, the open checks), labelled as an attribution record and not a signature, and travels in the one close commit. A rerun for the same candidate does not ask again, a changed candidate asks again, and a resumed close (`--resume-lifecycle-id`) never asks. The Pipeline-generated pointer in `acceptance.md` is registered immutable: the close keeps its registered digest honest with the package's own amendment record (no signature). An `acceptance.md` that the plan approval binds is never edited; its record goes to `specs/<feature>/evidence/human-acceptance.md`.

**The SBOM (a standard part of the close, ADR-0091).** Before the acceptance question the close reads the lockfiles tracked in the repository (JavaScript, Python, Go, Rust, JVM, .NET, Ruby, PHP, Dart, Swift, Elixir, C/C++ and committed CycloneDX files; Maven by its pom plus a CycloneDX file) and checks or writes `specs/<feature>/evidence/sbom/` (`record.json`, `cyclonedx.json`, `spdx.json`); a repository with no component gets an explicit `not-applicable` record. A finding of the state `stale`, `invalid`, `partial` or `unsupported` stops the close with its code (`SBOM-SOURCE-INPUTS-STALE`, `SBOM-RECORD-INVALID`, `SBOM-PARTIAL`, `SBOM-ADAPTER-UNSUPPORTED`) and the repair, before anything is written. Repair the cause (pin the dependencies in a lockfile, remove a stale `sbom` directory, add a reader to `SBOM_READERS` for another ecosystem) and rerun the identical command. Only the PO can accept the gap, and only by signature: the stop prints a request under `scratch/` and the one command the PO runs in their own terminal (`po-human-approval.mjs sign-intent --request <the request>`, which shows the findings and writes the proof next to the request). Hand the PO that command when they can run it at once, change nothing in the tree in between (the request names HEAD), then rerun the identical command with `--sbom-override-proof <the proof file>`. The close verifies the proof against the trust anchors of `project/critical-human-proof.json` (without an anchor the gap cannot be accepted, only repaired), records the findings, the actor and the signing key, keeps the signed request and proof in `specs/<feature>/evidence/sbom/`, and the audit bundle names it `SBOM-OVERRIDDEN`, carries the signed request and proof and re-checks the signature offline (`AB-SBOM-OVERRIDE`). A sentence in chat is never an override, and the agent never signs.

**Four status facts, never the package record alone.** The State inspector's `featureStatus` and the close's `statuses` print the same four facts apart (`featureStatusVocabulary`): package registered, implementation delivered, technically qualified, human-accepted. Report them in that order and quote the `summary` line; do not call a feature "completed" or "accepted" from the package's `lifecycle.json` state alone. A declined acceptance writes the record back itself when it is further along than `implementing` (`verifying` or `completed`; the result's `packageBack` names the move, and a failure there never blocks the decline); on the usual chain the record already says `implementing` at that point. A record that still lags after a reopen or a decline carries `recordLag` with the reason, and delivered, qualified and human-accepted all read `no` until the new candidate passes the close again. A planning-entry queue head that lags behind the phase (`initial-planning`, `kickoff-promotion`, `continuity-adoption`, no live dispatch) is labelled `QUEUE-HEAD-LAGGING` by the re-ground notice after a Compact; it is not the next action, so take the next step from the phase and the typed stop, not from that head.

**What the close touches.** The tracked-effects digests hash what exists: the calibrated handover (`project/pipeline.json` `handover`, first brought to the closed state by `pipeline-state.mjs update-public-handover`, the existing writer: closed-local, the verified candidate, and technical close, product acceptance and push as three separate facts) and `telemetry/costs.md`; backlog, history and retrospective have no defined project file and keep the marked empty digest. The audit request names every Critic round of the feature (`evidence.criticReports`); the bundle under `audit-bundles/<feature>/<commit>/` carries each exported round report (`specs/<feature>/evidence/critic/<packet>/report.md`) and its README section "Critic round reports" names a round whose report could not be exported instead of omitting it. The close fetches every missing report itself from the private Critic journal (the verdict and its findings, checked against the digest in the receipt; working notes stay out) and carries it in the one close commit; a hand export with `session-critic-finalizer.mjs export` is only needed to publish richer notes, and a round it cannot read never stops the close. The minors of the Critic round this close is bound to go into the handover under "Open minor findings", and the result's `openMinors` line says how many are open and where: put that line in the close report.

## B. Step 3 detail: `tracked-close-finalized`, `final-verify-green`, freeze renewal, scanner exceptions, `cleanup-complete`

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 152-255 -->
The State sub-effect is not the terminal close. Complete Result, backlog,
handover, HISTORY, telemetry and retrospective bytes, then bind their exact
postimage with `tracked-close-finalized`. Only after the one final commit may
the coordinator freeze `candidate-frozen` and accept Verify/Security evidence.
When the push gate requires approval, `project/push-threat-model.md` is committed together with the close artefacts in that one
commit: `close-coordinator.mjs drive` lists `materialize-push-threat-model` (with `commitWith`) before it, so the tree stays clean afterwards.
Note in the project's handover file which feature closed, by whom, `forCommit`
(or "—" if Git resolution failed), and the close timestamp from the State
writer output.

`tracked-close-finalized` takes one repo-relative evidence file
(`--evidence <path>`, `pipeline.close-tracked-effects.v1`) with exactly the keys `schema`,
`resultSha256`, `backlogSha256`, `handoverSha256`, `historySha256`, `telemetrySha256`,
`retrospectiveSha256`, `pipelineStateSha256`; each value is the SHA-256 of that file's bytes.
Only `resultSha256` (the bound Result) and `pipelineStateSha256` (the State file on disk) are
compared. A project that has no telemetry or retrospective artefact uses the SHA-256 of the empty
input, `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, for that key (PO rule).

`final-verify-green` takes one PRIVATE evidence file in the coordinator's evidence directory
(`<git-common-dir>/agent-pipeline/publication-close/<lifecycle>/evidence/<name>.json`, absolute path,
`pipeline.close-final-verification.v1`) with `candidateOid` and `candidateTree` equal to the frozen
candidate, `verifyStatus` and `securityStatus` exactly `green`, and `verifySha256` / `securitySha256`.
Every private evidence file of the coordinator (this one, the publication receipts and the cleanup receipt) must be a
regular file with mode 0600 and a single link, with a name of `[A-Za-z0-9._-]{1,160}.json` and a size of 2 bytes to
1 MiB, in that evidence directory, which itself carries no group or world bits; otherwise the plan refuses with
`PB-FILE` ("must be a mode-0600 single-link regular file") or `CLOSE-EVIDENCE-PATH`.
Write `green` only when the Verify run (`--mode candidate`, full) passed and `security-scan.mjs --root
<root>` did not report `BLOCKING` for the frozen candidate; the coordinator does not read either result.

If the Security scan blocks the frozen candidate and the fix needs a commit, renew the freeze instead
of restarting: commit the fix on top of the frozen candidate, then plan `--phase candidate-frozen` again
(`CLOSE-REFREEZE` explains a refusal). The new candidate must descend from the frozen one and must not
change the State file, `specs/<feature>/` or `audit-bundles/<feature>/` that earlier phases bound.
The renewal is recorded as one more `candidate-frozen` effect; the final Verify and Security evidence
must then name the new candidate. Candidate 17: a `candidate-frozen` plan also prints `criticCarryAdvisory`
(beside the plan, outside its digest) when commits after the last Critic-reviewed candidate change content
(source, dependencies, configuration, agent prompts) that the push's Critic carry-forward will not carry.
The close still accepts them, but the push then needs a Critic round for them, and that round is only
possible while the course is open: register a correction-DIFF round BEFORE the close (route in
`register-feature-package.mjs --help`, "Critic delta request route"). After the close the course takes no
review; the way is a new feature of rigor 1 with a full Critic over those commits. Push preparation is no such content: the
repository-mode promotion of the calibration twins, `project/push-threat-model.md`, and `.gitleaksignore` lines that
`gitleaks-repair-ignore.mjs --approve-new` appends for this feature's evidence or audit bundle are carried (`lib/critic-evidence-carry.mjs`). Findings you judge not relevant are put on the scanner's own ignore
route BEFORE the freeze, with a reason: gitleaks through `.gitleaksignore` (`gitleaks-repair-ignore.mjs`),
dependency findings through the project's `osv-scanner.toml` (`[[IgnoredVulns]]` with `id`, `ignoreUntil`
and `reason`). The shipped gitleaks configuration already exempts the bare hex digests the close itself
writes into `audit-bundles/<feature>/<commit>/` and the State file (bare hex values of 32 to 64 characters);
a real key in those files is still found.

A scanner that did NOT RUN is a different case from a finding. In a project calibrated critical it blocks the close
(`SEC-CLOSE-SCANNER-NOT-EXECUTED`; a skipped `license-check` counts, `osv-scanner` with no package sources stays
`not applicable`). Install or configure the scanner, or record a named exception BEFORE the freeze in the tracked file
`project/security-scanner-exceptions.json` (`{"schema":"pipeline.security-scanner-exceptions.v1","exceptions":[{"scanner":
"license-check","reason":"<non-blank, at most 500 characters>","expires":"<ISO-8601 date in the future>","confirmedBy":
"<the label the human gave for this exception in chat>"}]}`); quote the human's confirmation in the chat and the close
report. An applied exception is printed on the scanner's `Security close status` line and the close ends
`ADMITTED BY NAMED EXCEPTION`, never `GREEN`; an expired, malformed or unknown entry is ignored and named in the refusal,
and an exception never covers a scanner that reported findings.

The record for an auditor is that bundle: its README lists the signed proofs and the feature's tracked evidence
with Git blobs, and it is pushed with the close. Never hand-write an index or evidence summary under `scratch/`.

A value that is public by design (for example an IndexNow key) is reviewed through the same route
(`gitleaks-repair-ignore.mjs --prepare-gate`, then `--approve-new`) when the project publishes it as the
tracked file `public/<key>.txt` containing exactly that key (hex, 32 to 64 characters): put the key alone in
the reviewed-value file under `scratch/` and add `--reason "<why this value is public by design>"` (at least
10 characters; the command prints it, quote it in the chat confirmation and the close report). Any other
value is refused with a text that names what is accepted. The suppression is an entry in `.gitleaksignore`,
so commit it BEFORE the freeze, or renew the freeze as above.

`cleanup-complete` takes one private evidence file, `pipeline.close-cleanup-receipt.v1`, with exactly the keys
`schema`, `status` (`complete` or `uncertain`), `evidenceDigest` (64 hex characters; only its format is checked),
`candidateOid` and `candidateTree` (the frozen candidate, after a re-freeze the renewed one). Produce it with
`close-coordinator.mjs write-cleanup-receipt --root <repository-root> --lifecycle <id>` (from `final-verify-green`,
or `readback-confirmed` after a publication; candidate 16d). The command lists the active session descriptors and
EXCLUDES the closing session's own: that session is still running, so its descriptor can only ever report
`unavailable`, and it is derived from the runtime environment for the runner that is closing (`claude-<session id>` for
Claude, `codex-<session id>` for Codex, `antigravity-<conversation id>` for Antigravity, from the record its pretool hook
writes for the close command), never typed. The command prints `runner`, `ownSessionDerivation` and the reason. The exclusion is
named in the stored observation (`cleanup-observation.json`, beside the receipt) and the receipt's `evidenceDigest` is
the SHA-256 of that observation. Every OTHER active descriptor counts: `complete` only when none remains, otherwise
`uncertain`, and the output lists them. When the own session cannot be derived (the runner exposed no usable session
id), nothing is excluded, the receipt cannot be `complete` while any descriptor exists, and the output carries the
typed code `CLOSE-CLEANUP-OWN-SESSION-UNDERIVED` instead of claiming that other sessions remain. On Antigravity, exactly one
`antigravity-` descriptor answering `unavailable` is taken as the closing conversation and labelled
`inferred-single-antigravity-descriptor`; with several, none is excluded and the output names them and the way out. A project with no descriptor at all
gets `complete` with an observation that says so (no hand-chosen digest is needed any more). `uncertain` is accepted
by `cleanup-complete`, but `closed-local` is then refused with `CLOSE-CLEANUP`; end or clear the other sessions,
write the receipt again, and run `cleanup-complete` again with the new file (a later `cleanup-complete` with
`complete` replaces it). Hand-written receipts with the empty-input digest (PO decision 2026-11-01) stay accepted,
because only the format of `evidenceDigest` is checked, but the producer is the route. A hand-written receipt is an
operator's assertion, not an observation, on every runner: say so in the close report (`operator-asserted`) and use it
only when the producer's own output shows that the only remaining descriptor is the closing session's own.

The Critic carry-forward of a Critic-bound Verify (`--mode release --critic-packet-id ...`) admits the close's
own commit and handover-only commits after the last Critic round: a commit with one parent whose every changed
path is a Markdown file under `docs/` or `backlog/`, anything under `specs/<feature>/` or
`audit-bundles/<feature>/` of the feature being carried, or the State file, added or modified as regular
non-executable files. Any other path (source, tests, configuration, agent or skill prompts, another feature's
directory, a symlink) keeps the commit a correction and the carry refuses with `CVL-CARRY-CONTENT-CHANGED`.

Without separately authorized publication, confirmed descriptor-bound cleanup
may end at `closed-local`. Publication, readback, release and promotion are
separate coordinator transitions and are never implied by this skill.

## C. After the close: a push to a feature branch, or a release

<!-- moved verbatim from the SKILL.md body of the parent commit, lines 286-292 -->
After the close a consumer project does one of two things, each with one signature. **A push to a feature branch:** after the push run the `afterPush.followUp` command `push-prepare.mjs` printed (`audit-proof-followup.mjs --root <repo> --remote <remote> --destination <ref>`). It adds the push proof and the final Verify and Security records to the audit bundle and prints the one commit and the push; no further signature.

**A release** is the annotated version tag `v<VERSION>` on the closed feature, and it includes the push. Write the `RELEASE-NOTES.md` entry
(`## v<VERSION>`: closed feature id, title, acceptance criteria met) WITH the feature, before the Critic round, so the Critic reviews it and the
Critic-bound push Verify carries it; a notes commit after the review is a content change the carry refuses. Run
`release-preflight-cli.mjs --root <repo> --base <base> --lifecycle specs/<feature>/lifecycle.json`: it stops at the first missing step with its
repair command, records the PO's one release approval (chat) or prints the PO's signing command (signature), and prints every remaining step in order: the tag, the push of the approved commit when it is not on main yet, the follow-up commit and its push, the tag push. Owner: `docs/push-release-flow.md`, "Releasing a consumer project".
