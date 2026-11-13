fix(security): keep the Semgrep language pack quiet on checked and harmless code

False-positive probes against the new pack, each one a pattern that would
otherwise block ordinary new code under ADR-0093:

- path traversal: the sink is the file ACCESS, not the building of a path;
  the containment check the messages recommend (normalized or real path
  checked with startsWith / StartsWith / HasPrefix / start_with? /
  is_relative_to / commonpath) cleans the value. PHP matches "used after
  an if whose condition tests it", because the common
  "$real === false || !str_starts_with(...)" defeats a side-effect
  sanitizer at the ||; Kotlin treats URL(...)/URI(...) as not a path
- request sources skip parameters that cannot carry ../ or a host name:
  numbers, flags, UUID/Guid, dates, CancellationToken (Java, Kotlin, C#)
- JS: req.file/req.files are no source (the upload middleware's own temp
  path); res.sendFile/download with a root option is no sink
- PHP: 'verify' => false counts only as an HTTP client option (Guzzle,
  Laravel Http), not in any array
- Kotlin SSRF: the untyped $C.get($U) sink is gone (repo.get(id));
  OkHttp Request.Builder().url($U) added
- Java XXE: hardening in a constructor counts ($C(...) matches both), and
  IS_SUPPORTING_EXTERNAL_ENTITIES false or ACCESS_EXTERNAL_DTD "" count as
  hardening; Kotlin accepts ACCESS_EXTERNAL_DTD; the Java
  ObjectInputFilter exception also covers constructors
- the quiet fixtures carry each probe; every rule still fires on hits.*

Test controls (semgrep-default-rules.test.mjs, 180/180):
- the test-shaped copies prove they were scanned: weak-crypto (WARNING,
  no exclude) fires in each; Semgrep's own default ignore already skips
  test/, tests/ and *_test.go entirely, so those names are not used
- a project that itself lives under tests/ keeps every Java ERROR rule
  (the excludes anchor to the scanned root)

semgrep-baseline.test.mjs: the real chain with the shipped pack. A Java
controller with an older path-traversal finding that the feature moves,
plus a feature-introduced SSRF finding in the same file: exactly the new
one blocks, the two passes agree, no worktree is left.

AI-Assisted: true
Dispatch: stage-0 (elephant)
