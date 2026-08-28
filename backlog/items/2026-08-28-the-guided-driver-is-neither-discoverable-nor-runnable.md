---
schema: pipeline.backlog-item.v1
id: pipeline.guided-driver-neither-discoverable-nor-runnable
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — the guided driver is refused by the readiness guard in every state it exists to serve, and named by nothing an agent reads. Every chaining improvement built this session is inert in practice until this lands."
source: "PO question 2026-08-28: 'ist sichergestellt, dass die agenten überhaupt diesen driver jeweils sofort finden und ihn nutzen müssen?' Measured by scratch/verify-driver-reachable.mjs against a governed fixture with an injected readiness denial."
---

# The guided driver is neither discoverable nor runnable

## The measurement

```
                           driver     inspect    control (`touch output.txt`)
portable-seed-required     REFUSED    ADMITTED   refused
kickoff-required           REFUSED    ADMITTED   refused
intake-required            REFUSED    ADMITTED   refused
migration-required         REFUSED    ADMITTED   refused
partial                    REFUSED    ADMITTED   refused

preflight nextAction: [project-onboarding-v3.mjs, inspect, --root, …, --intent, bootstrap]
"onboarding-init" appears anywhere in the whole preflight result: false
```

Refusal: `GUARD-LIFECYCLE-NOT-READY`.

The control matters. A first run of this harness reported the driver ADMITTED everywhere —
because the fixture carried no governance marker, so the guard failed open by design and
admitted `touch output.txt` too. The numbers above are from a governed fixture where the
control is correctly refused.

## What this means

**1. Not runnable.** `guard-lifecycle-ready.mjs` resolves sanctioned lifecycle commands by
script identity and knows exactly one onboarding script, `project-onboarding-v3.mjs`
(`ONBOARDING_SCRIPT`). `onboarding-init.mjs` is not in that set, so the guard refuses it —
in precisely the non-ready states the driver exists to walk out of. An agent that somehow
learned of the driver still could not run it.

**2. Not discoverable.** The string `onboarding-init` appears nowhere in the skills, the
preflight, or `docs/`. Repository-wide it occurs in exactly two files, both internal:
`harness/scripts/verify.mjs` (suite registration) and
`harness/scripts/apply-pending-protected-edits.mjs`. The bootstrap's own returned
`nextAction` — the one the `pipeline-start` skill instructs an agent to execute verbatim —
names the turn-by-turn `inspect` the driver was built to replace.

**3. Therefore the chaining work is inert.** Rounds F and H made all seven plan builders
publish `nextAction` and taught the driver to re-anchor after a silent apply success. The
measured result was a fresh project reaching `ready` in five driver invocations instead of
seven, with zero repair subcommands. **No agent will ever see that**, because no agent is
pointed at the driver and none could run it if it were.

## Why "must use it" is the actual requirement, not "may"

The PO's question was two-part, and the second half is the important one: *are agents
required to use it*. A driver an agent may optionally discover is the same fork-with-no-
marker defect this sprint has already filed twice — the agent picks, and picks wrong. The
onboarding CLI's 31 subcommands remain individually admitted and individually reachable, so
an agent that never hears of the driver walks them by hand exactly as before, and nothing
tells it that is the slower path.

## Direction

1. **Admit the driver narrowly.** Add its script identity alongside `ONBOARDING_SCRIPT`,
   with an exact argv shape — `--root <root>` plus the optional `--runner <r>` and
   `--step-cap <n>` it actually accepts, and nothing wider. The driver is read-only in
   itself; every mutating step it chains is a separately-admitted command the guard already
   evaluates on its own terms, so admitting the driver grants no authority the guard does
   not already grant step by step.
2. **Point the bootstrap at it.** The preflight's returned `nextAction` for a non-ready
   project should name the driver, not the first `inspect`. That is the one place the skill
   already instructs an agent to execute verbatim, so it is where discovery has to happen —
   documentation an agent may not have loaded is not a fix.
3. **Say it in the skill.** `pipeline-start`'s step 1 currently describes executing the
   `inspect` action. It should describe the driver as the way the chain is walked, with the
   individual subcommands as what the driver calls rather than what an agent calls.

## Acceptance criteria

- The driver is admitted at every non-ready readiness status, in its exact argv shape and
  no wider one. A test asserts both halves, with a refused control so a fail-open fixture
  cannot pass it.
- The bootstrap preflight's own `nextAction` names the driver for a project that is not
  ready.
- A test asserts the property rather than the string: whatever command the bootstrap names,
  that command is admitted by the readiness guard. The two must not be able to diverge —
  this repository has already been bitten by a refusal naming a command the guard refused.
- The `pipeline-start` skill describes the driver as the route.

## Related

- `2026-08-28-a-plan-result-publishes-no-next-action-so-the-guided-chain-stalls.md` — the
  chaining work this makes reachable.
- `2026-08-28-a-blind-session-gets-zero-followable-steps-on-the-feature-and-push-path.md` —
  the same "one published route, not a menu" property, on the other path.
- `2026-08-28-the-readiness-guard-blocks-the-recovery-command-it-names.md` — the precedent
  for the divergence this item's third acceptance criterion closes mechanically.
