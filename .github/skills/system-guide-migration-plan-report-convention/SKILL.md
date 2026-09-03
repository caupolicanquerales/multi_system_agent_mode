---
name: system-guide-migration-plan-report-convention
description: "SystemGuider reference: which migration plan filename (MIGRATION_PLAN.md / JAVA21_REFACTORING_PLAN.md / SPRINGBOOT3_MIGRATION_PLAN.md) TechnicalReporter writes, based on active skills."
---

## Report Filename Convention

The filename depends on which migration skills were active during analysis:

| Active skill(s) | Output filename |
|---|---|
| Java 21 only | `JAVA21_REFACTORING_PLAN.md` |
| Spring Boot 3 only | `SPRINGBOOT3_MIGRATION_PLAN.md` |
| Both Java 21 + Spring Boot 3 | `MIGRATION_PLAN.md` |

The report is stored in the **project root** alongside the source code (same folder as `pom.xml` or `build.gradle`).
