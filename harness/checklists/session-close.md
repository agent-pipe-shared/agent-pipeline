# Checklist — Session Close / Block End

> Agent-Pipeline · Compact operative reference for the Elephant; why + verification live in `docs/operating-model.md`, `policies/model-policy.md` MP-16/MP-19/MP-20, ADR-0012. Executable form: the unified close coordinator plus the compatibility skills in `plugins/pipeline-core`.

## Close the block honestly

### H5 close coordinator (single authority)

- [ ] Close state follows `active → checkpointed → feature-close-prepared → tracked-close-finalized → candidate-frozen → final-verify-green`.
- [ ] Checkpoint preserves `activeFeature`; every tracked Result/backlog/handover/HISTORY/telemetry/retrospective/State mutation precedes the one frozen commit.
- [ ] Final Verify and Security bind the exact frozen OID/tree; any tracked drift invalidates evidence and never creates a second candidate.
- [ ] No publication is a valid local terminal path (`cleanup-complete → closed-local`); authorized delivery alone follows `publication-authorized → published → readback-confirmed → cleanup-complete → delivered`.
- [ ] Cleanup is descriptor-bound and candidate-neutral; uncertainty blocks terminal claims. Release/promotion remain optional descendants.
- [ ] Every post-freeze Verify, authorization, publication, readback and cleanup receipt is stored below the coordinator-private evidence directory returned by `apply-start`/`inspect`, never as a new tracked candidate byte.
- [ ] Active Continuity close uses the coordinator-returned State action including its exact `--continuity-close-request`; State byte drift or a reconstructed argv is refused.

- [ ] Block/task boundary reached — no close mid-task unless forced (then note why)
- [ ] DoD status assigned per task: done / 🟡 not-human-verified / blocked (`harness/definition-of-done.md` §3)
- [ ] Open 🟡 and blocked items listed in the handover — nothing silently dropped
- [ ] Every blocker/major Critic finding dispositioned; mandatory-trigger tasks have a findings report before merge
- [ ] Stage-1 Verify is green before semantic Critic review; its command/result digests and candidate OID/tree are retained as closed evidence
- [ ] Agent-Pipeline source checkout only: observation/document governance precheck is green before Verify; missing/drifted artifacts or unclassified `docs/` files leave close unfinished
- [ ] Result-first close intent binds the current authority, graph and package-binding digests before the expected-revision State CAS; replay a crash window with the same intent bytes/receipt identity (State CAS is the logical commit point, not cross-file atomicity)
- [ ] After the last tracked candidate mutation, the same full Verify is green on the exact post-transition commit/tree; any later tracked mutation marks it stale and blocks delivery
- [ ] Delivery and fetch-back are a no-mutation tail: pushed and fetched OIDs are the exact verified candidate OID, and lifecycle close occurs only after exact readback
- [ ] **Deployment-asymmetry check (NEW):** if this block touched a hook/statusline/plugin-cache file, deployment is VERIFIED on this machine (plugin re-installed/updated + `/reload-plugins`), not just committed — statusline (working tree, live on save) and hooks (plugin cache, install-gated) deploy at different speeds, so a commit alone does not make a hook/statusline change live

## Single-source sync

- [ ] Handover/state file updated: current state, decisions, open items, next block, re-entry protocol
- [ ] HISTORY entry appended with lessons; its "open/next" part generated from or referencing the handover — never hand-duplicated
- [ ] Merge-completion gate: post-merge handover update done (deterministic check)
- [ ] CLAUDE.md length gate green: ≤ {{CLAUDE_MD_MAX_LINES}} — growing means consolidating, moving to skills/hooks, or deleting
- [ ] Memory is mirror only — contradictions corrected in favor of the repo
- [ ] Authorship check (sub-step 6b — before Learn + measure): session's production diffs enumerated (`git log`/diff stat over the session range); mandatory question answered — "Whose are this session's production diffs?" — every diff maps to a Goldfish/Critic dispatch or the `roles/elephant.md` — *EL-01* stage-0 fast path; Elephant-authored diff outside stage-0 → INCIDENT (flag to the PO, note in handover + telemetry), never a retro discussion point
- [ ] If `publicPushIdentity.mode: required`: final exact-commit Verify plus required privacy/security evidence is green; `ssh -T <sshHostAlias>` readback names the calibrated dedicated account; only the explicit approved feature branch was pushed; a fresh/disposable fetch-back equals the pushed OID. Any failure is recorded as unfinished/blocked — never substitute a main merge, tag, release, force-push or deletion.

## Learn + measure

- [ ] Self-retro filed (supersedes the former the PO retro question + deferred-retro placeholder): session elephant writes the close retro itself — concrete improvement item(s) or explicit "nothing" — as a `workflow-improvement` backlog item / transfer note to the pipeline elephant (continuous-improvement process); never silently skipped. the PO's observations go via his own channel, no ritual prompt.
- [ ] Tooling radar due? Newest `tooling-radar` backlog item vs. current calendar month — overdue → report loudly + recommend a radar dispatch (tooling-policy R2; anchored in close-block step 7)
- [ ] `workflow-improvement` items filed in the pipeline repo's `backlog/`
- [ ] Agent failure traced to a missing/vague rule → rule added/sharpened in the right artifact (growth rule, `docs/operating-model.md` — *The lifecycle*)
- [ ] Three-artifacts archive for rigor ≥ 1: spec · acceptance criteria · result report (never full chat logs)
- [ ] `/usage`: ONE optional paste request before session end (mandatory manual paste rejected by the PO; declined/absent → "not collected" is a valid outcome; automated capture is tracked as a backlog item); telemetry line appended to `telemetry/costs.md` incl. first-pass + interventions per goldfish + limit standings when available (MP-20)
- [ ] Rigor-0 lessons may be bundled into one collective entry (`docs/operating-model.md` — *Rigor, risk and gates*)

## Hygiene + handover to the next session

- [ ] Stale worktrees cleaned or listed (WIP rule)
- [ ] Current-session descriptor (when present) was used to drain only registered resources; the redacted hygiene receipt is green. Missing/changed descriptor, manifest residue, dirty owned worktree or noncanonical placement leaves close unfinished — never substitute prefix-based deletion.
- [ ] `/context` checked; at ~70–80 % or a natural boundary → planned session cut (next session bootstraps from the handover)
- [ ] Commits: conventional, small, atomic; agent-authored commits carry `AI-Assisted: true`; no provider/model co-author, session URL/ID, account correlation, secrets, or machine-specific absolute paths
