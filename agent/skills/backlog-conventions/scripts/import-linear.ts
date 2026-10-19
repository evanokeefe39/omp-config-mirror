#!/usr/bin/env bun
/**
 * Import one repo's old Linear tickets into its Backlog.md board from the frozen export
 * (skill://backlog-conventions `## Importing old Linear tickets`). Linear itself is not
 * contacted: the export is the only source.
 *
 * Usage: bun import-linear.ts <repo-root> <project | SOLO-1,SOLO-2,...> [export.json]
 *   export.json defaults to ~/.omp/backlog/linear-export.json (all 354 SOLO issues,
 *   exported 2026-10-17). The selector is a Linear project name (as in the export's
 *   `project` field) or an explicit comma list of IDs, for issues that had no project.
 *
 * Pre: <repo-root>/backlog/config.yml exists (the repo's backlog is initialised), the
 *      `backlog` CLI (1.54.x) is on PATH, and the selector matches at least one issue.
 * Post: every selected issue has a record `backlog/linear/solo-<n> - <title>.md`
 *       (Backlog.md task format, ID SOLO-<n>, never read by the tool because the board's
 *       prefix differs); every open one also has a live task created through the CLI whose
 *       description starts `Imported from SOLO-<n>.`, with the description's criteria
 *       blocks moved into `--ac` / `--dod` fields (splitCriteria). Re-running skips issues whose record
 *       exists. Exits 1 when any issue was neither imported nor skipped, or on a CLI failure.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where the one-time export of team SOLO lives (committed in omp-home). */
const DEFAULT_EXPORT = join(homedir(), ".omp", "backlog", "linear-export.json");
const ID_LIST = /^SOLO-\d+(,SOLO-\d+)*$/i;

type Issue = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  statusType: string;
  labels?: string[];
  priority?: { value: number } | number | null;
  createdAt: string;
  completedAt?: string | null;
  canceledAt?: string | null;
  url?: string | null;
  projectMilestone?: { name: string } | null;
};

/** Linear status types that mean the work is still open and belongs on the live board. */
const OPEN_TYPES: Record<string, true> = { backlog: true, unstarted: true, started: true, triage: true };
/** Linear priority value -> Backlog.md default priority (0 = none: omitted). */
const PRIORITY: Record<number, string> = { 1: "high", 2: "high", 3: "medium", 4: "low" };

