---
name: system-guide-flow-command
description: "SystemGuider reference: Command Flow (build/test/run/deploy/package/javaparser) — cache bypass, skill_content pre-load, execution, and failure pipeline."
---

## Command Flow (build / test / run / package / compile / deploy / javaparser)

Triggered when the user asks to build, test, run, package, or generate a JavaParser AST report for a named project.

```mermaid
sequenceDiagram
    actor U as User
    participant O as Orchestrator
    participant CE as CmdExtractor
    participant CG as CmdGenerator
    participant T as Terminal
    participant LC as LogCompactor
    participant LA as LogAnalyzer
    participant LR as LogResolver
    U->>O: "Build project X"
    alt cached project (only command changed)
        O->>O: reuse project_context[X], skip CE
    else no valid cache
        O->>CE: user prompt
        CE-->>O: {command, file_type, os, hasMavenWrapper, metadata}
    end
    O->>O: Step 1c — resolve & read_file the matching skill (skill_content)
    alt command == javaparser
        O->>T: run generate-javaparser-report.bat (no CmdGenerator)
    else
        O->>CG: essential fields + skill_content
        CG-->>O: {terminal_command, display_label, confirmation_message}
        O->>T: run_in_terminal (sync, 10min, OS-wrapped + tee)
    end
    alt exitCode 0
        T-->>U: success (confirmation_message)
    else exitCode != 0
        T-->>O: error output
        O->>LC: log_analyzer.js
        LC-->>O: compacted log
        O->>LA: command + exitCode + log
        LA-->>O: {defects[]}
        O-->>U: Fix defects / Dismiss
        U->>O: Fix all defects
        O->>LR: defects JSON
        LR-->>U: Keep/Undo review
    end
```

**Key mechanics:**
- **Session cache** (`project_context`): repeat commands on the same project skip re-extraction — only `command` is overwritten.
- **Step 1c (latency optimization):** the Orchestrator itself resolves and reads the skill file CommandGenerator would need, using the same routing table, and passes the raw text as `skill_content` — CommandGenerator then skips its own `read_file` call entirely.
- **JavaParser short-circuit:** `command == "javaparser"`/`"generate_javaparser_report"` skips CommandGenerator and runs `generate-javaparser-report.bat` directly (Windows-only). Produces `business-ast-report.json` + `dependency-tree.txt`.
- **On failure:** filtered logs (errors/stack traces/last 150 lines) go to LogAnalyzer → defect list → user confirmation gate → LogResolver batch-fixes.
