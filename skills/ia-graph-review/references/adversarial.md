# The killer round

The step that separates a defect hunt from eight agents producing confident,
plausible text.

In the skill this one derives from, the adversarial check was a paragraph in the
method with no mechanism, no ordering and no budget — so on the first real run
it did not happen. Nobody noticed, because a list of plausible findings looks
exactly like a list of real ones. Here it is a **required phase with its own
agents**, and the run is not finished without it.

## The charter

One killer per finding — on a money diff, per UNIQUE finding: the main session
first merges the findings by root cause (one mechanism in one place is one
finding, however many readers reported it), and a run that spawned more killers
than it has unique findings fails the self-check. Each is spawned with
`subagent_type: ia-killer`, fresh context, and it is told the following:

> You are given one claimed defect. Your job is to **refute** it.
>
> Read the code yourself. Do not trust the finding's quotes — reviewers
> paraphrase, and a paraphrase that drops a condition is how a non-bug becomes a
> bug. Open the files, read around the cited lines, follow the callers.
>
> Try, in order:
> 1. **Is the cited code what the finding says it is?** Quote it yourself.
> 2. **Is the path reachable?** Who calls it, with what, and can the state the
>    finding needs actually be constructed?
> 3. **Is something else already preventing it?** A constraint, a trigger, a
>    type, an earlier guard, a framework behaviour.
> 4. **Does the consequence follow?** A real cause with an imagined effect is
>    still a wrong finding.
>
> **Return `refuted` if you cannot decide.** A finding you could not confirm is
> not a finding — it is a claim, and the cost of a false one is an owner's hour
> spent on nothing. Confirm only what you personally reproduced.
>
> Return exactly:
> ```
> VERDICT   confirmed | refuted
> BECAUSE   what you checked and what you found, in your own words
> QUOTE     the code you read, not the code the finding quoted
> ```

## Why the default is refuted

Agents are optimised for plausibility. Asked "is this a bug?", a model
reconstructs a story in which it is — that is the shape of the training. Asked
"refute this, and say refuted if unsure", the same model has to produce evidence
to do the *harder* thing, and evidence is what we wanted.

This is worth a real example. On the calibration run one reviewer reported that
an ownership transfer could return a 500 on a row whose account no
longer exists — cited lines, quoted the trigger, gave a repro. It read as solid.
The killer's job was to open the migration, where the join table turned out to
carry a real SQL foreign key with `ON DELETE CASCADE` — so the orphaned row the
finding needed cannot exist. The reviewer had read "no relation declared in the
ORM schema" as "no foreign key in the database".

Note what saved it: reading the *migration*, not the finding. A killer that
re-read the finding's own quotes would have agreed with it.

## Ordering

The killer round runs **after** all engines and **before** consolidation.

Not per-reviewer as it goes, for two reasons: a finding is often confirmed or
killed by something a *later* reviewer found, and killers running concurrently
with reviewers compete for the same budget at the moment reviewers need it.

## Output

- `confirmed` → the finding goes to the list, tagged with the killer's `BECAUSE`.
  The owner reads both.
- `refuted` → the finding goes to `discarded_findings` in the state file with the
  killer's reasoning, and never appears again unless someone deliberately
  reopens it. A sweep that re-surfaces settled claims trains the owner to skim.

Both outcomes are recorded. A killer round with no refutations is a suspicious
result, not a clean one: it usually means the killers were reading the findings
rather than the code.

## Cost

One killer per finding, cheap context, no tools beyond reading. On a run
producing twenty findings this is roughly a fifth of the fan-out's cost — and it
is the fifth that decides whether the other four fifths were worth anything.

---

## Kill-phase economics

**The killer round must not eat the limit the skill exists to protect.** An
executable reproduction per finding is the most expensive thing in the method;
run twenty of them and the sweep costs more than the fan-out it was checking.

So the kill is **two tiers, and the second is bought, not inherited.**

### Tier 1 — the reading kill (every finding, always)

Open the code at the **write anchor** and read it. Follow the callers. Check the
constraint the finding assumed away. Cheap: no database, no test run, no fixture.

Most findings die here, and they die for the same few reasons — a paraphrase
that dropped a condition, a constraint the reviewer did not know about, a path
nothing calls. On the calibration run the one refutation cost a single file
read: a foreign key the reviewer had not looked for.

Verdict after tier 1:
- **refuted** → done. Straight to `discarded_findings`. No further spend.
- **confirmed by reading** → promoted, unless tier 2 applies.

### Tier 2 — the executable kill (narrow, and gated)

A failing test is required **only** when both hold:

1. the finding **survived tier 1**, and
2. it touches a **sentinel path** or a **money path**.

Both, not either. A finding that survives reading but lives far from money and
far from the requirement surfaces is promoted on the reading alone — the owner
can ask for a test when they decide to fix it.

This is the whole rule, and it is the difference between a kill phase that
protects the budget and one that consumes it: **the expensive check is spent on
the code where being wrong is expensive.**

### What tier 2 produces

Not a scratch file. The failing test is written where it will live afterwards —
see the quarantine convention in `finding-format.md`. The finding and its future
regression test are one artefact, so confirming a money bug costs the test once
rather than twice.

### Budget shape

On a slice producing twenty findings: twenty tier-1 reads (cheap, parallel), of
which perhaps five survive, of which perhaps two touch money or a sentinel. Two
executable kills, not twenty. The kill phase then costs roughly a fifth of the
fan-out instead of exceeding it.
