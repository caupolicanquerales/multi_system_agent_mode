---
name: orchestrator-report-flow
description: "Report Flow execution spec for the Orchestrator: identifies the project, calls TechnicalReporter with skill files, and surfaces the report result with Apply Changes / Open Report / OK options."
---

## Report Flow

1. **Identify project** — extract project name from message; if absent, ask via `vscode_askQuestions` with workspace folders as options.
2. **Call TechnicalReporter** with:
   ```
   Generate a migration report for the following project:
   Project name: <project_name>
   Project path: <absolute_path_to_project_root>
   Skill files:
     - multi_system_agent_mode/.github/skills/java21-inspection-rules/SKILL.md
     - multi_system_agent_mode/.github/skills/springboot3-inspection-rules/SKILL.md
   ```
   Await `{ status, report_path, files_scanned, total_findings, error }`.
3. **Notify user:**
   - `failure` → `vscode_askQuestions` (header: Report Generation Failed, options: OK). Stop.
   - `success` → `vscode_askQuestions` (header: Functional Report Ready, options: Apply Changes *(recommended)*, Open Report, OK).
     - *Apply Changes*: jump to **Refactoring Flow** step 2 passing `project_name` + `report_path`.
     - *Open Report*: `run_in_terminal` `code <report_path>`. Stop.
     - *OK*: acknowledge. Stop.
