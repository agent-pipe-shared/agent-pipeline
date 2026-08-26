# Critic review — PHX-LEDGER-INTAKE-design (`f68a17d`)

**Persisted by the Elephant** from the Critic's returned report (the Critic is
read-only and wrote no file). **One editorial change on transcription:** the
report's closing path list and disclosure section carried machine-specific
absolute paths; CLAUDE.md forbids those in committed artifacts, so they are
recorded repo-relative. No other wording was altered.

Bootstrap check passed: ruleset 2914a55713d714d95323231edaddccec5e1d6c2e5a4fbfaaaaa9d913a5fb1efc loaded · Project agent-pipeline · Calibration n/a · State n/a (Critic sees no history) · Role Critic

**Report header.** Requested route: `claude-opus-5 at max`. Effective-model identity: `unknown` (no direct same-dispatch route evidence observed; the host-supplied model label is not route evidence and was not used). T1 assurance: `functional-equivalent-read-only; OS isolation not asserted`. Review object: `f68a17dc667f212d4aba0564a14006fe348facca`, parent `4221377755ba0b5cd7a9911bf3f67dec7e4e10f6`, single parent, `git diff 4221377..f68a17d` confirmed to cover exactly the enumerated SHA (2 files, +805/-0). Review complete.

---

## 1. Findings

### F1 — The intersection rule cannot resolve a live GMW grant once the candidate moves

- **Gap:** §8.5 makes "the ledger holds a live, non-disposed grant" a precondition for every lift, and §3.1 names `resolveHumanGovernanceAuthority` as that resolver. That resolver denies with `scope-mismatch` whenever the supplied candidate differs from the grant's `scope.candidate`. GMW's `scope.candidate` is the intent candidate — `HEAD` at **prepare** time — while GMW's own enforcement is deliberately candidate-independent (validity is derived purely from time). The design never states which candidate the boundary check passes, never lists candidate drift among the ten §10 assumptions, and §12 has no stale-candidate test.
- **Risk:** Two mutually exclusive readings, both bad, and the design picks neither. Pass the *current* candidate and every window whose HEAD has moved — the normal case, since a maintenance window exists precisely to edit guarded paths — reports a false ledger/window disagreement; `status` loses its stated value as the detector of a lost close-append (§7.4.3), and a reconcile keyed on disagreement can append a spurious, permanently irreversible `revoked` (append-only, H-AC-06) against a legitimately live window. Pass the *grant's own* candidate and the check is vacuous, so the candidate binding H-AC-04 requires is never actually evaluated. If O-2 is redirected into the hook, the window dies at the first commit inside it. Severity: **major**.
- **Evidence:** `plugins/pipeline-core/lib/human-governance-ledger.mjs:55` — `if (decision.scope.repositoryFingerprint !== repositoryFingerprint || decision.scope.candidate.commit !== candidate.commit || decision.scope.candidate.tree !== candidate.tree) return Object.freeze({ status: "denied", reason: "scope-mismatch" });` · `plugins/pipeline-core/lib/guard-maintenance-window.mjs:542-545` (validity from `min(signed, installedAtMs + MAX_WINDOW_TTL_MS)`, no candidate term) · `guard-maintenance-window.mjs:364-371` (candidate captured at `prepare`) · design `specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md:607-618`, `:126-129`, `:226`, `:682-693` (no such assumption), `:726-744` (no such test).
- **Spec-ref:** H-AC-15 (`specs/sprint-phoenix-epic/acceptance.md:206-209`, "stale candidate"); H-AC-04 (`acceptance.md:148-150`, candidate binding); `specs/sprint-phoenix-epic/spec.md:413` ("cover expiry, consumption, revocation, stale candidate, cross-repo") and `spec.md:422` ("scope/candidate drift").

### F2 — `policyDigest`'s preimage is left open, and its natural resolution is the stable pseudonym §5.1 just excluded

