# Contributing

Pull requests are welcome.

## Before you open one

**The self-check must pass.**

```bash
cd examples/toy-project && node ../../bin/self-check.mjs --skill ../..
```

It validates the manifests against the plugin schema, the config shape, every
path the config names, the state file's invariants and the quarantine
convention. If it exits 1, the install path is broken for everyone.

**A finding needs a reproduction.** If your change is motivated by a defect the
skill missed or invented, include the smallest case that shows it — a diff, a
config, or a test. "The reviewer should also look at X" is a preference; "here
is the diff where it looked at X and reported nothing" is a bug report.

**Changes to the method need a reason from a run.** The charters, the kill
gating and the budget ladder are the way they are because of what runs cost and
what they caught. A proposal that widens any of them is a proposal to spend
somebody's weekly limit, so say what it buys.

## What fits

- new defect-class charters, stated generically — a charter that only makes
  sense inside one codebase belongs in that codebase's `charters.local.md`;
- self-check coverage for a failure mode that got past it;
- corrections to the documented install path or the plugin manifests;
- clearer wording, especially where a rule reads as advice.

## What does not

- turning a non-negotiable into an option;
- raising `budget.default` above `cheap`;
- anything that lets an agent edit code during a sweep.

## Style

Prose over bullet lists where a sentence carries a reason. Every rule states
what it prevents — a rule whose "why" is missing gets deleted by the next
person who finds it inconvenient, and they will be right to.
