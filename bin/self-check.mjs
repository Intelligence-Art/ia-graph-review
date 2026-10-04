#!/usr/bin/env node
/**
 * Skill self-check — run this FIRST, at the start of every graph-review session.
 *
 * The skill's own failure mode is silent rot: a sentinel path renamed, a state
 * file corrupted by a bad merge, a manifest edited into something that no longer
 * installs. None of those announce themselves. Each of them makes the skill stop
 * protecting the thing it was pointed at, while every report still reads normal.
 *
 * So the skill checks itself before it checks anything else. Four things:
 *
 *   1. manifests parse and satisfy the plugin schema,
 *   2. the config parses and its shape is what the engines read,
 *   3. every sentinel and money path still exists,
 *   4. the state file parses and its invariants hold.
 *
 * Exit 0 means the run may proceed. Exit 1 means fix this before spending a
 * single agent — the alternative is a clean-looking report from a skill that was
 * pointed at nothing.
 *
 *   node bin/self-check.mjs              # from a consuming repo root
 *   node bin/self-check.mjs --skill DIR  # also validate the skill's manifests
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const problems = [];
const notes = [];

function problem(where, what) {
  problems.push({ where, what });
}

function readJson(path) {
  if (!existsSync(path)) return { missing: true };
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { broken: error instanceof Error ? error.message : String(error) };
  }
}

/* ─────────────────────────── 1. the manifests ────────────────────────────── */

function checkManifests(skillDir) {
  const marketplace = readJson(join(skillDir, ".claude-plugin/marketplace.json"));
  const plugin = readJson(join(skillDir, ".claude-plugin/plugin.json"));

  for (const [name, file] of [
    ["marketplace.json", marketplace],
    ["plugin.json", plugin],
  ]) {
    if (file.missing) return problem(name, "missing");
    if (file.broken) return problem(name, `does not parse: ${file.broken}`);
  }

  // The two schema mistakes that make the documented install path fail
  // outright. They are worth checking by name because they cost a fork.
  if (typeof marketplace.value.owner !== "object" || marketplace.value.owner === null) {
    problem("marketplace.json", "`owner` must be an object, not a string — the marketplace cannot be added otherwise");
  }
  if (typeof plugin.value.author !== "object" || plugin.value.author === null) {
    problem("plugin.json", "`author` must be an object, not a string — the plugin cannot be installed otherwise");
  }
  if ("skills" in plugin.value) {
    problem("plugin.json", "`skills` is not in the schema — skills are discovered from skills/; remove the key");
  }
  if (!existsSync(join(skillDir, "skills"))) {
    problem("skills/", "missing — nothing would be discovered");
  }

  notes.push(`manifests: ${plugin.value.name ?? "?"} ${plugin.value.version ?? "?"}`);
}

/* ────────────────────────────── 2. the config ────────────────────────────── */

const CONFIG_PATH = "graph-review.config.json";