- **Gap:** Every other digest in the design has a closed formula (`ruleDigest = canonicalSha256({scopeRuleIds, openingTreeSha256})`, the four decision-id forms, the validity formula). `policyDigest` alone is defined as "canonicalSha256 of the effective proof-policy inputs that decided the lift was admissible", qualified as "re-derivable locally". The only proof policy in this path is the trust anchor, whose entire content is `{keyReference, publicKeySha256}`. §5.1 bullet 2 excludes `publicKeySha256` from the portable record in exactly these words: "A public-key digest is a **stable pseudonym** for one natural person across every record it appears in."
- **Risk:** A digest whose preimage is that anchor is the same pseudonym one hash deeper — identical in every record forever, and by construction confirmable by anyone holding the local policy ("re-derivable locally"). The design's own privacy property test and AC-2 forbid only "a key digest" and "the trust anchor's key digest" verbatim, so a digest *over* the key digest passes both. Because H-AC-06 makes portable records append-only, the value cannot be corrected or erased after the fact. Severity: **major**.
- **Evidence:** design `:238` (definition) vs. `:278-281` (the exclusion and its stated reason); `:740-742` (test 16) and `:754-756` (AC-2) enumerate the forbidden values without covering a derivative · `plugins/pipeline-core/lib/critical-human-proof-policy.mjs:188-193` (anchor is exactly `["keyReference","publicKeySha256"]`) · consumed at `plugins/pipeline-core/lib/guard-maintenance-window.mjs:508-511`.
- **Spec-ref:** H-AC-05 (`acceptance.md:153-156`, "only the non-identifying authority/actor class and assurance … any … joinable pseudonymous reference SHALL remain in the … machine-local profile"); H-AC-13 (`acceptance.md:194-202`, "joinable pseudonym"); H-AC-06 (`acceptance.md:157-159`, append-only).

### F3 — The HGO half of the field mapping names a source that HGO does not have

