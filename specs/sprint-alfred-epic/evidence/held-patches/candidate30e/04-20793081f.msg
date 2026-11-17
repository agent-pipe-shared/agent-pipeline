fix(architecture): fitness class 1 does not count the Pipeline's own records as module paths

Class 1 (module identity and path ownership) reported a `finding` when a candidate
carried the Pipeline's own records, which no module owns: evidence and lifecycle files,
result files, the pipeline state files, audit bundles (first Antigravity greenfield run,
close of a feature in the feature profile). Those paths, as the shared record-only
and bundle predicates define them, are skipped like scratch/, .git/ and Markdown
already were; every other path outside a module is still a finding. Test added in the
class 1 group of architecture-fitness.test.mjs.

AI-Assisted: true
Dispatch: stage-0 (elephant)
