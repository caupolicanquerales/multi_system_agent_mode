---
name: system-guide-flow-report
description: "SystemGuider reference: Report Flow (migration analysis), Modernization Report Flow (post-migration scoring), and Main Class Generation Flow diagrams."
---

## Report Flow (migration analysis / inspect / scan / Java 21 / Spring Boot 3)

Triggered when the user asks for a migration report or inspection of a Java project — produces pre-migration findings.

```mermaid
sequenceDiagram
    actor U as User
    participant O as Orchestrator
    participant TR as TechReporter
    U->>O: "Generate migration report for X"
    O->>TR: project_name + path + skill files
    TR-->>O: {status, report_path, files_scanned, total_findings}
    alt success
        O-->>U: Apply Changes / Open Report / OK
    else failure
        O-->>U: Report Generation Failed
    end
```

`report_path` is `MIGRATION_PLAN.md` (both skills active), or the legacy per-skill filename (`JAVA21_REFACTORING_PLAN.md` / `SPRINGBOOT3_MIGRATION_PLAN.md`) when only one is active. *Apply Changes* jumps straight into the Refactoring Flow.

---

## Modernization Report Flow (post-migration score / metrics)

Triggered when the user asks to generate/score the modernization report — distinct from Report Flow: this computes a numeric score from already-generated `business-ast-report.json` + `dependency-tree.txt`, it does not scan source for findings.

```mermaid
sequenceDiagram
    actor U as User
    participant O as Orchestrator
    participant MA as MetricsAnalyzer
    U->>O: "Generate the modernization report for X"
    O->>O: resolve project via session cache (or CommandExtractor on cache miss)
    O->>MA: project_name + path + os
    MA-->>U: Run Modernization Metrics? (MA's own confirmation)
    MA-->>O: {status, report_path, modernization_score, verdict}
    O-->>U: score + verdict + report_path
    O->>O: read_file modernization-metrics.json (condition check only)
    alt hasSpringBootMainClass == false
        O->>O: Main Class Generation Flow
    end
```

`modernization_score` is 0–100; `verdict` is `LEGACY` (<40) / `IN_MODERNIZATION` (40–69) / `MODERN` (≥70). A missing Spring Boot entry point applies a flat 15-point penalty on top of the annotation-density/framework-version/legacy-debt components.

---

## Main Class Generation Flow (missing `@SpringBootApplication` entry point)

Triggered only from Modernization Report Flow, never directly by the user.

```mermaid
sequenceDiagram
    actor U as User
    participant O as Orchestrator
    U->>O: (auto-triggered, hasSpringBootMainClass == false)
    O-->>U: Generate Spring Boot Main Class? / Skip
    U->>O: Generate Main Class
    O->>O: run main-class-generator.js --projectPath=X
    O-->>U: RESULT: {status, class_name, target_path, package, packaging}
    alt status == success
        O-->>U: Recalculate Modernization Report? / OK
        alt Recalculate
            O->>O: JavaParser Flow (refresh business-ast-report.json)
            O->>O: back to Modernization Report Flow Step 2
        end
    else status == skipped
        O-->>U: reason (e.g. entry-point candidate already exists)
    end
```

The tool resolves the root package (shortest common package prefix across all classes), the class name (`PascalCase(artifactId) + "Application"`), and the `jar`/`war` template from `pom.xml`/`build.gradle` — per the `spring-boot-main-class` skill rules.