function checkConfig() {
  const config = readJson(CONFIG_PATH);
  if (config.missing) {
    problem(CONFIG_PATH, "missing — the engines read it from the repository root");
    return null;
  }
  if (config.broken) {
    problem(CONFIG_PATH, `does not parse: ${config.broken}`);
    return null;
  }

  const c = config.value;

  const sentinels = c.sentinel_paths?.paths;
  if (!Array.isArray(sentinels) || sentinels.length === 0) {
    problem(CONFIG_PATH, "sentinel_paths.paths is empty — Engine 2 would never be mandatory");
  } else if (sentinels.length > 20) {
    problem(
      CONFIG_PATH,
      `${sentinels.length} sentinel paths. Past about twenty the sweep runs every time, which is the same as having no rule`,
    );
  }

  if (!Array.isArray(c.money_paths?.paths) || c.money_paths.paths.length === 0) {
    problem(CONFIG_PATH, "money_paths.paths is empty — nothing would force a FULL run");
  }

  if (!["cheap", "full"].includes(c.budget?.default)) {
    problem(CONFIG_PATH, 'budget.default must be "cheap" or "full" — the ladder is what rations the weekly limit');
  }
  if (c.budget?.default !== "cheap") {
    problem(CONFIG_PATH, "budget.default must be cheap: full is bought deliberately, never inherited");
  }
  if (!Array.isArray(c.budget?.full_triggers) || c.budget.full_triggers.length === 0) {
    problem(CONFIG_PATH, "budget.full_triggers is empty — nothing could ever escalate to a full run");
  }

  // A suite that silently loses a precondition — a database, a seed, an env var —
  // fails for reasons that are not findings, and a scarce run is spent reading
  // the project's own setup. `test_command_must_match` lets a project pin that
  // precondition so it cannot be dropped quietly.
  if (typeof c.test_command !== "string" || c.test_command.trim() === "") {
    problem(CONFIG_PATH, "test_command is empty — the skill would have no way to run the suite");
  } else if (c.test_command_must_match) {
    let required;
    try {
      required = new RegExp(c.test_command_must_match);
    } catch (error) {
      problem(CONFIG_PATH, `test_command_must_match is not a valid regular expression: ${error.message}`);
    }
    if (required && !required.test(c.test_command)) {
      problem(
        CONFIG_PATH,
        `test_command does not satisfy test_command_must_match (/${c.test_command_must_match}/) — the precondition this project declared non-negotiable is missing from the command`,
      );
    }
  }

  if (!c.quarantine?.directory) {
    problem(CONFIG_PATH, "quarantine.directory is unset — money findings have nowhere to land as failing tests");
  }

  return c;
}

/* ─────────────────────── 3. the paths the rules point at ─────────────────── */

function checkPaths(config) {
  if (!config) return;

  const groups = [
    ["sentinel_paths", config.sentinel_paths?.paths ?? []],
    ["money_paths", config.money_paths?.paths ?? []],
  ];

  for (const [name, paths] of groups) {
    let missing = 0;
    for (const path of paths) {
      if (!existsSync(path)) {
        missing += 1;
        problem(
          name,
          `"${path}" no longer exists. A renamed file stops triggering the rule SILENTLY — the failure the rule exists to prevent, one level up`,
        );
      }
    }
    // Never claim "all present" while reporting that they are not. A summary
    // line that contradicts the problems above it is how a broken setup gets
    // read as a working one.
    notes.push(
      missing === 0
        ? `${name}: ${paths.length} paths, all present`
        : `${name}: ${missing} of ${paths.length} paths MISSING`,
    );
  }
}

/* ──────────────────────────── 4. the state file ──────────────────────────── */

