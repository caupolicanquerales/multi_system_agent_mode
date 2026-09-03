---
name: orchestrator-modernization-flow
description: "Modernization Report Flow execution spec for the Orchestrator: resolves the project via the shared Session Context Cache and calls MetricsAnalyzer to score the project and generate MODERNIZATION_REPORT.md. Loaded only when the Modernization Report Flow is triggered."
---

## Modernization Flow

⛔ Standalone flow — triggered when the Orchestrator's Decision Routing resolves to **Modernization Report Flow**. It does not run the Command Flow step chain; it only needs the cache mechanics from [orchestrator-cache-spec](.github/skills/orchestrator-cache-spec/SKILL.md) (load that skill now if the cache entry needs resolving).

1. **Resolve project target from Session Cache:**
   - Look up `project_context[<project_name>]` (or `last_active_project` if no project name is provided), per [orchestrator-cache-spec](.github/skills/orchestrator-cache-spec/SKILL.md).
   - **Cache Entry Found (valid):** Extract `project_name`, `project_location`, and `os` directly — skip CommandExtractor entirely.
   - **Cache Entry Missing/Invalid:** Call `CommandExtractor` with the user prompt to resolve `project_name`, `project_location`, and `os`, then store the full payload in `project_context[<project_name>]` and update `last_active_project`.
   - If no project can be identified either way, `vscode_askQuestions` asking for the project name.

2. **Call MetricsAnalyzer:**
   Call `MetricsAnalyzer` (`agent` tool, `name: MetricsAnalyzer`) using the resolved cache data:
   ```
   Project name: <project_name>
   Project path: <project_location>
   OS: <os>
   ```
   ⛔ MetricsAnalyzer owns its own run confirmation (before executing `metrics-calculater.js`) and its own check for `business-ast-report.json`/`dependency-tree.txt` — do NOT ask the user to confirm beforehand, and do NOT verify those files yourself.

3. **Surface the result** — await `{ status, report_path, modernization_score, verdict, error }`:
   - `status == "cancelled"` → stop silently; MetricsAnalyzer already handled the user prompt.
   - `status == "failure"` → `vscode_askQuestions` (header: Modernization Report Failed, options: OK) surfacing `error`.
   - `status == "success"` → inform the user that `MODERNIZATION_REPORT.md` was generated at `report_path`, including `modernization_score` and `verdict`. Then proceed to **Step 4**.

4. **Missing main class check** — only when Step 3 was `"success"`:
   - `read_file` `<project_location>/modernization-metrics.json`, lines 1–200.
   - `crossCorrelation.hasSpringBootMainClass == false` → load [main-class-generation-flow](.github/skills/main-class-generation-flow/SKILL.md) now and follow it exactly, passing `project_name`, `project_location`, `os`.
   - `crossCorrelation.hasSpringBootMainClass == true` (or field absent/unreadable) → stop, nothing further to do.

⛔ Never call TechnicalReporter or CommandGenerator directly in this flow — MetricsAnalyzer and main-class-generation-flow handle all scoring and generation tool executions. Step 4's `read_file` on `modernization-metrics.json` is permitted solely for condition checking, and JavaParser execution is permitted upon recalculation request from `main-class-generation-flow`.
