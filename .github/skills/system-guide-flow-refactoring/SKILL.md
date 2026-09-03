---
name: system-guide-flow-refactoring
description: "SystemGuider reference: Refactoring Flow (apply migration plan) diagram, including the optional post-apply JavaParser AST report and Modernization Report follow-ons."
---

## Refactoring Flow (apply the plan / implement changes)

Triggered when the user asks to apply a previously generated migration plan. ⛔ Any phrasing mentioning "plan" (in any language) routes here — highest routing priority.

```mermaid
sequenceDiagram
    actor U as User
    participant O as Orchestrator
    participant TE as TechExecuter
    U->>O: "Apply migration plan for X"
    O->>O: locate MIGRATION_PLAN.md (project_name given, or file_search if absent)
    O-->>U: Apply Changes / Cancel
    U->>O: Apply Changes
    O->>TE: project_name + path + report_file
    TE-->>O: {status, applied, skipped, failed, changed_files, cascade_warnings}
    alt success
        O-->>U: applied/skipped/failed counts + changed files
        O-->>U: Generate JavaParser Report? / OK
        alt Generate JavaParser Report
            O->>O: JavaParser Flow (business-ast-report.json + dependency-tree.txt)
            O-->>U: Generate Modernization Report? / OK
            alt Generate Modernization Report
                O->>O: Modernization Report Flow
            end
        end
    else failure
        O-->>U: Refactoring Failed
    end
```

The post-apply JavaParser + Modernization Report steps are optional, user-confirmed follow-ons — they never run automatically after a successful apply.
