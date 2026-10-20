# Backlog.md v1.54.0 — cited behaviour reference for `backlog-conventions`

Source: upstream tag `v1.54.0` = commit `2225c4167234fd300b477cc3207689c8454abed1`. Every `path:line` citation resolves under <https://github.com/MrLesk/Backlog.md/blob/v1.54.0/>. Read 2026-10-17 for `skill://backlog-conventions`; re-verify on upgrade.

Verification (2026-10-17): the installed binary reports `backlog --version` = `1.54.0` (the tagged `package.json:3` still says `1.53.0`; trust the binary). The workflow-guide quotes in §9 were checked against `backlog instructions <guide>` output from that binary: all present verbatim. CLI flags named in the skill (`--check-ac`, `--check-dod`, `--append-notes`, `--final-summary`, `--plan`, `milestone add|rename|archive`) checked against `--help`.

## 1. MCP

**Start / flags.** `backlog mcp start` — stdio is the only supported transport (`src/commands/mcp.ts:8-13`; `src/mcp/server.ts:26-31`). Flags: `-d, --debug`; `--cwd <path>` ("Directory to resolve Backlog root from (overrides BACKLOG_CWD)") (`src/commands/mcp.ts:31-35`). Client wiring examples: `claude mcp add backlog --scope user -- backlog mcp start`, `{"command":"backlog","args":["mcp","start"],"env":{"BACKLOG_CWD":"..."}}` (`README.md:272-330`).

**Project resolution order** (`src/commands/mcp.ts:36-41`):
1. `--cwd` > `BACKLOG_CWD` > `process.cwd()` (`src/utils/runtime-cwd.ts:7-40`; an invalid override dir is a startup error).
2. Walk up that dir for a backlog folder with a config, or a `backlog.json`; else `git rev-parse --show-toplevel` if it has backlog config (`src/utils/find-backlog-root.ts:27-64`).
3. Else use the cwd itself.
`pinned` = the cwd came from `--cwd`/`BACKLOG_CWD` (`mcp.ts:39-41`): **pinned never consults MCP roots**. Unpinned (process cwd) follows client roots on the first request-scoped call: `roots/list`, checking **only the root itself — no walking up** (`src/mcp/server.ts:127-230`, comment at `:179-181`); a usable root triggers an upgrade that registers the full toolset and sends tools/resources/prompts list-changed notifications (`server.ts:263-290`); no usable root reverts to the launch project (if it had one) or init-required; roots-changed marks the resolution dirty (`server.ts:295-310`).

**Init-required behaviour.** With no config at the resolved root the server starts in fallback mode: only `backlog://init-required`, no tools, roots discovery enabled unless pinned (`server.ts:518-543`; resource at `src/mcp/resources/init-required/index.ts:6-30`). Initializing (or switching to a workspace that has a project) upgrades it live.

**Transport/prompts/templates.** stdio via `StdioServerTransport` (`server.ts:66-69,349-366`). No prompts are ever registered (`addPrompt` exists at `server.ts:341-344`; no registration call in `src/mcp`). Resource templates list is always `[]` (`server.ts:436-442`).

**Resources.** `backlog://workflow/overview`, `…/task-creation`, `…/task-execution`, `…/task-finalization` (`src/mcp/workflow-guides.ts:32-63`; registered in `src/mcp/resources/workflow/index.ts:4-24`), plus `backlog://init-required` in fallback only. Server instructions string: "At the beginning of each session, list the available resources and read the first one…" (`server.ts:55-56`).

