---
schema: pipeline.backlog-item.v1
id: pipeline.temp-directories-leak-until-the-filesystem-refuses-every-write
type: defect
owner: pipeline
status: open
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

## Which producer — the first guess was measurably wrong

An age-filtered cleanup (`-mmin +2880`, older than 48 hours) reclaimed only **2833
inodes**, so the mass was created *inside* the last two days.

The obvious suspect was this repository's own Verify. It is not the main source: the
two full 255-suite runs on 2026-08-08 account for roughly 700 directories between them
(measured with `-newermt 2026-08-07`), about 350 per run — call it 12000 inodes for a
full pass. That is two orders of magnitude short of the ~33000 present. The bulk falls
in a window on 2026-08-06, just inside the 48-hour boundary, which is exactly why the
age filter missed it.

So the producer is **not yet identified**, and this item deliberately does not name
one. Recorded as an open question rather than closed with the convenient answer.

## Direction, not a design

1. **Enumerate the prefixes and find the actual producer first.** The diagnosis above
   rests on a 40-entry sample of 34350, and the obvious suspect is measurably not the
   main source. Group `/tmp` entries by prefix *and* by creation window before
   deciding what to fix, so the fix covers the real set rather than the one that
   sorted first alphabetically or the one that happened to be running when the wall
   was hit.
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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
