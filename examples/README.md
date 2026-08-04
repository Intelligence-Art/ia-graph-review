# Examples

`toy-project/` is a minimal repository with a filled-in
`graph-review.config.json`, an empty `graph-review-state.json`, and files at
every path the config names. It exists for two reasons: to give the self-check
something real to pass against, and to give a first run something small enough
that you can check its answer yourself.

## Prove the install

```bash
cd examples/toy-project && node ../../bin/self-check.mjs --skill ../..
```

Expected: five `ok` lines and `self-check passed — the run may proceed.` If it
fails here, it will fail in your repository too, and the message says which of
the manifests, config, paths, state file or quarantine is at fault.

## A first run

Apply the toy diff and ask the skill to review it:

```bash
cd examples/toy-project && git apply ../toy-diff.patch
```

The diff touches `src/payments/` — a money path in this config — so the ladder
puts the run at `full`. That is the rule working: a money diff is the one thing
that buys the expensive run without anybody having to argue for it.

## What is actually wrong with the toy diff

Read the skill's report before this section.

1. **Retry-blind error** (Engine 2). `settle` throws the same shape for "no such
   reservation, retry will never help" as it would for a transient failure. The
   retry loop burns all three attempts against a wall.
2. **A payment reported as failed after it succeeded** (charter 4). The gateway
   redelivers a webhook for a reservation that was already settled; the second
   delivery throws, all three attempts throw, and the handler logs a failed
   payment for money that has moved. `REACHABLE: today` — webhook redelivery is
   normal operation, not an edge case.
3. **A stale contract** (charter 8). The comment on `onPaid` says a real handler
   needs an idempotency key. The diff adds the retry that makes the missing key
   reachable and leaves the comment describing a plan nobody carried out.

A good report anchors all three at the **write site** — `onPaidWithRetry`, and
`settle` for the error shape — not at the line where the wrong log message is
printed.
