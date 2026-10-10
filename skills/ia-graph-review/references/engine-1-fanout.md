# Engine 1 — fan-out over the diff

## Procedure

1. **Bound the slice.** `git diff <base>..<head>` — an explicit range, never
   "the recent work". The range goes in the report and in the state file.
2. **Pick charters** from `charters.md` by what the diff touches. `full` runs all
   eight; `scout` runs the three the table nominates. A charter aimed at
   territory the diff never touched returns invention.
3. **Spawn one agent per charter, in parallel, with fresh context** — each with
   `subagent_type: ia-reviewer`, its charter in the call's prompt. Fresh is the
   requirement: a reviewer that has seen the author's reasoning inherits the
   author's blind spots.
4. **Cap output, not attention.** At most five findings each, and "zero" is an
   accepted answer. A reviewer told to produce a quota produces a quota.
5. **Second echelon** if three or more findings from *different* reviewers point
   at one subsystem: three or four more agents into that subsystem specifically,
   each spawned with `subagent_type: ia-second-echelon`.
6. Hand everything to the killer round. Nothing reaches the owner unrefuted.

## A money diff — one reader per area (1.4.0)

When the slice touches `money_paths` and the config carries `money_review`,
steps 2 and 3 are replaced:

2m. **Pick the areas.** `full` reads every area of `money_review.areas`; a small
    money diff reads the areas its files fall under (`paths`), two at most, and
    names any third in the report's «for the night» line.
3m. **Spawn one agent per area, in parallel, with fresh context** — each with
    `subagent_type: <money_review.reader>`, and in its prompt: the range, its
    ONE area, and every charter of that area verbatim from `charters.md`. No
    charter is spawned as its own agent on a money diff, and no agent of a
    money run is anything but the model the definitions name for it.

Before step 6 the main session **merges the findings by root cause** — the
write anchor `WHERE` is the key — and hands the killer round the UNIQUE list.

## What each reviewer is told

- the diff range, and that it may read anything in the repository;
- its charter verbatim from `charters.md`, including the incident behind it;
- the finding format, and that a finding missing a field is dropped by the agent
  that produced it;
- **it may not edit a file**. Read-only tooling where the harness offers it —
  the non-negotiable is easier to keep when it is also impossible to break.

## Why fresh context beats an iterated reviewer

An iterated reviewer converges: each pass sees its own previous output and
spends the next on refinement. Eight fresh charters cover eight territories at
once and, crucially, **disagree** — and the disagreement is the raw material for
the residual estimate. A single reviewer looped ten times produces one opinion,
polished.

## Reading the overlap

Duplication is the instrument, not the waste.

- three reviewers on one defect → a real defect in a busy area; consider the
  second echelon;
- one reviewer on a defect nobody else touched → most likely to be killed;
  the killer's verdict decides;
- all eight quiet in one area → either it is clean, or no charter covered it.
  Say which in the report, because "nothing found here" and "nobody looked here"
  read identically in a list.
