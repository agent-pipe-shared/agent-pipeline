# ADR distribution, version, and language Governs coverage

**Scope:** NVA-B-ADR-GOVERNS-LAYOUT-2 adds bounded `**Governs:**` headers to
ADR-0001, ADR-0002, and ADR-0011. It does not alter the accepted decision,
status, addenda, translations, runtime, or reconciliation checker.

## Declared paths and source basis

### ADR-0001 — distribution and marketplace

- `.claude-plugin/marketplace.json` is the current marketplace registration:
  its sole `pipeline-core` entry points at `./plugins/pipeline-core` and
  declares the committed marketplace binding.
- `plugins/pipeline-core/.claude-plugin/plugin.json` is the shipped Claude
  plugin descriptor and contains the installed plugin's versioned identity.
- `setup.mjs` is the current public binding producer: its generic marketplace
  projection writes `agent-pipeline` and `pipeline-core@agent-pipeline`, while
  its setup output names the project-scope refresh sequence from the addendum.
- `plugins/pipeline-core/hooks/staleness-check.mjs` is the SessionStart
  detect-and-prompt implementation named by the addendum; it observes update
  availability without applying an update.
- `harness/session-bootstrap.md` is the existing documented refresh ritual,
  including the project-scope update and reload sequence cited in ADR-0001.

The historical per-project `.claude/settings.json` binding is intentionally
not declared: this public-core checkout does not carry a project-specific
binding as an owned, tracked target. The five declarations above are the
current public registration, producer, observer, and operation paths proven
in this checkout; no renamed-successor claim was needed.

### ADR-0002 — SHA then SemVer

- `.claude-plugin/marketplace.json` declares the source without a version pin
  and states that a refresh propagates each commit, which is the current SHA
  phase representation.
- `plugins/pipeline-core/.claude-plugin/plugin.json` supplies the current
  plugin `version` field used once a packaged version is present.
- `plugins/pipeline-core/scripts/ruleset-freshness.mjs` reads loaded version
  and commit identity, resolves the configured update channel, and selects
  SemVer tag targets for stable or beta channels before comparing the loaded
  distribution with the marketplace.

These are the bounded current paths implementing the two phases. No generic
plugin glob and no private project binding is declared.

### ADR-0011 — public English canon and private operator language

- `README.md`, `SETUP.md`, `docs/overview.md`, and `docs/usage.md` are the
  four explicit public front doors named in ADR-0011's decision.
- `plugins/pipeline-core/lib/po-gate-authority.mjs` is the repository-scoped
  authority that validates the `language.human_facing` projection and keeps
  machine fields separate from operator-facing language.
- `plugins/pipeline-core/scripts/po-gate-profile-repair.mjs` is the bounded
  project-side route for changing that `language.human_facing` value; its
  module contract explicitly says it never changes the Public Core's English
  canon.

No broad `docs/**` declaration was added. The ADR's reviewer-matrix sentence
does not identify a single additional current checker path in the examined
scope, so this coverage leaves that unproven target open rather than inventing
one.

## Verification

`node scratch/NVA-B-ADR-GOVERNS-LAYOUT-2/check.mjs` was captured through
`capture-evidence.mjs` at
`scratch/NVA-B-ADR-GOVERNS-LAYOUT-2/governs-layout-final.txt` with exit code
0. The machine-written result imports the actual
`parseGovernsGlobs` parser, verifies every declared target exists and is
tracked, and compares each current ADR byte-for-byte with `HEAD` after removing
its one inserted header. It reported 5, 3, and 6 declared targets for
ADR-0001, ADR-0002, and ADR-0011 respectively, with `bodyPreserved: true` for
all three.
