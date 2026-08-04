import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The sentinel list must not rot.
 *
 * Copy this file into the consuming repository's test suite. It runs in
 * milliseconds and it closes the one hole the sentinel rule cannot close for
 * itself.
 *
 * THE FAILURE IT PREVENTS. `sentinel_paths` decides, by fact rather than by
 * memory, when the reachable-state sweep is mandatory. Rename or delete one of
 * those files and the entry silently stops matching anything — so the sweep
 * stops being triggered by a change to exactly the code it was watching, and
 * nothing anywhere says so. That is the same class of defect the sentinel rule
 * exists to prevent, one level up: a rule that quietly stops applying.
 *
 * It also checks the list has not grown into the whole repository. Forty paths
 * means Engine 2 runs every time, which is the same as having no rule — a
 * threshold nobody notices crossing, one useful-looking addition at a time.
 */

type Config = {
  sentinel_paths?: { paths?: string[] };
  money_paths?: { paths?: string[] };
  test_command?: string;
  /** A regular expression the test command must satisfy. See config.md. */
  test_command_must_match?: string;
};

const CONFIG_PATH = "graph-review.config.json";

/** Sentinel lists longer than this stop being a rule and become a habit. */
const MAX_SENTINEL_PATHS = 20;

function loadConfig(): Config {
  assert.ok(
    existsSync(CONFIG_PATH),
    `${CONFIG_PATH} is missing. The review skill reads it from the repository root.`,
  );
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
}

describe("graph-review sentinel paths", () => {
  it("every sentinel path still exists", () => {
    const paths = loadConfig().sentinel_paths?.paths ?? [];
    assert.ok(paths.length > 0, "sentinel_paths is empty — Engine 2 would never be mandatory.");

    const missing = paths.filter((path) => !existsSync(path));

    assert.deepEqual(
      missing,
      [],
      "These sentinel paths no longer exist. A renamed file stops triggering the " +
        "reachable-state sweep silently, which is the failure the sentinel rule " +
        "exists to prevent. Update graph-review.config.json:\n" +
        missing.map((p) => `  - ${p}`).join("\n"),
    );
  });

  it("every money path still exists", () => {
    const paths = loadConfig().money_paths?.paths ?? [];
    const missing = paths.filter((path) => !existsSync(path));
    assert.deepEqual(missing, [], `Money paths that no longer exist: ${missing.join(", ")}`);
  });

  it("the sentinel list has not grown into the whole repository", () => {
    const paths = loadConfig().sentinel_paths?.paths ?? [];
    assert.ok(
      paths.length <= MAX_SENTINEL_PATHS,
      `${paths.length} sentinel paths. Past about ${MAX_SENTINEL_PATHS} the sweep runs ` +
        "every time, which is the same as having no rule. Ask of each: could changing " +
        "this file make a stage start or stop requiring something?",
    );
  });

  it("the test command carries its own preconditions", () => {
    // A test command that silently needs an environment variable turns a
    // project's own setup failures into what looks like review signal — and a
    // scarce weekly run gets spent reading them. Declare the precondition in
    // `test_command_must_match` and it cannot be dropped quietly.
    const config = loadConfig();
    const command = config.test_command ?? "";
    assert.notEqual(command.trim(), "", "test_command is empty: the skill has no way to run the suite.");

    if (config.test_command_must_match) {
      assert.match(
        command,
        new RegExp(config.test_command_must_match),
        `test_command must satisfy /${config.test_command_must_match}/: this project declared ` +
          "that precondition non-negotiable, and without it the tests behind it fail " +
          "for reasons that are not findings.",
      );
    }
  });
});
