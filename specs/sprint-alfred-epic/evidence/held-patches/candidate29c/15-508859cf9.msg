fix(critic-preflight): find the feature package of a Spec kept in its earlier dated folder

Glossover K-30 (2026-11-13, before the first Epic 2 Critic round): the
feature id changed after the design, so the approved Spec stays in its
dated specs/ folder while the package lives at specs/<feature id>/ and
binds it (28e carry; K-25 fixed the criterion and the briefing). The
Critic dispatch preflight still took the feature id from the Spec's
folder name, looked for specs/<dated folder>/lifecycle.json and found no
package: with the course flags a bare CDP-COURSE-CONTEXT ("Course context
requires a registered feature package"), without them a generic batch
the feature close does not read as its course.

- packageFeatureIdForSpec: the folder name when that folder holds the
  package; otherwise the course context's feature id, then the active
  feature id of the project state, then the one package at the candidate
  whose manifest binds exactly this Spec path. None or several keep the
  folder name; nothing is guessed. The review unit's bound Spec path
  stays the binding check.
- Used by the course branch, the derived registration commit, the CLI
  course context and the rigor read. The state is read through the
  read-only authority module (the preflight's import closure stays free
  of write APIs, CDPF086).
- Test: a dated-folder Spec with its package under the feature id admits
  round 1, with the course context and through the CLI form.

Checkpoint-Intent: candidate 29c, Glossover K-30
AI-Assisted: true
Dispatch: stage-0 (elephant)