/** Same character rules as upstream's filename sanitizer (operations.ts:2341-2352). */
function sanitize(title: string): string {
  const s = title
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/['(),!@#$%^&+=[\]{};]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (s || "untitled").slice(0, 100);
}

/** Linear ISO timestamp -> Backlog.md canonical `yyyy-mm-dd hh:mm` (UTC). */
const date = (iso?: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : null);
const q = (s: string) => JSON.stringify(s); // a JSON string is a valid YAML double-quoted scalar
const priorityOf = (p: Issue["priority"]) =>
  PRIORITY[typeof p === "number" ? p : (p?.value ?? 0)];

function record(issue: Issue): string {
  const fm = [
    "---",
    `id: ${issue.id.toUpperCase()}`,
    `title: ${q(issue.title)}`,
    `status: ${q(issue.status)}`,
    "assignee: []",
    `created_date: '${date(issue.createdAt)}'`,
    ...(issue.completedAt || issue.canceledAt
      ? [`updated_date: '${date(issue.completedAt ?? issue.canceledAt)}'`]
      : []),
    `labels: [${(issue.labels ?? []).map(q).join(", ")}]`,
    ...(issue.projectMilestone ? [`milestone: ${q(issue.projectMilestone.name)}`] : []),
    "dependencies: []",
    ...(issue.url ? [`references: [${q(issue.url)}]`] : []),
    ...(priorityOf(issue.priority) ? [`priority: ${priorityOf(issue.priority)}`] : []),
    "---",
  ];
  const body = [
    "",
    "## Description",
    "",
    "<!-- SECTION:DESCRIPTION:BEGIN -->",
    (issue.description ?? "").trim() || "No description in Linear.",
    "<!-- SECTION:DESCRIPTION:END -->",
    "",
  ];
  return [...fm, ...body].join("\n");
}

/**
 * Criteria a Linear description carries as prose, so they can become `--ac` / `--dod`
 * fields (skill `## Tasks`: criteria are fields, never description prose — prose
 * criteria show as "Acceptance criteria: none" on the board).
 *
 * Forms seen in the export's open issues (2026-10-18): a heading `## Acceptance`,
 * `## Acceptance Criteria`, `## Done when`, `## Definition of done`, or a bold-only line
 * `**Acceptance**`, each followed by a list or a paragraph; and a one-line
 * `**Done when:** text` / `**Acceptance.** text`. Acceptance and "done when" are
 * acceptance criteria; "definition of done" and "evidence of done" are DoD items.
 *
 * A block is, after the heading: at most one leading paragraph (one item), then a list
 * (one item per bullet; only indented lines continue a bullet; blank lines between
 * bullets are allowed). It ends at the first line that is none of these — a paragraph
 * after the list, a heading of the same or higher level, a bold-led line, a fence —
 * and that line stays in the description. Lines inside a code fence are never read as
 * headings. A heading with nothing under it stays in the description. No text is
 * dropped: every line is either kept or part of exactly one item.
 * @returns the description without the criteria blocks, plus the extracted items.
 */
export function splitCriteria(description: string): { description: string; ac: string[]; dod: string[] } {
  const NAME = String.raw`(acceptance(?: criteria)?|done when|definition of done|evidence of done)(?:\s*\([^)]*\))?`;
  const HEADING = new RegExp(String.raw`^(#{1,6})\s*${NAME}\s*[.:]?\s*$`, "i");
  const BOLD_HEADING = new RegExp(String.raw`^\*\*${NAME}\s*[.:]?\s*\*\*\s*[.:]?\s*$`, "i");
  const BOLD_INLINE = new RegExp(String.raw`^\*\*${NAME}\s*[.:]?\s*\*\*\s*[.:]?\s+(\S.*)$`, "i");
  const FENCE = /^\s{0,3}(```|~~~)/;
  const ANY_HEADING = /^(#{1,6})\s/;
  const BULLET = /^ ?(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.*)$/;
  const CONTINUATION = /^\s{2,}\S/;
  const isDod = (name: string) => /definition|evidence/i.test(name);
  /** A line that starts something else, so it can never continue a paragraph or bullet. */
  const structural = (l: string) => FENCE.test(l) || ANY_HEADING.test(l) || /^\*\*/.test(l) || BULLET.test(l);

  const lines = description.split(/\r?\n/);
  const keep: string[] = [];
  const ac: string[] = [];
  const dod: string[] = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (FENCE.test(line)) { inFence = !inFence; keep.push(line); i++; continue; }
    if (inFence) { keep.push(line); i++; continue; }

    const inline = BOLD_INLINE.exec(line);
    if (inline) {
      const parts = [inline[2].trim()];
      i++;
      while (i < lines.length && lines[i].trim() !== "" && !structural(lines[i])) parts.push(lines[i++].trim());
      (isDod(inline[1]) ? dod : ac).push(parts.join(" "));
      continue;
    }

    const heading = HEADING.exec(line);
    const bold = heading ? null : BOLD_HEADING.exec(line);
    if (!heading && !bold) { keep.push(line); i++; continue; }
    const name = heading ? heading[2] : bold![1];
    const items: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    // At most one leading paragraph.
    if (j < lines.length && !structural(lines[j])) {
      const parts: string[] = [];
      while (j < lines.length && lines[j].trim() !== "" && !structural(lines[j])) parts.push(lines[j++].trim());
      items.push(parts.join(" "));
      let k = j;
      while (k < lines.length && lines[k].trim() === "") k++;
      if (k < lines.length && BULLET.test(lines[k])) j = k;
    }
    // Then a list.
    while (j < lines.length) {
      const m = BULLET.exec(lines[j]);
      if (m) { items.push(m[1].trim()); j++; continue; }
      // Only reached straight after a bullet or its continuation: a blank line either jumps to the next bullet or ends the list.
      if (CONTINUATION.test(lines[j]) && !FENCE.test(lines[j]) && items.length) {
        items[items.length - 1] += ` ${lines[j].trim()}`;
        j++;
        continue;
      }
      if (lines[j].trim() === "") {
        let k = j;
        while (k < lines.length && lines[k].trim() === "") k++;
        if (k < lines.length && BULLET.test(lines[k]) && items.length) { j = k; continue; }
      }
      break;
    }
    const kept = items.filter((t) => t !== "");
    if (!kept.length) { keep.push(line); i++; continue; }
    (isDod(name) ? dod : ac).push(...kept);
    i = j;
  }
  return { description: keep.join("\n").replace(/\n{3,}/g, "\n\n").trim(), ac, dod };
}

function createLive(issue: Issue, root: string): string {
  const { description, ac, dod } = splitCriteria((issue.description ?? "").trim());
  const args = [
    "backlog", "task", "create", issue.title,
    "-d", `Imported from ${issue.id.toUpperCase()}.\n\n${description}`,
    "-s", issue.statusType === "started" ? "In Progress" : "To Do",
    "--no-dod-defaults", "--plain",
  ];
  for (const a of ac) args.push("--ac", a);
  for (const d of dod) args.push("--dod", d);
  const labels = issue.labels ?? [];
  if (labels.length) args.push("-l", labels.join(","));
  const pr = priorityOf(issue.priority);
  if (pr) args.push("--priority", pr);
  if (issue.url) args.push("--ref", issue.url);
  const r = Bun.spawnSync(args, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const out = r.stdout.toString();
  if (r.exitCode !== 0) throw new Error(`backlog task create failed for ${issue.id}: ${r.stderr.toString() || out}`);
  const m = out.match(/Task (\S+) - /);
  if (!m) throw new Error(`no task id in CLI output for ${issue.id}: ${out.slice(0, 300)}`);
  return m[1];
}

function main(): number {
  const [root, selector, exportPath = DEFAULT_EXPORT] = process.argv.slice(2);
  if (!root || !selector) {
    console.error("usage: bun import-linear.ts <repo-root> <project | SOLO-1,SOLO-2,...> [export.json]");
    return 2;
  }
  if (!existsSync(join(root, "backlog", "config.yml"))) {
    console.error(`no backlog/config.yml under ${root}: initialise the backlog first (skill ## Setting up a repo)`);
    return 2;
  }
  const all: (Issue & { project?: string | null })[] = JSON.parse(readFileSync(exportPath, "utf-8"));
  const wanted = ID_LIST.test(selector) ? selector.toUpperCase().split(",") : null;
  const issues = all.filter((i) => (wanted ? wanted.includes(i.id.toUpperCase()) : i.project === selector));
  if (issues.length === 0 || (wanted && issues.length !== wanted.length)) {
    console.error(`selector ${selector} matched ${issues.length} issue(s) in ${exportPath}; nothing imported`);
    return 1;
  }
  const dir = join(root, "backlog", "linear");
  mkdirSync(dir, { recursive: true });
  const existing = new Set(readdirSync(dir).map((f) => f.split(" - ")[0]));

  let records = 0, live = 0, skipped = 0;
  for (const issue of issues) {
    const key = issue.id.toLowerCase();
    if (existing.has(key)) { skipped++; continue; }
    if (OPEN_TYPES[issue.statusType]) {
      const id = createLive(issue, root);
      console.log(`${issue.id} -> ${id}`);
      live++;
    }
    // Record last: its presence is what marks the issue imported for a re-run.
    writeFileSync(join(dir, `${key} - ${sanitize(issue.title)}.md`), record(issue), "utf-8");
    records++;
  }
  console.log(`dump ${issues.length} | records written ${records} | live tasks ${live} | skipped (already imported) ${skipped}`);
  return records + skipped === issues.length ? 0 : 1;
}

if (import.meta.main) process.exit(main());