**Tools — complete list (24), from registration source:**
| Tool | Purpose / key args |
|---|---|
| `get_backlog_instructions` | Workflow guide markdown; `instruction` enum overview\|task-creation\|task-execution\|task-finalization (default overview) (`src/mcp/tools/workflow/index.ts:36-90`) |
| `task_create` | Create task; required `title`; optional description,status,dueDate,priority,type,project,ordinal,milestone,labels[],assignee[],dependencies[],references[],documentation[],modifiedFiles[],finalSummary,acceptanceCriteria[],definitionOfDoneAdd[],disableDefinitionOfDoneDefaults,parentTaskId (`src/mcp/utils/schema-generators.ts:191-286`) |
| `task_list` | Filter: status, type[], project[], assignee or unassigned, milestone, labels[], search, ready, limit (`schema-generators.ts:79-124`) |
| `task_search` | Fuzzy query + status/type/project/priority/modifiedFiles/limit (`schema-generators.ts:465-495`) |
| `task_edit` | Required `id`; metadata + plan/notes/comments/finalSummary; AC/DoD set/add/remove/check/uncheck by 1-based index; refs/docs/deps replace/add/remove (`schema-generators.ts:288-462`) |
| `task_view` | `{id}` (`src/mcp/tools/tasks/schemas.ts:8-18`) |
| `task_archive` | `{id}`; any status → archive (`tools/tasks/index.ts:73-83`) |
| `task_delete` | `{id}`; archived-only, no subtasks, releases ID (`tools/tasks/index.ts:85-96`) |
| `task_restore` | `{id}`; back to board, same ID/status (`tools/tasks/index.ts:98-108`) |
| `milestone_list` | list milestones + task-only values (`tools/milestones/index.ts:18-26`) |
| `milestone_add` | name(+description,dueDate) (`tools/milestones/schemas.ts:11-30`) |
| `milestone_rename` | from,to,updateTasks?,dueDate?\|null (`schemas.ts:32-56`) |
| `milestone_remove` | name,taskHandling clear\|keep\|reassign,reassignTo (`schemas.ts:58-80`) |
| `milestone_archive` | name; → backlog/archive/milestones (`schemas.ts:82-95`) |
| `definition_of_done_defaults_get` | project DoD defaults (`tools/definition-of-done/index.ts:11-22`) |
| `definition_of_done_defaults_upsert` | replace project DoD defaults (`index.ts:24-40`) |
| `document_list` | substring filter (`tools/documents/index.ts:26-38`) |
| `document_view` | by id (`index.ts:40-51`) |
| `document_create` | title + optional content/type/path/tags (`index.ts:53-64`) |
| `document_update` | id + content + optional title/type/path/tags (`index.ts:66-77`) |
| `document_archive` | id; moves under archive/docs, ID stays reserved (`index.ts:79-90`) |
| `document_restore` | id (`index.ts:92-102`) |
| `document_delete` | archived-only, releases ID, no prompt (`index.ts:104-114`) |
| `document_search` | shared fuzzy index (`index.ts:116-126`) |

## 2. IDs and prefix

- Shapes: `<PREFIX>-<n>` and dotted subtasks `<PREFIX>-<n>.<m>` (`src/utils/task-id.ts:5-8`).
- Prefix is read from `config.prefixes.task`, parsed from `task_prefix:` in the config file (`src/file-system/operations.ts:2445-2447`; written back at `:2522`); fallback `"task"` (`src/utils/prefix-config.ts:456-470`).
- Init-time validation: letters only (`/^[a-zA-Z]+$/`), empty means default, `draft`/`doc`/`decision` are reserved; **no length limit found** (`prefix-config.ts:18-52`; `src/cli.ts:1430-1434`; init help "letters only" `cli.ts:1118-1121`). Config watcher ignores an invalid `task_prefix` (`src/utils/config-watcher.ts:44,76`).
- Immutable through the CLI: `backlog config set taskPrefix|prefixes` → "Task prefix cannot be changed after initialization. … permanent to avoid breaking existing task IDs." (`cli.ts:5675-5681`). The doctor's remedy for a reserved prefix is to rename files/IDs and set `task_prefix` in the project config file (`cli.ts:5781-5792`) — i.e. a hand edit of `config.yml` is the only supported change path.
- **Two prefixes in one backlog: NOT supported.** Every reader lists files with the glob `<configuredPrefix>-*.md` (lowercased): `listTasks` (`operations.ts:1155-1160`), `listArchivedTasks` (`:1219-1222`), the ID-allocation filename scan (`src/core/backlog.ts:1985-1993`), cross-branch scan (`src/core/cross-branch-tasks.ts:31-41` via `buildPathIdRegex`), and the branch loader drops any filename whose prefix ≠ configured (`src/core/task-loader.ts:51-56`). A `SOLO-3` file in a project configured `ABCD` is invisible to list/view/search and its number is not reserved (`generateNextId` matches only the configured prefix, `prefix-config.ts:326-361`).
- **No alias/legacy prefix support and no id-import option**: greps for `legacyPrefix|prefixAlias|aliasPrefix|previousPrefix|renamedPrefix` in `src` → no matches; the only prefix migration is one-time drafts `task-*.md` → `draft-*.md` which also writes `prefixes: {task: task}` (`src/core/prefix-migration.ts:1-8,20-131`). There is no `--id`/`--task-id` option on `task create` (`cli.ts:1960-2073` option list; grep `option("--…id"` → no matches), and `AGENTS.md:93-95` states: "Do not manually edit task files, pick IDs, pre-reserve IDs … rely on the CLI allocator and lock."
  → Skill rule: never change `task_prefix` on an existing backlog and never mix prefixes; a prefix change is a rename-all-files-and-IDs migration plus a config edit, not a supported operation.
