// The commit and PR text rules from CLAUDE.md and CONTRIBUTING.md, as checks.
// Used by the commit-msg hook (.githooks/commit-msg) and the "PR format" GitHub workflow.

/** `#<issue> <action>` or `[F<n>] <action>`. */
export const SUBJECT = /^(#[0-9]+|\[F[0-9]+\]) \S/;

/** Subjects git or a person writes for plumbing commits; the format rule does not apply. */
const EXEMPT = /^(Merge |fixup! |squash! |Revert )/;

/** Keywords that make GitHub close an issue on merge, before acceptance has been checked. */
const CLOSING = /\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#[0-9]+/i;

export function checkSubject(subject) {
  if (EXEMPT.test(subject) || SUBJECT.test(subject)) return undefined;
  return `commit subject must look like "#<issue> <action>" or "[F<n>] <action>", got: ${subject}`;
}

export function checkTitle(title) {
  if (SUBJECT.test(title)) return undefined;
  return `PR title must look like "#<issue> <action>" or "[F<n>] <action>", got: ${title}`;
}

export function checkBody(body) {
  const problems = [];
  const text = body ?? "";
  for (const label of ["Validation:", "Tracking:", "Checklist:"]) {
    if (!text.includes(label)) problems.push(`PR body is missing "${label}" (see .github/pull_request_template.md)`);
  }
  const boxes = (text.match(/^- \[[ xX]\] /gm) ?? []).length;
  if (boxes < 6) problems.push(`PR body has ${boxes} checklist boxes; the template has 6`);
  const closing = text.match(CLOSING);
  if (closing) {
    problems.push(`PR body contains the closing keyword "${closing[0]}"; write "Tracking: #N" instead`);
  }
  return problems;
}

/** All problems for one PR: its title, its body, and the subjects of its own commits. */
export function checkAll({ title, body, subjects }) {
  const problems = [];
  const t = checkTitle(title ?? "");
  if (t) problems.push(t);
  problems.push(...checkBody(body));
  for (const s of subjects ?? []) {
    const p = checkSubject(s);
    if (p) problems.push(p);
  }
  return problems;
}
