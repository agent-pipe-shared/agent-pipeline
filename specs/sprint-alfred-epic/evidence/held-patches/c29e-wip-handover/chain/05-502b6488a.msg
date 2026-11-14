docs(canon): state the ADR-0101 stage-0 fast path and retire "Tier-0"

EL-01's exception in roles/elephant.md, operating-model §3.3 and the
definition-of-done pointer now state the stage-0 fast path of ADR-0101:
any rigor, at most 3 files and 60 changed lines, one concern, at most 25
lines of production logic, tests and pins allowed except a test that
checks the Elephant's own new logic, affected tests green, trailer
Dispatch: stage-0 (elephant). The DoD pointer no longer equates the fast
path with rigor 0.

The bootstrap confirmation line said "Tier-0", a word nothing defined;
it now says "stage-0 fast path" in roles/elephant.md, the bootstrap
protocol, the bootstrap check template and the role-prohibitions
generator. The agent-obligations generator states the new caps.
Regenerated: agent-obligations.md, the pipeline-start role block and the
vendored canon copies.

AI-Assisted: true
Dispatch: stage-0 (elephant)