- **next id** = max numeric body of occupied IDs + 1, dotted subtask IDs ignored; zero-padded when configured (`prefix-config.ts:326-361`; `core/backlog.ts:1931-1944`). Occupied = frontmatter IDs (identity index) + numbers claimed by file names in tasks/ and archived dirs across this project and every worktree — "A file reserves the number in its name whatever its frontmatter says" (`core/backlog.ts:2004-2041`; comment `:2037-2039`). Allocation runs under the create lock inside `createTaskFromInput` (`core/backlog.ts:2216-2224`).
- **Explicit id on create: not supported** (see above); subtasks get `parent.n+1` (`prefix-config.ts:377-435`).

## 3. File format

- Filename: `<lowercased-id> - <sanitized title>.md` (e.g. `task-12 - Fix login.md`) at `backlog/tasks/` (`operations.ts:937-943`; `idForFilename` lowercases, `prefix-config.ts:441-444`). Sanitizer: `<>:"/\|?*` → `-`, strips `'(),!@#$%^&+=[\]{};`, whitespace runs → `-`, collapse/trim `-`, fallback `untitled` (`operations.ts:2341-2352`).
- Frontmatter written by the serializer (`src/markdown/serializer.ts:54-79`): `id,title,status,assignee[],reporter?,created_date,updated_date?,due_date?,labels[],milestone?,dependencies[],references?,documentation?,modified_files?,parent_task_id?,subtasks?,priority?,type?,project?,ordinal?,onStatusChange?`; blank line then body (`:104-106`).
- Parser tolerance (`src/markdown/parser.ts:41-140,177-235`): quoted/unquoted dates, `@name` assignees/reporters normalized, legacy `dd-mm-yy`/`dd/mm/yy`/`dd.mm.yy` date forms, CRLF.
- **Unknown frontmatter keys are dropped, not preserved.** The serializer writes only the keys it knows (the list above), so a field added by hand survives until the next CLI write and then disappears — measured 2026-10-20 on 1.54.0 in a throwaway backlog: `probe_key: keepme` added to a task file, `backlog task edit <id> -s "To Do"`, key gone. Anything that must persist belongs in a body section, whose `<!-- SECTION:… -->` markers the CLI maintains.
- Body sections (H2): Description, Acceptance Criteria, Definition of Done, Implementation Plan, Implementation Notes, Comments, Final Summary; accepted variants "Acceptance Criteria (Optional)", "Implementation Plan (Optional)", "Implementation Notes (Optional)", "Notes", "Notes & Comments (Optional)" (`src/markdown/section-titles.ts:1-22`). Machine markers: `<!-- SECTION:DESCRIPTION|PLAN|NOTES|FINAL_SUMMARY:BEGIN/END -->` (`src/markdown/structured-sections.ts:20-24,242-248`), `<!-- AC:BEGIN/END -->`, `<!-- DOD:BEGIN/END -->`, `<!-- COMMENTS:BEGIN/END -->`, `<!-- COMMENT:BEGIN/END -->` (`:39-46`). Checklists are `- [ ]`/`- [x]`.
- Hand-writing: files are plain frontmatter + markdown and parse, but shipped guidance forbids it — "Use the CLI for Backlog changes. Never edit task, draft, document, decision, or milestone markdown files directly; commands preserve metadata, relationships, and history." (`src/guidelines/cli-instructions/overview.md:41`). Legacy sections without markers can make a later replace/clear be **refused** while another `##` heading makes the boundary ambiguous (`CLI-INSTRUCTIONS.md:175-200`).

