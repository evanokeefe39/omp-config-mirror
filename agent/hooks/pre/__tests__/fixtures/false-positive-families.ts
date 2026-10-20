/**
 * The audited false-positive families (OMP-13).
 *
 * Every entry is a command the frozen reference (main's text matcher) BLOCKS and
 * the structural matcher ALLOWS, because the banned phrase is DATA: a quoted
 * argument, a grep pattern, a commit message, a `gh` body, a `backlog --ac`
 * value, a heredoc body read by a non-shell, a `find -exec` payload that is a
 * read-only grep, or a `make` target list.
 *
 * The list is the guard's whole allowance budget: the fail-closed property is
 * "the structural matcher may allow what the text matcher blocks ONLY for these
 * families", checked over the differential corpus and a generated cartesian in
 * `command-guard-property.test.ts`. Rationale per family: false-positive-families.md.
 */
export const FALSE_POSITIVE_FAMILIES: RegExp[] = [
	/^grep -n 'pip install x' agent\/docs\/guards\.md$/,
	/^echo "pip install x"$/,
	/^git commit -m "docs: describe the pip install ban"$/,
	/^gh issue comment 5 --body 'gh issue create'$/,
	/^backlog task edit omp-11 --ac "never run pip install"$/,
	/^echo 'gh pr merge 2'$/,
	/^grep -rn "git checkout -b release\/" agent\/$/,
	/^backlog task edit omp-11 --ac "never use powershell"$/,
	/^grep -rn 'gh issue create' agent\/docs\/$/,
	/^gh issue close 5 --comment 'see gh issue create'$/,
	/^echo 'powershell -c x'$/,
	/^grep -n 'powershell' agent\/docs\/guards\.md$/,
	/^cat <<'EOF'\ngit push origin main\nEOF$/,
	/^cat <<'EOF'\npip install x\nEOF$/,
	/^find \. -name '\*\.ts' -exec grep -n 'pip install' \{\} \\;$/,
	/^make pip install$/,
	/^eval 'echo "pip install x"'$/,
	/^git commit -m 'docs: explain why pip install is banned'$/,
	// The push-ref substring family: the reference's push rule matches `main`
	// ANYWHERE in the ref, so a ref that merely contains it is refused. The
	// structural matcher reads the ref as a whole (`main-fix` and `my-main` are
	// different branches from `main`), so these are allowed.
	/^git push origin main-fix$/,
	/^git push origin my-main$/,
	/^ssh box 'git push origin my-main'$/,
	/^ssh box 'git push origin main-fix'$/,
	/^echo 'never git push origin main'$/,
	/^echo "git push origin main"$/,
	// A stack command printed by echo: the same data shape as the rows above, one
	// rule over (the stack branch-name check reads the raw command text).
	/^echo gh stack add bogus-name$/,
	// The same data shape inside a shell payload: `sh -c '…'` is tokenized, so the
	// argument of the inner `echo` is data. The doc claimed this blocked; it does
	// not, so it belongs in the budget (PR #106 round 4, F5).
	/^sh -c 'echo "pip install x"'$/,
	/^bash -c 'echo "pip install x"'$/,
	// The near-miss instances of the same family: the phrase is a grep pattern, an
	// echo argument or an eval argument. The budget is a list of literal commands,
	// so each one is listed rather than implied by the row above (PR #106 round 4,
	// F6). Any other one-character variant is an allowance this list does not
	// cover, which is why the class is described in the doc and the list is the
	// regression budget rather than the mechanism.
	/^echo 'pip install'$/,
	/^grep -n 'pip install' agent\/docs\/guards\.md$/,
	/^eval 'echo "pip install"'$/,
];

export function isAuditedFalsePositive(command: string): boolean {
	return FALSE_POSITIVE_FAMILIES.some((re) => re.test(command));
}
