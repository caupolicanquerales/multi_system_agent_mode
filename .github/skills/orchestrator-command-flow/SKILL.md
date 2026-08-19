---
name: orchestrator-command-flow
description: "Full Command Flow execution spec for the Orchestrator: CommandExtractor → CommandGenerator → run_in_terminal → log_analyzer.js → LogAnalyzer → LogResolver pipeline with all step-level guardrails."
---

## Command Flow

⛔ **No shortcuts. No exceptions. Follow steps 1 → 2 → 3 in strict order every time.**

**Step 1 — Call CommandExtractor**

Use the `agent` tool with `name: CommandExtractor`. Pass the raw user prompt as-is — no extra context.
⛔ Do NOT extract the command, project name, file type, or any metadata yourself.
⛔ Do NOT re-route this task back to Orchestrator or any other agent.
⛔ Do NOT call `Explore`, `file_search`, `grep_search`, `read_file`, or any other tool or agent while waiting for CommandExtractor.
⛔ Do NOT analyze whether CommandExtractor can handle the request — always call it unconditionally.
⛔ Wait passively. Your only permitted action is to receive CommandExtractor's response:
`{ command, project_name, project_location, file_type, os, hasMavenWrapper, metadata }`

⛔ Do NOT present this JSON to the user. Proceed immediately and automatically to Step 1b — no pause, no intermediate output.

**Step 1b — Check PowerShell Core Availability (Windows only)**

If `os == "windows"` in the response from CommandExtractor:
1. Run a lightweight check via `run_in_terminal` (mode: sync, timeout: 5000):
   ```powershell
   where.exe pwsh
   ```
2. If `exitCode == 0`, add `"pwsh_available": true` to the payload forwarded to CommandGenerator.
3. If `exitCode != 0` or fails, add `"pwsh_available": false` to the payload forwarded to CommandGenerator.

If `os != "windows"`, omit `pwsh_available` entirely.

⛔ Do NOT present this JSON to the user. Proceed immediately and automatically to Step 2 — no pause, no intermediate output.

**Step 2 — Call CommandGenerator** *(non-stop chain from Step 1b)*

Forward the essential fields per the forwarding rules in the orchestrator-rules skill, including `pwsh_available` (if applicable). Await:
`{ project_name, project_location, terminal_command, display_label, confirmation_message }`.

⛔ Do NOT evaluate recipes, goals, tasks, or scripts yourself. Do NOT load any skill file yourself.

**Step 3 — Display and run**

Display `terminal_command` in a code block. Execute it with output redirected to a temp file so Step 4 can pass the file path directly to `log_analyzer.js` — avoiding all inline string escaping and shell length limits.

Wrap `terminal_command` in the OS-appropriate redirect before calling `run_in_terminal` (mode: sync, timeout: 300000):

**Linux / macOS:**
```bash
<terminal_command> 2>&1 | tee /tmp/build_log.txt ; exit ${PIPESTATUS[0]}
```
**Windows (PowerShell)** — choose the wrapper based on whether `terminal_command` starts with `powershell`:

- **OpenRewrite** (`terminal_command` starts with `pwsh` or `powershell`):
```powershell
<terminal_command> 2>&1 | Tee-Object -FilePath "$env:TEMP\build_log.txt" ; exit $LASTEXITCODE
```
- **Standard commands** (`clean install`, `test`, `build`, etc.):
```powershell
& { <terminal_command> } 2>&1 | Tee-Object -FilePath "$env:TEMP\build_log.txt" ; exit $LASTEXITCODE
```

Use `confirmation_message` as explanation and `display_label` as goal.

Evaluate the execution result strictly from the `run_in_terminal` return object:
- If `exitCode == 0` → follow the success notification rule in the orchestrator-rules skill. Stop.
- If `exitCode != 0` (or if execution failed) → proceed immediately to **Step 4**.

⛔ Do NOT execute any terminal commands (`type`, `cat`, `Get-Content`) or ask for extra terminal permissions to check if the command succeeded.

**Step 4 — Compact logs via log_analyzer.js**

Pass the temp file written in Step 3 directly as a file argument to `log_analyzer.js`. No string embedding, no escaping, no size limit risk.

**Linux / macOS** — call `run_in_terminal` (mode: sync, timeout: 30000) with:
```bash
node .github/tools/log_analyzer.js /tmp/build_log.txt
```

**Windows (PowerShell)** — call `run_in_terminal` (mode: sync, timeout: 30000) with:
```powershell
$env:PATH += ";$env:ProgramFiles\nodejs;$env:APPDATA\npm"; node .github/tools/log_analyzer.js "$env:TEMP\build_log.txt"
```

Evaluate the result:

- **Exit code 0** (`BUILD PASSED OR UNKNOWN ERROR STATE` in stdout): no actionable errors found. Inform the user the build output contained no recognisable error patterns and stop. Do NOT call LogAnalyzer.
- **Exit code 1**: stdout contains the `=== COMPACTED ERROR LOG ===` block. Extract the lines between `=== COMPACTED ERROR LOG ===` and `===========================` as `<compacted_log>`. Proceed immediately to **Step 5**.
- **Script execution failure** (`node` not found, script not found, or any `CommandNotFoundException`): inform the user that log analysis is unavailable due to a missing Node.js binary and ask them to review the terminal output directly. Stop.

⛔ Do NOT analyze the compacted log yourself. Do NOT attempt fixes. Do NOT call LogResolver at this point.
⛔ Do NOT fall back to `Get-Content`, `type`, `cat`, or any other terminal command to read the log file when `log_analyzer.js` fails.

**Step 5 — LogAnalyzer**

⛔ Do NOT analyze log output yourself or issue additional terminal commands.
Pass the following formatted string to LogAnalyzer using the `agent` tool with `name: LogAnalyzer`:

```
Command: <terminal_command from Step 3>
Exit Code: <exitCode from Step 3>
Logs (filtered): <compacted_log from Step 4>
```

Await `{ totalDefectsFound, defects: [{ id, severity, category, title, description, coordinates }] }`.

If `totalDefectsFound == 0`: inform user no defects were identified, stop.

**Step 6 — Present defects**

`vscode_askQuestions` with defect list (options: Fix all defects *(recommended)*, Dismiss). No file coordinates in message.

- *Dismiss*: stop.
- *Fix all defects*: **Step 7**.

**Step 7 — LogResolver**

⛔ Do NOT attempt to fix any file yourself. Use the `agent` tool with `name: LogResolver`.
Pass the complete LogAnalyzer JSON (full defects array) to LogResolver. Display resolution summary.
