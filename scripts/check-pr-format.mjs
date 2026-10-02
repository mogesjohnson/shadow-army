// Run by .github/workflows/pr-format.yml. Reads the PR from the environment (never interpolated
// into a shell command) and checks the commits it adds on top of its base.
import { execFileSync } from "node:child_process";
import { checkAll } from "./pr-format.mjs";

const { PR_TITLE, PR_BODY, BASE_SHA, HEAD_SHA } = process.env;
if (!BASE_SHA || !HEAD_SHA) {
  console.error("BASE_SHA and HEAD_SHA are required");
  process.exit(2);
}

const subjects = execFileSync("git", ["log", "--no-merges", "--format=%s", `${BASE_SHA}..${HEAD_SHA}`], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

const problems = checkAll({ title: PR_TITLE, body: PR_BODY, subjects });
if (problems.length) {
  console.error("PR format check failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  console.error("\nSee CLAUDE.md and .github/pull_request_template.md.");
  process.exit(1);
}
console.log(`PR format OK (${subjects.length} commit${subjects.length === 1 ? "" : "s"} checked)`);
