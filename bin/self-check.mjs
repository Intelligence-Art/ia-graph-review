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

import { execFileSync } from "node:child_process";
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

  checkMoneyReview(c);

  return c;
}

/* ─────────────── 2b. the money review: three areas, Opus only ────────────── */

// The charters are the checklist of a money review; the AREAS are who reads
// it. A charter that sits in no area is never read on a money diff, and a
// charter in two areas is read twice and paid for twice — both are silent, so
// both are checked here. `money_review` is optional: a project without it runs
// the charter fan-out on every diff, as before 1.4.0.
const CHARTER_COUNT = 8;

function checkMoneyReview(c) {
  const m = c.money_review;
  if (m === undefined) {
    notes.push("money_review: not configured — a money diff is read by the charter fan-out");
    return;
  }
  if (typeof m !== "object" || m === null) return problem(CONFIG_PATH, "money_review must be an object");
  if (typeof m.reader !== "string" || m.reader.trim() === "") {
    problem(CONFIG_PATH, "money_review.reader is unset — the money fan-out has no agent definition to spawn by name");
  }
  if (m.model !== "opus") {
    problem(CONFIG_PATH, `money_review.model is ${JSON.stringify(m.model)} — a money diff is read by Opus only`);
  }
  const areas = m.areas && typeof m.areas === "object" ? Object.entries(m.areas) : [];
  if (areas.length === 0) return problem(CONFIG_PATH, "money_review.areas is empty — nobody would read a money diff");
  const seen = new Map();
  for (const [key, area] of areas) {
    if (!Array.isArray(area?.charters) || area.charters.length === 0) {
      problem(CONFIG_PATH, `money_review.areas.${key} carries no charters — a reader with no checklist`);
      continue;
    }
    for (const charter of area.charters) {
      if (!Number.isInteger(charter) || charter < 1 || charter > CHARTER_COUNT) {
        problem(CONFIG_PATH, `money_review.areas.${key} names charter ${JSON.stringify(charter)} — the charters are 1…${CHARTER_COUNT}`);
        continue;
      }
      seen.set(charter, [...(seen.get(charter) ?? []), key]);
    }
  }
  for (let charter = 1; charter <= CHARTER_COUNT; charter++) {
    const owners = seen.get(charter) ?? [];
    if (owners.length === 0) problem(CONFIG_PATH, `charter ${charter} belongs to no area of money_review — it would never be read on a money diff`);
    if (owners.length > 1) problem(CONFIG_PATH, `charter ${charter} belongs to ${owners.join(" and ")} — each charter belongs to exactly ONE area`);
  }
  notes.push(`money_review: ${areas.map(([key, area]) => `${key} ← ${(area?.charters ?? []).join(",")}`).join(" · ")}`);
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

  // A MONEY RUN IS READ BY OPUS, AND ITS KILLERS FOLLOW THE DEDUPE — 1.4.0.
  // A run recorded after MONEY_SHAPE_FROM says whether it was a money run; a
  // money run lists every agent it spawned with its model, and the three
  // figures of the dedupe. One Sonnet agent on a money run, or more killers
  // than unique findings, is a run that did not follow the law it reports.
  for (const run of s.runs ?? []) {
    const name = run.name ?? run.slice ?? "?";
    const dated = typeof run.date === "string" ? run.date.slice(0, 10) : "";
    if (!("money" in run)) {
      if (dated > MONEY_SHAPE_FROM) problem(path, `run "${name}" does not say whether it was a money run — record money: true or false`);
      continue;
    }
    for (const what of moneyRunProblems(run)) problem(path, `run "${name}" ${what}`);
    for (const what of unreadAreaProblems(run, areasOfRange(run, config))) problem(path, `run "${name}" ${what}`);
  }

  notes.push(
    `state: ${s.runs?.length ?? 0} run(s), ${s.closed_classes?.length ?? 0} closed class(es), ${s.discarded_findings?.length ?? 0} discarded` +
      (legacyUnmeasured ? `, ${legacyUnmeasured} legacy run(s) unmeasured` : ""),
  );
}

/** Runs dated after this day carry `money`; the runs of that day and before are the old model. */
const MONEY_SHAPE_FROM = "2026-10-10";

/** What is wrong with one run's money shape — empty when nothing is. */
export function moneyRunProblems(run) {
  const out = [];
  if (typeof run.money !== "boolean") return ["has a money field that is not true or false"];
  if (!run.money) return out;
  const agents = Array.isArray(run.agents) ? run.agents : null;
  if (!agents || agents.length === 0) return ["is a money run that lists no agents — nothing shows who read it"];
  for (const agent of agents) {
    const model = String(agent?.model ?? "").toLowerCase();
    if (model !== "opus") out.push(`is a money run with ${agent?.agent ?? agent?.role ?? "an agent"} on ${model || "no named model"} — a money diff is read by Opus only`);
  }
  const d = run.dedupe;
  if (!d || ![d.raw, d.unique, d.killers].every((n) => Number.isInteger(n) && n >= 0)) {
    out.push("is a money run without its dedupe — record dedupe: { raw, unique, killers }");
    return out;
  }
  if (d.unique > d.raw) out.push(`records ${d.unique} unique findings out of ${d.raw} raw — the dedupe cannot add findings`);
  if (d.killers > d.unique) out.push(`spawned ${d.killers} killers for ${d.unique} unique findings — one killer per UNIQUE finding, never one per report line`);
  return out;
}

/**
 * EVERY TOUCHED AREA IS READ — 1.4.1. A money run names the areas its diff
 * touched (`areas_touched`) and each reader names its `area`; an area touched
 * and not read fails. `touchedByRange` is what the run's own `range` touches
 * by the config's paths, when git can still resolve it — so a run cannot pass
 * by naming fewer areas than its diff has.
 */
export function unreadAreaProblems(run, touchedByRange = null) {
  if (run.money !== true) return [];
  const named = Array.isArray(run.areas_touched) ? run.areas_touched.filter((key) => typeof key === "string") : null;
  if (!named || named.length === 0) return ["is a money run that does not name the areas its diff touched — record areas_touched"];
  const out = [];
  const read = new Set((Array.isArray(run.agents) ? run.agents : []).map((agent) => agent?.area).filter(Boolean));
  for (const key of new Set([...named, ...(touchedByRange ?? [])])) {
    if (!named.includes(key)) out.push(`does not name area ${key}, which its range touches`);
    if (!read.has(key)) out.push(`leaves area ${key} unread — a money diff is read by the readers of EVERY area it touches`);
  }
  return out;
}

/** The areas a run's `range` touches by the config's paths; null when there is no range or git cannot resolve it. */
function areasOfRange(run, config) {
  const areas = config?.money_review?.areas;
  if (!areas || typeof run.range !== "string" || !/^[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}$/.test(run.range)) return null;
  try {
    const files = execFileSync("git", ["diff", "--name-only", run.range], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
    return Object.entries(areas).filter(([, area]) => files.some((file) => (area?.paths ?? []).some((prefix) => file.startsWith(prefix)))).map(([key]) => key);
  } catch {
    return null;
  }
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
