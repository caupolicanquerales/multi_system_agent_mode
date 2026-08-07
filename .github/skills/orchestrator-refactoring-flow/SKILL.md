---
name: orchestrator-refactoring-flow
description: "Refactoring Flow execution spec for the Orchestrator: confirms with the user, calls TechnicalExecuter with the MIGRATION_PLAN.md path, and surfaces the apply result."
---

## Refactoring Flow

1. **Identify project and migration report:**
   - Extract `project_name` from the message if present; resolve `project_path` from the workspace.
   - If `project_name` is absent, search the workspace for `MIGRATION_PLAN.md`, `JAVA21_REFACTORING_PLAN.md`, or `SPRINGBOOT3_MIGRATION_PLAN.md` using `file_search`.
     - **Exactly one found** → infer `project_name` and `report_path` from its location and proceed automatically.
     - **Multiple found** → `vscode_askQuestions` listing the found plans; ask the user which one to apply.
     - **None found** → `vscode_askQuestions` asking for project name and report path.
2. **Confirm** — `vscode_askQuestions` (header: Apply Refactoring Plan, options: Apply Changes *(recommended)*, Cancel). If Cancel: stop.
3. **Call TechnicalExecuter** with:
   ```
   Apply the migration refactoring plan for the following project:
   Project name: <project_name>
   Project path: <absolute_path_to_project_root>
   Report file: <absolute_path_to_project_root>/<REPORT_FILE>.md
   Skill files:
     - multi_system_agent_mode/.github/skills/java21-inspection-rules/SKILL.md
     - multi_system_agent_mode/.github/skills/springboot3-inspection-rules/SKILL.md
   ```
   Await `{ status, project_name, total_findings, applied, skipped, failed, changed_files, cascade_warnings, error }`.
4. **Notify user:**
   - `failure` → `vscode_askQuestions` (header: Refactoring Failed, options: OK). Stop.
   - `success` → `vscode_askQuestions` (header: Refactoring Applied) with applied/skipped/failed counts and changed files. If `cascade_warnings` non-empty, include cascade warning. Options: OK *(recommended)*. Stop.
