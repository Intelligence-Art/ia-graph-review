# Engine 1 — fan-out over the diff

## Procedure

1. **Bound the slice.** `git diff <base>..<head>` — an explicit range, never
   "the recent work". The range goes in the report and in the state file.
2. **Pick charters** from `charters.md` by what the diff touches. `full` runs all
   eight; `scout` runs the three the table nominates. A charter aimed at
   territory the diff never touched returns invention.
3. **Spawn one agent per charter, in parallel, with fresh context** — as
   `general-purpose`: a charter reviewer has no agent type of its own. Fresh is the
   requirement: a reviewer that has seen the author's reasoning inherits the
   author's blind spots.
4. **Cap output, not attention.** At most five findings each, and "zero" is an
   accepted answer. A reviewer told to produce a quota produces a quota.
5. **Second echelon** if three or more findings from *different* reviewers point
   at one subsystem: three or four more agents into that subsystem specifically,
   each spawned with `subagent_type: ia-second-echelon`.
6. Hand everything to the killer round. Nothing reaches the owner unrefuted.

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
