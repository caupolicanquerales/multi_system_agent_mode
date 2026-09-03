---
name: system-guide-migration-plan-technical-reporter
description: "SystemGuider reference: how TechnicalReporter generates the migration plan (index-project.js → build-report.js) — read-only, never applies changes."
---

## How the Plan Is Generated — TechnicalReporter

**TechnicalReporter** indexes the project off-thread, inspects only the hits that need full-file context, and renders the report — all read-only, no source patching. Invoked by the Orchestrator during the **Report Flow**.

### Generation Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant O as Orchestrator
    participant TR as TechReporter
    participant S as Scripts
    U->>O: "Generate migration report for X"
    O->>TR: project_name + path + skill files
    TR->>S: index-project.js
    S-->>TR: .migration-index.json (per-hit context/hint, complex flag)
    TR->>S: build-report.js (.migration-findings.json → report)
    S-->>TR: report_path
    TR-->>O: {status, report_path, files_scanned, total_findings, error}
    O-->>U: Apply Changes / Open Report / OK
```

`Apply Changes` does not re-run any TechnicalReporter logic — it jumps straight into the Refactoring Flow, passing `project_name` + `report_path`. For how that application step works, load [system-guide-migration-plan-technical-executer](.github/skills/system-guide-migration-plan-technical-executer/SKILL.md) on its own turn.
