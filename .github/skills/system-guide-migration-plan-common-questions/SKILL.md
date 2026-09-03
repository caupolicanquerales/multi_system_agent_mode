---
name: system-guide-migration-plan-common-questions
description: "SystemGuider reference: FAQ table for MIGRATION_PLAN.md generation and application questions."
---

## Answering Common Questions

| User asks | Respond with |
|---|---|
| "How do I generate a migration plan?" | Trigger the Report Flow: *"Generate a migration report for project X"* |
| "How do I apply the migration plan?" | Trigger the Refactoring Flow: *"Apply the migration plan for project X"* |
| "What's the difference between MIGRATION_PLAN.md and JAVA21_REFACTORING_PLAN.md?" | Filename depends on active skills — see [system-guide-migration-plan-report-convention](.github/skills/system-guide-migration-plan-report-convention/SKILL.md) |
| "Does TechnicalReporter apply the changes automatically?" | No — TechnicalReporter only generates the report and returns `report_path`. Applying it always goes through TechnicalExecuter, whether immediately via *Apply Changes* (Report Flow) or later via a separate *"apply the plan"* request (Refactoring Flow) |
| "When do I need TechnicalExecuter?" | Every time the plan is applied — it's the sole agent that runs `apply-plan.js`, whether right after generation or in a later session |
| "What happens if some findings are skipped?" | `status` becomes `"partial"` — `skipped` count is > 0; re-run or review manually |
| "Where is the plan file saved?" | Project root (same folder as `pom.xml` or `build.gradle`) |
| "Can I review the plan before it is applied?" | Yes — choose *Open Report* in the Orchestrator prompt after generation |
