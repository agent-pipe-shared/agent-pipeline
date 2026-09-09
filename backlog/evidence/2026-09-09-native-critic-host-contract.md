# Native Critic host contract evidence

`NVA-B-NATIVE-CRITIC-HOST-1` adds a separate native-only Critic consumer.
Source records bind candidate blob/current bytes. Generated evidence binds its
current JSON bytes and exact root or nested candidate commit/tree, so it need
not be candidate-tracked. The host binds the canonical ordered record digest.

The additive suite's default-observer fixture creates a disposable Git repo,
commits a source reference, writes ignored candidate-bound evidence, and uses
a fake CLI with only proc/mount observations injected. It passed 9/9 and
rejected wrong repository fingerprint, changed source, stale evidence, and an ancestor symlink. No live
native Critic/provider execution is claimed. The shared prohibited-feature
vector is dynamically consumed (currently 18 entries).