- **Gap:** §4 gives HGO's `scope.artifacts` as "plan + spec of the override". HGO has no repository plan/spec artifact: its capability carries `planSha256`, `selectionSha256` and `reasonSha256`, all digests of in-memory payload objects, and `specSha256` does not occur anywhere in the module. `scope.artifacts` is a required field with a minimum of one entry and a closed `{path, sha256}` shape whose `path` must be repo-relative. §3.3 verifies HGO's storage, audit chain and `reasonSha256` but never its capability field inventory, and §10 lists ten GMW assumptions and zero HGO assumptions — so this is presented as established fact rather than as an assumption with a named failure mode.
- **Risk:** The HGO half of §7.5's event sequence is not constructible from the stated source; every HGO event would fail `HGL-SCOPE` at validation. The asymmetry also removes the safety net the design built for GMW: an unverified GMW dependency fails loudly against an A-1..A-10 row, an unverified HGO dependency fails only at implementation time. (`eligiblePaths` — repo-relative, and already the stated `ruleDigest` input — is a plausible correct source, which is what makes the named one look unchecked rather than deliberate.) Severity: **major**.
- **Evidence:** design `:227` (the cell), `:181-195` (§3.3's verification scope), `:682-693` (§10, GMW-only) · `plugins/pipeline-core/lib/human-guard-override.mjs:1066-1089` (`CAPABILITY_KEYS`), `:1295-1313` (`planSha256 = sha(payload)` over an in-memory object), `:815` (`paths.push(path.relative)`) · `plugins/pipeline-core/lib/human-governance-decision.mjs:28-30` (`scope.artifacts.length === 0` fails `HGL-SCOPE`; `HGL-ARTIFACT` path pattern).
- **Spec-ref:** H-AC-04 (`acceptance.md:148-150`, "artifact … SHALL reject a decision missing or mismatching any required dimension").

### F4 — The hook-path residual is anchored only to H-AC-12's migration clause; H-AC-02 is never mentioned

- **Gap:** D-2/§8.5 place the dual evaluation at the arming/consumption boundaries, status and reconcile, leaving the synchronous guard hook trusting `window.json` alone. The design justifies this against H-AC-12's "Every direct reader SHALL dual-evaluate **during migration**" and supplies the owner/expiry that sentence demands (§9: owner `pipeline`, expiry at the end of the Phoenix epic). H-AC-02 states the same requirement without a migration qualifier and without an expiry, and the design cites it nowhere — I checked all 51 `H-AC-*` references in the file.
- **Risk:** The residual reaches the PO as O-2, a migration-scoped interpretation to ratify, when the criterion actually at stake is unconditional: after the stated expiry, a boundary-only check still leaves mutable state granting a lift with no matching ledger decision at the point of enforcement. This is structurally the same defect the design itself identifies for GMW/H-AC-12 — a conformance run passes while the enforcement path stays outside the ledger. The design's own "nothing regresses" is true but sets the bar at the pre-ledger status quo the document exists to replace. Severity: **major**.
- **Evidence:** design `:620-632` (D-2 placement and the "nothing regresses" justification), `:782-785` (O-2 as an H-AC-12 interpretation), `:668-672` (owner/expiry) · absence of `H-AC-02` across the whole file (all cited criteria: 01, 03, 04, 05, 06, 11, 12, 13, 14, 15).
- **Spec-ref:** H-AC-02 (`acceptance.md:143-144`); H-AC-12 (`acceptance.md:187-193`).

### F5 — §12 omits four H-AC-15 dimensions the path itself exercises

- **Gap:** §11 states the new test file delivers "H-AC-15 dimensions for this path". §12's seventeen enumerated tests contain no denial case (although §7.5 emits `denied`), no correction case, no concurrency case, and no stale-candidate case (F1). Concurrency is concrete rather than theoretical: §7.3's live-grant skip is a check-then-append performed *outside* the store's stream lock, so two concurrent installs both pass the skip and the second fails `GES-IDEMPOTENCY-CONFLICT` on the `requested` event because the intents differ in `occurredAtEpochMs` — precisely the "turning a supported operation into a hard error" outcome §7.3 says it was designed to prevent.
- **Risk:** The stated coverage claim is broader than the stated tests, so a reviewer reading §11 would believe H-AC-15 is discharged for this path. The concurrency case itself is fail-closed and retryable, so the risk is the claim, not the behaviour. Severity: **minor**.
- **Evidence:** design `:700` (the claim), `:712-744` (the tests), `:469-493` (§7.3's check-then-append) · `plugins/pipeline-core/lib/governance-event-store.mjs:638-644` (`withExclusiveStreamLock` wraps only the append; `:642` is the conflict).
- **Spec-ref:** H-AC-15 (`acceptance.md:206-209`); `spec.md:399` (concurrency/idempotency coverage required for the store).

### F6 — §9's rebind amendment is narrower than §11's own inventory, and AC-9 makes it a completion gate

- **Gap:** §9 specifies that `spec.md` §7.4 "gains inventory rows for the new intake module, its test, and the two CLI wrappers". §11 modifies **three** scripts — `guard-maintenance-window.mjs`, `guard-human-override.mjs` and `governance-authority.mjs` (the new `reconcile` path) — and names no file at all for §12's integration tests 7–17.
- **Risk:** AC-9 declares the §9 amendment a precondition for completing this path, so an under-specified amendment writes an incomplete integration inventory into a bound artifact, and the omission is then locked in behind a reviewed rebind. Severity: **minor**.
- **Evidence:** design `:668-669` ("the two CLI wrappers") vs. `:699-703` (three scripts, plus only one test file) and `:771-772` (AC-9).
- **Spec-ref:** `spec.md:405-428` (§7.4 integration inventory, the artifact the backlog item names as affected).

### F7 — An inventory row edits a file that does not exist

- **Gap:** §11 lists `docs/human-governance-ledger.md` with the change "add the two producers to the operator/taxonomy guide". The file is untracked in this checkout; `spec.md:418` still carries it as a **create**. Every other §11 row marks **create**, **modify** or **no change** explicitly, and §14's F-1 applies exactly this existence check to three other cited documents.
- **Risk:** The H-AC-14 obligation this row discharges is a creation, not an edit, so the inventory understates the work and the row escapes the document's own F-1 standard. Severity: **minor**.
- **Evidence:** design `:707` · `git ls-files docs/human-governance-ledger.md` returns nothing (`docs/governance-events.md` does resolve, so the query is sound) · `spec.md:418`.
- **Spec-ref:** H-AC-14 (`acceptance.md:203-205`).

---

## 2. Deliberately not flagged

Categories cleared, with what I actually checked:

1. **Spec fidelity.** I read all fifteen H-AC criteria and mapped them against the design. H-AC-01, H-AC-03, H-AC-04 (except F3's artifacts), H-AC-05, H-AC-06, H-AC-11, H-AC-12, H-AC-13 and H-AC-14 are addressed with correct quotations — I verified the H-AC-01, H-AC-11 and H-AC-12 quotes character-by-character against `acceptance.md:140-142`, `:184-186` and `:191-193`. H-AC-07/08/09/10 are legitimately out of scope for this path. §9's core claim is correct: GMW appears nowhere in `spec.md` or `acceptance.md` (repo-wide search returns zero hits), so H-AC-12's enumeration genuinely omits it, and the proposed insertion text is grammatically and semantically sound.
2. **Scope.** Two files, both appropriate: a new design document and a one-line triage pointer in the source backlog item. No bound artifact touched, exactly as §2 and §9 promise. No unlisted file, no drive-by edit.
3. **Trajectory / authorship.** See §3 below.
4. **Test integrity.** Nothing weakened, deleted, skipped or made tolerant — the diff adds no code and touches no existing test. §12's fail-closed assertions are stated as negative-state checks (test 9: "no window record exists"; test 10: "window still gone"), which is the stronger form.
5. **Edge cases and failure paths.** §8.2's eight-row crash matrix is genuinely exhaustive over the interleavings of two independent stores, and §8.4 states the absence of a cross-store transaction rather than papering over it. I verified the idempotency claim in §7.3 against `governance-event-store.mjs:640-644`: it is exactly right, including that a same-key/different-intent replay fails rather than silently succeeding. The `requested`/`granted`/`revoked` link discipline in §7.4 and §7.5 matches the `requiredLink` map at `human-governance-decision.mjs:37-39` for every one of the six event types used. `createConsumedHumanGovernanceDecision`'s `singleUse === true` precondition (`human-governance-ledger.mjs:222`) is satisfied by HGO (`singleUse: true`) and correctly not relied on for GMW (`singleUse: false`).
6. **Guardrails / constraints.** No secrets, tokens or machine-specific absolute paths anywhere in the committed design document (scanned for home-directory prefixes, drive letters, key headers, token/secret strings — zero hits). Conventional Commit, one concern, atomic. Read-only toward the three project repos is not implicated.
7. **Security surface.** The threat model is coherent and the design consistently reasons from it. Two decisions I specifically tried to break and could not: the refusal to move the window record into the worktree (§6 reason 2) is correct — the record contains `root`, an absolute path, and `proof`, and it would place a capability-bearing artifact inside the surface the never-liftable kernel list at `guard-maintenance-window.mjs:120-128` exists to protect; and §5.3's refusal to persist even a *digest* of the free-text reason is right for the stated dictionary-attack and join-handle reasons. `identityAssurance: locally-attributed` for a cryptographically verified proof is the honest call and matches the ledger's own self-description at `human-governance-ledger.mjs:117-122`/`:131`. The fail-closed-at-arming / fail-open-at-narrowing asymmetry is correctly directional. Note that F2 is a gap *within* this otherwise careful privacy analysis, not a contradiction of it.
8. **Documented-instead-of-fixed (QG-06).** D-1, D-2, D-3, O-1, O-2, O-3, F-1 and F-2 are all disclosed rather than buried, and the one deferral that needs a due date has one: §9 gives the migration compatibility owner (`pipeline`, PHX-2) and expiry (end of the Phoenix epic). No bare TODO, no undated mitigation. F4 concerns the *anchor* chosen for one residual, not a missing owner or date.
9. **Dependency reality check.** No new import, package, action or image in this diff — it is documentation only. Nothing to verify against a registry; no slopsquatting surface.
10. **Language assignment (ADR-0011).** Both files are English-canonical, correct for an agent-facing spec artifact. I considered and dropped the two verbatim German PO quotations (design `:20-21`, backlog `:85-86`): ADR-0011:16-17 prohibits parallel German copies and unmarked reader aids, not evidentiary quotation, the quoted words are load-bearing evidence for the threat model that translation would degrade, and the identical pattern already exists in the pre-existing backlog item this design derives from.

**Dropped candidates** (hunted, evidence found, dropped at the gate):

- §3.2's "`install` currently accepts only `--request` and `--proof`" is inexact — `install` also accepts an optional `--authority` (`scripts/guard-maintenance-window.mjs:119-125`). Dropped: no spec or guardrail anchor, and zero consequence for §7.4's conclusion that `install` must gain `--plan`/`--spec`, which stands.
- HGO's `ruleDigest = canonicalSha256({eligiblePaths, commandClass})` looked like it would hash absolute machine paths into a portable field. It does not: `eligiblePaths` holds repo-relative strings (`human-guard-override.mjs:815`, `safePath` at `:436-455` returns both forms and only `.relative` is pushed). Dropped as factually wrong.
- The `requested` idempotency key carries no timestamp while grant/revoke/expire ids do. I checked whether this asymmetry breaks the §6 "re-install after close" row; it does not — `requested` is skipped as present and the new grant gets a fresh `installedAtMs`-bearing id. Dropped.
- Envelope-level shape of §7.2. I dropped this after verifying rather than assuming: all 24 intent keys are correct against `REQUIRED_ENVELOPE_KEYS` (28) minus `INTENT_OMITTED_FIELDS` (4) at `governance-event.mjs:25-30` and `governance-event-store.mjs:36`; `authorityClass: "human-authority"` is mandatory for `origin: "human"` (`governance-event.mjs:175`); `streamId === origin` and the `sourceUri` form hold (`:181-182`); the `correlation` and `policy` sub-key sets match `:31-32` exactly; `{state:"omitted-by-policy"}` and `{state:"unavailable"}` are admitted typed states (`:118-128`); `eventType` values match `:22`; and every literal used (`GUARD.MAINTENANCE.LIFT`, `local-checkout`, `guard-maintenance-window`, the four decision-id forms) satisfies the relevant `CODE`/`ID` pattern at `human-governance-decision.mjs:4-5`. This section is correct.

---

## 3. Trajectory check

**Verdict: consistent.**

- The DoD command was really executed, and not by the model: `.git/verify-evidence-PHX-LEDGER-INTAKE-design.mjs` is a nine-line `spawnSync` recorder that writes the artifact from `result.status`/`result.stdout` and exits with the child's code. The artifact's shape (`exitCode: 0`, ISO `ranAtUtc`, empty stderr block, `484 Markdown file(s), 776 link(s), 13 anchor check(s)`) is machine-written and matches that writer field for field. The dispatch record's `verifyCommandsRun` entry agrees with the artifact on command, exit code and path.
- Authorship is clean and dispatched, not orchestrator-authored: commit trailer `Dispatch: PHX-LEDGER-INTAKE-design (goldfish)` plus `AI-Assisted: true`, matching `taskId` and `dispatcher: elephant` in the dispatch record. No provider/model co-author line, no session URL or ID, no account identifier, no private correlator in the commit object.
- The source claims are real, which is the strongest trajectory signal here. I independently re-verified roughly forty of the design's `file:line` citations across seven modules. They are accurate to the line, and where a range is given the cited construct falls inside it (the only drift I saw was ±1 within stated ranges, e.g. §3.3's `:1226-1235` for a `type: "denied"` at 1227). §3.2's six-row re-verification table is correct in every row, and §14's F-1 and F-2 are both true: `docs/adr/0058-guard-maintenance-window.md` and `docs/guard-maintenance-window-threat-model.md` are cited at `guard-maintenance-window.mjs:10-11` and neither is tracked, and `pipeline.human-role-exception-decision.v1` is kernel-admitted at `governance-event.mjs:170` while absent from `spec.md:278-301`.
- One scoped non-verification, disclosed rather than assumed: the design quotes `docs/state.md:624`. I did not open it — state and history are outside my admissible input — so that single citation is unverified by me. The dispatch record's own note that the coordinator's line reference for it slipped is consistent with the design having corrected it.
- One limitation of the evidence, stated plainly: `check-doc-contracts.mjs` validates Markdown links, and this document contains none — every path is a backticked `path:line` reference. The gate therefore passes without checking any of the document's ~60 source references. The exit code is honest but has near-zero discriminating power over this deliverable; my own re-verification above is the substantive evidence, and it came out well.

---

## 4. Briefing violations observed

One, disclosed rather than "none": `.git/dispatch-record-PHX-LEDGER-INTAKE-design.json` carries implementor narrative beyond the mechanical DoD result — `deviationsFromSpec`, `designDecisions`, `unverifiedAssumptions` and `openQuestions`. The dispatch anticipated this and excluded it in words ("the implementor's narrative rationale is NOT your input"), but the fields are physically present in the artifact I was directed to read for authorship and command/exit-code evidence, so I saw them. I used the record only for `taskId`, `model`, `verifyCommandsRun`, `commits`, `changedFiles` and the trailer cross-check. Every finding above was derived from the diff and from source I read myself; none rests on those fields. Recording it so the surface is visible, not to claim it changed the outcome.

No other contaminating input: no chat history, no completion-report prose, no expected conclusion, no hunt list, no prior verdict. All required artifacts resolved.

---

## 5. Verdict

**fail.**

Four major findings. F1 and F3 mean the receiving contract is not implementable as written — the intersection rule that makes the whole dual-write design safe has no defined candidate argument, and a required closed-payload field on the HGO side names a source that does not exist. F2 would write an unremovable stable pseudonym into an append-only record while passing the design's own privacy test. F4 sends the PO an interpretation question anchored to the wrong criterion. AC-9 makes the §9 amendment a completion gate, so F6 would carry an incomplete inventory into a bound artifact through a reviewed rebind.

This is a fail on a genuinely strong document. Its source verification is real and accurate, its threat-model reasoning is disciplined, and it repeatedly chose to disclose rather than smooth over. The four majors are gaps in an otherwise careful analysis, not evidence of a careless one — F2 in particular exists *because* the privacy reasoning is good enough to have caught its own sibling case.

---

## 6. Disclosure duty (auto-injected context)

Named, accepted, not silent:

- **`CLAUDE.md`** (project instructions) was auto-injected into my context.
- **A git status / recent-commits snapshot** from the parent session's start was injected. I did not use it as a freshness reference. My own `git status --porcelain` now reports a different working set (`.claude/settings.json`, `backlog/items/2026-08-07-marketplace-install-topology-unattested.md`, `specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md`); neither reviewed file is dirty, so my working-tree reads of both match `f68a17d` exactly. All commit state came from my own `git show`/`git diff` against the enumerated SHA.
- **User auto-memory** (`MEMORY.md`, three entries on push target, uncommitted state files, and detached-worktree verify) was injected. Not relevant to this review; not used.
- **Pre-existing scratchpad state:** a `pre-diff-design.md` file (0 bytes, timestamped before this dispatch) was already present in the session scratchpad. I did not read it, did not build on it, and produced no evidence files at all.
- **One mutating command attempted and refused:** per the dispatch's scratchpad-isolation instruction I invoked `mkdir` for a fresh per-dispatch subdirectory. The `guard-lifecycle-ready` hook blocked it (`GUARD-CROSS-REPO-MUTATION`). I did not retry or work around it and instead conducted the entire review read-only, in context, with no file written. Disclosing the attempt because the functional-equivalent lane leaves me write-capable and that capability must not be exercised silently — nothing was created, modified or deleted.

Artifacts read (repo-relative): `specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md`, `specs/sprint-phoenix-epic/acceptance.md`, `specs/sprint-phoenix-epic/spec.md`, `backlog/items/2026-08-07-gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger.md`, `plugins/pipeline-core/lib/human-governance-ledger.mjs`, `plugins/pipeline-core/lib/human-governance-decision.mjs`, `plugins/pipeline-core/lib/guard-maintenance-window.mjs`, `plugins/pipeline-core/lib/human-guard-override.mjs`, `plugins/pipeline-core/lib/governance-event.mjs`, `plugins/pipeline-core/lib/governance-event-store.mjs`, `plugins/pipeline-core/lib/critical-human-proof-policy.mjs`.
