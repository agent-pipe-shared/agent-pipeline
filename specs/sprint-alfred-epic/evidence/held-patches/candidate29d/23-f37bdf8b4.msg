feat(guard): run a committed tools/checks script in design draft (ADR-0098)

Glossover (G3): the design course asks for deterministic checks before
binding, but in draft the dev-plan gate read every `node <script>` as an
opaque script run, so each project check was refused in the phase that
asks for it.

PO tile 2026-11-13, "fixed locations": `node tools/checks/<name>.mjs
[args]` (also .cjs/.js) is no opaque run when the file sits directly in
tools/checks/, no path part is a link, git tracks it and it is unchanged
against HEAD. In draft the gate refuses the agent's own edit there, so
such a script is reviewed project content. An edited, untracked, linked
or misplaced script stays a refused write (pin C29-G3).

ADR-0098 records this and the evidence/ place of the unpublished review
original (G4), with register entry D250, the ADR index, the
doc-governance registration and the design-course reference.

AI-Assisted: true
Dispatch: stage-0 (elephant)
