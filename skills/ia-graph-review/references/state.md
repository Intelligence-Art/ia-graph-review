# State — what the sweep remembers

Reviewers are stateless by design. Everything that must survive between runs
lives in `graph-review-state.json`, and **writing it is the last step of every
run** — not an aspiration in a document.

```json
{
  "closed_classes": [
    {
      "shape": "controlled form input inside a <form action={…}>",
      "guard": "tests/form-safety.test.ts",
      "closed_at": "2026-01-31",
      "instances_at_closure": 4
    }
  ],
  "slices_since_engine_2": 2,
  "last_residual": 0.4,
  "runs": [
    {
      "slice": "a1b2c3d..e4f5a6b",
      "name": "the slice as the team names it",
      "date": "2026-01-31",
      "mode": "full",
      "engine_1": { "reviewers": 6, "second_echelon": false },
      "engine_2": { "ran": true, "reason": "sentinel paths touched" },
      "engine_3": { "ran": true, "migrations": 2 },
      "findings_reported": 19,
      "findings_refuted": 1,
      "fixes_applied": 0
    }
  ],
  "discarded_findings": [
    {
      "what": "…",
      "reason": "…",
      "decided_at": "2026-01-31",
      "by": "killer | owner"
    }
  ]
}
```

## What each entry is for

`closed_classes` stops reviewers re-reporting a shape a guard already enumerates.
Without it every sweep rediscovers the same class and the owner learns to skim.

`discarded_findings` stops the sweep re-litigating decisions. Both the killer's
refutations and the owner's declines go here, tagged with which — they are
different kinds of "no" and the distinction matters when someone reopens one.

`slices_since_engine_2` drives the drift rule: five slices forces a sweep even
when no sentinel path was touched.

`runs` is the cost record. It is what makes "weekly capacity is scarce" a
measurable statement rather than a feeling.

## The write step

At the end of the run, before the report:

1. append the run entry, with the mode and what each engine actually did;
2. append every refuted finding to `discarded_findings` with the killer's
   reasoning;
3. increment or reset `slices_since_engine_2`;
4. update `last_residual` (`full` only; `scout` writes `null`);
5. add a `closed_classes` entry **only** when a guard meeting all four checklist
   points has been merged — never when a fix was merely proposed.

The file is committed with the slice it describes. A state file living only on
someone's laptop is the same as no state file.

## Updating the state file is part of DONE

**A run that did not write the state file did not happen.** Not a nicety — the
consequences are mechanical:

- its refutations will be re-reported by the next sweep, and the owner will
  adjudicate the same claim twice;
- its closed classes will be re-found, and reviewers will spend their charter on
  a shape a guard already covers;
- its cost will not exist in any record, so "weekly capacity is scarce" stays a
  feeling instead of a number.

The self-check reads the file at the start of the next session, so a run that
skipped the write is noticed there rather than discovered months later.

A `closed_classes` entry is written **only** when a guard meeting all four
checklist points has been merged — the self-check verifies the named guard file
exists, because a class marked closed with no guard behind it silently suppresses
real findings.
