# W7-R7 pre-existing reds: dispatch-model (GDM04/05), native-worker (GDW01/04), HGO disjoint (HGOD005/011)

Slice W7-R7-DISPATCH-MODEL-NATIVE-WORKER-HGO-DISJOINT-REDS-20261031 (item 7 of `backlog/items/2026-10-30-pre-existing-reds-hide-new-cases.md`;
bound to the placeholder item and AC-160 only because the generator needs an item with a criterion). Targeted delivery: green. The patch
changes FOUR test files and NO production file: all six reds trace to a decided contract change, none to a regression, so
`guard-dispatch.mjs` and `human-guard-override.mjs` are untouched. It is cut against the candidate in the prepared clones (HEAD 85afdf7f0
plus the twenty-four candidate-13 patches, dada0bbc3) and applies after them (driver `patch` mode: `git apply --check` exit 0 on the
baseline clone). Batch Critic, final Verify and PO acceptance stay pending.

## Decisions per item

| Cases | Deciding commit(s) | Decision | File changed |
|---|---|---|---|
| GDM04, GDM05 | **dc8204a28** (native Antigravity tiers bound to the carrier's configured duty tier: flash / pro only, `DISPATCH-MODEL-DUTY-MISMATCH`; an ungoverned type is `agent-type-not-governed` and is refused as a write carrier instead) | (a) restate | `guard-dispatch-model.test.mjs` |
| GDW01 | **90fa209cf** + **b206d17cb** (D185: a productive Goldfish dispatch needs the generator's briefing; the guard order stays and the tests follow) | (a) restate with the generator run in process | `guard-dispatch-native-worker.test.mjs` |
| GDW04 | **90fa209cf** (D185: generated-briefing check runs before the completeness check; GD4/GD9 in `guard-dispatch.test.mjs` were restated the same way) | (a) restate the asserted code | `guard-dispatch-native-worker.test.mjs` |
| HGOD005, HGOD011 | **c206f3370** (AC-160 r2: an armed capability bound to the same tool input whose denial digests drifted is refused as `HGO-DRIFT`, not skipped as `absent`) | (a) restate | `human-guard-override-disjoint.test.mjs` |

No guard was loosened and no case is left red.

### GDM04 / GDM05 (QG-04 justification per assertion change)

- GDM04 (name unchanged): the original entry (`customer-researcher`, no Model) is still asserted `BLOCK`, and now also
  `DISPATCH-WRITE-CARRIER-REQUIRED` (the refusal the guard really gives an ungoverned type; GDM02 pins the same refusal for that TypeName with a
  Model). The "explicit native Model" message the case is about is asserted on a governed read-only carrier (`consult-advisor`, no Model):
  `BLOCK`, `DISPATCH-MODEL-MISSING` and `Subagents[].Model`. The briefing's description (a DUTY-MISMATCH answer) was imprecise for GDM04: the failure
  was the missing model message, because the ungoverned type is no longer judged on its Model.
- GDM05 (name unchanged): the batch cases now put the valid `pro` entry first (a `flash` entry on `consult-advisor` is itself a duty mismatch and
  would mask what is being checked) and keep `inherit` / `unknown` refused. Admission is per carrier: `consult-advisor` + `pro` is `ALLOW`
  (unchanged assertion on the unchanged carrier). `readiness-reviewer` + `flash` (its configured tier) asserts only "no `DISPATCH-MODEL` finding",
  not `ALLOW`, because the Critic-family template check refuses a bare prompt afterwards (no governed `flash` carrier reaches `ALLOW` end to end
  with a bare prompt; goldfish-* carriers need the generator briefing). `flash_lite` is a valid enum value but NO duty selects it
  (`AGY_NATIVE_TIERS`), so under the decided contract it is a `DISPATCH-MODEL-DUTY-MISMATCH` refusal on every governed carrier; the case pins that
  refusal, plus the two cross-tier mismatches (`flash` on `consult-advisor`, `pro` on `readiness-reviewer`). The library-level `flash_lite`
  admission for an ungoverned type is still pinned by `lib/dispatch-model-enforcement.test.mjs` DME10.

### GDW01

Rebuilt on the pattern of `generatedItemFixture` in `guard-dispatch.test.mjs`: production approved-course fixture (`prepareApprovedItemCourseFixture`),
the real `runDispatchBriefing build` in process with an injected ruleset identity and Codex route (`runner: "codex"`, `gpt-6-luna`), the
unchanged `spawn_agent` / `worker` call. Same intent: a complete dispatched Codex briefing publishes exactly one native pending state; a
candidate that no longer matches blocks launch with `NGHS-CANDIDATE-MISMATCH` and publishes nothing. Unchanged assertions: one binding marker, one
host directive, `ALLOW`, one pending file, `adapterVersion` 2, `nativeAgentType` worker, `candidateCommit` = fixture HEAD, `dispatchId`, `BLOCK`
plus the typed code, no pending file for the failed run. Changed: (1) pending state schema `...host-state.v1` -> `...host-state.v3`, because a
generated item-governed binding publishes `NATIVE_GOLDFISH_CONFIGURED_HOST_STATE_SCHEMA` (v1 was the hand-built shape); (2) the failed
preparation no longer tampers with the binding's tree (that breaks the generator hash and is refused earlier as a hand-edited briefing); the
candidate moves instead: a second generated fixture gets one more commit after generation, which is the same typed mismatch; (3) the
negative runs in its own fixture, so its "no pending state" assertion is `0` there. Named new dependency: the fixture reads the repository's own
`pipeline.user.yaml` (plus `human_approval: chat`), exactly like `native-goldfish-host-finalizer.test.mjs`, because the fixture's default source
fails V3 validation (`NGHS-ADMISSION-UNAVAILABLE`, measured). The session id keeps the Codex owner id grammar (8+ characters).

### GDW04

The same marked packet in the same no-feature fixture is now refused `BLOCKED (guard-dispatch): DBG-GENERATED-BRIEFING-REQUIRED` (still `BLOCK`; the
`GUARD-DISPATCH-PROMPT-NOT-TEMPLATE-SHAPED` text is only a warning before it). The case asserts that code; the intent (the packet is never
admitted as a functional Goldfish briefing) is kept. `DISPATCH-INCOMPLETE-BRIEFING` stays pinned in `lib/dispatch-policy.test.mjs`.

### HGOD005 / HGOD011

The first assertion (`status === "absent"` for a different denial set) becomes `status === "replan"` and `code === "HGO-DRIFT"`; the rest of the
case (other input not consumed, `HGO-EXPIRED` with a later clock) is unchanged. Fail-closed is kept and is now explicit: the capability is still
not consumed.

### Pinned counts (`check-verify-case-completion.test.mjs`)

Two measured sites counts moved because the restated cases carry more top-level assertion sites (classifier unchanged, measured clone vs
baseline with the exported classifier): `guard-dispatch-model-tests` 19 -> 25 and `human-guard-override-disjoint-tests` 57 -> 58. The native-worker
suite is not a classified row. Each moved number carries a trailing QG-04 comment on its own row (no new line, so the file stays at 1057 lines).
No case was added, removed or renamed in any suite (counts of registered cases are unchanged: model 5, native-worker 4, disjoint 35).

## Order deviation (honest)

The restated cases were not run RED on their own before the edit: no production file changed, so the red evidence is the baseline run of the
ORIGINAL case text on the unchanged code (`base1.*`, six names) against the restated case green on the same code (`c1.*` / `c2.*`). The driver's
`revert` mode was not run: with no production change it would restore identical bytes and prove nothing. Downstream sweep: not applicable (no
changed function).

## Not changed

- `guard-dispatch.mjs`, `human-guard-override.mjs`: no regression found.
- `guard-dispatch-native-worker.test.mjs`: `filledTemplateBody` is now unused (orphaned by GDW01); left in place, as are `CLEAN_CRITIC` and the other
  unused imports that were dead before this slice.
- The briefing's note that GDM05 gets exit 2 for `flash_lite` is correct and is pinned as the new contract above, not worked around.

## Evidence (finished logs in scratch/agent-out/w7r7, machine-written by the driver)

- Red on unchanged code (`base1.*`, clone2): guard-dispatch-model GDM04, GDM05; guard-dispatch-native-worker GDW01 (`DBG-GENERATED-BRIEFING-REQUIRED`),
  GDW04 (stderr lacks `DISPATCH-INCOMPLETE-BRIEFING`); human-guard-override-disjoint HGOD005, HGOD011 (`'replan' !== 'absent'`).
  Failing-name set: those six; edited clone: empty.
- Green on the final state (clone): guard-dispatch-model 5 tests, 5 pass, 0 fail (`c2.*`); guard-dispatch-native-worker 4 tests, 4 pass, 0 fail (`c1.*`);
  human-guard-override-disjoint 35 tests, 35 pass, 0 fail, human-guard-override-disjoint-isolation 38 pass, 0 fail (`c1.*`; baseline 38/0);
  guard-dispatch 81 tests, 81 pass, 0 fail (`c1.*`; baseline 81/0); check-verify-case-completion 32 tests, 32 pass, 0 fail (`c4.*`; baseline 32/0).
  (The first `c1` check-verify run was red on VCR01 with the two counts above; green after they were restated.)
- Boundary: `scratch/agent-out/boundary-diff.mjs` base 103 violations, cand 103 violations, no ONLY CAND line.
- Patch: 21977 bytes, four files, `git apply --check` exit 0 on the candidate (driver `patch` mode).
