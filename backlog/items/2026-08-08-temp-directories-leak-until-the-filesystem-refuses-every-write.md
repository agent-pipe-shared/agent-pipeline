---
schema: pipeline.backlog-item.v1
id: pipeline.temp-directories-leak-until-the-filesystem-refuses-every-write
type: defect
owner: pipeline
status: closed
closed_at: "2026-08-19"
closure_repository: self
closure_commit: 1b6e6a606ffcd6f32c3993b73be1110d3eb299af
closure_evidence: backlog/items/2026-08-08-temp-directories-leak-until-the-filesystem-refuses-every-write.md
created: 2026-08-08
due: 2026-08-15
source: "Observed live on 2026-08-08: the tmpfs inode table on the PO's machine was exhausted, blocking every process that needed to create a file. Diagnosed jointly with the PO from df/mount output during the 0.5.4 candidate run."
---

# Temp directories leak until the filesystem refuses every write

## What happened

Work stopped mid-session with `ENOSPC` on every write — including the harness's own
tool-output files, so no command could run at all. Not from the repository: from
`/tmp`, which on this machine is a `tmpfs` mounted with `nr_inodes=1048576`.

The measurements, in the order taken:

| Check | Result | What it ruled out |
|---|---|---|
| `df -h /` | 1007G size, 17G used, **2%** | the physical disk |
| `df -h /tmp` | 16G size, 3.2G used, **21%** | tmpfs *volume* |
| `df -i /` | 338997 / 67108864, **1%** | root inodes |
| `df -i /tmp` | 1048576 / 1048576, **100%** | **this is it** |
| `ls /tmp \| wc -l` | 34350 | scale |

Essentially every entry was a directory named `actions-permissions-<random>`.

State the failure mode plainly, because it is much larger than "some test litter":
once the inode table is full, **no process on the machine can create a file**, while
every ordinary capacity check reports the filesystem as 21% used. Someone looking at
`df -h` sees nothing wrong. Three of the four checks above are reassuring and only the
fourth is true.

## Why it was never noticed

The PO's own observation, and it is the important part: `tmpfs` lives in RAM, so a WSL
restart empties `/tmp` completely. **The only cleanup mechanism this leak has ever had
is a reboot.** Two days without one was enough to fill a million inodes.

A defect that a restart silently repairs is not a small defect. It is a well-hidden
one, and the population it hides from is exactly the one that cannot afford it:
anything that does not reboot — CI, a build server, a long-lived session, a container
— hits a hard write-stop with no warning and a misleading `df`.

## Which producer — and how sampling one prefix produced a wrong answer twice

An age-filtered cleanup (`-mmin +2880`, older than 48 hours) reclaimed only **2833
inodes**, so the mass was created *inside* the last two days.

The first analysis then counted `actions-permissions-*` alone, found ~700 of them from
2026-08-08, compared that against ~33000 total entries, and concluded that this
repository's Verify was **not** the main producer. That conclusion was wrong, and the
error is worth keeping on the record because it is cheap to repeat: `actions-permissions`
merely sorts first alphabetically, and `ls | head -40` shows nothing else.

Listing `/tmp` excluding that one prefix shows the rest are this repository's own test
fixtures, across many prefixes — `critic-dispatch-preflight-`, `pr-contributor-gates-`
(with `-trusted` and `-realscan` variants), `pr-gate-real-scan-bin-`, `license-gate-*`,
`license-contract-`, `license-approved-surfaces-`, `sbom-*` (a dozen variants),
`po-human-*`, and more beyond the truncated listing.

**So the test suites are the producer**, and a single full Verify pass leaks on the
order of thousands of directories rather than the ~350 the one-prefix sample suggested.
Two passes in one afternoon, on top of two days of prior runs, exhausted the table.

What remains genuinely open is the *complete* prefix list and which suite owns each —
the listing above is itself a sample, of a 1MB output that was truncated.

## Direction, not a design

1. **Enumerate the prefixes completely before fixing any of them.** Both wrong answers
   in this investigation came from sampling: `ls | head -40` showed one prefix, and the
   full listing was truncated at 1MB. Group `/tmp` entries by prefix with counts —
   `find /tmp -maxdepth 1 -type d -printf '%f\n' | sed 's/-[A-Za-z0-9]*$//' | sort |
   uniq -c | sort -rn` or equivalent — and map each prefix to its owning suite. The fix
   is per-suite, so an incomplete prefix list silently leaves leaks in place while
   looking finished.
