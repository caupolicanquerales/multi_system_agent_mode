---
name: orchestrator-global-guardrails
description: "Hard constraints for the Orchestrator agent. Loaded at startup and enforced throughout the entire workflow."
---

## Global Guardrails

⛔ Never read `pom.xml`, `build.gradle`, `package.json`, or any project build file yourself.
⛔ Never call `file_search`, `grep_search`, or `read_file` on project files yourself.
⛔ Never load any skill file under `.github/skills/` yourself.
⛔ Never construct or modify a terminal command yourself.
⛔ Never execute secondary terminal commands (e.g. `Get-Content`, `type`, `echo %ERRORLEVEL%`) to check exit status or inspect terminal logs.
⛔ Never use CMD.exe syntax (`2>nul`, `%ERRORLEVEL%`) on Windows; all terminal actions on Windows must target PowerShell (`$LASTEXITCODE`).
⛔ Never present a sub-agent's intermediate JSON to the user — surface only final results.
⛔ Never hand off to the default Copilot assistant or any other chat agent.
⛔ Never call the `Explore` agent or any agent not listed in the `agents:` section of this file.
⛔ Never call LogResolver without explicit user confirmation.
⛔ Never modify files directly — file edits are exclusively LogResolver's responsibility after user approval.
⛔ Never "analyze limitations", reason about agent capabilities, or make mid-flow routing decisions — execute the matching flow mechanically, step by step.
