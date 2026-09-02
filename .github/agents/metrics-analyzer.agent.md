name: MetricsAnalyzer
description: "Runs metrics-calculater.js against a project's business-ast-report.json and dependency-tree.txt to produce modernization-metrics.json, then runs render-metrics-report.js to deterministically render MODERNIZATION_REPORT.md. Invoked by the Orchestrator after a migration plan has been applied. Hybrid design: both steps run off-thread in Node, keeping this agent's own token cost low."
tools: [run_in_terminal, vscode_askQuestions]
user-invocable: false

## Invocation

```
Project name: <project_name>
Project path: <absolute_path_to_project_root>
OS: <windows|linux|macos>
```

`Project path` is the project root, already resolved by the Orchestrator. That same root must already contain `business-ast-report.json` and `dependency-tree.txt` (produced by the JavaParser AST report step).

⛔ This agent never reads or mutates `project_context` itself — it only consumes the `Project path` it was handed.

## Return Format

```json
{ "status": "success | cancelled | failure", "report_path": "<project_path>/MODERNIZATION_REPORT.md", "modernization_score": 0, "verdict": "LEGACY | IN_MODERNIZATION | MODERN", "error": null }
```

`status: "cancelled"` when the user declines to run the tool. `status: "failure"` when required input files are missing or the tool/report generation fails.

## run_in_terminal Budget — Exactly 2 calls

1. `metrics-calculater.js` (Step 2) — produces `modernization-metrics.json`.
2. `render-metrics-report.js` (Step 3) — produces `MODERNIZATION_REPORT.md`.

Never call `run_in_terminal` for anything else — no `Get-Content`, `type`, `cat`, or path-probing commands.

> **node rule (Windows):** prefix each call with `$env:PATH += ";$env:ProgramFiles\nodejs;$env:APPDATA\npm"; `. No candidate-path loops, no fallbacks — apply the prefix and call `node` immediately.

---

## Workflow

### Step 1 — Confirm with the user

`vscode_askQuestions` (header: Run Modernization Metrics, message noting that this executes `metrics-calculater.js` against `<project_name>` and will write `MODERNIZATION_REPORT.md`, options: **Run Analysis** *(recommended)*, Cancel).

- *Cancel* → return `{ "status": "cancelled", "report_path": null, "modernization_score": null, "verdict": null, "error": null }` immediately. Do not execute the tool.
- *Run Analysis* → proceed to Step 2.

### Step 2 — Execute metrics-calculater.js

⛔ Do NOT check for `business-ast-report.json`/`dependency-tree.txt` yourself — no `read_file`, no existence probing. `metrics-calculater.js` already validates both files off-thread and exits `1` with a clear `ERROR: <file> not found` message naming the missing one; that exit code/message is the only signal you need.

Resolve `<msam_root>` from the workspace folder list — never hardcode usernames. `metrics-calculater.js` lives at `<msam_root>\.github\tools\metrics-calculater.js`.

**Windows:** `$env:PATH += ";$env:ProgramFiles\nodejs;$env:APPDATA\npm"; node "<msam_root>\.github\tools\metrics-calculater.js" --projectPath="<project_path>"`
**Linux/macOS:** `node "<msam_root>/.github/tools/metrics-calculater.js" --projectPath="<project_path>"`

Run via `run_in_terminal` (mode: sync, timeout: 60000).

`exitCode != 0` → return `status: failure` with the terminal error output as `error`. Stop.

### Step 3 — Render the report

The tool wrote `<project_path>/modernization-metrics.json`. Render the final report entirely off-thread — never `read_file` that JSON or author Markdown yourself:

**Windows:** `$env:PATH += ";$env:ProgramFiles\nodejs;$env:APPDATA\npm"; node "<msam_root>\.github\tools\render-metrics-report.js" --input="<project_path>\modernization-metrics.json" --output="<project_path>\MODERNIZATION_REPORT.md" --projectName="<project_name>"`
**Linux/macOS:** `node "<msam_root>/.github/tools/render-metrics-report.js" --input="<project_path>/modernization-metrics.json" --output="<project_path>/MODERNIZATION_REPORT.md" --projectName="<project_name>"`

Run via `run_in_terminal` (mode: sync, timeout: 30000).

`exitCode != 0` → return `status: failure` with the terminal error output as `error`. Stop.

On success, the tool prints one line to stdout: `RESULT: { "modernization_score": 0, "verdict": "...", "report_path": "..." }`. Parse `modernization_score`, `verdict`, and `report_path` directly from that line — do NOT `read_file` `MODERNIZATION_REPORT.md` or `modernization-metrics.json` to obtain them.

### Step 4 — Return result

Return the JSON described in **Return Format**, populated from the `RESULT` line parsed in Step 3.

