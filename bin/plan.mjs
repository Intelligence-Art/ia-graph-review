#!/usr/bin/env node
/**
 * The plan of a review — who WOULD be spawned for this diff, and on which model.
 *
 * It spawns nobody and reads no code: it reads the diff's file list, the
 * repository's `graph-review.config.json` and the agent definitions under
 * `.claude/agents/`, and prints the fan-out the skill is to run. Run it before
 * a review to see its price, and in a report to show the plan was the law's.
 *
 *   node bin/plan.mjs --range <base>..<head>          # sized by the diff
 *   node bin/plan.mjs --range <base>..<head> --full   # the caller knows a mechanic was added
 *   node bin/plan.mjs --range <base>..<head> --small
 *   node bin/plan.mjs --files a.ts,b.ts               # no git, a list
 *   …                 --json                          # the same plan as JSON
 *
 * A MONEY DIFF (it touches `money_paths`) IS READ BY OPUS ONLY (1.4.0): one
 * `money_review.reader` per AREA, carrying that area's charters — never one
 * Sonnet reviewer per charter. Exit 1 when a money plan would spawn an agent
 * whose definition does not say `model: opus`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.indexOf(name) !== -1 ? args[args.indexOf(name) + 1] : undefined);

const config = JSON.parse(readFileSync("graph-review.config.json", "utf8"));

const range = value("--range");
const files = value("--files")
  ? value("--files").split(",").map((f) => f.trim()).filter(Boolean)
  : range
    ? execFileSync("git", ["diff", "--name-only", range], { encoding: "utf8" }).split("\n").filter(Boolean)
    : null;
if (!files) {
  console.error("usage: node bin/plan.mjs --range <base>..<head> | --files a,b,c  [--full | --small] [--json]");
  process.exit(2);
}

/** The model an agent definition names — the mechanic of the law: never left to the environment. */
function modelOf(agent) {
  const path = `.claude/agents/${agent}.md`;
  if (!existsSync(path)) return null;
  const match = /^model:\s*(\S+)\s*$/m.exec(readFileSync(path, "utf8").split("\n---")[0] ?? "");
  return match ? match[1].toLowerCase() : null;
}

