# Explicit usage-attribution mechanism — synthetic coverage only

The D6 mechanism accepts a closed, sanitized attribution bundle containing
existing `pipeline.runner-usage.v1` envelopes. It validates the native
envelope again, checks the supplied event digest, class, provenance kind and
provenance digest, and emits bounded aggregate metrics only. It does not read
transcripts, crawl a transcript root, contact a provider, calculate a price,
or derive token allocation from turn or tool-call counts.

The focused unit and CLI suites use synthetic envelopes and sanitized fixture
bundles. They exercise observed metric aggregation, unknown and unavailable
cells, whole-event mixed/unknown handling, duplicate suppression and conflict
rejection, task-digest mismatch, duplicate runner rejection, aggregate-scope
rejection, malformed embedded-envelope rejection without source-identity
inspection, selected-file CLI handling, and legacy CLI modes.

There is no actual two-runner, same-task bundle pair in this evidence. The
mechanism therefore records `insufficient-runner-coverage` for one bundle and
does not claim a real two-runner execution. A matching supplied task digest
only permits a side-by-side display when coverage and route binding permit it;
it does not attest that work was equivalent. Attribution labels, raw envelopes,
and their source/provenance hashes are supplied inputs rather than independent
authenticity proof. They do not prove that an event was administration or
product work, and native metrics remain
same-runner-only rather than causal or cross-model cost equivalence.

Tool-call and elapsed-time cells remain unavailable because the admitted event
envelopes contain neither tool-use measurements nor exclusive time intervals.
No raw envelope, source path, thread identifier, dispatch identifier, or
provider payload is emitted by metering output.
