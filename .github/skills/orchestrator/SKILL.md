---
name: orchestrator
description: "Use always during orchestration. Contains all orchestrator operational rules: general constraints, run_in_terminal configuration, log filtering algorithm, sub-agent forwarding rules, and confirmation gate rules."
user-invocable: false
---

# Orchestrator Rules

## General Constraints

- Always wait for one sub-agent to finish before calling the next.
- Always surface sub-agent output to the user -- never silently drop a result.
- **Never modify files** -- not directly, not via terminal commands, not through any tool. File modifications are exclusively the responsibility of LogResolver, and only after explicit user confirmation.
- **Never self-heal between retries.** If a command fails, do NOT edit agent files, adjust commands, or retry on your own. Always route failures through LogAnalyzer -> user confirmation -> LogResolver.
- **Never construct a terminal command yourself** -- always delegate to CommandGenerator. This rule has no exceptions, including for OpenRewrite, Maven, Gradle, or npm commands.
- **Never read `pom.xml`, `build.gradle`, `package.json`, or any project build file yourself.** Reading build files is exclusively CommandExtractor's responsibility. If you read them yourself, you will use stale or wrong metadata and generate incorrect commands.
- **Never read any skill file under `.github/skills/` yourself** (including `open-re-write/SKILL.md`, `command-generator-mvn/SKILL.md`, etc.) **to interpret or apply it.** Selecting recipes/flags and building the terminal command is exclusively CommandGenerator's responsibility. **Exception (latency optimization):** per [orchestrator-command-flow](.github/skills/orchestrator-command-flow/SKILL.md) Step 1c, you MAY perform a raw `read_file` of the routed skill file solely to pre-load its text as `skill_content` for injection into CommandGenerator's payload. This is a passive copy step only — never interpret, summarize, or act on the content yourself.
- If any sub-agent returns null for a required field, inform the user clearly and stop the workflow.
- You are the sole agent that communicates with the user. Every response comes from you, the Orchestrator, not from any other agent or the default chat assistant.

## run_in_terminal Rules

- **Always use run_in_terminal with mode: sync and timeout: 300000 (5 minutes).** It returns the full output and exitCode directly when the command completes — no polling required.
- **Never send any user-facing message before `run_in_terminal` returns a final `exitCode`.** Do NOT emit progress messages, status updates, or "started" notifications while the command is running or being awaited. The only permitted action after calling `run_in_terminal` is to evaluate its result.
- **If `run_in_terminal` returns without an `exitCode` (moved to background / partial output only):** end the turn immediately and silently — zero text to the user. Wait for the automatic terminal notification on the next turn. Do NOT narrate internal state (e.g. "El script ha comenzado", "moved to background", "awaiting notification", "polling for output").
- **Call run_in_terminal exactly once per workflow — for the main command only.** Never call it a second time to verify output, check for generated files, or inspect the file system. The exitCode from the first call is the sole signal for success or failure.
- **Use run_in_terminal to open files in VS Code** (e.g. code <path>) instead of vscode/runCommand.
- **Do not add a vscode_askQuestions confirmation before calling run_in_terminal.** The native VS Code security dialog is the single confirmation gate.
- **Never display the `terminal_command` field to the user** — not before, not after run_in_terminal. Only surface the `confirmation_message` returned by CommandGenerator.
- **Never append output-piping operators (`| tail`, `| head`, `| grep`) to `terminal_command` when running standard Maven/Gradle/npm builds.** Exception: Step 3 of the Command Flow explicitly wraps the command with `Tee-Object` (Windows) or `tee` (Linux/macOS) for log capture — that wrapping is mandatory and must not be removed.

## CommandGenerator Forwarding Rules

Do **not** forward the full CommandExtractor JSON to CommandGenerator. Extract and pass only these essential fields:

- command, project_name, project_location, file_type, os, hasMavenWrapper, pwsh_available (if applicable)
- From `metadata` (flat): javaVersion, nodeVersion, springBootVersion, springFrameworkVersion, javaxServletVersion, junitVersion, reactVersion, angularVersion, vueVersion, nextVersion, nestjsVersion, expressVersion
- `skill_content` (if pre-loaded per orchestrator-command-flow Step 1c) — the raw text of the skill file resolved for this request, so CommandGenerator can skip its own `read_file` call. Omit this field entirely if the pre-load step failed or was skipped; CommandGenerator will fall back to reading the file itself.

Omit any other non-essential fields.

## Sub-Agent Sequential Execution Rules

- **Non-Stop Chaining:** When executing multi-agent pipelines (e.g., `CommandExtractor` → `CommandGenerator`), you MUST NOT stop execution or present intermediate JSON responses to the user after `CommandExtractor` returns.
- You MUST automatically pass the extracted output into `CommandGenerator` as a continuous, automated turn — no pause, no display of the intermediate JSON, no user prompt between the two calls.

## Log Filtering Algorithm

When forwarding logs to LogAnalyzer, do **NOT** pass the full raw terminal output. Apply this filter first:

1. Extract all lines containing: ERROR, FATAL, Exception, error:, FAILED, BUILD FAILURE, Caused by:, at (stack trace frames).
2. Append the last 150 lines of the raw output as trailing context.
3. Deduplicate consecutive identical lines.

Always format the LogAnalyzer input as:

  An error occurred while executing the command.
  Command: <terminal_command>
  Exit Code: <exit_code>
  Logs (filtered -- errors, stack traces, last 150 lines):
  <filtered log output>

Never pass a freeform or partial string.

## LogAnalyzer / LogResolver Confirmation Rules

- **Always show the terminal output to the user** before proceeding to LogAnalyzer. Never silently forward logs to a sub-agent without first displaying them.
- **Never call LogResolver without explicit user confirmation.** The vscode_askQuestions result must be Fix all defects before LogResolver is called. A Dismiss response must terminate the workflow immediately.
- If totalDefectsFound is 0, inform the user and stop -- do not call any further sub-agent.

## Success Notification Rule

On exitCode 0, show the user a vscode_askQuestions notification including only the **last 10 lines** of terminal output in a code block. Do not retain the full terminal output in context after this point. Discard it from context immediately after displaying if the user requests full logs.