const under = (file, prefixes) => (prefixes ?? []).some((prefix) => file.startsWith(prefix));
const moneyFiles = files.filter((file) => under(file, config.money_paths?.paths));
const sentinelFiles = files.filter((file) => under(file, config.sentinel_paths?.paths));
const migrations = [...new Set(files.filter((file) => file.startsWith("prisma/migrations/")).map((file) => file.split("/").slice(0, 3).join("/")))];
const sourceFiles = files.filter((file) => !/^(tests|docs|notes)\//.test(file) && !/\.(md|json)$/.test(file));
const money = moneyFiles.length > 0;

const plan = { range: range ?? null, files: files.length, source_files: sourceFiles.length, money, money_files: moneyFiles.length, sentinel_files: sentinelFiles.length, migrations: migrations.length, size: null, why: "", agents: [], notes: [] };
const spawn = (role, agent, count, extra = {}) => plan.agents.push({ role, agent, model: modelOf(agent), count, ...extra });

if (money && config.money_review) {
  const m = config.money_review;
  const small = m.small ?? {};
  const fits = sourceFiles.length <= (small.max_source_files ?? 5) && migrations.length <= (small.max_migrations ?? 1);
  plan.size = flag("--full") ? "full" : flag("--small") ? "small" : fits ? "small" : "full";
  plan.why = flag("--full")
    ? "FULL by the caller's word (a mechanic was added, or the brief says FULL)"
    : flag("--small")
      ? "SMALL by the caller's word"
      : fits
        ? `SMALL by the count: ${sourceFiles.length} source file(s), ${migrations.length} migration(s) — a NEW MECHANIC is the caller's judgement and makes it FULL (--full)`
        : `FULL by the count: ${sourceFiles.length} source file(s), ${migrations.length} migration(s)`;

  const touched = Object.entries(m.areas).map(([key, area]) => ({ key, area, files: files.filter((file) => under(file, area.paths)).length }));
  const readers = plan.size === "full" ? touched : [...touched].filter((t) => t.files > 0).sort((a, b) => b.files - a.files).slice(0, 2);
  for (const reader of readers) {
    spawn(`reader ${reader.key} — ${reader.area.name}`, m.reader, 1, { charters: reader.area.charters, files_in_area: reader.files });
  }
  if (plan.size === "small") {
    const left = touched.filter((t) => t.files > 0 && !readers.includes(t));
    for (const t of left) plan.notes.push(`for the night: area ${t.key} (${t.area.name}) — ${t.files} file(s) of this diff, not read by a SMALL run`);
    if (readers.length === 0) plan.notes.push("no area's paths match this diff — name the area by hand");
  }
  if (plan.size === "full") spawn("Engine 2 — the sweep over reachable states", "ia-engine-2", 1);
  else plan.notes.push("Engine 2 is not run on a SMALL money diff — say so in the report (ia-money-pass 6.5)");
  if (migrations.length > 0) spawn("Engine 3 — the migration drill", "ia-engine-3", 1, { migrations: migrations.length });
  spawn(
    plan.size === "full" ? "killer — one per UNIQUE finding, after the dedupe" : "killer — ONE over the findings",
    "ia-killer",
    plan.size === "full" ? "= unique findings" : 1,
  );
  spawn("worker — fixes the confirmed findings", "ia-worker", "1, when anything is confirmed");
  spawn("second echelon — the FIX diff, only when the fix touched money", "ia-second-echelon", "0 or 1");
  plan.notes.push("dedupe before the killers: the main session merges the findings by root cause and records raw → unique → killers in the state file");
} else {
  const full = flag("--full");
  plan.size = full ? "full" : "cheap";
  plan.why = money ? "money paths touched, but money_review is not configured — the charter fan-out" : "no money path touched — the charter fan-out, unchanged";
  spawn("charter reviewer — one per charter", "ia-reviewer", full ? (config.budget?.full?.reviewers ?? 8) : (config.budget?.cheap?.reviewers ?? 2));
  if (full || sentinelFiles.length > 0) spawn("Engine 2 — the sweep over reachable states", "ia-engine-2", 1);
  if (migrations.length > 0) spawn("Engine 3 — the migration drill", "ia-engine-3", 1, { migrations: migrations.length });
  spawn("killer — one per finding", "ia-killer", "= findings");
}

const wrong = money && config.money_review ? plan.agents.filter((agent) => agent.model !== "opus") : [];
for (const agent of wrong) plan.notes.push(`✖ ${agent.agent} is ${agent.model ?? "undefined"} — a money diff is read by Opus only`);

if (flag("--json")) {
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.log(`plan — ${plan.range ?? "a file list"}: ${plan.files} file(s), ${plan.source_files} source, ${plan.money_files} on money paths, ${plan.sentinel_files} sentinel, ${plan.migrations} migration(s)`);
  console.log(`${money ? "MONEY" : "NOT MONEY"} · ${String(plan.size).toUpperCase()} — ${plan.why}\n`);
  const rows = plan.agents.map((agent) => [agent.role, agent.agent, agent.model ?? "—", String(agent.count), agent.charters ? agent.charters.join(", ") : ""]);
  const head = ["role", "agent", "model", "count", "charters"];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (row) => `| ${row.map((cell, i) => cell.padEnd(width[i])).join(" | ")} |`;
  console.log(line(head));
  console.log(`|${width.map((w) => "-".repeat(w + 2)).join("|")}|`);
  for (const row of rows) console.log(line(row));
  if (plan.notes.length) console.log(`\n${plan.notes.map((note) => `- ${note}`).join("\n")}`);
}
process.exit(wrong.length ? 1 : 0);
