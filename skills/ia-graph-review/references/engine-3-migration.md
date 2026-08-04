# Engine 3 — the migration drill

**Mandatory whenever the slice contains a migration.** Not a review of the SQL —
an execution of it.

## Why this engine exists

A migration is the one artefact whose defects are invisible to both other
engines and to every test in the repository. It runs once, in production, at the
moment the container starts, against data no test fixture contains.

The defect that earned it a place, in its general form: a migration installs
triggers to make a class of incident impossible, and opens with a `DO` block
repairing the rows that already carry the incident. The repair reassigns the bad
rows to a correct owner with an `UPDATE`. On any database where that owner
*already* holds an equivalent row, the update violates a unique index — the `DO`
block raises, the migration runner aborts on the first statement, and **neither
trigger is created**.

Read the file and it looks careful. Review the diff and it looks careful. The
only way to find it is to run it against data shaped like production's. Note the
shape of that failure: the migration fails *closed* on exactly the databases
that have the problem it was written to fix.

## The drill

### 1. A copy of the production schema

```bash
pg_dump -U <user> -d <db> --schema-only --no-owner --no-privileges > /tmp/prod-schema.sql
```

Restore into a throwaway database. Count tables, columns and constraints before.

### 2. Apply forward

Apply the migration alone, with `ON_ERROR_STOP=1`. Record:

- did it apply cleanly, and how long did it take;
- the object counts after — tables, columns, indexes, constraints, triggers;
- **any `RAISE NOTICE` output**, which the migration runner does not surface
  in production and which is often the only record of what a repair block did.

### 3. Roll back

Apply `down.sql`. Object counts must return to the numbers from step 1 exactly.
Report the comparison as numbers, never as "clean".

A rollback that cannot restore the previous state is not automatically a defect
— some are genuinely lossy — but **the loss must be stated in the file's own
header**, and the header must be complete. A rollback whose comment enumerates
one loss while the script performs two is a finding.

### 4. If the migration touches DATA, drill against production data

Not the schema — the data. Restore a full copy into the throwaway database and
run the migration against it.

This is what catches repair blocks. Before and after, run the query the repair
is about and put **both results in the report**:

```
before:   owner = <account A> (wrong role)
NOTICE:   reassigned 1 owner(s), removed 0 invalid position(s)
after:    owner = <account B> (correct role)
```

Two rows of evidence, not a sentence claiming success. "The repair ran" is not
the same statement as "the repair moved this row from here to there".

### 5. Adversarial pass over the repair block

For every repair block, ask explicitly:

- **What unique constraint can this UPDATE violate?** Enumerate the indexes on
  the table it writes, and construct the row that collides.
- **What happens to the rest of the migration if it raises?** If the answer is
  "nothing after it runs", say what specifically fails to be installed.
- **What is the audit trail?** A `RAISE NOTICE` carrying counts is not one:
  after the fact nobody can say *which* rows moved. If the repair deletes
  anything, the deleted rows belong in a table or in the report, not in a
  notice.
- **Which rows does the repair's own `JOIN` exclude?** A repair joining to a
  parent table cannot see a row whose parent is missing — check whether such a
  row can exist before assuming the join is total.

### 6. Idempotency and the second deploy

Apply the migration twice. A migration runner's history table prevents this in
practice, but a repair block copied into a later migration will not have that
protection, and `CREATE OR REPLACE FUNCTION` followed by a plain `CREATE TRIGGER`
is a common way to fail the second time.

## What Engine 3 reports

Findings in the standard format, with two conventions:

- a migration that can abort partway is `breaks_safety` when what it fails to
  install is a guard — nothing a user sees breaks, and a protection silently
  does not exist;
- `REACHABLE` is judged **against production's actual data**, which the drill
  has in front of it. "Unreachable on today's data, reachable on a database where
  one account holds both roles" is a `latent` finding worth its line.

## What it does not do

It does not review the SQL for style, naming or index choice. Those are Engine 1
charter 8's territory when the migration is in the diff.
