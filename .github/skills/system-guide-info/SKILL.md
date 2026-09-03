---
name: system-guide-info
description: "SystemGuider reference: common-question answer index — points to the dedicated system-guide-* files that hold the actual agent catalog, flow diagrams, and examples."
---

## Answering Common Questions

| User asks | Load instead |
|---|---|
| "What agents exist?" | [system-guide-agent-catalog](.github/skills/system-guide-agent-catalog/SKILL.md) |
| "How does the build/test/run flow work?" | [system-guide-flow-command](.github/skills/system-guide-flow-command/SKILL.md) |
| "What happens when a build fails?" | [system-guide-flow-command](.github/skills/system-guide-flow-command/SKILL.md) — failure pipeline section |
| "How do I migrate to Java 21 / Spring Boot 3?" | [system-guide-flow-report](.github/skills/system-guide-flow-report/SKILL.md) — covers analysis; if the user then asks how to apply it, that follow-up question loads [system-guide-flow-refactoring](.github/skills/system-guide-flow-refactoring/SKILL.md) on its own turn (never both in the same turn) |
| "What's the modernization score / how is it calculated?" | [system-guide-flow-report](.github/skills/system-guide-flow-report/SKILL.md) — Modernization Report Flow section |
| "How does the system decide which flow to use?" | [system-guide-flow-routing](.github/skills/system-guide-flow-routing/SKILL.md) |
| "Can I invoke an agent directly?" | Only the Orchestrator is user-invocable; all others are internal — see [system-guide-agent-catalog](.github/skills/system-guide-agent-catalog/SKILL.md) |
| "What triggers SystemGuider?" | Guide Flow routing row — see [system-guide-flow-routing](.github/skills/system-guide-flow-routing/SKILL.md) |
| "Give me example prompts" | [system-guide-examples](.github/skills/system-guide-examples/SKILL.md) |
| "How does MIGRATION_PLAN.md get generated/applied?" | [system-guide-migration-plan-info](.github/skills/system-guide-migration-plan-info/SKILL.md) |
