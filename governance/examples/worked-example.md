# Worked example: dependency direction, from guideline to enforced rule

> Agent-facing fixture content (English, adjacent-to-fixture-directory convention). Walks
> ONE pattern — **dependency direction** — through both governance modes, end to end.
> Fictional module names throughout (`core/`, `features/`); not a real project's layout.

## The pattern

[`guidelines/architecture-guidelines.md`](guidelines/architecture-guidelines.md) item 2:

> **Dependency direction** — dependencies point from concrete/volatile modules toward
> stable/abstract ones; a stable core module must never import from a feature module.

For this example: `core/` is the stable module, `features/` is the volatile one. The
rule to enforce, in both modes below, is the same: `core/` must never import from
`features/`.

## Mode (a): advisory

In advisory mode the pattern above stays exactly what it is — a numbered guideline. It
is consumed two ways:

- **The planner/Elephant**, during design: if a plan intentionally has `core/` depend on
  something under `features/` (a real case exists — a shared piece hasn't been extracted
  yet, or a short-lived spike needs it), the plan artifact (dev-plan/PRD) MUST name that
  decision explicitly, e.g. *"`core/pricing.ts` imports `features/promo/discount.ts`
  because the discount logic hasn't been extracted to `core/` yet — tracked in backlog
  item X"*. A named, justified deviation is expected input to the plan, not a violation.
- **The Critic**, during review: the guideline is a review benchmark. If the diff shows a
  `core/` → `features/` import that the plan artifact does NOT mention, the Critic flags
  that — the UNDOCUMENTED deviation is the finding, never the import itself. A deviation
  that IS named and justified in the plan is not, by itself, a finding.

**What does NOT happen:** no gate blocks. Advisory mode has no machine check —
`verify` does not look for this pattern, and the security-scan gate does not run this
rule while the pattern is only a guideline. An unjustified `core/` → `features/` import
does not stop `push` by itself; it becomes Critic-review input, disposed of the same way
any other finding is (fix it, or an explicit accepted-risk call) — advisory governance
never short-circuits the gate chain on its own.

## Mode (b): enforcing

The same pattern, promoted to a machine-checked policy. The concrete rule is
[`policies/semgrep/dependency-direction.yml`](policies/semgrep/dependency-direction.yml):

```yaml
rules:
  - id: core-must-not-import-features
    languages: [javascript, typescript]
    severity: ERROR
    message: >
      A module under `core/` imports from `features/` -- this violates the
      dependency-direction guideline (architecture-guidelines.md item 2): stable/abstract
      modules must never depend on concrete/volatile ones. Invert the dependency (move
      the shared piece into `core/`, or introduce an interface/port that `features/`
      implements) instead of importing the feature module directly.
    patterns:
      - pattern-either:
          - pattern: import $X from "features/$PATH"
          - pattern: import "features/$PATH"
          - pattern: require("features/$PATH")
    paths:
      include:
        - "core/**"
    metadata:
      category: best-practice
      references:
        - governance/examples/guidelines/architecture-guidelines.md
        - governance/examples/worked-example.md
```

**Wiring.** A project's `.claude/pipeline.yaml` points the security scanner at the
directory this rule file lives in — this repo's own manifest already does exactly that:

```yaml
security:
  scanners:
    semgrep:
      enabled: true
      rules_dir: governance/examples/policies/semgrep
```

Dropping `dependency-direction.yml` into `rules_dir` is the entire activation step — no
other wiring is needed; the security-scan phase's semgrep scanner loads every rule file
found in that directory in addition to its own default ruleset.

**What now blocks.** The security-scan gate is a blocking, automated gate (operating-model
§4.1). Semgrep runs `dependency-direction.yml` against the changed code on every scan; an
`ERROR`-severity match is a finding, and the gate fails — the change cannot merge until
the import is removed/inverted, or the rule itself is deliberately edited (a real,
reviewed change to policy content, not a bypass).

**What the developer sees.** The same shape as any other semgrep finding: file, line, the
rule id (`core-must-not-import-features`), and the message above — surfaced in the
security-scan gate's failure output, before the change reaches merge.

## Gate-honesty (hard, no overclaim)

- Guidelines never block anything by themselves. Everything in Mode (a) above is
  advisory input to a plan and a review benchmark — it does not fail a gate, ever, on its
  own.
- The semgrep rule matches code FORM, not architecture. It catches exactly the import
  patterns enumerated in `patterns:` (`import ... from "features/..."`,
  `import "features/..."`, `require("features/...")`) inside files scoped by
  `paths.include: core/**`. It does **not** prove the dependency-direction principle
  holds project-wide: a re-export, a dynamically constructed import path, or a violation
  in a file outside `core/**` is not caught. Passing this rule is evidence of the
  ABSENCE of the enumerated pattern in the scoped files — not proof of correct
  architecture.
