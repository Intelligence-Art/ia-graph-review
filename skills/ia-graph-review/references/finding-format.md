# Finding format

```
WHERE        file:line — the WRITING SITE
WHAT BREAKS  the concrete scenario, not "may cause issues"
PROOF        code quote or a reproduction another agent can replay
REACHABLE    today | guarded | latent | unreachable
SHAPE        CLASS (N instances, each listed with file:line) | INSTANCE
SEVERITY     breaks_money | breaks_safety | breaks_order | degrades_experience | cosmetic
```

A finding missing a field is dropped by the agent that produced it. Not
forwarded with a gap, not filled in by consolidation.

## WHERE — the write anchor, and the dedup key

**The line that performs the wrong action**, not the line where the symptom is
noticed.

On the calibration run four reviewers found one defect and anchored it in three
different places: the service function that wrote the wrong row, the component
that rendered the control, and the schema comment it falsified. Merging those by
hand is a judgement call, and judgement calls at consolidation are where
duplicates survive into the owner's list as three separate items.

**The anchor is the deduplication key.** Consolidation merges on it
mechanically, without reading the prose. That only works if every finding
resolves to the same anchor for the same defect, so:

> **A finding citing an observation site is not accepted into the list.** It goes
> back to its reviewer to be resolved to the write site, or the killer resolves
> it and says so. A finding that cannot be resolved to a write site is not a
> defect yet — it is a symptom, and the defect behind it has not been found.

Observation sites still matter; they go in `WHAT BREAKS`, which is where "and
this is where you notice it" belongs. What they may not do is anchor the finding,
because then one defect occupies three lines of the owner's list and gets three
separate decisions.

## REACHABLE

- **today** — a user or an admin can reach this state now, through the shipped
  UI or an exposed endpoint.
- **guarded** — the code path is reachable, and an **existing enumerated guard
  or test blocks it**. Name the guard. This is "safe by design".
- **latent** — the defect is real and the code path is live, but the state
  needed cannot currently be constructed. Typically: a resolver written before
  its consumer. This is "unreachable by accident".
- **unreachable** — nothing calls this at all.

### Why `guarded` is its own value, and what it licenses

`guarded` and `latent` look alike in a list and mean opposite things.

A **guarded** finding is blocked by something written on purpose, that runs in
the suite, and that goes red if anyone removes the block. The protection is a
fact about the system and it stays true tomorrow.

A **latent** finding is blocked by an accident of the current wiring — nobody
has built the consumer yet. The day somebody does, it becomes `today`, and
nothing anywhere will notice.

**Only `guarded` is allowed to stay unfixed.** A latent defect is scheduled,
not dismissed: it goes on the list with its trigger named ("becomes live when
the player wires `resolveUnlock`"). Treating the two the same is how a known
bug ships six weeks later with everyone believing it had been considered.

A `guarded` finding without a named guard is not `guarded`. It is `today` with
an assumption, and the killer sends it back.

Severity says how bad it is if it happens. `REACHABLE` says whether it happens.
Both are needed to schedule: a `breaks_order` / `latent` finding is a real
defect and not this week's work, and the reviewer who knows that has to have
somewhere to put it. Without the field it competes with live bugs and the owner
adjudicates on a guess.

## SHAPE

`CLASS` requires the other instances **listed, found by enumeration** — a grep
with a stated pattern, an AST walk, an import graph. "There are probably others"
is an `INSTANCE` with a note.

This is the field that decides the fix: a class is closed by an enumerating
guard, an instance by a patch. Claiming a class without the list produces a
guard built on a hand-written inventory, which is the thing guards exist to
replace.

## SEVERITY

- `breaks_money` — a client is charged twice, or paid work is lost.
- `breaks_safety` — nothing a user sees breaks, and a guard silently fails to
  exist or fails to fire. A migration that aborts before installing its triggers
  is the canonical case: the deploy reports failure, someone re-runs it, the
  data repair has already half-happened, and the protection is absent while
  everything looks normal.
- `breaks_order` — the job stops or produces the wrong thing.
- `degrades_experience` — it works, but the client suffers.
- `cosmetic` — the rest, including honest map observations.

## PROOF, and the executable rule

Prose reproduction is the default, and for most findings it is the whole of it —
`PROOF` must be replayable by another agent without asking the author anything.

**An executable reproduction is required only where the kill phase buys one:**
the finding survived the reading kill **and** touches a sentinel path or a money
path. See `adversarial.md` for why the gate is both conditions rather than
either — twenty executable kills cost more than the fan-out they were checking.

### Quarantined regression tests

When an executable reproduction is required, it is **committed**, not scratched.

```ts
// tests/quarantine/gr-2026-01-31-3-force-delete-cascade.test.ts
//
// GR-2026-01-31-3 — force-deleting a shared record cascades the rows that
// carry other users' accumulated state. Awaiting the owner's decision; skipped
// until the fix lands, then un-skipped in the same commit as the fix.
test(
  "force delete does not destroy another user's accumulated state",
  { skip: "GR-2026-01-31-3: awaiting owner decision" },
  async () => { /* the failing reproduction */ },
);
```

Rules:

- lives under `quarantine.directory` from the config;
- **carries its finding id** (`GR-YYYY-MM-DD-N`) in the file, so a skipped test
  can never be mistaken for one somebody gave up on — the self-check enforces it;
- **skipped**, so CI stays green while the owner decides;
- **un-skipped in the same commit as the fix**, and moved into the normal suite.

The point: the finding and its future regression test are **one artefact**. The
expensive part — constructing the failing state — is paid once, at the moment
the defect is confirmed, rather than again months later when somebody writes the
regression test from a description.
