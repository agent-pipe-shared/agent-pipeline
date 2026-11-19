fix(design-review): the receipt export names the missing output directory and the way out

A Claude greenfield run was refused with DRC-OUT-PARENT-MISSING and the message printed the output file path as the directory and named no repair. The three places that refuse a missing parent now share one message: the directory itself, that the command never creates one, and the two ways forward (write any file into it with the Write tool, or choose an existing directory).

AI-Assisted: true
Dispatch: stage-0 (elephant)
