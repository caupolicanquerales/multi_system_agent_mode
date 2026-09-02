---
name: orchestrator-refactoring-flow
description: "Refactoring Flow execution spec for the Orchestrator: confirms with the user, calls TechnicalExecuter with the MIGRATION_PLAN.md path, surfaces the apply result, and optionally runs the JavaParser post-migration AST report."
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
   - `success` → `vscode_askQuestions` (header: Refactoring Applied) with applied/skipped/failed counts and changed files. If `cascade_warnings` non-empty, include cascade warning. Options: **Generate JavaParser Report** *(recommended)*, OK.
     - *OK*: stop.
     - *Generate JavaParser Report*: proceed to **Step 5**.

5. **Generate JavaParser Report (post-migration AST analysis)**

   **Resolve cache entry** — in order:
   1. Look up `project_context[<project_name>]` (using the same key rules defined in [orchestrator-cache-spec](.github/skills/orchestrator-cache-spec/SKILL.md)). If a valid entry exists, read `project_location`, `os`, and `hasMavenWrapper` directly from it.
   2. If no valid entry exists, call CommandExtractor with the project name to obtain the full payload, then write it into `project_context[<project_name>]` before continuing. Extract `project_location`, `os`, and `hasMavenWrapper` from the new entry.

   ⛔ This step is Windows-only (`.bat`). If `os != "windows"` from the resolved cache entry, inform the user that JavaParser report generation requires Windows and stop.

   **Resolve `<msam_root>`** from the workspace folder list — do NOT hardcode usernames. The JAR `javapaser-0.0.1-SNAPSHOT.jar` lives inside `<msam_root>\.github\tools`; that directory is passed as the second bat argument.

   **Construct and run the command** via `run_in_terminal` (mode: sync, timeout: 300000):
   ```powershell
   # arg1 = TARGET_DIR (project root), arg2 = dir containing javapaser-0.0.1-SNAPSHOT.jar
   & "<msam_root>\.github\tools\generate-javaparser-report.bat" "<project_location>" "<msam_root>\.github\tools"
   ```
   The bat uses `hasMavenWrapper` implicitly: it checks for `mvnw.cmd` at `<project_location>\mvnw.cmd` itself — do NOT pass this flag as an argument.

   **Evaluate exit code:**
   - `exitCode == 0` → inform the user that `business-ast-report.json` and `dependency-tree.txt` were generated inside `<project_location>`. Ask (`vscode_askQuestions`, header: Generate Modernization Report, options: **Generate Report** *(recommended)*, OK) whether to proceed to **Step 6**.
     - *OK*: stop.
     - *Generate Report*: proceed to **Step 6**.
   - `exitCode != 0` → surface the terminal output and ask the user to review. Stop.

6. **Generate Modernization Report (post-migration scoring)**

   Reuse the same `project_context[<project_name>]` cache entry resolved in Step 5 — do not re-resolve it. Read `project_location` and `os` from it.

   **Call MetricsAnalyzer** (`agent` tool, `name: MetricsAnalyzer`) with:
   ```
   Project name: <project_name>
   Project path: <project_location>
   OS: <os>
   ```
   MetricsAnalyzer owns its own user confirmation before executing `metrics-calculater.js` — do not ask the user again beforehand.

   Await `{ status, report_path, modernization_score, verdict, error }`.
   - `status == "cancelled"` → stop, no further message needed (MetricsAnalyzer already handled the user prompt).
   - `status == "failure"` → `vscode_askQuestions` (header: Modernization Report Failed, options: OK) surfacing `error`. Stop.
   - `status == "success"` → inform the user that `MODERNIZATION_REPORT.md` was generated at `report_path`, including `modernization_score` and `verdict`. Stop.
