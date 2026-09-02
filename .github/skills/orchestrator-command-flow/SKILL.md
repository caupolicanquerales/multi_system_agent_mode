---
name: orchestrator-command-flow
description: "Command Flow execution spec for the Orchestrator: CommandExtractor → CommandGenerator → run_in_terminal, with the JavaParser short-circuit and post-failure log analysis pipeline loaded on demand from their own skills."
---

## Command Flow

⛔ **No shortcuts. No exceptions. Follow steps 1 → 2 → 3 in strict order every time — unless the cache bypass condition below applies.**

---

### Session Context Cache

⛔ Load [orchestrator-cache-spec](.github/skills/orchestrator-cache-spec/SKILL.md) now for the full `project_context` cache structure, validity rules, and bypass condition. Summary: the Orchestrator caches each project's CommandExtractor payload in `project_context[<project_name>]`; when a valid cached entry exists for the same project and only the `command` field changes, skip Step 1 and Step 1b and jump directly to **Step 2** with the updated entry as the payload.

---

**Step 1 — Call CommandExtractor**

Use the `agent` tool with `name: CommandExtractor`. Pass the raw user prompt as-is.
⛔ Never extract metadata, re-route, call other tools/agents, or present JSON to the user while waiting.
Receive: `{ command, project_name, project_location, file_type, os, hasMavenWrapper, metadata }` → proceed to Step 1b immediately.

**Step 1b — Check PowerShell Core Availability (Windows only)**

If `os == "windows"`: run `where.exe pwsh` (mode: sync, timeout: 5000). `exitCode == 0` → `pwsh_available: true`; else `false`. Omit for non-Windows.

Store the complete payload in `project_context[<project_name>]`. Proceed to Step 2 immediately — no output to user.

**Step 2 — Call CommandGenerator** *(non-stop chain from Step 1b)*

**JavaParser short-circuit** — if `command` is `"javaparser"` or `"generate_javaparser_report"`, skip CommandGenerator entirely: load [orchestrator-javaparser-flow](.github/skills/orchestrator-javaparser-flow/SKILL.md) now and follow it exactly, then proceed to **Step 3** with the synthetic payload it returns.

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
- `exitCode != 0` → load [orchestrator-failure-resolution-flow](.github/skills/orchestrator-failure-resolution-flow/SKILL.md) now and follow it exactly, starting at its Step 4.

⛔ Never message the user before/during execution. Never run secondary terminal commands to verify success.