2. **Remove the directory in the same scope that created it.** Node's test runner has
   `after`/`t.after` hooks for exactly this, and a fixture already knows its own path
   — nothing needs discovering at cleanup time. A shared fixture helper that owns
   creation *and* removal means a new test cannot leak by forgetting.
3. **Do not solve this by moving the directories into the repository's `scratch/`.**
   Considered and rejected with the PO: ~700 of these appear per day of ordinary use,
   so an in-repo location would mean hundreds of untracked entries, a slow
   `git status`, and a standing risk of committing fixture noise. `/tmp` is the right
   place; the ownership of cleanup is what is wrong. The division to hold: test
   fixtures live in `/tmp` and are the suite's responsibility, agent working files
   live in `scratch/` and are the bootstrap cleanup's.
4. **Consider a cheap guard against the class**, not only the instance — a Verify step
   that fails when a run leaves behind more temp directories than it found. That turns
   "someone notices in two days" into "the run that caused it says so", which is the
   same shift `GL-09` makes for guard faults.

## Related

- `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md` (and the
  ADR it argues for) — the same question one level down: what kind of file belongs
  where, and who removes it.
- The scratch-cleanup wiring, deferred to directly after the 0.5.4 local candidate by
  PO decision — the sibling case, where a lifecycle shipped without a cleanup event.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accept-open, partial — Direction points 1 and 4 landed,
  points 2 and 3 not pursued (point 3 correctly, by the item's own
  instruction; point 2 deliberately, as unbounded scope).
- **Rationale:** `NVA-BL-44` (commit `d0dde552dedff165b86e0797e10d9b06d4946632`)
  built the two generalizing pieces: a repeatable prefix-grouped `/tmp`
  enumeration script (`tmp-leak-enumerate.mjs`) and a standalone
  before/after leak-detection guard (`tmp-leak-guard.mjs`), deliberately
  NOT wired into `verify.mjs`. Running the enumeration once produced a
  live measurement on this machine: **5,526 top-level `/tmp` entries across
  ~90 prefix groups** at commit time, top offenders `codex-pretool` (458),
  `guard-apply-patch` (374), `pr-contributor-gates`/`-trusted` (306 each),
  `afk-ledger-test` (228), `actions-permissions` (221) — full breakdown in
  `evidence/tmp-leak-enumeration-2026-08-11.json`. **This does NOT close
  the underlying defect** — the leak itself is unfixed, only now visible
  and measurable; the machine can still reach inode exhaustion again. Point
  2 (per-suite cleanup ownership, "many prefixes") was deliberately not
  attempted — the item's own text says the complete prefix list was
  unknown before this dispatch, and now that it IS known (~90 groups),
  fixing them individually is a genuinely large, separate sweep, not a
  same-dispatch add-on. Point 3 (do not move into `scratch/`) was correctly
  left untouched, per the PO's own prior rejection recorded in the item.
- **Assignment (if accepted):** point 2's per-suite cleanup sweep is the
  concrete next step, now scoped by real data instead of a sample — a
  future `goldfish-implementor` (or several, split by prefix ownership) can
  start directly from `evidence/tmp-leak-enumeration-2026-08-11.json`
  rather than re-deriving the prefix list. Not dispatched this session —
  genuinely large, better sized by the PO/next session than assumed here.
- **Date:** 2026-08-11

### Sprint deferral (2026-08-17)

Point 2 (the large per-suite cleanup sweep) deferred to Sprint Alfred
("Agent-first architecture, mechanical governance, measurable rigor, and
control integrity" — ADR-0043's 2026-08-17 amendment). Not needed near-term
on this machine specifically (a reboot resets `/tmp` between sessions in
this environment), but genuinely large and matches Alfred's mechanical-
governance scope well.

### Closure, 2026-08-19

PO decision: close, final. PO, 2026-08-19: "kein Pipeline problem und
inzwischen bei mir gelöst" (not a Pipeline problem, and meanwhile resolved
on my end). For the record, accurately: this item's own 2026-08-11
measurement attributed the bulk of the leak (5,526 top-level `/tmp` entries
across ~90 prefix groups) to THIS repository's own test suites, not to
external/incidental usage — a real tension with "not a Pipeline problem"
worth preserving here rather than silently smoothing over, even though the
PO's closure decision stands regardless (the practical trigger, an
unrebooted long-lived machine, is reported resolved on the PO's own
environment). Direction 4 (a Verify-time guard against a run leaving behind
more temp directories than it found) was never built; if the leak
resurfaces on a machine that does not reboot between sessions, that guard
is the concrete next step, not a full re-investigation.