## 4. Config keys relevant to us

| Key | Meaning | Default | Source |
|---|---|---|---|
| `statuses` | Board columns; first = default | `["To Do","In Progress","Done"]` at init | `src/core/init.ts:141-144`, `src/constants/index.ts:44-52` |
| `labels` | Suggestion/filter list; **task labels are free-form** — no enum check on create/edit | `[]` | config `operations.ts:2459-2460`; MCP labels are plain strings `schema-generators.ts:105-112`; grep for label validation → none; filtering is case-insensitive `src/utils/label-filter.ts:3-5` |
| `priorities` | Ordered priority labels, first sorts highest; stored lowercase | High/Medium/Low | `src/types/index.ts:376-377`; `schema-generators.ts:126-137`; ADVANCED-CONFIG "Priority Values" |
| `types` | Allowed task types; untyped allowed | `bug,feature,enhancement,task,chore,docs,spike` | `constants/index.ts:60-63`; `schema-generators.ts:53-66` |
| `auto_commit` | Commit each mutating command's files | `false` | `constants/index.ts:85`; ADVANCED-CONFIG "Git Control" |
| `check_active_branches` / `active_branch_days` | Cross-branch task state lookups | `true` / `30` | `constants/index.ts:79-80` |
| `remote_operations` | Allow remote git (fetch, remote branches) | `true` | `constants/index.ts:80-81`; `git/operations.ts:594-603` |
| `filesystem_only` | Disable git integration entirely; `init --no-git` sets it and forces checkActiveBranches/remoteOperations/autoCommit/bypassGitHooks false | `false` | `core/init.ts:125-135`; `cli.ts:1740-1747`; `constants/index.ts:83` |
| `definition_of_done` | Project DoD defaults applied to new tasks; opt out per create with `--no-dod-defaults`/`disableDefinitionOfDoneDefaults` | `(not set)` | `README.md:369-387`; `schema-generators.ts:274-281` |
| `zero_padded_ids` | Pad task/doc/decision IDs (1–10 digits; subtask segment padded to 2) | disabled | `advanced-config-wizard.ts:320-348`; `prefix-config.ts:352-360,428-434` |
| `defaultAssignee`, `onStatusChange`, `taskResolutionStrategy` | defaults applied on create / status-change hook / `most_recent` | see init | `core/init.ts:141-160` |

Git-repo init default set (`DEFAULT_INIT_CONFIG`, `constants/index.ts:78-88`): auto_commit **false**, check_active_branches true, remote_operations true, filesystem_only false, bypass_git_hooks false, active_branch_days 30, default_port 6420, auto_open_browser true.

## 5. Git interaction

- **Nothing is ever pushed or pulled.** Grep of `execGit` calls in `src/git/operations.ts` shows only add/commit-tree/write-tree/rev-parse/ls-files/update-index/reset/status/branch/worktree/hook-run/fetch — no `push`, `pull`, or `merge`.
- `autoCommit` default false → commands only write files. With `true`, the command commits exactly what it changed; task commits are `"<ID> - <message>"`; `bypassGitHooks` adds `--no-verify` (`git/operations.ts:137-200`).
- Cross-branch checking does run **`git fetch`** on task reads when `check_active_branches !== false && remote_operations !== false && filesystem_only !== true`; deduplicated (~1 min reuse), forced before ID allocation ("an ID that looks free only because remote refs are up to a minute old is an ID another clone has already published") (`src/core/backlog.ts:1017-1064`). The fetch itself: `git fetch origin --prune --quiet`, skipped when remoteOperations is false or the repo has no remotes (`git/operations.ts:578-620`). Draft/doc/decision ID allocation also fetches (`src/utils/id-generators.ts:55-60,120-123`).

## 6. Archive / complete / cleanup

