---
schema: pipeline.backlog-item.v1
id: pipeline.sed-regex-address-is-misread-as-an-absolute-path
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: nova
source: "Live refusal in an Elephant session, 2026-08-27, isolated to a root cause by controlled probe in the same session."
---

# A `sed` regex address is misread as an absolute path, refusing an in-root edit as a cross-repository mutation

## Description

`sed -i '/^alpha/d' scratch/sedprobe.txt` — a relative target inside the
session's own project root, in the directory the bootstrap skill designates for
temporary files — is refused with:

```
BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-CROSS-REPO-MUTATION:
A governed consumer session may write only inside its own physical project root.
```

**Root cause, isolated by controlled probe rather than inferred.** The trigger is
a sed script that *begins with a `/`* — that is, an ordinary regex address such
as `/^alpha/d`. It is being read as an absolute filesystem path, and an absolute
path is by definition outside the project root, so the cross-repository
classifier fires on the sed EXPRESSION instead of on the actual target file.

The discriminating pair, same file, same session, seconds apart:

| command | result |
| --- | --- |
| `sed -i '/^alpha/d' scratch/sedprobe.txt` | **refused**, GUARD-CROSS-REPO-MUTATION |
| `sed -i '1d' scratch/sedprobe.txt` | admitted, file edited |

A first hypothesis in the same session — that an embedded `;` separating two sed
expressions was the trigger — was **disproved** by the first row above, which has
no `;`. Recorded because the wrong hypothesis is the cheaper one to re-form.

Also admitted today, consistent with the diagnosis (none begins with `/`):
`sed -i 's|…|…|' <file>`, `sed -i '43s/…/…/' <file>`, `sed -i '158,244d' <file>`.

## Why this matters

The offered recovery is the full signed human-guard-override ceremony — a live
PO signature — for editing a gitignored scratch file with the most ordinary sed
expression there is. A session that hits this either burns a signature on
nothing or, as happened here, silently switches tools.

The sharpest evidence that the classification is simply wrong: **the identical
path was written successfully through the Write tool in the same session,
seconds later.** The target was never out of root; only the expression looked
like a path.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
  (`isForbiddenCrossRepositoryMutation` and the argv-to-target resolution that
  feeds it — a `sed` operand that is an expression, not a path, must not be
  resolved as one)

## Proposal

Not designed here. `sed`'s own grammar already distinguishes the script operand
from file operands (the first non-flag argument is the script unless `-e`/`-f`
is used), so the resolver has enough information without heuristics on the
leading character.

## Acceptance

- Both rows of the table above are admitted, and the file is actually edited.
- `sed -i '<script>' /etc/passwd` and any other genuinely out-of-root FILE
  target is still refused under the same code.
- A regression test pins the discriminating pair, so a future resolver change
  cannot silently reintroduce expression-as-path classification.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