function checkState(config) {
  const path = config?.state_file ?? "graph-review-state.json";
  const state = readJson(path);

  if (state.missing) {
    problem(path, "missing — closed_classes and discarded_findings are the memory that stops re-litigation");
    return;
  }
  if (state.broken) {
    problem(path, `does not parse: ${state.broken}`);
    return;
  }

  const s = state.value;
  for (const key of ["closed_classes", "discarded_findings", "runs"]) {
    if (!Array.isArray(s[key])) problem(path, `${key} must be an array`);
  }
  if (typeof s.slices_since_engine_2 !== "number") {
    problem(path, "slices_since_engine_2 must be a number — the drift rule reads it");
  }

  // A closed class without a guard is a fix somebody remembered, not a class
  // that is closed. Reviewers are told to stop reporting these shapes, so a
  // wrong entry here silently suppresses real findings.
  for (const entry of s.closed_classes ?? []) {
    if (!entry.guard) {
      problem(path, `closed class "${entry.shape ?? "?"}" has no guard — a class is closed by an enumerating guard, never by a patch`);
    } else if (!existsSync(entry.guard)) {
      problem(path, `closed class "${entry.shape ?? "?"}" names guard "${entry.guard}", which does not exist`);
    }
  }

  for (const entry of s.discarded_findings ?? []) {
    if (!entry.reason || !entry.decided_at) {
      problem(path, "a discarded finding is missing its reason or date — an undated decline cannot be reopened honestly");
    }
  }

  // A budget ladder nobody measures against a real run is folklore. `subagents`
  // is the measured figure; `main_loop` must be PRESENT and null, because the
  // main loop genuinely cannot measure its own usage and an absent key cannot
  // be told from a forgotten one.
  const LEGACY_BEFORE = "2026-10-04";
  let legacyUnmeasured = 0;
  for (const run of s.runs ?? []) {
    const name = run.name ?? run.slice ?? "?";
    if (!run.tokens || typeof run.tokens !== "object") {
      problem(path, `run "${name}" records no token cost — the budget ladder has nothing to be checked against`);
      continue;
    }
    if (typeof run.tokens.subagents !== "number") {
      // UNMEASURED, LEGACY — the architect's decision of 2026-10-04. Runs
      // recorded before the figure was demanded carry `null`; no number is
      // invented for them. A null on a run dated before LEGACY_BEFORE passes
      // and is counted; from that day on a run must carry its figure. A run
      // with no date is not legacy: it cannot prove when it was written.
      const legacy = typeof run.date === "string" && run.date.slice(0, 10) < LEGACY_BEFORE;
      if (legacy && run.tokens.subagents === null) {
        legacyUnmeasured += 1;
      } else {
        problem(path, `run "${name}" has tokens.subagents that is not a number — this is the one figure that is actually measurable`);
      }
    }
    if (!("main_loop" in run.tokens)) {
      problem(path, `run "${name}" omits tokens.main_loop — record it as null rather than leaving it out, so an unmeasurable figure cannot be mistaken for a forgotten one`);
    }
  }

  notes.push(
    `state: ${s.runs?.length ?? 0} run(s), ${s.closed_classes?.length ?? 0} closed class(es), ${s.discarded_findings?.length ?? 0} discarded` +
      (legacyUnmeasured ? `, ${legacyUnmeasured} legacy run(s) unmeasured` : ""),
  );
}

/* ──────────────────────── 5. quarantined regressions ─────────────────────── */

function checkQuarantine(config) {
  const dir = config?.quarantine?.directory;
  if (!dir || !existsSync(dir)) {
    notes.push("quarantine: empty");
    return;
  }

  const files = readdirSync(dir).filter((f) => /\.test\.[tj]s$/.test(f));
  const stale = [];

  for (const file of files) {
    const source = readFileSync(join(dir, file), "utf8");
    // Every quarantined test must name the finding it stands for, or nobody
    // can tell a bug awaiting a decision from a test somebody gave up on.
    if (!/GR-\d{4}-\d{2}-\d{2}-\d+/.test(source)) {
      problem(dir, `${file} carries no finding id (GR-YYYY-MM-DD-N) — a skipped test without one is indistinguishable from an abandoned one`);
    }
    if (!/skip/.test(source)) stale.push(file);
  }

  if (stale.length) {
    // Un-skipped means the fix landed: it is a regression test now and belongs
    // in the normal suite.
    notes.push(`quarantine: ${stale.join(", ")} no longer skipped — move to the main suite`);
  }
  notes.push(`quarantine: ${files.length} test(s)`);
}

/* ──────────────────────────────── report ─────────────────────────────────── */

const skillFlag = process.argv.indexOf("--skill");
if (skillFlag !== -1 && process.argv[skillFlag + 1]) {
  checkManifests(process.argv[skillFlag + 1]);
}

const config = checkConfig();
checkPaths(config);
checkState(config);
checkQuarantine(config);

// A note is a summary, and a summary that always reads "ok" is worse than no
// summary: it is the clean-looking report this check exists to prevent.
for (const note of notes) {
  const bad = /MISSING|no longer skipped/.test(note);
  console.log(`  ${bad ? "!!" : "ok"}  ${note}`);
}

if (problems.length === 0) {
  console.log("\nself-check passed — the run may proceed.");
  process.exit(0);
}

console.error(`\n${problems.length} problem(s). Fix before spending a single agent:\n`);
for (const { where, what } of problems) console.error(`  ✖  ${where}: ${what}`);
console.error(
  "\nA skill pointed at nothing still produces a clean-looking report. That is the failure this check exists for.",
);
process.exit(1);