- `task archive <id>`: moves the file into `backlog/archive/tasks/` from **any** status, same filename and ID; record, dependencies and references kept; archived tasks are read-only and still viewable (`cli.ts:3970-3989`; `archiveTasksDir` at `operations.ts:483-485`).
- Done ≠ archived: finished work stays on the board in `tasks/` with the terminal status until periodic cleanup or explicit archive (overview guide, "Task Lifecycle").
- `task complete` **was removed**: a hidden stub prints "backlog task complete was removed. Use backlog task archive <id>." and exits 1 (`cli.ts:4039-4051`).
- `backlog cleanup`: interactive only (needs a TTY for input and output); archives terminal-status tasks older than a chosen age (1d…1y); non-TTY exits non-zero and archives nothing (`cli.ts:5924-6014`).
- Directories: writes go to `archive/tasks`; **readers also read legacy `backlog/completed`** (`ARCHIVED_TASK_DIRECTORIES = ["archive/tasks","completed"]`, `constants/index.ts:26-33`; `getArchivedTaskLocations` `operations.ts:645-662`; also `cross-branch-tasks.ts:80-92`, `task-loader.ts:58-62`). `backlog doctor` reports tasks in `completed`; `doctor --fix` moves them into `archive/tasks` without renaming (CLI-INSTRUCTIONS.md "Task Management" tail).
- Delete/restore: archive first, then `task delete` (no prompt; releases the ID when no branch/worktree holds it; refuses while subtasks exist as tasks or drafts); `task restore` returns it to the board with the same ID and status (`cli.ts:3991-4037`).

## 7. Milestones, dependencies, parent/subtasks, drafts, docs, decisions

- **Milestones**: files `backlog/milestones/m-<n> - <title>.md` (IDs start at `m-0`; title truncated to 50 chars in the filename) (`operations.ts:2120-2170`, `:1950-1952`); archive → `backlog/archive/milestones/`. Commands `milestone list [--show-completed] | add | rename | remove [--task-handling clear|keep|reassign] | archive` (`CLI-INSTRUCTIONS.md:258-277`; `cli.ts:4382-4571`). Tasks attach by milestone label/ID via `-m/--milestone`; `--parent` is explicitly *not* a milestone (`cli.ts:2013-2020`).
- **Dependencies**: `dependencies:` list of task IDs in frontmatter; `--dep`/`--depends-on` (comma lists accepted); validated existence; task view shows a derived, read-only "Dependency Graph"; a dependency on an archived task counts as satisfied only when that task is in the final status (`CLI-INSTRUCTIONS.md:309-348`; overview guide).
- **Parent/subtasks**: child carries `parent_task_id`; child IDs are dotted (`task-5.1`); `-p/--parent` on create, `task list --parent`; parents may also carry a `subtasks:` list (serialized when set, parsed when present, derived by `attachSubtaskSummaries`) (`src/utils/task-subtasks.ts:6-38`; `serializer.ts:67`).
- **Drafts**: `backlog/drafts/draft-<n> - Title.md`; commands `draft create|list|edit|view|archive|promote`, plus `task create --draft` and `task demote <id>`; archive → `backlog/archive/drafts/` (promote assigns the next task ID and the default status) (`cli.ts:4158-4371`; `operations.ts:1290-1310`; `core/backlog.ts:3153-3160`).
- **Docs**: `backlog/docs/**` (nested subdirs allowed; IDs global across the tree; `path` must be docs-relative, `..` rejected); commands `doc create|list|view|update|archive|restore|delete|search`; archive keeps the relative path under `backlog/archive/docs/` (`src/mcp/README.md` documents section; `constants/index.ts:20-21`).
- **Decisions**: `backlog/decisions/decision-<n> - Title.md` (flat); commands `decision create <title> [-s status] | edit <id> <status> | list | archive | restore | delete`; archive → `backlog/archive/decisions/`; no single-decision view command yet (`CLI-INSTRUCTIONS.md:392-406`).

## 8. Windows caveats observed in source

