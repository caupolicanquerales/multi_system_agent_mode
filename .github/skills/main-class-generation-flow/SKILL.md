---
name: main-class-generation-flow
description: "Executes the main-class-generator.js tool to scaffold a missing @SpringBootApplication entry point after AST generation"
---

## Main Class Generation Flow

⛔ Triggered only from [orchestrator-modernization-flow](.github/skills/orchestrator-modernization-flow/SKILL.md) Step 4, when `crossCorrelation.hasSpringBootMainClass == false`. Receives `project_name`, `project_location`, `os` from that step — do not re-resolve them.

The tool encodes the rules from [spring-boot-main-class](.github/skills/spring-boot-main-class/SKILL.md) (detection guard, package/class-name resolution, packaging-aware template) deterministically off-thread — never read that skill file or `business-ast-report.json`/`modernization-metrics.json` yourself; the tool reads both directly from `<project_location>`.

1. **Confirm with the user** — `vscode_askQuestions` (header: Generate Spring Boot Main Class, message noting the Modernization Report flagged a missing `@SpringBootApplication` entry point for `<project_name>`, options: **Generate Main Class** *(recommended)*, Skip).
   - *Skip* → stop.

2. **Resolve `<msam_root>`** from the workspace folder list — never hardcode usernames. The tool lives at `<msam_root>/.github/tools/main-class-generator.js`.

3. **Run the tool** via `run_in_terminal` (mode: sync, timeout: 30000):
   - **Windows:** `$env:PATH += ";$env:ProgramFiles\nodejs;$env:APPDATA\npm"; node "<msam_root>\.github\tools\main-class-generator.js" --projectPath="<project_location>"`
   - **Linux/macOS:** `node "<msam_root>/.github/tools/main-class-generator.js" --projectPath="<project_location>"`

   `exitCode != 0` → surface the terminal error output, ask the user to review. Stop.

4. **Parse the `RESULT: {...}` line** from stdout — `{ status, reason, target_path, class_name, package, packaging }`. Do NOT `read_file` the generated `.java` file to confirm it — the `RESULT` line is the source of truth.
   - `status == "success"` → inform the user `<class_name>` was created at `<target_path>` (package `<package>`, `<packaging>` template). Ask (`vscode_askQuestions`, header: Recalculate Modernization Report, options: **Recalculate** *(recommended)*, OK) whether to refresh the score.
     - *Recalculate*:
       1. `business-ast-report.json` is now stale — it predates `<class_name>`. Load [orchestrator-javaparser-flow](.github/skills/orchestrator-javaparser-flow/SKILL.md) now and follow it exactly to regenerate `business-ast-report.json`/`dependency-tree.txt` for `<project_location>` (Windows-only — if `os != "windows"`, inform the user AST refresh requires Windows and stop instead of recalculating against the stale report).
       2. `exitCode == 0` → jump to [orchestrator-modernization-flow](.github/skills/orchestrator-modernization-flow/SKILL.md) **Step 2**, reusing the same cache entry. This re-enters that flow's Step 4, which now reads `hasSpringBootMainClass == true` (AST refreshed in step 1 above) and stops there — the loop is self-terminating, never re-invoke this flow from that Step 4.
     - *OK*: stop.
   - `status == "skipped"` → inform the user of `reason` (e.g. an entry-point candidate already exists at `target_path`). Stop.
