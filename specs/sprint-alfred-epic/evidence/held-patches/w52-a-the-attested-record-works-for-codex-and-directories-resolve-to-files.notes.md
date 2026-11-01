# w52 — the attested record works for Codex, and a directory in a task scope resolves to exact files (candidate 17, slice 6)

A real Codex consumer finished its work itself and could not close: the documented fallback record (`critic-review` skill, "Which record admits the
first review (PF-70)") failed three times in a row, then Critic admission ended with `CDP-REVIEW-ADMISSION`:

1. `attested-briefing: the briefing block lacks agentType` — a generated Codex briefing names the agent by `nativeAgentType: "worker"` plus `role`
   (the host derives the agent type from the role); the attested writer insisted on `agentType`. Every generated Codex briefing failed here.
2. `attested-scope: commit paths outside the briefed allowedPaths: screenshots/...` — every route (generator, native host `includes`, attested writer)
   reads `allowedPaths` as exact files; the generator accepted a directory as `--path` and emitted it as one useless entry.
3. `record-model: ... runner codex needs a trusted host-observed model and consent binding` — only Claude agent frontmatter can attest a model, so any
   record of another runner was refused, including the orchestrator-attested kind whose own log says the worker model was not observed.

PO decisions (2026-11-01): the record carries a visibly weaker, labelled model assurance for such runners; a directory in a scope is resolved to its files.

## Change

- `scripts/dispatch-record-write.mjs` (`runAttestedRequest`): derives `agentType` from `role` for a Codex briefing (`ROLE_TO_AGENT`, now exported by
  `lib/native-goldfish-host-return.mjs`); the refusal for a still-missing `agentType` names the briefing to pass; for a runner other than `claude` the record's
  attestation carries `modelAssurance: "declared-unobserved"` and its log note says the model is the briefing's declaration, not an observation; the
  model-authority gate lets exactly that combination through (orchestrator-attested kind + the label + `runner-model-authority-required`) and nothing else;
  `attested-scope` now says allowedPaths are exact files and names the repair (a new briefing whose `--path` list names every file).
- `lib/dispatch-record.mjs`: the attestation accepts one optional key, `modelAssurance`, only with the value `declared-unobserved` and only for a record whose
  runner is not `claude`. A Claude record keeps its four-key attestation unchanged.
- `scripts/dispatch-briefing.mjs`: a `--path` that is an existing directory is resolved to the regular files it holds (links and `.git` skipped, sorted),
  with a warning `DBG-DIRECTORY-EXPANDED` that lists them and says a file created later is outside the scope; an empty directory is refused
  (`DBG-PATH-EMPTY-DIRECTORY`); a scope above the native host's 64 exact files is refused (`DBG-SCOPE-TOO-MANY-PATHS`, naming the counts). No prefix matching anywhere.
- `lib/review-admission-read.mjs`, `skills/critic-review/SKILL.md`: the admission hint and the PF-70 section state the label and the exact-files rule.
- Tests: four new writer tests (DRW32-35) and two generator tests, mutation-checked (Codex derivation off, gate exemption off, label check for Claude off,
  directory resolution off: each turns the matching test red; with the gate exemption alone removed the original Codex refusal text reproduces exactly).

## Not changed / not proven

- Nothing was run on a real Codex or Antigravity session. The Codex briefing shape is taken from the generator's own output and the host parser.
- Antigravity: its dispatches use a separate sealed route and no `pipeline-native-goldfish-host-commit` block, so the attested writer still cannot consume an AGY
  briefing; the label would apply to runner `antigravity` but there is no route that produces such a record yet.
- Other record kinds of a non-Claude runner (`stopped-without-commit`, `read-only`, `completed-undelivered` on Codex) still meet the same model-authority
  refusal (read from the code, not run).
- The hint texts in `hooks/native-goldfish-host.mjs` (`NGHF-PENDING-UNAVAILABLE`, the AGY pipeline-path text) and `scripts/critic-packet-preflight.mjs` still describe
  the route without the runner caveat.
- Suites run in the clone: dispatch-record-write (44), dispatch-briefing (135), dispatch-record, native-goldfish-host-return, check-critic-skip-coverage,
  critic-packet-preflight, critic-lifecycle-admission: all pass.
