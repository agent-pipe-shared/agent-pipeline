---
schema: pipeline.backlog-item.v1
id: pipeline.read-only-guard-admits-execution-and-output-options
type: defect
owner: pipeline
status: open
created: 2026-09-30
source: "Independent security critique of the proposed external passive-read repair; existing guard source examined before mutation."
sprint: alfred
done_when: manual
---

# Close execution and output options in the passive-read guard

The current single-command `rg` branch accepts arbitrary flag operands. In
particular, `rg --pre=...` invokes a preprocessor. The `node --test` branch
admits any flag, including `--test-reporter-destination=...`, and the Git
`diff`/`log`/`show` classification accepts unrestricted subarguments such as
`git diff --output=...`. Such commands must not enter a read-only admission
lane merely because their executable usually reads data. The observed source
path is `hooks/guard-lifecycle-ready.mjs`; bounded pipeline parsing in
`hooks/guard-command-grammar.mjs` must agree.

## Acceptance

- Use command-specific closed argument grammars. Explicitly classify source
  operands, output destinations and executable options. No output or executable
  option is accepted by a passive read lane.
- Cover single commands, shell chains and supported pipelines, plus native
  Read/Grep/Glob and PowerShell forms. An external user Markdown report remains
  readable under the PO's read-only host-path decision.
- Deny direct and aliased PO signing keys and declared credential roots through
  every read lane. Test symlinks, `..`, `~`, Windows drive spelling and directory
  scans, since a directory Grep can reach secret descendants.
- An independent security Critic inspects the final diff and runs concrete
  mutation/execution negative probes before candidate acceptance.

## Triage

The first prepared passive-read patch was rejected by an independent Critic
because it explicitly admitted `~/.ssh/id_rsa` and left these existing command
option holes open. The patch must not be signed or applied as-is.

## Evidence 2026-10-04 (code reading, prework W1-3, not probed)

- The git read-only option denylist matches exact spellings, while git accepts
  abbreviated long options, so an abbreviated spelling of a denied option passes.
- `git fetch` is admitted wholesale, including `--upload-pack`, which executes a
  program.
- `-C <dir>` is uncontained: it redirects the command to any directory.
- `git config` is unscreened.

These belong to the R2 work package (W1-5) and to the closed-grammar acceptance
above; verify with synthetic fixtures only.
