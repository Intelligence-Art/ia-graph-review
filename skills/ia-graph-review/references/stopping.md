# Stopping: classes, guards, residual

Two gates, both required.

## Gate 1 — every class closed by an enumerating guard

A `CLASS` finding is closed only when a guard exists that walks the tree
programmatically, finds every instance of the shape, and requires each to be
either correct or in an explicit allowlist with a written reason.

**Checklist — all four, or it is not a guard:**

- enumeration is **programmatic** (AST walk, import graph, grep with a defined
  pattern set) — never a hand-written list of places;
- allowlist entries carry a reason and an owner tag;
- the guard is **mutation-tested**: break one instance deliberately, the guard
  must go red; restore, green;
- it runs in the standard suite, not on request.

This codebase already has two of the right shape, both written after a class was
found the expensive way: the form-control name scan in `tests/form-safety.test.ts`
and a cross-check that every switch in the UI has a column behind it.

Why the gate is hard rather than advisory: without it a class is fixed one
instance at a time and each pass finds the next one. A guard is written once and
outlives the sweep — the next instance someone writes turns it red with nobody
reviewing anything.

## Gate 2 — residual estimate below one

Overlap between independent reviewers estimates how many defects remain unfound.
Capture-recapture, borrowed from ecology.

With two reviewer groups finding `n₁` and `n₂` confirmed defects and `m` in
common:

```
estimated total  N ≈ (n₁ × n₂) / m
residual         R = N − (unique confirmed defects)
```

Stop when `R < 1` on two consecutive sweeps.

**The cap and the estimate are in tension, and the resolution is explicit.**
Reviewers are capped at five findings and told fewer is better — which truncates
exactly the overlap the estimate feeds on. So a `full` run asks each reviewer for
**two lists**: the capped list it stands behind, and an uncapped
`ALSO_NOTICED` line of one-line mentions. The estimate is computed over the
union; the owner reads only the capped list. Without this the residual is
computed on truncated data and reads low, which is the worst possible direction
for a stopping rule to be wrong in.

`scout` mode computes no residual and says so. A number from three overlapping
charters is not an estimate, it is a decoration.

## What may stay unfixed

Only two things:

1. a finding the killer **refuted** — it is in `discarded_findings` with the
   reason;
2. a finding marked **`REACHABLE: guarded`** — an existing enumerated guard
   blocks it, the guard is named, and the guard goes red if anyone removes it.

Everything else is scheduled, including `latent`. A latent defect is blocked by
an accident of the current wiring rather than by a decision, and the day somebody
builds the missing consumer it becomes live with nothing anywhere noticing. It
goes on the list with its trigger named — "becomes live when the player wires
`resolveUnlock`" — so the schedule is a decision rather than an oversight.

`guarded` without a named guard is not `guarded`. It is `today` with an
assumption attached, and the killer sends it back.
