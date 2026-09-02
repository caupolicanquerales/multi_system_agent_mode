---
name: orchestrator-javaparser-flow
description: "JavaParser AST report generation flow for the Orchestrator: builds and runs generate-javaparser-report.bat to produce business-ast-report.json and dependency-tree.txt. Windows-only. Loaded only as a short-circuit from Command Flow when command is 'javaparser'/'generate_javaparser_report' — keeps batch invocation rules and OS checks out of standard compile/test requests."
---

## JavaParser Report Flow

⛔ Triggered only as a short-circuit from [orchestrator-command-flow](.github/skills/orchestrator-command-flow/SKILL.md) Step 2 when `command` is `"javaparser"` or `"generate_javaparser_report"` — CommandGenerator is skipped entirely for this path.
⛔ Do NOT call `manage_todo_list` for this flow — it is a single-step direct execution, not a multi-step workflow.

1. Read `project_location` and `os` from the cache entry resolved in Command Flow Step 1 / Step 1b (same key rules as [orchestrator-cache-spec](.github/skills/orchestrator-cache-spec/SKILL.md)).
2. Derive `<msam_root>` from the workspace folder list — do NOT hardcode usernames. The JAR lives at `<msam_root>\.github\tools\javaparser-0.0.1-SNAPSHOT.jar`; pass the containing directory as the second bat argument.
3. ⛔ If `os != "windows"`, inform the user that JavaParser report generation requires Windows and stop.
4. Set the following synthetic payload (no CommandGenerator call):
   ```
   terminal_command  = & "<msam_root>\.github\tools\generate-javaparser-report.bat" "<project_location>" "<msam_root>\.github\tools"
   display_label     = Generate JavaParser Report
   confirmation_message = Running JavaParser AST report for <project_name>
   ```
5. Return to [orchestrator-command-flow](.github/skills/orchestrator-command-flow/SKILL.md) — jump directly to **Step 3** (display and run) with this synthetic payload.
