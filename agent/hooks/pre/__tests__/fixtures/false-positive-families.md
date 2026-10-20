# Audited false-positive families (OMP-13)

The command guard has two views of every rule: the **text matcher** (what
`origin/main` shipped, and the floor this guard may never fall below) and the
**structural matcher** (the program that will actually run, with quoted words
treated as data). The structural view may allow what the text view blocks only
when the whole command is understood.

These commands are the audited allowance budget. Each one is a banned phrase that
is *data* — never a program the shell would run — and each was a real refusal
during the PR #106 review, where the phrase appeared in a commit message, a
`backlog --ac` value, a `gh` comment body, or a grep pattern. The list is
enforced as a list of literal commands; see "The budget is a list of literal
commands" below for what that does and does not cover.

| # | Command | Why it is data |
|---|--------|----------------|
| 1 | `grep -n 'pip install x' agent/docs/guards.md` | the pattern is grep's argument |
| 2 | `echo "pip install x"` | echo prints its arguments |
| 3 | `git commit -m "docs: describe the pip install ban"` | the message is a `-m` value |
| 4 | `gh issue comment 5 --body 'gh issue create'` | the body is a `--body` value |
| 5 | `backlog task edit omp-11 --ac "never run pip install"` | the criterion is an `--ac` value |
| 6 | `echo 'gh pr merge 2'` | printed, not run |
| 7 | `grep -rn "git checkout -b release/" agent/` | the pattern is grep's argument |
| 8 | `backlog task edit omp-11 --ac "never use powershell"` | the criterion is an `--ac` value |
| 9 | `grep -rn 'gh issue create' agent/docs/` | the pattern is grep's argument |
| 10 | `gh issue close 5 --comment 'see gh issue create'` | the comment is a `--comment` value |
| 11 | `echo 'powershell -c x'` | printed, not run |
| 12 | `grep -n 'powershell' agent/docs/guards.md` | the pattern is grep's argument |
| 13 | `cat <<'EOF' … git push origin main … EOF` | a heredoc body read by `cat` is text, not a command |
| 14 | `cat <<'EOF' … pip install x … EOF` | same |
| 15 | `find . -name '*.ts' -exec grep -n 'pip install' {} \;` | `find -exec` runs grep, which only reads |
| 16 | `make pip install` | `pip` and `install` are two targets of make |
| 17 | `eval 'echo "pip install x"'` | `eval` runs `echo`, whose argument is the phrase |
| 18 | `git commit -m 'docs: explain why pip install is banned'` | the message is a `-m` value |
| 19 | `git push origin main-fix` | the ref is a *different* branch: the reference's push rule matches `main` anywhere in the ref |
| 20 | `git push origin my-main` | same |
| 21 | `ssh box 'git push origin my-main'` | same, carried inside a remote payload |
| 22 | `ssh box 'git push origin main-fix'` | same |
| 23 | `echo 'never git push origin main'` | printed, not run |
| 24 | `echo "git push origin main"` | printed, not run |
| 25 | `echo gh stack add bogus-name` | printed, not run |
| 26 | `sh -c 'echo "pip install x"'` | the `-c` argument is tokenized, and the inner `echo`'s argument is data |
| 27 | `bash -c 'echo "pip install x"'` | same |
| 28 | `echo 'pip install'` | printed, not run |
| 29 | `grep -n 'pip install' agent/docs/guards.md` | the pattern is grep's argument |
| 30 | `eval 'echo "pip install"'` | `eval` runs `echo`, whose argument is the phrase |

## The budget is a list of literal commands

`isAuditedFalsePositive` tests `^…$`-anchored regexes of **whole commands**, so this
file is a list of 30 literal instances, not a family predicate. The class behind
them is one thing — *the banned phrase is an argument of a program that does not
run it* — and the structural view decides that class, not this list. What the
list buys is a regression budget: every instance here is asserted to stay allowed,
and the fail-closed property asserts that nothing **outside** it is allowed while
the reference blocks.

The consequence is honest and worth stating: the same class one character away is
an allowance this list does not cover. `echo 'pip install'`,
`grep -n 'pip install' agent/docs/guards.md` and `eval 'echo "pip install"'` were
found that way in review (PR #106 round 4, F6) and are listed now; the next
variant of the same shape will be found the same way. That is why the doc
describes the class and the list is only the budget.

Two shapes are deliberately **not** in the list, because the guard blocks them and
should keep blocking them: a phrase inside an interpreter payload
(`python -c "print('pip install x')"` — the guard cannot parse Python, so it
matches the payload by text, conservatively), and a phrase inside a shell payload
whose inner command is a real program (`sh -c 'pip install x'` — the `-c`
argument is tokenized, so `pip` is read as the program it is).

The list is enforced from both directions in `command-guard-property.test.ts`:
nothing outside it may be allowed while the reference blocks, and nothing inside
it may start blocking again.
