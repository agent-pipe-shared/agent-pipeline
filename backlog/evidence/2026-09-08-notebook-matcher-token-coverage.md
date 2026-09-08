# Notebook matcher token-coverage repair blocked at TP-10

The current NB02 failure is a test-classifier misclassification, not a
runtime NotebookEdit defect. Its substring predicate treats the attended
dispatch advisory matcher `Task|Agent|Workflow|TodoWrite` as a file-write
registration because `TodoWrite` contains `Write`.

The actual file-write registrations already declare the exact tokens
`Edit|Write|NotebookEdit`. NB03 through NB08 remain green in the preserved
terminal capture, including the real NotebookEdit admission and target-path
guards.

The required repair is test-only: split each declared matcher on `|`, classify
only exact `Edit`, `Write`, or `NotebookEdit` tokens, retain the count floor,
and add regressions showing that an `Edit|Write` registration without
NotebookEdit fails while TodoWrite alone has no obligation.

The protected test path refused the change as TP-10 and supplied only an
external signed Author-Repair route. No test or runtime source was changed.
The exact review patch and the read-only plan's operator prerequisites are
preserved in `scratch/NVA-B-GATE-NOTEBOOK-MATCHER-1/proposed.patch` and
`scratch/NVA-B-GATE-NOTEBOOK-MATCHER-1/operator-author-repair-plan.md`.
Capture: `scratch/NVA-B-GATE-NOTEBOOK-MATCHER-1/notebook-coverage-pre-author-repair.txt`
(`node --test plugins/pipeline-core/hooks/notebook-write-coverage.test.mjs
harness/scripts/check-consumer-safe-paths.test.mjs`, exit 1). The consumer
suite passed; NB02 was the sole failure.
