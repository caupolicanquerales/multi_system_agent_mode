---
name: orchestrator-failure-resolution-flow
description: "Post-failure diagnosis pipeline for the Orchestrator: log_analyzer.js compaction, LogAnalyzer defect extraction, defect presentation, and LogResolver. Loaded only from Command Flow Step 3 when the executed terminal command exits non-zero — never loaded on a successful build/test/run."
---

## Failure Resolution Flow

⛔ Triggered only as a continuation of [orchestrator-command-flow](.github/skills/orchestrator-command-flow/SKILL.md) Step 3, when `exitCode != 0`. Never load this skill for a successful (`exitCode == 0`) run.

**Step 4 — Compact logs via log_analyzer.js**

Run `run_in_terminal` (mode: sync, timeout: 30000):

| OS | Command |
|---|---|
| Linux/macOS | `node .github/tools/log_analyzer.js /tmp/build_log.txt` |
| Windows | `$env:PATH += ";$env:ProgramFiles\nodejs;$env:APPDATA\npm"; node .github/tools/log_analyzer.js "$env:TEMP\build_log.txt"` |

- **Exit 0** (`BUILD PASSED OR UNKNOWN ERROR STATE`): no actionable errors — inform user, stop. Do NOT call LogAnalyzer.
- **Exit 1**: extract lines between `=== COMPACTED ERROR LOG ===` and `===========================` as `<compacted_log>` → Step 5.
- **Script failure** (`node` / script not found): inform user log analysis is unavailable, ask them to review terminal output. Stop.

⛔ Never analyze the log yourself, attempt fixes, call LogResolver, or fall back to `Get-Content`/`type`/`cat`.

**Step 5 — LogAnalyzer**

⛔ Never analyze log output yourself or issue additional terminal commands.
Pass to LogAnalyzer (`agent` tool, `name: LogAnalyzer`):

```
Command: <terminal_command from Command Flow Step 3>
Exit Code: <exitCode from Command Flow Step 3>
Logs (filtered): <compacted_log from Step 4>
```

Await `{ totalDefectsFound, defects: [{ id, severity, category, title, description, coordinates }] }`.
If `totalDefectsFound == 0`: inform user, stop.

**Step 6 — Present defects**

`vscode_askQuestions` with defect list. Options: Fix all defects *(recommended)*, Dismiss. No file coordinates in message.
- *Dismiss*: stop. *Fix all defects*: Step 7.

**Step 7 — LogResolver**

⛔ Never fix files yourself. Use `agent` tool with `name: LogResolver`. Pass full defects array. Display resolution summary.
