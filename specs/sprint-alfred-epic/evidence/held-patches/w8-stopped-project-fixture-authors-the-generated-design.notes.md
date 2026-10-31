# w8-stopped-project-fixture-authors-the-generated-design (held patch, not applied)

Cause of the red `existing-public-anchor` suite: since 5e939278b the generated staging PRD and Spec must be authored before the bootstrap binding is offered
(`stopped-project`'s `inspect` returns `design-authoring-required`). The fixture `existing-public-anchor-fixtures/stopped-project.mjs` still expected
`bootstrap-binding-required` straight after `intake-generate-apply`.

Change: after the generated plan the fixture inspects once, asserts the `design-authoring-required` action, authors the minimal PRD and Spec (one acceptance
criterion, one module, spec digest recomputed into the PRD) the way `project-onboarding-e2e.test.mjs` does, and only then asserts `bootstrap-binding-required`.
The public byte snapshot is taken after authoring, so the conservation checks still compare like with like.

Evidence (clean clone): the suite 15/15 green. Applies to the repository HEAD.
