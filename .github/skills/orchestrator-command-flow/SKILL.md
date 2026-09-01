---
name: orchestrator-command-flow
description: "Full Command Flow execution spec for the Orchestrator: CommandExtractor → CommandGenerator → run_in_terminal → log_analyzer.js → LogAnalyzer → LogResolver pipeline with all step-level guardrails."
---

## Command Flow

⛔ **No shortcuts. No exceptions. Follow steps 1 → 2 → 3 in strict order every time — unless the cache bypass condition below applies.**

---

### Session Context Cache

The Orchestrator maintains an in-turn variable `project_context` (a map keyed by `project_name`). Each entry stores the full CommandExtractor JSON for that project so that sequential commands on the same project skip re-extraction.

**Cache structure (per entry):**
```
project_context[<project_name>] = {
  command,            ← overwritten per request; all other fields are cached
  project_name,
  project_location,
  file_type,
  os,
  hasMavenWrapper,
  pwsh_available,     ← Windows only; cached from Step 1b
  metadata            ← flat object of all version fields
}
```

**Cache validity rules:**
- An entry is valid for the duration of the current conversation turn sequence.
- Invalidate (delete) the entry for `<project_name>` if: the user mentions a dependency change, a `pom.xml`/`build.gradle`/`package.json` edit, or explicitly asks to re-scan the project.
- Never share cache entries across different `project_name` values.
- **Location disambiguation:** `project_name` is the primary lookup key. `project_location` is stored inside each entry and used only when two entries would share the same `project_name` (ambiguous workspace). In that case, append `"|" + project_location` to form a unique key for the colliding entries — but only after the collision is detected, not preemptively. If `project_name` is missing or blank in CommandExtractor's response, fall back to keying by `project_location` alone.

**Implicit project inference (no project name in follow-up):**
- Maintain a `last_active_project` variable (the `project_name` most recently passed through Step 1 or the cache bypass).
- When the user's message contains a command intent but no identifiable `project_name` (e.g. *"now compile it"*, *"run tests"*, *"clean"*), substitute `last_active_project` as the target before evaluating the bypass condition.
- If `last_active_project` is unset (first command in the session), proceed with Step 1 as normal — CommandExtractor will extract the project name from the workspace context.

**Cache bypass condition — skip Step 1 and Step 1b when ALL of the following are true:**
1. An entry keyed by `project_name` (or `project_location` if `project_name` was blank) exists in `project_context` and is valid.
2. The user's new request targets the same project (resolved via explicit name, `last_active_project`, or unique location match).
3. Only the `command` field changes (e.g. `"test"` → `"compile"`); no metadata fields are expected to differ.

When the bypass fires: update the cached entry's `command` to the new value and jump directly to **Step 2**, passing the updated cache entry as the payload.

---

**Step 1 — Call CommandExtractor**

Use the `agent` tool with `name: CommandExtractor`. Pass the raw user prompt as-is.
⛔ Never extract metadata, re-route, call other tools/agents, or present JSON to the user while waiting.
Receive: `{ command, project_name, project_location, file_type, os, hasMavenWrapper, metadata }` → proceed to Step 1b immediately.

**Step 1b — Check PowerShell Core Availability (Windows only)**

If `os == "windows"`: run `where.exe pwsh` (mode: sync, timeout: 5000). `exitCode == 0` → `pwsh_available: true`; else `false`. Omit for non-Windows.

Store the complete payload in `project_context[<project_name>]`. Proceed to Step 2 immediately — no output to user.

**Step 2 — Call CommandGenerator** *(non-stop chain from Step 1b)*

**JavaParser short-circuit — skip CommandGenerator when `command` is `"javaparser"` or `"generate_javaparser_report"`:**

⛔ Do NOT call `manage_todo_list` for this path — it is a single-step direct execution, not a multi-step workflow.

1. Read `project_location` and `os` from the cache entry resolved in Step 1 / Step 1b (same key rules as the Session Context Cache section).
2. Derive `<msam_root>` from the workspace folder list — do NOT hardcode usernames. The JAR lives at `<msam_root>\.github\tools\javapaser-0.0.1-SNAPSHOT.jar`; pass the containing directory as the second bat argument.
3. ⛔ If `os != "windows"`, inform the user that JavaParser report generation requires Windows and stop.
4. Set the following synthetic payload (no CommandGenerator call):
   ```
   terminal_command  = & "<msam_root>\.github\tools\generate-javaparser-report.bat" "<project_location>" "<msam_root>\.github\tools"
   display_label     = Generate JavaParser Report
   confirmation_message = Running JavaParser AST report for <project_name>
   ```
5. Jump directly to **Step 3** with the synthetic payload.

For all other `command` values: forward essential fields (incl. `pwsh_available` if applicable) per orchestrator-rules forwarding rules. Await:
`{ project_name, project_location, terminal_command, display_label, confirmation_message }`.
⛔ Never evaluate recipes or load skill files yourself.

**Step 3 — Display and run**

Display `terminal_command` in a code block. Wrap it in the OS-appropriate redirect before calling `run_in_terminal` (mode: sync, timeout: 600000):

| OS | Wrapper |
|---|---|
| Linux/macOS | `<terminal_command> 2>&1 \| tee /tmp/build_log.txt ; exit ${PIPESTATUS[0]}` |
| Windows — OpenRewrite (`.ps1`) | `& <terminal_command> ; exit $LASTEXITCODE` |
| Windows — standard | `& { <terminal_command> } 2>&1 \| Tee-Object -FilePath "$env:TEMP\build_log.txt" ; exit $LASTEXITCODE` |

Use `confirmation_message` as explanation, `display_label` as goal.

**Execution contract:**
- Block until `exitCode` is present in the return object — emit zero output while running.
- No `exitCode` → end turn silently; wait for terminal notification.
- `exitCode == 0` → notify success (per orchestrator-rules). Stop.
- `exitCode != 0` → proceed to Step 4.

⛔ Never message the user before/during execution. Never run secondary terminal commands to verify success.

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
Command: <terminal_command from Step 3>
Exit Code: <exitCode from Step 3>
Logs (filtered): <compacted_log from Step 4>
```

Await `{ totalDefectsFound, defects: [{ id, severity, category, title, description, coordinates }] }`.
If `totalDefectsFound == 0`: inform user, stop.

**Step 6 — Present defects**

`vscode_askQuestions` with defect list. Options: Fix all defects *(recommended)*, Dismiss. No file coordinates in message.
- *Dismiss*: stop. *Fix all defects*: Step 7.

**Step 7 — LogResolver**

⛔ Never fix files yourself. Use `agent` tool with `name: LogResolver`. Pass full defects array. Display resolution summary.
