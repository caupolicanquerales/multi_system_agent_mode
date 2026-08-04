---
name: technical-executer-execution-heuristics
description: "Contains the execution heuristics for the TechnicalExecuter agent: snippet confirmation, on-demand rule validation, structural validation, and cascade warning rules. Loaded on demand via JTI pattern."
user-invocable: false
---

# Technical Executer — Execution Heuristics

## Heuristic 1 — Snippet Confirmation

Use the `Line` value from the plan as a center point. Call `read_file` with `startLine = target_line - 10`, `endLine = target_line + 10` to confirm each snippet. For files under 150 lines, a single full read is acceptable.

Locate each `Current code` by **exact text match** (not by line number — numbers may have shifted). When matching, normalize line endings (`\r\n` → `\n`); use the line endings native to the target file when constructing `oldString`.

If a snippet is not found after normalization: mark finding as `skipped ("already applied or not found")` and continue.

## Heuristic 2 — On-Demand Rule Validation

Before applying a finding for rule N of skill S:

1. Check session cache. If rule N of skill S was already extracted, use the cached text.
2. Otherwise: `grep_search` skill file S for `"### N."` (or `"### SBN."` for springboot3) to get the section line. Then `read_file [match_line, match_line + 60]`. Cache result.
3. Confirm the `Current code` matches the rule's "Before" pattern and the `Replacement` matches the rule's "After" pattern. If mismatched, mark finding as `skipped ("plan snippet does not match rule pattern")`.

## Heuristic 3 — Apply

Call `replace_string_in_file` with:
- `oldString`: Current code snippet + at least 2 surrounding context lines (for uniqueness).
- `newString`: Suggested replacement snippet.

Apply findings in report order to avoid position conflicts within the same file. One finding per `replace_string_in_file` call — never batch.

## Heuristic 4 — Structural Validation

After all findings for a file are applied, re-read only the affected line ranges and verify:
- Braces, parentheses, brackets are balanced.
- No method signatures truncated, no imports removed accidentally.
- Code is syntactically coherent as Java source.

If structurally broken: revert affected finding (swap `oldString`/`newString`), mark as `failed`, continue.

## Heuristic 5 — Cascade Warnings

If a **java21 Rule 1 (Records)** conversion was applied, add to `cascade_warnings`:
> `"<ClassName> converted to record — verify callers use accessor methods (.field() not .getField())"`

If a **springboot3 Rule SB3 (javax→jakarta)** change was applied, add to `cascade_warnings`:
> `"javax→jakarta applied in <FileName> — verify transitive dependencies also use jakarta namespace"`

Do not attempt to fix callers or dependencies not listed in the plan.

## Heuristic 6 — Progress Tracking

Mark each finding `completed` in `manage_todo_list`.

**Chain-of-thought per finding:** one line only: `"Finding N.N — applied / skipped / failed"`. Detail only on failures.
