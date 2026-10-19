---
name: doc-tools
description: >
  Document search and conversion tools — rga for searching inside PDFs, DOCXs,
  ebooks, and archives; markitdown for converting binary documents to structured
  markdown. Use when working with PDFs, Word docs, presentations, spreadsheets,
  or any document format that OMP's grep can't search inside.
---

# Document tools

**rga** (ripgrep-all) searches inside PDFs, DOCXs, ebooks, archives, and media
metadata. **markitdown** converts binary docs to structured markdown the LLM
can read.

Binaries:
- `~/repos/unified-search/bin/rga`
- `~/.local/bin/markitdown`

## When to use which

| Situation | Use | Why |
|-----------|-----|-----|
| Search inside many PDFs/DOCXs at once | `rga 'pattern' --glob '*.pdf'` | One command, format-aware |
| Extract a single doc for the LLM to read | `markitdown file.pdf` | Structured output: headings, tables, lists preserved |
| rga PDF broken (bundled Windows binary) | `markitdown file.pdf \| rg 'pattern'` | Convert then search — fallback when rga-preproc is missing |
| Batch convert docs for indexing | `markitdown` pipeline | Convert all → duckdb FTS or grep over output |
| Quick check if a PDF mentions a term | `rga 'term' file.pdf` | Single command, no intermediate files |
| Search inside a DOCX | `rga 'pattern' file.docx` | DOCX is a zip — rga extracts and searches |

## Quick reference

```bash
# Search across all PDFs in a directory
rga 'quarterly revenue' --glob '*.pdf' reports/

# Convert a PDF to markdown for the LLM
markitdown report.pdf

# Convert then search (Windows fallback when rga PDF is broken)
markitdown file.pdf | rg 'pattern'

# Batch convert all DOCX files in a directory
for f in *.docx; do markitdown "$f" > "${f%.docx}.md"; done
```

## Pitfalls

- **rga PDF is broken on the bundled Windows binary** — it's missing `rga-preproc`. Text search works. For PDF/DOCX content, use markitdown → grep.
- **For tables inside PDFs**: markitdown preserves table structure better than rga's text extraction.
- **Large documents**: pipe through `head -100` before showing the LLM to save context.
