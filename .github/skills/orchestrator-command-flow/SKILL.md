---
name: orchestrator-command-flow
description: "Command Flow execution spec for the Orchestrator: CommandExtractor → CommandGenerator → run_in_terminal, with the JavaParser short-circuit and post-failure log analysis pipeline loaded on demand from their own skills."
---

## Command Flow

⛔ **No shortcuts. No exceptions. Follow steps 1 → 1b → 1c → 2 → 3 in strict order every time — unless the cache bypass condition below applies.**

---

### Session Context Cache

⛔ Load [orchestrator-cache-spec](.github/skills/orchestrator-cache-spec/SKILL.md) now for the full `project_context` cache structure, validity rules, and bypass condition. Summary: the Orchestrator caches each project's CommandExtractor payload in `project_context[<project_name>]`; when a valid cached entry exists for the same project and only the `command` field changes, skip Step 1 and Step 1b and jump directly to **Step 1c** (skill routing depends on the updated `command`, so it must still run) then **Step 2** with the updated entry as the payload.

⛔ **Cache bypass vs. command override:** Before building the Step 2 payload, write the new requested `command` into `project_context[<project_name>].command` first, THEN assemble the CommandGenerator payload from that entry. If `command` is not updated in memory before the payload is sent, `CommandGenerator` receives the stale value and re-runs the previous action instead of the newly requested one.

---

**Step 1 — Call CommandExtractor**

Use the `agent` tool with `name: CommandExtractor`. Pass the raw user prompt as-is.
⛔ Never extract metadata, re-route, call other tools/agents, or present JSON to the user while waiting.
Receive: `{ command, project_name, project_location, file_type, os, hasMavenWrapper, metadata }` → proceed to Step 1b immediately.

**Step 1b — Check PowerShell Core Availability (Windows only)**

If `os == "windows"`: run `where.exe pwsh` (mode: sync, timeout: 5000). `exitCode == 0` → `pwsh_available: true`; else `false`. Omit for non-Windows.

Store the complete payload in `project_context[<project_name>]`. Proceed to Step 1c immediately — no output to user.

**Step 1c — Pre-load skill content (latency optimization)**

Resolve the skill path CommandGenerator would select, using the identical routing logic it applies internally (kept in sync with `command_generator.agent.md` Step 1a/1b):

1. Normalise `os` (`windows` / `linux` / `mac`) the same way CommandGenerator does.
2. Match the first applicable row:

```
apply openReWrite + maven  + windows      → .github/skills/open-re-write-mvn-win/SKILL.md
apply openReWrite + maven  + linux|mac    → .github/skills/open-re-write-mvn-nix/SKILL.md
apply openReWrite + gradle + any          → .github/skills/open-re-write-gradle/SKILL.md
apply openReWrite + other/null + any      → no path to resolve — skip this step, omit skill_content
any command + maven   + any               → .github/skills/command-generator-mvn/SKILL.md
any command + gradle  + any               → .github/skills/command-generator-gradle/SKILL.md
any command + npm     + any               → .github/skills/command-generator-npm/SKILL.md
any command + unknown/null + any          → no path to resolve — skip this step, omit skill_content
```

3. `read_file` the resolved path (`startLine: 1, endLine: 350`) and store its raw text as `skill_content`.

⛔ This is a passive raw read only — do NOT interpret the content, select recipes/flags, or build any part of the terminal command yourself. That remains CommandGenerator's exclusive responsibility.

If the path cannot be resolved or `read_file` fails, omit `skill_content` entirely — CommandGenerator will fall back to reading the file itself. Proceed to Step 2 immediately — no output to user.

**Step 2 — Call CommandGenerator** *(non-stop chain from Step 1c)*

**JavaParser short-circuit** — if `command` is `"javaparser"` or `"generate_javaparser_report"`, skip CommandGenerator entirely: load [orchestrator-javaparser-flow](.github/skills/orchestrator-javaparser-flow/SKILL.md) now and follow it exactly, then proceed to **Step 3** with the synthetic payload it returns.

For all other `command` values: forward essential fields (incl. `pwsh_available` and `skill_content` if applicable) per orchestrator-rules forwarding rules. Await:
`{ project_name, project_location, terminal_command, display_label, confirmation_message }`.
⛔ Never evaluate recipes, select flags, or build the command yourself — pre-loading `skill_content` is a raw copy step only.

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
