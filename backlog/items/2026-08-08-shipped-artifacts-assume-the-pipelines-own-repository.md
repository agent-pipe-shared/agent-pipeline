---
schema: pipeline.backlog-item.v1
id: pipeline.shipped-artifacts-assume-the-pipelines-own-repository
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-15
source: "PO, 2026-08-08, consolidated findings A1 and A4 from the Claude greenfield transcript against the 0.5.4 local candidate. Both verified in code by the Elephant before filing."
---

# Shipped code and shipped skills name paths that exist only in the Pipeline's own repository

## The push route is structurally unreachable for a consumer

`pipeline-state.mjs:351`:

```js
const PUSH_THREAT_MODEL_PATH = "specs/sprint-nova-epic/implementation/critical-action-authorization-threat-model.md";
```

`approve-push` binds the proof to that document at `:5197`, through
`boundRepositoryArtifact(dir, PUSH_THREAT_MODEL_PATH)`, **before** the request,
the trust policy, or the signature is read. `specs/sprint-nova-epic/` is this
repository's own sprint directory. In any consumer project the artifact is
absent and the command fails with `CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE`.

Combined with the fail-closed default — `DEFAULT_PUSH_APPROVAL_MODE = "signature"`
(`critical-human-proof-policy.mjs:30`), returned for an absent file, an absent
key, an unparseable file, an uncommitted one, or an invalid value — a consumer
project has **no agent-side push route at all**. Not a hard one: none.

The reachable workaround is the part that makes this urgent. To get through, an
agent must write `push_approval: chat` into `pipeline.user.yaml` — a
GS-1-protected file — which is weakening the gate in order to pass it. The system
is shaped so that the only way forward is the one thing the gate-strength guard
exists to prevent.

## Four shipped skill files point at `harness/scripts/`

`harness/` does not exist in a consumer project; the plugin ships
`plugins/pipeline-core/scripts/`. The references are not incidental prose:

- `skills/close-feature/SKILL.md:5` — the **`allowed-tools:` frontmatter** names
  `Bash(node harness/scripts/pipeline-state.mjs:*)` and
  `Bash(node harness/scripts/usage-ledger.mjs:*)`. The tool permission itself
  names a path a consumer does not have, so the permission grants nothing there.
- `skills/close-feature/SKILL.md:31`, `:52`, `:59` — the commands the skill
  instructs the operator to run.
- `skills/close-block/SKILL.md`, `skills/pipeline-start/SKILL.md`,
  `skills/pipeline-start/references/failure-cases.md` — same pattern.

This is the same class as the `setup.mjs` contradiction already recorded in
`2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md`: a
shipped artifact instructing a consumer to run something only the source
checkout has. That item found one instance; this is the systematic version.

## Why these two belong in one item

They share a single cause: **artifacts that ship to consumers were written from
inside the source checkout, where the paths happen to resolve.** Nothing checks
that a shipped artifact only names paths a consumer will have. Every fix below is
worth more with that check than without it, because the class regenerates.

## Direction, not a design

1. **The threat-model binding must be resolvable in a consumer project.** Decide
   which of these it is, and say so: the document is shipped with the plugin and
   bound from the plugin root; or it is a project-supplied artifact whose path
   comes from configuration; or the binding does not apply outside the Pipeline's
   own repository. Any of the three is defensible. A hardcoded sprint path is
   none of them.
2. **No consumer-reachable state may have "weaken the gate" as its only exit.**
   Whatever (1) becomes, verify afterwards that a consumer with a valid key can
   complete a push without editing `pipeline.user.yaml`. This is the acceptance
   criterion, not the implementation.
3. **Every shipped skill names plugin-relative commands.** The `allowed-tools:`
   frontmatter first, because a wrong path there silently removes a permission
   rather than producing an error a reader can act on.
4. **Add a check that fails the build when a shipped artifact names a
   source-only path.** `harness/`, `specs/sprint-nova-epic/`, `setup.mjs` and
   `docs/` are the known prefixes. Without it, this item is a sweep that will need
   repeating; with it, the class is closed. This is the piece that matters most.

## Related

- `2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md` — the
  `setup.mjs` instance of the same class, and the push-approval default that
  makes finding 1 unreachable rather than merely awkward.
- `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`
- `docs/adr/0056-push-approval-mode.md`

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
