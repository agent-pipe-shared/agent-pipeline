# Release scope — Nova interim operational candidate

This is the release scope record `specs/sprint-nova-epic/spec.md` §1.1
requires for the interim candidate built from the exact `v0.5.0` base: "The
candidate has its own commit/tree, release scope record and fresh focused
tests, Full Verify, Security, release preflight and independent
delta-correct Critic evidence."

## Base and candidate commits

- Base commit: `1b467f98` (`1b467f982490e19b412cfd23b176e21fe871f34c`).
- Enumerated candidate commits (chronological, oldest first, as reported by
  `git rev-list --reverse 1b467f98..HEAD` and cross-checked against the
  fresh `dispatch-authorship-verify` run below; ending with this dispatch's
  own stamp commit): `0d63a3f2, f3ac7cfd, 6a1a5514, d4d8843d, ef0ec784,
  1a757618, 2a4968cc, 89a07b2c, 57821c91, 0aaeb881, e9bd4a23, 0e9f82fb,
  3475322b, 41967fd3, 5abaa442, 75f96504, a50e259e, 1f0abff3`.

The candidate's tip is this document's own commit — the one that carries
this refresh, `docs(release-scope): refresh candidate enumeration and
authorship after the version stamp`. The candidate's **binding** commit and
tree — the exact object identities a release preflight artifact fixes and a
signature is later computed over —
are carried by the release preflight artifact itself
(`evidence/gate-release-preflight.json`, generated via
`plugins/pipeline-core/scripts/release-preflight-cli.mjs`). That artifact is
generated once the branch tip is final, which it is not while this dispatch
runs. This document therefore deliberately does **not** freeze a commit/tree
pair of its own; the enumerated commit list above is not a substitute for
that binding.

## Declared deviation

Five of the touched files appear nowhere in the bound spec
(`specs/sprint-nova-epic/spec.md`), so no per-artifact acceptance criterion
exists for any of them individually:

- `plugins/pipeline-core/scripts/push-prepare.mjs`
- `plugins/pipeline-core/scripts/push-prepare.test.mjs`
- `project/critical-human-proof.json`
- `.claude/settings.json`
- `docs/push-release-flow.md`

They nonetheless fall inside §1.1's declared slice, quoted verbatim: "Its
slice is limited to separable operational happy-path, authorization and
Critic corrections, plus the following Phoenix-reported recovery defect."
The deviation is exactly this: the slice clause covers these five files at
the **slice level** (they are separable operational/authorization/Critic
correction work), while **no acceptance criterion covers any of them
individually** — §1.1 enumerates only the Phoenix lifecycle-guard recovery
defect (items 1–3) as individually-checked content. This deviation is stated
here, not argued away, and no spec coverage beyond the slice-level clause is
claimed for these five files.

## Authorship

Machine output of `node plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs --range 1b467f98..HEAD`, re-run fresh by this dispatch (`NVA-STAMP-1`):

```
FAIL         1f0abff3983b record-not-terminal: record outcome `in-progress` is not terminal
PASS         a50e259e1868 bound: bound to `NVA-BL-FILE-1` (outcome `success`, 3 path(s) covered)
PASS         75f965044200 bound: bound to `NVA-BL-FILE-1` (outcome `success`, 4 path(s) covered)
PASS         5abaa4420a28 bound: bound to `NVA-CFIX-2` (outcome `success`, 2 path(s) covered)
PASS         41967fd3be76 bound: bound to `NVA-CFIX-1` (outcome `completed-with-open-item`, 2 path(s) covered)
PASS         3475322b8570 elephant-direct-declared: declared Elephant-direct (`stage-0 (elephant)`) in the sanctioned form, 1 path(s), within the stage-0 bound of 10; no dispatch record expected. "Disclosed" and "judgment-light" stay unchecked
PASS         0e9f82fb72af bound: bound to `NVA-PP-FIX` (outcome `committed-verify-in-flight`, 2 path(s) covered)
UNVERIFIABLE e9bd4a238a08 elephant-direct-undeclared: no `Dispatch:` trailer — unbound to any record; a stage-0 Elephant commit should declare `Dispatch: stage-0 (elephant)`
UNVERIFIABLE 0aaeb8811e56 elephant-direct-undeclared: no `Dispatch:` trailer — unbound to any record; a stage-0 Elephant commit should declare `Dispatch: stage-0 (elephant)`
PASS         57821c91e45d bound: bound to `NVA-PUSH-CD` (outcome `completed-with-open-item`, 2 path(s) covered)
PASS         89a07b2c0249 bound: bound to `NVA-PLUGIN-PRECEDENCE` (outcome `completed-with-open-item`, 2 path(s) covered)
PASS         2a4968ccc927 bound: bound to `NVA-PUSH-PREPARE` (outcome `completed-with-open-item`, 3 path(s) covered)
PASS         1a757618133e bound: bound to `NVA-LEDGER-B` (outcome `truncated-work-complete-report-missing`, 4 path(s) covered)
PASS         ef0ec7844c50 bound: bound to `NVA-LEDGER-B` (outcome `truncated-work-complete-report-missing`, 3 path(s) covered)
UNVERIFIABLE d4d8843da0b0 elephant-direct-undeclared: no `Dispatch:` trailer — unbound to any record; a stage-0 Elephant commit should declare `Dispatch: stage-0 (elephant)`
UNVERIFIABLE 6a1a55142090 elephant-direct-undeclared: no `Dispatch:` trailer — unbound to any record; a stage-0 Elephant commit should declare `Dispatch: stage-0 (elephant)`
PASS         f3ac7cfd0580 bound: bound to `NVA-BLDRIFT-02` (outcome `truncated-work-complete-report-missing`, 3 path(s) covered)
UNVERIFIABLE 0d63a3f2ed22 elephant-direct-undeclared: no `Dispatch:` trailer — unbound to any record; a stage-0 Elephant commit should declare `Dispatch: stage-0 (elephant)`
```

`41967fd3` — previously flagged in this document as a transient `FAIL
record-not-terminal` — now reports `PASS bound: bound to NVA-CFIX-1` in the
fresh run, because `evidence/dispatch-record-NVA-CFIX-1.json` reached a
terminal outcome (`completed-with-open-item`) since that entry was written.
The `FAIL record-not-terminal` in the fresh run instead names
`1f0abff3983b`, this dispatch's (`NVA-STAMP-1`) own commit-1 stamp commit:
`evidence/dispatch-record-NVA-STAMP-1.json` still read `outcome:
"in-progress"` at the moment this command ran, ahead of this dispatch's own
closing act. This is the same expected-and-transient pattern the document
previously described for `41967fd3`, now recurring for this dispatch's own
commit.

Five commits are classified `elephant-direct-undeclared`
(`0d63a3f2`, `6a1a5514`, `d4d8843d`, `0aaeb881`, `e9bd4a23`) — Elephant-direct
commits that predate the adoption of the `Dispatch: stage-0 (elephant)`
trailer in this branch. Their history cannot be corrected — rewriting
history is forbidden by this repo's hard rules — so they stay
`UNVERIFIABLE`, permanently, by design; the trailer is used going forward
for every new stage-0 Elephant commit.

## Owed evidence

`evidence/gate-release-preflight.json` currently binds candidate
`ad2452df` (`preflightId: "nova-0-5-2"`) from an earlier release, **not**
this candidate. §1.1's release-preflight evidence requirement is therefore
outstanding for this interim candidate and must be regenerated against the
final tip via `plugins/pipeline-core/scripts/release-preflight-cli.mjs`.
This is stated as owed, not run here: the tip is not final while this
dispatch runs.