- `mcp start` skips the stdin `"close"` listener on win32 ("stdin can emit close while the MCP stdio pipe is still usable") and registers no SIGHUP/SIGPIPE handlers (`src/commands/mcp.ts:77-100`).
- Git runs via `Bun.spawn` with explicit stdio because inherited stdin can deadlock under MCP stdio; no process-group kill on win32 (`git/operations.ts:1097-1106,1152-1155`).
- Paths handed to git are converted to forward slashes "to avoid Windows encoding issues" (`git/operations.ts:128-131`).
- Sync file reads on Windows to avoid hangs (agent-instruction files `src/agent-instructions.ts:150-158,214-217`; config existence probe `operations.ts:2306`).
- Default editor fallback on win32 is `notepad` (`src/utils/editor.ts:10-11`).
- `backlog completion install` targets PowerShell 7+ (`pwsh`) with Program Files fallbacks (`src/commands/completion.ts:38-86`).
- TERM coerced to `xterm-256color` when unset/dumb (`cli.ts:900-905`).
- Markdown I/O tolerates CRLF and BOM (`parser.ts:41-42,146-150`; `src/test/cli-decision-status.test.ts:62-72`). watch-json notes POSIX reparents orphans, Windows does not (`src/commands/watch-json.ts:12-15`).
- [INFERENCE] Symlink-heavy flows are unverified on Windows: tests skip them (privileges/POSIX modes) (`src/test/archived-task-folders.test.ts:16-17,386-387`; `src/test/cli-doc-archive.test.ts:468-470`). Treat symlinked backlog folders as unverified on Windows.

## 9. Official agent workflow guidance (`backlog instructions`, quoted from the printed source text)

Command: `backlog instructions [overview|task-creation|task-execution|task-finalization|init-required]`; bare prints an index (`src/commands/instructions.ts:31-89`; keys `src/mcp/workflow-guides.ts:16-17`). Quotes below were checked against the 1.54.0 binary's output.

**overview** (`src/guidelines/cli-instructions/overview.md`): "Create a task when work requires planning, decisions, or handoff notes. Search for an existing task first."; "Read the matching guide before taking these actions; this overview does not replace it"; "Mark finished work Done (or the configured final status) and leave it on the board until periodic cleanup."; "Use the CLI for Backlog changes. Never edit task, draft, document, decision, or milestone markdown files directly" (`:41`).

**task-creation**: "Always check whether the work is already tracked."; the single-PR test ("Can this be completed in a single focused pull request?"); subtasks when work "shares one goal and one subsystem", dependencies when it "spans independent components"; "For future work, do **not** add an implementation plan or speculative code approach during task creation"; ACs must be "specific, testable, and independent"; literal backticks must be single-quoted so the shell passes them literally.

**task-execution**: "Read the task before mutating it"; "Mark it in progress and assign yourself" (`-s "<active status>" -a @your-name`); "Research the current system… Do not rely on an implementation approach proposed when the task was created."; "Record the current plan in the task before implementation" (`--plan`); "If the plan contains a material product, architecture, or workflow decision … wait for explicit approval before implementation."; "Do not check acceptance criteria, write the final summary, or move the task to the terminal status from this guide alone."; "Do not silently expand the task."; short loops of implement → test → `--append-notes`; comments via `--comment [--comment-author @name]`.

**task-finalization**: "Check only proven items with `backlog task edit <id> --check-ac 1 --check-dod 1`. Resolve failures before finishing."; "Code presence, grep output, and implementation intent are not verification evidence."; "Write a concise `--final-summary` explaining what changed, why, verification results, and relevant risks or follow-ups."; "Do not create or start follow-up tasks without user approval."

**init-required**: "This directory does not have Backlog.md initialized. … run `backlog init` (`--defaults` for non-interactive, `--no-git` without Git)."

The same rules are installed as a nudge block into `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/`.github/copilot-instructions.md` by `backlog init` and `backlog agents --update-instructions` (`src/agent-instructions.ts:129-135`); the block is visible verbatim at `AGENTS.md:104-125` ("At the beginning of each conversation in this project, run `backlog instructions overview` …"; "Do not edit Backlog task, draft, document, decision, or milestone markdown files directly.").

## Not found / not verified

- Task-prefix length limit: **none found** — only the letters-only regex (checked `prefix-config.ts`, `cli.ts`, `config-watcher.ts`, init wizard, web init screen).
- Legacy/alias prefix or ID-import: **none found** (greps listed in §2; command inventory `cli.ts:1938,2180,4158,4382,4576,4776,5057,5194,5269,5749,5925,6039,6118`).
- Byte-identical guide text was not diffed; the quoted sentences were matched in the binary's output (see Verification above).
